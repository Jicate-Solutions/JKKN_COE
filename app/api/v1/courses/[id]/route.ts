import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import { mapCourseToResponse } from '@/lib/api-helpers/course-mapper'
import type { ExternalApiContext } from '@/types/api-management'

const COURSE_SELECT = `
	id,
	institutions_id,
	regulation_id,
	offering_department_id,
	institution_code,
	regulation_code,
	offering_department_code,
	board_code,
	course_code,
	course_name,
	display_code,
	course_category,
	course_type,
	course_level,
	course_type_code,
	course_part_master,
	credit,
	split_credit,
	theory_credit,
	practical_credit,
	qp_code,
	e_code_name,
	exam_duration,
	evaluation_type,
	result_type,
	self_study_course,
	outside_class_course,
	open_book,
	online_course,
	dummy_number_not_required,
	annual_course,
	multiple_qp_set,
	no_of_qp_setter,
	no_of_scrutinizer,
	fee_exception,
	syllabus_pdf_url,
	description,
	status,
	created_at,
	updated_at,
	class_hours,
	theory_hours,
	tutorial_hours,
	practical_hours,
	internal_max_mark,
	internal_pass_mark,
	internal_converted_mark,
	external_max_mark,
	external_pass_mark,
	external_converted_mark,
	total_pass_mark,
	total_max_mark,
	annual_semester,
	registration_based,
	credit_included,
	has_hall_ticket,
	courses_status
`

function checkInstitutionAccess(context: ExternalApiContext, institutionsId: string | null): boolean {
	if (!context.allowedInstitutionIds || context.allowedInstitutionIds.length === 0) return true
	if (!institutionsId) return false
	return context.allowedInstitutionIds.includes(institutionsId)
}

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams, pathname } = new URL(request.url)
		const id = pathname.split('/').filter(Boolean).pop()
		const format = (searchParams.get('format') || 'mapped') as 'mapped' | 'raw'

		if (!id) {
			return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('courses')
			.select(COURSE_SELECT)
			.eq('id', id)
			.single()

		if (error || !data) {
			return NextResponse.json({ error: 'Course not found' }, { status: 404 })
		}

		if (!checkInstitutionAccess(context, data.institutions_id)) {
			return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
		}

		return NextResponse.json({ data: mapCourseToResponse(data, format) })
	} catch (error) {
		console.error('Course GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

export const PUT = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { pathname } = new URL(request.url)
		const id = pathname.split('/').filter(Boolean).pop()
		const body = await request.json()

		if (!id) {
			return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
		}

		// Fetch existing course to verify access
		const { data: existing, error: existingError } = await supabase
			.from('courses')
			.select('id, institutions_id, institution_code')
			.eq('id', id)
			.single()

		if (existingError || !existing) {
			return NextResponse.json({ error: 'Course not found' }, { status: 404 })
		}

		if (!checkInstitutionAccess(context, existing.institutions_id)) {
			return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
		}

		// Build update payload (only fields provided in body)
		const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

		const fieldMap: Record<string, string> = {
			course_code: 'course_code',
			course_title: 'course_name',
			display_code: 'display_code',
			course_category: 'course_category',
			course_type: 'course_type',
			course_level: 'course_level',
			course_part_master: 'course_part_master',
			credits: 'credit',
			split_credit: 'split_credit',
			theory_credit: 'theory_credit',
			practical_credit: 'practical_credit',
			qp_code: 'qp_code',
			e_code_name: 'e_code_name',
			exam_duration: 'exam_duration',
			evaluation_type: 'evaluation_type',
			result_type: 'result_type',
			self_study_course: 'self_study_course',
			outside_class_course: 'outside_class_course',
			open_book: 'open_book',
			online_course: 'online_course',
			annual_course: 'annual_course',
			multiple_qp_set: 'multiple_qp_set',
			no_of_qp_setter: 'no_of_qp_setter',
			no_of_scrutinizer: 'no_of_scrutinizer',
			fee_exception: 'fee_exception',
			syllabus_pdf_url: 'syllabus_pdf_url',
			description: 'description',
			class_hours: 'class_hours',
			theory_hours: 'theory_hours',
			tutorial_hours: 'tutorial_hours',
			practical_hours: 'practical_hours',
			internal_max_mark: 'internal_max_mark',
			internal_pass_mark: 'internal_pass_mark',
			internal_converted_mark: 'internal_converted_mark',
			external_max_mark: 'external_max_mark',
			external_pass_mark: 'external_pass_mark',
			external_converted_mark: 'external_converted_mark',
			total_pass_mark: 'total_pass_mark',
			total_max_mark: 'total_max_mark',
			annual_semester: 'annual_semester',
			registration_based: 'registration_based',
			credit_included: 'credit_included',
			has_hall_ticket: 'has_hall_ticket',
			courses_status: 'courses_status',
		}

		for (const [apiField, dbField] of Object.entries(fieldMap)) {
			if (body[apiField] !== undefined) updateData[dbField] = body[apiField]
		}

		// Special handling for inverted boolean
		if (body.dummy_number_required !== undefined) {
			updateData.dummy_number_not_required = !body.dummy_number_required
		}
		// is_active → status
		if (body.is_active !== undefined) {
			updateData.status = Boolean(body.is_active)
		}

		// Never allow changing institution_code/institutions_id
		delete updateData.institutions_id
		delete updateData.institution_code

		const { data, error } = await supabase
			.from('courses')
			.update(updateData)
			.eq('id', id)
			.select(COURSE_SELECT)
			.single()

		if (error) {
			console.error('Error updating course:', error)
			let errorMsg = error.message
			if (error.code === '23503') errorMsg = 'Foreign key constraint failed'
			if (error.code === '23505') errorMsg = 'Duplicate value'
			if (error.code === '23514') errorMsg = 'Invalid value'
			return NextResponse.json({ error: errorMsg }, { status: 400 })
		}

		return NextResponse.json({ data: mapCourseToResponse(data, 'mapped') })
	} catch (error) {
		console.error('Course PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { pathname, searchParams } = new URL(request.url)
		const id = pathname.split('/').filter(Boolean).pop()
		const checkOnly = searchParams.get('check') === 'true'

		if (!id) {
			return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
		}

		// Verify the course exists and check institution access
		const { data: existing, error: existingError } = await supabase
			.from('courses')
			.select('id, institutions_id, course_code')
			.eq('id', id)
			.single()

		if (existingError || !existing) {
			return NextResponse.json({ error: 'Course not found' }, { status: 404 })
		}

		if (!checkInstitutionAccess(context, existing.institutions_id)) {
			return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
		}

		// Check dependencies
		const dependencyTables = [
			'course_mapping',
			'internal_marks',
			'final_marks',
			'marks_entry',
			'exam_registrations',
			'examiner_assignments',
		]

		const dependencyChecks = await Promise.all(
			dependencyTables.map(async (table) => {
				const { count, error } = await supabase
					.from(table)
					.select('*', { count: 'exact', head: true })
					.eq('course_id', id)
				return { table, count: count || 0, hasError: !!error }
			})
		)

		const dependencies = dependencyChecks.filter(d => d.count > 0 && !d.hasError)

		if (checkOnly) {
			return NextResponse.json({
				can_delete: dependencies.length === 0,
				dependencies: dependencies.map(d => ({ table: d.table, count: d.count })),
			})
		}

		if (dependencies.length > 0) {
			return NextResponse.json({
				error: 'Cannot delete course: it has dependent records',
				dependencies: dependencies.map(d => ({ table: d.table, count: d.count })),
			}, { status: 409 })
		}

		const { error: deleteError } = await supabase
			.from('courses')
			.delete()
			.eq('id', id)

		if (deleteError) {
			console.error('Error deleting course:', deleteError)
			return NextResponse.json({ error: deleteError.message }, { status: 400 })
		}

		return NextResponse.json({ data: { id, deleted: true } })
	} catch (error) {
		console.error('Course DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
