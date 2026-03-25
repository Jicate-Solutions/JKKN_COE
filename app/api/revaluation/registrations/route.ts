import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	CreateRevaluationApplicationRequest,
	RevaluationFilters,
	RevaluationRegistration,
} from '@/types/revaluation'

// =====================================================
// GET /api/revaluation/registrations
// Fetch revaluation applications with filters
// =====================================================
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters
		const institutionCode = searchParams.get('institution_code')
		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const status = searchParams.get('status')
		const paymentStatus = searchParams.get('payment_status')
		const studentId = searchParams.get('student_id')
		const courseId = searchParams.get('course_id')
		const attemptNumber = searchParams.get('attempt_number')
		const search = searchParams.get('search')

		// Build query
		let query = supabase.from('revaluation_registrations').select('*')

		// Institution filter
		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		// Other filters
		if (examinationSessionId) query = query.eq('examination_session_id', examinationSessionId)
		if (status) query = query.eq('status', status)
		if (paymentStatus) query = query.eq('payment_status', paymentStatus)
		if (studentId) query = query.eq('student_id', studentId)
		if (courseId) query = query.eq('course_id', courseId)
		if (attemptNumber) query = query.eq('attempt_number', parseInt(attemptNumber))

		// Search by student name or register number
		if (search) {
			query = query.or(
				`student_register_number.ilike.%${search}%,student_name.ilike.%${search}%,course_code.ilike.%${search}%`
			)
		}

		// Order by latest first
		query = query.order('application_date', { ascending: false })

		// Override default row limit
		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('[Revaluation Registrations GET] Error:', error)
			return NextResponse.json({ error: 'Failed to fetch revaluation applications' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('[Revaluation Registrations GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// POST /api/revaluation/registrations
// Create revaluation application(s)
// =====================================================
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = (await request.json()) as CreateRevaluationApplicationRequest

		// Validate required fields
		if (!body.institutions_id || !body.examination_session_id || !body.exam_registration_id) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		if (!body.course_offering_ids || body.course_offering_ids.length === 0) {
			return NextResponse.json({ error: 'Select at least one course' }, { status: 400 })
		}

		// Fetch exam registration with student details
		const { data: examReg, error: examRegError } = await supabase
			.from('exam_registrations')
			.select(
				`
				id,
				student_id,
				revaluation_attempts,
				learners:student_id (
					id,
					register_number,
					learner_name
				)
			`
			)
			.eq('id', body.exam_registration_id)
			.single()

		if (examRegError || !examReg) {
			return NextResponse.json({ error: 'Exam registration not found' }, { status: 404 })
		}

		// Fetch institution details
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('institution_code')
			.eq('id', body.institutions_id)
			.single()

		if (instError || !institution) {
			return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
		}

		// Fetch exam session details
		const { data: session, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('session_code')
			.eq('id', body.examination_session_id)
			.single()

		if (sessionError || !session) {
			return NextResponse.json({ error: 'Exam session not found' }, { status: 404 })
		}

		// Fetch fee configuration
		const { data: feeConfig, error: feeError } = await supabase
			.from('revaluation_fee_config')
			.select('*')
			.eq('institutions_id', body.institutions_id)
			.eq('is_active', true)
			.lte('effective_from', new Date().toISOString().split('T')[0])
			.or(`effective_to.is.null,effective_to.gte.${new Date().toISOString().split('T')[0]}`)
			.order('effective_from', { ascending: false })
			.limit(1)
			.maybeSingle()

		if (feeError) {
			console.error('[Revaluation POST] Fee config error:', feeError)
		}

		if (!feeConfig) {
			return NextResponse.json(
				{ error: 'No active fee configuration found for institution' },
				{ status: 400 }
			)
		}

		// Process each course
		const createdApplications: RevaluationRegistration[] = []
		const errors: Array<{ course_offering_id: string; error: string }> = []

		for (const courseOfferingId of body.course_offering_ids) {
			try {
				// Fetch course offering details
				const { data: courseOffering, error: courseError } = await supabase
					.from('course_offerings')
					.select(
						`
						id,
						course_id,
						courses:course_id (
							id,
							course_code,
							course_title
						)
					`
					)
					.eq('id', courseOfferingId)
					.single()

				if (courseError || !courseOffering) {
					errors.push({ course_offering_id: courseOfferingId, error: 'Course not found' })
					continue
				}

				const course = courseOffering.courses as any

				// Check if final marks published
				const { data: finalMarks, error: finalMarksError } = await supabase
					.from('final_marks')
					.select('id, result_status')
					.eq('exam_registration_id', body.exam_registration_id)
					.eq('course_offering_id', courseOfferingId)
					.maybeSingle()

				if (!finalMarks || finalMarks.result_status !== 'Published') {
					errors.push({
						course_offering_id: courseOfferingId,
						error: `Results not published for ${course.course_code}`,
					})
					continue
				}

				// Check existing revaluation attempts for this course
				const { data: existingRevals, error: existingError } = await supabase
					.from('revaluation_registrations')
					.select('attempt_number, status')
					.eq('exam_registration_id', body.exam_registration_id)
					.eq('course_id', courseOffering.course_id)
					.order('attempt_number', { ascending: false })

				if (existingError) {
					errors.push({ course_offering_id: courseOfferingId, error: 'Error checking attempts' })
					continue
				}

				// Calculate next attempt number
				let attemptNumber = 1
				if (existingRevals && existingRevals.length > 0) {
					// Check if max attempts reached
					if (existingRevals.length >= 3) {
						errors.push({
							course_offering_id: courseOfferingId,
							error: `Maximum 3 attempts reached for ${course.course_code}`,
						})
						continue
					}

					// Check if previous revaluation is pending
					const latestReval = existingRevals[0]
					if (latestReval.status !== 'Published' && latestReval.status !== 'Cancelled') {
						errors.push({
							course_offering_id: courseOfferingId,
							error: `Previous revaluation pending for ${course.course_code}`,
						})
						continue
					}

					attemptNumber = latestReval.attempt_number + 1
				}

				// Determine fee based on attempt number
				const feeAmount =
					attemptNumber === 1
						? feeConfig.attempt_1_fee
						: attemptNumber === 2
							? feeConfig.attempt_2_fee
							: feeConfig.attempt_3_fee

				// Get previous revaluation ID (for chaining)
				const previousRevaluationId =
					existingRevals && existingRevals.length > 0 ? existingRevals[0].id : null

				// Create revaluation registration
				const { data: newReval, error: insertError } = await supabase
					.from('revaluation_registrations')
					.insert({
						institutions_id: body.institutions_id,
						examination_session_id: body.examination_session_id,
						exam_registration_id: body.exam_registration_id,
						course_offering_id: courseOfferingId,
						course_id: courseOffering.course_id,
						student_id: examReg.student_id,
						attempt_number: attemptNumber,
						previous_revaluation_id: previousRevaluationId,
						reason_for_revaluation: body.reason_for_revaluation || null,
						fee_amount: feeAmount,
						payment_transaction_id: body.payment_transaction_id || null,
						payment_date: body.payment_date || null,
						payment_status: body.payment_transaction_id ? 'Pending' : 'Pending',
						status: 'Payment Pending',
						// Denormalized fields
						student_register_number: (examReg.learners as any)?.register_number || '',
						student_name: (examReg.learners as any)?.learner_name || '',
						course_code: course.course_code,
						course_title: course.course_title,
						session_code: session.session_code,
						institution_code: institution.institution_code,
					})
					.select()
					.single()

				if (insertError) {
					console.error('[Revaluation POST] Insert error:', insertError)
					errors.push({
						course_offering_id: courseOfferingId,
						error: insertError.message || 'Failed to create application',
					})
					continue
				}

				// Update exam_registrations.revaluation_attempts array
				const currentAttempts = examReg.revaluation_attempts || []
				if (!currentAttempts.includes(attemptNumber)) {
					await supabase
						.from('exam_registrations')
						.update({
							revaluation_attempts: [...currentAttempts, attemptNumber],
						})
						.eq('id', body.exam_registration_id)
				}

				createdApplications.push(newReval)
			} catch (err) {
				console.error('[Revaluation POST] Course processing error:', err)
				errors.push({
					course_offering_id: courseOfferingId,
					error: err instanceof Error ? err.message : 'Unknown error',
				})
			}
		}

		// Return results
		if (createdApplications.length === 0) {
			return NextResponse.json(
				{
					success: false,
					errors,
					message: 'No applications created',
				},
				{ status: 400 }
			)
		}

		return NextResponse.json(
			{
				success: true,
				data: createdApplications,
				errors: errors.length > 0 ? errors : undefined,
				message: `Created ${createdApplications.length} revaluation application(s)`,
			},
			{ status: 201 }
		)
	} catch (error) {
		console.error('[Revaluation Registrations POST] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
