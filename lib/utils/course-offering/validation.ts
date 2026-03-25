/**
 * Course Offering Validation Utilities
 *
 * This module contains all validation logic for course offering operations.
 * It provides comprehensive validation for form data and import operations.
 */

import type { CourseOfferingFormData } from '@/types/course-offering'

/**
 * Validates course offering form data
 * @param formData - Course offering form data
 * @returns Object with field names as keys and error messages as values
 */
export function validateCourseOfferingData(
	formData: CourseOfferingFormData
): Record<string, string> {
	const errors: Record<string, string> = {}

	// Required field validation
	if (!formData.institutions_id.trim()) {
		errors.institutions_id = 'Institution is required'
	}

	if (!formData.course_id.trim()) {
		errors.course_id = 'Course is required'
	}

	if (!formData.examination_session_id.trim()) {
		errors.examination_session_id = 'Examination session is required'
	}

	if (!formData.program_id.trim()) {
		errors.program_id = 'Program is required'
	}

	// Validate semester_code instead of semester
	if (!formData.semester_code || !formData.semester_code.trim()) {
		errors.semester_code = 'Semester is required'
	}

	// Enrollment validation
	const maxEnrollment = formData.max_enrollment ? parseInt(formData.max_enrollment) : null
	const enrolledCount = formData.enrolled_count ? parseInt(formData.enrolled_count) : 0

	if (maxEnrollment !== null && maxEnrollment <= 0) {
		errors.max_enrollment = 'Max enrollment must be greater than 0'
	}

	if (enrolledCount < 0) {
		errors.enrolled_count = 'Enrolled count cannot be negative'
	}

	if (maxEnrollment !== null && enrolledCount > maxEnrollment) {
		errors.enrolled_count = 'Enrolled count cannot exceed max enrollment'
	}

	return errors
}

/**
 * Validates semester value
 * @param semester - Semester value (string or number)
 * @returns Error message if invalid, empty string if valid
 */
export function validateSemester(semester: string | number): string {
	const semesterNum = typeof semester === 'string' ? parseInt(semester) : semester

	if (isNaN(semesterNum)) {
		return 'Semester must be a valid number'
	}

	if (semesterNum < 1 || semesterNum > 12) {
		return 'Semester must be between 1 and 12'
	}

	return ''
}

/**
 * Validates enrollment counts
 * @param maxEnrollment - Maximum enrollment capacity
 * @param enrolledCount - Current enrolled count
 * @returns Object with validation errors
 */
export function validateEnrollment(
	maxEnrollment: number | null,
	enrolledCount: number
): Record<string, string> {
	const errors: Record<string, string> = {}

	if (maxEnrollment !== null && maxEnrollment <= 0) {
		errors.max_enrollment = 'Max enrollment must be greater than 0'
	}

	if (enrolledCount < 0) {
		errors.enrolled_count = 'Enrolled count cannot be negative'
	}

	if (maxEnrollment !== null && enrolledCount > maxEnrollment) {
		errors.enrolled_count = 'Enrolled count cannot exceed max enrollment'
	}

	return errors
}

/**
 * Validates import row data
 * @param row - Row data from Excel/CSV import
 * @param rowNumber - Row number in file (for error reporting)
 * @returns Array of validation error messages
 */
export function validateImportRow(
	row: Record<string, any>,
	rowNumber: number
): string[] {
	const errors: string[] = []

	// Required fields
	if (!row['Institution Code']?.toString().trim()) {
		errors.push('Institution Code is required')
	}

	if (!row['Course Code']?.toString().trim()) {
		errors.push('Course Code is required')
	}

	if (!row['Session Code']?.toString().trim()) {
		errors.push('Session Code is required')
	}

	if (!row['Program Code']?.toString().trim()) {
		errors.push('Program Code is required')
	}

	if (!row['Semester']?.toString().trim()) {
		errors.push('Semester is required')
	}

	// Semester validation
	const semester = parseInt(row['Semester'])
	if (row['Semester'] && (isNaN(semester) || semester < 1 || semester > 12)) {
		errors.push('Semester must be between 1 and 12')
	}

	// Enrollment validation
	const maxEnrollment = row['Max Enrollment'] ? parseInt(row['Max Enrollment']) : null
	const enrolledCount = row['Enrolled Count'] ? parseInt(row['Enrolled Count']) : 0

	if (maxEnrollment !== null && isNaN(maxEnrollment)) {
		errors.push('Max Enrollment must be a valid number')
	}

	if (maxEnrollment !== null && maxEnrollment <= 0) {
		errors.push('Max Enrollment must be greater than 0')
	}

	if (isNaN(enrolledCount)) {
		errors.push('Enrolled Count must be a valid number')
	}

	if (enrolledCount < 0) {
		errors.push('Enrolled Count cannot be negative')
	}

	if (maxEnrollment !== null && enrolledCount > maxEnrollment) {
		errors.push('Enrolled Count cannot exceed Max Enrollment')
	}

	return errors
}
