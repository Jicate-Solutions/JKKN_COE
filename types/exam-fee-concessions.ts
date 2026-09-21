// Exam Fee Concessions
// =====================================================
// A learner (disability and similar cases) can be granted a concession on the
// exam fee by an approval letter. The office records the amount waived on each
// fee head for one examination session; Final Registration Approval collects
// actual fee - concession.

export const EXAM_FEE_CONCESSION_TYPES = ['Disability', 'Management', 'Scholarship', 'Other'] as const
export type ExamFeeConcessionType = typeof EXAM_FEE_CONCESSION_TYPES[number]

/** Active = waiting for the learner's final approval; Applied = taken off the fee */
export type ExamFeeConcessionStatus = 'Active' | 'Applied'

/** Row of exam_fee_concessions */
export interface ExamFeeConcession {
	id: string
	institutions_id: string
	institution_code: string | null
	examination_session_id: string
	session_code: string | null
	student_id: string | null
	stu_register_no: string
	student_name: string | null
	program_code: string | null
	concession_type: string
	exam_fee_waiver: number
	application_fee_waiver: number
	mark_statement_fee_waiver: number
	letter_ref_no: string | null
	letter_date: string | null
	letter_file_path: string | null
	letter_file_name: string | null
	remarks: string | null
	status: ExamFeeConcessionStatus
	applied_at: string | null
	created_at: string
	updated_at: string
}

/** One applied learner on the concession screen: the actual fee and any concession on it */
export interface ExamFeeConcessionLearner {
	/** reg:<UPPER register number>, or sid:<student id> when unknown */
	key: string
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	program_name: string | null
	regulation_code: string | null
	semester: number | null
	batch_year: number
	total_subjects: number
	/** ACTUAL fee heads, before any concession */
	exam_fee: number
	application_fee: number
	mark_statement_fee: number
	/** The learner's concession for the session, if one is recorded */
	concession: ExamFeeConcession | null
}

export interface ExamFeeConcessionListResponse {
	/** Learners who have applied and still await final approval */
	learners: ExamFeeConcessionLearner[]
	/** Every concession of the session - Active and Applied */
	concessions: ExamFeeConcession[]
	/** exam_fee_concessions exists - i.e. 20260921_exam_fee_concessions.sql was run */
	migration_ready: boolean
}

/** One learner's waiver in a save request */
export interface ExamFeeConcessionEntry {
	student_id?: string | null
	register_number: string
	exam_fee_waiver: number
	application_fee_waiver: number
	mark_statement_fee_waiver: number
}

export interface ExamFeeConcessionSaveResult {
	success: boolean
	message: string
	saved: number
	skipped: { register_number: string; reason: string }[]
}
