// Exam Registration type    definitions
export interface ExamRegistration {
	id: string
	institutions_id: string
	student_id: string
	examination_session_id: string
	course_offering_id: string
	stu_register_no: string | null
	student_name: string | null
	registration_date: string
	registration_status: string
	is_regular: boolean
	attempt_number: number
	fee_paid: boolean
	fee_amount: number | null
	payment_date: string | null
	payment_transaction_id: string | null
	remarks: string | null
	approved_by: string | null
	approved_date: string | null
	program_code?: string | null
	created_at: string
	updated_at: string
	// Relations
	institution?: { institution_code: string; name: string }
	student?: { roll_number: string; first_name: string; last_name: string }
	examination_session?: { session_name: string; session_code: string }
	course_offering?: { course_code: string; course_name: string; program_code?: string }
	approved_by_faculty?: { faculty_name: string; faculty_code: string }
}



export interface ExamRegistrationFormData {
	institutions_id: string
	student_id: string
	examination_session_id: string
	course_offering_id: string
	stu_register_no: string
	student_name: string
	registration_date: string
	registration_status: string
	is_regular: boolean
	attempt_number: number
	fee_paid: boolean
	fee_amount: string
	payment_date: string
	payment_transaction_id: string
	remarks: string
	approved_by: string
	approved_date: string
}

export interface ExamRegistrationImportError {
	row: number
	student_register_no: string
	course_code: string
	errors: string[]
}

export interface UploadSummary {
	total: number
	success: number
	failed: number
	skipped: number
}

// Dropdown data types
export interface InstitutionOption {
	id: string
	institution_code: string
	name: string
}

export interface StudentOption {
	id: string
	roll_number?: string
	register_number?: string
	first_name?: string
	last_name?: string
	institution_id?: string
	institution_code?: string
	program_code?: string
	current_semester?: number | null
}

export interface ExaminationSessionOption {
	id: string
	session_code: string
	session_name?: string
	institutions_id?: string
	programs_included?: string[]  // Array of program codes included in this session
}

export interface CourseOfferingOption {
	id: string
	course_code: string
	course_name?: string
	institutions_id?: string
	examination_session_id?: string  // For matching course to specific session
	program_id?: string      // UUID of the program (for matching with session.programs_included)
	program_code?: string    // Code of the program (e.g., "UMB", "BCA")
}
