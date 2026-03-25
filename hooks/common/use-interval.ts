import { useEffect, useRef } from 'react'

/**
 * Custom hook for managing setInterval
 *
 * @example
 * const [count, setCount] = useState(0)
 *
 * useInterval(() => {
 *   setCount(count + 1)
 * }, 1000)
 */
export function useInterval(callback: () => void, delay: number | null): void {
	const savedCallback = useRef(callback)

	// Remember the latest callback
	useEffect(() => {
		savedCallback.current = callback
	}, [callback])

	// Set up the interval
	useEffect(() => {
		// Don't schedule if no delay is specified
		if (delay === null) {
			return
		}

		const id = setInterval(() => {
			savedCallback.current()
		}, delay)

		return () => {
			clearInterval(id)
		}
	}, [delay])
}

/**
 * Hook for managing setTimeout
 */
export function useTimeout(callback: () => void, delay: number | null): void {
	const savedCallback = useRef(callback)

	// Remember the latest callback
	useEffect(() => {
		savedCallback.current = callback
	}, [callback])

	// Set up the timeout
	useEffect(() => {
		// Don't schedule if no delay is specified
		if (delay === null) {
			return
		}

		const id = setTimeout(() => {
			savedCallback.current()
		}, delay)

		return () => {
			clearTimeout(id)
		}
	}, [delay])
}
