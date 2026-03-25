'use client'

import { BugReporterProvider } from '@boobalan_jkkn/bug-reporter-sdk'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { usePathname } from 'next/navigation'
import { ReactNode, useEffect, useMemo } from 'react'

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

	const isPublicRoute = PUBLIC_ROUTES_WITHOUT_BUG_REPORTER.some(route =>
		pathname?.startsWith(route)
	)

	// Determine if bug reporter should be enabled
	const isBugReporterEnabled = useMemo(() => {
		// Never show on public pages (no auth, no bug reporting)
		if (isPublicRoute) {
			return false
		}

		// Always enable in development mode
		if (process.env.NODE_ENV === 'development') {
			return true
		}

		// In production, only enable for authenticated users
		if (!isAuthenticated || !user) {
			return false
		}

		// Enable for specific roles
		const allowedRoles = ['admin', 'super_admin', 'beta-tester', 'developer']
		const hasAllowedRole = allowedRoles.includes(user.role)

		// Enable if user has an allowed role OR if explicitly enabled via env variable
		return hasAllowedRole || process.env.NEXT_PUBLIC_BUG_REPORTER_FORCE_ENABLE === 'true'
	}, [isAuthenticated, user, isPublicRoute])

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
			apiKey={process.env.NEXT_PUBLIC_BUG_REPORTER_API_KEY!}
			apiUrl={process.env.NEXT_PUBLIC_BUG_REPORTER_API_URL!}
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
