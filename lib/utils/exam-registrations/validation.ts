import type { ExamRegistrationFormData } from '@/types/exam-registrations'

/**
 * Validate exam registration form data
 * Returns an object with field names as keys and error messages as values
 */
export function validateExamRegistrationData(data: Partial<ExamRegistrationFormData>): Record<string, string> {
	const errors: Record<string, string> = {}

	// Required field validation
	if (!data.institutions_id?.trim()) {
		errors.institutions_id = 'Institution is required'
	}

	if (!data.student_id?.trim()) {
		errors.student_id = 'Student is required'
	}

	if (!data.examination_session_id?.trim()) {
		errors.examination_session_id = 'Examination session is required'
	}

	if (!data.course_offering_id?.trim()) {
		errors.course_offering_id = 'Course offering is required'
	}

	if (!data.registration_date?.trim()) {
		errors.registration_date = 'Registration date is required'
	} else {
		// Validate date format
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/
		if (!dateRegex.test(data.registration_date)) {
			errors.registration_date = 'Invalid date format (use YYYY-MM-DD)'
		} else {
			const date = new Date(data.registration_date)
			if (isNaN(date.getTime())) {
				errors.registration_date = 'Invalid date'
			}
		}
	}

	if (!data.registration_status?.trim()) {
		errors.registration_status = 'Registration status is required'
	} else {
		// Validate status values
		const validStatuses = ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed']
		if (!validStatuses.includes(data.registration_status)) {
			errors.registration_status = 'Invalid status. Must be one of: Pending, Approved, Rejected, Cancelled, Completed'
		}
	}

	// Attempt number validation
	if (data.attempt_number !== undefined && data.attempt_number !== null) {
		const attemptNum = Number(data.attempt_number)
		if (isNaN(attemptNum) || attemptNum < 1 || attemptNum > 10) {
			errors.attempt_number = 'Attempt number must be between 1 and 10'
		}
		if (!Number.isInteger(attemptNum)) {
			errors.attempt_number = 'Attempt number must be a whole number'
		}
	} else {
		errors.attempt_number = 'Attempt number is required'
	}

	// Fee amount validation (optional but must be positive if provided)
	if (data.fee_amount && data.fee_amount.toString().trim() !== '') {
		const feeAmount = Number(data.fee_amount)
		if (isNaN(feeAmount)) {
			errors.fee_amount = 'Fee amount must be a valid number'
		} else if (feeAmount < 0) {
			errors.fee_amount = 'Fee amount cannot be negative'
		} else if (feeAmount > 999999.99) {
			errors.fee_amount = 'Fee amount cannot exceed 999,999.99'
		}
	}

	// Payment date validation (optional but must be valid if provided)
	if (data.payment_date && data.payment_date.trim() !== '') {
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/
		if (!dateRegex.test(data.payment_date)) {
			errors.payment_date = 'Invalid payment date format (use YYYY-MM-DD)'
		} else {
			const date = new Date(data.payment_date)
			if (isNaN(date.getTime())) {
				errors.payment_date = 'Invalid payment date'
			}
		}

		// If payment date is provided, fee_paid should be true
		if (data.fee_paid === false) {
			errors.payment_date = 'Cannot set payment date when fee is not paid'
		}
	}

	// Payment transaction ID validation (optional but must be alphanumeric if provided)
	if (data.payment_transaction_id && data.payment_transaction_id.trim() !== '') {
		const transactionIdRegex = /^[A-Za-z0-9\-_]+$/
		if (!transactionIdRegex.test(data.payment_transaction_id)) {
			errors.payment_transaction_id = 'Transaction ID can only contain letters, numbers, hyphens, and underscores'
		}
		if (data.payment_transaction_id.length > 100) {
			errors.payment_transaction_id = 'Transaction ID cannot exceed 100 characters'
		}
	}

	// Approved date validation (optional but must be valid if provided)
	if (data.approved_date && data.approved_date.trim() !== '') {
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/
		if (!dateRegex.test(data.approved_date)) {
			errors.approved_date = 'Invalid approved date format (use YYYY-MM-DD)'
		} else {
			const date = new Date(data.approved_date)
			if (isNaN(date.getTime())) {
				errors.approved_date = 'Invalid approved date'
			}
		}

		// If approved date is provided, approved_by should also be provided
		if (!data.approved_by || data.approved_by.trim() === '') {
			errors.approved_by = 'Approver is required when approved date is set'
		}
	}

	// Conditional validation: if fee_paid is true, fee_amount should be provided
	if (data.fee_paid === true) {
		if (!data.fee_amount || data.fee_amount.toString().trim() === '') {
			errors.fee_amount = 'Fee amount is required when fee is marked as paid'
		}
	}

	// Student register number validation (optional but must be alphanumeric if provided)
	if (data.stu_register_no && data.stu_register_no.trim() !== '') {
		const registerNoRegex = /^[A-Za-z0-9\-_]+$/
		if (!registerNoRegex.test(data.stu_register_no)) {
			errors.stu_register_no = 'Register number can only contain letters, numbers, hyphens, and underscores'
		}
		if (data.stu_register_no.length > 50) {
			errors.stu_register_no = 'Register number cannot exceed 50 characters'
		}
	}

	// Student name validation (optional but must be valid if provided)
	if (data.student_name && data.student_name.trim() !== '') {
		if (data.student_name.length > 200) {
			errors.student_name = 'Student name cannot exceed 200 characters'
		}
	}

	// Remarks validation (optional but must be within length limit if provided)
	if (data.remarks && data.remarks.trim() !== '') {
		if (data.remarks.length > 500) {
			errors.remarks = 'Remarks cannot exceed 500 characters'
		}
	}

	return errors
}

/**
 * Validate exam registration data from import (Excel/JSON)
 * Returns an array of error messages
 */
export function validateExamRegistrationImport(data: any, rowIndex: number): string[] {
	const errors: string[] = []

	// Required fields
	if (!data.institution_code || data.institution_code.toString().trim() === '') {
		errors.push('Institution code is required')
	}

	if (!data.student_register_no || data.student_register_no.toString().trim() === '') {
		errors.push('Student register number is required')
	}

	if (!data.session_code || data.session_code.toString().trim() === '') {
		errors.push('Examination session code is required')
	}

	if (!data.course_code || data.course_code.toString().trim() === '') {
		errors.push('Course code is required')
	}

	if (!data.registration_date || data.registration_date.toString().trim() === '') {
		errors.push('Registration date is required')
	} else {
		// Validate date format
		const dateStr = data.registration_date.toString().trim()
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/
		if (!dateRegex.test(dateStr)) {
			errors.push('Invalid registration date format (use YYYY-MM-DD)')
		} else {
			const date = new Date(dateStr)
			if (isNaN(date.getTime())) {
				errors.push('Invalid registration date')
			}
		}
	}

	if (!data.registration_status || data.registration_status.toString().trim() === '') {
		errors.push('Registration status is required')
	} else {
		const validStatuses = ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed']
		if (!validStatuses.includes(data.registration_status.toString().trim())) {
			errors.push('Invalid status. Must be one of: Pending, Approved, Rejected, Cancelled, Completed')
		}
	}

	// Attempt number validation
	if (data.attempt_number === undefined || data.attempt_number === null || data.attempt_number.toString().trim() === '') {
		errors.push('Attempt number is required')
	} else {
		const attemptNum = Number(data.attempt_number)
		if (isNaN(attemptNum) || attemptNum < 1 || attemptNum > 10) {
			errors.push('Attempt number must be between 1 and 10')
		}
	}

	// Boolean field validation
	if (data.is_regular !== undefined && data.is_regular !== null) {
		const boolValue = data.is_regular.toString().toLowerCase()
		if (!['true', 'false', '1', '0', 'yes', 'no'].includes(boolValue)) {
			errors.push('is_regular must be true/false, yes/no, or 1/0')
		}
	}

	if (data.fee_paid !== undefined && data.fee_paid !== null) {
		const boolValue = data.fee_paid.toString().toLowerCase()
		if (!['true', 'false', '1', '0', 'yes', 'no'].includes(boolValue)) {
			errors.push('fee_paid must be true/false, yes/no, or 1/0')
		}
	}

	// Fee amount validation (optional but must be positive if provided)
	if (data.fee_amount && data.fee_amount.toString().trim() !== '') {
		const feeAmount = Number(data.fee_amount)
		if (isNaN(feeAmount)) {
			errors.push('Fee amount must be a valid number')
		} else if (feeAmount < 0) {
			errors.push('Fee amount cannot be negative')
		} else if (feeAmount > 999999.99) {
			errors.push('Fee amount cannot exceed 999,999.99')
		}
	}

	// Payment date validation (optional)
	if (data.payment_date && data.payment_date.toString().trim() !== '') {
		const dateStr = data.payment_date.toString().trim()
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/
		if (!dateRegex.test(dateStr)) {
			errors.push('Invalid payment date format (use YYYY-MM-DD)')
		} else {
			const date = new Date(dateStr)
			if (isNaN(date.getTime())) {
				errors.push('Invalid payment date')
			}
		}
	}

	// Approved date validation (optional)
	if (data.approved_date && data.approved_date.toString().trim() !== '') {
		const dateStr = data.approved_date.toString().trim()
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/
		if (!dateRegex.test(dateStr)) {
			errors.push('Invalid approved date format (use YYYY-MM-DD)')
		} else {
			const date = new Date(dateStr)
			if (isNaN(date.getTime())) {
				errors.push('Invalid approved date')
			}
		}
	}

	// Length validations
	if (data.student_register_no && data.student_register_no.toString().length > 50) {
		errors.push('Student register number cannot exceed 50 characters')
	}

	if (data.student_name && data.student_name.toString().length > 200) {
		errors.push('Student name cannot exceed 200 characters')
	}

	if (data.payment_transaction_id && data.payment_transaction_id.toString().length > 100) {
		errors.push('Payment transaction ID cannot exceed 100 characters')
	}

	if (data.remarks && data.remarks.toString().length > 500) {
		errors.push('Remarks cannot exceed 500 characters')
	}

	return errors
}

/**
 * Check if exam registration data is valid
 * Returns true if valid, false otherwise
 */
export function isValidExamRegistration(data: Partial<ExamRegistrationFormData>): boolean {
	const errors = validateExamRegistrationData(data)
	return Object.keys(errors).length === 0
}
