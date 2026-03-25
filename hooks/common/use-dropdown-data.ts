import { useState, useEffect, useCallback } from 'react'

interface UseDropdownDataOptions {
  fetchOnMount?: boolean
  cacheResults?: boolean
}

interface DropdownDataState<T> {
  data: T[]
  loading: boolean
  error: Error | null
  fetchData: () => Promise<void>
  refetch: () => Promise<void>
}

// Cache for dropdown data
const cache = new Map<string, { data: any[], timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

/**
 * Custom hook for fetching dropdown options (institutions, departments, etc.)
 *
 * @example
 * const { data: institutions, loading } = useDropdownData<Institution>('/api/institutions')
 *
 * const { data: departments, loading, refetch } = useDropdownData<Department>(
 *   '/api/departments',
 *   { fetchOnMount: true, cacheResults: true }
 * )
 */
export function useDropdownData<T = any>(
  apiEndpoint: string,
  options: UseDropdownDataOptions = {}
): DropdownDataState<T> {
  const { fetchOnMount = true, cacheResults = true } = options

  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    // Check cache first
    if (cacheResults) {
      const cached = cache.get(apiEndpoint)
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setData(cached.data)
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(apiEndpoint)

      if (!response.ok) {
        throw new Error(`Failed to fetch data from ${apiEndpoint}`)
      }

      const result = await response.json()
      const dataArray = Array.isArray(result) ? result : []

      setData(dataArray)

      // Update cache
      if (cacheResults) {
        cache.set(apiEndpoint, {
          data: dataArray,
          timestamp: Date.now()
        })
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An error occurred')
      setError(error)
      console.error('Error fetching dropdown data:', error)
    } finally {
      setLoading(false)
    }
  }, [apiEndpoint, cacheResults])

  const refetch = useCallback(async () => {
    // Clear cache for this endpoint
    if (cacheResults) {
      cache.delete(apiEndpoint)
    }
    await fetchData()
  }, [apiEndpoint, cacheResults, fetchData])

  useEffect(() => {
    if (fetchOnMount) {
      fetchData()
    }
  }, [fetchOnMount, fetchData])

  return {
    data,
    loading,
    error,
    fetchData,
    refetch
  }
}

/**
 * Hook for fetching multiple dropdown datasets at once
 *
 * @example
 * const {
 *   institutions,
 *   departments,
 *   regulations,
 *   loading
 * } = useMultipleDropdowns({
 *   institutions: '/api/institutions',
 *   departments: '/api/departments',
 *   regulations: '/api/regulations'
 * })
 */
export function useMultipleDropdowns<T extends Record<string, string>>(
  endpoints: T
): Record<keyof T, any[]> & { loading: boolean; errors: Record<keyof T, Error | null> } {
  const [data, setData] = useState<Record<keyof T, any[]>>({} as Record<keyof T, any[]>)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Record<keyof T, Error | null>>({} as Record<keyof T, Error | null>)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      const results: Record<keyof T, any[]> = {} as Record<keyof T, any[]>
      const errorResults: Record<keyof T, Error | null> = {} as Record<keyof T, Error | null>

      await Promise.all(
        Object.entries(endpoints).map(async ([key, endpoint]) => {
          try {
            // Check cache
            const cached = cache.get(endpoint as string)
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
              results[key as keyof T] = cached.data
              errorResults[key as keyof T] = null
              return
            }

            const response = await fetch(endpoint as string)

            if (!response.ok) {
              throw new Error(`Failed to fetch ${key}`)
            }

            const result = await response.json()
            const dataArray = Array.isArray(result) ? result : []

            results[key as keyof T] = dataArray
            errorResults[key as keyof T] = null

            // Update cache
            cache.set(endpoint as string, {
              data: dataArray,
              timestamp: Date.now()
            })
          } catch (err) {
            const error = err instanceof Error ? err : new Error('An error occurred')
            results[key as keyof T] = []
            errorResults[key as keyof T] = error
            console.error(`Error fetching ${key}:`, error)
          }
        })
      )

      setData(results)
      setErrors(errorResults)
      setLoading(false)
    }

    fetchAll()
  }, [endpoints])

  return {
    ...data,
    loading,
    errors
  }
}
