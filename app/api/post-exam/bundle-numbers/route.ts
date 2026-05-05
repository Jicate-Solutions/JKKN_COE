import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/post-exam/bundle-numbers
 * Fetch bundle numbers (with institution / session / course / board details)
 *
 * Query params:
 *   - institution_code: filter by institution
 *   - exam_session: filter by session_code
 *   - course_code: optional filter
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionCode = searchParams.get('institution_code')
		const examSession = searchParams.get('exam_session')
		const courseCode = searchParams.get('course_code')

		// ── Lookup-by-IDs mode (returns single { bundle_number }) ──
		// Used by foil-sheet PDF generator to fetch the bundle number
		// for a specific (institution, session, course) combination.
		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const courseId = searchParams.get('course_id')
		if (institutionsId && examinationSessionId && courseId) {
			const { data, error } = await supabase
				.from('bundle_numbers')
				.select('bundle_number')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', examinationSessionId)
				.eq('course_id', courseId)
				.eq('is_active', true)
				.maybeSingle()

			if (error) {
				console.error('Error looking up bundle number by IDs:', error)
				return NextResponse.json({ error: 'Failed to fetch bundle number' }, { status: 500 })
			}

			return NextResponse.json({ bundle_number: data?.bundle_number ?? null })
		}

		let query = supabase
			.from('bundle_numbers_detail_view')
			.select('*')
			.order('board_order', { ascending: true, nullsFirst: false })
			.order('bundle_number', { ascending: true })
			.range(0, 49999)

		if (institutionCode) query = query.eq('institution_code', institutionCode)
		if (examSession) query = query.eq('session_code', examSession)
		if (courseCode) query = query.eq('course_code', courseCode)

		const { data, error } = await query

		if (error) {
			console.error('Error fetching bundle numbers:', error)
			return NextResponse.json({ error: 'Failed to fetch bundle numbers' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('Error in GET /api/post-exam/bundle-numbers:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
