import { useState, useCallback, useEffect, useRef } from 'react'

interface AsyncState<T> {
	data: T | null
	loading: boolean
	error: Error | null
}

interface UseAsyncOptions<T> {
	immediate?: boolean
	onSuccess?: (data: T) => void
	onError?: (error: Error) => void
}

/**
 * Custom hook for handling async operations with loading and error states
 *
 * @example
 * const { data, loading, error, execute } = useAsync(
 *   async () => {
 *     const response = await fetch('/api/courses')
 *     return response.json()
 *   },
 *   { immediate: true }
 * )
 */
export function useAsync<T>(
	asyncFunction: () => Promise<T>,
	options: UseAsyncOptions<T> = {}
) {
	const { immediate = false, onSuccess, onError } = options

	const [state, setState] = useState<AsyncState<T>>({
		data: null,
		loading: immediate,
		error: null
	})

	// Track if component is mounted to prevent state updates after unmount
	const isMounted = useRef(true)
	const pendingPromise = useRef<Promise<T> | null>(null)

	useEffect(() => {
		return () => {
			isMounted.current = false
		}
	}, [])

	const execute = useCallback(async (): Promise<T | null> => {
		setState((prev) => ({ ...prev, loading: true, error: null }))

		try {
			const promise = asyncFunction()
			pendingPromise.current = promise
			const result = await promise

			// Only update state if this is still the latest promise and component is mounted
			if (pendingPromise.current === promise && isMounted.current) {
				setState({ data: result, loading: false, error: null })

				if (onSuccess) {
					onSuccess(result)
				}

				return result
			}

			return null
		} catch (error) {
			const err = error instanceof Error ? error : new Error('An error occurred')

			// Only update state if component is mounted
			if (isMounted.current) {
				setState({ data: null, loading: false, error: err })

				if (onError) {
					onError(err)
				}
			}

			return null
		}
	}, [asyncFunction, onSuccess, onError])

	const reset = useCallback(() => {
		if (isMounted.current) {
			setState({ data: null, loading: false, error: null })
			pendingPromise.current = null
		}
	}, [])

	// Execute immediately if specified
	useEffect(() => {
		if (immediate) {
			execute()
		}
	}, [immediate, execute])

	return {
		...state,
		execute,
		reset
	}
}
