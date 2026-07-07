/**
 * Curriculum Grade System Validation Utilities
 *
 * This module contains all validation logic for curriculum grade system operations.
 * It provides comprehensive validation for form data and import operations.
 *
 * The curriculum grade system mirrors the standard grade system but is backed by
 * the `cgpa_grade_system` table (CGPA 0-10 bands) and adds a `classification` field.
 */

/**
 * CurriculumGradeSystem - Main entity representing a curriculum grade system configuration
 */
export interface CurriculumGradeSystem {
	id: string
	institutions_id: string
	institutions_code: string
	grade_system_code: 'UG' | 'PG'
	cgpa_grade_id: string
	grade: string
	grade_point: number
	classification: string
	min_cgpa: number
	max_cgpa: number
	description: string
	regulation_id?: string
	regulation_code: string
	is_active: boolean
	created_at: string
	updated_at?: string
}

/**
 * Institution - Foreign key reference for institutions
 */
export interface Institution {
	id: string
	institution_code: string
	name?: string
}

/**
 * Regulation - Foreign key reference for regulations
 */
export interface Regulation {
	id: string
	regulation_code: string
	name?: string
}

/**
 * Grade - Foreign key reference for curriculum grades (cgpa_grades)
 */
export interface Grade {
	id: string
	grade: string
	grade_point: number
	regulation_code?: string
}

/**
 * CurriculumGradeSystemFormData - Form data structure for creating/updating curriculum grade systems
 */
export interface CurriculumGradeSystemFormData {
	institutions_code: string
	grade_system_code: string
	cgpa_grade_id: string
	regulation_id: string
	classification: string
	min_cgpa: string
	max_cgpa: string
	description: string
	is_active: boolean
}

/**
 * Validates curriculum grade system form data
 * @param formData - Curriculum grade system form data
 * @returns Object with field names as keys and error messages as values
 */
export function validateCurriculumGradeSystemFormData(
	formData: CurriculumGradeSystemFormData
): Record<string, string> {
	const errors: Record<string, string> = {}

	// Required field validation
	if (!formData.institutions_code.trim()) {
		errors.institutions_code = 'Required'
	}

	if (!formData.grade_system_code.trim()) {
		errors.grade_system_code = 'Required'
	} else {
		// Validate grade_system_code is UG or PG
		const code = formData.grade_system_code.toUpperCase().trim()
		if (code !== 'UG' && code !== 'PG') {
			errors.grade_system_code = 'Must be UG (Undergraduate) or PG (Postgraduate)'
		}
	}

	if (!formData.cgpa_grade_id.trim()) {
		errors.cgpa_grade_id = 'Required'
	}

	if (!formData.regulation_id.trim()) {
		errors.regulation_id = 'Required'
	}

	if (!formData.min_cgpa.trim()) {
		errors.min_cgpa = 'Required'
	}

	if (!formData.max_cgpa.trim()) {
		errors.max_cgpa = 'Required'
	}

	if (!formData.description.trim()) {
		errors.description = 'Required'
	}

	// Numeric validation (allow -1 for absent cases)
	const minCgpa = Number(formData.min_cgpa)
	const maxCgpa = Number(formData.max_cgpa)

	if (formData.min_cgpa && (isNaN(minCgpa) || (minCgpa !== -1 && (minCgpa < 0 || minCgpa > 10)))) {
		errors.min_cgpa = 'Min CGPA must be -1 (for absent) or between 0 and 10'
	}

	if (formData.max_cgpa && (isNaN(maxCgpa) || (maxCgpa !== -1 && (maxCgpa < 0 || maxCgpa > 10)))) {
		errors.max_cgpa = 'Max CGPA must be -1 (for absent) or between 0 and 10'
	}

	// Constraint: min_cgpa <= max_cgpa (allow both to be -1 for absent cases)
	if (formData.min_cgpa && formData.max_cgpa && minCgpa !== -1 && maxCgpa !== -1 && minCgpa > maxCgpa) {
		errors.min_cgpa = 'Min CGPA must be less than or equal to max CGPA'
	}

	return errors
}

/**
 * Validates import row data
 * @param data - Row data from Excel/CSV import
 * @param rowIndex - Row number in file (for error reporting)
 * @returns Array of validation error messages
 */
export function validateCurriculumGradeSystemImportRow(
	data: any,
	rowIndex: number
): string[] {
	const errors: string[] = []

	// Required field validations
	if (!data.grade_system_code || data.grade_system_code.trim() === '') {
		errors.push('System Code is required')
	} else {
		// Validate grade_system_code is UG or PG
		const code = String(data.grade_system_code).toUpperCase().trim()
		if (code !== 'UG' && code !== 'PG') {
			errors.push('System Code must be UG (Undergraduate) or PG (Postgraduate)')
		}
	}

	if (!data.institutions_code || data.institutions_code.trim() === '') {
		errors.push('Institution Code is required')
	}

	if (!data.cgpa_grade_id || data.cgpa_grade_id.trim() === '') {
		errors.push('Grade is required')
	}

	if (!data.regulation_id) {
		errors.push('Regulation ID is required')
	}

	if (data.min_cgpa === undefined || data.min_cgpa === null || data.min_cgpa === '') {
		errors.push('Min CGPA is required')
	} else {
		const minCgpa = Number(data.min_cgpa)
		if (isNaN(minCgpa) || (minCgpa !== -1 && (minCgpa < 0 || minCgpa > 10))) {
			errors.push('Min CGPA must be -1 (for absent) or between 0 and 10')
		}
	}

	if (data.max_cgpa === undefined || data.max_cgpa === null || data.max_cgpa === '') {
		errors.push('Max CGPA is required')
	} else {
		const maxCgpa = Number(data.max_cgpa)
		if (isNaN(maxCgpa) || (maxCgpa !== -1 && (maxCgpa < 0 || maxCgpa > 10))) {
			errors.push('Max CGPA must be -1 (for absent) or between 0 and 10')
		}
	}

	// Constraint: min_cgpa <= max_cgpa (allow both to be -1 for absent cases)
	if (data.min_cgpa !== undefined && data.max_cgpa !== undefined) {
		const minCgpa = Number(data.min_cgpa)
		const maxCgpa = Number(data.max_cgpa)
		if (!isNaN(minCgpa) && !isNaN(maxCgpa) && minCgpa !== -1 && maxCgpa !== -1 && minCgpa > maxCgpa) {
			errors.push('Min CGPA must be less than or equal to Max CGPA')
		}
	}

	if (!data.description || data.description.trim() === '') {
		errors.push('Description is required')
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
 * Validates CGPA range (min and max)
 * Allows -1 for absent cases
 * @param minCgpa - Minimum CGPA
 * @param maxCgpa - Maximum CGPA
 * @returns Object with validation errors
 */
export function validateCgpaRange(
	minCgpa: number,
	maxCgpa: number
): Record<string, string> {
	const errors: Record<string, string> = {}

	if (minCgpa !== -1 && (minCgpa < 0 || minCgpa > 10)) {
		errors.min_cgpa = 'Min CGPA must be -1 (for absent) or between 0 and 10'
	}

	if (maxCgpa !== -1 && (maxCgpa < 0 || maxCgpa > 10)) {
		errors.max_cgpa = 'Max CGPA must be -1 (for absent) or between 0 and 10'
	}

	// Allow both to be -1 for absent cases
	if (minCgpa !== -1 && maxCgpa !== -1 && minCgpa > maxCgpa) {
		errors.min_cgpa = 'Min CGPA must be less than or equal to max CGPA'
	}

	return errors
}
