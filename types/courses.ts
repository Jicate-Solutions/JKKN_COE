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
	syllabus_pdf_url?: string
	description?: string
	course_level: string
	is_active: boolean
	created_at: string
	updated_at: string
	// Required fields for marks and hours
	class_hours: number
	theory_hours: number
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
