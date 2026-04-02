'use client'

import { useState, useEffect } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/common/use-toast'
import {
	AppWindow,
	Key,
	Activity,
	TrendingUp,
	AlertTriangle,
	RefreshCw,
	Loader2,
	Clock,
	Globe,
	CheckCircle2,
	XCircle,
	CalendarDays,
	BookOpen,
	Terminal,
	Shield,
	Copy,
	ArrowRight,
} from 'lucide-react'
import type { ApiApplication, ApiKey, ApiAuditLog } from '@/types/api-management'

interface OverviewStats {
	totalApplications: number
	activeKeys: number
	requestsToday: number
	requestsThisWeek: number
}

interface ExpiringKey extends ApiKey {
	app_name?: string
}

function formatDate(dateStr: string) {
	return new Date(dateStr).toLocaleDateString('en-IN', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	})
}

function formatDateTime(dateStr: string) {
	return new Date(dateStr).toLocaleString('en-IN', {
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function daysUntil(dateStr: string) {
	const diff = new Date(dateStr).getTime() - Date.now()
	return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function methodColor(method: string) {
	const map: Record<string, string> = {
		GET: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
		POST: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
		PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
		DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
	}
	return map[method] ?? 'bg-gray-100 text-gray-700'
}

function statusColor(status?: number | null) {
	if (!status) return 'text-muted-foreground'
	if (status < 300) return 'text-green-600 dark:text-green-400'
	if (status < 500) return 'text-yellow-600 dark:text-yellow-400'
	return 'text-red-600 dark:text-red-400'
}

export default function DeveloperPortalOverviewPage() {
	const { toast } = useToast()
	const [loading, setLoading] = useState(true)
	const [stats, setStats] = useState<OverviewStats>({
		totalApplications: 0,
		activeKeys: 0,
		requestsToday: 0,
		requestsThisWeek: 0,
	})
	const [recentLogs, setRecentLogs] = useState<ApiAuditLog[]>([])
	const [expiringKeys, setExpiringKeys] = useState<ExpiringKey[]>([])

	const fetchData = async () => {
		try {
			setLoading(true)

			const [appsRes, keysRes, logsRes] = await Promise.all([
				fetch('/api/developer-portal/applications'),
				fetch('/api/developer-portal/api-keys'),
				fetch('/api/developer-portal/audit-logs?limit=10&page=1'),
			])

			const apps: ApiApplication[] = appsRes.ok ? await appsRes.json() : []
			const keysData = keysRes.ok ? await keysRes.json() : []
			const logsData = logsRes.ok ? await logsRes.json() : { data: [] }

			const keys: ApiKey[] = Array.isArray(keysData) ? keysData : keysData.data ?? []
			const logs: ApiAuditLog[] = Array.isArray(logsData) ? logsData : logsData.data ?? []

			// Active keys
			const activeKeys = keys.filter(k => k.status === 'active').length

			// Today / week counts
			const now = Date.now()
			const todayStart = new Date()
			todayStart.setHours(0, 0, 0, 0)
			const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000)

			const requestsToday = logs.filter(
				l => new Date(l.created_at) >= todayStart
			).length
			const requestsThisWeek = logs.filter(
				l => new Date(l.created_at) >= weekStart
			).length

			setStats({
				totalApplications: apps.length,
				activeKeys,
				requestsToday,
				requestsThisWeek,
			})

			setRecentLogs(logs.slice(0, 10))

			// Build app name lookup
			const appMap = new Map(apps.map(a => [a.id, a.name]))

			// Keys expiring within 7 days
			const sevenDaysFromNow = new Date(now + 7 * 24 * 60 * 60 * 1000)
			const expiring = keys
				.filter(k => {
					if (k.status !== 'active' || !k.expires_at) return false
					const exp = new Date(k.expires_at)
					return exp > new Date() && exp <= sevenDaysFromNow
				})
				.map(k => ({ ...k, app_name: appMap.get(k.app_id) ?? 'Unknown' }))
				.sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime())

			setExpiringKeys(expiring)
		} catch (err) {
			console.error('Overview fetch error:', err)
			toast({
				title: 'Error',
				description: 'Failed to load overview data',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchData()
	}, [])

	const statCards = [
		{
			label: 'Total Applications',
			value: stats.totalApplications,
			icon: AppWindow,
			color: 'blue' as const,
		},
		{
			label: 'Active API Keys',
			value: stats.activeKeys,
			icon: Key,
			color: 'green' as const,
		},
		{
			label: 'API Requests Today',
			value: stats.requestsToday,
			icon: Activity,
			color: 'purple' as const,
		},
		{
			label: 'Requests This Week',
			value: stats.requestsThisWeek,
			icon: TrendingUp,
			color: 'orange' as const,
		},
	]

	const colorMap = {
		blue: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/10 dark:border-blue-800 dark:text-blue-400',
		green: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/10 dark:border-green-800 dark:text-green-400',
		purple: 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/10 dark:border-purple-800 dark:text-purple-400',
		orange: 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/10 dark:border-orange-800 dark:text-orange-400',
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<main className="flex-1 p-6 space-y-6">
					{/* Page Header */}
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold font-heading">Developer Portal</h1>
							<p className="text-muted-foreground mt-1">
								Overview of your API key management system
							</p>
						</div>
						<Button variant="outline" onClick={fetchData} disabled={loading}>
							{loading ? (
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
							) : (
								<RefreshCw className="h-4 w-4 mr-2" />
							)}
							Refresh
						</Button>
					</div>

					{/* Stat Cards */}
					{loading ? (
						<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
							{[1, 2, 3, 4].map(i => (
								<div key={i} className="rounded-lg border p-4 animate-pulse bg-muted h-24" />
							))}
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
							{statCards.map(card => {
								const Icon = card.icon
								return (
									<div
										key={card.label}
										className={`rounded-lg border p-4 ${colorMap[card.color]}`}
									>
										<div className="flex items-center justify-between">
											<p className="text-sm font-medium">{card.label}</p>
											<Icon className="h-5 w-5 opacity-70" />
										</div>
										<p className="text-3xl font-bold mt-2">{card.value}</p>
									</div>
								)
							})}
						</div>
					)}

					{/* Quick Start Guide & API Reference */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{/* Quick Start Guide */}
						<Card>
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2">
									<BookOpen className="h-4 w-4 text-blue-500" />
									Quick Start Guide
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-3">
									{[
										{
											step: '1',
											title: 'Register an Application',
											desc: 'Go to Applications and create an entry for the external app that needs access.',
											color: 'bg-blue-500',
										},
										{
											step: '2',
											title: 'Generate API Keys',
											desc: 'Go to API Keys, select the app, and generate a key pair. Copy the Secret Key immediately \u2014 it is shown only once.',
											color: 'bg-green-500',
										},
										{
											step: '3',
											title: 'Assign Permissions',
											desc: 'Go to Permissions, select the app, and check which modules (Results, Marks, etc.) and operations (Read, Create) it can access.',
											color: 'bg-purple-500',
										},
										{
											step: '4',
											title: 'Share Credentials',
											desc: 'Give the consumer the Access Key ID, Secret Key, and the API base URL. They store these in their .env file.',
											color: 'bg-orange-500',
										},
									].map(item => (
										<div key={item.step} className="flex gap-3">
											<div className={`${item.color} text-white rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5`}>
												{item.step}
											</div>
											<div>
												<p className="text-sm font-medium">{item.title}</p>
												<p className="text-xs text-muted-foreground">{item.desc}</p>
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>

						{/* API Reference */}
						<Card>
							<CardHeader className="pb-3">
								<CardTitle className="text-base flex items-center gap-2">
									<Terminal className="h-4 w-4 text-green-500" />
									API Reference
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								{/* Base URL */}
								<div>
									<p className="text-xs font-medium text-muted-foreground mb-1.5">Base URL</p>
									<code className="text-sm bg-muted px-2.5 py-1.5 rounded-md font-mono block">
										{typeof window !== 'undefined' ? window.location.origin : 'https://coe.jkkn.ai'}/api/v1
									</code>
								</div>

								{/* Authentication */}
								<div>
									<p className="text-xs font-medium text-muted-foreground mb-1.5">Authentication Headers</p>
									<div className="bg-muted rounded-md p-3 font-mono text-xs space-y-1">
										<p><span className="text-blue-600 dark:text-blue-400">X-Access-Key-Id:</span> ak_coe_xxxxxxxx</p>
										<p><span className="text-blue-600 dark:text-blue-400">X-Access-Secret:</span> sk_coe_xxxxxxxx</p>
									</div>
								</div>

								{/* Available Endpoints */}
								<div>
									<p className="text-xs font-medium text-muted-foreground mb-1.5">Available Endpoints</p>
									<div className="space-y-1.5">
										{[
											{ method: 'GET', path: '/api/v1/results', desc: 'Published exam results' },
											{ method: 'GET/POST', path: '/api/v1/registrations', desc: 'Exam registrations' },
											{ method: 'GET/POST', path: '/api/v1/marks/internal', desc: 'Internal marks' },
											{ method: 'GET', path: '/api/v1/learners', desc: 'Learner profiles' },
										].map(ep => (
											<div key={ep.path} className="flex items-center gap-2 text-xs">
												<span className={`font-mono font-semibold px-1.5 py-0.5 rounded ${
													ep.method === 'GET'
														? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
														: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
												}`}>
													{ep.method}
												</span>
												<code className="font-mono text-foreground">{ep.path}</code>
												<span className="text-muted-foreground hidden sm:inline">{ep.desc}</span>
											</div>
										))}
									</div>
								</div>

								{/* Security Notes */}
								<div className="rounded-md border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10 p-3">
									<div className="flex items-start gap-2">
										<Shield className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
										<div className="text-xs space-y-1">
											<p className="font-medium text-yellow-800 dark:text-yellow-300">Security</p>
											<ul className="text-yellow-700 dark:text-yellow-400 space-y-0.5">
												<li>Secret keys are hashed (SHA-256) and never stored in plain text</li>
												<li>Each app can only access data for its assigned institutions</li>
												<li>All API calls are logged in the Audit Logs</li>
												<li>HTTPS is required for production use</li>
											</ul>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
						{/* Recent Activity */}
						<div className="lg:col-span-2">
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-base flex items-center gap-2">
										<Activity className="h-4 w-4" />
										Recent API Activity
									</CardTitle>
								</CardHeader>
								<CardContent className="p-0">
									{loading ? (
										<div className="p-4 space-y-3">
											{[1, 2, 3, 4, 5].map(i => (
												<div key={i} className="h-8 animate-pulse bg-muted rounded" />
											))}
										</div>
									) : recentLogs.length === 0 ? (
										<p className="text-sm text-muted-foreground p-4 text-center">
											No API activity yet
										</p>
									) : (
										<div className="divide-y">
											{recentLogs.map(log => (
												<div
													key={log.id}
													className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
												>
													<span
														className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${methodColor(log.method)}`}
													>
														{log.method}
													</span>
													<span className="flex-1 text-sm font-mono truncate text-muted-foreground">
														{log.endpoint}
													</span>
													<span className={`text-xs font-semibold ${statusColor(log.response_status)}`}>
														{log.response_status ?? '—'}
													</span>
													{log.response_time_ms != null && (
														<span className="text-xs text-muted-foreground w-16 text-right">
															{log.response_time_ms}ms
														</span>
													)}
													<span className="text-xs text-muted-foreground w-28 text-right hidden sm:block">
														{formatDateTime(log.created_at)}
													</span>
												</div>
											))}
										</div>
									)}
								</CardContent>
							</Card>
						</div>

						{/* Expiring Keys */}
						<div>
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-base flex items-center gap-2">
										<AlertTriangle className="h-4 w-4 text-yellow-500" />
										Keys Expiring Soon
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									{loading ? (
										<div className="space-y-3">
											{[1, 2, 3].map(i => (
												<div key={i} className="h-16 animate-pulse bg-muted rounded-lg" />
											))}
										</div>
									) : expiringKeys.length === 0 ? (
										<div className="flex flex-col items-center justify-center py-6 text-center">
											<CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
											<p className="text-sm text-muted-foreground">
												No keys expiring in the next 7 days
											</p>
										</div>
									) : (
										expiringKeys.map(key => {
											const days = daysUntil(key.expires_at!)
											const urgency =
												days <= 1
													? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10'
													: days <= 3
													? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10'
													: 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/10'
											return (
												<div
													key={key.id}
													className={`rounded-lg border p-3 ${urgency}`}
												>
													<div className="flex items-start justify-between gap-2">
														<div className="min-w-0">
															<p className="text-sm font-medium truncate">{key.key_name}</p>
															<p className="text-xs text-muted-foreground truncate">
																{key.app_name}
															</p>
														</div>
														<div className="flex flex-col items-end shrink-0">
															<Badge
																variant="outline"
																className={
																	days <= 1
																		? 'border-red-400 text-red-600'
																		: days <= 3
																		? 'border-yellow-500 text-yellow-700'
																		: 'border-orange-400 text-orange-600'
																}
															>
																{days === 0 ? 'Today' : `${days}d`}
															</Badge>
															<p className="text-xs text-muted-foreground mt-1">
																{formatDate(key.expires_at!)}
															</p>
														</div>
													</div>
													<p className="text-xs font-mono text-muted-foreground mt-1 truncate">
														{key.access_key_id.slice(0, 16)}...
													</p>
												</div>
											)
										})
									)}
								</CardContent>
							</Card>
						</div>
					</div>
				</main>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
