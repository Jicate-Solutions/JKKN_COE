// =====================================================
// REVALUATION PROCESS MODULE - TYPESCRIPT TYPES
// Created: 2026-01-23
// Purpose: Type definitions for revaluation management system
// =====================================================

// =====================================================
// Core Revaluation Types
// =====================================================

export type PaymentStatus = 'Pending' | 'Verified' | 'Rejected'

export type RevaluationStatus =
	| 'Applied'
	| 'Payment Pending'
	| 'Payment Verified'
	| 'Approved'
	| 'Rejected'
	| 'Assigned'
	| 'In Progress'
	| 'Evaluated'
	| 'Verified'
	| 'Published'
	| 'Cancelled'

export type MarksEntryStatus =
	| 'Draft'
	| 'Submitted'
	| 'Verified'
	| 'Locked'
	| 'Rejected'
	| 'Pending Review'

export type ResultStatus = 'Pending' | 'Published' | 'Withheld' | 'Cancelled' | 'Under Review'

export type PassStatus = 'Pass' | 'Fail' | 'Reappear' | 'Absent' | 'Withheld' | 'Expelled'

export type AssignmentType = 'regular' | 'revaluation'

// =====================================================
// Revaluation Fee Configuration
// =====================================================

export interface RevaluationFeeConfig {
	id: string
	institutions_id: string
	attempt_1_fee: number
	attempt_2_fee: number
	attempt_3_fee: number
	theory_course_fee: number | null
	practical_course_fee: number | null
	project_course_fee: number | null
	effective_from: string // Date
	effective_to: string | null // Date
	is_active: boolean
	created_at: string
	updated_at: string
	created_by: string | null
}

export interface RevaluationFeeConfigFormData {
	institutions_id: string
	attempt_1_fee: string
	attempt_2_fee: string
	attempt_3_fee: string
	theory_course_fee: string
	practical_course_fee: string
	project_course_fee: string
	effective_from: string
	effective_to: string
	is_active: boolean
}

// =====================================================
// Revaluation Registration
// =====================================================

export interface RevaluationRegistration {
	id: string
	institutions_id: string
	examination_session_id: string
	exam_registration_id: string
	course_offering_id: string
	course_id: string
	student_id: string

	// Revaluation details
	attempt_number: number // 1, 2, or 3
	previous_revaluation_id: string | null

	// Application
	application_date: string
	reason_for_revaluation: string | null

	// Payment
	fee_amount: number
	payment_transaction_id: string | null
	payment_date: string | null // Date
	payment_status: PaymentStatus
	payment_verified_by: string | null
	payment_verified_date: string | null

	// Workflow
	status: RevaluationStatus

	// Assignment
	examiner_assignment_id: string | null
	assigned_date: string | null
	evaluation_deadline: string | null // Date

	// Approval
	approved_by: string | null
	approved_date: string | null
	rejection_reason: string | null

	// Publication
	published_by: string | null
	published_date: string | null

	// Audit
	created_at: string
	updated_at: string
	created_by: string | null
	updated_by: string | null

	// Denormalized
	student_register_number: string
	student_name: string
	course_code: string
	course_title: string
	session_code: string
	institution_code: string
}

export interface RevaluationRegistrationFormData {
	institutions_id: string
	examination_session_id: string
	exam_registration_id: string
	course_offering_ids: string[] // Multiple courses
	reason_for_revaluation: string
	payment_transaction_id: string
	payment_date: string
	payment_amount: string
}

export interface RevaluationRegistrationWithRelations extends RevaluationRegistration {
	// Joined data
	examiner?: {
		id: string
		name: string
		email: string
	} | null
	original_marks?: {
		total_marks_obtained: number
		percentage: number
		letter_grade: string
		is_pass: boolean
	} | null
	revaluation_marks?: {
		total_marks_obtained: number
		percentage: number
		entry_status: MarksEntryStatus
	} | null
}

// =====================================================
// Revaluation Marks Entry
// =====================================================

export interface RevaluationMarks {
	id: string
	institutions_id: string
	examination_session_id: string
	revaluation_registration_id: string

	// Links
	answer_sheet_id: string | null
	examiner_assignment_id: string | null
	exam_registration_id: string
	student_dummy_number_id: string | null
	course_id: string

	// Marks data
	dummy_number: string
	question_wise_marks: Record<string, number> | null
	total_marks_obtained: number
	total_marks_in_words: string
	marks_out_of: number
	percentage: number // Generated column

	// Evaluation details
	evaluation_date: string // Date
	evaluation_time_minutes: number | null
	evaluator_remarks: string | null

	// Moderation
	is_moderated: boolean
	moderated_by: string | null
	moderation_date: string | null // Date
	marks_before_moderation: number | null
	marks_after_moderation: number | null
	moderation_difference: number | null // Generated column
	moderation_remarks: string | null

	// Status
	entry_status: MarksEntryStatus
	submitted_at: string | null
	verified_by: string | null
	verified_at: string | null
	locked_by: string | null
	locked_at: string | null

	// Audit
	is_active: boolean
	created_at: string
	updated_at: string
	created_by: string | null
	updated_by: string | null

	// Denormalized
	program_code: string | null
}

export interface RevaluationMarksFormData {
	revaluation_registration_id: string
	dummy_number: string
	question_wise_marks: Record<string, string> // String for form inputs
	total_marks_obtained: string
	total_marks_in_words: string
	marks_out_of: string
	evaluation_date: string
	evaluation_time_minutes: string
	evaluator_remarks: string
}

// =====================================================
// Revaluation Final Marks
// =====================================================

export interface RevaluationFinalMarks {
	id: string
	institutions_id: string
	examination_session_id: string
	revaluation_registration_id: string
	exam_registration_id: string
	course_offering_id: string
	course_id: string
	student_id: string

	// Links
	internal_marks_id: string | null
	revaluation_marks_id: string | null
	original_final_marks_id: string | null

	// Internal marks (from original)
	internal_marks_obtained: number
	internal_marks_maximum: number
	internal_percentage: number // Generated column

	// External marks (from revaluation)
	external_marks_obtained: number
	external_marks_maximum: number
	external_percentage: number // Generated column

	// Total marks
	total_marks_obtained: number
	total_marks_maximum: number
	percentage: number

	// Grace marks
	grace_marks: number
	grace_marks_reason: string | null
	grace_marks_approved_by: string | null
	grace_marks_approved_date: string | null // Date

	// Grade
	letter_grade: string | null
	grade_points: number | null
	grade_description: string | null
	credit: number | null
	total_grade_points: number | null

	// Pass status
	is_pass: boolean
	is_distinction: boolean
	is_first_class: boolean
	pass_status: PassStatus | null

	// Comparison with original
	original_marks_obtained: number | null
	original_percentage: number | null
	original_grade: string | null
	marks_difference: number | null
	percentage_difference: number | null
	is_better_than_original: boolean

	// Status
	result_status: ResultStatus
	published_date: string | null // Date
	published_by: string | null

	// Lock
	is_locked: boolean
	locked_by: string | null
	locked_date: string | null // Date

	// Calculation
	calculated_by: string | null
	calculated_at: string | null
	calculation_notes: string | null

	// Audit
	remarks: string | null
	is_active: boolean
	created_at: string
	updated_at: string
	created_by: string | null
	updated_by: string | null

	// Denormalized
	register_number: string
	program_code: string
}

export interface RevaluationComparisonData {
	revaluation_registration_id: string
	student_register_number: string
	student_name: string
	course_code: string
	course_title: string
	attempt_number: number

	// Original marks
	original_marks: number
	original_percentage: number
	original_grade: string
	original_pass_status: string

	// Revaluation marks
	revaluation_marks: number
	revaluation_percentage: number
	revaluation_grade: string
	revaluation_pass_status: string

	// Comparison
	marks_difference: number
	percentage_difference: number
	grade_changed: boolean
	pass_status_changed: boolean
	is_improvement: boolean

	// System recommendation
	recommended_use_revaluation: boolean
}

// =====================================================
// API Request/Response Types
// =====================================================

export interface CreateRevaluationApplicationRequest {
	institutions_id: string
	examination_session_id: string
	exam_registration_id: string
	course_offering_ids: string[]
	reason_for_revaluation: string
	payment_transaction_id: string
	payment_date: string
	payment_amount: number
}

export interface CreateRevaluationApplicationResponse {
	success: boolean
	data: RevaluationRegistration[]
	message: string
}

export interface AssignExaminerRequest {
	revaluation_registration_ids: string[]
	examiner_id: string
}

export interface AssignExaminerResponse {
	success: boolean
	assigned_count: number
	message: string
}

export interface PublishRevaluationResultsRequest {
	selections: Array<{
		revaluation_registration_id: string
		revaluation_final_marks_id: string
		use_revaluation_marks: boolean // Admin's choice
	}>
}

export interface PublishRevaluationResultsResponse {
	success: boolean
	published_count: number
	message: string
}

// =====================================================
// Filter & Query Types
// =====================================================

export interface RevaluationFilters {
	institutions_id?: string
	examination_session_id?: string
	status?: RevaluationStatus
	payment_status?: PaymentStatus
	student_id?: string
	course_id?: string
	attempt_number?: number
	search?: string
}

export interface RevaluationStatistics {
	total_applications: number
	approval_rate: number
	avg_mark_increase: number
	avg_mark_decrease: number
	no_change_percent: number
	pass_rate_improvement: number
	avg_turnaround_days: number
}

export interface CourseAnalysisData {
	course_code: string
	course_title: string
	total_revaluations: number
	avg_mark_change: number
	max_mark_increase: number
	max_mark_decrease: number
	pass_to_fail_count: number
	fail_to_pass_count: number
	pass_rate_improvement: number
}

export interface ExaminerComparisonData {
	original_examiner_name: string
	revaluation_examiner_name: string
	courses_evaluated: number
	avg_mark_difference: number
	marks_increased_count: number
	marks_decreased_count: number
	consistency_score: number
}

export interface FinancialSummary {
	total_revenue: number
	attempt_1_revenue: number
	attempt_2_revenue: number
	attempt_3_revenue: number
	pending_payments: number
	verified_payments: number
	payment_verification_rate: number
}

// =====================================================
// UI Component Props Types
// =====================================================

export interface RevaluationApplicationFormProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSuccess: () => void
	editData?: RevaluationRegistration | null
}

export interface RevaluationComparisonTableProps {
	data: RevaluationComparisonData[]
	onSelect: (selections: PublishRevaluationResultsRequest['selections']) => void
	loading?: boolean
}

export interface RevaluationStatusBadgeProps {
	status: RevaluationStatus
	className?: string
}

export interface RevaluationHistoryTimelineProps {
	revaluation_registration_id: string
}
