'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ProtectedRoute } from '@/components/common/protected-route'
import { InstitutionProvider } from '@/context/institution-context'
import { ExaminationSessionProvider } from '@/context/examination-session-context'
import { CommandMenuProvider } from '@/components/layout/command-menu'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { getPermissionForPath } from '@/lib/navigation-data'
import { ShieldX, Mail, LogOut, Lock, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Auto-refresh tuning. The Anthropic prompt cache analogy doesn't apply here —
// these knobs balance freshness vs. server load on /api/auth/permissions/by-role.
const REFRESH_DEBOUNCE_MS = 30_000      // skip if a refresh ran < 30s ago
const REFRESH_POLL_INTERVAL_MS = 5 * 60_000 // background poll every 5 min

// Portal access is gated by COE Role Management: any user with at least
// one active role assigned via the Role Management page may enter the portal.
// The MyJKKN parent role is intentionally NOT considered. Per-page permissions
// still control individual modules.

function AccessDenied() {
	const { user, logout } = useAuth()

	return (
		<div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
			<div className="max-w-md w-full mx-4">
				<div className="text-center space-y-6">
					<div className="mx-auto w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
						<ShieldX className="h-10 w-10 text-red-500 dark:text-red-400" />
					</div>

					<div className="space-y-2">
						<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
							Access Restricted
						</h1>
						<p className="text-slate-600 dark:text-slate-400">
							You don't have access to the COE Portal. This portal is restricted to authorized examination staff only.
						</p>
					</div>

					{user?.email && (
						<div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3">
							<p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Logged in as</p>
							<p className="text-sm font-medium text-slate-700 dark:text-slate-300">{user.email}</p>
							<p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
								COE Roles:{' '}
								<span className="font-medium">
									{user.coe_roles && user.coe_roles.length > 0
										? user.coe_roles.join(', ')
										: 'None assigned'}
								</span>
							</p>
						</div>
					)}

					<div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
						<p className="text-sm text-amber-800 dark:text-amber-300">
							If you believe you should have access, please contact your administrator to request the appropriate role assignment.
						</p>
					</div>

					<div className="flex flex-col sm:flex-row gap-3 justify-center">
						<Button
							variant="outline"
							onClick={() => window.location.href = 'mailto:admin@jkkn.ac.in?subject=COE Portal Access Request'}
							className="gap-2"
						>
							<Mail className="h-4 w-4" />
							Contact Admin
						</Button>
						<Button
							variant="destructive"
							onClick={() => logout()}
							className="gap-2"
						>
							<LogOut className="h-4 w-4" />
							Sign Out
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

function CoeAccessGate({ children }: { children: ReactNode }) {
	const { user, loading } = useAuth()

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
			</div>
		)
	}

	// has_coe_access is true when the user has any active role in user_roles
	// (set by /api/auth/sync-session based on COE Role Management assignments).
	if (!user?.has_coe_access) {
		return <AccessDenied />
	}

	return <>{children}</>
}

/**
 * Refreshes the user's permissions JSONB cache without a full re-login.
 * Triggers:
 *   - When the tab regains focus or becomes visible (debounced to 30s)
 *   - Every 5 minutes in the background while the tab is visible
 * Effect: admin-granted permission changes propagate within a few minutes
 * (or instantly when the user switches back to the tab) instead of requiring
 * the user to sign out/in.
 */
function PermissionAutoRefresher() {
	const { user, refreshPermissions } = useAuth()
	const lastRefreshRef = useRef<number>(Date.now())

	useEffect(() => {
		if (!user) return

		const maybeRefresh = () => {
			if (typeof document !== 'undefined' && document.hidden) return
			const now = Date.now()
			if (now - lastRefreshRef.current < REFRESH_DEBOUNCE_MS) return
			lastRefreshRef.current = now
			void refreshPermissions()
		}

		const onFocus = () => maybeRefresh()
		const onVisibility = () => {
			if (!document.hidden) maybeRefresh()
		}

		window.addEventListener('focus', onFocus)
		document.addEventListener('visibilitychange', onVisibility)
		const pollId = window.setInterval(maybeRefresh, REFRESH_POLL_INTERVAL_MS)

		return () => {
			window.removeEventListener('focus', onFocus)
			document.removeEventListener('visibilitychange', onVisibility)
			window.clearInterval(pollId)
		}
	}, [user, refreshPermissions])

	return null
}

function PageAccessDenied({ permission }: { permission: string }) {
	const { user } = useAuth()
	return (
		<div className="flex items-center justify-center min-h-[60vh] p-6">
			<div className="max-w-md w-full text-center space-y-6">
				<div className="mx-auto w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
					<Lock className="h-10 w-10 text-amber-500 dark:text-amber-400" />
				</div>
				<div className="space-y-2">
					<h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
						You don't have access to this page
					</h1>
					<p className="text-slate-600 dark:text-slate-400">
						Your role doesn't include the permission required to view this page. Ask an administrator to grant access.
					</p>
				</div>
				<div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 text-left">
					<p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Required permission</p>
					<p className="text-sm font-mono text-slate-700 dark:text-slate-300 break-all">{permission}</p>
					{user?.coe_roles && user.coe_roles.length > 0 && (
						<>
							<p className="text-xs text-slate-500 dark:text-slate-400 mt-2 mb-1">Your COE roles</p>
							<p className="text-sm font-medium text-slate-700 dark:text-slate-300">
								{user.coe_roles.join(', ')}
							</p>
						</>
					)}
				</div>
				<div className="flex flex-col sm:flex-row gap-3 justify-center">
					<Button variant="outline" asChild className="gap-2">
						<Link href="/dashboard">
							<Home className="h-4 w-4" />
							Back to Dashboard
						</Link>
					</Button>
					<Button
						variant="ghost"
						onClick={() => window.location.href = 'mailto:admin@jkkn.ac.in?subject=COE Page Access Request'}
						className="gap-2"
					>
						<Mail className="h-4 w-4" />
						Contact Admin
					</Button>
				</div>
			</div>
		</div>
	)
}

/**
 * Enforces page-level permission for the current URL.
 * Looks up the matching `page.*.view` permission for the route in
 * navigation-data.ts and blocks the user if they lack it — so URL-guessing
 * can't bypass the sidebar.
 *
 * Unlisted routes (e.g. /favorites, dynamic detail pages with no nav entry)
 * fall through and are allowed.
 */
function PagePermissionGate({ children }: { children: ReactNode }) {
	const pathname = usePathname()
	const { user, hasPermission, hasAnyRole, refreshPermissions, loading } = useAuth()
	const [verifying, setVerifying] = useState(false)
	// Track whether we've already tried a refresh for the current path so we
	// don't loop refresh → still denied → refresh again.
	const verifiedPathRef = useRef<string | null>(null)

	const requiredPermission = getPermissionForPath(pathname)
	const isSuperAdmin = user?.is_super_admin === true || hasAnyRole(['super_admin'])
	const passes =
		isSuperAdmin ||
		!requiredPermission ||
		hasPermission(requiredPermission)

	// If we're about to block the user, give the stale permissions cache one
	// chance to refresh from the DB before showing the access-denied screen.
	useEffect(() => {
		if (!user) return
		if (passes) return
		if (verifiedPathRef.current === pathname) return
		verifiedPathRef.current = pathname
		setVerifying(true)
		refreshPermissions().finally(() => setVerifying(false))
	}, [user, passes, pathname, refreshPermissions])

	// Wait until auth settles to avoid a flash-of-denied during initial load
	if (loading || !user) return <>{children}</>
	if (passes) return <>{children}</>
	if (verifying) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
			</div>
		)
	}
	return <PageAccessDenied permission={requiredPermission!} />
}

export default function AuthenticatedLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<ProtectedRoute
			redirectTo="/login"
			loadingComponent={
				<div className="flex items-center justify-center min-h-screen">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
				</div>
			}
		>
			<CoeAccessGate>
				<PermissionAutoRefresher />
				<CommandMenuProvider>
					<InstitutionProvider>
						<ExaminationSessionProvider>
							{children}
						</ExaminationSessionProvider>
					</InstitutionProvider>
				</CommandMenuProvider>
			</CoeAccessGate>
		</ProtectedRoute>
	)
}
