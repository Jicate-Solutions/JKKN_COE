'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import {
	ChevronLeft,
	ChevronRight,
	FileSpreadsheet,
	FileText,
	GraduationCap,
	Loader2,
	RefreshCw,
	Search,
	UserCheck,
	UserMinus,
	Users,
} from 'lucide-react'
import XLSX from '@/lib/utils/excel-compat'
import { batchLabel } from '@/lib/utils/batch-year'
import { earlierSessions } from '@/lib/discontinued-learners/sessions'
import { generateDiscontinuedLearnersPdf } from '@/lib/utils/generate-discontinued-learners-pdf'
import {
	DISCONTINUED_REASONS,
	type DiscontinuedLearnerRow,
	type DiscontinuedLearnersResponse,
	type DiscontinuedReason,
	type DiscontinuedSessionOption,
} from '@/types/discontinued-learners'

interface InstitutionOption {
	id: string
	institution_code: string
	name: string
}

const ALL = 'all'
const NOT_MAPPED = 'not-mapped'
const PAGE_SIZE = 50

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
function toRoman(n: number | null): string { return n ? (ROMAN[n] || String(n)) : '-' }

const REASON_BADGE: Record<DiscontinuedReason, string> = {
	'Not Registered': 'bg-red-50 text-red-700 border-red-200',
	'Registered - Not Applied': 'bg-amber-50 text-amber-700 border-amber-200',
	'Applied - Approval Pending': 'bg-blue-50 text-blue-700 border-blue-200',
}

function sessionLabel(s: DiscontinuedSessionOption): string {
	return s.month_year ? `${s.session_name} (${s.month_year})` : s.session_name
}

export default function DiscontinuedLearnersPage() {
	const { toast } = useToast()
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
	const [sessions, setSessions] = useState<DiscontinuedSessionOption[]>([])
	const [currentSessionId, setCurrentSessionId] = useState('')
	const [previousSessionId, setPreviousSessionId] = useState('')

	const [report, setReport] = useState<DiscontinuedLearnersResponse | null>(null)

	const [programFilter, setProgramFilter] = useState(ALL)
	const [batchFilter, setBatchFilter] = useState(ALL)
	const [semesterFilter, setSemesterFilter] = useState(ALL)
	const [reasonFilter, setReasonFilter] = useState(ALL)
	const [searchTerm, setSearchTerm] = useState('')
	const [currentPage, setCurrentPage] = useState(1)

	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingReport, setLoadingReport] = useState(false)
	const [exportingPdf, setExportingPdf] = useState(false)

	// ─── Institutions ───
	useEffect(() => {
		if (!isReady) return
		;(async () => {
			try {
				const res = await fetch(appendToUrl('/api/master/institutions'))
				if (res.ok) {
					const data = await res.json()
					setInstitutions(Array.isArray(data) ? data : data.data || [])
				}
			} catch (error) {
				console.error('[discontinued-learners] institutions load failed:', error)
			}
		})()
	}, [isReady, appendToUrl])

	useEffect(() => {
		if (institutions.length === 0) return
		if (institutions.length === 1) setSelectedInstitutionId(institutions[0].id)
		else if ((shouldFilter || !mustSelectInstitution) && contextInstitutionId) setSelectedInstitutionId(contextInstitutionId)
	}, [institutions, shouldFilter, mustSelectInstitution, contextInstitutionId])

	// ─── End Semester sessions of the institution ───
	useEffect(() => {
		setSessions([])
		setCurrentSessionId('')
		setPreviousSessionId('')
		setReport(null)
		if (!selectedInstitutionId) return

		let cancelled = false
		;(async () => {
			try {
				setLoadingSessions(true)
				const res = await fetch(`/api/reports/discontinued-learners?mode=sessions&institutions_id=${selectedInstitutionId}`)
				const json = await res.json()
				if (!res.ok) throw new Error(json?.error || 'Failed to load exam sessions')
				if (!cancelled) setSessions(json.data || [])
			} catch (error) {
				if (!cancelled) {
					toast({
						title: 'Exam sessions not loaded',
						description: error instanceof Error ? error.message : 'Unexpected error',
						variant: 'destructive',
					})
				}
			} finally {
				if (!cancelled) setLoadingSessions(false)
			}
		})()
		return () => { cancelled = true }
	}, [selectedInstitutionId, toast])

	// Sessions held before the selected one, latest first
	const previousOptions = useMemo(
		() => earlierSessions(sessions, currentSessionId),
		[sessions, currentSessionId]
	)

	// The End Semester session just before the selected one is the default comparison
	useEffect(() => {
		setPreviousSessionId(previousOptions[0]?.id || '')
		setReport(null)
	}, [previousOptions])

	// ─── Generate ───
	const loadReport = useCallback(async () => {
		if (!selectedInstitutionId || !currentSessionId || !previousSessionId) return
		try {
			setLoadingReport(true)
			const params = new URLSearchParams({
				institutions_id: selectedInstitutionId,
				current_session_id: currentSessionId,
				previous_session_id: previousSessionId,
			})
			const res = await fetch(`/api/reports/discontinued-learners?${params.toString()}`)
			const json = await res.json()
			if (!res.ok) throw new Error(json?.error || 'Failed to generate the report')
			setReport(json)
			setProgramFilter(ALL)
			setBatchFilter(ALL)
			setSemesterFilter(ALL)
			setReasonFilter(ALL)
			setSearchTerm('')
			toast({
				title: 'Report ready',
				description: `${json.summary.discontinued} discontinued learner(s) out of ${json.summary.previous_approved} who paid in ${json.previous_session.month_year || json.previous_session.session_name}.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			setReport(null)
			toast({
				title: 'Report failed',
				description: error instanceof Error ? error.message : 'Unexpected error',
				variant: 'destructive',
			})
		} finally {
			setLoadingReport(false)
		}
	}, [selectedInstitutionId, currentSessionId, previousSessionId, toast])

	// ─── Filter options from the loaded rows ───
	const rows = report?.data || []

	const programOptions = useMemo(() => {
		const map = new Map<string, { code: string; name: string | null; count: number }>()
		for (const r of rows) {
			// A Select item cannot carry an empty value
			const code = r.program_code || NOT_MAPPED
			if (!map.has(code)) map.set(code, { code, name: r.program_name, count: 0 })
			map.get(code)!.count++
		}
		return [...map.values()]
	}, [rows])

	const batchOptions = useMemo(
		() => [...new Set(rows.map(r => r.batch_year))].sort((a, b) => b - a),
		[rows]
	)

	const semesterOptions = useMemo(
		() => [...new Set(rows.map(r => r.previous_semester || 0))].sort((a, b) => a - b),
		[rows]
	)

	const filteredRows = useMemo(() => {
		const term = searchTerm.trim().toLowerCase()
		return rows.filter(r => {
			if (programFilter !== ALL && (r.program_code || NOT_MAPPED) !== programFilter) return false
			if (batchFilter !== ALL && String(r.batch_year) !== batchFilter) return false
			if (semesterFilter !== ALL && String(r.previous_semester || 0) !== semesterFilter) return false
			if (reasonFilter !== ALL && r.current_status !== reasonFilter) return false
			if (term && !r.register_number.toLowerCase().includes(term) && !r.student_name.toLowerCase().includes(term)) return false
			return true
		})
	}, [rows, programFilter, batchFilter, semesterFilter, reasonFilter, searchTerm])

	useEffect(() => { setCurrentPage(1) }, [filteredRows])

	const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
	const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

	// ─── Export ───
	const handleExportPdf = useCallback(async () => {
		if (!report || filteredRows.length === 0) return
		try {
			setExportingPdf(true)

			const filename = generateDiscontinuedLearnersPdf({
				current_session_name: report.current_session.session_name,
				current_session_code: report.current_session.session_code,
				data: filteredRows,
			})
			toast({
				title: 'PDF generated',
				description: `${filename} downloaded.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('[discontinued-learners] PDF export failed:', error)
			toast({ title: 'Export failed', description: 'Failed to generate PDF.', variant: 'destructive' })
		} finally {
			setExportingPdf(false)
		}
	}, [report, filteredRows, toast])

	const handleExportExcel = useCallback(async () => {
		if (!report || filteredRows.length === 0) return
		const sheet = XLSX.utils.json_to_sheet(
			filteredRows.map((r: DiscontinuedLearnerRow, i) => ({
				'S.No': i + 1,
				'Register No': r.register_number,
				'Learner Name': r.student_name,
				'Program Code': r.program_code || '',
				'Program Name': r.program_name || '',
				Batch: r.batch_year || '',
				'Previous Attended Semester': r.previous_semester || '',
				'Previous Session': report.previous_session.month_year || report.previous_session.session_name,
				'Previous Papers': r.previous_papers,
				'Pending Arrears': r.pending_arrears,
				'Current Session': report.current_session.month_year || report.current_session.session_name,
				'Current Session Status': r.current_status,
			}))
		)
		const book = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(book, sheet, 'Discontinued Learners')
		await XLSX.writeFile(book, `discontinued-learners-${report.current_session.session_code}-${new Date().toISOString().slice(0, 10)}.xlsx`)
		toast({ title: 'Exported', description: `${filteredRows.length} rows written to Excel.` })
	}, [report, filteredRows, toast])

	const summary = report?.summary
	const canGenerate = !!selectedInstitutionId && !!currentSessionId && !!previousSessionId && !loadingReport

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					<Breadcrumb className="-mb-3">
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/users/learners-myjkkn">Learners</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Discontinued Learners</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* ===== Scorecards ===== */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{summary?.previous_approved ?? '-'}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Paid in Previous Session</p>
									</div>
									<Users className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{summary?.continuing ?? '-'}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Paid in Current Session</p>
									</div>
									<UserCheck className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{summary?.completed_excluded ?? '-'}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Completed Final Semester (excluded)</p>
									</div>
									<GraduationCap className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>
						<Card className="border-l-4 border-l-red-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{summary?.discontinued ?? '-'}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Discontinued Learners</p>
									</div>
									<UserMinus className="h-5 w-5 text-red-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					{/* ===== Session comparison ===== */}
					<Card>
						<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
							<h2 className="text-base font-semibold">Discontinued Learners Report</h2>
							<p className="text-xs text-muted-foreground">
								Learners whose exam fee was approved in the previous End Semester session but not in the
								current one. Learners who completed their final semester with nothing pending are left out.
							</p>
						</CardHeader>
						<CardContent className="p-4">
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
								{mustSelectInstitution && (
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Institution</Label>
										<Select value={selectedInstitutionId} onValueChange={setSelectedInstitutionId}>
											<SelectTrigger className="h-9 text-sm">
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map(inst => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.institution_code} — {inst.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}

								<div className="space-y-2">
									<Label className="text-sm font-semibold">Exam Session (current)</Label>
									<Select
										value={currentSessionId}
										onValueChange={setCurrentSessionId}
										disabled={!selectedInstitutionId || loadingSessions}
									>
										<SelectTrigger className="h-9 text-sm">
											<SelectValue
												placeholder={
													!selectedInstitutionId
														? 'Select an institution first'
														: loadingSessions
															? 'Loading sessions…'
															: sessions.length === 0
																? 'No End Semester sessions'
																: 'Select exam session'
												}
											/>
										</SelectTrigger>
										<SelectContent>
											{sessions.map(s => (
												<SelectItem key={s.id} value={s.id}>{sessionLabel(s)}</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<Label className="text-sm font-semibold">Compare With (previous session)</Label>
									<Select
										value={previousSessionId}
										onValueChange={value => { setPreviousSessionId(value); setReport(null) }}
										disabled={!currentSessionId || previousOptions.length === 0}
									>
										<SelectTrigger className="h-9 text-sm">
											<SelectValue
												placeholder={
													!currentSessionId
														? 'Select the current session first'
														: 'No earlier End Semester session'
												}
											/>
										</SelectTrigger>
										<SelectContent>
											{previousOptions.map((s, i) => (
												<SelectItem key={s.id} value={s.id}>
													{sessionLabel(s)}{i === 0 ? ' — immediately before' : ''}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<Button onClick={loadReport} disabled={!canGenerate} className="h-9">
									{loadingReport
										? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
										: <RefreshCw className="h-4 w-4 mr-2" />}
									Generate Report
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* ===== List ===== */}
					{report && (
						<Card className="flex-1 flex flex-col min-h-0">
							<CardHeader className="flex-shrink-0 px-4 py-3 border-b space-y-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div>
										<h2 className="text-base font-semibold">
											Paid in {report.previous_session.month_year || report.previous_session.session_name}, not paid in{' '}
											{report.current_session.month_year || report.current_session.session_name}
										</h2>
										<p className="text-xs text-muted-foreground">
											{filteredRows.length} of {rows.length} learner(s)
										</p>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											className="h-8 text-xs"
											onClick={handleExportExcel}
											disabled={filteredRows.length === 0}
										>
											<FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
											Excel
										</Button>
										<Button
											size="sm"
											className="h-8 text-xs"
											onClick={handleExportPdf}
											disabled={filteredRows.length === 0 || exportingPdf}
										>
											{exportingPdf
												? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
												: <FileText className="h-3.5 w-3.5 mr-1.5" />}
											Download PDF
										</Button>
									</div>
								</div>

								<div className="flex flex-wrap items-center gap-2">
									<Select value={programFilter} onValueChange={setProgramFilter}>
										<SelectTrigger className="h-8 w-[220px] text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={ALL}>All Programs</SelectItem>
											{programOptions.map(p => (
												<SelectItem key={p.code} value={p.code}>
													{p.code === NOT_MAPPED ? 'Not Mapped' : p.code}{p.name ? ` - ${p.name}` : ''} ({p.count})
												</SelectItem>
											))}
										</SelectContent>
									</Select>

									<Select value={batchFilter} onValueChange={setBatchFilter}>
										<SelectTrigger className="h-8 w-[140px] text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={ALL}>All Batches</SelectItem>
											{batchOptions.map(b => (
												<SelectItem key={b} value={String(b)}>{batchLabel(b)}</SelectItem>
											))}
										</SelectContent>
									</Select>

									<Select value={semesterFilter} onValueChange={setSemesterFilter}>
										<SelectTrigger className="h-8 w-[170px] text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={ALL}>All Previous Semesters</SelectItem>
											{semesterOptions.map(s => (
												<SelectItem key={s} value={String(s)}>
													{s === 0 ? 'Not Mapped' : `Semester ${toRoman(s)}`}
												</SelectItem>
											))}
										</SelectContent>
									</Select>

									<Select value={reasonFilter} onValueChange={setReasonFilter}>
										<SelectTrigger className="h-8 w-[200px] text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={ALL}>All Statuses</SelectItem>
											{DISCONTINUED_REASONS.map(reason => (
												<SelectItem key={reason} value={reason}>{reason}</SelectItem>
											))}
										</SelectContent>
									</Select>

									<div className="relative flex-1 min-w-[180px] max-w-xs">
										<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
										<Input
											value={searchTerm}
											onChange={e => setSearchTerm(e.target.value)}
											placeholder="Search register no or name…"
											className="h-8 pl-8 text-xs"
										/>
									</div>
								</div>
							</CardHeader>

							<CardContent className="p-0 flex-1 flex flex-col min-h-0">
								<div className="overflow-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="text-xs w-12">S.No</TableHead>
												<TableHead className="text-xs">Register No</TableHead>
												<TableHead className="text-xs">Learner Name</TableHead>
												<TableHead className="text-xs">Program</TableHead>
												<TableHead className="text-xs text-center">Batch</TableHead>
												<TableHead className="text-xs text-center">Previous Attended Semester</TableHead>
												<TableHead className="text-xs text-center">Previous Papers</TableHead>
													<TableHead className="text-xs text-center">Pending Arrears</TableHead>
												<TableHead className="text-xs">Current Session Status</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{pageRows.length === 0 ? (
												<TableRow>
													<TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
														{rows.length === 0
															? 'Every learner who paid in the previous session has paid in the current one.'
															: 'No learners match the selected filters.'}
													</TableCell>
												</TableRow>
											) : pageRows.map((r, i) => (
												<TableRow key={r.key}>
													<TableCell className="text-xs">{(currentPage - 1) * PAGE_SIZE + i + 1}</TableCell>
													<TableCell className="text-xs font-medium">{r.register_number}</TableCell>
													<TableCell className="text-xs">{r.student_name}</TableCell>
													<TableCell className="text-xs" title={r.program_name || undefined}>{r.program_code || '-'}</TableCell>
													<TableCell className="text-xs text-center">{r.batch_year || '-'}</TableCell>
													<TableCell className="text-xs text-center">
														{toRoman(r.previous_semester)}
														{r.is_final_semester && (
															<span className="ml-1 text-[10px] text-muted-foreground">(final)</span>
														)}
													</TableCell>
													<TableCell className="text-xs text-center">{r.previous_papers}</TableCell>
														<TableCell className="text-xs text-center">{r.pending_arrears || '-'}</TableCell>
													<TableCell className="text-xs">
														<Badge variant="outline" className={`text-[10px] font-medium ${REASON_BADGE[r.current_status]}`}>
															{r.current_status}
														</Badge>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>

								{filteredRows.length > PAGE_SIZE && (
									<div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
										<span>
											Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
										</span>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												className="h-7 px-2"
												onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
												disabled={currentPage === 1}
											>
												<ChevronLeft className="h-3.5 w-3.5" />
											</Button>
											<span>Page {currentPage} of {totalPages}</span>
											<Button
												variant="outline"
												size="sm"
												className="h-7 px-2"
												onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
												disabled={currentPage === totalPages}
											>
												<ChevronRight className="h-3.5 w-3.5" />
											</Button>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					)}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
