/**
 * MyJKKN API Adapter Service
 *
 * Adapts MyJKKN API responses to match COE frontend expectations.
 * This service normalizes paginated responses and maps field names
 * to ensure compatibility with existing COE pages.
 */

import type {
	MyJKKNPaginatedResponse,
	MyJKKNDepartment,
	MyJKKNProgram,
	MyJKKNRegulation,
	MyJKKNSemester,
	MyJKKNLearnerProfile,
	MyJKKNStaff,
} from '@/types/myjkkn'

// =====================================================
// ADAPTED TYPES FOR COE FRONTEND
// =====================================================

/**
 * COE-compatible Regulation type
 * Maps MyJKKN regulation fields to what COE pages expect
 */
export interface COERegulation {
	id: string
	regulation_code: string
	regulation_name: string
	regulation_year: number
	description?: string
	effective_year?: number
	end_year?: number
	institution_id: string
	institution_code?: string
	is_active: boolean
	status: boolean // Alias for is_active (COE uses 'status')
	created_at: string
	updated_at: string
	// COE-specific fields that may not exist in MyJKKN
	minimum_internal?: number
	minimum_external?: number
	minimum_attendance?: number
	minimum_total?: number
	maximum_internal?: number
	maximum_external?: number
	maximum_total?: number
	maximum_qp_marks?: number
	condonation_range_start?: number
	condonation_range_end?: number
}

/**
 * COE-compatible Department type
 */
export interface COEDepartment {
	id: string
	department_code: string
	department_name: string
	short_name?: string
	display_name?: string
	institution_id: string
	institution_code?: string
	head_of_department?: string
	email?: string
	phone?: string
	is_active: boolean
	status: boolean
	stream?: string
	department_order?: number
	created_at: string
	updated_at: string
}

/**
 * COE-compatible Program type
 */
export interface COEProgram {
	id: string
	program_code: string
	program_name: string
	short_name?: string
	display_name?: string
	institution_id: string
	institution_code?: string
	department_id?: string
	department_code?: string
	offering_department_code?: string
	degree_id?: string
	degree_code?: string
	duration_years?: number
	program_duration_yrs?: number
	total_semesters?: number
	program_type?: string
	pattern_type?: string
	program_order?: number
	is_active: boolean
	status: boolean
	created_at: string
	updated_at: string
}

/**
 * COE-compatible Semester type
 */
export interface COESemester {
	id: string
	semester_code?: string
	semester_name: string
	display_name?: string
	semester_number?: number
	semester_type?: string
	semester_group?: string
	display_order?: number
	initial_semester?: boolean
	terminal_semester?: boolean
	institution_id: string
	institution_code?: string
	program_id?: string
	program_code?: string
	is_active: boolean
	status: boolean
	created_at: string
	updated_at: string
}

/**
 * COE-compatible Learner type (replaces Student)
 */
export interface COELearner {
	id: string
	register_number: string
	roll_number?: string
	learner_name: string // Computed from first_name + last_name
	first_name: string
	last_name?: string
	middle_name?: string
	email?: string
	learner_email?: string
	phone?: string
	learner_mobile?: string
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
	status: boolean
	created_at: string
	updated_at: string
}

/**
 * COE-compatible Staff type
 */
export interface COEStaff {
	id: string
	staff_code: string
	staff_name: string // Computed from first_name + last_name
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
	status: boolean
	created_at: string
	updated_at: string
}

// =====================================================
// ADAPTER FUNCTIONS
// =====================================================

/**
 * Adapts MyJKKN Regulation to COE format
 */
export function adaptRegulation(myjkknReg: MyJKKNRegulation): COERegulation {
	return {
		id: myjkknReg.id,
		regulation_code: myjkknReg.regulation_code,
		regulation_name: myjkknReg.regulation_name,
		regulation_year: myjkknReg.effective_year || new Date().getFullYear(),
		description: myjkknReg.description,
		effective_year: myjkknReg.effective_year,
		end_year: myjkknReg.end_year,
		institution_id: myjkknReg.institution_id,
		institution_code: myjkknReg.institution_code,
		is_active: myjkknReg.is_active,
		status: myjkknReg.is_active, // COE uses 'status' as alias
		created_at: myjkknReg.created_at,
		updated_at: myjkknReg.updated_at,
		// COE-specific fields default to undefined
		minimum_internal: undefined,
		minimum_external: undefined,
		minimum_attendance: undefined,
		minimum_total: undefined,
		maximum_internal: undefined,
		maximum_external: undefined,
		maximum_total: undefined,
		maximum_qp_marks: undefined,
		condonation_range_start: undefined,
		condonation_range_end: undefined,
	}
}

/**
 * Adapts MyJKKN Department to COE format
 */
export function adaptDepartment(myjkknDept: MyJKKNDepartment): COEDepartment {
	return {
		id: myjkknDept.id,
		department_code: myjkknDept.department_code,
		department_name: myjkknDept.department_name,
		short_name: myjkknDept.short_name,
		display_name: myjkknDept.short_name || myjkknDept.department_name,
		institution_id: myjkknDept.institution_id,
		institution_code: myjkknDept.institution_code,
		head_of_department: myjkknDept.head_of_department,
		email: myjkknDept.email,
		phone: myjkknDept.phone,
		is_active: myjkknDept.is_active,
		status: myjkknDept.is_active,
		created_at: myjkknDept.created_at,
		updated_at: myjkknDept.updated_at,
	}
}

/**
 * Adapts MyJKKN Program to COE format
 */
export function adaptProgram(myjkknProg: MyJKKNProgram): COEProgram {
	// MyJKKN programs API may return different shapes:
	// - Legacy: flat fields with program_code, institution_code, etc.
	// - New: program_id/program_name with nested institution{ counselling_code }, degree, department
	const anyProg = myjkknProg as MyJKKNProgram & Record<string, any>

	const programCode = anyProg.program_code || anyProg.program_id
	const institutionCode =
		anyProg.institution_code ||
		anyProg.institution?.counselling_code ||
		anyProg.institution?.institution_code
	const departmentCode =
		anyProg.department_code || anyProg.department?.department_code
	const degreeCode = anyProg.degree_code || anyProg.degree?.degree_id
	const durationYears = anyProg.duration_years || anyProg.program_duration_yrs
	const totalSemesters = anyProg.total_semesters
	const programType = anyProg.program_type
	const programOrder = anyProg.program_order

	return {
		id: anyProg.id,
		program_code: programCode,
		program_name: anyProg.program_name,
		short_name: anyProg.short_name,
		display_name: anyProg.short_name || anyProg.program_name || programCode,
		institution_id: anyProg.institution_id,
		institution_code: institutionCode,
		department_id: anyProg.department_id,
		department_code: departmentCode,
		offering_department_code: departmentCode,
		degree_id: anyProg.degree_id,
		degree_code: degreeCode,
		duration_years: durationYears,
		program_duration_yrs: durationYears,
		total_semesters: totalSemesters,
		program_type: programType,
		pattern_type: 'Semester', // Default
		program_order: programOrder,
		is_active: anyProg.is_active,
		status: anyProg.is_active,
		created_at: anyProg.created_at,
		updated_at: anyProg.updated_at,
	}
}

/**
 * Adapts MyJKKN Semester to COE format
 */
export function adaptSemester(myjkknSem: MyJKKNSemester): COESemester {
	return {
		id: myjkknSem.id,
		semester_code: myjkknSem.semester_code,
		semester_name: myjkknSem.semester_name,
		display_name: myjkknSem.semester_name,
		semester_number: myjkknSem.semester_number,
		display_order: myjkknSem.semester_number,
		institution_id: myjkknSem.institution_id,
		institution_code: myjkknSem.institution_code,
		program_id: myjkknSem.program_id,
		program_code: myjkknSem.program_code,
		is_active: myjkknSem.is_active,
		status: myjkknSem.is_active,
		created_at: myjkknSem.created_at,
		updated_at: myjkknSem.updated_at,
	}
}

/**
 * Adapts MyJKKN LearnerProfile to COE Learner format
 * Handles enriched data from API (with institution_code, program_code, etc. already resolved)
 */
export function adaptLearner(myjkknLearner: MyJKKNLearnerProfile & Record<string, unknown>): COELearner {
	const fullName = [myjkknLearner.first_name, myjkknLearner.middle_name, myjkknLearner.last_name]
		.filter(Boolean)
		.join(' ')

	// Get enriched fields (already resolved by API route)
	const l = myjkknLearner as Record<string, unknown>

	// Extract email (may be college_email, student_email, or email - enriched by API)
	const email = (l.email || l.college_email || l.student_email || '') as string

	// Extract phone (may be phone or student_mobile - enriched by API)
	const phone = (l.phone || l.student_mobile || '') as string

	// Extract address from permanent_address fields
	const address = (l.address || l.permanent_address_street || '') as string
	const city = (l.city || l.permanent_address_district || '') as string
	const state = (l.state || l.permanent_address_state || '') as string
	const pincode = (l.pincode || l.permanent_address_pin_code || '') as string

	return {
		id: myjkknLearner.id,
		register_number: myjkknLearner.register_number,
		roll_number: myjkknLearner.roll_number,
		learner_name: fullName,
		first_name: myjkknLearner.first_name,
		last_name: myjkknLearner.last_name,
		middle_name: myjkknLearner.middle_name,
		email: email,
		learner_email: email,
		phone: phone,
		learner_mobile: phone,
		date_of_birth: myjkknLearner.date_of_birth,
		gender: myjkknLearner.gender,
		address: address,
		city: city,
		state: state,
		country: (l.country || 'India') as string,
		pincode: pincode,
		father_name: myjkknLearner.father_name,
		mother_name: myjkknLearner.mother_name,
		guardian_name: myjkknLearner.guardian_name,
		aadhar_number: myjkknLearner.aadhar_number,
		abc_id: myjkknLearner.abc_id,
		// Use enriched fields from API
		institution_id: myjkknLearner.institution_id,
		institution_code: (l.institution_code || '') as string,
		program_id: myjkknLearner.program_id,
		program_code: (l.program_code || '') as string,
		department_id: myjkknLearner.department_id,
		department_code: (l.department_code || '') as string,
		batch_id: myjkknLearner.batch_id,
		batch_name: (l.batch_name || '') as string,
		current_semester: (l.current_semester || null) as number | undefined,
		admission_year: myjkknLearner.admission_year,
		is_active: (l.is_active ?? l.is_profile_complete ?? true) as boolean,
		status: (l.is_active ?? l.is_profile_complete ?? true) as boolean,
		created_at: myjkknLearner.created_at,
		updated_at: myjkknLearner.updated_at,
	}
}

/**
 * Adapts MyJKKN Staff to COE format
 */
export function adaptStaff(myjkknStaff: MyJKKNStaff): COEStaff {
	const fullName = [myjkknStaff.first_name, myjkknStaff.middle_name, myjkknStaff.last_name]
		.filter(Boolean)
		.join(' ')

	return {
		id: myjkknStaff.id,
		staff_code: myjkknStaff.staff_code,
		staff_name: fullName,
		first_name: myjkknStaff.first_name,
		last_name: myjkknStaff.last_name,
		middle_name: myjkknStaff.middle_name,
		email: myjkknStaff.email,
		phone: myjkknStaff.phone,
		designation: myjkknStaff.designation,
		department_id: myjkknStaff.department_id,
		department_code: myjkknStaff.department_code,
		institution_id: myjkknStaff.institution_id,
		institution_code: myjkknStaff.institution_code,
		date_of_joining: myjkknStaff.date_of_joining,
		qualification: myjkknStaff.qualification,
		specialization: myjkknStaff.specialization,
		is_active: myjkknStaff.is_active,
		status: myjkknStaff.is_active,
		created_at: myjkknStaff.created_at,
		updated_at: myjkknStaff.updated_at,
	}
}

// =====================================================
// BATCH ADAPTER FUNCTIONS
// =====================================================

/**
 * Adapts an array of MyJKKN Regulations to COE format
 */
export function adaptRegulations(myjkknRegs: MyJKKNRegulation[]): COERegulation[] {
	return myjkknRegs.map(adaptRegulation)
}

/**
 * Adapts an array of MyJKKN Departments to COE format
 */
export function adaptDepartments(myjkknDepts: MyJKKNDepartment[]): COEDepartment[] {
	return myjkknDepts.map(adaptDepartment)
}

/**
 * Adapts an array of MyJKKN Programs to COE format
 */
export function adaptPrograms(myjkknProgs: MyJKKNProgram[]): COEProgram[] {
	return myjkknProgs.map(adaptProgram)
}

/**
 * Adapts an array of MyJKKN Semesters to COE format
 */
export function adaptSemesters(myjkknSems: MyJKKNSemester[]): COESemester[] {
	return myjkknSems.map(adaptSemester)
}

/**
 * Adapts an array of MyJKKN LearnerProfiles to COE format
 */
export function adaptLearners(myjkknLearners: MyJKKNLearnerProfile[]): COELearner[] {
	return myjkknLearners.map(adaptLearner)
}

/**
 * Adapts an array of MyJKKN Staff to COE format
 */
export function adaptStaffList(myjkknStaffList: MyJKKNStaff[]): COEStaff[] {
	return myjkknStaffList.map(adaptStaff)
}

// =====================================================
// RESPONSE EXTRACTORS
// =====================================================

/**
 * Extracts data array from MyJKKN paginated response
 */
export function extractDataFromResponse<T>(response: MyJKKNPaginatedResponse<T>): T[] {
	return response.data || []
}

/**
 * Extracts metadata from MyJKKN paginated response
 */
export function extractMetadata(response: MyJKKNPaginatedResponse<unknown>) {
	return {
		page: response.metadata.page,
		totalPages: response.metadata.totalPages,
		total: response.metadata.total,
		limit: response.metadata.limit,
	}
}
