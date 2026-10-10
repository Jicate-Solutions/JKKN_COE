'use client'

import { useEffect } from 'react'
import { parentAuthService } from '@/lib/auth/parent-auth-service'

const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

// API prefixes that never take part in COE session recovery: the token
// endpoints themselves (refreshing in response to a failed refresh would
// loop), and routes with their own sign-in (external examiners, API keys,
// public forms) where a 401 has nothing to do with the COE session.
const SESSION_RECOVERY_EXEMPT_PREFIXES = [
	'/api/auth/token',
	'/api/auth/logout',
	'/api/token',
	'/api/public',
	'/api/v1',
	'/api/examiner-portal',
	'/api/examiner/question-paper',
	'/api/cron',
]

// Pages a signed-out visitor may sit on — never bounce these to /login.
const PUBLIC_PAGE_PREFIXES = [
	'/login',
	'/auth/callback',
	'/callback',
	'/contact-admin',
	'/verify-email',
	'/arts-examiner-registration',
	'/engg-examiner-registration',
	'/examiner',
]

// `code` values proxy.ts attaches to a 401 caused by the session itself.
const SESSION_FAILURE_CODES = new Set([
	'INVALID_SESSION',
	'SESSION_REVOKED',
	'SESSION_EXPIRED',
	'USER_INACTIVE',
])

let redirectingToLogin = false

/**
 * Global fetch interceptor that automatically attaches the CSRF token
 * to all same-origin state-changing requests (POST/PUT/DELETE/PATCH), and
 * recovers an expired COE session on a 401 (see recoverSession below).
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

			if (!isSessionRecoverable(input)) {
				return originalFetch.call(window, input, init)
			}

			// A Request's body can be read once — keep a copy for the retry.
			const retryInput = input instanceof Request ? input.clone() : input
			return originalFetch.call(window, input, init).then((response) =>
				response.status === 401
					? recoverSession(originalFetch, retryInput, init, response)
					: response
			)
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
 * Every protected API route answers 401 once the COE session behind the
 * access_token cookie has expired (proxy.ts checks it on each request). Most
 * screens call `fetch` directly and would simply show an error, so recover
 * here, once, for all of them: mint a new session from the refresh-token
 * cookie and replay the request. Concurrent 401s share one refresh
 * (parentAuthService.refreshToken is single-flight).
 *
 * When the refresh is refused for good the client session is already cleared;
 * send the user to sign in rather than leave them on a page where every
 * request fails.
 */
async function recoverSession(
	originalFetch: typeof window.fetch,
	input: RequestInfo | URL,
	init: RequestInit | undefined,
	unauthorized: Response
): Promise<Response> {
	const refreshed = await parentAuthService.refreshToken()
	if (refreshed) {
		let retried: Response
		try {
			retried = await originalFetch.call(window, input, init)
		} catch {
			return unauthorized
		}
		if (retried.status !== 401) return retried

		// Fresh tokens, yet still no session: only a full sign-in can fix that.
		// (A 401 without a session code is the route's own answer — pass it on.)
		const body = await retried.clone().json().catch(() => null)
		if (!SESSION_FAILURE_CODES.has(body?.code)) return retried
		parentAuthService.clearSession()
		unauthorized = retried
	}

	const sessionCleared = !parentAuthService.getAccessToken()
	const path = window.location.pathname
	const onPublicPage =
		path === '/' || PUBLIC_PAGE_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))
	if (sessionCleared && !onPublicPage && !redirectingToLogin) {
		redirectingToLogin = true
		window.location.assign(`/login?redirect=${encodeURIComponent(path + window.location.search)}`)
	}
	return unauthorized
}

/** Same-origin call to a COE-session-protected API route. */
function isSessionRecoverable(input: RequestInfo | URL): boolean {
	if (!isSameOrigin(input)) return false
	const url =
		typeof input === 'string'
			? input
			: input instanceof URL
				? input.toString()
				: input.url
	let pathname: string
	try {
		pathname = new URL(url, window.location.origin).pathname
	} catch {
		return false
	}
	if (!pathname.startsWith('/api/')) return false
	return !SESSION_RECOVERY_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
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
