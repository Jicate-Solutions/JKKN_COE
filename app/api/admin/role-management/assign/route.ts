import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { getSupabaseParent } from '@/lib/supabase-parent'
import { withAdminAuth } from '@/lib/security/admin-guard'
import { logTransaction } from '@/lib/logging/server-transaction-log'

export const POST = withAdminAuth(async (request, _adminUser) => {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const { email, full_name, role_name, role_names, assigned_by, parent_user_id, institution_id, avatar_url } = body

	// Support both single role (role_name) and multiple roles (role_names)
	const rolesToAssign: string[] = role_names || (role_name ? [role_name] : [])

	if (!email || rolesToAssign.length === 0) {
		return NextResponse.json({ error: 'Email and at least one role are required' }, { status: 400 })
	}

	// 1. Find or create user in COE users table
	let { data: user } = await supabase
		.from('users')
		.select('id')
		.eq('email', email)
		.single()

	if (!user) {
		let resolvedAvatar = avatar_url || null
		if (!resolvedAvatar && parent_user_id) {
			try {
				const parentSupabase = getSupabaseParent()
				const { data: authUser } = await parentSupabase.auth.admin.getUserById(parent_user_id)
				resolvedAvatar = authUser?.user?.user_metadata?.avatar_url || null
			} catch {}
		}

		const { data: newUser, error: createErr } = await supabase
			.from('users')
			.insert({
				email,
				full_name: full_name || email.split('@')[0],
				role: 'user',
				is_active: true,
				avatar_url: resolvedAvatar,
				institution_id: institution_id || null,
			})
			.select('id')
			.single()

		if (createErr) {
			console.error('Failed to create user:', createErr)
			return NextResponse.json({ error: 'Failed to create user: ' + createErr.message }, { status: 500 })
		}
		user = newUser
	}

	// 2. Find all roles by name
	const { data: roles } = await supabase
		.from('roles')
		.select('id, name')
		.in('name', rolesToAssign)
		.eq('is_active', true)

	if (!roles || roles.length === 0) {
		return NextResponse.json({ error: `No valid roles found` }, { status: 400 })
	}

	const notFound = rolesToAssign.filter(r => !roles.some(role => role.name === r))
	if (notFound.length > 0) {
		return NextResponse.json({ error: `Roles not found: ${notFound.join(', ')}` }, { status: 400 })
	}

	// 3. Assign all roles (upsert)
	const nowISO = new Date().toISOString()
	const { error: assignErr } = await supabase
		.from('user_roles')
		.upsert(
			roles.map(role => ({
				user_id: user.id,
				role_id: role.id,
				is_active: true,
				assigned_by: assigned_by || null,
				assigned_at: nowISO,
			})),
			{ onConflict: 'user_id,role_id' }
		)

	if (assignErr) {
		console.error('Failed to assign roles:', assignErr)
		await logTransaction({
			action: 'create',
			resource_type: 'user_role',
			resource_id: '/admin/role-management',
			new_values: { email, roles: rolesToAssign },
			status: 'error',
			error_message: assignErr.message,
		})
		return NextResponse.json({ error: 'Failed to assign roles: ' + assignErr.message }, { status: 500 })
	}

	const assignedNames = roles.map(r => r.name).join(', ')

	await logTransaction({
		action: 'create',
		resource_type: 'user_role',
		resource_id: '/admin/role-management',
		new_values: { email, full_name, roles: rolesToAssign, institution_id },
		metadata: { record_id: user.id },
	})

	return NextResponse.json({ success: true, message: `Roles "${assignedNames}" assigned to ${email}` }, { status: 201 })
})
