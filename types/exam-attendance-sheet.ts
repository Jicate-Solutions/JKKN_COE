/**
 * Exam Attendance Sheet Type Definitions
 *
 * Types for the pre-exam attendance sheet PDF generation.
 * Each sheet represents one (program + subject) combination for a given exam date & session.
 */

/**
 * Student entry in the attendance sheet
 */
export interface AttendanceSheetStudent {
	serial_number: number
	register_number: string
	student_name: string
	student_photo_url?: string | null
	is_regular: boolean
	attempt_number?: number
}

/**
 * A single attendance sheet (one per program + subject combo)
 */
export interface AttendanceSheet {
	sheet_number: number
	total_sheets: number
	program_code: string
	program_name: string
	program_order: number
	semester: number
	course_code: string
	course_title: string
	exam_date: string
	session: string // FN or AN
	students: AttendanceSheetStudent[]
}

/**
 * Full data payload for generating the attendance sheet PDF
 */
export interface AttendanceSheetPdfData {
	institution_name: string
	institution_code: string
	session_name: string
	session_code: string
	exam_date: string
	session_type: string // FN or AN
	exam_type?: string // 'Theory' | 'Practical' — changes signature labels
	/** Heading prefix, e.g. "SEMESTER EXAMINATION" or "SUPPLEMENTARY EXAMINATION" */
	exam_heading?: string
	logo_image?: string | null
	right_logo_image?: string | null
	sheets: AttendanceSheet[]
}

/**
 * API response from the bulk endpoint
 */
export interface AttendanceSheetApiResponse {
	success: boolean
	data: AttendanceSheetPdfData
	total_sheets: number
	total_students: number
}
