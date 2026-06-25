/**
 * Hall Ticket Type Definitions
 *
 * These types define the structure for hall ticket generation.
 * Hall tickets show student exam schedules for a specific examination session.
 */

// Student exam subject entry
export interface HallTicketSubject {
	serial_number: number
	subject_code: string
	subject_name: string
	exam_date: string
	exam_time: string // e.g., "10:00 to 13:00FN" or "14:00 to 17:00AN"
	semester: string
	course_order?: number // Optional course order for sorting within semester
}

// Student hall ticket data
export interface HallTicketStudent {
	register_number: string
	student_name: string
	date_of_birth: string
	program: string
	emis?: string
	student_photo_url?: string
	subjects: HallTicketSubject[]
	semester_group?: string // Year group (e.g., "I Year", "II Year") for year-wise PDF grouping
}

// Institution header info for hall ticket
export interface HallTicketInstitution {
	institution_name: string
	institution_code: string
	accreditation_text?: string
	address?: string
	logo_url?: string
	secondary_logo_url?: string
	primary_color?: string
	secondary_color?: string
	coe_name?: string
	coe_qualifications?: string
	coe_contact?: string
}

// Examination session metadata
export interface HallTicketSession {
	session_code: string
	session_name: string
	exam_type?: string
	/** Heading prefix for the PDF, e.g. "SEMESTER EXAMINATION" or "SUPPLEMENTARY EXAMINATION" */
	exam_heading?: string
}

// Complete hall ticket data for PDF generation
export interface HallTicketData {
	institution: HallTicketInstitution
	session: HallTicketSession
	students: HallTicketStudent[]
	/** Optional: Pre-loaded logo images as base64 */
	logoImage?: string
	rightLogoImage?: string
}

// API request parameters for fetching hall ticket data
export interface HallTicketGenerationParams {
	institution_code: string
	examination_session_id: string
	program_id?: string
	semester_ids?: string[]
	student_ids?: string[]
}

// API response for hall ticket data
export interface HallTicketApiResponse {
	success: boolean
	data?: HallTicketData
	error?: string
	student_count?: number
}

// Form data for hall ticket generation page
export interface HallTicketFormData {
	institution_code: string
	examination_session_id: string
	program_id: string
	semester_ids: string[]
}

// Dropdown options
export interface InstitutionOption {
	id: string
	institution_code: string
	name: string
}

export interface ExaminationSessionOption {
	id: string
	session_code: string
	session_name: string
	institutions_id?: string
}

export interface ProgramOption {
	id: string
	program_code: string
	program_name: string
	institutions_id?: string
}

export interface SemesterOption {
	id: string
	semester_code: string
	semester_name: string
	program_id?: string
}

// PDF Institution settings (extends the existing pattern)
export interface HallTicketPdfSettings {
	institution_name: string
	institution_code: string
	accreditation_text?: string
	address?: string
	logo_url?: string
	logo_width?: string
	logo_height?: string
	secondary_logo_url?: string
	secondary_logo_width?: string
	secondary_logo_height?: string
	primary_color?: string
	secondary_color?: string
}
