/**
 * Pass Percentage Report Types
 *
 * Used by the Pass Percentage Report page under Grading module.
 * Data source: final_marks (same logic as Galley Report Course Analysis)
 * Grouping: Course → Programme rows
 */

export interface PassPercentageProgramRow {
	semester: number
	program_code: string
	program_name: string
	total_students: number
	appeared: number
	passed: number
	pass_percentage: number
}

export interface PassPercentageCourse {
	course_code: string
	course_name: string
	semester: number
	course_order?: number
	programs: PassPercentageProgramRow[]
}

export interface PassPercentageReport {
	institution: { id: string; name: string; code: string }
	session: { id: string; name: string; code: string }
	report_type: 'board' | 'program'
	board?: { id: string; board_code: string; board_name: string; board_type: string }
	program?: { program_code: string; program_name: string }
	courses: PassPercentageCourse[]
	generated_at: string
}

export interface BoardOption {
	id: string
	board_code: string
	board_name: string
	board_type: string
}

export interface ProgramOption {
	id: string
	program_code: string
	program_name: string
	program_type: string // 'UG' | 'PG'
}

export interface SessionOption {
	id: string
	session_code: string
	session_name: string
}
