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

export type QpPortalDocType =
	| 'instructions'
	| 'checklist'
	| 'declaration'
	| 'claim'
	| 'order'
	| 'guidelines'

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
	remuneration?: number | null

	/** The setter's own check-list answers, keyed by clause id. */
	checklist?: Record<string, string> | null
	declaration_accepted_at?: string | null
	claim_submitted_at?: string | null

	order_ref_no?: string | null
	order_issued_at?: string | null
	order_email_sent_at?: string | null

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
	examiner_kind: QpExaminerKind
	/** External: an examiners.id. Internal: omit and send `staff` instead. */
	examiner_id?: string
	staff?: QpInternalStaffInput
	valid_from: string
	valid_to: string
	remuneration?: number | null
	notes?: string | null
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
export const QP_CONTENT_DEFAULTS: Record<
	QpPortalDocType,
	{ title: string; body: string[]; footer?: string }
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
			'The question paper is fully within the prescribed syllabus.',
			'The paper follows the approved format — parts, number of questions and marks.',
			'Questions are distributed across all units of the syllabus.',
			'Course Outcomes and K-levels are correctly tagged against every question.',
			'The questions are original and have not appeared in an earlier question paper.',
			'The language is clear and free of ambiguity and printing errors.',
			'The time allotted is adequate for the questions set.',
			'All figures, tables and data required to answer the questions are supplied.',
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
		body: [
			'Remuneration is payable per question paper set and accepted, at the rate notified by the Office of the Controller of Examinations.',
			'Payment is made by bank transfer to the account details recorded in your portal profile.',
			'Income tax is deducted at source where applicable.',
		],
		footer: 'I certify that the above particulars are true and that I have set the question paper(s) claimed for.',
	},
	order: {
		title: 'ORDER OF APPOINTMENT — QUESTION PAPER SETTER',
		body: [
			'You are requested to set the question paper for the subject shown above for the examination indicated, strictly in accordance with the prescribed syllabus and the approved question paper format.',
			'The question paper must be entered and submitted through the Examiner Portal within the period shown above. Access closes automatically at the end of the period.',
			'The assignment and the contents of the question paper are strictly confidential and must not be disclosed to any person.',
			'Remuneration will be paid on acceptance of the question paper, on submission of the claim form available in the portal.',
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
	| 'claim_submit'
	| 'checklist_save'
	| 'declaration_accept'
	| 'image_upload'
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
	paper_pdf_download: 'Downloaded paper PDF',
	order_download: 'Downloaded examiner order',
	claim_download: 'Downloaded claim form',
	claim_submit: 'Submitted claim form',
	checklist_save: 'Saved check list',
	declaration_accept: 'Accepted declaration',
	image_upload: 'Uploaded a figure',
	profile_update: 'Updated portal profile',
	access_denied: 'Access refused',
	window_extended: 'Window changed by CoE',
	assignment_accepted: 'Paper accepted by CoE',
	assignment_returned: 'Paper returned by CoE',
	order_emailed: 'Examiner order e-mailed',
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
