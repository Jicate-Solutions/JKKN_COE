import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { institutionParam } from '@/lib/auth/institution-scope-request'
import { NO_INSTITUTION_ID } from '@/lib/auth/institution-scope'
import { getRequestUser } from '@/lib/auth/server-session'

// Revaluation examiner assignments live in `examiner_assignments`. Its column
// names differ from the ones this API has always spoken (examiner_id,
// deadline, status, assigned_by), so rows are translated on the way out and
// the request is translated on the way in.
//
// Assigning needs migration 20261010_revaluation_examiner_assignments.sql:
// the table originally required the evaluator to be a COE user and the
// programme to be a local `programs` row, which the examiner panel and
// MyJKKN programmes cannot satisfy.

const MIGRATION = '20261010_revaluation_examiner_assignments.sql'

/** The examiner an assignment row names: a panel examiner, or a COE user. */
const assignedTo = (row: Record<string, any>): string | null => row.examiner_id ?? row.evaluator_id ?? null

function toResponse(row: Record<string, any>) {
	return {
		id: row.id,
		examination_session_id: row.examination_session_id,
		examiner_id: assignedTo(row),
		course_id: row.course_id,
		course_offering_id: row.course_offering_id,
		institutions_id: row.institutions_id,
		revaluation_registration_id: row.revaluation_registration_id ?? null,
		assignment_type: row.assignment_type,
		assignment_date: row.assignment_date,
		deadline: row.completion_deadline,
		status: row.assignment_status,
		assigned_by: row.created_by ?? null,
		created_at: row.created_at,
		updated_at: row.updated_at,
	}
}

/** True when an insert failed because the migration above has not been run. */
function schemaNotReady(error: { code?: string; message?: string } | null): boolean {
	if (!error) return false
	const message = error.message || ''
	return (
		(error.code === 'PGRST204' && message.includes('examiner_id')) ||
		(error.code === '42703' && message.includes('examiner_id')) ||
		(error.code === '23502' && message.includes('evaluator_id')) ||
		(error.code === '23503' && message.includes('program_id'))
	)
}

// =====================================================
// GET /api/revaluation/assignments
// Fetch examiner assignments for revaluation with filters
// =====================================================
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// Extract filters
		const institutionCode = await institutionParam(searchParams, 'institution_code')
		const institutionsId = await institutionParam(searchParams, 'institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const examinerId = searchParams.get('examiner_id')
		const status = searchParams.get('status')

		let query = supabase
			.from('examiner_assignments')
			.select('*')
			.eq('assignment_type', 'revaluation')

		// examiner_assignments has no institution_code column — filter by id,
		// resolving a code to its institution first.
		if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		} else if (institutionCode) {
			const { data: institution } = await supabase
				.from('institutions')
				.select('id')
				.eq('institution_code', institutionCode)
				.maybeSingle()
			query = query.eq('institutions_id', institution?.id ?? NO_INSTITUTION_ID)
		}

		if (examinationSessionId) query = query.eq('examination_session_id', examinationSessionId)
		if (status) query = query.eq('assignment_status', status)

		const { data, error } = await query.order('assignment_date', { ascending: false })

		if (error) {
			console.error('[Revaluation Assignments GET] Error:', error)
			return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
		}

		// The examiner may be in either column, so this filter is applied here.
		const rows = (data || []).filter((row) => !examinerId || assignedTo(row) === examinerId)
		return NextResponse.json(rows.map(toResponse))
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
		if (!Array.isArray(body.revaluation_registration_ids) || body.revaluation_registration_ids.length === 0) {
			return NextResponse.json({ error: 'Select at least one revaluation' }, { status: 400 })
		}

		if (!body.examiner_id || typeof body.examiner_id !== 'string') {
			return NextResponse.json({ error: 'Examiner is required' }, { status: 400 })
		}

		const revaluationIds = body.revaluation_registration_ids as string[]
		const examinerId = body.examiner_id as string
		const caller = await getRequestUser()

		// The examiner comes from the examiner panel
		const { data: examiner } = await supabase
			.from('examiners')
			.select('id, full_name, email, mobile, institution_name, is_internal, status')
			.eq('id', examinerId)
			.maybeSingle()

		if (!examiner) {
			return NextResponse.json({ error: 'Examiner not found' }, { status: 404 })
		}
		if (examiner.status !== 'ACTIVE') {
			return NextResponse.json({ error: 'This examiner is not active and cannot be assigned' }, { status: 400 })
		}

		// Fetch all revaluation registrations
		const { data: revaluations, error: revalError } = await supabase
			.from('revaluation_registrations')
			.select(
				`
				id,
				institutions_id,
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

		// The programme of each application comes from its course offering
		const offeringIds = [...new Set(revaluations.map((r) => r.course_offering_id).filter(Boolean))]
		const { data: offerings } = await supabase
			.from('course_offerings')
			.select('id, program_id')
			.in('id', offeringIds)
		const programByOffering = new Map((offerings || []).map((o) => [o.id, o.program_id as string | null]))

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

				// Step 1: Whoever valued this course offering the first time.
				// Regular assignments are recorded per course offering, not per
				// answer script, so every regular evaluator of the offering is
				// kept away from its revaluation.
				const { data: originalAssignments } = await supabase
					.from('examiner_assignments')
					.select('*')
					.eq('course_offering_id', reval.course_offering_id)
					.neq('assignment_type', 'revaluation')

				const originalExaminerIds = new Set<string>()
				for (const row of originalAssignments || []) {
					const id = assignedTo(row)
					if (id) originalExaminerIds.add(id)
				}
				const excludedExaminerIds = new Set<string>(originalExaminerIds)

				// Step 2: Get all previous revaluation examiners for this course
				// Build chain of previous revaluations
				let currentPreviousId = reval.previous_revaluation_id
				const visited = new Set<string>()

				// Walk the chain backwards
				while (currentPreviousId && !visited.has(currentPreviousId)) {
					visited.add(currentPreviousId)

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
							.select('*')
							.eq('id', prevReval.examiner_assignment_id)
							.maybeSingle()

						const previousExaminer = prevAssignment ? assignedTo(prevAssignment) : null
						if (previousExaminer) excludedExaminerIds.add(previousExaminer)
					}

					currentPreviousId = prevReval.previous_revaluation_id
				}

				// Step 3: Check if selected examiner is excluded
				if (excludedExaminerIds.has(examinerId)) {
					errors.push({
						revaluation_id: reval.id,
						error: originalExaminerIds.has(examinerId)
							? 'Examiner was the original evaluator'
							: 'Examiner evaluated previous revaluation attempt',
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
						examination_session_id: reval.examination_session_id,
						course_offering_id: reval.course_offering_id,
						course_id: reval.course_id,
						program_id: programByOffering.get(reval.course_offering_id) ?? null,
						revaluation_registration_id: reval.id,
						examiner_id: examinerId,
						evaluator_type: examiner.is_internal ? 'Internal' : 'External',
						evaluator_name: examiner.full_name,
						evaluator_email: examiner.email,
						evaluator_phone: examiner.mobile,
						evaluator_institution: examiner.institution_name,
						assignment_type: 'revaluation',
						assignment_date: new Date().toISOString().split('T')[0],
						completion_deadline: deadline.toISOString().split('T')[0],
						assignment_status: 'Assigned',
						created_by: caller?.userId ?? null,
					})
					.select()
					.single()

				if (schemaNotReady(assignError)) {
					console.error(`[Assignment POST] Database not ready — run migration ${MIGRATION}:`, assignError)
					return NextResponse.json(
						{
							success: false,
							error: 'Examiner assignment for revaluation is not set up yet. Ask the administrator to run the pending database update.',
							code: 'MIGRATION_REQUIRED',
						},
						{ status: 503 }
					)
				}

				if (assignError) {
					console.error('[Assignment POST] Error:', assignError)
					errors.push({
						revaluation_id: reval.id,
						// 23505: the unique index allows one live examiner per application
						error: assignError.code === '23505'
							? 'This revaluation already has an examiner assigned'
							: 'Failed to create assignment',
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
					error: 'Failed to assign this revaluation',
				})
			}
		}

		// Return results
		if (successfulAssignments.length === 0) {
			return NextResponse.json(
				{
					success: false,
					// The screen shows `error`; say why the first one failed.
					error: errors[0]?.error || 'No assignments created',
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
