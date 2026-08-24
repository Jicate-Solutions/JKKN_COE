/**
 * Student Result View — aggregation (single source of truth).
 *
 * Builds the entire multi-semester result view for ONE learner in a handful of
 * indexed queries. Used by:
 *   - GET /api/v1/student-result-view (read path, on cache miss)
 *   - the publish-time cache refresh (lib/result-view/cache.ts)
 *
 * Keeping all aggregation/SGPA/visibility logic here means the precomputed
 * cache and the live response can never diverge.
 *
 * Visibility rule (identical to /api/v1/results): a course's marks are exposed
 * ONLY when final_marks.result_status = 'Published' AND the owning session's
 * result_declaration_date IS NOT NULL AND <= now(). Otherwise the course is
 * still listed, but every result field is null and is_published = false — so
 * undeclared marks are never leaked early.
 */

import type { getSupabaseServer } from '@/lib/supabase-server'
import { ACTIVE_REGISTRATION_STATUSES } from '@/lib/exam-registration-status'

type SupabaseServer = ReturnType<typeof getSupabaseServer>

/**
 * Bump whenever the build logic or payload shape changes. Cached rows stamped
 * with a different version are ignored (rebuilt) by the read path, so a logic
 * change auto-heals stale cache without a manual purge.
 *   1 = initial (semester-grouped)
 *   2 = exam-session-grouped, includes arrear papers, reliable join paths
 */
export const RESULT_VIEW_SCHEMA_VERSION = 2

// =====================================================
// Response types
// =====================================================

export interface ResultViewGradeBand {
	grade: string | null
	grade_point: number | null
	min_mark: number | null
	max_mark: number | null
	description: string | null
	qualify: boolean | null
	is_absent: boolean | null
	exclude_cgpa: boolean | null
	result_status: string | null
}

export interface ResultViewCourse {
	course_code: string | null
	course_name: string | null
	course_order: number | null
	credit: number | null
	internal_obtained: number | null
	internal_max: number | null
	external_obtained: number | null
	external_max: number | null
	total_obtained: number | null
	total_max: number | null
	percentage: number | null
	letter_grade: string | null
	grade_points: number | null
	total_grade_points: number | null
	is_pass: boolean | null
	pass_status: string | null
	result_status: string | null
	is_published: boolean
	/** false = arrear / re-appear paper (belongs to an earlier semester). */
	is_regular: boolean | null
	attempt_number: number | null
	/**
	 * The course's OWN semester. For an arrear this is an earlier semester than
	 * the session tab it sits in — show it on the row so a re-appear is labelled
	 * with its original semester.
	 */
	semester_code: string | null
	semester_index: number | null
	credit_included: boolean | null
	/** The session this paper was sat in (same as the parent session group). */
	examination_session_id: string | null
}

/**
 * One exam session = one tab. It contains every paper the learner sat in that
 * session — regular AND arrear. The tab is labelled by the semester of its
 * REGULAR (is_regular=true) papers; arrears keep their own semester on the row.
 */
export interface ResultViewSession {
	examination_session_id: string | null
	session_code: string | null
	session_name: string | null
	session_status: string | null
	result_declaration_date: string | null
	/** Tab label semester — taken from the session's regular papers. */
	semester_code: string | null
	semester_label: string
	semester_index: number
	courses: ResultViewCourse[]
	/** Computed over the session's REGULAR papers (the tab's own semester). */
	summary: {
		sgpa: number | null
		total_credits: number
		passed: number
		total: number
	}
}

export interface StudentResultView {
	student: {
		student_id: string | null
		register_number: string | null
		student_name: string | null
		program_code: string | null
		grade_system_code: 'UG' | 'PG'
	}
	grade_system: ResultViewGradeBand[]
	/** One entry per exam session the learner sat, ordered by semester. */
	sessions: ResultViewSession[]
}

export type BuildResult =
	| { ok: true; view: StudentResultView; studentId: string; institutionId: string; registerNumber: string | null }
	| { ok: false; reason: 'not_found' }

export interface BuildParams {
	/** Provide exactly one of studentId / registerNumber. */
	studentId?: string | null
	registerNumber?: string | null
	/** Required: the institution the request is scoped to. */
	institutionId: string
	/** Optional: filter the result view to a single session. */
	examinationSessionId?: string | null
}

// =====================================================
// Helpers
// =====================================================

/**
 * UG/PG resolution from program_code. Mirrors the SQL function
 * get_program_type_from_code() (20260117_fix_pg_program_pass_status.sql) so the
 * grade-band lookup uses the same UG/PG classification as the DB triggers.
 */
export function resolveGradeSystemCode(programCode: string | null | undefined): 'UG' | 'PG' {
	if (!programCode) return 'UG'
	const code = programCode.toUpperCase()
	if (/^(MSC|M\.SC|M SC|MBA|MCA|MA|M\.A|MCOM|M\.COM|M COM|MSW|MPHIL|PHD|PG)/.test(code)) return 'PG'
	if (/^[0-9]{2}P[A-Z]/.test(code)) return 'PG'
	if (/^P[A-Z]{2,3}$/.test(code)) return 'PG'
	return 'UG'
}

/**
 * Extract a numeric semester index from a semester_code, e.g. "UPH-2" -> 2,
 * "SEM1" -> 1. Used only as an ordering fallback when course_offerings.semester
 * is missing. Mirrors parseSemesterCode in the grading route.
 */
function parseSemesterCode(semesterCode: string | null | undefined): number {
	if (!semesterCode) return 0
	const hyphen = semesterCode.match(/-(\d+)$/)
	if (hyphen) return parseInt(hyphen[1], 10)
	const trailing = semesterCode.match(/(\d+)$/)
	if (trailing) return parseInt(trailing[1], 10)
	return 0
}

function num(v: unknown): number | null {
	if (v === null || v === undefined || v === '') return null
	const n = Number(v)
	return Number.isFinite(n) ? n : null
}

/** PostgREST embeds to-one as object and reverse to-many as array; normalize. */
function one<T>(v: T | T[] | null | undefined): T | null {
	if (Array.isArray(v)) return v.length > 0 ? v[0] : null
	return v ?? null
}

// =====================================================
// Build
// =====================================================

export async function buildStudentResultView(
	supabase: SupabaseServer,
	params: BuildParams,
): Promise<BuildResult> {
	const { studentId, registerNumber, institutionId, examinationSessionId } = params

	// ---------------------------------------------------------------
	// 1. Resolve the learner WITHIN the institution. Identity lookup is
	//    intentionally unfiltered by status so a learner with no Approved regs
	//    still resolves (and returns semesters: []). Institution scoping here is
	//    the data-leak guard: we only ever match rows for institutionId.
	// ---------------------------------------------------------------
	let identityQuery = supabase
		.from('exam_registrations')
		.select('student_id, stu_register_no, student_name, program_code')
		.eq('institutions_id', institutionId)
		.limit(1)

	if (studentId) {
		identityQuery = identityQuery.eq('student_id', studentId)
	} else if (registerNumber) {
		identityQuery = identityQuery.eq('stu_register_no', registerNumber)
	} else {
		return { ok: false, reason: 'not_found' }
	}

	const { data: identityRows, error: identityError } = await identityQuery
	if (identityError) throw identityError

	const identity = identityRows?.[0]
	if (!identity || !identity.student_id) {
		return { ok: false, reason: 'not_found' }
	}

	const resolvedStudentId: string = identity.student_id
	const programCode: string | null = identity.program_code ?? null
	const gradeSystemCode = resolveGradeSystemCode(programCode)

	// ---------------------------------------------------------------
	// 2-4. Pull the learner's Approved registrations across ALL sessions in ONE
	//      query. BOTH regular AND arrear (re-appear) papers are included —
	//      arrears are is_regular=false rows the learner must be able to view
	//      (see the galley: Sem 1/2 RA papers sit alongside the regular papers).
	//
	//      Reliable join paths (verified against the live DB):
	//        - course identity  -> final_marks.course_id -> courses
	//                              (course_offerings.course_id does NOT resolve to
	//                               course_mapping here, so that chain is unused;
	//                               exam_registrations.course_code is the fallback
	//                               for a registered-but-unmarked course).
	//        - semester (index) -> course_offerings.semester (integer 1..n).
	//        - semester_code / course_order -> course_mapping looked up by
	//          (program_code, course_code) in a follow-up batch query (below).
	// ---------------------------------------------------------------
	const regQuery = supabase
		.from('exam_registrations')
		.select(`
			id,
			examination_session_id,
			course_offering_id,
			course_code,
			stu_register_no,
			student_name,
			program_code,
			is_regular,
			attempt_number,
			course_offerings (
				semester,
				examination_session_id
			),
			final_marks (
				course_id,
				internal_marks_obtained,
				internal_marks_maximum,
				external_marks_obtained,
				external_marks_maximum,
				total_marks_obtained,
				total_marks_maximum,
				percentage,
				letter_grade,
				grade_points,
				credit,
				total_grade_points,
				is_pass,
				pass_status,
				result_status,
				courses (
					course_code,
					course_name,
					credit,
					credit_included
				)
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('student_id', resolvedStudentId)
		.in('registration_status', ACTIVE_REGISTRATION_STATUSES)

	if (examinationSessionId) {
		regQuery.eq('examination_session_id', examinationSessionId)
	}

	const { data: regs, error: regError } = await regQuery.range(0, 9999)
	if (regError) throw regError

	const registerNo: string | null = identity.stu_register_no ?? regs?.[0]?.stu_register_no ?? null
	const studentName: string | null = identity.student_name ?? regs?.[0]?.student_name ?? null

	// ---------------------------------------------------------------
	// 6. Grade-system band set scoped to the learner's institution + UG/PG.
	//    qualify/exclude_cgpa are guaranteed on grades; is_absent/result_status
	//    may not exist in every deployment (migrations are applied manually), so
	//    fall back to the minimal column set rather than 500 the whole view.
	// ---------------------------------------------------------------
	let gradeRows: any[] | null = null
	{
		const full = await supabase
			.from('grade_system')
			.select(`
				grade,
				grade_point,
				min_mark,
				max_mark,
				description,
				grades:grade_id (
					qualify,
					is_absent,
					exclude_cgpa,
					result_status
				)
			`)
			.eq('institutions_id', institutionId)
			.eq('grade_system_code', gradeSystemCode)
			.eq('is_active', true)
			.order('min_mark', { ascending: false })
			.range(0, 999)

		if (full.error) {
			// Likely an unknown embedded column (is_absent/result_status). Retry
			// with the guaranteed minimal set.
			const minimal = await supabase
				.from('grade_system')
				.select(`
					grade,
					grade_point,
					min_mark,
					max_mark,
					description,
					grades:grade_id (
						qualify,
						exclude_cgpa
					)
				`)
				.eq('institutions_id', institutionId)
				.eq('grade_system_code', gradeSystemCode)
				.eq('is_active', true)
				.order('min_mark', { ascending: false })
				.range(0, 999)
			if (minimal.error) throw minimal.error
			gradeRows = minimal.data
		} else {
			gradeRows = full.data
		}
	}

	const gradeSystem: ResultViewGradeBand[] = (gradeRows || []).map((g: any) => {
		const gr = one<any>(g.grades)
		return {
			grade: g.grade ?? null,
			grade_point: num(g.grade_point),
			min_mark: num(g.min_mark),
			max_mark: num(g.max_mark),
			description: g.description ?? null,
			qualify: gr?.qualify ?? null,
			is_absent: gr?.is_absent ?? null,
			exclude_cgpa: gr?.exclude_cgpa ?? null,
			result_status: gr?.result_status ?? null,
		}
	})

	const student: StudentResultView['student'] = {
		student_id: resolvedStudentId,
		register_number: registerNo,
		student_name: studentName,
		program_code: programCode,
		grade_system_code: gradeSystemCode,
	}

	if (!regs || regs.length === 0) {
		return {
			ok: true,
			view: { student, grade_system: gradeSystem, sessions: [] },
			studentId: resolvedStudentId,
			institutionId,
			registerNumber: registerNo,
		}
	}

	// ---------------------------------------------------------------
	// 5. Session visibility metadata (gate) + session display fields.
	// ---------------------------------------------------------------
	const sessionIds = Array.from(
		new Set((regs as any[]).map(r => r.examination_session_id).filter(Boolean)),
	)
	const sessionMeta = new Map<string, {
		session_code: string | null
		session_name: string | null
		session_status: string | null
		result_declaration_date: string | null
	}>()
	if (sessionIds.length > 0) {
		const { data: sessions, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id, session_code, session_name, session_status, result_declaration_date')
			.in('id', sessionIds)
			.range(0, 9999)
		if (sessionError) throw sessionError
		for (const s of sessions || []) {
			sessionMeta.set(s.id, {
				session_code: s.session_code ?? null,
				session_name: s.session_name ?? null,
				session_status: s.session_status ?? null,
				result_declaration_date: s.result_declaration_date ?? null,
			})
		}
	}

	const nowMs = Date.now()
	const isSessionLive = (sessionId: string | null): boolean => {
		if (!sessionId) return false
		const meta = sessionMeta.get(sessionId)
		if (!meta || !meta.result_declaration_date) return false
		return new Date(meta.result_declaration_date).getTime() <= nowMs
	}

	// Resolve each registration's course_code (final_marks.course_id -> courses,
	// falling back to the denormalized exam_registrations.course_code).
	const codeForReg = (reg: any): string | null =>
		one<any>(reg.final_marks)?.courses?.course_code ?? reg.course_code ?? null

	const allCodes = Array.from(
		new Set((regs as any[]).map(codeForReg).filter(Boolean)),
	) as string[]
	const programCodes = Array.from(
		new Set((regs as any[]).map(r => r.program_code).filter(Boolean)),
	) as string[]

	// Batch: course identity by code (covers registered-but-unmarked courses
	// whose final_marks/courses embed is absent).
	const coursesByCode = new Map<string, any>()
	if (allCodes.length > 0) {
		const { data: courseRows } = await supabase
			.from('courses')
			.select('course_code, course_name, credit, credit_included')
			.eq('institutions_id', institutionId)
			.in('course_code', allCodes)
			.range(0, 9999)
		for (const cr of courseRows || []) {
			if (!coursesByCode.has(cr.course_code)) coursesByCode.set(cr.course_code, cr)
		}
	}

	// Batch: semester_code + course_order from course_mapping, keyed by
	// (program_code, course_code) — the reliable key, since course_offerings.course_id
	// does not resolve to course_mapping in this DB.
	const mappingByKey = new Map<string, { semester_code: string | null; course_order: number | null }>()
	if (allCodes.length > 0 && programCodes.length > 0) {
		const { data: cmRows } = await supabase
			.from('course_mapping')
			.select('program_code, course_code, semester_code, course_order')
			.in('program_code', programCodes)
			.in('course_code', allCodes)
			.range(0, 9999)
		for (const m of cmRows || []) {
			const key = `${m.program_code}::${m.course_code}`
			if (!mappingByKey.has(key)) {
				mappingByKey.set(key, { semester_code: m.semester_code ?? null, course_order: num(m.course_order) })
			}
		}
	}

	// ---------------------------------------------------------------
	// 7. Group by EXAMINATION SESSION (one tab per session). Each tab holds every
	//    paper sat in that session — regular AND arrear. The tab is labelled by
	//    the semester of its REGULAR (is_regular=true) papers; arrears carry their
	//    own (earlier) semester on the course row.
	// ---------------------------------------------------------------
	interface SessionBucket {
		examination_session_id: string | null
		regularSemesterCode: string | null
		regularSemesterIndex: number
		courses: ResultViewCourse[]
	}
	const buckets = new Map<string, SessionBucket>()

	for (const reg of regs as any[]) {
		const co = one<any>(reg.course_offerings)
		const fm = one<any>(reg.final_marks)
		const fmCourse = one<any>(fm?.courses)   // final_marks.course_id -> courses (reliable)

		const courseCode: string | null = fmCourse?.course_code ?? reg.course_code ?? null
		const byCode = courseCode ? coursesByCode.get(courseCode) : null
		const courseName: string | null = fmCourse?.course_name ?? byCode?.course_name ?? courseCode
		const courseCredit: number | null = num(fmCourse?.credit) ?? num(byCode?.credit) ?? num(fm?.credit)
		const creditIncluded: boolean | null = fmCourse?.credit_included ?? byCode?.credit_included ?? null

		const mapping = (reg.program_code && courseCode)
			? mappingByKey.get(`${reg.program_code}::${courseCode}`)
			: null

		const sessionId: string | null = reg.examination_session_id ?? co?.examination_session_id ?? null
		const semesterIndex: number = num(co?.semester) ?? parseSemesterCode(mapping?.semester_code)
		const semesterCode: string | null = mapping?.semester_code
			?? (co?.semester != null ? `SEM-${co.semester}` : null)
		const isRegular: boolean = reg.is_regular === true

		const published = !!fm && fm.result_status === 'Published' && isSessionLive(sessionId)

		const courseRow: ResultViewCourse = {
			course_code: courseCode,
			course_name: courseName,
			course_order: mapping?.course_order ?? null,
			credit: courseCredit,
			internal_obtained: published ? num(fm.internal_marks_obtained) : null,
			internal_max: published ? num(fm.internal_marks_maximum) : null,
			external_obtained: published ? num(fm.external_marks_obtained) : null,
			external_max: published ? num(fm.external_marks_maximum) : null,
			total_obtained: published ? num(fm.total_marks_obtained) : null,
			total_max: published ? num(fm.total_marks_maximum) : null,
			percentage: published ? num(fm.percentage) : null,
			letter_grade: published ? (fm.letter_grade ?? null) : null,
			grade_points: published ? num(fm.grade_points) : null,
			total_grade_points: published
				? (num(fm.total_grade_points) ?? (num(fm.grade_points) !== null && courseCredit !== null
					? Number(fm.grade_points) * courseCredit
					: null))
				: null,
			is_pass: published ? (fm.is_pass ?? null) : null,
			pass_status: published ? (fm.pass_status ?? null) : null,
			result_status: published ? (fm.result_status ?? null) : null,
			is_published: published,
			is_regular: reg.is_regular ?? null,
			attempt_number: num(reg.attempt_number),
			semester_code: semesterCode,
			semester_index: semesterIndex || (semesterCode ? parseSemesterCode(semesterCode) : null),
			credit_included: creditIncluded,
			examination_session_id: sessionId,
		}

		const bucketKey = sessionId ?? '__no_session__'
		let bucket = buckets.get(bucketKey)
		if (!bucket) {
			bucket = {
				examination_session_id: sessionId,
				regularSemesterCode: null,
				regularSemesterIndex: 0,
				courses: [],
			}
			buckets.set(bucketKey, bucket)
		}
		// Tab label = the session's REGULAR papers' semester.
		if (isRegular && bucket.regularSemesterCode == null) {
			bucket.regularSemesterCode = semesterCode
			bucket.regularSemesterIndex = courseRow.semester_index ?? semesterIndex
		}
		bucket.courses.push(courseRow)
	}

	// ---------------------------------------------------------------
	// 8. Per-session summary (over the session's REGULAR papers — its own
	//    semester scorecard), then ordered output.
	// ---------------------------------------------------------------
	const sessions: ResultViewSession[] = Array.from(buckets.values()).map(bucket => {
		// Regular papers first, then arrears (grouped by their semester); each
		// set ordered by course_order — matches the galley layout.
		bucket.courses.sort((a, b) => {
			const ra = a.is_regular ? 0 : 1
			const rb = b.is_regular ? 0 : 1
			if (ra !== rb) return ra - rb
			const sa = a.semester_index ?? 0
			const sb = b.semester_index ?? 0
			if (sa !== sb) return sa - sb
			return (a.course_order ?? 0) - (b.course_order ?? 0)
		})

		// SGPA / credits / passed are computed over the REGULAR papers only —
		// arrears belong to other semesters and are shown but not summarised here.
		const regular = bucket.courses.filter(c => c.is_regular)
		let creditSum = 0
		let weightedPoints = 0
		let passed = 0
		let totalCredits = 0
		for (const c of regular) {
			if (c.is_published && c.is_pass) passed++
			if (c.credit !== null && c.credit_included !== false) totalCredits += c.credit
			if (c.is_published && c.grade_points !== null && c.credit !== null && c.credit_included !== false) {
				creditSum += c.credit
				weightedPoints += c.total_grade_points ?? c.grade_points * c.credit
			}
		}

		const meta = bucket.examination_session_id ? sessionMeta.get(bucket.examination_session_id) : undefined
		const semIndex = bucket.regularSemesterIndex
			|| (bucket.regularSemesterCode ? parseSemesterCode(bucket.regularSemesterCode) : 0)

		return {
			examination_session_id: bucket.examination_session_id,
			session_code: meta?.session_code ?? null,
			session_name: meta?.session_name ?? null,
			session_status: meta?.session_status ?? null,
			result_declaration_date: meta?.result_declaration_date ?? null,
			semester_code: bucket.regularSemesterCode,
			semester_label: semIndex ? `Semester ${semIndex}` : (bucket.regularSemesterCode ?? 'Results'),
			semester_index: semIndex,
			courses: bucket.courses,
			summary: {
				sgpa: creditSum > 0 ? Math.round((weightedPoints / creditSum) * 100) / 100 : null,
				total_credits: Math.round(totalCredits * 100) / 100,
				passed,
				total: regular.length,
			},
		}
	})

	// Order tabs by the session's regular semester (Sem 1 -> Sem N); fall back to
	// declaration date for an all-arrear session with no regular papers.
	sessions.sort((a, b) => {
		if (a.semester_index !== b.semester_index) return a.semester_index - b.semester_index
		const da = a.result_declaration_date ? new Date(a.result_declaration_date).getTime() : 0
		const db = b.result_declaration_date ? new Date(b.result_declaration_date).getTime() : 0
		return da - db
	})

	return {
		ok: true,
		view: { student, grade_system: gradeSystem, sessions },
		studentId: resolvedStudentId,
		institutionId,
		registerNumber: registerNo,
	}
}
