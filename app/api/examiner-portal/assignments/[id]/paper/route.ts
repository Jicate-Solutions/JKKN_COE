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

			// The check-list and the declaration are part of submitting, not extras.
			const checklist = body.checklist ?? assignment.checklist
			if (!checklist || Object.keys(checklist).length === 0) {
				return NextResponse.json(
					{ error: 'CHECKLIST_REQUIRED', message: 'Complete the Question Paper Check List before submitting.' },
					{ status: 400 }
				)
			}
			const declarationAt = body.declaration_accepted ? new Date().toISOString() : assignment.declaration_accepted_at
			if (!declarationAt) {
				return NextResponse.json(
					{ error: 'DECLARATION_REQUIRED', message: 'Accept the declaration before submitting.' },
					{ status: 400 }
				)
			}
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
				? 'Question paper submitted. The Office of the Controller of Examinations has been notified.'
				: 'Saved.',
			status: updatedAssignment?.status || assignment.status,
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
