import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	StudentConflict,
	UnscheduledCourse,
	QPCodeMismatch,
	IncompleteTimetable,
	DuplicateExamEntry,
	ValidationResult,
} from '@/types/validate-timetable'

// Format ISO date (YYYY-MM-DD) → DD-MM-YYYY. Returns '' if input is falsy.
function formatDmy(iso: string | null | undefined): string {
	if (!iso) return ''
	const [y, m, d] = iso.split('-')
	if (!y || !m || !d) return iso
	return `${d}-${m}-${y}`
}

// Composite exam identity: `{register_no}-{course_code}-{DD-MM-YYYY}-{session}`
// Example: `24JUGHIS036-24UHIS03-08-05-2026-AN`
function buildExamKey(registerNo: string, courseCode: string, examDate: string, session: string): string {
	return `${registerNo}-${courseCode}-${formatDmy(examDate)}-${session}`
}

// POST - Run timetable validation for an institution + exam session
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const { institutions_id, examination_session_id } = body

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json(
				{ error: 'institutions_id and examination_session_id are required' },
				{ status: 400 }
			)
		}

		// ─── Step 1: Fetch all data needed for validation ───

		// 1a. Fetch exam registrations for this session — PAGINATED.
		// PostgREST caps row output (often 1000) regardless of .range() on some Supabase setups,
		// so we page explicitly to guarantee full coverage even for 10k+ registrations.
		const PAGE_SIZE = 1000
		const registrations: {
			id: string
			student_id: string
			stu_register_no: string | null
			student_name: string | null
			course_offering_id: string
			course_code: string | null
			fee_paid: boolean | null
		}[] = []
		for (let page = 0; ; page++) {
			const from = page * PAGE_SIZE
			const to = from + PAGE_SIZE - 1
			const { data: pageRows, error: regError } = await supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, student_name, course_offering_id, course_code, fee_paid')
				.eq('examination_session_id', examination_session_id)
				.range(from, to)

			if (regError) {
				console.error('Error fetching registrations:', regError)
				return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
			}
			if (!pageRows || pageRows.length === 0) break
			registrations.push(...(pageRows as typeof registrations))
			if (pageRows.length < PAGE_SIZE) break // last page
		}

		// 1b. Fetch all timetable entries for this session — PAGINATED.
		// Do NOT filter by institutions_id here: shared courses (e.g., 24UGTA02 General Tamil,
		// 24UGEN02 General English) live under different institutions than the learner's home
		// institution. Rule 5 re-applies the institution filter for its own data-quality scope.
		const timetables: {
			id: string
			course_offering_id: string
			course_id: string
			exam_date: string | null
			session: string | null
			exam_time: string | null
			duration_minutes: number | null
			exam_type: string | null
			is_published: boolean | null
			institutions_id: string | null
		}[] = []
		for (let page = 0; ; page++) {
			const from = page * PAGE_SIZE
			const to = from + PAGE_SIZE - 1
			const { data: pageRows, error: ttError } = await supabase
				.from('exam_timetables')
				.select('id, course_offering_id, course_id, exam_date, session, exam_time, duration_minutes, exam_type, is_published, institutions_id')
				.eq('examination_session_id', examination_session_id)
				.range(from, to)

			if (ttError) {
				console.error('Error fetching timetables:', ttError)
				return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 500 })
			}
			if (!pageRows || pageRows.length === 0) break
			timetables.push(...(pageRows as typeof timetables))
			if (pageRows.length < PAGE_SIZE) break
		}

		// 1c. Build courses map using direct columns (skip fragile course_offerings hop)
		// Collect course_codes from registrations + course_ids from timetables
		const regCourseCodes = [...new Set((registrations || []).map(r => r.course_code).filter(Boolean))]
		const ttCourseIds = [...new Set((timetables || []).map(t => t.course_id).filter(Boolean))]

		const coursesMap = new Map<string, { course_code: string; course_title: string; qp_code: string }>()
		// By course_code (from registrations)
		if (regCourseCodes.length > 0) {
			const batchSize = 500
			for (let i = 0; i < regCourseCodes.length; i += batchSize) {
				const batch = regCourseCodes.slice(i, i + batchSize)
				// .range() defeats PostgREST's default max-rows cap even for .in() queries.
				// Batch is ≤500 codes, but course_code can have duplicates across regulations,
				// so a batch can legitimately return >500 rows.
				const { data: courses } = await supabase
					.from('courses')
					.select('id, course_code, course_name, qp_code')
					.in('course_code', batch)
					.range(0, 9999)
				;(courses || []).forEach((c: any) => {
					coursesMap.set(c.course_code, {
						course_code: c.course_code,
						course_title: c.course_name || '',
						qp_code: c.qp_code || '',
					})
				})
			}
		}

		// By course_id (from timetables) — maps course UUID → course info
		const coursesByIdMap = new Map<string, { course_code: string; course_title: string; qp_code: string }>()
		if (ttCourseIds.length > 0) {
			const batchSize = 500
			for (let i = 0; i < ttCourseIds.length; i += batchSize) {
				const batch = ttCourseIds.slice(i, i + batchSize)
				// id is unique so max rows == batch size, but .range() still defends against
				// any server-side cap misconfiguration.
				const { data: courses } = await supabase
					.from('courses')
					.select('id, course_code, course_name, qp_code')
					.in('id', batch)
					.range(0, 9999)
				;(courses || []).forEach((c: any) => {
					coursesByIdMap.set(c.id, {
						course_code: c.course_code || '',
						course_title: c.course_name || '',
						qp_code: c.qp_code || '',
					})
					// Also add to coursesMap by code for cross-referencing
					if (c.course_code && !coursesMap.has(c.course_code)) {
						coursesMap.set(c.course_code, {
							course_code: c.course_code,
							course_title: c.course_name || '',
							qp_code: c.qp_code || '',
						})
					}
				})
			}
		}

		// ─── Step 2: Build lookup maps ───

		// Primary bridge: course_code (same strategy hall-ticket route uses).
		// exam_timetables.course_id → courses.course_code, so we key timetables by their course's code.
		const timetableByCourseCode = new Map<string, typeof timetables[0][]>()
		for (const tt of (timetables || [])) {
			const code = coursesByIdMap.get(tt.course_id)?.course_code
			if (!code) continue
			if (!timetableByCourseCode.has(code)) timetableByCourseCode.set(code, [])
			timetableByCourseCode.get(code)!.push(tt)
		}

		// Secondary bridge (fallback only): course_offering_id. Kept for edge cases where
		// registrations lack course_code but share offering id with a timetable row.
		const timetableByOffering = new Map<string, typeof timetables[0][]>()
		for (const tt of (timetables || [])) {
			const key = tt.course_offering_id
			if (!key) continue
			if (!timetableByOffering.has(key)) timetableByOffering.set(key, [])
			timetableByOffering.get(key)!.push(tt)
		}

		// Helper: get course info for a timetable entry (via course_id directly)
		const getCourseForTT = (tt: typeof timetables[0]) => coursesByIdMap.get(tt.course_id)
		// Helper: get course info for a registration (via course_code directly)
		const getCourseForReg = (reg: typeof registrations[0]) => reg.course_code ? coursesMap.get(reg.course_code) : null
		// Helper: resolve the timetable entries for a registration. course_code first, offering_id as fallback.
		const getTimetableForReg = (reg: typeof registrations[0]) => {
			if (reg.course_code) {
				const byCode = timetableByCourseCode.get(reg.course_code)
				if (byCode && byCode.length > 0) return byCode
			}
			return timetableByOffering.get(reg.course_offering_id)
		}

		// ─── Rule 1: Student Exam Conflicts ───
		// Same register_no + exam_date + session = conflict

		const studentExams: {
			stu_register_no: string
			student_name: string
			exam_date: string
			session: string
			course_code: string
			course_title: string
			qp_code: string
			course_offering_id: string
		}[] = []

		for (const reg of (registrations || [])) {
			const course = getCourseForReg(reg)
			const ttEntries = getTimetableForReg(reg)

			if (ttEntries && ttEntries.length > 0) {
				const mainTT = ttEntries.find(t => t.exam_date) || ttEntries[0]
				if (mainTT?.exam_date && mainTT?.session) {
					// Prefer course_code from timetable's course_id when registration's course_code is missing
					const ttCourse = coursesByIdMap.get(mainTT.course_id)
					const resolvedCode = reg.course_code || ttCourse?.course_code || ''
					const resolvedTitle = course?.course_title || ttCourse?.course_title || ''
					const resolvedQp = course?.qp_code || ttCourse?.qp_code || ''
					studentExams.push({
						stu_register_no: reg.stu_register_no || '',
						student_name: reg.student_name || '',
						exam_date: mainTT.exam_date,
						session: mainTT.session,
						course_code: resolvedCode,
						course_title: resolvedTitle,
						qp_code: resolvedQp,
						course_offering_id: reg.course_offering_id,
					})
				}
			}
		}

		// Group by register_no + date + session and find duplicates
		const studentConflictMap = new Map<string, typeof studentExams>()
		for (const exam of studentExams) {
			const key = `${exam.stu_register_no}|${exam.exam_date}|${exam.session}`
			if (!studentConflictMap.has(key)) studentConflictMap.set(key, [])
			studentConflictMap.get(key)!.push(exam)
		}

		const studentConflicts: StudentConflict[] = []
		for (const [, exams] of studentConflictMap) {
			const uniqueCourseMap = new Map<string, typeof exams[0]>()
			for (const e of exams) {
				// Identity = course_code + register_no + exam_date + session (register/date/session already constant in bucket).
				// When course_code is missing, fall back to course_offering_id so distinct offerings don't collapse into one.
				const dedupKey = e.course_code || `__offering__${e.course_offering_id}`
				if (!uniqueCourseMap.has(dedupKey)) uniqueCourseMap.set(dedupKey, e)
			}
			if (uniqueCourseMap.size > 1) {
				const first = exams[0]
				studentConflicts.push({
					stu_register_no: first.stu_register_no,
					student_name: first.student_name,
					exam_date: first.exam_date,
					session: first.session,
					courses: Array.from(uniqueCourseMap.values()).map(e => ({
						course_code: e.course_code,
						course_title: e.course_title,
						qp_code: e.qp_code,
						exam_key: buildExamKey(first.stu_register_no, e.course_code, first.exam_date, first.session),
					})),
				})
			}
		}

		// ─── Rule 1b: Duplicate Exam Entries ───
		// Identity = `{register}-{code}-{DD-MM-YYYY}-{session}`.
		// Any tuple appearing more than once is a duplicate (bad data or double-registration).
		const duplicateCountMap = new Map<string, { count: number; sample: typeof studentExams[0] }>()
		for (const exam of studentExams) {
			if (!exam.stu_register_no || !exam.course_code) continue // skip rows we can't uniquely key
			const key = buildExamKey(exam.stu_register_no, exam.course_code, exam.exam_date, exam.session)
			const existing = duplicateCountMap.get(key)
			if (existing) existing.count += 1
			else duplicateCountMap.set(key, { count: 1, sample: exam })
		}

		const duplicateExamEntries: DuplicateExamEntry[] = []
		for (const [exam_key, { count, sample }] of duplicateCountMap) {
			if (count > 1) {
				duplicateExamEntries.push({
					exam_key,
					stu_register_no: sample.stu_register_no,
					student_name: sample.student_name,
					course_code: sample.course_code,
					course_title: sample.course_title,
					exam_date: sample.exam_date,
					session: sample.session,
					occurrences: count,
				})
			}
		}

		// ─── Rule 2: Courses registered but no exam scheduled ───

		const unscheduledCourses: UnscheduledCourse[] = []
		for (const reg of (registrations || [])) {
			const ttEntries = getTimetableForReg(reg)
			const hasSchedule = ttEntries && ttEntries.some(t => t.exam_date)

			if (!hasSchedule) {
				const course = getCourseForReg(reg)
				unscheduledCourses.push({
					stu_register_no: reg.stu_register_no || '',
					student_name: reg.student_name || '',
					course_code: reg.course_code || '',
					course_title: course?.course_title || '',
					qp_code: course?.qp_code || '',
					course_offering_id: reg.course_offering_id,
					exam_key: buildExamKey(reg.stu_register_no || '', reg.course_code || '', '', ''),
				})
			}
		}

		// ─── Rule 3: QP Code mismatch ───
		// Same qp_code must have same exam_date + session across all courses

		const qpScheduleMap = new Map<string, { course_code: string; course_title: string; exam_date: string; session: string }[]>()
		for (const tt of (timetables || [])) {
			if (!tt.exam_date || !tt.session) continue
			const course = getCourseForTT(tt)
			if (!course?.qp_code) continue

			if (!qpScheduleMap.has(course.qp_code)) qpScheduleMap.set(course.qp_code, [])
			qpScheduleMap.get(course.qp_code)!.push({
				course_code: course.course_code,
				course_title: course.course_title,
				exam_date: tt.exam_date,
				session: tt.session,
			})
		}

		const qpCodeMismatches: QPCodeMismatch[] = []
		for (const [qpCode, entries] of qpScheduleMap) {
			const uniqueByCode = new Map<string, typeof entries[0]>()
			for (const e of entries) {
				if (!uniqueByCode.has(e.course_code)) uniqueByCode.set(e.course_code, e)
			}
			const uniqueEntries = Array.from(uniqueByCode.values())
			const dateSessionPairs = new Set(uniqueEntries.map(e => `${e.exam_date}|${e.session}`))
			if (dateSessionPairs.size > 1) {
				qpCodeMismatches.push({
					qp_code: qpCode,
					courses: uniqueEntries,
				})
			}
		}

		// ─── Rule 5: Incomplete timetable entries ───

		const incompleteTimetables: IncompleteTimetable[] = []
		for (const tt of (timetables || [])) {
			// Rule 5 is a data-quality check on THIS institution's own timetable only.
			// Rows belonging to other institutions (visible here because Rules 1-3 need shared courses)
			// are not this institution's responsibility to fix.
			if (tt.institutions_id !== institutions_id) continue

			// Only flag truly essential fields. exam_time / duration_minutes are commonly populated
			// via a separate step (batch overrides, derived from session) and should not block a row.
			const missing: string[] = []
			if (!tt.exam_date) missing.push('exam_date')
			if (!tt.session) missing.push('session')

			if (missing.length > 0) {
				const course = getCourseForTT(tt)
				incompleteTimetables.push({
					course_code: course?.course_code || '',
					course_title: course?.course_title || '',
					course_offering_id: tt.course_offering_id,
					missing_fields: missing,
				})
			}
		}

		// ─── Build summary ───

		const uniqueStudents = new Set((registrations || []).map(r => r.stu_register_no).filter(Boolean))
		const allCourseCodes = new Set([
			...(registrations || []).map(r => r.course_code).filter(Boolean),
			...Array.from(coursesByIdMap.values()).map(c => c.course_code).filter(Boolean),
		])

		// Rule statuses
		const rules = [
			{ rule: 1, name: 'Student Exam Conflicts', type: 'error' as const, count: studentConflicts.length, status: studentConflicts.length === 0 ? 'passed' as const : 'failed' as const },
			{ rule: 2, name: 'Unscheduled Courses', type: 'warning' as const, count: unscheduledCourses.length, status: unscheduledCourses.length === 0 ? 'passed' as const : 'failed' as const },
			{ rule: 3, name: 'QP Code Mismatches', type: 'error' as const, count: qpCodeMismatches.length, status: qpCodeMismatches.length === 0 ? 'passed' as const : 'failed' as const },
			{ rule: 4, name: 'Duplicate Exam Entries', type: 'error' as const, count: duplicateExamEntries.length, status: duplicateExamEntries.length === 0 ? 'passed' as const : 'failed' as const },
			{ rule: 5, name: 'Incomplete Timetable Entries', type: 'warning' as const, count: incompleteTimetables.length, status: incompleteTimetables.length === 0 ? 'passed' as const : 'failed' as const },
		]

		const result: ValidationResult = {
			summary: {
				total_students: uniqueStudents.size,
				total_courses: allCourseCodes.size,
				total_timetable_entries: (timetables || []).length,
				errors_count: studentConflicts.length + qpCodeMismatches.length + duplicateExamEntries.length,
				warnings_count: unscheduledCourses.length + incompleteTimetables.length,
			},
			rules,
			errors: {
				student_conflicts: studentConflicts,
				qp_code_mismatches: qpCodeMismatches,
				duplicate_exam_entries: duplicateExamEntries,
			},
			warnings: {
				unscheduled_courses: unscheduledCourses,
				incomplete_timetables: incompleteTimetables,
			},
		}

		return NextResponse.json(result)
	} catch (error) {
		console.error('Validation error:', error)
		return NextResponse.json(
			{ error: 'Validation failed' },
			{ status: 500 }
		)
	}
}
