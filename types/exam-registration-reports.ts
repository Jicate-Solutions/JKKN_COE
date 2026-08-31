// Exam Registration Report type definitions

export type ReportType =
	| 'student-fee-details'
	| 'student-exam-registration'
	| 'student-exam-registration-summary'
	| 'student-wise-application'
	| 'student-wise-registration'
	| 'course-count-regular-arrear'
	| 'course-count-year-wise'
	| 'course-count-program-year-wise'
	| 'course-count-program-year-section'
	| 'exam-date-wise-registration'
	| 'exam-date-wise-attendance'
	| 'board-wise-exam-timetable'
	| 'exam-date-wise-summary'
	| 'qp-packing-list'

// ── Report 2A: Course Count (Regular / Arrear) ──

export interface CourseCountRegularArrearRow {
	sno: number
	board_code: string
	course_code: string
	regular_count: number
	arrear_count: number
}

// ── Report 2B: Course Count (Semester-wise) ──
// Counts are keyed by the LEARNER's own semester, never the semester of the paper:
// a Semester 3 learner's Semester 1 arrear counts in the Semester 3 column.

export interface CourseCountSemesterWiseRow {
	sno: number
	board_code: string
	course_code: string
	semester_counts: Record<number, number> // e.g. { 1: 10, 3: 3 }
}

// ── Report 2C: Course Count with Program Code (Semester-wise) ──

export interface CourseCountProgramSemesterWiseRow {
	sno: number
	board_code: string
	program_code: string
	course_code: string
	semester_counts: Record<number, number>
}

// ── API Response ──

export interface ExamRegistrationReportData {
	report_type: ReportType
	institution_name: string
	institution_code: string
	session_name: string
	session_code: string
	generated_at: string
	course_count_regular_arrear?: CourseCountRegularArrearRow[]
	course_count_semester_wise?: CourseCountSemesterWiseRow[]
	course_count_program_semester_wise?: CourseCountProgramSemesterWiseRow[]
}

// ── Filter Options ──

export interface ReportFilters {
	institutions_id: string
	examination_session_id: string
	report_type: ReportType
}

// ── Raw registration row from API (before aggregation) ──

export interface RawRegistrationRow {
	id: string
	stu_register_no: string
	student_name: string
	is_regular: boolean
	attempt_number: number
	fee_paid: boolean
	fee_amount: number | null
	program_code: string | null
	/**
	 * The semester the LEARNER is in, stamped by the API over the whole session before
	 * any filter. This is what every report buckets by — 0 when it could not be
	 * resolved. `course_offering.semester` below is the semester of the PAPER, which
	 * for an arrear belongs to a semester the learner has already left.
	 */
	learner_semester: number
	course_offering: {
		course_code: string
		course_name: string | null
		program_code: string | null
		semester: number
		board_code: string | null
	} | null
}
