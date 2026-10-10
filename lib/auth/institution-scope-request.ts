/**
 * Request-level half of institution isolation. The rules themselves live in
 * lib/auth/institution-scope.ts.
 *
 *   checkInstitutionScope()  — proxy.ts: is every institution this request
 *                              names, and every record it refers to by id,
 *                              one the caller may work on?
 *   institutionParam()       — route handlers: the institution to filter by,
 *                              defaulting to the caller's own.
 */

import type { NextRequest } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { type VerifiedSession, getRequestUser } from '@/lib/auth/server-session'
import {
	type InstitutionParamName,
	type InstitutionRecord,
	type InstitutionScope,
	type NamedInstitution,
	findOutOfScope,
	institutionParamValue,
	institutionScopeMode,
	institutionsInBody,
	institutionsInQuery,
	isUnsetInstitution,
	resolveInstitutionScope,
} from '@/lib/auth/institution-scope'
import { type RecordRef, recordsNamedInRequest } from '@/lib/auth/resource-ownership'
import { OWNED_TABLES, REFERENCE_FIELDS, ROUTE_RECORDS } from '@/lib/auth/resource-ownership.generated'

// The institutions table is a handful of rows that change a few times a year.
const INSTITUTIONS_TTL_MS = 5 * 60 * 1000
let institutionsCache: { rows: InstitutionRecord[]; loadedAt: number } | null = null

async function loadInstitutions(): Promise<InstitutionRecord[]> {
	if (institutionsCache && Date.now() - institutionsCache.loadedAt <= INSTITUTIONS_TTL_MS) {
		return institutionsCache.rows
	}
	const { data, error } = await getSupabaseServer()
		.from('institutions')
		.select('id, institution_code, counselling_code, myjkkn_institution_ids')
	if (error) throw new Error(`institutions lookup failed: ${error.message}`)
	institutionsCache = { rows: (data ?? []) as InstitutionRecord[], loadedAt: Date.now() }
	return institutionsCache.rows
}

const isUnrestricted = (session: VerifiedSession) =>
	session.isSuperAdmin || session.roles.includes('super_admin') || session.parentProfile?.isSuperAdmin === true

interface RequestPayload {
	/** Parsed JSON body, when there is one. */
	json?: unknown
	/** Text fields of a form body, when there is one. */
	form?: URLSearchParams
}

/** The request body, whatever its encoding. Never throws. */
async function readPayload(request: NextRequest): Promise<RequestPayload> {
	if (request.method === 'GET' || request.method === 'HEAD') return {}
	try {
		const contentType = request.headers.get('content-type') || ''
		if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
			const form = await request.clone().formData()
			const fields = new URLSearchParams()
			for (const [key, value] of form) if (typeof value === 'string') fields.append(key, value)
			return { form: fields }
		}
		// JSON is parsed whatever the declared content type — handlers call
		// request.json() regardless, so a mislabelled body must not slip past.
		const text = (await request.clone().text()).trimStart()
		if (text.startsWith('{') || text.startsWith('[')) return { json: JSON.parse(text) }
	} catch {
		// Unreadable or not JSON: nothing to check. The handler will reject it.
	}
	return {}
}

// Which institution owns a record. A record never changes institution, so a
// known owner is remembered; "no such record" is only remembered briefly,
// because the record may be created a moment later.
const OWNER_TTL_MS = 10 * 60 * 1000
const MISSING_TTL_MS = 30 * 1000
const OWNER_CACHE_MAX = 20_000
const ownerCache = new Map<string, { owner: string | null; at: number }>()

function cachedOwner(key: string): string | null | undefined {
	const hit = ownerCache.get(key)
	if (!hit) return undefined
	if (Date.now() - hit.at > (hit.owner === null ? MISSING_TTL_MS : OWNER_TTL_MS)) {
		ownerCache.delete(key)
		return undefined
	}
	return hit.owner
}

/**
 * Owning institution of each record (as stored: an id or a code), keyed
 * "table:id". Records that do not exist, or have no owner, map to null.
 */
async function loadRecordOwners(refs: readonly RecordRef[]): Promise<Map<string, string | null>> {
	const owners = new Map<string, string | null>()
	const wanted = new Map<string, string[]>()
	for (const ref of refs) {
		const key = `${ref.table}:${ref.id}`
		const cached = cachedOwner(key)
		if (cached !== undefined) owners.set(key, cached)
		else wanted.set(ref.table, [...(wanted.get(ref.table) ?? []), ref.id])
	}

	const supabase = getSupabaseServer()
	for (const [table, ids] of wanted) {
		const column = OWNED_TABLES[table]
		if (!column) continue
		for (let i = 0; i < ids.length; i += 100) {
			const chunk = ids.slice(i, i + 100)
			const { data, error } = await supabase.from(table).select(`id, ${column}`).in('id', chunk)
			if (error) throw new Error(`${table} ownership lookup failed: ${error.message}`)
			const found = new Map<string, string | null>()
			for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
				const owner = row[column]
				found.set(String(row.id).toLowerCase(), typeof owner === 'string' && owner.trim() ? owner : null)
			}
			for (const id of chunk) {
				const key = `${table}:${id}`
				const owner = found.get(id) ?? null
				owners.set(key, owner)
				if (ownerCache.size >= OWNER_CACHE_MAX) {
					const oldest = ownerCache.keys().next().value
					if (oldest !== undefined) ownerCache.delete(oldest)
				}
				ownerCache.set(key, { owner, at: Date.now() })
			}
		}
	}
	return owners
}

export interface InstitutionScopeViolation extends NamedInstitution {
	/** True when the caller is linked to no institution at all. */
	unlinked: boolean
	/** True when the request reached for another institution's record by its id. */
	record: boolean
}

/**
 * Returns what a request names outside the caller's scope — an institution,
 * or a record that belongs to another institution — or null when the request
 * may proceed. The caller should answer 403.
 */
export async function checkInstitutionScope(
	request: NextRequest,
	session: VerifiedSession
): Promise<InstitutionScopeViolation | null> {
	const mode = institutionScopeMode()
	if (mode === 'off') return null

	// Cheap exits first: most requests come from unrestricted users.
	if (isUnrestricted(session)) return null

	const { pathname, searchParams } = request.nextUrl
	const payload = await readPayload(request)

	const named = [
		...institutionsInQuery(searchParams),
		...(payload.form ? institutionsInQuery(payload.form) : []),
		...(payload.json !== undefined ? institutionsInBody(payload.json) : []),
	]
	// Form fields are flat, like a query string.
	const fields = new URLSearchParams(searchParams)
	payload.form?.forEach((value, key) => fields.append(key, value))
	const refs = recordsNamedInRequest(pathname, fields, payload.json, { fields: REFERENCE_FIELDS, routes: ROUTE_RECORDS })

	if (named.length === 0 && refs.length === 0) return null

	let scope: InstitutionScope
	let owners: Map<string, string | null>
	try {
		scope = resolveInstitutionScope(session, await loadInstitutions())
		owners = refs.length > 0 ? await loadRecordOwners(refs) : new Map()
	} catch (err) {
		// The lookup itself failed. This is an outage, not an answer about the
		// user — let the handler report it.
		console.error('[institution-scope] Scope check skipped:', err)
		return null
	}
	if (scope.kind === 'all') return null
	const unlinked = scope.kind === 'none'

	const named_violation = findOutOfScope(named, scope)
	let violation: InstitutionScopeViolation | null = named_violation
		? { ...named_violation, unlinked, record: false }
		: null

	if (!violation) {
		for (const ref of refs) {
			const owner = owners.get(`${ref.table}:${ref.id}`)
			// No such record, or one that belongs to no institution: not ours to refuse.
			if (!owner) continue
			if (scope.kind === 'limited' && scope.allowed.has(owner.trim().toLowerCase())) continue
			violation = { field: `${ref.table} (${ref.source})`, value: ref.id, unlinked, record: true }
			break
		}
	}
	if (!violation) return null

	console.warn(
		`[institution-scope] ${mode === 'report' ? 'Would block' : 'Blocked'} ${request.method} ${pathname}: user ${session.userId}${unlinked ? ' (linked to no institution)' : ''} ${violation.record ? 'reached for a record of another institution:' : 'named'} ${violation.field}=${violation.value}`
	)
	return mode === 'report' ? null : violation
}

/**
 * The institution a handler should filter by, read from a query parameter.
 *
 *   const institutionsId = await institutionParam(searchParams, 'institutions_id')
 *
 * Use this instead of `searchParams.get('institutions_id')`. A value in the
 * request is returned as it is (proxy.ts has already checked it is the
 * caller's own). When the request names none, a super admin gets null — all
 * institutions — and everyone else gets their own institution, so "no
 * filter" can no longer mean "every college's data".
 */
export async function institutionParam(
	searchParams: URLSearchParams,
	name: InstitutionParamName
): Promise<string | null> {
	const requested = searchParams.get(name)
	if (!isUnsetInstitution(requested)) return requested
	if (institutionScopeMode() !== 'enforce') return requested

	try {
		const session = await getRequestUser()
		// No COE session: an API-key or scheduled caller, authorised elsewhere.
		if (!session || isUnrestricted(session)) return requested
		return institutionParamValue(requested, name, resolveInstitutionScope(session, await loadInstitutions()))
	} catch (err) {
		console.error('[institution-scope] Could not resolve the default institution:', err)
		return requested
	}
}

/**
 * Keeps only the rows that belong to the caller's institution.
 *
 * For data that cannot be filtered at the source — the MyJKKN API ignores its
 * institution filter on several endpoints — so the rows are filtered here, on
 * the server, before they leave. (Filtering in the browser, as the screens
 * did, hides the other colleges' rows but still sends them.)
 *
 * A row's institution is read from `institution_id`, `institutions_id` or
 * `institution.id`; MyJKKN ids and COE ids both match. Super admins get every
 * row; a user linked to no institution gets none.
 */
export async function restrictToCallerInstitution<T>(rows: T[] | null | undefined): Promise<T[]> {
	const list = Array.isArray(rows) ? rows : []
	if (list.length === 0 || institutionScopeMode() !== 'enforce') return list

	const session = await getRequestUser()
	// No COE session: an API-key or scheduled caller, authorised elsewhere.
	if (!session || isUnrestricted(session)) return list

	const scope = resolveInstitutionScope(session, await loadInstitutions())
	if (scope.kind === 'all') return list
	if (scope.kind === 'none') return []

	return list.filter((row) => {
		const r = row as Record<string, unknown>
		const nested = r.institution as { id?: unknown } | null | undefined
		const value = r.institution_id ?? r.institutions_id ?? nested?.id
		return typeof value === 'string' && scope.allowed.has(value.trim().toLowerCase())
	})
}
