'use client'

// Question Papers — the papers examiners have SUBMITTED, for download.
//
// A paper appears here only once its examiner has submitted it (or the CoE has
// accepted it); drafts stay out, so nothing half-written is ever printed. The
// office opens one paper, or selects many and takes them as a single ZIP — one
// file per paper, with the answer keys alongside when asked for.
//
// Every download — a single paper, a single key, the ZIP — comes in the format
// chosen on the toolbar: PDF (the document of record, fixed layout) or Word (the
// same paper as an editable .docx, for a last correction before printing).

import { useCallback, useEffect, useMemo, useState } from 'react'
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
	Loader2, RefreshCw, Search, Download, KeyRound, FileArchive, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatIst } from '@/lib/qp-portal/ist'
import { apiFetch, KindBadge, StatusBadge, type SessionOpt, type AssignmentRow } from './shared'

interface Props {
	institutionsId: string
	session: SessionOpt | null
	refreshKey?: number
}

type Filter = 'all' | 'submitted' | 'accepted'

/** What a download arrives as. */
type FileFormat = 'pdf' | 'docx'
const FORMAT_LABEL: Record<FileFormat, string> = { pdf: 'PDF', docx: 'Word' }

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
	const cd = res.headers.get('Content-Disposition') || ''
	const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd)
	if (star) {
		try {
			return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
		} catch {
			// fall through to the plain form
		}
	}
	const m = /filename="?([^";]+)"?/i.exec(cd)
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

const safe = (v: string) => v.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')

export function PapersTab({ institutionsId, session, refreshKey }: Props) {
	const { toast } = useToast()
	const [rows, setRows] = useState<AssignmentRow[]>([])
	const [loading, setLoading] = useState(false)
	const [filter, setFilter] = useState<Filter>('all')
	const [search, setSearch] = useState('')
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [withKeys, setWithKeys] = useState(false)
	const [format, setFormat] = useState<FileFormat>('pdf')
	const [bulk, setBulk] = useState<{ total: number; done: number; failed: { name: string; error: string }[]; running: boolean } | null>(null)

	const load = useCallback(async () => {
		if (!institutionsId || !session?.id) {
			setRows([])
			return
		}
		setLoading(true)
		try {
			const qs = new URLSearchParams({ institutions_id: institutionsId, examination_session_id: session.id })
			const json = await apiFetch(`/api/pre-exam/qp-examiner-assignments?${qs}`)
			// Submitted papers only — a draft is not a question paper yet.
			const list = ((json.data || []) as AssignmentRow[])
				.filter(r => ['submitted', 'accepted'].includes(r.status) && r.paper_id)
				.sort((a, b) => (a.course_code || '').localeCompare(b.course_code || '') || (a.set_label || '').localeCompare(b.set_label || ''))
			setRows(list)
		} catch (e: any) {
			toast({ title: 'Could not load question papers', description: e.message, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [institutionsId, session?.id, toast])

	useEffect(() => {
		load()
		setSelected(new Set())
	}, [load, refreshKey])

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		return rows.filter(r => {
			if (filter !== 'all' && r.status !== filter) return false
			if (
				q &&
				!`${r.course_code} ${r.subject_title} ${r.program_code || ''} ${r.examiner?.full_name || ''} ${r.order_ref_no || ''}`
					.toLowerCase()
					.includes(q)
			)
				return false
			return true
		})
	}, [rows, filter, search])

	const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.id))
	const toggleAll = () =>
		setSelected(prev => {
			const next = new Set(prev)
			if (allVisibleSelected) visible.forEach(r => next.delete(r.id))
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

	const selectedRows = rows.filter(r => selected.has(r.id))
	const keyCount = selectedRows.filter(r => r.answer_keyed).length

	// Same routes for both formats; Word is asked for with ?format=docx.
	const formatQs = format === 'docx' ? '?format=docx' : ''
	const paperUrl = (r: AssignmentRow) => `/api/pre-exam/ese-question-papers/${r.paper_id}/pdf${formatQs}`
	const keyUrl = (r: AssignmentRow) => `/api/pre-exam/ese-question-papers/${r.paper_id}/answer-key-pdf${formatQs}`
	const labelOf = (r: AssignmentRow) => `${r.course_code || 'paper'}${r.set_label ? ` (Set ${r.set_label})` : ''}`

	const downloadOne = async (r: AssignmentRow, kind: 'paper' | 'key') => {
		try {
			const res = await fetch(kind === 'paper' ? paperUrl(r) : keyUrl(r))
			if (!res.ok) throw new Error(await failureOf(res))
			saveBlob(await res.blob(), filenameOf(res, `${safe(labelOf(r))}${kind === 'key' ? '_AnswerKey' : ''}.${format}`))
		} catch (e: any) {
			toast({ title: 'Download failed', description: e.message, variant: 'destructive' })
		}
	}

	// Each PDF is a Chromium render, so files are fetched one at a time and zipped
	// in the browser — no single request has to outlive the whole batch. The Word
	// copies take the same path, in the format chosen on the toolbar.
	const downloadZip = async () => {
		const targets = selectedRows
		if (targets.length === 0) return
		const jobs: { row: AssignmentRow; kind: 'paper' | 'key' }[] = []
		for (const r of targets) {
			jobs.push({ row: r, kind: 'paper' })
			if (withKeys && r.answer_keyed) jobs.push({ row: r, kind: 'key' })
		}
		const failed: { name: string; error: string }[] = []
		setBulk({ total: jobs.length, done: 0, failed, running: true })
		try {
			const JSZip = (await import('jszip')).default
			const zip = new JSZip()
			const used = new Set<string>()
			for (let i = 0; i < jobs.length; i++) {
				const { row, kind } = jobs[i]
				const tag = `${labelOf(row)}${kind === 'key' ? ' — answer key' : ''}`
				try {
					const res = await fetch(kind === 'paper' ? paperUrl(row) : keyUrl(row))
					if (!res.ok) throw new Error(await failureOf(res))
					let name = filenameOf(res, `${safe(labelOf(row))}${kind === 'key' ? '_AnswerKey' : ''}.${format}`)
					// Two sets of one subject share a name: tell them apart before the extension.
					const tagged = (tag: string) => name.replace(/(\.[A-Za-z0-9]+)?$/, ext => `_${tag}${ext}`)
					if (used.has(name)) name = tagged(safe(row.examiner?.full_name || String(i + 1)))
					if (used.has(name)) name = tagged(String(i + 1))
					used.add(name)
					zip.file(kind === 'key' ? `Answer Keys/${name}` : withKeys ? `Question Papers/${name}` : name, await res.arrayBuffer())
				} catch (e: any) {
					failed.push({ name: tag, error: e?.message || 'failed' })
				}
				setBulk({ total: jobs.length, done: i + 1, failed: [...failed], running: true })
			}
			if (used.size > 0) {
				const blob = await zip.generateAsync({ type: 'blob' })
				saveBlob(blob, `QuestionPapers_${safe(session?.session_code || 'session')}${format === 'docx' ? '_Word' : ''}.zip`)
			}
			if (failed.length === 0) {
				toast({ title: 'Question papers downloaded', description: `${used.size} ${FORMAT_LABEL[format]} file${used.size === 1 ? '' : 's'} in one ZIP.` })
				setBulk(null)
			} else {
				setBulk({ total: jobs.length, done: jobs.length, failed: [...failed], running: false })
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
					Select an examination session to see the submitted question papers.
				</CardContent>
			</Card>
		)
	}

	const counts = {
		all: rows.length,
		submitted: rows.filter(r => r.status === 'submitted').length,
		accepted: rows.filter(r => r.status === 'accepted').length,
		keyed: rows.filter(r => r.answer_keyed).length,
	}

	return (
		<div className="space-y-4">
			{/* Summary */}
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
				{[
					{ label: 'Papers submitted', value: counts.all, tone: 'text-slate-700' },
					{ label: 'Awaiting review', value: counts.submitted, tone: 'text-amber-700' },
					{ label: 'Accepted', value: counts.accepted, tone: 'text-emerald-700' },
					{ label: 'With answer key', value: counts.keyed, tone: 'text-slate-700' },
				].map(s => (
					<Card key={s.label}>
						<CardContent className="p-3.5">
							<p className="text-xs text-muted-foreground">{s.label}</p>
							<p className={cn('text-2xl font-semibold mt-0.5', s.tone)}>{loading && rows.length === 0 ? '—' : s.value}</p>
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
									['all', 'All submitted'],
									['submitted', 'Awaiting review'],
									['accepted', 'Accepted'],
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
								placeholder="Course code, title, programme or examiner…"
								className="h-9 pl-8"
							/>
						</div>
						<Button variant="outline" size="sm" onClick={load} disabled={loading}>
							<RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
							Refresh
						</Button>
						{/* One format for every download on this tab: the row buttons and the ZIP. */}
						<div className="inline-flex items-center gap-1.5">
							<span className="text-xs text-muted-foreground">Download as</span>
							<div className="inline-flex rounded-md border overflow-hidden" role="radiogroup" aria-label="Download format">
								{(Object.keys(FORMAT_LABEL) as FileFormat[]).map(f => (
									<button
										key={f}
										type="button"
										role="radio"
										aria-checked={format === f}
										onClick={() => setFormat(f)}
										disabled={!!bulk?.running}
										title={
											f === 'pdf'
												? 'Fixed layout — the copy that is printed'
												: 'Editable Word document (.docx) — same fonts, sizes and alignment'
										}
										className={cn(
											'px-3 py-1.5 text-xs font-medium border-r last:border-r-0',
											format === f ? 'bg-emerald-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
										)}
									>
										{FORMAT_LABEL[f]}
									</button>
								))}
							</div>
						</div>
						<label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
							<Checkbox checked={withKeys} onCheckedChange={v => setWithKeys(v === true)} />
							Include answer keys
						</label>
						<Button size="sm" onClick={downloadZip} disabled={selectedRows.length === 0 || !!bulk?.running}>
							<FileArchive className="h-4 w-4 mr-1.5" />
							Download {selectedRows.length || ''} selected (ZIP)
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Only papers the examiner has submitted are listed. Tick the box in the header to select all, then download
						them as one ZIP — one {FORMAT_LABEL[format]} file per paper
						{withKeys && selectedRows.length > 0 ? `, plus ${keyCount} answer key${keyCount === 1 ? '' : 's'} in their own folder` : ''}.
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
							{rows.length === 0 ? 'No question paper has been submitted in this session yet.' : 'Nothing matches this filter.'}
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-10">
											<Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all" />
										</TableHead>
										<TableHead>Subject</TableHead>
										<TableHead>Examiner</TableHead>
										<TableHead>Submitted</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Questions</TableHead>
										<TableHead className="text-right">Download</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{visible.map(r => (
										<TableRow key={r.id} className={cn(selected.has(r.id) && 'bg-emerald-50/40')}>
											<TableCell>
												<Checkbox
													checked={selected.has(r.id)}
													onCheckedChange={() => toggle(r.id)}
													aria-label={`Select ${labelOf(r)}`}
												/>
											</TableCell>
											<TableCell>
												<div className="font-medium">
													{r.course_code}
													{r.set_label && <span className="text-xs text-muted-foreground font-normal"> · Set {r.set_label}</span>}
												</div>
												<div className="text-xs text-muted-foreground">{r.subject_title}</div>
												<div className="text-[11px] text-muted-foreground">
													{[r.program_code, r.semester ? `Sem ${r.semester}` : null, r.order_ref_no].filter(Boolean).join(' · ')}
												</div>
											</TableCell>
											<TableCell>
												<div className="text-sm flex items-center gap-2">
													{r.examiner?.full_name || '—'}
													<KindBadge kind={r.examiner_kind} />
												</div>
												<div className="text-xs text-muted-foreground">{r.examiner?.institution_name || r.examiner?.email || ''}</div>
											</TableCell>
											<TableCell className="text-xs whitespace-nowrap">
												{r.submitted_at ? formatIst(r.submitted_at, false) : '—'}
												{(r.paper_version || 0) > 1 && (
													<Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">V{r.paper_version}</Badge>
												)}
											</TableCell>
											<TableCell>
												<StatusBadge status={r.status} />
											</TableCell>
											<TableCell className="text-xs tabular-nums">
												{r.authored_count} / {r.question_count}
												{r.answer_keyed && (
													<div className="text-[11px] text-emerald-700">key {r.answer_keyed_count} / {r.question_count}</div>
												)}
											</TableCell>
											<TableCell className="text-right whitespace-nowrap">
												<Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => downloadOne(r, 'paper')}>
													<Download className="h-3.5 w-3.5 mr-1" />
													{FORMAT_LABEL[format]}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="h-7 text-xs"
													disabled={!r.answer_keyed}
													onClick={() => downloadOne(r, 'key')}
													title={r.answer_keyed ? `Answer key / scheme of valuation (${FORMAT_LABEL[format]})` : 'No answer key on this paper'}
												>
													<KeyRound className="h-3.5 w-3.5 mr-1" />
													Key
												</Button>
											</TableCell>
										</TableRow>
									))}
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
						<DialogTitle>{bulk?.running ? 'Preparing question papers…' : 'Question papers downloaded'}</DialogTitle>
						<DialogDescription>
							{bulk ? `${bulk.done} of ${bulk.total} prepared` : ''}
							{bulk && bulk.failed.length > 0 && <span className="text-rose-700"> · {bulk.failed.length} failed</span>}
						</DialogDescription>
					</DialogHeader>
					{bulk && <Progress value={Math.round((bulk.done / Math.max(bulk.total, 1)) * 100)} />}
					{bulk && bulk.failed.length > 0 && (
						<div className="max-h-48 overflow-y-auto rounded-md border divide-y text-sm">
							{bulk.failed.map((f, i) => (
								<div key={`${f.name}-${i}`} className="px-3 py-1.5 flex items-start justify-between gap-3">
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
