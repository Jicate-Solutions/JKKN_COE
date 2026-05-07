import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import { mapCourseToResponse } from '@/lib/api-helpers/course-mapper'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const format = (searchParams.get('format') || 'mapped') as 'mapped' | 'raw'
		const institutionCode = searchParams.get('institution_code')
		const programCode = searchParams.get('program_code')
		const regulationCode = searchParams.get('regulation_code')
		const courseCode = searchParams.get('course_code')
		const search = searchParams.get('search')
		const isActive = searchParams.get('is_active')

		let query = supabase
			.from('courses')
			.select(`
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
				has_hall_ticket
			`, { count: 'exact' })
			.order('created_at', { ascending: false })
			.range(0, 9999)

		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		}
		if (programCode) {
			query = query.eq('offering_department_code', programCode)
		}
		if (regulationCode) {
			query = query.eq('regulation_code', regulationCode)
		}
		if (courseCode) {
			query = query.eq('course_code', courseCode)
		}
		if (search) {
			query = query.or(`course_code.ilike.%${search}%,course_name.ilike.%${search}%`)
		}
		if (isActive !== null) {
			query = query.eq('status', isActive === 'true')
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching courses:', error)
			return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
		}

		const mapped = (data || []).map((course: any) => mapCourseToResponse(course, format))
		return NextResponse.json({ data: mapped })
	} catch (error) {
		console.error('Courses GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})

export const POST = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		if (!body.institution_code || !body.regulation_code || !body.course_code || !body.course_title) {
			return NextResponse.json({
				error: 'Missing required fields: institution_code, regulation_code, course_code, course_title'
			}, { status: 400 })
		}

		// Resolve institution_id from institution_code
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', body.institution_code)
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json({
				error: `Institution with code "${body.institution_code}" not found`
			}, { status: 400 })
		}

		// Check institution access
		if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			if (!context.allowedInstitutionIds.includes(institutionData.id)) {
				return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
			}
		}

		// Try to resolve regulation_id
		let regulationId = null
		const { data: regulationData } = await supabase
			.from('regulations')
			.select('id')
			.eq('regulation_code', body.regulation_code)
			.single()

		if (regulationData) {
			regulationId = regulationData.id
		}

		// Try to resolve offering_department_id
		let offeringDepartmentId = null
		if (body.offering_department_code) {
			const { data: deptData } = await supabase
				.from('departments')
				.select('id')
				.eq('department_code', body.offering_department_code)
				.single()

			if (deptData) {
				offeringDepartmentId = deptData.id
			}
		}

		// Try to resolve board_id
		let boardId = null
		if (body.board_code) {
			const { data: boardData } = await supabase
				.from('board')
				.select('id')
				.eq('board_code', body.board_code)
				.eq('institution_code', body.institution_code)
				.maybeSingle()

			if (boardData) {
				boardId = boardData.id
			}
		}

		const { data, error } = await supabase.from('courses').insert({
			institutions_id: institutionData.id,
			regulation_id: regulationId,
			offering_department_id: offeringDepartmentId,
			board_id: boardId,
			institution_code: body.institution_code,
			regulation_code: body.regulation_code,
			offering_department_code: body.offering_department_code || null,
			board_code: body.board_code || null,
			course_code: body.course_code,
			course_name: body.course_title,
			display_code: body.display_code || null,
			course_category: body.course_category || null,
			course_type: body.course_type || null,
			course_part_master: body.course_part_master || null,
			credit: body.credits !== undefined ? Number(body.credits) : 0,
			split_credit: body.split_credit ?? false,
			theory_credit: body.theory_credit || null,
			practical_credit: body.practical_credit || null,
			qp_code: body.qp_code || null,
			e_code_name: body.e_code_name || null,
			exam_duration: body.exam_duration || null,
			evaluation_type: body.evaluation_type || null,
			result_type: body.result_type || 'Mark',
			self_study_course: body.self_study_course ?? false,
			outside_class_course: body.outside_class_course ?? false,
			open_book: body.open_book ?? false,
			online_course: body.online_course ?? false,
			dummy_number_not_required: !body.dummy_number_required,
			annual_course: body.annual_course ?? false,
			multiple_qp_set: body.multiple_qp_set ?? false,
			no_of_qp_setter: body.no_of_qp_setter || null,
			no_of_scrutinizer: body.no_of_scrutinizer || null,
			fee_exception: body.fee_exception ?? false,
			syllabus_pdf_url: body.syllabus_pdf_url || null,
			description: body.description || null,
			status: body.is_active !== undefined ? Boolean(body.is_active) : true,
			class_hours: body.class_hours || 0,
			theory_hours: body.theory_hours || 0,
			practical_hours: body.practical_hours || 0,
			internal_max_mark: body.internal_max_mark || 0,
			internal_pass_mark: body.internal_pass_mark || 0,
			internal_converted_mark: body.internal_converted_mark || 0,
			external_max_mark: body.external_max_mark || 0,
			external_pass_mark: body.external_pass_mark || 0,
			external_converted_mark: body.external_converted_mark || 0,
			total_pass_mark: body.total_pass_mark || 0,
			total_max_mark: body.total_max_mark || 0,
			annual_semester: body.annual_semester ?? false,
			registration_based: body.registration_based ?? false,
			credit_included: body.credit_included !== false,
			has_hall_ticket: body.has_hall_ticket !== false,
		}).select('*').single()

		if (error) {
			console.error('Error creating course:', error)
			let errorMsg = error.message
			if (error.code === '23503') errorMsg = 'Foreign key constraint failed'
			if (error.code === '23505') errorMsg = 'Course already exists'
			if (error.code === '23514') errorMsg = 'Invalid value'

			return NextResponse.json({ error: errorMsg }, { status: 400 })
		}

		return NextResponse.json({ data: mapCourseToResponse(data, 'mapped') }, { status: 201 })
	} catch (error) {
		console.error('Courses POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
