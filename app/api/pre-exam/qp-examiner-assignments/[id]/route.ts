// One assignment: read it, run the review cycle, change the window, cancel it.
//
// GET    → the assignment with its examiner, paper and (for review) questions
// PUT    → action: 'window' | 'accept' | 'return' | 'reopen_paper' | 'reopen_claim'
//                  | 'cancel' | 'reopen' | 'update'
//
// Reopening is CONTROLLED: a submitted / accepted paper or a submitted claim is
// never simply made editable. 'reopen_paper' and 'reopen_claim' demand a
// reason, record who authorised it and when, mark the current version row as
// reopened, and write old → new to the audit log. 'return' is the same path
// (its remarks are the reason). The window-only 'reopen' no longer unlocks a
// submitted paper — that would be a reopen without a reason.
// DELETE → remove an assignment that was never worked on
//
// Every state change is written to ia_qp_access_logs so the CoE side of the
// audit trail is as complete as the examiner side.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { istLocalToIso, windowState } from '@/lib/qp-portal/ist'
import { logAccess } from '@/lib/qp-portal/guard'
import { loadAssignmentBundle } from '@/lib/qp-portal/assignment-service'
import { markVersionReopened } from '@/lib/qp-portal/versioning'
import { resolveQpFeeRates, computeClaim, componentsForType } from '@/lib/qp-portal/fees'
import { sendExaminerOrderEmail } from '@/lib/qp-portal/send-order'
import { parseAssignmentType, QP_ASSIGNMENT_TYPE_LABELS, type QpAssignmentType } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

type Action =
	| 'window' | 'accept' | 'return' | 'reopen_paper' | 'reopen_claim' | 'change_type' | 'cancel' | 'reopen' | 'update'
type LogModule = 'paper' | 'claim' | 'assignment'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params
		const supabase = getSupabaseServer()
		const bundle = await loadAssignmentBundle(supabase, id)
		if (!bundle) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

		const { assignment, examiner, institution, session, examType, paper } = bundle

		// Template parts and course outcomes so the CoE review tab can render the
		// paper the same way the portal and the PDF do.
		const [{ data: parts }, { data: outcomes }] = await Promise.all([
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
						.select('*')
						.eq('course_id', assignment.course_id)
						.eq('is_active', true)
						.order('display_order', { ascending: true })
				: Promise.resolve({ data: [] as any[] }),
		])

		const questions = Array.isArray(paper?.questions)
			? [...paper!.questions].sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))
			: []

		return NextResponse.json({
			...assignment,
			window_state: windowState(assignment.valid_from, assignment.valid_to),
			examiner,
			institution: {
				id: institution.id,
				name: institution.name,
				institution_code: institution.institution_code,
			},
			session,
			exam_type: examType,
			paper: paper ? { ...paper, questions: undefined } : null,
			questions,
			template_parts: parts || [],
			course_outcomes: outcomes || [],
		})
	} catch (error) {
		console.error('[QP assign] GET one failed:', error)
		return NextResponse.json({ error: 'Failed to load the assignment' }, { status: 500 })
	}
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const { id } = await params
		const supabase = getSupabaseServer()
		const body = await req.json()
		const action: Action = body.action || 'update'

		const { data: current } = await supabase
			.from('ia_qp_assignments')
			.select('*')
			.eq('id', id)
			.maybeSingle()
		if (!current) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

		const now = new Date().toISOString()
		const patch: Record<string, any> = { updated_by: perm.userId, updated_at: now }
		let logAction = 'assignment_updated'
		let logDetail: Record<string, unknown> = { action }
		let logModule: LogModule = 'assignment'
		let logReason: string | null = null
		let logOld: unknown = null
		let logNew: unknown = null
		let logVersion: number | null = null
		let message = 'Assignment updated.'
		/** Set by actions that must e-mail the examiner after the row is written. */
		let emailAfter: { summary: string } | null = null

		switch (action) {
			// ── Change or extend the access window ─────────────────────────────
			case 'window':
			case 'reopen': {
				const validFrom = istLocalToIso(body.valid_from) || current.valid_from
				const validTo = istLocalToIso(body.valid_to)
				if (!validTo) {
					return NextResponse.json({ error: 'Enter a valid Date To.' }, { status: 400 })
				}
				if (new Date(validTo) <= new Date(validFrom)) {
					return NextResponse.json({ error: 'Date To must be after Date From.' }, { status: 400 })
				}
				patch.valid_from = validFrom
				patch.valid_to = validTo
				patch.window_extensions = (current.window_extensions || 0) + 1
				// A window change never unlocks a finalised paper on its own — that
				// needs 'reopen_paper' with a reason, so the reopen is accountable.
				logAction = 'window_extended'
				logOld = { valid_from: current.valid_from, valid_to: current.valid_to }
				logNew = { valid_from: validFrom, valid_to: validTo }
				logDetail = { from: logOld, to: logNew, by: perm.email }
				message = 'Access period updated.'
				break
			}

			// ── Accept the submitted paper ─────────────────────────────────────
			case 'accept': {
				if (current.status !== 'submitted') {
					return NextResponse.json(
						{ error: `Only a submitted paper can be accepted — this one is ${current.status}.` },
						{ status: 400 }
					)
				}
				patch.status = 'accepted'
				patch.accepted_at = now
				patch.accepted_by = perm.userId
				patch.return_remarks = null
				// Acceptance locks the paper so no later edit can slip in.
				await supabase
					.from('ese_question_papers')
					.update({ status: 'approved', approved_at: now, approved_by: perm.userId })
					.eq('id', current.paper_id)
				logAction = 'assignment_accepted'
				logModule = 'paper'
				logVersion = current.paper_version || null
				logOld = { status: current.status, paper_status: 'submitted' }
				logNew = { status: 'accepted', paper_status: 'approved', accepted_at: now }
				logDetail = { by: perm.email }
				message = 'Question paper accepted.'
				break
			}

			// ── Authorised reopen of the question paper (a.k.a. return) ────────
			case 'return':
			case 'reopen_paper': {
				if (!['submitted', 'accepted'].includes(current.status)) {
					return NextResponse.json(
						{ error: `Only a submitted or accepted paper can be reopened — this one is ${current.status}.` },
						{ status: 400 }
					)
				}
				const reason = String(body.reason ?? body.remarks ?? '').trim()
				const remarks = String(body.remarks || '').trim()
				if (!reason) {
					return NextResponse.json(
						{ error: 'Enter the reason for reopening — it is recorded permanently in the audit log.' },
						{ status: 400 }
					)
				}

				// A reopened paper is useless without an open window. Accept a new
				// closing date, and insist on one if the period has already ended.
				const newTo = istLocalToIso(body.valid_to)
				if (newTo) {
					if (new Date(newTo) <= new Date(current.valid_from)) {
						return NextResponse.json({ error: 'The new Date To must be after Date From.' }, { status: 400 })
					}
					patch.valid_to = newTo
					patch.window_extensions = (current.window_extensions || 0) + 1
				} else if (windowState(current.valid_from, current.valid_to) === 'closed') {
					return NextResponse.json(
						{ error: 'The access period has already closed. Set a new closing date so the examiner can revise the paper.' },
						{ status: 400 }
					)
				}

				patch.status = 'returned'
				patch.returned_at = now
				patch.return_remarks = remarks && remarks !== reason ? `${reason} — ${remarks}` : reason
				patch.reopened_at = now
				patch.reopened_by = perm.userId
				patch.reopen_reason = reason
				patch.reopen_scope = 'full'
				patch.submitted_at = null
				// Back to authoring: the check list and signature belong to the
				// version being reopened and are collected again on resubmission.
				patch.submission_stage = 'authoring'
				patch.accepted_at = null
				patch.accepted_by = null

				// The version row is marked BEFORE the assignment changes: a reopen
				// that cannot be recorded does not happen.
				const mark = await markVersionReopened(supabase, 'ia_qp_paper_versions', id, {
					reason,
					remarks: remarks || null,
					actor: { userId: perm.userId, email: perm.email },
					at: now,
				})
				if ('error' in mark) {
					console.error('[QP assign] paper version reopen failed:', mark.error)
					return NextResponse.json({ error: 'The reopen could not be recorded in the version history.' }, { status: 500 })
				}

				await supabase
					.from('ese_question_papers')
					.update({ status: 'draft', approved_at: null, approved_by: null })
					.eq('id', current.paper_id)

				logAction = 'paper_reopened'
				logModule = 'paper'
				logReason = reason
				logVersion = current.paper_version || mark.version || null
				logOld = {
					status: current.status,
					submission_stage: current.submission_stage,
					submitted_at: current.submitted_at,
					accepted_at: current.accepted_at,
					valid_to: current.valid_to,
				}
				logNew = {
					status: 'returned',
					submission_stage: 'authoring',
					valid_to: patch.valid_to || current.valid_to,
				}
				logDetail = { by: perm.email, reason, remarks: remarks || null, version: logVersion }
				message = `Question paper V${logVersion || 1} reopened — the examiner can revise and resubmit.`
				break
			}

			// ── Change the appointment type (add / drop the answer key) ─────────
			case 'change_type': {
				const newType = parseAssignmentType(body.assignment_type)
				const oldType: QpAssignmentType = (current.assignment_type as QpAssignmentType) || 'question_paper'
				const reason = String(body.reason || '').trim()
				const remarks = String(body.remarks || '').trim()
				if (!newType) {
					return NextResponse.json({ error: 'assignment_type must be question_paper, answer_key or both.' }, { status: 400 })
				}
				if (newType === oldType) {
					return NextResponse.json({ error: `This appointment is already "${QP_ASSIGNMENT_TYPE_LABELS[newType]}".` }, { status: 400 })
				}
				if (!reason) {
					return NextResponse.json(
						{ error: 'Enter the reason for the change — it is recorded permanently in the audit log and shown to the examiner.' },
						{ status: 400 }
					)
				}
				if (current.status === 'cancelled') {
					return NextResponse.json({ error: 'A cancelled appointment cannot be changed.' }, { status: 400 })
				}
				if ((current.claim_status || 'pending') === 'paid') {
					return NextResponse.json({ error: 'This claim has already been paid; the appointment can no longer be changed.' }, { status: 400 })
				}

				const before = componentsForType(oldType)
				const after = componentsForType(newType)
				const everSubmitted =
					['submitted', 'accepted'].includes(current.status) ||
					(current.submission_stage && current.submission_stage !== 'authoring') ||
					!!current.submitted_at ||
					(current.paper_version || 0) > 0
				// A component that has been delivered cannot be taken away.
				if (before.qp && !after.qp && everSubmitted) {
					return NextResponse.json(
						{ error: 'The question paper has already been submitted, so it cannot be removed from this appointment.' },
						{ status: 400 }
					)
				}
				if (before.ak && !after.ak && current.ak_willing === true && everSubmitted) {
					return NextResponse.json(
						{ error: 'The answer key has already been submitted, so it cannot be removed from this appointment.' },
						{ status: 400 }
					)
				}

				// Fees from Fee Details as of today; the snapshot on the row is refreshed.
				const rates = await resolveQpFeeRates(supabase, current.institutions_id)
				const qpFee = after.qp ? (rates.qp ?? current.qp_fee ?? null) : null
				const akFee = after.ak ? (rates.ak ?? current.ak_fee ?? null) : null
				const qpWilling = after.qp ? true : false
				// A newly added answer key is the examiner's to accept; one already
				// answered keeps its answer.
				const akWilling: boolean | null = after.ak ? (before.ak ? (current.ak_willing ?? null) : null) : false

				patch.assignment_type = newType
				patch.qp_fee = qpFee
				patch.ak_fee = akFee
				patch.qp_willing = qpWilling
				patch.ak_willing = akWilling
				patch.remuneration = computeClaim({ assignment_type: newType, qp_fee: qpFee, ak_fee: akFee, qp_willing: true, ak_willing: true }).total
				patch.claim_amount = computeClaim({ assignment_type: newType, qp_fee: qpFee, ak_fee: akFee, qp_willing: qpWilling, ak_willing: akWilling }).total
				patch.type_changed_at = now
				patch.type_changed_by = perm.userId
				patch.type_change_reason = reason
				// The added component must be confirmed afresh on the willingness card.
				if (after.ak && !before.ak) patch.willingness_confirmed_at = null

				const effects: string[] = []

				// Paper already in and a component added → reopen for that component
				// only. Questions stay locked: a fee change is not a licence to edit.
				const addedComponent = (after.ak && !before.ak) || (after.qp && !before.qp)
				if (everSubmitted && addedComponent) {
					const mark = await markVersionReopened(supabase, 'ia_qp_paper_versions', id, {
						reason: `Appointment changed to ${QP_ASSIGNMENT_TYPE_LABELS[newType]}: ${reason}`,
						remarks: remarks || null,
						actor: { userId: perm.userId, email: perm.email },
						at: now,
					})
					if ('error' in mark) {
						console.error('[QP assign] paper version reopen (type change) failed:', mark.error)
						return NextResponse.json({ error: 'The change could not be recorded in the version history.' }, { status: 500 })
					}
					patch.status = 'returned'
					patch.returned_at = now
					patch.reopened_at = now
					patch.reopened_by = perm.userId
					patch.reopen_reason = reason
					patch.reopen_scope = after.qp && !before.qp ? 'full' : 'answer_key'
					patch.return_remarks =
						after.ak && !before.ak
							? `Your appointment now includes the Answer Key. Enter the answer key under each question and submit again — the questions themselves are locked.${remarks ? ` ${remarks}` : ''}`
							: `Your appointment now includes the Question Paper. Enter the questions and submit again.${remarks ? ` ${remarks}` : ''}`
					patch.submission_stage = 'authoring'
					patch.submitted_at = null
					patch.accepted_at = null
					patch.accepted_by = null
					// The window must be open for the examiner to act.
					const newTo = istLocalToIso(body.valid_to)
					if (newTo && new Date(newTo) > new Date(current.valid_from)) {
						patch.valid_to = newTo
						patch.window_extensions = (current.window_extensions || 0) + 1
					} else if (windowState(current.valid_from, current.valid_to) === 'closed') {
						return NextResponse.json(
							{ error: 'The access period has already closed. Set a new closing date so the examiner can add the answer key.' },
							{ status: 400 }
						)
					}
					await supabase
						.from('ese_question_papers')
						.update({ status: 'draft', approved_at: null, approved_by: null })
						.eq('id', current.paper_id)
					effects.push('paper reopened for the added component')
				}

				// Claim already applied → reopen it so the added fee can be claimed.
				if (['submitted', 'approved'].includes(current.claim_status || 'pending')) {
					const cmark = await markVersionReopened(supabase, 'ia_qp_claim_versions', id, {
						reason: `Appointment changed to ${QP_ASSIGNMENT_TYPE_LABELS[newType]}: ${reason}`,
						remarks: remarks || null,
						actor: { userId: perm.userId, email: perm.email },
						at: now,
					})
					if ('error' in cmark) {
						console.error('[QP assign] claim version reopen (type change) failed:', cmark.error)
						return NextResponse.json({ error: 'The change could not be recorded in the claim history.' }, { status: 500 })
					}
					patch.claim_status = 'pending'
					patch.claim_reopened_at = now
					patch.claim_reopened_by = perm.userId
					patch.claim_reopen_reason = `Your appointment now covers ${QP_ASSIGNMENT_TYPE_LABELS[newType]}. Submit the claim again so it includes every component.`
					patch.claim_reopen_remarks = remarks || null
					patch.claim_approved_at = null
					patch.claim_approved_by = null
					effects.push('claim reopened')
				}

				logAction = 'assignment_type_changed'
				logModule = 'assignment'
				logReason = reason
				logVersion = current.paper_version || null
				logOld = {
					assignment_type: oldType,
					qp_fee: current.qp_fee,
					ak_fee: current.ak_fee,
					remuneration: current.remuneration,
					claim_amount: current.claim_amount,
					status: current.status,
					submission_stage: current.submission_stage,
					claim_status: current.claim_status,
				}
				logNew = {
					assignment_type: newType,
					qp_fee: qpFee,
					ak_fee: akFee,
					remuneration: patch.remuneration,
					claim_amount: patch.claim_amount,
					status: patch.status || current.status,
					submission_stage: patch.submission_stage || current.submission_stage,
					claim_status: patch.claim_status || current.claim_status,
					reopen_scope: patch.reopen_scope || null,
				}
				logDetail = { by: perm.email, reason, remarks: remarks || null, effects }
				message = `Appointment changed to ${QP_ASSIGNMENT_TYPE_LABELS[newType]}${effects.length ? ` — ${effects.join(', ')}` : ''}.`
				if (body.send_email !== false) {
					emailAfter = {
						summary: `${QP_ASSIGNMENT_TYPE_LABELS[oldType]} → ${QP_ASSIGNMENT_TYPE_LABELS[newType]}. ${reason}${remarks ? ` ${remarks}` : ''}`,
					}
				}
				break
			}

			// ── Authorised reopen of the claim form ────────────────────────────
			case 'reopen_claim': {
				const claimStatus = current.claim_status || 'pending'
				if (!['submitted', 'approved'].includes(claimStatus)) {
					return NextResponse.json(
						{
							error:
								claimStatus === 'paid'
									? 'A paid claim cannot be reopened.'
									: 'Only a submitted or approved claim can be reopened — this one has not been submitted.',
						},
						{ status: 400 }
					)
				}
				const reason = String(body.reason || '').trim()
				const remarks = String(body.remarks || '').trim()
				if (!reason) {
					return NextResponse.json(
						{ error: 'Enter the reason for reopening — it is recorded permanently in the audit log.' },
						{ status: 400 }
					)
				}

				const mark = await markVersionReopened(supabase, 'ia_qp_claim_versions', id, {
					reason,
					remarks: remarks || null,
					actor: { userId: perm.userId, email: perm.email },
					at: now,
				})
				if ('error' in mark) {
					console.error('[QP assign] claim version reopen failed:', mark.error)
					return NextResponse.json({ error: 'The reopen could not be recorded in the version history.' }, { status: 500 })
				}

				patch.claim_status = 'pending'
				patch.claim_reopened_at = now
				patch.claim_reopened_by = perm.userId
				patch.claim_reopen_reason = reason
				patch.claim_reopen_remarks = remarks || null
				patch.claim_approved_at = null
				patch.claim_approved_by = null

				logAction = 'claim_reopened'
				logModule = 'claim'
				logReason = reason
				logVersion = current.claim_version || mark.version || null
				logOld = {
					claim_status: claimStatus,
					claim_submitted_at: current.claim_submitted_at,
					account_holder: current.claim_account_holder,
					bank_name: current.claim_bank_name,
					branch: current.claim_branch,
					ifsc: current.claim_ifsc,
				}
				logNew = { claim_status: 'pending' }
				logDetail = { by: perm.email, reason, remarks: remarks || null, version: logVersion }
				message = `Claim form V${logVersion || 1} reopened — the examiner can correct and resubmit.`
				break
			}

			// ── Cancel ─────────────────────────────────────────────────────────
			case 'cancel': {
				// Cancelling is for appointments that have not produced anything yet.
				// Once the examiner has submitted the paper — even if it was later
				// reopened — the appointment is part of the record: accept it, reopen
				// it, or return it, but do not cancel it out from under a submission.
				const everSubmitted =
					['submitted', 'accepted'].includes(current.status) ||
					(current.submission_stage && current.submission_stage !== 'authoring') ||
					!!current.submitted_at ||
					(current.paper_version || 0) > 0
				if (current.status === 'cancelled') {
					return NextResponse.json({ error: 'This assignment is already cancelled.' }, { status: 400 })
				}
				if (everSubmitted) {
					return NextResponse.json(
						{
							error:
								'This examiner has already submitted the question paper, so the appointment cannot be cancelled. ' +
								'Accept the paper, or reopen it with a reason if it needs revision.',
						},
						{ status: 400 }
					)
				}
				patch.status = 'cancelled'
				patch.notes = body.remarks ? String(body.remarks) : current.notes
				logAction = 'assignment_cancelled'
				logReason = body.remarks ? String(body.remarks) : null
				logOld = { status: current.status }
				logNew = { status: 'cancelled' }
				logDetail = { by: perm.email, remarks: body.remarks || null }
				message = 'Assignment cancelled.'
				break
			}

			// ── Plain field edit ───────────────────────────────────────────────
			default: {
				if (body.remuneration !== undefined) {
					patch.remuneration = body.remuneration === null || body.remuneration === '' ? null : Number(body.remuneration)
				}
				if (body.notes !== undefined) patch.notes = body.notes || null
				// institutions_id is never editable after creation.
				break
			}
		}

		const { data: updated, error } = await supabase
			.from('ia_qp_assignments')
			.update(patch)
			.eq('id', id)
			.select()
			.single()
		if (error) {
			console.error('[QP assign] update failed:', error.message)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		await logAccess(req, {
			action: logAction,
			examiner_id: current.examiner_id,
			assignment_id: id,
			paper_id: current.paper_id,
			institutions_id: current.institutions_id,
			reason: logReason,
			detail: logDetail,
			performed_by_user_id: perm.userId,
			performed_by_email: perm.email,
			performed_by_role: 'coe',
			module: logModule,
			record_id: id,
			old_value: logOld,
			new_value: logNew,
			version: logVersion,
		})

		// The examiner is told by e-mail with a rebuilt order. A failed send does
		// not undo the change — it is logged, and the order can be re-sent.
		let emailNote: string | null = null
		if (emailAfter) {
			const sent = await sendExaminerOrderEmail(supabase, id, {
				variant: 'updated',
				changeSummary: emailAfter.summary,
				by: { userId: perm.userId, email: perm.email },
				req,
			})
			emailNote = sent.ok ? sent.message : `The updated order could not be e-mailed (${sent.error}) — use E-mail the order to retry.`
		}

		return NextResponse.json({
			success: true,
			data: { ...updated, window_state: windowState(updated.valid_from, updated.valid_to) },
			message: emailNote ? `${message} ${emailNote}` : message,
		})
	} catch (error: any) {
		console.error('[QP assign] PUT failed:', error)
		return NextResponse.json({ error: error?.message || 'Failed to update the assignment' }, { status: 500 })
	}
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const perm = await requireUserPermission(VIEW_PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const { id } = await params
		const supabase = getSupabaseServer()

		const { data: current } = await supabase
			.from('ia_qp_assignments')
			.select('id, status, paper_id, examiner_id, institutions_id')
			.eq('id', id)
			.maybeSingle()
		if (!current) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

		// Work that reached the CoE is history, not a mistake — cancel it instead,
		// so the order that was issued and the submission stay accounted for.
		if (['submitted', 'accepted'].includes(current.status)) {
			return NextResponse.json(
				{ error: `A ${current.status} assignment cannot be deleted. Cancel it instead so the record is kept.` },
				{ status: 400 }
			)
		}

		const { error } = await supabase.from('ia_qp_assignments').delete().eq('id', id)
		if (error) return NextResponse.json({ error: error.message }, { status: 500 })

		await logAccess(req, {
			action: 'assignment_deleted',
			examiner_id: current.examiner_id,
			paper_id: current.paper_id,
			institutions_id: current.institutions_id,
			detail: { by: perm.email },
			performed_by_user_id: perm.userId,
			performed_by_email: perm.email,
			performed_by_role: 'coe',
			module: 'assignment',
			record_id: current.id,
			old_value: { status: current.status },
			new_value: null,
		})

		return NextResponse.json({ success: true, message: 'Assignment removed.' })
	} catch (error) {
		console.error('[QP assign] DELETE failed:', error)
		return NextResponse.json({ error: 'Failed to remove the assignment' }, { status: 500 })
	}
}
