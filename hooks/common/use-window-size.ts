import { useState, useEffect } from 'react'

interface WindowSize {
	width: number
	height: number
}

/**
 * Custom hook for tracking window dimensions
 *
 * @example
 * const { width, height } = useWindowSize()
 *
 * if (width < 768) {
 *   // Mobile layout
 * }
 */
export function useWindowSize(): WindowSize {
	const [windowSize, setWindowSize] = useState<WindowSize>({
		width: typeof window !== 'undefined' ? window.innerWidth : 0,
		height: typeof window !== 'undefined' ? window.innerHeight : 0
	})

	useEffect(() => {
		// Check if window is available (SSR compatibility)
		if (typeof window === 'undefined') {
			return
		}

		let timeoutId: ReturnType<typeof setTimeout>
		const handleResize = () => {
			clearTimeout(timeoutId)
			timeoutId = setTimeout(() => {
				setWindowSize({
					width: window.innerWidth,
					height: window.innerHeight
				})
			}, 150)
		}

		// Add event listener
		window.addEventListener('resize', handleResize)

		// Call handler immediately to update state with initial window size
		setWindowSize({ width: window.innerWidth, height: window.innerHeight })

		// Cleanup
		return () => {
			window.removeEventListener('resize', handleResize)
			clearTimeout(timeoutId)
		}
	}, [])

	return windowSize
}
