import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/post-exam/central-valuation/examiner-search
 *
 * Returns examiners from the `examiners` table for the dropdown on the
 * Central Valuation Examiner Allotment page. No status/institution/board
 * filters — pen to all examiners; only `search` narrows results.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const search = searchParams.get('search')?.trim() || ''

	const supabase = getSupabaseServer()

	let query = supabase
		.from('examiners')
		.select('id, full_name, email, mobile, designation, department, institution_name')
		.limit(50)
		.order('full_name')

	if (search) {
		query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
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
