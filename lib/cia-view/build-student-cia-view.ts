/**
 * Student CIA View — aggregation (single source of truth).
 *
 * Builds a learner's ENTIRE internal-assessment (CIA) view in a handful of
 * indexed queries: every exam session they sat, that session's CIA round +
 * component configuration, and the learner's component marks per course per
 * round. Used by:
 *   - GET /api/v1/student-cia-view (read path, on cache miss)
 *   - the cache back-fill (lib/cia-view/cache.ts)
 *
 * Mirrors lib/result-view/build-student-result-view.ts: one tab per exam
 * session (regular + arrear papers grouped by the session sat in), labelled by
 * the session's regular papers' semester.
 *
 * Per-learner ONLY — the cia_marks query is filtered to the resolved learner,
 * so another student's marks can never appear in the payload.
 *
 * Unlike results there is NO publish/visibility gate: internal marks are an
 * in-progress working surface, so a session's rounds + components are always
 * returned with whatever the learner has scored so far (null where not entered).
 */

import type { getSupabaseServer } from '@/lib/supabase-server'
import { resolveGradeSystemCode } from '@/lib/result-view/build-student-result-view'

type SupabaseServer = ReturnType<typeof getSupabaseServer>

/**
 * Bump whenever the build logic or payload shape changes. Cached rows stamped
 * with a different version are ignored (rebuilt) by the read path, so a logic
 * change auto-heals stale cache without a manual purge.
 */
export const CIA_VIEW_SCHEMA_VERSION = 1

/**
 * Standard 13 component codes -> their dedicated cia_marks column. Anything
 * outside this set is an end-user-defined component read from the extra_marks
 * JSONB by code (see 20260501_add_extra_marks_to_cia_marks.sql). Mirrors
 * STANDARD_COMPONENT_CODES in the CIA marks-entry page and the markFields map
 * in /api/v1/cia-marks/report.
 */
const COMPONENT_COLUMN: Record<string, string> = {
	assignment: 'assignment_marks',
	quiz: 'quiz_marks',
	mid_term: 'mid_term_marks',
	presentation: 'presentation_marks',
	attendance: 'attendance_marks',
	lab: 'lab_marks',
	project: 'project_marks',
	seminar: 'seminar_marks',
	viva: 'viva_marks',
	other: 'other_marks',
	test_1: 'test_1_mark',
	test_2: 'test_2_mark',
	test_3: 'test_3_mark',
}

// The cia_marks columns we read (besides keys/status) — the 13 standard
// component columns, the stored round total, and the extra_marks JSONB.
const CIA_MARKS_COLUMNS = [
	'course_offering_id',
	'examination_session_id',
	'cia_round',
	'marks_status',
	'total_internal_marks',
	...Object.values(COMPONENT_COLUMN),
	'extra_marks',
].join(', ')

// =====================================================
// Response types
// =====================================================

export interface CiaViewComponent {
	code: string
	name: string
	max_marks: number | null
}

export interface CiaViewSettingRound {
	round: number
	round_name: string
	components: CiaViewComponent[]
}

export interface CiaViewSetting {
	setting_id: string
	setting_name: string | null
	rounds: CiaViewSettingRound[]
}

export interface CiaViewCourseRound {
	round: number
	round_name: string
	/** Component code -> mark. null when the round has no entry for that component. */
	marks: Record<string, number | null>
	/** Sum of the entered component marks for the round (null when no entries). */
	total: number | null
	/** Sum of the round's component max_marks. */
	max_total: number | null
	marks_status: string | null
	has_entries: boolean
}

export interface CiaViewCourse {
	course_code: string | null
	course_name: string | null
	course_order: number | null
	internal_max_mark: number | null
	/** false = arrear / re-appear paper (belongs to an earlier semester). */
	is_regular: boolean | null
	semester_code: string | null
	semester_index: number | null
	rounds: CiaViewCourseRound[]
}

export interface CiaViewSession {
	examination_session_id: string | null
	session_code: string | null
	session_name: string | null
	session_status: string | null
	/** Tab label semester — taken from the session's regular papers. */
	semester_code: string | null
	semester_label: string
	semester_index: number
	/** The session's CIA round/component configuration (one entry per setting). */
	settings: CiaViewSetting[]
	courses: CiaViewCourse[]
}

export interface StudentCiaView {
	student: {
		student_id: string | null
		register_number: string | null
		student_name: string | null
		program_code: string | null
		grade_system_code: 'UG' | 'PG'
	}
	sessions: CiaViewSession[]
}

export type BuildCiaResult =
	| { ok: true; view: StudentCiaView; studentId: string; institutionId: string; registerNumber: string | null }
	| { ok: false; reason: 'not_found' }

export interface BuildCiaParams {
	/** Provide exactly one of studentId / registerNumber. */
	studentId?: string | null
	registerNumber?: string | null
	/** Required: the institution the request is scoped to. */
	institutionId: string
	/** Optional: filter the view to a single session. */
	examinationSessionId?: string | null
}

// =====================================================
// Helpers
// =====================================================

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

/** Extract a numeric semester index from a semester_code, e.g. "UPH-2" -> 2. */
function parseSemesterCode(semesterCode: string | null | undefined): number {
	if (!semesterCode) return 0
	const hyphen = semesterCode.match(/-(\d+)$/)
	if (hyphen) return parseInt(hyphen[1], 10)
	const trailing = semesterCode.match(/(\d+)$/)
	if (trailing) return parseInt(trailing[1], 10)
	return 0
}

/** A round's component list (from a setting's cia_rounds JSONB), normalized. */
interface RawRound {
	round: number | null
	round_name: string | null
	components: Array<{ code: string | null; name: string | null; max_marks: unknown }> | null
}

/** Read a single component's mark from a cia_marks row (column or extra_marks). */
function componentMark(row: any, code: string): number | null {
	const col = COMPONENT_COLUMN[code]
	if (col) return num(row[col])
	const extra = row.extra_marks
	if (extra && typeof extra === 'object') return num((extra as Record<string, unknown>)[code])
	return null
}

// =====================================================
// Build
// =====================================================

export async function buildStudentCiaView(
	supabase: SupabaseServer,
	params: BuildCiaParams,
): Promise<BuildCiaResult> {
	const { studentId, registerNumber, institutionId, examinationSessionId } = params

	// ---------------------------------------------------------------
	// 1. Resolve the learner WITHIN the institution. Identity lookup is
	//    intentionally unfiltered by status so a learner with no Approved regs
	//    still resolves (and returns sessions: []). Institution scoping here is
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
	// 2-3. Pull the learner's Approved registrations across ALL sessions in ONE
	//      query — BOTH regular AND arrear (re-appear) papers.
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
			course_offerings (
				semester,
				examination_session_id
			)
		`)
		.eq('institutions_id', institutionId)
		.eq('student_id', resolvedStudentId)
		.eq('registration_status', 'Approved')

	if (examinationSessionId) {
		regQuery.eq('examination_session_id', examinationSessionId)
	}

	const { data: regs, error: regError } = await regQuery.range(0, 9999)
	if (regError) throw regError

	const registerNo: string | null = identity.stu_register_no ?? regs?.[0]?.stu_register_no ?? null
	const studentName: string | null = identity.student_name ?? regs?.[0]?.student_name ?? null

	const student: StudentCiaView['student'] = {
		student_id: resolvedStudentId,
		register_number: registerNo,
		student_name: studentName,
		program_code: programCode,
		grade_system_code: gradeSystemCode,
	}

	if (!regs || regs.length === 0) {
		return {
			ok: true,
			view: { student, sessions: [] },
			studentId: resolvedStudentId,
			institutionId,
			registerNumber: registerNo,
		}
	}

	const sessionIds = Array.from(
		new Set((regs as any[]).map(r => r.examination_session_id).filter(Boolean)),
	) as string[]
	const courseOfferingIds = Array.from(
		new Set((regs as any[]).map(r => r.course_offering_id).filter(Boolean)),
	) as string[]
	const allCodes = Array.from(
		new Set((regs as any[]).map(r => r.course_code).filter(Boolean)),
	) as string[]
	const programCodes = Array.from(
		new Set((regs as any[]).map(r => r.program_code).filter(Boolean)),
	) as string[]

	// ---------------------------------------------------------------
	// 4-7. Fan out the remaining lookups concurrently — none depend on each
	//      other. All are scoped to this learner / this learner's sessions.
	// ---------------------------------------------------------------
	const [
		sessionsRes,
		settingsRes,
		marksRes,
		coursesRes,
		mappingRes,
	] = await Promise.all([
		// Session display metadata.
		sessionIds.length > 0
			? supabase
				.from('examination_sessions')
				.select('id, session_code, session_name, session_status')
				.in('id', sessionIds)
				.range(0, 9999)
			: Promise.resolve({ data: [], error: null } as any),
		// CIA round/component config for these sessions.
		sessionIds.length > 0
			? supabase
				.from('cia_entry_settings')
				.select('id, examination_session_id, setting_name, program_codes, course_type, cia_rounds')
				.eq('institutions_id', institutionId)
				.in('examination_session_id', sessionIds)
				.eq('is_active', true)
				.range(0, 9999)
			: Promise.resolve({ data: [], error: null } as any),
		// THIS learner's CIA marks across all their course offerings + sessions.
		courseOfferingIds.length > 0
			? supabase
				.from('cia_marks')
				.select(CIA_MARKS_COLUMNS)
				.eq('student_id', resolvedStudentId)
				.in('course_offering_id', courseOfferingIds)
				.in('examination_session_id', sessionIds)
				.eq('is_active', true)
				.range(0, 9999)
			: Promise.resolve({ data: [], error: null } as any),
		// Course identity + internal max + type (for setting/course matching).
		allCodes.length > 0
			? supabase
				.from('courses')
				.select('course_code, course_name, internal_max_mark, course_type, course_type_code')
				.eq('institutions_id', institutionId)
				.in('course_code', allCodes)
				.range(0, 9999)
			: Promise.resolve({ data: [], error: null } as any),
		// semester_code + course_order, keyed by (program_code, course_code).
		allCodes.length > 0 && programCodes.length > 0
			? supabase
				.from('course_mapping')
				.select('program_code, course_code, semester_code, course_order')
				.in('program_code', programCodes)
				.in('course_code', allCodes)
				.range(0, 9999)
			: Promise.resolve({ data: [], error: null } as any),
	])

	if (sessionsRes.error) throw sessionsRes.error
	if (settingsRes.error) throw settingsRes.error
	if (marksRes.error) throw marksRes.error

	// Session metadata.
	const sessionMeta = new Map<string, {
		session_code: string | null
		session_name: string | null
		session_status: string | null
	}>()
	for (const s of (sessionsRes.data || [])) {
		sessionMeta.set(s.id, {
			session_code: s.session_code ?? null,
			session_name: s.session_name ?? null,
			session_status: s.session_status ?? null,
		})
	}

	// Settings grouped by session.
	const settingsBySession = new Map<string, any[]>()
	for (const s of (settingsRes.data || [])) {
		const list = settingsBySession.get(s.examination_session_id) || []
		list.push(s)
		settingsBySession.set(s.examination_session_id, list)
	}

	// Marks indexed by (course_offering_id | session_id | round) — the per-learner
	// store index requested by the spec.
	const marksIndex = new Map<string, any>()
	for (const m of (marksRes.data || []) as any[]) {
		marksIndex.set(`${m.course_offering_id}|${m.examination_session_id}|${m.cia_round}`, m)
	}

	// Course identity by code.
	const coursesByCode = new Map<string, any>()
	for (const c of (coursesRes.data || [])) {
		if (!coursesByCode.has(c.course_code)) coursesByCode.set(c.course_code, c)
	}

	// course_mapping by (program_code, course_code).
	const mappingByKey = new Map<string, { semester_code: string | null; course_order: number | null }>()
	for (const m of (mappingRes.data || [])) {
		const key = `${m.program_code}::${m.course_code}`
		if (!mappingByKey.has(key)) {
			mappingByKey.set(key, { semester_code: m.semester_code ?? null, course_order: num(m.course_order) })
		}
	}

	// ---------------------------------------------------------------
	// Match the applicable CIA setting(s) for a course within its session.
	// Primary key is program overlap. If a program-matched setting explicitly
	// targets this course's type, prefer those (theory vs lab); otherwise keep
	// all program matches so a course is never left without its rounds.
	// ---------------------------------------------------------------
	const settingTargetsType = (setting: any, course: any): boolean => {
		const ct = setting.course_type
		if (!Array.isArray(ct) || ct.length === 0) return false
		const vals = [course?.course_type, course?.course_type_code].filter(Boolean)
		return vals.some(v => ct.includes(v))
	}

	const applicableSettings = (sessionId: string | null, regProgram: string | null, course: any): any[] => {
		if (!sessionId) return []
		const all = settingsBySession.get(sessionId) || []
		const programMatches = all.filter(s =>
			Array.isArray(s.program_codes) && regProgram && s.program_codes.includes(regProgram),
		)
		const typeMatches = programMatches.filter(s => settingTargetsType(s, course))
		return typeMatches.length > 0 ? typeMatches : programMatches
	}

	// ---------------------------------------------------------------
	// Group by EXAMINATION SESSION (one tab per session). Each tab holds every
	// paper sat in that session — regular AND arrear.
	// ---------------------------------------------------------------
	interface SessionBucket {
		examination_session_id: string | null
		regularSemesterCode: string | null
		regularSemesterIndex: number
		courses: CiaViewCourse[]
	}
	const buckets = new Map<string, SessionBucket>()

	for (const reg of regs as any[]) {
		const co = one<any>(reg.course_offerings)
		const courseCode: string | null = reg.course_code ?? null
		const byCode = courseCode ? coursesByCode.get(courseCode) : null
		const mapping = (reg.program_code && courseCode)
			? mappingByKey.get(`${reg.program_code}::${courseCode}`)
			: null

		const sessionId: string | null = reg.examination_session_id ?? co?.examination_session_id ?? null
		const semesterCode: string | null = mapping?.semester_code
			?? (co?.semester != null ? `SEM-${co.semester}` : null)
		const semesterIndex: number = num(co?.semester) ?? parseSemesterCode(semesterCode)
		const isRegular: boolean = reg.is_regular === true

		// Merge the rounds of every applicable setting (by round number; union
		// components by code) so the course carries the right round config.
		const applicable = applicableSettings(sessionId, reg.program_code, byCode)
		const roundMap = new Map<number, { round: number; round_name: string; components: Map<string, CiaViewComponent> }>()
		for (const s of applicable) {
			for (const r of ((s.cia_rounds || []) as RawRound[])) {
				if (r.round == null) continue
				let entry = roundMap.get(r.round)
				if (!entry) {
					entry = { round: r.round, round_name: r.round_name ?? `CIA-${r.round}`, components: new Map() }
					roundMap.set(r.round, entry)
				}
				for (const c of (r.components || [])) {
					if (c.code && !entry.components.has(c.code)) {
						entry.components.set(c.code, { code: c.code, name: c.name ?? c.code, max_marks: num(c.max_marks) })
					}
				}
			}
		}

		const rounds: CiaViewCourseRound[] = Array.from(roundMap.values())
			.sort((a, b) => a.round - b.round)
			.map(r => {
				const components = Array.from(r.components.values())
				const row = (sessionId && reg.course_offering_id)
					? marksIndex.get(`${reg.course_offering_id}|${sessionId}|${r.round}`)
					: undefined

				const marks: Record<string, number | null> = {}
				let total = 0
				let anyEntered = false
				let maxTotal = 0
				for (const c of components) {
					if (c.max_marks != null) maxTotal += c.max_marks
					const val = row ? componentMark(row, c.code) : null
					marks[c.code] = val
					if (val != null) { total += val; anyEntered = true }
				}

				return {
					round: r.round,
					round_name: r.round_name,
					marks,
					// Prefer the stored round total (trigger-computed) when present.
					total: row ? (num(row.total_internal_marks) ?? (anyEntered ? total : null)) : null,
					max_total: components.length > 0 ? maxTotal : null,
					marks_status: row?.marks_status ?? null,
					has_entries: !!row,
				}
			})

		const courseRow: CiaViewCourse = {
			course_code: courseCode,
			course_name: byCode?.course_name ?? courseCode,
			course_order: mapping?.course_order ?? null,
			internal_max_mark: num(byCode?.internal_max_mark),
			is_regular: reg.is_regular ?? null,
			semester_code: semesterCode,
			semester_index: semesterIndex || (semesterCode ? parseSemesterCode(semesterCode) : null),
			rounds,
		}

		const bucketKey = sessionId ?? '__no_session__'
		let bucket = buckets.get(bucketKey)
		if (!bucket) {
			bucket = { examination_session_id: sessionId, regularSemesterCode: null, regularSemesterIndex: 0, courses: [] }
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
	// Build the session's settings config + ordered output.
	// ---------------------------------------------------------------
	const buildSettingsForSession = (sessionId: string | null): CiaViewSetting[] => {
		if (!sessionId) return []
		const list = settingsBySession.get(sessionId) || []
		return list.map(s => ({
			setting_id: s.id,
			setting_name: s.setting_name ?? null,
			rounds: ((s.cia_rounds || []) as RawRound[])
				.filter(r => r.round != null)
				.map(r => ({
					round: r.round as number,
					round_name: r.round_name ?? `CIA-${r.round}`,
					components: (r.components || [])
						.filter(c => c.code)
						.map(c => ({ code: c.code as string, name: c.name ?? (c.code as string), max_marks: num(c.max_marks) })),
				})),
		}))
	}

	const sessions: CiaViewSession[] = Array.from(buckets.values()).map(bucket => {
		// Regular papers first, then arrears (by their own semester); each set
		// ordered by course_order — matches the galley layout.
		bucket.courses.sort((a, b) => {
			const ra = a.is_regular ? 0 : 1
			const rb = b.is_regular ? 0 : 1
			if (ra !== rb) return ra - rb
			const sa = a.semester_index ?? 0
			const sb = b.semester_index ?? 0
			if (sa !== sb) return sa - sb
			return (a.course_order ?? 0) - (b.course_order ?? 0)
		})

		const meta = bucket.examination_session_id ? sessionMeta.get(bucket.examination_session_id) : undefined
		const semIndex = bucket.regularSemesterIndex
			|| (bucket.regularSemesterCode ? parseSemesterCode(bucket.regularSemesterCode) : 0)

		return {
			examination_session_id: bucket.examination_session_id,
			session_code: meta?.session_code ?? null,
			session_name: meta?.session_name ?? null,
			session_status: meta?.session_status ?? null,
			semester_code: bucket.regularSemesterCode,
			semester_label: semIndex ? `Semester ${semIndex}` : (bucket.regularSemesterCode ?? 'CIA'),
			semester_index: semIndex,
			settings: buildSettingsForSession(bucket.examination_session_id),
			courses: bucket.courses,
		}
	})

	// Order tabs by the session's regular semester (Sem 1 -> Sem N); fall back to
	// session_code for an all-arrear session with no regular papers.
	sessions.sort((a, b) => {
		if (a.semester_index !== b.semester_index) return a.semester_index - b.semester_index
		return (a.session_code ?? '').localeCompare(b.session_code ?? '')
	})

	return {
		ok: true,
		view: { student, sessions },
		studentId: resolvedStudentId,
		institutionId,
		registerNumber: registerNo,
	}
}
