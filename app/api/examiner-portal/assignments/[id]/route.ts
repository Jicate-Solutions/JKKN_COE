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
		const { assignment, state, canEdit, canReadQuestions } = auth.access

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
				set_label: assignment.set_label,
				status: assignment.status,
				valid_from: assignment.valid_from,
				valid_to: assignment.valid_to,
				order_ref_no: assignment.order_ref_no,
				remuneration: assignment.remuneration,
				return_remarks: assignment.return_remarks,
				submitted_at: assignment.submitted_at,
				accepted_at: assignment.accepted_at,
				checklist: assignment.checklist || null,
				declaration_accepted_at: assignment.declaration_accepted_at,
				claim_submitted_at: assignment.claim_submitted_at,
				session_name: sessionRes.data?.session_name || null,
				session_label: sessionRes.data?.month_year || null,
			},
			window_state: state,
			window_hint: windowHint(assignment.valid_from, assignment.valid_to),
			can_edit: canEdit,
			questions_released: canReadQuestions,
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
