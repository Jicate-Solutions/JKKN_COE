import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withAdminAuth } from '@/lib/security/admin-guard'

export const GET = withAdminAuth(async (_request, _adminUser) => {
	const supabase = getSupabaseServer()

	const { data, error } = await supabase
		.from('roles')
		.select('id, name, description, is_system_role')
		.eq('is_active', true)
		.order('name')

	if (error) {
		console.error('Failed to fetch roles:', error)
		return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 })
	}

	return NextResponse.json(data || [])
})
