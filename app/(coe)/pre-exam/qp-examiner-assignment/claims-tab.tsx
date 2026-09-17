'use client'

// Claims — the examiner claim report and the claim forms, for the CoE office.
//
// One row per examiner, because one claim form covers every paper an examiner
// claimed in the session. From here the office opens a single claim form,
// downloads many of them at once (a ZIP, one PDF per examiner) and takes the
// Examiner Claim Report as an Excel workbook for payment.

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
	Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2, RefreshCw, Search, Download, FileSpreadsheet, Eye, ChevronDown, ChevronRight,
	CheckCircle2, Clock, XCircle, FileArchive, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst } from '@/lib/qp-portal/ist'
import { QP_CLAIM_STATUS_LABELS, type QpClaimStatus } from '@/types/qp-examiner-assignment'
import { apiFetch, KindBadge, type SessionOpt } from './shared'

interface Props {
	institutionsId: string
	session: SessionOpt | null
	refreshKey?: number
}

interface PaperLite {
	id: string
	course_code: string | null
	subject_title: string | null
	set_label: string | null
	semester: number | null
	program_code: string | null
	work: string
	status: string
	submitted_at: string | null
	order_ref_no: string | null
	amount: number
	claim_status: QpClaimStatus
	claim_submitted_at: string | null
	claim_version: number
	claim_reopened_at: string | null
}

interface ExaminerRow {
	examiner_id: string
	full_name: string
	email: string | null
	mobile: string | null
	kind: 'internal' | 'external'
	designation: string | null
	department: string | null
	institution_name: string | null
	papers: PaperLite[]
	claimed_count: number
	awaiting_count: number
	claimed_amount: number
	last_claimed_at: string | null
	bank: {
		account_holder: string | null
		bank_name: string | null
		account_number: string | null
		branch: string | null
		ifsc: string | null
	} | null
}

type Filter = 'claimed' | 'awaiting' | 'all'

const CLAIMED: QpClaimStatus[] = ['submitted', 'approved', 'paid']
const rupees = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`
// The list shows the account's tail only; the full number is on the form and the report.
const maskAccount = (v: string | null | undefined) => (v ? `••••${String(v).slice(-4)}` : '—')

function saveBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	a.remove()
	setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function filenameOf(res: Response, fallback: string): string {
	const m = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') || '')
	return m?.[1] || fallback
}

async function failureOf(res: Response): Promise<string> {
	const text = await res.text().catch(() => '')
	try {
		return JSON.parse(text).error || `HTTP ${res.status}`
	} catch {
		return text.slice(0, 200) || `HTTP ${res.status}`
	}
}

export function ClaimsTab({ institutionsId, session, refreshKey }: Props) {
	const { toast } = useToast()
	const [rows, setRows] = useState<ExaminerRow[]>([])
	const [summary, setSummary] = useState<any>(null)
	const [loading, setLoading] = useState(false)
	const [filter, setFilter] = useState<Filter>('claimed')
	const [search, setSearch] = useState('')
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [reporting, setReporting] = useState(false)
	const [bulk, setBulk] = useState<{ total: number; done: number; failed: { name: string; error: string }[]; running: boolean } | null>(null)

	const scopeQs = useCallback(
		(extra: Record<string, string> = {}) =>
			new URLSearchParams({ institutions_id: institutionsId, examination_session_id: session?.id || '', ...extra }),
		[institutionsId, session?.id]
	)

	const load = useCallback(async () => {
		if (!institutionsId || !session?.id) {
			setRows([])
			setSummary(null)
			return
		}
		setLoading(true)
		try {
			const json = await apiFetch(`/api/pre-exam/qp-examiner-assignments/claims?${scopeQs()}`)
			setRows(json.data || [])
			setSummary(json.summary || null)
		} catch (e: any) {
			toast({ title: 'Could not load claims', description: e.message, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [institutionsId, session?.id, scopeQs, toast])

	useEffect(() => {
		load()
		setSelected(new Set())
	}, [load, refreshKey])

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		return rows.filter(r => {
			if (filter === 'claimed' && r.claimed_count === 0) return false
			if (filter === 'awaiting' && r.awaiting_count === 0) return false
			if (
				q &&
				!`${r.full_name} ${r.email || ''} ${r.institution_name || ''} ${r.papers.map(p => `${p.course_code} ${p.subject_title}`).join(' ')}`
					.toLowerCase()
					.includes(q)
			)
				return false
			return true
		})
	}, [rows, filter, search])

	// Only an examiner with a submitted claim has a form to download.
	const selectable = visible.filter(r => r.claimed_count > 0)
	const allVisibleSelected = selectable.length > 0 && selectable.every(r => selected.has(r.examiner_id))
	const toggleAll = () =>
		setSelected(prev => {
			const next = new Set(prev)
			if (allVisibleSelected) selectable.forEach(r => next.delete(r.examiner_id))
			else selectable.forEach(r => next.add(r.examiner_id))
			return next
		})
	const toggle = (id: string) =>
		setSelected(prev => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const selectedRows = rows.filter(r => selected.has(r.examiner_id) && r.claimed_count > 0)

	const pdfUrl = (examinerId: string, download = false) =>
		`/api/pre-exam/qp-examiner-assignments/claims/pdf?${scopeQs({ examiner_id: examinerId, ...(download ? { download: '1' } : {}) })}`

	const downloadReport = async (scope: 'claimed' | 'all') => {
		setReporting(true)
		try {
			const extra: Record<string, string> = { format: 'xlsx', scope }
			if (selectedRows.length > 0) extra.examiner_ids = selectedRows.map(r => r.examiner_id).join(',')
			const res = await fetch(`/api/pre-exam/qp-examiner-assignments/claims?${scopeQs(extra)}`)
			if (!res.ok) throw new Error(await failureOf(res))
			saveBlob(await res.blob(), filenameOf(res, 'ExaminerClaimReport.xlsx'))
		} catch (e: any) {
			toast({ title: 'Report not downloaded', description: e.message, variant: 'destructive' })
		} finally {
			setReporting(false)
		}
	}

	// One PDF per examiner, fetched one at a time (each is a Chromium render) and
	// zipped in the browser, so no single request has to outlive the whole batch.
	const downloadForms = async () => {
		const targets = selectedRows
		if (targets.length === 0) return
		if (targets.length === 1) {
			window.open(pdfUrl(targets[0].examiner_id, true), '_blank', 'noopener')
			return
		}
		const failed: { name: string; error: string }[] = []
		setBulk({ total: targets.length, done: 0, failed, running: true })
		try {
			const JSZip = (await import('jszip')).default
			const zip = new JSZip()
			const used = new Set<string>()
			for (let i = 0; i < targets.length; i++) {
				const t = targets[i]
				try {
					const res = await fetch(pdfUrl(t.examiner_id, true))
					if (!res.ok) throw new Error(await failureOf(res))
					let name = filenameOf(res, `ClaimForm_${t.full_name}.pdf`)
					if (used.has(name)) name = name.replace(/\.pdf$/i, `_${i + 1}.pdf`)
					used.add(name)
					zip.file(name, await res.arrayBuffer())
				} catch (e: any) {
					failed.push({ name: t.full_name, error: e?.message || 'failed' })
				}
				setBulk({ total: targets.length, done: i + 1, failed: [...failed], running: true })
			}
			if (used.size > 0) {
				const blob = await zip.generateAsync({ type: 'blob' })
				saveBlob(blob, `ClaimForms_${(session?.session_code || 'session').replace(/[^A-Za-z0-9_-]+/g, '_')}.zip`)
			}
			if (failed.length === 0) {
				toast({ title: 'Claim forms downloaded', description: `${used.size} claim forms in one ZIP.` })
				setBulk(null)
			} else {
				setBulk({ total: targets.length, done: targets.length, failed: [...failed], running: false })
			}
		} catch (e: any) {
			toast({ title: 'Download failed', description: e.message, variant: 'destructive' })
			setBulk(null)
		}
	}

	if (!session?.id) {
		return (
			<Card>
				<CardContent className="p-10 text-center text-sm text-muted-foreground">
					Select an examination session to see examiner claims.
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="space-y-4">
			{/* Summary */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
				{[
					{ label: 'Examiners claimed', value: summary ? `${summary.claimed_examiners} / ${summary.examiners}` : '—', tone: 'text-slate-700' },
					{ label: 'Papers claimed', value: summary?.claimed_papers ?? '—', tone: 'text-emerald-700' },
					{ label: 'Submitted, claim awaited', value: summary?.awaiting_papers ?? '—', tone: 'text-amber-700' },
					{ label: 'Amount claimed', value: summary ? rupees(summary.claimed_amount) : '—', tone: 'text-slate-700' },
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
				<CardContent className="p-3 space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<div className="inline-flex rounded-md border overflow-hidden">
							{(
								[
									['claimed', 'Claimed'],
									['awaiting', 'Claim awaited'],
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
								placeholder="Examiner, college, course code or title…"
								className="h-9 pl-8"
							/>
						</div>
						<Button variant="outline" size="sm" onClick={load} disabled={loading}>
							<RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
							Refresh
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => downloadReport(filter === 'claimed' ? 'claimed' : 'all')}
							disabled={reporting || rows.length === 0}
							title={
								filter === 'claimed'
									? 'Claimed papers only, with the bank account to pay'
									: 'Every appointment in the session, claimed or not'
							}
						>
							{reporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}
							Claim report (Excel)
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								const extra: Record<string, string> = { format: 'pdf' }
								if (selectedRows.length > 0) extra.examiner_ids = selectedRows.map(r => r.examiner_id).join(',')
								window.open(`/api/pre-exam/qp-examiner-assignments/claims?${scopeQs(extra)}`, '_blank', 'noopener')
							}}
							disabled={!rows.some(r => r.claimed_count > 0)}
							title="Every claim of the session on one statement, with the bank details and the question paper / answer key split"
						>
							<FileText className="h-4 w-4 mr-1.5" />
							Consolidated report (PDF)
						</Button>
						<Button size="sm" onClick={downloadForms} disabled={selectedRows.length === 0 || !!bulk?.running}>
							{selectedRows.length > 1 ? <FileArchive className="h-4 w-4 mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
							Download {selectedRows.length || ''} claim form{selectedRows.length === 1 ? '' : 's'}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						One claim form per examiner — it lists every paper they claimed in this session.
						{selectedRows.length > 0
							? ` The reports cover the ${selectedRows.length} selected examiner${selectedRows.length === 1 ? '' : 's'}.`
							: ' With nothing selected, the reports cover everyone.'}
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
							{rows.length === 0
								? 'No live appointments in this session.'
								: filter === 'claimed'
									? 'No examiner has submitted a claim yet.'
									: 'Nothing matches this filter.'}
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
										<TableHead className="text-right">Amount</TableHead>
										<TableHead>Bank account</TableHead>
										<TableHead>Claim</TableHead>
										<TableHead className="text-right">Claim form</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{visible.map(r => {
										const open = expanded.has(r.examiner_id)
										const hasClaim = r.claimed_count > 0
										return (
											<Fragment key={r.examiner_id}>
												<TableRow className={cn(selected.has(r.examiner_id) && 'bg-emerald-50/40')}>
													<TableCell>
														<Checkbox
															checked={selected.has(r.examiner_id)}
															onCheckedChange={() => toggle(r.examiner_id)}
															disabled={!hasClaim}
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
															{[r.designation, r.institution_name, r.mobile].filter(Boolean).join(' · ') || r.email || '—'}
														</div>
													</TableCell>
													<TableCell>
														<div className="text-sm">
															{r.claimed_count} of {r.papers.length} claimed
														</div>
														<div className="text-xs text-muted-foreground truncate max-w-[240px]">
															{r.papers.map(p => p.course_code).join(', ')}
														</div>
													</TableCell>
													<TableCell className="text-right font-medium tabular-nums">
														{hasClaim ? rupees(r.claimed_amount) : '—'}
													</TableCell>
													<TableCell>
														{r.bank ? (
															<>
																<div className="text-sm">{r.bank.bank_name || '—'}</div>
																<div className="text-xs text-muted-foreground">
																	{maskAccount(r.bank.account_number)} · {r.bank.ifsc || '—'}
																</div>
															</>
														) : (
															<span className="text-xs text-muted-foreground">—</span>
														)}
													</TableCell>
													<TableCell>
														{hasClaim ? (
															<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
																<CheckCircle2 className="h-3.5 w-3.5 mr-1" />
																{r.last_claimed_at ? formatIst(r.last_claimed_at, false) : 'Claimed'}
															</Badge>
														) : r.awaiting_count > 0 ? (
															<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
																<Clock className="h-3.5 w-3.5 mr-1" />
																Claim awaited
															</Badge>
														) : (
															<Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
																Paper not submitted
															</Badge>
														)}
													</TableCell>
													<TableCell className="text-right whitespace-nowrap">
														<Button
															variant="ghost"
															size="sm"
															className="h-7 text-xs"
															disabled={!hasClaim}
															onClick={() => window.open(pdfUrl(r.examiner_id), '_blank', 'noopener')}
														>
															<Eye className="h-3.5 w-3.5 mr-1" />
															View
														</Button>
														<Button
															variant="ghost"
															size="sm"
															className="h-7 text-xs"
															disabled={!hasClaim}
															onClick={() => window.open(pdfUrl(r.examiner_id, true), '_blank', 'noopener')}
														>
															<Download className="h-3.5 w-3.5 mr-1" />
															PDF
														</Button>
													</TableCell>
												</TableRow>
												{open && (
													<TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
														<TableCell />
														<TableCell />
														<TableCell colSpan={6} className="py-2">
															<div className="divide-y rounded-md border bg-white">
																{r.papers.map(p => (
																	<div key={p.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
																		<div className="min-w-0">
																			<span className="font-medium">{p.course_code}</span>
																			{p.set_label && <span className="text-xs text-muted-foreground"> (Set {p.set_label})</span>}
																			<span className="text-muted-foreground"> — {p.subject_title}</span>
																			<div className="text-xs text-muted-foreground">
																				{[p.program_code, p.semester ? `Sem ${p.semester}` : null, p.work, p.order_ref_no]
																					.filter(Boolean)
																					.join(' · ')}
																			</div>
																		</div>
																		<div className="text-xs text-right shrink-0">
																			<div className="font-medium tabular-nums">{rupees(p.amount)}</div>
																			{CLAIMED.includes(p.claim_status) ? (
																				<span className="text-emerald-700">
																					{QP_CLAIM_STATUS_LABELS[p.claim_status]}
																					{p.claim_version > 1 ? ` (V${p.claim_version})` : ''}
																					{p.claim_submitted_at ? ` · ${formatIst(p.claim_submitted_at, false)}` : ''}
																				</span>
																			) : p.claim_reopened_at ? (
																				<span className="text-amber-700">Claim reopened — resubmission awaited</span>
																			) : ['submitted', 'accepted'].includes(p.status) ? (
																				<span className="text-amber-700">Paper submitted — claim awaited</span>
																			) : (
																				<span className="text-muted-foreground">Paper not submitted</span>
																			)}
																		</div>
																	</div>
																))}
															</div>
															{r.bank && (
																<p className="mt-2 text-xs text-muted-foreground">
																	Pay to: {r.bank.account_holder || '—'} · {r.bank.bank_name || '—'}
																	{r.bank.branch ? `, ${r.bank.branch}` : ''} · A/c {r.bank.account_number || '—'} · IFSC {r.bank.ifsc || '—'}
																</p>
															)}
														</TableCell>
													</TableRow>
												)}
											</Fragment>
										)
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Bulk download progress */}
			<Dialog open={!!bulk} onOpenChange={o => !o && !bulk?.running && setBulk(null)}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>{bulk?.running ? 'Preparing claim forms…' : 'Claim forms downloaded'}</DialogTitle>
						<DialogDescription>
							{bulk ? `${bulk.done} of ${bulk.total} prepared` : ''}
							{bulk && bulk.failed.length > 0 && (
								<span className="text-rose-700"> · {bulk.failed.length} failed</span>
							)}
						</DialogDescription>
					</DialogHeader>
					{bulk && <Progress value={Math.round((bulk.done / Math.max(bulk.total, 1)) * 100)} />}
					{bulk && bulk.failed.length > 0 && (
						<div className="max-h-48 overflow-y-auto rounded-md border divide-y text-sm">
							{bulk.failed.map(f => (
								<div key={f.name} className="px-3 py-1.5 flex items-start justify-between gap-3">
									<span className="truncate flex items-center gap-1.5">
										<XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
										{f.name}
									</span>
									<span className="text-rose-700 text-xs text-right max-w-[240px]">{f.error}</span>
								</div>
							))}
						</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={() => setBulk(null)} disabled={bulk?.running}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
