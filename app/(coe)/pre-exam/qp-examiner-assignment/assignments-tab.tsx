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
	Loader2, MoreHorizontal, RefreshCw, Search, FileText, Mail, CheckCircle2, Undo2, CalendarClock,
	ShieldAlert, Ban, Trash2, Download, History, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst, isoToIstLocal } from '@/lib/qp-portal/ist'
import { QP_LOG_ACTION_LABELS } from '@/types/qp-examiner-assignment'
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

	// ── Actions ───────────────────────────────────────────────────────────
	const [busy, setBusy] = useState<string | null>(null)
	const [returnOpen, setReturnOpen] = useState(false)
	const [returnRemarks, setReturnRemarks] = useState('')
	const [returnNewTo, setReturnNewTo] = useState('')
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
		setDetailLoading(true)
		try {
			const [d, l] = await Promise.all([
				apiFetch(`/api/pre-exam/qp-examiner-assignments/${row.id}`),
				apiFetch(`/api/pre-exam/qp-examiner-assignments/${row.id}/logs`),
			])
			setDetail(d)
			setLogs(l.data || [])
			setLogSummary(l.summary || null)
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
				const refreshed = await apiFetch(`/api/pre-exam/qp-examiner-assignments/${id}`)
				setDetail(refreshed)
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
		window.open(`/api/pre-exam/question-papers/${paperId}/pdf`, '_blank', 'noopener')
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
														{r.status === 'submitted' && (
															<DropdownMenuItem
																onClick={() => {
																	setOpenRow(r)
																	setReturnRemarks('')
																	setReturnNewTo('')
																	setReturnOpen(true)
																}}
															>
																<Undo2 className="h-4 w-4 mr-2" />
																Return for revision
															</DropdownMenuItem>
														)}
														<DropdownMenuItem
															onClick={() => {
																setOpenRow(r)
																setWindowFrom(isoToIstLocal(r.valid_from))
																setWindowTo(isoToIstLocal(r.valid_to))
																setWindowOpen(true)
															}}
														>
															<CalendarClock className="h-4 w-4 mr-2" />
															Change access period
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														{r.status !== 'cancelled' && (
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
				open={!!openRow && !returnOpen && !windowOpen}
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
								<TabsTrigger value="audit">Access log</TabsTrigger>
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
										<dt className="text-xs text-muted-foreground">Remuneration</dt>
										<dd>{detail.remuneration != null ? `₹ ${Number(detail.remuneration).toFixed(2)}` : '—'}</dd>
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
										<>
											<Button
												size="sm"
												onClick={() => runAction(detail.id, { action: 'accept' }, 'Question paper accepted')}
												disabled={busy === detail.id}
											>
												<CheckCircle2 className="h-4 w-4 mr-1.5" />
												Accept
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													setReturnRemarks('')
													setReturnNewTo('')
													setReturnOpen(true)
												}}
											>
												<Undo2 className="h-4 w-4 mr-1.5" />
												Return for revision
											</Button>
										</>
									)}
								</div>
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
										{Object.entries(detail.checklist as Record<string, string>).map(([k, v]) => (
											<div key={k} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
												<span className="text-muted-foreground truncate">{k}</span>
												<Badge
													variant="outline"
													className={cn(
														'shrink-0',
														String(v).toUpperCase() === 'YES'
															? 'bg-emerald-50 text-emerald-700 border-emerald-200'
															: 'bg-amber-50 text-amber-700 border-amber-200'
													)}
												>
													{String(v)}
												</Badge>
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
									{logs.map(l => (
										<div key={l.id} className="px-3 py-2 text-sm">
											<div className="flex items-center justify-between gap-2">
												<span className={cn('font-medium', l.denied && 'text-rose-600')}>
													{l.denied && <ShieldAlert className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
													{QP_LOG_ACTION_LABELS[l.action] || l.action}
												</span>
												<span className="text-xs text-muted-foreground shrink-0">
													{formatIst(l.created_at)}
												</span>
											</div>
											{l.reason && <div className="text-xs text-rose-600 mt-0.5">{l.reason}</div>}
											<div className="text-[11px] text-muted-foreground mt-0.5">
												{l.ip_address}
												{l.user_agent ? ` · ${l.user_agent.slice(0, 60)}` : ''}
											</div>
										</div>
									))}
								</div>
							</TabsContent>
						</Tabs>
					) : null}
				</SheetContent>
			</Sheet>

			{/* ── Return for revision ───────────────────────────────────────── */}
			<Sheet open={returnOpen} onOpenChange={setReturnOpen}>
				<SheetContent className="w-full sm:max-w-lg">
					<SheetHeader>
						<SheetTitle>Return the question paper for revision</SheetTitle>
					</SheetHeader>
					<div className="space-y-4 py-4">
						<p className="text-sm text-muted-foreground">
							The examiner will see these remarks in the portal and can edit the paper again. If the
							access period has already closed, set a new closing date so they can actually work on it.
						</p>
						<div>
							<Label htmlFor="return_remarks" className="text-xs">What must be revised</Label>
							<Textarea
								id="return_remarks"
								value={returnRemarks}
								onChange={e => setReturnRemarks(e.target.value)}
								rows={4}
								placeholder="e.g. Part B question 12 is outside the syllabus; CO tagging on Part A is incomplete."
								className="mt-1"
							/>
						</div>
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
					</div>
					<div className="flex justify-end gap-2 border-t pt-4">
						<Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
						<Button
							onClick={async () => {
								if (!openRow) return
								const ok = await runAction(
									openRow.id,
									{ action: 'return', remarks: returnRemarks, valid_to: returnNewTo || undefined },
									'Returned to the examiner'
								)
								if (ok) setReturnOpen(false)
							}}
							disabled={!returnRemarks.trim() || busy === openRow?.id}
						>
							{busy === openRow?.id && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							Return for revision
						</Button>
					</div>
				</SheetContent>
			</Sheet>

			{/* ── Change access period ──────────────────────────────────────── */}
			<Sheet open={windowOpen} onOpenChange={setWindowOpen}>
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
						{openRow?.status === 'submitted' && (
							<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
								This paper has already been submitted. Reopening the window will also put it back into
								the examiner&apos;s hands for editing.
							</div>
						)}
					</div>
					<div className="flex justify-end gap-2 border-t pt-4">
						<Button variant="outline" onClick={() => setWindowOpen(false)}>Cancel</Button>
						<Button
							onClick={async () => {
								if (!openRow) return
								const ok = await runAction(
									openRow.id,
									{
										action: openRow.status === 'submitted' ? 'reopen' : 'window',
										valid_from: windowFrom,
										valid_to: windowTo,
									},
									'Access period updated'
								)
								if (ok) setWindowOpen(false)
							}}
							disabled={!windowTo || busy === openRow?.id}
						>
							{busy === openRow?.id && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
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
