import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/draft-applications
// Fetch all draft registrations for a session
// =====================================================

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const examinationSessionId = searchParams.get('examination_session_id')
	const institutionsId = searchParams.get('institutions_id')
	const programCode = searchParams.get('program_code')
	const search = searchParams.get('search')
	const page = parseInt(searchParams.get('page') || '1')
	const pageSize = parseInt(searchParams.get('page_size') || '20')

	// Validation
	if (!examinationSessionId) {
		return NextResponse.json({ error: 'Examination session is required' }, { status: 400 })
	}

	if (!institutionsId) {
		return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
	}

	try {
		// Build query
		let query = supabase
			.from('revaluation_registrations')
			.select('*', { count: 'exact' })
			.eq('examination_session_id', examinationSessionId)
			.eq('institutions_id', institutionsId)
			.eq('status', 'Draft')
			.order('student_register_number', { ascending: true })
			.order('created_at', { ascending: false })

		// Apply filters
		if (programCode) {
			query = query.eq('program_code', programCode)
		}

		if (search) {
			query = query.or(
				`student_register_number.ilike.%${search}%,student_name.ilike.%${search}%`
			)
		}

		// Pagination
		const from = (page - 1) * pageSize
		const to = from + pageSize - 1

		const { data, error, count } = await query.range(from, to)

		if (error) {
			console.error('Draft fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch draft registrations' }, { status: 500 })
		}

		// Group by student
		const studentsMap = new Map()

		data?.forEach((registration: any) => {
			const studentKey = registration.student_id
			if (!studentsMap.has(studentKey)) {
				studentsMap.set(studentKey, {
					student_id: registration.student_id,
					student_register_number: registration.student_register_number,
					student_name: registration.student_name,
					program_code: registration.program_code,
					institution_code: registration.institution_code,
					session_code: registration.session_code,
					courses: [],
					total_fee: 0,
				})
			}

			const student = studentsMap.get(studentKey)
			student.courses.push({
				id: registration.id,
				course_id: registration.course_id,
				course_code: registration.course_code,
				course_title: registration.course_title,
				attempt_number: registration.attempt_number,
				fee_amount: registration.fee_amount,
				dummy_number: registration.dummy_number,
				course_offering_id: registration.course_offering_id,
				exam_registration_id: registration.exam_registration_id,
			})
			student.total_fee += Number(registration.fee_amount || 0)
		})

		const students = Array.from(studentsMap.values())

		return NextResponse.json({
			students,
			pagination: {
				page,
				page_size: pageSize,
				total: count || 0,
				total_pages: Math.ceil((count || 0) / pageSize),
			},
			summary: {
				total_students: students.length,
				total_courses: data?.length || 0,
				total_fees: students.reduce((sum, s) => sum + s.total_fee, 0),
			},
		})
	} catch (error) {
		console.error('Draft fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch draft registrations' }, { status: 500 })
	}
}

// =====================================================
// POST /api/revaluation/draft-applications
// Add student to draft registrations
// =====================================================

export async function POST(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()

		const {
			examination_session_id,
			institutions_id,
			student_id,
			student_register_number,
			student_name,
			program_code,
			program_name,
			session_code,
			institution_code,
			course_selections, // Array of { course_id, course_code, course_title, ... }
		} = body

		// Validation
		if (!examination_session_id || !institutions_id || !student_id || !course_selections?.length) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		// =====================================================
		// 1. GET DUMMY NUMBER (from original exam or use register number)
		// =====================================================

		const { data: existingDummy } = await supabase
			.from('student_dummy_numbers')
			.select('dummy_number')
			.eq('student_id', student_id)
			.eq('examination_session_id', examination_session_id)
			.maybeSingle()

		const dummyNumber = existingDummy?.dummy_number || student_register_number

		// =====================================================
		// 2. PREPARE DRAFT REGISTRATIONS
		// =====================================================

		const drafts = course_selections.map((course: any) => ({
			institutions_id,
			institution_code,
			examination_session_id,
			exam_registration_id: course.exam_registration_id,
			course_offering_id: course.course_offering_id,
			course_id: course.course_id,
			student_id,
			attempt_number: course.attempt_number,
			fee_amount: course.fee_amount,
			status: 'Draft',
			payment_status: 'Pending',
			dummy_number: dummyNumber,
			student_register_number,
			student_name,
			course_code: course.course_code,
			course_title: course.course_name,
			session_code,
			program_code,
			application_date: new Date().toISOString().split('T')[0],
		}))

		// =====================================================
		// 3. INSERT DRAFT REGISTRATIONS
		// =====================================================

		const { data, error } = await supabase
			.from('revaluation_registrations')
			.insert(drafts)
			.select()

		if (error) {
			console.error('Draft insert error:', error)

			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'Some courses already have draft registrations' },
					{ status: 400 }
				)
			}

			return NextResponse.json({ error: 'Failed to create draft registrations' }, { status: 500 })
		}

		return NextResponse.json(
			{
				success: true,
				data,
				message: `Added ${data.length} course(s) to draft for ${student_register_number}`,
			},
			{ status: 201 }
		)
	} catch (error) {
		console.error('Draft creation error:', error)
		return NextResponse.json({ error: 'Failed to create draft registrations' }, { status: 500 })
	}
}

// =====================================================
// DELETE /api/revaluation/draft-applications
// Remove all draft registrations for a student
// =====================================================

export async function DELETE(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const studentId = searchParams.get('student_id')
	const examinationSessionId = searchParams.get('examination_session_id')

	// Validation
	if (!studentId || !examinationSessionId) {
		return NextResponse.json({ error: 'Student ID and session ID are required' }, { status: 400 })
	}

	try {
		const { error } = await supabase
			.from('revaluation_registrations')
			.delete()
			.eq('student_id', studentId)
			.eq('examination_session_id', examinationSessionId)
			.eq('status', 'Draft')

		if (error) {
			console.error('Draft delete error:', error)
			return NextResponse.json({ error: 'Failed to remove draft registrations' }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			message: 'Draft registrations removed successfully',
		})
	} catch (error) {
		console.error('Draft delete error:', error)
		return NextResponse.json({ error: 'Failed to remove draft registrations' }, { status: 500 })
	}
}
