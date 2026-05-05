/**
 * Bundle Numbers Type Definitions
 *
 * Bundle numbers are board-wise running sequence numbers per
 * (institution, examination_session, course). Generated from the
 * Answer Sheet Packets > Bundle Numbers tab using the same sort
 * order as the Board Wise Regular/Arrear Count report.
 */

export interface BundleNumber {
	id: string
	institutions_id: string
	examination_session_id: string
	course_id: string
	bundle_number: number
	is_active: boolean
	remarks?: string | null
	created_at: string
	updated_at: string
	created_by?: string | null
	updated_by?: string | null
}

export interface BundleNumberDetailView {
	id: string
	bundle_number: number
	is_active: boolean
	remarks?: string | null
	created_at: string
	updated_at: string

	// Institution
	institutions_id: string
	institution_code: string
	institution_name: string

	// Examination Session
	examination_session_id: string
	session_code: string
	session_name: string

	// Course
	course_id: string
	course_code: string
	course_name: string | null
	course_category: string | null
	board_code: string | null
	board_id: string | null
	board_name: string | null
	board_order: number | null

	// Audit
	created_by_name?: string | null
	updated_by_name?: string | null
	created_by?: string | null
	updated_by?: string | null
}

export interface BundleNumberGenerationRequest {
	institution_code: string
	exam_session: string
	start_number: number
}

export interface BundleNumberGenerationResult {
	success: boolean
	message: string
	created: number
	skipped: number
	start_number: number
	next_number: number
	details: Array<{
		course_code: string
		course_name: string | null
		board_code: string | null
		bundle_number: number | null
		status: 'created' | 'skipped' | 'error'
		error?: string
	}>
}
