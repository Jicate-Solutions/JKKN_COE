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
import { requireAssignment, logAccess } from '@/lib/qp-portal/guard'
import { applyQuestionEdits, MASS_CLEAR_THRESHOLD, massClearError } from '@/lib/ia/apply-question-edits'
import { validateSubMarks } from '@/lib/ia/sub-questions'
import { validatePaperComplete } from '@/lib/ia/validate-paper'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

		if (Array.isArray(body.questions)) {
			const { questions, cleared } = applyQuestionEdits(current, body.questions)
			// A payload that blanks several authored questions at once is a stale tab,
			// not an edit — refuse it unless the examiner confirmed.
			if (cleared.length >= MASS_CLEAR_THRESHOLD && body.allow_clear !== true) {
				return NextResponse.json(massClearError(cleared), { status: 409 })
			}
			const subErrors = validateSubMarks(questions)
			if (subErrors.length > 0) {
				return NextResponse.json({ error: 'SUB_MARKS', message: subErrors.join(' · ') }, { status: 400 })
			}
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
			const incomplete = validatePaperComplete(nextQuestions, parts)
			if (incomplete.length > 0) {
				return NextResponse.json(
					{
						error: 'INCOMPLETE',
						message: `${incomplete.length} item(s) still incomplete — ${incomplete.slice(0, 5).join(' · ')}${incomplete.length > 5 ? ' …' : ''}`,
						items: incomplete,
					},
					{ status: 400 }
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
				return NextResponse.json(
					{ error: 'CONFLICT', message: 'This paper was changed elsewhere. Reload before saving.' },
					{ status: 409 }
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
			// showing stale revision remarks.
			assignmentPatch.return_remarks = null
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

		await logAccess(req, {
			action: submitting ? 'paper_submit' : 'paper_save',
			examiner_id: auth.examiner.id,
			examiner_email: auth.examiner.email,
			assignment_id: assignment.id,
			paper_id: assignment.paper_id,
			institutions_id: assignment.institutions_id,
			detail: {
				questions_sent: Array.isArray(body.questions) ? body.questions.length : 0,
				authored: nextQuestions.filter((q: any) => String(q?.question_text || '').trim() !== '').length,
				total: nextQuestions.length,
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
			updated_at: paperPatch.updated_at || paper.updated_at,
			question_done: nextQuestions.filter((q: any) => String(q?.question_text || '').trim() !== '').length,
			question_total: nextQuestions.length,
		})
	} catch (error: any) {
		console.error('[QP portal] paper PUT failed for', id, error)
		return NextResponse.json({ error: error?.message || 'Could not save the question paper.' }, { status: 500 })
	}
}
