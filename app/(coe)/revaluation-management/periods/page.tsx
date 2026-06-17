'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
	CalendarRange,
	PlusCircle,
	RefreshCw,
	Edit,
	Trash2,
	MoreHorizontal,
	ChevronLeft,
	ChevronRight,
	CheckCircle2,
	XCircle,
	Loader2,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
} from 'lucide-react'

interface RevaluationPeriod {
	id: string
	institutions_id: string
	institution_code: string | null
	examination_session_id: string
	session_code: string | null
	session_name: string | null
	revaluation_type: string | null
	start_date: string
	end_date: string
	instructions: string | null
	is_active: boolean
	max_courses_per_application: number
	created_at: string
}

// One consolidated record per institution + examination session.
// The 3 revaluation-type windows collapse into a single index row; the
// per-type detail is shown on the edit page.
interface PeriodGroup {
	key: string
	institutions_id: string
	institution_code: string | null
	examination_session_id: string
	session_code: string | null
	session_name: string | null
	rows: RevaluationPeriod[]
	typeCount: number
	anyActive: boolean
}

const ITEMS_PER_PAGE = 10

export default function RevaluationPeriodsPage() {
	const { toast } = useToast()
	const router = useRouter()
	const { isReady, appendToUrl, mustSelectInstitution } = useInstitutionFilter()

	const [periods, setPeriods] = useState<RevaluationPeriod[]>([])
	const [loading, setLoading] = useState(true)
	const [institutionFilter, setInstitutionFilter] = useState<string>('all')
	const [sessionFilter, setSessionFilter] = useState<string>('all')
	const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
	const [currentPage, setCurrentPage] = useState(1)
	const [deleteTarget, setDeleteTarget] = useState<PeriodGroup | null>(null)
	const [deleting, setDeleting] = useState(false)

	// Fetch periods (institution-filtered)
	const fetchPeriods = async () => {
		setLoading(true)
		try {
			const url = appendToUrl('/api/revaluation/registration-periods')
			const response = await fetch(url)
			if (response.ok) {
				const data = await response.json()
				setPeriods(Array.isArray(data) ? data : [])
			} else {
				setPeriods([])
			}
		} catch (error) {
			console.error('Failed to fetch revaluation periods:', error)
			setPeriods([])
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		if (!isReady) return
		fetchPeriods()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady, appendToUrl])

	// Group rows into one record per institution + examination session
	const groupedPeriods = useMemo<PeriodGroup[]>(() => {
		const map = new Map<string, PeriodGroup>()
		for (const p of periods) {
			const key = `${p.institutions_id}|${p.examination_session_id}`
			let g = map.get(key)
			if (!g) {
				g = {
					key,
					institutions_id: p.institutions_id,
					institution_code: p.institution_code,
					examination_session_id: p.examination_session_id,
					session_code: p.session_code,
					session_name: p.session_name,
					rows: [],
					typeCount: 0,
					anyActive: false,
				}
				map.set(key, g)
			}
			g.rows.push(p)
			g.typeCount += 1
			if (p.is_active) g.anyActive = true
		}
		return Array.from(map.values())
	}, [periods])

	// Dependent filter options
	const institutionOptions = useMemo(() => {
		const seen = new Set<string>()
		for (const g of groupedPeriods) {
			if (g.institution_code) seen.add(g.institution_code)
		}
		return Array.from(seen).sort()
	}, [groupedPeriods])

	const sessionOptions = useMemo(() => {
		const seen = new Map<string, string>()
		for (const g of groupedPeriods) {
			if (institutionFilter !== 'all' && g.institution_code !== institutionFilter) continue
			if (g.session_code) seen.set(g.examination_session_id, g.session_code)
		}
		return Array.from(seen.entries()) // [id, code]
	}, [groupedPeriods, institutionFilter])

	// Reset session filter if it no longer belongs to the chosen institution
	useEffect(() => {
		if (sessionFilter === 'all') return
		if (!sessionOptions.some(([id]) => id === sessionFilter)) setSessionFilter('all')
	}, [sessionOptions, sessionFilter])

	// Filter + sort the grouped records
	const filteredGroups = useMemo(() => {
		const result = groupedPeriods.filter((g) => {
			const matchesInstitution =
				institutionFilter === 'all' || g.institution_code === institutionFilter
			const matchesSession =
				sessionFilter === 'all' || g.examination_session_id === sessionFilter
			const matchesStatus =
				statusFilter === 'all' ||
				(statusFilter === 'active' && g.anyActive) ||
				(statusFilter === 'inactive' && !g.anyActive)
			return matchesInstitution && matchesSession && matchesStatus
		})

		result.sort((a, b) => {
			const av = `${a.session_code || ''} ${a.institution_code || ''}`.toLowerCase()
			const bv = `${b.session_code || ''} ${b.institution_code || ''}`.toLowerCase()
			const cmp = av.localeCompare(bv)
			return sortDir === 'asc' ? cmp : -cmp
		})

		return result
	}, [groupedPeriods, institutionFilter, sessionFilter, statusFilter, sortDir])

	// Pagination
	const totalPages = Math.ceil(filteredGroups.length / ITEMS_PER_PAGE) || 1
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
	const pageItems = filteredGroups.slice(startIndex, startIndex + ITEMS_PER_PAGE)

	useEffect(() => setCurrentPage(1), [institutionFilter, sessionFilter, statusFilter, sortDir])

	// Stats (per session record, not per type row)
	const stats = useMemo(() => {
		const total = groupedPeriods.length
		const active = groupedPeriods.filter((g) => g.anyActive).length
		return { total, active, inactive: total - active }
	}, [groupedPeriods])

	const handleDelete = async () => {
		if (!deleteTarget) return
		setDeleting(true)
		try {
			const failures: string[] = []
			const deletedIds: string[] = []
			// Delete every type row belonging to this session record
			for (const row of deleteTarget.rows) {
				const response = await fetch(`/api/revaluation/registration-periods?id=${row.id}`, {
					method: 'DELETE',
				})
				if (response.ok) {
					deletedIds.push(row.id)
				} else {
					const error = await response.json().catch(() => ({}))
					failures.push(error.error || 'failed')
				}
			}

			if (deletedIds.length > 0) {
				setPeriods((prev) => prev.filter((p) => !deletedIds.includes(p.id)))
			}

			if (failures.length > 0) {
				toast({
					title: '⚠️ Some windows could not be deleted',
					description: failures.join('; '),
					variant: 'destructive',
				})
			} else {
				toast({
					title: '✅ Period Deleted',
					description: `All revaluation windows for ${deleteTarget.session_code || 'this session'} have been deleted.`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			}
		} catch (error: any) {
			toast({
				title: '❌ Delete Failed',
				description: error.message || 'Failed to delete revaluation period',
				variant: 'destructive',
			})
		} finally {
			setDeleting(false)
			setDeleteTarget(null)
		}
	}

	const colSpan = mustSelectInstitution ? 4 : 3

	const toggleSort = () => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
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
										<BreadcrumbLink asChild>
											<Link href="/revaluation-management">Revaluation Management</Link>
										</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator />
									<BreadcrumbItem>
										<BreadcrumbPage>Revaluation Periods</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>

						{/* Header */}
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
									<CalendarRange className="h-7 w-7 text-blue-600" />
									Revaluation Periods
								</h1>
								<p className="text-gray-600 mt-1">
									Manage revaluation registration windows for examination sessions
								</p>
							</div>
							<Button asChild className="bg-blue-600 hover:bg-blue-700">
								<Link href="/revaluation-management/create">
									<PlusCircle className="mr-2 h-4 w-4" />
									Create Period
								</Link>
							</Button>
						</div>

						{/* Scorecards */}
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<Card>
								<CardContent className="flex items-center justify-between p-4">
									<div>
										<p className="text-sm text-gray-500">Total Sessions</p>
										<p className="text-2xl font-bold text-gray-900">{stats.total}</p>
									</div>
									<CalendarRange className="h-8 w-8 text-blue-500" />
								</CardContent>
							</Card>
							<Card>
								<CardContent className="flex items-center justify-between p-4">
									<div>
										<p className="text-sm text-gray-500">Active</p>
										<p className="text-2xl font-bold text-green-600">{stats.active}</p>
									</div>
									<CheckCircle2 className="h-8 w-8 text-green-500" />
								</CardContent>
							</Card>
							<Card>
								<CardContent className="flex items-center justify-between p-4">
									<div>
										<p className="text-sm text-gray-500">Inactive</p>
										<p className="text-2xl font-bold text-gray-500">{stats.inactive}</p>
									</div>
									<XCircle className="h-8 w-8 text-gray-400" />
								</CardContent>
							</Card>
						</div>

						{/* Filter bar: Institution → Examination Session → Status → Sort */}
						<Card>
							<CardContent className="p-4">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
									{/* Institution */}
									<div className="w-full sm:w-[200px]">
										<Select value={institutionFilter} onValueChange={setInstitutionFilter}>
											<SelectTrigger>
												<SelectValue placeholder="Institution" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Institutions</SelectItem>
												{institutionOptions.map((code) => (
													<SelectItem key={code} value={code}>
														{code}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Examination Session (depends on institution) */}
									<div className="w-full sm:w-[220px]">
										<Select value={sessionFilter} onValueChange={setSessionFilter}>
											<SelectTrigger>
												<SelectValue placeholder="Examination Session" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Sessions</SelectItem>
												{sessionOptions.map(([id, code]) => (
													<SelectItem key={id} value={id}>
														{code}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Status */}
									<div className="w-full sm:w-[150px]">
										<Select
											value={statusFilter}
											onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
										>
											<SelectTrigger>
												<SelectValue placeholder="Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Status</SelectItem>
												<SelectItem value="active">Active</SelectItem>
												<SelectItem value="inactive">Inactive</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div className="flex items-center gap-2 sm:ml-auto">
										<Button variant="outline" size="sm" onClick={toggleSort} title="Toggle sort">
											{sortDir === 'asc' ? (
												<ArrowUp className="mr-2 h-4 w-4" />
											) : (
												<ArrowDown className="mr-2 h-4 w-4" />
											)}
											Sort {sortDir === 'asc' ? 'A→Z' : 'Z→A'}
										</Button>
										<Button variant="outline" size="icon" onClick={fetchPeriods} title="Refresh">
											<RefreshCw className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Table — Institution | Examination Session | Status | Actions */}
						<Card>
							<CardContent className="p-0">
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow className="bg-gray-50">
												{mustSelectInstitution && <TableHead>Institution</TableHead>}
												<TableHead>
													<button
														onClick={toggleSort}
														className="inline-flex items-center gap-1 hover:text-gray-900"
													>
														Examination Session
														<ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
													</button>
												</TableHead>
												<TableHead className="text-center">Status</TableHead>
												<TableHead className="text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading ? (
												<TableRow>
													<TableCell colSpan={colSpan} className="h-32 text-center">
														<Loader2 className="mx-auto h-6 w-6 animate-spin text-blue-600" />
														<p className="mt-2 text-sm text-gray-500">Loading periods...</p>
													</TableCell>
												</TableRow>
											) : pageItems.length === 0 ? (
												<TableRow>
													<TableCell colSpan={colSpan} className="h-32 text-center text-gray-500">
														<CalendarRange className="mx-auto h-8 w-8 text-gray-300" />
														<p className="mt-2 text-sm">No revaluation periods found</p>
														<Button asChild variant="link" className="text-blue-600">
															<Link href="/revaluation-management/create">
																Create your first period
															</Link>
														</Button>
													</TableCell>
												</TableRow>
											) : (
												pageItems.map((g) => (
													<TableRow key={g.key}>
														{mustSelectInstitution && (
															<TableCell className="text-sm text-gray-600">
																{g.institution_code || '—'}
															</TableCell>
														)}
														<TableCell>
															<div className="flex items-center gap-2">
																<div>
																	<div className="font-medium text-gray-900">
																		{g.session_code || '—'}
																	</div>
																	{g.session_name && (
																		<div className="text-xs text-gray-500">{g.session_name}</div>
																	)}
																</div>
																<Badge variant="outline" className="font-normal">
																	{g.typeCount} type{g.typeCount > 1 ? 's' : ''}
																</Badge>
															</div>
														</TableCell>
														<TableCell className="text-center">
															{g.anyActive ? (
																<Badge className="bg-green-100 text-green-700 hover:bg-green-100">
																	Active
																</Badge>
															) : (
																<Badge variant="secondary">Inactive</Badge>
															)}
														</TableCell>
														<TableCell className="text-right">
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="icon" className="h-8 w-8">
																		<MoreHorizontal className="h-4 w-4" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end">
																	<DropdownMenuItem
																		onClick={() =>
																			router.push(
																				`/revaluation-management/create?session_id=${g.examination_session_id}`
																			)
																		}
																	>
																		<Edit className="mr-2 h-4 w-4" />
																		Edit Session Windows
																	</DropdownMenuItem>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem
																		className="text-red-600 focus:text-red-600"
																		onClick={() => setDeleteTarget(g)}
																	>
																		<Trash2 className="mr-2 h-4 w-4" />
																		Delete
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</div>

								{/* Pagination */}
								{!loading && filteredGroups.length > 0 && (
									<div className="flex items-center justify-between border-t p-4">
										<p className="text-sm text-gray-500">
											Showing {startIndex + 1}–
											{Math.min(startIndex + ITEMS_PER_PAGE, filteredGroups.length)} of{' '}
											{filteredGroups.length}
										</p>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												disabled={currentPage === 1}
												onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
											>
												<ChevronLeft className="h-4 w-4" />
												Previous
											</Button>
											<span className="text-sm text-gray-600">
												Page {currentPage} of {totalPages}
											</span>
											<Button
												variant="outline"
												size="sm"
												disabled={currentPage === totalPages}
												onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
											>
												Next
												<ChevronRight className="h-4 w-4" />
											</Button>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>

			{/* Delete confirmation */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Revaluation Period?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete all{' '}
							<span className="font-semibold">{deleteTarget?.typeCount || 0}</span> revaluation
							window(s) for{' '}
							<span className="font-semibold">{deleteTarget?.session_code || 'this session'}</span>.
							This action cannot be undone. Periods with existing applications cannot be deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault()
								handleDelete()
							}}
							disabled={deleting}
							className="bg-red-600 hover:bg-red-700"
						>
							{deleting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Deleting...
								</>
							) : (
								'Delete'
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
