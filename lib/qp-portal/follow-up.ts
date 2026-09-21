// Examiner follow-up — the stage every appointment has reached, derived from
// the assignment, the paper and the access log. Shared by the Status Report
// route (JSON + Excel); see that route for what each stage means.

import { hasAnswerKey } from '@/lib/ia/validate-paper'
import { countAuthored } from '@/lib/ia/sub-questions'
import { windowState } from '@/lib/qp-portal/ist'
import type { QpAssignmentType } from '@/types/qp-examiner-assignment'

export type FollowUpStage =
	| 'order_not_sent' | 'not_logged_in' | 'not_opened' | 'not_started' | 'drafting'
	| 'ready_to_submit' | 'returned' | 'claim_pending' | 'completed'

export const FOLLOW_UP_STAGES: { key: FollowUpStage; label: string; action: string }[] = [
	{ key: 'order_not_sent', label: 'Order not sent', action: 'Send the order e-mail' },
	{ key: 'not_logged_in', label: 'Not logged in', action: 'Call / re-send the order e-mail' },
	{ key: 'not_opened', label: 'Logged in, paper not opened', action: 'Call the examiner' },
	{ key: 'not_started', label: 'Opened, not started', action: 'Call the examiner' },
	{ key: 'drafting', label: 'Entering questions', action: 'Remind before the closing date' },
	{ key: 'ready_to_submit', label: 'Questions complete — waiting to submit', action: 'Ask the examiner to submit' },
	{ key: 'returned', label: 'Returned — resubmission awaited', action: 'Ask the examiner to resubmit' },
	{ key: 'claim_pending', label: 'Submitted — claim form awaited', action: 'Ask the examiner to submit the claim' },
	{ key: 'completed', label: 'Completed', action: '—' },
]
const STAGE_LABEL = Object.fromEntries(FOLLOW_UP_STAGES.map(s => [s.key, s.label])) as Record<FollowUpStage, string>
const STAGE_ACTION = Object.fromEntries(FOLLOW_UP_STAGES.map(s => [s.key, s.action])) as Record<FollowUpStage, string>

export interface FollowUpRow {
	id: string
	examiner_id: string
	examiner_name: string
	examiner_kind: 'internal' | 'external'
	email: string | null
	mobile: string | null
	designation: string | null
	department: string | null
	institution_name: string | null
	course_code: string | null
	subject_title: string | null
	set_label: string | null
	program_code: string | null
	semester: number | null
	assignment_type: string
	order_ref_no: string | null
	stage: FollowUpStage
	stage_label: string
	action: string
	status: string
	claim_status: string
	question_done: number
	question_total: number
	key_done: number
	key_required: boolean
	order_email_sent_at: string | null
	last_login_at: string | null
	paper_opened_at: string | null
	last_saved_at: string | null
	submitted_at: string | null
	claim_submitted_at: string | null
	valid_from: string
	valid_to: string
	window_state: string
	/** Whole days until the window closes; negative once it has closed. */
	days_left: number
}

/** Examiner-only log actions that prove a sign-in / that a paper was opened. */
const LOGIN_ACTIONS = ['login_google', 'login', 'assignment_list', 'paper_view', 'paper_save', 'syllabus_view', 'order_download']

export async function loadFollowUpRows(supabase: any, institutionsId: string, sessionId: string): Promise<FollowUpRow[]> {
	const { data: rows, error } = await supabase
		.from('ia_qp_assignments')
		.select('*')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.neq('status', 'cancelled')
		.order('course_code', { ascending: true })
		.order('id', { ascending: true })
		.range(0, 999)
	if (error) throw new Error(error.message)
	const list = (rows || []) as any[]
	if (list.length === 0) return []

	const examinerIds = [...new Set(list.map(r => r.examiner_id).filter(Boolean))]
	const paperIds = [...new Set(list.map(r => r.paper_id).filter(Boolean))]

	const examinerById = new Map<string, any>()
	for (let i = 0; i < examinerIds.length; i += 200) {
		const { data } = await supabase
			.from('examiners')
			.select('id, full_name, email, mobile, designation, department, institution_name')
			.in('id', examinerIds.slice(i, i + 200))
		for (const e of data || []) examinerById.set(e.id, e)
	}

	// Papers in small chunks: the questions JSON is heavy.
	const paperById = new Map<string, any>()
	for (let i = 0; i < paperIds.length; i += 50) {
		const { data } = await supabase
			.from('ese_question_papers')
			.select('id, questions, updated_at')
			.in('id', paperIds.slice(i, i + 50))
		for (const p of data || []) paperById.set(p.id, p)
	}

	// Sign-ins and paper opens, from the access log, paged newest first.
	// paper_save is by far the bulk of the log and is left out: the last save is
	// the paper's own updated_at.
	const lastLogin = new Map<string, string>()
	const paperOpened = new Map<string, string>()
	const lastSaved = new Map<string, string>()
	const since = list.map(r => r.assigned_at || r.created_at).filter(Boolean).sort()[0] || null
	for (let page = 0; page < 30; page++) {
		let q = supabase
			.from('ia_qp_access_logs')
			.select('id, examiner_id, assignment_id, action, created_at')
			.eq('institutions_id', institutionsId)
			.in('action', LOGIN_ACTIONS.filter(a => a !== 'paper_save'))
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.range(page * 1000, page * 1000 + 999)
		if (since) q = q.gte('created_at', since)
		const { data: logs, error: logErr } = await q
		if (logErr || !logs || logs.length === 0) break
		for (const l of logs as any[]) {
			if (l.examiner_id && !lastLogin.has(l.examiner_id)) lastLogin.set(l.examiner_id, l.created_at)
			if (l.assignment_id && l.action === 'paper_view') paperOpened.set(l.assignment_id, l.created_at) // oldest wins (newest first)
		}
		if (logs.length < 1000) break
	}
	// login_google carries no institutions_id on some rows — a second pass by examiner.
	for (let i = 0; i < examinerIds.length; i += 100) {
		const { data: logins } = await supabase
			.from('ia_qp_access_logs')
			.select('examiner_id, created_at')
			.in('examiner_id', examinerIds.slice(i, i + 100))
			.in('action', ['login_google', 'login'])
			.order('created_at', { ascending: false })
			.range(0, 999)
		for (const l of (logins || []) as any[]) {
			const cur = lastLogin.get(l.examiner_id)
			if (!cur || l.created_at > cur) lastLogin.set(l.examiner_id, l.created_at)
		}
	}

	const now = new Date()
	return list.map(r => {
		const e = examinerById.get(r.examiner_id) || {}
		const paper = paperById.get(r.paper_id)
		const questions: any[] = Array.isArray(paper?.questions) ? paper.questions : []
		const total = questions.length
		const done = countAuthored(questions)
		const type = (r.assignment_type || 'question_paper') as QpAssignmentType
		const keyRequired = type !== 'question_paper' && r.ak_willing !== false
		const qpRequired = type !== 'answer_key'
		const keyDone = questions.filter(hasAnswerKey).length
		const claimed = ['submitted', 'approved', 'paid'].includes(r.claim_status || 'pending')
		const login = lastLogin.get(r.examiner_id) || null
		const opened = paperOpened.get(r.id) || null
		if (done > 0 || keyDone > 0) lastSaved.set(r.id, paper?.updated_at || null)
		// Work on the paper proves a sign-in even where the log row is missing.
		const active = !!login || done > 0 || keyDone > 0 || r.status === 'in_progress'

		let stage: FollowUpStage
		if (['submitted', 'accepted'].includes(r.status)) stage = claimed ? 'completed' : 'claim_pending'
		else if (r.status === 'returned') stage = 'returned'
		else if (!r.order_email_sent_at && !active) stage = 'order_not_sent'
		else if (!active) stage = 'not_logged_in'
		else if (done === 0 && keyDone === 0) stage = opened ? 'not_started' : 'not_opened'
		else if ((!qpRequired || (total > 0 && done >= total)) && (!keyRequired || (total > 0 && keyDone >= total))) stage = 'ready_to_submit'
		else stage = 'drafting'

		const msLeft = new Date(r.valid_to).getTime() - now.getTime()
		return {
			id: r.id,
			examiner_id: r.examiner_id,
			examiner_name: e.full_name || 'Unknown examiner',
			examiner_kind: r.examiner_kind === 'internal' ? 'internal' : 'external',
			email: e.email || null,
			mobile: e.mobile || null,
			designation: e.designation || null,
			department: e.department || null,
			institution_name: e.institution_name || null,
			course_code: r.course_code,
			subject_title: r.subject_title,
			set_label: r.set_label,
			program_code: r.program_code,
			semester: r.semester,
			assignment_type: type,
			order_ref_no: r.combined_order_ref_no || r.order_ref_no || null,
			stage,
			stage_label: STAGE_LABEL[stage],
			action: STAGE_ACTION[stage],
			status: r.status,
			claim_status: r.claim_status || 'pending',
			question_done: done,
			question_total: total,
			key_done: keyDone,
			key_required: keyRequired,
			order_email_sent_at: r.order_email_sent_at || null,
			last_login_at: login,
			paper_opened_at: opened,
			last_saved_at: lastSaved.get(r.id) || null,
			submitted_at: r.submitted_at || null,
			claim_submitted_at: r.claim_submitted_at || null,
			valid_from: r.valid_from,
			valid_to: r.valid_to,
			window_state: windowState(r.valid_from, r.valid_to, now),
			days_left: Math.floor(msLeft / 86400000),
		} as FollowUpRow
	})
}
