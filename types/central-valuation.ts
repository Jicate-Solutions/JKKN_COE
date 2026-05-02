export interface BoardValuationWindow {
	id: string
	institutions_id: string
	examination_session_id: string
	board_code: string
	board_name: string | null
	from_date: string  // ISO YYYY-MM-DD
	to_date: string
	created_at?: string
	updated_at?: string
}

export interface CourseValuationDate {
	id: string
	institutions_id: string
	examination_session_id: string
	course_id: string
	board_code: string
	valuation_date: string
}

export interface CentralValuationBoardRow {
	board_code: string
	board_name: string
	board_type: string | null
	board_order: number
	course_count: number
	window?: BoardValuationWindow | null
}

export interface InternalStaff {
	staff_id: string
	staff_name: string
	staff_email: string | null
	staff_mobile: string | null
	staff_designation: string | null
	staff_department: string | null
}

export interface ExternalExaminer {
	examiner_id: string           // uuid from external_examiners.id
	full_name: string
	email: string | null
	mobile: string | null
	designation: string | null
	department: string | null
	institution_name: string | null
}

export interface CentralValuationAllotmentRow {
	// Packet identity
	packet_id: string
	packet_no: string
	packet_index: number
	total_packets: number
	// Course identity (shared across packets of the same course)
	course_id: string
	course_code: string
	course_name: string
	board_code: string
	board_name: string
	// Per-packet date and sheet count
	valuation_date: string | null
	sheet_count: number
	// Per-packet examiners
	internal_examiner: InternalStaff | null
	external_examiner: ExternalExaminer | null
	chief_examiner: InternalStaff | null
	assistant_examiner: InternalStaff | null
	status: 'Not Assigned' | 'Paper Evaluator Set' | 'Fully Allotted'
}

export interface CentralValuationAllotmentSavePayload {
	institutions_id: string
	examination_session_id: string
	packet_id: string
	internal_examiner_staff_id: string | null
	external_examiner_id: string | null
	chief_examiner_staff_id: string | null
	assistant_examiner_staff_id: string | null
}
