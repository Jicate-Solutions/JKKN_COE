/**
 * Practical Attendance Service Layer
 *
 * This module consolidates all API calls for the practical-attendance module.
 * It provides a clean interface for fetching dropdown data, student lists, and saving attendance.
 */

import type {
	PracticalInstitution,
	PracticalSession,
	PracticalCourse,
	PracticalBatch,
	PracticalStudent,
} from '@/types/practical-attendance'

const BASE = '/api/exam-management/practical-attendance'

/**
 * Fetch institutions (uses appendToUrl for institution filter support)
 */
export async function fetchPracticalInstitutions(
	appendToUrl: (url: string) => string
): Promise<PracticalInstitution[]> {
	try {
		const url = appendToUrl(`${BASE}/dropdowns?type=institutions`)
		const res = await fetch(url)
		if (res.ok) {
			return await res.json()
		}
		return []
	} catch (error) {
		console.error('Error fetching practical institutions:', error)
		return []
	}
}

/**
 * Fetch examination sessions by institution
 */
export async function fetchPracticalSessions(institutionId: string): Promise<PracticalSession[]> {
	try {
		const res = await fetch(`${BASE}/dropdowns?type=sessions&institution_id=${institutionId}`)
		if (res.ok) {
			return await res.json()
		}
		return []
	} catch (error) {
		console.error('Error fetching practical sessions:', error)
		return []
	}
}

/**
 * Fetch courses that have published Practical timetable entries for today
 */
export async function fetchPracticalCourses(
	institutionId: string,
	sessionId: string
): Promise<PracticalCourse[]> {
	try {
		const res = await fetch(
			`${BASE}/dropdowns?type=courses&institution_id=${institutionId}&session_id=${sessionId}`
		)
		if (res.ok) {
			return await res.json()
		}
		return []
	} catch (error) {
		console.error('Error fetching practical courses:', error)
		return []
	}
}

/**
 * Fetch practical batches (timetable rows) for a course today
 */
export async function fetchPracticalBatches(
	institutionId: string,
	sessionId: string,
	courseId: string
): Promise<PracticalBatch[]> {
	try {
		const res = await fetch(
			`${BASE}/dropdowns?type=batches&institution_id=${institutionId}&session_id=${sessionId}&course_id=${courseId}`
		)
		if (res.ok) {
			return await res.json()
		}
		return []
	} catch (error) {
		console.error('Error fetching practical batches:', error)
		return []
	}
}

/**
 * Check if attendance exists for a batch and load existing records
 */
export async function checkPracticalAttendance(
	timetableId: string
): Promise<{ exists: boolean; data: any[] }> {
	const res = await fetch(`${BASE}?mode=check&timetable_id=${timetableId}`)

	if (!res.ok) {
		throw new Error('Failed to check practical attendance')
	}

	return await res.json()
}

/**
 * Load student list for a batch for attendance entry
 */
export async function loadBatchStudents(timetableId: string): Promise<PracticalStudent[]> {
	const url = `${BASE}?mode=list&timetable_id=${timetableId}`
	console.log('Loading batch students from:', url)

	const res = await fetch(url)

	if (!res.ok) {
		const errorData = await res.json().catch(() => ({ error: 'Failed to parse error response' }))
		console.error('Load batch students API error:', res.status, JSON.stringify(errorData, null, 2))

		// No students assigned to batch — return empty array so the page shows a friendly message
		if (res.status === 404 && errorData.error?.includes('No students assigned')) {
			return []
		}

		const errorMsg = errorData.details
			? `${errorData.error} (${errorData.details})`
			: errorData.error || 'Failed to load student list'
		throw new Error(errorMsg)
	}

	return await res.json()
}

/**
 * Save practical attendance records for a batch
 */
export async function savePracticalAttendance(payload: {
	institutions_id: string
	examination_session_id: string
	exam_timetable_id: string
	course_id: string
	program_code?: string
	verified_by?: string
	created_by?: string
	submitted_by?: string
	attendance_records: {
		exam_registration_id: string
		student_id: string
		attempt_number: number
		is_regular: boolean
		is_absent: boolean
		remarks?: string
		program_code?: string
	}[]
}): Promise<void> {
	console.log('Saving practical attendance with payload:', payload)

	const res = await fetch(BASE, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	})

	console.log('Save practical attendance response status:', res.status)

	if (!res.ok) {
		// Try to get the response text first
		const responseText = await res.text()
		console.error('Save practical attendance error response text:', responseText)

		// Try to parse as JSON
		let errorData: any = {}
		try {
			errorData = JSON.parse(responseText)
		} catch (e) {
			console.error('Failed to parse error response as JSON:', e)
			errorData = { error: responseText || `HTTP ${res.status}: ${res.statusText}` }
		}

		console.error('Save practical attendance error data:', errorData)
		throw new Error(errorData.error || errorData.message || 'Failed to save attendance')
	}

	const successData = await res.json()
	console.log('Save practical attendance success:', successData)
}
