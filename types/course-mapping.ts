// Course Mapping type definitions
export interface CourseMapping {
	id?: string
	course_id: string
	institution_code: string
	program_code: string
	regulation_code: string
	regulation_id?: string
	semester_code: string
	course_group?: string
	course_category?: string
	course_order?: number
	internal_max_mark?: number
	internal_pass_mark?: number
	internal_converted_mark?: number
	external_max_mark?: number
	external_pass_mark?: number
	total_pass_mark?: number
	total_max_mark?: number
	annual_semester?: boolean
	registration_based?: boolean
	is_active?: boolean
	created_at?: string
}

export interface Semester {
	id: string
	semester_code: string
	semester_name: string
	semester_number: number
	semester_order?: number
	program_id?: string
}

export interface SemesterTableData {
	semester: Semester
	mappings: CourseMapping[]
	isOpen: boolean
}

export interface Institution {
	id: string
	institution_code: string
	name: string
}

export interface Program {
	id: string
	program_code: string
	program_name: string
	offering_department_code?: string
	institutions_id?: string
}

export interface Course {
	id: string
	course_code: string
	course_title: string
	institution_code?: string
	offering_department_code?: string
	regulation_code?: string
}

export interface Regulation {
	id: string | number
	regulation_code: string
	regulation_year: number
	institution_code?: string
}

export interface CourseMappingImportError {
	row: number
	semester_code: string
	course_code: string
	errors: string[]
}

export interface UploadSummary {
	total: number
	success: number
	failed: number
}

export const COURSE_GROUPS = [
	{ value: "General", label: "General" },
	{ value: "Elective - I", label: "Elective - I" },
	{ value: "Elective - II", label: "Elective - II" },
	{ value: "Elective - III", label: "Elective - III" },
	{ value: "Elective - IV", label: "Elective - IV" },
	{ value: "Elective - V", label: "Elective - V" },
	{ value: "Elective - VI", label: "Elective - VI" }
] as const
