import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { getSupabaseParent } from '@/lib/supabase-parent'
import { cookies, headers } from 'next/headers'
import {
	COE_SESSION_TTL_SECONDS,
	type ParentProfile,
	bindSession,
	validateTokenWithParent,
	verifyAccessToken,
} from '@/lib/auth/server-session'

/**
 * Fetch a user's COE roles AND their permissions in a SINGLE pass.
 * Previously this was two separate functions that each queried user_roles —
 * merged here so user_roles is read once (2 queries total instead of 3).
 */
async function fetchRolesAndPermissions(
	supabase: any,
	userId: string | null
): Promise<{ permissions: string[]; coeRoles: string[] }> {
	if (!userId) return { permissions: [], coeRoles: [] }

	// Get roles ONLY from COE-assigned roles (user_roles table) — NOT the
	// MyJKKN global role, which is a different system.
	const { data: userRoles } = await supabase
		.from('user_roles')
		.select('role_id, roles!inner(id, name, is_active)')
		.eq('user_id', userId)
		.eq('is_active', true)

	if (!userRoles || userRoles.length === 0) return { permissions: [], coeRoles: [] }

	const activeRoles = userRoles.filter((ur: any) => ur.roles?.is_active !== false)
	const roleIds = activeRoles.map((ur: any) => ur.role_id)
	const coeRoles = activeRoles
		.map((ur: any) => ur.roles?.name)
		.filter((n: any): n is string => Boolean(n))

	if (roleIds.length === 0) return { permissions: [], coeRoles }

	// Fetch permissions for assigned COE roles only
	const { data: rolePerms } = await supabase
		.from('role_permissions')
		.select('permissions!inner(name, is_active)')
		.in('role_id', roleIds)

	const permissions = new Set<string>()
	;(rolePerms || []).forEach((rp: any) => {
		if (rp.permissions?.is_active !== false && rp.permissions?.name) {
			permissions.add(rp.permissions.name)
		}
	})

	return { permissions: Array.from(permissions), coeRoles }
}

/**
 * Fetch institution details by MyJKKN institution_id (UUID) from local institutions table
 * Uses myjkkn_institution_ids array field to handle cases where multiple MyJKKN institutions
 * map to a single COE institution (e.g., CAS Aided + CAS Self → CAS)
 * Falls back to direct id match for backwards compatibility
 */
async function fetchInstitutionByMyJKKNId(supabase: any, myjkknInstitutionId: string | null): Promise<{
	institution_id: string | null
	institution_code: string | null
	institution_name: string | null
	counselling_code: string | null
	myjkkn_institution_ids: string[] | null
}> {
	if (!myjkknInstitutionId) {
		return {
			institution_id: null,
			institution_code: null,
			institution_name: null,
			counselling_code: null,
			myjkkn_institution_ids: null
		}
	}

	try {
		// First, try to find institution using myjkkn_institution_ids array (new method)
		// This handles cases like CAS where multiple MyJKKN UUIDs map to one COE institution
		const { data: institution, error } = await supabase
			.from('institutions')
			.select('id, institution_code, name, counselling_code, myjkkn_institution_ids')
			.contains('myjkkn_institution_ids', [myjkknInstitutionId])
			.eq('is_active', true)
			.single()

		if (institution) {
			return {
				institution_id: institution.id,
				institution_code: institution.institution_code || null,
				institution_name: institution.name || null,
				counselling_code: institution.counselling_code || null,
				myjkkn_institution_ids: institution.myjkkn_institution_ids || null
			}
		}

		// Fallback: Try direct id match (for institutions where COE id = MyJKKN id)
		// This provides backwards compatibility
		const { data: fallbackInstitution, error: fallbackError } = await supabase
			.from('institutions')
			.select('id, institution_code, name, counselling_code, myjkkn_institution_ids')
			.eq('id', myjkknInstitutionId)
			.eq('is_active', true)
			.single()

		if (fallbackInstitution) {
			return {
				institution_id: fallbackInstitution.id,
				institution_code: fallbackInstitution.institution_code || null,
				institution_name: fallbackInstitution.name || null,
				counselling_code: fallbackInstitution.counselling_code || null,
				myjkkn_institution_ids: fallbackInstitution.myjkkn_institution_ids || null
			}
		}

		console.warn(`[sync-session] Institution not found for MyJKKN id: ${myjkknInstitutionId}`, error?.message || fallbackError?.message)
		return {
			institution_id: myjkknInstitutionId,
			institution_code: null,
			institution_name: null,
			counselling_code: null,
			myjkkn_institution_ids: null
		}
	} catch (err) {
		console.error('[sync-session] Error fetching institution by MyJKKN id:', err)
		return {
			institution_id: myjkknInstitutionId,
			institution_code: null,
			institution_name: null,
			counselling_code: null,
			myjkkn_institution_ids: null
		}
	}
}

/**
 * Fetch user's Google avatar from parent Supabase Auth metadata
 */
async function fetchParentAvatar(userId: string): Promise<string | null> {
	try {
		const parentSupabase = getSupabaseParent()
		const { data } = await parentSupabase.auth.admin.getUserById(userId)
		return data?.user?.user_metadata?.avatar_url
			|| data?.user?.user_metadata?.picture
			|| null
	} catch {
		return null
	}
}

type VerifiedCaller =
	| { ok: true; email: string; accessToken: string; parentUserId: string | null; parentProfile: ParentProfile | null }
	| { ok: false; status: 401 | 503; code: string }

/**
 * Prove who the caller is before anything is read or written.
 *
 * This route is public (the browser calls it straight after the OAuth
 * redirect, before any COE session exists), so nothing in the request body
 * can be trusted — least of all `email`. A token is accepted when either:
 *   1. it is already bound to a live COE session (a periodic re-sync), or
 *   2. the parent app confirms it and names its owner (first sync after login).
 * The cookie is tried before the body: after a token refresh the cookie holds
 * the rotated token while a retried request still carries the old one.
 */
async function resolveVerifiedCaller(bodyToken: unknown): Promise<VerifiedCaller> {
	const cookieStore = await cookies()
	const candidates = Array.from(
		new Set(
			[cookieStore.get('access_token')?.value, typeof bodyToken === 'string' ? bodyToken : undefined]
				.filter((t): t is string => Boolean(t))
		)
	)

	let failure: { status: 401 | 503; code: string } = { status: 401, code: 'INVALID_SESSION' }

	for (const token of candidates) {
		const known = await verifyAccessToken(token)
		if (known.ok) {
			return { ok: true, email: known.session.email, accessToken: token, parentUserId: null, parentProfile: null }
		}
		if (known.code === 'SESSION_CHECK_FAILED') {
			failure = { status: 503, code: known.code }
			continue
		}
		// A deactivated COE user stays out even with a valid parent token.
		if (known.code === 'USER_INACTIVE') {
			failure = { status: 401, code: known.code }
			continue
		}
		if (known.code === 'SESSION_EXPIRED' && failure.status !== 503) {
			failure = { status: 401, code: known.code }
		}

		const validated = await validateTokenWithParent(token)
		if (validated) {
			return { ok: true, email: validated.email, accessToken: token, parentUserId: validated.parentUserId, parentProfile: validated.parentProfile }
		}
	}

	return { ok: false, ...failure }
}

/**
 * Sync user session data after parent app OAuth login
 * Updates last_login, syncs user data, fetches permissions, and creates/updates both sessions and user_sessions records
 */
export async function POST(request: Request) {
	try {
		const body = await request.json()
		// Extract institution_id (UUID) from MyJKKN session - this is the KEY for institution lookup
		const { avatar_url, role, refresh_token, institution_id: sessionInstitutionId } = body

		const caller = await resolveVerifiedCaller(body.access_token)
		if (!caller.ok) {
			return NextResponse.json(
				caller.status === 503
					? { error: 'Unable to verify your session right now. Please try again.', code: caller.code }
					: { error: 'Your session has expired. Please sign in again.', code: caller.code },
				{ status: caller.status }
			)
		}

		// The verified identity wins. A body that names someone else is either
		// stale client state or an attempt to act as another user.
		if (typeof body.email === 'string' && body.email.trim().toLowerCase() !== caller.email.toLowerCase()) {
			return NextResponse.json(
				{ error: 'You do not have permission to perform this action.' },
				{ status: 403 }
			)
		}
		const email = caller.email
		const access_token = caller.accessToken
		// Parent user id for the avatar lookup: prefer the one the parent app
		// returned for this token over anything the browser sent.
		const parentUserId: string | null =
			caller.parentUserId || (typeof body.user_id === 'string' ? body.user_id : null)

		const supabase = getSupabaseServer()

		// Get request headers for session tracking
		const headersList = await headers()
		const userAgent = headersList.get('user-agent') || ''
		const forwardedFor = headersList.get('x-forwarded-for')
		const realIp = headersList.get('x-real-ip')
		const ipAddress = forwardedFor?.split(',')[0]?.trim() || realIp || null

		// Look up the user AND the institution CONCURRENTLY — they are
		// independent (institution lookup keys off the session's institution_id,
		// not the user), so there's no reason to serialize them.
		const [userLookup, institutionDetails] = await Promise.all([
			supabase
				.from('users')
				.select('id, email, is_active, avatar_url, institution_id')
				.eq('email', email)
				.single(),
			// Lookup institution from COE local table using institution_id from MyJKKN session.
			// Uses myjkkn_institution_ids array to handle many-to-one mapping (e.g., CAS Aided + Self → CAS).
			fetchInstitutionByMyJKKNId(supabase, sessionInstitutionId)
		])

		const { data: existingUser, error: fetchError } = userLookup

		if (fetchError && fetchError.code !== 'PGRST116') {
			// PGRST116 = not found, other errors are actual errors
			console.error('Error fetching user:', fetchError)
			return NextResponse.json({ error: 'Database error' }, { status: 500 })
		}

		const now = new Date()
		const nowISO = now.toISOString()

		if (existingUser && existingUser.is_active === false) {
			return NextResponse.json(
				{ error: 'Your account is inactive. Contact the administrator.', code: 'USER_INACTIVE' },
				{ status: 403 }
			)
		}

		if (existingUser) {
			// User exists - update last_login
			const { error: updateError } = await supabase
				.from('users')
				.update({
					last_login: nowISO,
					updated_at: nowISO,
					// Optionally sync avatar if provided and user doesn't have one
					...(avatar_url && { avatar_url }),
				})
				.eq('id', existingUser.id)

			if (updateError) {
				console.error('Error updating user:', updateError)
			}

			// COE decides how long its own session lives — never the browser.
			const expiresAt = new Date(now.getTime() + COE_SESSION_TTL_SECONDS * 1000).toISOString()

			// The session writes, roles/permissions read, and avatar resolution
			// are all independent — run them CONCURRENTLY. Previously these were
			// ~8 sequential DB round-trips, the main source of sync-session latency.

			// (a) Session-tracking writes (only when tokens are provided)
			const sessionWritesPromise: Promise<unknown> = access_token
				? (async () => {
					const deviceInfo = {
						browser: extractBrowser(userAgent),
						os: extractOS(userAgent),
						device: extractDevice(userAgent),
						raw: userAgent.substring(0, 255) // Truncate to avoid overflow
					}

					// sessions table: retire this user's EXPIRED rows, then bind the
					// verified token. Live rows are left alone — every API request is
					// now checked against this table, so deactivating them would sign
					// the user out of their other browser or device mid-work.
					const sessionsTable = (async () => {
						await supabase
							.from('sessions')
							.update({ is_active: false, updated_at: nowISO })
							.eq('user_id', existingUser.id)
							.eq('is_active', true)
							.lt('expires_at', nowISO)

						await bindSession({
							userId: existingUser.id,
							accessToken: access_token,
							refreshToken: typeof refresh_token === 'string' ? refresh_token : null,
							deviceInfo,
							parentProfile: caller.parentProfile,
							ipAddress,
							userAgent: userAgent.substring(0, 500),
						})
					})()

					// user_sessions table (legacy/backup): independent of `sessions`,
					// so it runs in parallel with the block above.
					const userSessionsTable = (async () => {
						// Only recorded when a refresh_token is known (column is NOT NULL).
						// A re-sync from the browser carries none, and must not delete the
						// row written at login.
						if (typeof refresh_token !== 'string' || !refresh_token) return

						await supabase
							.from('user_sessions')
							.delete()
							.eq('user_id', existingUser.id)

						await supabase
							.from('user_sessions')
							.insert({
								user_id: existingUser.id,
								access_token: access_token,
								refresh_token: refresh_token,
								expires_at: expiresAt,
								created_at: nowISO,
							})
					})()

					await Promise.all([sessionsTable, userSessionsTable])
				})()
				: Promise.resolve()

			// (b) Roles + permissions in a single pass (user_roles read once)
			const rolesPermsPromise = fetchRolesAndPermissions(supabase, existingUser.id)

			// (c) Resolve avatar: COE local → parent Supabase Auth (Google profile photo)
			const avatarPromise = (async () => {
				let resolvedAvatar = existingUser.avatar_url || avatar_url || null
				if (!resolvedAvatar && parentUserId) {
					resolvedAvatar = await fetchParentAvatar(parentUserId)
					// Cache the avatar in COE users table for future requests
					if (resolvedAvatar) {
						await supabase
							.from('users')
							.update({ avatar_url: resolvedAvatar })
							.eq('id', existingUser.id)
					}
				}
				return resolvedAvatar
			})()

			const [, { permissions, coeRoles }, resolvedAvatar] = await Promise.all([
				sessionWritesPromise,
				rolesPermsPromise,
				avatarPromise
			])

			// Create response with session data
			const response = NextResponse.json({
				success: true,
				message: 'Session synced',
				user_id: existingUser.id,
				is_new_user: false,
				expires_at: expiresAt,
				avatar_url: resolvedAvatar,
				// Return institution details from COE local table (looked up by MyJKKN institution_id)
				// institution_code in COE = counselling_code in MyJKKN (e.g., "CET")
				institution_id: institutionDetails.institution_id,
				institution_code: institutionDetails.institution_code,
				institution_name: institutionDetails.institution_name,
				counselling_code: institutionDetails.counselling_code,
				myjkkn_institution_ids: institutionDetails.myjkkn_institution_ids,
				permissions,
				roles: [role].filter(Boolean),
				coe_roles: coeRoles,
				has_coe_access: coeRoles.length > 0,
			})

			// Extend cookie expiry on every sync (keeps session alive during active use)
			if (access_token) {
				const sevenDaysInSeconds = 7 * 24 * 60 * 60
				response.cookies.set('access_token', access_token, {
					path: '/',
					maxAge: sevenDaysInSeconds,
					httpOnly: false, // Needs to be readable by client JS
					sameSite: 'lax',
					secure: process.env.NODE_ENV === 'production'
				})
				if (refresh_token) {
					const thirtyDaysInSeconds = 30 * 24 * 60 * 60
					response.cookies.set('refresh_token', refresh_token, {
						path: '/',
						maxAge: thirtyDaysInSeconds,
						httpOnly: true, // Refresh token never needs client-side access
						sameSite: 'lax',
						secure: process.env.NODE_ENV === 'production'
					})
				}
			}

			// Set coe_access cookie for client-side access gating
			if (coeRoles.length > 0) {
				const sevenDaysInSeconds = 7 * 24 * 60 * 60
				response.cookies.set('coe_access', 'true', {
					path: '/',
					maxAge: sevenDaysInSeconds,
					httpOnly: false,
					sameSite: 'lax',
					secure: process.env.NODE_ENV === 'production'
				})
			} else {
				response.cookies.delete('coe_access')
			}

			return response
		} else {
			// User doesn't exist in local DB - they need to be added by admin.
			// No userId → no roles/permissions to fetch (fast path).
			const permissions: string[] = []

			// Fetch avatar from parent Supabase Auth (Google profile photo)
			let parentAvatar: string | null = avatar_url || null
			if (!parentAvatar && parentUserId) {
				parentAvatar = await fetchParentAvatar(parentUserId)
			}

			return NextResponse.json({
				success: true,
				message: 'User not in local database - contact admin for provisioning',
				is_new_user: true,
				avatar_url: parentAvatar,
				permissions,
				roles: [role].filter(Boolean),
				coe_roles: [],
				has_coe_access: false,
				// Return institution details even for unprovisioned users
				institution_id: institutionDetails.institution_id,
				institution_code: institutionDetails.institution_code,
				institution_name: institutionDetails.institution_name,
				counselling_code: institutionDetails.counselling_code,
				myjkkn_institution_ids: institutionDetails.myjkkn_institution_ids
			})
		}
	} catch (error) {
		console.error('Sync session error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// Helper functions to extract device info from user agent
function extractBrowser(userAgent: string): string {
	if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome'
	if (userAgent.includes('Firefox')) return 'Firefox'
	if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari'
	if (userAgent.includes('Edg')) return 'Edge'
	if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera'
	return 'Unknown'
}

function extractOS(userAgent: string): string {
	if (userAgent.includes('Windows')) return 'Windows'
	if (userAgent.includes('Mac OS')) return 'macOS'
	if (userAgent.includes('Linux')) return 'Linux'
	if (userAgent.includes('Android')) return 'Android'
	if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS'
	return 'Unknown'
}

function extractDevice(userAgent: string): string {
	if (userAgent.includes('Mobile') || userAgent.includes('Android') && !userAgent.includes('Tablet')) return 'Mobile'
	if (userAgent.includes('Tablet') || userAgent.includes('iPad')) return 'Tablet'
	return 'Desktop'
}
