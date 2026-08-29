// Authorization + audit for the examiner portal.
//
// Every portal request funnels through here, so the four rules of section 10 of
// the spec are stated once and cannot be forgotten in a route:
//
//   1. There must be a valid portal session (signed cookie).
//   2. The examiner row must still be ACTIVE.
//   3. The assignment must belong to THAT examiner — never another's paper.
//   4. Question content is released only while the IST window is open.
//
// Every allow and every refusal is written to ia_qp_access_logs.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { readPortalSession } from './session'
import { windowState, type WindowState } from './ist'
import type { QpAssignment, QpPortalSession, QpLogAction } from '@/types/qp-examiner-assignment'

// ── Audit log ───────────────────────────────────────────────────────────────

export interface LogInput {
	action: QpLogAction | string
	examiner_id?: string | null
	examiner_email?: string | null
	assignment_id?: string | null
	paper_id?: string | null
	institutions_id?: string | null
	denied?: boolean
	reason?: string | null
	detail?: Record<string, unknown> | null
}

/** Client IP as seen behind the proxy, and the raw user agent. */
export function requestOrigin(req: NextRequest): { ip: string; userAgent: string } {
	const forwarded = req.headers.get('x-forwarded-for')
	const ip =
		forwarded?.split(',')[0]?.trim() ||
		req.headers.get('x-real-ip') ||
		'unknown'
	return { ip: ip.slice(0, 64), userAgent: (req.headers.get('user-agent') || '').slice(0, 500) }
}

/**
 * Append one line to the access log. Never throws and never blocks the caller's
 * response: an audit write that fails must not turn a legitimate paper view
 * into a 500. The failure is logged to the server console instead.
 */
export async function logAccess(req: NextRequest, input: LogInput): Promise<void> {
	try {
		const { ip, userAgent } = requestOrigin(req)
		const supabase = getSupabaseServer()
		const { error } = await supabase.from('ia_qp_access_logs').insert({
			action: input.action,
			examiner_id: input.examiner_id || null,
			examiner_email: input.examiner_email || null,
			assignment_id: input.assignment_id || null,
			paper_id: input.paper_id || null,
			institutions_id: input.institutions_id || null,
			denied: input.denied ?? false,
			reason: input.reason || null,
			detail: input.detail || null,
			ip_address: ip,
			user_agent: userAgent,
		})
		if (error) console.error('[QP portal] access log write failed:', error.message)
	} catch (e) {
		console.error('[QP portal] access log threw:', e)
	}
}

// ── Session → examiner ──────────────────────────────────────────────────────

export interface ExaminerRow {
	id: string
	full_name: string
	email: string
	status: string
	is_internal: boolean | null
	institution_id: string | null
	institution_code: string | null
	designation: string | null
	department: string | null
	institution_name: string | null
	mobile: string | null
	signature_path: string | null
	bank_account_holder: string | null
	bank_name: string | null
	bank_account_number: string | null
	bank_branch: string | null
	bank_ifsc: string | null
	myjkkn_staff_id: string | null
}

const EXAMINER_COLUMNS =
	'id, full_name, email, status, is_internal, institution_id, institution_code, designation, department, institution_name, mobile, signature_path, bank_account_holder, bank_name, bank_account_number, bank_branch, bank_ifsc, myjkkn_staff_id'

export type AuthOk = { ok: true; session: QpPortalSession; examiner: ExaminerRow }
export type AuthFail = { ok: false; response: NextResponse }
export type AuthResult = AuthOk | AuthFail

function fail(status: number, error: string, extra?: Record<string, unknown>): AuthFail {
	return { ok: false, response: NextResponse.json({ error, ...extra }, { status }) }
}

/**
 * Resolve the signed-in examiner. A session whose examiner row has since been
 * deactivated is refused — deactivating in the panel must cut portal access at
 * once, not at the end of the 8-hour token.
 */
export async function requireExaminer(req: NextRequest): Promise<AuthResult> {
	const session = await readPortalSession(req)
	if (!session) {
		return fail(401, 'Your session has ended. Please sign in again.')
	}

	const supabase = getSupabaseServer()
	const { data: examiner, error } = await supabase
		.from('examiners')
		.select(EXAMINER_COLUMNS)
		.eq('id', session.sub)
		.maybeSingle<ExaminerRow>()

	if (error) {
		console.error('[QP portal] examiner lookup failed:', error.message)
		return fail(500, 'Could not verify your account. Please try again.')
	}
	if (!examiner) {
		await logAccess(req, {
			action: 'access_denied',
			examiner_email: session.email,
			denied: true,
			reason: 'examiner row missing for session subject',
		})
		return fail(401, 'Your examiner record could not be found. Contact the Office of the Controller of Examinations.')
	}
	if (examiner.status !== 'ACTIVE') {
		await logAccess(req, {
			action: 'access_denied',
			examiner_id: examiner.id,
			examiner_email: examiner.email,
			denied: true,
			reason: `examiner status is ${examiner.status}`,
		})
		return fail(403, 'Your examiner registration is not active. Contact the Office of the Controller of Examinations.')
	}

	return { ok: true, session, examiner }
}

// ── Session → one assignment ────────────────────────────────────────────────

export interface AssignmentAccess {
	assignment: QpAssignment
	state: WindowState
	/** May the examiner still change the paper right now? */
	canEdit: boolean
	/** May the question content be released at all right now? */
	canReadQuestions: boolean
}

export type AssignmentOk = AuthOk & { access: AssignmentAccess }
export type AssignmentResult = AssignmentOk | AuthFail

/** Statuses in which the examiner may still author. */
const EDITABLE = new Set(['assigned', 'in_progress', 'returned'])

/**
 * Fetch one assignment and prove it belongs to this examiner.
 *
 * `needQuestions` distinguishes the two levels of access the spec asks for: the
 * order copy, claim form and status are readable at any time, but the question
 * paper itself only inside the window. Asking for questions outside the window
 * is a refusal, and a logged one.
 */
export async function requireAssignment(
	req: NextRequest,
	assignmentId: string,
	opts: { needQuestions?: boolean; needEdit?: boolean; action?: string } = {}
): Promise<AssignmentResult> {
	const auth = await requireExaminer(req)
	if (!auth.ok) return auth

	const supabase = getSupabaseServer()
	const { data, error } = await supabase
		.from('ia_qp_assignments')
		.select('*')
		.eq('id', assignmentId)
		.maybeSingle()

	if (error) {
		console.error('[QP portal] assignment lookup failed:', error.message)
		return fail(500, 'Could not load this assignment. Please try again.')
	}

	// Not found and not-yours are answered identically, so the portal cannot be
	// used to discover which assignment ids exist.
	if (!data || data.examiner_id !== auth.examiner.id) {
		await logAccess(req, {
			action: 'access_denied',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: assignmentId,
			denied: true,
			reason: data ? 'assignment belongs to another examiner' : 'assignment not found',
			detail: opts.action ? { attempted: opts.action } : null,
		})
		return fail(404, 'That assignment is not available to you.')
	}

	const assignment = data as QpAssignment
	if (assignment.status === 'cancelled') {
		await logAccess(req, {
			action: 'access_denied',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: assignment.id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			denied: true,
			reason: 'assignment cancelled',
		})
		return fail(403, 'This assignment has been cancelled.')
	}

	const state = windowState(assignment.valid_from, assignment.valid_to)
	const canEdit = state === 'open' && EDITABLE.has(assignment.status)
	// Once accepted the paper is finished, but the examiner may still read back
	// what they submitted while the window stands.
	const canReadQuestions = state === 'open'

	if (opts.needQuestions && !canReadQuestions) {
		await logAccess(req, {
			action: 'access_denied',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: assignment.id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			denied: true,
			reason: state === 'pending' ? 'window not yet open' : 'window closed',
			detail: { valid_from: assignment.valid_from, valid_to: assignment.valid_to, attempted: opts.action || 'read' },
		})
		return {
			ok: false,
			response: NextResponse.json(
				{
					error:
						state === 'pending'
							? 'This question paper is not open yet. It becomes available at the start of your assignment window.'
							: 'The access period for this question paper has ended.',
					window_state: state,
					valid_from: assignment.valid_from,
					valid_to: assignment.valid_to,
				},
				{ status: 403 }
			),
		}
	}

	if (opts.needEdit && !canEdit) {
		const reason =
			state !== 'open'
				? state === 'pending'
					? 'window not yet open'
					: 'window closed'
				: `status is ${assignment.status}`
		await logAccess(req, {
			action: 'access_denied',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: assignment.id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			denied: true,
			reason,
			detail: { attempted: opts.action || 'edit' },
		})
		return {
			ok: false,
			response: NextResponse.json(
				{
					error:
						state !== 'open'
							? state === 'pending'
								? 'This question paper is not open for entry yet.'
								: 'The entry period for this question paper has ended. Contact the Office of the Controller of Examinations if you need it reopened.'
							: assignment.status === 'submitted'
								? 'You have already submitted this question paper. It can only be changed if the Office of the Controller of Examinations returns it to you.'
								: 'This question paper can no longer be edited.',
					window_state: state,
					status: assignment.status,
				},
				{ status: 403 }
			),
		}
	}

	return { ...auth, access: { assignment, state, canEdit, canReadQuestions } }
}
