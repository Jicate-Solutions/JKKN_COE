'use client'

import { ReactNode } from 'react'
import { ProtectedRoute } from '@/components/common/protected-route'
import { InstitutionProvider } from '@/context/institution-context'
import { ExaminationSessionProvider } from '@/context/examination-session-context'
import { CommandMenuProvider } from '@/components/layout/command-menu'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { ShieldX, Mail, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
