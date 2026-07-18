import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { scaffoldQuestions, mergeAuthored } from '@/lib/ia/paper-scaffold'

const EDITABLE_STATUSES = ['draft', 'submitted']
const VALID_STATUSES = ['draft', 'submitted', 'approved', 'locked']

// Read a paper's questions (ordered) from the JSONB column.
function readQuestions(paper: any): any[] {
	const qs = Array.isArray(paper.questions) ? paper.questions : []
	return qs.slice().sort((a: any, b: any) => a.display_order - b.display_order)
}

// GET - a single paper with its questions, template parts, and course outcomes
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		const { data: paper, error } = await supabase
			.from('ia_question_papers')
			.select('*')
			.eq('id', id)
			.single()
		if (error || !paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

		const questions = readQuestions(paper)

		let template_parts: any[] = []
		if (paper.template_id) {
			const { data } = await supabase
				.from('ia_template_parts')
				.select('*')
				.eq('template_id', paper.template_id)
				.order('display_order', { ascending: true })
			template_parts = data || []
		}
		let course_outcomes: any[] = []
		if (paper.course_id) {
			const { data } = await supabase
				.from('ia_course_outcomes')
				.select('*')
				.eq('course_id', paper.course_id)
				.eq('is_active', true)
				.order('display_order', { ascending: true })
			course_outcomes = data || []
		}

		return NextResponse.json({ ...paper, questions, template_parts, course_outcomes })
	} catch (error) {
		console.error('Error in GET paper:', error)
		return NextResponse.json({ error: 'Failed to fetch paper' }, { status: 500 })
	}
}

// PUT - save questions / meta / status, or rebuild. Single atomic UPDATE with an
// optimistic-concurrency guard (base_updated_at) so a concurrent edit can't be
// silently clobbered.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params
		const body = await req.json()
		const { questions, status, subject_title, exam_date, paper_setter_id, duration_minutes, base_updated_at } = body

		const { data: paper } = await supabase
			.from('ia_question_papers')
			.select('*')
			.eq('id', id)
			.single()
		if (!paper) return NextResponse.json({ error: 'Paper not found' }, { status: 404 })

		// ── Rebuild from template (draft only; merge-preserves answered content) ──
		if (body.regenerate) {
			if (paper.status !== 'draft') {
				return NextResponse.json({ error: 'Rebuild is only allowed while the paper is in draft' }, { status: 400 })
			}
			if (!paper.template_id) {
				return NextResponse.json({ error: 'Paper has no template to rebuild from' }, { status: 400 })
			}
			const existing = readQuestions(paper)
			if (!body.force) {
				const authored = existing.some((q: any) => (q?.question_text || '').trim() !== '')
				if (authored) {
					return NextResponse.json(
						{ error: 'AUTHORED', message: 'This paper already has questions entered. Pass force:true to overwrite.' },
						{ status: 409 }
					)
				}
			}
			const [{ data: parts }, { data: tmpl }] = await Promise.all([
				supabase.from('ia_template_parts').select('*').eq('template_id', paper.template_id).order('display_order', { ascending: true }),
				supabase.from('ia_paper_templates').select('total_marks').eq('id', paper.template_id).single(),
			])
			const merged = mergeAuthored(scaffoldQuestions(parts || []), existing)
			const { data: updated, error: uErr } = await supabase
				.from('ia_question_papers')
				.update({ questions: merged, max_marks: tmpl?.total_marks ?? paper.max_marks })
				.eq('id', id)
				.select()
				.single()
			if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
			return NextResponse.json({ ...updated, saved_count: merged.length })
		}

		// ── Build one atomic patch (questions + meta + status) ──
		const patch: any = {}
		let savedCount = 0

		if (Array.isArray(questions)) {
			if (!EDITABLE_STATUSES.includes(status || paper.status)) {
				return NextResponse.json(
					{ error: `Cannot edit questions while paper is ${paper.status}` },
					{ status: 400 }
				)
			}
			// Only accept known question ids; preserve order and any fields not sent.
			const current = readQuestions(paper)
			const byId = new Map(current.map((q: any) => [q.id, q]))
			for (const q of questions) {
				const base = byId.get(q.id)
				if (!base) continue
				byId.set(q.id, {
					...base,
					question_text: q.question_text ?? null,
					marks: q.marks ?? base.marks ?? null,
					options: q.options ?? null,
					correct_option: q.correct_option ?? null,
					co_code: q.co_code ?? null,
					k_level: q.k_level ?? null,
				})
			}
			patch.questions = current.map((q: any) => byId.get(q.id))
			savedCount = current.length
		}

		if (status) {
			if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
			patch.status = status
			if (status === 'submitted') patch.submitted_at = new Date().toISOString()
			if (status === 'approved') patch.approved_at = new Date().toISOString()
			if (status === 'locked') patch.locked_at = new Date().toISOString()
		}
		if (subject_title !== undefined) patch.subject_title = subject_title
		if (exam_date !== undefined) patch.exam_date = exam_date || null
		if (paper_setter_id !== undefined) patch.paper_setter_id = paper_setter_id || null
		if (duration_minutes !== undefined) patch.duration_minutes = duration_minutes ? parseInt(duration_minutes) : null

		if (Object.keys(patch).length === 0) {
			return NextResponse.json({ ...paper, questions: readQuestions(paper), saved_count: 0 })
		}

		// Optimistic concurrency: if base_updated_at is provided, the row must be unchanged.
		let q = supabase.from('ia_question_papers').update(patch).eq('id', id)
		if (base_updated_at) q = q.eq('updated_at', base_updated_at)
		const { data: updated, error: uErr } = await q.select().single()

		if (uErr && uErr.code === 'PGRST116') {
			// No row matched → the paper changed under this editor.
			return NextResponse.json(
				{ error: 'CONFLICT', message: 'This paper was changed elsewhere. Reload before saving.' },
				{ status: 409 }
			)
		}
		if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

		const questionsOut = Array.isArray(updated.questions)
			? updated.questions.slice().sort((a: any, b: any) => a.display_order - b.display_order)
			: []
		return NextResponse.json({ ...updated, questions: questionsOut, saved_count: savedCount })
	} catch (error) {
		console.error('Error in PUT paper:', error)
		return NextResponse.json({ error: 'Failed to save paper' }, { status: 500 })
	}
}

// DELETE - remove a paper
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const supabase = getSupabaseServer()
		const { id } = await params

		const { data: paper } = await supabase.from('ia_question_papers').select('status').eq('id', id).single()
		if (paper && paper.status === 'locked') {
			return NextResponse.json({ error: 'Cannot delete a locked paper' }, { status: 400 })
		}

		const { error } = await supabase.from('ia_question_papers').delete().eq('id', id)
		if (error) return NextResponse.json({ error: error.message }, { status: 500 })
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE paper:', error)
		return NextResponse.json({ error: 'Failed to delete paper' }, { status: 500 })
	}
}
