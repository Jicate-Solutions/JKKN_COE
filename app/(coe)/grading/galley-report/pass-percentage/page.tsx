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
	TrendingUp,
	Target,
	UserCheck,
	RefreshCw,
	BookOpen,
	BarChart3,
	FileDown,
	FileType
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { generatePassPercentagePDF, generateMultiBoardPassPercentagePDF, generateProgramPassPercentagePDF, generateMultiProgramPassPercentagePDF, generateCourseSummaryPDF, generateMultiCourseSummaryPDF, generateCourseSummaryTemplatePDF } from "@/lib/utils/generate-pass-percentage-pdf"
import { generatePassPercentageWord } from "@/lib/utils/generate-pass-percentage-word"
import type { PassPercentageReport } from "@/types/pass-percentage"

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

interface BoardOption {
	id: string
	board_code: string
	board_name: string
	board_type: string
}

interface ProgramOption {
	id: string
	program_code: string
	program_name: string
	program_type: string
}

const API_BASE = '/api/grading/pass-percentage-report'

export default function PassPercentageReportPage() {
	const { toast } = useToast()

	const {
		institutionId: globalInstitutionId,
		isReady: isInstitutionReady,
		mustSelectInstitution
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [boards, setBoards] = useState<BoardOption[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [reportType, setReportType] = useState<'board' | 'program'>('board')
	const [selectedBoardCodes, setSelectedBoardCodes] = useState<string[]>([])
	const [selectedProgramCodes, setSelectedProgramCodes] = useState<string[]>([])

	// Report data
	const [reportData, setReportData] = useState<PassPercentageReport | null>(null)
	const [allBoardReports, setAllBoardReports] = useState<PassPercentageReport[]>([])
	const [allProgramReports, setAllProgramReports] = useState<PassPercentageReport[]>([])

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingBoards, setLoadingBoards] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingReport, setLoadingReport] = useState(false)
	const [generatingPDF, setGeneratingPDF] = useState(false)
	const [generatingSummary, setGeneratingSummary] = useState(false)
	const [generatingCourseSummary, setGeneratingCourseSummary] = useState(false)
	const [generatingTemplate, setGeneratingTemplate] = useState(false)
	const [generatingWord, setGeneratingWord] = useState(false)

	// Popover states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [boardOpen, setBoardOpen] = useState(false)
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
			setLoadingInstitutions(true)
			const res = await fetch(`${API_BASE}?type=institutions`)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
				if (data.length === 1) setSelectedInstitutionId(data[0].id)
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		} finally {
			setLoadingInstitutions(false)
		}
	}

	useEffect(() => {
		if (selectedInstitutionId) {
			setSelectedSessionId("")
			setSelectedBoardCodes([])
			setSelectedProgramCodes([])
			setSessions([])
			setBoards([])
			setPrograms([])
			setReportData(null)
			fetchSessions(selectedInstitutionId)
		}
	}, [selectedInstitutionId])

	const fetchSessions = async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const res = await fetch(`${API_BASE}?type=sessions&institution_id=${institutionId}`)
			if (res.ok) setSessions(await res.json())
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoadingSessions(false)
		}
	}

	useEffect(() => {
		if (selectedSessionId && selectedInstitutionId) {
			setSelectedBoardCodes([])
			setSelectedProgramCodes([])
			setBoards([])
			setPrograms([])
			setReportData(null)
			fetchBoards(selectedInstitutionId)
			fetchPrograms(selectedInstitutionId, selectedSessionId)
		}
	}, [selectedSessionId])

	const fetchBoards = async (institutionId: string) => {
		try {
			setLoadingBoards(true)
			const res = await fetch(`${API_BASE}?type=boards&institution_id=${institutionId}`)
			if (res.ok) setBoards(await res.json())
		} catch (error) {
			console.error('Error fetching boards:', error)
		} finally {
			setLoadingBoards(false)
		}
	}

	const fetchPrograms = async (institutionId: string, sessionId: string) => {
		try {
			setLoadingPrograms(true)
			const res = await fetch(`${API_BASE}?type=programs&institution_id=${institutionId}&session_id=${sessionId}`)
			if (res.ok) setPrograms(await res.json())
		} catch (error) {
			console.error('Error fetching programs:', error)
		} finally {
			setLoadingPrograms(false)
		}
	}

	useEffect(() => {
		setSelectedBoardCodes([])
		setSelectedProgramCodes([])
		setReportData(null)
		setAllBoardReports([])
		setAllProgramReports([])
	}, [reportType])

	// ─── Generate Report ─────────────────────────────────
	const handleGenerateReport = async () => {
		if (!selectedInstitutionId || !selectedSessionId) {
			toast({ title: "Missing Information", description: "Please select institution and session.", variant: "destructive" })
			return
		}
		if (reportType === 'board' && selectedBoardCodes.length === 0) {
			toast({ title: "Missing Information", description: "Please select at least one board.", variant: "destructive" })
			return
		}
		if (reportType === 'program' && selectedProgramCodes.length === 0) {
			toast({ title: "Missing Information", description: "Please select at least one programme.", variant: "destructive" })
			return
		}

		try {
			setLoadingReport(true)

			if (reportType === 'board') {
				// Fetch all boards in parallel (preserves selection order via map)
				const results = await Promise.all(selectedBoardCodes.map(async (boardCode) => {
					const url = `${API_BASE}?institution_id=${selectedInstitutionId}&session_id=${selectedSessionId}&report_type=board&board_code=${boardCode}`
					const res = await fetch(url)
					if (!res.ok) return null
					const data = await res.json()
					return data.courses?.length > 0 ? data : null
				}))
				const allReports: PassPercentageReport[] = results.filter(Boolean) as PassPercentageReport[]

				if (allReports.length > 0) {
					const merged: PassPercentageReport = {
						...allReports[0],
						board: selectedBoardCodes.length === 1
							? allReports[0].board
							: { id: '', board_code: 'ALL', board_name: `${allReports.length} Boards`, board_type: allReports[0].board?.board_type || 'UG' },
						courses: allReports.flatMap(r => r.courses),
					}
					setReportData(merged)
					setAllBoardReports(allReports)
					setAllProgramReports([])
					const totalProgs = merged.courses.reduce((s, c) => s + c.programs.length, 0)
					toast({
						title: '✅ Report Generated',
						description: `${allReports.length} board(s), ${merged.courses.length} courses, ${totalProgs} programme entries.`,
						className: 'bg-green-50 border-green-200 text-green-800'
					})
				} else {
					toast({ title: "No Data Found", description: "No results found for the selected boards.", variant: "destructive" })
					setReportData(null)
					setAllBoardReports([])
				}
			} else {
				// Program-wise: fetch all programmes in parallel (preserves order via map)
				const results = await Promise.all(selectedProgramCodes.map(async (programCode) => {
					const url = `${API_BASE}?institution_id=${selectedInstitutionId}&session_id=${selectedSessionId}&report_type=program&program_code=${programCode}`
					const res = await fetch(url)
					if (!res.ok) return null
					const data = await res.json()
					return data.courses?.length > 0 ? data : null
				}))
				const allReports: PassPercentageReport[] = results.filter(Boolean) as PassPercentageReport[]

				if (allReports.length > 0) {
					// Merge all program reports for scorecards
					const merged: PassPercentageReport = {
						...allReports[0],
						program: selectedProgramCodes.length === 1
							? allReports[0].program
							: { program_code: 'ALL', program_name: `${allReports.length} Programmes` },
						courses: allReports.flatMap(r => r.courses),
					}
					setReportData(merged)
					setAllProgramReports(allReports)
					setAllBoardReports([])
					const totalCourses = allReports.reduce((s, r) => s + r.courses.length, 0)
					toast({
						title: '✅ Report Generated',
						description: `${allReports.length} programme(s), ${totalCourses} courses.`,
						className: 'bg-green-50 border-green-200 text-green-800'
					})
				} else {
					toast({ title: "No Data Found", description: "No results found for the selected programmes.", variant: "destructive" })
					setReportData(null)
					setAllProgramReports([])
				}
			}
		} catch (error) {
			console.error('Error generating report:', error)
			toast({ title: '❌ Error', description: 'An unexpected error occurred.', variant: 'destructive' })
		} finally {
			setLoadingReport(false)
		}
	}

	// ─── Summary ─────────────────────────────────────────
	const summary = useMemo(() => {
		if (!reportData?.courses?.length) return null
		let totalStudents = 0, totalAppeared = 0, totalPassed = 0
		reportData.courses.forEach(course => {
			course.programs.forEach(prog => {
				totalStudents += prog.total_students
				totalAppeared += prog.appeared
				totalPassed += prog.passed
			})
		})
		const overallPassPct = totalAppeared > 0 ? Math.round((totalPassed / totalAppeared) * 100) : 0
		return { totalStudents, totalAppeared, totalPassed, overallPassPct, totalCourses: reportData.courses.length }
	}, [reportData])

	// ─── Logos ────────────────────────────────────────────
	// Cache base64 logos so they're fetched/encoded only once per session
	const logoCacheRef = useRef<{ logoBase64: string; rightLogoBase64: string } | null>(null)
	const loadLogos = async () => {
		if (logoCacheRef.current) return logoCacheRef.current
		let logoBase64 = ''
		let rightLogoBase64 = ''
		try {
			const logoResponse = await fetch('/jkkn_logo.png')
			if (logoResponse.ok) {
				const blob = await logoResponse.blob()
				logoBase64 = await new Promise<string>((resolve) => {
					const reader = new FileReader()
					reader.onloadend = () => resolve(reader.result as string)
					reader.readAsDataURL(blob)
				})
			}
			const rightLogoResponse = await fetch('/jkkncas_logo.png')
			if (rightLogoResponse.ok) {
				const blob = await rightLogoResponse.blob()
				rightLogoBase64 = await new Promise<string>((resolve) => {
					const reader = new FileReader()
					reader.onloadend = () => resolve(reader.result as string)
					reader.readAsDataURL(blob)
				})
			}
		} catch (e) {
			console.warn('Logo not loaded:', e)
		}
		const logos = { logoBase64, rightLogoBase64 }
		logoCacheRef.current = logos
		return logos
	}

	// ─── Download PDF ────────────────────────────────────
	const handleDownloadPDF = async () => {
		if (!reportData) return
		try {
			setGeneratingPDF(true)
			const { logoBase64, rightLogoBase64 } = await loadLogos()
			let fileName: string

			if (reportType === 'board') {
				if (allBoardReports.length > 1) {
					fileName = generateMultiBoardPassPercentagePDF({ reports: allBoardReports, logoImage: logoBase64, rightLogoImage: rightLogoBase64 })
				} else {
					fileName = generatePassPercentagePDF({ report: reportData, logoImage: logoBase64, rightLogoImage: rightLogoBase64 })
				}
			} else {
				// Program-wise PDF
				if (allProgramReports.length > 1) {
					fileName = generateMultiProgramPassPercentagePDF({ reports: allProgramReports, logoImage: logoBase64, rightLogoImage: rightLogoBase64 })
				} else if (allProgramReports.length === 1) {
					fileName = generateProgramPassPercentagePDF({ report: allProgramReports[0], logoImage: logoBase64, rightLogoImage: rightLogoBase64 })
				} else {
					fileName = generateProgramPassPercentagePDF({ report: reportData, logoImage: logoBase64, rightLogoImage: rightLogoBase64 })
				}
			}

			toast({ title: '✅ PDF Generated', description: `Downloaded ${fileName}`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (error) {
			console.error('PDF generation error:', error)
			toast({ title: '❌ PDF Error', description: 'Failed to generate PDF.', variant: 'destructive' })
		} finally {
			setGeneratingPDF(false)
		}
	}

	// ─── Download Course-Wise Summary PDF ────────────────
	const handleDownloadSummary = async () => {
		if (!reportData) return
		try {
			setGeneratingSummary(true)
			const { logoBase64, rightLogoBase64 } = await loadLogos()
			const fileName = generateCourseSummaryPDF({ report: reportData, logoImage: logoBase64, rightLogoImage: rightLogoBase64 })
			toast({ title: '✅ Summary Generated', description: `Downloaded ${fileName}`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (error) {
			console.error('Summary PDF generation error:', error)
			toast({ title: '❌ PDF Error', description: 'Failed to generate Course-Wise Summary.', variant: 'destructive' })
		} finally {
			setGeneratingSummary(false)
		}
	}

	// ─── Download COURSE-WISE SUMMARY only (official 4 signatures) ──
	const handleDownloadCourseSummary = async () => {
		if (!reportData) return
		try {
			setGeneratingCourseSummary(true)
			const { logoBase64, rightLogoBase64 } = await loadLogos()
			let fileName: string

			// Each board/programme gets its own COURSE-WISE SUMMARY page (like page 4)
			const perReportSummaries =
				reportType === 'board' ? allBoardReports : allProgramReports

			if (perReportSummaries.length > 1) {
				fileName = generateMultiCourseSummaryPDF({ reports: perReportSummaries, logoImage: logoBase64, rightLogoImage: rightLogoBase64, fullSignatures: true })
			} else {
				const single = perReportSummaries[0] || reportData
				fileName = generateCourseSummaryPDF({ report: single, logoImage: logoBase64, rightLogoImage: rightLogoBase64, fullSignatures: true })
			}

			toast({ title: '✅ Board-Wise Summary Generated', description: `Downloaded ${fileName}`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (error) {
			console.error('Board-Wise Summary PDF generation error:', error)
			toast({ title: '❌ PDF Error', description: 'Failed to generate Board-Wise Summary.', variant: 'destructive' })
		} finally {
			setGeneratingCourseSummary(false)
		}
	}

	// ─── Download Course-Wise Summary TEMPLATE (marks blank) ──
	const handleDownloadTemplate = async () => {
		if (!reportData) return
		try {
			setGeneratingTemplate(true)
			const { logoBase64, rightLogoBase64 } = await loadLogos()
			const fileName = generateCourseSummaryTemplatePDF({ report: reportData, logoImage: logoBase64, rightLogoImage: rightLogoBase64 })
			toast({ title: '✅ Template Generated', description: `Downloaded ${fileName}`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (error) {
			console.error('Template PDF generation error:', error)
			toast({ title: '❌ PDF Error', description: 'Failed to generate Course-Wise Summary template.', variant: 'destructive' })
		} finally {
			setGeneratingTemplate(false)
		}
	}

	// ─── Download Course-Wise Summary as Word (.doc) ─────
	const handleDownloadWord = async () => {
		if (!reportData) return
		try {
			setGeneratingWord(true)
			const { logoBase64, rightLogoBase64 } = await loadLogos()
			// Use the per-board/per-programme reports so each starts on its own page
			const reports = reportType === 'board' ? allBoardReports : allProgramReports
			const finalReports = reports.length > 0 ? reports : [reportData]
			const fileName = await generatePassPercentageWord({
				reports: finalReports,
				reportType,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64,
				summaryOnly: true,
			})
			toast({ title: '✅ Word Generated', description: `Downloaded ${fileName}`, className: 'bg-green-50 border-green-200 text-green-800' })
		} catch (error) {
			console.error('Word generation error:', error)
			toast({ title: '❌ Word Error', description: 'Failed to generate Word file.', variant: 'destructive' })
		} finally {
			setGeneratingWord(false)
		}
	}

	// ─── Export CSV ──────────────────────────────────────
	const handleExportCSV = () => {
		if (!reportData?.courses?.length) return

		if (reportType === 'program' && allProgramReports.length > 0) {
			// Program-wise CSV: per-program with course rows
			const lines: string[] = [
				`Institution,${reportData.institution.name}`,
				`Session,${reportData.session.name}`,
				`Report Type,Programme-wise`,
				`Generated,${new Date(reportData.generated_at).toLocaleDateString()}`,
				'',
			]
			allProgramReports.forEach(progReport => {
				lines.push(`"${progReport.program?.program_name || progReport.program?.program_code}"`)
				lines.push('Semester,Course Code,Course Name,Total Students,Appeared,Passed,Pass %')
				progReport.courses.forEach(course => {
					const totalStu = course.programs.reduce((s, p) => s + p.total_students, 0)
					const totalApp = course.programs.reduce((s, p) => s + p.appeared, 0)
					const totalPas = course.programs.reduce((s, p) => s + p.passed, 0)
					const pct = totalApp > 0 ? Math.round((totalPas / totalApp) * 100) : 0
					lines.push(`${course.semester},"${course.course_code}","${course.course_name}",${totalStu},${totalApp},${totalPas},${pct}`)
				})
				lines.push('')
			})
			const csvContent = lines.join('\n')
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
			const link = document.createElement('a')
			link.href = URL.createObjectURL(blob)
			link.download = `pass-percentage-programs-${new Date().toISOString().slice(0, 10)}.csv`
			link.click()
			URL.revokeObjectURL(link.href)
		} else {
			// Board-wise CSV (unchanged)
			const lines: string[] = [
				`Institution,${reportData.institution.name}`,
				`Session,${reportData.session.name}`,
				`Report Type,${reportData.report_type === 'board' ? 'Board-wise' : 'Programme-wise'}`,
				reportData.board ? `Board,${reportData.board.board_name}` : `Programme,${reportData.program?.program_name}`,
				`Generated,${new Date(reportData.generated_at).toLocaleDateString()}`,
				'',
			]
			reportData.courses.forEach(course => {
				lines.push(`"${course.course_name} (${course.course_code})"`)
				lines.push('Semester,Name of the Programme,Total Students,Appeared,Passed,Pass %')
				course.programs.forEach(prog => {
					lines.push(`${prog.semester},"${prog.program_name}",${prog.total_students},${prog.appeared},${prog.passed},${prog.pass_percentage}`)
				})
				lines.push('')
			})
			const csvContent = lines.join('\n')
			const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
			const link = document.createElement('a')
			link.href = URL.createObjectURL(blob)
			const label = reportData.board?.board_code || reportData.program?.program_code || 'report'
			link.download = `pass-percentage-report-${label}-${new Date().toISOString().slice(0, 10)}.csv`
			link.click()
			URL.revokeObjectURL(link.href)
		}
		toast({ title: '✅ Exported', description: 'Report exported as CSV.', className: 'bg-green-50 border-green-200 text-green-800' })
	}

	// ─── Render ──────────────────────────────────────────
	return (
		<>
			{/* ─── Scorecards ─── */}
			{summary && (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 flex-shrink-0">
					<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-2xl font-bold tracking-tight">{summary.totalStudents}</p>
									<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Registered</p>
								</div>
								<Users className="h-5 w-5 text-blue-500/40" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-2xl font-bold tracking-tight">{summary.totalAppeared}</p>
									<p className="text-xs font-medium text-muted-foreground mt-0.5">Appeared</p>
								</div>
								<UserCheck className="h-5 w-5 text-amber-500/40" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-2xl font-bold tracking-tight">{summary.totalPassed}</p>
									<p className="text-xs font-medium text-muted-foreground mt-0.5">Passed</p>
								</div>
								<TrendingUp className="h-5 w-5 text-emerald-500/40" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-2xl font-bold tracking-tight">{summary.overallPassPct}%</p>
									<p className="text-xs font-medium text-muted-foreground mt-0.5">Overall Pass %</p>
								</div>
								<Target className="h-5 w-5 text-purple-500/40" />
							</div>
						</CardContent>
					</Card>
					<Card className="border-l-4 border-l-teal-500 hover:shadow-md transition-shadow">
						<CardContent className="p-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-2xl font-bold tracking-tight">{summary.totalCourses}</p>
									<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Courses</p>
								</div>
								<BookOpen className="h-5 w-5 text-teal-500/40" />
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
								<p className="text-base font-semibold">Pass Percentage Report</p>
								<p className="text-xs text-muted-foreground">Course-wise pass percentage by board or programme</p>
							</div>
							<div className="flex items-center gap-1.5">
								{reportData && (
									<>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button onClick={handleDownloadPDF} disabled={generatingPDF} variant="outline" size="sm" className="h-8 text-sm px-3">
													{generatingPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Download className="mr-1.5 h-3.5 w-3.5" />PDF</>}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Download PDF Report</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button onClick={handleDownloadCourseSummary} disabled={generatingCourseSummary} variant="outline" size="sm" className="h-8 text-sm px-3">
													{generatingCourseSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileDown className="mr-1.5 h-3.5 w-3.5" />Board Summary PDF</>}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Download BOARD-WISE SUMMARY only (official 4 signatures)</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button onClick={handleDownloadSummary} disabled={generatingSummary} variant="outline" size="sm" className="h-8 text-sm px-3">
													{generatingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Summary</>}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Download Board-Wise Summary (Board Chairman(s) &amp; Examiner(s))</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button onClick={handleDownloadTemplate} disabled={generatingTemplate} variant="outline" size="sm" className="h-8 text-sm px-3">
													{generatingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileText className="mr-1.5 h-3.5 w-3.5" />Template</>}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Download Board-Wise Summary Template (counts filled, marks blank)</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button onClick={handleDownloadWord} disabled={generatingWord} variant="outline" size="sm" className="h-8 text-sm px-3">
													{generatingWord ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileType className="mr-1.5 h-3.5 w-3.5" />Board Summary docx</>}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Download Board-Wise Summary as Word (.docx) — each board/programme on its own page</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button onClick={handleExportCSV} variant="outline" size="sm" className="h-8 text-sm px-3">
													<Download className="mr-1.5 h-3.5 w-3.5" />CSV
												</Button>
											</TooltipTrigger>
											<TooltipContent>Export as CSV</TooltipContent>
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

							{/* Report Type */}
							<RadioGroup value={reportType} onValueChange={(v) => setReportType(v as 'board' | 'program')} className="flex gap-3">
								<div className="flex items-center space-x-1.5">
									<RadioGroupItem value="board" id="board" />
									<Label htmlFor="board" className="text-sm cursor-pointer">Board</Label>
								</div>
								<div className="flex items-center space-x-1.5">
									<RadioGroupItem value="program" id="program" />
									<Label htmlFor="program" className="text-sm cursor-pointer">Programme</Label>
								</div>
							</RadioGroup>

							{/* Board multi-select */}
							{reportType === 'board' ? (
								<Popover open={boardOpen} onOpenChange={setBoardOpen}>
									<PopoverTrigger asChild>
										<Button variant="outline" role="combobox" className="h-8 text-sm justify-between min-w-[200px]" disabled={!selectedSessionId || loadingBoards}>
											{loadingBoards ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Loading...</>
												: selectedBoardCodes.length === 0 ? 'Select Board...'
												: selectedBoardCodes.length === boards.length ? 'All Boards'
												: (() => {
													const ugCount = selectedBoardCodes.filter(c => boards.find(b => b.board_code === c)?.board_type === 'UG').length
													const pgCount = selectedBoardCodes.filter(c => boards.find(b => b.board_code === c)?.board_type === 'PG').length
													const parts = []
													if (ugCount > 0) parts.push(`${ugCount} UG`)
													if (pgCount > 0) parts.push(`${pgCount} PG`)
													return parts.join(' + ')
												})()}
											<ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[320px] p-0" align="start">
										<Command>
											<CommandInput placeholder="Search board..." />
											<CommandList>
												<CommandEmpty>No boards found.</CommandEmpty>
												<CommandGroup heading="Quick Select">
													<CommandItem value="select-all" onSelect={() => {
														setSelectedBoardCodes(selectedBoardCodes.length === boards.length ? [] : boards.map(b => b.board_code))
													}}>
														<Check className={cn("mr-2 h-4 w-4", selectedBoardCodes.length === boards.length ? "opacity-100" : "opacity-0")} />
														<span className="font-semibold">Select All</span>
													</CommandItem>
													{(() => {
														const ugCodes = boards.filter(b => b.board_type === 'UG').map(b => b.board_code)
														const allUgSelected = ugCodes.length > 0 && ugCodes.every(c => selectedBoardCodes.includes(c))
														return (
															<CommandItem value="select-all-ug" onSelect={() => {
																setSelectedBoardCodes(prev => allUgSelected ? prev.filter(c => !ugCodes.includes(c)) : [...new Set([...prev, ...ugCodes])])
															}}>
																<Check className={cn("mr-2 h-4 w-4", allUgSelected ? "opacity-100" : "opacity-0")} />
																<span className="font-semibold">All UG Boards</span>
																<Badge variant="secondary" className="ml-auto text-xs">{ugCodes.length}</Badge>
															</CommandItem>
														)
													})()}
													{(() => {
														const pgCodes = boards.filter(b => b.board_type === 'PG').map(b => b.board_code)
														const allPgSelected = pgCodes.length > 0 && pgCodes.every(c => selectedBoardCodes.includes(c))
														return pgCodes.length > 0 ? (
															<CommandItem value="select-all-pg" onSelect={() => {
																setSelectedBoardCodes(prev => allPgSelected ? prev.filter(c => !pgCodes.includes(c)) : [...new Set([...prev, ...pgCodes])])
															}}>
																<Check className={cn("mr-2 h-4 w-4", allPgSelected ? "opacity-100" : "opacity-0")} />
																<span className="font-semibold">All PG Boards</span>
																<Badge variant="secondary" className="ml-auto text-xs">{pgCodes.length}</Badge>
															</CommandItem>
														) : null
													})()}
												</CommandGroup>
												{boards.some(b => b.board_type === 'UG') && (
													<CommandGroup heading="UG Boards">
														{boards.filter(b => b.board_type === 'UG').map(b => (
															<CommandItem key={b.id} value={`${b.board_code} ${b.board_name}`} onSelect={() => {
																setSelectedBoardCodes(prev => prev.includes(b.board_code) ? prev.filter(c => c !== b.board_code) : [...prev, b.board_code])
															}}>
																<Check className={cn("mr-2 h-4 w-4", selectedBoardCodes.includes(b.board_code) ? "opacity-100" : "opacity-0")} />
																{b.board_code} - {b.board_name}
															</CommandItem>
														))}
													</CommandGroup>
												)}
												{boards.some(b => b.board_type === 'PG') && (
													<CommandGroup heading="PG Boards">
														{boards.filter(b => b.board_type === 'PG').map(b => (
															<CommandItem key={b.id} value={`${b.board_code} ${b.board_name}`} onSelect={() => {
																setSelectedBoardCodes(prev => prev.includes(b.board_code) ? prev.filter(c => c !== b.board_code) : [...prev, b.board_code])
															}}>
																<Check className={cn("mr-2 h-4 w-4", selectedBoardCodes.includes(b.board_code) ? "opacity-100" : "opacity-0")} />
																{b.board_code} - {b.board_name}
															</CommandItem>
														))}
													</CommandGroup>
												)}
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
							) : (
								/* Programme multi-select (same pattern as board) */
								<Popover open={programOpen} onOpenChange={setProgramOpen}>
									<PopoverTrigger asChild>
										<Button variant="outline" role="combobox" className="h-8 text-sm justify-between min-w-[200px]" disabled={!selectedSessionId || loadingPrograms}>
											{loadingPrograms ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Loading...</>
												: selectedProgramCodes.length === 0 ? 'Select Programme...'
												: selectedProgramCodes.length === programs.length ? 'All Programmes'
												: (() => {
													const ugCount = selectedProgramCodes.filter(c => programs.find(p => p.program_code === c)?.program_type === 'UG').length
													const pgCount = selectedProgramCodes.filter(c => programs.find(p => p.program_code === c)?.program_type === 'PG').length
													const parts = []
													if (ugCount > 0) parts.push(`${ugCount} UG`)
													if (pgCount > 0) parts.push(`${pgCount} PG`)
													return parts.join(' + ')
												})()}
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
							)}

							{/* Generate */}
							<Button onClick={handleGenerateReport} disabled={loadingReport} size="sm" className="h-8 text-sm px-4">
								{loadingReport ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
								Generate
							</Button>
						</div>
					</CardHeader>

					<CardContent className="px-4 pb-4 pt-0 flex-1 flex flex-col min-h-0">
						{!reportData ? (
							<div className="flex-1 flex items-center justify-center min-h-[380px]">
								<div className="text-center">
									<BarChart3 className="h-8 w-8 opacity-20 mx-auto mb-2" />
									<p className="text-sm text-muted-foreground">Select filters and click Generate to view the report</p>
									<p className="text-xs text-muted-foreground mt-1">Choose session, board/programme, then generate</p>
								</div>
							</div>
						) : loadingReport ? (
							<div className="flex-1 flex items-center justify-center min-h-[380px]">
								<div className="text-center text-muted-foreground">
									<RefreshCw className="animate-spin h-5 w-5 mx-auto mb-2" />
									<p className="text-sm">Generating report...</p>
								</div>
							</div>
						) : reportType === 'program' && allProgramReports.length > 0 ? (
							/* ─── Programme-wise: per-program tables with course rows ─── */
							<div className="space-y-4 mt-3">
								{/* Report Header */}
								<div className="text-center py-3 border rounded-md bg-muted/30">
									<p className="text-xs text-muted-foreground">{reportData.institution.name}</p>
									<p className="text-base font-semibold mt-0.5">PASS PERCENTAGE REPORT</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{reportData.session.name} | Programme-wise | {allProgramReports.length} Programme(s)
									</p>
								</div>

								{/* Per-program tables */}
								{allProgramReports.map((progReport) => {
									const progName = progReport.program?.program_name || progReport.program?.program_code || 'Unknown'
									const progCode = progReport.program?.program_code || ''

									return (
										<div key={progCode} className="rounded-md border overflow-hidden">
											<div className="px-3 py-2 bg-muted/50 border-b">
												<p className="text-xs font-semibold">{progName} ({progCode})</p>
											</div>
											<Table>
												<TableHeader className="bg-muted/30">
													<TableRow>
														<TableHead className="text-xs font-semibold w-[50px]">Sem</TableHead>
														<TableHead className="text-xs font-semibold w-[100px]">Code</TableHead>
														<TableHead className="text-xs font-semibold">Name of the Course</TableHead>
														<TableHead className="text-xs font-semibold text-right">Total</TableHead>
														<TableHead className="text-xs font-semibold text-right">Appeared</TableHead>
														<TableHead className="text-xs font-semibold text-right">Passed</TableHead>
														<TableHead className="text-xs font-semibold text-right w-[80px]">Pass %</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{progReport.courses
														.sort((a, b) => {
															if (a.semester !== b.semester) return a.semester - b.semester
															const orderA = a.course_order ?? 999
															const orderB = b.course_order ?? 999
															if (orderA !== orderB) return orderA - orderB
															return a.course_code.localeCompare(b.course_code)
														})
														.map((course) => {
														const totalStu = course.programs.reduce((s, p) => s + p.total_students, 0)
														const totalApp = course.programs.reduce((s, p) => s + p.appeared, 0)
														const totalPas = course.programs.reduce((s, p) => s + p.passed, 0)
														const pct = totalApp > 0 ? Math.round((totalPas / totalApp) * 100) : 0

														return (
															<TableRow key={course.course_code} className="hover:bg-muted/50">
																<TableCell className="text-sm font-medium">{course.semester}</TableCell>
																<TableCell className="text-sm font-mono text-xs">{course.course_code}</TableCell>
																<TableCell className="text-sm">{course.course_name}</TableCell>
																<TableCell className="text-sm text-right">{totalStu}</TableCell>
																<TableCell className="text-sm text-right">{totalApp > 0 ? totalApp : '-'}</TableCell>
																<TableCell className="text-sm text-right">{totalPas}</TableCell>
																<TableCell className="text-sm text-right">
																	<Badge variant={pct >= 80 ? 'default' : pct >= 60 ? 'secondary' : 'destructive'} className="text-xs tabular-nums">
																		{pct}%
																	</Badge>
																</TableCell>
															</TableRow>
														)
													})}
													{/* Sub total */}
													{(() => {
														const grandTotal = progReport.courses.reduce((acc, c) => {
															c.programs.forEach(p => {
																acc.stu += p.total_students
																acc.app += p.appeared
																acc.pas += p.passed
															})
															return acc
														}, { stu: 0, app: 0, pas: 0 })
														const grandPct = grandTotal.app > 0 ? Math.round((grandTotal.pas / grandTotal.app) * 100) : 0
														return (
															<TableRow className="bg-muted/30 font-semibold">
																<TableCell colSpan={3} className="text-xs text-right">Sub Total</TableCell>
																<TableCell className="text-sm text-right">{grandTotal.stu}</TableCell>
																<TableCell className="text-sm text-right">{grandTotal.app}</TableCell>
																<TableCell className="text-sm text-right">{grandTotal.pas}</TableCell>
																<TableCell className="text-sm text-right">
																	<Badge variant={grandPct >= 80 ? 'default' : grandPct >= 60 ? 'secondary' : 'destructive'} className="text-xs tabular-nums">
																		{grandPct}%
																	</Badge>
																</TableCell>
															</TableRow>
														)
													})()}
												</TableBody>
											</Table>
										</div>
									)
								})}
							</div>
						) : (
							/* ─── Board-wise: per-course tables with programme rows (unchanged) ─── */
							<div className="space-y-4 mt-3">
								{/* Report Header */}
								<div className="text-center py-3 border rounded-md bg-muted/30">
									<p className="text-xs text-muted-foreground">{reportData.institution.name}</p>
									<p className="text-base font-semibold mt-0.5">PASS PERCENTAGE REPORT</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{reportData.session.name} | Board: {reportData.board?.board_name}
									</p>
								</div>

								{/* Course-wise Tables */}
								{reportData.courses.map((course) => {
									const totalStu = course.programs.reduce((s, p) => s + p.total_students, 0)
									const totalApp = course.programs.reduce((s, p) => s + p.appeared, 0)
									const totalPas = course.programs.reduce((s, p) => s + p.passed, 0)
									const subPct = totalApp > 0 ? Math.round((totalPas / totalApp) * 100) : 0

									return (
										<div key={course.course_code} className="rounded-md border overflow-hidden">
											<div className="px-3 py-2 bg-muted/50 border-b">
												<p className="text-xs font-semibold">{course.course_name} ({course.course_code})</p>
											</div>
											<Table>
												<TableHeader className="bg-muted/30">
													<TableRow>
														<TableHead className="text-xs font-semibold w-[70px]">Sem</TableHead>
														<TableHead className="text-xs font-semibold">Name of the Programme</TableHead>
														<TableHead className="text-xs font-semibold text-right">Total</TableHead>
														<TableHead className="text-xs font-semibold text-right">Appeared</TableHead>
														<TableHead className="text-xs font-semibold text-right">Passed</TableHead>
														<TableHead className="text-xs font-semibold text-right w-[80px]">Pass %</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{course.programs.map((prog, idx) => (
														<TableRow key={idx} className="hover:bg-muted/50">
															<TableCell className="text-sm font-medium">{prog.semester}</TableCell>
															<TableCell className="text-sm">{prog.program_name}</TableCell>
															<TableCell className="text-sm text-right">{prog.total_students}</TableCell>
															<TableCell className="text-sm text-right">{prog.appeared > 0 ? prog.appeared : '-'}</TableCell>
															<TableCell className="text-sm text-right">{prog.passed}</TableCell>
															<TableCell className="text-sm text-right">
																<Badge variant={prog.pass_percentage >= 80 ? 'default' : prog.pass_percentage >= 60 ? 'secondary' : 'destructive'} className="text-xs tabular-nums">
																	{prog.pass_percentage}%
																</Badge>
															</TableCell>
														</TableRow>
													))}
													{course.programs.length > 0 && (
														<TableRow className="bg-muted/30 font-semibold">
															<TableCell colSpan={2} className="text-xs text-right">Sub Total</TableCell>
															<TableCell className="text-sm text-right">{totalStu}</TableCell>
															<TableCell className="text-sm text-right">{totalApp}</TableCell>
															<TableCell className="text-sm text-right">{totalPas}</TableCell>
															<TableCell className="text-sm text-right">
																<Badge variant={subPct >= 80 ? 'default' : subPct >= 60 ? 'secondary' : 'destructive'} className="text-xs tabular-nums">
																	{subPct}%
																</Badge>
															</TableCell>
														</TableRow>
													)}
												</TableBody>
											</Table>
										</div>
									)
								})}

								{/* Course Summary */}
								<div className="rounded-md border overflow-hidden">
									<div className="px-3 py-2 bg-muted/50 border-b">
										<p className="text-xs font-semibold uppercase tracking-wider">Board-wise Summary</p>
									</div>
									<Table>
										<TableHeader className="bg-muted/30">
											<TableRow>
												<TableHead className="text-xs font-semibold w-[50px]">Sem</TableHead>
												<TableHead className="text-xs font-semibold w-[100px]">Code</TableHead>
												<TableHead className="text-xs font-semibold">Name of the Course</TableHead>
												<TableHead className="text-xs font-semibold text-right">Total</TableHead>
												<TableHead className="text-xs font-semibold text-right">Appeared</TableHead>
												<TableHead className="text-xs font-semibold text-right">Passed</TableHead>
												<TableHead className="text-xs font-semibold text-right w-[80px]">Pass %</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{reportData.courses.map((course) => {
												const cTotalStu = course.programs.reduce((s, p) => s + p.total_students, 0)
												const cTotalApp = course.programs.reduce((s, p) => s + p.appeared, 0)
												const cTotalPas = course.programs.reduce((s, p) => s + p.passed, 0)
												const cPct = cTotalApp > 0 ? Math.round((cTotalPas / cTotalApp) * 100) : 0

												return (
													<TableRow key={course.course_code} className="hover:bg-muted/50">
														<TableCell className="text-sm font-medium">{course.semester}</TableCell>
														<TableCell className="text-sm font-mono text-xs">{course.course_code}</TableCell>
														<TableCell className="text-sm">{course.course_name}</TableCell>
														<TableCell className="text-sm text-right">{cTotalStu}</TableCell>
														<TableCell className="text-sm text-right">{cTotalApp}</TableCell>
														<TableCell className="text-sm text-right">{cTotalPas}</TableCell>
														<TableCell className="text-sm text-right">
															<Badge variant={cPct >= 80 ? 'default' : cPct >= 60 ? 'secondary' : 'destructive'} className="text-xs tabular-nums">
																{cPct}%
															</Badge>
														</TableCell>
													</TableRow>
												)
											})}
										</TableBody>
									</Table>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</TooltipProvider>
		</>
	)
}
