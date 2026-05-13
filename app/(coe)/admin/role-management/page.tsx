'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useApiFetch } from '@/lib/auth/use-api-fetch'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from '@/components/ui/sheet'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import Link from 'next/link'
import {
	Search,
	Shield,
	UserPlus,
	X,
	Loader2,
	RefreshCw,
	Users,
	ShieldCheck,
	ShieldOff,
	Pencil,
	Trash2,
} from 'lucide-react'

// ---- Types ----------------------------------------------------------------

interface CoeRole {
	id: string
	role_id: string
	role_name: string
	role_description: string | null
	assigned_at: string
}

interface CoeUser {
	id: string
	email: string
	full_name: string | null
	avatar_url: string | null
	is_active: boolean
	institution_id: string | null
	institution_code: string | null
	institution_name: string | null
	coe_institution_id: string | null
	coe_roles: CoeRole[]
}

interface AvailableRole {
	id: string
	name: string
	description: string | null
	is_system_role: boolean
}

interface MyJkknUser {
	id: string
	parent_user_id: string
	email: string
	full_name: string | null
	role: string | null
	avatar_url: string | null
	institution_id: string | null
	is_active: boolean
	phone_number: string | null
	designation: string | null
	gender: string | null
}

// ---- Helpers ---------------------------------------------------------------

function getInitials(name: string | null | undefined, email: string): string {
	if (name && name.trim()) {
		return name
			.trim()
			.split(' ')
			.map((part) => part[0])
			.slice(0, 2)
			.join('')
			.toUpperCase()
	}
	return email.charAt(0).toUpperCase()
}

// ---- Main Page Component ---------------------------------------------------

export default function RoleManagementPage() {
	const { toast } = useToast()
	const apiFetch = useApiFetch()

	// Institution filter
	const {
		isReady,
		shouldFilter,
		institutionId,
		mustSelectInstitution,
		appendToUrl,
	} = useInstitutionFilter()
	// COE users state
	const [coeUsers, setCoeUsers] = useState<CoeUser[]>([])
	const [usersLoading, setUsersLoading] = useState(true)
	const [usersSearch, setUsersSearch] = useState('')

	// Available roles state
	const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])

	// MyJKKN search state
	const [myjkknSearch, setMyjkknSearch] = useState('')
	const [myjkknResults, setMyjkknResults] = useState<MyJkknUser[]>([])
	const [myjkknLoading, setMyjkknLoading] = useState(false)
	const [myjkknSearched, setMyjkknSearched] = useState(false)
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Assign role sheet state
	const [assignSheetOpen, setAssignSheetOpen] = useState(false)
	const [selectedMyJkknUser, setSelectedMyJkknUser] = useState<MyJkknUser | null>(null)
	const [selectedRoles, setSelectedRoles] = useState<string[]>([])
	const [assigning, setAssigning] = useState(false)

	// Revoke state (per role badge)
	const [revokingKey, setRevokingKey] = useState<string | null>(null)

	// ---- Data fetching -------------------------------------------------------

	const fetchCoeUsers = useCallback(async () => {
		if (!isReady) return
		try {
			setUsersLoading(true)
			let url = '/api/admin/role-management'
			// Apply institution filter via appendToUrl (adds institutions_id param)
			url = appendToUrl(url)
			if (usersSearch.trim()) {
				const sep = url.includes('?') ? '&' : '?'
				url = `${url}${sep}search=${encodeURIComponent(usersSearch.trim())}`
			}
			const response = await apiFetch(url)
			if (!response.ok) {
				const errorBody = await response.json().catch(() => ({}))
				throw new Error(errorBody.error || `Failed to fetch users (${response.status})`)
			}
			const data = await response.json()
			setCoeUsers(data)
		} catch (error) {
			console.error('Error fetching COE users:', error)
			const message = error instanceof Error ? error.message : 'Please refresh and try again.'
			toast({
				title: 'Failed to load users',
				description: message,
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setUsersLoading(false)
		}
	}, [usersSearch, toast, isReady, appendToUrl, apiFetch])

	const fetchAvailableRoles = async () => {
		try {
			const response = await apiFetch('/api/admin/role-management/roles')
			if (!response.ok) {
				const errorBody = await response.json().catch(() => ({}))
				throw new Error(errorBody.error || `Failed to fetch roles (${response.status})`)
			}
			const data = await response.json()
			setAvailableRoles(data)
		} catch (error) {
			console.error('Error fetching roles:', error)
			const message = error instanceof Error ? error.message : 'Could not load available roles.'
			toast({
				title: 'Failed to load roles',
				description: message,
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		}
	}

	const searchMyJkknUsers = useCallback(async (query: string) => {
		if (query.trim().length < 2) {
			setMyjkknResults([])
			setMyjkknSearched(false)
			return
		}
		try {
			setMyjkknLoading(true)
			setMyjkknSearched(true)
			const response = await apiFetch(
				`/api/admin/role-management/search-myjkkn?search=${encodeURIComponent(query.trim())}`
			)
			if (!response.ok) throw new Error('Search failed')
			const data = await response.json()
			setMyjkknResults(data)
		} catch (error) {
			console.error('Error searching MyJKKN:', error)
			setMyjkknResults([])
			toast({
				title: 'Search failed',
				description: 'Could not connect to MyJKKN. Please try again.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setMyjkknLoading(false)
		}
	}, [toast, apiFetch])

	// Initial load — wait for institution filter to be ready
	useEffect(() => {
		if (!isReady) return
		fetchCoeUsers()
		fetchAvailableRoles()
	}, [isReady]) // eslint-disable-line react-hooks/exhaustive-deps

	// Re-fetch when institution filter changes
	useEffect(() => {
		if (!isReady) return
		fetchCoeUsers()
	}, [shouldFilter, institutionId]) // eslint-disable-line react-hooks/exhaustive-deps

	// Debounced MyJKKN search
	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current)
		if (myjkknSearch.trim().length < 2) {
			setMyjkknResults([])
			setMyjkknSearched(false)
			return
		}
		debounceRef.current = setTimeout(() => {
			searchMyJkknUsers(myjkknSearch)
		}, 300)
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [myjkknSearch, searchMyJkknUsers])

	// COE users search — refetch when search changes
	useEffect(() => {
		fetchCoeUsers()
	}, [fetchCoeUsers])

	// ---- Actions -------------------------------------------------------------

	const openAssignSheet = (myjkknUser: MyJkknUser) => {
		setSelectedMyJkknUser(myjkknUser)
		// Pre-select already assigned roles
		const existingUser = coeUsers.find(u => u.email === myjkknUser.email)
		const existingRoles = existingUser?.coe_roles?.map((r: any) => r.role_name) || []
		setSelectedRoles(existingRoles)
		setAssignSheetOpen(true)
	}

	const toggleRole = (roleName: string) => {
		setSelectedRoles(prev =>
			prev.includes(roleName)
				? prev.filter(r => r !== roleName)
				: [...prev, roleName]
		)
	}

	const handleAssign = async () => {
		if (!selectedMyJkknUser || selectedRoles.length === 0) {
			toast({
				title: 'Please select at least one role',
				description: 'At least one role must be selected before assigning.',
				variant: 'destructive',
			})
			return
		}

		try {
			setAssigning(true)

			// Find existing roles for this user to determine what to revoke
			const existingUser = coeUsers.find(u => u.email === selectedMyJkknUser.email)
			const existingRoleNames = existingUser?.coe_roles?.map((r: CoeRole) => r.role_name) || []

			// Roles to add (selected but not currently assigned)
			const rolesToAdd = selectedRoles.filter(r => !existingRoleNames.includes(r))
			// Roles to revoke (currently assigned but no longer selected)
			const rolesToRevoke = existingRoleNames.filter(r => !selectedRoles.includes(r))

			// Assign new roles
			if (rolesToAdd.length > 0) {
				const response = await apiFetch('/api/admin/role-management/assign', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: selectedMyJkknUser.email,
						full_name: selectedMyJkknUser.full_name,
						role_names: rolesToAdd,
						parent_user_id: selectedMyJkknUser.parent_user_id,
						institution_id: selectedMyJkknUser.institution_id,
						avatar_url: selectedMyJkknUser.avatar_url,
					}),
				})
				if (!response.ok) {
					const result = await response.json()
					throw new Error(result.error || 'Failed to assign roles')
				}
			}

			// Revoke removed roles
			if (rolesToRevoke.length > 0 && existingUser) {
				for (const roleName of rolesToRevoke) {
					await apiFetch('/api/admin/role-management/revoke', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ user_id: existingUser.id, role_name: roleName }),
					})
				}
			}

			toast({
				title: 'Roles updated',
				description: `${selectedRoles.length} role(s) set for ${selectedMyJkknUser.email}`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
			})

			setAssignSheetOpen(false)
			setSelectedMyJkknUser(null)
			setSelectedRoles([])
			fetchCoeUsers()
		} catch (error) {
			console.error('Error updating roles:', error)
			toast({
				title: 'Update failed',
				description: error instanceof Error ? error.message : 'Please try again.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setAssigning(false)
		}
	}

	const handleRevoke = async (user: CoeUser, roleName: string, userRoleId: string) => {
		const key = `${user.id}:${userRoleId}`
		try {
			setRevokingKey(key)
			const response = await apiFetch('/api/admin/role-management/revoke', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id, role_name: roleName }),
			})

			const result = await response.json()

			if (!response.ok) {
				throw new Error(result.error || 'Failed to revoke role')
			}

			toast({
				title: 'Role revoked',
				description: result.message || `Role "${roleName}" revoked from ${user.email}`,
				className: 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200',
			})

			// Optimistic update — remove the role from local state
			setCoeUsers((prev) =>
				prev.map((u) =>
					u.id === user.id
						? { ...u, coe_roles: u.coe_roles.filter((r) => r.id !== userRoleId) }
						: u
				)
			)
		} catch (error) {
			console.error('Error revoking role:', error)
			toast({
				title: 'Revoke failed',
				description: error instanceof Error ? error.message : 'Please try again.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
			})
		} finally {
			setRevokingKey(null)
		}
	}

	const [deletingUserId, setDeletingUserId] = useState<string | null>(null)

	const handleDeleteUser = async (user: CoeUser) => {
		if (!confirm(`Remove "${user.full_name || user.email}" from COE? This will revoke all their roles and delete their COE account.`)) {
			return
		}

		try {
			setDeletingUserId(user.id)
			const response = await apiFetch('/api/admin/role-management/remove-user', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: user.id }),
			})

			const result = await response.json()

			if (!response.ok) {
				throw new Error(result.error || 'Failed to remove user')
			}

			toast({
				title: 'User removed',
				description: `${user.full_name || user.email} has been removed from COE`,
				className: 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200',
			})

			// Remove from local state
			setCoeUsers((prev) => prev.filter((u) => u.id !== user.id))
		} catch (error) {
			console.error('Error removing user:', error)
			toast({
				title: 'Remove failed',
				description: error instanceof Error ? error.message : 'Please try again.',
				variant: 'destructive',
			})
		} finally {
			setDeletingUserId(null)
		}
	}

	// ---- Derived values ------------------------------------------------------

	const totalUsers = coeUsers.length
	const usersWithRoles = coeUsers.filter((u) => u.coe_roles.length > 0).length
	const usersWithoutRoles = coeUsers.filter((u) => u.coe_roles.length === 0).length
	const totalRoleAssignments = coeUsers.reduce((sum, u) => sum + u.coe_roles.length, 0)

	// ---- Render --------------------------------------------------------------

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
					<div className="flex items-center gap-2">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/dashboard">Dashboard</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Role Management</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Page title */}
					<div>
						<h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
							<Shield className="h-6 w-6 text-primary" />
							Role Management
						</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Manage COE portal access by assigning roles to MyJKKN users
						</p>
					</div>

					{/* Stats cards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{totalUsers}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total COE Users</p>
									</div>
									<Users className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{usersWithRoles}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Users With Roles</p>
									</div>
									<ShieldCheck className="h-5 w-5 text-green-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{usersWithoutRoles}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">No Roles Assigned</p>
									</div>
									<ShieldOff className="h-5 w-5 text-rose-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{totalRoleAssignments}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Role Assignments</p>
									</div>
									<Shield className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Search MyJKKN users section */}
					<Card className="flex-shrink-0">
						<CardHeader className="p-4 pb-3">
							<div className="flex items-center gap-2 mb-3">
								<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
									<UserPlus className="h-3.5 w-3.5 text-primary" />
								</div>
								<div>
									<h2 className="text-sm font-semibold">Search MyJKKN Users</h2>
									<p className="text-xs text-muted-foreground">Find users by name or email to assign a COE role</p>
								</div>
							</div>

							<div className="relative max-w-md">
								<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={myjkknSearch}
									onChange={(e) => setMyjkknSearch(e.target.value)}
									placeholder="Type at least 2 characters to search..."
									className="pl-9 h-9 text-sm"
								/>
								{myjkknLoading && (
									<Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
								)}
							</div>
						</CardHeader>

						{/* Search results */}
						{(myjkknResults.length > 0 || (myjkknSearched && !myjkknLoading)) && (
							<CardContent className="p-4 pt-0">
								{myjkknResults.length === 0 ? (
									<div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
										<Users className="h-8 w-8 opacity-20 mb-2" />
										<p className="text-sm">No MyJKKN users found</p>
										<p className="text-xs">Try a different name or email</p>
									</div>
								) : (
									<div className="space-y-2">
										<p className="text-xs text-muted-foreground mb-2">
											{myjkknResults.length} result{myjkknResults.length !== 1 ? 's' : ''} found
										</p>
										<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
											{myjkknResults.map((myjkknUser) => (
												<div
													key={myjkknUser.id}
													className="flex items-start gap-3 rounded-lg border p-3 bg-card hover:bg-accent/30 transition-colors"
												>
													<Avatar className="h-10 w-10 shrink-0 mt-0.5">
														<AvatarImage
															src={myjkknUser.avatar_url || undefined}
															alt={myjkknUser.full_name || myjkknUser.email}
														/>
														<AvatarFallback className="text-xs">
															{getInitials(myjkknUser.full_name, myjkknUser.email)}
														</AvatarFallback>
													</Avatar>
													<div className="flex-1 min-w-0">
														<p className="text-sm font-medium truncate">
															{myjkknUser.full_name || '—'}
														</p>
														<p className="text-xs text-muted-foreground truncate">
															{myjkknUser.email}
														</p>
														<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
															{myjkknUser.designation && (
																<span>{myjkknUser.designation}</span>
															)}
															{myjkknUser.phone_number && (
																<span>{myjkknUser.phone_number}</span>
															)}
															{myjkknUser.gender && (
																<span className="capitalize">{myjkknUser.gender}</span>
															)}
														</div>
														<div className="flex items-center gap-1.5 mt-1">
															{myjkknUser.role && (
																<Badge variant="secondary" className="text-xs h-4 px-1.5">
																	{myjkknUser.role}
																</Badge>
															)}
															{(() => {
																const existing = coeUsers.find(u => u.email === myjkknUser.email)
																if (existing && existing.coe_roles.length > 0) {
																	return existing.coe_roles.map((cr: CoeRole) => (
																		<Badge key={cr.id} variant="outline" className="text-xs h-4 px-1.5 border-green-500 text-green-700 dark:text-green-400">
																			{cr.role_name}
																		</Badge>
																	))
																}
																return null
															})()}
														</div>
													</div>
													<Button
														size="sm"
														variant="outline"
														className="shrink-0 h-7 text-xs px-2 mt-0.5"
														onClick={() => openAssignSheet(myjkknUser)}
													>
														<UserPlus className="h-3 w-3 mr-1" />
														{coeUsers.find(u => u.email === myjkknUser.email)?.coe_roles.length ? 'Edit' : 'Assign'}
													</Button>
												</div>
											))}
										</div>
									</div>
								)}
							</CardContent>
						)}
					</Card>

					{/* Current COE users table */}
					<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 p-3">
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-2">
									<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
										<Shield className="h-3 w-3 text-primary" />
									</div>
									<div>
										<h2 className="text-sm font-semibold">Current COE Users</h2>
										<p className="text-xs text-muted-foreground">
											Users with access to the COE portal
										</p>
									</div>
								</div>
							</div>

							<div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
								<div className="relative w-full sm:w-[240px]">
									<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={usersSearch}
										onChange={(e) => setUsersSearch(e.target.value)}
										placeholder="Search users..."
										className="pl-8 h-8 text-xs"
									/>
								</div>
								<Button
									variant="outline"
									size="sm"
									className="h-8 w-8 p-0 shrink-0"
									onClick={() => fetchCoeUsers()}
									disabled={usersLoading}
								>
									<RefreshCw className={`h-3 w-3 ${usersLoading ? 'animate-spin' : ''}`} />
								</Button>
							</div>
						</CardHeader>

						<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
							<div className="rounded-md border overflow-hidden" style={{ height: '440px' }}>
								<div className="h-full overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												<TableHead className="w-10 text-xs" />
												<TableHead className="text-xs">Name</TableHead>
												<TableHead className="text-xs">Email</TableHead>
												{mustSelectInstitution && <TableHead className="text-xs">Institution</TableHead>}
												<TableHead className="text-xs">COE Roles</TableHead>
												<TableHead className="w-[80px] text-xs text-center">Status</TableHead>
												<TableHead className="w-[80px] text-xs text-center">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{usersLoading ? (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 7 : 6} className="h-32 text-center">
														<div className="flex flex-col items-center gap-2 text-muted-foreground">
															<RefreshCw className="h-5 w-5 animate-spin" />
															<span className="text-sm">Loading...</span>
														</div>
													</TableCell>
												</TableRow>
											) : coeUsers.length === 0 ? (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 7 : 6} className="h-32 text-center">
														<div className="flex flex-col items-center gap-2 text-muted-foreground">
															<Users className="h-8 w-8 opacity-20" />
															<span className="text-sm">No users found</span>
															<span className="text-xs">Assign a role to a MyJKKN user to get started</span>
														</div>
													</TableCell>
												</TableRow>
											) : (
												coeUsers.map((user) => (
													<TableRow key={user.id}>
														{/* Avatar */}
														<TableCell className="py-2">
															<Avatar className="h-7 w-7">
																<AvatarImage
																	src={user.avatar_url || undefined}
																	alt={user.full_name || user.email}
																/>
																<AvatarFallback className="text-xs">
																	{getInitials(user.full_name, user.email)}
																</AvatarFallback>
															</Avatar>
														</TableCell>

														{/* Name */}
														<TableCell className="text-sm font-medium py-2">
															{user.full_name || '—'}
														</TableCell>

														{/* Email */}
														<TableCell className="text-sm text-muted-foreground py-2">
															{user.email}
														</TableCell>

														{/* Institution — only when All Institutions selected */}
														{mustSelectInstitution && (
															<TableCell className="text-sm py-2">
																<Badge variant="outline" className="text-xs">
																	{user.institution_code || '—'}
																</Badge>
															</TableCell>
														)}

														{/* Roles — badges with X to revoke */}
														<TableCell className="py-2">
															{user.coe_roles.length === 0 ? (
																<span className="text-xs text-muted-foreground italic">No roles</span>
															) : (
																<div className="flex flex-wrap gap-1">
																	{user.coe_roles.map((coeRole) => {
																		const revokeKey = `${user.id}:${coeRole.id}`
																		const isRevoking = revokingKey === revokeKey
																		return (
																			<Badge
																				key={coeRole.id}
																				variant="secondary"
																				className="text-xs h-5 px-1.5 gap-1 bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300"
																			>
																				<Shield className="h-2.5 w-2.5" />
																				{coeRole.role_name}
																				<button
																					onClick={() =>
																						handleRevoke(user, coeRole.role_name, coeRole.id)
																					}
																					disabled={isRevoking}
																					className="ml-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 p-0.5 transition-colors disabled:opacity-50"
																					title={`Revoke ${coeRole.role_name}`}
																				>
																					{isRevoking ? (
																						<Loader2 className="h-2.5 w-2.5 animate-spin" />
																					) : (
																						<X className="h-2.5 w-2.5" />
																					)}
																				</button>
																			</Badge>
																		)
																	})}
																</div>
															)}
														</TableCell>

														{/* Active status */}
														<TableCell className="py-2 text-center">
															<Badge
																variant={user.is_active ? 'default' : 'secondary'}
																className={`text-xs ${
																	user.is_active
																		? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
																		: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200'
																}`}
															>
																{user.is_active ? 'Active' : 'Inactive'}
															</Badge>
														</TableCell>

														{/* Actions */}
														<TableCell className="py-2 text-center">
															<div className="flex items-center justify-center gap-1">
																<Button
																	variant="ghost"
																	size="sm"
																	className="h-7 w-7 p-0"
																	title="Edit roles"
																	onClick={() => {
																		openAssignSheet({
																			id: user.id,
																			parent_user_id: user.id,
																			email: user.email,
																			full_name: user.full_name,
																			role: '',
																			avatar_url: user.avatar_url,
																			institution_id: user.institution_id,
																			is_active: user.is_active,
																			phone_number: null,
																			designation: null,
																			gender: null,
																		})
																	}}
																>
																	<Pencil className="h-3.5 w-3.5" />
																</Button>
																<Button
																	variant="ghost"
																	size="sm"
																	className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
																	title="Remove user from COE"
																	disabled={deletingUserId === user.id}
																	onClick={() => handleDeleteUser(user)}
																>
																	{deletingUserId === user.id ? (
																		<Loader2 className="h-3.5 w-3.5 animate-spin" />
																	) : (
																		<Trash2 className="h-3.5 w-3.5" />
																	)}
																</Button>
															</div>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</div>
							</div>

							{/* Footer count */}
							<div className="pt-2">
								<p className="text-xs text-muted-foreground tabular-nums">
									{coeUsers.length} user{coeUsers.length !== 1 ? 's' : ''}
								</p>
							</div>
						</CardContent>
					</Card>
				</div>

				<AppFooter />
			</SidebarInset>

			{/* Assign Role Sheet */}
			<Sheet
				open={assignSheetOpen}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedMyJkknUser(null)
						setSelectedRoles([])
					}
					setAssignSheetOpen(open)
				}}
			>
				<SheetContent className="sm:max-w-[480px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-lg font-semibold flex items-center gap-2">
							<UserPlus className="h-5 w-5" />
							Assign COE Role
						</SheetTitle>
						<SheetDescription>
							Grant this MyJKKN user access to the COE portal with the selected role.
						</SheetDescription>
					</SheetHeader>

					{selectedMyJkknUser && (
						<div className="mt-6 space-y-6">
							{/* User info card */}
							<div>
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
									User
								</h3>
								<div className="flex items-center gap-3 rounded-lg border p-4 bg-muted/30">
									<Avatar className="h-10 w-10 shrink-0">
										<AvatarImage
											src={selectedMyJkknUser.avatar_url || undefined}
											alt={selectedMyJkknUser.full_name || selectedMyJkknUser.email}
										/>
										<AvatarFallback>
											{getInitials(selectedMyJkknUser.full_name, selectedMyJkknUser.email)}
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0">
										<p className="text-sm font-semibold truncate">
											{selectedMyJkknUser.full_name || '—'}
										</p>
										<p className="text-xs text-muted-foreground truncate">
											{selectedMyJkknUser.email}
										</p>
										{selectedMyJkknUser.role && (
											<p className="text-xs text-muted-foreground mt-0.5">
												MyJKKN role: <span className="font-medium">{selectedMyJkknUser.role}</span>
											</p>
										)}
									</div>
								</div>
							</div>

							{/* Role selection — checkboxes */}
							<div className="space-y-3">
								<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
									COE Roles
								</h3>
								<p className="text-sm text-muted-foreground">
									Select one or more roles <span className="text-red-500">*</span>
								</p>
								<div className="space-y-2">
									{availableRoles.map((role) => {
										const checked = selectedRoles.includes(role.name)
										return (
											<label
												key={role.id}
												className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
													checked
														? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700'
														: 'border-border hover:bg-muted/50'
												}`}
											>
												<input
													type="checkbox"
													checked={checked}
													onChange={() => toggleRole(role.name)}
													className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
												/>
												<div className="min-w-0">
													<p className={`text-sm font-medium ${checked ? 'text-blue-800 dark:text-blue-300' : ''}`}>
														{role.name}
													</p>
													{role.description && (
														<p className="text-xs text-muted-foreground mt-0.5">
															{role.description}
														</p>
													)}
												</div>
											</label>
										)
									})}
								</div>
								{selectedRoles.length > 0 && (
									<p className="text-xs text-muted-foreground">
										{selectedRoles.length} role(s) selected
									</p>
								)}
							</div>

							{/* Actions */}
							<div className="flex justify-end gap-3 pt-4 border-t">
								<Button
									variant="outline"
									size="sm"
									className="h-10 px-6"
									onClick={() => setAssignSheetOpen(false)}
									disabled={assigning}
								>
									Cancel
								</Button>
								<Button
									size="sm"
									className="h-10 px-6"
									onClick={handleAssign}
									disabled={assigning || selectedRoles.length === 0}
								>
									{assigning ? (
										<>
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											Assigning...
										</>
									) : (
										<>
											<UserPlus className="h-4 w-4 mr-2" />
											Assign Role
										</>
									)}
								</Button>
							</div>
						</div>
					)}
				</SheetContent>
			</Sheet>
		</SidebarProvider>
	)
}
