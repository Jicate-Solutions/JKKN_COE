/**
 * Exam Attendance Service Layer
 *
 * This module consolidates all API calls for the exam-attendance module.
 * It provides a clean interface for fetching dropdown data, student lists, and saving attendance.
 */

import type {
	Institution,
	ExaminationSession,
	Program,
	ExamDate,
	CourseOffering,
	StudentRegistration,
	AttendanceRecord,
} from '@/types/exam-attendance'

/**
 * Fetch institutions
 */
export async function fetchInstitutions(): Promise<Institution[]> {
	try {
		const res = await fetch('/api/exam-management/exam-attendance/dropdowns?type=institutions')
		if (res.ok) {
			return await res.json()
		}
		return []
	} catch (error) {
		console.error('Error fetching institutions:', error)
		return []
	}
}

/**
 * Fetch examination sessions by institution
 */
export async function fetchSessions(institutionId: string): Promise<ExaminationSession[]> {
	try {
		const res = await fetch(`/api/exam-management/exam-attendance/dropdowns?type=sessions&institution_id=${institutionId}`)
		if (res.ok) {
			return await res.json()
		}
		return []
	} catch (error) {
		console.error('Error fetching sessions:', error)
		return []
	}
}

/**
 * Fetch programs by institution and session
 */
export async function fetchPrograms(institutionId: string, sessionId: string): Promise<Program[]> {
	try {
		const res = await fetch(`/api/exam-management/exam-attendance/dropdowns?type=programs&institution_id=${institutionId}&session_id=${sessionId}`)
		if (res.ok) {
			return await res.json()
		}
		return []
	} catch (error) {
		console.error('Error fetching programs:', error)
		return []
	}
}

/**
 * Fetch session types (FN/AN) by institution, session, program, and exam date
 */
export async function fetchSessionTypes(
	institutionId: string,
	sessionId: string,
	programCode: string,
	examDate: string
): Promise<ExamDate[]> {
	try {
		console.log('Frontend: Fetching session types with params:', { institutionId, sessionId, programCode, examDate })
		const res = await fetch(
			`/api/exam-management/exam-attendance/dropdowns?type=session_types&institution_id=${institutionId}&session_id=${sessionId}&program_code=${programCode}&exam_date=${examDate}`
		)
		console.log('Frontend: Session types API response status:', res.status)

		if (res.ok) {
			const data = await res.json()
			console.log('Frontend: Received session types:', data)
			return data
		}

		const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
		console.error('Frontend: Session types API error:', errorData)
		throw new Error(errorData.error || 'Failed to fetch session types')
	} catch (error) {
		console.error('Error fetching session types:', error)
		throw error
	}
}

/**
 * Fetch courses by institution, session, program, exam date, and session type
 */
export async function fetchCourses(
	institutionId: string,
	sessionId: string,
	programCode: string,
	examDate: string,
	sessionType: string
): Promise<CourseOffering[]> {
	try {
		console.log('Frontend: Fetching courses with params:', { institutionId, sessionId, programCode, examDate, sessionType })
		const res = await fetch(
			`/api/exam-management/exam-attendance/dropdowns?type=courses&institution_id=${institutionId}&session_id=${sessionId}&program_code=${programCode}&exam_date=${examDate}&session_type=${sessionType}`
		)
		console.log('Frontend: Courses API response status:', res.status)

		if (res.ok) {
			const data = await res.json()
			console.log('Frontend: Received courses:', data)
			return data
		}

		const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
		console.error('Frontend: Courses API error:', errorData)
		throw new Error(errorData.error || 'Failed to fetch courses')
	} catch (error) {
		console.error('Error fetching courses:', error)
		throw error
	}
}

/**
 * Check if attendance exists and load existing records
 */
export async function checkAttendance(
	institutionId: string,
	sessionId: string,
	courseCode: string,
	examDate: string,
	sessionType: string,
	programCode: string
): Promise<{ exists: boolean; data: any[] }> {
	const res = await fetch(
		`/api/exam-management/exam-attendance?mode=check&institution_id=${institutionId}&examination_session_id=${sessionId}&course_code=${courseCode}&exam_date=${examDate}&session=${sessionType}&program_code=${programCode}`
	)

	if (!res.ok) {
		throw new Error('Failed to check attendance')
	}

	return await res.json()
}

/**
 * Load student list for new attendance
 */
export async function loadStudents(
	institutionId: string,
	sessionId: string,
	courseCode: string,
	examDate: string,
	sessionType: string,
	programCode: string
): Promise<StudentRegistration[]> {
	const url = `/api/exam-management/exam-attendance?mode=list&institution_id=${institutionId}&examination_session_id=${sessionId}&course_code=${courseCode}&exam_date=${examDate}&session=${sessionType}&program_code=${programCode}`
	console.log('Loading students from:', url)

	const res = await fetch(url)

	if (!res.ok) {
		const errorData = await res.json().catch(() => ({ error: 'Failed to parse error response' }))
		console.error('Load students API error:', res.status, JSON.stringify(errorData, null, 2))
		const errorMsg = errorData.step
			? `${errorData.error} (Step: ${errorData.step})`
			: errorData.error || 'Failed to load student list'
		throw new Error(errorMsg)
	}

	return await res.json()
}

/**
 * Save attendance records
 */
export async function saveAttendance(payload: {
	institutions_id: string
	exam_session_code: string
	course_code: string
	exam_date: string
	session_code: string
	program_code: string
	attendance_records: AttendanceRecord[]
}): Promise<void> {
	console.log('Saving attendance with payload:', payload)

	const res = await fetch('/api/exam-management/exam-attendance', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	})

	console.log('Save attendance response status:', res.status)
	console.log('Save attendance response headers:', {
		contentType: res.headers.get('content-type'),
		contentLength: res.headers.get('content-length')
	})

	if (!res.ok) {
		// Try to get the response text first
		const responseText = await res.text()
		console.error('Save attendance error response text:', responseText)

		// Try to parse as JSON
		let errorData: any = {}
		try {
			errorData = JSON.parse(responseText)
		} catch (e) {
			console.error('Failed to parse error response as JSON:', e)
			errorData = { error: responseText || `HTTP ${res.status}: ${res.statusText}` }
		}

		console.error('Save attendance error data:', errorData)
		throw new Error(errorData.error || errorData.message || 'Failed to save attendance')
	}

	const successData = await res.json()
	console.log('Save attendance success:', successData)
}
