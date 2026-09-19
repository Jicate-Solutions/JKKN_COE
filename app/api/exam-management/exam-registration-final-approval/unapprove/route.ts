import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import type { FinalUnapprovalResult } from '@/types/exam-registration-final-approval'

/**
 * Undo a Final Exam Registration Approval
 * =====================================================
 * POST - send learners approved by mistake back to the pending list. Their
 *        'Approved' papers return to fee_paid = false / 'Applied', the
 *        learner-level exam_registration_fee_details row is removed, and the
 *        undone approval is kept in exam_registration_approval_logs - in ONE
 *        database transaction (unapprove_final_exam_registration).
 *
 * Migration: supabase/migrations/20260919_final_approval_unapprove.sql
 */

const UNAPPROVE_PERMISSION = 'page.exam_management.exam_registration_final_approval.unapprove'

const MAX_LEARNERS_PER_REQUEST = 1000
const MAX_REASON_LENGTH = 1000

const MIGRATION_HINT =
	'Run supabase/migrations/20260919_final_approval_unapprove.sql in the Supabase SQL Editor (creates exam_registration_approval_logs and unapprove_final_exam_registration).'

export async function POST(request: Request) {
	try {
		const perm = await requireUserPermission(UNAPPROVE_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const body = await request.json()

		const institutions_id = String(body.institutions_id || '')
		const examination_session_id = String(body.examination_session_id || '')
		const reason = String(body.reason || '').trim()
		const registerNumbers = [...new Set(
			(Array.isArray(body.register_numbers) ? body.register_numbers : [])
				.map((r: unknown) => String(r || '').trim().toUpperCase())
				.filter(Boolean)
		)] as string[]

		if (!institutions_id) return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		if (!examination_session_id) return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		if (registerNumbers.length === 0) {
			return NextResponse.json({ error: 'Select at least one learner to unapprove' }, { status: 400 })
		}
		if (registerNumbers.length > MAX_LEARNERS_PER_REQUEST) {
			return NextResponse.json(
				{ error: `Too many learners in one request (${registerNumbers.length}). Unapprove in batches of at most ${MAX_LEARNERS_PER_REQUEST}.` },
				{ status: 400 }
			)
		}
		if (!reason) return NextResponse.json({ error: 'Enter the reason for unapproving' }, { status: 400 })
		if (reason.length > MAX_REASON_LENGTH) {
			return NextResponse.json({ error: `Reason is too long (${MAX_REASON_LENGTH} characters at most)` }, { status: 400 })
		}

		const { data, error } = await supabase.rpc('unapprove_final_exam_registration', {
			p_institutions_id: institutions_id,
			p_examination_session_id: examination_session_id,
			p_register_numbers: registerNumbers,
			p_reason: reason,
			p_performed_by: perm.userId || null,
		})

		if (error) {
			const msg = error.message || ''
			const missing =
				error.code === 'PGRST202'
				|| /could not find the function/i.test(msg)
				|| (/exam_registration_approval_logs/i.test(msg) && /does not exist/i.test(msg))
			if (missing) {
				return NextResponse.json({ error: `Unapprove is not set up yet. ${MIGRATION_HINT}` }, { status: 503 })
			}
			console.error('[final-approval] unapprove_final_exam_registration failed:', error)
			// P0001 carries the function's own user-facing message (stale selection etc.)
			return NextResponse.json({ error: msg || 'Unapprove failed' }, { status: error.code === 'P0001' ? 409 : 500 })
		}

		const studentsUnapproved = Number((data as any)?.students_unapproved ?? 0)
		const subjectsUpdated = Number((data as any)?.subjects_updated ?? 0)

		const result: FinalUnapprovalResult = {
			success: studentsUnapproved === registerNumbers.length,
			message: `Learners moved back to pending: ${studentsUnapproved}, subjects updated: ${subjectsUpdated}.`,
			students_unapproved: studentsUnapproved,
			subjects_updated: subjectsUpdated,
			// Selected learners with no approval row any more (someone else got there first)
			not_found: registerNumbers.length - studentsUnapproved,
		}

		return NextResponse.json(result)
	} catch (e) {
		console.error('[final-approval] unapprove POST error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
