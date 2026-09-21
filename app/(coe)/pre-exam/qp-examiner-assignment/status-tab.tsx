'use client'

// Status Report — where every appointment stands, for following up examiners.
//
// One row per appointment with the examiner's contact details and the stage it
// has reached: order not sent → not logged in → paper not opened → not started
// → entering questions → complete, waiting to submit → submitted, claim awaited
// → completed. The stage cards filter the list; from a filtered list the office
// calls the examiner, re-sends the order e-mail, or takes the list as Excel.

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
import { Loader2, RefreshCw, Search, FileSpreadsheet, Send, Phone, Mail, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst } from '@/lib/qp-portal/ist'
import { apiFetch, KindBadge, type SessionOpt } from './shared'

interface Props {
	institutionsId: string
	session: SessionOpt | null
	refreshKey?: number
}

type Stage =
	| 'order_not_sent' | 'not_logged_in' | 'not_opened' | 'not_started' | 'drafting'
	| 'ready_to_submit' | 'returned' | 'claim_pending' | 'completed'

interface StageInfo {
	key: Stage
	label: string
	action: string
	papers: number
	examiners: number
}

interface Row {
	id: string
	examiner_id: string
	examiner_name: string
	examiner_kind: 'internal' | 'external'
	email: string | null
	mobile: string | null
	designation: string | null
	department: string | null
	institution_name: string | null
	course_code: string | null
	subject_title: string | null
	set_label: string | null
	program_code: string | null
	semester: number | null
	stage: Stage
	stage_label: string
	action: string
	question_done: number
	question_total: number
	key_done: number
	key_required: boolean
	order_email_sent_at: string | null
	last_login_at: string | null
	last_saved_at: string | null
	submitted_at: string | null
	valid_to: string
	window_state: string
	days_left: number
}

const STAGE_TONE: Record<Stage, string> = {
	order_not_sent: 'bg-slate-100 text-slate-700 border-slate-300',
	not_logged_in: 'bg-rose-50 text-rose-700 border-rose-200',
	not_opened: 'bg-rose-50 text-rose-700 border-rose-200',
	not_started: 'bg-orange-50 text-orange-700 border-orange-200',
	drafting: 'bg-blue-50 text-blue-700 border-blue-200',
	ready_to_submit: 'bg-amber-50 text-amber-800 border-amber-300',
	returned: 'bg-orange-50 text-orange-700 border-orange-200',
	claim_pending: 'bg-violet-50 text-violet-700 border-violet-200',
	completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/** Stages where the examiner still owes something. */
const PENDING: Stage[] = ['order_not_sent', 'not_logged_in', 'not_opened', 'not_started', 'drafting', 'ready_to_submit', 'returned', 'claim_pending']

const MAIL_PAGE = 20

export function StatusTab({ institutionsId, session, refreshKey }: Props) {
	const { toast } = useToast()
	const [rows, setRows] = useState<Row[]>([])
	const [stages, setStages] = useState<StageInfo[]>([])
	const [loading, setLoading] = useState(false)
	const [stage, setStage] = useState<Stage | 'all' | 'pending'>('pending')
	const [search, setSearch] = useState('')
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [exporting, setExporting] = useState(false)

	const [mailOpen, setMailOpen] = useState(false)
	const [message, setMessage] = useState('')
	const [progress, setProgress] = useState<{ total: number; done: number; sent: number; failed: { name: string; error: string }[]; running: boolean } | null>(null)

	const qs = useCallback(
		(extra: Record<string, string> = {}) =>
			new URLSearchParams({ institutions_id: institutionsId, examination_session_id: session?.id || '', ...extra }),
		[institutionsId, session?.id]
	)

	const load = useCallback(async () => {
		if (!institutionsId || !session?.id) {
			setRows([])
			setStages([])
			return
		}
		setLoading(true)
		try {
			const json = await apiFetch(`/api/pre-exam/qp-examiner-assignments/status-report?${qs()}`)
			setRows(json.data || [])
			setStages(json.stages || [])
		} catch (e: any) {
			toast({ title: 'Could not load the status report', description: e.message, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [institutionsId, session?.id, qs, toast])

	useEffect(() => {
		load()
		setSelected(new Set())
	}, [load, refreshKey])

	const stageOrder = useMemo(() => new Map(stages.map((s, i) => [s.key, i])), [stages])

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		return rows
			.filter(r => {
				if (stage === 'pending' && !PENDING.includes(r.stage)) return false
				if (stage !== 'all' && stage !== 'pending' && r.stage !== stage) return false
				if (
					q &&
					!`${r.examiner_name} ${r.email || ''} ${r.mobile || ''} ${r.institution_name || ''} ${r.course_code} ${r.subject_title}`
						.toLowerCase()
						.includes(q)
				)
					return false
				return true
			})
			.sort(
				(a, b) =>
					(stageOrder.get(a.stage) ?? 0) - (stageOrder.get(b.stage) ?? 0) ||
					a.days_left - b.days_left ||
					a.examiner_name.localeCompare(b.examiner_name)
			)
	}, [rows, stage, search, stageOrder])

	const allSelected = visible.length > 0 && visible.every(r => selected.has(r.id))
	const toggleAll = () =>
		setSelected(prev => {
			const next = new Set(prev)
			if (allSelected) visible.forEach(r => next.delete(r.id))
			else visible.forEach(r => next.add(r.id))
			return next
		})
	const toggle = (id: string) =>
		setSelected(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	// The e-mail goes per EXAMINER (one combined order for all their papers).
	const selectedExaminers = useMemo(() => {
		const map = new Map<string, Row>()
		for (const r of rows) if (selected.has(r.id) && r.email && !map.has(r.examiner_id)) map.set(r.examiner_id, r)
		return [...map.values()]
	}, [rows, selected])

	const exportExcel = async () => {
		setExporting(true)
		try {
			const extra: Record<string, string> = { format: 'xlsx' }
			if (stage === 'pending') extra.stage = PENDING.join(',')
			else if (stage !== 'all') extra.stage = stage
			const res = await fetch(`/api/pre-exam/qp-examiner-assignments/status-report?${qs(extra)}`)
			if (!res.ok) {
				const j = await res.json().catch(() => ({}))
				throw new Error(j.error || `HTTP ${res.status}`)
			}
			const m = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') || '')
			const url = URL.createObjectURL(await res.blob())
			const a = document.createElement('a')
			a.href = url
			a.download = m?.[1] || 'ExaminerStatusReport.xlsx'
			document.body.appendChild(a)
			a.click()
			a.remove()
			setTimeout(() => URL.revokeObjectURL(url), 2000)
		} catch (e: any) {
			toast({ title: 'Report not downloaded', description: e.message, variant: 'destructive' })
		} finally {
			setExporting(false)
		}
	}

	const sendMails = async () => {
		if (!session?.id || selectedExaminers.length === 0) return
		setMailOpen(false)
		const targets = selectedExaminers
		const failed: { name: string; error: string }[] = []
		let sent = 0
		setProgress({ total: targets.length, done: 0, sent: 0, failed, running: true })
		for (let i = 0; i < targets.length; i += MAIL_PAGE) {
			const page = targets.slice(i, i + MAIL_PAGE)
			try {
				const json = await apiFetch('/api/pre-exam/qp-examiner-assignments/email/send', {
					method: 'POST',
					body: JSON.stringify({
						institutions_id: institutionsId,
						examination_session_id: session.id,
						examiner_ids: page.map(p => p.examiner_id),
						custom_message: message.trim() || undefined,
					}),
				})
				for (const r of (json.results || []) as any[]) {
					if (r.ok) sent++
					else failed.push({ name: page.find(p => p.examiner_id === r.examiner_id)?.examiner_name || r.examiner_id, error: r.error || 'failed' })
				}
			} catch (e: any) {
				for (const p of page) failed.push({ name: p.examiner_name, error: e?.message || 'request failed' })
			}
			setProgress({ total: targets.length, done: Math.min(i + MAIL_PAGE, targets.length), sent, failed: [...failed], running: true })
		}
		setProgress({ total: targets.length, done: targets.length, sent, failed: [...failed], running: false })
		if (sent > 0) toast({ title: 'Order e-mail re-sent', description: `${sent} examiner${sent === 1 ? '' : 's'} e-mailed.` })
		setSelected(new Set())
		load()
	}

	if (!session?.id) {
		return (
			<Card>
				<CardContent className="p-10 text-center text-sm text-muted-foreground">
					Select an examination session to see the examiner status report.
				</CardContent>
			</Card>
		)
	}

	const pendingCount = rows.filter(r => PENDING.includes(r.stage)).length

	return (
		<div className="space-y-4">
			{/* Stage cards — click to filter */}
			<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
				{[
					{ key: 'pending' as const, label: 'Needs follow-up', papers: pendingCount, examiners: new Set(rows.filter(r => PENDING.includes(r.stage)).map(r => r.examiner_id)).size },
					...stages,
				].map(s => (
					<button
						key={s.key}
						type="button"
						onClick={() => {
							setStage(s.key)
							setSelected(new Set())
						}}
						className={cn(
							'text-left rounded-lg border bg-white p-3 transition hover:shadow-sm',
							stage === s.key ? 'ring-2 ring-slate-800 border-slate-800' : 'border-slate-200'
						)}
					>
						<p className="text-2xl font-semibold leading-none">{loading && rows.length === 0 ? '—' : s.papers}</p>
						<p className="text-xs font-medium text-slate-700 mt-1.5 leading-tight">{s.label}</p>
						<p className="text-[11px] text-muted-foreground mt-0.5">
							{s.examiners} examiner{s.examiners === 1 ? '' : 's'}
						</p>
					</button>
				))}
			</div>

			{/* Toolbar */}
			<Card>
				<CardContent className="p-3 space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<Button variant={stage === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStage('all')}>
							All ({rows.length})
						</Button>
						<div className="relative flex-1 min-w-[220px]">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								value={search}
								onChange={e => setSearch(e.target.value)}
								placeholder="Examiner, mobile, e-mail, college, course code or title…"
								className="h-9 pl-8"
							/>
						</div>
						<Button variant="outline" size="sm" onClick={load} disabled={loading}>
							<RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
							Refresh
						</Button>
						<Button variant="outline" size="sm" onClick={exportExcel} disabled={exporting || rows.length === 0}>
							{exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}
							Status report (Excel)
						</Button>
						<Button size="sm" onClick={() => setMailOpen(true)} disabled={selectedExaminers.length === 0 || !!progress?.running}>
							<Send className="h-4 w-4 mr-1.5" />
							Re-send order e-mail to {selectedExaminers.length || ''} examiner{selectedExaminers.length === 1 ? '' : 's'}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Click a card to list that stage. The Excel report follows the stage shown. The e-mail is one per examiner and carries the
						order for all their papers, with your reminder message on top.
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
							{rows.length === 0 ? 'No live appointments in this session.' : 'No appointment is at this stage.'}
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-10">
											<Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
										</TableHead>
										<TableHead>Examiner</TableHead>
										<TableHead>Contact</TableHead>
										<TableHead>Subject</TableHead>
										<TableHead>Current status</TableHead>
										<TableHead>Progress</TableHead>
										<TableHead>Last activity</TableHead>
										<TableHead>Closes</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{visible.map(r => {
										const owes = PENDING.includes(r.stage) && r.stage !== 'claim_pending'
										const urgent = owes && r.days_left <= 3
										return (
											<TableRow key={r.id} className={cn(selected.has(r.id) && 'bg-emerald-50/40')}>
												<TableCell>
													<Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.examiner_name}`} />
												</TableCell>
												<TableCell>
													<div className="font-medium flex items-center gap-2">
														{r.examiner_name}
														<KindBadge kind={r.examiner_kind} />
													</div>
													<div className="text-xs text-muted-foreground max-w-[240px]">
														{[r.designation, r.department, r.institution_name].filter(Boolean).join(' · ') || '—'}
													</div>
												</TableCell>
												<TableCell className="text-xs">
													{r.mobile ? (
														<a href={`tel:${r.mobile}`} className="flex items-center gap-1 font-medium text-slate-800 hover:underline">
															<Phone className="h-3 w-3" /> {r.mobile}
														</a>
													) : (
														<span className="text-rose-600">no mobile</span>
													)}
													{r.email ? (
														<a href={`mailto:${r.email}`} className="flex items-center gap-1 text-muted-foreground hover:underline mt-0.5">
															<Mail className="h-3 w-3" /> {r.email}
														</a>
													) : (
														<span className="text-rose-600">no e-mail</span>
													)}
												</TableCell>
												<TableCell>
													<div className="font-medium text-sm">
														{r.course_code}
														{r.set_label && <span className="text-xs text-muted-foreground font-normal"> · Set {r.set_label}</span>}
													</div>
													<div className="text-xs text-muted-foreground max-w-[220px] truncate">{r.subject_title}</div>
												</TableCell>
												<TableCell>
													<Badge variant="outline" className={cn('font-medium whitespace-normal text-left', STAGE_TONE[r.stage])}>
														{r.stage_label}
													</Badge>
													{r.action !== '—' && <div className="text-[11px] text-muted-foreground mt-1">{r.action}</div>}
												</TableCell>
												<TableCell className="text-xs tabular-nums min-w-[90px]">
													<div>{r.question_done} / {r.question_total}</div>
													<Progress value={r.question_total ? Math.round((r.question_done / r.question_total) * 100) : 0} className="h-1.5 mt-1" />
													{r.key_required && <div className="text-[11px] text-muted-foreground mt-1">key {r.key_done} / {r.question_total}</div>}
												</TableCell>
												<TableCell className="text-xs whitespace-nowrap">
													{r.submitted_at ? (
														<div>Submitted {formatIst(r.submitted_at, false)}</div>
													) : r.last_saved_at ? (
														<div>Saved {formatIst(r.last_saved_at, false)}</div>
													) : r.last_login_at ? (
														<div>Login {formatIst(r.last_login_at, false)}</div>
													) : (
														<div className="text-rose-600">Never logged in</div>
													)}
													<div className="text-[11px] text-muted-foreground">
														{r.order_email_sent_at ? `Mailed ${formatIst(r.order_email_sent_at, false)}` : 'Order not mailed'}
													</div>
												</TableCell>
												<TableCell className="text-xs whitespace-nowrap">
													<div>{formatIst(r.valid_to, false)}</div>
													{owes && (
														<div className={cn('text-[11px] flex items-center gap-1', urgent ? 'text-rose-600 font-medium' : 'text-muted-foreground')}>
															{urgent && <AlertTriangle className="h-3 w-3" />}
															{r.days_left < 0 ? 'Window closed' : r.days_left === 0 ? 'Closes today' : `${r.days_left} day${r.days_left === 1 ? '' : 's'} left`}
														</div>
													)}
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Confirm re-send */}
			<Dialog open={mailOpen} onOpenChange={setMailOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Re-send the order e-mail?</DialogTitle>
						<DialogDescription>
							{selectedExaminers.length} examiner{selectedExaminers.length === 1 ? '' : 's'} will receive their examiner order again, with
							the portal link and every paper they hold in {session.session_name || 'this session'}.
						</DialogDescription>
					</DialogHeader>
					<div>
						<Label htmlFor="remind_msg" className="text-xs">Reminder message — shown at the top of the e-mail</Label>
						<Textarea
							id="remind_msg"
							value={message}
							onChange={e => setMessage(e.target.value)}
							rows={3}
							placeholder="e.g. Gentle reminder: kindly sign in to the portal and submit the question paper before the closing date."
							className="mt-1"
						/>
					</div>
					<div className="max-h-40 overflow-y-auto rounded-md border divide-y text-sm">
						{selectedExaminers.map(r => (
							<div key={r.examiner_id} className="px-3 py-1.5 flex justify-between gap-3">
								<span className="truncate">{r.examiner_name}</span>
								<span className="text-xs text-muted-foreground shrink-0">{r.email}</span>
							</div>
						))}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setMailOpen(false)}>Cancel</Button>
						<Button onClick={sendMails}>
							<Send className="h-4 w-4 mr-1.5" />
							Send {selectedExaminers.length} e-mail{selectedExaminers.length === 1 ? '' : 's'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Send progress */}
			<Dialog open={!!progress} onOpenChange={o => !o && !progress?.running && setProgress(null)}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>{progress?.running ? 'Sending…' : 'E-mails sent'}</DialogTitle>
						<DialogDescription>
							{progress ? `${progress.done} of ${progress.total} processed · ${progress.sent} sent` : ''}
							{progress && progress.failed.length > 0 && <span className="text-rose-700"> · {progress.failed.length} failed</span>}
						</DialogDescription>
					</DialogHeader>
					{progress && <Progress value={Math.round((progress.done / Math.max(progress.total, 1)) * 100)} />}
					{progress && progress.failed.length > 0 && (
						<div className="max-h-48 overflow-y-auto rounded-md border divide-y text-sm">
							{progress.failed.map((f, i) => (
								<div key={`${f.name}-${i}`} className="px-3 py-1.5 flex items-start justify-between gap-3">
									<span className="truncate">{f.name}</span>
									<span className="text-rose-700 text-xs text-right max-w-[240px]">{f.error}</span>
								</div>
							))}
						</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={() => setProgress(null)} disabled={progress?.running}>Close</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
