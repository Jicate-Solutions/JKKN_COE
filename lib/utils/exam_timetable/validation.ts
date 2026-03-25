import type { ExamTimetableFormData, GeneratedCourseData } from '@/types/exam_timetable'

/**
 * Validates exam timetable form data
 * @param data - Partial exam timetable data to validate
 * @returns Object with field names as keys and error messages as values
 */
export function validateExamTimetableData(
	data: Partial<ExamTimetableFormData>
): Record<string, string> {
	const errors: Record<string, string> = {}

	// Required field validation
	if (!data.institutions_id?.trim()) {
		errors.institutions_id = 'Institution is required'
	}

	if (!data.examination_session_id?.trim()) {
		errors.examination_session_id = 'Examination session is required'
	}

	if (!data.course_offering_id?.trim()) {
		errors.course_offering_id = 'Course offering is required'
	}

	if (!data.exam_date) {
		errors.exam_date = 'Exam date is required'
	}

	if (!data.session?.trim()) {
		errors.session = 'Session is required'
	}

	if (!data.exam_time?.trim()) {
		errors.exam_time = 'Exam time is required'
	}

	// Duration validation
	if (data.duration_minutes !== undefined) {
		if (data.duration_minutes <= 0) {
			errors.duration_minutes = 'Duration must be greater than 0'
		}
		if (data.duration_minutes > 600) {
			errors.duration_minutes = 'Duration cannot exceed 600 minutes (10 hours)'
		}
	} else {
		errors.duration_minutes = 'Duration is required'
	}

	if (!data.exam_mode?.trim()) {
		errors.exam_mode = 'Exam mode is required'
	}

	return errors
}

/**
 * Validates generated course data before saving
 * @param courses - Array of generated course data
 * @returns Array of invalid courses with missing required fields
 */
export function validateGeneratedCourses(
	courses: GeneratedCourseData[]
): GeneratedCourseData[] {
	return courses.filter(
		(course) =>
			!course.exam_date ||
			!course.session ||
			!course.exam_time ||
			!course.duration_minutes ||
			course.duration_minutes <= 0
	)
}

/**
 * Validates that institution code is selected for generating courses
 * @param institutionCode - Selected institution code
 * @returns Error message if invalid, empty string if valid
 */
export function validateInstitutionForGenerate(
	institutionCode: string
): string {
	if (!institutionCode || institutionCode.trim() === '') {
		return 'Please select an Institution Code to generate courses.'
	}
	return ''
}

/**
 * Helper function to check if exam timetable has valid time configuration
 * @param examTime - Exam time string
 * @param durationMinutes - Duration in minutes
 * @returns true if time configuration is valid, false otherwise
 */
export function hasValidTimeConfiguration(
	examTime: string,
	durationMinutes: number
): boolean {
	if (!examTime || !durationMinutes) {
		return false
	}

	// Check if exam time is in valid format (HH:MM)
	const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
	if (!timeRegex.test(examTime)) {
		return false
	}

	// Check if duration is reasonable (between 1 minute and 10 hours)
	if (durationMinutes <= 0 || durationMinutes > 600) {
		return false
	}

	return true
}

/**
 * Validates exam date to ensure it's not in the past
 * @param examDate - Exam date string
 * @returns Error message if invalid, empty string if valid
 */
export function validateExamDate(examDate: string): string {
	if (!examDate) {
		return 'Exam date is required'
	}

	const selectedDate = new Date(examDate)
	const today = new Date()
	today.setHours(0, 0, 0, 0)

	if (selectedDate < today) {
		return 'Exam date cannot be in the past'
	}

	return ''
}
