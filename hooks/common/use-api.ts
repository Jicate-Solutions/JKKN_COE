import { useState, useCallback } from 'react'

interface UseAPIOptions {
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
  showToast?: boolean
}

interface APIResponse<T> {
  data: T | null
  loading: boolean
  error: Error | null
  execute: (url: string, options?: RequestInit) => Promise<T | null>
  reset: () => void
}

/**
 * Custom hook for making API requests with loading and error states
 *
 * @example
 * const { data, loading, error, execute } = useAPI()
 *
 * // GET request
 * const courses = await execute('/api/courses')
 *
 * // POST request
 * const newCourse = await execute('/api/courses', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify(courseData)
 * })
 */
export function useAPI<T = any>(options: UseAPIOptions = {}): APIResponse<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(async (url: string, fetchOptions?: RequestInit): Promise<T | null> => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(url, fetchOptions)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      setData(result)

      if (options.onSuccess) {
        options.onSuccess(result)
      }

      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An error occurred')
      setError(error)

      if (options.onError) {
        options.onError(error)
      }

      return null
    } finally {
      setLoading(false)
    }
  }, [options])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return {
    data,
    loading,
    error,
    execute,
    reset
  }
}
