'use client'

import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/lib/auth/auth-context-parent'

/**
 * Institution data structure
 */
export interface Institution {
	id: string
	institution_code: string
	institution_name: string
	short_name?: string
	type?: string
	counselling_code?: string  // Required for MyJKKN API integration
	myjkkn_institution_ids?: string[] | null  // MyJKKN institution UUIDs for direct API filtering
	is_active?: boolean
}

/**
 * Institution filter type - memoized for stable references
 */
export type InstitutionFilter = { institution_code?: string; institutions_id?: string }

/**
 * Institution Context Type
 * Provides institution-aware data filtering across the application
 *
 * Performance optimizations:
 * - Memoized filter object to prevent unnecessary re-renders
 * - Cached institutions list with stale-while-revalidate pattern
 * - Debounced localStorage operations
 */
interface InstitutionContextType {
	// Current active institution (from user or selected)
	currentInstitution: Institution | null
	currentInstitutionCode: string | null
	currentInstitutionId: string | null
	currentCounsellingCode: string | null  // For MyJKKN API integration
	currentMyJKKNInstitutionIds: string[] | null  // For direct MyJKKN API filtering

	// For super_admin: ability to switch between institutions
	selectedInstitution: Institution | null
	availableInstitutions: Institution[]
	canSwitchInstitution: boolean

	// Loading states
	isLoading: boolean
	isInitialized: boolean
	error: string | null

	// Actions
	selectInstitution: (institution: Institution | null) => void
	clearInstitutionSelection: () => void
	refreshInstitutions: () => Promise<void>

	// Filtering helpers - memoized for performance
	institutionFilter: InstitutionFilter
	shouldFilter: boolean
	queryParams: string
}

const InstitutionContext = createContext<InstitutionContextType | undefined>(undefined)

interface InstitutionProviderProps {
	children: ReactNode
}

/**
 * InstitutionProvider
 *
 * Provides institution context for multi-tenant data filtering.
 *
 * Behavior:
 * - Regular users: Automatically filters data by their assigned institution
 * - Super admin: Can view all institutions or select specific one
 * - COE/Deputy COE: Filters by their assigned institution
 *
 * Usage:
 * ```tsx
 * const { currentInstitutionCode, getInstitutionFilter } = useInstitution()
 *
 * // In API calls:
 * const filter = getInstitutionFilter()
 * const response = await fetch(`/api/courses?${new URLSearchParams(filter)}`)
 * ```
 */
// Cache key for institutions (versioned to invalidate old cache)
const CACHE_KEY = 'institutions_cache_v3'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const SELECTED_KEY = 'selected_institution'

export function InstitutionProvider({ children }: InstitutionProviderProps) {
	const { user, isAuthenticated } = useAuth()

	const [availableInstitutions, setAvailableInstitutions] = useState<Institution[]>([])
	const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [isInitialized, setIsInitialized] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// Refs for preventing duplicate fetches and tracking mount state
	const fetchInProgressRef = useRef(false)
	const mountedRef = useRef(true)

	// Determine if user is super_admin (can see all institutions)
	const isSuperAdmin = useMemo(() => {
		if (!user) return false
		return user.role === 'super_admin' || user.roles?.includes('super_admin') || user.is_super_admin === true
	}, [user])

	// Determine if user can switch institutions
	const canSwitchInstitution = isSuperAdmin

	// Get user's assigned institution from auth context - memoized
	// Now uses full institution details fetched from sync-session API
	const userInstitution = useMemo((): Institution | null => {
		// Must have institution_id to identify the institution
		if (!user || !user.institution_id) return null

		// Return full institution details from session
		// institution_name falls back to institution_code if not available
		return {
			id: user.institution_id,
			institution_code: user.institution_code || '',
			institution_name: user.institution_name || user.institution_code || '',
			counselling_code: user.counselling_code,
			myjkkn_institution_ids: user.myjkkn_institution_ids,
			is_active: true
		}
	}, [user])

	// Current institution: selected (for super_admin) or user's assigned institution
	const currentInstitution = useMemo(() => {
		if (isSuperAdmin && selectedInstitution) {
			return selectedInstitution
		}
		return userInstitution
	}, [isSuperAdmin, selectedInstitution, userInstitution])

	// Memoize derived values
	const currentInstitutionCode = useMemo(() => currentInstitution?.institution_code || null, [currentInstitution])
	const currentInstitutionId = useMemo(() => currentInstitution?.id || null, [currentInstitution])
	const currentCounsellingCode = useMemo(() => currentInstitution?.counselling_code || null, [currentInstitution])
	const currentMyJKKNInstitutionIds = useMemo(() => currentInstitution?.myjkkn_institution_ids || null, [currentInstitution])

	// Memoized filter object - stable reference for useEffect dependencies
	const institutionFilter = useMemo((): InstitutionFilter => {
		if (isSuperAdmin && !selectedInstitution) {
			return {}
		}
		if (currentInstitutionCode) {
			const filter: InstitutionFilter = { institution_code: currentInstitutionCode }
			if (currentInstitutionId) {
				filter.institutions_id = currentInstitutionId
			}
			return filter
		}
		return {}
	}, [isSuperAdmin, selectedInstitution, currentInstitutionCode, currentInstitutionId])

	// Memoized shouldFilter boolean
	// For super_admin: filter only if they selected a specific institution
	// For non-super_admin: always filter (if no institution, they should see no data)
	const shouldFilter = useMemo((): boolean => {
		if (isSuperAdmin && !selectedInstitution) return false
		return true // Non-super admin always filters (even if no institution = empty results)
	}, [isSuperAdmin, selectedInstitution])

	// Memoized query params string
	const queryParams = useMemo((): string => {
		if (Object.keys(institutionFilter).length === 0) return ''
		return new URLSearchParams(institutionFilter as Record<string, string>).toString()
	}, [institutionFilter])

	// Restore persisted selection on mount (synchronous for fast initialization)
	useEffect(() => {
		if (isSuperAdmin && !isInitialized) {
			try {
				const persisted = localStorage.getItem(SELECTED_KEY)
				if (persisted) {
					const institution = JSON.parse(persisted)
					setSelectedInstitution(institution)
				}
			} catch {
				localStorage.removeItem(SELECTED_KEY)
			}
		}
	}, [isSuperAdmin, isInitialized])

	// Fetch available institutions with caching
	const fetchInstitutions = useCallback(async (forceRefresh = false) => {
		if (!isAuthenticated) return
		if (fetchInProgressRef.current) return

		// Non-super_admin users only see their own institution
		if (!isSuperAdmin) {
			if (userInstitution) {
				setAvailableInstitutions([userInstitution])
			}
			setIsInitialized(true)
			return
		}

		// Check cache first (unless force refresh)
		if (!forceRefresh) {
			try {
				const cached = localStorage.getItem(CACHE_KEY)
				if (cached) {
					const { data, timestamp } = JSON.parse(cached)
					if (Date.now() - timestamp < CACHE_TTL) {
						setAvailableInstitutions(data)
						setIsInitialized(true)
						// Still fetch in background to update cache
						fetchInBackground()
						return
					}
				}
			} catch {
				localStorage.removeItem(CACHE_KEY)
			}
		}

		fetchInProgressRef.current = true
		setIsLoading(true)
		setError(null)

		try {
			const response = await fetch('/api/master/institutions', {
				credentials: 'include'
			})
			if (!response.ok) throw new Error('Failed to fetch institutions')

			const data = await response.json()
			// Map API response: prioritize LOCAL 'name' from COE database over myjkkn_name

			const institutions: Institution[] = (data || []).map((inst: Record<string, unknown>) => {
				// Extract all possible name fields
				const localName = inst.name as string | undefined  // Local COE database name
				const institutionCode = inst.institution_code as string
				const shortName = inst.short_name as string | undefined
				const counsellingCode = inst.counselling_code as string | undefined
				const myjkknInstitutionIds = inst.myjkkn_institution_ids as string[] | null | undefined

				// Priority: LOCAL name > institution_code (use COE database name, NOT myjkkn)
				const finalName = (localName && localName.trim()) || institutionCode

				return {
					id: inst.id as string,
					institution_code: institutionCode,
					institution_name: finalName,
					short_name: (shortName && shortName.trim()) || undefined,
					type: inst.type as string,
					counselling_code: counsellingCode,
					myjkkn_institution_ids: myjkknInstitutionIds || null,
					is_active: inst.is_active as boolean
				}
			})

			if (mountedRef.current) {
				setAvailableInstitutions(institutions)
				// Cache the result
				try {
					localStorage.setItem(CACHE_KEY, JSON.stringify({ data: institutions, timestamp: Date.now() }))
				} catch {
					// Ignore localStorage errors
				}
			}
		} catch (err) {
			console.error('Failed to fetch institutions:', err)
			if (mountedRef.current) {
				setError(err instanceof Error ? err.message : 'Failed to load institutions')
			}
		} finally {
			if (mountedRef.current) {
				setIsLoading(false)
				setIsInitialized(true)
			}
			fetchInProgressRef.current = false
		}
	}, [isAuthenticated, isSuperAdmin, userInstitution])

	// Background fetch for stale-while-revalidate
	const fetchInBackground = useCallback(async () => {
		if (!isAuthenticated || !isSuperAdmin || fetchInProgressRef.current) return

		try {
			const response = await fetch('/api/master/institutions', {
				credentials: 'include'
			})
			if (!response.ok) return

			const data = await response.json()
			// Map API response: prioritize LOCAL 'name' from COE database
			const institutions: Institution[] = (data || []).map((inst: Record<string, unknown>) => {
				const localName = inst.name as string | undefined  // Local COE database name
				const institutionCode = inst.institution_code as string
				const shortName = inst.short_name as string | undefined
				const counsellingCode = inst.counselling_code as string | undefined
				const myjkknInstitutionIds = inst.myjkkn_institution_ids as string[] | null | undefined

				// Priority: LOCAL name > institution_code (use COE database name, NOT myjkkn)
				const finalName = (localName && localName.trim()) || institutionCode

				return {
					id: inst.id as string,
					institution_code: institutionCode,
					institution_name: finalName,
					short_name: (shortName && shortName.trim()) || undefined,
					type: inst.type as string,
					counselling_code: counsellingCode,
					myjkkn_institution_ids: myjkknInstitutionIds || null,
					is_active: inst.is_active as boolean
				}
			})

			if (mountedRef.current) {
				setAvailableInstitutions(institutions)
				try {
					localStorage.setItem(CACHE_KEY, JSON.stringify({ data: institutions, timestamp: Date.now() }))
				} catch {
					// Ignore
				}
			}
		} catch {
			// Silent fail for background fetch
		}
	}, [isAuthenticated, isSuperAdmin])

	// Fetch institutions on mount
	useEffect(() => {
		mountedRef.current = true
		if (isAuthenticated) {
			fetchInstitutions()
		}
		return () => {
			mountedRef.current = false
		}
	}, [isAuthenticated, fetchInstitutions])

	// Select institution (for super_admin)
	const selectInstitution = useCallback((institution: Institution | null) => {
		if (!canSwitchInstitution) {
			console.warn('User cannot switch institutions')
			return
		}
		setSelectedInstitution(institution)

		// Persist selection asynchronously
		requestAnimationFrame(() => {
			try {
				if (institution) {
					localStorage.setItem(SELECTED_KEY, JSON.stringify(institution))
				} else {
					localStorage.removeItem(SELECTED_KEY)
				}
			} catch {
				// Ignore localStorage errors
			}
		})
	}, [canSwitchInstitution])

	// Clear institution selection (super_admin sees all)
	const clearInstitutionSelection = useCallback(() => {
		setSelectedInstitution(null)
		requestAnimationFrame(() => {
			try {
				localStorage.removeItem(SELECTED_KEY)
			} catch {
				// Ignore
			}
		})
	}, [])

	// Refresh institutions list
	const refreshInstitutions = useCallback(async () => {
		await fetchInstitutions(true)
	}, [fetchInstitutions])

	// Memoize context value to prevent unnecessary re-renders
	const value = useMemo<InstitutionContextType>(() => ({
		currentInstitution,
		currentInstitutionCode,
		currentInstitutionId,
		currentCounsellingCode,
		currentMyJKKNInstitutionIds,
		selectedInstitution,
		availableInstitutions,
		canSwitchInstitution,
		isLoading,
		isInitialized,
		error,
		selectInstitution,
		clearInstitutionSelection,
		refreshInstitutions,
		institutionFilter,
		shouldFilter,
		queryParams
	}), [
		currentInstitution,
		currentInstitutionCode,
		currentInstitutionId,
		currentCounsellingCode,
		currentMyJKKNInstitutionIds,
		selectedInstitution,
		availableInstitutions,
		canSwitchInstitution,
		isLoading,
		isInitialized,
		error,
		selectInstitution,
		clearInstitutionSelection,
		refreshInstitutions,
		institutionFilter,
		shouldFilter,
		queryParams
	])

	return (
		<InstitutionContext.Provider value={value}>
			{children}
		</InstitutionContext.Provider>
	)
}

/**
 * Hook to access institution context
 *
 * @example
 * ```tsx
 * const { currentInstitutionCode, institutionFilter } = useInstitution()
 *
 * // Filter data in API call
 * useEffect(() => {
 *   fetchData(institutionFilter)
 * }, [institutionFilter])
 * ```
 */
export function useInstitution() {
	const context = useContext(InstitutionContext)
	if (context === undefined) {
		throw new Error('useInstitution must be used within an InstitutionProvider')
	}
	return context
}

/**
 * Hook to get institution filter for data fetching
 * Returns memoized values for optimal performance
 *
 * @example
 * ```tsx
 * const { filter, shouldFilter, isLoading } = useInstitutionFilter()
 *
 * useEffect(() => {
 *   if (!isLoading) {
 *     fetchData(shouldFilter ? filter : undefined)
 *   }
 * }, [filter, shouldFilter, isLoading])
 * ```
 */
export function useInstitutionFilter() {
	const {
		institutionFilter,
		shouldFilter,
		queryParams,
		currentInstitutionCode,
		isLoading,
		isInitialized
	} = useInstitution()

	// Return memoized values directly - no need to call functions
	return useMemo(() => ({
		filter: institutionFilter,
		shouldFilter,
		queryParams,
		institutionCode: currentInstitutionCode,
		isLoading: isLoading || !isInitialized
	}), [institutionFilter, shouldFilter, queryParams, currentInstitutionCode, isLoading, isInitialized])
}

/**
 * Hook to check if user can manage specific institution
 *
 * @param institutionCode - Institution code to check
 * @returns boolean - true if user can manage this institution
 */
export function useCanManageInstitution(institutionCode: string): boolean {
	const { currentInstitutionCode, canSwitchInstitution } = useInstitution()

	return useMemo(() => {
		// Super admin can manage any institution
		if (canSwitchInstitution) return true
		// Regular users can only manage their assigned institution
		return currentInstitutionCode === institutionCode
	}, [canSwitchInstitution, currentInstitutionCode, institutionCode])
}
