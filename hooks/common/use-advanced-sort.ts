import { useState, useMemo, useCallback } from 'react'

type SortDirection = 'asc' | 'desc'

interface SortConfig<T> {
	field: keyof T
	direction: SortDirection
}

/**
 * Advanced sorting hook with multi-column support
 *
 * @example
 * const {
 *   sortedData,
 *   sortBy,
 *   addSort,
 *   removeSort,
 *   clearSort
 * } = useAdvancedSort(courses, { field: 'course_code', direction: 'asc' })
 *
 * sortBy('credits', 'desc')
 * addSort('course_title', 'asc') // Multi-column sort
 */
export function useAdvancedSort<T>(
	data: T[],
	initialSort?: SortConfig<T>
) {
	const [sortConfigs, setSortConfigs] = useState<SortConfig<T>[]>(
		initialSort ? [initialSort] : []
	)

	// Sort by single field (replaces existing sorts)
	const sortBy = useCallback((field: keyof T, direction: SortDirection = 'asc') => {
		setSortConfigs([{ field, direction }])
	}, [])

	// Add additional sort (multi-column sorting)
	const addSort = useCallback((field: keyof T, direction: SortDirection = 'asc') => {
		setSortConfigs((prev) => {
			// Remove existing sort for this field if present
			const filtered = prev.filter((config) => config.field !== field)
			return [...filtered, { field, direction }]
		})
	}, [])

	// Remove sort for a specific field
	const removeSort = useCallback((field: keyof T) => {
		setSortConfigs((prev) => prev.filter((config) => config.field !== field))
	}, [])

	// Toggle sort direction for a field
	const toggleSort = useCallback((field: keyof T) => {
		setSortConfigs((prev) => {
			const existing = prev.find((config) => config.field === field)

			if (!existing) {
				// No existing sort for this field, add ascending
				return [{ field, direction: 'asc' as SortDirection }]
			}

			if (existing.direction === 'asc') {
				// Change to descending
				return prev.map((config) =>
					config.field === field
						? { ...config, direction: 'desc' as SortDirection }
						: config
				)
			}

			// Remove sort for this field
			return prev.filter((config) => config.field !== field)
		})
	}, [])

	// Clear all sorts
	const clearSort = useCallback(() => {
		setSortConfigs([])
	}, [])

	// Apply sorting
	const sortedData = useMemo(() => {
		if (sortConfigs.length === 0) return data

		return [...data].sort((a, b) => {
			for (const config of sortConfigs) {
				const aVal = a[config.field]
				const bVal = b[config.field]

				if (aVal == null && bVal == null) continue
				if (aVal == null) return 1
				if (bVal == null) return -1

				let comparison = 0

				if (typeof aVal === 'string' && typeof bVal === 'string') {
					comparison = aVal.localeCompare(bVal)
				} else if (typeof aVal === 'number' && typeof bVal === 'number') {
					comparison = aVal - bVal
				} else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
					comparison = aVal === bVal ? 0 : aVal ? 1 : -1
				} else if (aVal instanceof Date && bVal instanceof Date) {
					comparison = aVal.getTime() - bVal.getTime()
				} else {
					comparison = String(aVal).localeCompare(String(bVal))
				}

				if (comparison !== 0) {
					return config.direction === 'asc' ? comparison : -comparison
				}
			}

			return 0
		})
	}, [data, sortConfigs])

	return {
		sortedData,
		sortConfigs,
		sortBy,
		addSort,
		removeSort,
		toggleSort,
		clearSort,
		isSorted: sortConfigs.length > 0
	}
}
