import type {
	ExamRegistration,
	ExamRegistrationFormData,
	InstitutionOption,
	StudentOption,
	ExaminationSessionOption,
	CourseOfferingOption
} from '@/types/exam-registrations'

// Fetch all exam registrations
export async function fetchExamRegistrations(): Promise<ExamRegistration[]> {
	const response = await fetch('/api/exam-management/exam-registrations?pageSize=10000')
	if (!response.ok) {
		throw new Error('Failed to fetch exam registrations')
	}
	const result = await response.json()
	// Handle both paginated and non-paginated responses
	return Array.isArray(result) ? result : result.data || []
}

// Create new exam registration
export async function createExamRegistration(data: ExamRegistrationFormData): Promise<ExamRegistration> {
	const payload = {
		...data,
		fee_amount: data.fee_amount ? Number(data.fee_amount) : null,
		payment_date: data.payment_date || null,
		payment_transaction_id: data.payment_transaction_id || null,
		remarks: data.remarks || null,
		approved_by: data.approved_by || null,
		approved_date: data.approved_date || null,
	}

	const response = await fetch('/api/exam-management/exam-registrations', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to create exam registration')
	}

	return response.json()
}

// Update existing exam registration
export async function updateExamRegistration(id: string, data: ExamRegistrationFormData): Promise<ExamRegistration> {
	const payload = {
		...data,
		fee_amount: data.fee_amount ? Number(data.fee_amount) : null,
		payment_date: data.payment_date || null,
		payment_transaction_id: data.payment_transaction_id || null,
		remarks: data.remarks || null,
		approved_by: data.approved_by || null,
		approved_date: data.approved_date || null,
	}

	const response = await fetch('/api/exam-management/exam-registrations', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id, ...payload })
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to update exam registration')
	}

	return response.json()
}

// Delete exam registration
export async function deleteExamRegistration(id: string): Promise<void> {
	const response = await fetch(`/api/exam-management/exam-registrations?id=${id}`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to delete exam registration')
	}
}

// Dropdown data services
export async function fetchInstitutions(): Promise<InstitutionOption[]> {
	try {
		const res = await fetch('/api/master/institutions?pageSize=10000')
		if (!res.ok) return []

		const result = await res.json()
		const data = Array.isArray(result) ? result : result.data || []
		return data.filter((i: any) => i?.institution_code).map((i: any) => ({
			id: i.id,
			institution_code: i.institution_code,
			name: i.name
		}))
	} catch (e) {
		console.error('Failed to load institutions:', e)
		return []
	}
}

export async function fetchStudents(): Promise<StudentOption[]> {
	// Note: This function is kept for backward compatibility
	// For new code, use fetchLearners() which fetches from MyJKKN API
	try {
		const res = await fetch('/api/users/learners?pageSize=10000')
		if (!res.ok) return []

		const result = await res.json()
		const data = Array.isArray(result) ? result : result.data || []
		return data.map((s: any) => ({
			id: s.id,
			roll_number: s.roll_number,
			register_number: s.register_number,
			first_name: s.first_name,
			last_name: s.last_name,
			institution_id: s.institution_id
		}))
	} catch (e) {
		console.error('Failed to load students:', e)
		return []
	}
}

/**
 * Fetch learners from MyJKKN API
 * This is the preferred method for getting learner data
 */
export async function fetchLearners(institutionCode?: string): Promise<StudentOption[]> {
	try {
		let url = '/api/myjkkn/learner-profiles?fetchAll=true'
		if (institutionCode) {
			url += `&institution_code=${encodeURIComponent(institutionCode)}`
		}

		const res = await fetch(url)
		if (!res.ok) return []

		const result = await res.json()
		const data = Array.isArray(result) ? result : result.data || []

		return data.map((s: any) => ({
			id: s.id,
			roll_number: s.roll_number || '',
			register_number: s.register_number || '',
			first_name: s.first_name || s.learner_name?.split(' ')[0] || '',
			last_name: s.last_name || s.learner_name?.split(' ').slice(1).join(' ') || '',
			institution_id: s.institution_id || '',
			institution_code: s.institution_code || '',
			program_code: s.program_code || '',
			current_semester: s.current_semester || null,
		}))
	} catch (e) {
		console.error('Failed to load learners from MyJKKN:', e)
		return []
	}
}

export async function fetchExaminationSessions(): Promise<ExaminationSessionOption[]> {
	try {
		const res = await fetch('/api/exam-management/examination-sessions?pageSize=10000')
		if (!res.ok) return []

		const result = await res.json()
		const data = Array.isArray(result) ? result : result.data || []
		return data.map((s: any) => ({
			id: s.id,
			session_code: s.session_code,
			session_name: s.session_name,
			institutions_id: s.institutions_id,
			programs_included: s.programs_included || []  // Include programs for validation
		}))
	} catch (e) {
		console.error('Failed to load examination sessions:', e)
		return []
	}
}

export async function fetchCourseOfferings(): Promise<CourseOfferingOption[]> {
	try {
		const res = await fetch('/api/course-management/course-offering?pageSize=10000')
		if (!res.ok) return []

		const result = await res.json()
		const data = Array.isArray(result) ? result : result.data || []
		return data.map((c: any) => ({
			id: c.id,
			course_code: c.course_code,
			course_name: c.course_name || c.course_title,
			institutions_id: c.institutions_id,
			examination_session_id: c.examination_session_id,  // For matching with session
			program_id: c.program_id,  // UUID for matching with session.programs_included
			program_code: c.course_program_code || c.program_code  // Code like "UMB", "BCA"
		}))
	} catch (e) {
		console.error('Failed to load course offerings:', e)
		return []
	}
}
