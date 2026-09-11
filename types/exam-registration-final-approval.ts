// Final Exam Registration Approval
// =====================================================
// After a learner's exam application is paid and payment-approved, the CoE
// office gives the registration its final approval. The screen lists learners
// (not papers): one row per learner, every paper the learner applied for in
// the session rides along and is approved together.

/** Learner-level status shown on the approval screen and in reports */
export type FinalApprovalStatus = 'Payment Approved' | 'Approved'

/** One paper the learner applied for (shown when a row is expanded) */
export interface FinalApprovalSubject {
	registration_id: string
	course_code: string
	course_name: string
	semester: number | null
	is_regular: boolean
	attempt_number: number
	/** Per-paper exam fee stamped on the registration row */
	exam_fee: number
	registration_status: string | null
}

/** One learner awaiting final approval */
export interface FinalApprovalLearner {
	/** reg:<UPPER register number>, or sid:<student id> when unknown */
	key: string
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	program_name: string | null
	regulation_code: string | null
	/** The LEARNER's semester - the semester of their regular papers */
	semester: number | null
	subjects: FinalApprovalSubject[]
	total_subjects: number
	exam_fee: number
	application_fee: number
	mark_statement_fee: number
	late_fine: number
	final_amount: number
	status: FinalApprovalStatus
}

export interface FinalApprovalFilterOption {
	value: string
	label: string
	count: number
}

export interface FinalApprovalTotals {
	learners: number
	subjects: number
	exam_fee: number
	application_fee: number
	mark_statement_fee: number
	late_fine: number
	final_amount: number
}

export interface FinalApprovalCohortResponse {
	data: FinalApprovalLearner[]
	/** Option lists derived from the WHOLE pending cohort (before the filters) */
	filters: {
		regulations: FinalApprovalFilterOption[]
		programs: FinalApprovalFilterOption[]
		semesters: FinalApprovalFilterOption[]
	}
	/** Totals of the rows returned (after the filters) */
	summary: FinalApprovalTotals
	/** exam_registration_fee_details + approve_final_exam_registration() exist */
	migration_ready: boolean
	/** application_fee / mark_statement_fee / late_fine columns exist on exam_registrations */
	charge_columns_ready: boolean
}

export interface FinalApprovalRequestLearner {
	student_id?: string | null
	register_number: string
}

export interface FinalApprovalRequest {
	institutions_id: string
	examination_session_id: string
	learners: FinalApprovalRequestLearner[]
}

export interface FinalApprovalSkipped {
	register_number: string
	reason: string
}

export interface FinalApprovalResult {
	success: boolean
	message: string
	students_approved: number
	subjects_updated: number
	totals: FinalApprovalTotals
	/** Selected learners that were no longer pending and were left untouched */
	skipped: FinalApprovalSkipped[]
}

/** Row of exam_registration_fee_details */
export interface ExamRegistrationFeeDetail {
	id: string
	institutions_id: string
	institution_code: string | null
	examination_session_id: string
	session_code: string | null
	student_id: string | null
	stu_register_no: string
	student_name: string | null
	regulation_code: string | null
	program_code: string | null
	semester: number | null
	total_subjects: number
	exam_fee: number
	application_fee: number
	mark_statement_fee: number
	late_fine: number
	final_amount: number
	fee_paid: boolean
	payment_status: 'Payment Pending' | 'Payment Submitted' | 'Payment Approved'
	registration_status: 'Final Approval Pending' | 'Approved'
	approved_by: string | null
	approved_at: string | null
	created_at: string
	updated_at: string
}
