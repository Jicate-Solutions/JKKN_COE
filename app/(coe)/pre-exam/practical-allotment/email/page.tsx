'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
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
import { useSessionSync } from '@/hooks/use-session-sync'
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
	last_email_error: string | null
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

// Mails sent at the same time; each one renders its own letter PDF on the server
const SEND_CONCURRENCY = 2

// Plain-language reason for a failed send; the raw mail-server text stays in the tooltip
function describeEmailError(raw: string | null): string {
	if (!raw) return 'No reason recorded'
	if (/BadCredentials|Invalid login|Username and Password not accepted/i.test(raw)) {
		return 'Sender mailbox login rejected — the SMTP username/password is not accepted'
	}
	if (/ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|timed? ?out/i.test(raw)) {
		return 'Could not reach the mail server'
	}
	return raw.split('\n')[0]
}

function ExaminerTypeBadge({ type }: { type: 'internal' | 'external' | 'skilled' }) {
	const map = {
		internal: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
		external: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
		skilled: 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
	}
	return (
		<span className={cn('px-2 py-0.5 rounded-full text-sm font-medium capitalize', map[type])}>
			{type}
		</span>
	)
}

function EmailStatusBadge({ status }: { status: 'SENT' | 'FAILED' | 'PENDING' | null }) {
	if (!status) {
		return (
			<span className="px-2 py-0.5 rounded-full text-sm font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
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
		<span className={cn('px-2 py-0.5 rounded-full text-sm font-medium', map[status])}>
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
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
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
	const [activeTab, setActiveTab] = useState<'assigned' | 'status' | 'failed'>('assigned')

	// Confirmation dialog
	const [confirmOpen, setConfirmOpen] = useState(false)

	// Progress dialog
	const [progressOpen, setProgressOpen] = useState(false)
	const [progressItems, setProgressItems] = useState<SendProgressItem[]>([])
	const [progressDone, setProgressDone] = useState(false)
	// Latest loadAssignments call; an older response must not overwrite a newer one
	const loadSeqRef = useRef(0)



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

		const seq = ++loadSeqRef.current
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
			if (seq !== loadSeqRef.current) return
			setExaminers(data.examiners || [])
		} catch (err) {
			if (seq !== loadSeqRef.current) return
			toast({
				title: '❌ Error',
				description: err instanceof Error ? err.message : 'Failed to load data',
				variant: 'destructive',
			})
		} finally {
			if (seq === loadSeqRef.current) setLoadingAssignments(false)
		}
	}, [effectiveInstitutionId, selectedSessionId, toast])

	// Load as soon as an exam session is chosen (here or in the header) — no Load click needed
	useEffect(() => {
		if (isReady && effectiveInstitutionId && selectedSessionId) {
			loadAssignments()
		}
	}, [isReady, effectiveInstitutionId, selectedSessionId])

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

	// Split into Pending (never sent), Sent and Failed tabs
	const pendingExaminers = filteredExaminers.filter(
		ex => ex.last_email_status !== 'SENT' && ex.last_email_status !== 'FAILED'
	)
	const sentExaminers = filteredExaminers.filter(ex => ex.last_email_status === 'SENT')
	const failedExaminers = filteredExaminers.filter(ex => ex.last_email_status === 'FAILED')
	// Pending and Failed share one table — both are sent with the same action
	const unsentExaminers = activeTab === 'failed' ? failedExaminers : pendingExaminers

	function switchTab(tab: 'assigned' | 'status' | 'failed') {
		setActiveTab(tab)
		setSelectedKeys(new Set())
	}

	// One entry per stat card; those with a tab also drive the tab strip
	const statCards: Array<{
		label: string
		count: number
		icon: typeof Users
		gradient: string
		ring: string
		tab: 'assigned' | 'status' | 'failed' | null
		tabIdle: string
		tabActive: string
		chip: string
	}> = [
		{
			label: 'Total Examiners',
			count: examiners.length,
			icon: Users,
			gradient: 'from-slate-600 to-slate-800',
			ring: 'ring-slate-500',
			tab: null,
			tabIdle: '',
			tabActive: '',
			chip: '',
		},
		{
			label: 'Pending',
			count: pendingExaminers.length,
			icon: Clock,
			gradient: 'from-amber-500 to-orange-600',
			ring: 'ring-amber-500',
			tab: 'assigned',
			tabIdle: 'text-amber-700 dark:text-amber-300',
			tabActive: 'data-[state=active]:bg-amber-500',
			chip: 'bg-amber-100 text-amber-800',
		},
		{
			label: 'Sent',
			count: sentExaminers.length,
			icon: MailCheck,
			gradient: 'from-emerald-500 to-green-700',
			ring: 'ring-emerald-500',
			tab: 'status',
			tabIdle: 'text-emerald-700 dark:text-emerald-300',
			tabActive: 'data-[state=active]:bg-emerald-600',
			chip: 'bg-emerald-100 text-emerald-800',
		},
		{
			label: 'Failed',
			count: failedExaminers.length,
			icon: AlertCircle,
			gradient: 'from-rose-500 to-red-700',
			ring: 'ring-red-500',
			tab: 'failed',
			tabIdle: 'text-red-700 dark:text-red-300',
			tabActive: 'data-[state=active]:bg-red-600',
			chip: 'bg-red-100 text-red-800',
		},
	]

// ---------------------------------------------------------------------------
	// Selection
	// ---------------------------------------------------------------------------

	const allVisibleSelected =
		unsentExaminers.length > 0 &&
		unsentExaminers.every(ex => selectedKeys.has(ex.examiner_key))

	const someSelected = selectedKeys.size > 0

	function toggleSelectAll(checked: boolean) {
		if (checked) {
			setSelectedKeys(new Set(unsentExaminers.map(ex => ex.examiner_key)))
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
		sendQueueRef.current = unsentExaminers.filter(ex => selectedKeys.has(ex.examiner_key))
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

		const setItem = (key: string, change: Partial<SendProgressItem>) =>
			setProgressItems(prev => prev.map(item => (item.examiner_key === key ? { ...item, ...change } : item)))

		// One examiner per request, SEND_CONCURRENCY at a time: every request stays far
		// below the server's 60 s limit however many are selected, and the progress bar
		// moves as each mail finishes instead of jumping from 0% to 100% at the end.
		const queue = [...selectedExaminers]
		let sentCount = 0
		let failedCount = 0

		async function worker() {
			for (let examiner = queue.shift(); examiner; examiner = queue.shift()) {
				setItem(examiner.examiner_key, { status: 'sending' })
				try {
					const res = await fetch('/api/pre-exam/practical-email/send', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							examiner_keys: [{ key: examiner.examiner_key, type: examiner.examiner_type }],
							institutions_id: effectiveInstitutionId,
							examination_session_id: selectedSessionId,
						}),
					})
					const data = await res.json().catch(() => ({}))

					if (res.ok && (data.sent_count || 0) > 0) {
						sentCount++
						setItem(examiner.examiner_key, { status: 'sent' })
					} else {
						failedCount++
						setItem(examiner.examiner_key, {
							status: 'failed',
							error: describeEmailError(data.failed_reasons?.[0] || data.error || null),
						})
					}
				} catch {
					failedCount++
					setItem(examiner.examiner_key, { status: 'failed', error: 'No response from the server' })
				}
			}
		}

		await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, queue.length) }, () => worker()))

		setProgressDone(true)
		await loadAssignments()

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
				description: `${failedCount} email${failedCount !== 1 ? 's' : ''} failed to send — see the Failed tab for the reason`,
				variant: 'destructive',
			})
		}
	}
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
		<>

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
											<span className="text-sm font-medium text-muted-foreground">
												Institution <span className="text-red-500">*</span>
											</span>
											<Select
												value={selectedInstitutionId}
												onValueChange={setSelectedInstitutionId}
												disabled={loadingInstitutions}
											>
												<SelectTrigger className="h-9 text-sm">
													<SelectValue placeholder={loadingInstitutions ? 'Loading...' : 'Select institution'} />
												</SelectTrigger>
												<SelectContent>
													{institutions.map(inst => (
														<SelectItem key={inst.id} value={inst.id} className="text-sm">
															{inst.institution_code} - {inst.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{/* Exam Session */}
									{mustSelectSession && (
									<div className="flex flex-col gap-1.5 min-w-[220px]">
										<span className="text-sm font-medium text-muted-foreground">
											Exam Session <span className="text-red-500">*</span>
										</span>
										<Select
											value={selectedSessionId}
											onValueChange={setSelectedSessionId}
											disabled={!effectiveInstitutionId || loadingSessions}
										>
											<SelectTrigger className="h-9 text-sm">
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
													<SelectItem key={s.id} value={s.id} className="text-sm">
														{s.session_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									)}

									{/* Search */}
									<div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
										<span className="text-sm font-medium text-muted-foreground">Search</span>
										<div className="relative">
											<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
											<Input
												value={searchTerm}
												onChange={e => setSearchTerm(e.target.value)}
												placeholder="Name, email, course code..."
												className="h-9 text-sm pl-8"
											/>
										</div>
									</div>

									{/* Load button */}
									<Button
										onClick={loadAssignments}
										disabled={!effectiveInstitutionId || !selectedSessionId || loadingAssignments}
										className="h-9 text-sm"
									>
										{loadingAssignments ? (
											<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
										) : (
											<RefreshCw className="h-3.5 w-3.5 mr-1.5" />
										)}
										Refresh
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Summary Stats — Pending / Sent / Failed open their list on click */}
					{!loadingAssignments && examiners.length > 0 && (
						<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
							{statCards.map(card => {
								const tab = card.tab
								return (
									<button
										key={card.label}
										type="button"
										disabled={!tab}
										onClick={() => tab && switchTab(tab)}
										title={tab ? `Show the ${card.label.toLowerCase()} list` : undefined}
										className={cn(
											'rounded-xl p-3 flex items-center gap-3 text-left text-white shadow-md bg-gradient-to-br transition-all',
											card.gradient,
											tab && 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5',
											tab && activeTab === tab && cn('ring-2 ring-offset-2 ring-offset-background', card.ring)
										)}
									>
										<div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
											<card.icon className="h-5 w-5" />
										</div>
										<div>
											<p className="text-2xl font-bold leading-tight">{card.count}</p>
											<p className="text-xs font-medium uppercase tracking-wide text-white/90">{card.label}</p>
										</div>
									</button>
								)
							})}
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
						<Tabs
							value={activeTab}
							onValueChange={value => switchTab(value as 'assigned' | 'status' | 'failed')}
							className="space-y-3"
						>
							<TabsList className="h-10 p-1 gap-1 rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60">
								{statCards.map(card => card.tab && (
									<TabsTrigger
										key={card.tab}
										value={card.tab}
										className={cn(
											'text-sm gap-1.5 rounded-md px-3 font-medium data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md',
											card.tabIdle,
											card.tabActive
										)}
									>
										{card.label}
										<span
											className={cn(
												'h-4 min-w-[20px] px-1 rounded-full text-xs font-semibold inline-flex items-center justify-center',
												activeTab === card.tab ? 'bg-white/25 text-white' : card.chip
											)}
										>
											{card.count}
										</span>
									</TabsTrigger>
								))}
							</TabsList>

							{/* ------------------------------------------------------------------ */}
							{/* Tab 1: Pending (not yet sent) — also renders the Failed tab */}
							{/* ------------------------------------------------------------------ */}
							<TabsContent value={activeTab === 'failed' ? 'failed' : 'assigned'}>
								<Card className="shadow-sm">
									<CardHeader className="pb-3 pt-4 px-4">
										<div className="flex items-center justify-between flex-wrap gap-2">
											<CardTitle className="text-base font-semibold flex items-center gap-2">
												<span className={cn('h-2 w-2 rounded-full', activeTab === 'failed' ? 'bg-red-500' : 'bg-amber-500')} />
												{activeTab === 'failed' ? 'Failed Examiners' : 'Pending Examiners'}
											</CardTitle>
											<Button
												onClick={handleSendSelected}
												disabled={selectedKeys.size === 0}
												size="sm"
												className="h-8 text-sm gap-1.5"
											>
												<Send className="h-3.5 w-3.5" />
												{activeTab === 'failed' ? 'Retry Selected Emails' : 'Send Selected Emails'}
												{selectedKeys.size > 0 && (
													<Badge className="ml-1 h-4 px-1 text-xs bg-white/20">
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
													<TableRow className="bg-slate-800 dark:bg-slate-900 hover:bg-slate-800 dark:hover:bg-slate-900">
														<TableHead className="w-10 py-2">
															<Checkbox
																checked={allVisibleSelected}
																onCheckedChange={checked => toggleSelectAll(!!checked)}
																aria-label="Select all"
																className="border-white data-[state=checked]:bg-white data-[state=checked]:text-slate-900"
															/>
														</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2">Examiner Name</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2">Type</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2">Email</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2 text-center">Courses</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2">{activeTab === 'failed' ? 'Failure Reason' : 'Last Status'}</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2 text-right">Actions</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{unsentExaminers.length === 0 ? (
														<TableRow>
															<TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
																{activeTab === 'failed' ? 'No failed emails' : 'No pending examiners'}
															</TableCell>
														</TableRow>
													) : (
														unsentExaminers.map(examiner => (
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
																			<span className="text-sm font-medium">{examiner.examiner_name}</span>
																		</div>
																	</TableCell>
																	<TableCell className="py-2">
																		<ExaminerTypeBadge type={examiner.examiner_type} />
																	</TableCell>
																	<TableCell className="py-2">
																		{examiner.examiner_email ? (
																			<span className="text-sm text-muted-foreground">{examiner.examiner_email}</span>
																		) : (
																			<span className="text-sm text-red-500 italic">No email</span>
																		)}
																	</TableCell>
																	<TableCell className="py-2 text-center">
																		<Badge variant="outline" className="text-sm">
																			{examiner.courses.length}
																		</Badge>
																	</TableCell>
																	<TableCell className="py-2">
																		<EmailStatusBadge status={examiner.last_email_status} />
																		{examiner.last_email_status === 'FAILED' && (
																			<div
																				className="text-[13px] text-red-600 dark:text-red-400 mt-1 max-w-[320px] whitespace-normal"
																				title={examiner.last_email_error || ''}
																			>
																				{describeEmailError(examiner.last_email_error)}
																			</div>
																		)}
																		{examiner.last_email_sent_at && (
																			<div className="text-xs text-muted-foreground mt-0.5">
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
																							<TableHead className="text-[13px] py-1.5 font-medium">Date</TableHead>
																							<TableHead className="text-[13px] py-1.5 font-medium">Session</TableHead>
																							<TableHead className="text-[13px] py-1.5 font-medium">Programme</TableHead>
																							<TableHead className="text-[13px] py-1.5 font-medium">Course Code</TableHead>
																							<TableHead className="text-[13px] py-1.5 font-medium">Course Name</TableHead>
																							<TableHead className="text-[13px] py-1.5 font-medium text-center">Students</TableHead>
																						</TableRow>
																					</TableHeader>
																					<TableBody>
																						{examiner.courses.length === 0 ? (
																							<TableRow>
																								<TableCell
																									colSpan={6}
																									className="text-center py-3 text-[13px] text-muted-foreground"
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
																									<TableCell className="text-[13px] py-1.5">
																										{formatDate(course.exam_date)}
																									</TableCell>
																									<TableCell className="text-[13px] py-1.5">
																										<span className={cn(
																											'px-1.5 py-0.5 rounded text-xs font-medium',
																											course.session === 'FN'
																												? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
																												: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300'
																										)}>
																											{course.session}
																										</span>
																									</TableCell>
																									<TableCell className="text-[13px] py-1.5 text-muted-foreground">
																										{course.programme || '—'}
																									</TableCell>
																									<TableCell className="text-[13px] py-1.5 font-medium">
																										{course.course_code}
																									</TableCell>
																									<TableCell className="text-[13px] py-1.5">
																										{course.course_name}
																									</TableCell>
																									<TableCell className="text-[13px] py-1.5 text-center">
																										<Badge variant="outline" className="text-xs h-4 px-1.5">
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
											<CardTitle className="text-base font-semibold flex items-center gap-2">
												<span className="h-2 w-2 rounded-full bg-emerald-500" />
												Sent Examiners
											</CardTitle>
											<Button
												onClick={handleResendSelected}
												disabled={resendKeys.size === 0}
												size="sm"
												variant="outline"
												className="h-8 text-sm gap-1.5"
											>
												<RefreshCw className="h-3.5 w-3.5" />
												Resend Selected
												{resendKeys.size > 0 && (
													<Badge className="ml-1 h-4 px-1 text-xs bg-primary/20">
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
													<TableRow className="bg-slate-800 dark:bg-slate-900 hover:bg-slate-800 dark:hover:bg-slate-900">
														<TableHead className="w-10 py-2">
															<Checkbox
																checked={allSentSelected}
																onCheckedChange={checked => toggleResendSelectAll(!!checked)}
																aria-label="Select all sent"
																className="border-white data-[state=checked]:bg-white data-[state=checked]:text-slate-900"
															/>
														</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2">Examiner Name</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2">Type</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2">Email</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2 text-center">Courses</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2">Sent At</TableHead>
														<TableHead className="text-white text-sm font-semibold py-2 text-right">Actions</TableHead>
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
																	<span className="text-sm font-medium">{examiner.examiner_name}</span>
																</TableCell>
																<TableCell className="py-2">
																	<ExaminerTypeBadge type={examiner.examiner_type} />
																</TableCell>
																<TableCell className="py-2">
																	{examiner.examiner_email ? (
																		<span className="text-sm text-muted-foreground">{examiner.examiner_email}</span>
																	) : (
																		<span className="text-sm text-red-500 italic">No email</span>
																	)}
																</TableCell>
																<TableCell className="py-2 text-center">
																	<Badge variant="outline" className="text-sm">
																		{examiner.courses.length}
																	</Badge>
																</TableCell>
																<TableCell className="py-2">
																	{examiner.last_email_sent_at && (
																		<span className="text-sm text-muted-foreground">
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
									<p className="text-sm">
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
									<p className="text-sm">Choose an institution and exam session to view examiner assignments</p>
								</div>
							</CardContent>
						</Card>
					)}

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
							<ul className="space-y-1 list-disc list-inside text-sm">
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
						<p className="text-sm text-muted-foreground text-right">
							{progressPercent}%
						</p>

						{/* Per-examiner list */}
						<div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border p-2">
							{progressItems.map(item => (
								<div
									key={item.examiner_key}
									className="flex items-center gap-2 px-2 py-1.5 rounded text-sm"
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
										<span className="text-xs text-red-500 truncate max-w-[120px]" title={item.error}>
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

		</>
	)
}
