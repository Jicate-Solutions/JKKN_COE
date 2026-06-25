'use client'

import { useState, useEffect, useMemo, useCallback, useRef, memo, type CSSProperties } from 'react'
import Link from 'next/link'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { useSessionSync } from '@/hooks/use-session-sync'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, CalendarCheck, CalendarPlus, Loader2, Save, Search, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const FILTERS_KEY = 'schedule-exams:filters'
const SCOPE_KEY = 'schedule-exams:scope'
// Anything other than plain 'Theory' requires a batch capacity (matches the DB check constraint)
const requiresBatch = (examType?: string) => (examType || 'Theory') !== 'Theory'

interface ProgramOption {
	program_code: string
	program_name: string
	program_type: 'UG' | 'PG'
	program_order: number
}

interface Subject {
	course_offering_id: string
	course_id: string
	course_code: string
	course_name: string
	program_code: string
	program_name: string
	program_type: 'UG' | 'PG'
	semester: number | null
	exam_type: string
	approved_count: number
	is_scheduled: boolean
	scheduled_exam_date: string | null
	scheduled_session: string | null
	scheduled_published: boolean
	exam_timetable_id: string | null
}

function formatExamDate(d: string | null): string {
	if (!d) return ''
	const dt = new Date(d)
	if (isNaN(dt.getTime())) return d
	return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface SessionOption {
	id: string
	session_code: string
	session_name: string
}

const SubjectRow = memo(function SubjectRow({
	subject, checked, batchValue, onToggle, onBatchChange, style,
}: {
	subject: Subject
	checked: boolean
	batchValue: string
	onToggle: (id: string) => void
	onBatchChange: (id: string, value: string) => void
	style?: CSSProperties
}) {
	const isPractical = requiresBatch(subject.exam_type)
	const scheduled = subject.is_scheduled
	const published = subject.scheduled_published // published rows stay editable; just badged differently
	return (
		<div
			style={style}
			className={cn(
				'flex items-center gap-3 px-4 py-2 border-b overflow-hidden',
				published ? 'bg-amber-50/40 dark:bg-amber-950/20' : checked && 'bg-blue-50/40 dark:bg-blue-950/20'
			)}
		>
			<Checkbox checked={checked} onCheckedChange={() => onToggle(subject.course_offering_id)} className="mt-0.5" />
			<label className="min-w-0 flex-1 cursor-pointer" onClick={() => onToggle(subject.course_offering_id)}>
				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-xs font-mono text-muted-foreground">{subject.course_code}</span>
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{subject.program_code}</Badge>
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Sem {ROMAN[subject.semester || 0] || subject.semester}</Badge>
					<Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', isPractical ? 'border-purple-300 text-purple-700 bg-purple-50' : 'border-slate-300 text-slate-600')}>{subject.exam_type}</Badge>
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-300 text-emerald-700 bg-emerald-50 inline-flex items-center gap-1">
						<Users className="h-2.5 w-2.5" />{subject.approved_count}
					</Badge>
					{scheduled && (
						<Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 inline-flex items-center gap-1', published ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-blue-300 text-blue-700 bg-blue-50')}>
							<CalendarCheck className="h-2.5 w-2.5" />{formatExamDate(subject.scheduled_exam_date)} · {subject.scheduled_session}{published ? ' · Published' : ' · Draft'}
						</Badge>
					)}
				</div>
				<div className="text-sm truncate">{subject.course_name}</div>
			</label>
			{isPractical && checked && (
				<Input
					type="number"
					min={1}
					placeholder="Batch"
					value={batchValue}
					onChange={(e) => onBatchChange(subject.course_offering_id, e.target.value)}
					onClick={(e) => e.stopPropagation()}
					className="h-8 w-24 text-sm"
				/>
			)}
		</div>
	)
})

export default function ScheduleExamsPage() {
	const { toast } = useToast()
	const { isReady, mustSelectInstitution, institutionId } = useInstitutionFilter()
	const { availableInstitutions, selectedInstitution, selectInstitution } = useInstitution()
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()

	const [sessions, setSessions] = useState<SessionOption[]>([])
	const [subjects, setSubjects] = useState<Subject[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [loading, setLoading] = useState(false)

	// Filters (persisted across reloads / navigation)
	const [categoryFilter, setCategoryFilter] = useState<'all' | 'UG' | 'PG'>('all')
	const [programFilter, setProgramFilter] = useState('all')
	const [semesterFilter, setSemesterFilter] = useState('all')
	const [search, setSearch] = useState('')
	const [filtersLoaded, setFiltersLoaded] = useState(false)

	// Restore saved filters on mount
	useEffect(() => {
		try {
			const raw = localStorage.getItem(FILTERS_KEY)
			if (raw) {
				const f = JSON.parse(raw)
				if (f.categoryFilter === 'UG' || f.categoryFilter === 'PG' || f.categoryFilter === 'all') setCategoryFilter(f.categoryFilter)
				if (typeof f.programFilter === 'string') setProgramFilter(f.programFilter)
				if (typeof f.semesterFilter === 'string') setSemesterFilter(f.semesterFilter)
				if (typeof f.search === 'string') setSearch(f.search)
			}
		} catch {}
		setFiltersLoaded(true)
	}, [])

	// Persist filters whenever they change
	useEffect(() => {
		if (!filtersLoaded) return
		try {
			localStorage.setItem(FILTERS_KEY, JSON.stringify({ categoryFilter, programFilter, semesterFilter, search }))
		} catch {}
	}, [filtersLoaded, categoryFilter, programFilter, semesterFilter, search])

	// Remember the exam session chosen here so it can be restored on return.
	// NOTE: institution is intentionally NOT auto-restored — the global header owns
	// institution selection (and persists it), so forcing it here would block the
	// super-admin from choosing "All Institutions".
	useEffect(() => {
		if (!isReady) return
		try {
			localStorage.setItem(SCOPE_KEY, JSON.stringify({ sessionId: selectedSessionId || '' }))
		} catch {}
	}, [isReady, selectedSessionId])

	// Restore the saved session ONCE, after its institution's sessions have loaded.
	const sessionRestoredRef = useRef(false)
	useEffect(() => {
		if (sessionRestoredRef.current || !mustSelectSession || selectedSessionId || sessions.length === 0) return
		sessionRestoredRef.current = true
		try {
			const raw = localStorage.getItem(SCOPE_KEY)
			if (!raw) return
			const { sessionId: savedSid } = JSON.parse(raw)
			if (savedSid && sessions.some((s) => s.id === savedSid)) setSelectedSessionId(savedSid)
		} catch {}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mustSelectSession, selectedSessionId, sessions])

	// Selection + batch capacities
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [batchCaps, setBatchCaps] = useState<Map<string, string>>(new Map())

	// Schedule form
	const [examDate, setExamDate] = useState('')
	const [examSession, setExamSession] = useState<'' | 'FN' | 'AN'>('')
	const [examMode, setExamMode] = useState<'Offline' | 'Online'>('Offline')
	const [isPublished, setIsPublished] = useState(false)
	const [saving, setSaving] = useState(false)

	// Load examination sessions for the dropdown — scoped to the selected institution
	// so super admins don't see duplicate same-named sessions across institutions.
	useEffect(() => {
		if (!isReady || !institutionId) {
			setSessions([])
			return
		}
		fetch(`/api/exam-management/examination-sessions?institutions_id=${institutionId}`)
			.then((r) => (r.ok ? r.json() : []))
			.then((data) => {
				setSessions(data || [])
				// No auto-select: when no global session is active, the user must
				// explicitly pick an exam session via the gate below.
			})
			.catch(() => setSessions([]))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isReady, institutionId])

	// Fetch schedulable subjects when institution + session are known
	const fetchSubjects = useCallback(async () => {
		if (!institutionId || !selectedSessionId) {
			setSubjects([])
			setPrograms([])
			return
		}
		try {
			setLoading(true)
			const url = `/api/exam-management/exam-timetables/schedule?institutions_id=${institutionId}&examination_session_id=${selectedSessionId}`
			const res = await fetch(url)
			if (!res.ok) throw new Error('Failed to load subjects')
			const data = await res.json()
			setSubjects(data.subjects || [])
			setPrograms(data.programs || [])
			setSelected(new Set())
			setBatchCaps(new Map())
		} catch (e) {
			console.error(e)
			setSubjects([])
			setPrograms([])
			toast({ title: '❌ Error', description: 'Failed to load schedulable subjects', variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [institutionId, selectedSessionId, toast])

	useEffect(() => {
		fetchSubjects()
	}, [fetchSubjects])

	// Programs available for the current category filter
	const programOptions = useMemo(() => {
		const filtered = categoryFilter === 'all' ? programs : programs.filter((p) => p.program_type === categoryFilter)
		return filtered
	}, [programs, categoryFilter])

	// Reset dependent filters when category changes
	useEffect(() => {
		setProgramFilter('all')
	}, [categoryFilter])

	// Distinct semesters present
	const semesterOptions = useMemo(() => {
		const set = new Set<number>()
		subjects.forEach((s) => { if (s.semester != null) set.add(s.semester) })
		return [...set].sort((a, b) => a - b)
	}, [subjects])

	// Apply client-side filters
	const filtered = useMemo(() => {
		const q = search.toLowerCase()
		return subjects.filter((s) => {
			if (categoryFilter !== 'all' && s.program_type !== categoryFilter) return false
			if (programFilter !== 'all' && s.program_code !== programFilter) return false
			if (semesterFilter !== 'all' && String(s.semester) !== semesterFilter) return false
			if (q && ![s.course_code, s.course_name, s.program_code, s.program_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))) return false
			return true
		})
	}, [subjects, categoryFilter, programFilter, semesterFilter, search])

	// Subjects available to select — both drafts and published rows can be re-scheduled.
	// Re-saving a published row keeps it published unless explicitly changed (see handleSave).
	const selectableFiltered = filtered

	const toggle = useCallback((id: string) => {
		setSelected((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}, [])

	const onBatchChange = useCallback((id: string, value: string) => {
		setBatchCaps((prev) => {
			const next = new Map(prev)
			next.set(id, value)
			return next
		})
	}, [])

	const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every((s) => selected.has(s.course_offering_id))
	const toggleSelectAll = () => {
		setSelected((prev) => {
			const next = new Set(prev)
			if (allFilteredSelected) {
				selectableFiltered.forEach((s) => next.delete(s.course_offering_id))
			} else {
				selectableFiltered.forEach((s) => next.add(s.course_offering_id))
			}
			return next
		})
	}

	const selectedSubjects = useMemo(
		() => subjects.filter((s) => selected.has(s.course_offering_id)),
		[subjects, selected]
	)

	const handleSave = async () => {
		if (selectedSubjects.length === 0) {
			toast({ title: '⚠️ No subjects selected', description: 'Select at least one subject to schedule.', variant: 'destructive' })
			return
		}
		if (!examDate) {
			toast({ title: '⚠️ Exam Date required', description: 'Pick an exam date.', variant: 'destructive' })
			return
		}
		if (!examSession) {
			toast({ title: '⚠️ Session required', description: 'Select FN or AN.', variant: 'destructive' })
			return
		}
		// Validate batch capacity for practical-type subjects
		const missingBatch = selectedSubjects.filter((s) => requiresBatch(s.exam_type) && !(Number(batchCaps.get(s.course_offering_id)) >= 1))
		if (missingBatch.length > 0) {
			toast({ title: '⚠️ Batch Capacity required', description: `Enter batch capacity for: ${missingBatch.map((s) => s.course_code).join(', ')}`, variant: 'destructive' })
			return
		}

		try {
			setSaving(true)
			const items = selectedSubjects.map((s) => ({
				course_offering_id: s.course_offering_id,
				course_id: s.course_id,
				course_code: s.course_code,
				exam_type: s.exam_type,
				batch_capacity: requiresBatch(s.exam_type) ? Number(batchCaps.get(s.course_offering_id)) : null,
				exam_timetable_id: s.exam_timetable_id || undefined, // present → reschedule existing row
				was_published: s.scheduled_published, // preserve published state unless toggle explicitly publishes
			}))
			const res = await fetch('/api/exam-management/exam-timetables/schedule', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institutions_id: institutionId,
					examination_session_id: selectedSessionId,
					exam_date: examDate,
					session: examSession,
					exam_mode: examMode,
					is_published: isPublished,
					items,
				}),
			})
			const result = await res.json()
			if (!res.ok) throw new Error(result.error || 'Failed to schedule')

			const parts: string[] = []
			if (result.created) parts.push(`${result.created} scheduled`)
			if (result.updated) parts.push(`${result.updated} rescheduled`)
			if (result.skipped) parts.push(`${result.skipped} already scheduled`)
			if (result.errors?.length) parts.push(`${result.errors.length} failed`)
			toast({
				title: '✅ Exams Scheduled',
				description: `${parts.join(', ')} for ${examDate} (${examSession}).`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			// Reset the schedule form for the next batch
			setExamDate('')
			setExamSession('')
			await fetchSubjects()
		} catch (e) {
			toast({ title: '❌ Schedule Failed', description: e instanceof Error ? e.message : 'Failed to schedule', variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild><Link href="/exam-management/exam-timetables">Exam Timetables</Link></BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Schedule Exams</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div className="flex items-center justify-between gap-2 flex-wrap">
						<div>
							<h1 className="text-xl font-semibold">Schedule Exams</h1>
							<p className="text-sm text-muted-foreground">Schedule timetable entries for subjects with approved registrations.</p>
						</div>
						<Button variant="outline" asChild>
							<Link href="/exam-management/exam-timetables"><ArrowLeft className="h-4 w-4 mr-2" />Back to Timetables</Link>
						</Button>
					</div>

					{(
						<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
							{/* Left: filters + subjects */}
							<div className="lg:col-span-2 space-y-4">
								<Card>
									<CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
										{mustSelectSession && (
											<div className="col-span-2 md:col-span-4">
												<Label className="text-xs">Examination Session <span className="text-red-500">*</span></Label>
												<Select value={selectedSessionId} onValueChange={setSelectedSessionId} disabled={!institutionId}>
													<SelectTrigger><SelectValue placeholder={institutionId ? 'Select session' : 'Select institution first'} /></SelectTrigger>
													<SelectContent>
														{sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.session_name} ({s.session_code})</SelectItem>)}
													</SelectContent>
												</Select>
											</div>
										)}
										{mustSelectInstitution && (
											<div className="col-span-2 md:col-span-4">
												<Label className="text-xs">Institution <span className="text-red-500">*</span></Label>
												<Select
													value={selectedInstitution?.id || ''}
													onValueChange={(id) => {
														const inst = availableInstitutions.find((i) => i.id === id)
														if (inst) selectInstitution(inst)
													}}
												>
													<SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger>
													<SelectContent>
														{availableInstitutions.map((i) => (
															<SelectItem key={i.id} value={i.id}>{i.institution_code} — {i.institution_name}</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										)}
										<div>
											<Label className="text-xs">Course Category</Label>
											<Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
												<SelectTrigger><SelectValue /></SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All</SelectItem>
													<SelectItem value="UG">UG</SelectItem>
													<SelectItem value="PG">PG</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div>
											<Label className="text-xs">Program</Label>
											<Select value={programFilter} onValueChange={setProgramFilter}>
												<SelectTrigger><SelectValue /></SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All Programs</SelectItem>
													{programOptions.map((p) => <SelectItem key={p.program_code} value={p.program_code}>{p.program_code} — {p.program_name}</SelectItem>)}
												</SelectContent>
											</Select>
										</div>
										<div>
											<Label className="text-xs">Semester</Label>
											<Select value={semesterFilter} onValueChange={setSemesterFilter}>
												<SelectTrigger><SelectValue /></SelectTrigger>
												<SelectContent>
													<SelectItem value="all">All</SelectItem>
													{semesterOptions.map((s) => <SelectItem key={s} value={String(s)}>Sem {ROMAN[s] || s}</SelectItem>)}
												</SelectContent>
											</Select>
										</div>
										<div>
											<Label className="text-xs">Search</Label>
											<div className="relative">
												<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
												<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code or name" className="pl-8" />
											</div>
										</div>
									</CardContent>
								</Card>

								<Card>
									<CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
										<div className="flex items-center gap-2">
											<Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} disabled={selectableFiltered.length === 0} />
											<span className="text-sm font-medium">Select all ({selectableFiltered.length})</span>
										</div>
										<Badge variant="secondary">{selected.size} selected</Badge>
									</CardHeader>
									<CardContent className="p-0">
										{!institutionId || !selectedSessionId ? (
											<div className="p-8 text-center text-muted-foreground text-sm">
												{!institutionId ? 'Select an institution to view subjects.' : 'Select an exam session to view subjects.'}
											</div>
										) : loading ? (
											<div className="p-8 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading subjects…</div>
										) : filtered.length === 0 ? (
											<div className="p-8 text-center text-muted-foreground text-sm">
												{subjects.length === 0 ? 'No subjects with approved registrations to schedule for this session.' : 'No subjects match the current filters.'}
											</div>
										) : (
											<div className="max-h-[55vh] overflow-y-auto border-t">
												{filtered.map((s) => (
													<SubjectRow
														key={s.course_offering_id}
														subject={s}
														checked={selected.has(s.course_offering_id)}
														batchValue={batchCaps.get(s.course_offering_id) || ''}
														onToggle={toggle}
														onBatchChange={onBatchChange}
													/>
												))}
											</div>
										)}
									</CardContent>
								</Card>
							</div>

							{/* Right: schedule panel */}
							<div className="space-y-4">
								<Card className="sticky top-4">
									<CardHeader className="p-4 pb-2">
										<div className="flex items-center gap-2 font-semibold"><CalendarPlus className="h-4 w-4" />Schedule Exam</div>
									</CardHeader>
									<CardContent className="p-4 space-y-3">
										<div>
											<Label className="text-xs">Exam Date</Label>
											<Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
										</div>
										<div>
											<Label className="text-xs">Session</Label>
											<Select value={examSession} onValueChange={(v) => setExamSession(v as any)}>
												<SelectTrigger><SelectValue placeholder="Select FN / AN" /></SelectTrigger>
												<SelectContent>
													<SelectItem value="FN">Forenoon (FN)</SelectItem>
													<SelectItem value="AN">Afternoon (AN)</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div>
											<Label className="text-xs">Exam Mode</Label>
											<Select value={examMode} onValueChange={(v) => setExamMode(v as any)}>
												<SelectTrigger><SelectValue /></SelectTrigger>
												<SelectContent>
													<SelectItem value="Offline">Offline</SelectItem>
													<SelectItem value="Online">Online</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="flex items-center justify-between">
											<Label className="text-xs">Publish immediately</Label>
											<Switch checked={isPublished} onCheckedChange={setIsPublished} />
										</div>
										<div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 text-sm">
											<div className="flex justify-between"><span className="text-muted-foreground">Subjects selected</span><span className="font-semibold">{selected.size}</span></div>
											<div className="flex justify-between"><span className="text-muted-foreground">Learners (approx)</span><span className="font-semibold">{selectedSubjects.reduce((a, s) => a + s.approved_count, 0)}</span></div>
										</div>
										{selectedSubjects.length > 0 && (
											<div className="space-y-1.5">
												<Label className="text-xs">Selected courses</Label>
												<div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-lg border p-2">
													{selectedSubjects.map((s) => (
														<Badge
															key={s.course_offering_id}
															variant="secondary"
															className="text-[11px] font-mono gap-1 pr-1 cursor-pointer hover:bg-red-50 hover:text-red-700"
															title={`${s.course_name}${s.is_scheduled ? ` — currently ${formatExamDate(s.scheduled_exam_date)} ${s.scheduled_session}` : ''} — click to remove`}
															onClick={() => toggle(s.course_offering_id)}
														>
															{s.course_code}
															{s.is_scheduled && (
																<span className="text-amber-600 font-sans">({formatExamDate(s.scheduled_exam_date)} {s.scheduled_session})</span>
															)}
															<X className="h-3 w-3" />
														</Badge>
													))}
												</div>
											</div>
										)}
										<Button className="w-full" onClick={handleSave} disabled={saving || selected.size === 0}>
											{saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scheduling…</> : <><Save className="h-4 w-4 mr-2" />Save Schedule</>}
										</Button>
									</CardContent>
								</Card>
							</div>
						</div>
					)}
				</div>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
