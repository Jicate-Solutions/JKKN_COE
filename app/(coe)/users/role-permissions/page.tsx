"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { ProtectedRoute } from "@/components/common/protected-route"
import { useAuth } from "@/context/auth-context"
import { useToast } from "@/hooks"
import { Skeleton } from "@/components/ui/skeleton"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion"
import {
	Search,
	Shield,
	Key,
	Save,
	Users,
	Loader2,
	RefreshCw,
	ChevronsUpDown,
	BookOpen,
	ClipboardList,
	Award,
	BarChart3,
	Settings,
	Layers,
	CheckSquare,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────

interface Role {
	id: string
	role_name: string
	role_description: string
	is_active: boolean
	created_at: string
	name?: string
}

interface Permission {
	id: string
	name: string
	description?: string
	resource: string
	action: string
	is_active: boolean
}

interface ModuleGroup {
	key: string
	label: string
	icon: React.ElementType
	color: string
	resources: string[]
}

// ── Module grouping configuration ──────────────────────

const MODULE_GROUPS: ModuleGroup[] = [
	{
		key: 'users_access',
		label: 'Users & Access',
		icon: Users,
		color: 'blue',
		resources: ['users', 'roles', 'permissions', 'role_permissions', 'role-permissions', 'staff'],
	},
	{
		key: 'master_data',
		label: 'Master Data',
		icon: BookOpen,
		color: 'emerald',
		resources: ['courses', 'degrees', 'departments', 'institutions', 'programs', 'regulations', 'batches', 'semesters', 'subjects', 'streams', 'course_offerings', 'course_mapping', 'academic_years'],
	},
	{
		key: 'exam_management',
		label: 'Exam Management',
		icon: ClipboardList,
		color: 'amber',
		resources: ['exam_registrations', 'exam_timetables', 'exam_sessions', 'examination_sessions', 'examiners', 'question_papers', 'hall_tickets', 'seating_arrangements', 'exam_centres', 'exam_attendance'],
	},
	{
		key: 'marks_results',
		label: 'Marks & Results',
		icon: Award,
		color: 'purple',
		resources: ['internal_marks', 'final_marks', 'marks_entry', 'results', 'grades', 'grading', 'grade_ranges', 'result_processing', 'marksheets', 'consolidated_marks'],
	},
	{
		key: 'reports_analytics',
		label: 'Reports & Analytics',
		icon: BarChart3,
		color: 'teal',
		resources: ['reports', 'analytics', 'dashboards', 'nad', 'abc', 'nad_reports', 'abc_reports'],
	},
	{
		key: 'settings',
		label: 'Settings & System',
		icon: Settings,
		color: 'rose',
		resources: ['settings', 'configurations', 'system', 'notifications', 'email_templates', 'audit_logs'],
	},
]

const ACTIONS_ORDER = ['admin', 'view', 'create', 'edit', 'delete', 'report', 'import', 'export']

function getModuleForResource(resource: string): string {
	for (const group of MODULE_GROUPS) {
		if (group.resources.includes(resource.toLowerCase())) {
			return group.key
		}
	}
	return 'other'
}

const OTHER_MODULE: ModuleGroup = {
	key: 'other',
	label: 'Other',
	icon: Layers,
	color: 'gray',
	resources: [],
}

// ── Color utilities ────────────────────────────────────

const colorMap: Record<string, { border: string; icon: string; bg: string; badge: string }> = {
	blue: { border: 'border-l-blue-500', icon: 'text-blue-500/40', bg: 'bg-blue-500/10', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
	emerald: { border: 'border-l-emerald-500', icon: 'text-emerald-500/40', bg: 'bg-emerald-500/10', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
	amber: { border: 'border-l-amber-500', icon: 'text-amber-500/40', bg: 'bg-amber-500/10', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
	purple: { border: 'border-l-purple-500', icon: 'text-purple-500/40', bg: 'bg-purple-500/10', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
	teal: { border: 'border-l-teal-500', icon: 'text-teal-500/40', bg: 'bg-teal-500/10', badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
	rose: { border: 'border-l-rose-500', icon: 'text-rose-500/40', bg: 'bg-rose-500/10', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
	gray: { border: 'border-l-gray-500', icon: 'text-gray-500/40', bg: 'bg-gray-500/10', badge: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300' },
}

// ── Main Component ─────────────────────────────────────

export default function RolePermissionsPage() {
	const { refreshPermissions } = useAuth()
	const { toast } = useToast()
	const [roles, setRoles] = useState<Role[]>([])
	const [loading, setLoading] = useState(true)
	const [permissionsLoading, setPermissionsLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [selectedRole, setSelectedRole] = useState<Role | null>(null)
	const [permissions, setPermissions] = useState<Permission[]>([])
	const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set())
	const [modified, setModified] = useState(false)
	const [permissionSearch, setPermissionSearch] = useState("")
	const [moduleFilter, setModuleFilter] = useState("all")
	const [openModules, setOpenModules] = useState<string[]>([])

	const getRoleName = (r: Role): string => (r.role_name || r.name || "")

	// ── Data fetching ──────────────────────────────────

	const fetchRoles = async () => {
		try {
			setLoading(true)
			const response = await fetch('/api/users/roles')
			if (response.ok) {
				const data = await response.json()
				setRoles(data)
			}
		} catch (error) {
			console.error('Error fetching roles:', error)
		} finally {
			setLoading(false)
		}
	}

	const fetchPermissions = async () => {
		try {
			setPermissionsLoading(true)
			const res = await fetch('/api/users/permissions')
			if (res.ok) setPermissions(await res.json())
		} catch (e) {
			console.error('Failed to fetch permissions', e)
		} finally {
			setPermissionsLoading(false)
		}
	}

	useEffect(() => {
		fetchRoles()
		fetchPermissions()
	}, [])

	useEffect(() => {
		const loadRolePermissions = async () => {
			if (!selectedRole) return
			try {
				setPermissionsLoading(true)
				const res = await fetch(`/api/users/role-permissions?role_id=${selectedRole.id}`)
				if (res.ok) {
					const rows: { permission_id: string }[] = await res.json()
					setSelectedPermissionIds(new Set(rows.map(r => r.permission_id)))
					setModified(false)
				}
			} catch (e) {
				console.error('Failed to fetch role-permissions', e)
			} finally {
				setPermissionsLoading(false)
			}
		}
		loadRolePermissions()
	}, [selectedRole])

	// ── Permission grouping ────────────────────────────

	const permissionsByResource = useMemo(() => {
		const grouped: Record<string, Permission[]> = {}
		for (const p of permissions) {
			const key = p.resource || 'General'
			if (!grouped[key]) grouped[key] = []
			grouped[key].push(p)
		}
		Object.values(grouped).forEach(list => list.sort((a, b) => {
			const ai = ACTIONS_ORDER.indexOf(a.action.toLowerCase())
			const bi = ACTIONS_ORDER.indexOf(b.action.toLowerCase())
			return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
		}))
		return grouped
	}, [permissions])

	// Derive unique actions from actual data
	const allActions = useMemo(() => {
		const actionSet = new Set<string>()
		for (const p of permissions) {
			actionSet.add(p.action.toLowerCase())
		}
		return ACTIONS_ORDER.filter(a => actionSet.has(a))
			.concat([...actionSet].filter(a => !ACTIONS_ORDER.includes(a)).sort())
	}, [permissions])

	// Group resources into modules
	const moduleData = useMemo(() => {
		const resourceList = Object.keys(permissionsByResource)
		const moduleMap: Record<string, string[]> = {}

		for (const resource of resourceList) {
			const moduleKey = getModuleForResource(resource)
			if (!moduleMap[moduleKey]) moduleMap[moduleKey] = []
			moduleMap[moduleKey].push(resource)
		}

		// Sort resources within each module
		Object.values(moduleMap).forEach(list => list.sort())

		// Build ordered module list
		const result: (ModuleGroup & { activeResources: string[] })[] = []
		for (const group of MODULE_GROUPS) {
			if (moduleMap[group.key]?.length) {
				result.push({ ...group, activeResources: moduleMap[group.key] })
			}
		}
		if (moduleMap['other']?.length) {
			result.push({ ...OTHER_MODULE, activeResources: moduleMap['other'] })
		}

		return result
	}, [permissionsByResource])

	// Filter by search and module
	const filteredModuleData = useMemo(() => {
		const q = permissionSearch.trim().toLowerCase()

		return moduleData
			.filter(m => moduleFilter === 'all' || m.key === moduleFilter)
			.map(m => {
				if (!q) return m
				const filteredResources = m.activeResources.filter(resource => {
					if (resource.toLowerCase().includes(q)) return true
					const perms = permissionsByResource[resource] || []
					return perms.some(p =>
						p.action.toLowerCase().includes(q) ||
						(p.name || '').toLowerCase().includes(q)
					)
				})
				return { ...m, activeResources: filteredResources }
			})
			.filter(m => m.activeResources.length > 0)
	}, [moduleData, permissionSearch, moduleFilter, permissionsByResource])

	// Auto-open all modules when role is selected or data changes
	useEffect(() => {
		if (selectedRole && filteredModuleData.length > 0) {
			setOpenModules(filteredModuleData.map(m => m.key))
		}
	}, [selectedRole, filteredModuleData.length])

	// ── Scorecards ─────────────────────────────────────

	const totalPermissions = permissions.length
	const assignedCount = selectedPermissionIds.size
	const moduleCount = moduleData.length
	const coveragePercent = totalPermissions > 0 ? Math.round((assignedCount / totalPermissions) * 100) : 0

	// ── Permission toggle handlers ─────────────────────

	const handlePermissionToggle = useCallback((permissionId: string, checked: boolean) => {
		setSelectedPermissionIds(prev => {
			const next = new Set(prev)
			if (checked) next.add(permissionId)
			else next.delete(permissionId)
			return next
		})
		setModified(true)
	}, [])

	const handleAdminToggle = useCallback((resource: string, checked: boolean) => {
		const resourcePermissions = permissions.filter(p => p.resource === resource)
		setSelectedPermissionIds(prev => {
			const next = new Set(prev)
			if (checked) {
				resourcePermissions.forEach(perm => next.add(perm.id))
			} else {
				resourcePermissions.forEach(perm => next.delete(perm.id))
			}
			return next
		})
		setModified(true)
	}, [permissions])

	const handleSelectAllForAction = useCallback((action: string, select: boolean) => {
		const actionPermissions = permissions.filter(p => p.action.toLowerCase() === action.toLowerCase())
		setSelectedPermissionIds(prev => {
			const next = new Set(prev)
			if (select) {
				actionPermissions.forEach(perm => next.add(perm.id))
			} else {
				actionPermissions.forEach(perm => next.delete(perm.id))
			}
			return next
		})
		setModified(true)
	}, [permissions])

	const handleModuleToggle = useCallback((moduleResources: string[], select: boolean) => {
		setSelectedPermissionIds(prev => {
			const next = new Set(prev)
			for (const resource of moduleResources) {
				const perms = permissionsByResource[resource] || []
				for (const p of perms) {
					if (select) next.add(p.id)
					else next.delete(p.id)
				}
			}
			return next
		})
		setModified(true)
	}, [permissionsByResource])

	const handleSelectAll = useCallback((select: boolean) => {
		setSelectedPermissionIds(prev => {
			const next = new Set(select ? prev : new Set<string>())
			if (select) {
				permissions.forEach(p => next.add(p.id))
			}
			return next
		})
		setModified(true)
	}, [permissions])

	// ── Save/Cancel ────────────────────────────────────

	const handleCancel = useCallback(() => {
		// Reload the role's permissions
		if (selectedRole) {
			const reload = async () => {
				try {
					setPermissionsLoading(true)
					const res = await fetch(`/api/users/role-permissions?role_id=${selectedRole.id}`)
					if (res.ok) {
						const rows: { permission_id: string }[] = await res.json()
						setSelectedPermissionIds(new Set(rows.map(r => r.permission_id)))
						setModified(false)
					}
				} catch (e) {
					console.error('Failed to reload permissions', e)
				} finally {
					setPermissionsLoading(false)
				}
			}
			reload()
		} else {
			setSelectedPermissionIds(new Set())
			setModified(false)
		}
	}, [selectedRole])

	const handleSavePermissions = async () => {
		if (!selectedRole) return
		try {
			setSaving(true)
			const response = await fetch('/api/users/role-permissions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role_id: selectedRole.id, permission_ids: Array.from(selectedPermissionIds) })
			})
			if (response.ok) {
				setModified(false)
				await refreshPermissions()
				toast({
					title: "Permissions Updated",
					description: `Permissions for "${getRoleName(selectedRole)}" have been saved successfully.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			} else {
				const errorData = await response.json().catch(() => ({}))
				throw new Error(errorData.error || 'Failed to update permissions')
			}
		} catch (error) {
			console.error('Error updating permissions:', error)
			toast({
				title: "Update Failed",
				description: error instanceof Error ? error.message : 'Failed to save permissions.',
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setSaving(false)
		}
	}

	// ── Module checkbox state (all / some / none) ──────

	const getModuleCheckState = (resources: string[]): 'all' | 'some' | 'none' => {
		let total = 0
		let selected = 0
		for (const resource of resources) {
			const perms = permissionsByResource[resource] || []
			total += perms.length
			selected += perms.filter(p => selectedPermissionIds.has(p.id)).length
		}
		if (total === 0) return 'none'
		if (selected === total) return 'all'
		if (selected > 0) return 'some'
		return 'none'
	}

	const getActionCheckState = (action: string): 'all' | 'some' | 'none' => {
		const actionPerms = permissions.filter(p => p.action.toLowerCase() === action)
		if (actionPerms.length === 0) return 'none'
		const selected = actionPerms.filter(p => selectedPermissionIds.has(p.id)).length
		if (selected === actionPerms.length) return 'all'
		if (selected > 0) return 'some'
		return 'none'
	}

	// ── Expand / Collapse all ──────────────────────────

	const expandAll = () => setOpenModules(filteredModuleData.map(m => m.key))
	const collapseAll = () => setOpenModules([])

	// ── Format resource name for display ───────────────

	const formatResourceName = (resource: string): string => {
		return resource
			.replace(/_/g, ' ')
			.replace(/-/g, ' ')
			.replace(/\b\w/g, l => l.toUpperCase())
	}

	// ── Render ─────────────────────────────────────────

	return (
		<ProtectedRoute requiredRoles={["admin", "super_admin"]} requireAnyRole={true}>
			<SidebarProvider>
				<AppSidebar />
				<SidebarInset className="flex flex-col min-h-screen">
					<AppHeader />

					<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
						{/* Breadcrumb */}
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink asChild>
										<Link href="/" className="hover:text-primary">Dashboard</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Role Permissions</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>

						{/* Scorecards */}
						{selectedRole && (
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
								<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
									<CardContent className="p-4">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-2xl font-bold tracking-tight">{totalPermissions}</p>
												<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Permissions</p>
											</div>
											<Key className="h-5 w-5 text-blue-500/40" />
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
									<CardContent className="p-4">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-2xl font-bold tracking-tight">{assignedCount}</p>
												<p className="text-xs font-medium text-muted-foreground mt-0.5">Assigned</p>
											</div>
											<CheckSquare className="h-5 w-5 text-emerald-500/40" />
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
									<CardContent className="p-4">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-2xl font-bold tracking-tight">{moduleCount}</p>
												<p className="text-xs font-medium text-muted-foreground mt-0.5">Modules</p>
											</div>
											<Layers className="h-5 w-5 text-purple-500/40" />
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
									<CardContent className="p-4">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-2xl font-bold tracking-tight">{coveragePercent}%</p>
												<p className="text-xs font-medium text-muted-foreground mt-0.5">Coverage</p>
											</div>
											<Shield className="h-5 w-5 text-amber-500/40" />
										</div>
									</CardContent>
								</Card>
							</div>
						)}

						{/* Main Card */}
						<TooltipProvider delayDuration={300}>
							<Card className="flex-1 flex flex-col min-h-0">
								<CardHeader className="flex-shrink-0 px-4 py-3 border-b space-y-3">
									{/* Row 1: Title + Actions */}
									<div className="flex items-center justify-between">
										<div>
											<p className="text-base font-semibold">Role Permissions</p>
											<p className="text-xs text-muted-foreground">Select a role and configure its access permissions</p>
										</div>
										<div className="flex items-center gap-1.5">
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="outline"
														className="h-8 w-8 p-0"
														onClick={() => { fetchRoles(); fetchPermissions() }}
														disabled={loading || permissionsLoading}
													>
														<RefreshCw className={`h-4 w-4 ${(loading || permissionsLoading) ? 'animate-spin' : ''}`} />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Refresh</TooltipContent>
											</Tooltip>
										</div>
									</div>

									{/* Row 2: Role selector + Search + Module filter */}
									<div className="flex items-center gap-2 flex-wrap">
										{/* Role Selector */}
										<Select
											value={selectedRole?.id || ""}
											onValueChange={(value) => {
												const role = roles.find(r => r.id === value)
												setSelectedRole(role || null)
												setSelectedPermissionIds(new Set())
												setModified(false)
												setPermissionSearch("")
												setModuleFilter("all")
											}}
										>
											<SelectTrigger className="h-8 text-sm w-[220px]">
												<SelectValue placeholder="Select role..." />
											</SelectTrigger>
											<SelectContent>
												{loading ? (
													<SelectItem value="loading" disabled>Loading roles...</SelectItem>
												) : roles.length === 0 ? (
													<SelectItem value="no-roles" disabled>No roles found</SelectItem>
												) : (
													roles.map((role) => (
														<SelectItem key={role.id} value={role.id}>
															<div className="flex items-center gap-2">
																<span>{getRoleName(role)}</span>
																{!role.is_active && (
																	<Badge variant="secondary" className="text-xs">Inactive</Badge>
																)}
															</div>
														</SelectItem>
													))
												)}
											</SelectContent>
										</Select>

										{/* Permission Search */}
										{selectedRole && (
											<>
												<div className="relative flex-1 max-w-sm">
													<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
													<Input
														value={permissionSearch}
														onChange={(e) => setPermissionSearch(e.target.value)}
														placeholder="Search permissions..."
														className="pl-8 h-8 text-sm"
													/>
												</div>

												{/* Module Filter */}
												<Select value={moduleFilter} onValueChange={setModuleFilter}>
													<SelectTrigger className="h-8 text-sm w-[180px]">
														<SelectValue placeholder="All modules" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="all">All Modules</SelectItem>
														{moduleData.map(m => (
															<SelectItem key={m.key} value={m.key}>
																{m.label} ({m.activeResources.length})
															</SelectItem>
														))}
													</SelectContent>
												</Select>

												{/* Expand/Collapse */}
												<Tooltip>
													<TooltipTrigger asChild>
														<Button variant="outline" className="h-8 w-8 p-0" onClick={expandAll}>
															<ChevronsUpDown className="h-4 w-4" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>Expand All</TooltipContent>
												</Tooltip>

												{/* Bulk Select / Deselect */}
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															variant="outline"
															className="h-8 text-sm px-3"
															onClick={() => handleSelectAll(true)}
														>
															Select All
														</Button>
													</TooltipTrigger>
													<TooltipContent>Select all permissions</TooltipContent>
												</Tooltip>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															variant="outline"
															className="h-8 text-sm px-3"
															onClick={() => handleSelectAll(false)}
														>
															Clear All
														</Button>
													</TooltipTrigger>
													<TooltipContent>Clear all permissions</TooltipContent>
												</Tooltip>
											</>
										)}
									</div>

									{/* Row 3: Action-level column select all (horizontal) */}
									{selectedRole && !permissionsLoading && allActions.length > 0 && (
										<div className="flex items-center gap-1 flex-wrap pt-1">
											<span className="text-xs text-muted-foreground mr-1">Quick select by action:</span>
											{allActions.map(action => {
												const state = getActionCheckState(action)
												return (
													<Button
														key={action}
														variant={state === 'all' ? 'default' : state === 'some' ? 'secondary' : 'outline'}
														className="h-7 text-xs px-2.5 capitalize"
														onClick={() => handleSelectAllForAction(action, state !== 'all')}
													>
														{action}
													</Button>
												)
											})}
										</div>
									)}
								</CardHeader>

								<CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col min-h-0">
									{/* No role selected */}
									{!selectedRole && (
										<div className="flex flex-col items-center justify-center py-16 text-center">
											<Shield className="h-8 w-8 opacity-20 mb-3" />
											<p className="text-sm font-medium">Select a Role</p>
											<p className="text-xs text-muted-foreground mt-1">
												Choose a role from the dropdown above to manage its permissions
											</p>
										</div>
									)}

									{/* Loading */}
									{selectedRole && permissionsLoading && (
										<div className="space-y-4 mt-4">
											{Array.from({ length: 4 }).map((_, i) => (
												<div key={i} className="space-y-2">
													<Skeleton className="h-10 w-full" />
													<Skeleton className="h-24 w-full" />
												</div>
											))}
										</div>
									)}

									{/* Permissions Accordion */}
									{selectedRole && !permissionsLoading && (
										<div className="mt-3">
											{filteredModuleData.length === 0 ? (
												<div className="flex flex-col items-center justify-center py-12 text-center">
													<Search className="h-8 w-8 opacity-20 mb-3" />
													<p className="text-sm font-medium">No permissions found</p>
													<p className="text-xs text-muted-foreground mt-1">
														Try adjusting your search or module filter
													</p>
												</div>
											) : (
												<Accordion
													type="multiple"
													value={openModules}
													onValueChange={setOpenModules}
													className="space-y-2"
												>
													{filteredModuleData.map(module => {
														const ModuleIcon = module.icon
														const colors = colorMap[module.color] || colorMap.gray
														const checkState = getModuleCheckState(module.activeResources)
														const totalModulePerms = module.activeResources.reduce(
															(acc, r) => acc + (permissionsByResource[r]?.length || 0), 0
														)
														const selectedModulePerms = module.activeResources.reduce(
															(acc, r) => acc + (permissionsByResource[r] || []).filter(p => selectedPermissionIds.has(p.id)).length, 0
														)

														return (
															<AccordionItem
																key={module.key}
																value={module.key}
																className={`rounded-lg border ${colors.border} border-l-4 overflow-hidden`}
															>
																<div className="flex items-center gap-3 px-4">
																	{/* Checkbox is OUTSIDE AccordionTrigger to avoid nested <button> */}
																	<Checkbox
																		checked={checkState === 'all' ? true : checkState === 'some' ? 'indeterminate' : false}
																		onCheckedChange={(checked) => {
																			handleModuleToggle(module.activeResources, checked === 'indeterminate' ? false : checked as boolean)
																		}}
																		className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
																	/>
																	<AccordionTrigger className="hover:no-underline py-3 flex-1">
																		<div className="flex items-center gap-3 flex-1">
																			<ModuleIcon className={`h-4 w-4 ${colors.icon.replace('/40', '')}`} />

																			<span className="text-sm font-semibold">{module.label}</span>

																			<Badge variant="secondary" className={`text-xs ${colors.badge}`}>
																				{module.activeResources.length} {module.activeResources.length === 1 ? 'resource' : 'resources'}
																			</Badge>

																			<span className="text-xs text-muted-foreground">
																				{selectedModulePerms}/{totalModulePerms} permissions
																			</span>
																		</div>
																	</AccordionTrigger>
																</div>

																<AccordionContent className="px-0 pb-0">
																	<div className="overflow-x-auto">
																		<Table>
																			<TableHeader>
																				<TableRow className="bg-muted/50">
																					<TableHead className="text-xs font-semibold w-[200px] pl-4">
																						Resource
																					</TableHead>
																					{allActions.map(action => (
																						<TableHead key={action} className="text-center text-xs font-semibold w-[80px] capitalize">
																							{action}
																						</TableHead>
																					))}
																				</TableRow>
																			</TableHeader>
																			<TableBody>
																				{module.activeResources.map(resource => {
																					const perms = permissionsByResource[resource] || []
																					const permissionMap = perms.reduce((acc, p) => {
																						acc[p.action.toLowerCase()] = p
																						return acc
																					}, {} as Record<string, Permission>)

																					const adminPerm = permissionMap['admin']
																					const isAdminSelected = adminPerm ? selectedPermissionIds.has(adminPerm.id) : false
																					const allResourceSelected = perms.length > 0 && perms.every(p => selectedPermissionIds.has(p.id))

																					return (
																						<TableRow
																							key={resource}
																							className={`hover:bg-muted/30 transition-colors ${isAdminSelected ? 'bg-primary/5' : ''}`}
																						>
																							<TableCell className="text-sm py-2.5 pl-4">
																								<div className="flex items-center gap-2">
																									<div className={`h-2 w-2 rounded-full ${allResourceSelected ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
																									<span className="font-medium">{formatResourceName(resource)}</span>
																								</div>
																							</TableCell>
																							{allActions.map(action => {
																								const permission = permissionMap[action]
																								const checked = permission ? selectedPermissionIds.has(permission.id) : false

																								return (
																									<TableCell key={action} className="text-center py-2.5">
																										{permission ? (
																											<div className="flex items-center justify-center">
																												<Checkbox
																													checked={checked}
																													onCheckedChange={(c) => {
																														if (action === 'admin') {
																															handleAdminToggle(resource, c as boolean)
																														} else {
																															handlePermissionToggle(permission.id, c as boolean)
																														}
																													}}
																													className="data-[state=checked]:bg-primary data-[state=checked]:border-primary h-4 w-4"
																												/>
																											</div>
																										) : (
																											<span className="text-muted-foreground/40 text-xs">—</span>
																										)}
																									</TableCell>
																								)
																							})}
																						</TableRow>
																					)
																				})}
																			</TableBody>
																		</Table>
																	</div>
																</AccordionContent>
															</AccordionItem>
														)
													})}
												</Accordion>
											)}
										</div>
									)}

									{/* Bottom spacer for sticky footer */}
									{modified && selectedRole && <div className="h-16 flex-shrink-0" />}
								</CardContent>
							</Card>
						</TooltipProvider>
					</div>

					{/* Sticky Save Footer */}
					{modified && selectedRole && (
						<div className="sticky bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 z-20">
							<div className="flex items-center justify-between max-w-full">
								<div className="flex items-center gap-2">
									<div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
									<span className="text-sm text-muted-foreground">
										Unsaved changes for <span className="font-medium text-foreground">{getRoleName(selectedRole)}</span>
									</span>
									<Badge variant="secondary" className="text-xs">
										{assignedCount} permissions selected
									</Badge>
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										className="h-8 text-sm px-4"
										onClick={handleCancel}
										disabled={saving}
									>
										Cancel
									</Button>
									<Button
										className="h-8 text-sm px-4 gap-2"
										onClick={handleSavePermissions}
										disabled={saving}
									>
										{saving ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Save className="h-4 w-4" />
										)}
										{saving ? "Saving..." : "Save Changes"}
									</Button>
								</div>
							</div>
						</div>
					)}
				</SidebarInset>
			</SidebarProvider>
		</ProtectedRoute>
	)
}
