import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExamApplicationCourse } from '@/types/exam-applications'
import { collectInvolvedCourseCodes, mergeExamApplicationCourses } from './merge'

export interface BuildCourseListParams {
	institutions_id: string
	examination_session_id: string
	student_id?: string | null
	register_number?: string | null
	program_code?: string | null
	semester?: number | null
}

const MAX_ROWS = 9999

/** Build a PostgREST `or` filter that matches the learner by id and/or register number */
function studentClause(
	studentId: string | null | undefined,
	registerNo: string | null | undefined,
	idColumn: string,
	regColumn: string
) {
	const clauses: string[] = []
	if (studentId) clauses.push(`${idColumn}.eq.${studentId}`)
	if (registerNo) clauses.push(`${regColumn}.eq."${registerNo.replace(/"/g, '')}"`)
	return clauses.join(',')
}

/**
 * Builds the merged, de-duplicated and eligibility-validated course list that backs
 * the Exam Application module. This is the single source of truth used by both the
 * GET courses endpoint and the POST submit endpoint (final server-side validation),
 * so the UI can never submit something the server would not accept.
 *
 * The bulk equivalent lives in lib/exam-applications/bulk-course-list.ts; both share
 * the merge + eligibility rules in lib/exam-applications/merge.ts.
 */
export async function buildExamApplicationCourses(
	supabase: SupabaseClient,
	params: BuildCourseListParams
): Promise<ExamApplicationCourse[]> {
	const {
		institutions_id,
		examination_session_id,
		student_id,
		register_number,
		program_code,
		semester,
	} = params

	// -------------------------------------------------------------
	// 1. Course offerings available in the selected examination session
	// -------------------------------------------------------------
	let offeringQuery = supabase
		.from('course_offerings')
		.select('id, course_id, course_code, program_code, program_id, semester, is_active, max_enrollment, enrolled_count')
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.range(0, MAX_ROWS)

	if (program_code) {
		offeringQuery = offeringQuery.eq('program_code', program_code)
	}

	const { data: offeringRows, error: offeringError } = await offeringQuery
	if (offeringError) {
		console.error('[exam-applications] course_offerings error:', offeringError)
		throw new Error('Failed to fetch course offerings')
	}

	const offerings = offeringRows || []

	// -------------------------------------------------------------
	// 2. Existing exam registrations for this learner + session
	// -------------------------------------------------------------
	const regClause = studentClause(student_id, register_number, 'student_id', 'stu_register_no')
	let registrations: any[] = []
	if (regClause) {
		const { data: registrationRows, error: registrationError } = await supabase
			.from('exam_registrations')
			.select('id, course_offering_id, course_code, registration_status, program_code, attempt_number, is_regular')
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.or(regClause)
			.range(0, MAX_ROWS)

		if (registrationError) {
			console.error('[exam-applications] exam_registrations error:', registrationError)
			throw new Error('Failed to fetch exam registrations')
		}
		registrations = registrationRows || []
	}

	// -------------------------------------------------------------
	// 3. Pending backlogs (uncleared arrears) for this learner
	// -------------------------------------------------------------
	let backlogs: any[] = []
	if (regClause) {
		const backlogClause = studentClause(student_id, register_number, 'student_id', 'register_number')
		const { data: backlogRows, error: backlogError } = await supabase
			.from('student_backlogs_detailed_view')
			.select('id, student_id, register_number, program_code, course_id, course_code, course_name, course_credits, original_semester, attempt_count, max_attempts_allowed, failure_reason, priority_level, is_cleared, is_active')
			.eq('institutions_id', institutions_id)
			.eq('is_cleared', false)
			.eq('is_active', true)
			.or(backlogClause)
			.range(0, MAX_ROWS)

		if (backlogError) {
			// A missing/renamed view must not break the whole page - degrade gracefully.
			console.error('[exam-applications] student_backlogs_detailed_view error:', backlogError)
		} else {
			backlogs = backlogRows || []
		}
	}

	// -------------------------------------------------------------
	// 4. Courses the learner has already passed (never shown as backlog)
	// -------------------------------------------------------------
	const passedCourseCodes = new Set<string>()
	if (student_id) {
		const { data: passedRows, error: passedError } = await supabase
			.from('final_marks')
			.select('course_id')
			.eq('institutions_id', institutions_id)
			.eq('student_id', student_id)
			.eq('is_pass', true)
			.range(0, MAX_ROWS)

		if (passedError) {
			console.error('[exam-applications] final_marks error:', passedError)
		} else if (passedRows && passedRows.length > 0) {
			const passedCourseIds = [...new Set(passedRows.map((r: any) => r.course_id).filter(Boolean))]
			for (let i = 0; i < passedCourseIds.length; i += 500) {
				const batch = passedCourseIds.slice(i, i + 500)
				const { data: courseRows } = await supabase
					.from('courses')
					.select('id, course_code')
					.in('id', batch)
				for (const c of courseRows || []) {
					if (c.course_code) passedCourseCodes.add(String(c.course_code).trim().toUpperCase())
				}
			}
		}
	}

	// -------------------------------------------------------------
	// 5. Enrich with course master data (name, type, credit)
	// -------------------------------------------------------------
	const codes = collectInvolvedCourseCodes({ offerings, registrations, backlogs })
	const courseDetails = new Map<string, any>()
	for (let i = 0; i < codes.length; i += 500) {
		const batch = codes.slice(i, i + 500)
		const { data: courseRows } = await supabase
			.from('courses')
			.select('course_code, course_name, course_type, credit, course_category, exam_duration')
			.in('course_code', batch)
		for (const c of courseRows || []) {
			if (c.course_code) courseDetails.set(String(c.course_code).trim().toUpperCase(), c)
		}
	}

	// -------------------------------------------------------------
	// 6. Merge the three sources and resolve eligibility
	// -------------------------------------------------------------
	return mergeExamApplicationCourses({
		offerings,
		registrations,
		backlogs,
		passedCourseCodes,
		courseDetails,
		program_code,
		semester,
	})
}
