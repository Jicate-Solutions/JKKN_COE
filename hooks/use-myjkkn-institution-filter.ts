/**
 * Hook for MyJKKN API Integration with Institution Filtering
 *
 * This hook uses the `myjkkn_institution_ids` array directly from the COE institutions table
 * to filter data from the MyJKKN API. No two-step lookup required!
 *
 * Pattern:
 * 1. Get institution from COE (includes `myjkkn_institution_ids: string[]`)
 * 2. Use those UUIDs directly to fetch from MyJKKN API
 * 3. Combine results from all institution IDs (Aided + Self-financing)
 * 4. Deduplicate by CODE field (e.g., `program_id`, `regulation_code`), NOT by `id`
 *
 * Key Constraints:
 * - MyJKKN API may ignore server-side `institution_id` filtering - always filter client-side
 * - Deduplicate by code field (e.g., `regulation_code`, `program_id`), NOT by `id`
 * - MyJKKN uses `program_id` as the CODE field (like "BCA"), not as a UUID
 */

import { useCallback } from 'react'

export interface MyJKKNInstitution {
	id: string
	counselling_code: string
	is_active?: boolean
	[key: string]: any
}

export interface MyJKKNRegulation {
	id: string
	regulation_code: string
	regulation_name?: string
	name?: string
	effective_year?: number
	institution_id: string
	is_active?: boolean
	[key: string]: any
}

export interface RegulationOption {
	id: string
	regulation_code: string
	regulation_name?: string
	regulation_year?: number
	effective_year?: number
}

export interface MyJKKNLearnerProfile {
	id: string
	first_name: string
	last_name?: string
	roll_number?: string
	register_number?: string
	college_email?: string
	student_email?: string
	student_mobile?: string
	institution_id?: string
	department_id?: string
	program_id?: string
	batch_id?: string
	admission_year?: number
	is_profile_complete?: boolean
	lifecycle_status?: string
	[key: string]: unknown
}

export interface LearnerProfileOption {
	id: string
	first_name: string
	last_name?: string
	full_name: string
	roll_number?: string
	register_number?: string
	college_email?: string
	student_email?: string
	student_mobile?: string
	department_id?: string
	program_id?: string
	batch_id?: string
	admission_year?: number
}

export interface MyJKKNProgram {
	id: string
	program_id?: string // CODE field (e.g., "BCA") - NOT a UUID!
	program_code?: string // Fallback code field
	program_name?: string
	name?: string
	institution_id: string
	department_id?: string
	degree_id?: string
	is_active?: boolean
	[key: string]: unknown
}

export interface ProgramOption {
	id: string
	program_code: string // The CODE (e.g., "BCA")
	program_name: string
	program_order?: number
	department_id?: string
	degree_id?: string
}

export interface MyJKKNSemester {
	id: string
	semester_number?: number
	semester_name?: string
	semester_code?: string
	name?: string
	program_id?: string
	institution_id?: string
	is_active?: boolean
	[key: string]: unknown
}

export interface SemesterOption {
	id: string
	semester_number?: number
	semester_order?: number
	semester_name: string
	semester_code?: string
	program_id?: string
}

export interface MyJKKNBatch {
	id: string
	batch_code?: string
	batch_name?: string
	name?: string
	start_year?: number
	end_year?: number
	program_id?: string
	regulation_id?: string
	institution_id?: string
	is_active?: boolean
	[key: string]: unknown
}

export interface BatchOption {
	id: string
	batch_code?: string
	batch_name: string
	start_year?: number
	end_year?: number
	program_id?: string
	regulation_id?: string
}

/**
 * Hook for MyJKKN institution filtering using myjkkn_institution_ids directly
 */
export function useMyJKKNInstitutionFilter() {
	/**
	 * Fetch regulations from MyJKKN API using myjkkn_institution_ids directly
	 *
	 * @param myjkknInstitutionIds - Array of MyJKKN institution UUIDs from COE institutions table
	 * @param requireFilter - If true and no IDs provided, return empty array
	 * @returns Promise<RegulationOption[]> - Array of unique regulations
	 */
	const fetchRegulations = useCallback(async (
		myjkknInstitutionIds?: string[],
		requireFilter: boolean = false
	): Promise<RegulationOption[]> => {
		try {
			// If filter is required but no IDs provided, return empty array
			if (requireFilter && (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0)) {
				return []
			}

			// If no institution IDs provided and filter not required (super admin), fetch all active regulations
			if (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0) {
				const params = new URLSearchParams()
				params.set('limit', '1000')
				params.set('is_active', 'true')

				const res = await fetch(`/api/myjkkn/regulations?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []

					// Deduplicate by regulation_code to avoid duplicates from different institutions
					const seenCodes = new Set<string>()
					const uniqueRegulations: RegulationOption[] = []

					if (Array.isArray(data)) {
						for (const r of data) {
							if (r?.regulation_code && r.is_active !== false && !seenCodes.has(r.regulation_code)) {
								seenCodes.add(r.regulation_code)
								uniqueRegulations.push({
									id: r.id,
									regulation_code: r.regulation_code,
									regulation_name: r.regulation_name || r.name,
									regulation_year: r.effective_year,
									effective_year: r.effective_year
								})
							}
						}
					}

					return uniqueRegulations
				}
				return []
			}

			console.log('[useMyJKKNInstitutionFilter] Fetching regulations for institution IDs:', myjkknInstitutionIds)

			// Fetch regulations for each institution ID and combine results
			const allRegulations: RegulationOption[] = []
			const seenCodes = new Set<string>() // Deduplicate by regulation_code, not id

			for (const myjkknInstId of myjkknInstitutionIds) {
				const params = new URLSearchParams()
				params.set('limit', '1000')
				params.set('is_active', 'true')
				params.set('institution_id', myjkknInstId)

				console.log('[useMyJKKNInstitutionFilter] Fetching regulations for institution_id:', myjkknInstId)

				const res = await fetch(`/api/myjkkn/regulations?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []

					// Client-side filter by institution_id since MyJKKN API may not filter server-side
					const regulations = Array.isArray(data)
						? data
							.filter((r: MyJKKNRegulation) =>
								r?.regulation_code && r.is_active !== false && r.institution_id === myjkknInstId
							)
							.map((r: MyJKKNRegulation) => ({
								id: r.id,
								regulation_code: r.regulation_code,
								regulation_name: r.regulation_name || r.name,
								regulation_year: r.effective_year,
								effective_year: r.effective_year
							}))
						: []

					console.log('[useMyJKKNInstitutionFilter] Regulations for institution', myjkknInstId, ':', regulations.length, 'of', data.length, 'total')

					// Add unique regulations by regulation_code (avoid duplicates across aided/self-financing)
					for (const reg of regulations) {
						if (!seenCodes.has(reg.regulation_code)) {
							seenCodes.add(reg.regulation_code)
							allRegulations.push(reg)
						}
					}
				}
			}

			console.log('[useMyJKKNInstitutionFilter] Total filtered regulations:', allRegulations.length)
			return allRegulations
		} catch (error) {
			console.error('[useMyJKKNInstitutionFilter] Error fetching regulations from MyJKKN:', error)
			return []
		}
	}, [])

	/**
	 * Fetch learner profiles from MyJKKN API using myjkkn_institution_ids directly
	 *
	 * @param myjkknInstitutionIds - Array of MyJKKN institution UUIDs
	 * @param options - Additional filter options
	 * @returns Promise<LearnerProfileOption[]> - Array of unique learner profiles
	 */
	const fetchLearnerProfiles = useCallback(async (
		myjkknInstitutionIds?: string[],
		options?: {
			department_id?: string
			program_id?: string
			batch_id?: string
			admission_year?: number
			search?: string
			limit?: number
			requireFilter?: boolean
		}
	): Promise<LearnerProfileOption[]> => {
		try {
			const { department_id, program_id, batch_id, admission_year, search, limit = 100000, requireFilter = false } = options || {}

			// If filter is required but no IDs provided, return empty array
			if (requireFilter && (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0)) {
				return []
			}

			// If no institution IDs provided and filter not required (super admin), fetch all learner profiles
			if (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0) {
				const params = new URLSearchParams()
				params.set('limit', String(limit))
				if (department_id) params.set('department_id', department_id)
				if (program_id) params.set('program_id', program_id)
				if (batch_id) params.set('batch_id', batch_id)
				if (admission_year) params.set('admission_year', String(admission_year))
				if (search) params.set('search', search)

				const res = await fetch(`/api/myjkkn/learner-profiles?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []
					return Array.isArray(data)
						? data.map((l: MyJKKNLearnerProfile) => ({
							id: l.id,
							first_name: l.first_name,
							last_name: l.last_name,
							full_name: `${l.first_name} ${l.last_name || ''}`.trim(),
							roll_number: l.roll_number,
							register_number: l.register_number,
							college_email: l.college_email,
							student_email: l.student_email,
							student_mobile: l.student_mobile,
							department_id: l.department_id,
							program_id: l.program_id,
							batch_id: l.batch_id,
							admission_year: l.admission_year
						}))
						: []
				}
				return []
			}

			console.log('[useMyJKKNInstitutionFilter] Fetching learner profiles for institution IDs:', myjkknInstitutionIds)

			// Fetch learner profiles for each institution ID and combine results
			const allLearners: LearnerProfileOption[] = []
			const seenIds = new Set<string>() // Deduplicate by id

			for (const myjkknInstId of myjkknInstitutionIds) {
				const params = new URLSearchParams()
				params.set('limit', String(limit))
				params.set('institution_id', myjkknInstId)
				if (department_id) params.set('department_id', department_id)
				if (program_id) params.set('program_id', program_id)
				if (batch_id) params.set('batch_id', batch_id)
				if (admission_year) params.set('admission_year', String(admission_year))
				if (search) params.set('search', search)

				console.log('[useMyJKKNInstitutionFilter] Fetching learner profiles for institution_id:', myjkknInstId)

				const res = await fetch(`/api/myjkkn/learner-profiles?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []

					// Client-side filter by institution_id since MyJKKN API may not filter server-side
					const learners = Array.isArray(data)
						? data
							.filter((l: MyJKKNLearnerProfile) => l?.id && l.institution_id === myjkknInstId)
							.map((l: MyJKKNLearnerProfile) => ({
								id: l.id,
								first_name: l.first_name,
								last_name: l.last_name,
								full_name: `${l.first_name} ${l.last_name || ''}`.trim(),
								roll_number: l.roll_number,
								register_number: l.register_number,
								college_email: l.college_email,
								student_email: l.student_email,
								student_mobile: l.student_mobile,
								department_id: l.department_id,
								program_id: l.program_id,
								batch_id: l.batch_id,
								admission_year: l.admission_year
							}))
						: []

					console.log('[useMyJKKNInstitutionFilter] Learner profiles for institution', myjkknInstId, ':', learners.length, 'of', data.length, 'total')

					// Add unique learners by id
					for (const learner of learners) {
						if (!seenIds.has(learner.id)) {
							seenIds.add(learner.id)
							allLearners.push(learner)
						}
					}
				}
			}

			console.log('[useMyJKKNInstitutionFilter] Total filtered learner profiles:', allLearners.length)
			return allLearners
		} catch (error) {
			console.error('[useMyJKKNInstitutionFilter] Error fetching learner profiles from MyJKKN:', error)
			return []
		}
	}, [])

	/**
	 * Fetch programs from MyJKKN API using myjkkn_institution_ids directly
	 * NOTE: MyJKKN uses `program_id` as the CODE field (e.g., "BCA"), NOT as a UUID!
	 *
	 * @param myjkknInstitutionIds - Array of MyJKKN institution UUIDs
	 * @param options - Additional filter options
	 * @returns Promise<ProgramOption[]> - Array of unique programs
	 */
	const fetchPrograms = useCallback(async (
		myjkknInstitutionIds?: string[],
		options?: { department_id?: string; degree_id?: string; requireFilter?: boolean }
	): Promise<ProgramOption[]> => {
		try {
			const { department_id, degree_id, requireFilter = false } = options || {}

			// If filter is required but no IDs provided, return empty array
			if (requireFilter && (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0)) {
				return []
			}

			if (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0) {
				const params = new URLSearchParams()
				params.set('limit', '1000')
				params.set('is_active', 'true')
				if (department_id) params.set('department_id', department_id)
				if (degree_id) params.set('degree_id', degree_id)

				const res = await fetch(`/api/myjkkn/programs?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []

					// Deduplicate by program_id (CODE field)
					const seenCodes = new Set<string>()
					const uniquePrograms: ProgramOption[] = []

					if (Array.isArray(data)) {
						for (const p of data) {
							// Use program_id as CODE field, fallback to program_code
							const programCode = p?.program_id || p?.program_code
							if (programCode && p.is_active !== false && !seenCodes.has(programCode)) {
								seenCodes.add(programCode)
								uniquePrograms.push({
									id: p.id,
									program_code: programCode,
									program_name: p.program_name || p.name || programCode,
									program_order: (p as any).program_order ?? (p as any).sort_order ?? 999,
									department_id: p.department_id,
									degree_id: p.degree_id
								})
							}
						}
					}

					// Sort by program_order (UEN=1, UHI=2, etc.), fallback to program_code
					uniquePrograms.sort((a, b) => {
						const orderA = a.program_order ?? 999
						const orderB = b.program_order ?? 999
						if (orderA !== orderB) return orderA - orderB
						return (a.program_code || '').localeCompare(b.program_code || '')
					})
					return uniquePrograms
				}
				return []
			}

			console.log('[useMyJKKNInstitutionFilter] Fetching programs for institution IDs:', myjkknInstitutionIds)

			const allPrograms: ProgramOption[] = []
			const seenCodes = new Set<string>() // Deduplicate by program_id (CODE field)

			for (const myjkknInstId of myjkknInstitutionIds) {
				const params = new URLSearchParams()
				params.set('limit', '1000')
				params.set('is_active', 'true')
				params.set('institution_id', myjkknInstId)
				if (department_id) params.set('department_id', department_id)
				if (degree_id) params.set('degree_id', degree_id)

				const res = await fetch(`/api/myjkkn/programs?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []

					// Client-side filter by institution_id
					const programs = Array.isArray(data)
						? data
							.filter((p: MyJKKNProgram) => {
								const programCode = p?.program_id || p?.program_code
								return programCode && p.is_active !== false && p.institution_id === myjkknInstId
							})
							.map((p: MyJKKNProgram) => {
								const programCode = p.program_id || p.program_code || ''
								return {
									id: p.id,
									program_code: programCode,
									program_name: p.program_name || p.name || programCode,
									program_order: (p as any).program_order ?? (p as any).sort_order ?? 999,
									department_id: p.department_id,
									degree_id: p.degree_id
								}
							})
						: []

					console.log('[useMyJKKNInstitutionFilter] Programs for institution', myjkknInstId, ':', programs.length, 'of', data.length, 'total')

					// Add unique programs by program_id/program_code (avoid duplicates across aided/self-financing)
					for (const prog of programs) {
						if (prog.program_code && !seenCodes.has(prog.program_code)) {
							seenCodes.add(prog.program_code)
							allPrograms.push(prog)
						}
					}
				}
			}

			console.log('[useMyJKKNInstitutionFilter] Total filtered programs:', allPrograms.length)

			// Sort by program_order (UEN=1, UHI=2, etc.), fallback to program_code
			allPrograms.sort((a, b) => {
				const orderA = a.program_order ?? 999
				const orderB = b.program_order ?? 999
				if (orderA !== orderB) return orderA - orderB
				return (a.program_code || '').localeCompare(b.program_code || '')
			})

			return allPrograms
		} catch (error) {
			console.error('[useMyJKKNInstitutionFilter] Error fetching programs:', error)
			return []
		}
	}, [])

	/**
	 * Fetch semesters from MyJKKN API using myjkkn_institution_ids directly
	 *
	 * @param myjkknInstitutionIds - Array of MyJKKN institution UUIDs
	 * @param options - Additional filter options
	 * @returns Promise<SemesterOption[]> - Array of semesters
	 */
	const fetchSemesters = useCallback(async (
		myjkknInstitutionIds?: string[],
		options?: { program_id?: string; program_code?: string; requireFilter?: boolean }
	): Promise<SemesterOption[]> => {
		try {
			const { program_id, program_code, requireFilter = false } = options || {}

			// If filter is required but no IDs provided, return empty array
			if (requireFilter && (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0)) {
				return []
			}

			if (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0) {
				const params = new URLSearchParams()
				params.set('limit', '1000')
				params.set('is_active', 'true')
				if (program_id) params.set('program_id', program_id)
				if (program_code) params.set('program_code', program_code)

				const res = await fetch(`/api/myjkkn/semesters?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []
					return Array.isArray(data)
						? data
							.filter((s: MyJKKNSemester) => {
								if (!s?.id || s.is_active === false) return false
								// Client-side filter by program_id (MyJKKN UUID) if provided
								if (program_id && s.program_id !== program_id) return false
								return true
							})
							.map((s: MyJKKNSemester) => {
								// Extract semester number from semester_code or semester_name if semester_number is missing
								let semesterNum = s.semester_number
								if (!semesterNum && s.semester_code) {
									const match = s.semester_code.match(/-(\d+)$/)
									if (match) semesterNum = parseInt(match[1])
								}
								if (!semesterNum && s.semester_name) {
									const romanMatch = s.semester_name.match(/\b(I|II|III|IV|V|VI|VII|VIII)\b/)
									if (romanMatch) {
										const romanMap: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8 }
										semesterNum = romanMap[romanMatch[1]]
									} else {
										const numMatch = s.semester_name.match(/\b(\d+)\b/)
										if (numMatch) semesterNum = parseInt(numMatch[1])
									}
								}

								return {
									id: s.id,
									semester_number: semesterNum,
									semester_name: s.semester_name || s.name || `Semester ${semesterNum || ''}`,
									semester_code: s.semester_code,
									program_id: s.program_id
								}
							})
						: []
				}
				return []
			}

			console.log('[useMyJKKNInstitutionFilter] Fetching semesters for institution IDs:', myjkknInstitutionIds)

			const allSemesters: SemesterOption[] = []
			const seenIds = new Set<string>()

			for (const myjkknInstId of myjkknInstitutionIds) {
				const params = new URLSearchParams()
				params.set('limit', '1000')
				params.set('is_active', 'true')
				params.set('institution_id', myjkknInstId)
				if (program_id) params.set('program_id', program_id)
				if (program_code) params.set('program_code', program_code)

				const res = await fetch(`/api/myjkkn/semesters?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []

					console.log('[useMyJKKNInstitutionFilter] Raw semester data for institution', myjkknInstId, ':', data.length, 'total')

					// Client-side filter by program_id UUID since MyJKKN API may not filter server-side
					const semesters = Array.isArray(data)
						? data
							.filter((s: MyJKKNSemester) => {
								if (!s?.id || s.is_active === false) return false
								// Filter by program_id (MyJKKN UUID) if provided
								if (program_id && s.program_id !== program_id) return false
								return true
							})
							.map((s: MyJKKNSemester) => {
								// Extract semester number from semester_code or semester_name if semester_number is missing
								let semesterNum = s.semester_number
								if (!semesterNum && s.semester_code) {
									const match = s.semester_code.match(/-(\d+)$/)
									if (match) semesterNum = parseInt(match[1])
								}
								if (!semesterNum && s.semester_name) {
									const romanMatch = s.semester_name.match(/\b(I|II|III|IV|V|VI|VII|VIII)\b/)
									if (romanMatch) {
										const romanMap: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8 }
										semesterNum = romanMap[romanMatch[1]]
									} else {
										const numMatch = s.semester_name.match(/\b(\d+)\b/)
										if (numMatch) semesterNum = parseInt(numMatch[1])
									}
								}

								return {
									id: s.id,
									semester_number: semesterNum,
									semester_name: s.semester_name || s.name || `Semester ${semesterNum || ''}`,
									semester_code: s.semester_code,
									program_id: s.program_id
								}
							})
						: []

					console.log('[useMyJKKNInstitutionFilter] Filtered semesters for program', program_id || 'all', ':', semesters.length)

					for (const sem of semesters) {
						if (!seenIds.has(sem.id)) {
							seenIds.add(sem.id)
							allSemesters.push(sem)
						}
					}
				}
			}

			return allSemesters
		} catch (error) {
			console.error('[useMyJKKNInstitutionFilter] Error fetching semesters:', error)
			return []
		}
	}, [])

	/**
	 * Fetch batches from MyJKKN API using myjkkn_institution_ids directly
	 *
	 * @param myjkknInstitutionIds - Array of MyJKKN institution UUIDs
	 * @param options - Additional filter options
	 * @returns Promise<BatchOption[]> - Array of batches
	 */
	const fetchBatches = useCallback(async (
		myjkknInstitutionIds?: string[],
		options?: { program_id?: string; regulation_id?: string; start_year?: number; requireFilter?: boolean }
	): Promise<BatchOption[]> => {
		try {
			const { program_id, regulation_id, start_year, requireFilter = false } = options || {}

			// If filter is required but no IDs provided, return empty array
			if (requireFilter && (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0)) {
				return []
			}

			if (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0) {
				const params = new URLSearchParams()
				params.set('limit', '1000')
				params.set('is_active', 'true')
				if (program_id) params.set('program_id', program_id)
				if (regulation_id) params.set('regulation_id', regulation_id)
				if (start_year) params.set('start_year', String(start_year))

				const res = await fetch(`/api/myjkkn/batches?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []
					return Array.isArray(data)
						? data
							.filter((b: MyJKKNBatch) => b?.id && b.is_active !== false)
							.map((b: MyJKKNBatch) => ({
								id: b.id,
								batch_code: b.batch_code,
								batch_name: b.batch_name || b.name || b.batch_code || `${b.start_year}-${b.end_year}`,
								start_year: b.start_year,
								end_year: b.end_year,
								program_id: b.program_id,
								regulation_id: b.regulation_id
							}))
						: []
				}
				return []
			}

			console.log('[useMyJKKNInstitutionFilter] Fetching batches for institution IDs:', myjkknInstitutionIds)

			const allBatches: BatchOption[] = []
			const seenIds = new Set<string>()

			for (const myjkknInstId of myjkknInstitutionIds) {
				const params = new URLSearchParams()
				params.set('limit', '1000')
				params.set('is_active', 'true')
				params.set('institution_id', myjkknInstId)
				if (program_id) params.set('program_id', program_id)
				if (regulation_id) params.set('regulation_id', regulation_id)
				if (start_year) params.set('start_year', String(start_year))

				const res = await fetch(`/api/myjkkn/batches?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []

					const batches = Array.isArray(data)
						? data
							.filter((b: MyJKKNBatch) => b?.id && b.is_active !== false && b.institution_id === myjkknInstId)
							.map((b: MyJKKNBatch) => ({
								id: b.id,
								batch_code: b.batch_code,
								batch_name: b.batch_name || b.name || b.batch_code || `${b.start_year}-${b.end_year}`,
								start_year: b.start_year,
								end_year: b.end_year,
								program_id: b.program_id,
								regulation_id: b.regulation_id
							}))
						: []

					for (const batch of batches) {
						if (!seenIds.has(batch.id)) {
							seenIds.add(batch.id)
							allBatches.push(batch)
						}
					}
				}
			}

			return allBatches
		} catch (error) {
			console.error('[useMyJKKNInstitutionFilter] Error fetching batches:', error)
			return []
		}
	}, [])

	/**
	 * Generic function to fetch and filter any MyJKKN data by institution
	 *
	 * @param endpoint - API endpoint (e.g., '/api/myjkkn/learners')
	 * @param myjkknInstitutionIds - Array of MyJKKN institution UUIDs
	 * @param deduplicateField - Field to use for deduplication (e.g., 'learner_code')
	 * @param requireFilter - If true and no IDs provided, return empty array
	 * @returns Promise<T[]> - Array of unique records
	 */
	const fetchFilteredData = useCallback(async <T extends { institution_id: string; is_active?: boolean }>(
		endpoint: string,
		myjkknInstitutionIds: string[],
		deduplicateField?: keyof T,
		requireFilter: boolean = false
	): Promise<T[]> => {
		try {
			// If filter is required but no IDs provided, return empty array
			if (requireFilter && (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0)) {
				return []
			}

			if (!myjkknInstitutionIds || myjkknInstitutionIds.length === 0) {
				console.warn('[useMyJKKNInstitutionFilter] No MyJKKN institution IDs provided')
				return []
			}

			// Fetch data for each institution ID and combine results
			const allData: T[] = []
			const seenKeys = new Set<string>()

			for (const myjkknInstId of myjkknInstitutionIds) {
				const params = new URLSearchParams()
				params.set('limit', '1000')
				params.set('is_active', 'true')
				params.set('institution_id', myjkknInstId)

				const res = await fetch(`${endpoint}?${params.toString()}`)
				if (res.ok) {
					const response = await res.json()
					const data = response.data || response || []

					// Client-side filter by institution_id
					const filtered = Array.isArray(data)
						? data.filter((item: T) => item.is_active !== false && item.institution_id === myjkknInstId)
						: []

					// Deduplicate if field specified
					if (deduplicateField) {
						for (const item of filtered) {
							const key = String(item[deduplicateField])
							if (!seenKeys.has(key)) {
								seenKeys.add(key)
								allData.push(item)
							}
						}
					} else {
						allData.push(...filtered)
					}
				}
			}

			return allData
		} catch (error) {
			console.error('[useMyJKKNInstitutionFilter] Error fetching filtered data:', error)
			return []
		}
	}, [])

	return {
		fetchRegulations,
		fetchLearnerProfiles,
		fetchPrograms,
		fetchSemesters,
		fetchBatches,
		fetchFilteredData
	}
}
