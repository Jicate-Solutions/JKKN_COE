import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { scaffoldQuestions } from '@/lib/ia/paper-scaffold'

const EDITABLE_STATUSES = ['draft', 'submitted']
const VALID_STATUSES = ['draft', 'submitted', 'approved', 'locked']

// GET - a single paper with its questions and the template parts (for grouping)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		const { data: paper, error } = await supabase
			.from('ia_question_papers')
			.select('*, ia_paper_questions(*)')
			.eq('id', id)
			.single()

		if (error || !paper) {
			return NextResponse.json({ error: 'Paper not found' }, { status: 404 })
		}

		// Sort questions
		paper.ia_paper_questions = (paper.ia_paper_questions || []).sort(
			(a: any, b: any) => a.display_order - b.display_order
		)

		// Template parts (instructions / titles for rendering)
		let parts: any[] = []
		if (paper.template_id) {
			const { data } = await supabase
				.from('ia_template_parts')
				.select('*')
				.eq('template_id', paper.template_id)
				.order('display_order', { ascending: true })
			parts = data || []
		}

		// Course outcomes for the CO dropdown
		let outcomes: any[] = []
		if (paper.course_id) {
			const { data } = await supabase
				.from('ia_course_outcomes')
				.select('*')
				.eq('course_id', paper.course_id)
				.eq('is_active', true)
				.order('display_order', { ascending: true })
			outcomes = data || []
		}

		return NextResponse.json({ ...paper, template_parts: parts, course_outcomes: outcomes })
	} catch (error) {
		console.error('Error in GET paper:', error)
		return NextResponse.json({ error: 'Failed to fetch paper' }, { status: 500 })
	}
}

// PUT - save questions and/or update paper meta + status
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params
		const body = await req.json()
		const { questions, status, subject_title, exam_date, paper_setter_id, duration_minutes } = body

		const { data: paper } = await supabase
			.from('ia_question_papers')
			.select('id, status, template_id')
			.eq('id', id)
			.single()
		if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

		// ── Rebuild question slots from the current template (draft only; clears authored text) ──
		if (body.regenerate) {
			if (paper.status !== 'draft') {
				return NextResponse.json(
					{ error: 'Rebuild is only allowed while the paper is in draft' },
					{ status: 400 }
				)
			}
			if (!paper.template_id) {
				return NextResponse.json({ error: 'Paper has no template to rebuild from' }, { status: 400 })
			}
			const { data: parts } = await supabase
				.from('ia_template_parts')
				.select('*')
				.eq('template_id', paper.template_id)
				.order('display_order', { ascending: true })

			await supabase.from('ia_paper_questions').delete().eq('paper_id', id)
			const rows = scaffoldQuestions(id, parts || [])
			if (rows.length > 0) {
				const { error: insErr } = await supabase.from('ia_paper_questions').insert(rows)
				if (insErr) {
					console.error('Error rebuilding questions:', insErr)
					return NextResponse.json({ error: insErr.message }, { status: 500 })
				}
			}
			// also refresh max_marks from the template total
			const { data: tmpl } = await supabase
				.from('ia_paper_templates')
				.select('total_marks')
				.eq('id', paper.template_id)
				.single()
			if (tmpl) await supabase.from('ia_question_papers').update({ max_marks: tmpl.total_marks }).eq('id', id)

			const { data: rebuilt } = await supabase
				.from('ia_question_papers')
				.select('*, ia_paper_questions(*)')
				.eq('id', id)
				.single()
			if (rebuilt) {
				rebuilt.ia_paper_questions = (rebuilt.ia_paper_questions || []).sort(
					(a: any, b: any) => a.display_order - b.display_order
				)
			}
			return NextResponse.json(rebuilt)
		}

		// ── Status transition ──
		if (status) {
			if (!VALID_STATUSES.includes(status)) {
				return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
			}
			const patch: any = { status }
			if (status === 'submitted') patch.submitted_at = new Date().toISOString()
			if (status === 'approved') patch.approved_at = new Date().toISOString()
			if (status === 'locked') patch.locked_at = new Date().toISOString()
			const { error } = await supabase.from('ia_question_papers').update(patch).eq('id', id)
			if (error) {
				console.error('Error updating status:', error)
				return NextResponse.json({ error: error.message }, { status: 500 })
			}
		}

		// ── Meta updates ──
		const metaPatch: any = {}
		if (subject_title !== undefined) metaPatch.subject_title = subject_title
		if (exam_date !== undefined) metaPatch.exam_date = exam_date || null
		if (paper_setter_id !== undefined) metaPatch.paper_setter_id = paper_setter_id || null
		if (duration_minutes !== undefined) {
			metaPatch.duration_minutes = duration_minutes ? parseInt(duration_minutes) : null
		}
		if (Object.keys(metaPatch).length > 0) {
			await supabase.from('ia_question_papers').update(metaPatch).eq('id', id)
		}

		// ── Question edits (blocked once approved/locked) ──
		if (Array.isArray(questions) && questions.length > 0) {
			if (!EDITABLE_STATUSES.includes(paper.status)) {
				return NextResponse.json(
					{ error: `Cannot edit questions while paper is ${paper.status}` },
					{ status: 400 }
				)
			}
			const qErrors: string[] = []
			for (const q of questions) {
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
				if (error) {
					console.error('Error saving question', q.id, error)
					qErrors.push(`Q${q.question_number ?? ''}: ${error.message}`)
				}
			}
			if (qErrors.length > 0) {
				return NextResponse.json(
					{ error: `Some questions failed to save: ${qErrors.slice(0, 3).join('; ')}` },
					{ status: 500 }
				)
			}
		}

		const { data: updated } = await supabase
			.from('ia_question_papers')
			.select('*, ia_paper_questions(*)')
			.eq('id', id)
			.single()
		if (updated) {
			updated.ia_paper_questions = (updated.ia_paper_questions || []).sort(
				(a: any, b: any) => a.display_order - b.display_order
			)
		}
		return NextResponse.json(updated)
	} catch (error) {
		console.error('Error in PUT paper:', error)
		return NextResponse.json({ error: 'Failed to save paper' }, { status: 500 })
	}
}

// DELETE - remove a paper (and its questions via cascade)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		const { data: paper } = await supabase
			.from('ia_question_papers')
			.select('status')
			.eq('id', id)
			.single()
		if (paper && paper.status === 'locked') {
			return NextResponse.json({ error: 'Cannot delete a locked paper' }, { status: 400 })
		}

		const { error } = await supabase.from('ia_question_papers').delete().eq('id', id)
		if (error) {
			console.error('Error deleting paper:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE paper:', error)
		return NextResponse.json({ error: 'Failed to delete paper' }, { status: 500 })
	}
}
