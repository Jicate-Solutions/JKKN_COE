/**
 * Comprehensive Reports Type Definitions
 *
 * Types for the unified reports module covering:
 * - Course Offering Reports
 * - Exam Registration Reports
 * - Fee Paid Lists
 * - Internal Marks Reports
 * - External Marks Reports
 * - Final Result Reports
 * - Semester Result Reports
 * - Arrear/Backlog Reports
 * - Missing Data Reports
 */

// =====================================================
// COMMON TYPES
// =====================================================

export interface ReportFilterOptions {
	institutions_id: string
	examination_session_id: string
	program_id?: string
	semester?: number
	course_id?: string
}

export interface ReportSortOptions {
	program_order: 'asc' | 'desc'
	semester_order: 'asc' | 'desc'
	course_order: 'asc' | 'desc'
	register_number: 'asc' | 'desc'
}

export interface PaginationOptions {
	page: number
	limit: number
	total: number
}

// =====================================================
// DROPDOWN OPTIONS
// =====================================================

export interface InstitutionOption {
	id: string
	institution_code: string
	name: string
	myjkkn_institution_ids?: string[]
}

export interface SessionOption {
	id: string
	session_code: string
	session_name: string
	institutions_id: string
}

export interface ProgramOption {
	id: string
	program_code: string
	program_name: string
	program_order?: number
	program_type?: 'UG' | 'PG'
}

export interface SemesterOption {
	semester_number: number
	semester_code: string
	semester_name: string
}

export interface CourseOption {
	id: string
	course_code: string
	course_title: string
	course_order?: number
	credits?: number
}

// =====================================================
// REPORT TAB CONFIGURATION
// =====================================================

export type ReportTabKey =
	| 'course-offer'
	| 'exam-registration'
	| 'fee-paid'
	| 'internal-marks'
	| 'external-marks'
	| 'final-result'
	| 'semester-result'
	| 'arrear-report'
	| 'missing-data'

export interface ReportTabConfig {
	key: ReportTabKey
	label: string
	description: string
	icon: string
	permission: string
	color: string
}

export const REPORT_TABS: ReportTabConfig[] = [
	{
		key: 'course-offer',
		label: 'Course Offering',
		description: 'Program-wise course offerings',
		icon: 'BookOpen',
		permission: 'reports:course-offer:read',
		color: 'blue'
	},
	{
		key: 'exam-registration',
		label: 'Exam Registration',
		description: 'Learner exam registrations',
		icon: 'UserPlus',
		permission: 'reports:exam-registration:read',
		color: 'green'
	},
	{
		key: 'fee-paid',
		label: 'Fee Paid List',
		description: 'Fee payment status',
		icon: 'CreditCard',
		permission: 'reports:fee-paid:read',
		color: 'emerald'
	},
	{
		key: 'internal-marks',
		label: 'Internal Marks',
		description: 'Subject-wise & program-wise internal marks',
		icon: 'FileText',
		permission: 'reports:internal-marks:read',
		color: 'purple'
	},
	{
		key: 'external-marks',
		label: 'External Marks',
		description: 'Subject-wise & program-wise external marks',
		icon: 'FileSpreadsheet',
		permission: 'reports:external-marks:read',
		color: 'orange'
	},
	{
		key: 'final-result',
		label: 'Final Result',
		description: 'Subject-wise & program-wise final results',
		icon: 'Award',
		permission: 'reports:final-result:read',
		color: 'indigo'
	},
	{
		key: 'semester-result',
		label: 'Semester Result',
		description: 'Subject-wise & program-wise semester results',
		icon: 'BarChart3',
		permission: 'reports:semester-result:read',
		color: 'pink'
	},
	{
		key: 'arrear-report',
		label: 'Arrear Report',
		description: 'Semester-wise & program-wise arrears',
		icon: 'AlertTriangle',
		permission: 'reports:arrear:read',
		color: 'red'
	},
	{
		key: 'missing-data',
		label: 'Missing Data',
		description: 'Courses with missing internal/external marks',
		icon: 'AlertCircle',
		permission: 'reports:missing-data:read',
		color: 'amber'
	}
]

// =====================================================
// COURSE OFFERING REPORT
// =====================================================

export interface CourseOfferReportRow {
	program_code: string
	program_name: string
	program_order: number
	semester: number
	semester_order: number
	course_code: string
	course_title: string
	course_order: number
	course_category: string
	credits: number
	enrolled_count: number
	faculty_name?: string
	is_active: boolean
}

export interface CourseOfferReportSummary {
	total_courses: number
	total_programs: number
	total_enrolled: number
	by_program: Record<string, number>
	by_semester: Record<number, number>
}

// =====================================================
// EXAM REGISTRATION REPORT
// =====================================================

export interface ExamRegistrationReportRow {
	register_number: string
	learner_name: string
	program_code: string
	program_name: string
	program_order: number
	semester: number
	semester_order: number
	course_code: string
	course_title: string
	course_order: number
	registration_date: string
	registration_status: string
	is_regular: boolean
	attempt_number: number
	fee_paid: boolean
}

export interface ExamRegistrationReportSummary {
	total_registrations: number
	regular_count: number
	arrear_count: number
	pending_count: number
	approved_count: number
	by_program: Record<string, number>
}

// =====================================================
// FEE PAID REPORT
// =====================================================

export interface FeePaidReportRow {
	register_number: string
	learner_name: string
	program_code: string
	program_name: string
	program_order: number
	semester: number
	semester_order: number
	course_code: string
	course_title: string
	course_order: number
	fee_amount: number
	payment_date: string | null
	payment_transaction_id: string | null
	fee_paid: boolean
}

export interface FeePaidReportSummary {
	total_learners: number
	paid_count: number
	unpaid_count: number
	total_amount_collected: number
	total_amount_pending: number
	by_program: Record<string, { paid: number; unpaid: number; amount: number }>
}

// =====================================================
// INTERNAL MARKS REPORT
// =====================================================

export interface InternalMarksReportRow {
	register_number: string
	learner_name: string
	program_code: string
	program_name: string
	program_order: number
	semester: number
	semester_order: number
	course_code: string
	course_title: string
	course_order: number
	internal_marks: number | null
	internal_max: number
	internal_percentage: number | null
	internal_pass_mark: number
	is_internal_pass: boolean | null
	// Component-wise marks
	assignment_marks?: number | null
	quiz_marks?: number | null
	mid_term_marks?: number | null
	attendance_marks?: number | null
	test_1_mark?: number | null
	test_2_mark?: number | null
	test_3_mark?: number | null
}

export interface InternalMarksReportSummary {
	total_records: number
	pass_count: number
	fail_count: number
	missing_count: number
	average_marks: number
	highest_marks: number
	lowest_marks: number
	by_program: Record<string, { pass: number; fail: number; missing: number; average: number }>
	by_course: Record<string, { pass: number; fail: number; average: number }>
}

// =====================================================
// EXTERNAL MARKS REPORT
// =====================================================

export interface ExternalMarksReportRow {
	register_number: string
	learner_name: string
	program_code: string
	program_name: string
	program_order: number
	semester: number
	semester_order: number
	course_code: string
	course_title: string
	course_order: number
	external_marks: number | null
	external_max: number
	external_percentage: number | null
	external_pass_mark: number
	is_external_pass: boolean | null
	is_absent: boolean
	attendance_status?: string
}

export interface ExternalMarksReportSummary {
	total_records: number
	pass_count: number
	fail_count: number
	absent_count: number
	missing_count: number
	average_marks: number
	highest_marks: number
	lowest_marks: number
	by_program: Record<string, { pass: number; fail: number; absent: number; missing: number; average: number }>
	by_course: Record<string, { pass: number; fail: number; absent: number; average: number }>
}

// =====================================================
// FINAL RESULT REPORT
// =====================================================

export interface FinalResultReportRow {
	register_number: string
	learner_name: string
	program_code: string
	program_name: string
	program_order: number
	semester: number
	semester_order: number
	course_code: string
	course_title: string
	course_order: number
	credits: number
	internal_marks: number
	internal_max: number
	external_marks: number
	external_max: number
	total_marks: number
	total_max: number
	percentage: number
	letter_grade: string
	grade_point: number
	credit_points: number
	is_pass: boolean
	pass_status: string
	result_status: string
}

export interface FinalResultReportSummary {
	total_records: number
	pass_count: number
	fail_count: number
	absent_count: number
	distinction_count: number
	first_class_count: number
	pass_percentage: number
	average_percentage: number
	grade_distribution: Record<string, number>
	by_program: Record<string, {
		pass: number
		fail: number
		absent: number
		distinction: number
		first_class: number
		average: number
	}>
	by_course: Record<string, {
		pass: number
		fail: number
		average: number
	}>
}

// =====================================================
// SEMESTER RESULT REPORT
// =====================================================

export interface SemesterResultReportRow {
	register_number: string
	learner_name: string
	program_code: string
	program_name: string
	program_order: number
	semester: number
	semester_order: number
	total_credits_registered: number
	total_credits_earned: number
	total_credit_points: number
	sgpa: number
	cgpa: number
	percentage: number
	result_status: string
	result_class: string
	total_backlogs: number
	is_distinction: boolean
	is_first_class: boolean
	is_promoted: boolean
	is_published: boolean
}

export interface SemesterResultReportSummary {
	total_learners: number
	pass_count: number
	fail_count: number
	pending_count: number
	published_count: number
	distinction_count: number
	first_class_count: number
	with_backlogs_count: number
	average_sgpa: number
	average_cgpa: number
	highest_sgpa: number
	lowest_sgpa: number
	by_program: Record<string, {
		pass: number
		fail: number
		distinction: number
		first_class: number
		average_sgpa: number
		average_cgpa: number
	}>
}

// =====================================================
// ARREAR/BACKLOG REPORT
// =====================================================

export interface ArrearReportRow {
	register_number: string
	learner_name: string
	program_code: string
	program_name: string
	program_order: number
	original_semester: number
	semester_order: number
	course_code: string
	course_title: string
	course_order: number
	credits: number
	original_internal_marks: number | null
	original_external_marks: number | null
	original_total_marks: number | null
	original_percentage: number | null
	original_letter_grade: string | null
	failure_reason: string
	attempt_count: number
	is_cleared: boolean
	cleared_date: string | null
	cleared_letter_grade: string | null
	is_registered_for_arrear: boolean
	arrear_exam_session?: string
	semesters_pending: number
	priority_level: string
}

export interface ArrearReportSummary {
	total_backlogs: number
	cleared_count: number
	pending_count: number
	registered_for_exam_count: number
	by_failure_reason: Record<string, number>
	by_priority: Record<string, number>
	by_program: Record<string, {
		total: number
		cleared: number
		pending: number
	}>
	by_semester: Record<number, {
		total: number
		cleared: number
		pending: number
	}>
	by_course: Record<string, number>
}

// =====================================================
// MISSING DATA REPORT
// =====================================================

export interface MissingDataReportRow {
	register_number: string
	learner_name: string
	program_code: string
	program_name: string
	program_order: number
	semester: number
	semester_order: number
	course_code: string
	course_title: string
	course_order: number
	missing_type: 'internal' | 'external' | 'both' | 'attendance'
	has_internal: boolean
	has_external: boolean
	has_attendance: boolean
	registration_status: string
}

export interface MissingDataReportSummary {
	total_missing: number
	missing_internal_only: number
	missing_external_only: number
	missing_both: number
	missing_attendance: number
	by_program: Record<string, {
		internal: number
		external: number
		both: number
		attendance: number
	}>
	by_course: Record<string, {
		internal: number
		external: number
		both: number
	}>
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

export interface ReportAPIResponse<T, S> {
	success: boolean
	data: T[]
	summary: S
	filters: ReportFilterOptions
	pagination: PaginationOptions
	generated_at: string
}

export type CourseOfferReportResponse = ReportAPIResponse<CourseOfferReportRow, CourseOfferReportSummary>
export type ExamRegistrationReportResponse = ReportAPIResponse<ExamRegistrationReportRow, ExamRegistrationReportSummary>
export type FeePaidReportResponse = ReportAPIResponse<FeePaidReportRow, FeePaidReportSummary>
export type InternalMarksReportResponse = ReportAPIResponse<InternalMarksReportRow, InternalMarksReportSummary>
export type ExternalMarksReportResponse = ReportAPIResponse<ExternalMarksReportRow, ExternalMarksReportSummary>
export type FinalResultReportResponse = ReportAPIResponse<FinalResultReportRow, FinalResultReportSummary>
export type SemesterResultReportResponse = ReportAPIResponse<SemesterResultReportRow, SemesterResultReportSummary>
export type ArrearReportResponse = ReportAPIResponse<ArrearReportRow, ArrearReportSummary>
export type MissingDataReportResponse = ReportAPIResponse<MissingDataReportRow, MissingDataReportSummary>
