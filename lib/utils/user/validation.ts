/**
 * User Validation Utilities
 *
 * This module contains all validation logic for user operations.
 * It provides comprehensive validation for form data and import operations.
 */

import type { UserFormData } from '@/types/user'

/**
 * Validates user form data
 * @param formData - User form data
 * @returns Object with field names as keys and error messages as values
 */
export function validateUserFormData(
	formData: UserFormData
): Record<string, string> {
	const errors: Record<string, string> = {}

	// Required field validation
	if (!formData.full_name.trim()) {
		errors.full_name = 'Required'
	}

	if (!formData.email.trim()) {
		errors.email = 'Required'
	}

	// Email format validation
	if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
		errors.email = 'Invalid email'
	}

	return errors
}

/**
 * Validates email format
 * @param email - Email address
 * @returns Error message if invalid, empty string if valid
 */
export function validateEmail(email: string): string {
	if (!email || !email.trim()) {
		return 'Email is required'
	}

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return 'Invalid email format'
	}

	return ''
}

/**
 * Validates import row data
 * @param data - Row data from Excel/CSV import
 * @param rowIndex - Row number in file (for error reporting)
 * @returns Array of validation error messages
 */
export function validateUserImportRow(
	data: any,
	rowIndex: number
): string[] {
	const errors: string[] = []

	// Required field validations
	if (!data.email || data.email.trim() === '') {
		errors.push('Email is required')
	} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
		errors.push('Invalid email format')
	}

	if (!data.full_name || data.full_name.trim() === '') {
		errors.push('Full name is required')
	}

	// Status validation
	if (data.is_active !== undefined && data.is_active !== null) {
		if (typeof data.is_active !== 'boolean') {
			const statusValue = String(data.is_active).toLowerCase()
			if (statusValue !== 'true' && statusValue !== 'false' && statusValue !== 'active' && statusValue !== 'inactive') {
				errors.push('Status must be true/false or Active/Inactive')
			}
		}
	}

	return errors
}

/**
 * Validates phone number format (basic validation)
 * @param phone - Phone number
 * @returns Error message if invalid, empty string if valid
 */
export function validatePhone(phone: string): string {
	if (!phone || !phone.trim()) {
		return '' // Phone is optional
	}

	// Basic phone validation (10-15 digits with optional + and spaces)
	if (!/^\+?[\d\s-]{10,15}$/.test(phone)) {
		return 'Invalid phone number format'
	}

	return ''
}
