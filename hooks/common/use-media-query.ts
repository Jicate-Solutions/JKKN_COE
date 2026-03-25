import { useState, useEffect } from 'react'

/**
 * Custom hook for responsive design using media queries
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 768px)')
 * const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)')
 * const isDark = useMediaQuery('(prefers-color-scheme: dark)')
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false)

	useEffect(() => {
		// Check if window is available (SSR compatibility)
		if (typeof window === 'undefined') {
			return
		}

		const mediaQuery = window.matchMedia(query)
		setMatches(mediaQuery.matches)

		const handleChange = (event: MediaQueryListEvent) => {
			setMatches(event.matches)
		}

		// Modern browsers
		if (mediaQuery.addEventListener) {
			mediaQuery.addEventListener('change', handleChange)
		} else {
			// Fallback for older browsers
			mediaQuery.addListener(handleChange)
		}

		return () => {
			if (mediaQuery.removeEventListener) {
				mediaQuery.removeEventListener('change', handleChange)
			} else {
				mediaQuery.removeListener(handleChange)
			}
		}
	}, [query])

	return matches
}

/**
 * Predefined breakpoint hooks for common screen sizes
 */
export function useIsMobile(): boolean {
	return useMediaQuery('(max-width: 768px)')
}

export function useIsTablet(): boolean {
	return useMediaQuery('(min-width: 769px) and (max-width: 1024px)')
}

export function useIsDesktop(): boolean {
	return useMediaQuery('(min-width: 1025px)')
}

export function useIsDarkMode(): boolean {
	return useMediaQuery('(prefers-color-scheme: dark)')
}
