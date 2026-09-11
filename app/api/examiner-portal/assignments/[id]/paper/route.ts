// Examiner portal — save and submit the question paper.
//
// PUT /api/examiner-portal/assignments/:id/paper
//   { questions?, default_font?, base_updated_at?, submit?, checklist?,
//     declaration_accepted? }
//
// Reuses the same merge and validation rules as the CoE paper editor
// (lib/ia/apply-question-edits, validate-paper, sub-questions) so a paper written
// in the portal is identical in shape to one written inside the app.
//
// Two guards the CoE editor does not need:
//   • the assignment window must be open (enforced in requireAssignment)
//   • the questions written must be the slots the template scaffolded — the
//     merge ignores unknown ids, so a client cannot invent extra questions

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { requireAssignment, logAccess, requestOrigin } from '@/lib/qp-portal/guard'
import { snapshotPaperVersion, diffQuestions } from '@/lib/qp-portal/versioning'
import { applyQuestionEdits, MASS_CLEAR_THRESHOLD, massClearError } from '@/lib/ia/apply-question-edits'
import { validateSubMarks } from '@/lib/ia/sub-questions'
import { validatePaperComplete } from '@/lib/ia/validate-paper'
import { componentsForType } from '@/lib/qp-portal/fees'
import type { QpAssignmentType } from '@/types/qp-examiner-assignment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The keys of a question payload that belong to the QUESTION, not the answer key. */
const QUESTION_KEYS = [
	'question_text', 'marks', 'options', 'option_font', 'image', 'correct_option',
	'co_code', 'k_level', 'sub_questions',
]
const ANSWER_KEY_KEYS = ['answer_key', 'answer_key_image']

/**
 * Keep only the fields the examiner may write, by what they accepted. A field
 * the payload no longer mentions is preserved by applyQuestionEdits, so
 * stripping a key here leaves the stored value untouched rather than blanking it.
 */
function restrictQuestionPayload(
	incoming: any[],
	allow: { questions: boolean; answerKeys: boolean }
): any[] {
	return (incoming || []).map(q => {
		if (!q || typeof q !== 'object') return q
		const out: Record<string, unknown> = { id: q.id }
		for (const k of Object.keys(q)) {
			if (k === 'id') continue
			if (QUESTION_KEYS.includes(k)) {
				if (allow.questions) out[k] = q[k]
			} else if (ANSWER_KEY_KEYS.includes(k)) {
				if (allow.answerKeys) out[k] = q[k]
			} else {
				out[k] = q[k]
			}
		}
		return out
	})
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params
	const body = await req.json().catch(() => ({}))
	const submitting = body.submit === true

	const auth = await requireAssignment(req, id, {
		needQuestions: true,
		needEdit: true,
		action: submitting ? 'submit paper' : 'save paper',
	})
	if (!auth.ok) return auth.response

	try {
		const supabase = getSupabaseServer()
		const { assignment } = auth.access

		/**
		 * A refused save or submit is an audit event too: it says what the client
		 * tried, why the server said no, and — for a conflict — which base it held
		 * against which the row actually carried. Without this a stuck editor is
		 * invisible from the CoE side.
		 */
		const refuse = async (
			status: number,
			body: Record<string, unknown> & { error: string },
			detail: Record<string, unknown> = {}
		) => {
			await logAccess(req, {
				action: submitting ? 'paper_submit' : 'paper_save',
				examiner_id: auth.examiner.id,
				examiner_email: auth.examiner.email,
				assignment_id: assignment.id,
				paper_id: assignment.paper_id,
				institutions_id: assignment.institutions_id,
				module: 'paper',
				performed_by_role: 'examiner',
				denied: true,
				reason: String(body.error),
				version: assignment.paper_version ?? null,
				detail: {
					http_status: status,
					message: body.message ?? null,
					base_sent: body.base_updated_at_sent ?? null,
					questions_sent: Array.isArray(body_questions()) ? body_questions().length : 0,
					...detail,
				},
			})
			const { base_updated_at_sent: _omit, ...rest } = body
			return NextResponse.json(rest, { status })
		}
		const body_questions = () => (Array.isArray(body.questions) ? body.questions : null)

		const { data: paper } = await supabase
			.from('ese_question_papers')
			.select('*')
			.eq('id', assignment.paper_id)
			.maybeSingle()
		if (!paper) {
			return NextResponse.json({ error: 'The question paper is missing.' }, { status: 404 })
		}

		const current = (Array.isArray(paper.questions) ? paper.questions : [])
			.slice()
			.sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))

		const paperPatch: Record<string, any> = {}
		let nextQuestions = current
		/** Old → new per question, for the audit line. Empty on a no-op save. */
		let changes: ReturnType<typeof diffQuestions> = []

		// ── What this examiner may write, by appointment + willingness ────────
		// Setting the paper is the appointment itself and is never declined.
		// Only the answer key is a choice, and an appointment that carries one
		// waits for that answer before anything is written: the fields the
		// examiner sees depend on it, and so does the claim.
		const type: QpAssignmentType = (assignment.assignment_type as QpAssignmentType) || 'question_paper'
		const components = componentsForType(type)
		const qpWilling = components.qp
		const akWilling = components.ak ? assignment.ak_willing === true : false
		const willingnessPending = components.ak && assignment.ak_willing == null
		// Reopened only to add the answer key: the questions are the submitted
		// paper and stay exactly as they were.
		const questionsEditable = qpWilling && assignment.reopen_scope !== 'answer_key'
		if (willingnessPending && (Array.isArray(body.questions) || submitting)) {
			return refuse(409, {
				error: 'WILLINGNESS_PENDING',
				message: 'Confirm whether you will prepare the answer key before entering the paper.',
			})
		}
		if (!qpWilling && !akWilling && (Array.isArray(body.questions) || submitting)) {
			return refuse(409, {
				error: 'DECLINED',
				message: 'You have declined the answer key, so there is nothing to enter or submit for this appointment.',
			})
		}

		if (Array.isArray(body.questions)) {
			const allowed = restrictQuestionPayload(body.questions, { questions: questionsEditable, answerKeys: akWilling })
			const { questions, cleared } = applyQuestionEdits(current, allowed)
			// A payload that blanks several authored questions at once is a stale tab,
			// not an edit — refuse it unless the examiner confirmed.
			if (cleared.length >= MASS_CLEAR_THRESHOLD && body.allow_clear !== true) {
				// The client holds a copy older than the server's: its payload would
				// blank questions that have since been written. Reload, do not resend.
				return refuse(
					409,
					{ ...massClearError(cleared), base_updated_at_sent: body.base_updated_at ?? null },
					{ cleared, server_updated_at: paper.updated_at }
				)
			}
			// The same guard for tags: a payload that drops the CO or K-level from
			// several questions that carry one is a stale copy, not an edit (an
			// examiner untags one question at a time). Seen in the wild from a
			// browser tab left open for days.
			const currentById = new Map<string, any>(current.map((q: any) => [String(q?.id), q]))
			const untagged: string[] = []
			for (const q of questions) {
				const prev = currentById.get(String(q?.id))
				if (!prev) continue
				if ((prev.co_code && !q?.co_code) || (prev.k_level && !q?.k_level)) {
					untagged.push(`Q${q?.question_number ?? ''}${q?.sub_label ? ` ${q.sub_label}` : ''}`)
				}
			}
			if (untagged.length >= MASS_CLEAR_THRESHOLD && body.allow_clear !== true) {
				return refuse(
					409,
					{
						error: 'WOULD_CLEAR',
						message:
							`This save would remove the Course Outcome / K-level from ${untagged.length} questions ` +
							`(${untagged.slice(0, 8).join(', ')}${untagged.length > 8 ? ' …' : ''}). ` +
							'Your copy of the paper is older than the server\'s — reload it before saving.',
						base_updated_at_sent: body.base_updated_at ?? null,
					},
					{ untagged, server_updated_at: paper.updated_at }
				)
			}
			const subErrors = validateSubMarks(questions)
			if (subErrors.length > 0) {
				return refuse(400, { error: 'SUB_MARKS', message: subErrors.join(' · ') }, { errors: subErrors.slice(0, 20) })
			}
			changes = diffQuestions(current, questions)
			nextQuestions = questions
			paperPatch.questions = questions
		}

		if (body.default_font !== undefined) paperPatch.default_font = body.default_font || null

		// ── Submission requires a complete paper ─────────────────────────────
		if (submitting) {
			let parts: any[] = []
			if (paper.template_id) {
				const { data } = await supabase
					.from('ia_template_parts')
					.select('part_label, capture_co, capture_klevel')
					.eq('template_id', paper.template_id)
				parts = data || []
			}
			// The answer key is demanded only when ACCEPTED — never merely because
			// the type says "Both" (spec §6). An answer-key-only appointment does
			// not re-validate questions that are someone else's and read-only here.
			const incomplete = validatePaperComplete(nextQuestions, parts, {
				requireAnswerKey: akWilling,
				skipQuestions: !components.qp,
			})
			if (incomplete.length > 0) {
				return refuse(
					400,
					{
						error: 'INCOMPLETE',
						message: `${incomplete.length} item(s) still incomplete — ${incomplete.slice(0, 5).join(' · ')}${incomplete.length > 5 ? ' …' : ''}`,
						items: incomplete,
					},
					{ incomplete: incomplete.length }
				)
			}

			// The check list and the declaration are NOT preconditions any more.
			// Submitting hands the content over and then walks the examiner through
			// the check list and the signature — see the submission route. Demanding
			// them up front asked the examiner to attest to a paper before the act
			// of submitting it, and meant the same list was answered twice.
		}

		// ── Write the paper (optimistic concurrency) ─────────────────────────
		if (Object.keys(paperPatch).length > 0 || submitting) {
			if (submitting) {
				paperPatch.status = 'submitted'
				paperPatch.submitted_at = new Date().toISOString()
			}
			let q = supabase.from('ese_question_papers').update(paperPatch).eq('id', paper.id)
			if (body.base_updated_at) q = q.eq('updated_at', body.base_updated_at)
			const { data: updated, error } = await q.select().single()

			if (error && error.code === 'PGRST116') {
				// The row moved on since the client's base. Hand back the current copy
				// so the editor can rebase (the usual cause is the SAME examiner's
				// previous editor instance landing a save late) instead of retrying
				// the identical stale write forever.
				const { data: latest } = await supabase
					.from('ese_question_papers')
					.select('updated_at, questions')
					.eq('id', paper.id)
					.maybeSingle()
				return refuse(
					409,
					{
						error: 'CONFLICT',
						message: 'This paper was changed elsewhere. Reload before saving.',
						current_updated_at: latest?.updated_at || null,
						current_questions: Array.isArray(latest?.questions)
							? [...latest!.questions].sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))
							: null,
						base_updated_at_sent: body.base_updated_at ?? null,
					},
					{ server_updated_at: latest?.updated_at || null, read_updated_at: paper.updated_at }
				)
			}
			if (error) {
				console.error('[QP portal] paper save failed:', error.message)
				return NextResponse.json({ error: 'Could not save the question paper.' }, { status: 500 })
			}
			nextQuestions = Array.isArray(updated.questions) ? updated.questions : nextQuestions
			paperPatch.updated_at = updated.updated_at
		}

		// ── Write the assignment side ────────────────────────────────────────
		const assignmentPatch: Record<string, any> = { updated_at: new Date().toISOString() }
		if (body.checklist !== undefined) assignmentPatch.checklist = body.checklist || null
		if (body.declaration_accepted === true && !assignment.declaration_accepted_at) {
			assignmentPatch.declaration_accepted_at = new Date().toISOString()
		}
		if (submitting) {
			assignmentPatch.status = 'submitted'
			assignmentPatch.submitted_at = new Date().toISOString()
			// Hand-over opens the wizard: the examiner goes straight to the check
			// list, then the signature. The content is already in either way, so an
			// abandoned wizard still leaves the CoE a usable paper.
			assignmentPatch.submission_stage = 'checklist'
			// A resubmission (after a return) starts the attestation over, so the
			// previous run's check list and signature cannot stand in for this one.
			assignmentPatch.checklist_completed_at = null
			assignmentPatch.submission_signature_path = null
			assignmentPatch.signed_at = null
			assignmentPatch.final_submitted_at = null
			// A resubmission clears the previous return note so the portal stops
			// showing stale revision remarks, and closes the reopen scope.
			assignmentPatch.return_remarks = null
			assignmentPatch.reopen_scope = null
		} else if (assignment.status === 'assigned' && Array.isArray(body.questions)) {
			// The first save is what turns an untouched appointment into work started.
			assignmentPatch.status = 'in_progress'
		}

		const { data: updatedAssignment, error: aErr } = await supabase
			.from('ia_qp_assignments')
			.update(assignmentPatch)
			.eq('id', assignment.id)
			.select()
			.single()
		if (aErr) {
			console.error('[QP portal] assignment update failed:', aErr.message)
			if (submitting) {
				// The paper was already stamped 'submitted' above. Undo that, so the
				// paper and the assignment never disagree about whether the hand-over
				// happened — otherwise the portal keeps offering Submit on a paper the
				// CoE already sees as submitted, and the wizard never opens.
				const { error: undoErr } = await supabase
					.from('ese_question_papers')
					.update({ status: paper.status, submitted_at: paper.submitted_at ?? null })
					.eq('id', paper.id)
				if (undoErr) console.error('[QP portal] paper submit rollback failed:', undoErr.message)
				await logAccess(req, {
					action: 'paper_submit',
					examiner_id: auth.examiner.id,
					examiner_email: auth.examiner.email,
					assignment_id: assignment.id,
					paper_id: assignment.paper_id,
					institutions_id: assignment.institutions_id,
					denied: true,
					reason: `assignment update failed: ${aErr.message}`,
				})
				return NextResponse.json(
					{
						error: 'SUBMIT_FAILED',
						message:
							'The question paper could not be submitted because of a server problem. Your draft is safe and nothing has been handed over — please try again, and contact the Office of the Controller of Examinations if this continues.',
					},
					{ status: 500 }
				)
			}
		}

		// ── Version history ──────────────────────────────────────────────────
		// Every submission is kept as a numbered version that is never
		// overwritten. A resubmission after an authorised reopen becomes V(n+1)
		// and supersedes the reopened one.
		let version: number | null = assignment.paper_version ?? null
		const isResubmit = submitting && (assignment.status === 'returned' || (assignment.paper_version || 0) > 0)
		if (submitting) {
			const origin = requestOrigin(req)
			const snap = await snapshotPaperVersion(supabase, {
				assignmentId: assignment.id,
				paperId: assignment.paper_id,
				institutionsId: assignment.institutions_id,
				examinerId: auth.examiner.id,
				questions: nextQuestions,
				defaultFont: paperPatch.default_font ?? paper.default_font ?? null,
				actor: { ip: origin.ip, userAgent: origin.userAgent },
			})
			if ('error' in snap) {
				// The submission stands; the missing snapshot is itself recorded.
				console.error('[QP portal] paper version snapshot failed:', snap.error)
			} else {
				version = snap.version
			}
		}

		await logAccess(req, {
			action: submitting ? (isResubmit ? 'paper_resubmit' : 'paper_submit') : 'paper_save',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: assignment.id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			module: 'paper',
			performed_by_role: 'examiner',
			record_id: assignment.paper_id,
			version,
			old_value: changes.length > 0 ? changes.slice(0, 60).map(c => ({ q: c.label, field: c.field, value: c.old })) : null,
			new_value: submitting
				? { status: 'submitted', version, questions_total: nextQuestions.length }
				: changes.length > 0
					? changes.slice(0, 60).map(c => ({ q: c.label, field: c.field, value: c.new }))
					: null,
			detail: {
				questions_sent: Array.isArray(body.questions) ? body.questions.length : 0,
				authored: nextQuestions.filter((q: any) => String(q?.question_text || '').trim() !== '').length,
				total: nextQuestions.length,
				changed: changes.length,
				...(isResubmit ? { resubmission_of_version: assignment.paper_version || null } : {}),
			},
		})

		return NextResponse.json({
			success: true,
			message: submitting
				? 'Question paper submitted. Complete the check list to finish.'
				: 'Saved.',
			status: updatedAssignment?.status || assignment.status,
			// The portal reads this to open the next wizard step without the
			// examiner having to go looking for it.
			submission_stage: updatedAssignment?.submission_stage || assignment.submission_stage || 'authoring',
			paper_status: submitting ? 'submitted' : paper.status,
			paper_version: version,
			updated_at: paperPatch.updated_at || paper.updated_at,
			question_done: nextQuestions.filter((q: any) => String(q?.question_text || '').trim() !== '').length,
			question_total: nextQuestions.length,
		})
	} catch (error: any) {
		console.error('[QP portal] paper PUT failed for', id, error)
		return NextResponse.json({ error: error?.message || 'Could not save the question paper.' }, { status: 500 })
	}
}
