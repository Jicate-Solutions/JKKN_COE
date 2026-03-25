'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import Link from 'next/link'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import {
	ChevronDown,
	ChevronRight,
	Mail,
	Download,
	Eye,
	RefreshCw,
	Send,
	CheckCircle2,
	XCircle,
	Loader2,
	Clock,
	Search,
	Users,
	AlertCircle,
	MailCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Institution {
	id: string
	name: string
	institution_code: string
}

interface Session {
	id: string
	session_name: string
	session_code: string
}

interface CourseEntry {
	timetable_id: string
	exam_date: string
	session: string
	programme: string
	course_code: string
	course_name: string
	student_count: number
}

interface ExaminerRow {
	examiner_key: string // staff_id or examiner_id
	examiner_name: string
	examiner_type: 'internal' | 'external' | 'skilled'
	examiner_email: string | null
	courses: CourseEntry[]
	last_email_status: 'SENT' | 'FAILED' | 'PENDING' | null
	last_email_sent_at: string | null
}

interface SendProgressItem {
	examiner_key: string
	examiner_name: string
	examiner_email?: string
	status: 'pending' | 'sending' | 'sent' | 'failed'
	error?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
	if (!dateStr) return ''
	const d = new Date(dateStr)
	return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(dateStr: string | null): string {
	if (!dateStr) return '—'
	const d = new Date(dateStr)
	return d.toLocaleString('en-IN', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function ExaminerTypeBadge({ type }: { type: 'internal' | 'external' | 'skilled' }) {
	const map = {
		internal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
		external: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
		skilled: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
	}
	return (
		<span className={cn('px-2 py-0.5 rounded-full text-xs font-medium capitalize', map[type])}>
			{type}
		</span>
	)
}

function EmailStatusBadge({ status }: { status: 'SENT' | 'FAILED' | 'PENDING' | null }) {
	if (!status) {
		return (
			<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
				Not Sent
			</span>
		)
	}
	const map = {
		SENT: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
		FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
		PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
	}
	return (
		<span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', map[status])}>
			{status}
		</span>
	)
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PracticalEmailPage() {
	const { toast } = useToast()
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		institutionId: contextInstitutionId,
		institutionCode: contextInstitutionCode,
	} = useInstitutionFilter()

	// Filter state
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const [selectedSessionId, setSelectedSessionId] = useState('')
	const [searchTerm, setSearchTerm] = useState('')

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingAssignments, setLoadingAssignments] = useState(false)

	// Data
	const [examiners, setExaminers] = useState<ExaminerRow[]>([])

	// Selection (Pending tab)
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
	// Selection (Sent tab — for resend)
	const [resendKeys, setResendKeys] = useState<Set<string>>(new Set())
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

	// Confirmation dialog
	const [confirmOpen, setConfirmOpen] = useState(false)

	// Progress dialog
	const [progressOpen, setProgressOpen] = useState(false)
	const [progressItems, setProgressItems] = useState<SendProgressItem[]>([])
	const [progressDone, setProgressDone] = useState(false)
	const [currentBatchId, setCurrentBatchId] = useState<string | null>(null)
	const pollRef = useRef<NodeJS.Timeout | null>(null)



	const effectiveInstitutionId = selectedInstitutionId || contextInstitutionId || ''
	const effectiveInstitutionCode = institutions.find(i => i.id === effectiveInstitutionId)?.institution_code || contextInstitutionCode || ''

	// ---------------------------------------------------------------------------
	// Auto-fill institution from context
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && !mustSelectInstitution && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, mustSelectInstitution, contextInstitutionId, selectedInstitutionId])

	// ---------------------------------------------------------------------------
	// Load institutions (super_admin only)
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && mustSelectInstitution) {
			loadInstitutions()
		}
	}, [isReady, mustSelectInstitution])

	const loadInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/pre-exam/examiner-allotment?action=institutions')
			const res = await fetch(url)
			if (!res.ok) throw new Error('Failed')
			setInstitutions(await res.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load institutions', variant: 'destructive' })
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, toast])

	// ---------------------------------------------------------------------------
	// Load sessions when institution changes
	// ---------------------------------------------------------------------------

	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			loadSessions(effectiveInstitutionId)
			setSelectedSessionId('')
			setSessions([])
			setExaminers([])
		}
	}, [isReady, effectiveInstitutionId])

	const loadSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const url = appendToUrl(
				`/api/pre-exam/examiner-allotment?action=sessions&institutionId=${institutionId}`
			)
			const res = await fetch(url)
			if (!res.ok) throw new Error('Failed')
			setSessions(await res.json())
		} catch {
			toast({ title: '❌ Error', description: 'Failed to load sessions', variant: 'destructive' })
		} finally {
			setLoadingSessions(false)
		}
	}, [appendToUrl, toast])

	// ---------------------------------------------------------------------------
	// Load assignments
	// ---------------------------------------------------------------------------

	const loadAssignments = useCallback(async () => {
		if (!effectiveInstitutionId || !selectedSessionId) {
			toast({
				title: '⚠️ Missing Filters',
				description: 'Please select an institution and exam session first',
				className: 'bg-yellow-50 border-yellow-200 text-yellow-800',
			})
			return
		}

		try {
			setLoadingAssignments(true)
			setSelectedKeys(new Set())
			setResendKeys(new Set())
			setExpandedRows(new Set())

			const res = await fetch(
				`/api/pre-exam/practical-email/assignments?institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSessionId}`
			)
			if (!res.ok) throw new Error('Failed to load assignments')
			const data = await res.json()
			setExaminers(data.examiners || [])
		} catch (err) {
			toast({
				title: '❌ Error',
				description: err instanceof Error ? err.message : 'Failed to load data',
				variant: 'destructive',
			})
		} finally {
			setLoadingAssignments(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, toast])

	// ---------------------------------------------------------------------------
	// Filtering
	// ---------------------------------------------------------------------------

	const filteredExaminers = examiners.filter(ex => {
		if (!searchTerm) return true
		const q = searchTerm.toLowerCase()
		return (
			ex.examiner_name.toLowerCase().includes(q) ||
			(ex.examiner_email || '').toLowerCase().includes(q) ||
			ex.courses.some(c => c.course_code.toLowerCase().includes(q))
		)
	})

	// Split into Pending (not sent / failed) and Sent tabs
	const pendingExaminers = filteredExaminers.filter(ex => ex.last_email_status !== 'SENT')
	const sentExaminers = filteredExaminers.filter(ex => ex.last_email_status === 'SENT')

// ---------------------------------------------------------------------------
	// Selection
	// ---------------------------------------------------------------------------

	const allVisibleSelected =
		pendingExaminers.length > 0 &&
		pendingExaminers.every(ex => selectedKeys.has(ex.examiner_key))

	const someSelected = selectedKeys.size > 0

	function toggleSelectAll(checked: boolean) {
		if (checked) {
			setSelectedKeys(new Set(pendingExaminers.map(ex => ex.examiner_key)))
		} else {
			setSelectedKeys(new Set())
		}
	}

	function toggleSelect(key: string, checked: boolean) {
		const next = new Set(selectedKeys)
		if (checked) {
			next.add(key)
		} else {
			next.delete(key)
		}
		setSelectedKeys(next)
	}

	function toggleExpand(key: string) {
		const next = new Set(expandedRows)
		if (next.has(key)) {
			next.delete(key)
		} else {
			next.add(key)
		}
		setExpandedRows(next)
	}

	// Sent tab selection (for resend)
	const allSentSelected =
		sentExaminers.length > 0 &&
		sentExaminers.every(ex => resendKeys.has(ex.examiner_key))

	function toggleResendSelectAll(checked: boolean) {
		if (checked) {
			setResendKeys(new Set(sentExaminers.map(ex => ex.examiner_key)))
		} else {
			setResendKeys(new Set())
		}
	}

	function toggleResendSelect(key: string, checked: boolean) {
		const next = new Set(resendKeys)
		if (checked) {
			next.add(key)
		} else {
			next.delete(key)
		}
		setResendKeys(next)
	}

	// ---------------------------------------------------------------------------
	// PDF actions
	// ---------------------------------------------------------------------------

	function buildPdfUrl(examinerKey: string, examinerType: string, forDownload = false): string {
		const base = `/api/pre-exam/practical-email/pdf-preview`
		const params = new URLSearchParams({
			examiner_key: examinerKey,
			examiner_type: examinerType,
			institutions_id: effectiveInstitutionId,
			institution_code: effectiveInstitutionCode,
			examination_session_id: selectedSessionId,
		})
		if (forDownload) params.set('download', '1')
		return `${base}?${params.toString()}`
	}

	function handlePreviewPdf(examiner: ExaminerRow) {
		window.open(buildPdfUrl(examiner.examiner_key, examiner.examiner_type, false), '_blank')
	}

	function handleDownloadPdf(examiner: ExaminerRow) {
		const a = document.createElement('a')
		a.href = buildPdfUrl(examiner.examiner_key, examiner.examiner_type, true)
		a.download = `appointment_${examiner.examiner_name.replace(/\s+/g, '_')}.pdf`
		a.click()
	}

	// ---------------------------------------------------------------------------
	// Send emails flow
	// ---------------------------------------------------------------------------

	// Track which examiners are queued for the confirm dialog
	const sendQueueRef = useRef<ExaminerRow[]>([])
	const [confirmIsResend, setConfirmIsResend] = useState(false)

	function handleSendSelected() {
		if (selectedKeys.size === 0) return
		sendQueueRef.current = pendingExaminers.filter(ex => selectedKeys.has(ex.examiner_key))
		setConfirmIsResend(false)
		setConfirmOpen(true)
	}

	function handleResendSelected() {
		if (resendKeys.size === 0) return
		sendQueueRef.current = sentExaminers.filter(ex => resendKeys.has(ex.examiner_key))
		setConfirmIsResend(true)
		setConfirmOpen(true)
	}

	async function confirmSend() {
		setConfirmOpen(false)

		const selectedExaminers = sendQueueRef.current

		// Initialize progress items
		const items: SendProgressItem[] = selectedExaminers.map(ex => ({
			examiner_key: ex.examiner_key,
			examiner_name: ex.examiner_name,
			examiner_email: ex.examiner_email || undefined,
			status: 'pending',
		}))
		setProgressItems(items)
		setProgressDone(false)
		setProgressOpen(true)

		try {
			const res = await fetch('/api/pre-exam/practical-email/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					examiner_keys: selectedExaminers.map(ex => ({
						key: ex.examiner_key,
						type: ex.examiner_type,
					})),
					institutions_id: effectiveInstitutionId,
					examination_session_id: selectedSessionId,
				}),
			})

			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to start send job')
			}

			const data = await res.json()
			const batchId: string = data.batch_id

			// Show processing error if returned
			if (data.error) {
				toast({
					title: '❌ Processing Error',
					description: data.error,
					variant: 'destructive',
				})
			}

			if (!batchId) {
				// Synchronous response — update from returned results
				if (data.results) {
					applyResultsToProgress(data.results)
				}
				setProgressDone(true)
				await loadAssignments()
				return
			}

			// If batch already completed (synchronous processing), skip polling
			if (data.status && data.status !== 'processing') {
				const sentCount = data.sent_count || 0
				const failedCount = data.failed_count || 0

				setProgressItems(prev =>
					prev.map(item => {
						if (sentCount > 0) return { ...item, status: 'sent' as const }
						if (failedCount > 0) return { ...item, status: 'failed' as const, error: data.error }
						return { ...item, status: 'failed' as const, error: data.error || 'No emails processed' }
					})
				)
				setProgressDone(true)
				await loadAssignments()

				if (sentCount > 0) {
					toast({
						title: '✅ Emails Sent',
						description: `${sentCount} appointment email${sentCount !== 1 ? 's' : ''} sent successfully`,
						className: 'bg-green-50 border-green-200 text-green-800',
					})
				}
				return
			}

			setCurrentBatchId(batchId)
			startPolling(batchId, items)
		} catch (err) {
			toast({
				title: '❌ Send Failed',
				description: err instanceof Error ? err.message : 'Please try again',
				variant: 'destructive',
			})
			setProgressDone(true)
		}
	}

	function applyResultsToProgress(results: Array<{ key: string; status: 'sent' | 'failed'; error?: string }>) {
		setProgressItems(prev =>
			prev.map(item => {
				const match = results.find(r => r.key === item.examiner_key)
				if (!match) return item
				return {
					...item,
					status: match.status === 'sent' ? 'sent' : 'failed',
					error: match.error,
				}
			})
		)
	}

	function startPolling(batchId: string, _initialItems: SendProgressItem[]) {
		if (pollRef.current) clearInterval(pollRef.current)

		let pollCount = 0
		const MAX_POLLS = 90 // 90 × 2s = 3 minutes max

		pollRef.current = setInterval(async () => {
			pollCount++

			// Safety: stop polling after max attempts
			if (pollCount > MAX_POLLS) {
				if (pollRef.current) clearInterval(pollRef.current)
				pollRef.current = null
				setProgressDone(true)
				setCurrentBatchId(null)
				toast({
					title: '⚠️ Timeout',
					description: 'Email sending is taking longer than expected. Please refresh to check status.',
					variant: 'destructive',
				})
				return
			}

			try {
				const res = await fetch(`/api/pre-exam/practical-email/status?batch_id=${batchId}`)
				if (!res.ok) return
				const data = await res.json()

				// Status API returns { details: [...], status, sent_count, failed_count }
				const details = data.details || []

				// Update progress items — match by examiner_name OR examiner_email
				if (details.length > 0) {
					setProgressItems(prev =>
						prev.map(item => {
							const match = details.find((d: any) =>
								d.examiner_name === item.examiner_name ||
								(item.examiner_email && d.examiner_email === item.examiner_email)
							)
							if (!match) return item
							const s = (match.status || '').toLowerCase()
							return {
								...item,
								status: s === 'sent' ? 'sent' : s === 'failed' ? 'failed' : 'sending',
								error: match.error_message,
							}
						})
					)
				}

				// Batch is done when status is not 'processing'
				const isDone = data.status && data.status !== 'processing'
				if (isDone) {
					if (pollRef.current) clearInterval(pollRef.current)
					pollRef.current = null

					// Fallback: if items are still 'pending' after batch completes,
					// update them based on batch-level sent/failed counts
					setProgressItems(prev => {
						const stillPending = prev.filter(i => i.status === 'pending')
						if (stillPending.length === 0) return prev

						const batchSent = data.sent_count || 0
						const batchFailed = data.failed_count || 0
						const alreadySent = prev.filter(i => i.status === 'sent').length
						const alreadyFailed = prev.filter(i => i.status === 'failed').length
						const remainingSent = batchSent - alreadySent
						const remainingFailed = batchFailed - alreadyFailed

						let sentAssigned = 0
						return prev.map(item => {
							if (item.status !== 'pending') return item
							if (sentAssigned < remainingSent) {
								sentAssigned++
								return { ...item, status: 'sent' as const }
							}
							if (remainingFailed > 0) {
								return { ...item, status: 'failed' as const }
							}
							return { ...item, status: 'sent' as const }
						})
					})

					setProgressDone(true)
					setCurrentBatchId(null)
					await loadAssignments()

					const sentCount = data.sent_count || 0
					const failedCount = data.failed_count || 0

					if (sentCount > 0) {
						toast({
							title: '✅ Emails Sent',
							description: `${sentCount} appointment email${sentCount !== 1 ? 's' : ''} sent successfully`,
							className: 'bg-green-50 border-green-200 text-green-800',
						})
					}
					if (failedCount > 0) {
						toast({
							title: '⚠️ Some Failed',
							description: `${failedCount} email${failedCount !== 1 ? 's' : ''} failed to send`,
							variant: 'destructive',
						})
					}
				}
			} catch {
				// Polling errors are non-fatal — but count toward max
			}
		}, 2000)
	}

	// Cleanup polling on unmount + clear stale batch IDs
	useEffect(() => {
		// On mount, clear any stale batch state (survives HMR)
		setCurrentBatchId(null)
		setProgressDone(false)

		return () => {
			if (pollRef.current) {
				clearInterval(pollRef.current)
				pollRef.current = null
			}
		}
	}, [])

	// ---------------------------------------------------------------------------
	// Progress stats
	// ---------------------------------------------------------------------------

	const progressSentCount = progressItems.filter(i => i.status === 'sent').length
	const progressFailedCount = progressItems.filter(i => i.status === 'failed').length
	const progressDoneCount = progressSentCount + progressFailedCount
	const progressPercent =
		progressItems.length > 0
			? Math.round((progressDoneCount / progressItems.length) * 100)
			: 0

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
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
									<Link href="#">Pre-Exam</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Practical Examiner Emails</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex-1 p-4 space-y-4 overflow-auto">

					{/* Page header */}
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
							<Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
						</div>
						<div>
							<h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
								Practical Examiner Emails
							</h1>
							<p className="text-xs text-muted-foreground">
								Send appointment letters to practical exam examiners
							</p>
						</div>
					</div>

					{/* Context loading */}
					{!isReady && (
						<Card className="shadow-sm">
							<CardContent className="p-4">
								<div className="flex items-center justify-center gap-2 text-muted-foreground">
									<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
									<span className="text-sm">Loading institution context...</span>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Filters bar */}
					{isReady && (
						<Card className="shadow-sm">
							<CardContent className="p-3">
								<div className="flex flex-wrap items-end gap-3">

									{/* Institution (super_admin only) */}
									{mustSelectInstitution && (
										<div className="flex flex-col gap-1.5 min-w-[200px]">
											<span className="text-xs font-medium text-muted-foreground">
												Institution <span className="text-red-500">*</span>
											</span>
											<Select
												value={selectedInstitutionId}
												onValueChange={setSelectedInstitutionId}
												disabled={loadingInstitutions}
											>
												<SelectTrigger className="h-9 text-xs">
													<SelectValue placeholder={loadingInstitutions ? 'Loading...' : 'Select institution'} />
												</SelectTrigger>
												<SelectContent>
													{institutions.map(inst => (
														<SelectItem key={inst.id} value={inst.id} className="text-xs">
															{inst.institution_code} - {inst.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{/* Exam Session */}
									<div className="flex flex-col gap-1.5 min-w-[220px]">
										<span className="text-xs font-medium text-muted-foreground">
											Exam Session <span className="text-red-500">*</span>
										</span>
										<Select
											value={selectedSessionId}
											onValueChange={setSelectedSessionId}
											disabled={!effectiveInstitutionId || loadingSessions}
										>
											<SelectTrigger className="h-9 text-xs">
												<SelectValue
													placeholder={
														loadingSessions
															? 'Loading...'
															: !effectiveInstitutionId
															? 'Select institution first'
															: 'Select session'
													}
												/>
											</SelectTrigger>
											<SelectContent>
												{sessions.map(s => (
													<SelectItem key={s.id} value={s.id} className="text-xs">
														{s.session_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Search */}
									<div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
										<span className="text-xs font-medium text-muted-foreground">Search</span>
										<div className="relative">
											<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
											<Input
												value={searchTerm}
												onChange={e => setSearchTerm(e.target.value)}
												placeholder="Name, email, course code..."
												className="h-9 text-xs pl-8"
											/>
										</div>
									</div>

									{/* Load button */}
									<Button
										onClick={loadAssignments}
										disabled={!effectiveInstitutionId || !selectedSessionId || loadingAssignments}
										className="h-9 text-xs"
									>
										{loadingAssignments ? (
											<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
										) : (
											<RefreshCw className="h-3.5 w-3.5 mr-1.5" />
										)}
										Load
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Summary Stats */}
					{!loadingAssignments && examiners.length > 0 && (
						<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
							<Card className="shadow-sm border-l-4 border-l-slate-400">
								<CardContent className="p-3 flex items-center gap-3">
									<div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
										<Users className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400" />
									</div>
									<div>
										<p className="text-lg font-bold text-slate-900 dark:text-slate-100">{examiners.length}</p>
										<p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Examiners</p>
									</div>
								</CardContent>
							</Card>
							<Card className="shadow-sm border-l-4 border-l-amber-400">
								<CardContent className="p-3 flex items-center gap-3">
									<div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
										<Clock className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
									</div>
									<div>
										<p className="text-lg font-bold text-amber-700 dark:text-amber-400">{pendingExaminers.length}</p>
										<p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pending</p>
									</div>
								</CardContent>
							</Card>
							<Card className="shadow-sm border-l-4 border-l-green-400">
								<CardContent className="p-3 flex items-center gap-3">
									<div className="h-9 w-9 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
										<MailCheck className="h-4.5 w-4.5 text-green-600 dark:text-green-400" />
									</div>
									<div>
										<p className="text-lg font-bold text-green-700 dark:text-green-400">{sentExaminers.length}</p>
										<p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sent</p>
									</div>
								</CardContent>
							</Card>
							<Card className="shadow-sm border-l-4 border-l-red-400">
								<CardContent className="p-3 flex items-center gap-3">
									<div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
										<AlertCircle className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
									</div>
									<div>
										<p className="text-lg font-bold text-red-700 dark:text-red-400">
											{examiners.filter(ex => ex.last_email_status === 'FAILED').length}
										</p>
										<p className="text-[10px] text-muted-foreground uppercase tracking-wide">Failed</p>
									</div>
								</CardContent>
							</Card>
						</div>
					)}

					{/* Loading state */}
					{loadingAssignments && (
						<Card className="shadow-sm">
							<CardContent className="p-6">
								<div className="flex items-center justify-center gap-2 text-muted-foreground">
									<Loader2 className="h-5 w-5 animate-spin" />
									<span className="text-sm">Loading examiner assignments...</span>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Tabs */}
					{!loadingAssignments && examiners.length > 0 && (
						<Tabs defaultValue="assigned" className="space-y-3">
							<TabsList className="h-9">
								<TabsTrigger value="assigned" className="text-xs gap-1.5">
									Pending
									<Badge
										variant="secondary"
										className="h-4 min-w-[20px] px-1 text-[10px] font-semibold"
									>
										{pendingExaminers.length}
									</Badge>
								</TabsTrigger>
								<TabsTrigger value="status" className="text-xs gap-1.5">
									Sent
									<Badge
										variant="secondary"
										className="h-4 min-w-[20px] px-1 text-[10px] font-semibold"
									>
										{sentExaminers.length}
									</Badge>
								</TabsTrigger>
							</TabsList>

							{/* ------------------------------------------------------------------ */}
							{/* Tab 1: Pending (not yet sent) */}
							{/* ------------------------------------------------------------------ */}
							<TabsContent value="assigned">
								<Card className="shadow-sm">
									<CardHeader className="pb-3 pt-4 px-4">
										<div className="flex items-center justify-between flex-wrap gap-2">
											<CardTitle className="text-sm font-semibold">
												Pending Examiners
											</CardTitle>
											<Button
												onClick={handleSendSelected}
												disabled={selectedKeys.size === 0}
												size="sm"
												className="h-8 text-xs gap-1.5"
											>
												<Send className="h-3.5 w-3.5" />
												Send Selected Emails
												{selectedKeys.size > 0 && (
													<Badge className="ml-1 h-4 px-1 text-[10px] bg-white/20">
														{selectedKeys.size}
													</Badge>
												)}
											</Button>
										</div>
									</CardHeader>
									<CardContent className="px-4 pb-4 pt-0">
										<div className="rounded-lg border overflow-hidden">
											<Table>
												<TableHeader>
													<TableRow className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900/50">
														<TableHead className="w-10 py-2">
															<Checkbox
																checked={allVisibleSelected}
																onCheckedChange={checked => toggleSelectAll(!!checked)}
																aria-label="Select all"
															/>
														</TableHead>
														<TableHead className="text-xs font-semibold py-2">Examiner Name</TableHead>
														<TableHead className="text-xs font-semibold py-2">Type</TableHead>
														<TableHead className="text-xs font-semibold py-2">Email</TableHead>
														<TableHead className="text-xs font-semibold py-2 text-center">Courses</TableHead>
														<TableHead className="text-xs font-semibold py-2">Last Status</TableHead>
														<TableHead className="text-xs font-semibold py-2 text-right">Actions</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{pendingExaminers.length === 0 ? (
														<TableRow>
															<TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
																No pending examiners
															</TableCell>
														</TableRow>
													) : (
														pendingExaminers.map(examiner => (
															<Fragment key={examiner.examiner_key}>
																<TableRow
																	className={cn(
																		'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30',
																		selectedKeys.has(examiner.examiner_key) &&
																			'bg-indigo-50/60 dark:bg-indigo-900/10'
																	)}
																	onClick={() => toggleExpand(examiner.examiner_key)}
																>
																	<TableCell
																		className="py-2 w-10"
																		onClick={e => e.stopPropagation()}
																	>
																		<Checkbox
																			checked={selectedKeys.has(examiner.examiner_key)}
																			onCheckedChange={checked =>
																				toggleSelect(examiner.examiner_key, !!checked)
																			}
																			aria-label={`Select ${examiner.examiner_name}`}
																		/>
																	</TableCell>
																	<TableCell className="py-2">
																		<div className="flex items-center gap-1.5">
																			{expandedRows.has(examiner.examiner_key) ? (
																				<ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
																			) : (
																				<ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
																			)}
																			<span className="text-xs font-medium">{examiner.examiner_name}</span>
																		</div>
																	</TableCell>
																	<TableCell className="py-2">
																		<ExaminerTypeBadge type={examiner.examiner_type} />
																	</TableCell>
																	<TableCell className="py-2">
																		{examiner.examiner_email ? (
																			<span className="text-xs text-muted-foreground">{examiner.examiner_email}</span>
																		) : (
																			<span className="text-xs text-red-500 italic">No email</span>
																		)}
																	</TableCell>
																	<TableCell className="py-2 text-center">
																		<Badge variant="outline" className="text-xs">
																			{examiner.courses.length}
																		</Badge>
																	</TableCell>
																	<TableCell className="py-2">
																		<EmailStatusBadge status={examiner.last_email_status} />
																		{examiner.last_email_sent_at && (
																			<div className="text-[10px] text-muted-foreground mt-0.5">
																				{formatDateTime(examiner.last_email_sent_at)}
																			</div>
																		)}
																	</TableCell>
																	<TableCell
																		className="py-2 text-right"
																		onClick={e => e.stopPropagation()}
																	>
																		<div className="flex items-center justify-end gap-1">
																			<Button
																				variant="ghost"
																				size="icon"
																				className="h-7 w-7"
																				title="Preview PDF"
																				onClick={() => handlePreviewPdf(examiner)}
																				disabled={!effectiveInstitutionId || !selectedSessionId}
																			>
																				<Eye className="h-3.5 w-3.5" />
																			</Button>
																			<Button
																				variant="ghost"
																				size="icon"
																				className="h-7 w-7"
																				title="Download PDF"
																				onClick={() => handleDownloadPdf(examiner)}
																				disabled={!effectiveInstitutionId || !selectedSessionId}
																			>
																				<Download className="h-3.5 w-3.5" />
																			</Button>
																		</div>
																	</TableCell>
																</TableRow>

																{/* Expanded row: courses table */}
																{expandedRows.has(examiner.examiner_key) && (
																	<TableRow
																		key={`${examiner.examiner_key}-expanded`}
																		className="hover:bg-transparent"
																	>
																		<TableCell
																			colSpan={7}
																			className="py-0 px-4 pb-2"
																		>
																			<div className="ml-8 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 overflow-hidden">
																				<Table>
																					<TableHeader>
																						<TableRow className="bg-slate-50/70 dark:bg-slate-800/30 hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
																							<TableHead className="text-[11px] py-1.5 font-medium">Date</TableHead>
																							<TableHead className="text-[11px] py-1.5 font-medium">Session</TableHead>
																							<TableHead className="text-[11px] py-1.5 font-medium">Programme</TableHead>
																							<TableHead className="text-[11px] py-1.5 font-medium">Course Code</TableHead>
																							<TableHead className="text-[11px] py-1.5 font-medium">Course Name</TableHead>
																							<TableHead className="text-[11px] py-1.5 font-medium text-center">Students</TableHead>
																						</TableRow>
																					</TableHeader>
																					<TableBody>
																						{examiner.courses.length === 0 ? (
																							<TableRow>
																								<TableCell
																									colSpan={6}
																									className="text-center py-3 text-[11px] text-muted-foreground"
																								>
																									No courses found
																								</TableCell>
																							</TableRow>
																						) : (
																							examiner.courses.map((course, idx) => (
																								<TableRow
																									key={`${course.timetable_id}-${idx}`}
																									className="hover:bg-slate-50/50"
																								>
																									<TableCell className="text-[11px] py-1.5">
																										{formatDate(course.exam_date)}
																									</TableCell>
																									<TableCell className="text-[11px] py-1.5">
																										<span className={cn(
																											'px-1.5 py-0.5 rounded text-[10px] font-medium',
																											course.session === 'FN'
																												? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
																												: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300'
																										)}>
																											{course.session}
																										</span>
																									</TableCell>
																									<TableCell className="text-[11px] py-1.5 text-muted-foreground">
																										{course.programme || '—'}
																									</TableCell>
																									<TableCell className="text-[11px] py-1.5 font-medium">
																										{course.course_code}
																									</TableCell>
																									<TableCell className="text-[11px] py-1.5">
																										{course.course_name}
																									</TableCell>
																									<TableCell className="text-[11px] py-1.5 text-center">
																										<Badge variant="outline" className="text-[10px] h-4 px-1.5">
																											{course.student_count}
																										</Badge>
																									</TableCell>
																								</TableRow>
																							))
																						)}
																					</TableBody>
																				</Table>
																			</div>
																		</TableCell>
																	</TableRow>
																)}
															</Fragment>
														))
													)}
												</TableBody>
											</Table>
										</div>
									</CardContent>
								</Card>
							</TabsContent>

							{/* ------------------------------------------------------------------ */}
							{/* Tab 2: Sent Examiners */}
							{/* ------------------------------------------------------------------ */}
							<TabsContent value="status">
								<Card className="shadow-sm">
									<CardHeader className="pb-3 pt-4 px-4">
										<div className="flex items-center justify-between flex-wrap gap-2">
											<CardTitle className="text-sm font-semibold">Sent Examiners</CardTitle>
											<Button
												onClick={handleResendSelected}
												disabled={resendKeys.size === 0}
												size="sm"
												variant="outline"
												className="h-8 text-xs gap-1.5"
											>
												<RefreshCw className="h-3.5 w-3.5" />
												Resend Selected
												{resendKeys.size > 0 && (
													<Badge className="ml-1 h-4 px-1 text-[10px] bg-primary/20">
														{resendKeys.size}
													</Badge>
												)}
											</Button>
										</div>
									</CardHeader>
									<CardContent className="px-4 pb-4 pt-0">
										<div className="rounded-lg border overflow-hidden">
											<Table>
												<TableHeader>
													<TableRow className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900/50">
														<TableHead className="w-10 py-2">
															<Checkbox
																checked={allSentSelected}
																onCheckedChange={checked => toggleResendSelectAll(!!checked)}
																aria-label="Select all sent"
															/>
														</TableHead>
														<TableHead className="text-xs font-semibold py-2">Examiner Name</TableHead>
														<TableHead className="text-xs font-semibold py-2">Type</TableHead>
														<TableHead className="text-xs font-semibold py-2">Email</TableHead>
														<TableHead className="text-xs font-semibold py-2 text-center">Courses</TableHead>
														<TableHead className="text-xs font-semibold py-2">Sent At</TableHead>
														<TableHead className="text-xs font-semibold py-2 text-right">Actions</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{sentExaminers.length === 0 ? (
														<TableRow>
															<TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
																No emails sent yet
															</TableCell>
														</TableRow>
													) : (
														sentExaminers.map(examiner => (
															<TableRow
																key={examiner.examiner_key}
																className={cn(
																	'hover:bg-slate-50 dark:hover:bg-slate-900/30',
																	resendKeys.has(examiner.examiner_key) &&
																		'bg-indigo-50/60 dark:bg-indigo-900/10'
																)}
															>
																<TableCell className="py-2 w-10">
																	<Checkbox
																		checked={resendKeys.has(examiner.examiner_key)}
																		onCheckedChange={checked =>
																			toggleResendSelect(examiner.examiner_key, !!checked)
																		}
																		aria-label={`Select ${examiner.examiner_name}`}
																	/>
																</TableCell>
																<TableCell className="py-2">
																	<span className="text-xs font-medium">{examiner.examiner_name}</span>
																</TableCell>
																<TableCell className="py-2">
																	<ExaminerTypeBadge type={examiner.examiner_type} />
																</TableCell>
																<TableCell className="py-2">
																	{examiner.examiner_email ? (
																		<span className="text-xs text-muted-foreground">{examiner.examiner_email}</span>
																	) : (
																		<span className="text-xs text-red-500 italic">No email</span>
																	)}
																</TableCell>
																<TableCell className="py-2 text-center">
																	<Badge variant="outline" className="text-xs">
																		{examiner.courses.length}
																	</Badge>
																</TableCell>
																<TableCell className="py-2">
																	{examiner.last_email_sent_at && (
																		<span className="text-xs text-muted-foreground">
																			{formatDateTime(examiner.last_email_sent_at)}
																		</span>
																	)}
																</TableCell>
																<TableCell className="py-2 text-right">
																	<div className="flex items-center justify-end gap-1">
																		<Button
																			variant="ghost"
																			size="icon"
																			className="h-7 w-7"
																			title="Preview PDF"
																			onClick={() => handlePreviewPdf(examiner)}
																			disabled={!effectiveInstitutionId || !selectedSessionId}
																		>
																			<Eye className="h-3.5 w-3.5" />
																		</Button>
																		<Button
																			variant="ghost"
																			size="icon"
																			className="h-7 w-7"
																			title="Download PDF"
																			onClick={() => handleDownloadPdf(examiner)}
																			disabled={!effectiveInstitutionId || !selectedSessionId}
																		>
																			<Download className="h-3.5 w-3.5" />
																		</Button>
																	</div>
																</TableCell>
															</TableRow>
														))
													)}
												</TableBody>
											</Table>
										</div>
									</CardContent>
								</Card>
							</TabsContent>
						</Tabs>
					)}

					{/* Empty state */}
					{!loadingAssignments && examiners.length === 0 && selectedSessionId && (
						<Card className="shadow-sm">
							<CardContent className="p-8">
								<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
									<Mail className="h-8 w-8 opacity-40" />
									<p className="text-sm font-medium">No examiner assignments found</p>
									<p className="text-xs">
										Ensure examiners have been assigned in the Examiner Allotment page for this session
									</p>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Initial empty state */}
					{!loadingAssignments && !selectedSessionId && isReady && (
						<Card className="shadow-sm border-dashed">
							<CardContent className="p-8">
								<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
									<Mail className="h-8 w-8 opacity-30" />
									<p className="text-sm font-medium">Select filters and click Load</p>
									<p className="text-xs">Choose an institution and exam session to view examiner assignments</p>
								</div>
							</CardContent>
						</Card>
					)}

				</div>

				<AppFooter />
			</SidebarInset>

			{/* ---------------------------------------------------------------- */}
			{/* Confirmation Dialog */}
			{/* ---------------------------------------------------------------- */}
			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent className="sm:max-w-[420px]">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Send className="h-5 w-5 text-indigo-600" />
							{confirmIsResend ? 'Resend Appointment Emails' : 'Send Appointment Emails'}
						</DialogTitle>
						<DialogDescription>
							This will {confirmIsResend ? 'resend' : 'send'} appointment letters to{' '}
							<strong>{sendQueueRef.current.length}</strong> examiner
							{sendQueueRef.current.length !== 1 ? 's' : ''} via email.
						</DialogDescription>
					</DialogHeader>
					<div className="py-2 space-y-2">
						<div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
							<ul className="space-y-1 list-disc list-inside text-xs">
								<li>Each examiner will receive a PDF appointment letter</li>
								<li>Examiners without an email address will be skipped</li>
								{confirmIsResend && <li>This will send updated appointment letters replacing previous ones</li>}
							</ul>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmOpen(false)}>
							Cancel
						</Button>
						<Button onClick={confirmSend} className="gap-2">
							<Send className="h-4 w-4" />
							{confirmIsResend ? 'Resend' : 'Send'} {sendQueueRef.current.length} Email{sendQueueRef.current.length !== 1 ? 's' : ''}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ---------------------------------------------------------------- */}
			{/* Progress Dialog */}
			{/* ---------------------------------------------------------------- */}
			<Dialog
				open={progressOpen}
				onOpenChange={open => {
					// Only allow closing once done
					if (!open && progressDone) setProgressOpen(false)
				}}
			>
				<DialogContent className="sm:max-w-[480px]">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							{progressDone ? (
								<CheckCircle2 className="h-5 w-5 text-green-600" />
							) : (
								<Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
							)}
							{progressDone ? 'Emails Sent' : 'Sending Emails...'}
						</DialogTitle>
						<DialogDescription>
							{progressDone
								? `${progressSentCount} sent, ${progressFailedCount} failed`
								: `Sending ${progressDoneCount} of ${progressItems.length} emails...`}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3 py-2">
						{/* Progress bar */}
						<Progress value={progressPercent} className="h-2" />
						<p className="text-xs text-muted-foreground text-right">
							{progressPercent}%
						</p>

						{/* Per-examiner list */}
						<div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border p-2">
							{progressItems.map(item => (
								<div
									key={item.examiner_key}
									className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
								>
									{item.status === 'pending' && (
										<Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									)}
									{item.status === 'sending' && (
										<Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500 shrink-0" />
									)}
									{item.status === 'sent' && (
										<CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
									)}
									{item.status === 'failed' && (
										<XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
									)}
									<span
										className={cn(
											'flex-1 truncate',
											item.status === 'sent' && 'text-green-700 dark:text-green-400',
											item.status === 'failed' && 'text-red-600 dark:text-red-400',
											item.status === 'pending' && 'text-muted-foreground'
										)}
									>
										{item.examiner_name}
									</span>
									{item.status === 'failed' && item.error && (
										<span className="text-[10px] text-red-500 truncate max-w-[120px]" title={item.error}>
											{item.error}
										</span>
									)}
								</div>
							))}
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setProgressOpen(false)}
							disabled={!progressDone}
						>
							{progressDone ? 'Close' : 'Please wait...'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

		</SidebarProvider>
	)
}
