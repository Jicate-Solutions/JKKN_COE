'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, AlertTriangle, Rocket, ChevronDown } from 'lucide-react'

// ── Role profiles for dev login ───────────────────────────────────────────
const ROLE_PROFILES: Record<string, {
	id: string
	email: string
	name: string
	role: string
	is_super_admin: boolean
	institution_id: string | null
	institution_code: string | null
	department: string
	permissions: Record<string, Record<string, boolean>>
}> = {
	super_admin: {
		id: 'dev-super-admin-001',
		email: 'superadmin@jkkn.ac.in',
		name: 'Dev Super Admin',
		role: 'super_admin',
		is_super_admin: true,
		institution_id: null,
		institution_code: null,
		department: 'Administration',
		permissions: {
			users: { admin: true, view: true, create: true, edit: true, delete: true, report: true, import: true, export: true },
			institutions: { admin: true, view: true, create: true, edit: true, delete: true, report: true, import: true, export: true },
			courses: { admin: true, view: true, create: true, edit: true, delete: true, report: true, import: true, export: true },
			regulations: { admin: true, view: true, create: true, edit: true, delete: true, report: true, import: true, export: true },
			batches: { admin: true, view: true, create: true, edit: true, delete: true, report: true, import: true, export: true },
			programs: { admin: true, view: true, create: true, edit: true, delete: true, report: true, import: true, export: true },
			sections: { admin: true, view: true, create: true, edit: true, delete: true, report: true, import: true, export: true },
		},
	},
	admin: {
		id: 'dev-admin-001',
		email: 'admin@jkkn.ac.in',
		name: 'Dev Admin',
		role: 'admin',
		is_super_admin: false,
		institution_id: null,
		institution_code: null,
		department: 'Administration',
		permissions: {
			users: { admin: true, view: true, create: true, edit: true, delete: true },
			institutions: { view: true },
			courses: { view: true, create: true, edit: true },
			regulations: { view: true, create: true, edit: true },
			batches: { view: true, create: true, edit: true },
			programs: { view: true, create: true, edit: true },
			sections: { view: true, create: true, edit: true },
		},
	},
	coe: {
		id: 'dev-coe-001',
		email: 'coe@jkkn.ac.in',
		name: 'Dev COE',
		role: 'coe',
		is_super_admin: false,
		institution_id: 'dev-institution-001',
		institution_code: 'JKKN',
		department: 'Examination Cell',
		permissions: {
			users: { view: true },
			courses: { view: true, create: true, edit: true, delete: true, report: true, import: true, export: true },
			regulations: { view: true, create: true, edit: true, delete: true },
			batches: { view: true, create: true, edit: true, delete: true },
			programs: { view: true },
			sections: { view: true, create: true, edit: true },
		},
	},
	deputy_coe: {
		id: 'dev-deputy-coe-001',
		email: 'deputy.coe@jkkn.ac.in',
		name: 'Dev Deputy COE',
		role: 'deputy_coe',
		is_super_admin: false,
		institution_id: 'dev-institution-001',
		institution_code: 'JKKN',
		department: 'Examination Cell',
		permissions: {
			courses: { view: true, report: true, export: true },
			regulations: { view: true },
			batches: { view: true },
			programs: { view: true },
		},
	},
	coe_office: {
		id: 'dev-coe-office-001',
		email: 'coe.office@jkkn.ac.in',
		name: 'Dev COE Office',
		role: 'coe_office',
		is_super_admin: false,
		institution_id: 'dev-institution-001',
		institution_code: 'JKKN',
		department: 'COE Office',
		permissions: {
			courses: { view: true, create: true, edit: true },
			regulations: { view: true },
			batches: { view: true },
		},
	},
	faculty_coe: {
		id: 'dev-faculty-001',
		email: 'faculty@jkkn.ac.in',
		name: 'Dev Faculty',
		role: 'faculty_coe',
		is_super_admin: false,
		institution_id: 'dev-institution-001',
		institution_code: 'JKKN',
		department: 'Computer Science',
		permissions: {
			courses: { view: true },
			regulations: { view: true },
			batches: { view: true },
		},
	},
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
	super_admin: { label: 'Super Admin', color: 'bg-red-100 text-red-800 border-red-200' },
	admin: { label: 'Admin', color: 'bg-purple-100 text-purple-800 border-purple-200' },
	coe: { label: 'COE', color: 'bg-blue-100 text-blue-800 border-blue-200' },
	deputy_coe: { label: 'Deputy COE', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
	coe_office: { label: 'COE Office', color: 'bg-green-100 text-green-800 border-green-200' },
	faculty_coe: { label: 'Faculty', color: 'bg-amber-100 text-amber-800 border-amber-200' },
}

function DevLoginContent() {
	const searchParams = useSearchParams()
	const [isDev, setIsDev] = useState(false)
	const [selectedRole, setSelectedRole] = useState<string>('admin')
	const [showRoleList, setShowRoleList] = useState(false)

	useEffect(() => {
		const isLocalhost = window.location.hostname === 'localhost' ||
			window.location.hostname === '127.0.0.1'
		setIsDev(isLocalhost)

		// Read role from query param: /dev-login?role=coe
		const roleParam = searchParams.get('role')
		if (roleParam && ROLE_PROFILES[roleParam]) {
			setSelectedRole(roleParam)
		}

		// Auto-login if ?auto=true is set (for automation scripts)
		if (roleParam && searchParams.get('auto') === 'true' && isLocalhost) {
			handleDevLoginForRole(roleParam)
		}
	}, [searchParams])

	const handleDevLoginForRole = (role: string) => {
		const profile = ROLE_PROFILES[role]
		if (!profile) return

		const devUser = {
			...profile,
			avatar_url: '',
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		}

		const devSession = {
			access_token: `dev-${role}-token-${Date.now()}`,
			refresh_token: `dev-${role}-refresh-${Date.now()}`,
			expires_in: 3600,
			expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
			token_type: 'Bearer',
		}

		// Store in sessionStorage (not localStorage) — dev-only, clears on tab close
		sessionStorage.setItem('user_data', JSON.stringify(devUser))
		sessionStorage.setItem('auth_session', JSON.stringify(devSession))
		// Tokens should be set as cookies, not in storage
		document.cookie = `access_token=${devSession.access_token}; path=/; SameSite=Lax`
		document.cookie = `coe_access=true; path=/; SameSite=Lax`

		window.location.href = '/dashboard'
	}

	const handleDevLogin = () => {
		handleDevLoginForRole(selectedRole)
	}

	const handleProductionLogin = () => {
		window.location.href = '/'
	}

	const currentProfile = ROLE_PROFILES[selectedRole]
	const currentLabel = ROLE_LABELS[selectedRole]

	if (!isDev) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
				<Card className="max-w-md w-full">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-yellow-500" />
							Production Environment
						</CardTitle>
						<CardDescription>
							Dev login is not available in production
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={handleProductionLogin} className="w-full">
							Go to Normal Login
						</Button>
					</CardContent>
				</Card>
			</div>
		)
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
			<Card className="max-w-md w-full shadow-xl">
				<CardHeader className="space-y-1">
					<CardTitle className="text-2xl font-bold flex items-center gap-2">
						<Shield className="h-6 w-6 text-blue-500" />
						Development Login
					</CardTitle>
					<CardDescription>
						Bypass authentication for local development and testing
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
						<AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
						<div className="text-sm">
							<strong>Warning:</strong> This is only for development purposes.
						</div>
					</div>

					{/* Role selector */}
					<div className="space-y-2">
						<label className="text-sm font-medium">Select Role:</label>
						<div className="relative">
							<button
								onClick={() => setShowRoleList(!showRoleList)}
								className="w-full flex items-center justify-between p-3 border rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
							>
								<div className="flex items-center gap-2">
									<span className={`px-2 py-0.5 text-xs font-medium rounded border ${currentLabel.color}`}>
										{currentLabel.label}
									</span>
									<span className="text-sm">{currentProfile.name}</span>
								</div>
								<ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showRoleList ? 'rotate-180' : ''}`} />
							</button>

							{showRoleList && (
								<div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-lg overflow-hidden">
									{Object.entries(ROLE_PROFILES).map(([key, profile]) => {
										const label = ROLE_LABELS[key]
										return (
											<button
												key={key}
												onClick={() => {
													setSelectedRole(key)
													setShowRoleList(false)
												}}
												className={`w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${selectedRole === key ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
											>
												<span className={`px-2 py-0.5 text-xs font-medium rounded border ${label.color}`}>
													{label.label}
												</span>
												<div className="flex-1">
													<div className="text-sm font-medium">{profile.name}</div>
													<div className="text-xs text-muted-foreground">{profile.email}</div>
												</div>
												{selectedRole === key && (
													<div className="h-2 w-2 rounded-full bg-blue-500" />
												)}
											</button>
										)
									})}
								</div>
							)}
						</div>
					</div>

					{/* User details for selected role */}
					<div className="space-y-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
						<p className="text-sm font-medium">Dev User Details:</p>
						<ul className="text-xs space-y-1 text-muted-foreground">
							<li>Email: {currentProfile.email}</li>
							<li>Role: <span className={`px-1.5 py-0.5 rounded text-xs ${currentLabel.color}`}>{currentLabel.label}</span></li>
							<li>Institution: {currentProfile.institution_code || 'All (no restriction)'}</li>
							<li>Super Admin: {currentProfile.is_super_admin ? 'Yes' : 'No'}</li>
							<li>Permissions: {Object.keys(currentProfile.permissions).length} resources</li>
							<li>Session: 1 hour validity</li>
						</ul>
					</div>

					<div className="space-y-2">
						<Button
							onClick={handleDevLogin}
							className="w-full"
							size="lg"
						>
							<Rocket className="h-4 w-4 mr-2" />
							Login as {currentLabel.label}
						</Button>

						<Button
							onClick={handleProductionLogin}
							variant="outline"
							className="w-full"
						>
							Use Normal Login
						</Button>
					</div>

					<div className="pt-4 border-t text-xs text-center text-muted-foreground">
						Tip: Use <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">/dev-login?role=coe&auto=true</code> for automated login.
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

export default function DevLoginPage() {
	return (
		<Suspense>
			<DevLoginContent />
		</Suspense>
	)
}
