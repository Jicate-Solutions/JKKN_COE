import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { getSupabaseParent } from '@/lib/supabase-parent'
import { headers } from 'next/headers'

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

/**
 * Sync user session data after parent app OAuth login
 * Updates last_login, syncs user data, fetches permissions, and creates/updates both sessions and user_sessions records
 */
export async function POST(request: Request) {
	try {
		const body = await request.json()
		// Extract institution_id (UUID) from MyJKKN session - this is the KEY for institution lookup
		const { email, avatar_url, role, access_token, refresh_token, expires_in, institution_id: sessionInstitutionId } = body

		if (!email) {
			return NextResponse.json({ error: 'Email is required' }, { status: 400 })
		}

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

			// Calculate expires_at based on actual token expiry (default 1 hour if not provided)
			const expiresAt = new Date(now.getTime() + (expires_in || 3600) * 1000).toISOString()

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

					// sessions table: mark old sessions inactive THEN upsert the new
					// active one. These two MUST stay ordered — if the upsert ran
					// first, the mark-inactive update would flip it back to inactive.
					const sessionsTable = (async () => {
						await supabase
							.from('sessions')
							.update({ is_active: false, updated_at: nowISO })
							.eq('user_id', existingUser.id)
							.eq('is_active', true)

						await supabase
							.from('sessions')
							.upsert({
								user_id: existingUser.id,
								session_token: access_token,
								refresh_token: refresh_token || null,
								device_info: deviceInfo,
								ip_address: ipAddress,
								user_agent: userAgent.substring(0, 500),
								is_active: true,
								expires_at: expiresAt,
								created_at: nowISO,
								updated_at: nowISO,
							}, { onConflict: 'session_token' })
					})()

					// user_sessions table (legacy/backup): independent of `sessions`,
					// so it runs in parallel with the block above.
					const userSessionsTable = (async () => {
						await supabase
							.from('user_sessions')
							.delete()
							.eq('user_id', existingUser.id)

						// Only insert if refresh_token exists (column is NOT NULL)
						if (refresh_token) {
							await supabase
								.from('user_sessions')
								.insert({
									user_id: existingUser.id,
									access_token: access_token,
									refresh_token: refresh_token,
									expires_at: expiresAt,
									created_at: nowISO,
								})
						}
					})()

					await Promise.all([sessionsTable, userSessionsTable])
				})()
				: Promise.resolve()

			// (b) Roles + permissions in a single pass (user_roles read once)
			const rolesPermsPromise = fetchRolesAndPermissions(supabase, existingUser.id)

			// (c) Resolve avatar: COE local → parent Supabase Auth (Google profile photo)
			const avatarPromise = (async () => {
				let resolvedAvatar = existingUser.avatar_url || avatar_url || null
				if (!resolvedAvatar && body.user_id) {
					resolvedAvatar = await fetchParentAvatar(body.user_id)
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
				expires_at: new Date(now.getTime() + (expires_in || 3600) * 1000).toISOString(),
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
			if (!parentAvatar && body.user_id) {
				parentAvatar = await fetchParentAvatar(body.user_id)
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
