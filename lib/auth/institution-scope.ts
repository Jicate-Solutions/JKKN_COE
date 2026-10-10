/**
 * Institution isolation for API requests.
 *
 * Every screen sends the institution it is working on (`institutions_id`,
 * `institution_code`, …) and the handlers filter by it — but none of them
 * checked that the caller belongs to that institution, so changing the value
 * in a URL or request body used to reach another college's data, and leaving
 * it out returned every college's.
 *
 * Two controls close that, both built on the rules in this file:
 *   1. proxy.ts rejects a request that NAMES an institution outside the
 *      caller's scope (query string or body).
 *   2. Handlers read the institution through institutionParam()
 *      (institution-scope-request.ts), which falls back to the caller's own
 *      institution when the request names none.
 *
 * Who may work on what:
 *   • Super admins (COE flag, COE `super_admin` role, or MyJKKN super admin —
 *     the only users the UI lets switch institution) are unrestricted.
 *   • Everyone else is limited to their own institution: the one MyJKKN
 *     reported when the session was created (the record the browser scopes
 *     its requests with) and the one on their COE user row.
 *   • A user with neither is linked to no institution and sees no
 *     institution's data — the same thing the UI shows such a user.
 *
 * INSTITUTION_SCOPE=report logs violations without blocking; =off disables it.
 */

import type { VerifiedSession } from '@/lib/auth/server-session'

export interface InstitutionRecord {
	id: string
	institution_code: string | null
	counselling_code?: string | null
	myjkkn_institution_ids?: string[] | null
}

export type InstitutionScope =
	| { kind: 'all' }
	/** Linked to no institution: nothing may be named, and defaults match nothing. */
	| { kind: 'none' }
	| { kind: 'limited'; allowed: Set<string>; primary: InstitutionRecord }

export interface NamedInstitution {
	field: string
	value: string
}

/** Stand-ins that match no row, for a user linked to no institution. */
export const NO_INSTITUTION_ID = '00000000-0000-0000-0000-000000000000'
export const NO_INSTITUTION_CODE = '__no_institution__'

// Request fields that name the institution being worked on (compared lower-case).
const INSTITUTION_FIELDS = new Set([
	'institutions_id',
	'institution_id',
	'institutionid',
	'institutionsid',
	'institution_code',
	'institutions_code',
	'institutioncode',
	'institution_ids',
	'institutions_ids',
	'myjkkn_institution_id',
	'myjkkn_institution_ids',
])

// Placeholders screens send for "not chosen".
const EMPTY_VALUES = new Set(['', 'all', 'null', 'undefined', 'none'])

const MAX_BODY_NODES = 50_000

/** True for a missing value or one of the "not chosen" placeholders. */
export function isUnsetInstitution(value: string | null | undefined): boolean {
	return value === null || value === undefined || EMPTY_VALUES.has(value.trim().toLowerCase())
}

const norm = (value: string) => value.trim().toLowerCase()

/** Every identifier an institution is known by: COE id, code, counselling code, MyJKKN ids. */
function identifiersOf(institution: InstitutionRecord): string[] {
	return [
		institution.id,
		institution.institution_code,
		institution.counselling_code,
		...(institution.myjkkn_institution_ids ?? []),
	]
		.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
		.map(norm)
}

/** Which institutions may this caller work on? */
export function resolveInstitutionScope(
	session: Pick<VerifiedSession, 'isSuperAdmin' | 'roles' | 'institutionId' | 'parentProfile'>,
	institutions: readonly InstitutionRecord[]
): InstitutionScope {
	if (session.isSuperAdmin || session.roles.includes('super_admin')) return { kind: 'all' }
	if (session.parentProfile?.isSuperAdmin) return { kind: 'all' }

	// The MyJKKN institution first: it is what the browser sends, so it is the
	// one a request with no institution should default to.
	const own = [session.parentProfile?.institutionId, session.institutionId]
		.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
		.map(norm)

	const allowed = new Set<string>()
	let primary: InstitutionRecord | null = null
	for (const ownId of own) {
		for (const institution of institutions) {
			const ids = identifiersOf(institution)
			if (!ids.includes(ownId)) continue
			ids.forEach((id) => allowed.add(id))
			primary ??= institution
		}
	}
	if (!primary) return { kind: 'none' }
	return { kind: 'limited', allowed, primary }
}

function pushValues(field: string, raw: unknown, out: NamedInstitution[]) {
	const values = Array.isArray(raw) ? raw : [raw]
	for (const entry of values) {
		if (typeof entry !== 'string') continue
		// Lists arrive comma-separated in query strings.
		for (const part of entry.split(',')) {
			if (!EMPTY_VALUES.has(norm(part))) out.push({ field, value: part.trim() })
		}
	}
}

/** Institutions named in a query string. */
export function institutionsInQuery(searchParams: URLSearchParams): NamedInstitution[] {
	const out: NamedInstitution[] = []
	for (const [key, value] of searchParams) {
		if (INSTITUTION_FIELDS.has(key.toLowerCase())) pushValues(key, value, out)
	}
	return out
}

/** Institutions named anywhere in a JSON body (objects and arrays of rows, nested). */
export function institutionsInBody(body: unknown): NamedInstitution[] {
	const out: NamedInstitution[] = []
	const stack: unknown[] = [body]
	let visited = 0
	while (stack.length > 0 && visited < MAX_BODY_NODES) {
		const node = stack.pop()
		visited++
		if (Array.isArray(node)) {
			for (const item of node) if (item && typeof item === 'object') stack.push(item)
		} else if (node && typeof node === 'object') {
			for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
				if (INSTITUTION_FIELDS.has(key.toLowerCase())) pushValues(key, value, out)
				else if (value && typeof value === 'object') stack.push(value)
			}
		}
	}
	return out
}

/** The first named institution the caller may not work on, or null when all are in scope. */
export function findOutOfScope(
	named: readonly NamedInstitution[],
	scope: InstitutionScope
): NamedInstitution | null {
	if (scope.kind === 'all') return null
	// Linked to no institution: whatever is named is out of scope.
	if (scope.kind === 'none') return named[0] ?? null
	return named.find((n) => !scope.allowed.has(norm(n.value))) ?? null
}

/** Query parameters that carry the institution a handler filters by. */
export type InstitutionParamName = 'institutions_id' | 'institution_id' | 'institution_code'

/**
 * The institution a handler should use for a query parameter.
 *   • a value in the request wins (proxy.ts has already checked it is in scope)
 *   • otherwise an unrestricted caller gets null — "all institutions"
 *   • otherwise the caller's own institution, or a value matching no row for
 *     a caller linked to none
 * `name` decides the form: a code for `institution_code`, the COE institution id
 * otherwise. (`institution_id` carries a COE id in every session-gated handler;
 * the MyJKKN-id uses are all under /api/myjkkn, which does its own filtering.)
 */
export function institutionParamValue(
	requested: string | null,
	name: InstitutionParamName,
	scope: InstitutionScope
): string | null {
	if (!isUnsetInstitution(requested)) return requested
	if (scope.kind === 'all') return requested
	const wantsCode = name === 'institution_code'
	if (scope.kind === 'none') return wantsCode ? NO_INSTITUTION_CODE : NO_INSTITUTION_ID
	return wantsCode ? scope.primary.institution_code ?? NO_INSTITUTION_CODE : scope.primary.id
}

export type InstitutionScopeMode = 'enforce' | 'report' | 'off'

export function institutionScopeMode(): InstitutionScopeMode {
	const mode = (process.env.INSTITUTION_SCOPE || '').toLowerCase()
	return mode === 'report' || mode === 'off' ? mode : 'enforce'
}
