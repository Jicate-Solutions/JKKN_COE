import type { LearnerFeeQuote } from '@/lib/exam-fee/calculate'

// Exam Application type definitions
// An Exam Application merges three course sources for a learner:
//   1. Exam Registration - courses already registered in the selected session
//   2. Backlog / Arrear   - pending (uncleared) backlogs eligible to be written
//   3. Offer List         - course offerings for the learner's programme/semester
// Duplicates are removed by course code and eligibility is validated server-side.

export type ExamApplicationSource = 'Exam Registration' | 'Backlog' | 'Offer List'

export type ExamApplicationEligibility =
	| 'Eligible'
	/** A registration exists and has already been applied for - nothing left to do */
	| 'Already Applied'
	/** A registration exists in a state that must not be re-applied (Cancelled / Rejected / Withdrawn) */
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
	/** courses.course_category - Theory / Practical / Project ... drives the fee head */
	course_category: string | null
	/** courses.exam_duration in hours - separates practical <=3 Hrs from >3 Hrs */
	exam_duration: number | null
	/** Fee head this paper falls under, null when it carries no exam fee */
	fee_head: string | null
	/** Fee for this paper at the learner's tier, null when no rate is configured */
	fee_amount: number | null
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
	/**
	 * The learner already holds a registration for this paper but has not applied
	 * for it yet, so applying UPDATES that row rather than inserting a new one.
	 * Registration and application happen on the same screen, so a paper that was
	 * registered but never applied has to stay actionable - otherwise it is
	 * reachable from neither tab.
	 */
	requires_update: boolean
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

// ---------------------------------------------------------------------------
// Bulk Exam Application
// ---------------------------------------------------------------------------
// The bulk flow applies the same merged course list to many learners at once and
// can be driven from either end:
//   subject  - pick one course offering, then pick the learners (current paper +
//              anyone holding an uncleared backlog for that subject code)
//   learner  - pick the learners, then pick courses from each learner's merged list
// ---------------------------------------------------------------------------

export type BulkApplicationMode = 'subject' | 'learner'

/** Minimal learner reference accepted by the bulk builders */
export interface BulkLearnerRef {
	student_id?: string | null
	register_number: string
	student_name?: string | null
	program_code?: string | null
	semester?: number | null
}

/** The course offering a subject-wise application is being made against */
export interface BulkSubjectOffering {
	course_offering_id: string
	course_code: string
	course_name: string
	course_credit: number | null
	program_code: string | null
	semester: number | null
	semester_code: string | null
	is_active: boolean
	max_enrollment: number | null
	enrolled_count: number | null
}

/** One learner row in the subject-wise candidate list */
export interface BulkSubjectCandidate {
	/** Merge key - reg:<UPPER register number>, or sid:<student id> when unknown */
	key: string
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	semester: number | null
	sources: ExamApplicationSource[]
	source_label: string
	is_backlog: boolean
	backlog_id: string | null
	attempt_number: number
	attempt_count: number
	max_attempts_allowed: number
	failure_reason: string | null
	priority_level: string | null
	original_semester: number | null
	is_registered: boolean
	registration_id: string | null
	registration_status: string | null
	is_eligible: boolean
	eligibility_status: ExamApplicationEligibility
	eligibility_reason: string | null
	/** Already holds at least one registration this session (so the once-per-session charges are paid) */
	has_session_registration: boolean
	/** Fee tier resolved from the learner's programme */
	fee_level: string | null
	/** Paper fee for this learner at their tier, null when no rate is configured */
	fee_amount: number | null
	/** Mark statement + application, charged only when this is the learner's first paper this session */
	learner_charge: number
	/** Late fine, when the application date is past the cut-off */
	fine: number
	/** fee_amount + learner_charge + fine */
	fee_total: number
}

export interface BulkSubjectCandidatesResponse {
	offering: BulkSubjectOffering
	data: BulkSubjectCandidate[]
	summary: {
		total: number
		eligible: number
		current_paper: number
		backlog: number
		registered: number
		not_eligible: number
	}
	fee: BulkFeeContext
}

/** One learner block in the learner-wise course list */
export interface BulkLearnerCourses {
	key: string
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	semester: number | null
	courses: ExamApplicationCourse[]
	eligible_count: number
	backlog_count: number
	registered_count: number
	/** Fee for every eligible course in this learner's list. Null when fees are unconfigured. */
	fee: LearnerFeeQuote | null
}

/** Fee configuration context returned alongside a bulk list, for the UI banner */
export interface BulkFeeContext {
	/** false when the institution has no exam-paper rates configured */
	configured: boolean
	circular_ref: string | null
	last_date_without_fine: string | null
	last_date_with_fine: string | null
	fine_amount: number
	/** true when today is past last_date_without_fine, so the fine is being charged */
	fine_applicable: boolean
	/** Date the quote was computed on */
	as_of: string
}

export interface BulkLearnerCoursesResponse {
	data: BulkLearnerCourses[]
	summary: {
		learners: number
		courses: number
		eligible: number
		backlog: number
		registered: number
	}
	fee: BulkFeeContext
}

/** One (learner, course) selection submitted to the bulk endpoint */
export interface BulkApplicationItem {
	student_id?: string | null
	register_number: string
	student_name: string
	program_code?: string | null
	semester?: number | null
	course_code: string
	course_offering_id?: string | null
}

export interface BulkApplicationResult {
	register_number: string
	course_code: string
	status: 'created' | 'skipped' | 'failed'
	reason?: string
	registration_id?: string
}

export interface BulkApplicationResponse {
	success: boolean
	summary: { total: number; created: number; skipped: number; failed: number }
	results: BulkApplicationResult[]
	message: string
}

// ---------------------------------------------------------------------------
// Current Papers (Exam Application)
// ---------------------------------------------------------------------------
// Learners in this tab are ALREADY registered for their current-semester papers.
// Applying does not create rows - it moves the rows they already hold to
// registration_status = 'Applied' and stamps the fees. Selection is therefore at
// LEARNER level: ticking 9 of 10 learners updates 9 x (their registered papers).
// ---------------------------------------------------------------------------

export type CurrentPaperStatus = 'Applied' | 'Partial' | 'Not Applied'

/** One already-registered paper held by a learner */
export interface CurrentPaperSubject {
	registration_id: string
	course_code: string
	course_name: string
	course_offering_id: string | null
	registration_status: string | null
	/** registration_status is already 'Applied' */
	is_applied: boolean
	/** Applied / Cancelled / Rejected / Withdrawn - never re-applied */
	is_locked: boolean
	attempt_number: number
	/** Amount currently stored on the row */
	fee_amount: number | null
	/** Amount the rate book would charge if this paper is applied for now */
	quoted_fee?: number | null
	semester: number | null
}

export interface CurrentPaperLearner {
	/** reg:<UPPER register number>, or sid:<student id> when unknown */
	key: string
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	semester: number | null
	subjects: CurrentPaperSubject[]
	total_subjects: number
	applied_subjects: number
	/** Papers that can still be applied for */
	pending_subjects: number
	status: CurrentPaperStatus
	fee_level: string | null
	/** Sum of the quoted per-paper fees for the papers still pending */
	paper_fee_total: number
	/** Once-per-session charges owed - all 0 when the learner has already been charged */
	application_fee: number
	mark_statement_fee: number
	late_fine: number
	fee_total: number
	/** Already carries a once-per-session charge in this session */
	already_charged: boolean
}

/** One distinct paper across the filtered cohort (right-hand panel) */
export interface CurrentPaperRow {
	course_code: string
	course_name: string
	semester: number | null
	fee_amount: number | null
	learner_count: number
	applied_count: number
}

/**
 * One choice in a cascading filter, carrying how much data sits behind it.
 *
 * The counts are shown in the dropdown because without them a filter that
 * genuinely changes nothing (a programme running a single semester, so "All
 * semesters" and "Semester I" are the same 17 learners) is indistinguishable
 * from a filter that is broken.
 */
export interface CohortFilterOption {
	/** Programme code, or the semester number as a string */
	value: string
	learners: number
	/** Registered papers (current tab) or uncleared arrears (arrear tab) */
	rows: number
}

/**
 * The "All ..." row of a cascading filter.
 *
 * Learner counts cannot be summed from the per-value options - a learner holding
 * papers in two semesters would be counted twice - so the distinct total is
 * computed server-side and sent alongside.
 */
export interface CohortFilterTotals {
	learners: number
	rows: number
}

export interface CurrentPaperCohortResponse {
	data: CurrentPaperLearner[]
	papers: CurrentPaperRow[]
	/** Option lists for the programme / semester cascade, derived from the cohort itself */
	filters: {
		programs: CohortFilterOption[]
		semesters: CohortFilterOption[]
		/** Distinct totals for the "All programs" / "All semesters" rows */
		totals: {
			/** Across the whole session */
			programs: CohortFilterTotals
			/** Across the rows left after the programme filter */
			semesters: CohortFilterTotals
		}
	}
	summary: {
		learners: number
		papers: number
		registrations: number
		applied: number
		partial: number
		not_applied: number
	}
	fee: BulkFeeContext
	/**
	 * false until 20260824_add_application_fees_to_exam_registrations.sql is applied.
	 * While false, applications still save but the application / mark statement /
	 * late fine amounts cannot be stored, so the UI warns instead of promising them.
	 */
	charge_columns_ready: boolean
}

export interface CurrentPaperApplyResult {
	register_number: string
	course_code: string
	status: 'updated' | 'skipped' | 'failed'
	reason?: string
}

export interface CurrentPaperApplyResponse {
	success: boolean
	summary: {
		total: number
		updated: number
		skipped: number
		failed: number
		learners: number
		learners_charged?: number
		fee_total: number
	}
	results: CurrentPaperApplyResult[]
	message: string
}

// ---------------------------------------------------------------------------
// Arrear learners (Exam Application - Arrear tab)
// ---------------------------------------------------------------------------

/** A learner holding at least one uncleared backlog, listed straight from the
 *  backlog view so the picker needs no MyJKKN sweep. */
export interface ArrearLearner {
	key: string
	student_id: string | null
	register_number: string
	student_name: string
	program_code: string | null
	/** Highest original_semester across their backlogs - what the semester filter matches */
	semester: number | null
	semesters: number[]
	arrear_count: number
	/** Arrears already registered in the selected session */
	registered_count: number
}

export interface ArrearLearnersResponse {
	data: ArrearLearner[]
	filters: {
		programs: CohortFilterOption[]
		semesters: CohortFilterOption[]
		totals: {
			programs: CohortFilterTotals
			semesters: CohortFilterTotals
		}
	}
	summary: {
		learners: number
		arrears: number
		registered: number
	}
}
