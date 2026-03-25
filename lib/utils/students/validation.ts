export function validateStudentData(data: any): Record<string, string> {
	const errors: Record<string, string> = {}

	// Required fields
	if (!data.roll_number?.trim()) errors.roll_number = "Roll number is required"
	if (!data.first_name?.trim()) errors.first_name = "First name is required"
	if (!data.date_of_birth) errors.date_of_birth = "Date of birth is required"
	if (!data.gender) errors.gender = "Gender is required"
	if (!data.institution_id) errors.institution_id = "Institution is required"
	if (!data.department_id) errors.department_id = "Department is required"
	if (!data.program_id) errors.program_id = "Program is required"
	if (!data.semester_id) errors.semester_id = "Semester is required"
	if (!data.academic_year_id) errors.academic_year_id = "Academic year is required"

	// Email validation
	if (data.student_email && data.student_email.trim()) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(data.student_email)) {
			errors.student_email = "Invalid email format"
		}
	}

	if (data.college_email && data.college_email.trim()) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(data.college_email)) {
			errors.college_email = "Invalid email format"
		}
	}

	// Mobile number validation (Indian format)
	if (data.student_mobile && data.student_mobile.trim()) {
		const mobileRegex = /^[\+]?[0-9\s\-\(\)]{10,15}$/
		if (!mobileRegex.test(data.student_mobile)) {
			errors.student_mobile = "Invalid mobile number format"
		}
	}

	// PIN code validation (6 digits for India)
	if (data.permanent_address_pin_code && data.permanent_address_pin_code.trim()) {
		const pinRegex = /^[0-9]{6}$/
		if (!pinRegex.test(data.permanent_address_pin_code)) {
			errors.permanent_address_pin_code = "PIN code must be exactly 6 digits"
		}
	}

	// Aadhar validation (12 digits)
	if (data.aadhar_number && data.aadhar_number.trim()) {
		const aadharRegex = /^[0-9]{12}$/
		if (!aadharRegex.test(data.aadhar_number.replace(/\s/g, ''))) {
			errors.aadhar_number = "Aadhar number must be exactly 12 digits"
		}
	}

	// Date of birth validation (not in future)
	if (data.date_of_birth) {
		const dob = new Date(data.date_of_birth)
		const today = new Date()
		if (dob > today) {
			errors.date_of_birth = "Date of birth cannot be in the future"
		}
	}

	// Bank account number validation
	if (data.bank_account_number && data.bank_account_number.trim()) {
		if (data.bank_account_number.length < 9 || data.bank_account_number.length > 18) {
			errors.bank_account_number = "Bank account number must be between 9 and 18 digits"
		}
	}

	// IFSC code validation
	if (data.bank_ifsc_code && data.bank_ifsc_code.trim()) {
		const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/
		if (!ifscRegex.test(data.bank_ifsc_code)) {
			errors.bank_ifsc_code = "Invalid IFSC code format (e.g., SBIN0001234)"
		}
	}

	return errors
}

export function validateStudentImport(data: any, rowIndex: number): string[] {
	const errors: string[] = []

	// Required field validations
	if (!data.roll_number || data.roll_number.toString().trim() === '') {
		errors.push('Roll Number is required')
	}

	if (!data.first_name || data.first_name.toString().trim() === '') {
		errors.push('First Name is required')
	}

	if (!data.date_of_birth) {
		errors.push('Date of Birth is required')
	}

	if (!data.gender) {
		errors.push('Gender is required')
	}

	if (!data.institution_id && !data.institution_code) {
		errors.push('Institution ID or Code is required')
	}

	if (!data.department_id && !data.department_code) {
		errors.push('Department ID or Code is required')
	}

	if (!data.program_id && !data.program_code) {
		errors.push('Program ID or Code is required')
	}

	if (!data.semester_id && !data.semester_code) {
		errors.push('Semester ID or Code is required')
	}

	if (!data.academic_year_id && !data.academic_year) {
		errors.push('Academic Year ID or Value is required')
	}

	// Email validation
	if (data.student_email && data.student_email.trim() !== '') {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(data.student_email)) {
			errors.push('Student Email format is invalid')
		}
	}

	// Mobile number validation
	if (data.student_mobile && data.student_mobile.trim() !== '') {
		const mobileRegex = /^[\+]?[0-9\s\-\(\)]{10,15}$/
		if (!mobileRegex.test(data.student_mobile.toString())) {
			errors.push('Student Mobile format is invalid')
		}
	}

	// PIN code validation
	if (data.permanent_address_pin_code && data.permanent_address_pin_code.toString().trim() !== '') {
		const pinRegex = /^[0-9]{6}$/
		if (!pinRegex.test(data.permanent_address_pin_code.toString())) {
			errors.push('PIN Code must be exactly 6 digits')
		}
	}

	// Gender validation
	if (data.gender) {
		const validGenders = ['male', 'female', 'other', 'Male', 'Female', 'Other']
		if (!validGenders.includes(data.gender)) {
			errors.push('Gender must be Male, Female, or Other')
		}
	}

	return errors
}
