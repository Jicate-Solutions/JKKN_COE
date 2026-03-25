import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/assignments
// Fetch examiner assignments for revaluation with filters
// =====================================================
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters
		const institutionCode = searchParams.get('institution_code')
		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const examinerId = searchParams.get('examiner_id')
		const status = searchParams.get('status')

		// Build query for revaluation assignments
		let query = supabase
			.from('examiner_assignments')
			.select(
				`
				id,
				examination_session_id,
				examiner_id,
				course_id,
				institution_code,
				institutions_id,
				assignment_type,
				assignment_date,
				deadline,
				status,
				assigned_by,
				created_at,
				updated_at
			`
			)
			.eq('assignment_type', 'revaluation')

		// Institution filter
		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		} else if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		// Other filters
		if (examinationSessionId) query = query.eq('examination_session_id', examinationSessionId)
		if (examinerId) query = query.eq('examiner_id', examinerId)
		if (status) query = query.eq('status', status)

		// Order by latest first
		query = query.order('assignment_date', { ascending: false })

		// Override default row limit
		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('[Revaluation Assignments GET] Error:', error)
			return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('[Revaluation Assignments GET] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// =====================================================
// POST /api/revaluation/assignments
// Assign examiner to revaluation application(s)
// Implements examiner exclusion logic (original + previous revaluation examiners)
// =====================================================
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		// Validate required fields
		if (!body.revaluation_registration_ids || body.revaluation_registration_ids.length === 0) {
			return NextResponse.json({ error: 'Select at least one revaluation' }, { status: 400 })
		}

		if (!body.examiner_id) {
			return NextResponse.json({ error: 'Examiner is required' }, { status: 400 })
		}

		const revaluationIds = body.revaluation_registration_ids as string[]
		const examinerId = body.examiner_id as string

		// Fetch all revaluation registrations
		const { data: revaluations, error: revalError } = await supabase
			.from('revaluation_registrations')
			.select(
				`
				id,
				institutions_id,
				institution_code,
				examination_session_id,
				exam_registration_id,
				course_offering_id,
				course_id,
				student_id,
				attempt_number,
				previous_revaluation_id,
				status
			`
			)
			.in('id', revaluationIds)

		if (revalError || !revaluations || revaluations.length === 0) {
			return NextResponse.json({ error: 'Revaluation applications not found' }, { status: 404 })
		}

		const successfulAssignments: any[] = []
		const errors: Array<{ revaluation_id: string; error: string }> = []

		// Process each revaluation
		for (const reval of revaluations) {
			try {
				// Check status
				if (reval.status !== 'Approved' && reval.status !== 'Payment Verified') {
					errors.push({
						revaluation_id: reval.id,
						error: 'Not approved - current status: ' + reval.status,
					})
					continue
				}

				// =====================================================
				// EXAMINER EXCLUSION LOGIC
				// =====================================================

				// Step 1: Get original examiner for this course
				const { data: originalAssignment } = await supabase
					.from('examiner_assignments')
					.select('examiner_id')
					.eq('exam_registration_id', reval.exam_registration_id)
					.eq('course_id', reval.course_id)
					.eq('assignment_type', 'regular')
					.maybeSingle()

				const excludedExaminerIds = new Set<string>()

				if (originalAssignment?.examiner_id) {
					excludedExaminerIds.add(originalAssignment.examiner_id)
				}

				// Step 2: Get all previous revaluation examiners for this course
				// Build chain of previous revaluations
				const previousRevalIds: string[] = []
				let currentPreviousId = reval.previous_revaluation_id

				// Walk the chain backwards
				while (currentPreviousId) {
					previousRevalIds.push(currentPreviousId)

					// Get the previous revaluation's previous_revaluation_id
					const { data: prevReval } = await supabase
						.from('revaluation_registrations')
						.select('previous_revaluation_id, examiner_assignment_id')
						.eq('id', currentPreviousId)
						.maybeSingle()

					if (!prevReval) break

					// Get examiner for this previous revaluation
					if (prevReval.examiner_assignment_id) {
						const { data: prevAssignment } = await supabase
							.from('examiner_assignments')
							.select('examiner_id')
							.eq('id', prevReval.examiner_assignment_id)
							.maybeSingle()

						if (prevAssignment?.examiner_id) {
							excludedExaminerIds.add(prevAssignment.examiner_id)
						}
					}

					currentPreviousId = prevReval.previous_revaluation_id
				}

				// Step 3: Check if selected examiner is excluded
				if (excludedExaminerIds.has(examinerId)) {
					const attemptNumber = reval.attempt_number
					let reason = 'Examiner already evaluated this course'
					if (originalAssignment?.examiner_id === examinerId) {
						reason = 'Examiner was the original evaluator'
					} else {
						reason = `Examiner evaluated previous revaluation attempt`
					}
					errors.push({
						revaluation_id: reval.id,
						error: reason,
					})
					continue
				}

				// =====================================================
				// CREATE ASSIGNMENT
				// =====================================================

				// Calculate deadline (30 days from now)
				const deadline = new Date()
				deadline.setDate(deadline.getDate() + 30)

				// Create examiner assignment
				const { data: assignment, error: assignError } = await supabase
					.from('examiner_assignments')
					.insert({
						institutions_id: reval.institutions_id,
						institution_code: reval.institution_code,
						examination_session_id: reval.examination_session_id,
						exam_registration_id: reval.exam_registration_id,
						course_id: reval.course_id,
						examiner_id: examinerId,
						assignment_type: 'revaluation',
						assignment_date: new Date().toISOString().split('T')[0],
						deadline: deadline.toISOString().split('T')[0],
						status: 'Assigned',
						assigned_by: body.assigned_by_user_id || null,
					})
					.select()
					.single()

				if (assignError) {
					console.error('[Assignment POST] Error:', assignError)
					errors.push({
						revaluation_id: reval.id,
						error: assignError.message || 'Failed to create assignment',
					})
					continue
				}

				// Update revaluation registration
				const { error: updateError } = await supabase
					.from('revaluation_registrations')
					.update({
						examiner_assignment_id: assignment.id,
						assigned_date: new Date().toISOString(),
						evaluation_deadline: deadline.toISOString().split('T')[0],
						status: 'Assigned',
						updated_at: new Date().toISOString(),
					})
					.eq('id', reval.id)

				if (updateError) {
					console.error('[Assignment POST] Revaluation update error:', updateError)
					// Rollback assignment
					await supabase.from('examiner_assignments').delete().eq('id', assignment.id)
					errors.push({
						revaluation_id: reval.id,
						error: 'Failed to update revaluation status',
					})
					continue
				}

				successfulAssignments.push({
					revaluation_id: reval.id,
					assignment_id: assignment.id,
					examiner_id: examinerId,
					deadline: deadline.toISOString().split('T')[0],
				})
			} catch (err) {
				console.error('[Assignment POST] Processing error:', err)
				errors.push({
					revaluation_id: reval.id,
					error: err instanceof Error ? err.message : 'Unknown error',
				})
			}
		}

		// Return results
		if (successfulAssignments.length === 0) {
			return NextResponse.json(
				{
					success: false,
					errors,
					message: 'No assignments created',
				},
				{ status: 400 }
			)
		}

		return NextResponse.json(
			{
				success: true,
				data: successfulAssignments,
				errors: errors.length > 0 ? errors : undefined,
				message: `Assigned ${successfulAssignments.length} revaluation(s) to examiner`,
			},
			{ status: 201 }
		)
	} catch (error) {
		console.error('[Revaluation Assignments POST] Exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
