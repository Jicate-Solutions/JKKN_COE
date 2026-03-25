import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// PUT /api/revaluation/draft-applications/[student_id]
// Update draft course selections for a student
// =====================================================

export async function PUT(
	request: Request,
	{ params }: { params: { student_id: string } }
) {
	const supabase = getSupabaseServer()
	const studentId = params.student_id

	try {
		const body = await request.json()

		const {
			examination_session_id,
			institutions_id,
			student_register_number,
			student_name,
			program_code,
			session_code,
			institution_code,
			course_selections, // New course selections
		} = body

		// Validation
		if (!examination_session_id || !institutions_id || !course_selections?.length) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		// =====================================================
		// 1. DELETE EXISTING DRAFT REGISTRATIONS
		// =====================================================

		const { error: deleteError } = await supabase
			.from('revaluation_registrations')
			.delete()
			.eq('student_id', studentId)
			.eq('examination_session_id', examination_session_id)
			.eq('status', 'Draft')

		if (deleteError) {
			console.error('Draft delete error:', deleteError)
			return NextResponse.json(
				{ error: 'Failed to update draft registrations' },
				{ status: 500 }
			)
		}

		// =====================================================
		// 2. GET DUMMY NUMBER
		// =====================================================

		const { data: existingDummy } = await supabase
			.from('student_dummy_numbers')
			.select('dummy_number')
			.eq('student_id', studentId)
			.eq('examination_session_id', examination_session_id)
			.maybeSingle()

		const dummyNumber = existingDummy?.dummy_number || student_register_number

		// =====================================================
		// 3. INSERT NEW DRAFT REGISTRATIONS
		// =====================================================

		const drafts = course_selections.map((course: any) => ({
			institutions_id,
			institution_code,
			examination_session_id,
			exam_registration_id: course.exam_registration_id,
			course_offering_id: course.course_offering_id,
			course_id: course.course_id,
			student_id: studentId,
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

		const { data, error } = await supabase
			.from('revaluation_registrations')
			.insert(drafts)
			.select()

		if (error) {
			console.error('Draft insert error:', error)
			return NextResponse.json(
				{ error: 'Failed to update draft registrations' },
				{ status: 500 }
			)
		}

		return NextResponse.json({
			success: true,
			data,
			message: `Updated draft registrations for ${student_register_number}`,
		})
	} catch (error) {
		console.error('Draft update error:', error)
		return NextResponse.json({ error: 'Failed to update draft registrations' }, { status: 500 })
	}
}
