/**
 * Course Offering Service Layer
 *
 * This module consolidates all API calls for the course offering module.
 * It provides a clean interface for fetching and managing course offerings
 * and related entities (institutions, courses, sessions, programs).
 */

import type {
	CourseOffering,
	Institution,
	Course,
	ExaminationSession,
	Program,
	CourseOfferingPayload,
} from '@/types/course-offering'

/**
 * Fetch all course offerings
 * @returns Promise<CourseOffering[]>
 */
export async function fetchCourseOfferings(): Promise<CourseOffering[]> {
	try {
		const response = await fetch('/api/course-management/course-offering')
		if (!response.ok) {
			throw new Error('Failed to fetch course offers')
		}
		const data = await response.json()
		return data
	} catch (error) {
		console.error('Error fetching course offers:', error)
		return []
	}
}

/**
 * Fetch all institutions with mapping to clean interface
 * @returns Promise<Institution[]>
 */
export async function fetchInstitutions(): Promise<Institution[]> {
	try {
		const res = await fetch('/api/master/institutions')
		if (res.ok) {
			const data = await res.json()
			const mapped = Array.isArray(data)
				? data.filter((i: any) => i?.institution_code).map((i: any) => ({
					id: i.id,
					institution_code: i.institution_code,
					institution_name: i.institution_name || i.name
				}))
				: []
			return mapped
		}
		return []
	} catch (e) {
		console.error('Failed to load institutions:', e)
		return []
	}
}

/**
 * Fetch all courses via course-mapping API with institutions_id
 * @returns Promise<Course[]>
 */
export async function fetchCourses(): Promise<Course[]> {
	try {
		const res = await fetch('/api/course-management/course-mapping')
		if (res.ok) {
			const data = await res.json()
			const mapped = Array.isArray(data)
				? data.filter((c: any) => c?.course_code).map((c: any) => ({
					id: c.id,
					course_code: c.course_code,
					course_title: c.course_title,
					institutions_id: c.institutions_id
				}))
				: []
			return mapped
		}
		return []
	} catch (e) {
		console.error('Failed to load courses:', e)
		return []
	}
}

/**
 * Fetch all examination sessions with institutions_id
 * @returns Promise<ExaminationSession[]>
 */
export async function fetchExaminationSessions(): Promise<ExaminationSession[]> {
	try {
		const res = await fetch('/api/exam-management/examination-sessions')
		if (res.ok) {
			const data = await res.json()
			const mapped = Array.isArray(data)
				? data.filter((s: any) => s?.session_code).map((s: any) => ({
					id: s.id,
					session_code: s.session_code,
					session_name: s.session_name,
					institutions_id: s.institutions_id
				}))
				: []
			return mapped
		}
		return []
	} catch (e) {
		console.error('Failed to load examination sessions:', e)
		return []
	}
}

/**
 * Fetch all programs with institutions_id
 * @returns Promise<Program[]>
 */
export async function fetchPrograms(): Promise<Program[]> {
	try {
		const res = await fetch('/api/master/programs')
		if (res.ok) {
			const data = await res.json()
			const mapped = Array.isArray(data)
				? data.filter((p: any) => p?.program_code).map((p: any) => ({
					id: p.id,
					program_code: p.program_code,
					program_name: p.program_name,
					institutions_id: p.institutions_id
				}))
				: []
			return mapped
		}
		return []
	} catch (e) {
		console.error('Failed to load programs:', e)
		return []
	}
}

/**
 * Create a new course offering
 * @param payload - Course offering payload
 * @returns Promise<CourseOffering>
 */
export async function createCourseOffering(
	payload: CourseOfferingPayload
): Promise<CourseOffering> {
	const response = await fetch('/api/course-management/course-offering', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to create Course Offer')
	}

	return response.json()
}

/**
 * Update an existing course offering
 * @param id - Course offering ID
 * @param payload - Course offering payload
 * @returns Promise<CourseOffering>
 */
export async function updateCourseOffering(
	id: string,
	payload: CourseOfferingPayload
): Promise<CourseOffering> {
	const response = await fetch('/api/course-management/course-offering', {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ id, ...payload }),
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to update Course Offer')
	}

	return response.json()
}

/**
 * Delete a course offering by ID
 * @param id - Course offering ID
 * @returns Promise<void>
 */
export async function deleteCourseOffering(id: string): Promise<void> {
	const response = await fetch(`/api/course-management/course-offering/${id}`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to delete Course Offer')
	}
}

/**
 * Save course offering (create or update based on editing state)
 * @param payload - Course offering payload
 * @param id - Optional ID for update operation
 * @returns Promise<CourseOffering>
 */
export async function saveCourseOffering(
	payload: CourseOfferingPayload,
	id?: string
): Promise<CourseOffering> {
	if (id) {
		return updateCourseOffering(id, payload)
	} else {
		return createCourseOffering(payload)
	}
}
