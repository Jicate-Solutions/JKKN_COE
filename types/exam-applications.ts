// Exam Application type definitions
// An Exam Application merges three course sources for a learner:
//   1. Exam Registration - courses already registered in the selected session
//   2. Backlog / Arrear   - pending (uncleared) backlogs eligible to be written
//   3. Offer List         - course offerings for the learner's programme/semester
// Duplicates are removed by course code and eligibility is validated server-side.

export type ExamApplicationSource = 'Exam Registration' | 'Backlog' | 'Offer List'

export type ExamApplicationEligibility =
	| 'Eligible'
	| 'Already Registered'
	| 'Already Passed'
	| 'Not Offered'
	| 'Attempts Exhausted'
	| 'Seats Full'
	| 'Inactive Offering'

export interface ExamApplicationCourse {
	/** Merge key - uppercased course code */
	key: string
	course_code: string
	course_name: string
	course_type: string | null
	course_credit: number | null
	/** Semester the course belongs to (offering semester, else backlog semester) */
	semester: number | null
	/** All sources this course came from, deduplicated */
	sources: ExamApplicationSource[]
	/** Display label - a single source name or "Multiple Sources" */
	source_label: string
	course_offering_id: string | null
	course_id: string | null
	program_code: string | null
	/** Eligibility outcome - only 'Eligible' rows may be selected */
	is_eligible: boolean
	eligibility_status: ExamApplicationEligibility
	eligibility_reason: string | null
	/** Already registered in the selected session */
	is_registered: boolean
	registration_id: string | null
	registration_status: string | null
	/** Backlog metadata */
	is_backlog: boolean
	backlog_id: string | null
	attempt_number: number
	attempt_count: number
	max_attempts_allowed: number
	failure_reason: string | null
	priority_level: string | null
	original_semester: number | null
}

export interface ExamApplicationLearner {
	id: string
	register_number: string
	first_name: string
	last_name?: string
	program_code: string
	program_name?: string
	current_semester: number
	institution_id: string
}

export interface ExamApplicationCoursesResponse {
	data: ExamApplicationCourse[]
	summary: {
		total: number
		eligible: number
		registered: number
		backlog: number
		offer_list: number
		not_eligible: number
	}
}

export interface ExamApplicationSubmitCourse {
	course_code: string
	course_offering_id: string
}

export interface ExamApplicationSubmitResult {
	course_code: string
	status: 'created' | 'skipped' | 'failed'
	reason?: string
	registration_id?: string
}
