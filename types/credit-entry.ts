/**
 * Credit Entry Types
 *
 * For courses with result_type = 'credit'.
 * Coordinator assigns credit to learners — no grade, no marks.
 * Writes only to final_marks.credit column.
 * All numeric mark columns stored as 0.
 */

// =========================================================
// Row displayed in the entry table
// =========================================================

export interface CreditEntryRow {
	student_id: string
	exam_registration_id: string
	final_marks_id: string | null   // null if no final_marks record yet
	register_number: string
	credit_value: number | null     // current assigned credit
	already_assigned: boolean       // true if final_marks record exists with credit
	is_saving: boolean
	error: string | null
}

// =========================================================
// Filters
// =========================================================

export interface CreditEntryFilters {
	institutionId: string
	sessionId: string
	courseId: string
	searchTerm: string
}

// =========================================================
// API Payloads
// =========================================================

export interface SaveCreditPayload {
	institutions_id: string
	examination_session_id: string
	course_id: string
	course_offering_id: string
	program_id: string
	credit_value: number
	entries: {
		student_id: string
		exam_registration_id: string
		final_marks_id: string | null
		register_number: string
	}[]
}

// =========================================================
// API Response
// =========================================================

export interface SaveCreditResponse {
	successful: number
	failed: number
	errors: {
		register_number: string
		error: string
	}[]
}

// =========================================================
// Dropdown option types
// =========================================================

export interface SessionOption {
	id: string
	session_name: string
	session_code: string
}

export interface CourseOfferingOption {
	id: string
	course_id: string
	courses: {
		id: string
		course_code: string
		course_name: string
		result_type: string
		evaluation_type: string
	}
}
