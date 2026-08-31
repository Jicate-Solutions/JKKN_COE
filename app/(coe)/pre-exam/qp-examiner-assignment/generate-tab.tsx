'use client'

// Step one of the flow: pick the subject, pick the FORMAT, generate the paper.
//
//   End-Semester session -> subject -> format -> generate (ese_question_papers)
//     -> assign examiner (Assign tab) -> examiner authors it in the portal
//
// Every THEORY subject of the session is listed, with the format that applies to
// it pre-selected and changeable per row. Nothing is generated implicitly: until
// a paper exists here, the subject cannot be assigned to anyone.
//
// Practical and laboratory courses never appear — there is no written paper for
// a setter to write, and those examinations are staffed through Practical
// Allotment instead. The count of what was filtered out is shown so a short list
// reads as deliberate rather than as missing data.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
	AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
	AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2, Search, RefreshCw, FileText, AlertTriangle, Download, Trash2, Wand2, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch, SearchableSelect, type SessionOpt } from './shared'

interface Props {
	institutionsId: string
	institutionCode: string
	session: SessionOpt | null
	onGenerated: () => void
}

export interface GenerableRow {
	course_offering_id: string
	course_id: string | null
	course_code: string
	subject_title: string
	course_category: string | null
	program_code: string
	program_type: 'ug' | 'pg'
	semester: number
	set_number: number
	set_label: string | null
	suggested_template_id: string | null
	suggested_template_name: string | null
	no_template_reason: string | null
	paper_id: string | null
	paper_status: string | null
	paper_template_id: string | null
	paper_template_name: string | null
	max_marks: number | null
	duration_minutes: number | null
	authored: boolean
	authored_count: number
	question_count: number
	assigned: boolean
	assignment_status: string | null
	examiner_name: string | null
}

export interface TemplateOpt {
	id: string
	template_name: string
	template_code: string
	total_marks: number
	duration_minutes: number | null
	program_type_applicability: string
	applicability_label: string
}

const rowKey = (r: GenerableRow) => `${r.course_offering_id}:${r.set_number}`

export function GenerateTab({ institutionsId, institutionCode, session, onGenerated }: Props) {
	const { toast } = useToast()

	const [rows, setRows] = useState<GenerableRow[]>([])
	const [templates, setTemplates] = useState<TemplateOpt[]>([])
	// Practical / project / non-academic courses the API filtered out by rule.
	const [excludedNonTheory, setExcludedNonTheory] = useState(0)
	const [loading, setLoading] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)

	const [programFilter, setProgramFilter] = useState('all')
	const [semesterFilter, setSemesterFilter] = useState('all')
	const [stateFilter, setStateFilter] = useState<'all' | 'pending' | 'generated'>('pending')
	const [search, setSearch] = useState('')

	const [picked, setPicked] = useState<Set<string>>(new Set())
	// Per-row format override; falls back to the row's suggestion.
	const [chosen, setChosen] = useState<Record<string, string>>({})
	const [bulkTemplate, setBulkTemplate] = useState('')

	const [generating, setGenerating] = useState(false)
	const [confirmRebuild, setConfirmRebuild] = useState(false)
	const [deleteTarget, setDeleteTarget] = useState<GenerableRow | null>(null)

	// ── Load ──────────────────────────────────────────────────────────────
	const load = useCallback(async () => {
		if (!institutionsId || !session?.id) {
			setRows([])
			setTemplates([])
			return
		}
		setLoading(true)
		setLoadError(null)
		try {
			const json = await apiFetch(
				`/api/pre-exam/ese-question-papers?action=generable&institutions_id=${institutionsId}&examination_session_id=${session.id}`
			)
			setRows(json.data || [])
			setTemplates(json.templates || [])
			setExcludedNonTheory(json.excluded_non_theory || 0)
			setPicked(new Set())
			setChosen({})
		} catch (e: any) {
			setRows([])
			setTemplates([])
			setExcludedNonTheory(0)
			setLoadError(e.message)
		} finally {
			setLoading(false)
		}
	}, [institutionsId, session?.id])

	useEffect(() => {
		load()
	}, [load])

	// ── Derived ───────────────────────────────────────────────────────────
	const programs = useMemo(
		() => [...new Set(rows.map(r => r.program_code).filter(Boolean))].sort(),
		[rows]
	)
	const semesters = useMemo(
		() =>
			[
				...new Set(
					rows
						.filter(r => programFilter === 'all' || r.program_code === programFilter)
						.map(r => r.semester)
				),
			]
				.filter(s => s != null)
				.sort((a, b) => a - b),
		[rows, programFilter]
	)

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase()
		return rows.filter(r => {
			if (programFilter !== 'all' && r.program_code !== programFilter) return false
			if (semesterFilter !== 'all' && String(r.semester) !== semesterFilter) return false
			if (stateFilter === 'pending' && r.paper_id) return false
			if (stateFilter === 'generated' && !r.paper_id) return false
			if (q && !`${r.course_code} ${r.subject_title}`.toLowerCase().includes(q)) return false
			return true
		})
	}, [rows, programFilter, semesterFilter, stateFilter, search])

	/** A row can be picked when a format is available and it is not already handed out. */
	const isSelectable = (r: GenerableRow) =>
		!r.assigned && (!!r.suggested_template_id || !!chosen[rowKey(r)] || !!r.paper_template_id || templates.length > 0)

	const selectable = useMemo(() => visible.filter(isSelectable), [visible, chosen, templates])
	const pickedRows = useMemo(() => rows.filter(r => picked.has(rowKey(r))), [rows, picked])

	const templateFor = (r: GenerableRow) =>
		chosen[rowKey(r)] || r.paper_template_id || r.suggested_template_id || ''

	const counts = useMemo(() => {
		const generated = rows.filter(r => r.paper_id).length
		return {
			total: rows.length,
			generated,
			pending: rows.length - generated,
			assigned: rows.filter(r => r.assigned).length,
			noFormat: rows.filter(r => !r.paper_id && !r.suggested_template_id).length,
		}
	}, [rows])

	// ── Selection ─────────────────────────────────────────────────────────
	const togglePick = (r: GenerableRow) => {
		if (!isSelectable(r)) return
		setPicked(prev => {
			const next = new Set(prev)
			const k = rowKey(r)
			next.has(k) ? next.delete(k) : next.add(k)
			return next
		})
	}

	const toggleAll = () => {
		setPicked(prev => {
			const allPicked = selectable.length > 0 && selectable.every(r => prev.has(rowKey(r)))
			if (allPicked) return new Set()
			return new Set(selectable.map(rowKey))
		})
	}

	const applyBulkTemplate = () => {
		if (!bulkTemplate) return
		if (pickedRows.length === 0) {
			toast({ title: 'Select the subjects to apply the format to', variant: 'destructive' })
			return
		}
		setChosen(prev => {
			const next = { ...prev }
			for (const r of pickedRows) next[rowKey(r)] = bulkTemplate
			return next
		})
		const name = templates.find(t => t.id === bulkTemplate)?.template_name || 'format'
		toast({ title: `${name} applied to ${pickedRows.length} subject(s)` })
	}

	// ── Generate ──────────────────────────────────────────────────────────
	const runGenerate = async (rebuild: boolean) => {
		if (!session?.id) return
		if (pickedRows.length === 0) {
			toast({ title: 'Select at least one subject', variant: 'destructive' })
			return
		}

		const items: { course_offering_id: string; set_number: number; template_id: string }[] = []
		const missing: string[] = []
		for (const r of pickedRows) {
			const tid = templateFor(r)
			if (!tid) {
				missing.push(r.course_code)
				continue
			}
			items.push({ course_offering_id: r.course_offering_id, set_number: r.set_number, template_id: tid })
		}
		if (items.length === 0) {
			toast({
				title: 'No format chosen',
				description: `Pick a format for ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`,
				variant: 'destructive',
			})
			return
		}

		setGenerating(true)
		try {
			const res = await apiFetch('/api/pre-exam/ese-question-papers', {
				method: 'POST',
				body: JSON.stringify({
					institutions_id: institutionsId,
					institution_code: institutionCode,
					examination_session_id: session.id,
					items,
					rebuild,
				}),
			})

			const failed: { course_code: string; reason: string }[] = res.failed || []
			toast({
				title:
					res.created > 0 || res.rebuilt > 0
						? `${res.created} generated${res.rebuilt ? `, ${res.rebuilt} rebuilt` : ''}`
						: res.message,
				description: [
					missing.length ? `${missing.length} skipped — no format chosen` : '',
					failed.length ? failed.slice(0, 3).map(f => `${f.course_code}: ${f.reason}`).join(' · ') : '',
				]
					.filter(Boolean)
					.join(' · ') || undefined,
				variant: failed.length && !res.created && !res.rebuilt ? 'destructive' : 'default',
			})

			setPicked(new Set())
			await load()
			onGenerated()
		} catch (e: any) {
			toast({ title: 'Generation failed', description: e.message, variant: 'destructive' })
		} finally {
			setGenerating(false)
			setConfirmRebuild(false)
		}
	}

	const deletePaper = async () => {
		if (!deleteTarget?.paper_id) return
		try {
			await apiFetch(`/api/pre-exam/ese-question-papers/${deleteTarget.paper_id}`, { method: 'DELETE' })
			toast({ title: `${deleteTarget.course_code} paper removed` })
			setDeleteTarget(null)
			await load()
			onGenerated()
		} catch (e: any) {
			toast({ title: 'Could not remove the paper', description: e.message, variant: 'destructive' })
		}
	}

	// ── Render ────────────────────────────────────────────────────────────
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
			<Card>
				<CardContent className="p-8 text-center space-y-2">
					<AlertTriangle className="h-6 w-6 mx-auto text-amber-500" />
					<p className="text-sm font-medium">This is not an End Semester examination</p>
					<p className="text-xs text-muted-foreground max-w-md mx-auto">
						{session.session_name} is configured as “{session.exam_type_name || 'no exam type'}”. End-semester
						question papers can only be generated for a session whose exam type is an End Semester Examination.
					</p>
				</CardContent>
			</Card>
		)
	}

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader className="pb-3">
					<div className="flex flex-wrap items-end gap-3">
						<div className="space-y-1.5 min-w-[180px]">
							<Label className="text-xs">Programme</Label>
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
								searchPlaceholder="Search programmes…"
							/>
						</div>

						<div className="space-y-1.5 min-w-[130px]">
							<Label className="text-xs">Semester</Label>
							<SearchableSelect
								value={semesterFilter}
								onValueChange={setSemesterFilter}
								placeholder="All semesters"
								options={[
									{ value: 'all', label: 'All semesters' },
									...semesters.map(s => ({ value: String(s), label: `Semester ${s}` })),
								]}
							/>
						</div>

						<div className="space-y-1.5 min-w-[150px]">
							<Label className="text-xs">Show</Label>
							<SearchableSelect
								value={stateFilter}
								onValueChange={v => setStateFilter(v as typeof stateFilter)}
								placeholder="Not generated"
								options={[
									{ value: 'pending', label: 'Not generated yet' },
									{ value: 'generated', label: 'Already generated' },
									{ value: 'all', label: 'All subjects' },
								]}
							/>
						</div>

						<div className="space-y-1.5 flex-1 min-w-[200px]">
							<Label className="text-xs">Search</Label>
							<div className="relative">
								<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									value={search}
									onChange={e => setSearch(e.target.value)}
									placeholder="Course code or title…"
									className="h-9 pl-8"
								/>
							</div>
						</div>

						<Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9">
							<RefreshCw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
							Refresh
						</Button>
					</div>
				</CardHeader>

				<CardContent className="space-y-3">
					{/* Bulk format + generate */}
					<div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
						<div className="space-y-1.5 min-w-[260px] flex-1">
							<Label className="text-xs">Apply a format to the selected subjects</Label>
							<div className="flex gap-2">
								<Select value={bulkTemplate} onValueChange={setBulkTemplate}>
									<SelectTrigger className="h-9">
										<SelectValue placeholder="Choose a format…" />
									</SelectTrigger>
									<SelectContent>
										{templates.map(t => (
											<SelectItem key={t.id} value={t.id}>
												{t.template_name} · {t.total_marks} marks ·{' '}
												{t.program_type_applicability === 'all'
													? 'All programmes'
													: t.program_type_applicability.toUpperCase()}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button variant="outline" size="sm" className="h-9" onClick={applyBulkTemplate} disabled={!bulkTemplate}>
									<Wand2 className="h-4 w-4 mr-1.5" />
									Apply
								</Button>
							</div>
						</div>

						<div className="flex gap-2">
							<Button
								size="sm"
								className="h-9"
								onClick={() => runGenerate(false)}
								disabled={generating || pickedRows.length === 0}
							>
								{generating ? (
									<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
								) : (
									<FileText className="h-4 w-4 mr-1.5" />
								)}
								Generate {pickedRows.length > 0 ? `(${pickedRows.length})` : ''}
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="h-9"
								onClick={() => setConfirmRebuild(true)}
								disabled={generating || pickedRows.length === 0}
							>
								Rebuild
							</Button>
						</div>
					</div>

					{/* Counts */}
					<div className="flex flex-wrap gap-2 text-xs">
						<Badge variant="outline">{counts.total} theory subjects</Badge>
						<Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
							{counts.generated} generated
						</Badge>
						<Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">
							{counts.pending} pending
						</Badge>
						{counts.assigned > 0 && (
							<Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">
								{counts.assigned} assigned
							</Badge>
						)}
						{counts.noFormat > 0 && (
							<Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
								{counts.noFormat} with no matching format
							</Badge>
						)}
					</div>

					{/* The list is filtered by rule, so say so — an unexplained short list
					    reads as missing data. */}
					{excludedNonTheory > 0 && (
						<div className="flex items-start gap-2 text-xs text-muted-foreground">
							<Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
							<span>
								{excludedNonTheory} practical / project subject{excludedNonTheory === 1 ? '' : 's'} in this
								session {excludedNonTheory === 1 ? 'is' : 'are'} not listed. A question paper setter is
								appointed for theory papers only — practical and laboratory examinations are handled in
								Practical Allotment.
							</span>
						</div>
					)}

					{loadError && (
						<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
							<AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
							<span>{loadError}</span>
						</div>
					)}

					{loading ? (
						<div className="p-10 text-center">
							<Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
						</div>
					) : visible.length === 0 ? (
						<div className="p-10 text-center text-sm text-muted-foreground">
							{rows.length === 0 ? 'No end-semester subjects for this session.' : 'Nothing matches these filters.'}
						</div>
					) : (
						<div className="rounded-md border overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-10">
											<Checkbox
												checked={selectable.length > 0 && selectable.every(r => picked.has(rowKey(r)))}
												onCheckedChange={toggleAll}
												aria-label="Select all"
											/>
										</TableHead>
										<TableHead>Subject</TableHead>
										<TableHead className="w-24">Programme</TableHead>
										<TableHead className="w-16">Sem</TableHead>
										<TableHead className="w-14">Set</TableHead>
										<TableHead className="w-[260px]">Format</TableHead>
										<TableHead className="w-[190px]">Paper</TableHead>
										<TableHead className="w-24 text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{visible.map(r => {
										const k = rowKey(r)
										const tid = templateFor(r)
										const locked = r.assigned
										return (
											<TableRow key={k} className={cn(locked && 'bg-muted/30')}>
												<TableCell>
													<Checkbox
														checked={picked.has(k)}
														disabled={!isSelectable(r)}
														onCheckedChange={() => togglePick(r)}
														aria-label={`Select ${r.course_code}`}
													/>
												</TableCell>

												<TableCell>
													<div className="font-medium text-sm">{r.course_code}</div>
													<div className="text-xs text-muted-foreground truncate max-w-[300px]">
														{r.subject_title}
													</div>
													{r.course_category && (
														<div className="text-[11px] text-muted-foreground/80">{r.course_category}</div>
													)}
												</TableCell>

												<TableCell className="text-sm">
													{r.program_code}
													<div className="text-[11px] text-muted-foreground uppercase">{r.program_type}</div>
												</TableCell>
												<TableCell className="text-sm">{r.semester}</TableCell>
												<TableCell className="text-sm">{r.set_label || '—'}</TableCell>

												<TableCell>
													{locked ? (
														<div className="text-xs">
															{r.paper_template_name || '—'}
															<div className="text-[11px] text-muted-foreground">
																Locked — assigned to {r.examiner_name || 'an examiner'}
															</div>
														</div>
													) : templates.length === 0 ? (
														<span className="text-xs text-muted-foreground">No active ESE format</span>
													) : (
														<Select
															value={tid}
															onValueChange={v => setChosen(prev => ({ ...prev, [k]: v }))}
														>
															<SelectTrigger className="h-8 text-xs">
																<SelectValue placeholder="Choose a format…" />
															</SelectTrigger>
															<SelectContent>
																{templates.map(t => (
																	<SelectItem key={t.id} value={t.id} className="text-xs">
																		{t.template_name} · {t.total_marks} marks
																		{t.id === r.suggested_template_id ? ' · suggested' : ''}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													)}
													{!locked && !tid && r.no_template_reason && (
														<div className="text-[11px] text-amber-700 mt-1 flex gap-1">
															<Info className="h-3 w-3 shrink-0 mt-0.5" />
															{r.no_template_reason}
														</div>
													)}
												</TableCell>

												<TableCell>
													{r.paper_id ? (
														<div className="space-y-1">
															<Badge
																variant="outline"
																className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200"
															>
																{r.paper_status}
															</Badge>
															<div className="text-[11px] text-muted-foreground">
																{r.authored_count}/{r.question_count} written · {r.max_marks} marks
															</div>
															{r.assigned && (
																<div className="text-[11px] text-violet-700">
																	{r.assignment_status} · {r.examiner_name}
																</div>
															)}
														</div>
													) : (
														<Badge variant="outline" className="text-[11px] text-muted-foreground">
															Not generated
														</Badge>
													)}
												</TableCell>

												<TableCell className="text-right">
													{r.paper_id && (
														<div className="flex justify-end gap-1">
															<Button
																variant="ghost"
																size="icon"
																className="h-7 w-7"
																title="Download the blank paper"
																onClick={() =>
																	window.open(`/api/pre-exam/ese-question-papers/${r.paper_id}/pdf`, '_blank')
																}
															>
																<Download className="h-3.5 w-3.5" />
															</Button>
															{!r.assigned && (
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-7 w-7 text-rose-600 hover:text-rose-700"
																	title="Remove this paper"
																	onClick={() => setDeleteTarget(r)}
																>
																	<Trash2 className="h-3.5 w-3.5" />
																</Button>
															)}
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

			{/* Rebuild confirmation */}
			<AlertDialog open={confirmRebuild} onOpenChange={setConfirmRebuild}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Rebuild {pickedRows.length} paper(s)?</AlertDialogTitle>
						<AlertDialogDescription>
							Rebuilding re-applies the chosen format to papers that already exist. Questions already written are
							kept wherever they still line up with the new structure. Papers that are assigned to an examiner, or
							that are no longer in draft, are skipped.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => runGenerate(true)}>Rebuild</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Delete confirmation */}
			<AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove the paper for {deleteTarget?.course_code}?</AlertDialogTitle>
						<AlertDialogDescription>
							{deleteTarget?.authored
								? `${deleteTarget.authored_count} question(s) have already been written. Removing the paper deletes them.`
								: 'The paper has no questions written yet. It can be generated again at any time.'}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={deletePaper}
							className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
