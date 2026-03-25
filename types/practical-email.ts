/**
 * Types for Practical Examiner Email System
 */

// =============================================================================
// EXAMINER ASSIGNMENT (grouped by examiner for email page)
// =============================================================================

export interface PracticalExaminerCourse {
	timetable_id: string
	exam_date: string
	session: 'FN' | 'AN'
	programme: string
	course_code: string
	course_name: string
	student_count: number
	batch_no: number
}

export interface PracticalExaminerAssignment {
	/** Unique key: examiner_type + examiner identifier */
	examiner_key: string
	examiner_name: string
	examiner_email: string | null
	examiner_type: 'internal' | 'external' | 'skilled' | 'programmer'
	examiner_designation?: string
	examiner_department?: string
	examiner_institution?: string
	examiner_address?: string
	/** All courses/batches assigned to this examiner */
	courses: PracticalExaminerCourse[]
	/** Last email status from logs */
	last_email_status: 'PENDING' | 'SENT' | 'FAILED' | null
	last_email_sent_at: string | null
}

// =============================================================================
// EMAIL BATCH
// =============================================================================

export interface PracticalEmailBatch {
	id: string
	institutions_id: string
	institution_code: string | null
	examination_session_id: string
	total_emails: number
	sent_count: number
	failed_count: number
	status: 'processing' | 'completed' | 'partial' | 'failed' | 'cancelled'
	started_at: string
	completed_at: string | null
	created_by: string | null
	created_at: string
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export interface SendPracticalEmailsRequest {
	institutions_id: string
	institution_code: string
	examination_session_id: string
	/** Selected examiner keys to send to */
	examiner_keys: string[]
}

export interface SendPracticalEmailsResponse {
	batch_id: string
	total_emails: number
}

export interface EmailBatchStatus {
	id: string
	status: PracticalEmailBatch['status']
	total_emails: number
	sent_count: number
	failed_count: number
	details: EmailBatchDetail[]
}

export interface EmailBatchDetail {
	examiner_name: string
	examiner_email: string
	examiner_type: string
	status: 'PENDING' | 'SENT' | 'FAILED'
	error_message?: string
	sent_at?: string
}

export interface ResendEmailsRequest {
	email_log_ids: string[]
	institution_code: string
}

// =============================================================================
// PDF GENERATION CONTEXT
// =============================================================================

import type { PdfInstitutionSettings } from '@/types/pdf-settings'

export interface AppointmentLetterData {
	/** Institution details */
	institution_name: string
	institution_address: string
	institution_accreditation: string

	/** COE details */
	coe_name: string
	coe_qualifications: string
	coe_contact: string
	coe_email: string

	/** Letterhead images */
	header_image_url: string | null
	coe_signature_url: string | null
	coe_seal_url: string | null

	/** Letter details */
	ref_number: string
	letter_date: string
	exam_session_name: string

	/** Examiner details */
	examiner_name: string
	examiner_designation: string
	examiner_department: string
	examiner_institution: string
	examiner_address: string
	examiner_mobile: string
	examiner_type: 'internal' | 'external' | 'skilled' | 'programmer'
	examiner_role: string // 'an Internal Examiner' | 'an External Examiner' | 'a Skilled Examiner'

	/** Course table rows */
	courses: Array<{
		date: string
		session: string
		programme: string
		course_code: string
		course_name: string
		student_count: number
	}>

	/**
	 * Full PDF institution settings from the database.
	 * ALL visual elements (fonts, colors, margins, logos, watermark, header/footer,
	 * signature section) are read from this object.
	 * When null, sensible defaults are used.
	 */
	pdf_settings: PdfInstitutionSettings | null

	/**
	 * @deprecated Use pdf_settings instead. Kept for backward compatibility.
	 */
	font_family?: string
	primary_color?: string
	accent_color?: string
}