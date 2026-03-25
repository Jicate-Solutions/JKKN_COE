import type { RegulationFormData, InstitutionOption } from '@/types/regulations'

/**
 * Validate regulation form data
 * Returns an object with field names as keys and error messages as values
 */
export function validateRegulationData(
	data: Partial<RegulationFormData>,
	institutions: InstitutionOption[] = []
): Record<string, string> {
	const errors: Record<string, string> = {}

	// Required field validation
	if (!data.regulation_code?.trim()) {
		errors.regulation_code = 'Regulation code is required'
	}

	// Institution code validation
	if (!data.institution_code || !data.institution_code.trim()) {
		errors.institution_code = 'Institution code is required'
	} else if (institutions.length > 0 && !institutions.some(inst => inst.institution_code === data.institution_code)) {
		errors.institution_code = 'Please select a valid institution'
	}

	// Year validation
	if (!data.regulation_year) {
		errors.regulation_year = 'Regulation year is required'
	} else if (data.regulation_year < 2000 || data.regulation_year > 2100) {
		errors.regulation_year = 'Year must be between 2000 and 2100'
	}

	// Required minimum_attendance field
	if (data.minimum_attendance === undefined || data.minimum_attendance === null) {
		errors.minimum_attendance = 'Minimum attendance is required'
	}

	// Numeric validations (0-100 range)
	const numericFields = [
		{ key: 'minimum_internal', label: 'Minimum internal marks' },
		{ key: 'minimum_external', label: 'Minimum external marks' },
		{ key: 'minimum_attendance', label: 'Minimum attendance' },
		{ key: 'minimum_total', label: 'Minimum total marks' },
		{ key: 'maximum_internal', label: 'Maximum internal marks' },
		{ key: 'maximum_external', label: 'Maximum external marks' },
		{ key: 'maximum_total', label: 'Maximum total marks' },
		{ key: 'maximum_qp_marks', label: 'Maximum question paper marks' },
		{ key: 'condonation_range_start', label: 'Condonation range start' },
		{ key: 'condonation_range_end', label: 'Condonation range end' },
	] as const

	for (const field of numericFields) {
		const value = data[field.key as keyof RegulationFormData]
		if (value !== undefined && value !== null && typeof value === 'number') {
			if (value < 0 || value > 100) {
				errors[field.key] = `${field.label} must be between 0 and 100`
			}
		}
	}

	// Range validations
	if (
		data.condonation_range_start !== undefined &&
		data.condonation_range_end !== undefined &&
		data.condonation_range_start >= data.condonation_range_end
	) {
		errors.condonation_range_end = 'Must be greater than start range'
	}

	return errors
}

/**
 * Validate regulation data from import (Excel/JSON)
 * Returns an array of error messages
 */
export function validateRegulationImport(data: any, rowIndex: number): string[] {
	const errors: string[] = []

	// Required fields
	if (!data.regulation_code || data.regulation_code.toString().trim() === '') {
		errors.push('Regulation code is required')
	}

	if (!data.institution_code || data.institution_code.toString().trim() === '') {
		errors.push('Institution code is required')
	}

	// Year validation
	const year = Number(data.regulation_year)
	if (!data.regulation_year || isNaN(year)) {
		errors.push('Regulation year is required')
	} else if (year < 2000 || year > 2100) {
		errors.push('Year must be between 2000 and 2100')
	}

	// Status validation
	if (data.status !== undefined && data.status !== null) {
		const statusValue = data.status.toString().toLowerCase()
		if (!['true', 'false', 'active', 'inactive'].includes(statusValue)) {
			errors.push('Status must be true/false or Active/Inactive')
		}
	}

	// Numeric field validations (0-100 range)
	const numericFields = [
		{ key: 'minimum_internal', label: 'Minimum internal' },
		{ key: 'minimum_external', label: 'Minimum external' },
		{ key: 'minimum_attendance', label: 'Minimum attendance' },
		{ key: 'minimum_total', label: 'Minimum total' },
		{ key: 'maximum_internal', label: 'Maximum internal' },
		{ key: 'maximum_external', label: 'Maximum external' },
		{ key: 'maximum_total', label: 'Maximum total' },
		{ key: 'maximum_qp_marks', label: 'Maximum QP marks' },
		{ key: 'condonation_range_start', label: 'Condonation start' },
		{ key: 'condonation_range_end', label: 'Condonation end' },
	]

	for (const field of numericFields) {
		const value = data[field.key]
		if (value !== undefined && value !== null) {
			const numValue = Number(value)
			if (isNaN(numValue)) {
				errors.push(`${field.label} must be a valid number`)
			} else if (numValue < 0 || numValue > 100) {
				errors.push(`${field.label} must be between 0 and 100`)
			}
		}
	}

	// Range validation
	if (
		data.condonation_range_start !== undefined &&
		data.condonation_range_end !== undefined
	) {
		const start = Number(data.condonation_range_start)
		const end = Number(data.condonation_range_end)
		if (!isNaN(start) && !isNaN(end) && start >= end) {
			errors.push('Condonation range end must be greater than start')
		}
	}

	return errors
}

/**
 * Check if regulation data is valid
 * Returns true if valid, false otherwise
 */
export function isValidRegulation(
	data: Partial<RegulationFormData>,
	institutions: InstitutionOption[] = []
): boolean {
	const errors = validateRegulationData(data, institutions)
	return Object.keys(errors).length === 0
}
