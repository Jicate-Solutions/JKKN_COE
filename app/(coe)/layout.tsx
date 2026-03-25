'use client'

import { ProtectedRoute } from '@/components/common/protected-route'
import { InstitutionProvider } from '@/context/institution-context'
import { useAuth } from '@/lib/auth/auth-context-parent'
import { ShieldX, Mail, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Portal access is controlled by the 'dashboard.view' permission.
// To grant a new role access to the COE portal, simply assign
// the 'dashboard.view' permission to that role via Role Permissions page.

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
							{user.role && (
								<p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
									Role: <span className="font-medium">{user.role}</span>
								</p>
							)}
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

export default function AuthenticatedLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<ProtectedRoute
			redirectTo="/login"
			requiredPermissions={['dashboard.view']}
			fallback={<AccessDenied />}
			loadingComponent={
				<div className="flex items-center justify-center min-h-screen">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
				</div>
			}
		>
			<InstitutionProvider>
				{children}
			</InstitutionProvider>
		</ProtectedRoute>
	)
}
