import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const search = searchParams.get('search')
	const institutionsId = searchParams.get('institutions_id')

	const supabase = getSupabaseServer()
	let query = supabase
		.from('examiners')
		.select('id, full_name, email, mobile, designation, department, institution_name')
		.limit(50)
		.order('full_name')

	if (institutionsId) {
		query = query.eq('institutions_id', institutionsId)
	}
	if (search) {
		query = query.ilike('full_name', `%${search}%`)
	}

	const { data, error } = await query
	if (error) {
		console.error('examiner-search error:', error)
		return NextResponse.json({ error: 'Failed to search examiners' }, { status: 500 })
	}

	const rows = (data || []).map(e => ({
		examiner_id: e.id,
		full_name: e.full_name,
		email: e.email,
		mobile: e.mobile,
		designation: e.designation,
		department: e.department,
		institution_name: e.institution_name,
	}))

	return NextResponse.json(rows)
}
