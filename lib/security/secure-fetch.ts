const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

// Methods that require CSRF token
const CSRF_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

/**
 * Read the CSRF token from the cookie.
 */
function getCsrfToken(): string | null {
	if (typeof document === 'undefined') return null
	const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`))
	return match ? decodeURIComponent(match[1]) : null
}

/**
 * Drop-in replacement for `fetch()` that automatically attaches
 * the CSRF token header on state-changing requests.
 *
 * Usage is identical to native fetch:
 *   const res = await secureFetch('/api/courses', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(data)
 *   })
 */
export async function secureFetch(
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<Response> {
	const method = (init?.method ?? 'GET').toUpperCase()

	if (CSRF_METHODS.has(method)) {
		const csrfToken = getCsrfToken()
		if (csrfToken) {
			const headers = new Headers(init?.headers)
			headers.set(CSRF_HEADER_NAME, csrfToken)
			init = { ...init, headers }
		}
	}

	return fetch(input, init)
}
