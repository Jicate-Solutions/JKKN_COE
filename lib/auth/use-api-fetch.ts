'use client'

import { useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context-parent'

const REFRESHABLE_CODES = new Set([
	'SESSION_EXPIRED',
	'SESSION_REVOKED',
	'INVALID_SESSION',
])

/**
 * Fetch wrapper that auto-recovers from session 401s.
 *
 * Behavior on 401:
 *   1. Parse the response body for a `code` field set by admin-guard.
 *   2. If refreshable (SESSION_EXPIRED / SESSION_REVOKED / INVALID_SESSION
 *      or no code at all), call `refreshSession()` to mint a new
 *      access_token via /api/token/refresh, then retry the original
 *      request once.
 *   3. If retry still 401s, redirect to /login with the current path
 *      as the redirect target.
 *
 * Callers can opt out of the redirect by passing `{ noRedirectOn401: true }`
 * — they then receive the 401 response and handle it themselves.
 *
 * Caveat: request bodies are reused on retry. Streaming bodies (e.g.
 * ReadableStream) won't survive — pass strings, FormData, or Blobs.
 */
export interface ApiFetchOptions extends RequestInit {
	noRedirectOn401?: boolean
}

export function useApiFetch() {
	const { refreshSession } = useAuth()
	const router = useRouter()
	const pathname = usePathname()

	return useCallback(
		async (input: RequestInfo | URL, init?: ApiFetchOptions): Promise<Response> => {
			const { noRedirectOn401, ...fetchInit } = init || {}

			let response = await fetch(input, fetchInit)
			if (response.status !== 401) return response

			// Inspect the body to decide whether refresh is worth attempting.
			// Clone first so the caller can still consume the original if we
			// end up returning it.
			const body = await response
				.clone()
				.json()
				.catch(() => ({} as { code?: string }))
			const code = body?.code as string | undefined
			const refreshable = !code || REFRESHABLE_CODES.has(code)

			if (refreshable) {
				const refreshed = await refreshSession()
				if (refreshed) {
					response = await fetch(input, fetchInit)
					if (response.status !== 401) return response
				}
			}

			if (noRedirectOn401) return response

			const redirectTo = pathname || '/'
			router.push(`/login?redirect=${encodeURIComponent(redirectTo)}`)
			return response
		},
		[refreshSession, router, pathname]
	)
}
