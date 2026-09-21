/**
 * Discontinued Learners report
 * -----------------------------------------------------
 * Learners whose exam registration was finally approved (fee settled) in the
 * PREVIOUS End Semester session but who hold no approved registration in the
 * CURRENT one.
 */

/** Why the learner counts as not having paid in the current session */
export type DiscontinuedReason =
	| 'Not Registered'
	| 'Registered - Not Applied'
	| 'Applied - Approval Pending'

export const DISCONTINUED_REASONS: DiscontinuedReason[] = [
	'Not Registered',
	'Registered - Not Applied',
	'Applied - Approval Pending',
]

/** An End Semester examination session, as offered by the two session pickers */
export interface DiscontinuedSessionOption {
	id: string
	session_code: string
	session_name: string
	month_year: string | null
	semester_type: string | null
	session_status: string | null
	exam_type_name: string | null
	/** year * 12 + month, from month_year (exam_start_date as the fallback) */
	sort_key: number
}

export interface DiscontinuedLearnerRow {
	key: string
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	program_name: string | null
	program_order: number
	/** Admission year read from the register number, 0 = not mapped */
	batch_year: number
	/** Semester the learner attended in the previous session */
	previous_semester: number | null
	/** Papers approved in the previous session */
	previous_papers: number
	/** Fee settled in the previous session, null when no amount was recorded */
	previous_fee: number | null
	current_status: DiscontinuedReason
	/** Unpassed papers the learner still carries */
	pending_arrears: number
	/** The previous semester was the programme's last one (listed only because arrears remain) */
	is_final_semester: boolean
}

export interface DiscontinuedLearnersSummary {
	/** Learners approved in the previous session */
	previous_approved: number
	/** ... of whom are approved in the current session too */
	continuing: number
	/** Final-semester learners with nothing pending - left out of the list */
	completed_excluded: number
	/** Rows in the list */
	discontinued: number
}

export interface DiscontinuedLearnersResponse {
	institution_name: string
	institution_code: string
	current_session: { id: string; session_code: string; session_name: string; month_year: string | null }
	previous_session: { id: string; session_code: string; session_name: string; month_year: string | null }
	generated_at: string
	summary: DiscontinuedLearnersSummary
	data: DiscontinuedLearnerRow[]
}
