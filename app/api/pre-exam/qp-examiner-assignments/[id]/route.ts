// One assignment: read it, run the review cycle, change the window, cancel it.
//
// GET    → the assignment with its examiner, paper and (for review) questions
// PUT    → action: 'window' | 'accept' | 'return' | 'cancel' | 'reopen' | 'update'
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

export const dynamic = 'force-dynamic'

const VIEW_PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

type Action = 'window' | 'accept' | 'return' | 'cancel' | 'reopen' | 'update'

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
		let message = 'Assignment updated.'

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
				// Reopening a submitted paper is what lets the examiner edit again.
				if (action === 'reopen' && current.status === 'submitted') {
					patch.status = 'returned'
					patch.returned_at = now
					patch.return_remarks = body.remarks || 'Window reopened by the Office of the Controller of Examinations.'
				}
				logAction = 'window_extended'
				logDetail = {
					from: { valid_from: current.valid_from, valid_to: current.valid_to },
					to: { valid_from: validFrom, valid_to: validTo },
					by: perm.email,
				}
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
					.from('ia_question_papers')
					.update({ status: 'approved', approved_at: now, approved_by: perm.userId })
					.eq('id', current.paper_id)
				logAction = 'assignment_accepted'
				logDetail = { by: perm.email }
				message = 'Question paper accepted.'
				break
			}

			// ── Return it for revision ─────────────────────────────────────────
			case 'return': {
				if (current.status !== 'submitted') {
					return NextResponse.json(
						{ error: `Only a submitted paper can be returned — this one is ${current.status}.` },
						{ status: 400 }
					)
				}
				const remarks = String(body.remarks || '').trim()
				if (!remarks) {
					return NextResponse.json(
						{ error: 'Enter the remarks explaining what the examiner must revise.' },
						{ status: 400 }
					)
				}
				patch.status = 'returned'
				patch.returned_at = now
				patch.return_remarks = remarks
				patch.submitted_at = null

				// A returned paper is useless without an open window, so reopen it if
				// the original one has already closed.
				const newTo = istLocalToIso(body.valid_to)
				if (newTo) {
					if (new Date(newTo) <= new Date(patch.valid_from || current.valid_from)) {
						return NextResponse.json({ error: 'The new Date To must be after Date From.' }, { status: 400 })
					}
					patch.valid_to = newTo
					patch.window_extensions = (current.window_extensions || 0) + 1
				}

				await supabase.from('ia_question_papers').update({ status: 'draft' }).eq('id', current.paper_id)
				logAction = 'assignment_returned'
				logDetail = { by: perm.email, remarks }
				message = 'Question paper returned to the examiner.'
				break
			}

			// ── Cancel ─────────────────────────────────────────────────────────
			case 'cancel': {
				patch.status = 'cancelled'
				patch.notes = body.remarks ? String(body.remarks) : current.notes
				logAction = 'assignment_cancelled'
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
			reason: null,
			detail: logDetail,
		})

		return NextResponse.json({
			success: true,
			data: { ...updated, window_state: windowState(updated.valid_from, updated.valid_to) },
			message,
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
		})

		return NextResponse.json({ success: true, message: 'Assignment removed.' })
	} catch (error) {
		console.error('[QP assign] DELETE failed:', error)
		return NextResponse.json({ error: 'Failed to remove the assignment' }, { status: 500 })
	}
}
