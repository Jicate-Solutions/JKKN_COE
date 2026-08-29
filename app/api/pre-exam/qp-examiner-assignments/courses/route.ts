// Assignable end-semester question papers for a session.
//
// GET /api/pre-exam/qp-examiner-assignments/courses
//     ?institutions_id=&examination_session_id=&program_code=&semester=
//
// Returns one row per (course offering × paper set) with the ESE template that
// applies and, when a shell already exists, the paper and its assignment. The
// assignment screen shows the whole subject list for the semester and marks
// which ones are already handed out, so the CoE never has to guess what is left.
//
// A course is listed when:
//   • it is offered in the session, program and semester, and
//   • its evaluation type includes an end-semester component, and
//   • an ACTIVE ESE template covers its course category.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { pickTemplateForCourse, formatApplicability } from '@/lib/ia/course-type-applicability'

export const dynamic = 'force-dynamic'

/** How many paper sets a course needs (courses.multiple_qp_set: bool or count). */
function setCount(multiple: unknown): number {
	if (typeof multiple === 'number') return multiple > 1 ? multiple : 1
	if (multiple === true) return 2
	return 1
}

/** Courses with no external component never get an end-semester paper. */
function hasEndSemester(evaluationType?: string | null): boolean {
	if (!evaluationType) return true // unset = assume the normal CIA + ESE course
	const v = evaluationType.toUpperCase()
	return v.includes('ESE') || v.includes('EXTERNAL')
}

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const programCode = searchParams.get('program_code')
		const semester = searchParams.get('semester')

		if (!institutionsId || !sessionId) {
			return NextResponse.json(
				{ error: 'institutions_id and examination_session_id are required' },
				{ status: 400 }
			)
		}

		// ── 1. Offerings ──────────────────────────────────────────────────────
		let offeringQuery = supabase
			.from('course_offerings')
			.select('id, course_id, course_code, program_code, semester')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('is_active', true)
			.order('course_code', { ascending: true })
			.order('id', { ascending: true })

		if (programCode) offeringQuery = offeringQuery.eq('program_code', programCode)
		if (semester) offeringQuery = offeringQuery.eq('semester', Number(semester))

		const { data: offerings, error: offErr } = await offeringQuery.range(0, 999)
		if (offErr) {
			console.error('[QP assign] offerings fetch failed:', offErr.message)
			return NextResponse.json({ error: offErr.message }, { status: 500 })
		}
		if (!offerings?.length) {
			return NextResponse.json({ data: [], templates_cover: null, message: 'No courses offered for this selection' })
		}

		// ── 2. Course master ──────────────────────────────────────────────────
		const codes = [...new Set(offerings.map(o => o.course_code).filter(Boolean))]
		const courses: any[] = []
		for (let i = 0; i < codes.length; i += 200) {
			const { data } = await supabase
				.from('courses')
				.select(
					'id, course_code, course_name, course_type, course_category, evaluation_type, multiple_qp_set, exam_duration, external_max_mark'
				)
				.eq('institutions_id', institutionsId)
				.in('course_code', codes.slice(i, i + 200))
			courses.push(...(data || []))
		}
		const courseByCode = new Map(courses.map(c => [c.course_code, c]))

		// ── 3. Active ESE templates ───────────────────────────────────────────
		const { data: templates } = await supabase
			.from('ia_paper_templates')
			.select('*, ia_template_parts(*)')
			.eq('institutions_id', institutionsId)
			.eq('is_active', true)
			.eq('status', 'active')
			.in('exam_scope', ['ese', 'all'])
			.order('is_default', { ascending: false })
			.order('wef_date', { ascending: false })

		const templateList = templates || []
		if (templateList.length === 0) {
			const { count } = await supabase
				.from('ia_paper_templates')
				.select('id', { count: 'exact', head: true })
				.eq('institutions_id', institutionsId)
				.in('exam_scope', ['ese', 'all'])
			return NextResponse.json({
				data: [],
				templates_cover: null,
				error:
					count && count > 0
						? 'An End-Semester template exists but is not Active — open it in Question Paper Templates and set its status to Active.'
						: 'No End-Semester question paper template exists yet. Create one in Question Paper Templates with Exam Scope = ESE, then activate it.',
			}, { status: 400 })
		}

		// ── 4. Existing ESE shells + their assignments ────────────────────────
		const offeringIds = offerings.map(o => o.id)
		const papers: any[] = []
		for (let i = 0; i < offeringIds.length; i += 200) {
			const { data } = await supabase
				.from('ia_question_papers')
				.select('id, course_offering_id, set_number, set_label, status, max_marks, template_id, questions')
				.eq('examination_session_id', sessionId)
				.is('cia_setting_id', null)
				.is('cia_round', null)
				.in('course_offering_id', offeringIds.slice(i, i + 200))
			papers.push(...(data || []))
		}
		const paperByKey = new Map(papers.map(p => [`${p.course_offering_id}:${p.set_number}`, p]))

		const paperIds = papers.map(p => p.id)
		const assignments: any[] = []
		for (let i = 0; i < paperIds.length; i += 200) {
			const { data } = await supabase
				.from('ia_qp_assignments')
				.select('id, paper_id, examiner_id, examiner_kind, status, valid_from, valid_to, order_ref_no')
				.in('paper_id', paperIds.slice(i, i + 200))
			assignments.push(...(data || []))
		}
		const assignmentByPaper = new Map(assignments.map(a => [a.paper_id, a]))

		const examinerIds = [...new Set(assignments.map(a => a.examiner_id))]
		const examinerById = new Map<string, any>()
		for (let i = 0; i < examinerIds.length; i += 200) {
			const { data } = await supabase
				.from('examiners')
				.select('id, full_name, email, designation, department')
				.in('id', examinerIds.slice(i, i + 200))
			for (const e of data || []) examinerById.set(e.id, e)
		}

		// ── 5. One row per (offering × set) ───────────────────────────────────
		const rows: any[] = []
		const notApplicable: string[] = []
		const seen = new Set<string>()

		for (const off of offerings) {
			if (seen.has(off.id)) continue
			seen.add(off.id)

			const course = courseByCode.get(off.course_code)
			if (!hasEndSemester(course?.evaluation_type)) continue

			const template = pickTemplateForCourse(templateList, course?.course_category)
			if (!template) {
				notApplicable.push(`${off.course_code} (${course?.course_category || 'no category'})`)
				continue
			}

			const sets = setCount(course?.multiple_qp_set)
			for (let n = 1; n <= sets; n++) {
				const paper = paperByKey.get(`${off.id}:${n}`)
				const assignment = paper ? assignmentByPaper.get(paper.id) : null
				const examiner = assignment ? examinerById.get(assignment.examiner_id) : null
				const authored =
					paper && Array.isArray(paper.questions)
						? paper.questions.some((q: any) => String(q?.question_text || '').trim() !== '')
						: false

				rows.push({
					course_offering_id: off.id,
					course_id: course?.id || off.course_id,
					course_code: off.course_code,
					subject_title: course?.course_name || off.course_code,
					course_category: course?.course_category || null,
					program_code: off.program_code,
					semester: off.semester,
					set_number: n,
					set_label: sets > 1 ? String.fromCharCode(64 + n) : null,
					template_id: template.id,
					template_name: template.template_name,
					template_total_marks: template.total_marks,
					duration_minutes: template.duration_minutes || course?.exam_duration || null,
					paper_id: paper?.id || null,
					paper_status: paper?.status || null,
					authored,
					assignment: assignment
						? {
								id: assignment.id,
								status: assignment.status,
								examiner_kind: assignment.examiner_kind,
								valid_from: assignment.valid_from,
								valid_to: assignment.valid_to,
								order_ref_no: assignment.order_ref_no,
								examiner_name: examiner?.full_name || null,
								examiner_email: examiner?.email || null,
							}
						: null,
				})
			}
		}

		const covered = [
			...new Set(templateList.map(t => formatApplicability(t.course_type_applicability))),
		].join(', ')

		return NextResponse.json({
			data: rows,
			templates_cover: covered,
			not_applicable: notApplicable,
		})
	} catch (error) {
		console.error('[QP assign] courses route failed:', error)
		return NextResponse.json({ error: 'Failed to load assignable courses' }, { status: 500 })
	}
}
