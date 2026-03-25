'use client'

import { useCallback, useMemo } from 'react'
import { useInstitution, InstitutionFilter } from '@/context/institution-context'

/**
 * Institution Filter Hook
 *
 * A dedicated hook for applying institution-based filtering across all pages.
 * Provides utilities for filtering data by institution in API calls and local filtering.
 *
 * ## Key Properties for UI Visibility Control
 *
 * ### `mustSelectInstitution`
 * - Returns `true` when "All Institutions" is selected globally (super_admin viewing all)
 * - Returns `false` when a specific institution is selected
 *
 * ### UI Pattern: Institution Field Visibility in Forms
 * ```tsx
 * // Show institution field when:
 * // 1. "All Institutions" selected globally (mustSelectInstitution = true) - user picks in form
 * // 2. User can switch institutions (!shouldFilter || !institutionId)
 * // Hide when a specific institution is already selected - auto-fill from context
 * {mustSelectInstitution || !shouldFilter || !institutionId ? (
 *   <InstitutionSelect ... />
 * ) : null}
 * ```
 *
 * ### UI Pattern: Institution Column Visibility in Tables
 * ```tsx
 * // Show Institution column only when "All Institutions" is selected globally
 * // Hide when a specific institution is selected (no need to show - all same institution)
 * {mustSelectInstitution && (
 *   <TableHead>Institution</TableHead>
 * )}
 * ```
 *
 * ### UI Pattern: Add Button Behavior
 * ```tsx
 * // Add button should ALWAYS work - opens form directly without blocking
 * // When mustSelectInstitution = true, user selects institution in the form
 * // When mustSelectInstitution = false, institution auto-fills from context
 * <Button onClick={() => { resetForm(); setSheetOpen(true) }}>
 *   Add
 * </Button>
 * ```
 *
 * @example
 * ```tsx
 * // In a page component
 * const {
 *   filter,           // { institution_code?: string, institutions_id?: string }
 *   queryString,      // "institution_code=CAS&institutions_id=uuid"
 *   shouldFilter,     // true if filtering is active
 *   isReady,          // true when context is initialized
 *   institutionCode,  // current institution code or null
 *   institutionId,    // current institution id or null
 *   appendToUrl,      // (url) => url with query params
 *   filterData,       // (data, key) => filtered array
 *   mustSelectInstitution, // true when "All Institutions" selected globally
 * } = useInstitutionFilter()
 *
 * // Fetch with filter
 * useEffect(() => {
 *   if (!isReady) return
 *   const url = appendToUrl('/api/courses')
 *   fetch(url).then(...)
 * }, [filter, isReady])
 *
 * // Or filter local data
 * const filteredItems = filterData(items, 'institution_code')
 * ```
 */
export function useInstitutionFilter() {
	const {
		institutionFilter,
		shouldFilter,
		queryParams,
		currentInstitutionCode,
		currentInstitutionId,
		currentMyJKKNInstitutionIds,
		isLoading,
		isInitialized,
		canSwitchInstitution,
		selectedInstitution
	} = useInstitution()

	/**
	 * Whether the filter context is ready to use
	 * Wait for this before making API calls
	 */
	const isReady = useMemo(() => !isLoading && isInitialized, [isLoading, isInitialized])

	/**
	 * Append institution filter to a URL
	 * @param url - Base URL (with or without existing query params)
	 * @returns URL with institution filter params appended
	 */
	const appendToUrl = useCallback((url: string): string => {
		if (!shouldFilter || !queryParams) return url

		const separator = url.includes('?') ? '&' : '?'
		return `${url}${separator}${queryParams}`
	}, [shouldFilter, queryParams])

	/**
	 * Build fetch options with institution filter in body
	 * @param body - Request body object
	 * @returns Body with institution filter merged
	 */
	const mergeWithBody = useCallback(<T extends Record<string, unknown>>(body: T): T & InstitutionFilter => {
		if (!shouldFilter) return body as T & InstitutionFilter
		return { ...body, ...institutionFilter }
	}, [shouldFilter, institutionFilter])

	/**
	 * Filter an array of data by institution
	 * @param data - Array of items to filter
	 * @param key - Key to match against institution_code (default: 'institution_code')
	 * @returns Filtered array
	 */
	const filterData = useCallback(<T extends Record<string, unknown>>(
		data: T[],
		key: keyof T = 'institution_code' as keyof T
	): T[] => {
		if (!shouldFilter || !currentInstitutionCode) return data
		return data.filter(item => item[key] === currentInstitutionCode)
	}, [shouldFilter, currentInstitutionCode])

	/**
	 * Check if an item belongs to the current institution
	 * @param item - Item to check
	 * @param key - Key to match against institution_code
	 * @returns true if item belongs to current institution or no filter is active
	 */
	const belongsToInstitution = useCallback(<T extends Record<string, unknown>>(
		item: T,
		key: keyof T = 'institution_code' as keyof T
	): boolean => {
		if (!shouldFilter || !currentInstitutionCode) return true
		return item[key] === currentInstitutionCode
	}, [shouldFilter, currentInstitutionCode])

	/**
	 * Get the institution code to use for creating new records
	 * Returns null if super_admin hasn't selected an institution
	 */
	const getInstitutionCodeForCreate = useCallback((): string | null => {
		if (canSwitchInstitution && !selectedInstitution) {
			// Super admin must select an institution before creating records
			return null
		}
		return currentInstitutionCode
	}, [canSwitchInstitution, selectedInstitution, currentInstitutionCode])

	/**
	 * Get the institution ID to use for creating new records
	 * Returns null if super_admin hasn't selected an institution
	 */
	const getInstitutionIdForCreate = useCallback((): string | null => {
		if (canSwitchInstitution && !selectedInstitution) {
			return null
		}
		return currentInstitutionId
	}, [canSwitchInstitution, selectedInstitution, currentInstitutionId])

	/**
	 * Check if "All Institutions" is selected globally
	 * (Only applies to super_admin viewing "All Institutions")
	 *
	 * Use this flag to:
	 * - Show/hide Institution column in tables (show when true)
	 * - Show/hide Institution field in forms (show when true, user selects in form)
	 * - Add button should ALWAYS work regardless of this flag
	 *
	 * @returns true when "All Institutions" is selected globally
	 * @returns false when a specific institution is selected
	 */
	const mustSelectInstitution = useMemo(() => {
		return canSwitchInstitution && !selectedInstitution
	}, [canSwitchInstitution, selectedInstitution])

	/**
	 * Get the MyJKKN institution IDs to use for MyJKKN API filtering
	 * Returns null if super_admin hasn't selected an institution
	 */
	const getMyJKKNInstitutionIdsForCreate = useCallback((): string[] | null => {
		if (canSwitchInstitution && !selectedInstitution) {
			return null
		}
		return currentMyJKKNInstitutionIds
	}, [canSwitchInstitution, selectedInstitution, currentMyJKKNInstitutionIds])

	return {
		// Core filter values
		filter: institutionFilter,
		queryString: queryParams,
		shouldFilter,
		isReady,

		// Current institution info
		institutionCode: currentInstitutionCode,
		institutionId: currentInstitutionId,
		myjkknInstitutionIds: currentMyJKKNInstitutionIds,

		// Utility functions
		appendToUrl,
		mergeWithBody,
		filterData,
		belongsToInstitution,

		// For create operations
		getInstitutionCodeForCreate,
		getInstitutionIdForCreate,
		getMyJKKNInstitutionIdsForCreate,
		mustSelectInstitution,

		// Loading state
		isLoading,
		isInitialized
	}
}

/**
 * Type for the return value of useInstitutionFilter
 */
export type UseInstitutionFilterReturn = ReturnType<typeof useInstitutionFilter>
