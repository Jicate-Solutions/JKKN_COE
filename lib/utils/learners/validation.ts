/**
 * Learner Validation Utilities
 * JKKN Terminology: "Learner" (not "Student")
 */

import type { LearnerFormData } from '@/types/learners'

export interface ValidationResult {
	isValid: boolean
	errors: Record<string, string>
}

/**
 * Validate learner form data
 */
export function validateLearnerData(data: Partial<LearnerFormData>): ValidationResult {
	const errors: Record<string, string> = {}

	// Required fields validation
	if (!data.first_name?.trim()) {
		errors.first_name = 'First name is required'
	}

	if (!data.roll_number?.trim()) {
		errors.roll_number = 'Roll number is required'
	}

	// Email validation (if provided)
	if (data.learner_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.learner_email)) {
		errors.learner_email = 'Invalid email format'
	}

	// Phone validation (if provided)
	if (data.learner_mobile && !/^[0-9]{10}$/.test(data.learner_mobile.replace(/\D/g, ''))) {
		errors.learner_mobile = 'Invalid mobile number (10 digits required)'
	}

	// Batch year validation (if provided)
	if (data.batch_year) {
		const year = Number(data.batch_year)
		const currentYear = new Date().getFullYear()
		if (isNaN(year) || year < 2000 || year > currentYear + 5) {
			errors.batch_year = `Batch year must be between 2000 and ${currentYear + 5}`
		}
	}

	return {
		isValid: Object.keys(errors).length === 0,
		errors
	}
}

/**
 * Validate learner import data
 */
export function validateLearnerImportRow(row: Record<string, any>, rowIndex: number): string[] {
	const errors: string[] = []

	if (!row.first_name?.toString().trim()) {
		errors.push(`Row ${rowIndex}: First name is required`)
	}

	if (!row.roll_number?.toString().trim()) {
		errors.push(`Row ${rowIndex}: Roll number is required`)
	}

	if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
		errors.push(`Row ${rowIndex}: Invalid email format`)
	}

	return errors
}
