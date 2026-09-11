// Bulk examiner orders — who is to be e-mailed, grouped by examiner.
//
// GET /api/pre-exam/qp-examiner-assignments/email?institutions_id=&examination_session_id=
//
// One row per examiner with every live appointment they hold in the session,
// and whether each has had its order e-mailed. The E-mail Orders tab sends ONE
// e-mail per examiner carrying all of them.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'

export const dynamic = 'force-dynamic'

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

export interface OrderEmailAssignment {
	id: string
	course_code: string | null
	subject_title: string | null
	set_label: string | null
	semester: number | null
	program_code: string | null
	assignment_type: string
	status: string
	order_ref_no: string | null
	order_email_sent_at: string | null
	order_issued_at: string | null
	valid_from: string
	valid_to: string
}

export interface OrderEmailExaminerRow {
	examiner_id: string
	full_name: string
	email: string | null
	kind: 'internal' | 'external'
	designation: string | null
	department: string | null
	institution_name: string | null
	assignments: OrderEmailAssignment[]
	sent_count: number
	pending_count: number
	last_sent_at: string | null
	last_email_status: 'SENT' | 'FAILED' | null
	last_email_at: string | null
	last_email_error: string | null
}

export async function GET(req: NextRequest) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		if (!institutionsId || !sessionId) {
			return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()
		const { data: rows, error } = await supabase
			.from('ia_qp_assignments')
			.select(
				'id, examiner_id, examiner_kind, course_code, subject_title, set_label, semester, program_code, assignment_type, status, order_ref_no, order_email_sent_at, order_issued_at, valid_from, valid_to'
			)
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.neq('status', 'cancelled')
			.order('course_code', { ascending: true })
			.range(0, 4999)
		if (error) return NextResponse.json({ error: error.message }, { status: 500 })

		const examinerIds = [...new Set((rows || []).map(r => r.examiner_id).filter(Boolean))]
		if (examinerIds.length === 0) return NextResponse.json({ data: [] })

		const [{ data: examiners }, { data: emailLogs }] = await Promise.all([
			supabase
				.from('examiners')
				.select('id, full_name, email, designation, department, institution_name')
				.in('id', examinerIds),
			supabase
				.from('examiner_email_logs')
				.select('examiner_id, status, error_message, created_at')
				.in('examiner_id', examinerIds)
				.eq('board_type', 'QP_SETTER_ORDER')
				.order('created_at', { ascending: false })
				.range(0, 1999),
		])

		const exById = new Map<string, any>((examiners || []).map(e => [e.id, e]))
		const lastLog = new Map<string, any>()
		for (const l of emailLogs || []) if (!lastLog.has(l.examiner_id)) lastLog.set(l.examiner_id, l)

		const grouped = new Map<string, OrderEmailExaminerRow>()
		for (const r of rows || []) {
			let g = grouped.get(r.examiner_id)
			if (!g) {
				const e = exById.get(r.examiner_id) || {}
				const log = lastLog.get(r.examiner_id)
				g = {
					examiner_id: r.examiner_id,
					full_name: e.full_name || 'Unknown examiner',
					email: e.email || null,
					kind: r.examiner_kind === 'internal' ? 'internal' : 'external',
					designation: e.designation || null,
					department: e.department || null,
					institution_name: e.institution_name || null,
					assignments: [],
					sent_count: 0,
					pending_count: 0,
					last_sent_at: null,
					last_email_status: log ? (log.status === 'SENT' ? 'SENT' : 'FAILED') : null,
					last_email_at: log?.created_at || null,
					last_email_error: log?.status === 'FAILED' ? log.error_message || null : null,
				}
				grouped.set(r.examiner_id, g)
			}
			g.assignments.push({
				id: r.id,
				course_code: r.course_code,
				subject_title: r.subject_title,
				set_label: r.set_label,
				semester: r.semester,
				program_code: r.program_code,
				assignment_type: r.assignment_type || 'question_paper',
				status: r.status,
				order_ref_no: r.order_ref_no,
				order_email_sent_at: r.order_email_sent_at,
				order_issued_at: r.order_issued_at,
				valid_from: r.valid_from,
				valid_to: r.valid_to,
			})
			if (r.order_email_sent_at) {
				g.sent_count++
				if (!g.last_sent_at || r.order_email_sent_at > g.last_sent_at) g.last_sent_at = r.order_email_sent_at
			} else g.pending_count++
		}

		const data = [...grouped.values()].sort((a, b) => {
			// Examiners still to be e-mailed first, then by name.
			if ((a.pending_count > 0) !== (b.pending_count > 0)) return a.pending_count > 0 ? -1 : 1
			return a.full_name.localeCompare(b.full_name)
		})

		return NextResponse.json({
			data,
			summary: {
				examiners: data.length,
				assignments: (rows || []).length,
				pending_examiners: data.filter(d => d.pending_count > 0).length,
				sent_examiners: data.filter(d => d.pending_count === 0).length,
			},
		})
	} catch (error) {
		console.error('[QP email] list failed:', error)
		return NextResponse.json({ error: 'Failed to load examiners for e-mailing' }, { status: 500 })
	}
}
