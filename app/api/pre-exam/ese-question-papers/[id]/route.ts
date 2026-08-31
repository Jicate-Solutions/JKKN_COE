// One End-Semester question paper.
//
// GET    → the paper with its questions, template parts and course outcomes
// PUT    → save questions / meta / status, or rebuild from the format
// DELETE → remove a paper that was never handed out
//
// The CIA equivalent is app/api/pre-exam/question-papers/[id]/route.ts and the
// two behave identically on questions — the shared apply/validate/scaffold
// helpers do that work. What differs here is the assignment: an ESE paper that
// belongs to an examiner is theirs to write, so the CoE cannot re-scaffold it or
// delete it without cancelling the appointment first.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { scaffoldQuestions, mergeAuthored } from '@/lib/ia/paper-scaffold'
import { validateSubMarks } from '@/lib/ia/sub-questions'
import { validatePaperComplete, requiresCompletion } from '@/lib/ia/validate-paper'
import { applyQuestionEdits, MASS_CLEAR_THRESHOLD, massClearError } from '@/lib/ia/apply-question-edits'
import { hasAnyCoeRole } from '@/lib/auth/check-user-permission'

export const dynamic = 'force-dynamic'

const EDITABLE_STATUSES = ['draft', 'submitted']
const VALID_STATUSES = ['draft', 'submitted', 'approved', 'locked']
const UNRESTRICTED_ROLES = ['super_admin', 'coe']

function readQuestions(paper: any): any[] {
	const qs = Array.isArray(paper.questions) ? paper.questions : []
	return qs.slice().sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))
}

/** The live (non-cancelled) assignment for a paper, if any. */
async function liveAssignment(supabase: any, paperId: string) {
	const { data } = await supabase
		.from('ia_qp_assignments')
		.select('id, status, examiner_id')
		.eq('paper_id', paperId)
		.neq('status', 'cancelled')
		.maybeSingle()
	return data || null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		const { data: paper, error } = await supabase
			.from('ese_question_papers')
			.select('*')
			.eq('id', id)
			.maybeSingle()
		if (error || !paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

		const [{ data: parts }, { data: outcomes }, assignment] = await Promise.all([
			paper.template_id
				? supabase
						.from('ia_template_parts')
						.select('*')
						.eq('template_id', paper.template_id)
						.order('display_order', { ascending: true })
				: Promise.resolve({ data: [] as any[] }),
			paper.course_id
				? supabase
						.from('ia_course_outcomes')
						.select('*')
						.eq('course_id', paper.course_id)
						.eq('is_active', true)
						.order('display_order', { ascending: true })
				: Promise.resolve({ data: [] as any[] }),
			liveAssignment(supabase, id),
		])

		return NextResponse.json({
			...paper,
			questions: readQuestions(paper),
			template_parts: parts || [],
			course_outcomes: outcomes || [],
			assignment,
		})
	} catch (error) {
		console.error('[ESE paper] GET failed:', error)
		return NextResponse.json({ error: 'Failed to fetch the question paper' }, { status: 500 })
	}
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params
		const body = await req.json()
		const {
			questions, status, subject_title, exam_date, duration_minutes,
			default_font, template_id, base_updated_at,
		} = body

		const { data: paper } = await supabase
			.from('ese_question_papers')
			.select('*')
			.eq('id', id)
			.maybeSingle()
		if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

		const unrestricted = await hasAnyCoeRole(UNRESTRICTED_ROLES)

		// ── Rebuild from the format ───────────────────────────────────────────
		if (body.regenerate || template_id) {
			const assignment = await liveAssignment(supabase, id)
			if (assignment) {
				return NextResponse.json(
					{
						error: 'ASSIGNED',
						message:
							'This paper is assigned to an examiner. Cancel the assignment before changing its format — otherwise the examiner would be writing to a different structure than the order was issued for.',
					},
					{ status: 409 }
				)
			}
			if (paper.status !== 'draft' && !unrestricted) {
				return NextResponse.json(
					{ error: `Rebuild is only allowed while the paper is in draft — this one is ${paper.status}.` },
					{ status: 400 }
				)
			}

			const nextTemplateId = template_id || paper.template_id
			const [{ data: parts }, { data: tmpl }] = await Promise.all([
				supabase
					.from('ia_template_parts')
					.select('*')
					.eq('template_id', nextTemplateId)
					.order('display_order', { ascending: true }),
				supabase
					.from('ia_paper_templates')
					.select('id, total_marks, duration_minutes, version_number')
					.eq('id', nextTemplateId)
					.maybeSingle(),
			])
			if (!tmpl) return NextResponse.json({ error: 'The selected format was not found' }, { status: 404 })

			const existing = readQuestions(paper)
			// Changing to a DIFFERENT format restructures the paper, so authored work
			// can be stranded. Say so rather than discarding it silently.
			if (template_id && template_id !== paper.template_id && !body.force) {
				const authored = existing.filter((q: any) => String(q?.question_text || '').trim() !== '').length
				if (authored > 0) {
					return NextResponse.json(
						{
							error: 'AUTHORED',
							message: `${authored} question(s) are already written. Changing the format keeps only the questions that still line up. Pass force:true to go ahead.`,
						},
						{ status: 409 }
					)
				}
			}

			const merged = mergeAuthored(scaffoldQuestions(parts || []), existing)
			const { data: updated, error: uErr } = await supabase
				.from('ese_question_papers')
				.update({
					template_id: tmpl.id,
					template_version: tmpl.version_number,
					questions: merged,
					max_marks: tmpl.total_marks ?? paper.max_marks,
					duration_minutes: tmpl.duration_minutes ?? paper.duration_minutes,
				})
				.eq('id', id)
				.select()
				.single()
			if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
			return NextResponse.json({ ...updated, questions: readQuestions(updated), saved_count: merged.length })
		}

		// ── Ordinary edit ─────────────────────────────────────────────────────
		const patch: any = {}
		let savedCount = 0

		if (Array.isArray(questions)) {
			if (!unrestricted && !EDITABLE_STATUSES.includes(status || paper.status)) {
				return NextResponse.json(
					{ error: `Cannot edit questions while the paper is ${paper.status}` },
					{ status: 400 }
				)
			}
			const current = readQuestions(paper)
			const { questions: nextQuestions, cleared } = applyQuestionEdits(current, questions)
			if (cleared.length >= MASS_CLEAR_THRESHOLD && body.allow_clear !== true) {
				return NextResponse.json(massClearError(cleared), { status: 409 })
			}
			const subErrors = validateSubMarks(nextQuestions)
			if (subErrors.length > 0) {
				return NextResponse.json({ error: 'SUB_MARKS', message: subErrors.join(' · ') }, { status: 400 })
			}
			patch.questions = nextQuestions
			savedCount = current.length
		}

		if (status) {
			if (!VALID_STATUSES.includes(status)) {
				return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
			}
			if (requiresCompletion(status)) {
				const finalQuestions = Array.isArray(patch.questions) ? patch.questions : readQuestions(paper)
				let parts: any[] = []
				if (paper.template_id) {
					const { data } = await supabase
						.from('ia_template_parts')
						.select('part_label, capture_co, capture_klevel')
						.eq('template_id', paper.template_id)
					parts = data || []
				}
				const incomplete = validatePaperComplete(finalQuestions, parts)
				if (incomplete.length > 0) {
					return NextResponse.json(
						{
							error: 'INCOMPLETE',
							message: `${incomplete.length} item(s) incomplete — ${incomplete.slice(0, 5).join(' · ')}${incomplete.length > 5 ? ' …' : ''}`,
						},
						{ status: 400 }
					)
				}
			}
			patch.status = status
			if (status === 'submitted') patch.submitted_at = new Date().toISOString()
			if (status === 'approved') patch.approved_at = new Date().toISOString()
			if (status === 'locked') patch.locked_at = new Date().toISOString()
		}

		if (subject_title !== undefined) patch.subject_title = subject_title
		if (exam_date !== undefined) patch.exam_date = exam_date || null
		if (duration_minutes !== undefined) {
			patch.duration_minutes = duration_minutes ? parseInt(String(duration_minutes), 10) : null
		}
		if (default_font !== undefined) patch.default_font = default_font || null

		if (Object.keys(patch).length === 0) {
			return NextResponse.json({ ...paper, questions: readQuestions(paper), saved_count: 0 })
		}

		let q = supabase.from('ese_question_papers').update(patch).eq('id', id)
		if (base_updated_at) q = q.eq('updated_at', base_updated_at)
		const { data: updated, error: uErr } = await q.select().single()

		if (uErr && uErr.code === 'PGRST116') {
			return NextResponse.json(
				{ error: 'CONFLICT', message: 'This paper was changed elsewhere. Reload before saving.' },
				{ status: 409 }
			)
		}
		if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

		return NextResponse.json({ ...updated, questions: readQuestions(updated), saved_count: savedCount })
	} catch (error) {
		console.error('[ESE paper] PUT failed:', error)
		return NextResponse.json({ error: 'Failed to save the question paper' }, { status: 500 })
	}
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		const { data: paper } = await supabase
			.from('ese_question_papers')
			.select('id, status, course_code')
			.eq('id', id)
			.maybeSingle()
		if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

		// Deleting would cascade the assignment away with it, taking the issued
		// order and the audit trail. Cancel the assignment first, deliberately.
		const assignment = await liveAssignment(supabase, id)
		if (assignment) {
			return NextResponse.json(
				{
					error: `${paper.course_code || 'This paper'} is assigned to an examiner. Cancel the assignment before deleting the paper.`,
				},
				{ status: 409 }
			)
		}

		if (paper.status === 'locked' && !(await hasAnyCoeRole(UNRESTRICTED_ROLES))) {
			return NextResponse.json({ error: 'Cannot delete a locked paper' }, { status: 400 })
		}

		const { error } = await supabase.from('ese_question_papers').delete().eq('id', id)
		if (error) return NextResponse.json({ error: error.message }, { status: 500 })
		return NextResponse.json({ success: true, message: 'Question paper removed.' })
	} catch (error) {
		console.error('[ESE paper] DELETE failed:', error)
		return NextResponse.json({ error: 'Failed to delete the question paper' }, { status: 500 })
	}
}
