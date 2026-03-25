import type {
	CourseMapping,
	Institution,
	Program,
	Course,
	Regulation,
	Semester
} from '@/types/course-mapping'

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
 * Fetch programs filtered by institution code
 */
export async function fetchPrograms(institutionCode: string): Promise<Program[]> {
	const response = await fetch(`/api/master/programs?institution_code=${institutionCode}`)

	if (!response.ok) {
		console.error('Error fetching programs:', response.status)
		return []
	}

	return response.json()
}

/**
 * Fetch semesters filtered by program code
 */
export async function fetchSemesters(programCode: string): Promise<Semester[]> {
	const response = await fetch(`/api/master/semesters?program_code=${programCode}`)

	if (!response.ok) {
		console.error('Error fetching semesters:', response.status)
		return []
	}

	return response.json()
}

/**
 * Fetch courses filtered by institution, department, and regulation
 */
export async function fetchCourses(
	institutionCode: string,
	offeringDepartmentCode?: string,
	regulationCode?: string
): Promise<Course[]> {
	let url = `/api/master/courses?institution_code=${institutionCode}`

	if (offeringDepartmentCode) {
		url += `&offering_department_code=${offeringDepartmentCode}`
	}

	if (regulationCode) {
		url += `&regulation_code=${regulationCode}`
	}

	const response = await fetch(url)

	if (!response.ok) {
		console.error('Error fetching courses:', response.status)
		return []
	}

	return response.json()
}

/**
 * Fetch MyJKKN institution IDs by counselling_code (two-step lookup)
 * MyJKKN may have multiple institutions (self/SF and aided) for the same counselling_code
 * @param counsellingCode - The institution's counselling_code from COE
 * @returns Promise<string[]> - Array of MyJKKN institution UUIDs
 */
async function fetchMyJKKNInstitutionIds(counsellingCode: string): Promise<string[]> {
	try {
		// Fetch all active institutions (search param may not be supported by MyJKKN API)
		const params = new URLSearchParams()
		params.set('limit', '500')
		params.set('is_active', 'true')

		const res = await fetch(`/api/myjkkn/institutions?${params.toString()}`)
		if (res.ok) {
			const response = await res.json()
			const data = response.data || response || []
			// Filter institutions that match the counselling_code exactly (client-side filter)
			// MyJKKN uses counselling_code field to store the institution code
			const matchingInstitutions = Array.isArray(data)
				? data.filter((inst: any) => inst?.counselling_code === counsellingCode && inst.is_active !== false)
				: []

			console.log('[CourseMappingService] fetchMyJKKNInstitutionIds:', { counsellingCode, found: matchingInstitutions.length })

			return matchingInstitutions.map((inst: any) => inst.id)
		}
		return []
	} catch (error) {
		console.error('[CourseMappingService] Error fetching MyJKKN institution IDs:', error)
		return []
	}
}

/**
 * Fetch regulations from MyJKKN API using two-step lookup:
 * 1. Get MyJKKN institution ID(s) by counselling_code
 * 2. Fetch regulations filtered by institution_id
 *
 * @param counsellingCode - Institution's counselling_code for MyJKKN API filtering
 */
export async function fetchRegulations(
	counsellingCode?: string
): Promise<Regulation[]> {
	try {
		// If no counselling code provided, fetch all active regulations
		if (!counsellingCode) {
			const params = new URLSearchParams()
			params.set('limit', '1000')
			params.set('is_active', 'true')

			const response = await fetch(`/api/myjkkn/regulations?${params.toString()}`)
			if (!response.ok) {
				console.error('Error fetching regulations from MyJKKN:', response.status)
				return []
			}

			const data = await response.json()
			const regulations = data.data || data || []
			return Array.isArray(regulations)
				? regulations.filter((r: any) => r?.regulation_code && r.is_active !== false).map((r: any) => ({
					...r,
					regulation_name: r.regulation_name || r.name || r.regulation_code
				}))
				: []
		}

		// Step 1: Get MyJKKN institution IDs by counselling_code
		const myjkknInstitutionIds = await fetchMyJKKNInstitutionIds(counsellingCode)

		console.log('[CourseMappingService] MyJKKN institution IDs for', counsellingCode, ':', myjkknInstitutionIds)

		if (myjkknInstitutionIds.length === 0) {
			console.warn('[CourseMappingService] No MyJKKN institutions found for counsellingCode:', counsellingCode)
			return []
		}

		// Step 2: Fetch regulations for each institution ID and combine results
		const allRegulations: Regulation[] = []
		const seenCodes = new Set<string>() // Deduplicate by regulation_code, not id

		for (const myjkknInstId of myjkknInstitutionIds) {
			const params = new URLSearchParams()
			params.set('limit', '1000')
			params.set('is_active', 'true')
			params.set('institution_id', myjkknInstId)

			console.log('[CourseMappingService] Fetching regulations for institution_id:', myjkknInstId)

			const response = await fetch(`/api/myjkkn/regulations?${params.toString()}`)
			if (response.ok) {
				const data = await response.json()
				const regulations = data.data || data || []
				// Client-side filter by institution_id since MyJKKN API may not filter server-side
				const mapped = Array.isArray(regulations)
					? regulations
						.filter((r: any) => r?.regulation_code && r.is_active !== false && r.institution_id === myjkknInstId)
						.map((r: any) => ({
							...r,
							regulation_name: r.regulation_name || r.name || r.regulation_code
						}))
					: []

				console.log('[CourseMappingService] Regulations for institution', myjkknInstId, ':', mapped.length, 'of', regulations.length, 'total')

				// Add unique regulations by regulation_code (avoid duplicates across aided/self-financing)
				for (const reg of mapped) {
					if (!seenCodes.has(reg.regulation_code)) {
						seenCodes.add(reg.regulation_code)
						allRegulations.push(reg)
					}
				}
			}
		}

		console.log('[CourseMappingService] Total filtered regulations:', allRegulations.length)
		return allRegulations
	} catch (error) {
		console.error('[CourseMappingService] Error fetching regulations from MyJKKN:', error)
		return []
	}
}

/**
 * Fetch course by ID
 */
export async function fetchCourseById(courseId: string): Promise<Course | null> {
	const response = await fetch(`/api/master/courses?id=${courseId}`)

	if (!response.ok) {
		console.error('Error fetching course:', response.status)
		return null
	}

	const data = await response.json()
	return Array.isArray(data) ? data[0] : data
}

/**
 * Load existing course mappings for institution, program, and regulation
 */
export async function loadExistingMappings(
	institutionCode: string,
	programCode: string,
	regulationCode: string
): Promise<CourseMapping[]> {
	const response = await fetch(
		`/api/course-management/course-mapping?institution_code=${institutionCode}&program_code=${programCode}&regulation_code=${regulationCode}`
	)

	if (!response.ok) {
		console.error('Error loading course mappings:', response.status)
		return []
	}

	return response.json()
}

/**
 * Save course mappings (bulk create or update)
 */
export async function saveCourseMappings(
	mappings: CourseMapping[]
): Promise<{ success: boolean; error?: string }> {
	try {
		const response = await fetch('/api/course-management/course-mapping', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ bulk: true, mappings })
		})

		const payload = await response.json().catch(() => ({}))

		if (!response.ok) {
			throw new Error(payload?.error || 'Failed to save course mappings')
		}

		// Bulk API returns { success: [...], errors: [...], message: string }
		if (Array.isArray(payload?.success) && payload.success.length > 0) {
			return { success: true }
		}

		// If API returned validation / insert errors but still 200,
		// surface this as a failure so the UI does not show a false success.
		if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
			const firstError = payload.errors[0]
			const message =
				typeof firstError?.error === 'string'
					? firstError.error
					: payload.message || 'Failed to save course mappings'

			return {
				success: false,
				error: message
			}
		}

		// Fallback: no explicit success array – treat as failure with generic message
		return {
			success: false,
			error: payload?.message || 'Failed to save course mappings'
		}
	} catch (error) {
		console.error('Error saving course mappings:', error)
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to save course mappings'
		}
	}
}

/**
 * Delete a course mapping by ID
 */
export async function deleteCourseMapping(id: string): Promise<void> {
	const response = await fetch(`/api/course-management/course-mapping/${id}`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		throw new Error(errorData.error || 'Failed to delete course mapping')
	}
}
