// External Marks Types
// Following 5-layer architecture: Types -> Services -> Hooks -> Components -> Pages

export interface ExternalMark {
	id: string
	institutions_id: string
	examination_session_id: string
	exam_registration_id: string
	student_dummy_number_id: string | null // Nullable for Register Number mode uploads
	program_id: string | null
	course_id: string
	dummy_number: string // Display number (dummy or register number)
	register_number?: string // Register number if available
	student_name: string
	course_code: string
	course_name: string
	course_order?: number // Course order from course_mapping for sorting
	program_name: string
	session_name: string
	institution_code: string
	institution_name: string
	total_marks_obtained: number
	marks_out_of: number
	percentage: number
	entry_status: string
	attendance_status: string
	is_absent: boolean
	remarks: string | null
	source: string
	created_at: string
}

// Lookup mode for bulk upload - either by dummy number or student register number
export type LookupMode = 'dummy_number' | 'register_number'

export interface ImportPreviewRow {
	row: number
	institution_code: string // Required for multi-institution support
	// Either dummy_number or register_number will be used based on lookup_mode
	dummy_number: string
	register_number: string
	subject_code: string // Maps to course_code internally
	course_code: string
	session_code: string
	program_code: string
	total_marks_obtained: number
	marks_out_of: number
	remarks: string
	errors: string[]
	isValid: boolean
	lookup_mode: LookupMode
}

export interface Institution {
	id: string
	name: string
	institution_code: string
	myjkkn_institution_ids?: string[]
}

export interface ExamSession {
	id: string
	session_name: string
	session_code: string
}

export interface Program {
	id: string
	program_code: string
	program_name: string
	program_order?: number
}

export interface Course {
	id: string
	course_code: string
	course_name: string
	external_max_mark: number
}

export interface UploadSummary {
	total: number
	success: number
	failed: number
	skipped: number
}

export interface UploadError {
	row: number
	dummy_number: string
	course_code: string
	errors: string[]
}

export interface ExternalMarksFilters {
	institutionId: string
	sessionId: string
	programId: string
	courseId: string
	statusFilter: string
	searchTerm: string
}

export interface BulkUploadPayload {
	action: 'bulk-upload'
	lookup_mode: LookupMode // 'dummy_number' or 'register_number'
	marks_data: {
		institution_code: string // Required for multi-institution support
		dummy_number: string
		register_number: string
		subject_code: string // Maps to course_code
		course_code: string
		session_code: string
		program_code: string
		total_marks_obtained: number
		marks_out_of: number
		remarks: string
	}[]
	file_name: string
	file_type: string
	uploaded_by: string | undefined
}

export interface BulkUploadResponse {
	total: number
	successful: number
	failed: number
	skipped: number
	batch_number: string
	errors?: UploadError[]
	validation_errors?: UploadError[]
}

export interface BulkDeletePayload {
	action: 'bulk-delete'
	ids: string[]
}

export interface BulkDeleteResponse {
	deleted: number
	skipped: number
	non_deletable?: {
		dummy_number: string
		reason: string
	}[]
	error?: string
}
