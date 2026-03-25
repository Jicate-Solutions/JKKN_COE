import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Public Examiner Status API
 * Fetch registration details by email (no auth required)
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const email = searchParams.get('email')?.toLowerCase().trim()

		if (!email) {
			return NextResponse.json({ error: 'Email is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { data: examiner, error } = await supabase
			.from('examiners')
			.select(`
				id, full_name, email, mobile, designation, department,
				institution_name, institution_address, institution_code,
				ug_experience_years, pg_experience_years,
				examiner_type, status, status_remarks,
				email_verified, is_enable, created_at
			`)
			.eq('email', email)
			.maybeSingle()

		if (error) {
			console.error('Error fetching examiner status:', error)
			return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 })
		}

		if (!examiner) {
			return NextResponse.json({ exists: false })
		}

		// Fetch board associations
		const { data: boards } = await supabase
			.from('examiner_board_associations')
			.select('board_code, willing_for_valuation, willing_for_practical, willing_for_scrutiny, board:board_id(board_name, board_type)')
			.eq('examiner_id', examiner.id)
			.eq('is_active', true)

		return NextResponse.json({ exists: true, examiner, boards: boards || [] })
	} catch (e) {
		console.error('Examiner status error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
