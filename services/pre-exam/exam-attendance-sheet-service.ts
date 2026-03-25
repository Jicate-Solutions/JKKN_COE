/**
 * Exam Attendance Sheet Service Layer
 *
 * Provides API calls for the pre-exam attendance sheet page.
 * Dropdown flow: Institution → Exam Session → Exam Date → Session (FN/AN) → Generate PDF
 */

import type { AttendanceSheetApiResponse } from '@/types/exam-attendance-sheet'

/**
 * Fetch institutions (reuses exam-attendance dropdowns endpoint)
 */
export async function fetchInstitutions(appendToUrl: (url: string) => string): Promise<any[]> {
	const url = appendToUrl('/api/exam-management/exam-attendance/dropdowns?type=institutions')
	const res = await fetch(url)
	if (!res.ok) throw new Error('Failed to fetch institutions')
	return res.json()
}

/**
 * Fetch examination sessions by institution
 */
export async function fetchSessions(institutionId: string): Promise<any[]> {
	const res = await fetch(`/api/exam-management/exam-attendance/dropdowns?type=sessions&institution_id=${institutionId}`)
	if (!res.ok) throw new Error('Failed to fetch sessions')
	return res.json()
}

/**
 * Fetch unique exam dates for a session (all programs, not filtered by TODAY)
 * Uses exam_timetables to find all published dates
 */
export async function fetchExamDates(institutionId: string, sessionId: string): Promise<any[]> {
	const res = await fetch(
		`/api/pre-exam/exam-attendance-sheet/dates?institution_id=${institutionId}&examination_session_id=${sessionId}`
	)
	if (!res.ok) throw new Error('Failed to fetch exam dates')
	return res.json()
}

/**
 * Fetch available sessions (FN/AN) for a specific exam date
 */
export async function fetchSessionTypes(institutionId: string, sessionId: string, examDate: string): Promise<any[]> {
	const res = await fetch(
		`/api/pre-exam/exam-attendance-sheet/sessions?institution_id=${institutionId}&examination_session_id=${sessionId}&exam_date=${examDate}`
	)
	if (!res.ok) throw new Error('Failed to fetch session types')
	return res.json()
}

/**
 * Generate attendance sheet data (bulk fetch all programs × subjects for a date + session)
 * @param batchTimetableId - optional, filters to a specific practical batch
 */
export async function fetchAttendanceSheetData(
	institutionId: string,
	examinationSessionId: string,
	examDate: string,
	session: string,
	batchTimetableId?: string
): Promise<AttendanceSheetApiResponse> {
	let url = `/api/pre-exam/exam-attendance-sheet?institution_id=${institutionId}&examination_session_id=${examinationSessionId}&exam_date=${examDate}&session=${session}`
	if (batchTimetableId) {
		url += `&batch_timetable_id=${batchTimetableId}`
	}
	const res = await fetch(url)
	if (!res.ok) {
		const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
		throw new Error(errorData.error || 'Failed to fetch attendance sheet data')
	}
	return res.json()
}
