import { NextResponse } from 'next/server'
import { getSupabaseParent } from '@/lib/supabase-parent'

/**
 * Search users from parent MyJKKN Supabase for role assignment
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const search = searchParams.get('search')

	if (!search || search.length < 2) {
		return NextResponse.json({ error: 'Search query must be at least 2 characters' }, { status: 400 })
	}

	try {
		const parentSupabase = getSupabaseParent()

		const { data, error } = await parentSupabase
			.from('users')
			.select('id, parent_user_id, email, full_name, role, avatar_url, institution_id, is_active, phone_number, designation, gender')
			.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
			.eq('is_active', true)
			.order('full_name')
			.limit(20)

		if (error) {
			return NextResponse.json({ error: 'Failed to search users' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (err) {
		console.error('MyJKKN user search error:', err)
		return NextResponse.json({ error: 'Failed to connect to MyJKKN' }, { status: 500 })
	}
}
