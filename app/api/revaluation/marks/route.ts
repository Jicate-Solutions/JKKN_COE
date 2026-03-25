import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/marks
// Fetch revaluation marks entries with filters
// BLIND EVALUATION: Does not return original marks
// =====================================================
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters
		const institutionCode = searchParams.get('institution_code')
		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const revaluationRegistrationId = searchParams.get('revaluation_registration_id')
		const examinerAssignmentId = searchParams.get('examiner_assignment_id')
		const entryStatus = searchParams.get('entry_status')

		// Build query
		let query = supabase.from('revaluation_marks').select('*')

		// Institution filter
		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		// Other filters
		if (examinationSessionId) query = query.eq('examination_session_id', examinationSessionId)
		if (revaluationRegistrationId)
			query = query.eq('revaluation_registration_id', revaluationRegistrationId)
		if (examinerAssignmentId) query = query.eq('examiner_assignment_id', examinerAssignmentId)
		if (entryStatus) query = query.eq('entry_status', entryStatus)

		// Order by latest first
		query = query.order('evaluation_date', { ascending: false })

		// Override default row limit
		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('[Revaluation Marks GET] Error:', error)
			return NextResponse.json({ error: 'Failed to fetch marks' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('[Revaluation Marks GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// POST /api/revaluation/marks
// Create revaluation marks entry (blind evaluation)
// =====================================================
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		// Validate required fields
		if (!body.revaluation_registration_id) {
			return NextResponse.json({ error: 'Revaluation registration ID is required' }, { status: 400 })
		}

		if (!body.dummy_number || !body.dummy_number.trim()) {
			return NextResponse.json({ error: 'Dummy number is required' }, { status: 400 })
		}

		if (body.total_marks_obtained === undefined || body.total_marks_obtained === null) {
			return NextResponse.json({ error: 'Total marks obtained is required' }, { status: 400 })
		}

		if (!body.marks_out_of || body.marks_out_of <= 0) {
			return NextResponse.json({ error: 'Valid marks out of is required' }, { status: 400 })
		}

		// Fetch revaluation registration
		const { data: reval, error: revalError } = await supabase
			.from('revaluation_registrations')
			.select(
				`
				id,
				institutions_id,
				institution_code,
				examination_session_id,
				exam_registration_id,
				course_id,
				examiner_assignment_id,
				status,
				student_id
			`
			)
			.eq('id', body.revaluation_registration_id)
			.single()

		if (revalError || !reval) {
			return NextResponse.json({ error: 'Revaluation registration not found' }, { status: 404 })
		}

		// Check status
		if (reval.status !== 'Assigned' && reval.status !== 'In Progress') {
			return NextResponse.json(
				{ error: `Cannot enter marks - status is ${reval.status}` },
				{ status: 400 }
			)
		}

		// Check if examiner_assignment_id exists
		if (!reval.examiner_assignment_id) {
			return NextResponse.json({ error: 'No examiner assigned' }, { status: 400 })
		}

		// Fetch dummy number mapping to verify student
		const { data: dummyMapping } = await supabase
			.from('student_dummy_numbers')
			.select('id, exam_registration_id, student_id')
			.eq('dummy_number', body.dummy_number.trim())
			.eq('examination_session_id', reval.examination_session_id)
			.maybeSingle()

		// Verify dummy number belongs to this student
		if (dummyMapping && dummyMapping.student_id !== reval.student_id) {
			return NextResponse.json(
				{ error: 'Dummy number does not match student for this revaluation' },
				{ status: 400 }
			)
		}

		// Calculate percentage
		const totalMarks = Number(body.total_marks_obtained)
		const marksOutOf = Number(body.marks_out_of)
		const percentage = (totalMarks / marksOutOf) * 100

		// Check for duplicate entry
		const { data: existing } = await supabase
			.from('revaluation_marks')
			.select('id')
			.eq('revaluation_registration_id', body.revaluation_registration_id)
			.maybeSingle()

		if (existing) {
			return NextResponse.json(
				{ error: 'Marks already entered for this revaluation' },
				{ status: 400 }
			)
		}

		// Create marks entry
		const { data, error } = await supabase
			.from('revaluation_marks')
			.insert({
				institutions_id: reval.institutions_id,
				institution_code: reval.institution_code,
				examination_session_id: reval.examination_session_id,
				revaluation_registration_id: reval.id,
				exam_registration_id: reval.exam_registration_id,
				course_id: reval.course_id,
				examiner_assignment_id: reval.examiner_assignment_id,
				student_dummy_number_id: dummyMapping?.id || null,
				dummy_number: body.dummy_number.trim(),
				question_wise_marks: body.question_wise_marks || null,
				total_marks_obtained: totalMarks,
				total_marks_in_words: body.total_marks_in_words?.trim() || '',
				marks_out_of: marksOutOf,
				percentage,
				evaluation_date: body.evaluation_date || new Date().toISOString().split('T')[0],
				evaluation_time_minutes: body.evaluation_time_minutes
					? Number(body.evaluation_time_minutes)
					: null,
				evaluator_remarks: body.evaluator_remarks?.trim() || null,
				entry_status: 'Draft',
				is_active: true,
				created_by: body.created_by_user_id || null,
			})
			.select()
			.single()

		if (error) {
			console.error('[Revaluation Marks POST] Error:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Duplicate marks entry' }, { status: 400 })
			}
			if (error.code === '23503') {
				return NextResponse.json({ error: 'Invalid reference data' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create marks entry' }, { status: 500 })
		}

		// Update revaluation status to In Progress if it was Assigned
		if (reval.status === 'Assigned') {
			await supabase
				.from('revaluation_registrations')
				.update({
					status: 'In Progress',
					updated_at: new Date().toISOString(),
				})
				.eq('id', reval.id)
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('[Revaluation Marks POST] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
