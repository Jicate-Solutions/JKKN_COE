"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useSessionSync } from '@/hooks/use-session-sync'
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import {
	Loader2,
	FileText,
	Download,
	Check,
	ChevronsUpDown,
	Users,
	CheckCircle2,
	Target,
	RefreshCw,
	BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { generateAllClearPDF } from "@/lib/utils/generate-all-clear-pdf"

// ─── Interfaces ─────────────────────────────────────────
interface Institution {
	id: string
	institution_code: string
	institution_name: string
}

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
	session_type: string
}

interface ProgramOption {
	id: string
	program_code: string
	program_name: string
	program_type: string
}

interface SemesterRow {
	semester: number
	total_learners: number
	all_clear: number
	all_clear_pct: number
	regular_total: number
	regular_all_clear: number
	regular_all_clear_pct: number
}

interface AllClearReport {
	institution: { id: string; name: string; code: string }
	session: { id: string; name: string; code: string; exam_type_name: string }
	program: { program_code: string; program_name: string }
	summary: {
		total_learners: number
		all_clear: number
		all_clear_pct: number
		regular_total: number
		regular_all_clear: number
		regular_all_clear_pct: number
	}
	semesters: SemesterRow[]
	generated_at: string
}

type ViewMode = 'program' | 'program_semester' | 'regular'

// Dropdowns reuse the pass % report endpoints; aggregation uses the new route
const DROPDOWN_BASE = '/api/grading/pass-percentage-report'
const REPORT_BASE = '/api/grading/all-clear-report'

export default function AllClearReportPage() {
	const { toast } = useToast()

	const {
		institutionId: globalInstitutionId,
		isReady: isInstitutionReady,
		mustSelectInstitution
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [selectedProgramCodes, setSelectedProgramCodes] = useState<string[]>([])
	const [viewMode, setViewMode] = useState<ViewMode>('program')

	// Report data (one per selected programme)
	const [reports, setReports] = useState<AllClearReport[]>([])

	// Loading states
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingReport, setLoadingReport] = useState(false)
	const [generatingPDF, setGeneratingPDF] = useState(false)

	// Popover states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)

	// ─── Institution filter integration ──────────────────
	useEffect(() => {
		if (isInstitutionReady) {
			if (mustSelectInstitution) {
				fetchInstitutions()
			} else if (globalInstitutionId) {
				setSelectedInstitutionId(globalInstitutionId)
			}
		}
	}, [isInstitutionReady, mustSelectInstitution, globalInstitutionId])

	const fetchInstitutions = async () => {
		try {
			const res = await fetch(`${DROPDOWN_BASE}?type=institutions`)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
				if (data.length === 1) setSelectedInstitutionId(data[0].id)
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		}
	}

	useEffect(() => {
		if (selectedInstitutionId) {
			setSelectedSessionId("")
			setSelectedProgramCodes([])
			setSessions([])
			setPrograms([])
			setReports([])
			fetchSessions(selectedInstitutionId)
		}
	}, [selectedInstitutionId])

	const fetchSessions = async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const res = await fetch(`${DROPDOWN_BASE}?type=sessions&institution_id=${institutionId}`)
			if (res.ok) setSessions(await res.json())
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoadingSessions(false)
		}
	}

	useEffect(() => {
		if (selectedSessionId && selectedInstitutionId) {
			setSelectedProgramCodes([])
			setPrograms([])
			setReports([])
			fetchPrograms(selectedInstitutionId, selectedSessionId)
		}
	}, [selectedSessionId])

	const fetchPrograms = async (institutionId: string, sessionId: string) => {
		try {
			setLoadingPrograms(true)
			const res = await fetch(`${DROPDOWN_BASE}?type=programs&institution_id=${institutionId}&session_id=${sessionId}`)
			if (res.ok) setPrograms(await res.json())
		} catch (error) {
			console.error('Error fetching programs:', error)
		} finally {
			setLoadingPrograms(false)
		}
	}

	// ─── Generate Report ─────────────────────────────────
	const handleGenerateReport = async () => {
		if (!selectedInstitutionId || !selectedSessionId) {
			toast({ title: "Missing Information", description: "Please select institution and session.", variant: "destructive" })
			return
		}
		if (selectedProgramCodes.length === 0) {
			toast({ title: "Missing Information", description: "Please select at least one programme.", variant: "destructive" })
			return
		}

		try {
			setLoadingReport(true)
			// Fetch each selected programme in parallel (preserves selection order via map)
			const results = await Promise.all(selectedProgramCodes.map(async (programCode) => {
				const url = `${REPORT_BASE}?institution_id=${selectedInstitutionId}&session_id=${selectedSessionId}&program_code=${programCode}`
				const res = await fetch(url)
				if (!res.ok) return null
				const data = await res.json()
				return data.summary?.total_learners > 0 ? data : null
			}))
			const allReports = results.filter(Boolean) as AllClearReport[]

			if (allReports.length > 0) {
				setReports(allReports)
				const totalLearners = allReports.reduce((s, r) => s + r.summary.total_learners, 0)
				toast({
					title: '✅ Report Generated',
					description: `${allReports.length} programme(s), ${totalLearners} learners.`,
					className: 'bg-green-50 border-green-200 text-green-800'
				})
			} else {
				setReports([])
				toast({ title: "No Data Found", description: "No results found for the selected programmes.", variant: "destructive" })
			}
		} catch (error) {
			console.error('Error generating report:', error)
			toast({ title: '❌ Error', description: 'An unexpected error occurred.', variant: 'destructive' })
		} finally {
			setLoadingReport(false)
		}
	}

	// ─── Scorecard summary (across all programmes) ───────
	const summary = useMemo(() => {
		if (reports.length === 0) return null
		let total = 0, allClear = 0, regTotal = 0, regAllClear = 0
		reports.forEach(r => {
			total += r.summary.total_learners
			allClear += r.summary.all_clear
			regTotal += r.summary.regular_total
			regAllClear += r.summary.regular_all_clear
		})
		return {
			total,
			allClear,
			allClearPct: total > 0 ? Math.round((allClear / total) * 100) : 0,
			regAllClear,
			regAllClearPct: regTotal > 0 ? Math.round((regAllClear / regTotal) * 100) : 0,
		}
	}, [reports])

	// ─── Logos (cached once per session) ─────────────────
	const logoCacheRef = useRef<{ logoBase64: string; rightLogoBase64: string } | null>(null)
	const loadLogos = async () => {
		if (logoCacheRef.current) return logoCacheRef.current
		let logoBase64 = ''
		let rightLogoBase64 = ''
		const toDataUrl = async (path: string) => {
			const res = await fetch(path)
			if (!res.ok) return ''
			const blob = await res.blob()
			return await new Promise<string>((resolve) => {
				const reader = new FileReader()
				reader.onloadend = () => resolve(reader.result as string)
				reader.readAsDataURL(blob)
			})
		}
		try {
			logoBase64 = await toDataUrl('/jkkn_logo.png')
			rightLogoBase64 = await toDataUrl('/jkkncas_logo.png')
		} catch (e) {
			console.warn('Logo not loaded:', e)
		}
		const logos = { logoBase64, rightLogoBase64 }
		logoCacheRef.current = logos
		return logos
	}

	// ─── Download PDF (current view) ─────────────────────
	const handleDownloadPDF = async () => {
		if (reports.length === 0) return
		try {
			setGeneratingPDF(true)
			const { logoBase64, rightLogoBase64 } = await loadLogos()
			const fileName = generateAllClearPDF({
				reports,
				viewMode,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64,
			})
			toast({ title: '✅ PDF Generated', description: `Downloaded ${fileName}`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (error) {
			console.error('PDF generation error:', error)
			toast({ title: '❌ PDF Error', description: 'Failed to generate PDF.', variant: 'destructive' })
		} finally {
			setGeneratingPDF(false)
		}
	}

	// ─── Export CSV ──────────────────────────────────────
	const handleExportCSV = () => {
		if (reports.length === 0) return
		const first = reports[0]
		const modeLabel = viewMode === 'program' ? 'Programme-wise All Clear'
			: viewMode === 'program_semester' ? 'Programme & Semester-wise All Clear'
			: 'Regular Paper All Clear'
		const lines: string[] = [
			`Institution,${first.institution.name}`,
			`Session,${first.session.name}`,
			`Report,${modeLabel}`,
			`Generated,${new Date(first.generated_at).toLocaleDateString()}`,
			'',
		]

		if (viewMode === 'program') {
			lines.push('S.No,Programme Code,Programme,No. of Students Registered,No. of Students Passed,All Clear %')
			reports.forEach((r, i) => {
				lines.push(`${i + 1},"${r.program.program_code}","${r.program.program_name}",${r.summary.total_learners},${r.summary.all_clear},${r.summary.all_clear_pct}`)
			})
		} else if (viewMode === 'program_semester') {
			lines.push('Programme,S.No,Semester,No. of Students Registered,No. of Students Passed,All Clear %')
			reports.forEach(r => {
				r.semesters.forEach((s, i) => {
					lines.push(`"${r.program.program_name}",${i + 1},${toRoman(s.semester)},${s.total_learners},${s.all_clear},${s.all_clear_pct}`)
				})
			})
		} else {
			lines.push('S.No,Programme Code,Programme,Year,Semester,No. of Students Registered,No. of Students Passed,Pass %')
			reports.forEach((r, i) => {
				const sems = r.semesters.filter(s => s.regular_total > 0)
				if (sems.length === 0) {
					lines.push(`${i + 1},"${r.program.program_code}","${r.program.program_name}",,,${r.summary.regular_total},${r.summary.regular_all_clear},${r.summary.regular_all_clear_pct}`)
				} else {
					sems.forEach(s => {
						lines.push(`${i + 1},"${r.program.program_code}","${r.program.program_name}",${yearLabel(s.semester)},${toRoman(s.semester)},${s.regular_total},${s.regular_all_clear},${s.regular_all_clear_pct}`)
					})
				}
			})
		}

		const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
		const link = document.createElement('a')
		link.href = URL.createObjectURL(blob)
		link.download = `all-clear-${viewMode}-${new Date().toISOString().slice(0, 10)}.csv`
		link.click()
		URL.revokeObjectURL(link.href)
		toast({ title: '✅ Exported', description: 'Report exported as CSV.', className: 'bg-green-50 border-green-200 text-green-800' })
	}

	const pctBadgeVariant = (pct: number) => pct >= 80 ? 'default' : pct >= 60 ? 'secondary' : 'destructive'

	// 1 → I, 2 → II, 3 → III …
	const toRoman = (n: number): string => {
		if (!n || n < 1) return String(n)
		const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
		let r = ''
		let num = n
		for (const [v, s] of map) {
			while (num >= v) { r += s; num -= v }
		}
		return r
	}

	// Semester → Academic Year (Sem 1&2 → Year I, 3&4 → Year II, …)
	const yearLabel = (sem: number): string => `Year ${toRoman(Math.ceil(sem / 2))}`

	// ─── Render ──────────────────────────────────────────
	return (
		<>
			{/* ─── Scorecards ─── */}
			{summary && (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
					<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-2xl font-bold tracking-tight">{summary.total}</p>
									<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Learners</p>
								</div>
								<Users className="h-5 w-5 text-blue-500/40" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-2xl font-bold tracking-tight">{summary.allClear}</p>
									<p className="text-xs font-medium text-muted-foreground mt-0.5">All Clear</p>
								</div>
								<CheckCircle2 className="h-5 w-5 text-emerald-500/40" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-2xl font-bold tracking-tight">{summary.allClearPct}%</p>
									<p className="text-xs font-medium text-muted-foreground mt-0.5">All Clear %</p>
								</div>
								<Target className="h-5 w-5 text-purple-500/40" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-l-4 border-l-teal-500 hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-2xl font-bold tracking-tight">{summary.regAllClearPct}%</p>
									<p className="text-xs font-medium text-muted-foreground mt-0.5">Regular Paper All Clear %</p>
								</div>
								<CheckCircle2 className="h-5 w-5 text-teal-500/40" />
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* ─── Filters + Report Card ─── */}
			<TooltipProvider delayDuration={300}>
				<Card className="flex-1 flex flex-col min-h-0">
					<CardHeader className="flex-shrink-0 px-4 py-3 border-b space-y-3">
						{/* Row 1: Title + Actions */}
						<div className="flex items-center justify-between">
							<div>
								<p className="text-base font-semibold">All Clear Report</p>
								<p className="text-xs text-muted-foreground">Learners who passed every paper — programme &amp; semester wise</p>
							</div>
							<div className="flex items-center gap-1.5">
								{reports.length > 0 && (
									<>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button onClick={handleDownloadPDF} disabled={generatingPDF} variant="outline" size="sm" className="h-8 text-sm px-3">
													{generatingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="mr-1.5 h-3.5 w-3.5" />PDF</>}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Download current view as PDF (official letterhead + signatures)</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button onClick={handleExportCSV} variant="outline" size="sm" className="h-8 text-sm px-3">
													<Download className="mr-1.5 h-3.5 w-3.5" />CSV
												</Button>
											</TooltipTrigger>
											<TooltipContent>Export current view as CSV</TooltipContent>
										</Tooltip>
									</>
								)}
							</div>
						</div>

						{/* Row 2: Filters */}
						<div className="flex items-center gap-2 flex-wrap">
							{/* Institution (super_admin only) */}
							{mustSelectInstitution && (
								<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
									<PopoverTrigger asChild>
										<Button variant="outline" role="combobox" className="h-8 text-sm justify-between min-w-[180px]">
											{selectedInstitutionId
												? institutions.find(i => i.id === selectedInstitutionId)?.institution_name || 'Select...'
												: 'Institution...'}
											<ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[280px] p-0" align="start">
										<Command>
											<CommandInput placeholder="Search institution..." />
											<CommandList>
												<CommandEmpty>No institutions found.</CommandEmpty>
												<CommandGroup>
													{institutions.map(inst => (
														<CommandItem key={inst.id} value={inst.institution_name} onSelect={() => { setSelectedInstitutionId(inst.id); setInstitutionOpen(false) }}>
															<Check className={cn("mr-2 h-4 w-4", selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0")} />
															{inst.institution_name}
														</CommandItem>
													))}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
							)}

							{/* Session */}
							{mustSelectSession && (
								<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
									<PopoverTrigger asChild>
										<Button variant="outline" role="combobox" className="h-8 text-sm justify-between min-w-[200px]" disabled={!selectedInstitutionId || loadingSessions}>
											{loadingSessions ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Loading...</>
												: selectedSessionId ? sessions.find(s => s.id === selectedSessionId)?.session_name || 'Select...'
												: 'Session...'}
											<ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[300px] p-0" align="start">
										<Command>
											<CommandInput placeholder="Search session..." />
											<CommandList>
												<CommandEmpty>No sessions found.</CommandEmpty>
												<CommandGroup>
													{sessions.map(s => (
														<CommandItem key={s.id} value={s.session_name} onSelect={() => { setSelectedSessionId(s.id); setSessionOpen(false) }}>
															<Check className={cn("mr-2 h-4 w-4", selectedSessionId === s.id ? "opacity-100" : "opacity-0")} />
															{s.session_name}
														</CommandItem>
													))}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
							)}

							{/* Programme multi-select */}
							<Popover open={programOpen} onOpenChange={setProgramOpen}>
								<PopoverTrigger asChild>
									<Button variant="outline" role="combobox" className="h-8 text-sm justify-between min-w-[200px]" disabled={!selectedSessionId || loadingPrograms}>
										{loadingPrograms ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Loading...</>
											: selectedProgramCodes.length === 0 ? 'Select Programme...'
											: selectedProgramCodes.length === programs.length ? 'All Programmes'
											: `${selectedProgramCodes.length} selected`}
										<ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[380px] p-0" align="start">
									<Command>
										<CommandInput placeholder="Search programme..." />
										<CommandList>
											<CommandEmpty>No programmes found.</CommandEmpty>
											<CommandGroup heading="Quick Select">
												<CommandItem value="select-all-prog" onSelect={() => {
													setSelectedProgramCodes(selectedProgramCodes.length === programs.length ? [] : programs.map(p => p.program_code))
												}}>
													<Check className={cn("mr-2 h-4 w-4", selectedProgramCodes.length === programs.length ? "opacity-100" : "opacity-0")} />
													<span className="font-semibold">Select All</span>
												</CommandItem>
												{(() => {
													const ugCodes = programs.filter(p => p.program_type === 'UG').map(p => p.program_code)
													const allUgSelected = ugCodes.length > 0 && ugCodes.every(c => selectedProgramCodes.includes(c))
													return ugCodes.length > 0 ? (
														<CommandItem value="select-all-ug-prog" onSelect={() => {
															setSelectedProgramCodes(prev => allUgSelected ? prev.filter(c => !ugCodes.includes(c)) : [...new Set([...prev, ...ugCodes])])
														}}>
															<Check className={cn("mr-2 h-4 w-4", allUgSelected ? "opacity-100" : "opacity-0")} />
															<span className="font-semibold">All UG Programmes</span>
															<Badge variant="secondary" className="ml-auto text-xs">{ugCodes.length}</Badge>
														</CommandItem>
													) : null
												})()}
												{(() => {
													const pgCodes = programs.filter(p => p.program_type === 'PG').map(p => p.program_code)
													const allPgSelected = pgCodes.length > 0 && pgCodes.every(c => selectedProgramCodes.includes(c))
													return pgCodes.length > 0 ? (
														<CommandItem value="select-all-pg-prog" onSelect={() => {
															setSelectedProgramCodes(prev => allPgSelected ? prev.filter(c => !pgCodes.includes(c)) : [...new Set([...prev, ...pgCodes])])
														}}>
															<Check className={cn("mr-2 h-4 w-4", allPgSelected ? "opacity-100" : "opacity-0")} />
															<span className="font-semibold">All PG Programmes</span>
															<Badge variant="secondary" className="ml-auto text-xs">{pgCodes.length}</Badge>
														</CommandItem>
													) : null
												})()}
											</CommandGroup>
											{programs.some(p => p.program_type === 'UG') && (
												<CommandGroup heading="UG Programmes">
													{programs.filter(p => p.program_type === 'UG').map(p => (
														<CommandItem key={p.id} value={`${p.program_code} ${p.program_name}`} onSelect={() => {
															setSelectedProgramCodes(prev => prev.includes(p.program_code) ? prev.filter(c => c !== p.program_code) : [...prev, p.program_code])
														}}>
															<Check className={cn("mr-2 h-4 w-4", selectedProgramCodes.includes(p.program_code) ? "opacity-100" : "opacity-0")} />
															{p.program_code} - {p.program_name}
														</CommandItem>
													))}
												</CommandGroup>
											)}
											{programs.some(p => p.program_type === 'PG') && (
												<CommandGroup heading="PG Programmes">
													{programs.filter(p => p.program_type === 'PG').map(p => (
														<CommandItem key={p.id} value={`${p.program_code} ${p.program_name}`} onSelect={() => {
															setSelectedProgramCodes(prev => prev.includes(p.program_code) ? prev.filter(c => c !== p.program_code) : [...prev, p.program_code])
														}}>
															<Check className={cn("mr-2 h-4 w-4", selectedProgramCodes.includes(p.program_code) ? "opacity-100" : "opacity-0")} />
															{p.program_code} - {p.program_name}
														</CommandItem>
													))}
												</CommandGroup>
											)}
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>

							{/* Generate */}
							<Button onClick={handleGenerateReport} disabled={loadingReport} size="sm" className="h-8 text-sm px-4">
								{loadingReport ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
								Generate
							</Button>
						</div>

						{/* Row 3: View mode (shown once data exists) */}
						{reports.length > 0 && (
							<RadioGroup value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="flex gap-4 flex-wrap pt-1">
								<div className="flex items-center space-x-1.5">
									<RadioGroupItem value="program" id="m-program" />
									<Label htmlFor="m-program" className="text-sm cursor-pointer">Programme-wise</Label>
								</div>
								<div className="flex items-center space-x-1.5">
									<RadioGroupItem value="program_semester" id="m-progsem" />
									<Label htmlFor="m-progsem" className="text-sm cursor-pointer">Programme &amp; Semester-wise</Label>
								</div>
								<div className="flex items-center space-x-1.5">
									<RadioGroupItem value="regular" id="m-regular" />
									<Label htmlFor="m-regular" className="text-sm cursor-pointer">Regular Paper All Clear</Label>
								</div>
							</RadioGroup>
						)}
					</CardHeader>

					<CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col min-h-0">
						{reports.length === 0 ? (
							loadingReport ? (
								<div className="flex-1 flex items-center justify-center min-h-[380px]">
									<div className="text-center text-muted-foreground">
										<RefreshCw className="animate-spin h-5 w-5 mx-auto mb-2" />
										<p className="text-sm">Generating report...</p>
									</div>
								</div>
							) : (
								<div className="flex-1 flex items-center justify-center min-h-[380px]">
									<div className="text-center">
										<BarChart3 className="h-8 w-8 opacity-20 mx-auto mb-2" />
										<p className="text-sm text-muted-foreground">Select filters and click Generate to view the report</p>
										<p className="text-xs text-muted-foreground mt-1">Choose session and programme(s), then generate</p>
									</div>
								</div>
							)
						) : (
							<div className="space-y-4 mt-3">
								{/* Report Header */}
								<div className="text-center py-3 border rounded-md bg-muted/30">
									<p className="text-xs text-muted-foreground">{reports[0].institution.name}</p>
									<p className="text-base font-semibold mt-0.5">ALL CLEAR REPORT</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{reports[0].session.name} | {viewMode === 'program' ? 'Programme-wise'
											: viewMode === 'program_semester' ? 'Programme & Semester-wise'
											: 'Regular Paper All Clear'} | {reports.length} Programme(s)
									</p>
								</div>

								{/* ── Mode: Programme-wise ── */}
								{viewMode === 'program' && (
									<div className="rounded-md border overflow-hidden">
										<Table>
											<TableHeader className="bg-muted/30">
												<TableRow>
													<TableHead className="text-xs font-semibold w-[60px] text-center">S.No</TableHead>
													<TableHead className="text-xs font-semibold w-[100px]">Code</TableHead>
													<TableHead className="text-xs font-semibold">Name of the Programme</TableHead>
													<TableHead className="text-xs font-semibold text-right">No. of Students Registered</TableHead>
													<TableHead className="text-xs font-semibold text-right">No. of Students Passed</TableHead>
													<TableHead className="text-xs font-semibold text-right w-[100px]">All Clear %</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{reports.map((r, i) => (
													<TableRow key={r.program.program_code} className="hover:bg-muted/50">
														<TableCell className="text-sm text-center">{i + 1}</TableCell>
														<TableCell className="text-sm font-mono text-xs">{r.program.program_code}</TableCell>
														<TableCell className="text-sm">{r.program.program_name}</TableCell>
														<TableCell className="text-sm text-right">{r.summary.total_learners}</TableCell>
														<TableCell className="text-sm text-right">{r.summary.all_clear}</TableCell>
														<TableCell className="text-sm text-right">
															<Badge variant={pctBadgeVariant(r.summary.all_clear_pct)} className="text-xs tabular-nums">
																{r.summary.all_clear_pct}%
															</Badge>
														</TableCell>
													</TableRow>
												))}
												{summary && (
													<TableRow className="bg-muted/30 font-semibold">
														<TableCell colSpan={3} className="text-xs text-right">Grand Total</TableCell>
														<TableCell className="text-sm text-right">{summary.total}</TableCell>
														<TableCell className="text-sm text-right">{summary.allClear}</TableCell>
														<TableCell className="text-sm text-right">
															<Badge variant={pctBadgeVariant(summary.allClearPct)} className="text-xs tabular-nums">
																{summary.allClearPct}%
															</Badge>
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</div>
								)}

								{/* ── Mode: Programme & Semester-wise ── */}
								{viewMode === 'program_semester' && reports.map(r => (
									<div key={r.program.program_code} className="rounded-md border overflow-hidden">
										<div className="px-3 py-2 bg-muted/50 border-b">
											<p className="text-xs font-semibold">{r.program.program_name} ({r.program.program_code})</p>
										</div>
										<Table>
											<TableHeader className="bg-muted/30">
												<TableRow>
													<TableHead className="text-xs font-semibold w-[60px] text-center">S.No</TableHead>
													<TableHead className="text-xs font-semibold w-[80px]">Sem</TableHead>
													<TableHead className="text-xs font-semibold text-right">No. of Students Registered</TableHead>
													<TableHead className="text-xs font-semibold text-right">No. of Students Passed</TableHead>
													<TableHead className="text-xs font-semibold text-right w-[100px]">All Clear %</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{r.semesters.map((s, i) => (
													<TableRow key={s.semester} className="hover:bg-muted/50">
														<TableCell className="text-sm text-center">{i + 1}</TableCell>
														<TableCell className="text-sm font-medium">{toRoman(s.semester)}</TableCell>
														<TableCell className="text-sm text-right">{s.total_learners}</TableCell>
														<TableCell className="text-sm text-right">{s.all_clear}</TableCell>
														<TableCell className="text-sm text-right">
															<Badge variant={pctBadgeVariant(s.all_clear_pct)} className="text-xs tabular-nums">
																{s.all_clear_pct}%
															</Badge>
														</TableCell>
													</TableRow>
												))}
												<TableRow className="bg-muted/30 font-semibold">
													<TableCell colSpan={2} className="text-xs text-right">Sub Total</TableCell>
													<TableCell className="text-sm text-right">{r.summary.total_learners}</TableCell>
													<TableCell className="text-sm text-right">{r.summary.all_clear}</TableCell>
													<TableCell className="text-sm text-right">
														<Badge variant={pctBadgeVariant(r.summary.all_clear_pct)} className="text-xs tabular-nums">
															{r.summary.all_clear_pct}%
														</Badge>
													</TableCell>
												</TableRow>
											</TableBody>
										</Table>
									</div>
								))}

								{/* ── Mode: Regular Paper All Clear (year / semester-wise) ── */}
								{viewMode === 'regular' && (
									<>
										<p className="text-xs text-muted-foreground px-1">
											Considers only current-semester (regular) papers — arrear papers carried from earlier
											semesters are excluded. Broken down by academic year.
										</p>
										<div className="rounded-md border overflow-hidden">
											<Table>
												<TableHeader className="bg-muted/30">
													<TableRow>
														<TableHead className="text-xs font-semibold w-[60px] text-center">S.No</TableHead>
														<TableHead className="text-xs font-semibold w-[100px]">Code</TableHead>
														<TableHead className="text-xs font-semibold">Name of the Programme</TableHead>
														<TableHead className="text-xs font-semibold w-[150px]">Year</TableHead>
														<TableHead className="text-xs font-semibold text-right">No. of Students Registered</TableHead>
														<TableHead className="text-xs font-semibold text-right">No. of Students Passed</TableHead>
														<TableHead className="text-xs font-semibold text-right w-[100px]">Pass %</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{reports.map((r, i) => {
														const sems = r.semesters.filter(s => s.regular_total > 0)
														const rows = sems.length > 0 ? sems : [null]
														return rows.map((s, si) => (
															<TableRow key={`${r.program.program_code}-${s ? s.semester : 'na'}`} className="hover:bg-muted/50">
																{si === 0 && (
																	<>
																		<TableCell rowSpan={rows.length} className="text-sm text-center align-top">{i + 1}</TableCell>
																		<TableCell rowSpan={rows.length} className="font-mono text-xs align-top">{r.program.program_code}</TableCell>
																		<TableCell rowSpan={rows.length} className="text-sm align-top">{r.program.program_name}</TableCell>
																	</>
																)}
																<TableCell className="text-sm">
																	{s ? (
																		<span className="flex items-baseline gap-1">
																			<span className="font-medium">{yearLabel(s.semester)}</span>
																			<span className="text-xs text-muted-foreground">(Sem {toRoman(s.semester)})</span>
																		</span>
																	) : '—'}
																</TableCell>
																<TableCell className="text-sm text-right">{s ? s.regular_total : 0}</TableCell>
																<TableCell className="text-sm text-right">{s ? s.regular_all_clear : 0}</TableCell>
																<TableCell className="text-sm text-right">
																	<Badge variant={pctBadgeVariant(s ? s.regular_all_clear_pct : 0)} className="text-xs tabular-nums">
																		{s ? s.regular_all_clear_pct : 0}%
																	</Badge>
																</TableCell>
															</TableRow>
														))
													})}
													{summary && (
														<TableRow className="bg-muted/30 font-semibold">
															<TableCell colSpan={4} className="text-xs text-right">Grand Total</TableCell>
															<TableCell className="text-sm text-right">{reports.reduce((s, r) => s + r.summary.regular_total, 0)}</TableCell>
															<TableCell className="text-sm text-right">{summary.regAllClear}</TableCell>
															<TableCell className="text-sm text-right">
																<Badge variant={pctBadgeVariant(summary.regAllClearPct)} className="text-xs tabular-nums">
																	{summary.regAllClearPct}%
																</Badge>
															</TableCell>
														</TableRow>
													)}
												</TableBody>
											</Table>
										</div>
									</>
								)}
							</div>
						)}
					</CardContent>
				</Card>
			</TooltipProvider>
		</>
	)
}
