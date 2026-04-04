import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withAdminAuth } from '@/lib/security/admin-guard'
import { sanitizeSearch } from '@/lib/security/escape-like'

export const GET = withAdminAuth(async (request, _adminUser) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const search = sanitizeSearch(searchParams.get('search'))

	let query = supabase
		.from('users')
		.select(`
			id,
			email,
			full_name,
			avatar_url,
			is_active,
			institution_id,
			user_roles(
				id,
				is_active,
				assigned_at,
				roles(id, name, description)
			)
		`)
		.order('full_name')

	if (search) {
		query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
	}

	const { data, error } = await query.range(0, 999)

	if (error) {
		console.error('Failed to fetch users:', error)
		return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
	}

	const users = (data || []).map((u: any) => ({
		...u,
		coe_roles: (u.user_roles || [])
			.filter((ur: any) => ur.is_active && ur.roles?.name)
			.map((ur: any) => ({
				id: ur.id,
				role_id: ur.roles.id,
				role_name: ur.roles.name,
				role_description: ur.roles.description,
				assigned_at: ur.assigned_at,
			})),
	}))

	return NextResponse.json(users)
})
