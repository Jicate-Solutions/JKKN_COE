import type { PdfInstitutionSettings } from '@/types/pdf-settings'

export interface CentralValuationCourseEntry {
	course_code: string
	course_name: string
	valuation_date: string
	// Per-packet identity. When a row represents a single packet,
	// packet_no/packet_index/total_packets are populated and packet_count is 1.
	packet_no?: string
	packet_index?: number
	total_packets?: number
	packet_count: number
	sheet_count: number
}

export type CentralValuationExaminerType = 'internal' | 'external' | 'chief' | 'assistant'

export interface CentralValuationAppointmentData {
	/* Institution header */
	institution_name?: string
	institution_accreditation?: string
	institution_address?: string
	header_image_url?: string | null

	/* COE */
	coe_name?: string
	coe_qualifications?: string
	coe_contact?: string
	coe_email?: string
	coe_seal_url?: string | null
	coe_signature_url?: string | null

	/* Letter meta */
	ref_number: string
	letter_date: string  // ISO YYYY-MM-DD

	/* Examiner */
	examiner_name: string
	examiner_type: CentralValuationExaminerType
	examiner_role: string          // e.g. "External Examiner"
	examiner_designation?: string
	examiner_department?: string
	examiner_institution?: string
	examiner_address?: string
	examiner_mobile?: string

	/* Central Valuation specifics */
	board_name: string
	board_code: string
	exam_session_name: string
	valuation_date_range?: string  // e.g. "15.11.2025"
	courses: CentralValuationCourseEntry[]

	/* Styling */
	primary_color?: string
	accent_color?: string
	pdf_settings?: PdfInstitutionSettings | null
}

export interface CentralValuationExaminerAggregateRow {
	examiner_key: string
	examiner_name: string
	examiner_type: CentralValuationExaminerType
	examiner_email: string | null
	courses: CentralValuationCourseEntry[]
	last_email_status: 'SENT' | 'FAILED' | 'PENDING' | null
	last_email_sent_at: string | null
}
