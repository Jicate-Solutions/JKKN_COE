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

		// 1a. Fetch exam registrations for this session
		const { data: registrations, error: regError } = await supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, student_name, course_offering_id, exam_type, fee_paid')
			.eq('examination_session_id', examination_session_id)
			.range(0, 49999)

		if (regError) {
			console.error('Error fetching registrations:', regError)
			return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
		}

		// 1b. Fetch all timetable entries for this session + institution
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

		// 1c. Fetch course_offerings to get course_code mapping
		const offeringIds = [
			...new Set([
				...(registrations || []).map(r => r.course_offering_id),
				...(timetables || []).map(t => t.course_offering_id),
			].filter(Boolean))
		]

		const offeringsMap = new Map<string, { course_code: string }>()
		if (offeringIds.length > 0) {
			const batchSize = 500
			for (let i = 0; i < offeringIds.length; i += batchSize) {
				const batch = offeringIds.slice(i, i + batchSize)
				const { data: offerings } = await supabase
					.from('course_offerings')
					.select('id, course_code')
					.in('id', batch)
				;(offerings || []).forEach((o: any) => {
					offeringsMap.set(o.id, { course_code: o.course_code })
				})
			}
		}

		// 1d. Fetch courses table for qp_code and course_title
		const courseCodes = [...new Set(
			Array.from(offeringsMap.values()).map(o => o.course_code).filter(Boolean)
		)]

		const coursesMap = new Map<string, { course_title: string; qp_code: string }>()
		if (courseCodes.length > 0) {
			const batchSize = 500
			for (let i = 0; i < courseCodes.length; i += batchSize) {
				const batch = courseCodes.slice(i, i + batchSize)
				const { data: courses } = await supabase
					.from('courses')
					.select('course_code, course_name, qp_code')
					.in('course_code', batch)
				;(courses || []).forEach((c: any) => {
					coursesMap.set(c.course_code, {
						course_title: c.course_name || '',
						qp_code: c.qp_code || '',
					})
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

		// ─── Rule 1: Student Exam Conflicts ───
		// Same register_no + exam_date + session = conflict

		// Build: for each registration, find the timetable date+session
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
			const offering = offeringsMap.get(reg.course_offering_id)
			if (!offering) continue
			const course = coursesMap.get(offering.course_code)
			const ttEntries = timetableByOffering.get(reg.course_offering_id)

			if (ttEntries && ttEntries.length > 0) {
				// For theory: usually 1 entry. For practical: multiple slots.
				// Use first entry with a valid date for conflict check
				const mainTT = ttEntries.find(t => t.exam_date) || ttEntries[0]
				if (mainTT?.exam_date && mainTT?.session) {
					studentExams.push({
						stu_register_no: reg.stu_register_no || '',
						student_name: reg.student_name || '',
						exam_date: mainTT.exam_date,
						session: mainTT.session,
						course_code: offering.course_code,
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
			// Deduplicate by course_code (same student + same course = not a conflict)
			const uniqueCourses = new Map<string, typeof exams[0]>()
			for (const e of exams) {
				if (!uniqueCourses.has(e.course_code)) uniqueCourses.set(e.course_code, e)
			}
			if (uniqueCourses.size > 1) {
				const first = exams[0]
				studentConflicts.push({
					stu_register_no: first.stu_register_no,
					student_name: first.student_name,
					exam_date: first.exam_date,
					session: first.session,
					courses: Array.from(uniqueCourses.values()).map(e => ({
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
				const offering = offeringsMap.get(reg.course_offering_id)
				const course = offering ? coursesMap.get(offering.course_code) : null
				unscheduledCourses.push({
					stu_register_no: reg.stu_register_no || '',
					student_name: reg.student_name || '',
					course_code: offering?.course_code || '',
					course_title: course?.course_title || '',
					qp_code: course?.qp_code || '',
					course_offering_id: reg.course_offering_id,
				})
			}
		}

		// Deduplicate unscheduled: group by course_code (show once per course, not per student)
		const unscheduledByCode = new Map<string, UnscheduledCourse[]>()
		for (const u of unscheduledCourses) {
			if (!unscheduledByCode.has(u.course_code)) unscheduledByCode.set(u.course_code, [])
			unscheduledByCode.get(u.course_code)!.push(u)
		}

		// Keep all individual entries but limit per course to avoid massive lists
		const unscheduledFinal = unscheduledCourses

		// ─── Rule 3: QP Code mismatch ───
		// Same qp_code must have same exam_date + session across all courses

		const qpScheduleMap = new Map<string, { course_code: string; course_title: string; exam_date: string; session: string }[]>()
		for (const tt of (timetables || [])) {
			if (!tt.exam_date || !tt.course_offering_id) continue
			const offering = offeringsMap.get(tt.course_offering_id)
			if (!offering) continue
			const course = coursesMap.get(offering.course_code)
			if (!course?.qp_code) continue

			if (!qpScheduleMap.has(course.qp_code)) qpScheduleMap.set(course.qp_code, [])
			qpScheduleMap.get(course.qp_code)!.push({
				course_code: offering.course_code,
				course_title: course.course_title,
				exam_date: tt.exam_date,
				session: tt.session,
			})
		}

		const qpCodeMismatches: QPCodeMismatch[] = []
		for (const [qpCode, entries] of qpScheduleMap) {
			// Deduplicate entries by course_code
			const uniqueByCode = new Map<string, typeof entries[0]>()
			for (const e of entries) {
				if (!uniqueByCode.has(e.course_code)) uniqueByCode.set(e.course_code, e)
			}
			const uniqueEntries = Array.from(uniqueByCode.values())

			// Check if all entries have the same date+session
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
				const offering = offeringsMap.get(tt.course_offering_id)
				const course = offering ? coursesMap.get(offering.course_code) : null
				incompleteTimetables.push({
					course_code: offering?.course_code || '',
					course_title: course?.course_title || '',
					course_offering_id: tt.course_offering_id,
					missing_fields: missing,
				})
			}
		}

		// ─── Build summary ───

		const uniqueStudents = new Set((registrations || []).map(r => r.stu_register_no).filter(Boolean))
		const uniqueCourses = new Set(
			Array.from(offeringsMap.values()).map(o => o.course_code).filter(Boolean)
		)

		const result: ValidationResult = {
			summary: {
				total_students: uniqueStudents.size,
				total_courses: uniqueCourses.size,
				total_timetable_entries: (timetables || []).length,
				errors_count: studentConflicts.length + qpCodeMismatches.length,
				warnings_count: unscheduledFinal.length + incompleteTimetables.length,
			},
			errors: {
				student_conflicts: studentConflicts,
				qp_code_mismatches: qpCodeMismatches,
			},
			warnings: {
				unscheduled_courses: unscheduledFinal,
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
