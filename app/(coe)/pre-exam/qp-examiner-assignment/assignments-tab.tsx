'use client'

// Everything after the appointment: track it, read the submitted paper, accept
// or return it, re-issue the order, change the access period, and read the
// access log for that assignment.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
	DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
	AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2, MoreHorizontal, RefreshCw, Search, FileText, Mail, CheckCircle2, CalendarClock,
	ShieldAlert, Ban, Download, ExternalLink, Unlock, Lock, History as HistoryIcon, Eye, ChevronDown, BookOpen, KeyRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRupees } from '@/lib/qp-portal/fees'
import { formatIst, isoToIstLocal } from '@/lib/qp-portal/ist'
import {
	QP_ASSIGNMENT_TYPE_LABELS,
	QP_LOG_ACTION_LABELS,
	QP_VERSION_STATUS_LABELS,
	readChecklistAnswers,
	type QpAssignmentType,
	type QpPaperVersion,
	type QpClaimVersion,
} from '@/types/qp-examiner-assignment'
import { apiFetch, StatusBadge, WindowBadge, KindBadge, SearchableSelect, type AssignmentRow, type SessionOpt } from './shared'

interface Props {
	institutionsId: string
	session: SessionOpt | null
	refreshKey: number
	onChanged: () => void
}

interface LogRow {
	id: string
	action: string
	denied: boolean
	reason: string | null
	detail: Record<string, unknown> | null
	ip_address: string | null
	user_agent: string | null
	created_at: string
	performed_by_email?: string | null
	performed_by_role?: string | null
	module?: string | null
	old_value?: unknown
	new_value?: unknown
	version?: number | null
}

interface HistoryData {
	paper_versions: QpPaperVersion[]
	claim_versions: QpClaimVersion[]
}

const FINALISED_WARNING =
	'This submission has already been finalized. Any reopening and subsequent modification will be permanently recorded in the audit log.'

const VERSION_TONE: Record<string, string> = {
	current: 'bg-emerald-50 text-emerald-700 border-emerald-200',
	reopened: 'bg-orange-50 text-orange-700 border-orange-200',
	superseded: 'bg-slate-100 text-slate-600 border-slate-200',
}

/** Question label the way the portal prints it. */
function qLabel(q: any): string {
	return `Q${q?.question_number ?? ''}${q?.sub_label ? ` ${q.sub_label}` : ''}`
}

/** Flatten a question (and its sub-divisions) to comparable plain text. */
function qText(q: any): string {
	const subs = Array.isArray(q?.sub_questions) ? q.sub_questions : []
	const stem = plainText(q?.question_text)
	if (subs.length === 0) return stem
	return [stem, ...subs.map((sb: any) => `(${sb.label}) ${plainText(sb.question_text)}`)].filter(Boolean).join(' ')
}

function ValueBlock({ label, value }: { label: string; value: unknown }) {
	if (value === null || value === undefined) return null
	return (
		<div className="min-w-0">
			<p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
			<pre className="text-[11px] whitespace-pre-wrap break-words bg-slate-50 border rounded p-1.5 max-h-40 overflow-y-auto">
				{typeof value === 'string' ? value : JSON.stringify(value, null, 1)}
			</pre>
		</div>
	)
}

/** Plain-text preview of a question's rich HTML, for the review list. */
function plainText(html: unknown): string {
	return String(html ?? '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim()
}

export function AssignmentsTab({ institutionsId, session, refreshKey, onChanged }: Props) {
	const { toast } = useToast()

	const [rows, setRows] = useState<AssignmentRow[]>([])
	const [loading, setLoading] = useState(false)
	const [statusFilter, setStatusFilter] = useState('all')
	const [kindFilter, setKindFilter] = useState('all')
	const [search, setSearch] = useState('')

	// ── Detail sheet ──────────────────────────────────────────────────────
	const [openRow, setOpenRow] = useState<AssignmentRow | null>(null)
	const [detail, setDetail] = useState<any>(null)
	const [detailLoading, setDetailLoading] = useState(false)
	const [logs, setLogs] = useState<LogRow[]>([])
	const [logSummary, setLogSummary] = useState<any>(null)
	const [history, setHistory] = useState<HistoryData>({ paper_versions: [], claim_versions: [] })
	const [viewVersion, setViewVersion] = useState<number | null>(null)

	// ── Actions ───────────────────────────────────────────────────────────
	// The Return / Change-period sheets act on their own row, which may have been
	// reached straight from the row menu without the detail sheet ever opening.
	const [actionRow, setActionRow] = useState<AssignmentRow | null>(null)
	const [busy, setBusy] = useState<string | null>(null)
	// Authorised reopen: one sheet for both the paper and the claim.
	const [reopenOpen, setReopenOpen] = useState(false)
	const [reopenTarget, setReopenTarget] = useState<'paper' | 'claim'>('paper')
	const [reopenReason, setReopenReason] = useState('')
	const [reopenRemarks, setReopenRemarks] = useState('')
	const [returnNewTo, setReturnNewTo] = useState('')
	const openReopen = (row: AssignmentRow | null, target: 'paper' | 'claim') => {
		if (!row) return
		setActionRow(row)
		setReopenTarget(target)
		setReopenReason('')
		setReopenRemarks('')
		setReturnNewTo('')
		setReopenOpen(true)
	}
	const canReopenPaper = (r: AssignmentRow | null | undefined) => !!r && ['submitted', 'accepted'].includes(String(r.status))
	const canReopenClaim = (r: AssignmentRow | null | undefined) =>
		!!r && ['submitted', 'approved'].includes(String(r.claim_status || 'pending'))
	// Change the appointment type (add / drop the answer key) — audited, e-mailed.
	const [typeOpen, setTypeOpen] = useState(false)
	const [typeNew, setTypeNew] = useState<QpAssignmentType>('both')
	const [typeReason, setTypeReason] = useState('')
	const [typeRemarks, setTypeRemarks] = useState('')
	const [typeEmail, setTypeEmail] = useState(true)
	const [typeNewTo, setTypeNewTo] = useState('')
	const openChangeType = (row: AssignmentRow | null) => {
		if (!row) return
		setActionRow(row)
		const cur = (row.assignment_type || 'question_paper') as QpAssignmentType
		setTypeNew(cur === 'both' ? 'question_paper' : 'both')
		setTypeReason('')
		setTypeRemarks('')
		setTypeEmail(true)
		setTypeNewTo('')
		setTypeOpen(true)
	}
	const canChangeType = (r: AssignmentRow | null | undefined) =>
		!!r && r.status !== 'cancelled' && String(r.claim_status || 'pending') !== 'paid'
	const everSubmitted = (r: AssignmentRow | null | undefined) =>
		!!r &&
		(['submitted', 'accepted'].includes(String(r.status)) ||
			(!!r.submission_stage && r.submission_stage !== 'authoring') ||
			!!r.submitted_at ||
			(r.paper_version || 0) > 0)

	/** Cancel exists only until the examiner has submitted the paper; after that the record stays. */
	const canCancel = (r: AssignmentRow | null | undefined) =>
		!!r &&
		r.status !== 'cancelled' &&
		!['submitted', 'accepted'].includes(String(r.status)) &&
		(!r.submission_stage || r.submission_stage === 'authoring') &&
		!r.submitted_at &&
		!(r.paper_version && r.paper_version > 0)
	const [windowOpen, setWindowOpen] = useState(false)
	const [windowFrom, setWindowFrom] = useState('')
	const [windowTo, setWindowTo] = useState('')
	const [confirmCancel, setConfirmCancel] = useState<AssignmentRow | null>(null)

	const load = useCallback(async () => {
		if (!institutionsId) {
			setRows([])
			return
		}
		setLoading(true)
		try {
			const qs = new URLSearchParams({ institutions_id: institutionsId })
			if (session?.id) qs.set('examination_session_id', session.id)
			const json = await apiFetch(`/api/pre-exam/qp-examiner-assignments?${qs}`)
			setRows(json.data || [])
		} catch (e: any) {
			toast({ title: 'Could not load assignments', description: e.message, variant: 'destructive' })
			setRows([])
		} finally {
			setLoading(false)
		}
	}, [institutionsId, session?.id, toast])

	useEffect(() => {
		load()
	}, [load, refreshKey])

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		return rows.filter(r => {
			if (statusFilter !== 'all' && r.status !== statusFilter) return false
			if (kindFilter !== 'all' && r.examiner_kind !== kindFilter) return false
			if (
				q &&
				!`${r.course_code} ${r.subject_title} ${r.examiner?.full_name || ''} ${r.examiner?.email || ''} ${r.order_ref_no || ''}`
					.toLowerCase()
					.includes(q)
			)
				return false
			return true
		})
	}, [rows, statusFilter, kindFilter, search])

	// ── Open detail ───────────────────────────────────────────────────────
	const openDetail = async (row: AssignmentRow) => {
		setOpenRow(row)
		setDetail(null)
		setLogs([])
		setLogSummary(null)
		setHistory({ paper_versions: [], claim_versions: [] })
		setViewVersion(null)
		setDetailLoading(true)
		try {
			const [d, l, h] = await Promise.all([
				apiFetch(`/api/pre-exam/qp-examiner-assignments/${row.id}`),
				apiFetch(`/api/pre-exam/qp-examiner-assignments/${row.id}/logs`),
				apiFetch(`/api/pre-exam/qp-examiner-assignments/${row.id}/history?questions=1`).catch(() => null),
			])
			setDetail(d)
			setLogs(l.data || [])
			setLogSummary(l.summary || null)
			if (h) setHistory({ paper_versions: h.paper_versions || [], claim_versions: h.claim_versions || [] })
			setWindowFrom(isoToIstLocal(d.valid_from))
			setWindowTo(isoToIstLocal(d.valid_to))
		} catch (e: any) {
			toast({ title: 'Could not open the assignment', description: e.message, variant: 'destructive' })
		} finally {
			setDetailLoading(false)
		}
	}

	const runAction = async (id: string, body: Record<string, unknown>, successTitle: string) => {
		setBusy(id)
		try {
			const res = await apiFetch(`/api/pre-exam/qp-examiner-assignments/${id}`, {
				method: 'PUT',
				body: JSON.stringify(body),
			})
			toast({ title: successTitle, description: res.message })
			await load()
			onChanged()
			if (openRow?.id === id) {
				const [refreshed, l, h] = await Promise.all([
					apiFetch(`/api/pre-exam/qp-examiner-assignments/${id}`),
					apiFetch(`/api/pre-exam/qp-examiner-assignments/${id}/logs`).catch(() => null),
					apiFetch(`/api/pre-exam/qp-examiner-assignments/${id}/history?questions=1`).catch(() => null),
				])
				setDetail(refreshed)
				if (l) {
					setLogs(l.data || [])
					setLogSummary(l.summary || null)
				}
				if (h) setHistory({ paper_versions: h.paper_versions || [], claim_versions: h.claim_versions || [] })
			}
			return true
		} catch (e: any) {
			toast({ title: 'That did not work', description: e.message, variant: 'destructive' })
			return false
		} finally {
			setBusy(null)
		}
	}

	const sendOrder = async (row: AssignmentRow) => {
		setBusy(row.id)
		try {
			const res = await apiFetch(`/api/pre-exam/qp-examiner-assignments/${row.id}/send-order`, {
				method: 'POST',
				body: JSON.stringify({}),
			})
			toast({ title: 'Examiner order sent', description: res.message })
			await load()
		} catch (e: any) {
			toast({ title: 'The order could not be sent', description: e.message, variant: 'destructive' })
		} finally {
			setBusy(null)
		}
	}

	const openOrderPdf = (id: string) => {
		window.open(`/api/pre-exam/qp-examiner-assignments/${id}/order`, '_blank', 'noopener')
	}
	const openPaperPdf = (paperId: string) => {
		// An assignment's paper is an ese_question_papers row — the CIA route would
		// 404 on this id.
		window.open(`/api/pre-exam/ese-question-papers/${paperId}/pdf`, '_blank', 'noopener')
	}

	const counts = useMemo(
		() => ({
			total: rows.length,
			submitted: rows.filter(r => r.status === 'submitted').length,
			accepted: rows.filter(r => r.status === 'accepted').length,
			closedUnsubmitted: rows.filter(
				r => r.window_state === 'closed' && !['submitted', 'accepted', 'cancelled'].includes(r.status)
			).length,
		}),
		[rows]
	)

	return (
		<>
			<Card>
				<CardHeader className="px-4 py-3 border-b">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-base font-semibold">Assignments</p>
							<p className="text-xs text-muted-foreground">
								{counts.total} total · {counts.submitted} awaiting review · {counts.accepted} accepted
								{counts.closedUnsubmitted > 0 && (
									<span className="text-rose-600"> · {counts.closedUnsubmitted} closed without submission</span>
								)}
							</p>
						</div>
						<Button variant="outline" size="sm" onClick={load} disabled={loading}>
							<RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
							Refresh
						</Button>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
						<SearchableSelect
							value={statusFilter}
							onValueChange={setStatusFilter}
							placeholder="All statuses"
							options={[
								{ value: 'all', label: 'All statuses' },
								{ value: 'assigned', label: 'Assigned' },
								{ value: 'in_progress', label: 'In Progress' },
								{ value: 'submitted', label: 'Submitted' },
								{ value: 'returned', label: 'Returned' },
								{ value: 'accepted', label: 'Accepted' },
								{ value: 'cancelled', label: 'Cancelled' },
							]}
						/>
						<SearchableSelect
							value={kindFilter}
							onValueChange={setKindFilter}
							placeholder="All examiner types"
							options={[
								{ value: 'all', label: 'All examiner types' },
								{ value: 'external', label: 'External' },
								{ value: 'internal', label: 'Internal' },
							]}
						/>
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								value={search}
								onChange={e => setSearch(e.target.value)}
								placeholder="Subject, examiner or order reference…"
								className="h-9 pl-8"
							/>
						</div>
					</div>
				</CardHeader>

				<CardContent className="p-0">
					{loading ? (
						<div className="p-10 flex justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : visible.length === 0 ? (
						<div className="p-10 text-center text-sm text-muted-foreground">
							{rows.length === 0 ? 'No papers have been assigned yet.' : 'Nothing matches these filters.'}
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Subject</TableHead>
										<TableHead>Examiner</TableHead>
										<TableHead className="w-44">Access period (IST)</TableHead>
										<TableHead className="w-28">Window</TableHead>
										<TableHead className="w-32">Status</TableHead>
										<TableHead className="w-28">Progress</TableHead>
										<TableHead className="w-10" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{visible.map(r => (
										<TableRow key={r.id} className="cursor-pointer" onClick={() => openDetail(r)}>
											<TableCell>
												<div className="font-medium text-sm">
													{r.course_code}
													{r.set_label ? ` · Set ${r.set_label}` : ''}
												</div>
												<div className="text-xs text-muted-foreground truncate max-w-[260px]">
													{r.subject_title}
												</div>
												{r.order_ref_no && (
													<div className="text-[11px] text-muted-foreground mt-0.5">{r.order_ref_no}</div>
												)}
											</TableCell>
											<TableCell>
												<div className="text-sm">{r.examiner?.full_name || '—'}</div>
												<div className="text-xs text-muted-foreground truncate max-w-[220px]">
													{r.examiner?.email}
												</div>
												<div className="mt-1"><KindBadge kind={r.examiner_kind} /></div>
											</TableCell>
											<TableCell className="text-xs">
												<div>{formatIst(r.valid_from, false)}</div>
												<div className="text-muted-foreground">to {formatIst(r.valid_to, false)}</div>
												{r.window_extensions > 0 && (
													<div className="text-[11px] text-amber-600 mt-0.5">
														Extended {r.window_extensions}×
													</div>
												)}
											</TableCell>
											<TableCell><WindowBadge state={r.window_state} /></TableCell>
											<TableCell>
												<StatusBadge status={r.status} />
												{r.order_email_sent_at && (
													<div className="text-[11px] text-muted-foreground mt-1">Order sent</div>
												)}
											</TableCell>
											<TableCell className="text-xs">
												{r.question_count > 0 ? (
													<>
														<div>{r.authored_count} / {r.question_count}</div>
														<div className="h-1.5 w-16 rounded-full bg-muted mt-1 overflow-hidden">
															<div
																className={cn(
																	'h-full rounded-full',
																	r.authored_count === r.question_count ? 'bg-emerald-500' : 'bg-blue-500'
																)}
																style={{ width: `${Math.round((r.authored_count / r.question_count) * 100)}%` }}
															/>
														</div>
													</>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
											<TableCell onClick={e => e.stopPropagation()}>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy === r.id}>
															{busy === r.id ? (
																<Loader2 className="h-4 w-4 animate-spin" />
															) : (
																<MoreHorizontal className="h-4 w-4" />
															)}
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end" className="w-56">
														<DropdownMenuItem onClick={() => openDetail(r)}>
															<FileText className="h-4 w-4 mr-2" />
															Open details
														</DropdownMenuItem>
														<DropdownMenuItem onClick={() => openOrderPdf(r.id)}>
															<Download className="h-4 w-4 mr-2" />
															Examiner order PDF
														</DropdownMenuItem>
														<DropdownMenuItem onClick={() => sendOrder(r)}>
															<Mail className="h-4 w-4 mr-2" />
															{r.order_email_sent_at ? 'Re-send order e-mail' : 'E-mail the order'}
														</DropdownMenuItem>
														{r.authored && (
															<DropdownMenuItem onClick={() => openPaperPdf(r.paper_id)}>
																<ExternalLink className="h-4 w-4 mr-2" />
																Question paper PDF
															</DropdownMenuItem>
														)}
														<DropdownMenuSeparator />
														{r.status === 'submitted' && (
															<DropdownMenuItem
																onClick={() => runAction(r.id, { action: 'accept' }, 'Question paper accepted')}
															>
																<CheckCircle2 className="h-4 w-4 mr-2" />
																Accept the paper
															</DropdownMenuItem>
														)}
														{canReopenPaper(r) && (
															<DropdownMenuItem onClick={() => openReopen(r, 'paper')}>
																<Unlock className="h-4 w-4 mr-2" />
																Reopen question paper
															</DropdownMenuItem>
														)}
														{canReopenClaim(r) && (
															<DropdownMenuItem onClick={() => openReopen(r, 'claim')}>
																<Unlock className="h-4 w-4 mr-2" />
																Reopen claim form
															</DropdownMenuItem>
														)}
														{canChangeType(r) && (
															<DropdownMenuItem onClick={() => openChangeType(r)}>
																<KeyRound className="h-4 w-4 mr-2" />
																Change assignment type
															</DropdownMenuItem>
														)}
														<DropdownMenuItem
															onClick={() => {
																setActionRow(r)
																setWindowFrom(isoToIstLocal(r.valid_from))
																setWindowTo(isoToIstLocal(r.valid_to))
																setWindowOpen(true)
															}}
														>
															<CalendarClock className="h-4 w-4 mr-2" />
															Change access period
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														{canCancel(r) && (
															<DropdownMenuItem
																className="text-rose-600"
																onClick={() => setConfirmCancel(r)}
															>
																<Ban className="h-4 w-4 mr-2" />
																Cancel assignment
															</DropdownMenuItem>
														)}
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* ── Detail sheet ──────────────────────────────────────────────── */}
			<Sheet
				open={!!openRow}
				onOpenChange={o => {
					if (!o) {
						setOpenRow(null)
						setDetail(null)
					}
				}}
			>
				<SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
					<SheetHeader>
						<SheetTitle>
							{openRow?.course_code} — {openRow?.subject_title}
						</SheetTitle>
					</SheetHeader>

					{detailLoading ? (
						<div className="p-10 flex justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : detail ? (
						<Tabs defaultValue="overview" className="py-4">
							<TabsList>
								<TabsTrigger value="overview">Overview</TabsTrigger>
								<TabsTrigger value="paper">Question paper</TabsTrigger>
								<TabsTrigger value="checklist">Check list</TabsTrigger>
								<TabsTrigger value="history">
									History
									{history.paper_versions.length + history.claim_versions.length > 0 && (
										<span className="ml-1.5 rounded-full bg-slate-200 text-slate-700 text-[10px] px-1.5 leading-4">
											{history.paper_versions.length + history.claim_versions.length}
										</span>
									)}
								</TabsTrigger>
								<TabsTrigger value="audit">Audit log</TabsTrigger>
							</TabsList>

							{/* Overview */}
							<TabsContent value="overview" className="space-y-4 pt-4">
								<div className="flex flex-wrap gap-2">
									<StatusBadge status={detail.status} />
									<WindowBadge state={detail.window_state} />
									<KindBadge kind={detail.examiner_kind} />
								</div>

								<dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
									<div>
										<dt className="text-xs text-muted-foreground">Examiner</dt>
										<dd className="font-medium">{detail.examiner?.full_name}</dd>
										<dd className="text-xs text-muted-foreground">{detail.examiner?.email}</dd>
										<dd className="text-xs text-muted-foreground">
											{[detail.examiner?.designation, detail.examiner?.department, detail.examiner?.institution_name]
												.filter(Boolean)
												.join(' · ')}
										</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">Order reference</dt>
										<dd>{detail.order_ref_no || '—'}</dd>
										<dt className="text-xs text-muted-foreground mt-2">Order e-mailed</dt>
										<dd>{detail.order_email_sent_at ? formatIst(detail.order_email_sent_at) : 'Not sent'}</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">Available from</dt>
										<dd>{formatIst(detail.valid_from)}</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">Submission deadline</dt>
										<dd>{formatIst(detail.valid_to)}</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">Submitted</dt>
										<dd>{detail.submitted_at ? formatIst(detail.submitted_at) : '—'}</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">Accepted</dt>
										<dd>{detail.accepted_at ? formatIst(detail.accepted_at) : '—'}</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">Assignment</dt>
										<dd>
											{QP_ASSIGNMENT_TYPE_LABELS[(detail.assignment_type as QpAssignmentType) || 'question_paper']}
											<div className="text-xs text-muted-foreground">
												{detail.assignment_type !== 'answer_key' && <>QP {formatRupees(detail.qp_fee)}</>}
												{detail.assignment_type === 'both' && ' · '}
												{detail.assignment_type !== 'question_paper' && <>Answer key {formatRupees(detail.ak_fee)}</>}
											</div>
										</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">Willingness</dt>
										<dd>
											{detail.willingness_confirmed_at ? (
												<>
													{detail.assignment_type !== 'answer_key' && (
														<Badge variant="outline" className={cn('mr-1', detail.qp_willing !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200')}>
															QP {detail.qp_willing !== false ? 'accepted' : 'declined'}
														</Badge>
													)}
													{detail.assignment_type !== 'question_paper' && (
														<Badge variant="outline" className={detail.ak_willing ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
															Answer key {detail.ak_willing ? 'accepted' : 'declined'}
														</Badge>
													)}
													<div className="text-xs text-muted-foreground">{formatIst(detail.willingness_confirmed_at)}</div>
												</>
											) : (
												<span className="text-muted-foreground">Not yet confirmed by the examiner</span>
											)}
										</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">Claim</dt>
										<dd>
											{detail.claim_amount != null ? (
												formatRupees(detail.claim_amount)
											) : (
												<span className="text-muted-foreground">Potential {formatRupees(detail.remuneration)} — awaiting willingness</span>
											)}
										</dd>
									</div>
									<div>
										<dt className="text-xs text-muted-foreground">Claim submitted</dt>
										<dd>{detail.claim_submitted_at ? formatIst(detail.claim_submitted_at) : '—'}</dd>
									</div>
								</dl>

								{detail.return_remarks && (
									<div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm">
										<p className="font-medium text-orange-900">Returned for revision</p>
										<p className="text-orange-800 mt-1">{detail.return_remarks}</p>
									</div>
								)}

								<div className="flex flex-wrap gap-2 pt-2">
									<Button variant="outline" size="sm" onClick={() => openOrderPdf(detail.id)}>
										<Download className="h-4 w-4 mr-1.5" />
										Order PDF
									</Button>
									{detail.course_id && (
										<Button
											variant="outline"
											size="sm"
											title="The syllabus this paper must be set within"
											onClick={() => window.open(`/api/courses/${detail.course_id}/syllabus-pdf`, '_blank', 'noopener')}
										>
											<BookOpen className="h-4 w-4 mr-1.5" />
											Syllabus
										</Button>
									)}
									<Button
										variant="outline"
										size="sm"
										onClick={() => openRow && sendOrder(openRow)}
										disabled={busy === detail.id}
									>
										<Mail className="h-4 w-4 mr-1.5" />
										{detail.order_email_sent_at ? 'Re-send order' : 'E-mail the order'}
									</Button>
									{detail.status === 'submitted' && (
										<Button
											size="sm"
											onClick={() => runAction(detail.id, { action: 'accept' }, 'Question paper accepted')}
											disabled={busy === detail.id}
										>
											<CheckCircle2 className="h-4 w-4 mr-1.5" />
											Accept
										</Button>
									)}
									{canReopenPaper(detail) && (
										<Button variant="outline" size="sm" onClick={() => openReopen(detail, 'paper')}>
											<Unlock className="h-4 w-4 mr-1.5" />
											Reopen question paper
										</Button>
									)}
									{canReopenClaim(detail) && (
										<Button variant="outline" size="sm" onClick={() => openReopen(detail, 'claim')}>
											<Unlock className="h-4 w-4 mr-1.5" />
											Reopen claim form
										</Button>
									)}
									{canChangeType(detail) && (
										<Button variant="outline" size="sm" onClick={() => openChangeType(detail)}>
											<KeyRound className="h-4 w-4 mr-1.5" />
											Change assignment type
										</Button>
									)}
								</div>

								{(['submitted', 'accepted'].includes(String(detail.status)) ||
									['submitted', 'approved', 'paid'].includes(String(detail.claim_status || ''))) && (
									<div className="rounded-md border border-slate-300 bg-slate-50 p-3 text-xs text-slate-800 flex items-start gap-2">
										<Lock className="h-3.5 w-3.5 shrink-0 mt-px" />
										<span>
											{FINALISED_WARNING}
											{detail.paper_version > 0 && <> Paper version V{detail.paper_version}.</>}
											{detail.claim_version > 0 && <> Claim version V{detail.claim_version}.</>}
										</span>
									</div>
								)}
							</TabsContent>

							{/* Question paper */}
							<TabsContent value="paper" className="pt-4 space-y-3">
								<div className="flex items-center justify-between">
									<p className="text-sm text-muted-foreground">
										{detail.questions?.filter((q: any) => plainText(q.question_text)).length || 0} of{' '}
										{detail.questions?.length || 0} questions entered
									</p>
									<Button variant="outline" size="sm" onClick={() => openPaperPdf(detail.paper_id)}>
										<ExternalLink className="h-4 w-4 mr-1.5" />
										Open PDF
									</Button>
								</div>
								<div className="rounded-md border divide-y">
									{(detail.questions || []).map((q: any) => (
										<div key={q.id} className="p-3 text-sm">
											<div className="flex items-start gap-3">
												<span className="font-medium shrink-0 w-14">
													{q.question_number}
													{q.sub_label ? ` ${q.sub_label})` : '.'}
												</span>
												<div className="min-w-0 flex-1">
													<p className={cn(!plainText(q.question_text) && 'italic text-muted-foreground')}>
														{plainText(q.question_text) || 'Not entered'}
													</p>
													{Array.isArray(q.options) && q.options.length > 0 && (
														<div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 text-xs text-muted-foreground">
															{q.options.map((o: any) => (
																<span key={o.key}>
																	{o.key}) {plainText(o.text_html) || o.text || '—'}
																</span>
															))}
														</div>
													)}
													{Array.isArray(q.sub_questions) && q.sub_questions.length > 0 && (
														<ul className="mt-1 space-y-0.5 text-xs">
															{q.sub_questions.map((sb: any) => (
																<li key={sb.id}>
																	<span className="font-medium">{sb.label}.</span>{' '}
																	{plainText(sb.question_text) || '—'}
																	{sb.marks != null && (
																		<span className="text-muted-foreground"> ({sb.marks})</span>
																	)}
																</li>
															))}
														</ul>
													)}
												</div>
												<div className="shrink-0 text-right text-xs text-muted-foreground space-y-0.5">
													{q.marks != null && <div>{q.marks} m</div>}
													{q.co_code && <div>{q.co_code}</div>}
													{q.k_level && <div>{q.k_level}</div>}
												</div>
											</div>
										</div>
									))}
									{(!detail.questions || detail.questions.length === 0) && (
										<div className="p-8 text-center text-sm text-muted-foreground">
											No questions have been entered yet.
										</div>
									)}
								</div>
							</TabsContent>

							{/* Check list + declaration */}
							<TabsContent value="checklist" className="pt-4 space-y-4">
								{detail.checklist && Object.keys(detail.checklist).length > 0 ? (
									<div className="rounded-md border divide-y">
										{Object.entries(readChecklistAnswers(detail.checklist)).map(([k, a], i) => (
											<div key={k} className="px-3 py-2 text-sm">
												<div className="flex items-start justify-between gap-3">
													<span className="text-muted-foreground">
														<span className="mr-1.5">{i + 1}.</span>
														{a.question}
													</span>
													<Badge
														variant="outline"
														className={cn(
															'shrink-0',
															a.answer === 'YES'
																? 'bg-emerald-50 text-emerald-700 border-emerald-200'
																: 'bg-amber-50 text-amber-700 border-amber-200'
														)}
													>
														{a.answer}
													</Badge>
												</div>
												{a.detail && <p className="mt-1 pl-5 text-xs text-foreground">{a.detail}</p>}
											</div>
										))}
									</div>
								) : (
									<p className="text-sm text-muted-foreground">
										The examiner has not completed the check list yet.
									</p>
								)}

								<div className="text-sm">
									<span className="text-muted-foreground">Declaration accepted: </span>
									{detail.declaration_accepted_at ? formatIst(detail.declaration_accepted_at) : 'Not yet'}
								</div>
							</TabsContent>

							{/* Version history */}
							<TabsContent value="history" className="pt-4 space-y-5">
								<p className="text-xs text-muted-foreground">
									Every submission is kept as a numbered version. Nothing is overwritten: a reopened
									version stays on record next to the resubmission that superseded it.
								</p>

								<div>
									<h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
										<HistoryIcon className="h-4 w-4" />
										Question paper versions
									</h3>
									{history.paper_versions.length === 0 ? (
										<p className="text-sm text-muted-foreground border rounded-md p-4 text-center">
											No submission has been made yet.
										</p>
									) : (
										<div className="rounded-md border divide-y">
											{history.paper_versions.map(v => {
												const prev = history.paper_versions.find(x => x.version === v.version - 1)
												const prevById = new Map<string, any>((prev?.questions || []).map((q: any) => [String(q.id), q]))
												const open = viewVersion === v.version
												const changed = (v.questions || []).filter(
													(q: any) => prev && prevById.has(String(q.id)) && qText(prevById.get(String(q.id))) !== qText(q)
												).length
												return (
													<div key={v.id} className="text-sm">
														<div className="px-3 py-2.5 flex flex-wrap items-start justify-between gap-2">
															<div className="min-w-0">
																<div className="flex items-center gap-2">
																	<span className="font-semibold">V{v.version}</span>
																	<Badge variant="outline" className={cn('text-[10px]', VERSION_TONE[v.status])}>
																		{QP_VERSION_STATUS_LABELS[v.status] || v.status}
																	</Badge>
																	{prev && (
																		<span className="text-[11px] text-muted-foreground">
																			{changed} question{changed === 1 ? '' : 's'} changed from V{prev.version}
																		</span>
																	)}
																</div>
																<p className="text-xs text-muted-foreground mt-0.5">
																	Submitted {formatIst(v.submitted_at)} by the examiner
																	{v.submitted_ip ? ` · ${v.submitted_ip}` : ''} · {v.question_done ?? '—'} / {v.question_total ?? '—'} questions
																</p>
																{v.reopened_at && (
																	<p className="text-xs text-orange-700 mt-0.5">
																		Reopened {formatIst(v.reopened_at)} by {v.reopened_by_email || 'CoE'} — {v.reopen_reason}
																		{v.reopen_remarks ? ` (${v.reopen_remarks})` : ''}
																	</p>
																)}
															</div>
															<Button
																variant="ghost"
																size="sm"
																className="h-7 text-xs"
																onClick={() => setViewVersion(open ? null : v.version)}
															>
																<Eye className="h-3.5 w-3.5 mr-1" />
																{open ? 'Hide' : 'View questions'}
																<ChevronDown className={cn('h-3.5 w-3.5 ml-1 transition-transform', open && 'rotate-180')} />
															</Button>
														</div>
														{open && (
															<div className="border-t bg-slate-50/60 px-3 py-2 space-y-1.5 max-h-[360px] overflow-y-auto">
																{(v.questions || [])
																	.slice()
																	.sort((a: any, b: any) => (a?.display_order ?? 0) - (b?.display_order ?? 0))
																	.map((q: any) => {
																		const before = prevById.get(String(q.id))
																		const isChanged = !!before && qText(before) !== qText(q)
																		return (
																			<div
																				key={q.id}
																				className={cn(
																					'rounded border bg-white px-2.5 py-1.5 text-xs',
																					isChanged && 'border-amber-300 bg-amber-50/60'
																				)}
																			>
																				<div className="flex items-start gap-2">
																					<span className="font-semibold shrink-0">{qLabel(q)}</span>
																					<span className="flex-1 break-words">{qText(q) || <em className="text-muted-foreground">blank</em>}</span>
																					<span className="text-[10px] text-muted-foreground shrink-0">
																						{[q.marks != null ? `${q.marks}m` : null, q.co_code, q.k_level].filter(Boolean).join(' · ')}
																					</span>
																				</div>
																				{isChanged && (
																					<p className="mt-1 text-[11px] text-amber-800">
																						<span className="font-medium">V{prev!.version}:</span> {qText(before)}
																					</p>
																				)}
																			</div>
																		)
																	})}
															</div>
														)}
													</div>
												)
											})}
										</div>
									)}
								</div>

								<div>
									<h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
										<HistoryIcon className="h-4 w-4" />
										Claim form versions
									</h3>
									{history.claim_versions.length === 0 ? (
										<p className="text-sm text-muted-foreground border rounded-md p-4 text-center">
											No claim has been submitted yet.
										</p>
									) : (
										<div className="rounded-md border divide-y">
											{history.claim_versions.map(v => {
												const d = (v.data || {}) as Record<string, any>
												return (
													<div key={v.id} className="px-3 py-2.5 text-sm">
														<div className="flex items-center gap-2">
															<span className="font-semibold">V{v.version}</span>
															<Badge variant="outline" className={cn('text-[10px]', VERSION_TONE[v.status])}>
																{QP_VERSION_STATUS_LABELS[v.status] || v.status}
															</Badge>
														</div>
														<p className="text-xs text-muted-foreground mt-0.5">
															Submitted {formatIst(v.submitted_at)} by the examiner{v.submitted_ip ? ` · ${v.submitted_ip}` : ''}
														</p>
														<dl className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
															<div><dt className="text-muted-foreground">Account holder</dt><dd>{d.account_holder || '—'}</dd></div>
															<div><dt className="text-muted-foreground">Bank</dt><dd>{d.bank_name || '—'}</dd></div>
															<div><dt className="text-muted-foreground">Branch</dt><dd>{d.branch || '—'}</dd></div>
															<div><dt className="text-muted-foreground">Account number</dt><dd>{d.account_number || '—'}</dd></div>
															<div><dt className="text-muted-foreground">IFSC</dt><dd>{d.ifsc || '—'}</dd></div>
															<div><dt className="text-muted-foreground">Rate</dt><dd>{d.rate != null ? `₹ ${Number(d.rate).toFixed(2)}` : '—'}</dd></div>
														</dl>
														{v.reopened_at && (
															<p className="text-xs text-orange-700 mt-1.5">
																Reopened {formatIst(v.reopened_at)} by {v.reopened_by_email || 'CoE'} — {v.reopen_reason}
																{v.reopen_remarks ? ` (${v.reopen_remarks})` : ''}
															</p>
														)}
													</div>
												)
											})}
										</div>
									)}
								</div>
							</TabsContent>

							{/* Audit */}
							<TabsContent value="audit" className="pt-4 space-y-3">
								{logSummary && (
									<div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
										{[
											['Logins', logSummary.logins],
											['Paper views', logSummary.views],
											['Downloads', logSummary.downloads],
											['Refused', logSummary.denied],
										].map(([label, value]) => (
											<div key={String(label)} className="rounded-md border p-2.5">
												<div className={cn('text-lg font-semibold', label === 'Refused' && Number(value) > 0 && 'text-rose-600')}>
													{String(value)}
												</div>
												<div className="text-xs text-muted-foreground">{String(label)}</div>
											</div>
										))}
									</div>
								)}
								<div className="rounded-md border divide-y max-h-[420px] overflow-y-auto">
									{logs.length === 0 && (
										<div className="p-8 text-center text-sm text-muted-foreground">
											No activity recorded yet.
										</div>
									)}
									{logs.map(l => {
										const hasValues = l.old_value != null || l.new_value != null
										return (
											<div key={l.id} className="px-3 py-2 text-sm">
												<div className="flex items-center justify-between gap-2">
													<span className={cn('font-medium flex items-center gap-1.5 flex-wrap', l.denied && 'text-rose-600')}>
														{l.denied && <ShieldAlert className="inline h-3.5 w-3.5 -mt-0.5" />}
														{QP_LOG_ACTION_LABELS[l.action] || l.action}
														{l.version != null && (
															<Badge variant="outline" className="text-[10px] px-1 py-0">V{l.version}</Badge>
														)}
														{l.module && (
															<span className="text-[10px] uppercase tracking-wide text-muted-foreground">{l.module}</span>
														)}
													</span>
													<span className="text-xs text-muted-foreground shrink-0">
														{formatIst(l.created_at)}
													</span>
												</div>
												<div className="text-[11px] text-muted-foreground mt-0.5">
													{l.performed_by_role === 'coe' ? 'CoE' : l.performed_by_role === 'system' ? 'System' : 'Examiner'}
													{l.performed_by_email ? ` · ${l.performed_by_email}` : ''}
													{l.ip_address ? ` · ${l.ip_address}` : ''}
													{l.user_agent ? ` · ${l.user_agent.slice(0, 60)}` : ''}
												</div>
												{l.reason && (
													<div className={cn('text-xs mt-0.5', l.denied ? 'text-rose-600' : 'text-orange-700')}>
														Reason: {l.reason}
													</div>
												)}
												{hasValues && (
													<details className="mt-1">
														<summary className="text-[11px] text-muted-foreground cursor-pointer select-none">
															Old / new values
														</summary>
														<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
															<ValueBlock label="Old value" value={l.old_value} />
															<ValueBlock label="New value" value={l.new_value} />
														</div>
													</details>
												)}
											</div>
										)
									})}
								</div>
							</TabsContent>
						</Tabs>
					) : null}
				</SheetContent>
			</Sheet>

			{/* ── Authorised reopen (question paper / claim form) ────────────── */}
			<Sheet open={reopenOpen} onOpenChange={o => { setReopenOpen(o); if (!o) setActionRow(null) }}>
				<SheetContent className="w-full sm:max-w-lg">
					<SheetHeader>
						<SheetTitle className="flex items-center gap-2">
							<Unlock className="h-4 w-4" />
							{reopenTarget === 'paper' ? 'Reopen the question paper' : 'Reopen the claim form'}
						</SheetTitle>
					</SheetHeader>
					<div className="space-y-4 py-4">
						<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
							<ShieldAlert className="h-4 w-4 shrink-0 mt-px" />
							<span>
								{FINALISED_WARNING} Your identity, the date and time, and the reason below are written to the
								audit log and shown to the examiner.
								{reopenTarget === 'paper' && actionRow?.paper_version
									? ` Version V${actionRow.paper_version} stays on record; the resubmission becomes V${actionRow.paper_version + 1}.`
									: ''}
								{reopenTarget === 'claim' && actionRow?.claim_version
									? ` Version V${actionRow.claim_version} stays on record; the resubmission becomes V${actionRow.claim_version + 1}.`
									: ''}
							</span>
						</div>
						<p className="text-sm text-muted-foreground">
							{reopenTarget === 'paper'
								? 'The paper goes back to the examiner for editing. The check list and signature are collected again when they resubmit. Set a new closing date if the access period has already ended.'
								: 'The claim goes back to the examiner to correct the bank details and submit again. A paid claim cannot be reopened.'}
						</p>
						<div>
							<Label htmlFor="reopen_reason" className="text-xs">
								Reason for reopening <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="reopen_reason"
								value={reopenReason}
								onChange={e => setReopenReason(e.target.value)}
								rows={3}
								placeholder={
									reopenTarget === 'paper'
										? 'e.g. Q8 is outside the syllabus — replace with a question from Unit III.'
										: 'e.g. IFSC entered does not match the bank branch.'
								}
								className="mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="reopen_remarks" className="text-xs">Remarks — optional</Label>
							<Textarea
								id="reopen_remarks"
								value={reopenRemarks}
								onChange={e => setReopenRemarks(e.target.value)}
								rows={2}
								placeholder="Anything else the examiner should know."
								className="mt-1"
							/>
						</div>
						{reopenTarget === 'paper' && (
							<div>
								<Label htmlFor="return_to" className="text-xs">New closing date &amp; time (IST) — optional</Label>
								<Input
									id="return_to"
									type="datetime-local"
									value={returnNewTo}
									onChange={e => setReturnNewTo(e.target.value)}
									className="h-9 mt-1"
								/>
							</div>
						)}
					</div>
					<div className="flex justify-end gap-2 border-t pt-4">
						<Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button>
						<Button
							onClick={async () => {
								if (!actionRow) return
								const ok = await runAction(
									actionRow.id,
									reopenTarget === 'paper'
										? { action: 'reopen_paper', reason: reopenReason, remarks: reopenRemarks, valid_to: returnNewTo || undefined }
										: { action: 'reopen_claim', reason: reopenReason, remarks: reopenRemarks },
									reopenTarget === 'paper' ? 'Question paper reopened' : 'Claim form reopened'
								)
								if (ok) setReopenOpen(false)
							}}
							disabled={!reopenReason.trim() || busy === actionRow?.id}
						>
							{busy === actionRow?.id && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							<Unlock className="h-4 w-4 mr-1.5" />
							{reopenTarget === 'paper' ? 'Reopen question paper' : 'Reopen claim form'}
						</Button>
					</div>
				</SheetContent>
			</Sheet>

			{/* ── Change assignment type ───────────────────────────────────────── */}
			<Sheet open={typeOpen} onOpenChange={o => { setTypeOpen(o); if (!o) setActionRow(null) }}>
				<SheetContent className="w-full sm:max-w-lg">
					<SheetHeader>
						<SheetTitle className="flex items-center gap-2">
							<KeyRound className="h-4 w-4" />
							Change the assignment type
						</SheetTitle>
					</SheetHeader>
					{actionRow && (() => {
						const cur = (actionRow.assignment_type || 'question_paper') as QpAssignmentType
						const qpFee = Number(actionRow.qp_fee ?? 0)
						const akFee = Number(actionRow.ak_fee ?? 0)
						const amount = (t: QpAssignmentType) => (t === 'question_paper' ? qpFee : t === 'answer_key' ? akFee : qpFee + akFee)
						const submitted = everSubmitted(actionRow)
						const claimApplied = ['submitted', 'approved'].includes(String(actionRow.claim_status || 'pending'))
						const addsAk = typeNew !== 'question_paper' && cur === 'question_paper'
						const removes =
							(cur !== 'question_paper' && typeNew === 'question_paper') ||
							(cur !== 'answer_key' && typeNew === 'answer_key')
						return (
							<div className="space-y-4 py-4">
								<p className="text-sm text-muted-foreground">
									Currently <span className="font-medium text-foreground">{QP_ASSIGNMENT_TYPE_LABELS[cur]}</span>.
									Fees come from Fee Details; the order is rebuilt and, if ticked, e-mailed again.
								</p>
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
									{(['question_paper', 'answer_key', 'both'] as QpAssignmentType[]).map(t => {
										const on = typeNew === t
										const isCurrent = t === cur
										return (
											<button
												key={t}
												type="button"
												disabled={isCurrent}
												onClick={() => setTypeNew(t)}
												className={cn(
													'rounded-md border p-3 text-left transition-colors',
													isCurrent ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40',
													on && !isCurrent ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200'
												)}
											>
												<div className="text-sm font-medium">{QP_ASSIGNMENT_TYPE_LABELS[t]}</div>
												<div className="text-xs text-muted-foreground">{isCurrent ? 'current' : `₹${amount(t).toLocaleString('en-IN')}`}</div>
											</button>
										)
									})}
								</div>

								<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
									<p className="font-medium">What this does</p>
									{addsAk && submitted && (
										<p>
											The question paper is already submitted. The appointment is reopened for the answer key only: the
											examiner confirms the answer key, enters it under each question and submits again. The questions stay
											locked. Version V{actionRow.paper_version || 1} stays on record.
										</p>
									)}
									{addsAk && !submitted && <p>The examiner will be asked to confirm the answer key on the portal before entering the paper.</p>}
									{claimApplied && <p>The claim has already been applied: it is reopened so the examiner can resubmit it with the added fee.</p>}
									{removes && submitted && <p className="text-rose-700">A component that has already been submitted cannot be removed; the server will refuse it.</p>}
									<p>The change, your identity, the time and the reason are written to the audit log.</p>
								</div>

								<div>
									<Label htmlFor="type_reason" className="text-xs">
										Reason <span className="text-rose-600">*</span>
									</Label>
									<Textarea
										id="type_reason"
										value={typeReason}
										onChange={e => setTypeReason(e.target.value)}
										rows={3}
										placeholder="e.g. Answer key required for this course as per the Board of Studies decision."
										className="mt-1"
									/>
								</div>
								<div>
									<Label htmlFor="type_remarks" className="text-xs">Remarks for the examiner — optional</Label>
									<Textarea id="type_remarks" value={typeRemarks} onChange={e => setTypeRemarks(e.target.value)} rows={2} className="mt-1" />
								</div>
								{addsAk && submitted && (
									<div>
										<Label htmlFor="type_to" className="text-xs">New closing date &amp; time (IST) — needed if the period has closed</Label>
										<Input id="type_to" type="datetime-local" value={typeNewTo} onChange={e => setTypeNewTo(e.target.value)} className="h-9 mt-1" />
									</div>
								)}
								<label className="flex items-center gap-2 text-sm cursor-pointer">
									<input type="checkbox" checked={typeEmail} onChange={e => setTypeEmail(e.target.checked)} />
									E-mail the updated order to the examiner now
								</label>
							</div>
						)
					})()}
					<div className="flex justify-end gap-2 border-t pt-4">
						<Button variant="outline" onClick={() => setTypeOpen(false)}>Cancel</Button>
						<Button
							onClick={async () => {
								if (!actionRow) return
								const ok = await runAction(
									actionRow.id,
									{
										action: 'change_type',
										assignment_type: typeNew,
										reason: typeReason,
										remarks: typeRemarks,
										send_email: typeEmail,
										valid_to: typeNewTo || undefined,
									},
									'Assignment type changed'
								)
								if (ok) setTypeOpen(false)
							}}
							disabled={!typeReason.trim() || busy === actionRow?.id || typeNew === ((actionRow?.assignment_type || 'question_paper') as QpAssignmentType)}
						>
							{busy === actionRow?.id && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							<KeyRound className="h-4 w-4 mr-1.5" />
							Change to {QP_ASSIGNMENT_TYPE_LABELS[typeNew]}
						</Button>
					</div>
				</SheetContent>
			</Sheet>

			{/* ── Change access period ──────────────────────────────────────── */}
			<Sheet open={windowOpen} onOpenChange={o => { setWindowOpen(o); if (!o) setActionRow(null) }}>
				<SheetContent className="w-full sm:max-w-lg">
					<SheetHeader>
						<SheetTitle>Change the access period</SheetTitle>
					</SheetHeader>
					<div className="space-y-4 py-4">
						<p className="text-sm text-muted-foreground">
							Both times are Indian Standard Time. Every change is recorded in the access log.
						</p>
						<div>
							<Label htmlFor="win_from" className="text-xs">Date &amp; time from</Label>
							<Input
								id="win_from"
								type="datetime-local"
								value={windowFrom}
								onChange={e => setWindowFrom(e.target.value)}
								className="h-9 mt-1"
							/>
						</div>
						<div>
							<Label htmlFor="win_to" className="text-xs">Date &amp; time to</Label>
							<Input
								id="win_to"
								type="datetime-local"
								value={windowTo}
								onChange={e => setWindowTo(e.target.value)}
								className="h-9 mt-1"
							/>
						</div>
						{['submitted', 'accepted'].includes(String(actionRow?.status)) && (
							<div className="rounded-md border border-slate-300 bg-slate-50 p-3 text-xs text-slate-800">
								This paper has already been finalised. Changing the period does not unlock it — use
								<span className="font-medium"> Reopen question paper</span>, which records the reason.
							</div>
						)}
					</div>
					<div className="flex justify-end gap-2 border-t pt-4">
						<Button variant="outline" onClick={() => setWindowOpen(false)}>Cancel</Button>
						<Button
							onClick={async () => {
								if (!actionRow) return
								const ok = await runAction(
									actionRow.id,
									{ action: 'window', valid_from: windowFrom, valid_to: windowTo },
									'Access period updated'
								)
								if (ok) setWindowOpen(false)
							}}
							disabled={!windowTo || busy === actionRow?.id}
						>
							{busy === actionRow?.id && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							Save period
						</Button>
					</div>
				</SheetContent>
			</Sheet>

			{/* ── Cancel confirmation ───────────────────────────────────────── */}
			<AlertDialog open={!!confirmCancel} onOpenChange={o => !o && setConfirmCancel(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Cancel this assignment?</AlertDialogTitle>
						<AlertDialogDescription>
							{confirmCancel?.examiner?.full_name} will lose access to{' '}
							{confirmCancel?.course_code} immediately. The record and its access log are kept.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep it</AlertDialogCancel>
						<AlertDialogAction
							className="bg-rose-600 hover:bg-rose-700"
							onClick={async () => {
								if (!confirmCancel) return
								await runAction(confirmCancel.id, { action: 'cancel' }, 'Assignment cancelled')
								setConfirmCancel(null)
							}}
						>
							Cancel the assignment
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
