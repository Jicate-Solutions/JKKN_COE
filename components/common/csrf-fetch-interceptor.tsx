'use client'

import { useEffect } from 'react'

const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

/**
 * Global fetch interceptor that automatically attaches the CSRF token
 * to all state-changing requests (POST/PUT/DELETE/PATCH).
 *
 * This component wraps `window.fetch` once on mount, ensuring that
 * every client-side fetch call includes the CSRF header — no need
 * to update individual service files or page components.
 *
 * Place this in the root layout, before any components that make API calls.
 */
export function CsrfFetchInterceptor() {
	useEffect(() => {
		const originalFetch = window.fetch

		window.fetch = function csrfFetch(
			input: RequestInfo | URL,
			init?: RequestInit
		): Promise<Response> {
			const method = (init?.method ?? 'GET').toUpperCase()

			if (CSRF_METHODS.has(method)) {
				const csrfToken = getCsrfToken()
				if (csrfToken) {
					const headers = new Headers(init?.headers)
					// Only set if not already present (secureFetch may have set it)
					if (!headers.has(CSRF_HEADER_NAME)) {
						headers.set(CSRF_HEADER_NAME, csrfToken)
					}
					init = { ...init, headers }
				}
			}

			return originalFetch.call(window, input, init)
		}

		return () => {
			// Restore on unmount (unlikely in root layout, but good practice)
			window.fetch = originalFetch
		}
	}, [])

	return null
}

function getCsrfToken(): string | null {
	if (typeof document === 'undefined') return null
	const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`))
	return match ? decodeURIComponent(match[1]) : null
}
