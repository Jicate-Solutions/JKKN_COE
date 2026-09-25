// End-Semester Question Paper Examiner Assignment + Examiner Portal.
//
// One assignment hands ONE end-semester paper (ese_question_papers) to ONE
// examiner (examiners) for a fixed IST window. The examiner authors the paper in
// the portal at /engg-examiner-registration; the CoE reviews and accepts it.
//
// The paper is generated with its format BEFORE any of this — see
// types/ese-question-paper.ts. An assignment attaches an examiner to a paper
// that already exists; it never creates one.
//
// Tables: ia_qp_assignments, ia_qp_portal_content, ia_qp_access_logs
// (supabase/migrations/20260823_qp_setter_portal.sql + 20260828_qp_examiner_assignment.sql
//  + 20260829_ese_question_papers.sql)

export type QpAssignmentStatus =
	| 'assigned'
	| 'in_progress'
	| 'submitted'
	| 'returned'
	| 'accepted'
	| 'cancelled'

export type QpExaminerKind = 'internal' | 'external'

// ============================================================================
// ASSIGNMENT TYPE + WILLINGNESS
// ============================================================================

/**
 * What the examiner is appointed to do. Each component carries its own fee from
 * exam_fee_master (see lib/qp-portal/fees.ts), and the examiner confirms in the
 * portal which components they are willing to do before authoring — the claim
 * is the sum of the ACCEPTED components, never the type's total by itself.
 */
export type QpAssignmentType = 'question_paper' | 'answer_key' | 'both'

export const QP_ASSIGNMENT_TYPE_LABELS: Record<QpAssignmentType, string> = {
	question_paper: 'Question Paper Setting',
	answer_key: 'Answer Key',
	both: 'Question Paper Setting + Answer Key',
}

export const QP_ASSIGNMENT_TYPES: QpAssignmentType[] = ['question_paper', 'answer_key', 'both']

/** Accepts "Both", "question paper", "QP+AK" … from a spreadsheet cell. */
export function parseAssignmentType(raw: unknown): QpAssignmentType | null {
	const v = String(raw ?? '').trim().toLowerCase().replace(/[\s_\-+&/]+/g, ' ')
	if (!v) return null
	if (v === 'both' || v.includes('both') || (v.includes('question') && v.includes('answer'))) return 'both'
	if (v.includes('answer') || v === 'ak') return 'answer_key'
	if (v.includes('question') || v === 'qp' || v.includes('paper')) return 'question_paper'
	return null
}

export type QpPortalDocType =
	| 'instructions'
	| 'checklist'
	| 'declaration'
	| 'claim'
	| 'order'
	| 'guidelines'
	/** Short note pinned above the questions while the examiner types them. */
	| 'question_note'

/** The willingness role an external examiner must hold to set papers. */
export const QP_SETTER_ROLE = 'Question Paper Setter'

export const QP_ASSIGNMENT_STATUS_LABELS: Record<QpAssignmentStatus, string> = {
	assigned: 'Assigned',
	in_progress: 'In Progress',
	submitted: 'Submitted',
	returned: 'Returned for Revision',
	accepted: 'Accepted',
	cancelled: 'Cancelled',
}

/** Statuses in which the examiner may still edit the paper (inside the window). */
export const QP_EDITABLE_STATUSES: QpAssignmentStatus[] = ['assigned', 'in_progress', 'returned']

/**
 * Statuses in which the paper is IN — with the CoE, and closed to the examiner.
 *
 * Submitting hands the paper over: from here the examiner may no longer read the
 * question content back, which is why this list gates question release in
 * lib/qp-portal/guard.ts as well as edit rights.
 */
export const QP_SUBMITTED_STATUSES: QpAssignmentStatus[] = ['submitted', 'accepted']

// ============================================================================
// SUBMISSION WIZARD
// ============================================================================

/**
 * Submitting a paper is three steps, and the examiner is walked through them
 * without having to find the next page:
 *
 *   authoring  → still writing; this is the only stage that can edit questions
 *   checklist  → content handed over, attesting to the CoE's check list
 *   signature  → check list done, declaration to accept and signature to give
 *   completed  → all three done; the paper is closed to the examiner for good
 *
 * The content is handed over at the FIRST step, so `status` is already
 * 'submitted' from `checklist` onwards — an abandoned wizard still leaves the
 * CoE a usable paper. The later stages add the attestation, not the paper.
 */
export type QpSubmissionStage = 'authoring' | 'checklist' | 'signature' | 'completed'

export const QP_SUBMISSION_STAGE_LABELS: Record<QpSubmissionStage, string> = {
	authoring: 'Question Paper Entry',
	checklist: 'Check List',
	signature: 'Signature',
	completed: 'Submission Completed',
}

/** Wizard stages in order — drives the stepper and the "next step" redirect. */
export const QP_SUBMISSION_STAGES: QpSubmissionStage[] = ['authoring', 'checklist', 'signature', 'completed']

/**
 * Stages in which question content may be shown to the examiner.
 *
 * Only while they are still writing it. Once the paper is submitted the content
 * is closed to the examiner at once — the claim form, check list and signature
 * that follow do not show it back (CoE decision, Sept 2026). It is never
 * downloadable or printable at any stage.
 */
export const QP_PREVIEW_STAGES: QpSubmissionStage[] = ['authoring']

// ============================================================================
// CLAIM
// ============================================================================

/**
 * Where an examiner's remuneration claim has got to.
 *
 *   pending    the examiner still has to enter bank details and submit
 *   submitted  with the CoE, under verification
 *   approved   verified by the CoE, awaiting payment
 *   paid       money sent
 *
 * A claim is only ACTIONABLE once the question paper has been submitted; that is
 * derived from the assignment status, never stored, so the two cannot disagree.
 */
export type QpClaimStatus = 'pending' | 'submitted' | 'approved' | 'paid'

export const QP_CLAIM_STATUS_LABELS: Record<QpClaimStatus, string> = {
	pending: 'Claim Pending',
	submitted: 'Claim Submitted',
	approved: 'Claim Approved',
	paid: 'Payment Completed',
}

/** Claim states the examiner can no longer change. */
export const QP_CLAIM_LOCKED_STATUSES: QpClaimStatus[] = ['submitted', 'approved', 'paid']

/** The bank details a claim is submitted with, snapshot onto the assignment. */
export interface QpClaimBankDetails {
	account_holder: string
	bank_name: string
	account_number: string
	branch: string
	ifsc: string
}

// ============================================================================
// ASSIGNMENT
// ============================================================================

export interface QpAssignment {
	id: string
	institutions_id: string
	institution_code?: string | null
	examination_session_id?: string | null
	exam_type_id?: string | null

	examiner_id: string
	examiner_kind: QpExaminerKind
	paper_id: string
	template_id?: string | null

	course_id?: string | null
	course_code?: string | null
	subject_title?: string | null
	program_code?: string | null
	semester?: number | null
	set_label?: string | null

	/** Window bounds. Stored as timestamptz; entered and displayed in IST. */
	valid_from: string
	valid_to: string

	status: QpAssignmentStatus
	/** The potential claim as printed on the order — never changes after issue. */
	remuneration?: number | null

	// ── Assignment type, fees and willingness (20260911) ──
	assignment_type: QpAssignmentType
	/** Fees resolved from exam_fee_master at appointment; null = none configured. */
	qp_fee?: number | null
	ak_fee?: number | null
	/** Confirmed by the examiner in the portal. null = not yet confirmed. */
	qp_willing?: boolean | null
	ak_willing?: boolean | null
	willingness_confirmed_at?: string | null
	/** Sum of the accepted components' fees — what the claim form pays. */
	claim_amount?: number | null

	/** The setter's own check-list answers, keyed by clause id. */
	checklist?: Record<string, string> | null
	declaration_accepted_at?: string | null

	// ── Submission wizard ──
	submission_stage: QpSubmissionStage
	checklist_completed_at?: string | null
	/** Private-bucket path of the signature given for THIS submission. */
	submission_signature_path?: string | null
	signed_at?: string | null
	final_submitted_at?: string | null

	// ── Claim ──
	claim_status: QpClaimStatus
	claim_submitted_at?: string | null
	/** Bank details AS SUBMITTED — a snapshot, never read live off the profile. */
	claim_account_holder?: string | null
	claim_bank_name?: string | null
	claim_account_number?: string | null
	claim_branch?: string | null
	claim_ifsc?: string | null
	claim_approved_at?: string | null
	claim_approved_by?: string | null
	claim_remarks?: string | null
	payment_completed_at?: string | null
	payment_reference?: string | null
	payment_amount?: number | null

	// ── Type change + reopen scope (20260911) ──
	/** While returned: 'full' = questions editable, 'answer_key' = only the answer key. */
	reopen_scope?: 'full' | 'answer_key' | null
	type_changed_at?: string | null
	type_changed_by?: string | null
	type_change_reason?: string | null

	// ── Versions + authorised reopen (20260910) ──
	paper_version?: number
	claim_version?: number
	reopened_at?: string | null
	reopened_by?: string | null
	reopen_reason?: string | null
	claim_reopened_at?: string | null
	claim_reopened_by?: string | null
	claim_reopen_reason?: string | null
	claim_reopen_remarks?: string | null

	order_ref_no?: string | null
	order_issued_at?: string | null
	order_email_sent_at?: string | null
	/** One reference for the combined order copy covering all of this examiner's papers in the session. */
	combined_order_ref_no?: string | null
	combined_order_issued_at?: string | null

	submitted_at?: string | null
	accepted_at?: string | null
	accepted_by?: string | null
	returned_at?: string | null
	return_remarks?: string | null

	window_extensions: number
	notes?: string | null
	assigned_by?: string | null
	assigned_at: string
	updated_by?: string | null
	created_at: string
	updated_at: string

	// ── Joined / computed by the API, never stored ──
	examiner?: QpExaminerOption | null
	/** Window state at the moment the row was read (server clock). */
	window_state?: QpWindowState
	/** true once the paper has at least one question with text. */
	authored?: boolean
	paper_status?: string | null
	session_name?: string | null
}

export type QpWindowState = 'pending' | 'open' | 'closed'

/** What the CoE screen posts to create an assignment. */
export interface QpAssignmentCreateInput {
	institutions_id: string
	institution_code?: string
	examination_session_id: string
	exam_type_id?: string | null
	/**
	 * The ese_question_papers row to appoint an examiner to. The paper is
	 * generated first (with its format chosen), so assignment never creates one —
	 * course, programme, semester, set and template all come from this row.
	 */
	paper_id: string
	/**
	 * Appoint this examiner to a NEW set of the same subject when `paper_id` is
	 * already taken, instead of failing with a clash. This is how a subject gets
	 * two setters working independently: each is given their own paper, and those
	 * become Set A and Set B on the CoE side — the examiner portal shows neither.
	 *
	 * Off by default, so an accidental double-assignment cannot quietly spawn
	 * extra papers; the screen sets it only for the second and later examiner in
	 * one deliberate multi-examiner appointment.
	 */
	create_additional_set?: boolean
	examiner_kind: QpExaminerKind
	/** External: an examiners.id. Internal: omit and send `staff` instead. */
	examiner_id?: string
	staff?: QpInternalStaffInput
	valid_from: string
	valid_to: string
	/**
	 * Manual override of the potential claim printed on the order. Normally
	 * omitted: the server resolves the fees from exam_fee_master by type.
	 */
	remuneration?: number | null
	notes?: string | null
	/** Defaults to 'question_paper' when omitted. */
	assignment_type?: QpAssignmentType
	/**
	 * Willingness recorded up front (e.g. from a signed paper form uploaded in
	 * bulk). Omitted = the examiner confirms in the portal.
	 */
	qp_willing?: boolean | null
	ak_willing?: boolean | null
}

/** MyJKKN staff details mirrored into `examiners` when assigning internally. */
export interface QpInternalStaffInput {
	myjkkn_staff_id: string
	full_name: string
	email: string
	mobile?: string | null
	designation?: string | null
	department?: string | null
}

// ============================================================================
// ELIGIBLE EXAMINERS (one shape for both kinds, so the picker is one list)
// ============================================================================

export interface QpExaminerOption {
	/** examiners.id for an external; the MyJKKN staff id for an unmirrored internal. */
	id: string
	kind: QpExaminerKind
	full_name: string
	email: string
	mobile?: string | null
	designation?: string | null
	department?: string | null
	institution_name?: string | null
	/** Internal only — carried through so the API can mirror the staff row. */
	myjkkn_staff_id?: string | null
	/** Internal only — true when an examiners row already exists for them. */
	already_mirrored?: boolean
	/** External only. */
	willingness_roles?: string[] | null
	status?: string | null
	/** How many live assignments this examiner already holds in the session. */
	active_assignments?: number
}

// ============================================================================
// PORTAL CONTENT (CoE-editable documents, per institution + optional session)
// ============================================================================

/** One ordered clause of an Instructions / Guidelines / Checklist / Order body. */
export interface QpContentClause {
	id: string
	text: string
	note?: string
	/**
	 * Check list only. When set, a YES answer must be accompanied by a short
	 * free-text detail, and this is the prompt for it — e.g. "Name of the
	 * table / chart required".
	 */
	detail_label?: string
}

/** One answered check list item, stored on ia_qp_assignments.checklist. */
export interface QpChecklistAnswer {
	/** The clause text at the time of answering, so the record outlives edits to the list. */
	question: string
	answer: 'YES' | 'NO'
	detail?: string | null
}

/**
 * Read a stored check list, accepting both the current shape
 * ({ id: { question, answer, detail } }) and the original ({ id: 'YES' }).
 */
export function readChecklistAnswers(raw: unknown): Record<string, QpChecklistAnswer> {
	const out: Record<string, QpChecklistAnswer> = {}
	if (!raw || typeof raw !== 'object') return out
	for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof v === 'string') {
			const a = v.toUpperCase()
			if (a === 'YES' || a === 'NO') out[id] = { question: id, answer: a }
		} else if (v && typeof v === 'object') {
			const o = v as Record<string, unknown>
			const a = String(o.answer || '').toUpperCase()
			if (a === 'YES' || a === 'NO') {
				out[id] = {
					question: typeof o.question === 'string' ? o.question : id,
					answer: a,
					detail: typeof o.detail === 'string' && o.detail ? o.detail : null,
				}
			}
		}
	}
	return out
}

export interface QpPortalContent {
	id: string
	institutions_id: string
	examination_session_id?: string | null
	doc_type: QpPortalDocType

	title?: string | null
	subtitle?: string | null
	body: QpContentClause[]
	footer_note?: string | null
	intro_text?: string | null

	session_label?: string | null
	letter_ref?: string | null
	contact_email?: string | null
	rate_per_paper?: number | null
	rate_in_words?: string | null

	signatory_name?: string | null
	signatory_designation?: string | null

	is_active: boolean
	updated_by?: string | null
	created_at: string
	updated_at: string
}

/** Sensible starting text so a fresh institution is never a blank portal. */
export type QpDefaultClause = string | { text: string; detail_label?: string }

export const QP_CONTENT_DEFAULTS: Record<
	QpPortalDocType,
	{ title: string; body: QpDefaultClause[]; footer?: string }
> = {
	instructions: {
		title: 'Instructions to the Question Paper Setter',
		body: [
			'Set the question paper strictly within the prescribed syllabus and the regulation in force.',
			'Follow the approved question paper format exactly — parts, question counts and marks must match.',
			'Distribute questions across all units of the syllabus and across the prescribed Course Outcomes and K-levels.',
			'Questions must be original. Do not reproduce questions from previous university question papers or from any published question bank.',
			'Use standard technical terminology, SI units and clear, unambiguous language.',
			'Where a figure, table or data is required, attach it with the question.',
			'Maintain absolute confidentiality. The question paper must not be shared with, or discussed with, any other person.',
			'Submit the completed paper within the assignment window shown on your dashboard.',
		],
	},
	question_note: {
		title: 'Note',
		body: [
			"The question paper should consist of 45% of Remembering & Understanding levels, 40% of Applying & Analyzing levels and 15% of Evaluate & Create levels of Revised Bloom's taxonomy.",
			"Kindly ensure each 'Either or Choice' pair of questions is at the same Bloom's taxonomy level.",
			"Fill in the marks and the Bloom's taxonomy level against each question without fail.",
			'Part A & B questions are to be taken from the first half of the unit, followed by another question from the remaining part of the unit.',
			'Depending upon the course, K5 / K6 can be incorporated.',
		],
	},
	guidelines: {
		title: 'Examiner Guidelines',
		body: [
			'Access to the question paper is restricted to the assignment window shown against each paper, in Indian Standard Time.',
			'Your login is personal. Do not share your credentials or your one-time password with anyone.',
			'Do not download, photograph, print or copy the question paper to any device or medium outside this portal.',
			'Every login, view, download and submission is recorded with the date, time and network address.',
			'A paper once submitted cannot be edited unless the Office of the Controller of Examinations returns it to you for revision.',
			'Report any suspected breach of confidentiality to the Office of the Controller of Examinations immediately.',
		],
	},
	checklist: {
		title: 'Question Paper Setter Check List',
		body: [
			'Is the question paper prepared as per the prescribed format?',
			'Is the regulation, programme, branch, semester, course code and name of the given question paper verified?',
			'Is the question paper set within the syllabus?',
			"Is the question paper in accordance with Bloom's Taxonomy?",
			'Are the grammar, spellings and sentence formations checked?',
			'Are the units, symbols and diagrams available in the question paper checked?',
			'Are the repetitions of questions checked?',
			'Are the bank account details in the claim form provided correctly?',
			{
				text: 'List of tables / charts permitted is clearly specified.',
				detail_label: 'If Yes, name of the table / chart required',
			},
			{
				text: 'Data book required.',
				detail_label: 'If Yes, name of the book',
			},
			{
				text: 'Requires graph paper.',
				detail_label: 'If Yes, mention the type of graph required',
			},
		],
	},
	declaration: {
		title: 'Declaration by the Question Paper Setter',
		body: [
			'I declare that the question paper set by me is entirely my own work and is within the prescribed syllabus.',
			'I declare that the questions are original and have not been reproduced from any previous question paper or published source.',
			'I declare that I have maintained complete confidentiality and have not disclosed the contents of this question paper to any person.',
			'I undertake to destroy all working notes and drafts relating to this question paper after submission.',
		],
	},
	claim: {
		title: 'Claim Form — Question Paper Setting',
		// No numbered notes: the printed form is a single page and carries only
		// the particulars, the bank details, the certification and the office box.
		body: [],
		footer: 'I certify that the above particulars are true and that I have set the question paper(s) claimed for.',
	},
	order: {
		title: 'ORDER OF APPOINTMENT — QUESTION PAPER SETTER',
		// The order itself prints the portal acceptance, the dates and the fee
		// line as fixed points; these are the CoE's own clauses that follow them.
		body: [
			'The question paper must be set strictly in accordance with the prescribed syllabus and the approved question paper format, and access to the portal closes automatically at the end of the period shown above.',
			'The question paper setter is requested to keep the details of the question paper setting STRICTLY CONFIDENTIAL.',
		],
		footer: 'This is a computer-generated order and is valid without a physical signature.',
	},
}

// ============================================================================
// ACCESS LOG
// ============================================================================

export type QpLogAction =
	| 'login_google'
	| 'login_otp'
	| 'otp_requested'
	| 'logout'
	| 'assignment_list'
	| 'paper_view'
	| 'paper_save'
	| 'paper_submit'
	| 'paper_pdf_download'
	| 'order_download'
	| 'claim_download'
	| 'claim_report_download'
	| 'claim_submit'
	| 'checklist_save'
	| 'checklist_complete'
	| 'submission_signed'
	| 'submission_completed'
	| 'declaration_accept'
	| 'image_upload'
	| 'willingness_confirmed'
	| 'profile_update'
	| 'access_denied'
	| 'window_extended'
	| 'assignment_accepted'
	| 'assignment_returned'
	| 'order_emailed'

export interface QpAccessLog {
	id: string
	examiner_id?: string | null
	examiner_email?: string | null
	assignment_id?: string | null
	paper_id?: string | null
	institutions_id?: string | null
	action: QpLogAction | string
	denied: boolean
	reason?: string | null
	detail?: Record<string, unknown> | null
	ip_address?: string | null
	user_agent?: string | null
	created_at: string
}

export const QP_LOG_ACTION_LABELS: Record<string, string> = {
	login_google: 'Signed in with Google',
	login_otp: 'Signed in with OTP',
	otp_requested: 'Requested an OTP',
	logout: 'Signed out',
	assignment_list: 'Opened dashboard',
	paper_view: 'Opened question paper',
	paper_save: 'Saved question paper',
	paper_submit: 'Submitted question paper',
	checklist_complete: 'Completed the check list',
	submission_signed: 'Signed the submission',
	submission_completed: 'Completed the submission',
	paper_pdf_download: 'Downloaded paper PDF',
	syllabus_view: 'Opened the syllabus',
	order_download: 'Downloaded examiner order',
	claim_download: 'Downloaded claim form',
	claim_report_download: 'Downloaded examiner claim report',
	claim_submit: 'Submitted claim form',
	checklist_save: 'Saved check list',
	declaration_accept: 'Accepted declaration',
	image_upload: 'Uploaded a figure',
	willingness_confirmed: 'Confirmed willingness (claim recalculated)',
	profile_update: 'Updated portal profile',
	access_denied: 'Access refused',
	window_extended: 'Window changed by CoE',
	assignment_accepted: 'Paper accepted by CoE',
	assignment_returned: 'Paper returned by CoE',
	paper_reopened: 'Question paper reopened by CoE',
	assignment_type_changed: 'Appointment type changed by CoE',
	willingness_confirmed: 'Confirmed willingness',
	claim_reopened: 'Claim form reopened by CoE',
	claim_resubmit: 'Claim form resubmitted',
	paper_resubmit: 'Question paper resubmitted',
	assignment_cancelled: 'Assignment cancelled by CoE',
	assignment_deleted: 'Assignment deleted by CoE',
	paper_deleted: 'Question paper deleted by CoE',
	assignment_updated: 'Assignment updated by CoE',
	order_emailed: 'Examiner order e-mailed',
}

// ============================================================================
// VERSION HISTORY (ia_qp_paper_versions / ia_qp_claim_versions)
// ============================================================================

export type QpVersionStatus = 'current' | 'reopened' | 'superseded'

export const QP_VERSION_STATUS_LABELS: Record<QpVersionStatus, string> = {
	current: 'Current',
	reopened: 'Reopened',
	superseded: 'Superseded',
}

export interface QpVersionBase {
	id: string
	assignment_id: string
	version: number
	status: QpVersionStatus
	submitted_at: string
	submitted_by_examiner_id?: string | null
	submitted_ip?: string | null
	submitted_user_agent?: string | null
	reopened_at?: string | null
	reopened_by?: string | null
	reopened_by_email?: string | null
	reopen_reason?: string | null
	reopen_remarks?: string | null
	created_at?: string
}

export interface QpPaperVersion extends QpVersionBase {
	paper_id: string
	questions?: any[]
	default_font?: string | null
	question_total?: number | null
	question_done?: number | null
}

export interface QpClaimVersion extends QpVersionBase {
	data: Record<string, unknown>
}

// ============================================================================
// PORTAL SESSION (what the signed cookie carries)
// ============================================================================

export interface QpPortalSession {
	/** examiners.id */
	sub: string
	email: string
	name: string
	kind: QpExaminerKind
	/** 'google' | 'otp' — recorded on every log line for this session. */
	via: 'google' | 'otp'
	iat: number
	exp: number
}
