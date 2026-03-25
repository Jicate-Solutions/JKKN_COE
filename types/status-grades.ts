/**
 * Status Grades Type Definitions
 *
 * Types for the Status Grade Entry module that handles
 * status-based papers (CIA-only and External-only courses
 * with result_type = 'Status').
 *
 * Valid grades: 'Commended', 'Highly Commended', 'AAA' (Absent)
 *
 * Following 5-layer architecture: Types -> Services -> Hooks -> Components -> Pages
 */

// =========================================================
// Constants
// =========================================================

export const VALID_STATUS_GRADES = ['Commended', 'Highly Commended', 'AAA'] as const
export type StatusGradeValue = typeof VALID_STATUS_GRADES[number]

export const STATUS_TYPE_OPTIONS = ['internal', 'external'] as const
export type StatusType = typeof STATUS_TYPE_OPTIONS[number]

// =========================================================
// Form / Entry Types
// =========================================================

/** Data structure for a single status grade entry (form submission) */
export interface StatusGradeEntry {
	student_id: string
	exam_registration_id: string
	course_id: string
	examination_session_id: string
	institutions_id: string
	status_type: StatusType
	grade: StatusGradeValue | ''
}

// =========================================================
// Display / Row Types
// =========================================================

/** Row data for displaying in the status grade table */
export interface StatusGradeRow {
	id: string // internal_marks.id or marks_entry.id
	student_id: string
	exam_registration_id: string
	register_no: string
	student_name: string
	course_id: string
	course_code: string
	course_name: string
	current_grade: StatusGradeValue | null
	new_grade: StatusGradeValue | ''
	is_modified: boolean
	is_saving: boolean
	error: string | null
	// Source table reference
	source_table: 'internal_marks' | 'marks_entry'
	source_record_id: string | null // Existing record ID, null if new
}

// =========================================================
// Excel Import Types
// =========================================================

/** Data structure for a single row from Excel import */
export interface StatusGradeUploadRow {
	row_number: number
	register_no: string
	student_name: string
	current_grade: string
	new_grade: string
	errors: string[]
	is_valid: boolean
}

/** Payload for bulk import API call */
export interface StatusGradeImportPayload {
	institutions_id: string
	examination_session_id: string
	course_id: string
	status_type: StatusType
	grades: {
		register_no: string
		grade: string
	}[]
}

/** Response from bulk import API */
export interface StatusGradeImportResponse {
	total: number
	successful: number
	failed: number
	skipped: number
	errors: {
		row: number
		register_no: string
		error: string
	}[]
}

// =========================================================
// Filter Types
// =========================================================

/** Filters for the status grade entry page */
export interface StatusGradeFilters {
	institutionId: string
	sessionId: string
	programId: string
	courseId: string
	statusType: StatusType
	searchTerm: string
}

// =========================================================
// Dropdown Option Types
// =========================================================

export interface InstitutionOption {
	id: string
	name: string
	institution_code: string
}

export interface SessionOption {
	id: string
	session_name: string
	session_code: string
}

export interface ProgramOption {
	id: string
	program_code: string
	program_name: string
}

export interface CourseOption {
	id: string
	course_code: string
	course_title: string
	evaluation_type: string
	result_type: string
}

// =========================================================
// API Response Types
// =========================================================

/** Response from GET /api/marks/status-grades */
export interface StatusGradesResponse {
	students: StatusGradeRow[]
	course_info: {
		course_code: string
		course_title: string
		evaluation_type: string
		result_type: string
	}
	total: number
}

/** Response from PUT /api/marks/status-grades (bulk update) */
export interface StatusGradeBulkUpdateResponse {
	total: number
	successful: number
	failed: number
	errors: {
		student_id: string
		register_no: string
		error: string
	}[]
}
