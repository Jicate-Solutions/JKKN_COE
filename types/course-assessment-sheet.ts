/**
 * Course Assessment Sheet Type Definitions
 *
 * One course (entered by code) is taken by many programmes. Each programme gets
 * its own PDF: a blank attendance sheet first, then a blank mark entry sheet.
 */

export interface CourseSheetLearner {
	serial_number: number
	register_number: string
	learner_name: string
}

export interface CourseSheetProgram {
	program_code: string
	program_name: string
	program_order: number
	semester: number | null
	/** e.g. "II-B.A. ENGLISH" */
	class_label: string
	learners: CourseSheetLearner[]
}

export interface CourseSheetData {
	institution_name: string
	institution_code: string
	session_name: string
	session_code: string
	course_code: string
	course_title: string
	logo_image: string | null
	right_logo_image: string | null
	programs: CourseSheetProgram[]
}

export interface CourseSheetApiResponse {
	success: boolean
	data?: CourseSheetData
	total_programs?: number
	total_learners?: number
	error?: string
}

/** One assessment column on the mark entry sheet, e.g. Report / 40 */
export interface CourseSheetComponent {
	label: string
	max_marks: number
}

export interface CourseSheetPdfOptions {
	/** Blank columns under "Attendance" on the attendance sheet */
	attendance_columns: number
	components: CourseSheetComponent[]
	signatories: string[]
}

export const DEFAULT_COURSE_SHEET_OPTIONS: CourseSheetPdfOptions = {
	attendance_columns: 10,
	components: [
		{ label: 'Report', max_marks: 40 },
		{ label: 'Attendance', max_marks: 20 },
		{ label: 'Activities', max_marks: 40 },
	],
	signatories: ['Mentor', 'Directress of Physical Education', 'HOD', 'Principal'],
}
