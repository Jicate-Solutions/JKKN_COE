// Final Exam Registration Approval
// =====================================================
// After a learner's exam application is paid and payment-approved, the CoE
// office gives the registration its final approval. The screen lists learners
// (not papers): one row per learner, every paper the learner applied for in
// the session rides along and is approved together.

/** Learner-level status shown on the approval screen and in reports */
// The fee is collected AT final approval, so a pending learner has not paid yet.
export type FinalApprovalStatus = 'Payment Pending' | 'Paid'

export type FinalApprovalPaymentMode = 'Cash' | 'Online'
export const FINAL_APPROVAL_PAYMENT_MODES: FinalApprovalPaymentMode[] = ['Cash', 'Online']

/**
 * One approved learner, in the row shape of the Final Registration Approval
 * report (report_type 'student-final-approval') so the same PDF / Excel
 * generators print it.
 */
export interface FinalApprovalApprovedRow {
	id: string
	student_id: string | null
	stu_register_no: string
	student_name: string
	program_code: string | null
	program_name: string | null
	regulation_code: string | null
	learner_semester: number
	total_subjects: number
	exam_fee: number
	application_fee: number
	mark_statement_fee: number
	late_fine: number
	final_amount: number
	fee_paid: boolean
	payment_status: string | null
	registration_status: string
	payment_mode: FinalApprovalPaymentMode | null
	payment_transaction_id: string | null
	approved_at: string | null
}

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
	/** Admission year read from the register number; 0 = not mapped */
	batch_year: number
	subjects: FinalApprovalSubject[]
	total_subjects: number
	exam_fee: number
	application_fee: number
	mark_statement_fee: number
	/**
	 * Late-PAYMENT fine, keyed in by hand on the approval screen. Always 0 in
	 * the pending cohort - a late application carries no automatic fine.
	 */
	late_fine: number
	/** Fine an older build stamped on the paper rows; the approval overwrites it */
	stamped_late_fine: number
	/** Paper row that carries the once-per-session heads (and the entered fine) */
	anchor_registration_id: string | null
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
		/** value = admission year ("2024"), "0" = not mapped; newest first */
		batches: FinalApprovalFilterOption[]
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
	/** Late-payment fine collected from this learner; omitted / 0 = no fine */
	late_fine?: number
}

export interface FinalApprovalRequest {
	institutions_id: string
	examination_session_id: string
	learners: FinalApprovalRequestLearner[]
	/** How the fee was collected - applies to every learner in the request */
	payment_mode: FinalApprovalPaymentMode
	/** Required when payment_mode is Online */
	payment_transaction_id?: string | null
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
	payment_mode: FinalApprovalPaymentMode
	payment_transaction_id: string | null
	/** The learners approved by THIS request - printed as the approval report */
	approved: FinalApprovalApprovedRow[]
	/** Selected learners that were no longer pending and were left untouched */
	skipped: FinalApprovalSkipped[]
}

/** Result of sending approved learners back to the pending list */
export interface FinalUnapprovalResult {
	success: boolean
	message: string
	students_unapproved: number
	subjects_updated: number
	/** Selected learners that were not approved any more and were left untouched */
	not_found: number
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
	payment_mode: FinalApprovalPaymentMode | null
	payment_transaction_id: string | null
	approved_by: string | null
	approved_at: string | null
	created_at: string
	updated_at: string
}
