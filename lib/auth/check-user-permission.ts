/**
 * Server-side permission check for user sessions inside API route handlers.
 *
 * Mirrors the logic in /api/auth/permissions/current:
 *   1. Resolve the authenticated user from the SSR cookie-bound client.
 *   2. Look up the user row by email (falling back to the service client if
 *      RLS blocks the cookie client).
 *   3. super_admin users are allowed everything.
 *   4. Regular users: check the cached `users.permissions` JSONB first
 *      (same cache the UI's hasPermission() reads from), but only when the
 *      cache is fresher than CACHE_TTL. Otherwise, compute live from
 *      user_roles → role_permissions → permissions, filtering out
 *      deactivated roles so revoked access is honored immediately.
 *
 * Returns { ok: true, userId } when the permission is held; otherwise
 * { ok: false, status, error } with a suggested HTTP status code.
 */

import { createRouteHandlerSupabaseClient } from '@/lib/supabase-route-handler'
import { getSupabaseServer } from '@/lib/supabase-server'

// Must match the TTL used by /api/auth/permissions/current so that
// server-side API checks and the UI's hasPermission() never diverge.
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export type PermissionCheckSuccess = {
	ok: true
	userId: string
	email: string
	isSuperAdmin: boolean
}

export type PermissionCheckFailure = {
	ok: false
	status: 401 | 403 | 500
	error: string
}

export type PermissionCheckOutcome = PermissionCheckSuccess | PermissionCheckFailure

/**
 * Role check for API route handlers: does the caller hold any of `roleNames`
 * (from the normalized user_roles → roles tables)? super_admin users always
 * pass. Returns false — never throws — when unauthenticated or on error, so
 * callers can use it purely to *widen* what a request is allowed to do.
 */
export async function hasAnyCoeRole(roleNames: string[]): Promise<boolean> {
	try {
		const routeClient = await createRouteHandlerSupabaseClient()
		const { data: authData } = await routeClient.auth.getUser()
		const email = authData?.user?.email
		if (!email) return false

		const svc = getSupabaseServer()
		const { data: userRow } = await svc
			.from('users')
			.select('id, is_super_admin')
			.eq('email', email)
			.maybeSingle()

		if (!userRow) return false
		if (userRow.is_super_admin) return true

		const { data: userRoles } = await svc
			.from('user_roles')
			.select('roles ( name, is_active )')
			.eq('user_id', userRow.id)
			.eq('is_active', true)
			.or('expires_at.is.null,expires_at.gt.now()')

		return (userRoles ?? []).some(ur => {
			// Supabase returns the joined row as an object or an array depending
			// on the relationship shape — normalize to a list.
			const joined = (ur as { roles?: unknown }).roles
			const list = Array.isArray(joined) ? joined : joined ? [joined] : []
			return list.some(r => {
				const role = r as { name?: string; is_active?: boolean | null }
				return role?.is_active !== false && !!role?.name && roleNames.includes(role.name)
			})
		})
	} catch (err) {
		console.error('[hasAnyCoeRole] Unexpected error:', err)
		return false
	}
}

export async function requireUserPermission(
	permissionName: string,
): Promise<PermissionCheckOutcome> {
	try {
		const routeClient = await createRouteHandlerSupabaseClient()
		const { data: authData, error: authErr } = await routeClient.auth.getUser()

		if (authErr || !authData?.user?.email) {
			return { ok: false, status: 401, error: 'Not authenticated' }
		}

		const email = authData.user.email

		// Try cookie client first; fall back to service client if RLS blocks
		let userRow: {
			id: string
			is_super_admin: boolean | null
			permissions: Record<string, boolean> | null
			updated_at: string | null
		} | null = null

		{
			const { data } = await routeClient
				.from('users')
				.select('id, is_super_admin, permissions, updated_at')
				.eq('email', email)
				.maybeSingle()
			userRow = data
		}

		if (!userRow) {
			const svc = getSupabaseServer()
			const { data } = await svc
				.from('users')
				.select('id, is_super_admin, permissions, updated_at')
				.eq('email', email)
				.maybeSingle()
			userRow = data
		}

		if (!userRow) {
			return { ok: false, status: 403, error: 'User record not found' }
		}

		// Super admins are allowed everything
		if (userRow.is_super_admin) {
			return {
				ok: true,
				userId: userRow.id,
				email,
				isSuperAdmin: true,
			}
		}

		// Prefer the cached JSONB permissions map, but only when it's fresh
		// enough. A stale cache would let revoked grants linger forever, so
		// mirror the 5-minute TTL used by /api/auth/permissions/current.
		const cached = userRow.permissions || {}
		const cacheAge = userRow.updated_at
			? Date.now() - new Date(userRow.updated_at).getTime()
			: Infinity
		const cacheIsFresh =
			cacheAge < CACHE_TTL && Object.keys(cached).length > 0

		if (cacheIsFresh && cached[permissionName] === true) {
			return {
				ok: true,
				userId: userRow.id,
				email,
				isSuperAdmin: false,
			}
		}

		// Cache miss (or stale/empty) — compute live from normalized RBAC.
		// Join in `roles` and filter out deactivated roles so a user whose
		// role was turned off cannot pass this check via stale user_roles.
		const svc = getSupabaseServer()
		const { data: userRoles } = await svc
			.from('user_roles')
			.select('role_id, roles ( id, is_active )')
			.eq('user_id', userRow.id)
			.eq('is_active', true)
			.or('expires_at.is.null,expires_at.gt.now()')

		const roleIds = (userRoles ?? [])
			.filter(ur => {
				const role = (ur as { roles?: { is_active?: boolean | null } | { is_active?: boolean | null }[] | null }).roles
				// Supabase may return the joined row as a single object or an array
				// depending on the relationship shape. Treat missing/undefined as active
				// (matches the reference's `!== false` check).
				if (!role) return true
				if (Array.isArray(role)) {
					return role.every(r => r?.is_active !== false)
				}
				return role.is_active !== false
			})
			.map(ur => (ur as { role_id: string }).role_id)

		if (roleIds.length === 0) {
			return {
				ok: false,
				status: 403,
				error: `Forbidden: ${permissionName} permission required`,
			}
		}

		const { data: rolePerms } = await svc
			.from('role_permissions')
			.select('permissions!inner(name, is_active)')
			.in('role_id', roleIds)

		const holdsPermission = (rolePerms ?? []).some(rp => {
			const p = rp.permissions as unknown as { name: string; is_active: boolean } | null
			return p?.is_active !== false && p?.name === permissionName
		})

		if (!holdsPermission) {
			return {
				ok: false,
				status: 403,
				error: `Forbidden: ${permissionName} permission required`,
			}
		}

		return {
			ok: true,
			userId: userRow.id,
			email,
			isSuperAdmin: false,
		}
	} catch (err) {
		console.error('[requireUserPermission] Unexpected error:', err)
		return {
			ok: false,
			status: 500,
			error: 'Internal permission check error',
		}
	}
}
