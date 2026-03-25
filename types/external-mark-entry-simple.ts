/**
 * Simplified External Mark Entry Type Definitions
 * Uses answer_sheet_packets_detail_view directly
 */

export interface AnswerSheetPacket {
	id: string
	packet_no: string
	barcode: string | null
	total_sheets: number
	packet_status: string

	// Institution
	institutions_id: string
	institution_code: string
	institution_name: string

	// Session
	examination_session_id: string
	session_code: string
	session_name: string

	// Course
	course_id: string
	course_code: string
	course_name: string
	course_title: string
	course_type: string | null

	// Metadata
	created_at: string
	updated_at: string
}

export interface StudentMarkEntry {
	student_dummy_number_id: string
	exam_registration_id: string
	dummy_number: string
	actual_register_number: string
	total_marks_obtained: number | null
	total_marks_in_words: string
	remarks: 'PASS' | 'FAIL' | ''
	existing_entry_id?: string
}

export interface MarkEntrySaveRequest {
	institutions_id: string
	examination_session_id: string
	program_id: string
	course_id: string
	packet_no: string
	marks_out_of: number
	marks: Array<{
		student_dummy_number_id: string
		exam_registration_id: string
		dummy_number: string
		total_marks_obtained: number
		total_marks_in_words: string
		remarks: 'PASS' | 'FAIL'
	}>
}
