// Workflow state of a course definition
// Default 'Pending'; once 'Locked' the UI must warn before allowing change.
export type CourseStatus = 'Pending' | 'BOS Approved' | 'Locked'

export const COURSE_STATUS_OPTIONS: { value: CourseStatus; label: string }[] = [
	{ value: 'Pending', label: 'Pending' },
	{ value: 'BOS Approved', label: 'BOS Approved' },
	{ value: 'Locked', label: 'Locked' }
]

// Values allowed in courses.course_category — the Theory/Practical distinction.
// Single source of truth for the /master/courses "Course Category" picker and for
// IA paper-template applicability (lib/ia/course-type-applicability.ts).
export const COURSE_CATEGORIES = [
	'Theory',
	'Practical',
	'Project',
	'Non Academic',
	'Theory + Practical',
	'Theory + Project',
	'Field Work',
	'Community Service',
	'Group Project',
] as const
export type CourseCategory = typeof COURSE_CATEGORIES[number]

// Roman numerals I..XX — stored in courses.course_level. Combined with
// course_info.display_code by a DB trigger to form courses.course_type_code.
export const COURSE_LEVELS = [
	'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
	'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
] as const
export type CourseLevel = typeof COURSE_LEVELS[number]

// Row from `course_info` master table that drives the Course Type dropdown.
export interface CourseInfo {
	id: string
	course_type: string
	display_code: string
	description?: string | null
	sort_order: number
	status: boolean
	created_at: string
	updated_at: string
}

// Course type definition
export interface Course {
	id: string
	institutions_id?: string
	regulation_id?: string
	offering_department_id?: string
	institution_code?: string
	regulation_code?: string
	offering_department_code?: string
	board_code?: string
	course_code: string
	course_title: string
	display_code?: string
	course_category?: string
	course_type: string
	course_level?: string | null
	course_type_code?: string | null
	course_part_master?: string
	credits: number
	split_credit?: boolean
	theory_credit?: number
	practical_credit?: number
	qp_code?: string
	e_code_name?: string
	exam_duration?: number
	evaluation_type?: string
	result_type?: string
	credit_included?: boolean
	self_study_course?: boolean
	outside_class_course?: boolean
	open_book?: boolean
	online_course?: boolean
	dummy_number_required?: boolean
	annual_course?: boolean
	multiple_qp_set?: boolean
	no_of_qp_setter?: number
	no_of_scrutinizer?: number
	fee_exception?: boolean
	has_hall_ticket?: boolean
	syllabus_pdf_url?: string
	description?: string
	is_active: boolean
	created_at: string
	updated_at: string
	// Required fields for marks and hours
	class_hours: number
	theory_hours: number
	tutorial_hours?: number
	practical_hours: number
	internal_max_mark: number
	internal_pass_mark: number
	internal_converted_mark: number
	external_max_mark: number
	external_pass_mark: number
	external_converted_mark: number
	total_pass_mark: number
	total_max_mark: number
	annual_semester: boolean
	registration_based: boolean
	courses_status: CourseStatus
	programs?: {
		id: string
		program_name: string
		program_code: string
	}
	departments?: {
		id: string
		department_name: string
	}
	course_coordinator?: {
		id: string
		full_name: string
		email: string
	}
}

export interface CourseFormData extends Omit<Course, 'id' | 'created_at' | 'updated_at'> {}

export interface CourseImportError {
	row: number
	course_code: string
	course_title: string
	errors: string[]
}

export interface UploadSummary {
	total: number
	success: number
	failed: number
}
