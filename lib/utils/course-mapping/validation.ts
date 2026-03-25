import type { CourseMapping } from '@/types/course-mapping'

/**
 * Validates course mapping form data
 * @param data - Partial course mapping data to validate
 * @returns Object with field names as keys and error messages as values
 */
export function validateCourseMappingData(
	data: Partial<CourseMapping>
): Record<string, string> {
	const errors: Record<string, string> = {}

	// Required field validation
	if (!data.course_id?.trim()) {
		errors.course_id = 'Course is required'
	}

	if (!data.institution_code?.trim()) {
		errors.institution_code = 'Institution is required'
	}

	if (!data.program_code?.trim()) {
		errors.program_code = 'Program is required'
	}

	if (!data.regulation_code?.trim()) {
		errors.regulation_code = 'Regulation is required'
	}

	if (!data.semester_code?.trim()) {
		errors.semester_code = 'Semester is required'
	}

	// Course order validation (must be non-negative integer)
	if (data.course_order !== undefined && data.course_order !== null) {
		if (typeof data.course_order === 'number') {
			if (data.course_order < 0) {
				errors.course_order = 'Course order must be 0 or greater'
			}
			if (!Number.isInteger(data.course_order)) {
				errors.course_order = 'Course order must be a whole number'
			}
		}
	}

	// Numeric field validations (0-100 range for all mark fields)
	const markFields = [
		{ key: 'internal_max_mark', label: 'Internal max mark' },
		{ key: 'internal_pass_mark', label: 'Internal pass mark' },
		{ key: 'internal_converted_mark', label: 'Internal converted mark' },
		{ key: 'external_max_mark', label: 'External max mark' },
		{ key: 'external_pass_mark', label: 'External pass mark' },
		{ key: 'external_converted_mark', label: 'External converted mark' },
		{ key: 'total_pass_mark', label: 'Total pass mark' },
		{ key: 'total_max_mark', label: 'Total max mark' },
	] as const

	for (const field of markFields) {
		const value = data[field.key as keyof CourseMapping]
		if (value !== undefined && value !== null && typeof value === 'number') {
			if (value < 0 || value > 100) {
				errors[field.key] = `${field.label} must be between 0 and 100`
			}
		}
	}

	// Relational validations for marks
	if (
		data.internal_pass_mark !== undefined &&
		data.internal_max_mark !== undefined &&
		data.internal_pass_mark > data.internal_max_mark
	) {
		errors.internal_pass_mark = 'Internal pass mark cannot exceed internal max mark'
	}

	if (
		data.external_pass_mark !== undefined &&
		data.external_max_mark !== undefined &&
		data.external_pass_mark > data.external_max_mark
	) {
		errors.external_pass_mark = 'External pass mark cannot exceed external max mark'
	}

	if (
		data.total_pass_mark !== undefined &&
		data.total_max_mark !== undefined &&
		data.total_pass_mark > data.total_max_mark
	) {
		errors.total_pass_mark = 'Total pass mark cannot exceed total max mark'
	}

	return errors
}

/**
 * Validates course mapping data during import (Excel/JSON)
 * @param data - Raw data from import file
 * @param rowIndex - Row number in the import file (for error messages)
 * @returns Array of error messages
 */
export function validateCourseMappingImport(data: any, rowIndex: number): string[] {
	const errors: string[] = []

	// Required field validation
	if (!data.course_id || data.course_id.toString().trim() === '') {
		errors.push('Course ID is required')
	}

	if (!data.institution_code || data.institution_code.toString().trim() === '') {
		errors.push('Institution code is required')
	}

	if (!data.program_code || data.program_code.toString().trim() === '') {
		errors.push('Program code is required')
	}

	if (!data.regulation_code || data.regulation_code.toString().trim() === '') {
		errors.push('Regulation code is required')
	}

	if (!data.semester_code || data.semester_code.toString().trim() === '') {
		errors.push('Semester code is required')
	}

	// Numeric field validation
	const markFields = [
		{ key: 'internal_max_mark', label: 'Internal max mark' },
		{ key: 'internal_pass_mark', label: 'Internal pass mark' },
		{ key: 'internal_converted_mark', label: 'Internal converted mark' },
		{ key: 'external_max_mark', label: 'External max mark' },
		{ key: 'external_pass_mark', label: 'External pass mark' },
		{ key: 'external_converted_mark', label: 'External converted mark' },
		{ key: 'total_pass_mark', label: 'Total pass mark' },
		{ key: 'total_max_mark', label: 'Total max mark' },
	]

	for (const field of markFields) {
		const value = data[field.key]
		if (value !== undefined && value !== null && value !== '') {
			const numValue = Number(value)
			if (isNaN(numValue)) {
				errors.push(`${field.label} must be a number`)
			} else if (numValue < 0 || numValue > 100) {
				errors.push(`${field.label} must be between 0 and 100`)
			}
		}
	}

	// Course order validation
	if (data.course_order !== undefined && data.course_order !== null && data.course_order !== '') {
		const orderValue = Number(data.course_order)
		if (isNaN(orderValue)) {
			errors.push('Course order must be a number')
		} else if (orderValue < 0) {
			errors.push('Course order must be 0 or greater')
		} else if (!Number.isInteger(orderValue)) {
			errors.push('Course order must be a whole number')
		}
	}

	// Relational validations
	const internalPass = data.internal_pass_mark ? Number(data.internal_pass_mark) : undefined
	const internalMax = data.internal_max_mark ? Number(data.internal_max_mark) : undefined
	if (internalPass !== undefined && internalMax !== undefined && internalPass > internalMax) {
		errors.push('Internal pass mark cannot exceed internal max mark')
	}

	const externalPass = data.external_pass_mark ? Number(data.external_pass_mark) : undefined
	const externalMax = data.external_max_mark ? Number(data.external_max_mark) : undefined
	if (externalPass !== undefined && externalMax !== undefined && externalPass > externalMax) {
		errors.push('External pass mark cannot exceed external max mark')
	}

	const totalPass = data.total_pass_mark ? Number(data.total_pass_mark) : undefined
	const totalMax = data.total_max_mark ? Number(data.total_max_mark) : undefined
	if (totalPass !== undefined && totalMax !== undefined && totalPass > totalMax) {
		errors.push('Total pass mark cannot exceed total max mark')
	}

	return errors
}

/**
 * Helper function to check if a course mapping has valid mark configuration
 * @param mapping - Course mapping to validate
 * @returns true if marks are valid, false otherwise
 */
export function hasValidMarkConfiguration(mapping: Partial<CourseMapping>): boolean {
	// Check if any marks are defined
	const hasInternalMarks = mapping.internal_max_mark !== undefined || mapping.internal_pass_mark !== undefined
	const hasExternalMarks = mapping.external_max_mark !== undefined || mapping.external_pass_mark !== undefined
	const hasTotalMarks = mapping.total_max_mark !== undefined || mapping.total_pass_mark !== undefined

	// If no marks are defined, it's valid (optional marks)
	if (!hasInternalMarks && !hasExternalMarks && !hasTotalMarks) {
		return true
	}

	// If marks are defined, validate relationships
	if (hasInternalMarks) {
		if (mapping.internal_pass_mark !== undefined && mapping.internal_max_mark !== undefined) {
			if (mapping.internal_pass_mark > mapping.internal_max_mark) {
				return false
			}
		}
	}

	if (hasExternalMarks) {
		if (mapping.external_pass_mark !== undefined && mapping.external_max_mark !== undefined) {
			if (mapping.external_pass_mark > mapping.external_max_mark) {
				return false
			}
		}
	}

	if (hasTotalMarks) {
		if (mapping.total_pass_mark !== undefined && mapping.total_max_mark !== undefined) {
			if (mapping.total_pass_mark > mapping.total_max_mark) {
				return false
			}
		}
	}

	return true
}
