import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	ReportTabKey,
	CourseOfferReportRow,
	CourseOfferReportSummary,
	ExamRegistrationReportRow,
	ExamRegistrationReportSummary,
	FeePaidReportRow,
	FeePaidReportSummary,
	InternalMarksReportRow,
	InternalMarksReportSummary,
	ExternalMarksReportRow,
	ExternalMarksReportSummary,
	FinalResultReportRow,
	FinalResultReportSummary,
	SemesterResultReportRow,
	SemesterResultReportSummary,
	ArrearReportRow,
	ArrearReportSummary,
	MissingDataReportRow,
	MissingDataReportSummary
} from '@/types/comprehensive-reports'

export async function GET(request: NextRequest) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const action = searchParams.get('action') || 'dropdowns'
	const reportType = searchParams.get('report_type') as ReportTabKey | null
	const institutionId = searchParams.get('institution_id')
	const sessionId = searchParams.get('session_id')
	const programId = searchParams.get('program_id')
	const programCode = searchParams.get('program_code') // Used when programs come from MyJKKN API
	const semesterParam = searchParams.get('semester')
	// Handle "all" value for semester (means no filter)
	// Also validate that it's a valid number
	let semester: string | null = null
	if (semesterParam && semesterParam !== 'all') {
		const parsed = parseInt(semesterParam)
		if (!isNaN(parsed)) {
			semester = semesterParam
		}
	}
	const courseId = searchParams.get('course_id')
	const page = parseInt(searchParams.get('page') || '1')
	const limit = parseInt(searchParams.get('limit') || '1000')

	try {
		// Dropdown data actions
		if (action === 'institutions') {
			const { data, error } = await supabase
				.from('institutions')
				.select('id, institution_code, name, myjkkn_institution_ids')
				.eq('is_active', true)
				.order('institution_code')

			if (error) throw error
			return NextResponse.json(data || [])
		}

		if (action === 'sessions') {
			if (!institutionId) {
				return NextResponse.json({ error: 'institution_id required' }, { status: 400 })
			}

			// Note: examination_sessions table does NOT have is_active column
			const { data, error } = await supabase
				.from('examination_sessions')
				.select('id, session_code, session_name, institutions_id')
				.eq('institutions_id', institutionId)
				.order('session_code', { ascending: false })

			if (error) throw error
			return NextResponse.json(data || [])
		}

		if (action === 'programs') {
			// DEPRECATED: Programs should be fetched from MyJKKN API
			// The local 'programs' table no longer exists
			// Frontend should use useMyJKKNInstitutionFilter hook instead
			console.warn('[comprehensive API] DEPRECATED: programs action called. Programs should be fetched from MyJKKN API.')
			return NextResponse.json([])
		}

		if (action === 'courses') {
			if (!institutionId || !sessionId) {
				return NextResponse.json({ error: 'institution_id and session_id required' }, { status: 400 })
			}

			// Step 1: Get course_offering IDs that match filters
			// Note: course_offerings.course_id references course_mapping.id (NOT courses.id directly)
			let offeringsQuery = supabase
				.from('course_offerings')
				.select('course_id, program_code, semester')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)

			// Filter by program_code (from MyJKKN API)
			if (programCode) {
				offeringsQuery = offeringsQuery.eq('program_code', programCode)
			}

			// Filter by semester if provided
			if (semester) {
				offeringsQuery = offeringsQuery.eq('semester', parseInt(semester))
			}

			const { data: offerings, error: offeringsError } = await offeringsQuery

			if (offeringsError) {
				console.error('[Comprehensive Reports] Course offerings query error:', offeringsError)
				throw offeringsError
			}

			console.log('[Comprehensive Reports] Found', offerings?.length || 0, 'course offerings')

			if (!offerings || offerings.length === 0) {
				return NextResponse.json([])
			}

			// Step 2: Get unique course_mapping IDs (stored in course_id column)
			const courseMappingIds = [...new Set(offerings.map(o => o.course_id).filter(Boolean))]

			if (courseMappingIds.length === 0) {
				return NextResponse.json([])
			}

			// Step 3: Fetch course_mapping with course details
			const { data: mappings, error: mappingsError } = await supabase
				.from('course_mapping')
				.select(`
					id,
					course_id,
					course_code,
					course_order,
					courses:course_id (
						id,
						course_code,
						course_name,
						credit
					)
				`)
				.in('id', courseMappingIds)

			if (mappingsError) {
				console.error('[Comprehensive Reports] Course mapping query error:', mappingsError)
				throw mappingsError
			}

			console.log('[Comprehensive Reports] Found', mappings?.length || 0, 'course mappings')

			// Deduplicate and format - extract course info from nested structure
			const courseMap = new Map()
			for (const mapping of mappings || []) {
				const course = mapping.courses as any
				if (course && !courseMap.has(course.id)) {
					courseMap.set(course.id, {
						id: course.id,
						course_code: course.course_code || mapping.course_code,
						course_title: course.course_name, // DB uses course_name, API returns course_title
						course_order: mapping.course_order || 999,
						credits: course.credit // DB uses credit (singular)
					})
				}
			}

			const courses = Array.from(courseMap.values()).sort((a, b) => (a.course_order || 0) - (b.course_order || 0))
			return NextResponse.json(courses)
		}

		// Report data actions
		if (action === 'report' && reportType) {
			if (!institutionId || !sessionId) {
				return NextResponse.json({ error: 'institution_id and session_id required' }, { status: 400 })
			}

			console.log('[Comprehensive Reports] Fetching report:', {
				reportType, institutionId, sessionId, programId, programCode, semester, courseId
			})

			try {
				switch (reportType) {
					case 'course-offer':
						return await getCourseOfferReport(supabase, institutionId, sessionId, programCode, semester ? parseInt(semester) : null, page, limit)

					case 'exam-registration':
						return await getExamRegistrationReport(supabase, institutionId, sessionId, programCode, semester ? parseInt(semester) : null, courseId, page, limit)

					case 'fee-paid':
						return await getFeePaidReport(supabase, institutionId, sessionId, programCode, semester ? parseInt(semester) : null, courseId, page, limit)

					case 'internal-marks':
						return await getInternalMarksReport(supabase, institutionId, sessionId, programCode, semester ? parseInt(semester) : null, courseId, page, limit)

					case 'external-marks':
						return await getExternalMarksReport(supabase, institutionId, sessionId, programCode, semester ? parseInt(semester) : null, courseId, page, limit)

					case 'final-result':
						return await getFinalResultReport(supabase, institutionId, sessionId, programCode, semester ? parseInt(semester) : null, courseId, page, limit)

					case 'semester-result':
						return await getSemesterResultReport(supabase, institutionId, sessionId, programCode, semester ? parseInt(semester) : null, page, limit)

					case 'arrear-report':
						return await getArrearReport(supabase, institutionId, sessionId, programCode, semester ? parseInt(semester) : null, courseId, page, limit)

					case 'missing-data':
						return await getMissingDataReport(supabase, institutionId, sessionId, programCode, semester ? parseInt(semester) : null, courseId, page, limit)

					default:
						return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
				}
			} catch (reportError) {
				console.error('[Comprehensive Reports] Report fetch error:', reportError)
				return NextResponse.json(
					{ error: reportError instanceof Error ? reportError.message : 'Failed to fetch report' },
					{ status: 500 }
				)
			}
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

	} catch (error) {
		console.error('[Comprehensive Reports API] Error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		)
	}
}

// =====================================================
// COURSE OFFERING REPORT
// =====================================================

async function getCourseOfferReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	sessionId: string,
	programCode: string | null,
	semester: number | null,
	page: number,
	limit: number
) {
	// course_offerings.course_id -> course_mapping.id -> course_mapping.course_id -> courses
	// faculty_id -> faculty_coe
	let query = supabase
		.from('course_offerings')
		.select(`
			id,
			semester,
			enrolled_count,
			is_active,
			program_code,
			course_mapping:course_id (
				course_code,
				course_order,
				courses:course_id (
					course_name,
					course_category,
					credit
				)
			),
			faculty_coe:faculty_id (
				faculty_name
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('examination_session_id', sessionId)

	// Filter by program_code instead of program_id (programs are from MyJKKN API)
	if (programCode) query = query.eq('program_code', programCode)
	if (semester) query = query.eq('semester', semester)

	const { data, error } = await query

	if (error) throw error

	// Transform and sort data
	// Note: program_code is stored directly in course_offerings (programs from MyJKKN API)
	// Relationship chain: course_offerings.course_id -> course_mapping -> courses
	const rows: CourseOfferReportRow[] = (data || []).map((item: any) => ({
		program_code: item.program_code || '',
		program_name: item.program_code || '', // program_name not available without MyJKKN lookup
		program_order: 999, // Default order since not in local table
		semester: item.semester,
		semester_order: item.semester,
		course_code: item.course_mapping?.course_code || '',
		course_title: item.course_mapping?.courses?.course_name || '', // DB uses course_name
		course_order: item.course_mapping?.course_order || 999,
		course_category: item.course_mapping?.courses?.course_category || '',
		credits: item.course_mapping?.courses?.credit || 0, // DB uses credit (singular)
		enrolled_count: item.enrolled_count || 0,
		faculty_name: item.faculty_coe?.faculty_name || '',
		is_active: item.is_active
	}))

	// Sort by program_order, semester, course_order
	rows.sort((a, b) => {
		if (a.program_order !== b.program_order) return a.program_order - b.program_order
		if (a.semester !== b.semester) return a.semester - b.semester
		return a.course_order - b.course_order
	})

	// Calculate summary
	const summary: CourseOfferReportSummary = {
		total_courses: rows.length,
		total_programs: new Set(rows.map(r => r.program_code)).size,
		total_enrolled: rows.reduce((sum, r) => sum + r.enrolled_count, 0),
		by_program: {},
		by_semester: {}
	}

	for (const row of rows) {
		summary.by_program[row.program_code] = (summary.by_program[row.program_code] || 0) + 1
		summary.by_semester[row.semester] = (summary.by_semester[row.semester] || 0) + 1
	}

	// Paginate
	const startIdx = (page - 1) * limit
	const paginatedRows = rows.slice(startIdx, startIdx + limit)

	return NextResponse.json({
		success: true,
		data: paginatedRows,
		summary,
		pagination: { page, limit, total: rows.length },
		generated_at: new Date().toISOString()
	})
}

// =====================================================
// EXAM REGISTRATION REPORT
// =====================================================

async function getExamRegistrationReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	sessionId: string,
	programCode: string | null,
	semester: number | null,
	courseId: string | null,
	page: number,
	limit: number
) {
	let query = supabase
		.from('exam_registrations')
		.select(`
			id,
			stu_register_no,
			student_name,
			registration_date,
			registration_status,
			is_regular,
			attempt_number,
			fee_paid,
			program_code,
			course_offerings:course_offering_id (
				semester,
				program_code,
				courses:course_id (
					id,
					course_code,
					course_name,
					course_order
				)
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('examination_session_id', sessionId)

	// Server-side filters to reduce data transfer
	if (programCode) query = query.eq('program_code', programCode)

	const { data, error } = await query

	if (error) throw error

	// Transform data - using program_code directly (programs from MyJKKN API)
	let rows: ExamRegistrationReportRow[] = (data || []).map((item: any) => ({
		register_number: item.stu_register_no || '',
		learner_name: item.student_name || '',
		program_code: item.program_code || item.course_offerings?.program_code || '',
		program_name: item.program_code || item.course_offerings?.program_code || '',
		program_order: 999,
		semester: item.course_offerings?.semester || 0,
		semester_order: item.course_offerings?.semester || 0,
		course_code: item.course_offerings?.courses?.course_code || '',
		course_title: item.course_offerings?.courses?.course_name || '', // DB uses course_name
		course_order: item.course_offerings?.courses?.course_order || 999,
		registration_date: item.registration_date,
		registration_status: item.registration_status || 'Pending',
		is_regular: item.is_regular,
		attempt_number: item.attempt_number || 1,
		fee_paid: item.fee_paid || false
	}))

	// Client-side filters for fields not directly on exam_registrations
	if (semester) rows = rows.filter(r => r.semester === semester)
	if (courseId) {
		const { data: course } = await supabase.from('courses').select('course_code').eq('id', courseId).single()
		if (course) rows = rows.filter(r => r.course_code === course.course_code)
	}

	// Sort
	rows.sort((a, b) => {
		if (a.program_order !== b.program_order) return a.program_order - b.program_order
		if (a.semester !== b.semester) return a.semester - b.semester
		if (a.course_order !== b.course_order) return a.course_order - b.course_order
		return a.register_number.localeCompare(b.register_number)
	})

	// Calculate summary
	const summary: ExamRegistrationReportSummary = {
		total_registrations: rows.length,
		regular_count: rows.filter(r => r.is_regular).length,
		arrear_count: rows.filter(r => !r.is_regular).length,
		pending_count: rows.filter(r => r.registration_status === 'Pending').length,
		approved_count: rows.filter(r => r.registration_status === 'Approved').length,
		by_program: {}
	}

	for (const row of rows) {
		summary.by_program[row.program_code] = (summary.by_program[row.program_code] || 0) + 1
	}

	// Paginate
	const startIdx = (page - 1) * limit
	const paginatedRows = rows.slice(startIdx, startIdx + limit)

	return NextResponse.json({
		success: true,
		data: paginatedRows,
		summary,
		pagination: { page, limit, total: rows.length },
		generated_at: new Date().toISOString()
	})
}

// =====================================================
// FEE PAID REPORT
// =====================================================

async function getFeePaidReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	sessionId: string,
	programCode: string | null,
	semester: number | null,
	courseId: string | null,
	page: number,
	limit: number
) {
	let query = supabase
		.from('exam_registrations')
		.select(`
			id,
			stu_register_no,
			student_name,
			fee_paid,
			fee_amount,
			payment_date,
			payment_transaction_id,
			program_code,
			course_offerings:course_offering_id (
				semester,
				program_code,
				courses:course_id (
					id,
					course_code,
					course_name,
					course_order
				)
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('examination_session_id', sessionId)

	// Server-side filters to reduce data transfer
	if (programCode) query = query.eq('program_code', programCode)

	const { data, error } = await query

	if (error) throw error

	// Transform data - using program_code directly (programs from MyJKKN API)
	let rows: FeePaidReportRow[] = (data || []).map((item: any) => ({
		register_number: item.stu_register_no || '',
		learner_name: item.student_name || '',
		program_code: item.program_code || item.course_offerings?.program_code || '',
		program_name: item.program_code || item.course_offerings?.program_code || '',
		program_order: 999,
		semester: item.course_offerings?.semester || 0,
		semester_order: item.course_offerings?.semester || 0,
		course_code: item.course_offerings?.courses?.course_code || '',
		course_title: item.course_offerings?.courses?.course_name || '', // DB uses course_name
		course_order: item.course_offerings?.courses?.course_order || 999,
		fee_amount: item.fee_amount || 0,
		payment_date: item.payment_date,
		payment_transaction_id: item.payment_transaction_id,
		fee_paid: item.fee_paid || false
	}))

	// Client-side filters for fields not directly on exam_registrations
	if (semester) rows = rows.filter(r => r.semester === semester)
	if (courseId) {
		const { data: course } = await supabase.from('courses').select('course_code').eq('id', courseId).single()
		if (course) rows = rows.filter(r => r.course_code === course.course_code)
	}

	// Sort
	rows.sort((a, b) => {
		if (a.program_order !== b.program_order) return a.program_order - b.program_order
		if (a.semester !== b.semester) return a.semester - b.semester
		if (a.course_order !== b.course_order) return a.course_order - b.course_order
		return a.register_number.localeCompare(b.register_number)
	})

	// Calculate summary
	const summary: FeePaidReportSummary = {
		total_learners: rows.length,
		paid_count: rows.filter(r => r.fee_paid).length,
		unpaid_count: rows.filter(r => !r.fee_paid).length,
		total_amount_collected: rows.filter(r => r.fee_paid).reduce((sum, r) => sum + r.fee_amount, 0),
		total_amount_pending: rows.filter(r => !r.fee_paid).reduce((sum, r) => sum + r.fee_amount, 0),
		by_program: {}
	}

	for (const row of rows) {
		if (!summary.by_program[row.program_code]) {
			summary.by_program[row.program_code] = { paid: 0, unpaid: 0, amount: 0 }
		}
		if (row.fee_paid) {
			summary.by_program[row.program_code].paid++
			summary.by_program[row.program_code].amount += row.fee_amount
		} else {
			summary.by_program[row.program_code].unpaid++
		}
	}

	// Paginate
	const startIdx = (page - 1) * limit
	const paginatedRows = rows.slice(startIdx, startIdx + limit)

	return NextResponse.json({
		success: true,
		data: paginatedRows,
		summary,
		pagination: { page, limit, total: rows.length },
		generated_at: new Date().toISOString()
	})
}

// =====================================================
// INTERNAL MARKS REPORT
// =====================================================

async function getInternalMarksReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	sessionId: string,
	programCode: string | null,
	semester: number | null,
	courseId: string | null,
	page: number,
	limit: number
) {
	// Fetch internal marks with joins
	let query = supabase
		.from('internal_marks')
		.select(`
			id,
			total_internal_marks,
			max_internal_marks,
			internal_percentage,
			assignment_marks,
			quiz_marks,
			mid_term_marks,
			attendance_marks,
			test_1_mark,
			test_2_mark,
			test_3_mark,
			program_code,
			students:student_id (
				register_number,
				first_name,
				last_name
			),
			courses:course_id (
				id,
				course_code,
				course_name,
				course_order
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('examination_session_id', sessionId)

	if (programCode) query = query.eq('program_code', programCode)
	if (courseId) query = query.eq('course_id', courseId)

	const { data, error } = await query

	if (error) throw error

	// Get internal pass marks from passing rules (simplified - using 40% as default)
	const internalPassMark = 40

	// Transform data - using program_code directly (programs from MyJKKN API)
	let rows: InternalMarksReportRow[] = (data || []).map((item: any) => {
		const internalMarks = item.total_internal_marks
		const internalMax = item.max_internal_marks || 25
		const internalPercentage = internalMarks !== null ? (internalMarks / internalMax) * 100 : null
		const passMarkValue = (internalPassMark / 100) * internalMax

		return {
			register_number: item.students?.register_number || '',
			learner_name: `${item.students?.first_name || ''} ${item.students?.last_name || ''}`.trim(),
			program_code: item.program_code || '',
			program_name: item.program_code || '',
			program_order: 999,
			semester: 0, // Will be determined from course mapping
			semester_order: 0,
			course_code: item.courses?.course_code || '',
			course_title: item.courses?.course_name || '', // DB uses course_name
			course_order: item.courses?.course_order || 999,
			internal_marks: internalMarks,
			internal_max: internalMax,
			internal_percentage: internalPercentage,
			internal_pass_mark: passMarkValue,
			is_internal_pass: internalMarks !== null ? internalMarks >= passMarkValue : null,
			assignment_marks: item.assignment_marks,
			quiz_marks: item.quiz_marks,
			mid_term_marks: item.mid_term_marks,
			attendance_marks: item.attendance_marks,
			test_1_mark: item.test_1_mark,
			test_2_mark: item.test_2_mark,
			test_3_mark: item.test_3_mark
		}
	})

	// Apply semester filter if provided
	if (semester) rows = rows.filter(r => r.semester === semester)

	// Sort
	rows.sort((a, b) => {
		if (a.program_order !== b.program_order) return a.program_order - b.program_order
		if (a.semester !== b.semester) return a.semester - b.semester
		if (a.course_order !== b.course_order) return a.course_order - b.course_order
		return a.register_number.localeCompare(b.register_number)
	})

	// Calculate summary
	const summary: InternalMarksReportSummary = {
		total_records: rows.length,
		pass_count: rows.filter(r => r.is_internal_pass === true).length,
		fail_count: rows.filter(r => r.is_internal_pass === false).length,
		missing_count: rows.filter(r => r.internal_marks === null).length,
		average_marks: 0,
		highest_marks: 0,
		lowest_marks: Infinity,
		by_program: {},
		by_course: {}
	}

	let totalMarks = 0
	let countWithMarks = 0

	for (const row of rows) {
		if (row.internal_marks !== null) {
			totalMarks += row.internal_marks
			countWithMarks++
			summary.highest_marks = Math.max(summary.highest_marks, row.internal_marks)
			summary.lowest_marks = Math.min(summary.lowest_marks, row.internal_marks)
		}

		// By program
		if (!summary.by_program[row.program_code]) {
			summary.by_program[row.program_code] = { pass: 0, fail: 0, missing: 0, average: 0 }
		}
		if (row.is_internal_pass === true) summary.by_program[row.program_code].pass++
		else if (row.is_internal_pass === false) summary.by_program[row.program_code].fail++
		else summary.by_program[row.program_code].missing++

		// By course
		if (!summary.by_course[row.course_code]) {
			summary.by_course[row.course_code] = { pass: 0, fail: 0, average: 0 }
		}
		if (row.is_internal_pass === true) summary.by_course[row.course_code].pass++
		else if (row.is_internal_pass === false) summary.by_course[row.course_code].fail++
	}

	summary.average_marks = countWithMarks > 0 ? totalMarks / countWithMarks : 0
	if (summary.lowest_marks === Infinity) summary.lowest_marks = 0

	// Paginate
	const startIdx = (page - 1) * limit
	const paginatedRows = rows.slice(startIdx, startIdx + limit)

	return NextResponse.json({
		success: true,
		data: paginatedRows,
		summary,
		pagination: { page, limit, total: rows.length },
		generated_at: new Date().toISOString()
	})
}

// =====================================================
// EXTERNAL MARKS REPORT
// =====================================================

async function getExternalMarksReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	sessionId: string,
	programCode: string | null,
	semester: number | null,
	courseId: string | null,
	page: number,
	limit: number
) {
	// Fetch external marks from mark_enter table
	let query = supabase
		.from('mark_enter')
		.select(`
			id,
			total_marks_obtained,
			marks_out_of,
			percentage,
			is_absent,
			attendance_status,
			program_code,
			students:student_id (
				register_number,
				first_name,
				last_name
			),
			courses:course_id (
				id,
				course_code,
				course_name,
				course_order
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('examination_session_id', sessionId)

	if (programCode) query = query.eq('program_code', programCode)
	if (courseId) query = query.eq('course_id', courseId)

	const { data, error } = await query

	if (error) throw error

	// Get external pass marks from passing rules (simplified - using 40% as default)
	const externalPassMark = 40

	// Transform data - using program_code directly (programs from MyJKKN API)
	let rows: ExternalMarksReportRow[] = (data || []).map((item: any) => {
		const externalMarks = item.total_marks_obtained
		const externalMax = item.marks_out_of || 75
		const externalPercentage = externalMarks !== null ? (externalMarks / externalMax) * 100 : null
		const passMarkValue = (externalPassMark / 100) * externalMax

		return {
			register_number: item.students?.register_number || '',
			learner_name: `${item.students?.first_name || ''} ${item.students?.last_name || ''}`.trim(),
			program_code: item.program_code || '',
			program_name: item.program_code || '',
			program_order: 999,
			semester: 0,
			semester_order: 0,
			course_code: item.courses?.course_code || '',
			course_title: item.courses?.course_name || '', // DB uses course_name
			course_order: item.courses?.course_order || 999,
			external_marks: externalMarks,
			external_max: externalMax,
			external_percentage: externalPercentage,
			external_pass_mark: passMarkValue,
			is_external_pass: externalMarks !== null && !item.is_absent ? externalMarks >= passMarkValue : null,
			is_absent: item.is_absent || false,
			attendance_status: item.attendance_status
		}
	})

	// Apply semester filter if provided
	if (semester) rows = rows.filter(r => r.semester === semester)

	// Sort
	rows.sort((a, b) => {
		if (a.program_order !== b.program_order) return a.program_order - b.program_order
		if (a.semester !== b.semester) return a.semester - b.semester
		if (a.course_order !== b.course_order) return a.course_order - b.course_order
		return a.register_number.localeCompare(b.register_number)
	})

	// Calculate summary
	const summary: ExternalMarksReportSummary = {
		total_records: rows.length,
		pass_count: rows.filter(r => r.is_external_pass === true).length,
		fail_count: rows.filter(r => r.is_external_pass === false && !r.is_absent).length,
		absent_count: rows.filter(r => r.is_absent).length,
		missing_count: rows.filter(r => r.external_marks === null && !r.is_absent).length,
		average_marks: 0,
		highest_marks: 0,
		lowest_marks: Infinity,
		by_program: {},
		by_course: {}
	}

	let totalMarks = 0
	let countWithMarks = 0

	for (const row of rows) {
		if (row.external_marks !== null && !row.is_absent) {
			totalMarks += row.external_marks
			countWithMarks++
			summary.highest_marks = Math.max(summary.highest_marks, row.external_marks)
			summary.lowest_marks = Math.min(summary.lowest_marks, row.external_marks)
		}

		// By program
		if (!summary.by_program[row.program_code]) {
			summary.by_program[row.program_code] = { pass: 0, fail: 0, absent: 0, missing: 0, average: 0 }
		}
		if (row.is_external_pass === true) summary.by_program[row.program_code].pass++
		else if (row.is_absent) summary.by_program[row.program_code].absent++
		else if (row.is_external_pass === false) summary.by_program[row.program_code].fail++
		else summary.by_program[row.program_code].missing++

		// By course
		if (!summary.by_course[row.course_code]) {
			summary.by_course[row.course_code] = { pass: 0, fail: 0, absent: 0, average: 0 }
		}
		if (row.is_external_pass === true) summary.by_course[row.course_code].pass++
		else if (row.is_absent) summary.by_course[row.course_code].absent++
		else if (row.is_external_pass === false) summary.by_course[row.course_code].fail++
	}

	summary.average_marks = countWithMarks > 0 ? totalMarks / countWithMarks : 0
	if (summary.lowest_marks === Infinity) summary.lowest_marks = 0

	// Paginate
	const startIdx = (page - 1) * limit
	const paginatedRows = rows.slice(startIdx, startIdx + limit)

	return NextResponse.json({
		success: true,
		data: paginatedRows,
		summary,
		pagination: { page, limit, total: rows.length },
		generated_at: new Date().toISOString()
	})
}

// =====================================================
// FINAL RESULT REPORT
// =====================================================

async function getFinalResultReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	sessionId: string,
	programCode: string | null,
	semester: number | null,
	courseId: string | null,
	page: number,
	limit: number
) {
	let query = supabase
		.from('final_marks')
		.select(`
			id,
			internal_marks_obtained,
			internal_marks_maximum,
			external_marks_obtained,
			external_marks_maximum,
			total_marks_obtained,
			total_marks_maximum,
			percentage,
			letter_grade,
			grade_points,
			credit,
			total_grade_points,
			is_pass,
			pass_status,
			result_status,
			program_code,
			students:student_id (
				register_number,
				first_name,
				last_name
			),
			courses:course_id (
				id,
				course_code,
				course_name,
				course_order
			),
			course_offerings:course_offering_id (
				semester
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('examination_session_id', sessionId)

	if (programCode) query = query.eq('program_code', programCode)
	if (courseId) query = query.eq('course_id', courseId)

	const { data, error } = await query

	if (error) throw error

	// Transform data - using program_code directly (programs from MyJKKN API)
	let rows: FinalResultReportRow[] = (data || []).map((item: any) => ({
		register_number: item.students?.register_number || '',
		learner_name: `${item.students?.first_name || ''} ${item.students?.last_name || ''}`.trim(),
		program_code: item.program_code || '',
		program_name: item.program_code || '',
		program_order: 999,
		semester: item.course_offerings?.semester || 0,
		semester_order: item.course_offerings?.semester || 0,
		course_code: item.courses?.course_code || '',
		course_title: item.courses?.course_name || '', // DB uses course_name
		course_order: item.courses?.course_order || 999,
		credits: item.credit || 0,
		internal_marks: item.internal_marks_obtained || 0,
		internal_max: item.internal_marks_maximum || 25,
		external_marks: item.external_marks_obtained || 0,
		external_max: item.external_marks_maximum || 75,
		total_marks: item.total_marks_obtained || 0,
		total_max: item.total_marks_maximum || 100,
		percentage: item.percentage || 0,
		letter_grade: item.letter_grade || '',
		grade_point: item.grade_points || 0,
		credit_points: item.total_grade_points || 0,
		is_pass: item.is_pass || false,
		pass_status: item.pass_status || 'Fail',
		result_status: item.result_status || 'Pending'
	}))

	// Apply semester filter if provided
	if (semester) rows = rows.filter(r => r.semester === semester)

	// Sort
	rows.sort((a, b) => {
		if (a.program_order !== b.program_order) return a.program_order - b.program_order
		if (a.semester !== b.semester) return a.semester - b.semester
		if (a.course_order !== b.course_order) return a.course_order - b.course_order
		return a.register_number.localeCompare(b.register_number)
	})

	// Calculate summary
	const summary: FinalResultReportSummary = {
		total_records: rows.length,
		pass_count: rows.filter(r => r.is_pass).length,
		fail_count: rows.filter(r => !r.is_pass && r.pass_status !== 'Absent').length,
		absent_count: rows.filter(r => r.pass_status === 'Absent').length,
		distinction_count: rows.filter(r => r.percentage >= 75).length,
		first_class_count: rows.filter(r => r.percentage >= 60 && r.percentage < 75).length,
		pass_percentage: 0,
		average_percentage: 0,
		grade_distribution: {},
		by_program: {},
		by_course: {}
	}

	let totalPercentage = 0

	for (const row of rows) {
		totalPercentage += row.percentage

		// Grade distribution
		summary.grade_distribution[row.letter_grade] = (summary.grade_distribution[row.letter_grade] || 0) + 1

		// By program
		if (!summary.by_program[row.program_code]) {
			summary.by_program[row.program_code] = { pass: 0, fail: 0, absent: 0, distinction: 0, first_class: 0, average: 0 }
		}
		if (row.is_pass) summary.by_program[row.program_code].pass++
		else if (row.pass_status === 'Absent') summary.by_program[row.program_code].absent++
		else summary.by_program[row.program_code].fail++
		if (row.percentage >= 75) summary.by_program[row.program_code].distinction++
		if (row.percentage >= 60 && row.percentage < 75) summary.by_program[row.program_code].first_class++

		// By course
		if (!summary.by_course[row.course_code]) {
			summary.by_course[row.course_code] = { pass: 0, fail: 0, average: 0 }
		}
		if (row.is_pass) summary.by_course[row.course_code].pass++
		else summary.by_course[row.course_code].fail++
	}

	summary.pass_percentage = rows.length > 0 ? (summary.pass_count / rows.length) * 100 : 0
	summary.average_percentage = rows.length > 0 ? totalPercentage / rows.length : 0

	// Paginate
	const startIdx = (page - 1) * limit
	const paginatedRows = rows.slice(startIdx, startIdx + limit)

	return NextResponse.json({
		success: true,
		data: paginatedRows,
		summary,
		pagination: { page, limit, total: rows.length },
		generated_at: new Date().toISOString()
	})
}

// =====================================================
// SEMESTER RESULT REPORT
// =====================================================

async function getSemesterResultReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	sessionId: string,
	programCode: string | null,
	semester: number | null,
	page: number,
	limit: number
) {
	let query = supabase
		.from('semester_results')
		.select(`
			id,
			semester,
			total_credits_registered,
			total_credits_earned,
			total_credit_points,
			sgpa,
			cgpa,
			percentage,
			result_status,
			result_class,
			total_backlogs,
			is_distinction,
			is_first_class,
			is_promoted,
			is_published,
			program_code,
			students:student_id (
				register_number,
				first_name,
				last_name
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('examination_session_id', sessionId)

	if (programCode) query = query.eq('program_code', programCode)
	if (semester) query = query.eq('semester', semester)

	const { data, error } = await query

	if (error) throw error

	// Transform data - using program_code directly (programs from MyJKKN API)
	let rows: SemesterResultReportRow[] = (data || []).map((item: any) => ({
		register_number: item.students?.register_number || '',
		learner_name: `${item.students?.first_name || ''} ${item.students?.last_name || ''}`.trim(),
		program_code: item.program_code || '',
		program_name: item.program_code || '',
		program_order: 999,
		semester: item.semester,
		semester_order: item.semester,
		total_credits_registered: item.total_credits_registered || 0,
		total_credits_earned: item.total_credits_earned || 0,
		total_credit_points: item.total_credit_points || 0,
		sgpa: item.sgpa || 0,
		cgpa: item.cgpa || 0,
		percentage: item.percentage || 0,
		result_status: item.result_status || 'Pending',
		result_class: item.result_class || '',
		total_backlogs: item.total_backlogs || 0,
		is_distinction: item.is_distinction || false,
		is_first_class: item.is_first_class || false,
		is_promoted: item.is_promoted || false,
		is_published: item.is_published || false
	}))

	// Sort
	rows.sort((a, b) => {
		if (a.program_order !== b.program_order) return a.program_order - b.program_order
		if (a.semester !== b.semester) return a.semester - b.semester
		return a.register_number.localeCompare(b.register_number)
	})

	// Calculate summary
	const summary: SemesterResultReportSummary = {
		total_learners: rows.length,
		pass_count: rows.filter(r => r.result_status === 'Pass').length,
		fail_count: rows.filter(r => r.result_status === 'Fail').length,
		pending_count: rows.filter(r => r.result_status === 'Pending').length,
		published_count: rows.filter(r => r.is_published).length,
		distinction_count: rows.filter(r => r.is_distinction).length,
		first_class_count: rows.filter(r => r.is_first_class).length,
		with_backlogs_count: rows.filter(r => r.total_backlogs > 0).length,
		average_sgpa: 0,
		average_cgpa: 0,
		highest_sgpa: 0,
		lowest_sgpa: 10,
		by_program: {}
	}

	let totalSgpa = 0
	let totalCgpa = 0

	for (const row of rows) {
		totalSgpa += row.sgpa
		totalCgpa += row.cgpa
		summary.highest_sgpa = Math.max(summary.highest_sgpa, row.sgpa)
		summary.lowest_sgpa = Math.min(summary.lowest_sgpa, row.sgpa)

		// By program
		if (!summary.by_program[row.program_code]) {
			summary.by_program[row.program_code] = { pass: 0, fail: 0, distinction: 0, first_class: 0, average_sgpa: 0, average_cgpa: 0 }
		}
		if (row.result_status === 'Pass') summary.by_program[row.program_code].pass++
		else if (row.result_status === 'Fail') summary.by_program[row.program_code].fail++
		if (row.is_distinction) summary.by_program[row.program_code].distinction++
		if (row.is_first_class) summary.by_program[row.program_code].first_class++
	}

	summary.average_sgpa = rows.length > 0 ? totalSgpa / rows.length : 0
	summary.average_cgpa = rows.length > 0 ? totalCgpa / rows.length : 0
	if (summary.lowest_sgpa === 10) summary.lowest_sgpa = 0

	// Paginate
	const startIdx = (page - 1) * limit
	const paginatedRows = rows.slice(startIdx, startIdx + limit)

	return NextResponse.json({
		success: true,
		data: paginatedRows,
		summary,
		pagination: { page, limit, total: rows.length },
		generated_at: new Date().toISOString()
	})
}

// =====================================================
// ARREAR/BACKLOG REPORT
// =====================================================

async function getArrearReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	sessionId: string,
	programCode: string | null,
	semester: number | null,
	courseId: string | null,
	page: number,
	limit: number
) {
	let query = supabase
		.from('student_backlogs')
		.select(`
			id,
			original_internal_marks,
			original_external_marks,
			original_total_marks,
			original_percentage,
			original_letter_grade,
			failure_reason,
			attempt_count,
			is_cleared,
			cleared_date,
			cleared_letter_grade,
			is_registered_for_arrear,
			semesters_pending,
			priority_level,
			students:student_id (
				register_number,
				first_name,
				last_name
			),
			courses:course_id (
				id,
				course_code,
				course_name,
				course_order,
				credits
			),
			course_offerings:course_offering_id (
				semester,
				program_code
			),
			arrear_session:arrear_exam_session_id (
				session_code,
				session_name
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('original_examination_session_id', sessionId)

	if (programCode) query = query.eq('course_offerings.program_code', programCode)
	if (courseId) query = query.eq('course_id', courseId)

	const { data, error } = await query

	if (error) throw error

	// Transform data
	let rows: ArrearReportRow[] = (data || []).map((item: any) => ({
		register_number: item.students?.register_number || '',
		learner_name: `${item.students?.first_name || ''} ${item.students?.last_name || ''}`.trim(),
		program_code: item.course_offerings?.program_code || '',
		program_name: item.course_offerings?.program_code || '',
		program_order: 999,
		original_semester: item.course_offerings?.semester || 0,
		semester_order: item.course_offerings?.semester || 0,
		course_code: item.courses?.course_code || '',
		course_title: item.courses?.course_name || '', // DB uses course_name
		course_order: item.courses?.course_order || 999,
		credits: item.courses?.credits || 0,
		original_internal_marks: item.original_internal_marks,
		original_external_marks: item.original_external_marks,
		original_total_marks: item.original_total_marks,
		original_percentage: item.original_percentage,
		original_letter_grade: item.original_letter_grade,
		failure_reason: item.failure_reason || 'Unknown',
		attempt_count: item.attempt_count || 1,
		is_cleared: item.is_cleared || false,
		cleared_date: item.cleared_date,
		cleared_letter_grade: item.cleared_letter_grade,
		is_registered_for_arrear: item.is_registered_for_arrear || false,
		arrear_exam_session: item.arrear_session?.session_name,
		semesters_pending: item.semesters_pending || 0,
		priority_level: item.priority_level || 'Normal'
	}))

	// Apply semester filter if provided
	if (semester) rows = rows.filter(r => r.original_semester === semester)

	// Sort
	rows.sort((a, b) => {
		if (a.program_order !== b.program_order) return a.program_order - b.program_order
		if (a.original_semester !== b.original_semester) return a.original_semester - b.original_semester
		if (a.course_order !== b.course_order) return a.course_order - b.course_order
		return a.register_number.localeCompare(b.register_number)
	})

	// Calculate summary
	const summary: ArrearReportSummary = {
		total_backlogs: rows.length,
		cleared_count: rows.filter(r => r.is_cleared).length,
		pending_count: rows.filter(r => !r.is_cleared).length,
		registered_for_exam_count: rows.filter(r => r.is_registered_for_arrear).length,
		by_failure_reason: {},
		by_priority: {},
		by_program: {},
		by_semester: {},
		by_course: {}
	}

	for (const row of rows) {
		// By failure reason
		summary.by_failure_reason[row.failure_reason] = (summary.by_failure_reason[row.failure_reason] || 0) + 1

		// By priority
		summary.by_priority[row.priority_level] = (summary.by_priority[row.priority_level] || 0) + 1

		// By program
		if (!summary.by_program[row.program_code]) {
			summary.by_program[row.program_code] = { total: 0, cleared: 0, pending: 0 }
		}
		summary.by_program[row.program_code].total++
		if (row.is_cleared) summary.by_program[row.program_code].cleared++
		else summary.by_program[row.program_code].pending++

		// By semester
		if (!summary.by_semester[row.original_semester]) {
			summary.by_semester[row.original_semester] = { total: 0, cleared: 0, pending: 0 }
		}
		summary.by_semester[row.original_semester].total++
		if (row.is_cleared) summary.by_semester[row.original_semester].cleared++
		else summary.by_semester[row.original_semester].pending++

		// By course
		summary.by_course[row.course_code] = (summary.by_course[row.course_code] || 0) + 1
	}

	// Paginate
	const startIdx = (page - 1) * limit
	const paginatedRows = rows.slice(startIdx, startIdx + limit)

	return NextResponse.json({
		success: true,
		data: paginatedRows,
		summary,
		pagination: { page, limit, total: rows.length },
		generated_at: new Date().toISOString()
	})
}

// =====================================================
// MISSING DATA REPORT
// =====================================================

async function getMissingDataReport(
	supabase: ReturnType<typeof getSupabaseServer>,
	institutionId: string,
	sessionId: string,
	programCode: string | null,
	semester: number | null,
	courseId: string | null,
	page: number,
	limit: number
) {
	// Build exam registrations query with server-side filters
	let regQuery = supabase
		.from('exam_registrations')
		.select(`
			id,
			student_id,
			stu_register_no,
			student_name,
			registration_status,
			course_offering_id,
			course_offerings:course_offering_id (
				semester,
				course_id,
				program_code,
				courses:course_id (
					id,
					course_code,
					course_name,
					course_order
				)
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('examination_session_id', sessionId)
		.eq('registration_status', 'Approved')

	// Server-side filter to reduce data transfer
	if (programCode) regQuery = regQuery.eq('program_code', programCode)

	// Run all 3 independent queries in parallel using Promise.all
	const [regResult, intResult, extResult, attResult] = await Promise.all([
		regQuery,
		supabase
			.from('internal_marks')
			.select('student_id, course_id, total_internal_marks')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId),
		supabase
			.from('mark_enter')
			.select('student_id, course_id, total_marks_obtained, is_absent')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId),
		supabase
			.from('exam_attendance')
			.select('student_id, course_offering_id, attendance_status')
			.eq('institutions_id', institutionId)
			.eq('examination_session_id', sessionId)
	])

	if (regResult.error) throw regResult.error
	if (intResult.error) throw intResult.error
	if (extResult.error) throw extResult.error
	if (attResult.error) throw attResult.error

	const registrations = regResult.data
	const internalMarks = intResult.data
	const externalMarks = extResult.data
	const attendanceRecords = attResult.data

	// Create lookup maps
	const internalMap = new Map<string, number | null>()
	for (const im of internalMarks || []) {
		internalMap.set(`${im.student_id}-${im.course_id}`, im.total_internal_marks)
	}

	const externalMap = new Map<string, { marks: number | null; absent: boolean }>()
	for (const em of externalMarks || []) {
		externalMap.set(`${em.student_id}-${em.course_id}`, { marks: em.total_marks_obtained, absent: em.is_absent })
	}

	const attendanceMap = new Map<string, string>()
	for (const att of attendanceRecords || []) {
		attendanceMap.set(`${att.student_id}-${att.course_offering_id}`, att.attendance_status)
	}

	// Find registrations with missing data
	let rows: MissingDataReportRow[] = []

	for (const reg of registrations || []) {
		const courseId = (reg.course_offerings as any)?.courses?.id
		const studentId = reg.student_id
		const key = `${studentId}-${courseId}`
		const attKey = `${studentId}-${reg.course_offering_id}`

		const hasInternal = internalMap.has(key) && internalMap.get(key) !== null
		const extData = externalMap.get(key)
		const hasExternal = extData !== undefined && (extData.marks !== null || extData.absent)
		const hasAttendance = attendanceMap.has(attKey)

		// Determine missing type
		let missingType: 'internal' | 'external' | 'both' | 'attendance' | null = null
		if (!hasInternal && !hasExternal) missingType = 'both'
		else if (!hasInternal) missingType = 'internal'
		else if (!hasExternal) missingType = 'external'
		else if (!hasAttendance) missingType = 'attendance'

		if (missingType) {
			rows.push({
				register_number: reg.stu_register_no || '',
				learner_name: reg.student_name || '',
				program_code: (reg.course_offerings as any)?.program_code || '',
				program_name: (reg.course_offerings as any)?.program_code || '',
				program_order: 999,
				semester: (reg.course_offerings as any)?.semester || 0,
				semester_order: (reg.course_offerings as any)?.semester || 0,
				course_code: (reg.course_offerings as any)?.courses?.course_code || '',
				course_title: (reg.course_offerings as any)?.courses?.course_name || '', // DB uses course_name
				course_order: (reg.course_offerings as any)?.courses?.course_order || 999,
				missing_type: missingType,
				has_internal: hasInternal,
				has_external: hasExternal,
				has_attendance: hasAttendance,
				registration_status: reg.registration_status
			})
		}
	}

	// Client-side filters for fields not directly on exam_registrations
	// programCode is already filtered server-side on the registrations query
	if (semester) rows = rows.filter(r => r.semester === semester)
	if (courseId) {
		const { data: course } = await supabase.from('courses').select('course_code').eq('id', courseId).single()
		if (course) rows = rows.filter(r => r.course_code === course.course_code)
	}

	// Sort
	rows.sort((a, b) => {
		if (a.program_order !== b.program_order) return a.program_order - b.program_order
		if (a.semester !== b.semester) return a.semester - b.semester
		if (a.course_order !== b.course_order) return a.course_order - b.course_order
		return a.register_number.localeCompare(b.register_number)
	})

	// Calculate summary
	const summary: MissingDataReportSummary = {
		total_missing: rows.length,
		missing_internal_only: rows.filter(r => r.missing_type === 'internal').length,
		missing_external_only: rows.filter(r => r.missing_type === 'external').length,
		missing_both: rows.filter(r => r.missing_type === 'both').length,
		missing_attendance: rows.filter(r => r.missing_type === 'attendance').length,
		by_program: {},
		by_course: {}
	}

	for (const row of rows) {
		// By program
		if (!summary.by_program[row.program_code]) {
			summary.by_program[row.program_code] = { internal: 0, external: 0, both: 0, attendance: 0 }
		}
		if (row.missing_type === 'internal') summary.by_program[row.program_code].internal++
		else if (row.missing_type === 'external') summary.by_program[row.program_code].external++
		else if (row.missing_type === 'both') summary.by_program[row.program_code].both++
		else if (row.missing_type === 'attendance') summary.by_program[row.program_code].attendance++

		// By course
		if (!summary.by_course[row.course_code]) {
			summary.by_course[row.course_code] = { internal: 0, external: 0, both: 0 }
		}
		if (row.missing_type === 'internal') summary.by_course[row.course_code].internal++
		else if (row.missing_type === 'external') summary.by_course[row.course_code].external++
		else if (row.missing_type === 'both') summary.by_course[row.course_code].both++
	}

	// Paginate
	const startIdx = (page - 1) * limit
	const paginatedRows = rows.slice(startIdx, startIdx + limit)

	return NextResponse.json({
		success: true,
		data: paginatedRows,
		summary,
		pagination: { page, limit, total: rows.length },
		generated_at: new Date().toISOString()
	})
}
