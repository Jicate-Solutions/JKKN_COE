// Examiner portal — one assignment, with the question paper when the window is
// open.
//
// GET /api/examiner-portal/assignments/:id
//
// Two levels of access, as the spec asks (§7):
//   • the assignment, the order particulars, the checklist and claim state are
//     readable whenever the examiner is signed in
//   • the QUESTIONS are returned only while valid_from ≤ now < valid_to
//
// Outside the window the response still succeeds — with questions omitted and
// window_state saying why — so the portal can show the order and the deadline
// instead of an error page.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'
import { windowHint } from '@/lib/qp-portal/ist'
import { getAllPortalContent } from '@/lib/qp-portal/content'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const auth = await requireAssignment(req, id, { action: 'open assignment' })
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const { assignment, state, canEdit, canReadQuestions, stage, canCompleteSubmission } = auth.access

		const [paperRes, partsRes, outcomesRes, sessionRes] = await Promise.all([
			supabase
				.from('ese_question_papers')
				// updated_at is what the editor sends back as base_updated_at — without
				// it the optimistic-concurrency guard on save is silently disabled.
				.select('id, status, subject_title, course_code, set_label, semester, program_code, max_marks, duration_minutes, default_font, questions, submitted_at, updated_at')
				.eq('id', assignment.paper_id)
				.maybeSingle(),
			assignment.template_id
				? supabase
						.from('ia_template_parts')
						.select('*')
						.eq('template_id', assignment.template_id)
						.order('display_order', { ascending: true })
				: Promise.resolve({ data: [] as any[] }),
			assignment.course_id
				? supabase
						.from('ia_course_outcomes')
						.select('id, co_code, co_description, display_order')
						.eq('course_id', assignment.course_id)
						.eq('is_active', true)
						.order('display_order', { ascending: true })
				: Promise.resolve({ data: [] as any[] }),
			assignment.examination_session_id
				? supabase
						.from('examination_sessions')
						.select('id, session_name, session_code, month_year')
						.eq('id', assignment.examination_session_id)
						.maybeSingle()
				: Promise.resolve({ data: null }),
		])

		const paper = paperRes.data
		if (!paper) {
			return NextResponse.json({ error: 'The question paper for this assignment is missing.' }, { status: 404 })
		}

		const allQuestions = Array.isArray(paper.questions) ? paper.questions : []
		const questions = canReadQuestions
			? [...allQuestions].sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))
			: []

		const content = await getAllPortalContent(assignment.institutions_id, assignment.examination_session_id)

		await logAccess(req, {
			action: 'paper_view',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: assignment.id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			detail: { window_state: state, questions_released: canReadQuestions },
		})

		return NextResponse.json({
			assignment: {
				id: assignment.id,
				course_code: assignment.course_code,
				subject_title: assignment.subject_title,
				program_code: assignment.program_code,
				semester: assignment.semester,
				// Omitted on purpose — see the list route: the examiner must not learn
				// that parallel sets of this paper exist.
				status: assignment.status,
				valid_from: assignment.valid_from,
				valid_to: assignment.valid_to,
				order_ref_no: assignment.order_ref_no,
				remuneration: assignment.remuneration,
				// Assignment type, fees and the examiner's confirmed willingness —
				// what drives which fields are open and what the claim comes to.
				assignment_type: assignment.assignment_type || 'question_paper',
				qp_fee: assignment.qp_fee ?? null,
				ak_fee: assignment.ak_fee ?? null,
				qp_willing: assignment.qp_willing ?? null,
				ak_willing: assignment.ak_willing ?? null,
				willingness_confirmed_at: assignment.willingness_confirmed_at || null,
				claim_amount: assignment.claim_amount ?? null,
				return_remarks: assignment.return_remarks,
				reopened_at: assignment.reopened_at || null,
				reopen_reason: assignment.reopen_reason || null,
				reopen_scope: assignment.reopen_scope || null,
				type_changed_at: assignment.type_changed_at || null,
				type_change_reason: assignment.type_change_reason || null,
				paper_version: assignment.paper_version || 0,
				submitted_at: assignment.submitted_at,
				accepted_at: assignment.accepted_at,
				checklist: assignment.checklist || null,
				declaration_accepted_at: assignment.declaration_accepted_at,
				assigned_at: assignment.assigned_at,
				order_issued_at: assignment.order_issued_at,

				// Submission wizard
				submission_stage: stage,
				checklist_completed_at: assignment.checklist_completed_at,
				signed_at: assignment.signed_at,
				final_submitted_at: assignment.final_submitted_at,

				// Claim. The bank snapshot IS returned here — it is the examiner's own
				// account, on their own claim, and the Claim screen shows it back to
				// them so they can see what was submitted.
				claim_status: assignment.claim_status || 'pending',
				claim_submitted_at: assignment.claim_submitted_at,
				claim_account_holder: assignment.claim_account_holder,
				claim_bank_name: assignment.claim_bank_name,
				claim_account_number: assignment.claim_account_number,
				claim_branch: assignment.claim_branch,
				claim_ifsc: assignment.claim_ifsc,
				claim_approved_at: assignment.claim_approved_at,
				claim_remarks: assignment.claim_remarks,
				claim_version: assignment.claim_version || 0,
				claim_reopened_at: assignment.claim_reopened_at || null,
				claim_reopen_reason: assignment.claim_reopen_reason || null,
				claim_reopen_remarks: assignment.claim_reopen_remarks || null,
				payment_completed_at: assignment.payment_completed_at,
				payment_reference: assignment.payment_reference,
				payment_amount: assignment.payment_amount,

				session_name: sessionRes.data?.session_name || null,
				session_label: sessionRes.data?.month_year || null,
			},
			window_state: state,
			window_hint: windowHint(assignment.valid_from, assignment.valid_to),
			can_edit: canEdit,
			questions_released: canReadQuestions,
			can_complete_submission: canCompleteSubmission,
			paper: {
				id: paper.id,
				status: paper.status,
				max_marks: paper.max_marks,
				duration_minutes: paper.duration_minutes,
				default_font: paper.default_font,
				question_total: allQuestions.length,
				question_done: allQuestions.filter((q: any) => String(q?.question_text || '').trim() !== '').length,
				updated_at: paper.updated_at || null,
			},
			questions,
			template_parts: partsRes.data || [],
			course_outcomes: outcomesRes.data || [],
			content,
		})
	} catch (error) {
		console.error('[QP portal] assignment detail failed for', id, error)
		return NextResponse.json({ error: 'Could not open this assignment.' }, { status: 500 })
	}
}
