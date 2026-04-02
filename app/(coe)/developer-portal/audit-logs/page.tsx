'use client'

import { useState, useEffect, useCallback } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useToast } from '@/hooks/common/use-toast'
import {
	ScrollText,
	RefreshCw,
	Download,
	ChevronDown,
	ChevronRight,
	Loader2,
	Search,
	Filter,
} from 'lucide-react'
import type { ApiAuditLog, ApiApplication } from '@/types/api-management'

// ── Helpers ───────────────────────────────────────────────────────────

function formatDateTime(d: string) {
	return new Date(d).toLocaleString('en-IN', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
}

const METHOD_COLORS: Record<string, string> = {
	GET: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400',
	POST: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400',
	PUT: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400',
	PATCH: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400',
	DELETE: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
}

function methodBadge(method: string) {
	return METHOD_COLORS[method] ?? 'bg-gray-100 text-gray-700 border-gray-200'
}

function statusClass(code?: number | null) {
	if (!code) return 'text-muted-foreground'
	if (code < 300) return 'text-green-600 dark:text-green-400 font-semibold'
	if (code < 500) return 'text-yellow-600 dark:text-yellow-400 font-semibold'
	return 'text-red-600 dark:text-red-400 font-semibold'
}

// ── Types ─────────────────────────────────────────────────────────────

interface LogFilters {
	app_id: string
	method: string
	start_date: string
	end_date: string
	status_code: string
	endpoint: string
}

const DEFAULT_FILTERS: LogFilters = {
	app_id: '',
	method: '',
	start_date: '',
	end_date: '',
	status_code: '',
	endpoint: '',
}

// ── Expandable Row Detail ─────────────────────────────────────────────

function LogRowDetail({ log }: { log: ApiAuditLog }) {
	return (
		<div className="p-4 bg-muted/30 rounded-md space-y-3 text-xs">
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{log.ip_address && (
					<div>
						<p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">IP Address</p>
						<code className="bg-background px-2 py-1 rounded">{log.ip_address}</code>
					</div>
				)}
				{log.origin && (
					<div>
						<p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">Origin</p>
						<code className="bg-background px-2 py-1 rounded break-all">{log.origin}</code>
					</div>
				)}
				{log.user_agent && (
					<div className="sm:col-span-2">
						<p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">User Agent</p>
						<code className="bg-background px-2 py-1 rounded break-all block">{log.user_agent}</code>
					</div>
				)}
				{log.access_key_id && (
					<div>
						<p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">Access Key ID</p>
						<code className="bg-background px-2 py-1 rounded font-mono">{log.access_key_id}</code>
					</div>
				)}
			</div>

			{log.query_params && Object.keys(log.query_params).length > 0 && (
				<div>
					<p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">Query Params</p>
					<pre className="bg-background px-3 py-2 rounded overflow-x-auto text-xs">
						{JSON.stringify(log.query_params, null, 2)}
					</pre>
				</div>
			)}

			{log.request_body && Object.keys(log.request_body).length > 0 && (
				<div>
					<p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">Request Body</p>
					<pre className="bg-background px-3 py-2 rounded overflow-x-auto text-xs">
						{JSON.stringify(log.request_body, null, 2)}
					</pre>
				</div>
			)}

			{log.error_message && (
				<div>
					<p className="font-semibold text-red-500 uppercase tracking-wider mb-1">Error Message</p>
					<p className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-3 py-2 rounded">
						{log.error_message}
					</p>
				</div>
			)}
		</div>
	)
}

// ── Page ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

export default function AuditLogsPage() {
	const { toast } = useToast()

	const [apps, setApps] = useState<ApiApplication[]>([])
	const [logs, setLogs] = useState<ApiAuditLog[]>([])
	const [totalCount, setTotalCount] = useState(0)
	const [currentPage, setCurrentPage] = useState(1)
	const [loading, setLoading] = useState(false)
	const [loadingApps, setLoadingApps] = useState(true)
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
	const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS)
	const [appliedFilters, setAppliedFilters] = useState<LogFilters>(DEFAULT_FILTERS)

	// ── App name lookup ───────────────────────────────────────────────

	const appMap = new Map(apps.map(a => [a.id, a.name]))

	// ── Fetch apps ────────────────────────────────────────────────────

	useEffect(() => {
		const fetchApps = async () => {
			try {
				const res = await fetch('/api/developer-portal/applications')
				const data = res.ok ? await res.json() : []
				setApps(Array.isArray(data) ? data : data.data ?? [])
			} catch (err) {
				console.error(err)
			} finally {
				setLoadingApps(false)
			}
		}
		fetchApps()
	}, [])

	// ── Fetch logs ────────────────────────────────────────────────────

	const fetchLogs = useCallback(async (page: number, activeFilters: LogFilters) => {
		try {
			setLoading(true)
			const params = new URLSearchParams({
				page: String(page),
				limit: String(PAGE_SIZE),
			})
			if (activeFilters.app_id) params.set('app_id', activeFilters.app_id)
			if (activeFilters.method) params.set('method', activeFilters.method)
			if (activeFilters.start_date) params.set('start_date', activeFilters.start_date)
			if (activeFilters.end_date) params.set('end_date', activeFilters.end_date)
			if (activeFilters.status_code) params.set('response_status', activeFilters.status_code)
			if (activeFilters.endpoint) params.set('endpoint', activeFilters.endpoint)

			const res = await fetch(`/api/developer-portal/audit-logs?${params.toString()}`)
			if (!res.ok) throw new Error('Failed to fetch audit logs')
			const data = await res.json()

			// Support both array response and { data, total } format
			if (Array.isArray(data)) {
				setLogs(data)
				setTotalCount(data.length)
			} else {
				setLogs(data.data ?? [])
				setTotalCount(data.total ?? data.data?.length ?? 0)
			}
		} catch (err) {
			console.error(err)
			toast({
				title: 'Error',
				description: 'Failed to load audit logs',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchLogs(currentPage, appliedFilters)
	}, [currentPage, appliedFilters, fetchLogs])

	// ── Apply / clear filters ─────────────────────────────────────────

	const applyFilters = () => {
		setCurrentPage(1)
		setAppliedFilters({ ...filters })
	}

	const clearFilters = () => {
		setFilters(DEFAULT_FILTERS)
		setAppliedFilters(DEFAULT_FILTERS)
		setCurrentPage(1)
	}

	// ── Expand/collapse rows ──────────────────────────────────────────

	const toggleRow = (id: string) => {
		setExpandedRows(prev => {
			const next = new Set(prev)
			if (next.has(id)) {
				next.delete(id)
			} else {
				next.add(id)
			}
			return next
		})
	}

	// ── Export ────────────────────────────────────────────────────────

	const handleExport = () => {
		try {
			const json = JSON.stringify(logs, null, 2)
			const blob = new Blob([json], { type: 'application/json' })
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`
			a.click()
			URL.revokeObjectURL(url)
		} catch {
			toast({
				title: 'Export Failed',
				description: 'Could not export logs',
				variant: 'destructive',
			})
		}
	}

	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

	const hasActiveFilters = Object.values(appliedFilters).some(v => v !== '')

	// ── Render ────────────────────────────────────────────────────────

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<main className="flex-1 p-6 space-y-6">
					{/* Header */}
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold font-heading flex items-center gap-2">
								<ScrollText className="h-7 w-7" />
								Audit Logs
							</h1>
							<p className="text-muted-foreground mt-1">
								Track all API requests made through your applications
							</p>
						</div>
						<div className="flex gap-2">
							<Button
								variant="outline"
								onClick={() => fetchLogs(currentPage, appliedFilters)}
								disabled={loading}
							>
								{loading ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="h-4 w-4" />
								)}
							</Button>
							<Button variant="outline" onClick={handleExport} disabled={logs.length === 0}>
								<Download className="h-4 w-4 mr-2" />
								Export JSON
							</Button>
						</div>
					</div>

					{/* Filter Bar */}
					<div className="rounded-lg border p-4 space-y-4">
						<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
							<Filter className="h-4 w-4" />
							Filters
							{hasActiveFilters && (
								<Badge variant="secondary" className="ml-1">
									Active
								</Badge>
							)}
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
							{/* Application */}
							<div className="space-y-1">
								<Label className="text-xs">Application</Label>
								{loadingApps ? (
									<div className="h-9 bg-muted rounded animate-pulse" />
								) : (
									<Select
										value={filters.app_id || 'all'}
										onValueChange={v => setFilters({ ...filters, app_id: v === 'all' ? '' : v })}
									>
										<SelectTrigger className="h-9 text-xs">
											<SelectValue placeholder="All apps" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Applications</SelectItem>
											{apps.map(a => (
												<SelectItem key={a.id} value={a.id}>
													{a.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							</div>

							{/* Method */}
							<div className="space-y-1">
								<Label className="text-xs">Method</Label>
								<Select
									value={filters.method || 'all'}
									onValueChange={v => setFilters({ ...filters, method: v === 'all' ? '' : v })}
								>
									<SelectTrigger className="h-9 text-xs">
										<SelectValue placeholder="All methods" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Methods</SelectItem>
										{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
											<SelectItem key={m} value={m}>{m}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Date From */}
							<div className="space-y-1">
								<Label className="text-xs">Date From</Label>
								<Input
									type="date"
									className="h-9 text-xs"
									value={filters.start_date}
									onChange={e => setFilters({ ...filters, start_date: e.target.value })}
								/>
							</div>

							{/* Date To */}
							<div className="space-y-1">
								<Label className="text-xs">Date To</Label>
								<Input
									type="date"
									className="h-9 text-xs"
									value={filters.end_date}
									onChange={e => setFilters({ ...filters, end_date: e.target.value })}
								/>
							</div>

							{/* Status Code */}
							<div className="space-y-1">
								<Label className="text-xs">Status Code</Label>
								<Input
									type="number"
									placeholder="e.g. 200, 404"
									className="h-9 text-xs"
									value={filters.status_code}
									onChange={e => setFilters({ ...filters, status_code: e.target.value })}
								/>
							</div>

							{/* Endpoint */}
							<div className="space-y-1">
								<Label className="text-xs">Endpoint</Label>
								<div className="relative">
									<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
									<Input
										placeholder="/api/v1/..."
										className="h-9 text-xs pl-7"
										value={filters.endpoint}
										onChange={e => setFilters({ ...filters, endpoint: e.target.value })}
										onKeyDown={e => e.key === 'Enter' && applyFilters()}
									/>
								</div>
							</div>
						</div>

						<div className="flex gap-2">
							<Button size="sm" onClick={applyFilters}>
								Apply Filters
							</Button>
							{hasActiveFilters && (
								<Button size="sm" variant="outline" onClick={clearFilters}>
									Clear Filters
								</Button>
							)}
						</div>
					</div>

					{/* Results count */}
					<div className="flex items-center justify-between text-sm text-muted-foreground">
						<span>
							{loading
								? 'Loading...'
								: `${totalCount.toLocaleString()} total log entries`}
						</span>
						<span>
							Page {currentPage} of {totalPages}
						</span>
					</div>

					{/* Table */}
					<div className="rounded-md border overflow-hidden">
						<Table>
							<TableHeader className="bg-muted/50">
								<TableRow>
									<TableHead className="w-8" />
									<TableHead>Timestamp</TableHead>
									<TableHead>Application</TableHead>
									<TableHead>Endpoint</TableHead>
									<TableHead className="w-20">Method</TableHead>
									<TableHead className="w-20">Status</TableHead>
									<TableHead className="w-24">Response Time</TableHead>
									<TableHead>IP Address</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell colSpan={8} className="text-center py-10">
											<Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
										</TableCell>
									</TableRow>
								) : logs.length === 0 ? (
									<TableRow>
										<TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
											No audit logs found
										</TableCell>
									</TableRow>
								) : (
									logs.map(log => {
										const isExpanded = expandedRows.has(log.id)
										return (
											<>
												<TableRow
													key={log.id}
													className="cursor-pointer hover:bg-muted/40 transition-colors"
													onClick={() => toggleRow(log.id)}
												>
													<TableCell className="px-2">
														{isExpanded ? (
															<ChevronDown className="h-4 w-4 text-muted-foreground" />
														) : (
															<ChevronRight className="h-4 w-4 text-muted-foreground" />
														)}
													</TableCell>
													<TableCell className="text-xs text-muted-foreground whitespace-nowrap">
														{formatDateTime(log.created_at)}
													</TableCell>
													<TableCell className="text-sm">
														{log.app_id ? (appMap.get(log.app_id) ?? 'Unknown') : '—'}
													</TableCell>
													<TableCell className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
														{log.endpoint}
													</TableCell>
													<TableCell>
														<span
															className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-semibold ${methodBadge(log.method)}`}
														>
															{log.method}
														</span>
													</TableCell>
													<TableCell>
														<span className={`text-sm ${statusClass(log.response_status)}`}>
															{log.response_status ?? '—'}
														</span>
													</TableCell>
													<TableCell className="text-sm text-muted-foreground">
														{log.response_time_ms != null ? `${log.response_time_ms}ms` : '—'}
													</TableCell>
													<TableCell className="font-mono text-xs text-muted-foreground">
														{log.ip_address ?? '—'}
													</TableCell>
												</TableRow>
												{isExpanded && (
													<TableRow key={`${log.id}-detail`} className="bg-muted/10">
														<TableCell colSpan={8} className="p-3">
															<LogRowDetail log={log} />
														</TableCell>
													</TableRow>
												)}
											</>
										)
									})
								)}
							</TableBody>
						</Table>
					</div>

					{/* Pagination */}
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">
							{logs.length > 0
								? `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${(currentPage - 1) * PAGE_SIZE + logs.length} of ${totalCount.toLocaleString()}`
								: ''}
						</span>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage === 1 || loading}
								onClick={() => setCurrentPage(p => p - 1)}
							>
								Previous
							</Button>
							<div className="flex items-center gap-1">
								{Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
									const page = currentPage <= 3
										? i + 1
										: currentPage >= totalPages - 2
										? totalPages - 4 + i
										: currentPage - 2 + i
									if (page < 1 || page > totalPages) return null
									return (
										<Button
											key={page}
											variant={page === currentPage ? 'default' : 'outline'}
											size="sm"
											className="w-9"
											onClick={() => setCurrentPage(page)}
											disabled={loading}
										>
											{page}
										</Button>
									)
								})}
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage >= totalPages || loading}
								onClick={() => setCurrentPage(p => p + 1)}
							>
								Next
							</Button>
						</div>
					</div>
				</main>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
