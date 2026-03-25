import { useState, useMemo, useCallback } from 'react'

interface FilterConfig<T> {
	field: keyof T
	operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'in'
	value: any
}

/**
 * Advanced filtering hook with multiple filter operations
 *
 * @example
 * const {
 *   filteredData,
 *   addFilter,
 *   removeFilter,
 *   clearFilters,
 *   activeFilters
 * } = useAdvancedFilter(courses)
 *
 * addFilter({ field: 'credits', operator: 'gte', value: 3 })
 * addFilter({ field: 'course_code', operator: 'contains', value: 'CS' })
 */
export function useAdvancedFilter<T>(data: T[]) {
	const [filters, setFilters] = useState<FilterConfig<T>[]>([])

	const addFilter = useCallback((filter: FilterConfig<T>) => {
		setFilters((prev) => [...prev, filter])
	}, [])

	const removeFilter = useCallback((index: number) => {
		setFilters((prev) => prev.filter((_, i) => i !== index))
	}, [])

	const clearFilters = useCallback(() => {
		setFilters([])
	}, [])

	const updateFilter = useCallback((index: number, filter: Partial<FilterConfig<T>>) => {
		setFilters((prev) =>
			prev.map((f, i) => (i === index ? { ...f, ...filter } : f))
		)
	}, [])

	const filteredData = useMemo(() => {
		if (filters.length === 0) return data

		return data.filter((item) => {
			return filters.every((filter) => {
				const itemValue = item[filter.field]

				switch (filter.operator) {
					case 'equals':
						return itemValue === filter.value

					case 'contains':
						return (
							itemValue != null &&
							String(itemValue).toLowerCase().includes(String(filter.value).toLowerCase())
						)

					case 'startsWith':
						return (
							itemValue != null &&
							String(itemValue).toLowerCase().startsWith(String(filter.value).toLowerCase())
						)

					case 'endsWith':
						return (
							itemValue != null &&
							String(itemValue).toLowerCase().endsWith(String(filter.value).toLowerCase())
						)

					case 'gt':
						return Number(itemValue) > Number(filter.value)

					case 'lt':
						return Number(itemValue) < Number(filter.value)

					case 'gte':
						return Number(itemValue) >= Number(filter.value)

					case 'lte':
						return Number(itemValue) <= Number(filter.value)

					case 'between':
						const [min, max] = filter.value as [number, number]
						return Number(itemValue) >= min && Number(itemValue) <= max

					case 'in':
						return Array.isArray(filter.value) && filter.value.includes(itemValue)

					default:
						return true
				}
			})
		})
	}, [data, filters])

	return {
		filteredData,
		filters,
		addFilter,
		removeFilter,
		updateFilter,
		clearFilters,
		activeFilters: filters.length
	}
}
