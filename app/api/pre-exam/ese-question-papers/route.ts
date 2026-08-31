// End-Semester question papers — the generation step.
//
// GET  /api/pre-exam/ese-question-papers?action=generable  the subjects of an
//      end-semester session, each with the format that applies and the paper
//      already generated for it (if any)
// GET  /api/pre-exam/ese-question-papers                   list generated papers
// POST /api/pre-exam/ese-question-papers                   generate / rebuild
//
// This is step one of the flow. The CoE picks the subject and the FORMAT here;
// only once a paper exists does the Assign tab attach an examiner to it. That
// ordering is why template_id is NOT NULL on ese_question_papers — a paper with
// no format has no question skeleton for the examiner to fill in.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { scaffoldQuestions, mergeAuthored } from '@/lib/ia/paper-scaffold'
import {
	pickTemplateForCourse,
	formatApplicability,
	hasTheoryPaper,
	nonTheoryReason,
} from '@/lib/ia/course-type-applicability'
import { programTypeToken } from '@/lib/ia/program-type'
import { requireUserPermission } from '@/lib/auth/check-user-permission'
import { isEndSemesterExamType, endSemesterMismatchMessage } from '@/lib/qp-portal/exam-type'
import type { EseGenerateInput } from '@/types/ese-question-paper'

export const dynamic = 'force-dynamic'

const PERMISSION = 'page.pre_exam.qp_examiner_assignment.view'

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

/** Read every row of a table in pages — Supabase caps a single fetch at 1000. */
async function fetchAll(build: (from: number, to: number) => any): Promise<any[]> {
	const PAGE = 1000
	const out: any[] = []
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await build(from, from + PAGE - 1)
		if (error) throw new Error(error.message)
		const rows = data || []
		out.push(...rows)
		if (rows.length < PAGE) break
	}
	return out
}

/** The session must be an End Semester examination, and we need its exam type. */
async function requireEndSemesterSession(supabase: any, sessionId: string) {
	const { data: session } = await supabase
		.from('examination_sessions')
		.select('id, session_name, exam_type_id, institutions_id')
		.eq('id', sessionId)
		.maybeSingle()
	if (!session) return { ok: false as const, status: 404, error: 'Examination session not found' }

	const { data: examType } = session.exam_type_id
		? await supabase
				.from('exam_types')
				.select('id, examination_code, examination_name')
				.eq('id', session.exam_type_id)
				.maybeSingle()
		: { data: null }

	if (!isEndSemesterExamType(examType)) {
		return {
			ok: false as const,
			status: 400,
			error: endSemesterMismatchMessage(session.session_name, examType),
		}
	}
	return { ok: true as const, session, examType }
}

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')

		if (!institutionsId || !sessionId) {
			return NextResponse.json(
				{ error: 'institutions_id and examination_session_id are required' },
				{ status: 400 }
			)
		}

		const templatesRes = await supabase
			.from('ia_paper_templates')
			.select('id, template_name, template_code, total_marks, duration_minutes, version_number, course_type_applicability, program_type_applicability, is_default, wef_date')
			.eq('institutions_id', institutionsId)
			.eq('is_active', true)
			.eq('status', 'active')
			.in('exam_scope', ['ese', 'all'])
			.order('is_default', { ascending: false })
			.order('wef_date', { ascending: false })
			.order('id', { ascending: true })
		const templateList = templatesRes.data || []
		const templateById = new Map(templateList.map(t => [t.id, t]))

		// ── The generated papers of this session ──────────────────────────────
		const papers = await fetchAll((from, to) =>
			supabase
				.from('ese_question_papers')
				.select('*')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)
				.order('course_code', { ascending: true })
				.order('id', { ascending: true })
				.range(from, to)
		)

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

		const examinerIds = [...new Set(assignments.map(a => a.examiner_id).filter(Boolean))]
		const examinerById = new Map<string, any>()
		for (let i = 0; i < examinerIds.length; i += 200) {
			const { data } = await supabase
				.from('examiners')
				.select('id, full_name, email')
				.in('id', examinerIds.slice(i, i + 200))
			for (const e of data || []) examinerById.set(e.id, e)
		}

		const describePaper = (p: any) => {
			const qs = Array.isArray(p.questions) ? p.questions : []
			const authoredCount = qs.filter((q: any) => String(q?.question_text || '').trim() !== '').length
			const a = assignmentByPaper.get(p.id)
			const examiner = a ? examinerById.get(a.examiner_id) : null
			const { questions, ...rest } = p
			return {
				...rest,
				authored: authoredCount > 0,
				authored_count: authoredCount,
				question_count: qs.length,
				template_name: templateById.get(p.template_id)?.template_name || null,
				assignment: a
					? {
							id: a.id,
							status: a.status,
							examiner_kind: a.examiner_kind,
							examiner_name: examiner?.full_name || null,
							examiner_email: examiner?.email || null,
							valid_from: a.valid_from,
							valid_to: a.valid_to,
							order_ref_no: a.order_ref_no,
						}
					: null,
			}
		}

		// Plain list mode.
		if (searchParams.get('action') !== 'generable') {
			return NextResponse.json({ data: papers.map(describePaper), count: papers.length })
		}

		// ── Generable mode: every ESE subject of the session ──────────────────
		const guard = await requireEndSemesterSession(supabase, sessionId)
		if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

		if (templateList.length === 0) {
			// Formats are per-institution, so "none exist" is very often really "you
			// are looking at the wrong institution". Name the institution, say
			// whether an inactive format is already sitting there, and point at the
			// institutions that do have one — otherwise this message sends people
			// off to create a duplicate of a format they already own.
			const [{ data: institution }, { data: ownTemplates }, { data: elsewhere }] = await Promise.all([
				supabase.from('institutions').select('id, name, institution_code').eq('id', institutionsId).maybeSingle(),
				supabase
					.from('ia_paper_templates')
					.select('id, template_name, status, is_active')
					.eq('institutions_id', institutionsId)
					.in('exam_scope', ['ese', 'all']),
				supabase
					.from('ia_paper_templates')
					.select('institutions_id')
					.neq('institutions_id', institutionsId)
					.eq('is_active', true)
					.eq('status', 'active')
					.in('exam_scope', ['ese', 'all']),
			])

			const here = institution?.institution_code || institution?.name || 'this institution'
			const inactive = (ownTemplates || []).filter(t => t.status !== 'active' || !t.is_active)

			let otherCodes: string[] = []
			const otherIds = [...new Set((elsewhere || []).map(t => t.institutions_id))]
			if (otherIds.length) {
				const { data: others } = await supabase
					.from('institutions')
					.select('institution_code, name')
					.in('id', otherIds)
				otherCodes = (others || []).map(o => o.institution_code || o.name).filter(Boolean)
			}

			const message =
				inactive.length > 0
					? `${here} has ${inactive.length} End-Semester format(s) that are not Active — open ${inactive
							.map(t => `"${t.template_name}"`)
							.join(', ')} in Question Paper Templates and set the status to Active.`
					: `No active End-Semester question paper format exists for ${here}. Create one in Question Paper Templates with Exam Scope = ESE and activate it${
							otherCodes.length
								? `, or switch institution to ${otherCodes.join(' / ')} — ${otherCodes.length === 1 ? 'that one has' : 'those have'} a format already.`
								: '.'
						}`

			return NextResponse.json(
				{
					data: [],
					templates: [],
					institution_code: institution?.institution_code || null,
					institutions_with_formats: otherCodes,
					error: message,
				},
				{ status: 400 }
			)
		}

		const programCode = searchParams.get('program_code')
		const semester = searchParams.get('semester')

		const offerings = await fetchAll((from, to) => {
			let q = supabase
				.from('course_offerings')
				.select('id, course_id, course_code, program_code, semester')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)
				.order('course_code', { ascending: true })
				.order('id', { ascending: true })
			if (programCode) q = q.eq('program_code', programCode)
			if (semester) q = q.eq('semester', Number(semester))
			return q.range(from, to)
		})

		const codes = [...new Set(offerings.map(o => o.course_code).filter(Boolean))]
		const courses: any[] = []
		for (let i = 0; i < codes.length; i += 200) {
			const { data } = await supabase
				.from('courses')
				.select('id, course_code, course_name, course_category, evaluation_type, multiple_qp_set, exam_duration')
				.eq('institutions_id', institutionsId)
				.in('course_code', codes.slice(i, i + 200))
			courses.push(...(data || []))
		}
		const courseByCode = new Map(courses.map(c => [c.course_code, c]))
		const paperByKey = new Map(papers.map(p => [`${p.course_offering_id}:${p.set_number}`, p]))

		const rows: any[] = []
		const seen = new Set<string>()
		// Courses deliberately left out because they sit no written theory paper.
		// Reported back so the CoE can see the list is filtered, not incomplete.
		const nonTheory: { course_code: string; reason: string }[] = []

		for (const off of offerings) {
			if (seen.has(off.id)) continue
			seen.add(off.id)

			const course = courseByCode.get(off.course_code)
			if (!hasEndSemester(course?.evaluation_type)) continue

			// Only theory papers get a question-paper setter. Practical and
			// laboratory examinations are handled by the practical examiners.
			if (!hasTheoryPaper(course?.course_category)) {
				nonTheory.push({
					course_code: off.course_code,
					reason: nonTheoryReason(course?.course_category),
				})
				continue
			}

			const progType = programTypeToken(off.program_code)
			const suggested = pickTemplateForCourse(templateList, course?.course_category, progType)
			const sets = setCount(course?.multiple_qp_set)

			for (let n = 1; n <= sets; n++) {
				const paper = paperByKey.get(`${off.id}:${n}`)
				const described = paper ? describePaper(paper) : null
				rows.push({
					course_offering_id: off.id,
					course_id: course?.id || off.course_id,
					course_code: off.course_code,
					subject_title: course?.course_name || off.course_code,
					course_category: course?.course_category || null,
					program_code: off.program_code,
					program_type: progType,
					semester: off.semester,
					set_number: n,
					set_label: sets > 1 ? String.fromCharCode(64 + n) : null,

					suggested_template_id: suggested?.id || null,
					suggested_template_name: suggested?.template_name || null,
					no_template_reason: suggested
						? null
						: `No active End-Semester format covers ${course?.course_category || 'this course category'} for ${progType.toUpperCase()} programmes.`,

					paper_id: paper?.id || null,
					paper_status: paper?.status || null,
					paper_template_id: paper?.template_id || null,
					paper_template_name: described?.template_name || null,
					max_marks: paper?.max_marks ?? null,
					duration_minutes: paper?.duration_minutes ?? null,
					authored: described?.authored ?? false,
					authored_count: described?.authored_count ?? 0,
					question_count: described?.question_count ?? 0,

					assigned: !!described?.assignment,
					assignment_status: described?.assignment?.status || null,
					examiner_name: described?.assignment?.examiner_name || null,
				})
			}
		}

		return NextResponse.json({
			data: rows,
			// Practical / project / non-academic courses, excluded by rule.
			excluded_non_theory: nonTheory.length,
			excluded_non_theory_courses: nonTheory,
			templates: templateList.map(t => ({
				id: t.id,
				template_name: t.template_name,
				template_code: t.template_code,
				total_marks: t.total_marks,
				duration_minutes: t.duration_minutes,
				version_number: t.version_number,
				course_type_applicability: t.course_type_applicability,
				program_type_applicability: t.program_type_applicability,
				applicability_label: formatApplicability(t.course_type_applicability),
			})),
			exam_type: guard.examType,
		})
	} catch (error: any) {
		console.error('[ESE papers] GET failed:', error)
		return NextResponse.json({ error: error?.message || 'Failed to load question papers' }, { status: 500 })
	}
}

// ── POST — generate / rebuild ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
	try {
		const perm = await requireUserPermission(PERMISSION)
		if (!perm.ok) return NextResponse.json({ error: perm.error }, { status: perm.status })

		const supabase = getSupabaseServer()
		const body = (await req.json()) as EseGenerateInput
		const { institutions_id, examination_session_id, items, rebuild } = body

		if (!institutions_id || !examination_session_id || !Array.isArray(items) || items.length === 0) {
			return NextResponse.json(
				{ error: 'institutions_id, examination_session_id and at least one subject are required' },
				{ status: 400 }
			)
		}

		const guard = await requireEndSemesterSession(supabase, examination_session_id)
		if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

		const { data: institution } = await supabase
			.from('institutions')
			.select('id, institution_code')
			.eq('id', institutions_id)
			.maybeSingle()
		const institutionCode = body.institution_code || institution?.institution_code || null

		// ── Load every template and offering the batch refers to, once ────────
		const templateIds = [...new Set(items.map(i => i.template_id).filter(Boolean))]
		const { data: templates } = await supabase
			.from('ia_paper_templates')
			.select('*, ia_template_parts(*)')
			.in('id', templateIds.length ? templateIds : ['00000000-0000-0000-0000-000000000000'])
		const templateById = new Map((templates || []).map(t => [t.id, t]))

		const offeringIds = [...new Set(items.map(i => i.course_offering_id))]
		const offerings: any[] = []
		for (let i = 0; i < offeringIds.length; i += 200) {
			const { data } = await supabase
				.from('course_offerings')
				.select('id, course_id, course_code, program_code, semester')
				.in('id', offeringIds.slice(i, i + 200))
			offerings.push(...(data || []))
		}
		const offeringById = new Map(offerings.map(o => [o.id, o]))

		const codes = [...new Set(offerings.map(o => o.course_code).filter(Boolean))]
		const courses: any[] = []
		for (let i = 0; i < codes.length; i += 200) {
			const { data } = await supabase
				.from('courses')
				.select('id, course_code, course_name, course_category, multiple_qp_set, exam_duration')
				.eq('institutions_id', institutions_id)
				.in('course_code', codes.slice(i, i + 200))
			courses.push(...(data || []))
		}
		const courseByCode = new Map(courses.map(c => [c.course_code, c]))

		// Existing papers, so a re-run updates instead of colliding on the
		// (session, offering, set) unique key.
		const existing: any[] = []
		for (let i = 0; i < offeringIds.length; i += 200) {
			const { data } = await supabase
				.from('ese_question_papers')
				.select('id, course_offering_id, set_number, status, template_id, questions')
				.eq('examination_session_id', examination_session_id)
				.in('course_offering_id', offeringIds.slice(i, i + 200))
			existing.push(...(data || []))
		}
		const existingByKey = new Map(existing.map(p => [`${p.course_offering_id}:${p.set_number}`, p]))

		// Papers already handed to an examiner must not be re-scaffolded underneath
		// them — that would silently change the paper the order was issued for.
		const existingIds = existing.map(p => p.id)
		const assignedPaperIds = new Set<string>()
		for (let i = 0; i < existingIds.length; i += 200) {
			const { data } = await supabase
				.from('ia_qp_assignments')
				.select('paper_id, status')
				.in('paper_id', existingIds.slice(i, i + 200))
			for (const a of data || []) {
				if (a.status !== 'cancelled') assignedPaperIds.add(a.paper_id)
			}
		}

		let created = 0
		let rebuilt = 0
		let skipped = 0
		const failed: { course_code: string; reason: string }[] = []

		for (const item of items) {
			const off = offeringById.get(item.course_offering_id)
			const label = off?.course_code || item.course_offering_id
			if (!off) {
				failed.push({ course_code: label, reason: 'Course offering not found' })
				continue
			}
			const template = templateById.get(item.template_id)
			if (!template) {
				failed.push({ course_code: label, reason: 'The selected format no longer exists' })
				continue
			}

			const course = courseByCode.get(off.course_code)

			// The theory-only rule is enforced here too, not just in the listing —
			// a stale tab or a direct API call must not be able to create a question
			// paper for a practical or laboratory course.
			if (!hasTheoryPaper(course?.course_category)) {
				failed.push({
					course_code: label,
					reason: `${course?.course_category || 'This course'} sits no written theory paper — a question paper setter is appointed for theory papers only.`,
				})
				continue
			}

			const setNum = Number(item.set_number) || 1
			const sets = setCount(course?.multiple_qp_set)
			const setLabel = sets > 1 ? String.fromCharCode(64 + setNum) : null
			const parts = (template as any).ia_template_parts || []
			const prior = existingByKey.get(`${off.id}:${setNum}`)

			if (prior) {
				if (!rebuild) {
					skipped++
					continue
				}
				if (assignedPaperIds.has(prior.id)) {
					failed.push({
						course_code: label,
						reason: 'Already assigned to an examiner — cancel the assignment before changing the format',
					})
					continue
				}
				if (prior.status !== 'draft') {
					failed.push({ course_code: label, reason: `Paper is ${prior.status} and cannot be rebuilt` })
					continue
				}
				// Rebuild keeps anything already written — an accidental rebuild must
				// never erase authored questions.
				const merged = mergeAuthored(scaffoldQuestions(parts), Array.isArray(prior.questions) ? prior.questions : [])
				const { error } = await supabase
					.from('ese_question_papers')
					.update({
						template_id: template.id,
						template_version: template.version_number,
						max_marks: template.total_marks,
						duration_minutes: template.duration_minutes || course?.exam_duration || null,
						questions: merged,
					})
					.eq('id', prior.id)
				if (error) {
					failed.push({ course_code: label, reason: error.message })
					continue
				}
				rebuilt++
				continue
			}

			const { error } = await supabase.from('ese_question_papers').insert({
				institutions_id,
				institution_code: institutionCode,
				examination_session_id,
				exam_type_id: guard.examType?.id || null,
				course_offering_id: off.id,
				course_id: course?.id || off.course_id,
				course_code: off.course_code,
				program_code: off.program_code,
				semester: off.semester,
				template_id: template.id,
				template_version: template.version_number,
				set_number: setNum,
				set_label: setLabel,
				subject_title: course?.course_name || off.course_code,
				duration_minutes: template.duration_minutes || course?.exam_duration || null,
				max_marks: template.total_marks,
				status: 'draft',
				created_by: perm.userId,
				questions: scaffoldQuestions(parts),
			})
			if (error) {
				// A concurrent generate lost the race on the unique key — that is a
				// skip, not a failure.
				if (error.code === '23505') skipped++
				else failed.push({ course_code: label, reason: error.message })
				continue
			}
			created++
		}

		const bits: string[] = []
		if (created) bits.push(`${created} generated`)
		if (rebuilt) bits.push(`${rebuilt} rebuilt`)
		if (skipped) bits.push(`${skipped} already existed`)
		if (failed.length) bits.push(`${failed.length} failed`)

		return NextResponse.json(
			{
				success: created + rebuilt > 0 || failed.length === 0,
				created,
				rebuilt,
				skipped,
				failed,
				message: bits.length ? bits.join(', ') : 'Nothing to do',
			},
			{ status: created > 0 ? 201 : 200 }
		)
	} catch (error: any) {
		console.error('[ESE papers] POST failed:', error)
		return NextResponse.json({ error: error?.message || 'Failed to generate question papers' }, { status: 500 })
	}
}
