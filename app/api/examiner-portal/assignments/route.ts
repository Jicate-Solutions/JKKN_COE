// Examiner portal — the examiner's own assignments.
//
// GET /api/examiner-portal/assignments
//
// Returns only the rows belonging to the signed-in examiner. Deliberately never
// includes question text: the dashboard is readable at any time, whereas the
// paper itself is released only inside the window by the [id] routes.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireExaminer, logAccess } from '@/lib/qp-portal/guard'
import { windowState, windowHint } from '@/lib/qp-portal/ist'
import { countAuthored } from '@/lib/ia/sub-questions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
	const auth = await requireExaminer(req)
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()

		const { data, error } = await supabase
			.from('ia_qp_assignments')
			.select('*')
			.eq('examiner_id', auth.examiner.id)
			.neq('status', 'cancelled')
			.order('valid_to', { ascending: true })
			.order('id', { ascending: true })
		if (error) {
			console.error('[QP portal] assignment list failed:', error.message)
			return NextResponse.json({ error: 'Could not load your assignments.' }, { status: 500 })
		}

		const rows = data || []

		// Progress counts come from the paper, but the question TEXT never leaves
		// the server here — only how many slots are filled.
		const paperIds = rows.map(r => r.paper_id).filter(Boolean)
		const progressByPaper = new Map<string, { total: number; done: number; status: string }>()
		for (let i = 0; i < paperIds.length; i += 200) {
			const { data: papers } = await supabase
				.from('ese_question_papers')
				.select('id, status, questions, max_marks, duration_minutes')
				.in('id', paperIds.slice(i, i + 200))
			for (const p of papers || []) {
				const qs = Array.isArray(p.questions) ? p.questions : []
				progressByPaper.set(p.id, {
					total: qs.length,
					done: countAuthored(qs),
					status: p.status,
				})
			}
		}

		const sessionIds = [...new Set(rows.map(r => r.examination_session_id).filter(Boolean))]
		const sessionById = new Map<string, any>()
		if (sessionIds.length) {
			const { data: sessions } = await supabase
				.from('examination_sessions')
				.select('id, session_name, session_code, month_year')
				.in('id', sessionIds)
			for (const s of sessions || []) sessionById.set(s.id, s)
		}

		const now = new Date()
		const assignments = rows.map(r => {
			const progress = progressByPaper.get(r.paper_id) || { total: 0, done: 0, status: 'draft' }
			const state = windowState(r.valid_from, r.valid_to, now)
			return {
				id: r.id,
				course_code: r.course_code,
				subject_title: r.subject_title,
				program_code: r.program_code,
				semester: r.semester,
				// set_label is deliberately NOT sent. A subject may be set by several
				// examiners in parallel as Set A / Set B; telling one of them which set
				// they hold would reveal that the others exist.
				status: r.status,
				valid_from: r.valid_from,
				valid_to: r.valid_to,
				window_state: state,
				window_hint: windowHint(r.valid_from, r.valid_to, now),
				order_ref_no: r.order_ref_no,
				order_issued_at: r.order_issued_at,
				assigned_at: r.assigned_at,
				remuneration: r.remuneration,
				assignment_type: r.assignment_type || 'question_paper',
				qp_fee: r.qp_fee ?? null,
				ak_fee: r.ak_fee ?? null,
				qp_willing: r.qp_willing ?? null,
				ak_willing: r.ak_willing ?? null,
				willingness_confirmed_at: r.willingness_confirmed_at || null,
				claim_amount: r.claim_amount ?? null,
				return_remarks: r.return_remarks,
				submitted_at: r.submitted_at,
				accepted_at: r.accepted_at,
				declaration_accepted_at: r.declaration_accepted_at,
				has_checklist: !!r.checklist && Object.keys(r.checklist).length > 0,

				// Submission wizard — the dashboard uses this to show "resume where
				// you left off" rather than a bare Submitted badge.
				submission_stage: r.submission_stage || 'authoring',
				checklist_completed_at: r.checklist_completed_at,
				signed_at: r.signed_at,
				final_submitted_at: r.final_submitted_at,

				// Claim. Bank details are NOT sent to the list — the Claim screen
				// fetches them for one assignment at a time.
				claim_status: r.claim_status || 'pending',
				claim_submitted_at: r.claim_submitted_at,
				// The examiner's own account, on their own claim — returned so a later
				// claim starts from the details they last submitted.
				claim_account_holder: r.claim_account_holder || null,
				claim_bank_name: r.claim_bank_name || null,
				claim_account_number: r.claim_account_number || null,
				claim_branch: r.claim_branch || null,
				claim_ifsc: r.claim_ifsc || null,
				claim_version: r.claim_version || 0,
				claim_reopened_at: r.claim_reopened_at || null,
				claim_reopen_reason: r.claim_reopen_reason || null,
				claim_reopen_remarks: r.claim_reopen_remarks || null,
				paper_version: r.paper_version || 0,
				reopen_reason: r.reopen_reason || null,
				reopen_scope: r.reopen_scope || null,
				type_changed_at: r.type_changed_at || null,
				claim_approved_at: r.claim_approved_at,
				claim_remarks: r.claim_remarks,
				payment_completed_at: r.payment_completed_at,
				payment_reference: r.payment_reference,
				payment_amount: r.payment_amount,
				session_name: sessionById.get(r.examination_session_id)?.session_name || null,
				session_label: sessionById.get(r.examination_session_id)?.month_year || null,
				paper_status: progress.status,
				question_total: progress.total,
				question_done: progress.done,
			}
		})

		await logAccess(req, {
			action: 'assignment_list',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			detail: { count: assignments.length },
		})

		return NextResponse.json({ data: assignments, count: assignments.length })
	} catch (error) {
		console.error('[QP portal] assignments route failed:', error)
		return NextResponse.json({ error: 'Could not load your assignments.' }, { status: 500 })
	}
}
