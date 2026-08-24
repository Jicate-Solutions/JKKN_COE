import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { institutionAllowed, paperIsEse, ESE_NOT_AVAILABLE } from '@/lib/ia/v1-helpers'
import { scaffoldQuestions, mergeAuthored } from '@/lib/ia/paper-scaffold'
import { validateSubMarks } from '@/lib/ia/sub-questions'
import { applyQuestionEdits, MASS_CLEAR_THRESHOLD, massClearError } from '@/lib/ia/apply-question-edits'
import { validatePaperComplete, requiresCompletion } from '@/lib/ia/validate-paper'

/** /api/v1/ia/question-papers/{id} — detail / save / rebuild / delete (questions JSONB). */

const EDITABLE = ['draft', 'submitted']
const VALID = ['draft', 'submitted', 'approved', 'locked']

function idFromUrl(url: string): string {
	const parts = new URL(url).pathname.split('/').filter(Boolean)
	return parts[parts.length - 1]
}

function readQuestions(paper: any): any[] {
	const qs = Array.isArray(paper.questions) ? paper.questions : []
	return qs.slice().sort((a: any, b: any) => a.display_order - b.display_order)
}

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const id = idFromUrl(request.url)

	const { data: paper } = await supabase.from('ia_question_papers').select('*').eq('id', id).single()
	if (!paper || !institutionAllowed(context, paper.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}
	// End-semester papers are confidential to the examiner portal — an API key
	// must not be able to tell they exist, let alone read or edit one.
	if (await paperIsEse(supabase, paper)) {
		return NextResponse.json({ error: ESE_NOT_AVAILABLE }, { status: 404 })
	}
	const questions = readQuestions(paper)

	let template_parts: any[] = []
	if (paper.template_id) {
		const { data } = await supabase.from('ia_template_parts').select('*').eq('template_id', paper.template_id).order('display_order')
		template_parts = data || []
	}
	let course_outcomes: any[] = []
	if (paper.course_id) {
		const { data } = await supabase.from('ia_course_outcomes').select('*').eq('course_id', paper.course_id).eq('is_active', true).order('display_order')
		course_outcomes = data || []
	}
	return NextResponse.json({ data: { ...paper, questions, template_parts, course_outcomes } })
})

export const PUT = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const id = idFromUrl(request.url)
	const body = await request.json()

	const { data: paper } = await supabase.from('ia_question_papers').select('*').eq('id', id).single()
	if (!paper || !institutionAllowed(context, paper.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}
	// End-semester papers are confidential to the examiner portal — an API key
	// must not be able to tell they exist, let alone read or edit one.
	if (await paperIsEse(supabase, paper)) {
		return NextResponse.json({ error: ESE_NOT_AVAILABLE }, { status: 404 })
	}

	// Rebuild (draft only; merge-preserves answered content)
	if (body.regenerate) {
		if (paper.status !== 'draft') return NextResponse.json({ error: 'Rebuild only in draft' }, { status: 400 })
		if (!paper.template_id) return NextResponse.json({ error: 'No template' }, { status: 400 })
		const existing = readQuestions(paper)
		if (!body.force && existing.some((q: any) => (q?.question_text || '').trim() !== '')) {
			return NextResponse.json(
				{ error: 'AUTHORED', message: 'Paper already has questions entered. Pass force:true to overwrite.' },
				{ status: 409 }
			)
		}
		const [{ data: parts }, { data: tmpl }] = await Promise.all([
			supabase.from('ia_template_parts').select('*').eq('template_id', paper.template_id).order('display_order'),
			supabase.from('ia_paper_templates').select('total_marks').eq('id', paper.template_id).single(),
		])
		const merged = mergeAuthored(scaffoldQuestions(parts || []), existing)
		const { data: updated, error } = await supabase
			.from('ia_question_papers')
			.update({ questions: merged, max_marks: tmpl?.total_marks ?? paper.max_marks })
			.eq('id', id)
			.select()
			.single()
		if (error) return NextResponse.json({ error: error.message }, { status: 500 })
		return NextResponse.json({ data: { ...updated, saved_count: merged.length } })
	}

	const { questions, status, subject_title, exam_date, paper_setter_id, duration_minutes, default_font, base_updated_at } = body
	const patch: any = {}
	let savedCount = 0

	if (Array.isArray(questions)) {
		if (!EDITABLE.includes(status || paper.status)) {
			return NextResponse.json({ error: `Cannot edit questions while ${paper.status}` }, { status: 400 })
		}
		// Any field the payload does not mention is preserved — omitting a key must
		// never erase authored work.
		const current = readQuestions(paper)
		const { questions: nextQuestions, cleared } = applyQuestionEdits(current, questions)

		// A payload that blanks several authored questions at once is a stale or
		// partial client state, not an edit. Refuse it unless the caller insists.
		if (cleared.length >= MASS_CLEAR_THRESHOLD && body.allow_clear !== true) {
			return NextResponse.json(massClearError(cleared), { status: 409 })
		}
		patch.questions = nextQuestions

		const subErrors = validateSubMarks(patch.questions)
		if (subErrors.length > 0) {
			return NextResponse.json({ error: 'SUB_MARKS', message: subErrors.join(' · ') }, { status: 400 })
		}
		savedCount = current.length
	}

	if (status) {
		if (!VALID.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

		// Submit / approve require a complete paper — same rule the authoring UI applies.
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
		if (status === 'approved') { patch.approved_at = new Date().toISOString(); if (body.author_id) patch.approved_by = body.author_id }
		if (status === 'locked') patch.locked_at = new Date().toISOString()
	}
	if (subject_title !== undefined) patch.subject_title = subject_title
	if (exam_date !== undefined) patch.exam_date = exam_date || null
	if (paper_setter_id !== undefined) patch.paper_setter_id = paper_setter_id || null
	if (duration_minutes !== undefined) patch.duration_minutes = duration_minutes ? parseInt(duration_minutes) : null
	// Paper-wide common font (null clears it → questions/options fall back to defaults)
	if (default_font !== undefined) patch.default_font = default_font || null

	if (Object.keys(patch).length === 0) {
		return NextResponse.json({ data: { ...paper, questions: readQuestions(paper), saved_count: 0 } })
	}

	let q = supabase.from('ia_question_papers').update(patch).eq('id', id)
	if (base_updated_at) q = q.eq('updated_at', base_updated_at)
	const { data: updated, error } = await q.select().single()
	if (error && error.code === 'PGRST116') {
		return NextResponse.json({ error: 'CONFLICT', message: 'Paper changed elsewhere. Reload before saving.' }, { status: 409 })
	}
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })

	const questionsOut = Array.isArray(updated.questions)
		? updated.questions.slice().sort((a: any, b: any) => a.display_order - b.display_order)
		: []
	return NextResponse.json({ data: { ...updated, questions: questionsOut, saved_count: savedCount } })
})

export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const id = idFromUrl(request.url)
	const { data: paper } = await supabase.from('ia_question_papers').select('status, institutions_id').eq('id', id).single()
	if (!paper || !institutionAllowed(context, paper.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}
	// End-semester papers are confidential to the examiner portal — an API key
	// must not be able to tell they exist, let alone read or edit one.
	if (await paperIsEse(supabase, paper)) {
		return NextResponse.json({ error: ESE_NOT_AVAILABLE }, { status: 404 })
	}
	if (paper.status === 'locked') return NextResponse.json({ error: 'Cannot delete a locked paper' }, { status: 400 })
	const { error } = await supabase.from('ia_question_papers').delete().eq('id', id)
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ success: true })
})
