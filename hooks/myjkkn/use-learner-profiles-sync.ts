'use client'

/**
 * Hook for syncing MyJKKN Learner Profiles to local Supabase table
 *
 * This hook fetches learner profiles from MyJKKN API and syncs them
 * to the local learners_profiles table for fallback/caching.
 */

import { useState, useCallback } from 'react'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'

// =====================================================
// TYPES
// =====================================================

export interface LearnerProfile {
	id: string
	application_id?: string
	lifecycle_status: string
	first_name: string
	last_name?: string
	roll_number?: string
	register_number?: string
	college_email?: string
	student_email?: string
	student_mobile?: string
	date_of_birth?: string
	gender?: string
	institution_id?: string
	department_id?: string
	program_id?: string
	batch_id?: string
	semester_id?: string
	regulation_id?: string
	admission_year?: number
	is_profile_complete?: boolean
	created_at?: string
	updated_at?: string
}

export interface LearnerProfileStats {
	total: number
	active: number
	inactive: number
	profileComplete: number
	profileIncomplete: number
	byLifecycleStatus: Record<string, number>
	byAdmissionYear: Record<number, number>
	byDepartment: Record<string, number>
	byProgram: Record<string, number>
}

export interface SyncResult {
	success: boolean
	inserted: number
	updated: number
	skipped: number
	errors: number
	total: number
	message: string
}

export interface UseLearnerProfilesSyncOptions {
	autoFetch?: boolean
	limit?: number
}

export interface UseLearnerProfilesSyncResult {
	// Data
	profiles: LearnerProfile[]
	stats: LearnerProfileStats
	// Loading states
	loading: boolean
	syncing: boolean
	// Error handling
	error: string | null
	// Actions
	fetchProfiles: (options?: {
		institution_id?: string
		department_id?: string
		program_id?: string
		batch_id?: string
		admission_year?: number
		search?: string
	}) => Promise<LearnerProfile[]>
	syncToLocal: () => Promise<SyncResult>
	refetch: () => Promise<void>
	// Metadata
	metadata: {
		total: number
		page: number
		totalPages: number
		source: 'myjkkn' | 'supabase_fallback' | null
	} | null
}

// =====================================================
// HOOK IMPLEMENTATION
// =====================================================

export function useLearnerProfilesSync(
	options: UseLearnerProfilesSyncOptions = {}
): UseLearnerProfilesSyncResult {
	const { limit = 100000 } = options

	const { filter, shouldFilter, isLoading: institutionLoading } = useInstitutionFilter()

	const [profiles, setProfiles] = useState<LearnerProfile[]>([])
	const [stats, setStats] = useState<LearnerProfileStats>({
		total: 0,
		active: 0,
		inactive: 0,
		profileComplete: 0,
		profileIncomplete: 0,
		byLifecycleStatus: {},
		byAdmissionYear: {},
		byDepartment: {},
		byProgram: {},
	})
	const [loading, setLoading] = useState(false)
	const [syncing, setSyncing] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [metadata, setMetadata] = useState<{
		total: number
		page: number
		totalPages: number
		source: 'myjkkn' | 'supabase_fallback' | null
	} | null>(null)

	/**
	 * Calculate statistics from profiles
	 */
	const calculateStats = useCallback((data: LearnerProfile[]): LearnerProfileStats => {
		const stats: LearnerProfileStats = {
			total: data.length,
			active: 0,
			inactive: 0,
			profileComplete: 0,
			profileIncomplete: 0,
			byLifecycleStatus: {},
			byAdmissionYear: {},
			byDepartment: {},
			byProgram: {},
		}

		for (const profile of data) {
			// Active/Inactive based on lifecycle_status
			const isActive = profile.lifecycle_status === 'active' ||
				profile.lifecycle_status === 'studying' ||
				profile.lifecycle_status === 'enrolled'
			if (isActive) {
				stats.active++
			} else {
				stats.inactive++
			}

			// Profile completeness
			if (profile.is_profile_complete) {
				stats.profileComplete++
			} else {
				stats.profileIncomplete++
			}

			// By lifecycle status
			const status = profile.lifecycle_status || 'unknown'
			stats.byLifecycleStatus[status] = (stats.byLifecycleStatus[status] || 0) + 1

			// By admission year
			if (profile.admission_year) {
				stats.byAdmissionYear[profile.admission_year] = (stats.byAdmissionYear[profile.admission_year] || 0) + 1
			}

			// By department
			if (profile.department_id) {
				stats.byDepartment[profile.department_id] = (stats.byDepartment[profile.department_id] || 0) + 1
			}

			// By program
			if (profile.program_id) {
				stats.byProgram[profile.program_id] = (stats.byProgram[profile.program_id] || 0) + 1
			}
		}

		return stats
	}, [])

	/**
	 * Fetch learner profiles from MyJKKN API
	 */
	const fetchProfiles = useCallback(async (fetchOptions?: {
		institution_id?: string
		department_id?: string
		program_id?: string
		batch_id?: string
		admission_year?: number
		search?: string
	}): Promise<LearnerProfile[]> => {
		try {
			setLoading(true)
			setError(null)

			const params = new URLSearchParams()
			params.set('limit', String(limit))

			// Apply institution filter if available
			if (shouldFilter && filter?.institution_id) {
				params.set('institution_id', filter.institution_id)
			}

			// Apply additional filters
			if (fetchOptions?.institution_id) params.set('institution_id', fetchOptions.institution_id)
			if (fetchOptions?.department_id) params.set('department_id', fetchOptions.department_id)
			if (fetchOptions?.program_id) params.set('program_id', fetchOptions.program_id)
			if (fetchOptions?.batch_id) params.set('batch_id', fetchOptions.batch_id)
			if (fetchOptions?.admission_year) params.set('admission_year', String(fetchOptions.admission_year))
			if (fetchOptions?.search) params.set('search', fetchOptions.search)

			const res = await fetch(`/api/myjkkn/learner-profiles?${params.toString()}`)

			if (!res.ok) {
				const errorData = await res.json().catch(() => ({}))
				throw new Error(errorData.error || 'Failed to fetch learner profiles')
			}

			const response = await res.json()
			const data = response.data || response || []
			const profilesData = Array.isArray(data) ? data : []

			setProfiles(profilesData)
			setStats(calculateStats(profilesData))
			setMetadata({
				total: response.metadata?.total || profilesData.length,
				page: response.metadata?.page || 1,
				totalPages: response.metadata?.totalPages || 1,
				source: response.source || 'myjkkn',
			})

			return profilesData
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to fetch profiles'
			setError(errorMessage)
			console.error('[useLearnerProfilesSync] Error:', err)
			return []
		} finally {
			setLoading(false)
		}
	}, [limit, shouldFilter, filter, calculateStats])

	/**
	 * Sync profiles from MyJKKN to local Supabase table
	 */
	const syncToLocal = useCallback(async (): Promise<SyncResult> => {
		try {
			setSyncing(true)
			setError(null)

			const params = new URLSearchParams()
			if (shouldFilter && filter?.institution_id) {
				params.set('institution_id', filter.institution_id)
			}

			const res = await fetch(`/api/myjkkn/learner-profiles/sync?${params.toString()}`, {
				method: 'POST',
			})

			if (!res.ok) {
				const errorData = await res.json().catch(() => ({}))
				throw new Error(errorData.error || 'Sync failed')
			}

			const result = await res.json()

			// Refresh profiles after sync
			await fetchProfiles()

			return {
				success: true,
				inserted: result.inserted || 0,
				updated: result.updated || 0,
				skipped: result.skipped || 0,
				errors: result.errors || 0,
				total: result.total || 0,
				message: result.message || 'Sync completed successfully',
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Sync failed'
			setError(errorMessage)
			return {
				success: false,
				inserted: 0,
				updated: 0,
				skipped: 0,
				errors: 1,
				total: 0,
				message: errorMessage,
			}
		} finally {
			setSyncing(false)
		}
	}, [shouldFilter, filter, fetchProfiles])

	/**
	 * Refetch profiles
	 */
	const refetch = useCallback(async () => {
		await fetchProfiles()
	}, [fetchProfiles])

	return {
		profiles,
		stats,
		loading: loading || institutionLoading,
		syncing,
		error,
		fetchProfiles,
		syncToLocal,
		refetch,
		metadata,
	}
}

export default useLearnerProfilesSync
