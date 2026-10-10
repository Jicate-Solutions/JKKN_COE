/**
 * Server-side session verification — the single source of truth for "who is
 * calling" inside proxy.ts and API route handlers.
 *
 * The browser holds an `access_token` cookie (a MyJKKN parent-app token). Its
 * mere presence, or the claims decoded from it, prove nothing: anyone can set
 * a cookie or hand-craft an unsigned JWT payload. A token only counts once it
 * is bound to a COE user in the `sessions` table, and rows are only written
 * there after the token was verified with the parent app
 * (see /api/auth/sync-session and /api/token/refresh).
 *
 * Usage in a route handler:
 *   const caller = await getRequestUser()
 *   if (!caller) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
 */

import { cookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabase-server'

/** Lifetime of a COE session row, refreshed on every sync-session / token refresh. */
export const COE_SESSION_TTL_SECONDS = 12 * 60 * 60

// A verified session is remembered per server instance for this long, so a
// burst of API calls costs one lookup. It also bounds how long a revoked
// session or a removed role can linger on a warm instance.
const CACHE_TTL_MS = 30 * 1000
const CACHE_MAX_ENTRIES = 1000

export type SessionFailureCode =
	| 'INVALID_SESSION'
	| 'SESSION_REVOKED'
	| 'SESSION_EXPIRED'
	| 'USER_INACTIVE'
	| 'SESSION_CHECK_FAILED'

/**
 * What the parent app (MyJKKN) reported about a user when their session was
 * created. The browser scopes its requests with exactly this record, so the
 * server keeps the verified copy to check those requests against.
 */
export interface ParentProfile {
	/** MyJKKN institution id of the user. */
	institutionId: string | null
	/** MyJKKN super admin — the only users the UI lets switch institution. */
	isSuperAdmin: boolean
}

// Key under which the parent profile is kept in sessions.device_info.
const PARENT_PROFILE_KEY = 'parent_profile'

/**
 * Read a ParentProfile out of a parent-app user object. Only pass a user
 * object received from the parent app server-to-server.
 */
export function extractParentProfile(user: unknown): ParentProfile | null {
	if (!user || typeof user !== 'object') return null
	const u = user as Record<string, unknown>
	const roles = Array.isArray(u.roles) ? u.roles : []
	return {
		institutionId: typeof u.institution_id === 'string' && u.institution_id ? u.institution_id : null,
		isSuperAdmin: u.role === 'super_admin' || u.is_super_admin === true || roles.includes('super_admin'),
	}
}

function storedParentProfile(deviceInfo: unknown): ParentProfile | null {
	if (!deviceInfo || typeof deviceInfo !== 'object') return null
	const stored = (deviceInfo as Record<string, unknown>)[PARENT_PROFILE_KEY]
	if (!stored || typeof stored !== 'object') return null
	const p = stored as Record<string, unknown>
	return {
		institutionId: typeof p.institutionId === 'string' && p.institutionId ? p.institutionId : null,
		isSuperAdmin: p.isSuperAdmin === true,
	}
}

export interface VerifiedSession {
	userId: string
	email: string
	fullName: string | null
	isSuperAdmin: boolean
	institutionId: string | null
	/** Active COE role names (user_roles → roles). */
	roles: string[]
	/** super_admin, or at least one active COE role. */
	hasCoeAccess: boolean
	/** null when the session was bound without the parent's user record. */
	parentProfile: ParentProfile | null
}

export type SessionVerification =
	| { ok: true; session: VerifiedSession }
	| { ok: false; code: SessionFailureCode }

const cache = new Map<string, { session: VerifiedSession; cachedAt: number }>()

function readCache(token: string): VerifiedSession | null {
	const hit = cache.get(token)
	if (!hit) return null
	if (Date.now() - hit.cachedAt > CACHE_TTL_MS) {
		cache.delete(token)
		return null
	}
	return hit.session
}

function writeCache(token: string, session: VerifiedSession) {
	if (cache.size >= CACHE_MAX_ENTRIES) {
		// Map iterates in insertion order — drop the oldest entry.
		const oldest = cache.keys().next().value
		if (oldest !== undefined) cache.delete(oldest)
	}
	cache.set(token, { session, cachedAt: Date.now() })
}

/** Forget a token on this instance (logout, token rotation). */
export function forgetSession(token: string | null | undefined) {
	if (token) cache.delete(token)
}

/**
 * Load a COE user with their active roles. Returns null when the user does
 * not exist or is deactivated; throws on a database error.
 */
export async function loadCoeUser(
	match: { id: string } | { email: string }
): Promise<VerifiedSession | null> {
	const supabase = getSupabaseServer()

	const USER_COLUMNS = 'id, email, full_name, is_active, is_super_admin, institution_id'
	const lookup = (column: 'id' | 'email', value: string) =>
		supabase.from('users').select(USER_COLUMNS).eq(column, value).maybeSingle()

	let { data: user, error: userError } =
		'id' in match ? await lookup('id', match.id) : await lookup('email', match.email)
	// Accounts are stored lower-case; the parent app may report mixed case.
	if (!user && !userError && 'email' in match && match.email !== match.email.toLowerCase()) {
		;({ data: user, error: userError } = await lookup('email', match.email.toLowerCase()))
	}
	if (userError) throw new Error(`users lookup failed: ${userError.message}`)
	if (!user || user.is_active === false) return null

	const { data: userRoles, error: rolesError } = await supabase
		.from('user_roles')
		.select('expires_at, roles ( name, is_active )')
		.eq('user_id', user.id)
		.eq('is_active', true)
	if (rolesError) throw new Error(`user_roles lookup failed: ${rolesError.message}`)

	const now = Date.now()
	const roles = new Set<string>()
	for (const ur of userRoles ?? []) {
		const expiresAt = (ur as { expires_at?: string | null }).expires_at
		if (expiresAt && new Date(expiresAt).getTime() <= now) continue
		// Supabase returns the joined row as an object or an array depending
		// on the relationship shape — normalize to a list.
		const joined = (ur as { roles?: unknown }).roles
		const list = Array.isArray(joined) ? joined : joined ? [joined] : []
		for (const r of list) {
			const role = r as { name?: string; is_active?: boolean | null }
			if (role?.name && role.is_active !== false) roles.add(role.name)
		}
	}

	const isSuperAdmin = user.is_super_admin === true
	return {
		userId: user.id,
		email: user.email,
		fullName: user.full_name ?? null,
		isSuperAdmin,
		institutionId: user.institution_id ?? null,
		roles: Array.from(roles),
		hasCoeAccess: isSuperAdmin || roles.size > 0,
		parentProfile: null,
	}
}

/**
 * Verify an access token against the `sessions` table.
 * `SESSION_CHECK_FAILED` means the check itself could not run (database
 * unreachable) — callers should answer 503, not log the user out.
 */
export async function verifyAccessToken(
	token: string | null | undefined
): Promise<SessionVerification> {
	if (!token) return { ok: false, code: 'INVALID_SESSION' }

	const cached = readCache(token)
	if (cached) return { ok: true, session: cached }

	try {
		const supabase = getSupabaseServer()
		const { data: row, error } = await supabase
			.from('sessions')
			.select('user_id, is_active, expires_at, device_info')
			.eq('session_token', token)
			.maybeSingle()

		if (error) throw new Error(`sessions lookup failed: ${error.message}`)
		if (!row) return { ok: false, code: 'INVALID_SESSION' }
		if (!row.is_active) return { ok: false, code: 'SESSION_REVOKED' }
		if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
			return { ok: false, code: 'SESSION_EXPIRED' }
		}

		const session = await loadCoeUser({ id: row.user_id })
		if (!session) return { ok: false, code: 'USER_INACTIVE' }
		session.parentProfile = storedParentProfile(row.device_info)

		writeCache(token, session)
		return { ok: true, session }
	} catch (err) {
		console.error('[server-session] Session check failed:', err)
		return { ok: false, code: 'SESSION_CHECK_FAILED' }
	}
}

/** Verified caller for the current request, or null when not signed in. */
export async function getRequestUser(): Promise<VerifiedSession | null> {
	const cookieStore = await cookies()
	const result = await verifyAccessToken(cookieStore.get('access_token')?.value)
	return result.ok ? result.session : null
}

/**
 * Ask the parent app (MyJKKN) who an access token belongs to. Returns the
 * token owner's email, or null when the parent rejects the token or cannot
 * be reached. This is the only way a browser-supplied token becomes trusted.
 */
export async function validateTokenWithParent(
	token: string
): Promise<{ email: string; parentUserId: string | null; parentProfile: ParentProfile | null } | null> {
	const parentAppUrl = process.env.NEXT_PUBLIC_PARENT_APP_URL
	if (!parentAppUrl) return null

	try {
		const response = await fetch(`${parentAppUrl}/api/auth/validate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				access_token: token,
				child_app_id: process.env.NEXT_PUBLIC_APP_ID,
			}),
			cache: 'no-store',
		})
		if (!response.ok) return null

		const data = await response.json().catch(() => null)
		if (!data || data.valid === false) return null

		const email = data.user?.email
		if (typeof email !== 'string' || !email.includes('@')) return null
		return {
			email,
			parentUserId: typeof data.user?.id === 'string' ? data.user.id : null,
			parentProfile: extractParentProfile(data.user),
		}
	} catch (err) {
		console.warn('[server-session] Parent token validation failed:', err)
		return null
	}
}

/**
 * Bind a parent-verified access token to a COE user. Call ONLY with a token
 * whose owner was just proven — returned by the parent app server-to-server,
 * or confirmed by validateTokenWithParent().
 */
export async function bindSession(params: {
	userId: string
	accessToken: string
	refreshToken?: string | null
	deviceInfo?: Record<string, unknown> | null
	ipAddress?: string | null
	userAgent?: string | null
	/** From the parent app's own user record for this token — never from the browser. */
	parentProfile?: ParentProfile | null
}): Promise<void> {
	const supabase = getSupabaseServer()
	const now = new Date()
	const nowISO = now.toISOString()
	const expiresAt = new Date(now.getTime() + COE_SESSION_TTL_SECONDS * 1000).toISOString()

	const row: Record<string, unknown> = {
		user_id: params.userId,
		session_token: params.accessToken,
		is_active: true,
		expires_at: expiresAt,
		updated_at: nowISO,
	}
	// Only overwrite the optional columns when the caller knows them, so a
	// re-sync from the browser (which cannot read the httpOnly refresh cookie)
	// does not wipe the stored refresh token.
	if (params.refreshToken) row.refresh_token = params.refreshToken
	if (params.deviceInfo || params.parentProfile) {
		// device_info holds both the browser details and the parent profile, and
		// the two arrive in different calls — merge, never replace.
		const { data: existing } = await supabase
			.from('sessions')
			.select('device_info')
			.eq('session_token', params.accessToken)
			.maybeSingle()
		const previous =
			existing?.device_info && typeof existing.device_info === 'object'
				? (existing.device_info as Record<string, unknown>)
				: {}
		row.device_info = {
			...previous,
			...(params.deviceInfo ?? {}),
			...(params.parentProfile ? { [PARENT_PROFILE_KEY]: params.parentProfile } : {}),
		}
	}
	if (params.ipAddress) row.ip_address = params.ipAddress
	if (params.userAgent) row.user_agent = params.userAgent

	const { error } = await supabase
		.from('sessions')
		.upsert(row, { onConflict: 'session_token' })
	if (error) throw new Error(`session bind failed: ${error.message}`)

	// A COE account created without an institution learns it from MyJKKN the
	// first time the user signs in. Only an empty value is filled, never an
	// existing one changed; institution scoping falls back to this column for
	// sessions that carry no parent profile.
	if (params.parentProfile?.institutionId) {
		const { error: backfillError } = await supabase
			.from('users')
			.update({ institution_id: params.parentProfile.institutionId })
			.eq('id', params.userId)
			.is('institution_id', null)
		if (backfillError) console.warn('[server-session] Could not record the user\'s institution:', backfillError.message)
	}

	forgetSession(params.accessToken)
}

function jwtPayload(token: string | undefined): Record<string, unknown> | null {
	if (!token) return null
	try {
		const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
		return payload && typeof payload === 'object' ? payload : null
	} catch {
		return null
	}
}

/**
 * Email of the user a token response was issued to. Only meaningful for a
 * response received directly from the parent app (code exchange, refresh) —
 * never for a token that arrived from the browser, whose payload anyone can
 * write.
 */
export function parentTokenOwnerEmail(tokenData: {
	access_token?: string
	user?: { email?: unknown } | null
}): string | null {
	const fromUser = tokenData.user?.email
	if (typeof fromUser === 'string' && fromUser.includes('@')) return fromUser
	const payload = jwtPayload(tokenData.access_token)
	const claim = payload?.email || payload?.user_email || payload?.preferred_username
	return typeof claim === 'string' && claim.includes('@') ? claim : null
}

/**
 * Bind the tokens of a parent-app token response (received server-to-server)
 * to the COE user they were issued to. Returns false when that person has no
 * active COE account — they then simply have no COE session. Never throws:
 * the caller still has tokens to hand back to the browser.
 */
export async function bindParentIssuedSession(
	tokenData: { access_token?: string; refresh_token?: string; user?: Record<string, unknown> | null },
	meta: { userAgent?: string | null; ipAddress?: string | null } = {}
): Promise<boolean> {
	try {
		if (!tokenData.access_token) return false
		const email = parentTokenOwnerEmail(tokenData)
		if (!email) return false
		const owner = await loadCoeUser({ email })
		if (!owner) return false

		await bindSession({
			userId: owner.userId,
			accessToken: tokenData.access_token,
			refreshToken: tokenData.refresh_token || null,
			parentProfile: extractParentProfile(tokenData.user),
			userAgent: meta.userAgent || null,
			ipAddress: meta.ipAddress || null,
		})
		return true
	} catch (err) {
		console.error('[server-session] Could not bind parent-issued session:', err)
		return false
	}
}

const permissionCache = new Map<string, { permissions: Set<string>; cachedAt: number }>()

/**
 * Permission names a user holds through their active, unexpired roles
 * (user_roles → role_permissions → permissions). Read live rather than from
 * the cached `users.permissions` JSON, so a revoked role stops working within
 * the cache window instead of whenever the cache is next rebuilt.
 * Throws on a database error — an unknown answer must not read as "none".
 */
export async function loadUserPermissions(userId: string): Promise<Set<string>> {
	const hit = permissionCache.get(userId)
	if (hit && Date.now() - hit.cachedAt <= CACHE_TTL_MS) return hit.permissions

	const supabase = getSupabaseServer()
	const { data: userRoles, error: rolesError } = await supabase
		.from('user_roles')
		.select('role_id, expires_at, roles ( is_active )')
		.eq('user_id', userId)
		.eq('is_active', true)
	if (rolesError) throw new Error(`user_roles lookup failed: ${rolesError.message}`)

	const now = Date.now()
	const roleIds = (userRoles ?? [])
		.filter((ur) => {
			const expiresAt = (ur as { expires_at?: string | null }).expires_at
			if (expiresAt && new Date(expiresAt).getTime() <= now) return false
			const joined = (ur as { roles?: unknown }).roles
			const list = Array.isArray(joined) ? joined : joined ? [joined] : []
			return list.every((r) => (r as { is_active?: boolean | null })?.is_active !== false)
		})
		.map((ur) => (ur as { role_id: string }).role_id)

	const permissions = new Set<string>()
	if (roleIds.length > 0) {
		const { data: rolePerms, error: permsError } = await supabase
			.from('role_permissions')
			.select('permissions!inner ( name, is_active )')
			.in('role_id', roleIds)
		if (permsError) throw new Error(`role_permissions lookup failed: ${permsError.message}`)

		for (const rp of rolePerms ?? []) {
			const joined = (rp as { permissions?: unknown }).permissions
			const list = Array.isArray(joined) ? joined : joined ? [joined] : []
			for (const p of list) {
				const permission = p as { name?: string; is_active?: boolean | null }
				if (permission?.name && permission.is_active !== false) permissions.add(permission.name)
			}
		}
	}

	if (permissionCache.size >= CACHE_MAX_ENTRIES) {
		const oldest = permissionCache.keys().next().value
		if (oldest !== undefined) permissionCache.delete(oldest)
	}
	permissionCache.set(userId, { permissions, cachedAt: Date.now() })
	return permissions
}
