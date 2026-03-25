import type {
	ExamTimetable,
	ExamTimetableFormData,
	Institution,
	ExaminationSession,
	Program,
	Semester,
	Board,
} from '@/types/exam_timetable'

/**
 * Fetch all institutions
 */
export async function fetchInstitutions(): Promise<Institution[]> {
	const response = await fetch('/api/master/institutions')

	if (!response.ok) {
		console.error('Error fetching institutions:', response.status)
		return []
	}

	return response.json()
}

/**
 * Fetch all examination sessions
 */
export async function fetchExaminationSessions(): Promise<ExaminationSession[]> {
	const response = await fetch('/api/exam-management/examination-sessions')

	if (!response.ok) {
		console.error('Error fetching examination sessions:', response.status)
		return []
	}

	return response.json()
}

/**
 * Fetch all programs
 */
export async function fetchPrograms(): Promise<Program[]> {
	const response = await fetch('/api/master/programs')

	if (!response.ok) {
		console.error('Error fetching programs:', response.status)
		return []
	}

	return response.json()
}

/**
 * Fetch all semesters
 */
export async function fetchSemesters(): Promise<Semester[]> {
	const response = await fetch('/api/master/semesters')

	if (!response.ok) {
		console.error('Error fetching semesters:', response.status)
		return []
	}

	return response.json()
}

/**
 * Fetch all boards
 * @param institutionCode - Optional filter by institution code
 */
export async function fetchBoards(institutionCode?: string): Promise<Board[]> {
	const url = institutionCode
		? `/api/master/boards?institution_code=${institutionCode}`
		: '/api/master/boards'
	const response = await fetch(url)
	if (!response.ok) {
		console.error('Error fetching boards:', response.status)
		return []
	}
	return response.json()
}

/**
 * Fetch all exam timetables
 * @param examinationSessionId - Optional filter by examination session
 */
export async function fetchExamTimetables(
	examinationSessionId?: string
): Promise<ExamTimetable[]> {
	const url = examinationSessionId
		? `/api/exam-management/exam-timetables?examination_session_id=${examinationSessionId}`
		: '/api/exam-management/exam-timetables'

	const response = await fetch(url)

	if (!response.ok) {
		console.error('Error fetching exam timetables:', response.status)
		return []
	}

	return response.json()
}

/**
 * Fetch course offerings for generating exam timetable
 * @param institutionsId - Required institution ID
 * @param examinationSessionId - Optional examination session ID
 * @param programId - Optional program ID
 */
export async function fetchCourseOfferings(
	institutionsId: string,
	examinationSessionId?: string,
	programId?: string
): Promise<any[]> {
	const params = new URLSearchParams()
	params.append('institutions_id', institutionsId)

	if (examinationSessionId) {
		params.append('examination_session_id', examinationSessionId)
	}

	if (programId) {
		params.append('program_id', programId)
	}

	const response = await fetch(`/api/course-management/course-offering?${params.toString()}`)

	if (!response.ok) {
		throw new Error('Failed to fetch course offerings')
	}

	return response.json()
}

/**
 * Fetch exam registrations for student counts
 * @param examinationSessionId - Examination session ID
 */
export async function fetchExamRegistrations(
	examinationSessionId: string
): Promise<any[]> {
	const response = await fetch(
		`/api/exam-management/exam-registrations?examination_session_id=${examinationSessionId}`
	)

	if (!response.ok) {
		console.error('Error fetching exam registrations:', response.status)
		return []
	}

	return response.json()
}

/**
 * Create a new exam timetable
 * @param data - Exam timetable form data
 */
export async function createExamTimetable(
	data: ExamTimetableFormData
): Promise<ExamTimetable> {
	const response = await fetch('/api/exam-management/exam-timetables', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to create exam timetable')
	}

	return response.json()
}

/**
 * Update an existing exam timetable
 * @param id - Exam timetable ID
 * @param data - Exam timetable form data
 */
export async function updateExamTimetable(
	id: string,
	data: ExamTimetableFormData
): Promise<ExamTimetable> {
	const response = await fetch('/api/exam-management/exam-timetables', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id, ...data }),
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to update exam timetable')
	}

	return response.json()
}

/**
 * Delete an exam timetable by ID
 * @param id - Exam timetable ID
 */
export async function deleteExamTimetable(id: string): Promise<void> {
	const response = await fetch(`/api/exam-management/exam-timetables/${id}`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to delete exam timetable')
	}
}

/**
 * Save exam timetable (create or update)
 * @param data - Exam timetable form data with optional ID
 */
export async function saveExamTimetable(
	data: ExamTimetableFormData & { id?: string }
): Promise<ExamTimetable> {
	if (data.id) {
		return updateExamTimetable(data.id, data)
	} else {
		return createExamTimetable(data)
	}
}
