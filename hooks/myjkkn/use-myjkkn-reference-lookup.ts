/**
 * MyJKKN Reference Lookup Hook
 *
 * Hook for resolving MyJKKN UUIDs stored in local COE tables
 * to their full entity data from MyJKKN API.
 *
 * Features:
 * - Local cache lookup first (myjkkn_reference_cache table)
 * - Fetches from MyJKKN API if not cached
 * - Automatic cache population on fetch
 * - Batch lookups for efficiency
 *
 * ## Related Hooks for Institution Filtering
 *
 * This hook works alongside institution filtering hooks:
 * - `useInstitutionFilter` - For filtering local COE data by institution
 * - `useMyJKKNInstitutionFilter` - For filtering MyJKKN API data by institution
 *
 * ### Institution Field Visibility Pattern
 * When using with forms that have institution-dependent MyJKKN data:
 * ```tsx
 * const { mustSelectInstitution, shouldFilter, institutionId } = useInstitutionFilter()
 *
 * // Show institution field when:
 * // 1. "All Institutions" selected globally (mustSelectInstitution = true)
 * // 2. User can switch institutions (!shouldFilter || !institutionId)
 * // Hide when specific institution selected - auto-fill from context
 * {mustSelectInstitution || !shouldFilter || !institutionId ? (
 *   <InstitutionSelect ... />
 * ) : null}
 *
 * // Show Institution column in tables only when "All Institutions" selected
 * {mustSelectInstitution && <TableHead>Institution</TableHead>}
 *
 * // Add button should ALWAYS work - opens form directly
 * // User selects institution in form when mustSelectInstitution = true
 * ```
 *
 * Usage:
 * ```tsx
 * const { lookupProgram, lookupBatch, lookupMultiple } = useMyJKKNReferenceLookup()
 *
 * // Single lookup
 * const program = await lookupProgram(programId)
 *
 * // Multiple lookups of same type
 * const programs = await lookupMultiple(programIds, 'program')
 *
 * // Bulk resolve multiple entity types
 * const resolved = await bulkResolve({
 *   program_ids: ['uuid1', 'uuid2'],
 *   batch_ids: ['uuid3'],
 *   regulation_ids: ['uuid4']
 * })
 * ```
 */

'use client'

import { useCallback, useRef } from 'react'
import type {
	MyJKKNEntityType,
	ResolvedProgram,
	ResolvedSemester,
	ResolvedRegulation,
	ResolvedBatch,
	ResolvedLearnerProfile,
	ResolvedStaff,
	ResolvedDepartment,
	ResolvedInstitution,
	EntityTypeMap,
	MYJKKN_ENTITY_ENDPOINTS,
	MYJKKN_ENTITY_FIELDS,
} from '@/types/myjkkn-reference-cache'

// In-memory cache for current session
type CacheEntry = {
	data: Record<string, unknown>
	timestamp: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function useMyJKKNReferenceLookup() {
	// In-memory cache to avoid redundant API calls within the same session
	const memoryCache = useRef<Map<string, CacheEntry>>(new Map())

	/**
	 * Generate cache key for an entity
	 */
	const getCacheKey = (entityType: MyJKKNEntityType, id: string): string => {
		return `${entityType}:${id}`
	}

	/**
	 * Check if cache entry is still valid
	 */
	const isCacheValid = (entry: CacheEntry | undefined): boolean => {
		if (!entry) return false
		return Date.now() - entry.timestamp < CACHE_TTL
	}

	/**
	 * Get from memory cache
	 */
	const getFromMemoryCache = <T extends keyof EntityTypeMap>(
		entityType: T,
		id: string
	): EntityTypeMap[T] | null => {
		const key = getCacheKey(entityType, id)
		const entry = memoryCache.current.get(key)
		if (isCacheValid(entry)) {
			return entry!.data as EntityTypeMap[T]
		}
		return null
	}

	/**
	 * Set in memory cache
	 */
	const setInMemoryCache = (
		entityType: MyJKKNEntityType,
		id: string,
		data: Record<string, unknown>
	): void => {
		const key = getCacheKey(entityType, id)
		memoryCache.current.set(key, { data, timestamp: Date.now() })
	}

	/**
	 * Fetch entities from local cache API
	 */
	const fetchFromCache = async (
		ids: string[],
		entityType: MyJKKNEntityType
	): Promise<Map<string, Record<string, unknown>>> => {
		const result = new Map<string, Record<string, unknown>>()

		if (ids.length === 0) return result

		try {
			const params = new URLSearchParams()
			params.set('ids', ids.join(','))
			params.set('entity_type', entityType)

			const res = await fetch(`/api/myjkkn/reference-cache?${params.toString()}`)
			if (res.ok) {
				const response = await res.json()
				const data = response.data || {}

				for (const [id, entityData] of Object.entries(data)) {
					result.set(id, entityData as Record<string, unknown>)
					setInMemoryCache(entityType, id, entityData as Record<string, unknown>)
				}
			}
		} catch (error) {
			console.error('[useMyJKKNReferenceLookup] Error fetching from cache:', error)
		}

		return result
	}

	/**
	 * Fetch entities from MyJKKN API and cache them
	 */
	const fetchFromAPI = async (
		ids: string[],
		entityType: MyJKKNEntityType
	): Promise<Map<string, Record<string, unknown>>> => {
		const result = new Map<string, Record<string, unknown>>()

		if (ids.length === 0) return result

		const endpoints: Record<MyJKKNEntityType, string> = {
			program: '/api/myjkkn/programs',
			semester: '/api/myjkkn/semesters',
			regulation: '/api/myjkkn/regulations',
			batch: '/api/myjkkn/batches',
			learner_profile: '/api/myjkkn/learner-profiles',
			staff: '/api/myjkkn/staff',
			department: '/api/myjkkn/departments',
			institution: '/api/myjkkn/institutions',
		}

		const endpoint = endpoints[entityType]
		if (!endpoint) {
			console.error('[useMyJKKNReferenceLookup] Unknown entity type:', entityType)
			return result
		}

		try {
			// Fetch all data with high limit
			const params = new URLSearchParams()
			params.set('limit', '10000')
			params.set('is_active', 'true')

			const res = await fetch(`${endpoint}?${params.toString()}`)
			if (res.ok) {
				const response = await res.json()
				const data = response.data || response || []

				// Build lookup map by ID
				const allData = Array.isArray(data) ? data : []
				const idSet = new Set(ids)

				for (const item of allData) {
					if (item?.id && idSet.has(item.id)) {
						result.set(item.id, item)
						setInMemoryCache(entityType, item.id, item)
					}
				}

				// Cache the results in the database
				if (result.size > 0) {
					await cacheEntities(Array.from(result.entries()), entityType)
				}
			}
		} catch (error) {
			console.error('[useMyJKKNReferenceLookup] Error fetching from API:', error)
		}

		return result
	}

	/**
	 * Save entities to the cache table
	 */
	const cacheEntities = async (
		entries: [string, Record<string, unknown>][],
		entityType: MyJKKNEntityType
	): Promise<void> => {
		if (entries.length === 0) return

		const fieldMappings: Record<MyJKKNEntityType, { code: string; name: string }> = {
			program: { code: 'program_code', name: 'program_name' },
			semester: { code: 'semester_code', name: 'semester_name' },
			regulation: { code: 'regulation_code', name: 'regulation_name' },
			batch: { code: 'batch_code', name: 'batch_name' },
			learner_profile: { code: 'register_number', name: 'first_name' },
			staff: { code: 'staff_code', name: 'first_name' },
			department: { code: 'department_code', name: 'department_name' },
			institution: { code: 'institution_code', name: 'name' },
		}

		try {
			const fields = fieldMappings[entityType]
			const cacheData = entries.map(([id, data]) => ({
				myjkkn_id: id,
				entity_type: entityType,
				entity_code: data[fields.code] as string || null,
				entity_name: data[fields.name] as string || null,
				entity_data: data,
				institution_id: data.institution_id as string || null,
				is_active: data.is_active !== false,
			}))

			await fetch('/api/myjkkn/reference-cache', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items: cacheData }),
			})
		} catch (error) {
			console.error('[useMyJKKNReferenceLookup] Error caching entities:', error)
		}
	}

	/**
	 * Lookup multiple entities of the same type
	 */
	const lookupMultiple = useCallback(async <T extends MyJKKNEntityType>(
		ids: string[],
		entityType: T,
		forceRefresh = false
	): Promise<Map<string, EntityTypeMap[T]>> => {
		const result = new Map<string, EntityTypeMap[T]>()
		const idsToFetch: string[] = []

		// Filter out nulls and empties
		const validIds = ids.filter(id => id && typeof id === 'string')

		if (validIds.length === 0) return result

		// Check memory cache first (unless force refresh)
		if (!forceRefresh) {
			for (const id of validIds) {
				const cached = getFromMemoryCache(entityType, id)
				if (cached) {
					result.set(id, cached)
				} else {
					idsToFetch.push(id)
				}
			}
		} else {
			idsToFetch.push(...validIds)
		}

		// If all found in memory cache, return
		if (idsToFetch.length === 0) {
			return result
		}

		// Try local database cache
		const cachedData = await fetchFromCache(idsToFetch, entityType)
		const stillMissing: string[] = []

		for (const id of idsToFetch) {
			const cached = cachedData.get(id)
			if (cached) {
				result.set(id, cached as EntityTypeMap[T])
			} else {
				stillMissing.push(id)
			}
		}

		// Fetch remaining from API
		if (stillMissing.length > 0) {
			const apiData = await fetchFromAPI(stillMissing, entityType)
			for (const [id, data] of apiData) {
				result.set(id, data as EntityTypeMap[T])
			}
		}

		return result
	}, [])

	/**
	 * Lookup a single program
	 */
	const lookupProgram = useCallback(async (
		id: string | null | undefined,
		forceRefresh = false
	): Promise<ResolvedProgram | null> => {
		if (!id) return null
		const result = await lookupMultiple([id], 'program', forceRefresh)
		return result.get(id) || null
	}, [lookupMultiple])

	/**
	 * Lookup a single semester
	 */
	const lookupSemester = useCallback(async (
		id: string | null | undefined,
		forceRefresh = false
	): Promise<ResolvedSemester | null> => {
		if (!id) return null
		const result = await lookupMultiple([id], 'semester', forceRefresh)
		return result.get(id) || null
	}, [lookupMultiple])

	/**
	 * Lookup a single regulation
	 */
	const lookupRegulation = useCallback(async (
		id: string | null | undefined,
		forceRefresh = false
	): Promise<ResolvedRegulation | null> => {
		if (!id) return null
		const result = await lookupMultiple([id], 'regulation', forceRefresh)
		return result.get(id) || null
	}, [lookupMultiple])

	/**
	 * Lookup a single batch
	 */
	const lookupBatch = useCallback(async (
		id: string | null | undefined,
		forceRefresh = false
	): Promise<ResolvedBatch | null> => {
		if (!id) return null
		const result = await lookupMultiple([id], 'batch', forceRefresh)
		return result.get(id) || null
	}, [lookupMultiple])

	/**
	 * Lookup a single learner profile
	 */
	const lookupLearnerProfile = useCallback(async (
		id: string | null | undefined,
		forceRefresh = false
	): Promise<ResolvedLearnerProfile | null> => {
		if (!id) return null
		const result = await lookupMultiple([id], 'learner_profile', forceRefresh)
		return result.get(id) || null
	}, [lookupMultiple])

	/**
	 * Lookup a single staff member
	 */
	const lookupStaff = useCallback(async (
		id: string | null | undefined,
		forceRefresh = false
	): Promise<ResolvedStaff | null> => {
		if (!id) return null
		const result = await lookupMultiple([id], 'staff', forceRefresh)
		return result.get(id) || null
	}, [lookupMultiple])

	/**
	 * Lookup a single department
	 */
	const lookupDepartment = useCallback(async (
		id: string | null | undefined,
		forceRefresh = false
	): Promise<ResolvedDepartment | null> => {
		if (!id) return null
		const result = await lookupMultiple([id], 'department', forceRefresh)
		return result.get(id) || null
	}, [lookupMultiple])

	/**
	 * Lookup a single institution
	 */
	const lookupInstitution = useCallback(async (
		id: string | null | undefined,
		forceRefresh = false
	): Promise<ResolvedInstitution | null> => {
		if (!id) return null
		const result = await lookupMultiple([id], 'institution', forceRefresh)
		return result.get(id) || null
	}, [lookupMultiple])

	/**
	 * Bulk resolve multiple entity types at once
	 */
	const bulkResolve = useCallback(async (
		request: {
			program_ids?: string[]
			semester_ids?: string[]
			regulation_ids?: string[]
			batch_ids?: string[]
			learner_profile_ids?: string[]
			staff_ids?: string[]
			department_ids?: string[]
			institution_ids?: string[]
		},
		forceRefresh = false
	): Promise<{
		programs: Map<string, ResolvedProgram>
		semesters: Map<string, ResolvedSemester>
		regulations: Map<string, ResolvedRegulation>
		batches: Map<string, ResolvedBatch>
		learner_profiles: Map<string, ResolvedLearnerProfile>
		staff: Map<string, ResolvedStaff>
		departments: Map<string, ResolvedDepartment>
		institutions: Map<string, ResolvedInstitution>
	}> => {
		// Run all lookups in parallel
		const [
			programs,
			semesters,
			regulations,
			batches,
			learner_profiles,
			staff,
			departments,
			institutions,
		] = await Promise.all([
			request.program_ids?.length ? lookupMultiple(request.program_ids, 'program', forceRefresh) : Promise.resolve(new Map()),
			request.semester_ids?.length ? lookupMultiple(request.semester_ids, 'semester', forceRefresh) : Promise.resolve(new Map()),
			request.regulation_ids?.length ? lookupMultiple(request.regulation_ids, 'regulation', forceRefresh) : Promise.resolve(new Map()),
			request.batch_ids?.length ? lookupMultiple(request.batch_ids, 'batch', forceRefresh) : Promise.resolve(new Map()),
			request.learner_profile_ids?.length ? lookupMultiple(request.learner_profile_ids, 'learner_profile', forceRefresh) : Promise.resolve(new Map()),
			request.staff_ids?.length ? lookupMultiple(request.staff_ids, 'staff', forceRefresh) : Promise.resolve(new Map()),
			request.department_ids?.length ? lookupMultiple(request.department_ids, 'department', forceRefresh) : Promise.resolve(new Map()),
			request.institution_ids?.length ? lookupMultiple(request.institution_ids, 'institution', forceRefresh) : Promise.resolve(new Map()),
		])

		return {
			programs: programs as Map<string, ResolvedProgram>,
			semesters: semesters as Map<string, ResolvedSemester>,
			regulations: regulations as Map<string, ResolvedRegulation>,
			batches: batches as Map<string, ResolvedBatch>,
			learner_profiles: learner_profiles as Map<string, ResolvedLearnerProfile>,
			staff: staff as Map<string, ResolvedStaff>,
			departments: departments as Map<string, ResolvedDepartment>,
			institutions: institutions as Map<string, ResolvedInstitution>,
		}
	}, [lookupMultiple])

	/**
	 * Clear the in-memory cache
	 */
	const clearCache = useCallback((): void => {
		memoryCache.current.clear()
	}, [])

	return {
		// Single lookups
		lookupProgram,
		lookupSemester,
		lookupRegulation,
		lookupBatch,
		lookupLearnerProfile,
		lookupStaff,
		lookupDepartment,
		lookupInstitution,

		// Batch lookups
		lookupMultiple,
		bulkResolve,

		// Cache management
		clearCache,
	}
}

export default useMyJKKNReferenceLookup
