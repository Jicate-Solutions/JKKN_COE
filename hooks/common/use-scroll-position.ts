import { useState, useEffect } from 'react'
import { useDebounce } from './use-debounce'

interface ScrollPosition {
	x: number
	y: number
}

/**
 * Custom hook for tracking scroll position
 *
 * @example
 * const { x, y } = useScrollPosition()
 *
 * // Show "Back to top" button when scrolled down
 * {y > 300 && <BackToTopButton />}
 */
export function useScrollPosition(debounceMs = 100): ScrollPosition {
	const [position, setPosition] = useState<ScrollPosition>({
		x: typeof window !== 'undefined' ? window.pageXOffset : 0,
		y: typeof window !== 'undefined' ? window.pageYOffset : 0
	})

	useEffect(() => {
		if (typeof window === 'undefined') {
			return
		}

		const handleScroll = () => {
			setPosition({
				x: window.pageXOffset,
				y: window.pageYOffset
			})
		}

		window.addEventListener('scroll', handleScroll, { passive: true })

		return () => {
			window.removeEventListener('scroll', handleScroll)
		}
	}, [])

	const debouncedPosition = {
		x: useDebounce(position.x, debounceMs),
		y: useDebounce(position.y, debounceMs)
	}

	return debouncedPosition
}

/**
 * Hook to detect if user has scrolled past a certain threshold
 */
export function useScrollThreshold(threshold = 100): boolean {
	const { y } = useScrollPosition()
	return y > threshold
}
