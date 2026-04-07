import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withAdminAuth } from '@/lib/security/admin-guard'
import { logTransaction } from '@/lib/logging/server-transaction-log'

export const POST = withAdminAuth(async (request, _adminUser) => {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const { user_id, role_name } = body

	if (!user_id || !role_name) {
		return NextResponse.json({ error: 'user_id and role_name are required' }, { status: 400 })
	}

	const { data: role } = await supabase
		.from('roles')
		.select('id')
		.eq('name', role_name)
		.single()

	if (!role) {
		return NextResponse.json({ error: `Role "${role_name}" not found` }, { status: 400 })
	}

	const { error } = await supabase
		.from('user_roles')
		.update({ is_active: false, updated_at: new Date().toISOString() })
		.eq('user_id', user_id)
		.eq('role_id', role.id)

	if (error) {
		console.error('Failed to revoke role:', error)
		await logTransaction({
			action: 'update',
			resource_type: 'user_role',
			resource_id: '/admin/role-management',
			old_values: { role_name, is_active: true },
			new_values: { role_name, is_active: false },
			status: 'error',
			error_message: error.message,
		})
		return NextResponse.json({ error: 'Failed to revoke role' }, { status: 500 })
	}

	await logTransaction({
		action: 'update',
		resource_type: 'user_role',
		resource_id: '/admin/role-management',
		old_values: { role_name, is_active: true },
		new_values: { role_name, is_active: false },
		metadata: { record_id: user_id },
	})

	return NextResponse.json({ success: true, message: `Role "${role_name}" revoked` })
})
