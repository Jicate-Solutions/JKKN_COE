import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'

// GET - Fetch all examination sessions
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const academicYearId = searchParams.get('academic_year_id')
		const examTypeId = searchParams.get('exam_type_id')
		const sessionStatus = searchParams.get('session_status')

		let query = supabase
			.from('examination_sessions')
			.select('*', { count: 'exact' })
			.order('exam_start_date', { ascending: false })
			.range(0, 9999) // Increase limit from default 1000 to 10000 rows

		if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}
		if (academicYearId) {
			query = query.eq('academic_year_id', academicYearId)
		}
		if (examTypeId) {
			query = query.eq('exam_type_id', examTypeId)
		}
		if (sessionStatus) {
			query = query.eq('session_status', sessionStatus)
		}

		const { data, error } = await query

		if (error) {
			console.error('Examination sessions table error:', error)
			return NextResponse.json({ error: 'Failed to fetch examination sessions' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (e) {
		console.error('Examination sessions API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Create new examination session
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		if (!body.institutions_id) {
			return NextResponse.json({
				error: 'Institution is required'
			}, { status: 400 })
		}

		if (!body.session_code) {
			return NextResponse.json({
				error: 'Session code is required'
			}, { status: 400 })
		}

		if (!body.session_name) {
			return NextResponse.json({
				error: 'Session name is required'
			}, { status: 400 })
		}

		if (!body.exam_type_id) {
			return NextResponse.json({
				error: 'Exam type is required'
			}, { status: 400 })
		}

		if (!body.academic_year_id) {
			return NextResponse.json({
				error: 'Academic year is required'
			}, { status: 400 })
		}

		if (!body.semester_type) {
			return NextResponse.json({
				error: 'Semester type is required'
			}, { status: 400 })
		}

		if (!body.registration_start_date) {
			return NextResponse.json({
				error: 'Registration start date is required'
			}, { status: 400 })
		}

		if (!body.registration_end_date) {
			return NextResponse.json({
				error: 'Registration end date is required'
			}, { status: 400 })
		}

		if (!body.exam_start_date) {
			return NextResponse.json({
				error: 'Exam start date is required'
			}, { status: 400 })
		}

		if (!body.exam_end_date) {
			return NextResponse.json({
				error: 'Exam end date is required'
			}, { status: 400 })
		}

		// Validate foreign keys in parallel (independent queries)
		const [institutionResult, examTypeResult, academicYearResult] = await Promise.all([
			supabase.from('institutions').select('id').eq('id', body.institutions_id).maybeSingle(),
			supabase.from('exam_types').select('id').eq('id', body.exam_type_id).maybeSingle(),
			supabase.from('academic_years').select('id').eq('id', body.academic_year_id).maybeSingle(),
		])

		if (institutionResult.error || !institutionResult.data) {
			return NextResponse.json({
				error: `Institution not found. Please select a valid institution.`
			}, { status: 400 })
		}

		if (examTypeResult.error || !examTypeResult.data) {
			return NextResponse.json({
				error: `Exam type not found. Please select a valid exam type.`
			}, { status: 400 })
		}

		if (academicYearResult.error || !academicYearResult.data) {
			return NextResponse.json({
				error: `Academic year not found. Please select a valid academic year.`
			}, { status: 400 })
		}

		// Validate date sequence
		const regStart = new Date(body.registration_start_date)
		const regEnd = new Date(body.registration_end_date)
		const examStart = new Date(body.exam_start_date)
		const examEnd = new Date(body.exam_end_date)

		if (regStart >= regEnd) {
			return NextResponse.json({
				error: 'Registration end date must be after registration start date'
			}, { status: 400 })
		}

		if (regEnd > examStart) {
			return NextResponse.json({
				error: 'Registration end date must be on or before exam start date'
			}, { status: 400 })
		}

		if (examStart > examEnd) {
			return NextResponse.json({
				error: 'Exam end date must be after exam start date'
			}, { status: 400 })
		}

		// Validate semester_year JSON array
		let semesterYear = body.semester_year || []
		if (typeof semesterYear === 'string') {
			try {
				semesterYear = JSON.parse(semesterYear)
			} catch (e) {
				return NextResponse.json({
					error: 'Invalid semester/year format'
				}, { status: 400 })
			}
		}
		if (!Array.isArray(semesterYear)) {
			return NextResponse.json({
				error: 'Semester/year must be an array'
			}, { status: 400 })
		}

		// Validate programs_included JSON array
		let programsIncluded = body.programs_included || []
		if (typeof programsIncluded === 'string') {
			try {
				programsIncluded = JSON.parse(programsIncluded)
			} catch (e) {
				return NextResponse.json({
					error: 'Invalid programs format'
				}, { status: 400 })
			}
		}
		if (!Array.isArray(programsIncluded)) {
			return NextResponse.json({
				error: 'Programs must be an array'
			}, { status: 400 })
		}

		// Validate late registration fee
		const allowLateRegistration = body.allow_late_registration ?? false
		let lateRegistrationFee = body.late_registration_fee ?? 0

		if (typeof lateRegistrationFee === 'string') {
			lateRegistrationFee = parseFloat(lateRegistrationFee)
		}

		if (allowLateRegistration && lateRegistrationFee < 0) {
			return NextResponse.json({
				error: 'Late registration fee must be 0 or greater'
			}, { status: 400 })
		}

		if (!allowLateRegistration && lateRegistrationFee !== 0) {
			return NextResponse.json({
				error: 'Late registration fee must be 0 when late registration is disabled'
			}, { status: 400 })
		}

		const insertPayload: any = {
			institutions_id: body.institutions_id,
			session_code: body.session_code,
			session_name: body.session_name,
			month_year: body.month_year || null,
			exam_type_id: body.exam_type_id,
			academic_year_id: body.academic_year_id,
			semester_year: semesterYear,
			semester_type: body.semester_type,
			programs_included: programsIncluded,
			registration_start_date: body.registration_start_date,
			registration_end_date: body.registration_end_date,
			exam_start_date: body.exam_start_date,
			exam_end_date: body.exam_end_date,
			result_declaration_date: body.result_declaration_date || null,
			session_status: body.session_status || 'Planned',
			is_online_exam: body.is_online_exam ?? false,
			allow_late_registration: allowLateRegistration,
			late_registration_fee: lateRegistrationFee,
			total_courses_scheduled: body.total_courses_scheduled || 0,
			total_students_registered: body.total_students_registered || 0,
			total_marks_obtained_count: body.total_marks_obtained_count || 0,
			created_by: body.created_by || null,
		}

		const { data, error } = await supabase
			.from('examination_sessions')
			.insert([insertPayload])
			.select()
			.single()

		if (error) {
			console.error('Error creating examination session:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Examination session already exists for this combination of institution, academic year, exam type, and semester type.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid institution, exam type, and academic year.'
				}, { status: 400 })
			}

			// Handle check constraint violation
			if (error.code === '23514') {
				return NextResponse.json({
					error: 'Invalid value. Please check your input values.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create examination session' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('Examination session creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT - Update examination session
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		if (!body.id) {
			return NextResponse.json({ error: 'Examination session ID is required' }, { status: 400 })
		}

		// Validate foreign keys in parallel (independent queries)
		const fkValidations = await Promise.all([
			body.institutions_id
				? supabase.from('institutions').select('id').eq('id', body.institutions_id).maybeSingle()
				: Promise.resolve({ data: true, error: null }),
			body.exam_type_id
				? supabase.from('exam_types').select('id').eq('id', body.exam_type_id).maybeSingle()
				: Promise.resolve({ data: true, error: null }),
			body.academic_year_id
				? supabase.from('academic_years').select('id').eq('id', body.academic_year_id).maybeSingle()
				: Promise.resolve({ data: true, error: null }),
		])

		const [institutionResult, examTypeResult, academicYearResult] = fkValidations

		if (body.institutions_id && (institutionResult.error || !institutionResult.data)) {
			return NextResponse.json({
				error: `Institution not found. Please select a valid institution.`
			}, { status: 400 })
		}

		if (body.exam_type_id && (examTypeResult.error || !examTypeResult.data)) {
			return NextResponse.json({
				error: `Exam type not found. Please select a valid exam type.`
			}, { status: 400 })
		}

		if (body.academic_year_id && (academicYearResult.error || !academicYearResult.data)) {
			return NextResponse.json({
				error: `Academic year not found. Please select a valid academic year.`
			}, { status: 400 })
		}

		// Validate date sequence
		if (body.registration_start_date && body.registration_end_date) {
			const regStart = new Date(body.registration_start_date)
			const regEnd = new Date(body.registration_end_date)

			if (regStart >= regEnd) {
				return NextResponse.json({
					error: 'Registration end date must be after registration start date'
				}, { status: 400 })
			}
		}

		if (body.registration_end_date && body.exam_start_date) {
			const regEnd = new Date(body.registration_end_date)
			const examStart = new Date(body.exam_start_date)

			if (regEnd > examStart) {
				return NextResponse.json({
					error: 'Registration end date must be on or before exam start date'
				}, { status: 400 })
			}
		}

		if (body.exam_start_date && body.exam_end_date) {
			const examStart = new Date(body.exam_start_date)
			const examEnd = new Date(body.exam_end_date)

			if (examStart > examEnd) {
				return NextResponse.json({
					error: 'Exam end date must be after exam start date'
				}, { status: 400 })
			}
		}

		// Validate semester_year JSON array (if provided)
		let semesterYear = body.semester_year
		if (semesterYear !== undefined) {
			if (typeof semesterYear === 'string') {
				try {
					semesterYear = JSON.parse(semesterYear)
				} catch (e) {
					return NextResponse.json({
						error: 'Invalid semester/year format'
					}, { status: 400 })
				}
			}
			if (!Array.isArray(semesterYear)) {
				return NextResponse.json({
					error: 'Semester/year must be an array'
				}, { status: 400 })
			}
		}

		// Validate programs_included JSON array (if provided)
		let programsIncluded = body.programs_included
		if (programsIncluded !== undefined) {
			if (typeof programsIncluded === 'string') {
				try {
					programsIncluded = JSON.parse(programsIncluded)
				} catch (e) {
					return NextResponse.json({
						error: 'Invalid programs format'
					}, { status: 400 })
				}
			}
			if (!Array.isArray(programsIncluded)) {
				return NextResponse.json({
					error: 'Programs must be an array'
				}, { status: 400 })
			}
		}

		// Validate late registration fee (if provided)
		const allowLateRegistration = body.allow_late_registration
		let lateRegistrationFee = body.late_registration_fee

		if (lateRegistrationFee !== undefined) {
			if (typeof lateRegistrationFee === 'string') {
				lateRegistrationFee = parseFloat(lateRegistrationFee)
			}

			if (allowLateRegistration !== undefined && allowLateRegistration && lateRegistrationFee < 0) {
				return NextResponse.json({
					error: 'Late registration fee must be 0 or greater'
				}, { status: 400 })
			}

			if (allowLateRegistration !== undefined && !allowLateRegistration && lateRegistrationFee !== 0) {
				return NextResponse.json({
					error: 'Late registration fee must be 0 when late registration is disabled'
				}, { status: 400 })
			}
		}

		const updatePayload: any = {
			session_code: body.session_code,
			session_name: body.session_name,
			month_year: body.month_year || null,
			exam_type_id: body.exam_type_id,
			academic_year_id: body.academic_year_id,
			semester_type: body.semester_type,
			registration_start_date: body.registration_start_date,
			registration_end_date: body.registration_end_date,
			exam_start_date: body.exam_start_date,
			exam_end_date: body.exam_end_date,
			result_declaration_date: body.result_declaration_date || null,
			session_status: body.session_status,
			is_online_exam: body.is_online_exam,
			total_courses_scheduled: body.total_courses_scheduled,
			total_students_registered: body.total_students_registered,
			total_marks_obtained_count: body.total_marks_obtained_count,
			updated_by: body.updated_by || null,
		}

		if (semesterYear !== undefined) updatePayload.semester_year = semesterYear
		if (programsIncluded !== undefined) updatePayload.programs_included = programsIncluded
		if (allowLateRegistration !== undefined) updatePayload.allow_late_registration = allowLateRegistration
		if (lateRegistrationFee !== undefined) updatePayload.late_registration_fee = lateRegistrationFee

		const { data, error } = await supabase
			.from('examination_sessions')
			.update(updatePayload)
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('Error updating examination session:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Examination session already exists for this combination of institution, academic year, exam type, and semester type.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid references.'
				}, { status: 400 })
			}

			// Handle check constraint violation
			if (error.code === '23514') {
				return NextResponse.json({
					error: 'Invalid value. Please check your input values.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update examination session' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Examination session update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE - Delete examination session
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Examination session ID is required' }, { status: 400 })
		}

		return handleDeleteWithDependencyCheck('examination_sessions', id, request)
	} catch (e) {
		console.error('Delete error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
