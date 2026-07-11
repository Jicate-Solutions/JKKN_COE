/**
 * Final Marks Type Definitions
 *
 * This module contains all TypeScript interfaces for the final marks/grade calculation module.
 * Following 5-layer architecture: Types -> Services -> Hooks -> Components -> Pages
 * Matches the final_marks table schema from migration 20251113
 */

/**
 * FinalMark - Main entity representing a student's final calculated grade for a course
 * Matches the final_marks table schema
 */
export interface FinalMark {
	id: string
	// Core References
	institutions_id: string
	examination_session_id: string
	exam_registration_id: string
	course_offering_id: string
	program_id: string
	course_id: string
	student_id: string
	// Marks References
	internal_marks_id?: string | null
	marks_entry_id?: string | null
	// Internal Assessment Marks
	internal_marks_obtained: number
	internal_marks_maximum: number
	internal_percentage?: number // Auto-calculated
	// External Assessment Marks
	external_marks_obtained: number
	external_marks_maximum: number
	external_percentage?: number // Auto-calculated
	// Total Marks
	total_marks_obtained: number
	total_marks_maximum: number
	percentage: number
	// Grace Marks
	grace_marks: number
	grace_marks_reason?: string | null
	grace_marks_approved_by?: string | null
	grace_marks_approved_date?: string | null
	// Grade Calculation (auto-populated by triggers)
	letter_grade?: string | null
	grade_points?: number | null
	grade_description?: string | null
	// Credit and Grade Points (for NAAD/ABC export)
	credit?: number | null
	total_grade_points?: number | null
	// Pass/Fail Status (auto-determined by triggers)
	is_pass: boolean
	is_distinction: boolean
	is_first_class: boolean
	pass_status?: 'Pass' | 'Fail' | 'Reappear' | 'Absent' | 'Withheld' | 'Expelled' | null
	// Moderation
	is_moderated: boolean
	moderated_by?: string | null
	moderation_date?: string | null
	marks_before_moderation?: number | null
	moderation_remarks?: string | null
	// Result Status
	result_status: 'Pending' | 'Published' | 'Withheld' | 'Cancelled' | 'Under Review'
	published_date?: string | null
	published_by?: string | null
	// Lock Mechanism
	is_locked: boolean
	locked_by?: string | null
	locked_date?: string | null
	// Calculation Metadata
	calculated_by?: string | null
	calculated_at?: string | null
	calculation_notes?: string | null
	// Additional
	remarks?: string | null
	is_active: boolean
	// Audit Fields
	created_at: string
	updated_at?: string | null
	created_by?: string | null
	updated_by?: string | null
}

/**
 * FinalMarkWithRelations - Final mark with joined relation data for display
 */
export interface FinalMarkWithRelations extends FinalMark {
	// Institution
	institution_code?: string
	institution_name?: string
	// Session
	session_code?: string
	session_name?: string
	// Program
	program_code?: string
	program_name?: string
	// Course
	course_code?: string
	course_name?: string
	course_credit?: number
	// Student
	student_name?: string
	stu_register_no?: string
	// Calculated by user
	calculated_by_name?: string
}

/**
 * InternalMarkData - Internal marks fetched from internal_marks table
 */
export interface InternalMarkData {
	id: string
	student_id: string
	course_id: string
	program_id?: string
	examination_session_id?: string
	course_offering_id?: string
	exam_registration_id?: string
	assignment_marks?: number | null
	quiz_marks?: number | null
	mid_term_marks?: number | null
	presentation_marks?: number | null
	attendance_marks?: number | null
	lab_marks?: number | null
	project_marks?: number | null
	seminar_marks?: number | null
	viva_marks?: number | null
	other_marks?: number | null
	test_1_mark?: number | null
	test_2_mark?: number | null
	test_3_mark?: number | null
	total_internal_marks: number
	max_internal_marks: number
	internal_percentage?: number
	// Joined data
	student_name?: string
	register_no?: string
}

/**
 * ExternalMarkData - External marks fetched from marks_entry table
 */
export interface ExternalMarkData {
	id: string
	exam_registration_id: string
	course_id?: string
	program_id?: string
	examination_session_id?: string
	total_marks_obtained: number
	marks_out_of: number
	percentage?: number
	is_absent?: boolean
	attendance_status?: string
	grade?: string | null // NEW: Status grade for status-based papers (Commended, Highly Commended, AAA)
	// Joined data
	student_id?: string
	student_name?: string
	register_no?: string
	dummy_number?: string
}

/**
 * GradeEntry - Grade table entry for lookup from grades table
 */
export interface GradeEntry {
	id: string
	institutions_id: string
	institutions_code: string
	regulation_id: string
	regulation_code?: string
	grade: string
	grade_point: number
	min_mark: number
	max_mark: number
	description: string
	qualify: boolean
	is_absent: boolean
	exclude_cgpa: boolean
	result_status?: string | null
	order_index?: number | null
}

/**
 * CourseData - Course information with marks configuration
 */
export interface CourseData {
	id: string
	course_code: string
	course_title: string
	course_name?: string
	course_type: string
	credits: number
	result_type?: 'Mark' | 'Status' // NEW: Determines if course uses marks or status grading
	internal_max_mark: number
	internal_pass_mark: number
	internal_converted_mark: number
	external_max_mark: number
	external_pass_mark: number
	external_converted_mark: number
	total_pass_mark: number
	total_max_mark: number
}

/**
 * ProgramData - Program information
 */
export interface ProgramData {
	id: string
	program_code: string
	program_name: string
	regulation_id?: string
	regulation_code?: string
	degree_id?: string
	institutions_id: string
	program_order?: number
	grade_system_code?: 'UG' | 'PG'
}

/**
 * ExamSessionData - Examination session information
 */
export interface ExamSessionData {
	id: string
	session_code: string
	session_name: string
	institutions_id: string
}

/**
 * CourseOfferingData - Course offering information
 */
export interface CourseOfferingData {
	id: string
	course_id: string
	program_id: string
	semester: number
	section?: string
	course_code?: string
	course_name?: string
	course_type?: string
	credits?: number
	is_saved?: boolean // True if final marks already saved for this course
	result_status?: string | null // Current result status: Pending, Published, etc.
	can_regenerate?: boolean // True if results can be regenerated (no results or status is Pending)
}

/**
 * StudentResultRow - Combined student result for display in the results table
 */
export interface StudentResultRow {
	student_id: string
	student_name: string
	register_no: string
	exam_registration_id: string
	course_offering_id: string
	course_id: string
	course_code: string
	course_name: string
	// Internal Marks
	internal_marks: number
	internal_max: number
	internal_pass_mark: number
	// External Marks
	external_marks: number
	external_max: number
	external_pass_mark: number
	// Total Marks
	total_marks: number
	total_max: number
	total_pass_mark: number
	percentage: number
	// Grade info (from grade system)
	grade: string
	grade_point: number
	grade_description?: string
	// Credits (maps to final_marks.credit and final_marks.total_grade_points)
	credits: number
	credit_points: number // = credits * grade_point (0 if fail/absent)
	// Status
	pass_status: 'Pass' | 'Fail' | 'Reappear' | 'Absent' | 'Withheld' | 'Expelled'
	is_pass: boolean
	is_absent: boolean
	fail_reason?: 'INTERNAL' | 'EXTERNAL' | 'TOTAL' | null
	remarks?: string
	// Source references
	internal_marks_id?: string | null
	marks_entry_id?: string | null
}

/**
 * GenerateFinalMarksPayload - API request payload for generating final marks
 */
export interface GenerateFinalMarksPayload {
	institutions_id: string
	program_id: string
	program_code?: string // Optional: If provided, use directly instead of DB lookup
	examination_session_id: string
	course_ids: string[]
	regulation_id: string
	grade_system_code: 'UG' | 'PG'
	calculated_by?: string
	save_to_db?: boolean // If true, save to final_marks table
}

/**
 * GenerateFinalMarksResponse - API response after generating final marks
 */
export interface GenerateFinalMarksResponse {
	success: boolean
	total_students: number
	total_courses: number
	results: StudentResultRow[]
	summary: {
		passed: number
		failed: number
		absent: number
		reappear: number
		withheld: number
		distinction: number
		first_class: number
		skipped_no_attendance?: number
		skipped_missing_marks?: number
	}
	saved_count?: number
	errors?: Array<{
		student_id: string
		student_name: string
		register_no: string
		course_code: string
		error: string
	}>
	skipped_records?: Array<{
		student_name: string
		register_no: string
		course_code: string
		reason: string
	}>
}

/**
 * FinalMarksFilters - Filters for fetching final marks
 */
export interface FinalMarksFilters {
	institutionId: string
	sessionId: string
	programId?: string
	courseId?: string
	resultStatus?: string
	passStatus?: string
	searchTerm?: string
}

/**
 * StepperState - State management for the stepper UI
 */
export interface StepperState {
	currentStep: number
	institutionId: string
	programId: string
	sessionId: string
	regulationId: string
	gradeSystemCode: 'UG' | 'PG' | ''
	selectedCourseIds: string[]
	isGenerating: boolean
	generatedResults: StudentResultRow[]
	isSaved: boolean
	saveError?: string | null
}

/**
 * ExportOptions - Options for exporting results
 */
export interface ExportOptions {
	format: 'pdf' | 'excel' | 'csv'
	includeHeader: boolean
	includeSignature: boolean
	title?: string
	fileName?: string
}

/**
 * UploadSummary - Summary of generation operation
 */
export interface UploadSummary {
	total: number
	success: number
	failed: number
	skipped: number
}

/**
 * ValidationError - Error structure for validation failures
 */
export interface ValidationError {
	row: number
	student_id: string
	student_name: string
	course_code: string
	errors: string[]
}

/**
 * InstitutionOption - Institution dropdown option
 */
export interface InstitutionOption {
	id: string
	institution_code: string
	name: string
	myjkkn_institution_ids?: string[] | null
}

/**
 * RegulationOption - Regulation dropdown option
 */
export interface RegulationOption {
	id: string
	regulation_code: string
	regulation_year: number
}

/**
 * RevaluationLearnerRow - Learner row for revaluation mark entry
 * (Generate After Revaluation tab). Joins final_marks + marks_entry.
 */
export interface RevaluationLearnerRow {
	final_marks_id: string
	marks_entry_id: string
	exam_registration_id: string
	student_id: string
	register_no: string
	student_name: string
	// Marks context
	internal_marks: number
	original_external_marks: number // marks_entry.total_marks_obtained (old mark, never changed)
	external_max: number
	// Current final_marks state
	current_external_marks: number
	current_total_marks: number
	current_percentage: number
	current_grade: string | null
	current_pass_status: string | null
	result_status: string
	// Revaluation state
	revaluation_mark: number | null
	revaluation_remarks: string | null
	is_revaluation_applied: boolean
}

/**
 * RevaluationResultRow - Old vs new comparison after recalculation
 */
export interface RevaluationResultRow {
	final_marks_id: string
	marks_entry_id: string
	exam_registration_id: string
	student_id: string
	register_no: string
	student_name: string
	course_code: string
	internal_marks: number
	internal_max: number
	external_max: number
	total_max: number
	// Old (current final_marks values)
	old_external: number
	old_total: number
	old_percentage: number
	old_grade: string | null
	old_grade_point: number | null
	old_pass_status: string | null
	// New (recalculated with revaluation mark)
	new_external: number
	new_total: number
	new_percentage: number
	new_grade: string
	new_grade_point: number
	new_pass_status: 'Pass' | 'Reappear'
	new_is_pass: boolean
	fail_reason?: 'INTERNAL' | 'EXTERNAL' | 'TOTAL' | null
	marks_difference: number
	is_revaluation_applied: boolean
}

/**
 * GenerateRevaluationPayload - POST payload for the revaluation generate API
 */
export interface GenerateRevaluationPayload {
	action: 'generate'
	institutions_id: string
	examination_session_id: string
	program_code: string
	course_id: string
	regulation_id?: string
	grade_system_code?: 'UG' | 'PG'
	save_to_db?: boolean
	selected_final_marks_ids?: string[]
	applied_by?: string | null
}
