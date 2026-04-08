import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

// Number to words
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
	'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function numberToWords(n: number): string {
	if (n === 0) return 'Zero'
	if (n < 20) return ones[n]
	if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
	if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + numberToWords(n % 100) : '')
	return String(n)
}

/**
 * GET /api/v1/cia-marks/report
 *
 * Returns CIA marks report data with dummy numbers for a specific course + round.
 *
 * Permission required: cia-report:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Query params:
 *   - institutions_id (required)
 *   - examination_session_id (required)
 *   - course_code (required)
 *   - cia_round (required): 1, 2, 3 etc.
 *   - program_code (optional)
 */
export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const courseCode = searchParams.get('course_code')
		const ciaRound = searchParams.get('cia_round')
		const programCode = searchParams.get('program_code')

		if (!institutionsId || !sessionId || !courseCode || !ciaRound) {
			return NextResponse.json({ error: 'institutions_id, examination_session_id, course_code, and cia_round are required' }, { status: 400 })
		}

		// Verify institution access
		if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			if (!context.allowedInstitutionIds.includes(institutionsId)) {
				return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
			}
		}

		// Fetch registrations
		let regQuery = supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, student_name, course_offering_id')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('course_code', courseCode)
			.eq('is_regular', true)
			.order('stu_register_no')

		if (programCode) regQuery = regQuery.eq('program_code', programCode)

		const { data: registrations, error: regError } = await regQuery.range(0, 9999)
		if (regError) return NextResponse.json({ error: 'Failed to fetch learners' }, { status: 500 })
		if (!registrations || registrations.length === 0) {
			return NextResponse.json({ course: { course_code: courseCode }, learners: [], summary: { total_learners: 0, marks_entered: 0, pending: 0 } })
		}

		// Fetch course info
		const { data: courseData } = await supabase
			.from('courses')
			.select('course_code, course_name, internal_max_mark')
			.eq('institutions_id', institutionsId)
			.eq('course_code', courseCode)
			.limit(1)
			.single()

		// Fetch marks
		const allCOIds = [...new Set(registrations.map(r => r.course_offering_id))]
		const { data: marks } = await supabase
			.from('cia_marks')
			.select('*')
			.in('course_offering_id', allCOIds)
			.eq('examination_session_id', sessionId)
			.eq('cia_round', Number(ciaRound))
			.eq('is_active', true)

		const marksMap = new Map<string, any>()
		for (const m of (marks || [])) marksMap.set(m.student_id, m)

		// Fetch dummy numbers
		const regIds = registrations.map(r => r.id)
		const { data: dummyNumbers } = await supabase
			.from('student_dummy_numbers')
			.select('exam_registration_id, dummy_number')
			.in('exam_registration_id', regIds)
			.eq('examination_session_id', sessionId)
			.eq('is_active', true)

		const dummyMap = new Map<string, string>()
		for (const d of (dummyNumbers || [])) dummyMap.set(d.exam_registration_id, d.dummy_number)

		// Mark field mapping
		const markFields: Record<string, string> = {
			assignment: 'assignment_marks', quiz: 'quiz_marks', mid_term: 'mid_term_marks',
			presentation: 'presentation_marks', attendance: 'attendance_marks', lab: 'lab_marks',
			project: 'project_marks', seminar: 'seminar_marks', viva: 'viva_marks',
			test_1: 'test_1_mark', test_2: 'test_2_mark', test_3: 'test_3_mark', other: 'other_marks',
		}

		// Build response
		let marksEntered = 0
		const learners = registrations.map(r => {
			const savedMarks = marksMap.get(r.student_id)
			const marksObj: Record<string, number> = {}
			let total = 0

			if (savedMarks) {
				for (const [code, field] of Object.entries(markFields)) {
					const val = savedMarks[field]
					if (val != null && val > 0) { marksObj[code] = val; total += val }
				}
				if (total > 0) marksEntered++
			}

			return {
				register_number: r.stu_register_no,
				student_name: r.student_name,
				dummy_number: dummyMap.get(r.id) || null,
				marks: marksObj,
				total,
				marks_in_words: total > 0 ? numberToWords(total) : null,
			}
		})

		return NextResponse.json({
			course: {
				course_code: courseData?.course_code || courseCode,
				course_name: courseData?.course_name || courseCode,
				internal_max_mark: courseData?.internal_max_mark || 0,
			},
			learners,
			summary: {
				total_learners: registrations.length,
				marks_entered: marksEntered,
				pending: registrations.length - marksEntered,
			},
		})
	} catch (error) {
		console.error('CIA report API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
