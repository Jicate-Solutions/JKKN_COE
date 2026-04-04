/**
 * Admin route authorization guard.
 *
 * Wraps API route handlers to ensure only authenticated users with
 * admin/super_admin roles can access them. Extracts user identity
 * from the access_token cookie and verifies role in the database.
 *
 * Usage:
 *   export const GET = withAdminAuth(async (request, user) => {
 *     // user.id, user.email, user.roles are available
 *     return NextResponse.json({ data })
 *   })
 *
 *   // Require specific roles:
 *   export const POST = withAdminAuth(async (request, user) => {
 *     return NextResponse.json({ data })
 *   }, { requiredRoles: ['super_admin'] })
 */

import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export interface AdminUser {
	id: string
	email: string
	full_name: string | null
	roles: string[]
}

interface AdminAuthOptions {
	/** Roles that can access this route. Default: ['admin', 'super_admin'] */
	requiredRoles?: string[]
}

type AdminHandler = (request: Request, user: AdminUser) => Promise<NextResponse>

// Default admin roles
const DEFAULT_ADMIN_ROLES = ['admin', 'super_admin']

/**
 * Higher-order function that wraps an API handler with admin authentication.
 */
export function withAdminAuth(handler: AdminHandler, options?: AdminAuthOptions) {
	const allowedRoles = options?.requiredRoles || DEFAULT_ADMIN_ROLES

	return async (request: Request): Promise<NextResponse> => {
		try {
			const supabase = getSupabaseServer()

			// 1. Get access token from cookie
			const cookieStore = await cookies()
			const accessToken = cookieStore.get('access_token')?.value

			if (!accessToken) {
				return NextResponse.json(
					{ error: 'Authentication required' },
					{ status: 401 }
				)
			}

			// 2. Look up session by access_token to get user_id
			const { data: session } = await supabase
				.from('sessions')
				.select('user_id')
				.eq('session_token', accessToken)
				.eq('is_active', true)
				.single()

			if (!session) {
				return NextResponse.json(
					{ error: 'Invalid or expired session' },
					{ status: 401 }
				)
			}

			// 3. Get user details + active roles
			const { data: user } = await supabase
				.from('users')
				.select(`
					id,
					email,
					full_name,
					is_active,
					user_roles(
						roles(name)
					)
				`)
				.eq('id', session.user_id)
				.eq('is_active', true)
				.single()

			if (!user) {
				return NextResponse.json(
					{ error: 'User not found or inactive' },
					{ status: 403 }
				)
			}

			// 4. Extract role names
			const userRoles = (user.user_roles || [])
				.map((ur: any) => ur.roles?.name)
				.filter(Boolean) as string[]

			// 5. Check if user has at least one required role
			const hasAccess = userRoles.some((role) => allowedRoles.includes(role))

			if (!hasAccess) {
				return NextResponse.json(
					{ error: 'Admin access required. You do not have permission for this operation.' },
					{ status: 403 }
				)
			}

			// 6. Call the handler with authenticated user context
			const adminUser: AdminUser = {
				id: user.id,
				email: user.email,
				full_name: user.full_name,
				roles: userRoles,
			}

			return handler(request, adminUser)
		} catch (err) {
			console.error('[withAdminAuth] Error:', err)
			return NextResponse.json(
				{ error: 'Internal server error' },
				{ status: 500 }
			)
		}
	}
}
