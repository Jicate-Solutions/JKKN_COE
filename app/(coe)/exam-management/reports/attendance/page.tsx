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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { Loader2, FileSpreadsheet, FileText, Calendar, Check, ChevronsUpDown, X, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { generateStudentAttendanceSheetPDF } from "@/lib/utils/generate-student-attendance-sheet-pdf"
import { generateExamAttendancePDF } from "@/lib/utils/generate-exam-attendance-pdf"
import { generateBundleCoverPDF } from "@/lib/utils/generate-bundle-cover-pdf"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"

interface Institution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[] // MyJKKN institution UUIDs for API integration
}

interface ExaminationSession {
	id: string
	session_name: string
	session_code: string
	session_type: string
	start_date: string
	end_date: string
}

interface ExamDate {
	exam_date: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
}

interface Course {
	course_code: string
	course_title: string
}

export default function AttendanceReportsPage() {
	const { toast } = useToast()

	// Institution filter hook - per MyJKKN COE dev rules
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId,
		getInstitutionIdForCreate
	} = useInstitutionFilter()

	// MyJKKN API hook for fetching programs from MyJKKN
	const { fetchPrograms: fetchProgramsFromMyJKKN } = useMyJKKNInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [examDates, setExamDates] = useState<ExamDate[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [courses, setCourses] = useState<Course[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const [selectedSessionId, setSelectedSessionId] = useState<string>("")
	const [selectedExamDate, setSelectedExamDate] = useState<string>("")
	const [selectedSessionType, setSelectedSessionType] = useState<string>("")
	const [selectedProgramCode, setSelectedProgramCode] = useState<string>("")
	const [selectedCourseCode, setSelectedCourseCode] = useState<string>("")

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingDates, setLoadingDates] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingCourses, setLoadingCourses] = useState(false)
	const [generatingStudentSheet, setGeneratingStudentSheet] = useState(false)
	const [generatingSummary, setGeneratingSummary] = useState(false)
	const [generatingBundle, setGeneratingBundle] = useState(false)

	// Popover open states for searchable dropdowns
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [examDateOpen, setExamDateOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
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
			// Use appendToUrl to add institution filter params for non-super_admin users
			const url = appendToUrl('/api/exam-management/exam-attendance/dropdowns?type=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)

				// Auto-select logic based on user role
				// 1. If only one institution returned, auto-select it
				// 2. If normal user (shouldFilter=true), auto-select from context
				// 3. If super_admin with specific selection, use context
				if (data.length === 1) {
					setSelectedInstitutionId(data[0].id)
				} else if (shouldFilter && contextInstitutionId) {
					// Normal user or super_admin with specific institution selected
					setSelectedInstitutionId(contextInstitutionId)
				} else if (!mustSelectInstitution && contextInstitutionId) {
					// super_admin with specific institution selected from global dropdown
					setSelectedInstitutionId(contextInstitutionId)
				}
				// If mustSelectInstitution = true (super_admin viewing "All Institutions"),
				// don't auto-select - let user choose
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
			setSelectedExamDate("")
			setSelectedSessionType("")
			setSelectedProgramCode("")
			setSelectedCourseCode("")
			setSessions([])
			setExamDates([])
			setPrograms([])
			setCourses([])
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

	// Session → Exam Dates & Programs
	useEffect(() => {
		if (selectedSessionId && selectedInstitutionId) {
			setSelectedExamDate("")
			setSelectedSessionType("")
			setSelectedProgramCode("")
			setSelectedCourseCode("")
			setExamDates([])
			setPrograms([])
			setCourses([])
			fetchPrograms(selectedInstitutionId, selectedSessionId)
		}
	}, [selectedSessionId])

	const fetchPrograms = async (institutionId: string, _sessionId: string) => {
		try {
			setLoadingPrograms(true)

			// Get myjkkn_institution_ids from the selected institution
			const institution = institutions.find(inst => inst.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			console.log('[AttendanceReports] Fetching programs for institution:', institutionId, 'myjkknIds:', myjkknIds)

			// Fetch programs from MyJKKN API using the hook (client-side)
			const programData = await fetchProgramsFromMyJKKN(myjkknIds)

			// Sort by program_order if available, then by program_code
			const sortedPrograms = programData.sort((a, b) => {
				const orderA = a.program_order ?? 999
				const orderB = b.program_order ?? 999
				if (orderA !== orderB) return orderA - orderB
				return (a.program_code || '').localeCompare(b.program_code || '')
			})

			console.log('[AttendanceReports] Programs fetched:', sortedPrograms.length)
			setPrograms(sortedPrograms)
		} catch (error) {
			console.error('Error fetching programs:', error)
		} finally {
			setLoadingPrograms(false)
		}
	}

	// Program → Reset Course
	useEffect(() => {
		if (selectedProgramCode) {
			setSelectedCourseCode("")
			setCourses([])

			// If we have exam date and session type, fetch courses
			if (selectedExamDate && selectedSessionType) {
				fetchCourses()
			}
		}
	}, [selectedProgramCode])

	// Exam Date/Session Type → Fetch Courses
	useEffect(() => {
		if (selectedExamDate && selectedSessionType && selectedProgramCode) {
			fetchCourses()
		} else {
			setCourses([])
		}
	}, [selectedExamDate, selectedSessionType])

	const fetchCourses = async () => {
		if (!selectedInstitutionId || !selectedSessionId || !selectedProgramCode || !selectedExamDate || !selectedSessionType) {
			return
		}

		try {
			setLoadingCourses(true)
			const res = await fetch(
				`/api/exam-management/exam-attendance/dropdowns?type=courses&institution_id=${selectedInstitutionId}&session_id=${selectedSessionId}&program_code=${selectedProgramCode}&exam_date=${selectedExamDate}&session_type=${selectedSessionType}`
			)
			if (res.ok) {
				const data = await res.json()
				setCourses(data)
			}
		} catch (error) {
			console.error('Error fetching courses:', error)
		} finally {
			setLoadingCourses(false)
		}
	}

	// Generate Student Attendance Sheet
	const handleGenerateStudentSheet = async () => {
		if (!selectedInstitutionId || !selectedSessionId) {
			toast({
				title: "⚠️ Missing Information",
				description: "Please select Institution and Examination Session.",
				variant: "destructive",
			})
			return
		}

		try {
			setGeneratingStudentSheet(true)

			// Get session code
			const session = sessions.find(s => s.id === selectedSessionId)
			if (!session) {
				throw new Error('Unable to find session details')
			}

			// Build query parameters
			const params = new URLSearchParams({
				session_code: session.session_code,
			})

			if (selectedExamDate) params.append('exam_date', selectedExamDate)
			if (selectedSessionType) params.append('session', selectedSessionType)
			if (selectedProgramCode) params.append('program_code', selectedProgramCode)
			if (selectedCourseCode) params.append('course_code', selectedCourseCode)

			// Fetch student sheet data
			const response = await fetch(`/api/exam-management/exam-attendance/student-sheet?${params.toString()}`)

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to fetch student attendance data')
			}

			const reportData = await response.json()

			// Check if there's data
			if (!reportData.sheets || reportData.sheets.length === 0) {
				toast({
					title: "ℹ️ No Data",
					description: "No student attendance records found for the selected criteria.",
					className: "bg-blue-50 border-blue-200 text-blue-800",
				})
				return
			}

			// Convert logos to base64
			let logoBase64 = undefined
			let rightLogoBase64 = undefined
			try {
				// Load left logo (Saraswathi)
				const logoResponse = await fetch('/jkkn_logo.png')
				if (logoResponse.ok) {
					const blob = await logoResponse.blob()
					logoBase64 = await new Promise<string>((resolve) => {
						const reader = new FileReader()
						reader.onloadend = () => resolve(reader.result as string)
						reader.readAsDataURL(blob)
					})
				}

				// Load right logo (JKKN CAS text)
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

			// Generate combined PDF
			const fileName = generateStudentAttendanceSheetPDF({
				...reportData,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64
			})

			toast({
				title: "✅ Student Sheet Generated",
				description: `${fileName} has been downloaded successfully (${reportData.sheets.length} sheet${reportData.sheets.length > 1 ? 's' : ''} combined).`,
				className: "bg-green-50 border-green-200 text-green-800",
				duration: 5000,
			})

		} catch (error) {
			console.error('Error generating student sheet:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to generate student sheet'
			toast({
				title: "❌ Generation Failed",
				description: errorMessage,
				variant: "destructive",
			})
		} finally {
			setGeneratingStudentSheet(false)
		}
	}

	// Generate Summary Report
	const handleGenerateSummary = async () => {
		if (!selectedInstitutionId || !selectedSessionId) {
			toast({
				title: "⚠️ Missing Information",
				description: "Please select Institution and Examination Session.",
				variant: "destructive",
			})
			return
		}

		try {
			setGeneratingSummary(true)

			// Get session details (we need session_code for the API)
			const session = sessions.find(s => s.id === selectedSessionId)

			if (!session) {
				throw new Error('Unable to find session details')
			}

			// Fetch summary report data (using institution_id instead of code)
			const response = await fetch(
				`/api/exam-management/exam-attendance/report?institution_id=${selectedInstitutionId}&session_code=${session.session_code}`
			)

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to fetch attendance data')
			}

			const reportData = await response.json()

			// Check if there's data
			if (!reportData.records || reportData.records.length === 0) {
				toast({
					title: "ℹ️ No Data",
					description: "No attendance records found for the selected criteria.",
					className: "bg-blue-50 border-blue-200 text-blue-800",
				})
				return
			}

			// Convert logos to base64
			let logoBase64 = undefined
			let rightLogoBase64 = undefined
			try {
				// Load left logo (Saraswathi)
				const logoResponse = await fetch('/jkkn_logo.png')
				if (logoResponse.ok) {
					const blob = await logoResponse.blob()
					logoBase64 = await new Promise<string>((resolve) => {
						const reader = new FileReader()
						reader.onloadend = () => resolve(reader.result as string)
						reader.readAsDataURL(blob)
					})
				}

				// Load right logo (JKKN CAS text)
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

			// Generate PDF
			const fileName = generateExamAttendancePDF({
				...reportData,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64
			})

			toast({
				title: "✅ Summary Report Generated",
				description: `${fileName} has been downloaded successfully.`,
				className: "bg-green-50 border-green-200 text-green-800",
				duration: 5000,
			})

		} catch (error) {
			console.error('Error generating summary:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to generate summary report'
			toast({
				title: "❌ Generation Failed",
				description: errorMessage,
				variant: "destructive",
			})
		} finally {
			setGeneratingSummary(false)
		}
	}

	// Generate Bundle Cover PDF
	const handleGenerateBundle = async () => {
		if (!selectedInstitutionId || !selectedSessionId || !selectedExamDate || !selectedSessionType) {
			toast({
				title: "⚠️ Missing Information",
				description: "Please select required filters (Institution, Session, Date, and Session Type) to generate bundle cover. Program and Course are optional.",
				variant: "destructive",
			})
			return
		}

		try {
			setGeneratingBundle(true)

			// Build query params (program and course are optional)
			const params = new URLSearchParams({
				institution_id: selectedInstitutionId,
				session_id: selectedSessionId,
				exam_date: selectedExamDate,
				session: selectedSessionType
			})

			if (selectedProgramCode) {
				params.append('program_code', selectedProgramCode)
			}

			if (selectedCourseCode) {
				params.append('course_code', selectedCourseCode)
			}

			// Fetch bundle cover data
			const response = await fetch(`/api/exam-management/exam-attendance/bundle-cover?${params.toString()}`)

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to fetch bundle cover data')
			}

			const responseData = await response.json()

			if (!responseData.bundles || responseData.bundles.length === 0) {
				toast({
					title: "⚠️ No Data",
					description: "No attendance records found for the selected filters.",
					variant: "destructive",
				})
				return
			}

			// Load logos
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

			// Generate single combined PDF for all subjects (merged by date+session)
			const fileName = generateBundleCoverPDF({
				bundles: responseData.bundles,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64
			})

			// Calculate total bundles across all subjects
			let totalBundlesGenerated = 0
			responseData.bundles.forEach((bundleData: any) => {
				const bundlesForSubject = Math.ceil(bundleData.students.length / 60)
				totalBundlesGenerated += bundlesForSubject
			})

			const totalSubjects = responseData.bundles.length

			toast({
				title: "✅ Bundle Covers Generated",
				description: `${fileName} has been downloaded successfully (${totalBundlesGenerated} bundle${totalBundlesGenerated > 1 ? 's' : ''} for ${totalSubjects} subject${totalSubjects > 1 ? 's' : ''}).`,
				className: "bg-green-50 border-green-200 text-green-800",
				duration: 5000,
			})

		} catch (error) {
			console.error('Error generating bundle cover:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to generate bundle cover'
			toast({
				title: "❌ Generation Failed",
				description: errorMessage,
				variant: "destructive",
			})
		} finally {
			setGeneratingBundle(false)
		}
	}

	// Get display values
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />

				<div className="flex flex-1 flex-col 1 p-4 pt-0 overflow-y-auto">
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
								<BreadcrumbPage>Attendance Reports</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex flex-col ">
						<h1 className="text-2xl font-bold">Attendance Reports</h1>
						<p className="text-sm text-muted-foreground">
							Generate PDF reports for exam attendance data
						</p>
					</div>

					{/* Filter Section */}
					<Card>
						
						<CardContent className="pt-2 space-y-2">
							{/* Required Filters */}
							<div className={cn("grid gap-4", mustSelectInstitution ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
								{/* Institution - Show only when mustSelectInstitution is true per MyJKKN COE dev rules
								    Normal users: institution auto-selected from context, field hidden
								    super_admin with "All Institutions": must select, field shown
								    super_admin with specific selection: auto-filled from context, field hidden */}
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
							</div>

							{/* Optional Filters */}
							{selectedSessionId && (
								<>
									<div className="border-t pt-4">
										<h3 className="text-xs font-semibold mb-3 text-muted-foreground">
											Optional Filters (for Learner Attendance Sheet only)
										</h3>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
										{/* Exam Date */}
										<div className="space-y-2">
											<Label htmlFor="exam_date" className="text-xs font-medium">Exam Date</Label>
											<div className="relative">
												<Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
												<input
													type="date"
													id="exam_date"
													value={selectedExamDate}
													onChange={(e) => setSelectedExamDate(e.target.value)}
													className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-8"
												/>
											</div>
										</div>

										{/* Session Type */}
										<div className="space-y-2">
											<Label htmlFor="session_type" className="text-xs font-medium">Session (FN/AN)</Label>
											<Select
												value={selectedSessionType}
												onValueChange={setSelectedSessionType}
											>
												<SelectTrigger id="session_type" className="h-8 text-xs">
													<SelectValue placeholder="Select session" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="FN" className="text-xs">FN (Forenoon)</SelectItem>
													<SelectItem value="AN" className="text-xs">AN (Afternoon)</SelectItem>
												</SelectContent>
											</Select>
										</div>

										{/* Program */}
										<div className="space-y-2">
											<Label htmlFor="program" className="text-xs font-medium">Program Code</Label>
											<Popover open={programOpen} onOpenChange={setProgramOpen}>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														aria-expanded={programOpen}
														className="h-8 w-full justify-between text-xs"
														disabled={loadingPrograms}
													>
														<span className="truncate">
															{selectedProgramCode
																? programs.find(p => p.program_code === selectedProgramCode)?.program_code + " - " + programs.find(p => p.program_code === selectedProgramCode)?.program_name
																: "Select program"}
														</span>
														<div className="flex items-center gap-1 flex-shrink-0">
															{selectedProgramCode && (
																<X
																	className="h-3 w-3 opacity-50 hover:opacity-100"
																	onClick={(e) => {
																		e.stopPropagation()
																		setSelectedProgramCode("")
																		setProgramOpen(false)
																	}}
																/>
															)}
															<ChevronsUpDown className="h-3 w-3 opacity-50" />
														</div>
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[350px] p-0" align="start">
													<Command>
														<CommandInput placeholder="Search program..." className="h-8 text-xs" />
														<CommandList>
															<CommandEmpty className="text-xs py-2">No program found.</CommandEmpty>
															<CommandGroup>
																{programs.map((program) => (
																	<CommandItem
																		key={program.id}
																		value={`${program.program_code} ${program.program_name}`}
																		onSelect={() => {
																			setSelectedProgramCode(program.program_code)
																			setProgramOpen(false)
																		}}
																		className="text-xs"
																	>
																		<Check
																			className={cn(
																				"mr-2 h-3 w-3",
																				selectedProgramCode === program.program_code ? "opacity-100" : "opacity-0"
																			)}
																		/>
																		{program.program_code} - {program.program_name}
																	</CommandItem>
																))}
															</CommandGroup>
														</CommandList>
													</Command>
												</PopoverContent>
											</Popover>
										</div>

										{/* Course */}
										<div className="space-y-2">
											<Label htmlFor="course" className="text-xs font-medium">Course Code</Label>
											<Popover open={courseOpen} onOpenChange={setCourseOpen}>
												<PopoverTrigger asChild>
													<Button
														variant="outline"
														role="combobox"
														aria-expanded={courseOpen}
														className="h-8 w-full justify-between text-xs"
														disabled={!selectedProgramCode || loadingCourses}
													>
														<span className="truncate">
															{selectedCourseCode
																? courses.find(c => c.course_code === selectedCourseCode)?.course_code + " - " + courses.find(c => c.course_code === selectedCourseCode)?.course_title
																: "Select course"}
														</span>
														<div className="flex items-center gap-1 flex-shrink-0">
															{selectedCourseCode && (
																<X
																	className="h-3 w-3 opacity-50 hover:opacity-100"
																	onClick={(e) => {
																		e.stopPropagation()
																		setSelectedCourseCode("")
																		setCourseOpen(false)
																	}}
																/>
															)}
															<ChevronsUpDown className="h-3 w-3 opacity-50" />
														</div>
													</Button>
												</PopoverTrigger>
												<PopoverContent className="w-[400px] p-0" align="start">
													<Command>
														<CommandInput placeholder="Search course..." className="h-8 text-xs" />
														<CommandList>
															<CommandEmpty className="text-xs py-2">No course found.</CommandEmpty>
															<CommandGroup>
																{courses.map((course) => (
																	<CommandItem
																		key={course.course_code}
																		value={`${course.course_code} ${course.course_title}`}
																		onSelect={() => {
																			setSelectedCourseCode(course.course_code)
																			setCourseOpen(false)
																		}}
																		className="text-xs"
																	>
																		<Check
																			className={cn(
																				"mr-2 h-3 w-3",
																				selectedCourseCode === course.course_code ? "opacity-100" : "opacity-0"
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
									</div>
								</>
							)}
						</CardContent>
					</Card>

					{/* Active Filters Summary */}
					{selectedInstitutionId && selectedSessionId && (
						<div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
							<h3 className="text-sm font-semibold mb-2">Active Filters:</h3>
							<div className="flex flex-wrap gap-2">
								{/* Show institution only when mustSelectInstitution is true (super_admin viewing "All Institutions")
								    For normal users, institution is implicit from context */}
								{mustSelectInstitution && (
									<span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
										Institution: {selectedInstitution?.institution_code}
									</span>
								)}
								<span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
									Session: {selectedSession?.session_code}
								</span>
								{selectedExamDate && (
									<span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
										Date: {selectedExamDate}
									</span>
								)}
								{selectedSessionType && (
									<span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
										Session: {selectedSessionType}
									</span>
								)}
								{selectedProgramCode && (
									<span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
										Program: {selectedProgramCode}
									</span>
								)}
								{selectedCourseCode && (
									<span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
										Course: {selectedCourseCode}
									</span>
								)}
							</div>
						</div>
					)}

					{/* Report Generation Cards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{/* Learner Attendance Sheet */}
						<Card>
							<CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 p-3">
								<div className="flex items-center gap-2">
									<div className="h-8 w-8 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
										<FileSpreadsheet className="h-4 w-4 text-white" />
									</div>
									<div>
										<CardTitle className="text-sm font-semibold">Learner Attendance Sheet</CardTitle>
										<CardDescription className="text-xs">Individual learner-wise attendance records</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-4 p-3">
								<p className="text-xs text-muted-foreground mb-3">
									Generate detailed attendance sheets showing individual learner records with their attendance status.
									Use optional filters to narrow down the results.
								</p>
								<Button
									onClick={handleGenerateStudentSheet}
									disabled={generatingStudentSheet || !selectedInstitutionId || !selectedSessionId}
									className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 h-8 text-xs"
								>
									{generatingStudentSheet ? (
										<>
											<Loader2 className="mr-1 h-3 w-3 animate-spin" />
											Generating...
										</>
									) : (
										<>
											<FileSpreadsheet className="mr-1 h-3 w-3" />
											Generate Learner Sheet
										</>
									)}
								</Button>
							</CardContent>
						</Card>

						{/* Summary Report */}
						<Card>
							<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-3">
								<div className="flex items-center gap-2">
									<div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
										<FileText className="h-4 w-4 text-white" />
									</div>
									<div>
										<CardTitle className="text-sm font-semibold">Summary Report</CardTitle>
										<CardDescription className="text-xs">Aggregated attendance statistics</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-4 p-3">
								<p className="text-xs text-muted-foreground mb-3">
									Generate a comprehensive summary report with attendance statistics grouped by date, session, and course.
								</p>
								<Button
									onClick={handleGenerateSummary}
									disabled={generatingSummary || !selectedInstitutionId || !selectedSessionId}
									className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 h-8 text-xs"
								>
									{generatingSummary ? (
										<>
											<Loader2 className="mr-1 h-3 w-3 animate-spin" />
											Generating...
										</>
									) : (
										<>
											<FileText className="mr-1 h-3 w-3" />
											Generate Summary Report
										</>
									)}
								</Button>
							</CardContent>
						</Card>

						{/* Bundle Cover */}
						<Card>
							<CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 p-3">
								<div className="flex items-center gap-2">
									<div className="h-8 w-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-center">
										<Package className="h-4 w-4 text-white" />
									</div>
									<div>
										<CardTitle className="text-sm font-semibold">Bundle Cover</CardTitle>
										<CardDescription className="text-xs">Answer sheet bundle cover sheets</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="pt-4 p-3">
								<p className="text-xs text-muted-foreground mb-3">
									Generate bundle cover sheets for answer booklets. Automatically creates bundles of 60 learners.
									Program and Course filters are optional.
								</p>
								<Button
									onClick={handleGenerateBundle}
									disabled={generatingBundle || !selectedInstitutionId || !selectedSessionId || !selectedExamDate || !selectedSessionType}
									className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 h-8 text-xs"
								>
									{generatingBundle ? (
										<>
											<Loader2 className="mr-1 h-3 w-3 animate-spin" />
											Generating...
										</>
									) : (
										<>
											<Package className="mr-1 h-3 w-3" />
											Generate Bundle Cover
										</>
									)}
								</Button>
							</CardContent>
						</Card>
					</div>
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
