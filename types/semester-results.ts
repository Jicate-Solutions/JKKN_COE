/**
 * Semester Results and GPA/CGPA Calculation Types
 *
 * Key Concepts:
 * - GPA = Σ(Ci × Gi) / ΣCi (Grade Point Average for a semester)
 * - CGPA = Σ(GPAn × TCn) / ΣTCn (Cumulative Grade Point Average)
 * - Part I, II, III: UG program course categorization (Languages, Core, Allied, etc.)
 */

// =====================================================
// GRADE SYSTEM TYPES
// =====================================================

export interface GradeEntry {
	min: number
	max: number
	gradePoint: number
	letterGrade: string
	description: string
}

export type ProgramType = 'UG' | 'PG'

export interface PassingRequirements {
	cia: number // Continuous Internal Assessment minimum
	ce: number  // Central/External minimum
	total: number
}

// =====================================================
// COURSE RESULT TYPES
// =====================================================

export interface CourseResult {
	course_id: string
	course_code: string
	course_name: string
	course_part: string // Part I, Part II, Part III, Part IV, Part V
	course_order: number
	credits: number
	credit_included: boolean // false = show credit but exclude from GPA/total calculations
	semester: number
	semester_code: string // e.g., "UPH-1", "UPH-2"
	semester_number: number // Parsed from semester_code (1, 2, 3...)

	// Marks
	internal_marks: number
	internal_max: number
	internal_percentage: number
	external_marks: number
	external_max: number
	external_percentage: number
	total_marks: number
	total_max: number
	percentage: number

	// Course-specific pass marks (from courses table)
	// Used for pass/fail determination instead of hardcoded defaults
	internal_pass_mark?: number
	external_pass_mark?: number
	total_pass_mark?: number

	// Grade Information
	grade_point: number
	letter_grade: string
	grade_description: string
	credit_points: number // credits × grade_point

	// Status
	is_pass: boolean
	pass_status: 'Pass' | 'Fail' | 'Absent' | 'Reappear' | 'Withheld'
	fail_reason?: string
}

// =====================================================
// PART-WISE AGGREGATION TYPES
// =====================================================

export interface PartSummary {
	part_name: string // "Part I", "Part II", etc.
	courses: CourseResult[]
	total_credits: number
	total_credit_points: number
	part_gpa: number
	passed_count: number
	failed_count: number
}

export interface SemesterPartBreakdown {
	semester: number
	semester_code: string
	parts: PartSummary[]
	semester_gpa: number
	total_credits: number
	total_credit_points: number
}

// =====================================================
// STUDENT RESULT TYPES
// =====================================================

export interface StudentSemesterResult {
	student_id: string
	student_name: string
	register_no: string
	program_id: string
	program_code: string
	program_name: string
	program_type: ProgramType

	// Semester data
	semester: number
	semester_code: string
	examination_session_id: string
	session_name: string

	// Course results grouped by part
	part_breakdown: SemesterPartBreakdown
	courses: CourseResult[]

	// Semester aggregates
	semester_gpa: number
	total_credits: number
	total_credit_points: number
	passed_count: number
	failed_count: number

	// Status
	is_semester_passed: boolean
	backlogs_count: number
}

export interface StudentCGPAResult {
	student_id: string
	student_name: string
	register_no: string
	program_id: string
	program_code: string
	program_name: string
	program_type: ProgramType

	// Semester-wise breakdown
	semesters: SemesterSummary[]

	// Cumulative aggregates
	cgpa: number
	overall_credits: number
	overall_credit_points: number
	total_semesters_completed: number

	// Part-wise CGPA (optional for detailed analysis)
	part_wise_cgpa?: Record<string, number>

	// Status
	has_backlogs: boolean
	total_backlogs: number
	cleared_backlogs: number
	pending_backlogs: number
}

export interface SemesterSummary {
	semester: number
	semester_code: string
	session_id: string
	session_name: string
	gpa: number
	total_credits: number
	total_credit_points: number
	courses_count: number
	passed_count: number
	failed_count: number
	is_passed: boolean
}

// =====================================================
// PROGRAM-WISE AGGREGATION TYPES
// =====================================================

export interface ProgramSemesterResults {
	institution_id: string
	institution_code: string
	institution_name: string
	program_id: string
	program_code: string
	program_name: string
	program_type: ProgramType
	examination_session_id: string
	session_name: string
	semester: number

	// Student results
	students: StudentSemesterResult[]

	// Program summary
	summary: ProgramResultSummary
}

export interface ProgramResultSummary {
	total_students: number
	passed_students: number
	failed_students: number
	pass_percentage: number

	// GPA statistics
	average_gpa: number
	highest_gpa: number
	lowest_gpa: number
	median_gpa: number

	// Grade distribution
	grade_distribution: Record<string, number>

	// Part-wise summary
	part_summaries: Record<string, {
		average_gpa: number
		total_credits: number
		pass_rate: number
	}>
}

// =====================================================
// BACKLOG TRACKING TYPES
// =====================================================

export interface StudentBacklog {
	id: string
	student_id: string
	student_name: string
	register_no: string
	course_id: string
	course_code: string
	course_name: string
	course_part: string
	credits: number

	// Original attempt
	original_semester: number
	original_session_id: string
	original_session_name: string
	original_percentage: number
	original_grade: string

	// Failure details
	failure_reason: 'Internal' | 'External' | 'Both' | 'Overall' | 'Absent' | 'Malpractice'
	internal_marks: number
	internal_max: number
	external_marks: number
	external_max: number

	// Clearance
	is_cleared: boolean
	cleared_semester?: number
	cleared_session_id?: string
	cleared_session_name?: string
	cleared_percentage?: number
	cleared_grade?: string
	cleared_date?: string

	// Attempts
	attempt_count: number
	max_attempts_allowed: number
	semesters_pending: number

	// Priority
	priority_level: 'Critical' | 'High' | 'Normal' | 'Low'

	// Arrear exam registration
	is_registered_for_arrear: boolean
	arrear_exam_session_id?: string
}

export interface BacklogSummary {
	student_id: string
	student_name: string
	register_no: string
	total_backlogs: number
	pending_backlogs: number
	cleared_backlogs: number
	critical_backlogs: number
	backlogs_by_semester: Record<number, number>
	backlogs_by_part: Record<string, number>
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

export interface SemesterResultsRequest {
	action: 'semesters' | 'student-results' | 'student-cgpa' | 'program-results' | 'program-cgpa' | 'backlogs'
	institutionId?: string
	programId?: string
	sessionId?: string
	studentId?: string
	semester?: number
	programType?: ProgramType
	includePartBreakdown?: boolean
}

export interface SemesterResultsResponse {
	success: boolean
	data?: any
	error?: string
}

export interface ProgramCGPARequest {
	institutionId: string
	programId: string
	batchCode?: string
	upToSemester?: number
	includeBacklogs?: boolean
}

export interface ProgramCGPAResponse {
	success: boolean
	students: StudentCGPAResult[]
	summary: {
		total_students: number
		average_cgpa: number
		highest_cgpa: number
		lowest_cgpa: number
		cgpa_distribution: Record<string, number>
		students_with_backlogs: number
	}
	error?: string
}

// =====================================================
// UI STATE TYPES
// =====================================================

export interface GpaCalculatorState {
	// Selection
	selectedInstitution: string
	selectedSession: string
	selectedProgram: string
	selectedSemester: string
	selectedStudent: string
	programType: ProgramType

	// View mode
	viewMode: 'semester' | 'cgpa' | 'backlogs' | 'program-summary'
	groupByPart: boolean

	// Data
	results: StudentSemesterResult[]
	cgpaResults: StudentCGPAResult[]
	backlogs: StudentBacklog[]

	// Loading states
	loading: boolean
	calculating: boolean

	// Filters
	searchTerm: string
	filterByPart: string
	filterByStatus: 'all' | 'passed' | 'failed' | 'backlogs'
}

export interface DropdownOptions {
	institutions: { id: string; code: string; name: string }[]
	sessions: { id: string; code: string; name: string }[]
	programs: { id: string; code: string; name: string; type: ProgramType }[]
	semesters: number[]
	students: { id: string; register_no: string; name: string }[]
}

// =====================================================
// EXPORT TYPES
// =====================================================

export interface ExportOptions {
	format: 'excel' | 'pdf' | 'csv'
	includePartBreakdown: boolean
	includeSummary: boolean
	includeBacklogs: boolean
}

export interface SemesterResultExportData {
	institution: string
	program: string
	session: string
	semester: number
	generated_at: string
	students: Array<{
		register_no: string
		student_name: string
		courses: Array<{
			code: string
			name: string
			part: string
			credits: number
			internal: string
			external: string
			total: string
			percentage: string
			grade: string
			grade_point: number
			credit_points: number
			status: string
		}>
		semester_gpa: number
		total_credits: number
		total_credit_points: number
		result: string
	}>
	summary: ProgramResultSummary
}

// =====================================================
// UTILITY TYPES
// =====================================================

/**
 * Parse semester code to extract semester number
 * e.g., "UPH-1" -> 1, "UPH-2" -> 2
 */
export type SemesterCodeParser = (code: string) => number

/**
 * UG Parts categorization
 */
export const UG_PARTS = [
	'Part I',   // Language I (Tamil/Hindi/French etc.)
	'Part II',  // Language II (English)
	'Part III', // Core/Major subjects
	'Part IV',  // Allied/Skill Enhancement/Foundation/Value Education
	'Part V'    // Extension Activities/Projects
] as const

export type UGPart = typeof UG_PARTS[number]

/**
 * PG Parts categorization
 */
export const PG_PARTS = [
	'Part A',   // Core, Elective, Extra Disciplinary, Project
	'Part B'    // Soft Skills, Internship
] as const

export type PGPart = typeof PG_PARTS[number]
