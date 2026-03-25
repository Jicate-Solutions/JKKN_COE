import { useState, useMemo, useCallback } from 'react'

interface UseDataTableOptions<T> {
  data: T[]
  initialPageSize?: number
  initialSortField?: keyof T
  initialSortDirection?: 'asc' | 'desc'
  searchableFields?: (keyof T)[]
  filterableFields?: {
    field: keyof T
    options?: string[]
  }[]
}

interface DataTableState<T> {
  // Data
  paginatedData: T[]
  filteredData: T[]
  totalPages: number
  totalItems: number

  // Search
  searchTerm: string
  setSearchTerm: (term: string) => void

  // Sorting
  sortField: keyof T | null
  sortDirection: 'asc' | 'desc'
  handleSort: (field: keyof T) => void

  // Pagination
  currentPage: number
  pageSize: number
  setCurrentPage: (page: number) => void
  setPageSize: (size: number) => void
  goToPage: (page: number) => void
  nextPage: () => void
  prevPage: () => void
  canGoNext: boolean
  canGoPrev: boolean

  // Filters
  filters: Record<string, string>
  setFilter: (field: string, value: string) => void
  clearFilters: () => void

  // Selection
  selectedItems: Set<string>
  toggleSelection: (id: string) => void
  toggleSelectAll: () => void
  clearSelection: () => void
  isSelected: (id: string) => boolean
  isAllSelected: boolean

  // Utility
  reset: () => void
}

/**
 * Custom hook for managing data table state (search, sort, pagination, filters)
 *
 * @example
 * const {
 *   paginatedData,
 *   searchTerm,
 *   setSearchTerm,
 *   sortField,
 *   handleSort,
 *   currentPage,
 *   setCurrentPage,
 *   totalPages
 * } = useDataTable({
 *   data: courses,
 *   initialPageSize: 10,
 *   searchableFields: ['course_code', 'course_title'],
 * })
 */
export function useDataTable<T extends { id: string }>(
  options: UseDataTableOptions<T>
): DataTableState<T> {
  const {
    data,
    initialPageSize = 10,
    initialSortField = null,
    initialSortDirection = 'asc',
    searchableFields = []
  } = options

  // State
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<keyof T | null>(initialSortField)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialSortDirection)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  // Filter and search data
  const filteredData = useMemo(() => {
    let result = [...data]

    // Apply search
    if (searchTerm && searchableFields.length > 0) {
      const lowerSearch = searchTerm.toLowerCase()
      result = result.filter(item =>
        searchableFields.some(field => {
          const value = item[field]
          return value != null && String(value).toLowerCase().includes(lowerSearch)
        })
      )
    }

    // Apply filters
    Object.entries(filters).forEach(([field, value]) => {
      if (value && value !== 'all') {
        result = result.filter(item => {
          const itemValue = item[field as keyof T]
          if (typeof itemValue === 'boolean') {
            return value === 'true' ? itemValue : !itemValue
          }
          return String(itemValue) === value
        })
      }
    })

    // Apply sorting
    if (sortField) {
      result.sort((a, b) => {
        const aVal = a[sortField]
        const bVal = b[sortField]

        if (aVal == null) return 1
        if (bVal == null) return -1

        let comparison = 0
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal)
        } else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal
        } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
          comparison = (aVal === bVal) ? 0 : aVal ? 1 : -1
        } else {
          comparison = String(aVal).localeCompare(String(bVal))
        }

        return sortDirection === 'asc' ? comparison : -comparison
      })
    }

    return result
  }, [data, searchTerm, searchableFields, filters, sortField, sortDirection])

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize)
  const totalItems = filteredData.length

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return filteredData.slice(startIndex, endIndex)
  }, [filteredData, currentPage, pageSize])

  // Sorting handler
  const handleSort = useCallback((field: keyof T) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      // Set new field with asc direction
      setSortField(field)
      setSortDirection('asc')
    }
    // Reset to first page when sorting changes
    setCurrentPage(1)
  }, [sortField])

  // Filter handler
  const setFilter = useCallback((field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }))
    setCurrentPage(1) // Reset to first page when filter changes
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({})
    setCurrentPage(1)
  }, [])

  // Pagination handlers
  const goToPage = useCallback((page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages))
    setCurrentPage(validPage)
  }, [totalPages])

  const nextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1)
    }
  }, [currentPage, totalPages])

  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1)
    }
  }, [currentPage])

  const canGoNext = currentPage < totalPages
  const canGoPrev = currentPage > 1

  // Selection handlers
  const toggleSelection = useCallback((id: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedItems.size === paginatedData.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(paginatedData.map(item => item.id)))
    }
  }, [paginatedData, selectedItems])

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set())
  }, [])

  const isSelected = useCallback((id: string) => {
    return selectedItems.has(id)
  }, [selectedItems])

  const isAllSelected = paginatedData.length > 0 && selectedItems.size === paginatedData.length

  // Reset all state
  const reset = useCallback(() => {
    setSearchTerm('')
    setSortField(initialSortField)
    setSortDirection(initialSortDirection)
    setCurrentPage(1)
    setPageSize(initialPageSize)
    setFilters({})
    setSelectedItems(new Set())
  }, [initialSortField, initialSortDirection, initialPageSize])

  return {
    // Data
    paginatedData,
    filteredData,
    totalPages,
    totalItems,

    // Search
    searchTerm,
    setSearchTerm,

    // Sorting
    sortField,
    sortDirection,
    handleSort,

    // Pagination
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize,
    goToPage,
    nextPage,
    prevPage,
    canGoNext,
    canGoPrev,

    // Filters
    filters,
    setFilter,
    clearFilters,

    // Selection
    selectedItems,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    isSelected,
    isAllSelected,

    // Utility
    reset
  }
}
