/**
 * Server-side permission check for user sessions inside API route handlers.
 *
 * Mirrors the logic in /api/auth/permissions/current:
 *   1. Resolve the authenticated user from the SSR cookie-bound client.
 *   2. Look up the user row by email (falling back to the service client if
 *      RLS blocks the cookie client).
 *   3. super_admin users are allowed everything.
 *   4. Regular users: check the cached `users.permissions` JSONB first
 *      (same cache the UI's hasPermission() reads from). If missing, compute
 *      live from user_roles → role_permissions → permissions.
 *
 * Returns { ok: true, userId } when the permission is held; otherwise
 * { ok: false, status, error } with a suggested HTTP status code.
 */

import { createRouteHandlerSupabaseClient } from '@/lib/supabase-route-handler'
import { getSupabaseServer } from '@/lib/supabase-server'

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
		} | null = null

		{
			const { data } = await routeClient
				.from('users')
				.select('id, is_super_admin, permissions')
				.eq('email', email)
				.maybeSingle()
			userRow = data
		}

		if (!userRow) {
			const svc = getSupabaseServer()
			const { data } = await svc
				.from('users')
				.select('id, is_super_admin, permissions')
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

		// Prefer the cached JSONB permissions map
		const cached = userRow.permissions || {}
		if (cached[permissionName] === true) {
			return {
				ok: true,
				userId: userRow.id,
				email,
				isSuperAdmin: false,
			}
		}

		// Cache miss (or stale/empty) — compute live from normalized RBAC
		const svc = getSupabaseServer()
		const { data: userRoles } = await svc
			.from('user_roles')
			.select('role_id')
			.eq('user_id', userRow.id)
			.eq('is_active', true)
			.or('expires_at.is.null,expires_at.gt.now()')

		const roleIds = (userRoles ?? []).map(r => r.role_id)
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
