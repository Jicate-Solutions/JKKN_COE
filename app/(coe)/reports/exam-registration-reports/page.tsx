"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
	ClipboardCheck,
	FileText,
	FileSpreadsheet,
	Loader2,
	Check,
	ChevronsUpDown,
	Filter,
	ChevronLeft,
	ChevronRight,
	Users,
	BarChart3,
} from "lucide-react"
import type { ReportType } from "@/types/exam-registration-reports"
import { generateExamRegistrationReportPdf } from "@/lib/utils/generate-exam-registration-report-pdf"
import { exportExamRegistrationReportExcel } from "@/lib/utils/exam-registration-report-excel"

interface InstitutionOption {
	id: string
	institution_code: string
	name: string
}

interface SessionOption {
	id: string
	session_code: string
	session_name: string
}

const COURSE_CATEGORY_OPTIONS = ['Theory', 'Practical', 'Project', 'Field Work']

const REPORT_OPTIONS: { value: ReportType; label: string; description: string }[] = [
	{ value: 'student-fee-details', label: 'Student Fee Details', description: 'Learner-wise fee details with courses & amounts' },
	{ value: 'course-count-regular-arrear', label: 'Course Count (Regular/Arrear)', description: 'Course-wise student count split by Regular & Arrear' },
	{ value: 'course-count-year-wise', label: 'Course Count (Year-wise)', description: 'Course-wise student count split by Year' },
	{ value: 'course-count-program-year-wise', label: 'Course Count with Program (Year-wise)', description: 'Course-wise count with Program Code, split by Year' },
	{ value: 'course-count-program-year-section', label: 'Course Count (Program & Year Section)', description: 'Course-wise student count grouped by Program & Year — each program+year gets its own section' },
	{ value: 'exam-date-wise-registration', label: 'Exam Date-wise Registration', description: 'Course-wise registration count grouped by Exam Date & Session (FN/AN)' },
	{ value: 'exam-date-wise-attendance', label: 'Exam Date-wise Attendance', description: 'Course-wise registration & attendance count grouped by Exam Date & Session (FN/AN)' },
]

export default function ExamRegistrationReportsPage() {
	const { toast } = useToast()
	const { hasAnyRole } = useAuth()

	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// Filter state
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [sessions, setSessions] = useState<SessionOption[]>([])
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('')
	const [selectedSessionId, setSelectedSessionId] = useState<string>('')
	const [selectedCourseCategories, setSelectedCourseCategories] = useState<string[]>([...COURSE_CATEGORY_OPTIONS])
	const [selectedReportType, setSelectedReportType] = useState<ReportType>('course-count-regular-arrear')

	// Report data from API
	const [reportData, setReportData] = useState<any[]>([])
	const [reportMeta, setReportMeta] = useState<{
		institution_name: string
		institution_code: string
		session_name: string
		session_code: string
	} | null>(null)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingReport, setLoadingReport] = useState(false)
	const [exportingPdf, setExportingPdf] = useState(false)
	const [exportingExcel, setExportingExcel] = useState(false)

	// Popover states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [categoryOpen, setCategoryOpen] = useState(false)

	// Pagination
	const [currentPage, setCurrentPage] = useState(1)
	const pageSize = 50

	// ── Fetch institutions ──

	const fetchInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/master/institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(Array.isArray(data) ? data : data.data || [])
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl])

	useEffect(() => {
		if (isReady) fetchInstitutions()
	}, [isReady, fetchInstitutions])

	// Auto-select institution for non-super_admin
	useEffect(() => {
		if (institutions.length > 0) {
			if (institutions.length === 1) {
				setSelectedInstitutionId(institutions[0].id)
			} else if (shouldFilter && contextInstitutionId) {
				setSelectedInstitutionId(contextInstitutionId)
			} else if (!mustSelectInstitution && contextInstitutionId) {
				setSelectedInstitutionId(contextInstitutionId)
			}
		}
	}, [institutions, shouldFilter, mustSelectInstitution, contextInstitutionId])

	// ── Fetch sessions when institution changes ──

	const fetchSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			setSessions([])
			const res = await fetch(`/api/exam-management/examination-sessions?institutions_id=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(Array.isArray(data) ? data : data.data || [])
			}
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoadingSessions(false)
		}
	}, [])

	useEffect(() => {
		if (selectedInstitutionId) {
			fetchSessions(selectedInstitutionId)
			setSelectedSessionId('')
			setSelectedCourseCategories([...COURSE_CATEGORY_OPTIONS])
			setReportData([])
			setReportMeta(null)
		}
	}, [selectedInstitutionId, fetchSessions])

	// Reset pagination on data change
	useEffect(() => {
		setCurrentPage(1)
	}, [reportData])

	// ── Generate Report ──

	const fetchReport = useCallback(async () => {
		if (!selectedInstitutionId || !selectedSessionId) {
			toast({
				title: 'Missing Filters',
				description: 'Please select Institution and Session.',
				variant: 'destructive',
			})
			return
		}

		try {
			setLoadingReport(true)
			setReportData([])
			setReportMeta(null)

			const url = `/api/reports/exam-registration-reports?institutions_id=${selectedInstitutionId}&examination_session_id=${selectedSessionId}&report_type=${selectedReportType}`
			const res = await fetch(url)
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to fetch report data')
			}

			const result = await res.json()
			setReportData(result.data || [])
			setReportMeta({
				institution_name: result.institution_name || '',
				institution_code: result.institution_code || '',
				session_name: result.session_name || '',
				session_code: result.session_code || '',
			})

			toast({
				title: 'Report Generated',
				description: `Found ${result.data?.length || 0} registration records.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('Error generating report:', error)
			toast({
				title: 'Error',
				description: error instanceof Error ? error.message : 'Failed to generate report',
				variant: 'destructive',
			})
		} finally {
			setLoadingReport(false)
		}
	}, [selectedInstitutionId, selectedSessionId, selectedReportType, toast])

	// ── Filtered report data (by course category) ──

	const filteredReportData = useMemo(() => {
		if (selectedCourseCategories.length === COURSE_CATEGORY_OPTIONS.length) return reportData
		if (selectedCourseCategories.length === 0) return []
		return reportData.filter(r => {
			const cat = r.course_offering?.course_category
			return cat ? selectedCourseCategories.includes(cat) : false
		})
	}, [reportData, selectedCourseCategories])

	// ── Export PDF ──

	const handleExportPdf = useCallback(async () => {
		if (reportData.length === 0 || !reportMeta) {
			toast({ title: 'No Data', description: 'Generate a report first.', variant: 'destructive' })
			return
		}

		try {
			setExportingPdf(true)

			// Load logos
			let logoBase64: string | undefined
			let rightLogoBase64: string | undefined

			try {
				const [logoRes, rightLogoRes] = await Promise.all([
					fetch('/jkkn_logo.png'),
					fetch('/jkkncas_logo.png'),
				])
				if (logoRes.ok) {
					const blob = await logoRes.blob()
					logoBase64 = await new Promise<string>((resolve) => {
						const reader = new FileReader()
						reader.onloadend = () => resolve(reader.result as string)
						reader.readAsDataURL(blob)
					})
				}
				if (rightLogoRes.ok) {
					const blob = await rightLogoRes.blob()
					rightLogoBase64 = await new Promise<string>((resolve) => {
						const reader = new FileReader()
						reader.onloadend = () => resolve(reader.result as string)
						reader.readAsDataURL(blob)
					})
				}
			} catch (e) {
				console.warn('Logo not loaded:', e)
			}

			// Generate separate UG and PG PDFs
			const baseOpts = {
				report_type: selectedReportType,
				institution_name: reportMeta.institution_name,
				institution_code: reportMeta.institution_code,
				session_name: reportMeta.session_name,
				session_code: reportMeta.session_code,
				data: filteredReportData,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64,
				course_category_filter: selectedCourseCategories.length < COURSE_CATEGORY_OPTIONS.length ? selectedCourseCategories : undefined,
			}

			const fileNames: string[] = []

			// Exam date-wise reports: single combined file (no UG/PG split)
			const isDateWiseReport = selectedReportType === 'exam-date-wise-registration' || selectedReportType === 'exam-date-wise-attendance'

			if (isDateWiseReport) {
				const file = generateExamRegistrationReportPdf(baseOpts)
				if (file) fileNames.push(file)
			} else {
				// Other reports: separate UG and PG PDFs
				const ugFile = generateExamRegistrationReportPdf({ ...baseOpts, course_level: 'UG' })
				if (ugFile) fileNames.push(ugFile)
				const pgFile = generateExamRegistrationReportPdf({ ...baseOpts, course_level: 'PG' })
				if (pgFile) fileNames.push(pgFile)
			}

			if (fileNames.length === 0) {
				toast({ title: 'No Data', description: 'No data found for selected filters.', variant: 'destructive' })
				return
			}

			toast({
				title: 'PDF Generated',
				description: `${fileNames.join(' & ')} downloaded.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('PDF export error:', error)
			toast({ title: 'Export Failed', description: 'Failed to generate PDF.', variant: 'destructive' })
		} finally {
			setExportingPdf(false)
		}
	}, [filteredReportData, reportData, reportMeta, selectedCourseCategories, selectedReportType, toast])

	// ── Export Excel ──

	const handleExportExcel = useCallback(async () => {
		if (reportData.length === 0 || !reportMeta) {
			toast({ title: 'No Data', description: 'Generate a report first.', variant: 'destructive' })
			return
		}

		try {
			setExportingExcel(true)

			await exportExamRegistrationReportExcel({
				report_type: selectedReportType,
				institution_name: reportMeta.institution_name,
				institution_code: reportMeta.institution_code,
				session_name: reportMeta.session_name,
				session_code: reportMeta.session_code,
				data: filteredReportData,
				course_category_filter: selectedCourseCategories.length < COURSE_CATEGORY_OPTIONS.length ? selectedCourseCategories : undefined,
			})

			toast({
				title: 'Excel Exported',
				description: 'File has been downloaded.',
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (error) {
			console.error('Excel export error:', error)
			toast({ title: 'Export Failed', description: 'Failed to export Excel.', variant: 'destructive' })
		} finally {
			setExportingExcel(false)
		}
	}, [filteredReportData, reportData, reportMeta, selectedCourseCategories, selectedReportType, toast])

	// ── Aggregated preview data ──

	const previewData = useMemo(() => {
		if (filteredReportData.length === 0) return []

		const reportData2 = filteredReportData

		switch (selectedReportType) {
			case 'student-fee-details': {
				// Flatten to per-student rows with course list
				const studentMap = new Map<string, { name: string; dob: string; program_code: string; courses: { semester: number; course_code: string; course_name: string }[] }>()
				for (const row of reportData2) {
					const regNo = row.stu_register_no || 'Unknown'
					if (!studentMap.has(regNo)) {
						studentMap.set(regNo, { name: row.student_name || '', dob: row.date_of_birth || '', program_code: row.course_offering?.program_code || row.program_code || '', courses: [] })
					}
					const co = row.course_offering
					if (co) {
						studentMap.get(regNo)!.courses.push({ semester: co.semester || 0, course_code: co.course_code || '', course_name: co.course_name || '' })
					}
				}
				return Array.from(studentMap.entries())
					.sort((a, b) => a[0].localeCompare(b[0]))
					.map(([regNo, info]) => {
						info.courses.sort((a, b) => a.semester - b.semester || a.course_code.localeCompare(b.course_code))
						return { regNo, ...info }
					})
			}

			case 'course-count-regular-arrear': {
				const countMap = new Map<string, any>()
				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const key = `${co.board_code || ''}|${co.course_code}`
					if (!countMap.has(key)) {
						countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: co.program_code || '', program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', regular: 0, arrear: 0 })
					}
					const entry = countMap.get(key)!
					if (row.is_regular) entry.regular++
					else entry.arrear++
				}
				return Array.from(countMap.values()).sort((a: any, b: any) =>
				(a.board_order - b.board_order) || (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code)
				)
			}

			case 'course-count-year-wise': {
				const countMap = new Map<string, any>()
				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const key = `${co.board_code || ''}|${co.course_code}`
					const yearNum = Math.ceil((co.semester || 1) / 2)
					const roman = ['I', 'II', 'III', 'IV', 'V']
					const year = `${roman[yearNum - 1] || yearNum} Year`
					if (!countMap.has(key)) {
						countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: co.program_code || '', program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', years: {} })
					}
					const entry = countMap.get(key)!
					entry.years[year] = (entry.years[year] || 0) + 1
				}
				return Array.from(countMap.values()).sort((a: any, b: any) =>
				(a.board_order - b.board_order) || (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code)
				)
			}

			case 'course-count-program-year-wise': {
				const countMap = new Map<string, any>()
				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const programCode = co.program_code || row.program_code || ''
					const key = `${co.board_code || ''}|${programCode}|${co.course_code}`
					const yearNum = Math.ceil((co.semester || 1) / 2)
					const roman = ['I', 'II', 'III', 'IV', 'V']
					const year = `${roman[yearNum - 1] || yearNum} Year`
					if (!countMap.has(key)) {
						countMap.set(key, { board_code: co.board_code || '', board_name: co.board_name || '', board_order: co.board_order ?? 999, program_code: programCode, program_board_order: co.program_board_order ?? 999, program_order: co.program_order ?? 999, semester: co.semester || 0, course_order: co.course_order ?? 999, course_code: co.course_code, course_name: co.course_name || '', years: {} })
					}
					const entry = countMap.get(key)!
					entry.years[year] = (entry.years[year] || 0) + 1
				}
				return Array.from(countMap.values()).sort((a: any, b: any) =>
				(a.board_order - b.board_order) || (a.program_board_order - b.program_board_order) || (a.program_order - b.program_order) || a.program_code.localeCompare(b.program_code) || (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code)
			)
			}

			case 'course-count-program-year-section': {
				// Group by program_code + year → list of courses with student count
				const sectionMap = new Map<string, { program_code: string; program_name: string | null; program_board_order: number; program_order: number; year: string; yearIdx: number; courses: Map<string, { semester: number; course_order: number; course_code: string; course_name: string; count: number }> }>()
				const roman = ['I', 'II', 'III', 'IV', 'V']
				const yearOrder = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']

				for (const row of reportData2) {
					const co = row.course_offering
					if (!co) continue
					const programCode = co.program_code || row.program_code || ''
					const yearNum = Math.ceil((co.semester || 1) / 2)
					const year = `${roman[yearNum - 1] || yearNum} Year`
					const sectionKey = `${programCode}|${year}`

					if (!sectionMap.has(sectionKey)) {
						sectionMap.set(sectionKey, {
							program_code: programCode,
							program_name: co.program_name || null,
							program_board_order: co.program_board_order ?? 999,
							program_order: co.program_order ?? 999,
							year,
							yearIdx: yearOrder.indexOf(year),
							courses: new Map(),
						})
					}
					const section = sectionMap.get(sectionKey)!
					const courseKey = co.course_code
					if (!section.courses.has(courseKey)) {
						section.courses.set(courseKey, {
							semester: co.semester || 0,
							course_order: co.course_order ?? 999,
							course_code: co.course_code,
							course_name: co.course_name || '',
							count: 0,
						})
					}
					section.courses.get(courseKey)!.count++
				}

				return Array.from(sectionMap.values())
					.sort((a, b) =>
						(a.program_board_order - b.program_board_order) ||
						(a.program_order - b.program_order) ||
						a.program_code.localeCompare(b.program_code) ||
						(a.yearIdx - b.yearIdx)
					)
					.map(section => ({
						program_code: section.program_code,
						program_name: section.program_name,
						year: section.year,
						courses: Array.from(section.courses.values())
							.sort((a, b) => (a.semester - b.semester) || (a.course_order - b.course_order) || a.course_code.localeCompare(b.course_code)),
					}))
			}

			default:
				return []
		}
	}, [filteredReportData, selectedReportType])

	// Unique year columns for year-wise reports
	const yearColumns = useMemo(() => {
		if (selectedReportType !== 'course-count-year-wise' && selectedReportType !== 'course-count-program-year-wise') return []
		const allYears = new Set<string>()
		previewData.forEach((row: any) => {
			if (row.years) Object.keys(row.years).forEach(y => allYears.add(y))
		})
		const order = ['I Year', 'II Year', 'III Year', 'IV Year', 'V Year']
		return Array.from(allYears).sort((a, b) => order.indexOf(a) - order.indexOf(b))
	}, [previewData, selectedReportType])

	// Pagination
	const paginatedData = useMemo(() => {
		const start = (currentPage - 1) * pageSize
		return previewData.slice(start, start + pageSize)
	}, [previewData, currentPage])

	const totalPages = Math.ceil(previewData.length / pageSize) || 1

	// Display helpers
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)
	const currentReportOption = REPORT_OPTIONS.find(r => r.value === selectedReportType)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/dashboard">Dashboard</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="#">Reports</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Exam Registration Reports</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
								<ClipboardCheck className="h-5 w-5 text-white" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">Exam Registration Reports</h1>
								<p className="text-sm text-muted-foreground">Generate fee details and course-wise student count reports</p>
							</div>
						</div>
					</div>

					{/* Filters Card */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center gap-2">
								<Filter className="h-4 w-4" />
								<CardTitle className="text-sm">Filters</CardTitle>
							</div>
						</CardHeader>
						<CardContent>
							<div className={cn(
								"grid gap-4",
								mustSelectInstitution ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-5" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
							)}>
								{/* Institution (only for super_admin with "All Institutions") */}
								{mustSelectInstitution && (
									<div className="space-y-2">
										<Label className="text-xs">Institution *</Label>
										<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
											<PopoverTrigger asChild>
												<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9" disabled={loadingInstitutions}>
													<span className="truncate">
														{loadingInstitutions ? 'Loading...' : selectedInstitution ? `${selectedInstitution.institution_code} - ${selectedInstitution.name}` : 'Select Institution'}
													</span>
													<ChevronsUpDown className="h-3 w-3 ml-2 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[350px] p-0">
												<Command>
													<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
													<CommandList>
														<CommandEmpty className="py-2 text-xs">No institution found.</CommandEmpty>
														<CommandGroup>
															{institutions.map((inst) => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.name}`}
																	onSelect={() => {
																		setSelectedInstitutionId(inst.id)
																		setInstitutionOpen(false)
																	}}
																	className="text-xs"
																>
																	<Check className={cn("mr-2 h-3 w-3", selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0")} />
																	{inst.institution_code} - {inst.name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* Exam Session */}
								<div className="space-y-2">
									<Label className="text-xs">Examination Session *</Label>
									<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9" disabled={!selectedInstitutionId || loadingSessions}>
												<span className="truncate">
													{loadingSessions ? 'Loading...' : selectedSession ? selectedSession.session_name : 'Select Session'}
												</span>
												<ChevronsUpDown className="h-3 w-3 ml-2 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[300px] p-0">
											<Command>
												<CommandInput placeholder="Search session..." className="h-8 text-xs" />
												<CommandList>
													<CommandEmpty className="py-2 text-xs">No session found.</CommandEmpty>
													<CommandGroup>
														{sessions.map((sess) => (
															<CommandItem
																key={sess.id}
																value={sess.session_name}
																onSelect={() => {
																	setSelectedSessionId(sess.id)
																	setSessionOpen(false)
																}}
																className="text-xs"
															>
																<Check className={cn("mr-2 h-3 w-3", selectedSessionId === sess.id ? "opacity-100" : "opacity-0")} />
																{sess.session_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Course Category (multi-select) */}
								<div className="space-y-2">
									<Label className="text-xs">Course Category</Label>
									<Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9" disabled={!selectedSessionId}>
												<span className="truncate">
													{selectedCourseCategories.length === COURSE_CATEGORY_OPTIONS.length
														? 'All Categories'
														: selectedCourseCategories.length === 0
															? 'None selected'
															: selectedCourseCategories.length === 1
																? selectedCourseCategories[0]
																: `${selectedCourseCategories.length} selected`}
												</span>
												<ChevronsUpDown className="h-3 w-3 ml-2 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[220px] p-0">
											<Command>
												<CommandList>
													<CommandGroup>
														{COURSE_CATEGORY_OPTIONS.map((cat) => (
															<CommandItem
																key={cat}
																value={cat}
																onSelect={() => {
																	setSelectedCourseCategories(prev =>
																		prev.includes(cat)
																			? prev.filter(c => c !== cat)
																			: [...prev, cat]
																	)
																}}
																className="text-xs"
															>
																<Check className={cn("mr-2 h-3 w-3", selectedCourseCategories.includes(cat) ? "opacity-100" : "opacity-0")} />
																{cat}
															</CommandItem>
														))}
													</CommandGroup>
													{selectedCourseCategories.length < COURSE_CATEGORY_OPTIONS.length && (
														<CommandGroup>
															<CommandItem
																onSelect={() => setSelectedCourseCategories([...COURSE_CATEGORY_OPTIONS])}
																className="text-xs text-muted-foreground justify-center"
															>
																Select All
															</CommandItem>
														</CommandGroup>
													)}
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Report Type */}
								<div className="space-y-2">
									<Label className="text-xs">Report Type *</Label>
									<Select value={selectedReportType} onValueChange={(v) => setSelectedReportType(v as ReportType)}>
										<SelectTrigger className="text-xs h-9">
											<SelectValue placeholder="Select report type" />
										</SelectTrigger>
										<SelectContent>
											{REPORT_OPTIONS.map((opt) => (
												<SelectItem key={opt.value} value={opt.value} className="text-xs">
													{opt.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Generate Button */}
								<div className="space-y-2">
									<Label className="text-xs invisible">Action</Label>
									<Button
										onClick={fetchReport}
										disabled={!selectedInstitutionId || !selectedSessionId || loadingReport}
										className="w-full h-9 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
									>
										{loadingReport ? (
											<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
										) : (
											<><BarChart3 className="h-4 w-4 mr-2" /> Generate Report</>
										)}
									</Button>
								</div>
							</div>

							{/* Report description */}
							{currentReportOption && (
								<p className="text-xs text-muted-foreground mt-3">{currentReportOption.description}</p>
							)}
						</CardContent>
					</Card>

					{/* Summary & Export */}
					{reportData.length > 0 && reportMeta && (
						<Card>
							<CardContent className="pt-4">
								<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
									<div className="flex items-center gap-4 flex-wrap">
										<Badge variant="outline" className="text-xs">
											{reportMeta.institution_code} - {reportMeta.institution_name}
										</Badge>
										<Badge variant="outline" className="text-xs">
											{reportMeta.session_name}
										</Badge>
										<Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
											<Users className="h-3 w-3 mr-1" />
											{reportData.length} registrations
										</Badge>
										<Badge variant="secondary" className="text-xs">
											{previewData.length} rows in preview
										</Badge>
									</div>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={handleExportPdf}
											disabled={exportingPdf}
										>
											{exportingPdf ? (
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											) : (
												<FileText className="h-4 w-4 mr-2" />
											)}
											PDF
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={handleExportExcel}
											disabled={exportingExcel}
										>
											{exportingExcel ? (
												<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											) : (
												<FileSpreadsheet className="h-4 w-4 mr-2" />
											)}
											Excel
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Preview Table */}
					{previewData.length > 0 && (
						<Card>
							<CardHeader className="pb-3">
								<CardTitle className="text-sm">Preview: {currentReportOption?.label}</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="rounded-md border overflow-x-auto">
									{selectedReportType === 'student-fee-details' && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Register No</TableHead>
													<TableHead>Name</TableHead>
													<TableHead className="text-center">DOB</TableHead>
													<TableHead className="text-center">Courses</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => (
														<TableRow key={idx}>
															<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
															<TableCell className="text-center text-xs font-medium">{row.regNo}</TableCell>
															<TableCell className="text-xs">{row.name}</TableCell>
															<TableCell className="text-center text-xs">{row.dob || '-'}</TableCell>
															<TableCell className="text-center text-xs font-semibold">{row.courses.length}</TableCell>
														</TableRow>
													))
												)}
											</TableBody>
										</Table>
									)}

									{selectedReportType === 'course-count-regular-arrear' && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Board</TableHead>
													<TableHead className="text-center">Course Code</TableHead>
													<TableHead>Course Name</TableHead>
													<TableHead className="text-center">Regular</TableHead>
													<TableHead className="text-center">Arrear</TableHead>
													<TableHead className="text-center">Total</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => (
														<TableRow key={idx}>
															<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
															<TableCell className="text-center text-xs whitespace-nowrap">{row.board_code ? `${row.board_code}${row.board_name ? ` (${row.board_name})` : ''}` : '-'}</TableCell>
															<TableCell className="text-center text-xs font-medium">{row.course_code}</TableCell>
															<TableCell className="text-xs max-w-[200px] break-words">{row.course_name || '-'}</TableCell>
															<TableCell className="text-center text-xs">{row.regular}</TableCell>
															<TableCell className="text-center text-xs">{row.arrear}</TableCell>
															<TableCell className="text-center text-xs font-semibold">{row.regular + row.arrear}</TableCell>
														</TableRow>
													))
												)}
											</TableBody>
										</Table>
									)}

									{selectedReportType === 'course-count-year-wise' && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Board</TableHead>
													<TableHead className="text-center">Course Code</TableHead>
													<TableHead className="text-center">Course Name</TableHead>
													{yearColumns.map(y => (
														<TableHead key={y} className="text-center">{y}</TableHead>
													))}
													<TableHead className="text-center">Total</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={5 + yearColumns.length} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => {
														const total = yearColumns.reduce((sum, y) => sum + (row.years[y] || 0), 0)
														return (
															<TableRow key={idx}>
																<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
																<TableCell className="text-center text-xs whitespace-nowrap">{row.board_code ? `${row.board_code}${row.board_name ? ` (${row.board_name})` : ''}` : '-'}</TableCell>
																<TableCell className="text-center text-xs font-medium">{row.course_code}</TableCell>
																<TableCell className="text-xs max-w-[200px] break-words">{row.course_name || '-'}</TableCell>
																{yearColumns.map(y => (
																	<TableCell key={y} className="text-center text-xs">{row.years[y] || 0}</TableCell>
																))}
																<TableCell className="text-center text-xs font-semibold">{total}</TableCell>
															</TableRow>
														)
													})
												)}
											</TableBody>
										</Table>
									)}

									{selectedReportType === 'course-count-program-year-wise' && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-center w-12">S.No</TableHead>
													<TableHead className="text-center">Board</TableHead>
													<TableHead className="text-center">Program</TableHead>
													<TableHead className="text-center">Course Code</TableHead>
													<TableHead className="text-center">Course Name</TableHead>
													{yearColumns.map(y => (
														<TableHead key={y} className="text-center">{y}</TableHead>
													))}
													<TableHead className="text-center">Total</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{paginatedData.length === 0 ? (
													<TableRow>
														<TableCell colSpan={6 + yearColumns.length} className="text-center py-8 text-muted-foreground">No data</TableCell>
													</TableRow>
												) : (
													paginatedData.map((row: any, idx: number) => {
														const total = yearColumns.reduce((sum, y) => sum + (row.years[y] || 0), 0)
														return (
															<TableRow key={idx}>
																<TableCell className="text-center text-xs">{(currentPage - 1) * pageSize + idx + 1}</TableCell>
																<TableCell className="text-center text-xs whitespace-nowrap">{row.board_code ? `${row.board_code}${row.board_name ? ` (${row.board_name})` : ''}` : '-'}</TableCell>
																<TableCell className="text-center text-xs">{row.program_code || '-'}</TableCell>
																<TableCell className="text-center text-xs font-medium">{row.course_code}</TableCell>
																<TableCell className="text-xs max-w-[200px] break-words">{row.course_name || '-'}</TableCell>
																{yearColumns.map(y => (
																	<TableCell key={y} className="text-center text-xs">{row.years[y] || 0}</TableCell>
																))}
																<TableCell className="text-center text-xs font-semibold">{total}</TableCell>
															</TableRow>
														)
													})
												)}
											</TableBody>
										</Table>
									)}

									{selectedReportType === 'course-count-program-year-section' && (
										<div className="space-y-6">
											{previewData.length === 0 ? (
												<div className="text-center py-8 text-muted-foreground">No data</div>
											) : (
												previewData.map((section: any, sIdx: number) => (
													<div key={`${section.program_code}-${section.year}`} className="border rounded-lg overflow-hidden">
														<div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 flex items-center justify-between">
															<span className="font-semibold text-sm">
																Program : {section.program_code}{section.program_name ? ` - ${section.program_name}` : ''}
															</span>
															<span className="font-semibold text-sm">Year : {section.year}</span>
														</div>
														<Table>
															<TableHeader>
																<TableRow>
																	<TableHead className="text-center w-12">S.No</TableHead>
																	<TableHead className="text-center w-16">Sem</TableHead>
																	<TableHead className="text-center">Course Code</TableHead>
																	<TableHead>Course Name</TableHead>
																	<TableHead className="text-center w-28">No. of Students</TableHead>
																</TableRow>
															</TableHeader>
															<TableBody>
																{section.courses.map((course: any, cIdx: number) => (
																	<TableRow key={course.course_code}>
																		<TableCell className="text-center text-xs">{cIdx + 1}</TableCell>
																		<TableCell className="text-center text-xs">{course.semester}</TableCell>
																		<TableCell className="text-center text-xs font-medium">{course.course_code}</TableCell>
																		<TableCell className="text-xs">{course.course_name}</TableCell>
																		<TableCell className="text-center text-xs font-semibold">{course.count}</TableCell>
																	</TableRow>
																))}
															</TableBody>
														</Table>
													</div>
												))
											)}
										</div>
									)}
								</div>

								{/* Pagination */}
								{totalPages > 1 && (
									<div className="flex items-center justify-between mt-4">
										<p className="text-xs text-muted-foreground">
											Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, previewData.length)} of {previewData.length} rows
										</p>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="icon"
												className="h-7 w-7"
												onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
												disabled={currentPage === 1}
											>
												<ChevronLeft className="h-4 w-4" />
											</Button>
											<span className="text-xs">
												Page {currentPage} of {totalPages}
											</span>
											<Button
												variant="outline"
												size="icon"
												className="h-7 w-7"
												onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
												disabled={currentPage === totalPages}
											>
												<ChevronRight className="h-4 w-4" />
											</Button>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					)}

					{/* Empty State */}
					{reportData.length === 0 && !loadingReport && (
						<Card>
							<CardContent className="py-16">
								<div className="flex flex-col items-center justify-center text-center">
									<div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
										<ClipboardCheck className="h-8 w-8 text-muted-foreground" />
									</div>
									<h3 className="text-lg font-semibold mb-1">No Report Generated</h3>
									<p className="text-sm text-muted-foreground max-w-md">
										Select an Institution, Examination Session, and Report Type, then click "Generate Report" to view and download the data.
									</p>
								</div>
							</CardContent>
						</Card>
					)}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
