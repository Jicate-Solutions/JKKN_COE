import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { resolveInstitutionForKey } from '@/lib/ia/v1-helpers'
import { scaffoldQuestions } from '@/lib/ia/paper-scaffold'
import { formatApplicability, pickTemplateForCourse } from '@/lib/ia/course-type-applicability'

/** /api/v1/ia/question-papers — list + generate. */

function setCount(multiple: any): number {
	if (typeof multiple === 'number') return multiple > 1 ? multiple : 1
	if (multiple === true) return 2
	return 1
}

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const inst = await resolveInstitutionForKey(supabase, context, searchParams.get('institution_code'))
	if ('error' in inst) return NextResponse.json({ error: inst.error }, { status: 400 })

	let query = supabase
		.from('ia_question_papers')
		.select('*')
		.eq('is_active', true)
		.eq('institutions_id', inst.id)
		.order('course_code', { ascending: true })
		.order('set_number', { ascending: true })
	if (searchParams.get('examination_session_id')) query = query.eq('examination_session_id', searchParams.get('examination_session_id'))
	if (searchParams.get('cia_round')) query = query.eq('cia_round', Number(searchParams.get('cia_round')))
	if (searchParams.get('program_code')) query = query.eq('program_code', searchParams.get('program_code'))
	if (searchParams.get('semester')) query = query.eq('semester', Number(searchParams.get('semester')))
	if (searchParams.get('status')) query = query.eq('status', searchParams.get('status'))
	// course_code filter — single or comma-separated (MyJKKN passes a staff's assigned CAS courses)
	const courseCode = searchParams.get('course_code')
	if (courseCode) {
		const codes = courseCode.split(',').map(c => c.trim()).filter(Boolean)
		query = codes.length > 1 ? query.in('course_code', codes) : query.eq('course_code', codes[0])
	}
	// author_id filter — papers stamped to a specific MyJKKN staff profile
	if (searchParams.get('author_id')) query = query.eq('author_id', searchParams.get('author_id'))

	const { data, error } = await query.range(0, 9999)
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ data })
})

export const POST = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const inst = await resolveInstitutionForKey(supabase, context, body.institution_code)
	if ('error' in inst) return NextResponse.json({ error: inst.error }, { status: 400 })

	const { examination_session_id, program_code, semester, cia_setting_id, cia_round, cia_round_name, template_id } = body
	if (!examination_session_id || !program_code || !semester) {
		return NextResponse.json({ error: 'examination_session_id, program_code and semester are required' }, { status: 400 })
	}
	const round = cia_round ? Number(cia_round) : 1
	const authorId = body.author_id || null

	const { data: offerings } = await supabase
		.from('course_offerings')
		.select('id, course_id, program_id, semester, course_code, program_code')
		.eq('institutions_id', inst.id)
		.eq('examination_session_id', examination_session_id)
		.eq('program_code', program_code)
		.eq('semester', Number(semester))
		.eq('is_active', true)
	if (!offerings || offerings.length === 0) {
		return NextResponse.json({ error: 'No course offerings found for this selection' }, { status: 404 })
	}

	const codes = [...new Set(offerings.map((o: any) => o.course_code).filter(Boolean))]
	const { data: courses } = await supabase
		.from('courses')
		.select('id, course_code, course_name, course_type, course_category, evaluation_type, multiple_qp_set')
		.eq('institutions_id', inst.id)
		.in('course_code', codes)
	const courseByCode = new Map((courses || []).map((c: any) => [c.course_code, c]))

	let templates: any[] = []
	if (template_id) {
		const { data } = await supabase.from('ia_paper_templates').select('*, ia_template_parts(*)').eq('id', template_id).limit(1)
		templates = data || []
	} else {
		const { data } = await supabase
			.from('ia_paper_templates')
			.select('*, ia_template_parts(*)')
			.eq('institutions_id', inst.id)
			.eq('is_active', true)
			.eq('status', 'active')
			.in('exam_scope', ['cia', 'all'])
			.order('is_default', { ascending: false })
			.order('wef_date', { ascending: false })
		templates = data || []
	}
	if (templates.length === 0) {
		return NextResponse.json({ error: 'No active CIA template found for this institution' }, { status: 400 })
	}
	// Match the template whose Course Type covers the course's category
	// (courses.course_category); null => no template applies, so no paper.
	// Applies to an explicit template_id too — `templates` is then just that one,
	// so a Theory-only template still skips Practical courses.
	const pickTemplate = (courseCategory?: string | null) =>
		pickTemplateForCourse(templates, courseCategory)

	const offeringIds = offerings.map((o: any) => o.id)
	const { data: existing } = await supabase
		.from('ia_question_papers')
		.select('course_offering_id, set_number')
		.eq('examination_session_id', examination_session_id)
		.eq('cia_round', round)
		.in('course_offering_id', offeringIds)
	const existingKey = new Set((existing || []).map((e: any) => `${e.course_offering_id}:${e.set_number}`))

	const created: any[] = []
	let skipped = 0
	// Courses no active template covers (e.g. Practical when only Theory templates exist)
	const notApplicable: string[] = []
	const seen = new Set<string>()
	for (const off of offerings) {
		if (seen.has(off.id)) continue
		seen.add(off.id)
		const course: any = courseByCode.get(off.course_code)
		const evalType = course?.evaluation_type || ''
		if (evalType && evalType !== 'CIA' && evalType !== 'CIA + ESE') continue

		const tmpl = pickTemplate(course?.course_category)
		if (!tmpl) {
			notApplicable.push(`${off.course_code} (${course?.course_category || 'no category'})`)
			continue
		}
		const parts = tmpl.ia_template_parts || []
		const sets = setCount(course?.multiple_qp_set)

		for (let s = 1; s <= sets; s++) {
			if (existingKey.has(`${off.id}:${s}`)) { skipped++; continue }
			const { data: paper, error: pErr } = await supabase
				.from('ia_question_papers')
				.insert({
					institutions_id: inst.id,
					examination_session_id,
					cia_setting_id: cia_setting_id || null,
					cia_round: round,
					cia_round_name: cia_round_name || null,
					course_offering_id: off.id,
					course_id: course?.id || off.course_id,
					course_code: off.course_code,
					program_code: off.program_code,
					semester: off.semester,
					template_id: tmpl.id,
					template_version: tmpl.version_number,
					set_number: s,
					set_label: sets > 1 ? String.fromCharCode(64 + s) : null,
					subject_title: course?.course_name || off.course_code,
					duration_minutes: tmpl.duration_minutes || null,
					max_marks: tmpl.total_marks,
					status: 'draft',
					created_by: authorId,
					author_id: authorId,
				})
				.select()
				.single()
			if (pErr) { console.error('[v1 generate] paper insert', pErr); continue }
			const rows = scaffoldQuestions(paper.id, parts)
			if (rows.length > 0) await supabase.from('ia_paper_questions').insert(rows)
			created.push(paper)
		}
	}

	const covered = [...new Set(templates.map(t => formatApplicability(t.course_type_applicability)))].join(', ')

	return NextResponse.json(
		{
			data: {
				created: created.length,
				skipped,
				not_applicable: notApplicable.length,
				not_applicable_courses: notApplicable,
				...(notApplicable.length ? { templates_cover: covered } : {}),
			},
		},
		{ status: 201 }
	)
})
