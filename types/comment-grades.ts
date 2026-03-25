/**
 * Comment Grade Types
 *
 * For courses with result_type = 'comment'.
 * Coordinator assigns a descriptive grade (from grades table where grade_category = 'comment')
 * directly to final_marks.letter_grade + grade_description.
 * No numeric marks are entered — all mark columns are stored as 0.
 */

// =========================================================
// Row displayed in the entry table
// =========================================================

export interface CommentGradeRow {
	student_id: string
	exam_registration_id: string
	final_marks_id: string | null   // null if no final_marks record yet
	register_number: string
	current_grade: string | null    // final_marks.letter_grade
	current_description: string | null // final_marks.grade_description
	new_grade: string               // selected from dropdown
	is_modified: boolean
	is_saving: boolean
	error: string | null
}

// =========================================================
// Grade option from grades table (grade_category = 'comment')
// =========================================================

export interface CommentGradeOption {
	id: string
	grade: string
	description: string
	qualify: boolean
	order_index: number | null
}

// =========================================================
// Filters
// =========================================================

export interface CommentGradeFilters {
	institutionId: string
	sessionId: string
	courseId: string
	searchTerm: string
}

// =========================================================
// API Payloads
// =========================================================

export interface SaveCommentGradePayload {
	institutions_id: string
	examination_session_id: string
	course_id: string
	course_offering_id: string
	program_id: string
	entries: {
		student_id: string
		exam_registration_id: string
		final_marks_id: string | null
		register_number: string
		grade: string
		description: string
	}[]
}

// =========================================================
// API Response
// =========================================================

export interface SaveCommentGradeResponse {
	successful: number
	failed: number
	errors: {
		register_number: string
		error: string
	}[]
}

// =========================================================
// Dropdown option types (reused in page)
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
