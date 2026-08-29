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
				.from('ia_question_papers')
				.select('id, status, questions, max_marks, duration_minutes')
				.in('id', paperIds.slice(i, i + 200))
			for (const p of papers || []) {
				const qs = Array.isArray(p.questions) ? p.questions : []
				progressByPaper.set(p.id, {
					total: qs.length,
					done: qs.filter((q: any) => String(q?.question_text || '').trim() !== '').length,
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
				set_label: r.set_label,
				status: r.status,
				valid_from: r.valid_from,
				valid_to: r.valid_to,
				window_state: state,
				window_hint: windowHint(r.valid_from, r.valid_to, now),
				order_ref_no: r.order_ref_no,
				remuneration: r.remuneration,
				return_remarks: r.return_remarks,
				submitted_at: r.submitted_at,
				accepted_at: r.accepted_at,
				claim_submitted_at: r.claim_submitted_at,
				declaration_accepted_at: r.declaration_accepted_at,
				has_checklist: !!r.checklist && Object.keys(r.checklist).length > 0,
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
