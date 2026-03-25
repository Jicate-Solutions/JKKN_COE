// Comprehensive Learner type based on full schema
// JKKN Terminology: "Learner" (not "Student") per institutional standards
export type Learner = {
	// PRIMARY IDENTIFIERS
	id: string
	application_id?: string
	admission_id?: string
	roll_number: string
	register_number?: string

	// BASIC INFORMATION
	first_name: string
	last_name?: string
	initial?: string
	full_name?: string
	name_in_tamil?: string
	date_of_birth: string
	age?: number
	gender: string
	blood_group?: string

	// CONTACT INFORMATION
	learner_mobile?: string
	learner_email?: string
	college_email?: string
	telephone_number?: string

	// PERMANENT ADDRESS
	permanent_address_door_no?: string
	permanent_address_street?: string
	permanent_address_village?: string
	permanent_address_post_office?: string
	permanent_address_taluk?: string
	permanent_address_district?: string
	permanent_address_state?: string
	permanent_address_country?: string
	permanent_address_pin_code?: string

	// ACADEMIC ASSIGNMENT
	institution_id: string
	institution_code?: string
	degree_id?: string
	degree_code?: string
	department_id: string
	department_code?: string
	program_id: string
	program_code?: string
	semester_id: string
	semester_code?: string
	section_id?: string
	section_code?: string
	academic_year_id: string
	academic_year?: string
	batch_year?: number

	// DEMOGRAPHICS
	nationality: string
	religion?: string
	community?: string
	caste?: string
	sub_caste?: string
	aadhar_number?: string
	emis_number?: string

	// SPECIAL STATUS & CATEGORIES
	first_graduate: boolean
	quota?: string
	category?: string
	disability_type?: string
	disability_percentage?: number
	sports_quota?: string
	ncc_number?: string
	nss_number?: string

	// FAMILY DETAILS
	father_name?: string
	father_occupation?: string
	father_education?: string
	father_mobile?: string
	father_email?: string
	mother_name?: string
	mother_occupation?: string
	mother_education?: string
	mother_mobile?: string
	mother_email?: string
	guardian_name?: string
	guardian_relation?: string
	guardian_mobile?: string
	guardian_email?: string
	annual_income?: number

	// 10TH STANDARD
	tenth_last_school?: string
	tenth_board_of_study?: string
	tenth_school_type?: string
	tenth_school_name?: string
	tenth_school_place?: string
	tenth_board?: string
	tenth_mode?: string
	tenth_medium?: string
	tenth_register_number?: string
	tenth_passing_month?: string
	tenth_passing_year?: number
	tenth_marks?: any // JSONB

	// 11TH STANDARD
	eleventh_last_school?: string
	eleventh_school_type?: string
	eleventh_school_name?: string
	eleventh_school_place?: string
	eleventh_board?: string
	eleventh_mode?: string
	eleventh_medium?: string
	eleventh_register_number?: string
	eleventh_passing_month?: string
	eleventh_passing_year?: number
	eleventh_marks?: any // JSONB

	// 12TH STANDARD
	twelfth_last_school?: string
	twelfth_school_type?: string
	twelfth_school_name?: string
	twelfth_school_place?: string
	twelfth_board?: string
	twelfth_mode?: string
	twelfth_medium?: string
	twelfth_register_number?: string
	twelfth_passing_month?: string
	twelfth_passing_year?: number
	twelfth_marks?: any // JSONB
	twelfth_subject_marks?: any // JSONB

	// ENTRANCE EXAM
	entry_type?: string
	medical_cutoff_marks?: number
	engineering_cutoff_marks?: number
	neet_roll_number?: string
	neet_score?: number
	counseling_applied?: boolean
	counseling_number?: string

	// UG DEGREE (for PG students)
	qualifying_degree?: string
	ug_last_college?: string
	ug_university?: string
	ug_passing_month?: string
	ug_passing_year?: number
	ug_qualification_type?: string
	ug_education_pattern?: string
	ug_major_marks?: number
	ug_major_max_marks?: number
	ug_major_percentage?: number
	ug_allied_marks?: number
	ug_allied_max_marks?: number
	ug_allied_percentage?: number
	ug_total_marks?: number
	ug_total_max_marks?: number
	ug_total_percentage?: number
	ug_class_obtained?: string
	ug_overall_grade?: string

	// ACCOMMODATION & TRANSPORT
	accommodation_type?: string
	hostel_type?: string
	food_type?: string
	bus_required?: boolean
	bus_route?: string
	bus_pickup_location?: string
	is_hostelite: boolean
	is_bus_user: boolean

	// FINANCIAL DETAILS
	bank_beneficiary_name?: string
	bank_account_number?: string
	bank_ifsc_code?: string
	bank_name?: string
	bank_branch?: string
	fixed_fee?: number
	fee_payment_date?: string
	fee_amount_paid?: number

	// DOCUMENTS & CERTIFICATES
	original_certificates_submitted?: any // JSONB array
	xerox_certificates_submitted?: any // JSONB array

	// REFERENCE
	reference_type?: string
	reference_name?: string
	reference_contact?: string

	// MEDIA
	learner_photo_url?: string
	photo_url?: string

	// STATUS & FLAGS
	status: string
	admission_status?: string
	is_profile_complete: boolean

	// AUDIT FIELDS
	created_at: string
	updated_at?: string
	created_by?: string
	updated_by?: string
	deleted_at?: string
	deleted_by?: string
}

export interface LearnerFormData extends Omit<Learner, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'deleted_at' | 'deleted_by'> {}

export interface LearnerImportError {
	row: number
	roll_number: string
	first_name: string
	errors: string[]
}

// Backward compatibility aliases (deprecated - use Learner types)
/** @deprecated Use Learner instead */
export type Student = Learner
/** @deprecated Use LearnerFormData instead */
export type StudentFormData = LearnerFormData
/** @deprecated Use LearnerImportError instead */
export type StudentImportError = LearnerImportError

export interface UploadSummary {
	total: number
	success: number
	failed: number
}

export interface DropdownData {
	institutions: Array<{ id: string; institution_code: string; name: string }>
	departments: Array<{ id: string; department_code: string; department_name: string }>
	programs: Array<{ id: string; program_code: string; program_name: string }>
	degrees: Array<{ id: string; degree_code: string; degree_name: string }>
	semesters: Array<{ id: string; semester_code: string; semester_name: string }>
	sections: Array<{ id: string; section_code: string; section_name: string }>
	academicYears: Array<{ id: string; academic_year: string }>
}
