import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withAdminAuth } from '@/lib/security/admin-guard'
import { logTransaction, fetchOldValues } from '@/lib/logging/server-transaction-log'

/**
 * Remove a user from COE entirely — deletes all role assignments and the user record.
 * Restricted to super_admin only.
 */
export const POST = withAdminAuth(async (request, _adminUser) => {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const { user_id } = body

	if (!user_id) {
		return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
	}

	// Fetch old values BEFORE deletion for audit trail
	const oldUser = await fetchOldValues('users', user_id)

	// 1. Delete all role assignments
	await supabase
		.from('user_roles')
		.delete()
		.eq('user_id', user_id)

	// 2. Delete user from COE users table
	const { error } = await supabase
		.from('users')
		.delete()
		.eq('id', user_id)

	if (error) {
		await logTransaction({
			action: 'delete',
			resource_type: 'user',
			resource_id: '/admin/role-management',
			old_values: oldUser,
			status: 'error',
			error_message: error.code === '23503'
				? 'Cannot remove — user has related records in other tables'
				: error.message,
		})
		if (error.code === '23503') {
			return NextResponse.json({ error: 'Cannot remove — user has related records in other tables' }, { status: 400 })
		}
		return NextResponse.json({ error: 'Failed to remove user' }, { status: 500 })
	}

	await logTransaction({
		action: 'delete',
		resource_type: 'user',
		resource_id: '/admin/role-management',
		old_values: oldUser,
		metadata: { record_id: user_id },
	})

	return NextResponse.json({ success: true, message: 'User removed from COE' })
}, { requiredRoles: ['super_admin'] })
