/**
 * Grade System Service Layer
 *
 * This module consolidates all API calls for the grade system module.
 * It provides a clean interface for fetching and managing grade systems
 * and related entities (institutions, regulations, grades).
 */

import type {
	GradeSystem,
	Institution,
	Regulation,
	Grade,
	GradeSystemPayload,
} from '@/types/grade-system'

/**
 * Fetch all grade systems
 * @returns Promise<GradeSystem[]>
 */
export async function fetchGradeSystems(): Promise<GradeSystem[]> {
	try {
		const response = await fetch('/api/grading/grade-system')
		if (!response.ok) {
			throw new Error('Failed to fetch grade systems')
		}
		const data = await response.json()
		return data
	} catch (error) {
		console.error('Error fetching grade systems:', error)
		return []
	}
}

/**
 * Fetch all institutions with mapping to clean interface
 * @returns Promise<Institution[]>
 */
export async function fetchInstitutions(): Promise<(Institution & { counselling_code?: string | null })[]> {
	try {
		const res = await fetch('/api/master/institutions')
		if (res.ok) {
			const data = await res.json()
			const mapped = Array.isArray(data)
				? data.filter((i: any) => i?.institution_code).map((i: any) => ({
					id: i.id,
					institution_code: i.institution_code,
					name: i.institution_name || i.name,
					counselling_code: i.counselling_code || null
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

			console.log('[GradeSystemService] fetchMyJKKNInstitutionIds:', { counsellingCode, found: matchingInstitutions.length })

			return matchingInstitutions.map((inst: any) => inst.id)
		}
		return []
	} catch (error) {
		console.error('[GradeSystemService] Error fetching MyJKKN institution IDs:', error)
		return []
	}
}

/**
 * Fetch all regulations from MyJKKN API with mapping to clean interface
 * Uses two-step lookup:
 * 1. Get MyJKKN institution ID(s) by counselling_code
 * 2. Fetch regulations filtered by institution_id
 *
 * @param counsellingCode - Optional institution counselling_code to filter regulations
 * @returns Promise<Regulation[]>
 */
export async function fetchRegulations(counsellingCode?: string): Promise<Regulation[]> {
	try {
		// If no counselling code provided, fetch all active regulations
		if (!counsellingCode) {
			const params = new URLSearchParams()
			params.set('limit', '1000')
			params.set('is_active', 'true')

			const res = await fetch(`/api/myjkkn/regulations?${params.toString()}`)
			if (res.ok) {
				const response = await res.json()
				const data = response.data || response || []
				return Array.isArray(data)
					? data.filter((r: any) => r?.regulation_code && r.is_active !== false).map((r: any) => ({
						id: r.id,
						regulation_code: r.regulation_code,
						name: r.regulation_name || r.name,
						effective_year: r.effective_year
					}))
					: []
			}
			return []
		}

		// Step 1: Get MyJKKN institution IDs by counselling_code
		const myjkknInstitutionIds = await fetchMyJKKNInstitutionIds(counsellingCode)

		console.log('[GradeSystemService] MyJKKN institution IDs for', counsellingCode, ':', myjkknInstitutionIds)

		if (myjkknInstitutionIds.length === 0) {
			console.warn('[GradeSystemService] No MyJKKN institutions found for counsellingCode:', counsellingCode)
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

			console.log('[GradeSystemService] Fetching regulations for institution_id:', myjkknInstId)

			const res = await fetch(`/api/myjkkn/regulations?${params.toString()}`)
			if (res.ok) {
				const response = await res.json()
				const data = response.data || response || []
				// Client-side filter by institution_id since MyJKKN API may not filter server-side
				const regulations = Array.isArray(data)
					? data
						.filter((r: any) => r?.regulation_code && r.is_active !== false && r.institution_id === myjkknInstId)
						.map((r: any) => ({
							id: r.id,
							regulation_code: r.regulation_code,
							name: r.regulation_name || r.name,
							effective_year: r.effective_year
						}))
					: []

				console.log('[GradeSystemService] Regulations for institution', myjkknInstId, ':', regulations.length, 'of', data.length, 'total')

				// Add unique regulations by regulation_code (avoid duplicates across aided/self-financing)
				for (const reg of regulations) {
					if (!seenCodes.has(reg.regulation_code)) {
						seenCodes.add(reg.regulation_code)
						allRegulations.push(reg)
					}
				}
			}
		}

		console.log('[GradeSystemService] Total filtered regulations:', allRegulations.length)
		return allRegulations
	} catch (e) {
		console.error('[GradeSystemService] Failed to load regulations from MyJKKN:', e)
		return []
	}
}

/**
 * Fetch all grades with mapping to clean interface
 * @param institutionId - Optional institution ID to filter grades
 * @returns Promise<Grade[]>
 */
export async function fetchGrades(institutionId?: string): Promise<Grade[]> {
	try {
		let url = '/api/grading/grades'
		if (institutionId) {
			url += `?institutions_id=${institutionId}`
		}
		const res = await fetch(url)
		if (res.ok) {
			const data = await res.json()
			const mapped = Array.isArray(data)
				? data.filter((i: any) => i?.grade).map((i: any) => ({
					id: i.id,
					grade: i.grade,
					grade_point: i.grade_point || 0,
					regulation_code: i.regulation_code || '',
				}))
				: []
			return mapped
		}
		return []
	} catch (e) {
		console.error('Failed to load grades:', e)
		return []
	}
}

/**
 * Create a new grade system
 * @param payload - Grade system payload
 * @returns Promise<GradeSystem>
 */
export async function createGradeSystem(
	payload: GradeSystemPayload
): Promise<GradeSystem> {
	const response = await fetch('/api/grading/grade-system', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to create Grade System')
	}

	return response.json()
}

/**
 * Update an existing grade system
 * @param id - Grade system ID
 * @param payload - Grade system payload
 * @returns Promise<GradeSystem>
 */
export async function updateGradeSystem(
	id: string,
	payload: GradeSystemPayload
): Promise<GradeSystem> {
	const response = await fetch('/api/grading/grade-system', {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ id, ...payload }),
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to update Grade System')
	}

	return response.json()
}

/**
 * Delete a grade system by ID
 * @param id - Grade system ID
 * @returns Promise<void>
 */
export async function deleteGradeSystem(id: string): Promise<void> {
	const response = await fetch(`/api/grade-system/${id}`, {
		method: 'DELETE',
	})

	if (!response.ok) {
		const errorData = await response.json()
		throw new Error(errorData.error || 'Failed to delete Grade System')
	}
}

/**
 * Save grade system (create or update based on editing state)
 * @param payload - Grade system payload
 * @param id - Optional ID for update operation
 * @returns Promise<GradeSystem>
 */
export async function saveGradeSystem(
	payload: GradeSystemPayload,
	id?: string
): Promise<GradeSystem> {
	if (id) {
		return updateGradeSystem(id, payload)
	} else {
		return createGradeSystem(payload)
	}
}
