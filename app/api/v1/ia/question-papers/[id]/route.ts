import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { institutionAllowed } from '@/lib/ia/v1-helpers'
import { scaffoldQuestions } from '@/lib/ia/paper-scaffold'

/** /api/v1/ia/question-papers/{id} — detail / save / rebuild / delete. */

const EDITABLE = ['draft', 'submitted']
const VALID = ['draft', 'submitted', 'approved', 'locked']

function idFromUrl(url: string): string {
	const parts = new URL(url).pathname.split('/').filter(Boolean)
	return parts[parts.length - 1]
}

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const id = idFromUrl(request.url)

	const { data: paper } = await supabase.from('ia_question_papers').select('*, ia_paper_questions(*)').eq('id', id).single()
	if (!paper || !institutionAllowed(context, paper.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}
	paper.ia_paper_questions = (paper.ia_paper_questions || []).sort((a: any, b: any) => a.display_order - b.display_order)

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
	return NextResponse.json({ data: { ...paper, template_parts, course_outcomes } })
})

export const PUT = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const id = idFromUrl(request.url)
	const body = await request.json()

	const { data: paper } = await supabase.from('ia_question_papers').select('id, status, template_id, institutions_id').eq('id', id).single()
	if (!paper || !institutionAllowed(context, paper.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}

	// Rebuild from template (draft only)
	if (body.regenerate) {
		if (paper.status !== 'draft') return NextResponse.json({ error: 'Rebuild only in draft' }, { status: 400 })
		if (!paper.template_id) return NextResponse.json({ error: 'No template' }, { status: 400 })
		if (!body.force) {
			const { data: authored } = await supabase
				.from('ia_paper_questions')
				.select('id')
				.eq('paper_id', id)
				.not('question_text', 'is', null)
				.neq('question_text', '')
				.limit(1)
			if (authored && authored.length > 0) {
				return NextResponse.json(
					{ error: 'AUTHORED', message: 'Paper already has questions entered. Pass force:true to overwrite.' },
					{ status: 409 }
				)
			}
		}
		const { data: parts } = await supabase.from('ia_template_parts').select('*').eq('template_id', paper.template_id).order('display_order')
		// Smart rebuild: preserve any answered content (accidental rebuild can't erase data).
		const { data: existingQs } = await supabase.from('ia_paper_questions').select('*').eq('paper_id', id)
		const keyOf = (q: any) => `${q.part_label}|${q.question_number}|${q.sub_label || ''}|${q.is_choice_alternative ? 1 : 0}`
		const existMap = new Map((existingQs || []).map((q: any) => [keyOf(q), q]))
		const rows = scaffoldQuestions(id, parts || []).map((s: any) => {
			const e: any = existMap.get(keyOf(s))
			if (!e) return s
			let options = s.options
			if (Array.isArray(s.options) && Array.isArray(e.options)) {
				const textByKey = new Map(e.options.map((o: any) => [o.key, o.text]))
				options = s.options.map((o: any) => ({ ...o, text: textByKey.get(o.key) ?? o.text }))
			} else if (Array.isArray(e.options)) {
				options = e.options
			}
			return { ...s, question_text: e.question_text ?? s.question_text, options, correct_option: e.correct_option ?? null, co_code: e.co_code ?? null, k_level: e.k_level ?? null }
		})
		await supabase.from('ia_paper_questions').delete().eq('paper_id', id)
		if (rows.length > 0) {
			const { error } = await supabase.from('ia_paper_questions').insert(rows)
			if (error) return NextResponse.json({ error: error.message }, { status: 500 })
		}
		const { data: tmpl } = await supabase.from('ia_paper_templates').select('total_marks').eq('id', paper.template_id).single()
		if (tmpl) await supabase.from('ia_question_papers').update({ max_marks: tmpl.total_marks }).eq('id', id)
	}

	if (body.status) {
		if (!VALID.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
		const patch: any = { status: body.status }
		if (body.status === 'submitted') patch.submitted_at = new Date().toISOString()
		if (body.status === 'approved') { patch.approved_at = new Date().toISOString(); if (body.author_id) patch.approved_by = body.author_id }
		if (body.status === 'locked') patch.locked_at = new Date().toISOString()
		const { error } = await supabase.from('ia_question_papers').update(patch).eq('id', id)
		if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	}

	const metaPatch: any = {}
	if (body.subject_title !== undefined) metaPatch.subject_title = body.subject_title
	if (body.exam_date !== undefined) metaPatch.exam_date = body.exam_date || null
	if (body.paper_setter_id !== undefined) metaPatch.paper_setter_id = body.paper_setter_id || null
	if (body.duration_minutes !== undefined) metaPatch.duration_minutes = body.duration_minutes ? parseInt(body.duration_minutes) : null
	if (Object.keys(metaPatch).length > 0) await supabase.from('ia_question_papers').update(metaPatch).eq('id', id)

	if (Array.isArray(body.questions) && body.questions.length > 0) {
		if (!EDITABLE.includes(paper.status)) return NextResponse.json({ error: `Cannot edit questions while ${paper.status}` }, { status: 400 })
		const errs: string[] = []
		for (const q of body.questions) {
			if (!q.id) continue
			const { error } = await supabase
				.from('ia_paper_questions')
				.update({
					question_text: q.question_text ?? null,
					marks: q.marks ?? null,
					options: q.options ?? null,
					correct_option: q.correct_option ?? null,
					co_code: q.co_code ?? null,
					k_level: q.k_level ?? null,
				})
				.eq('id', q.id)
				.eq('paper_id', id)
			if (error) errs.push(`Q${q.question_number ?? ''}: ${error.message}`)
		}
		if (errs.length > 0) return NextResponse.json({ error: `Some questions failed: ${errs.slice(0, 3).join('; ')}` }, { status: 500 })
	}

	const { data: updated } = await supabase.from('ia_question_papers').select('*, ia_paper_questions(*)').eq('id', id).single()
	if (updated) updated.ia_paper_questions = (updated.ia_paper_questions || []).sort((a: any, b: any) => a.display_order - b.display_order)
	return NextResponse.json({ data: updated })
})

export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const id = idFromUrl(request.url)
	const { data: paper } = await supabase.from('ia_question_papers').select('status, institutions_id').eq('id', id).single()
	if (!paper || !institutionAllowed(context, paper.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}
	if (paper.status === 'locked') return NextResponse.json({ error: 'Cannot delete a locked paper' }, { status: 400 })
	const { error } = await supabase.from('ia_question_papers').delete().eq('id', id)
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ success: true })
})
