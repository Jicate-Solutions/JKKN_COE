"use client"

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
	Search,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	RefreshCw,
	ScrollText,
	Activity,
	AlertCircle,
	Users,
	CheckCircle2,
	Download,
	Eye,
	CalendarIcon,
} from 'lucide-react'
import XLSX from '@/lib/utils/excel-compat'

// Types
interface TransactionLog {
	id: string
	user_id: string | null
	session_id: string | null
	action: string
	resource_type: string | null
	resource_id: string | null
	old_values: Record<string, unknown> | null
	new_values: Record<string, unknown> | null
	ip_address: string | null
	user_agent: string | null
	status: 'success' | 'error' | 'pending'
	error_message: string | null
	metadata: Record<string, unknown> | null
	created_at: string
	users: {
		id: string
		email: string
		full_name: string | null
	} | null
}

interface Stats {
	today_total: number
	success_rate: number
	today_errors: number
	unique_users_today: number
}

interface Pagination {
	page: number
	limit: number
	total: number
	total_pages: number
}

export default function UserLogActivityPage() {
	// Data
	const [logs, setLogs] = useState<TransactionLog[]>([])
	const [stats, setStats] = useState<Stats>({ today_total: 0, success_rate: 100, today_errors: 0, unique_users_today: 0 })
	const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, total_pages: 0 })
	const [loading, setLoading] = useState(true)
	const [statsLoading, setStatsLoading] = useState(true)

	// Filters
	const [searchTerm, setSearchTerm] = useState('')
	const [actionFilter, setActionFilter] = useState('all')
	const [resourceTypeFilter, setResourceTypeFilter] = useState('all')
	const [statusFilter, setStatusFilter] = useState('all')
	const [fromDate, setFromDate] = useState('')
	const [toDate, setToDate] = useState('')

	// Pagination
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(25)

	// Detail view
	const [detailLog, setDetailLog] = useState<TransactionLog | null>(null)

	// Distinct filter options (derived from data)
	const [distinctActions, setDistinctActions] = useState<string[]>([])
	const [distinctResourceTypes, setDistinctResourceTypes] = useState<string[]>([])

	// Fetch stats
	const fetchStats = useCallback(async () => {
		setStatsLoading(true)
		try {
			const res = await fetch('/api/transaction-logs/stats')
			if (res.ok) {
				const data = await res.json()
				setStats(data)
			}
		} catch (err) {
			console.error('Failed to fetch stats:', err)
		} finally {
			setStatsLoading(false)
		}
	}, [])

	// Fetch logs with server-side pagination
	const fetchLogs = useCallback(async () => {
		setLoading(true)
		try {
			const params = new URLSearchParams()
			params.set('page', String(currentPage))
			params.set('limit', String(itemsPerPage))
			if (actionFilter !== 'all') params.set('action', actionFilter)
			if (resourceTypeFilter !== 'all') params.set('resource_type', resourceTypeFilter)
			if (statusFilter !== 'all') params.set('status', statusFilter)
			if (fromDate) params.set('from_date', fromDate)
			if (toDate) params.set('to_date', toDate)

			const res = await fetch(`/api/transaction-logs?${params.toString()}`)
			if (res.ok) {
				const json = await res.json()
				setLogs(json.data || [])
				setPagination(json.pagination || { page: 1, limit: 25, total: 0, total_pages: 0 })
			}
		} catch (err) {
			console.error('Failed to fetch logs:', err)
		} finally {
			setLoading(false)
		}
	}, [currentPage, itemsPerPage, actionFilter, resourceTypeFilter, statusFilter, fromDate, toDate])

	// Fetch distinct filter values on mount
	useEffect(() => {
		const fetchDistincts = async () => {
			try {
				// Fetch a large page to get distinct values
				const res = await fetch('/api/transaction-logs?page=1&limit=1000')
				if (res.ok) {
					const json = await res.json()
					const data: TransactionLog[] = json.data || []
					const actions = [...new Set(data.map(d => d.action).filter(Boolean))] as string[]
					const resources = [...new Set(data.map(d => d.resource_type).filter(Boolean))] as string[]
					setDistinctActions(actions.sort())
					setDistinctResourceTypes(resources.sort())
				}
			} catch (err) {
				console.error('Failed to fetch distincts:', err)
			}
		}
		fetchDistincts()
	}, [])

	// Initial fetch
	useEffect(() => {
		fetchStats()
	}, [fetchStats])

	useEffect(() => {
		fetchLogs()
	}, [fetchLogs])

	// Reset page on filter change
	useEffect(() => {
		setCurrentPage(1)
	}, [actionFilter, resourceTypeFilter, statusFilter, fromDate, toDate])

	// Client-side search filter (name/email)
	const filteredLogs = useMemo(() => {
		if (!searchTerm.trim()) return logs
		const term = searchTerm.toLowerCase()
		return logs.filter(log => {
			const userName = log.users?.full_name?.toLowerCase() || ''
			const userEmail = log.users?.email?.toLowerCase() || ''
			const action = log.action?.toLowerCase() || ''
			const resourceType = log.resource_type?.toLowerCase() || ''
			const metaEmail = (log.metadata?.user_email as string)?.toLowerCase() || ''
			return userName.includes(term) || userEmail.includes(term) || action.includes(term) || resourceType.includes(term) || metaEmail.includes(term)
		})
	}, [logs, searchTerm])

	// Pagination controls
	const totalPages = pagination.total_pages || 1

	const pageSizeOptions = useMemo(() => {
		const defaults = [10, 25, 50, 100]
		return defaults
	}, [])

	// Refresh
	const handleRefresh = useCallback(() => {
		fetchStats()
		fetchLogs()
	}, [fetchStats, fetchLogs])

	// Clear filters
	const handleClearFilters = useCallback(() => {
		setSearchTerm('')
		setActionFilter('all')
		setResourceTypeFilter('all')
		setStatusFilter('all')
		setFromDate('')
		setToDate('')
		setCurrentPage(1)
	}, [])

	// Format date
	const formatDate = (dateStr: string) => {
		const d = new Date(dateStr)
		return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
	}
	const formatTime = (dateStr: string) => {
		const d = new Date(dateStr)
		return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
	}

	// Format action label
	const formatAction = (action: string) => {
		return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
	}

	// Status badge config
	const getStatusBadge = (status: string) => {
		switch (status) {
			case 'success':
				return <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Success</Badge>
			case 'error':
				return <Badge className="text-xs bg-red-100 text-red-700 border-red-200">Error</Badge>
			case 'pending':
				return <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
			default:
				return <Badge variant="secondary" className="text-xs">{status}</Badge>
		}
	}

	// Export to Excel
	const handleExportExcel = useCallback(async () => {
		try {
			// Fetch all data for export (up to 5000)
			const params = new URLSearchParams()
			params.set('page', '1')
			params.set('limit', '5000')
			if (actionFilter !== 'all') params.set('action', actionFilter)
			if (resourceTypeFilter !== 'all') params.set('resource_type', resourceTypeFilter)
			if (statusFilter !== 'all') params.set('status', statusFilter)
			if (fromDate) params.set('from_date', fromDate)
			if (toDate) params.set('to_date', toDate)

			const res = await fetch(`/api/transaction-logs?${params.toString()}`)
			if (!res.ok) return

			const json = await res.json()
			const data: TransactionLog[] = json.data || []

			const rows = data.map(log => ({
				'Date': formatDate(log.created_at),
				'Time': formatTime(log.created_at),
				'User': log.users?.full_name || (log.metadata?.user_email as string) || '-',
				'Email': log.users?.email || (log.metadata?.user_email as string) || '-',
				'Action': formatAction(log.action),
				'Resource Type': log.resource_type || '-',
				'Resource ID': log.resource_id || '-',
				'Status': log.status,
				'IP Address': log.ip_address || '-',
				'Error': log.error_message || '-',
			}))

			const ws = XLSX.utils.json_to_sheet(rows)
			const wb = XLSX.utils.book_new()
			XLSX.utils.book_append_sheet(wb, ws, 'User Log Activity')
			XLSX.writeFile(wb, `user-log-activity-${new Date().toISOString().slice(0, 10)}.xlsx`)
		} catch (err) {
			console.error('Export failed:', err)
		}
	}, [actionFilter, resourceTypeFilter, statusFilter, fromDate, toDate])

	// JSON detail display
	const renderJSON = (obj: Record<string, unknown> | null) => {
		if (!obj || Object.keys(obj).length === 0) return <span className="text-muted-foreground text-xs">-</span>
		return (
			<pre className="text-xs bg-muted/50 rounded-md p-3 overflow-auto max-h-[200px] whitespace-pre-wrap">
				{JSON.stringify(obj, null, 2)}
			</pre>
		)
	}

	const hasActiveFilters = actionFilter !== 'all' || resourceTypeFilter !== 'all' || statusFilter !== 'all' || fromDate || toDate

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
					<Breadcrumb className="-mb-3">
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="#">Admin</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>User Log Activity</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Scorecards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">
											{statsLoading ? '...' : stats.today_total.toLocaleString()}
										</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Today&apos;s Logs</p>
									</div>
									<Activity className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">
											{statsLoading ? '...' : `${stats.success_rate}%`}
										</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Success Rate</p>
									</div>
									<CheckCircle2 className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">
											{statsLoading ? '...' : stats.today_errors.toLocaleString()}
										</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Errors Today</p>
									</div>
									<AlertCircle className="h-5 w-5 text-rose-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">
											{statsLoading ? '...' : stats.unique_users_today.toLocaleString()}
										</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Users Today</p>
									</div>
									<Users className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Table Card */}
					<TooltipProvider delayDuration={300}>
						<Card className="flex-1 flex flex-col min-h-0">
							<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
								<div className="space-y-3">
									{/* Row 1: Title & Actions */}
									<div className="flex items-center justify-between">
										<div>
											<h2 className="text-base font-semibold">Activity Logs</h2>
											<p className="text-xs text-muted-foreground">
												{pagination.total.toLocaleString()} total records
											</p>
										</div>
										<div className="flex items-center gap-1.5">
											<Tooltip>
												<TooltipTrigger asChild>
													<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleRefresh} disabled={loading}>
														<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Refresh</TooltipContent>
											</Tooltip>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="outline" size="sm" className="h-8 text-sm px-3">
														<Download className="h-3.5 w-3.5 mr-1.5" />Export<ChevronDown className="h-3 w-3 ml-1" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end" className="w-44">
													<DropdownMenuItem onClick={handleExportExcel}>
														<Download className="h-3.5 w-3.5 mr-2" />
														Export to Excel
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
											{hasActiveFilters && (
												<Button variant="ghost" size="sm" className="h-8 text-sm px-3 text-muted-foreground" onClick={handleClearFilters}>
													Clear Filters
												</Button>
											)}
										</div>
									</div>

									{/* Row 2: Filters */}
									<div className="flex items-center gap-2 flex-wrap">
										<Select value={actionFilter} onValueChange={setActionFilter}>
											<SelectTrigger className="h-8 text-sm w-[160px]">
												<SelectValue placeholder="Action" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Actions</SelectItem>
												{distinctActions.map(a => (
													<SelectItem key={a} value={a}>{formatAction(a)}</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select value={resourceTypeFilter} onValueChange={setResourceTypeFilter}>
											<SelectTrigger className="h-8 text-sm w-[160px]">
												<SelectValue placeholder="Resource" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Resources</SelectItem>
												{distinctResourceTypes.map(r => (
													<SelectItem key={r} value={r}>{r}</SelectItem>
												))}
											</SelectContent>
										</Select>

										<Select value={statusFilter} onValueChange={setStatusFilter}>
											<SelectTrigger className="h-8 text-sm w-[120px]">
												<SelectValue placeholder="Status" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All Status</SelectItem>
												<SelectItem value="success">Success</SelectItem>
												<SelectItem value="error">Error</SelectItem>
												<SelectItem value="pending">Pending</SelectItem>
											</SelectContent>
										</Select>

										<div className="flex items-center gap-1.5">
											<Input
												type="date"
												value={fromDate}
												onChange={e => setFromDate(e.target.value)}
												className="h-8 text-sm w-[140px]"
												placeholder="From"
											/>
											<span className="text-xs text-muted-foreground">to</span>
											<Input
												type="date"
												value={toDate}
												onChange={e => setToDate(e.target.value)}
												className="h-8 text-sm w-[140px]"
												placeholder="To"
											/>
										</div>

										<div className="relative flex-1 max-w-sm">
											<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
											<Input
												value={searchTerm}
												onChange={e => setSearchTerm(e.target.value)}
												placeholder="Search user, email, action..."
												className="pl-8 h-8 text-sm"
											/>
										</div>
									</div>
								</div>
							</CardHeader>

							<CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col min-h-0">
								<div className="rounded-md border flex-1 overflow-hidden mt-3 min-h-[380px] max-h-[520px]">
									<div className="h-full overflow-auto">
										<Table>
											<TableHeader className="sticky top-0 z-10 bg-muted/50">
												<TableRow>
													<TableHead className="text-xs font-semibold w-[140px]">Date & Time</TableHead>
													<TableHead className="text-xs font-semibold">User</TableHead>
													<TableHead className="text-xs font-semibold">Action</TableHead>
													<TableHead className="text-xs font-semibold">Resource</TableHead>
													<TableHead className="text-xs font-semibold w-[100px]">Status</TableHead>
													<TableHead className="text-xs font-semibold">IP Address</TableHead>
													<TableHead className="text-center text-xs font-semibold w-[60px]">Details</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{loading ? (
													<TableRow>
														<TableCell colSpan={7} className="h-32 text-center">
															<div className="flex items-center justify-center gap-2 text-muted-foreground">
																<RefreshCw className="h-5 w-5 animate-spin" />
																<span className="text-sm">Loading activity logs...</span>
															</div>
														</TableCell>
													</TableRow>
												) : filteredLogs.length > 0 ? (
													filteredLogs.map(log => (
														<TableRow key={log.id} className="hover:bg-muted/50">
															<TableCell className="text-sm">
																<div>{formatDate(log.created_at)}</div>
																<div className="text-xs text-muted-foreground">{formatTime(log.created_at)}</div>
															</TableCell>
															<TableCell className="text-sm">
																<div className="font-medium">{log.users?.full_name || '-'}</div>
																<div className="text-xs text-muted-foreground">
																	{log.users?.email || (log.metadata?.user_email as string) || '-'}
																</div>
															</TableCell>
															<TableCell className="text-sm">
																<Badge variant="outline" className="text-xs font-normal">
																	{formatAction(log.action)}
																</Badge>
															</TableCell>
															<TableCell className="text-sm">
																{log.resource_type ? (
																	<div>
																		<span>{log.resource_type}</span>
																		{log.resource_id && (
																			<div className="text-xs text-muted-foreground truncate max-w-[140px]" title={log.resource_id}>
																				{log.resource_id}
																			</div>
																		)}
																	</div>
																) : (
																	<span className="text-muted-foreground">-</span>
																)}
															</TableCell>
															<TableCell>{getStatusBadge(log.status)}</TableCell>
															<TableCell className="text-sm font-mono text-xs">
																{log.ip_address || '-'}
															</TableCell>
															<TableCell className="text-center">
																<Tooltip>
																	<TooltipTrigger asChild>
																		<Button
																			variant="ghost"
																			size="sm"
																			className="h-7 w-7 p-0"
																			onClick={() => setDetailLog(log)}
																		>
																			<Eye className="h-4 w-4" />
																		</Button>
																	</TooltipTrigger>
																	<TooltipContent>View Details</TooltipContent>
																</Tooltip>
															</TableCell>
														</TableRow>
													))
												) : (
													<TableRow>
														<TableCell colSpan={7} className="h-32 text-center">
															<div className="flex flex-col items-center gap-1 text-muted-foreground">
																<ScrollText className="h-8 w-8 opacity-20" />
																<span className="text-sm font-medium">No activity logs found</span>
																<span className="text-xs">Try adjusting your filters or date range</span>
															</div>
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</div>
								</div>

								{/* Pagination */}
								<div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
									<div className="flex items-center gap-4">
										<div className="text-sm text-muted-foreground">
											Showing {pagination.total === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, pagination.total)} of {pagination.total.toLocaleString()} logs
										</div>
										<div className="flex items-center gap-2">
											<Label htmlFor="page-size" className="text-sm text-muted-foreground">
												Rows:
											</Label>
											<Select
												value={String(itemsPerPage)}
												onValueChange={(value) => {
													setItemsPerPage(Number(value))
													setCurrentPage(1)
												}}
											>
												<SelectTrigger id="page-size" className="h-7 w-[70px] text-xs">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{pageSizeOptions.map(opt => (
														<SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<span className="text-xs text-muted-foreground px-2 tabular-nums">
											Page {currentPage} of {totalPages}
										</span>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
											disabled={currentPage === 1}
											className="h-7 w-7 p-0"
										>
											<ChevronLeft className="h-4 w-4" />
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
											disabled={currentPage >= totalPages}
											className="h-7 w-7 p-0"
										>
											<ChevronRight className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					</TooltipProvider>
				</div>
			</SidebarInset>

			{/* Detail Sheet */}
			<Sheet open={!!detailLog} onOpenChange={(o) => { if (!o) setDetailLog(null) }}>
				<SheetContent className="sm:max-w-[720px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-lg font-semibold">Log Details</SheetTitle>
						<p className="text-sm text-muted-foreground">
							Full details for this activity log entry
						</p>
					</SheetHeader>
					{detailLog && (
						<div className="mt-6 space-y-8">
							{/* General Info */}
							<div>
								<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">General Information</h4>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<Label className="text-sm font-semibold">Date & Time</Label>
										<p className="text-sm mt-1">{formatDate(detailLog.created_at)} {formatTime(detailLog.created_at)}</p>
									</div>
									<div>
										<Label className="text-sm font-semibold">Status</Label>
										<div className="mt-1">{getStatusBadge(detailLog.status)}</div>
									</div>
									<div>
										<Label className="text-sm font-semibold">User</Label>
										<p className="text-sm mt-1">{detailLog.users?.full_name || '-'}</p>
										<p className="text-xs text-muted-foreground">{detailLog.users?.email || (detailLog.metadata?.user_email as string) || '-'}</p>
									</div>
									<div>
										<Label className="text-sm font-semibold">IP Address</Label>
										<p className="text-sm mt-1 font-mono">{detailLog.ip_address || '-'}</p>
									</div>
									<div>
										<Label className="text-sm font-semibold">Action</Label>
										<p className="text-sm mt-1">{formatAction(detailLog.action)}</p>
									</div>
									<div>
										<Label className="text-sm font-semibold">Resource</Label>
										<p className="text-sm mt-1">{detailLog.resource_type || '-'}</p>
										{detailLog.resource_id && (
											<p className="text-xs text-muted-foreground break-all">{detailLog.resource_id}</p>
										)}
									</div>
								</div>
							</div>

							{/* Error Message */}
							{detailLog.error_message && (
								<div className="pt-2 border-t">
									<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Error Message</h4>
									<div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-3">
										<p className="text-sm text-red-700 dark:text-red-400">{detailLog.error_message}</p>
									</div>
								</div>
							)}

							{/* Old Values */}
							{detailLog.old_values && Object.keys(detailLog.old_values).length > 0 && (
								<div className="pt-2 border-t">
									<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Previous Values</h4>
									{renderJSON(detailLog.old_values)}
								</div>
							)}

							{/* New Values */}
							{detailLog.new_values && Object.keys(detailLog.new_values).length > 0 && (
								<div className="pt-2 border-t">
									<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">New Values</h4>
									{renderJSON(detailLog.new_values)}
								</div>
							)}

							{/* Metadata */}
							{detailLog.metadata && Object.keys(detailLog.metadata).length > 0 && (
								<div className="pt-2 border-t">
									<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Metadata</h4>
									{renderJSON(detailLog.metadata)}
								</div>
							)}

							{/* User Agent */}
							{detailLog.user_agent && (
								<div className="pt-2 border-t">
									<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">User Agent</h4>
									<p className="text-xs text-muted-foreground break-all bg-muted/50 rounded-md p-3">{detailLog.user_agent}</p>
								</div>
							)}

							{/* IDs */}
							<div className="pt-2 border-t">
								<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Internal IDs</h4>
								<div className="grid grid-cols-1 gap-2 text-xs">
									<div className="flex justify-between">
										<span className="text-muted-foreground">Log ID</span>
										<span className="font-mono">{detailLog.id}</span>
									</div>
									{detailLog.session_id && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">Session ID</span>
											<span className="font-mono">{detailLog.session_id}</span>
										</div>
									)}
									{detailLog.user_id && (
										<div className="flex justify-between">
											<span className="text-muted-foreground">User ID</span>
											<span className="font-mono">{detailLog.user_id}</span>
										</div>
									)}
								</div>
							</div>
						</div>
					)}
				</SheetContent>
			</Sheet>
		</SidebarProvider>
	)
}
