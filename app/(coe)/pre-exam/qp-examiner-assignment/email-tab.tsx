'use client'

// E-mail Orders — send the examiner order to many examiners at once.
//
// One row per examiner, every live appointment they hold in the session under
// it. Sending produces ONE e-mail per examiner with ONE combined order that
// lists all their papers, so a setter with two subjects gets a single letter.
// Results come back per examiner; a failed address never hides the ones that
// went out, and can be retried on its own.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
	Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2, Mail, RefreshCw, Search, Send, CheckCircle2, XCircle, Clock, Eye, ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst } from '@/lib/qp-portal/ist'
import { QP_ASSIGNMENT_TYPE_LABELS, type QpAssignmentType } from '@/types/qp-examiner-assignment'
import { apiFetch, KindBadge, type SessionOpt } from './shared'

interface Props {
	institutionsId: string
	session: SessionOpt | null
}

interface AssignmentLite {
	id: string
	course_code: string | null
	subject_title: string | null
	set_label: string | null
	semester: number | null
	program_code: string | null
	assignment_type: string
	status: string
	order_ref_no: string | null
	order_email_sent_at: string | null
	valid_from: string
	valid_to: string
}

interface ExaminerRow {
	examiner_id: string
	full_name: string
	email: string | null
	kind: 'internal' | 'external'
	designation: string | null
	department: string | null
	institution_name: string | null
	assignments: AssignmentLite[]
	sent_count: number
	pending_count: number
	last_sent_at: string | null
	last_email_status: 'SENT' | 'FAILED' | null
	last_email_at: string | null
	last_email_error: string | null
}

interface SendResult {
	examiner_id: string
	ok: boolean
	to?: string
	error?: string
	assignment_ids: string[]
	sent_at?: string
}

type Filter = 'all' | 'pending' | 'sent' | 'failed'

const PAGE = 20

export function EmailTab({ institutionsId, session }: Props) {
	const { toast } = useToast()
	const [rows, setRows] = useState<ExaminerRow[]>([])
	const [summary, setSummary] = useState<any>(null)
	const [loading, setLoading] = useState(false)
	const [filter, setFilter] = useState<Filter>('pending')
	const [search, setSearch] = useState('')
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [message, setMessage] = useState('')

	// Sending
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [sending, setSending] = useState(false)
	const [progress, setProgress] = useState<{ total: number; done: number; results: SendResult[] } | null>(null)

	const load = useCallback(async () => {
		if (!institutionsId || !session?.id) {
			setRows([])
			setSummary(null)
			return
		}
		setLoading(true)
		try {
			const qs = new URLSearchParams({ institutions_id: institutionsId, examination_session_id: session.id })
			const json = await apiFetch(`/api/pre-exam/qp-examiner-assignments/email?${qs}`)
			setRows(json.data || [])
			setSummary(json.summary || null)
		} catch (e: any) {
			toast({ title: 'Could not load examiners', description: e.message, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [institutionsId, session?.id, toast])

	useEffect(() => {
		load()
		setSelected(new Set())
	}, [load])

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		return rows.filter(r => {
			if (filter === 'pending' && r.pending_count === 0) return false
			if (filter === 'sent' && r.pending_count > 0) return false
			if (filter === 'failed' && r.last_email_status !== 'FAILED') return false
			if (
				q &&
				!`${r.full_name} ${r.email || ''} ${r.assignments.map(a => `${a.course_code} ${a.subject_title}`).join(' ')}`
					.toLowerCase()
					.includes(q)
			)
				return false
			return true
		})
	}, [rows, filter, search])

	const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.examiner_id))
	const toggleAll = () =>
		setSelected(prev => {
			const next = new Set(prev)
			if (allVisibleSelected) visible.forEach(r => next.delete(r.examiner_id))
			else visible.forEach(r => r.email && next.add(r.examiner_id))
			return next
		})
	const toggle = (id: string) =>
		setSelected(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const selectedRows = rows.filter(r => selected.has(r.examiner_id))
	const selectedPapers = selectedRows.reduce((t, r) => t + r.assignments.length, 0)
	const resendCount = selectedRows.filter(r => r.pending_count === 0).length

	const previewUrl = (examinerId: string) =>
		`/api/pre-exam/qp-examiner-assignments/email/preview?${new URLSearchParams({
			institutions_id: institutionsId,
			examination_session_id: session?.id || '',
			examiner_id: examinerId,
		})}`

	// Sent in pages of PAGE examiners so one long list never outlives a request.
	const send = async () => {
		if (!session?.id || selectedRows.length === 0) return
		setConfirmOpen(false)
		setSending(true)
		const ids = selectedRows.map(r => r.examiner_id)
		const results: SendResult[] = []
		setProgress({ total: ids.length, done: 0, results: [] })
		try {
			for (let i = 0; i < ids.length; i += PAGE) {
				const page = ids.slice(i, i + PAGE)
				try {
					const json = await apiFetch('/api/pre-exam/qp-examiner-assignments/email/send', {
						method: 'POST',
						body: JSON.stringify({
							institutions_id: institutionsId,
							examination_session_id: session.id,
							examiner_ids: page,
							custom_message: message.trim() || undefined,
						}),
					})
					results.push(...((json.results || []) as SendResult[]))
				} catch (e: any) {
					for (const id of page) results.push({ examiner_id: id, ok: false, error: e?.message || 'request failed', assignment_ids: [] })
				}
				setProgress({ total: ids.length, done: Math.min(i + PAGE, ids.length), results: [...results] })
			}
			const sent = results.filter(r => r.ok).length
			const failed = results.length - sent
			if (sent > 0) toast({ title: 'Orders e-mailed', description: `${sent} examiner${sent === 1 ? '' : 's'} e-mailed.` })
			if (failed > 0) toast({ title: 'Some did not go out', description: `${failed} failed — see the list.`, variant: 'destructive' })
			setSelected(new Set(results.filter(r => !r.ok).map(r => r.examiner_id)))
			await load()
		} finally {
			setSending(false)
		}
	}

	const nameById = (id: string) => rows.find(r => r.examiner_id === id)?.full_name || id

	if (!session?.id) {
		return (
			<Card>
				<CardContent className="p-10 text-center text-sm text-muted-foreground">
					Select an examination session to e-mail examiner orders.
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="space-y-4">
			{/* Summary */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
				{[
					{ label: 'Examiners', value: summary?.examiners ?? '—', tone: 'text-slate-700' },
					{ label: 'Papers', value: summary?.assignments ?? '—', tone: 'text-slate-700' },
					{ label: 'Order not yet sent', value: summary?.pending_examiners ?? '—', tone: 'text-amber-700' },
					{ label: 'Order sent', value: summary?.sent_examiners ?? '—', tone: 'text-emerald-700' },
				].map(s => (
					<Card key={s.label}>
						<CardContent className="p-3.5">
							<p className="text-xs text-muted-foreground">{s.label}</p>
							<p className={cn('text-2xl font-semibold mt-0.5', s.tone)}>{s.value}</p>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Toolbar */}
			<Card>
				<CardContent className="p-3 space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<div className="inline-flex rounded-md border overflow-hidden">
							{(
								[
									['pending', 'Not sent'],
									['sent', 'Sent'],
									['failed', 'Failed'],
									['all', 'All'],
								] as [Filter, string][]
							).map(([key, label]) => (
								<button
									key={key}
									type="button"
									onClick={() => setFilter(key)}
									className={cn(
										'px-3 py-1.5 text-xs font-medium border-r last:border-r-0',
										filter === key ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
									)}
								>
									{label}
								</button>
							))}
						</div>
						<div className="relative flex-1 min-w-[220px]">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								value={search}
								onChange={e => setSearch(e.target.value)}
								placeholder="Examiner, e-mail, course code or title…"
								className="h-9 pl-8"
							/>
						</div>
						<Button variant="outline" size="sm" onClick={load} disabled={loading}>
							<RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
							Refresh
						</Button>
						<Button size="sm" onClick={() => setConfirmOpen(true)} disabled={selectedRows.length === 0 || sending}>
							{sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
							E-mail orders to {selectedRows.length || ''} selected
						</Button>
					</div>
					<div>
						<Label htmlFor="bulk_msg" className="text-xs">Message to include — optional, same for every examiner</Label>
						<Textarea
							id="bulk_msg"
							value={message}
							onChange={e => setMessage(e.target.value)}
							rows={2}
							placeholder="e.g. Kindly acknowledge the appointment in the portal within three days."
							className="mt-1"
						/>
					</div>
					<p className="text-xs text-muted-foreground flex items-center gap-1.5">
						<Mail className="h-3.5 w-3.5" />
						One e-mail per examiner. An examiner with several papers receives a single order listing all of them.
						Examiners without an e-mail address cannot be selected.
					</p>
				</CardContent>
			</Card>

			{/* Table */}
			<Card>
				<CardContent className="p-0">
					{loading && rows.length === 0 ? (
						<div className="py-16 flex justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : visible.length === 0 ? (
						<div className="py-16 text-center text-sm text-muted-foreground">
							{rows.length === 0 ? 'No live appointments in this session.' : 'Nothing matches this filter.'}
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-10">
											<Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all" />
										</TableHead>
										<TableHead className="w-8" />
										<TableHead>Examiner</TableHead>
										<TableHead>Papers</TableHead>
										<TableHead>Order e-mail</TableHead>
										<TableHead className="text-right">Preview</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{visible.map(r => {
										const open = expanded.has(r.examiner_id)
										return (
											<>
												<TableRow key={r.examiner_id} className={cn(selected.has(r.examiner_id) && 'bg-emerald-50/40')}>
													<TableCell>
														<Checkbox
															checked={selected.has(r.examiner_id)}
															onCheckedChange={() => toggle(r.examiner_id)}
															disabled={!r.email}
															aria-label={`Select ${r.full_name}`}
														/>
													</TableCell>
													<TableCell>
														<button
															type="button"
															className="text-muted-foreground hover:text-foreground"
															onClick={() =>
																setExpanded(prev => {
																	const next = new Set(prev)
																	if (next.has(r.examiner_id)) next.delete(r.examiner_id)
																	else next.add(r.examiner_id)
																	return next
																})
															}
															aria-label={open ? 'Collapse' : 'Expand'}
														>
															{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
														</button>
													</TableCell>
													<TableCell>
														<div className="font-medium flex items-center gap-2">
															{r.full_name}
															<KindBadge kind={r.kind} />
														</div>
														<div className="text-xs text-muted-foreground">
															{r.email || <span className="text-rose-600">no e-mail on record</span>}
															{r.designation ? ` · ${r.designation}` : ''}
															{r.institution_name ? ` · ${r.institution_name}` : ''}
														</div>
													</TableCell>
													<TableCell>
														<div className="text-sm">
															{r.assignments.length} paper{r.assignments.length === 1 ? '' : 's'}
														</div>
														<div className="text-xs text-muted-foreground truncate max-w-[280px]">
															{r.assignments.map(a => a.course_code).join(', ')}
														</div>
													</TableCell>
													<TableCell>
														{r.last_email_status === 'FAILED' && r.pending_count > 0 ? (
															<Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200" title={r.last_email_error || ''}>
																<XCircle className="h-3.5 w-3.5 mr-1" />
																Failed {r.last_email_at ? formatIst(r.last_email_at) : ''}
															</Badge>
														) : r.pending_count === 0 ? (
															<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
																<CheckCircle2 className="h-3.5 w-3.5 mr-1" />
																Sent {r.last_sent_at ? formatIst(r.last_sent_at) : ''}
															</Badge>
														) : r.sent_count > 0 ? (
															<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
																<AlertTriangle className="h-3.5 w-3.5 mr-1" />
																{r.pending_count} of {r.assignments.length} not sent
															</Badge>
														) : (
															<Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
																<Clock className="h-3.5 w-3.5 mr-1" />
																Not sent
															</Badge>
														)}
													</TableCell>
													<TableCell className="text-right">
														<Button
															variant="ghost"
															size="sm"
															className="h-7 text-xs"
															onClick={() => window.open(previewUrl(r.examiner_id), '_blank', 'noopener')}
															title="The combined order PDF exactly as it would be attached"
														>
															<Eye className="h-3.5 w-3.5 mr-1" />
															Order PDF
														</Button>
													</TableCell>
												</TableRow>
												{open && (
													<TableRow key={`${r.examiner_id}-detail`} className="bg-slate-50/60 hover:bg-slate-50/60">
														<TableCell />
														<TableCell />
														<TableCell colSpan={4} className="py-2">
															<div className="divide-y rounded-md border bg-white">
																{r.assignments.map(a => (
																	<div key={a.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
																		<div className="min-w-0">
																			<span className="font-medium">{a.course_code}</span>
																			{a.set_label && <span className="text-xs text-muted-foreground"> (Set {a.set_label})</span>}
																			<span className="text-muted-foreground"> — {a.subject_title}</span>
																			<div className="text-xs text-muted-foreground">
																				{[a.program_code, a.semester ? `Sem ${a.semester}` : null, QP_ASSIGNMENT_TYPE_LABELS[(a.assignment_type as QpAssignmentType) || 'question_paper'], a.order_ref_no]
																					.filter(Boolean)
																					.join(' · ')}
																				{' · '}closes {formatIst(a.valid_to)}
																			</div>
																		</div>
																		<div className="text-xs shrink-0">
																			{a.order_email_sent_at ? (
																				<span className="text-emerald-700">Sent {formatIst(a.order_email_sent_at)}</span>
																			) : (
																				<span className="text-amber-700">Not sent</span>
																			)}
																		</div>
																	</div>
																))}
															</div>
														</TableCell>
													</TableRow>
												)}
											</>
										)
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Confirm */}
			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>E-mail the examiner orders?</DialogTitle>
						<DialogDescription>
							{selectedRows.length} examiner{selectedRows.length === 1 ? '' : 's'}, {selectedPapers} paper{selectedPapers === 1 ? '' : 's'} in total.
							Each examiner receives one e-mail with one order PDF listing every paper they hold in {session.session_name || 'this session'}.
							{resendCount > 0 && (
								<>
									{' '}
									{resendCount} of them already had the order sent — they will receive it again.
								</>
							)}
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-48 overflow-y-auto rounded-md border divide-y text-sm">
						{selectedRows.map(r => (
							<div key={r.examiner_id} className="px-3 py-1.5 flex justify-between gap-3">
								<span className="truncate">
									{r.full_name} <span className="text-muted-foreground">· {r.email}</span>
								</span>
								<span className="text-xs text-muted-foreground shrink-0">{r.assignments.map(a => a.course_code).join(', ')}</span>
							</div>
						))}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
						<Button onClick={send}>
							<Send className="h-4 w-4 mr-1.5" />
							Send {selectedRows.length} e-mail{selectedRows.length === 1 ? '' : 's'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Progress / results */}
			<Dialog open={!!progress} onOpenChange={o => !o && !sending && setProgress(null)}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>{sending ? 'Sending examiner orders…' : 'Examiner orders sent'}</DialogTitle>
						<DialogDescription>
							{progress ? `${progress.done} of ${progress.total} processed` : ''}
							{progress && !sending && (
								<>
									{' · '}
									<span className="text-emerald-700">{progress.results.filter(r => r.ok).length} sent</span>
									{progress.results.some(r => !r.ok) && (
										<>
											{' · '}
											<span className="text-rose-700">{progress.results.filter(r => !r.ok).length} failed</span>
										</>
									)}
								</>
							)}
						</DialogDescription>
					</DialogHeader>
					{progress && <Progress value={Math.round((progress.done / Math.max(progress.total, 1)) * 100)} />}
					<div className="max-h-64 overflow-y-auto rounded-md border divide-y text-sm">
						{progress?.results.map(r => (
							<div key={r.examiner_id} className="px-3 py-1.5 flex items-start justify-between gap-3">
								<span className="truncate">
									{nameById(r.examiner_id)}
									{r.to && <span className="text-muted-foreground"> · {r.to}</span>}
								</span>
								{r.ok ? (
									<span className="text-emerald-700 text-xs flex items-center gap-1 shrink-0">
										<CheckCircle2 className="h-3.5 w-3.5" /> sent
									</span>
								) : (
									<span className="text-rose-700 text-xs text-right max-w-[240px]">{r.error}</span>
								)}
							</div>
						))}
						{sending && progress && progress.done < progress.total && (
							<div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
								<Loader2 className="h-3.5 w-3.5 animate-spin" /> working through the list…
							</div>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setProgress(null)} disabled={sending}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
