import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Public Examiner Status API
 * Fetch registration details by email (no auth required)
 */

// Exactly what the two registration screens display. This route is anonymous,
// so it must never return the whole row: `examiners` also holds bank account
// details, the signature path, postal address and internal notes.
const PUBLIC_COLUMNS = [
	'id', 'full_name', 'email', 'mobile', 'designation', 'department',
	'institution_name', 'institution_address', 'ug_experience_years', 'pg_experience_years',
	'status', 'status_remarks', 'is_enable', 'form_type', 'salutation', 'gender',
	'highest_qualification', 'aicte_faculty_code', 'personal_email', 'official_email',
	'institution_coe_contact', 'institution_coe_email', 'teaching_exp_years',
	'industry_exp_years', 'total_exp_years', 'area_of_expertise', 'willingness_roles',
	'additional_data',
].join(', ')
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
			.select(PUBLIC_COLUMNS)
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
			.eq('examiner_id', (examiner as unknown as { id: string }).id)
			.eq('is_active', true)

		return NextResponse.json({ exists: true, examiner, boards: boards || [] })
	} catch (e) {
		console.error('Examiner status error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
