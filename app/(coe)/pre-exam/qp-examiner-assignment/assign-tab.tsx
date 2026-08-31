'use client'

// Step two of the flow: pick a GENERATED question paper, pick the examiner type,
// pick the examiner, set the availability period, confirm.
//
// The list shows every end-semester paper generated for the selected session,
// marking the ones already handed out, so what is left to assign is visible at a
// glance rather than something the CoE has to remember. A subject with no paper
// yet does not appear here at all — it is generated in the Generate Papers tab,
// where its format is chosen.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2, Search, RefreshCw, UserPlus, AlertTriangle, CheckCircle2, Info, Mail, CalendarClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isoToIstLocal, formatIst } from '@/lib/qp-portal/ist'
import type { QpExaminerKind } from '@/types/qp-examiner-assignment'
import {
	apiFetch, SearchableSelect, StatusBadge, KindBadge,
	type PaperRow, type ExaminerOpt, type SessionOpt, type BlockedExaminer,
} from './shared'

interface Props {
	institutionsId: string
	institutionCode: string
	session: SessionOpt | null
	onAssigned: () => void
}

/** A sensible default window: opens now, closes a fortnight from now at 5 pm IST. */
function defaultWindow(): { from: string; to: string } {
	const now = new Date()
	const to = new Date(now.getTime() + 14 * 86_400_000)
	// 17:00 IST on the closing day.
	const toIst = new Date(to.getTime() + 330 * 60_000)
	toIst.setUTCHours(17, 0, 0, 0)
	return {
		from: isoToIstLocal(now.toISOString()),
		to: isoToIstLocal(new Date(toIst.getTime() - 330 * 60_000).toISOString()),
	}
}

export function AssignTab({ institutionsId, institutionCode, session, onAssigned }: Props) {
	const { toast } = useToast()

	const [papers, setPapers] = useState<PaperRow[]>([])
	const [loading, setLoading] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)

	const [programFilter, setProgramFilter] = useState('all')
	const [semesterFilter, setSemesterFilter] = useState('all')
	const [assignedFilter, setAssignedFilter] = useState<'all' | 'unassigned' | 'assigned'>('unassigned')
	const [search, setSearch] = useState('')

	// The subjects picked for this appointment. One examiner may take several
	// papers in one go — that is the common case for a department's setter.
	const [picked, setPicked] = useState<Set<string>>(new Set())

	// ── Assign sheet ──────────────────────────────────────────────────────
	const [sheetOpen, setSheetOpen] = useState(false)
	const [kind, setKind] = useState<QpExaminerKind>('external')
	const [examiners, setExaminers] = useState<ExaminerOpt[]>([])
	// Examiners who hold the Question Paper Setter role but are not ACTIVE yet.
	// Kept so a search that matches one can say WHY they are not selectable.
	const [blocked, setBlocked] = useState<BlockedExaminer[]>([])
	// True backlog size — `blocked` above may be a truncated sample of it.
	const [blockedTotal, setBlockedTotal] = useState(0)
	const [examinerLoading, setExaminerLoading] = useState(false)
	const [examinerSearch, setExaminerSearch] = useState('')
	const [examinerId, setExaminerId] = useState('')
	const [validFrom, setValidFrom] = useState(defaultWindow().from)
	const [validTo, setValidTo] = useState(defaultWindow().to)
	const [remuneration, setRemuneration] = useState('')
	const [notes, setNotes] = useState('')
	const [sendEmail, setSendEmail] = useState(true)
	const [saving, setSaving] = useState(false)

	// The paper is the unit of assignment, so it is also the row identity.
	const rowKey = (c: PaperRow) => c.paper_id

	// ── Load the subject list ─────────────────────────────────────────────
	const loadPapers = useCallback(async () => {
		if (!institutionsId || !session?.id) {
			setPapers([])
			return
		}
		setLoading(true)
		setLoadError(null)
		try {
			const json = await apiFetch(
				`/api/pre-exam/qp-examiner-assignments/papers?institutions_id=${institutionsId}&examination_session_id=${session.id}`
			)
			setPapers(json.data || [])
			setPicked(new Set())
		} catch (e: any) {
			setPapers([])
			setLoadError(e.message)
		} finally {
			setLoading(false)
		}
	}, [institutionsId, session?.id])

	useEffect(() => {
		loadPapers()
	}, [loadPapers])

	// ── Load eligible examiners when the sheet opens or the tab changes ───
	useEffect(() => {
		if (!sheetOpen || !institutionsId) return
		let cancelled = false
		const load = async () => {
			setExaminerLoading(true)
			try {
				const json = await apiFetch(
					`/api/pre-exam/qp-examiner-assignments/examiners?kind=${kind}&institutions_id=${institutionsId}` +
						(session?.id ? `&examination_session_id=${session.id}` : '')
				)
				if (!cancelled) {
					setExaminers(json.data || [])
					setBlocked(json.blocked || [])
					setBlockedTotal(json.blocked_total ?? (json.blocked || []).length)
				}
			} catch (e: any) {
				if (!cancelled) {
					setExaminers([])
					setBlocked([])
					setBlockedTotal(0)
					toast({ title: 'Could not load examiners', description: e.message, variant: 'destructive' })
				}
			} finally {
				if (!cancelled) setExaminerLoading(false)
			}
		}
		load()
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sheetOpen, kind, institutionsId, session?.id])

	// ── Derived filter options ────────────────────────────────────────────
	const programs = useMemo(
		() => [...new Set(papers.map(c => c.program_code).filter(Boolean))].sort(),
		[papers]
	)
	const semesters = useMemo(
		() =>
			[...new Set(papers.filter(c => programFilter === 'all' || c.program_code === programFilter).map(c => c.semester))]
				.filter(s => s != null)
				.sort((a, b) => a - b),
		[papers, programFilter]
	)

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		return papers.filter(c => {
			if (programFilter !== 'all' && c.program_code !== programFilter) return false
			if (semesterFilter !== 'all' && String(c.semester) !== semesterFilter) return false
			if (assignedFilter === 'unassigned' && c.assignment) return false
			if (assignedFilter === 'assigned' && !c.assignment) return false
			if (q && !`${c.course_code} ${c.subject_title}`.toLowerCase().includes(q)) return false
			return true
		})
	}, [papers, programFilter, semesterFilter, assignedFilter, search])

	const selectable = useMemo(() => visible.filter(c => !c.assignment), [visible])
	const pickedRows = useMemo(() => papers.filter(c => picked.has(rowKey(c))), [papers, picked])

	const togglePick = (c: PaperRow) => {
		if (c.assignment) return
		setPicked(prev => {
			const next = new Set(prev)
			const k = rowKey(c)
			next.has(k) ? next.delete(k) : next.add(k)
			return next
		})
	}

	const toggleAll = () => {
		setPicked(prev => {
			const allPicked = selectable.length > 0 && selectable.every(c => prev.has(rowKey(c)))
			if (allPicked) return new Set()
			return new Set(selectable.map(rowKey))
		})
	}

	const openSheet = () => {
		if (pickedRows.length === 0) {
			toast({ title: 'Select at least one subject to assign', variant: 'destructive' })
			return
		}
		const w = defaultWindow()
		setValidFrom(w.from)
		setValidTo(w.to)
		setExaminerId('')
		setRemuneration('')
		setNotes('')
		setSendEmail(true)
		setSheetOpen(true)
	}

	const filteredExaminers = useMemo(() => {
		const q = examinerSearch.trim().toLowerCase()
		if (!q) return examiners
		return examiners.filter(
			e =>
				e.full_name.toLowerCase().includes(q) ||
				e.email.toLowerCase().includes(q) ||
				(e.department || '').toLowerCase().includes(q) ||
				(e.institution_name || '').toLowerCase().includes(q)
		)
	}, [examiners, examinerSearch])

	// Blocked candidates that match what the user just typed. This is the whole
	// point of keeping them: someone searching a name that exists but is stuck in
	// PENDING must be told that, not shown a blank list.
	const blockedMatches = useMemo(() => {
		if (kind !== 'external') return []
		const q = examinerSearch.trim().toLowerCase()
		if (!q) return []
		return blocked.filter(
			b =>
				b.full_name.toLowerCase().includes(q) ||
				b.email.toLowerCase().includes(q) ||
				(b.department || '').toLowerCase().includes(q) ||
				(b.institution_name || '').toLowerCase().includes(q)
		)
	}, [blocked, examinerSearch, kind])

	const chosenExaminer = examiners.find(e => e.id === examinerId) || null

	// ── Confirm ───────────────────────────────────────────────────────────
	const confirm = async () => {
		if (!session?.id) return
		if (!examinerId || !chosenExaminer) {
			toast({ title: 'Select an examiner', variant: 'destructive' })
			return
		}
		if (!validFrom || !validTo) {
			toast({ title: 'Set the Date From and Date To', variant: 'destructive' })
			return
		}

		setSaving(true)
		const results = { ok: 0, failed: [] as string[], emailed: 0 }

		// One request per paper: each is its own appointment with its own order.
		for (const row of pickedRows) {
			try {
				const payload = {
					institutions_id: institutionsId,
					institution_code: institutionCode,
					examination_session_id: session.id,
					// The paper already exists with its format chosen — assignment only
					// attaches an examiner to it.
					paper_id: row.paper_id,
					examiner_kind: kind,
					examiner_id: kind === 'external' ? examinerId : chosenExaminer.already_mirrored ? examinerId : undefined,
					staff:
						kind === 'internal'
							? {
									myjkkn_staff_id: chosenExaminer.myjkkn_staff_id || chosenExaminer.id,
									full_name: chosenExaminer.full_name,
									email: chosenExaminer.email,
									mobile: chosenExaminer.mobile || null,
									designation: chosenExaminer.designation || null,
									department: chosenExaminer.department || null,
								}
							: undefined,
					valid_from: validFrom,
					valid_to: validTo,
					remuneration: remuneration === '' ? null : Number(remuneration),
					notes: notes || null,
				}

				const created = await apiFetch('/api/pre-exam/qp-examiner-assignments', {
					method: 'POST',
					body: JSON.stringify(payload),
				})
				results.ok++

				if (sendEmail && created?.data?.id) {
					try {
						await apiFetch(`/api/pre-exam/qp-examiner-assignments/${created.data.id}/send-order`, {
							method: 'POST',
							body: JSON.stringify({}),
						})
						results.emailed++
					} catch (mailErr: any) {
						// The assignment stands even when the mail does not — say so
						// rather than making it look like the whole thing failed.
						results.failed.push(`${row.course_code}: assigned, but the order e-mail failed (${mailErr.message})`)
					}
				}
			} catch (e: any) {
				results.failed.push(`${row.course_code}: ${e.message}`)
			}
		}

		setSaving(false)

		if (results.ok > 0) {
			toast({
				title: `${results.ok} paper${results.ok > 1 ? 's' : ''} assigned to ${chosenExaminer.full_name}`,
				description: sendEmail
					? `${results.emailed} examiner order${results.emailed === 1 ? '' : 's'} e-mailed.`
					: 'No e-mail sent — use Send Order from the Assignments tab when you are ready.',
			})
			setSheetOpen(false)
			setPicked(new Set())
			loadPapers()
			onAssigned()
		}
		if (results.failed.length) {
			toast({
				title: `${results.failed.length} could not be completed`,
				description: results.failed.slice(0, 3).join(' · '),
				variant: 'destructive',
			})
		}
	}

	// ── Guards ────────────────────────────────────────────────────────────
	if (!session) {
		return (
			<Card>
				<CardContent className="p-10 text-center text-sm text-muted-foreground">
					Select an examination session to begin.
				</CardContent>
			</Card>
		)
	}

	if (!session.is_end_semester) {
		return (
			<Card className="border-amber-200 bg-amber-50/50">
				<CardContent className="p-8 flex gap-3">
					<AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
					<div className="text-sm">
						<p className="font-medium text-amber-900">This is not an End Semester examination.</p>
						<p className="text-amber-800 mt-1">
							“{session.session_name}” is configured as{' '}
							<strong>{session.exam_type_name || 'no exam type'}</strong>. Question paper setters are
							appointed for End Semester Examinations only. Change the session&apos;s Exam Type in
							Examination Sessions, or pick a different session.
						</p>
					</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<>
			<Card className="flex flex-col">
				<CardHeader className="px-4 py-3 border-b">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-base font-semibold">End Semester Question Papers</p>
							<p className="text-xs text-muted-foreground">
								{session.session_name} · {session.exam_type_name} ·{' '}
								{papers.filter(c => !c.assignment).length} of {papers.length} not yet assigned
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button variant="outline" size="sm" onClick={loadPapers} disabled={loading}>
								<RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
								Refresh
							</Button>
							<Button size="sm" onClick={openSheet} disabled={picked.size === 0}>
								<UserPlus className="h-4 w-4 mr-1.5" />
								Assign examiner{picked.size > 0 ? ` (${picked.size})` : ''}
							</Button>
						</div>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
						<SearchableSelect
							value={programFilter}
							onValueChange={v => {
								setProgramFilter(v)
								setSemesterFilter('all')
							}}
							placeholder="All programmes"
							options={[
								{ value: 'all', label: 'All programmes' },
								...programs.map(p => ({ value: p, label: p })),
							]}
						/>
						<SearchableSelect
							value={semesterFilter}
							onValueChange={setSemesterFilter}
							placeholder="All semesters"
							options={[
								{ value: 'all', label: 'All semesters' },
								...semesters.map(s => ({ value: String(s), label: `Semester ${s}` })),
							]}
						/>
						<Tabs value={assignedFilter} onValueChange={v => setAssignedFilter(v as any)}>
							<TabsList className="w-full">
								<TabsTrigger value="unassigned" className="flex-1 text-xs">Unassigned</TabsTrigger>
								<TabsTrigger value="assigned" className="flex-1 text-xs">Assigned</TabsTrigger>
								<TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								value={search}
								onChange={e => setSearch(e.target.value)}
								placeholder="Search code or title…"
								className="h-9 pl-8"
							/>
						</div>
					</div>
				</CardHeader>

				<CardContent className="p-0">
					{loadError && (
						<div className="m-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex gap-2">
							<Info className="h-4 w-4 shrink-0 mt-0.5" />
							<span>{loadError}</span>
						</div>
					)}

					{loading ? (
						<div className="p-10 flex justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					) : visible.length === 0 && !loadError ? (
						<div className="p-10 text-center text-sm text-muted-foreground space-y-1">
							{papers.length === 0 ? (
								<>
									<p className="font-medium text-foreground">No question papers generated yet</p>
									<p className="max-w-md mx-auto">
										An examiner is appointed to a paper, so the paper has to exist first. Open the{' '}
										<span className="font-medium">Generate Papers</span> tab, choose the format for each
										subject, and generate — then come back here.
									</p>
								</>
							) : (
								'Nothing matches these filters.'
							)}
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-10">
											<Checkbox
												checked={selectable.length > 0 && selectable.every(c => picked.has(rowKey(c)))}
												onCheckedChange={toggleAll}
												aria-label="Select all unassigned"
											/>
										</TableHead>
										<TableHead>Subject</TableHead>
										<TableHead className="w-24">Programme</TableHead>
										<TableHead className="w-20">Sem</TableHead>
										<TableHead className="w-16">Set</TableHead>
										<TableHead className="w-32">Format</TableHead>
										<TableHead>Assignment</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{visible.map(c => (
										<TableRow
											key={rowKey(c)}
											className={cn(c.assignment && 'bg-muted/30', !c.assignment && 'cursor-pointer')}
											onClick={() => togglePick(c)}
										>
											<TableCell onClick={e => e.stopPropagation()}>
												<Checkbox
													checked={picked.has(rowKey(c))}
													disabled={!!c.assignment}
													onCheckedChange={() => togglePick(c)}
													aria-label={`Select ${c.course_code}`}
												/>
											</TableCell>
											<TableCell>
												<div className="font-medium text-sm">{c.course_code}</div>
												<div className="text-xs text-muted-foreground truncate max-w-[320px]">
													{c.subject_title}
												</div>
											</TableCell>
											<TableCell className="text-sm">{c.program_code}</TableCell>
											<TableCell className="text-sm">{c.semester}</TableCell>
											<TableCell className="text-sm">{c.set_label || '—'}</TableCell>
											<TableCell>
												<div className="text-xs">{c.template_name}</div>
												<div className="text-xs text-muted-foreground">{c.template_total_marks} marks</div>
											</TableCell>
											<TableCell>
												{c.assignment ? (
													<div className="space-y-1">
														<div className="flex items-center gap-2">
															<StatusBadge status={c.assignment.status} />
															<KindBadge kind={c.assignment.examiner_kind} />
														</div>
														<div className="text-xs">{c.assignment.examiner_name}</div>
														<div className="text-xs text-muted-foreground">
															{formatIst(c.assignment.valid_from, false)} → {formatIst(c.assignment.valid_to)}
														</div>
													</div>
												) : (
													<Badge variant="outline" className="text-xs text-muted-foreground">
														Not assigned
													</Badge>
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* ── Assign sheet ──────────────────────────────────────────────── */}
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
					<SheetHeader>
						<SheetTitle>Assign question paper setter</SheetTitle>
					</SheetHeader>

					<div className="space-y-5 py-4">
						{/* Chosen papers */}
						<div>
							<Label className="text-xs uppercase tracking-wide text-muted-foreground">
								Question papers ({pickedRows.length})
							</Label>
							<div className="mt-2 rounded-md border divide-y max-h-40 overflow-y-auto">
								{pickedRows.map(c => (
									<div key={rowKey(c)} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
										<div className="min-w-0">
											<span className="font-medium">{c.course_code}</span>
											<span className="text-muted-foreground"> · {c.subject_title}</span>
										</div>
										<span className="text-xs text-muted-foreground shrink-0">
											Sem {c.semester}
											{c.set_label ? ` · Set ${c.set_label}` : ''}
										</span>
									</div>
								))}
							</div>
						</div>

						{/* Examiner type */}
						<div>
							<Label className="text-xs uppercase tracking-wide text-muted-foreground">Examiner type</Label>
							<Tabs
								value={kind}
								onValueChange={v => {
									setKind(v as QpExaminerKind)
									setExaminerId('')
								}}
								className="mt-2"
							>
								<TabsList className="w-full">
									<TabsTrigger value="external" className="flex-1">External examiner</TabsTrigger>
									<TabsTrigger value="internal" className="flex-1">Internal examiner</TabsTrigger>
								</TabsList>
							</Tabs>
							<p className="text-xs text-muted-foreground mt-1.5">
								{kind === 'external'
									? 'From the Examiner Panel — approved examiners whose willingness roles include Question Paper Setter. A self-registered examiner stays out of this list until their registration is approved.'
									: 'Teaching staff of this institution. Assigning creates their examiner record and portal access automatically.'}
							</p>
						</div>

						{/* Examiner picker */}
						<div>
							<div className="flex items-center justify-between">
								<Label className="text-xs uppercase tracking-wide text-muted-foreground">Examiner</Label>
								{examinerLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
							</div>
							<div className="relative mt-2">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input
									value={examinerSearch}
									onChange={e => setExaminerSearch(e.target.value)}
									placeholder="Search by name, e-mail, department…"
									className="h-9 pl-8"
								/>
							</div>
							<div className="mt-2 rounded-md border divide-y max-h-64 overflow-y-auto">
								{filteredExaminers.length === 0 && !examinerLoading && (
									<div className="p-4 text-sm text-muted-foreground space-y-2">
										{kind !== 'external' ? (
											<p className="text-center">No staff found for this institution.</p>
										) : blockedMatches.length > 0 ? (
											// The searched-for person exists and already holds the role —
											// they are simply not approved. Saying "nobody has the role"
											// here would send the CoE to change the wrong thing.
											<>
												<p>
													{blockedMatches.length === 1
														? '1 examiner matches, but is not approved yet:'
														: `${blockedMatches.length} examiners match, but are not approved yet:`}
												</p>
												<ul className="space-y-1">
													{blockedMatches.slice(0, 5).map(b => (
														<li key={b.id} className="flex items-start justify-between gap-2">
															<span className="min-w-0">
																<span className="font-medium text-foreground">{b.full_name}</span>
																<span className="block text-xs truncate">{b.email}</span>
															</span>
															<Badge
																variant="outline"
																className="shrink-0 text-[10px] bg-amber-50 text-amber-700 border-amber-200"
															>
																{b.status}
															</Badge>
														</li>
													))}
												</ul>
												{blockedMatches.length > 5 && (
													<p className="text-xs">…and {blockedMatches.length - 5} more.</p>
												)}
												<p className="text-xs">
													They already have “Question Paper Setter” in their willingness roles. Approve them
													on the Examiner Panel and they become selectable here.
												</p>
											</>
										) : examinerSearch.trim() ? (
											<p className="text-center">
												No approved question paper setter matches “{examinerSearch.trim()}”.
											</p>
										) : blocked.length > 0 ? (
											<p className="text-center">
												No approved examiner is available yet. {blockedTotal} examiner
												{blockedTotal === 1 ? '' : 's'} already have “Question Paper Setter” in their
												willingness roles but are awaiting approval — approve them on the Examiner Panel.
											</p>
										) : (
											<p className="text-center">
												No active examiner has “Question Paper Setter” among their willingness roles. Add it
												on the Examiner Panel.
											</p>
										)}
									</div>
								)}
								{filteredExaminers.map(e => (
									<button
										type="button"
										key={e.id}
										onClick={() => setExaminerId(e.id)}
										className={cn(
											'w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors',
											examinerId === e.id && 'bg-primary/5 ring-1 ring-inset ring-primary/30'
										)}
									>
										<div className="flex items-center justify-between gap-2">
											<div className="min-w-0">
												<div className="text-sm font-medium truncate">{e.full_name}</div>
												<div className="text-xs text-muted-foreground truncate">{e.email}</div>
												<div className="text-xs text-muted-foreground truncate">
													{[e.designation, e.department, e.institution_name].filter(Boolean).join(' · ')}
												</div>
											</div>
											<div className="shrink-0 text-right space-y-1">
												{examinerId === e.id && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
												{!!e.active_assignments && (
													<Badge variant="outline" className="text-[10px]">
														{e.active_assignments} live
													</Badge>
												)}
											</div>
										</div>
									</button>
								))}
							</div>
						</div>

						{/* Window */}
						<div>
							<Label className="text-xs uppercase tracking-wide text-muted-foreground">
								Question paper availability period (IST)
							</Label>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
								<div>
									<Label htmlFor="valid_from" className="text-xs">Date &amp; time from</Label>
									<Input
										id="valid_from"
										type="datetime-local"
										value={validFrom}
										onChange={e => setValidFrom(e.target.value)}
										className="h-9 mt-1"
									/>
								</div>
								<div>
									<Label htmlFor="valid_to" className="text-xs">Date &amp; time to</Label>
									<Input
										id="valid_to"
										type="datetime-local"
										value={validTo}
										onChange={e => setValidTo(e.target.value)}
										className="h-9 mt-1"
									/>
								</div>
							</div>
							<p className="text-xs text-muted-foreground mt-1.5 flex items-start gap-1.5">
								<CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
								The examiner can open the question paper only within this period. Access closes
								automatically at the end time. All times are Indian Standard Time.
							</p>
						</div>

						{/* Remuneration + notes */}
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div>
								<Label htmlFor="remuneration" className="text-xs">Remuneration per paper (₹)</Label>
								<Input
									id="remuneration"
									type="number"
									min="0"
									step="0.01"
									value={remuneration}
									onChange={e => setRemuneration(e.target.value)}
									placeholder="From the claim-form rate"
									className="h-9 mt-1"
								/>
							</div>
							<div>
								<Label htmlFor="notes" className="text-xs">Notes (internal)</Label>
								<Textarea
									id="notes"
									value={notes}
									onChange={e => setNotes(e.target.value)}
									rows={2}
									className="mt-1"
								/>
							</div>
						</div>

						{/* Email */}
						<label className="flex items-start gap-2.5 rounded-md border p-3 cursor-pointer">
							<Checkbox checked={sendEmail} onCheckedChange={v => setSendEmail(v === true)} className="mt-0.5" />
							<span className="text-sm">
								<span className="font-medium flex items-center gap-1.5">
									<Mail className="h-3.5 w-3.5" />
									E-mail the examiner order now
								</span>
								<span className="text-xs text-muted-foreground block mt-0.5">
									Sends the Examiner Order Copy as a PDF attachment with the access period and a link
									to the portal. It can also be sent later from the Assignments tab.
								</span>
							</span>
						</label>
					</div>

					<div className="flex justify-end gap-2 border-t pt-4">
						<Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
							Cancel
						</Button>
						<Button onClick={confirm} disabled={saving || !examinerId}>
							{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
							Confirm assignment{pickedRows.length > 1 ? ` (${pickedRows.length})` : ''}
						</Button>
					</div>
				</SheetContent>
			</Sheet>
		</>
	)
}
