import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Fetch permissions for a user based on their role name
 * This is used for centralized auth where the parent app provides the role
 * but permissions need to be fetched from the local database
 *
 * Query params:
 * - role: Role name from parent app (e.g., "coe", "admin", "staff")
 * - email: User's email (optional, for user-specific role lookups)
 */
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url)
		const roleName = searchParams.get('role')
		const email = searchParams.get('email')

		if (!roleName && !email) {
			return NextResponse.json({
				roles: [],
				permissions: [],
				error: 'Either role or email parameter is required'
			}, { status: 400 })
		}

		const supabase = getSupabaseServer()
		let roleIds: string[] = []
		let roleNames: string[] = []

		// Method 1: Get permissions by role name from parent app
		if (roleName) {
			// Find role by name
			const { data: role, error: roleError } = await supabase
				.from('roles')
				.select('id, name')
				.eq('name', roleName)
				.eq('is_active', true)
				.single()

			if (!roleError && role) {
				roleIds.push(role.id)
				roleNames.push(role.name)
			}
		}

		// Method 2: Get roles from user_roles table if email provided
		if (email) {
			// First find user by email
			const { data: user, error: userError } = await supabase
				.from('users')
				.select('id')
				.eq('email', email)
				.single()

			if (!userError && user) {
				// Get user's roles from user_roles table
				const { data: userRoles, error: urError } = await supabase
					.from('user_roles')
					.select(`
						role_id,
						roles (
							id,
							name,
							is_active
						)
					`)
					.eq('user_id', user.id)
					.eq('is_active', true)

				if (!urError && userRoles) {
					userRoles.forEach((ur: any) => {
						if (ur.roles?.is_active !== false) {
							if (!roleIds.includes(ur.role_id)) {
								roleIds.push(ur.role_id)
								roleNames.push(ur.roles?.name)
							}
						}
					})
				}
			}
		}

		// No roles found
		if (roleIds.length === 0) {
			return NextResponse.json({
				roles: [],
				permissions: [],
				message: 'No active roles found'
			})
		}

		// Fetch permissions for all roles
		const { data: rolePerms, error: rpError } = await supabase
			.from('role_permissions')
			.select(`
				permission_id,
				permissions (
					id,
					name,
					resource,
					action,
					description,
					is_active
				)
			`)
			.in('role_id', roleIds)

		if (rpError) {
			console.error('Error fetching role permissions:', rpError)
			return NextResponse.json({
				roles: roleNames,
				permissions: [],
				error: 'Failed to fetch permissions'
			}, { status: 500 })
		}

		// Build permissions list and map
		const permissionsMap: Record<string, boolean> = {}
		const permissionsList: string[] = []

		rolePerms?.forEach((rp: any) => {
			if (rp.permissions?.is_active !== false && rp.permissions?.name) {
				if (!permissionsMap[rp.permissions.name]) {
					permissionsMap[rp.permissions.name] = true
					permissionsList.push(rp.permissions.name)
				}
			}
		})

		return NextResponse.json({
			roles: roleNames,
			permissions: permissionsList,
			permissionsMap,
			count: permissionsList.length
		})
	} catch (error) {
		console.error('Permissions by role API error:', error)
		return NextResponse.json({
			roles: [],
			permissions: [],
			error: 'Internal server error'
		}, { status: 500 })
	}
}
