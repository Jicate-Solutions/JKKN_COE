/**
 * MyJKKN API Type Definitions
 *
 * Types for integrating with the MyJKKN external API (jkkn.ai)
 */

// =====================================================
// PAGINATION & RESPONSE TYPES
// =====================================================

export interface MyJKKNPaginatedResponse<T> {
	data: T[]
	metadata: {
		page: number
		totalPages: number
		total: number
		limit?: number
		returned?: number
	}
}

export interface MyJKKNSingleResponse<T> {
	data: T
}

// =====================================================
// ENTITY TYPES
// =====================================================

export interface MyJKKNInstitution {
	id: string
	institution_code: string
	name: string
	short_name?: string
	address?: string
	city?: string
	state?: string
	country?: string
	pincode?: string
	phone?: string
	email?: string
	website?: string
	logo_url?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNDepartment {
	id: string
	department_code: string
	department_name: string
	short_name?: string
	institution_id: string
	institution_code?: string
	head_of_department?: string
	email?: string
	phone?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNProgram {
	id: string
	program_code: string
	program_name: string
	short_name?: string
	institution_id: string
	institution_code?: string
	department_id?: string
	department_code?: string
	degree_id?: string
	degree_code?: string
	duration_years?: number
	total_semesters?: number
	program_type?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNDegree {
	id: string
	degree_code: string
	degree_name: string
	short_name?: string
	degree_level?: string
	institution_id: string
	institution_code?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNCourse {
	id: string
	course_code: string
	course_name: string
	course_title?: string
	short_name?: string
	institution_id: string
	institution_code?: string
	department_id?: string
	department_code?: string
	credit?: number
	course_type?: string
	course_category?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNSemester {
	id: string
	semester_code: string
	semester_name: string
	semester_number?: number
	institution_id: string
	institution_code?: string
	program_id?: string
	program_code?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNStudent {
	id: string
	register_number: string
	roll_number?: string
	first_name: string
	last_name?: string
	middle_name?: string
	email?: string
	phone?: string
	date_of_birth?: string
	gender?: string
	address?: string
	city?: string
	state?: string
	country?: string
	pincode?: string
	father_name?: string
	mother_name?: string
	guardian_name?: string
	aadhar_number?: string
	abc_id?: string
	institution_id: string
	institution_code?: string
	program_id?: string
	program_code?: string
	department_id?: string
	department_code?: string
	batch_id?: string
	batch_name?: string
	current_semester?: number
	admission_year?: number
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNStaff {
	id: string
	staff_code: string
	first_name: string
	last_name?: string
	middle_name?: string
	email?: string
	phone?: string
	designation?: string
	department_id?: string
	department_code?: string
	institution_id: string
	institution_code?: string
	date_of_joining?: string
	qualification?: string
	specialization?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNRegulation {
	id: string
	regulation_code: string
	regulation_name: string
	description?: string
	effective_year?: number
	end_year?: number
	institution_id: string
	institution_code?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNBatch {
	id: string
	batch_code: string
	batch_name: string
	start_year?: number
	end_year?: number
	institution_id: string
	institution_code?: string
	program_id?: string
	program_code?: string
	regulation_id?: string
	regulation_code?: string
	is_active: boolean
	created_at: string
	updated_at: string
}

export interface MyJKKNLearnerProfile {
	id: string
	register_number: string
	roll_number?: string
	first_name: string
	last_name?: string
	middle_name?: string
	email?: string
	phone?: string
	date_of_birth?: string
	gender?: string
	address?: string
	city?: string
	state?: string
	country?: string
	pincode?: string
	father_name?: string
	mother_name?: string
	guardian_name?: string
	aadhar_number?: string
	abc_id?: string
	institution_id: string
	institution_code?: string
	program_id?: string
	program_code?: string
	department_id?: string
	department_code?: string
	batch_id?: string
	batch_name?: string
	current_semester?: number
	admission_year?: number
	is_active: boolean
	created_at: string
	updated_at: string
	// Photo fields - API may use different field names
	student_photo_url?: string
	photo_url?: string
	profile_photo?: string
	image_url?: string
	// Additional fields from external API
	college_email?: string
	student_email?: string
	student_mobile?: string
	is_profile_complete?: boolean
}

// =====================================================
// FETCH OPTIONS TYPES
// =====================================================

export interface MyJKKNBaseFetchOptions {
	page?: number
	limit?: number
	search?: string
	is_active?: boolean
	all?: boolean
}

export interface MyJKKNInstitutionFetchOptions extends MyJKKNBaseFetchOptions {
	// Institution-specific filters
}

export interface MyJKKNDepartmentFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
}

export interface MyJKKNProgramFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
	department_id?: string
	department_code?: string
	degree_id?: string
	degree_code?: string
}

export interface MyJKKNDegreeFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
	degree_level?: string
}

export interface MyJKKNCourseFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
	department_id?: string
	department_code?: string
	course_type?: string
}

export interface MyJKKNSemesterFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
	program_id?: string
	program_code?: string
}

export interface MyJKKNStudentFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
	program_id?: string
	program_code?: string
	department_id?: string
	department_code?: string
	batch_id?: string
	current_semester?: number
	admission_year?: number
}

export interface MyJKKNStaffFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
	department_id?: string
	department_code?: string
	designation?: string
}

export interface MyJKKNRegulationFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
	effective_year?: number
}

export interface MyJKKNBatchFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
	program_id?: string
	program_code?: string
	regulation_id?: string
	regulation_code?: string
	start_year?: number
}

export interface MyJKKNLearnerProfileFetchOptions extends MyJKKNBaseFetchOptions {
	institution_id?: string
	institution_code?: string
	program_id?: string
	program_code?: string
	department_id?: string
	department_code?: string
	batch_id?: string
	current_semester?: number
	admission_year?: number
}

// =====================================================
// API ENDPOINT MAPPING
// =====================================================

export type MyJKKNEntityType =
	| 'institutions'
	| 'departments'
	| 'programs'
	| 'degrees'
	| 'courses'
	| 'semesters'
	| 'regulations'
	| 'batches'
	| 'students'
	| 'learner-profiles'
	| 'staff'

export const MYJKKN_API_ENDPOINTS: Record<MyJKKNEntityType, string> = {
	institutions: '/api-management/organizations/institutions',
	departments: '/api-management/organizations/departments',
	programs: '/api-management/organizations/programs',
	degrees: '/api-management/organizations/degrees',
	courses: '/api-management/organizations/courses',
	semesters: '/api-management/organizations/semesters',
	regulations: '/api-management/academic/regulations',
	batches: '/api-management/academic/batches',
	students: '/api-management/students',
	'learner-profiles': '/api-management/learners/profiles',
	staff: '/api-management/staff',
}
