'use client'

import { BugReporterProvider } from '@boobalan_jkkn/bug-reporter-sdk'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { installBugReportShrinker } from '@/lib/bug-reporter/shrink-payload'
import { usePathname } from 'next/navigation'
import { ReactNode, useEffect, useMemo, useState } from 'react'

/**
 * The SDK talks to our own origin, not the bug reporter directly — see the
 * proxy at app/api/v1/bug-reporter/[...path]/route.ts for why. Kept as a path
 * (not the bare origin) so the SDK's "exclude my own apiUrl from network
 * capture" regex matches only these calls instead of every same-origin request.
 */
const BUG_REPORTER_PROXY_PATH = '/api/v1/bug-reporter'

/**
 * Placeholder, not a credential. The proxy attaches the real key server-side and
 * ignores whatever the browser sends, so the secret never reaches client code —
 * but the SDK refuses to initialise unless `apiKey` is truthy, hence this stand-in.
 */
const PROXIED_API_KEY = 'proxied-server-side'

const PUBLIC_ROUTES_WITHOUT_BUG_REPORTER = [
	'/arts-examiner-registration',
	'/examiner-registration',
]

export function BugReporterWrapper({
	children
}: {
	children: ReactNode
}) {
	const { user, isAuthenticated } = useAuth()
	const pathname = usePathname()

	// window.location is unavailable during SSR, so the absolute proxy URL can
	// only be resolved after mount. The SDK treats a falsy apiUrl as "not
	// configured" and simply stays dormant for that first render.
	const [apiUrl, setApiUrl] = useState('')
	useEffect(() => {
		setApiUrl(`${window.location.origin}${BUG_REPORTER_PROXY_PATH}`)
	}, [])

	const isPublicRoute = PUBLIC_ROUTES_WITHOUT_BUG_REPORTER.some(route =>
		pathname?.startsWith(route)
	)

	// Determine if bug reporter should be enabled
	const isBugReporterEnabled = useMemo(() => {
		// Never show on public pages (no auth, no bug reporting)
		if (isPublicRoute) {
			return false
		}

		// The proxy URL is only known after mount
		if (!apiUrl) {
			return false
		}

		// Always enable in development mode
		if (process.env.NODE_ENV === 'development') {
			return true
		}

		// In production, enable for all authenticated users
		return isAuthenticated && !!user
	}, [isAuthenticated, user, isPublicRoute, apiUrl])

	// The SDK posts an uncompressed full-page PNG screenshot inline, which pushes
	// the JSON body past Vercel's 4.5 MB request limit on data-heavy pages. Vercel
	// then rejects it at the edge with a CORS-less 413, which the browser reports
	// as the misleading "Failed to fetch". Shrink the body before it leaves.
	useEffect(() => {
		if (!apiUrl) return
		return installBugReportShrinker(apiUrl)
	}, [apiUrl])

	useEffect(() => {
		// Add custom CSS to reposition the bug report button to bottom-left
		const style = document.createElement('style')
		style.innerHTML = `
			/* Reposition bug report button to bottom-left corner */
			[data-bug-reporter-button],
			.bug-reporter-button,
			.bug-reporter-floating-btn,
			.bug-reporter-widget,
			button[aria-label*="bug"],
			button[aria-label*="report"],
			div[class*="bug-reporter"] button:last-child {
				bottom: 1.5rem !important;
				left: 1.5rem !important;
				right: auto !important;
				z-index: 9999 !important;
			}
		`
		document.head.appendChild(style)

		return () => {
			document.head.removeChild(style)
		}
	}, [])

	return (
		<BugReporterProvider
			apiKey={PROXIED_API_KEY}
			apiUrl={apiUrl}
			enabled={isBugReporterEnabled}
			debug={process.env.NODE_ENV === 'development'}
			userContext={
				isAuthenticated && user
					? {
							userId: user.id,
							name: user.full_name || user.email?.split('@')[0],
							email: user.email || undefined
						}
					: undefined
			}
		>
			{children}
		</BugReporterProvider>
	)
}
