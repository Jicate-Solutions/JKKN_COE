"use client"

import { useState, useEffect, useCallback } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/common/use-toast"
import { Loader2, FileSpreadsheet, FileText, Check, ChevronsUpDown, X, Download, BookOpen, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { generateCourseCountPDF } from "@/lib/utils/generate-course-count-pdf"
import { exportCourseCountProgramWise, exportCourseCountBoardWise, downloadExcel } from "@/lib/utils/course-count-excel-export"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import type { CourseCountReportData, ProgramCourseCount, BoardCourseCount } from "@/types/course-count-report"

interface Institution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[]
}

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
	session_type: string
	start_date: string
	end_date: string
}

interface Course {
	course_code: string
	course_title: string
}

export default function CourseCountReportPage() {
	const { toast } = useToast()

	// Institution filter hook - per MyJKKN COE dev rules
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId,
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [availableCourses, setAvailableCourses] = useState<Course[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const [selectedSessionId, setSelectedSessionId] = useState<string>("")
	const [selectedCourseCodes, setSelectedCourseCodes] = useState<string[]>([])

	// Report data
	const [reportData, setReportData] = useState<CourseCountReportData | null>(null)
	const [viewType, setViewType] = useState<'program' | 'board'>('program')

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [loadingReport, setLoadingReport] = useState(false)
	const [generatingPDF, setGeneratingPDF] = useState(false)
	const [generatingExcel, setGeneratingExcel] = useState(false)

	// Popover open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Load institutions when context is ready
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady])

	const fetchInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/exam-management/exam-attendance/dropdowns?type=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)

				if (data.length === 1) {
					setSelectedInstitutionId(data[0].id)
				} else if (shouldFilter && contextInstitutionId) {
					setSelectedInstitutionId(contextInstitutionId)
				} else if (!mustSelectInstitution && contextInstitutionId) {
					setSelectedInstitutionId(contextInstitutionId)
				}
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		} finally {
			setLoadingInstitutions(false)
		}
	}, [appendToUrl, shouldFilter, mustSelectInstitution, contextInstitutionId])

	// Institution → Sessions
	useEffect(() => {
		if (selectedInstitutionId) {
			setSelectedSessionId("")
			setSelectedCourseCodes([])
			setSessions([])
			setAvailableCourses([])
			setReportData(null)
			fetchSessions(selectedInstitutionId)
		} else {
			setSessions([])
		}
	}, [selectedInstitutionId])

	const fetchSessions = async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const res = await fetch(`/api/exam-management/exam-attendance/dropdowns?type=sessions&institution_id=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(data)
			}
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoadingSessions(false)
		}
	}

	// Session → Courses (for filtering)
	useEffect(() => {
		if (selectedSessionId && selectedInstitutionId) {
			setSelectedCourseCodes([])
			setReportData(null)
			fetchAvailableCourses()
		}
	}, [selectedSessionId])

	const fetchAvailableCourses = async () => {
		if (!selectedInstitutionId || !selectedSessionId) return

		try {
			setLoadingCourses(true)
			// Fetch courses from exam_registrations that have fee_paid = true
			const res = await fetch(
				`/api/exam-management/reports/course-count?institution_id=${selectedInstitutionId}&session_id=${selectedSessionId}`
			)
			if (res.ok) {
				const data: CourseCountReportData = await res.json()
				// Extract unique courses from records
				const uniqueCourses = Array.from(
					new Map(data.records.map(r => [r.course_code, { course_code: r.course_code, course_title: r.course_title }])).values()
				).sort((a, b) => a.course_code.localeCompare(b.course_code))
				setAvailableCourses(uniqueCourses)
			}
		} catch (error) {
			console.error('Error fetching courses:', error)
		} finally {
			setLoadingCourses(false)
		}
	}

	// Generate Report
	const handleGenerateReport = async () => {
		if (!selectedInstitutionId || !selectedSessionId) {
			toast({
				title: "Missing Information",
				description: "Please select Institution and Examination Session.",
				variant: "destructive",
			})
			return
		}

		try {
			setLoadingReport(true)

			// Build query parameters
			const params = new URLSearchParams({
				institution_id: selectedInstitutionId,
				session_id: selectedSessionId,
			})

			if (selectedCourseCodes.length > 0) {
				params.append('course_codes', selectedCourseCodes.join(','))
			}

			const response = await fetch(`/api/exam-management/reports/course-count?${params.toString()}`)

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to fetch report data')
			}

			const data: CourseCountReportData = await response.json()
			setReportData(data)

			if (data.records.length === 0) {
				toast({
					title: "No Data",
					description: "No course registrations found with fee paid for the selected criteria.",
					className: "bg-blue-50 border-blue-200 text-blue-800",
				})
			} else {
				toast({
					title: "Report Generated",
					description: `Found ${data.summary.total_courses} courses across ${data.summary.total_programs} programs with ${data.summary.grand_total} total registrations.`,
					className: "bg-green-50 border-green-200 text-green-800",
				})
			}

		} catch (error) {
			console.error('Error generating report:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to generate report'
			toast({
				title: "Generation Failed",
				description: errorMessage,
				variant: "destructive",
			})
		} finally {
			setLoadingReport(false)
		}
	}

	// Download PDF
	const handleDownloadPDF = async () => {
		if (!reportData) return

		try {
			setGeneratingPDF(true)

			// Load logos
			let logoBase64 = undefined
			let rightLogoBase64 = undefined
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

			const fileName = generateCourseCountPDF({
				metadata: reportData.metadata,
				data: viewType === 'board' ? reportData.board_wise : reportData.program_wise,
				view_type: viewType,
				summary: reportData.summary,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64
			})

			toast({
				title: "PDF Downloaded",
				description: `${fileName} has been downloaded successfully.`,
				className: "bg-green-50 border-green-200 text-green-800",
			})

		} catch (error) {
			console.error('Error generating PDF:', error)
			toast({
				title: "Download Failed",
				description: "Failed to generate PDF report.",
				variant: "destructive",
			})
		} finally {
			setGeneratingPDF(false)
		}
	}

	// Download Excel
	const handleDownloadExcel = async () => {
		if (!reportData) return

		try {
			setGeneratingExcel(true)

			let buffer: Buffer
			let filename: string

			if (viewType === 'board') {
				buffer = await exportCourseCountBoardWise(reportData)
				filename = `Course_Count_Report_Board_Wise_${reportData.metadata.session_code.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
			} else {
				buffer = await exportCourseCountProgramWise(reportData)
				filename = `Course_Count_Report_Program_Wise_${reportData.metadata.session_code.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
			}

			downloadExcel(buffer, filename)

			toast({
				title: "Excel Downloaded",
				description: `${filename} has been downloaded successfully.`,
				className: "bg-green-50 border-green-200 text-green-800",
			})

		} catch (error) {
			console.error('Error generating Excel:', error)
			toast({
				title: "Download Failed",
				description: "Failed to generate Excel report.",
				variant: "destructive",
			})
		} finally {
			setGeneratingExcel(false)
		}
	}

	// Toggle course selection
	const toggleCourseSelection = (courseCode: string) => {
		setSelectedCourseCodes(prev => {
			if (prev.includes(courseCode)) {
				return prev.filter(c => c !== courseCode)
			} else {
				return [...prev, courseCode]
			}
		})
	}

	// Clear course selection
	const clearCourseSelection = () => {
		setSelectedCourseCodes([])
	}

	// Get display values
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col p-4 pt-0 overflow-y-auto gap-4">
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
								<BreadcrumbPage>Course Count Report</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex flex-col">
						<h1 className="text-2xl font-bold">Course Count Report</h1>
						<p className="text-sm text-muted-foreground">
							Generate course count report for question paper preparation (fee paid registrations only)
						</p>
					</div>

					{/* Filter Section */}
					<Card>
						<CardContent className="pt-4 space-y-4">
							{/* Required Filters */}
							<div className={cn("grid gap-4", mustSelectInstitution ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2")}>
								{/* Institution */}
								{mustSelectInstitution && (
									<div className="space-y-2">
										<Label htmlFor="institution" className="text-xs font-medium">
											Institution <span className="text-red-500">*</span>
										</Label>
										<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={institutionOpen}
													className="h-8 w-full justify-between text-xs"
													disabled={loadingInstitutions}
												>
													<span className="truncate">
														{selectedInstitutionId
															? institutions.find(i => i.id === selectedInstitutionId)?.institution_code + " - " + institutions.find(i => i.id === selectedInstitutionId)?.institution_name
															: "Select institution"}
													</span>
													<div className="flex items-center gap-1 flex-shrink-0">
														{selectedInstitutionId && (
															<X
																className="h-3 w-3 opacity-50 hover:opacity-100"
																onClick={(e) => {
																	e.stopPropagation()
																	setSelectedInstitutionId("")
																	setInstitutionOpen(false)
																}}
															/>
														)}
														<ChevronsUpDown className="h-3 w-3 opacity-50" />
													</div>
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[400px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search institution..." className="h-8 text-xs" />
													<CommandList>
														<CommandEmpty className="text-xs py-2">No institution found.</CommandEmpty>
														<CommandGroup>
															{institutions.map((inst) => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.institution_name}`}
																	onSelect={() => {
																		setSelectedInstitutionId(inst.id)
																		setInstitutionOpen(false)
																	}}
																	className="text-xs"
																>
																	<Check
																		className={cn(
																			"mr-2 h-3 w-3",
																			selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0"
																		)}
																	/>
																	{inst.institution_code} - {inst.institution_name}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}

								{/* Examination Session */}
								<div className="space-y-2">
									<Label htmlFor="session" className="text-xs font-medium">
										Examination Session <span className="text-red-500">*</span>
									</Label>
									<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={sessionOpen}
												className="h-8 w-full justify-between text-xs"
												disabled={!selectedInstitutionId || loadingSessions}
											>
												<span className="truncate">
													{selectedSessionId
														? sessions.find(s => s.id === selectedSessionId)?.session_name + " (" + sessions.find(s => s.id === selectedSessionId)?.session_type + ")"
														: "Select session"}
												</span>
												<div className="flex items-center gap-1 flex-shrink-0">
													{selectedSessionId && (
														<X
															className="h-3 w-3 opacity-50 hover:opacity-100"
															onClick={(e) => {
																e.stopPropagation()
																setSelectedSessionId("")
																setSessionOpen(false)
															}}
														/>
													)}
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</div>
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[400px] p-0" align="start">
											<Command>
												<CommandInput placeholder="Search session..." className="h-8 text-xs" />
												<CommandList>
													<CommandEmpty className="text-xs py-2">No session found.</CommandEmpty>
													<CommandGroup>
														{sessions.map((session) => (
															<CommandItem
																key={session.id}
																value={`${session.session_name} ${session.session_type}`}
																onSelect={() => {
																	setSelectedSessionId(session.id)
																	setSessionOpen(false)
																}}
																className="text-xs"
															>
																<Check
																	className={cn(
																		"mr-2 h-3 w-3",
																		selectedSessionId === session.id ? "opacity-100" : "opacity-0"
																	)}
																/>
																{session.session_name} ({session.session_type})
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Course Filter (Multi-select) */}
								{selectedSessionId && (
									<div className="space-y-2 md:col-span-2">
										<div className="flex items-center justify-between">
											<Label htmlFor="courses" className="text-xs font-medium">
												Filter by Courses (Optional - Multi-select)
											</Label>
											{selectedCourseCodes.length > 0 && (
												<Button
													variant="ghost"
													size="sm"
													onClick={clearCourseSelection}
													className="h-6 text-xs"
												>
													Clear ({selectedCourseCodes.length})
												</Button>
											)}
										</div>
										<Popover open={courseOpen} onOpenChange={setCourseOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={courseOpen}
													className="h-auto min-h-8 w-full justify-between text-xs py-1"
													disabled={loadingCourses}
												>
													<div className="flex flex-wrap gap-1">
														{selectedCourseCodes.length === 0 ? (
															<span className="text-muted-foreground">All courses (click to filter)</span>
														) : (
															selectedCourseCodes.slice(0, 5).map(code => (
																<Badge key={code} variant="secondary" className="text-xs">
																	{code}
																	<X
																		className="ml-1 h-2 w-2 cursor-pointer"
																		onClick={(e) => {
																			e.stopPropagation()
																			toggleCourseSelection(code)
																		}}
																	/>
																</Badge>
															))
														)}
														{selectedCourseCodes.length > 5 && (
															<Badge variant="secondary" className="text-xs">
																+{selectedCourseCodes.length - 5} more
															</Badge>
														)}
													</div>
													<ChevronsUpDown className="h-3 w-3 opacity-50 flex-shrink-0" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[500px] p-0" align="start">
												<Command>
													<CommandInput placeholder="Search course..." className="h-8 text-xs" />
													<CommandList>
														<CommandEmpty className="text-xs py-2">No course found.</CommandEmpty>
														<CommandGroup>
															{availableCourses.map((course) => (
																<CommandItem
																	key={course.course_code}
																	value={`${course.course_code} ${course.course_title}`}
																	onSelect={() => toggleCourseSelection(course.course_code)}
																	className="text-xs"
																>
																	<Check
																		className={cn(
																			"mr-2 h-3 w-3",
																			selectedCourseCodes.includes(course.course_code) ? "opacity-100" : "opacity-0"
																		)}
																	/>
																	{course.course_code} - {course.course_title}
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
									</div>
								)}
							</div>

							{/* Generate Button */}
							<div className="flex justify-end">
								<Button
									onClick={handleGenerateReport}
									disabled={loadingReport || !selectedInstitutionId || !selectedSessionId}
									className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
								>
									{loadingReport ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Generating...
										</>
									) : (
										<>
											<FileText className="mr-2 h-4 w-4" />
											Generate Report
										</>
									)}
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Report Display */}
					{reportData && reportData.records.length > 0 && (
						<>
							{/* Summary Cards */}
							<div className="grid grid-cols-2 md:grid-cols-5 gap-4">
								<Card>
									<CardContent className="pt-4">
										<div className="text-2xl font-bold text-blue-600">{reportData.summary.total_programs}</div>
										<div className="text-xs text-muted-foreground">Total Programs</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="pt-4">
										<div className="text-2xl font-bold text-purple-600">{reportData.summary.total_courses}</div>
										<div className="text-xs text-muted-foreground">Total Courses</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="pt-4">
										<div className="text-2xl font-bold text-green-600">{reportData.summary.total_regular}</div>
										<div className="text-xs text-muted-foreground">Regular</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="pt-4">
										<div className="text-2xl font-bold text-orange-600">{reportData.summary.total_arrear}</div>
										<div className="text-xs text-muted-foreground">Arrears</div>
									</CardContent>
								</Card>
								<Card>
									<CardContent className="pt-4">
										<div className="text-2xl font-bold text-indigo-600">{reportData.summary.grand_total}</div>
										<div className="text-xs text-muted-foreground">Grand Total</div>
									</CardContent>
								</Card>
							</div>

							{/* View Tabs and Export */}
							<Card>
								<CardHeader className="pb-2">
									<div className="flex items-center justify-between">
										<div>
											<CardTitle className="text-lg">Course Count Details</CardTitle>
											<CardDescription>
												Session: {reportData.metadata.session_name} ({reportData.metadata.session_code})
											</CardDescription>
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={handleDownloadPDF}
												disabled={generatingPDF}
											>
												{generatingPDF ? (
													<Loader2 className="mr-1 h-3 w-3 animate-spin" />
												) : (
													<FileText className="mr-1 h-3 w-3" />
												)}
												PDF
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={handleDownloadExcel}
												disabled={generatingExcel}
											>
												{generatingExcel ? (
													<Loader2 className="mr-1 h-3 w-3 animate-spin" />
												) : (
													<FileSpreadsheet className="mr-1 h-3 w-3" />
												)}
												Excel
											</Button>
										</div>
									</div>
								</CardHeader>
								<CardContent>
									<Tabs value={viewType} onValueChange={(v) => setViewType(v as 'program' | 'board')}>
										<TabsList className="mb-4">
											<TabsTrigger value="program" className="text-xs">
												<BookOpen className="mr-1 h-3 w-3" />
												Program-wise
											</TabsTrigger>
											<TabsTrigger value="board" className="text-xs">
												<LayoutGrid className="mr-1 h-3 w-3" />
												Board-wise
											</TabsTrigger>
										</TabsList>

										{/* Program-wise View */}
										<TabsContent value="program" className="space-y-4">
											{reportData.program_wise.map((program, idx) => (
												<div key={program.program_code} className="border rounded-lg overflow-hidden">
													<div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 font-semibold text-sm">
														{idx + 1}. {program.program_code} - {program.program_name}
													</div>
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead className="w-12 text-xs">S.No</TableHead>
																<TableHead className="w-24 text-xs">Course Code</TableHead>
																<TableHead className="text-xs">Course Title</TableHead>
																<TableHead className="w-20 text-center text-xs">Regular</TableHead>
																<TableHead className="w-20 text-center text-xs">Arrears</TableHead>
																<TableHead className="w-20 text-center text-xs">Total</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{program.courses.map((course, courseIdx) => (
																<TableRow key={course.course_code}>
																	<TableCell className="text-xs text-center">{courseIdx + 1}</TableCell>
																	<TableCell className="text-xs font-mono">{course.course_code}</TableCell>
																	<TableCell className="text-xs">{course.course_title}</TableCell>
																	<TableCell className="text-xs text-center text-green-600 font-medium">{course.regular_count}</TableCell>
																	<TableCell className="text-xs text-center text-orange-600 font-medium">{course.arrear_count}</TableCell>
																	<TableCell className="text-xs text-center font-bold">{course.total_count}</TableCell>
																</TableRow>
															))}
															<TableRow className="bg-slate-50 dark:bg-slate-900 font-semibold">
																<TableCell colSpan={3} className="text-xs text-right">Program Total:</TableCell>
																<TableCell className="text-xs text-center text-green-700">{program.program_total_regular}</TableCell>
																<TableCell className="text-xs text-center text-orange-700">{program.program_total_arrear}</TableCell>
																<TableCell className="text-xs text-center">{program.program_total}</TableCell>
															</TableRow>
														</TableBody>
													</Table>
												</div>
											))}
										</TabsContent>

										{/* Board-wise View */}
										<TabsContent value="board" className="space-y-6">
											{reportData.board_wise.map((board) => (
												<div key={board.board_code} className="border-2 rounded-lg overflow-hidden">
													<div className="bg-slate-200 dark:bg-slate-700 px-4 py-3 font-bold text-sm">
														Board: {board.board_code} - {board.board_name}
													</div>
													<div className="space-y-2 p-2">
														{board.programs.map((program, progIdx) => (
															<div key={program.program_code} className="border rounded-lg overflow-hidden">
																<div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 font-semibold text-sm">
																	{progIdx + 1}. {program.program_code} - {program.program_name}
																</div>
																<Table>
																	<TableHeader>
																		<TableRow>
																			<TableHead className="w-12 text-xs">S.No</TableHead>
																			<TableHead className="w-24 text-xs">Course Code</TableHead>
																			<TableHead className="text-xs">Course Title</TableHead>
																			<TableHead className="w-20 text-center text-xs">Regular</TableHead>
																			<TableHead className="w-20 text-center text-xs">Arrears</TableHead>
																			<TableHead className="w-20 text-center text-xs">Total</TableHead>
																		</TableRow>
																	</TableHeader>
																	<TableBody>
																		{program.courses.map((course, courseIdx) => (
																			<TableRow key={course.course_code}>
																				<TableCell className="text-xs text-center">{courseIdx + 1}</TableCell>
																				<TableCell className="text-xs font-mono">{course.course_code}</TableCell>
																				<TableCell className="text-xs">{course.course_title}</TableCell>
																				<TableCell className="text-xs text-center text-green-600 font-medium">{course.regular_count}</TableCell>
																				<TableCell className="text-xs text-center text-orange-600 font-medium">{course.arrear_count}</TableCell>
																				<TableCell className="text-xs text-center font-bold">{course.total_count}</TableCell>
																			</TableRow>
																		))}
																		<TableRow className="bg-slate-50 dark:bg-slate-900 font-semibold">
																			<TableCell colSpan={3} className="text-xs text-right">Program Total:</TableCell>
																			<TableCell className="text-xs text-center text-green-700">{program.program_total_regular}</TableCell>
																			<TableCell className="text-xs text-center text-orange-700">{program.program_total_arrear}</TableCell>
																			<TableCell className="text-xs text-center">{program.program_total}</TableCell>
																		</TableRow>
																	</TableBody>
																</Table>
															</div>
														))}
													</div>
													<div className="bg-slate-200 dark:bg-slate-700 px-4 py-2 font-bold text-sm flex justify-end gap-8">
														<span>Board Total:</span>
														<span className="text-green-700">Regular: {board.board_total_regular}</span>
														<span className="text-orange-700">Arrears: {board.board_total_arrear}</span>
														<span>Total: {board.board_total}</span>
													</div>
												</div>
											))}
										</TabsContent>
									</Tabs>
								</CardContent>
							</Card>
						</>
					)}
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
