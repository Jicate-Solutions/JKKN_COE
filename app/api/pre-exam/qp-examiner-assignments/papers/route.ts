// Assignable end-semester question papers for a session.
//
// GET /api/pre-exam/qp-examiner-assignments/papers
//     ?institutions_id=&examination_session_id=&program_code=&semester=
//
// Returns the papers that have already been GENERATED for the session — one row
// per (course offering × set) that exists in ese_question_papers — each with the
// format it was built from and the assignment covering it, if any.
//
// This replaced the old /courses endpoint, which listed course offerings and
// inferred a template for each. The template is now chosen deliberately in the
// Generate step, so there is nothing to infer here: a subject that has no paper
// yet simply cannot be assigned, and the count of those is reported so the
// screen can send the CoE back to Generate.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { windowState } from '@/lib/qp-portal/ist'
import { hasTheoryPaper } from '@/lib/ia/course-type-applicability'

export const dynamic = 'force-dynamic'

/** Read every row of a query in pages — Supabase caps a single fetch at 1000. */
async function fetchAll(build: (from: number, to: number) => any): Promise<any[]> {
	const PAGE = 1000
	const out: any[] = []
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await build(from, from + PAGE - 1)
		if (error) throw new Error(error.message)
		const rows = data || []
		out.push(...rows)
		if (rows.length < PAGE) break
	}
	return out
}

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const programCode = searchParams.get('program_code')
		const semester = searchParams.get('semester')

		if (!institutionsId || !sessionId) {
			return NextResponse.json(
				{ error: 'institutions_id and examination_session_id are required' },
				{ status: 400 }
			)
		}

		// ── The generated papers ──────────────────────────────────────────────
		const papers = await fetchAll((from, to) => {
			let q = supabase
				.from('ese_question_papers')
				.select('*')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)
				.order('course_code', { ascending: true })
				.order('set_number', { ascending: true })
				.order('id', { ascending: true })
			if (programCode) q = q.eq('program_code', programCode)
			if (semester) q = q.eq('semester', Number(semester))
			return q.range(from, to)
		})

		if (papers.length === 0) {
			return NextResponse.json({
				data: [],
				ungenerated_count: 0,
				message:
					'No end-semester question papers have been generated for this session yet. Use the Generate Papers tab first — a paper must exist before an examiner can be appointed to it.',
			})
		}

		// ── Formats ───────────────────────────────────────────────────────────
		const templateIds = [...new Set(papers.map(p => p.template_id).filter(Boolean))]
		const templateById = new Map<string, any>()
		for (let i = 0; i < templateIds.length; i += 200) {
			const { data } = await supabase
				.from('ia_paper_templates')
				.select('id, template_name, template_code, total_marks, duration_minutes')
				.in('id', templateIds.slice(i, i + 200))
			for (const t of data || []) templateById.set(t.id, t)
		}

		// ── Assignments + their examiners ─────────────────────────────────────
		const paperIds = papers.map(p => p.id)
		const assignments: any[] = []
		for (let i = 0; i < paperIds.length; i += 200) {
			const { data } = await supabase
				.from('ia_qp_assignments')
				.select('id, paper_id, examiner_id, examiner_kind, status, valid_from, valid_to, order_ref_no')
				.in('paper_id', paperIds.slice(i, i + 200))
			assignments.push(...(data || []))
		}
		// A cancelled assignment frees the paper to be assigned again, so it must
		// not present as "already assigned" — but the row still exists, and the
		// paper-unique constraint means the caller has to delete it first.
		const liveByPaper = new Map<string, any>()
		const cancelledByPaper = new Map<string, any>()
		for (const a of assignments) {
			if (a.status === 'cancelled') cancelledByPaper.set(a.paper_id, a)
			else liveByPaper.set(a.paper_id, a)
		}

		const examinerIds = [...new Set(assignments.map(a => a.examiner_id).filter(Boolean))]
		const examinerById = new Map<string, any>()
		for (let i = 0; i < examinerIds.length; i += 200) {
			const { data } = await supabase
				.from('examiners')
				.select('id, full_name, email, designation, department')
				.in('id', examinerIds.slice(i, i + 200))
			for (const e of data || []) examinerById.set(e.id, e)
		}

		const now = new Date()
		const rows = papers.map(p => {
			const template = templateById.get(p.template_id)
			const live = liveByPaper.get(p.id)
			const examiner = live ? examinerById.get(live.examiner_id) : null
			const qs = Array.isArray(p.questions) ? p.questions : []
			const authoredCount = qs.filter((q: any) => String(q?.question_text || '').trim() !== '').length

			return {
				paper_id: p.id,
				course_offering_id: p.course_offering_id,
				course_id: p.course_id,
				course_code: p.course_code,
				subject_title: p.subject_title,
				program_code: p.program_code,
				semester: p.semester,
				set_number: p.set_number,
				set_label: p.set_label,
				paper_status: p.status,
				max_marks: p.max_marks,
				duration_minutes: p.duration_minutes,
				template_id: p.template_id,
				template_name: template?.template_name || null,
				template_total_marks: template?.total_marks ?? p.max_marks ?? null,
				authored: authoredCount > 0,
				authored_count: authoredCount,
				question_count: qs.length,
				/** A cancelled assignment still occupies the paper-unique slot. */
				cancelled_assignment_id: cancelledByPaper.get(p.id)?.id || null,
				assignment: live
					? {
							id: live.id,
							status: live.status,
							examiner_kind: live.examiner_kind,
							valid_from: live.valid_from,
							valid_to: live.valid_to,
							window_state: windowState(live.valid_from, live.valid_to, now),
							order_ref_no: live.order_ref_no,
							examiner_name: examiner?.full_name || null,
							examiner_email: examiner?.email || null,
						}
					: null,
			}
		})

		// How many ESE subjects of this session still have no paper — the number
		// that sends the CoE back to the Generate tab. Only theory courses count:
		// practicals never get a question paper, so including them would leave a
		// permanent non-zero "still to generate" that can never be worked off.
		let ungenerated = 0
		try {
			const offerings = await fetchAll((from, to) => {
				let q = supabase
					.from('course_offerings')
					.select('id, course_code')
					.eq('institutions_id', institutionsId)
					.eq('examination_session_id', sessionId)
					.eq('is_active', true)
					.order('id', { ascending: true })
				if (programCode) q = q.eq('program_code', programCode)
				if (semester) q = q.eq('semester', Number(semester))
				return q.range(from, to)
			})

			const codes = [...new Set(offerings.map(o => o.course_code).filter(Boolean))]
			const categoryByCode = new Map<string, string | null>()
			for (let i = 0; i < codes.length; i += 200) {
				const { data } = await supabase
					.from('courses')
					.select('course_code, course_category')
					.eq('institutions_id', institutionsId)
					.in('course_code', codes.slice(i, i + 200))
				for (const c of data || []) categoryByCode.set(c.course_code, c.course_category)
			}

			const withPaper = new Set(papers.map(p => p.course_offering_id))
			ungenerated = offerings.filter(
				o => !withPaper.has(o.id) && hasTheoryPaper(categoryByCode.get(o.course_code))
			).length
		} catch {
			// A count is a convenience — never fail the list over it.
			ungenerated = 0
		}

		return NextResponse.json({ data: rows, count: rows.length, ungenerated_count: ungenerated })
	} catch (error: any) {
		console.error('[QP assign] papers route failed:', error)
		return NextResponse.json(
			{ error: error?.message || 'Failed to load assignable question papers' },
			{ status: 500 }
		)
	}
}
