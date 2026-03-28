import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	StudentConflict,
	UnscheduledCourse,
	QPCodeMismatch,
	IncompleteTimetable,
	ValidationResult,
} from '@/types/validate-timetable'

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

		// 1a. Fetch exam registrations for this session (course_code is directly on the table)
		const { data: registrations, error: regError } = await supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, student_name, course_offering_id, course_code, fee_paid')
			.eq('examination_session_id', examination_session_id)
			.range(0, 49999)

		if (regError) {
			console.error('Error fetching registrations:', regError)
			return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
		}

		// 1b. Fetch all timetable entries for this session + institution (course_id links directly to courses)
		const { data: timetables, error: ttError } = await supabase
			.from('exam_timetables')
			.select('id, course_offering_id, course_id, exam_date, session, exam_time, duration_minutes, exam_type, is_published')
			.eq('examination_session_id', examination_session_id)
			.eq('institutions_id', institutions_id)
			.range(0, 49999)

		if (ttError) {
			console.error('Error fetching timetables:', ttError)
			return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 500 })
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
				const { data: courses } = await supabase
					.from('courses')
					.select('id, course_code, course_name, qp_code')
					.in('course_code', batch)
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
				const { data: courses } = await supabase
					.from('courses')
					.select('id, course_code, course_name, qp_code')
					.in('id', batch)
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

		// Timetable by course_offering_id (one offering can have multiple slots for practical)
		const timetableByOffering = new Map<string, typeof timetables[0][]>()
		for (const tt of (timetables || [])) {
			const key = tt.course_offering_id
			if (!timetableByOffering.has(key)) timetableByOffering.set(key, [])
			timetableByOffering.get(key)!.push(tt)
		}

		// Helper: get course info for a timetable entry (via course_id directly)
		const getCourseForTT = (tt: typeof timetables[0]) => coursesByIdMap.get(tt.course_id)
		// Helper: get course info for a registration (via course_code directly)
		const getCourseForReg = (reg: typeof registrations[0]) => reg.course_code ? coursesMap.get(reg.course_code) : null

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
		}[] = []

		for (const reg of (registrations || [])) {
			const course = getCourseForReg(reg)
			const ttEntries = timetableByOffering.get(reg.course_offering_id)

			if (ttEntries && ttEntries.length > 0) {
				const mainTT = ttEntries.find(t => t.exam_date) || ttEntries[0]
				if (mainTT?.exam_date && mainTT?.session) {
					studentExams.push({
						stu_register_no: reg.stu_register_no || '',
						student_name: reg.student_name || '',
						exam_date: mainTT.exam_date,
						session: mainTT.session,
						course_code: reg.course_code || '',
						course_title: course?.course_title || '',
						qp_code: course?.qp_code || '',
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
				if (!uniqueCourseMap.has(e.course_code)) uniqueCourseMap.set(e.course_code, e)
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
					})),
				})
			}
		}

		// ─── Rule 2: Courses registered but no exam scheduled ───

		const unscheduledCourses: UnscheduledCourse[] = []
		for (const reg of (registrations || [])) {
			const ttEntries = timetableByOffering.get(reg.course_offering_id)
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
				})
			}
		}

		// ─── Rule 3: QP Code mismatch ───
		// Same qp_code must have same exam_date + session across all courses

		const qpScheduleMap = new Map<string, { course_code: string; course_title: string; exam_date: string; session: string }[]>()
		for (const tt of (timetables || [])) {
			if (!tt.exam_date) continue
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
			const missing: string[] = []
			if (!tt.exam_date) missing.push('exam_date')
			if (!tt.session) missing.push('session')
			if (!tt.exam_time) missing.push('exam_time')
			if (!tt.duration_minutes) missing.push('duration_minutes')

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
			{ rule: 5, name: 'Incomplete Timetable Entries', type: 'warning' as const, count: incompleteTimetables.length, status: incompleteTimetables.length === 0 ? 'passed' as const : 'failed' as const },
		]

		const result: ValidationResult = {
			summary: {
				total_students: uniqueStudents.size,
				total_courses: allCourseCodes.size,
				total_timetable_entries: (timetables || []).length,
				errors_count: studentConflicts.length + qpCodeMismatches.length,
				warnings_count: unscheduledCourses.length + incompleteTimetables.length,
			},
			rules,
			errors: {
				student_conflicts: studentConflicts,
				qp_code_mismatches: qpCodeMismatches,
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
