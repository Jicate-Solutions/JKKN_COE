// Exam Registration Report type definitions

export type ReportType =
	| 'student-fee-details'
	| 'student-exam-registration'
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

// ── Report 2B: Course Count (Year-wise) ──

export interface CourseCountYearWiseRow {
	sno: number
	board_code: string
	course_code: string
	year_counts: Record<string, number> // e.g. { "I Year": 10, "II Year": 3 }
}

// ── Report 2C: Course Count with Program Code (Year-wise) ──

export interface CourseCountProgramYearWiseRow {
	sno: number
	board_code: string
	program_code: string
	course_code: string
	year_counts: Record<string, number>
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
	course_count_year_wise?: CourseCountYearWiseRow[]
	course_count_program_year_wise?: CourseCountProgramYearWiseRow[]
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
	course_offering: {
		course_code: string
		course_name: string | null
		program_code: string | null
		semester: number
		board_code: string | null
	} | null
}
