// Course Count Report type definitions
// Used for generating question paper preparation count reports

/**
 * Individual course count record grouped by program
 */
export interface CourseCountRecord {
	program_code: string
	program_name: string
	program_order: number
	course_code: string
	course_title: string
	board_code: string | null
	board_name: string | null
	regular_count: number
	arrear_count: number
	total_count: number
}

/**
 * Program-wise summary with courses
 */
export interface ProgramCourseCount {
	program_code: string
	program_name: string
	program_order: number
	courses: CourseCountRecord[]
	program_total_regular: number
	program_total_arrear: number
	program_total: number
}

/**
 * Board-wise summary
 */
export interface BoardCourseCount {
	board_code: string
	board_name: string
	programs: ProgramCourseCount[]
	board_total_regular: number
	board_total_arrear: number
	board_total: number
}

/**
 * API response for course count report
 */
export interface CourseCountReportData {
	metadata: {
		institution_id: string
		institution_name: string
		institution_code: string
		examination_session_id: string
		session_name: string
		session_code: string
		report_generated_at: string
	}
	// Raw records for filtering/display
	records: CourseCountRecord[]
	// Grouped by program
	program_wise: ProgramCourseCount[]
	// Grouped by board
	board_wise: BoardCourseCount[]
	// Overall totals
	summary: {
		total_programs: number
		total_courses: number
		total_regular: number
		total_arrear: number
		grand_total: number
	}
}

/**
 * PDF generation input data
 */
export interface CourseCountPDFData {
	metadata: CourseCountReportData['metadata']
	// Can be program_wise or board_wise based on view
	data: ProgramCourseCount[] | BoardCourseCount[]
	view_type: 'program' | 'board'
	summary: CourseCountReportData['summary']
	logoImage?: string
	rightLogoImage?: string
	institutionSettings?: InstitutionPdfSettings
}

/**
 * Institution PDF Settings (from pdf_institution_settings table)
 */
export interface InstitutionPdfSettings {
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
	font_family?: string
	font_size_heading?: string
	font_size_body?: string
}

/**
 * Excel export options
 */
export interface CourseCountExcelOptions {
	view_type: 'program' | 'board'
	include_summary: boolean
	include_detailed: boolean
}
