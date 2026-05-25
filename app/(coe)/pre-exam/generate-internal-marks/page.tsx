"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
	Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
	AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
	AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useSessionSync } from "@/hooks/use-session-sync"
import { cn } from "@/lib/utils"
import {
	Loader2, PlayCircle, RefreshCw, Eye, Calculator, CheckCircle2,
	AlertCircle, FileWarning, Scale, BookOpen,
} from "lucide-react"

interface Institution {
	id: string
	name: string
	institution_code: string
	myjkkn_institution_ids: string[]
}

interface Session {
	id: string
	session_name: string
	session_code: string
	institutions_id?: string
}

interface ConversionRule {
	id: string
	rule_name: string
	regulation_code: string | null
	wef_date: string
	is_active: boolean
}

interface CourseOption {
	course_offering_id: string
	course_code: string
	course_name: string
	program_code: string
	semester: number
	internal_max_mark: number
}

interface LearnerResult {
	exam_registration_id: string
	student_id: string
	stu_register_no: string
	student_name: string
	status: 'ok' | 'error' | 'no_data'
	total_internal_marks: number
	max_internal_marks: number
	warnings: string[]
	errors: string[]
	breakdown?: any
}

interface CourseResult {
	course_offering_id: string
	course_code: string
	course_name: string
	program_code: string
	semester: number
	course_internal_max: number
	learners: LearnerResult[]
	summary: { total: number; ok: number; errors: number; no_data: number }
}

interface RunResponse {
	mode: 'preview' | 'execute'
	rule: { id: string; rule_name: string; wef_date: string; regulation_code: string | null }
	results: CourseResult[]
	totals: { processed: number; upserted: number; errors: number; no_data: number }
}

export default function GenerateInternalMarksPage() {
	const { toast } = useToast()
	const { user } = useAuth()
	const { isReady, appendToUrl, mustSelectInstitution, institutionId } = useInstitutionFilter()
	const { selectedSessionId, setSelectedSessionId } = useSessionSync()

	// Data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [rules, setRules] = useState<ConversionRule[]>([])
	const [programs, setPrograms] = useState<string[]>([])
	const [semesters, setSemesters] = useState<number[]>([])
	const [courses, setCourses] = useState<CourseOption[]>([])

	// Local institution selector (super_admin viewing "All")
	const [localInstitutionId, setLocalInstitutionId] = useState("")
	const effectiveInstitutionId = institutionId || localInstitutionId || ""

	// Filters
	const [selectedRule, setSelectedRule] = useState("")
	const [selectedProgram, setSelectedProgram] = useState("__all__")
	const [selectedSemester, setSelectedSemester] = useState("__all__")
	const [selectedCourses, setSelectedCourses] = useState<string[]>([])

	// Run state
	const [previewing, setPreviewing] = useState(false)
	const [executing, setExecuting] = useState(false)
	const [result, setResult] = useState<RunResponse | null>(null)
	const [confirmOpen, setConfirmOpen] = useState(false)

	// Filter view of results
	const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'error' | 'no_data'>('all')
	const [searchTerm, setSearchTerm] = useState("")

	// ─── Fetch institutions + sessions ───
	useEffect(() => {
		if (isReady) { fetchInstitutions(); fetchSessions() }
	}, [isReady])

	useEffect(() => {
		if (isReady && effectiveInstitutionId) {
			fetchRules()
		} else {
			setRules([])
		}
	}, [isReady, effectiveInstitutionId])

	useEffect(() => {
		if (isReady && effectiveInstitutionId && selectedSessionId) {
			fetchPrograms()
		} else {
			setPrograms([])
		}
		// Reset downstream
		setSelectedProgram("__all__")
		setSemesters([])
		setSelectedSemester("__all__")
		setCourses([])
		setSelectedCourses([])
		setResult(null)
	}, [isReady, effectiveInstitutionId, selectedSessionId])

	useEffect(() => {
		if (selectedProgram !== "__all__") {
			fetchSemesters()
		} else {
			setSemesters([])
		}
		setSelectedSemester("__all__")
		setCourses([])
		setSelectedCourses([])
	}, [selectedProgram])

	useEffect(() => {
		if (selectedProgram !== "__all__" && selectedSemester !== "__all__") {
			fetchCourses()
		} else {
			setCourses([])
		}
		setSelectedCourses([])
	}, [selectedSemester])

	const fetchInstitutions = async () => {
		try {
			const url = appendToUrl('/api/pre-exam/internal-marks?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					name: i.name || i.institution_name,
					institution_code: i.institution_code,
					myjkkn_institution_ids: i.myjkkn_institution_ids || [],
				})))
			}
		} catch (error) { console.error(error) }
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch('/api/pre-exam/internal-marks?action=sessions')
			if (res.ok) setSessions(await res.json())
		} catch (error) { console.error(error) }
	}

	const fetchRules = async () => {
		try {
			const res = await fetch(`/api/pre-exam/mark-conversion-rules?institutions_id=${effectiveInstitutionId}`)
			if (res.ok) {
				const data = await res.json()
				setRules(data)
				// Auto-select most recent active
				if (data.length > 0 && !selectedRule) setSelectedRule(data[0].id)
			}
		} catch (error) { console.error(error) }
	}

	const fetchPrograms = async () => {
		try {
			const res = await fetch(
				`/api/pre-exam/internal-mark-entry?action=filter-cascade&step=programs` +
				`&institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSessionId}`,
			)
			if (res.ok) setPrograms(await res.json())
		} catch (error) { console.error(error) }
	}

	const fetchSemesters = async () => {
		try {
			const res = await fetch(
				`/api/pre-exam/internal-mark-entry?action=filter-cascade&step=semesters` +
				`&institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSessionId}` +
				`&program_code=${selectedProgram}`,
			)
			if (res.ok) setSemesters(await res.json())
		} catch (error) { console.error(error) }
	}

	const fetchCourses = async () => {
		try {
			const res = await fetch(
				`/api/pre-exam/internal-mark-entry?action=filter-cascade&step=courses` +
				`&institutions_id=${effectiveInstitutionId}&examination_session_id=${selectedSessionId}` +
				`&program_code=${selectedProgram}&semester=${selectedSemester}`,
			)
			if (res.ok) setCourses(await res.json())
		} catch (error) { console.error(error) }
	}

	const canRun = !!effectiveInstitutionId && !!selectedSessionId && !!selectedRule

	const runGenerate = async (mode: 'preview' | 'execute') => {
		if (!canRun) {
			toast({ title: '❌ Missing required filters', description: 'Institution, session, and conversion rule are required.', variant: 'destructive' })
			return
		}
		mode === 'preview' ? setPreviewing(true) : setExecuting(true)
		try {
			const body: any = {
				mode,
				institutions_id: effectiveInstitutionId,
				examination_session_id: selectedSessionId,
				conversion_rule_id: selectedRule,
				created_by: user?.id,
			}
			if (selectedProgram !== '__all__') body.program_code = selectedProgram
			if (selectedSemester !== '__all__') body.semester = Number(selectedSemester)
			if (selectedCourses.length > 0) body.course_offering_ids = selectedCourses

			const res = await fetch('/api/pre-exam/generate-internal-marks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
			const data = await res.json()
			if (!res.ok) {
				toast({ title: '❌ Failed', description: data.error, variant: 'destructive' })
				return
			}
			setResult(data)
			toast({
				title: mode === 'preview' ? '✅ Preview complete' : '✅ Generated',
				description: mode === 'preview'
					? `${data.totals.processed} learners calculated · ${data.totals.errors} errors · ${data.totals.no_data} with no data`
					: `${data.totals.upserted} rows upserted · ${data.totals.errors} errors`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (e: any) {
			toast({ title: '❌ Network Error', description: e?.message, variant: 'destructive' })
		} finally {
			setPreviewing(false)
			setExecuting(false)
			setConfirmOpen(false)
		}
	}

	// ─── Flatten results for table view ───
	const flatRows = useMemo(() => {
		if (!result) return []
		const rows: Array<LearnerResult & { course_code: string; course_name: string }> = []
		for (const c of result.results) {
			for (const l of c.learners) {
				rows.push({ ...l, course_code: c.course_code, course_name: c.course_name })
			}
		}
		return rows
	}, [result])

	const filteredRows = useMemo(() => {
		let r = flatRows
		if (statusFilter !== 'all') r = r.filter(x => x.status === statusFilter)
		if (searchTerm) {
			const t = searchTerm.toLowerCase()
			r = r.filter(x =>
				x.stu_register_no?.toLowerCase().includes(t) ||
				x.student_name?.toLowerCase().includes(t) ||
				x.course_code?.toLowerCase().includes(t),
			)
		}
		return r
	}, [flatRows, statusFilter, searchTerm])

	const stats = useMemo(() => {
		if (!result) return { processed: 0, ok: 0, errors: 0, no_data: 0, upserted: 0 }
		return {
			processed: result.totals.processed,
			upserted: result.totals.upserted,
			errors: result.totals.errors,
			no_data: result.totals.no_data,
			ok: result.totals.processed - result.totals.errors - result.totals.no_data,
		}
	}, [result])

	const selectedRuleObj = rules.find(r => r.id === selectedRule)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Dashboard</Link></BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbLink>Pre-Exam</BreadcrumbLink></BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem><BreadcrumbPage>Generate Internal Marks</BreadcrumbPage></BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</AppHeader>

				<div className="flex flex-1 flex-col gap-4 p-4 overflow-y-auto">
					{/* Score Cards */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.processed}</p>
										<p className="text-xs text-muted-foreground mt-0.5">Processed</p>
									</div>
									<Calculator className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.upserted || stats.ok}</p>
										<p className="text-xs text-muted-foreground mt-0.5">{result?.mode === 'execute' ? 'Upserted' : 'OK'}</p>
									</div>
									<CheckCircle2 className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-amber-500">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.no_data}</p>
										<p className="text-xs text-muted-foreground mt-0.5">No Data</p>
									</div>
									<FileWarning className="h-5 w-5 text-amber-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-red-500">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{stats.errors}</p>
										<p className="text-xs text-muted-foreground mt-0.5">Errors</p>
									</div>
									<AlertCircle className="h-5 w-5 text-red-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Filter Card */}
					<Card>
						<CardHeader className="pb-3">
							<div>
								<h2 className="text-base font-semibold">Generate Internal Marks</h2>
								<p className="text-xs text-muted-foreground">
									Applies a conversion rule to <code>cia_marks</code> (falls back to <code>internal_marks</code> raw fields) and upserts the final total into <code>internal_marks</code> with status <strong>Submitted</strong>.
								</p>
							</div>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
								{mustSelectInstitution && (
									<div className="space-y-1">
										<Label className="text-xs font-semibold">Institution <span className="text-red-500">*</span></Label>
										<Select value={localInstitutionId} onValueChange={setLocalInstitutionId}>
											<SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Institution" /></SelectTrigger>
											<SelectContent>
												{institutions.map(i => (
													<SelectItem key={i.id} value={i.id}>{i.institution_code} - {i.name}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
								<div className="space-y-1">
									<Label className="text-xs font-semibold">Exam Session <span className="text-red-500">*</span></Label>
									<Select value={selectedSessionId || ''} onValueChange={setSelectedSessionId}>
										<SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Session" /></SelectTrigger>
										<SelectContent>
											{sessions
												.filter(s => !effectiveInstitutionId || s.institutions_id === effectiveInstitutionId)
												.map(s => <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>)
											}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label className="text-xs font-semibold">Conversion Rule <span className="text-red-500">*</span></Label>
									<Select value={selectedRule} onValueChange={setSelectedRule}>
										<SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select Rule" /></SelectTrigger>
										<SelectContent>
											{rules.map(r => (
												<SelectItem key={r.id} value={r.id}>
													{r.rule_name} ({r.regulation_code || 'all reg'}, WEF {r.wef_date})
												</SelectItem>
											))}
											{rules.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No rules — create one at /pre-exam/mark-conversion-rules</div>}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label className="text-xs font-semibold">Program (optional)</Label>
									<Select value={selectedProgram} onValueChange={setSelectedProgram}>
										<SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
										<SelectContent>
											<SelectItem value="__all__">All Programs</SelectItem>
											{programs.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1">
									<Label className="text-xs font-semibold">Semester (optional)</Label>
									<Select value={selectedSemester} onValueChange={setSelectedSemester} disabled={selectedProgram === '__all__'}>
										<SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
										<SelectContent>
											<SelectItem value="__all__">All Semesters</SelectItem>
											{semesters.map(s => <SelectItem key={s} value={String(s)}>{`Sem ${s}`}</SelectItem>)}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-1 md:col-span-2 lg:col-span-2">
									<Label className="text-xs font-semibold">Courses (optional — leave empty for all)</Label>
									<div className="flex flex-wrap gap-1 min-h-[32px] p-1 border rounded-md bg-background">
										{courses.length === 0 ? (
											<span className="text-xs text-muted-foreground px-1.5 py-1">
												Pick program & semester to load courses
											</span>
										) : (
											courses.map(c => {
												const checked = selectedCourses.includes(c.course_offering_id)
												return (
													<button
														key={c.course_offering_id}
														type="button"
														onClick={() => setSelectedCourses(prev =>
															prev.includes(c.course_offering_id)
																? prev.filter(x => x !== c.course_offering_id)
																: [...prev, c.course_offering_id],
														)}
														className={cn(
															"px-2 py-1 rounded-md text-xs border transition-colors",
															checked
																? "bg-blue-50 border-blue-300 text-blue-700"
																: "bg-white border-slate-200 text-slate-500 hover:border-slate-300",
														)}
													>
														{c.course_code} (max {c.internal_max_mark})
													</button>
												)
											})
										)}
									</div>
								</div>
							</div>

							{selectedRuleObj && (
								<div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 p-2.5 text-xs">
									<div className="flex items-center gap-2">
										<Scale className="h-3.5 w-3.5 text-blue-700" />
										<span className="font-semibold">{selectedRuleObj.rule_name}</span>
										<Badge variant="outline" className="text-xs">WEF {selectedRuleObj.wef_date}</Badge>
										{selectedRuleObj.regulation_code && <Badge variant="secondary" className="text-xs">{selectedRuleObj.regulation_code}</Badge>}
									</div>
								</div>
							)}

							<div className="flex flex-wrap items-center gap-2 pt-2 border-t">
								<Button size="sm" variant="outline" onClick={() => runGenerate('preview')} disabled={!canRun || previewing || executing}>
									{previewing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
									Preview
								</Button>
								<Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!canRun || previewing || executing}>
									{executing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 mr-1.5" />}
									Generate & Submit
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setResult(null)} disabled={!result}>
									<RefreshCw className="h-3.5 w-3.5 mr-1.5" />Clear
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Results */}
					{result && (
						<Card>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between flex-wrap gap-2">
									<div>
										<h3 className="text-base font-semibold">
											{result.mode === 'execute' ? 'Generation Results' : 'Preview Results'}
										</h3>
										<p className="text-xs text-muted-foreground">
											Rule: {result.rule.rule_name} · {result.results.length} courses · {result.totals.processed} learners
										</p>
									</div>
									<div className="flex items-center gap-2">
										<Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
											<SelectTrigger className="h-8 text-sm w-[130px]"><SelectValue /></SelectTrigger>
											<SelectContent>
												<SelectItem value="all">All</SelectItem>
												<SelectItem value="ok">OK</SelectItem>
												<SelectItem value="error">Errors</SelectItem>
												<SelectItem value="no_data">No Data</SelectItem>
											</SelectContent>
										</Select>
										<Input
											value={searchTerm}
											onChange={e => setSearchTerm(e.target.value)}
											placeholder="Search reg# / name / course"
											className="h-8 text-sm w-[220px]"
										/>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-0">
								<div className="border rounded-md overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="text-xs">Course</TableHead>
												<TableHead className="text-xs">Reg #</TableHead>
												<TableHead className="text-xs">Learner</TableHead>
												<TableHead className="text-xs text-center">Total</TableHead>
												<TableHead className="text-xs text-center">Max</TableHead>
												<TableHead className="text-xs text-center">Status</TableHead>
												<TableHead className="text-xs">Warnings / Errors</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{filteredRows.length === 0 ? (
												<TableRow>
													<TableCell colSpan={7} className="text-center text-muted-foreground py-8">
														No learners match the current filter
													</TableCell>
												</TableRow>
											) : filteredRows.slice(0, 1000).map(row => (
												<TableRow key={`${row.exam_registration_id}|${row.course_code}`}>
													<TableCell className="text-xs font-mono">
														<div>{row.course_code}</div>
														<div className="text-muted-foreground truncate max-w-[180px]">{row.course_name}</div>
													</TableCell>
													<TableCell className="text-xs">{row.stu_register_no}</TableCell>
													<TableCell className="text-xs">{row.student_name}</TableCell>
													<TableCell className="text-xs text-center font-semibold">{row.total_internal_marks}</TableCell>
													<TableCell className="text-xs text-center text-muted-foreground">{row.max_internal_marks}</TableCell>
													<TableCell className="text-center">
														{row.status === 'ok' && (
															<Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">OK</Badge>
														)}
														{row.status === 'error' && (
															<Badge variant="destructive" className="text-xs">Error</Badge>
														)}
														{row.status === 'no_data' && (
															<Badge variant="outline" className="text-xs">No Data</Badge>
														)}
													</TableCell>
													<TableCell className="text-xs text-muted-foreground max-w-[280px]">
														{row.errors.length > 0 && (
															<div className="text-red-600">{row.errors.join('; ')}</div>
														)}
														{row.warnings.slice(0, 2).map((w, i) => (
															<div key={i} className="truncate">{w}</div>
														))}
														{row.warnings.length > 2 && (
															<div className="text-xs italic">+{row.warnings.length - 2} more</div>
														)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
								{filteredRows.length > 1000 && (
									<p className="text-xs text-muted-foreground mt-2">
										Showing first 1000 of {filteredRows.length} rows. Use filters to narrow.
									</p>
								)}
							</CardContent>
						</Card>
					)}
				</div>

				{/* Confirm dialog */}
				<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Generate &amp; Submit Final Internal Marks?</AlertDialogTitle>
							<AlertDialogDescription>
								This will compute final internal marks from <code>cia_marks</code> (with <code>internal_marks</code> fallback) and upsert into <code>internal_marks</code> with status <strong>Submitted</strong>. Existing locked rows will be skipped.
								<br /><br />
								Run <strong>Preview</strong> first if you haven&apos;t already.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={() => runGenerate('execute')} disabled={executing}>
								{executing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 mr-1.5" />}
								Generate &amp; Submit
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
