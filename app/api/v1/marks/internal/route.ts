import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const courseOfferingId = searchParams.get('course_offering_id')

	let query = supabase
		.from('internal_marks')
		.select('*')

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (courseOfferingId) query = query.eq('course_offering_id', courseOfferingId)

	const { data, error } = await query

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch marks' }, { status: 500 })
	}

	return NextResponse.json({ data: data || [], total: data?.length || 0 })
})

export const POST = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })
	}

	if (!body.institutions_id || typeof body.institutions_id !== 'string') {
		return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
	}

	if (ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(body.institutions_id)) {
		return NextResponse.json(
			{ error: 'Forbidden', message: 'Cannot create marks for this institution' },
			{ status: 403 }
		)
	}

	// Only these columns may be set by the caller (never id, audit or approval columns)
	const INSERTABLE_COLUMNS = [
		'institutions_id', 'examination_session_id', 'exam_registration_id', 'course_offering_id',
		'program_id', 'program_code', 'course_id', 'student_id', 'faculty_id',
		'assignment_marks', 'quiz_marks', 'mid_term_marks', 'presentation_marks', 'attendance_marks',
		'lab_marks', 'project_marks', 'seminar_marks', 'viva_marks', 'other_marks',
		'test_1_mark', 'test_2_mark', 'test_3_mark',
		'max_assignment_marks', 'max_quiz_marks', 'max_mid_term_marks', 'max_presentation_marks',
		'max_attendance_marks', 'max_lab_marks', 'max_project_marks', 'max_seminar_marks',
		'max_viva_marks', 'max_other_marks', 'max_test_1_mark', 'max_test_2_mark', 'max_test_3_mark',
		'total_internal_marks', 'max_internal_marks', 'internal_percentage', 'raw_attendance_pct',
		'cia_setting_id', 'cia_round', 'cia_round_name',
		'submission_date', 'submitted_by', 'grade', 'marks_status', 'remarks',
	]
	const insertRow: Record<string, unknown> = {}
	for (const column of INSERTABLE_COLUMNS) {
		if (body[column] !== undefined) insertRow[column] = body[column]
	}
	insertRow.is_active = true

	const { data, error } = await supabase
		.from('internal_marks')
		.insert(insertRow)
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'Marks already exist' }, { status: 400 })
		return NextResponse.json({ error: 'Failed to create marks' }, { status: 500 })
	}

	return NextResponse.json({ data }, { status: 201 })
})
