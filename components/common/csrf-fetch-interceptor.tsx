'use client'

import { useEffect } from 'react'

const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

/**
 * Global fetch interceptor that automatically attaches the CSRF token
 * to all same-origin state-changing requests (POST/PUT/DELETE/PATCH).
 *
 * This component wraps `window.fetch` once on mount, ensuring that
 * every client-side fetch call includes the CSRF header — no need
 * to update individual service files or page components.
 *
 * Place this in the root layout, before any components that make API calls.
 *
 * Same-origin only, deliberately. `x-csrf-token` is not a CORS-safelisted
 * header, so attaching it to a cross-origin request forces a preflight that
 * the third party must explicitly allow. Third-party APIs do not list our
 * header (the bug reporter, for one, allows only Content-Type and X-API-Key),
 * so the preflight fails and the browser blocks the request — surfacing as an
 * opaque "TypeError: Failed to fetch". The token is also useless to anyone but
 * our own server, so sending it abroad only leaks it.
 */
export function CsrfFetchInterceptor() {
	useEffect(() => {
		const originalFetch = window.fetch

		const patched = function csrfFetch(
			input: RequestInfo | URL,
			init?: RequestInit
		): Promise<Response> {
			const method = (
				init?.method ?? (input instanceof Request ? input.method : 'GET')
			).toUpperCase()

			if (CSRF_METHODS.has(method) && isSameOrigin(input)) {
				const csrfToken = getCsrfToken()
				if (csrfToken) {
					const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
					// Only set if not already present (secureFetch may have set it)
					if (!headers.has(CSRF_HEADER_NAME)) {
						headers.set(CSRF_HEADER_NAME, csrfToken)
					}
					init = { ...init, headers }
				}
			}

			return originalFetch.call(window, input, init)
		}

		window.fetch = patched

		return () => {
			// Restore only if we are still the installed wrapper. Other code layers
			// its own `fetch` wrapper on top of ours (the bug-reporter payload
			// shrinker does), and in dev an HMR/StrictMode remount re-runs this
			// cleanup — an unconditional restore would silently rip those later
			// wrappers out of the chain and leave them permanently bypassed.
			if (window.fetch === patched) {
				window.fetch = originalFetch
			}
		}
	}, [])

	return null
}

/**
 * True when the request targets our own origin. Relative URLs ('/api/...') are
 * same-origin by definition; anything that fails to parse is treated as relative
 * rather than assumed foreign, so existing same-origin calls keep their token.
 */
function isSameOrigin(input: RequestInfo | URL): boolean {
	if (typeof window === 'undefined') return false

	const url =
		typeof input === 'string'
			? input
			: input instanceof URL
				? input.toString()
				: input.url

	try {
		return new URL(url, window.location.origin).origin === window.location.origin
	} catch {
		return true
	}
}

function getCsrfToken(): string | null {
	if (typeof document === 'undefined') return null
	const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`))
	return match ? decodeURIComponent(match[1]) : null
}
