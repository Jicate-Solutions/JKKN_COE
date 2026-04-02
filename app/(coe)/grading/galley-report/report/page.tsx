"use client"

import { useState, useEffect, useMemo } from "react"
import { useSessionSync } from '@/hooks/use-session-sync'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/common/use-toast"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import {
	Loader2,
	FileText,
	Download,
	Check,
	ChevronsUpDown,
	Users,
	GraduationCap,
	TrendingUp,
	AlertTriangle,
	Award,
	BarChart3,
	PieChartIcon,
	BookOpen,
	Trophy,
	Target,
	AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { generateGalleyReportPDF } from "@/lib/utils/generate-galley-report-pdf"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"

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
	start_date: string
	end_date: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
	display_name: string
}

interface Semester {
	semester: number
	label: string
}

interface CourseData {
	course: {
		id: string
		course_code: string
		course_name: string
		display_code: string
		credit: number
		internal_max_mark: number
		external_max_mark: number
		total_max_mark: number
		course_category: string
		course_type: string
		course_order?: number
		evaluation_type?: string  // CIA, ESE, or CIA + ESE
	}
	internal_marks: number
	internal_max: number
	external_marks: number
	external_max: number
	total_marks: number
	total_max: number
	percentage: number
	letter_grade: string
	grade_points: number
	is_pass: boolean
	pass_status: string
	result_status: string
}

interface StudentData {
	student: {
		id: string
		first_name: string
		last_name: string
		register_number: string
		roll_number: string
	}
	courses: CourseData[]
	semester_result: {
		sgpa: number
		cgpa: number
		percentage: number
		total_credits_registered: number
		total_credits_earned: number
		result_status: string
		result_class: string
		is_distinction: boolean
		is_first_class: boolean
		total_backlogs: number
	} | null
}

interface CourseAnalysis {
	course: {
		id: string
		course_code: string
		course_name: string
		credit: number
		internal_max_mark: number
		external_max_mark: number
		total_max_mark: number
		course_category: string
		course_order?: number
		evaluation_type?: string  // CIA, ESE, or CIA + ESE
	}
	registered: number
	appeared: number
	absent: number
	passed: number
	failed: number
	reappear: number
	pass_percentage: string
	grades: Record<string, number>
}

interface GalleyReportData {
	institution: {
		id: string
		institution_code: string
		institution_name: string
	}
	session: {
		id: string
		session_name: string
		session_code: string
		session_type: string
	}
	program: {
		id: string
		program_code: string
		program_name: string
		display_name: string
		degrees: { degree_code: string; degree_name: string }
	}
	semester: number
	batch: string
	students: StudentData[]
	courseAnalysis: CourseAnalysis[]
	statistics: {
		total_students: number
		total_passed: number
		total_failed: number
		total_with_backlogs: number
		pass_percentage: string
		grade_distribution: Record<string, number>
		top_performers: Array<{
			register_number: string
			name: string
			cgpa: number
			sgpa: number
		}>
		highest_scorer: {
			register_number: string
			name: string
			total_marks: number
			total_max: number
		} | null
	}
}

const GRADE_COLORS: Record<string, string> = {
	'O': '#22c55e',
	'A+': '#4ade80',
	'A': '#86efac',
	'B+': '#3b82f6',
	'B': '#60a5fa',
	'C': '#f59e0b',
	'D': '#f97316',
	'F': '#ef4444',
	'RA': '#dc2626',
	'AB': '#6b7280'
}

export default function GalleyReportPage() {
	const { toast } = useToast()

	// Global institution filter
	const {
		institutionId: globalInstitutionId,
		isReady: isInstitutionReady,
		mustSelectInstitution
	} = useInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [semesters, setSemesters] = useState<Semester[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
	const [selectedProgramId, setSelectedProgramId] = useState<string>("")
	const [selectedSemester, setSelectedSemester] = useState<string>("")

	// Report data
	const [reportData, setReportData] = useState<GalleyReportData | null>(null)

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)
	const [loadingReport, setLoadingReport] = useState(false)
	const [generatingPDF, setGeneratingPDF] = useState(false)

	// Popover states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [semesterOpen, setSemesterOpen] = useState(false)

	// Load institutions on mount (only if super_admin with "All Institutions" selected)
	useEffect(() => {
		if (isInstitutionReady) {
			if (mustSelectInstitution) {
				// Super admin with "All Institutions" - fetch all institutions for dropdown
				fetchInstitutions()
			} else if (globalInstitutionId) {
				// Specific institution selected from global filter - use it directly
				setSelectedInstitutionId(globalInstitutionId)
			}
		}
	}, [isInstitutionReady, mustSelectInstitution, globalInstitutionId])

	const fetchInstitutions = async () => {
		try {
			setLoadingInstitutions(true)
			const res = await fetch('/api/grading/galley-report?type=institutions')
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
				if (data.length === 1) {
					setSelectedInstitutionId(data[0].id)
				}
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		} finally {
			setLoadingInstitutions(false)
		}
	}

	// Institution -> Sessions
	useEffect(() => {
		if (selectedInstitutionId) {
			setSelectedSessionId("")
			setSelectedProgramId("")
			setSelectedSemester("")
			setSessions([])
			setPrograms([])
			setSemesters([])
			setReportData(null)
			fetchSessions(selectedInstitutionId)
		}
	}, [selectedInstitutionId])

	const fetchSessions = async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			const res = await fetch(`/api/grading/galley-report?type=sessions&institution_id=${institutionId}`)
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

	// Session -> Programs
	useEffect(() => {
		if (selectedSessionId && selectedInstitutionId) {
			setSelectedProgramId("")
			setSelectedSemester("")
			setPrograms([])
			setSemesters([])
			setReportData(null)
			fetchPrograms(selectedInstitutionId, selectedSessionId)
		}
	}, [selectedSessionId])

	const fetchPrograms = async (institutionId: string, sessionId: string) => {
		try {
			setLoadingPrograms(true)
			const res = await fetch(`/api/grading/galley-report?type=programs&institution_id=${institutionId}&session_id=${sessionId}`)
			if (res.ok) {
				const data = await res.json()
				setPrograms(data)
			}
		} catch (error) {
			console.error('Error fetching programs:', error)
		} finally {
			setLoadingPrograms(false)
		}
	}

	// Program -> Semesters
	useEffect(() => {
		if (selectedProgramId && selectedSessionId && selectedInstitutionId) {
			setSelectedSemester("")
			setReportData(null)
			fetchSemesters(selectedInstitutionId, selectedSessionId, selectedProgramId)
		} else {
			setSemesters([])
		}
	}, [selectedProgramId])

	const fetchSemesters = async (institutionId: string, sessionId: string, programId: string) => {
		try {
			setLoadingSemesters(true)
			const program = programs.find(p => p.id === programId)
			const programCode = program?.program_code || programId
			const res = await fetch(`/api/grading/galley-report?type=semesters&institution_id=${institutionId}&session_id=${sessionId}&program_id=${programCode}`)
			if (res.ok) {
				const data = await res.json()
				setSemesters(data)
			}
		} catch (error) {
			console.error('Error fetching semesters:', error)
		} finally {
			setLoadingSemesters(false)
		}
	}

	// Generate Report for selected program and semester
	const handleGenerateReport = async () => {
		if (!selectedInstitutionId || !selectedSessionId || !selectedProgramId || !selectedSemester) {
			toast({
				title: "Missing Information",
				description: "Please select institution, session, program, and semester.",
				variant: "destructive"
			})
			return
		}

		try {
			setLoadingReport(true)
			const program = programs.find(p => p.id === selectedProgramId)
			const programCode = program?.program_code || selectedProgramId

			const res = await fetch(
				`/api/grading/galley-report?institution_id=${selectedInstitutionId}&session_id=${selectedSessionId}&program_id=${programCode}&semester=${selectedSemester}`
			)

			if (res.ok) {
				const data = await res.json()
				if (data.students?.length > 0 || data.courseAnalysis?.length > 0) {
					setReportData(data)
					toast({
						title: "Report Generated",
						description: `Generated report with ${data.students?.length || 0} learners and ${data.courseAnalysis?.length || 0} courses.`,
						className: "bg-green-50 border-green-200 text-green-800"
					})
				} else {
					toast({
						title: "No Data Found",
						description: "No report data found for the selected filters.",
						variant: "destructive"
					})
					setReportData(null)
				}
			} else {
				const errorData = await res.json()
				toast({
					title: "Generation Failed",
					description: errorData.error || 'Failed to generate report',
					variant: "destructive"
				})
				setReportData(null)
			}
		} catch (error) {
			console.error('Error generating report:', error)
			toast({
				title: "Generation Failed",
				description: error instanceof Error ? error.message : 'Failed to generate report',
				variant: "destructive"
			})
		} finally {
			setLoadingReport(false)
		}
	}

	// Download current PDF
	const handleDownloadPDF = async () => {
		if (!reportData) return

		try {
			setGeneratingPDF(true)

			// Load logos
			const { logoBase64, rightLogoBase64 } = await loadLogos()

			const fileName = generateGalleyReportPDF({
				...reportData,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64
			})

			toast({
				title: "PDF Generated",
				description: `${fileName} has been downloaded successfully.`,
				className: "bg-green-50 border-green-200 text-green-800"
			})
		} catch (error) {
			console.error('Error generating PDF:', error)
			toast({
				title: "PDF Generation Failed",
				description: error instanceof Error ? error.message : 'Failed to generate PDF',
				variant: "destructive"
			})
		} finally {
			setGeneratingPDF(false)
		}
	}

	// Helper to load logos
	const loadLogos = async () => {
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

		return { logoBase64, rightLogoBase64 }
	}

	// Chart data for grade distribution
	const gradeChartData = useMemo(() => {
		if (!reportData?.statistics.grade_distribution) return []
		return Object.entries(reportData.statistics.grade_distribution)
			.map(([grade, count]) => ({
				name: grade,
				value: count,
				fill: GRADE_COLORS[grade] || '#6b7280'
			}))
			.sort((a, b) => {
				const order = ['O', 'A+', 'A', 'B+', 'B', 'C', 'D', 'F', 'RA', 'AB']
				return order.indexOf(a.name) - order.indexOf(b.name)
			})
	}, [reportData])

	// Chart data for course-wise pass percentage
	const coursePassChartData = useMemo(() => {
		if (!reportData?.courseAnalysis) return []
		return reportData.courseAnalysis.map(ca => ({
			name: ca.course.course_code,
			fullName: ca.course.course_name,
			pass_percentage: parseFloat(ca.pass_percentage),
			registered: ca.registered,
			passed: ca.passed
		}))
	}, [reportData])

	// Get display values
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)
	const selectedProgram = programs.find(p => p.id === selectedProgramId)

	return (
		<>
			{/* Page Header */}
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl font-bold font-heading">End Semester Examination Report</h1>
				<p className="text-sm text-muted-foreground">
					Generate detailed galley reports with learner performance, course analysis, and statistics
				</p>
			</div>

			{/* Filter Section */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base font-semibold">Report Filters</CardTitle>
					<CardDescription className="text-xs">Select filters to generate the galley report</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className={cn(
						"grid grid-cols-1 gap-4",
						mustSelectInstitution ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"
					)}>
						{/* Institution - only show when super_admin with "All Institutions" selected */}
						{mustSelectInstitution && (
							<div className="space-y-2">
								<Label className="text-xs font-medium">
									Institution <span className="text-red-500">*</span>
								</Label>
								<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											role="combobox"
											className="h-9 w-full justify-between text-xs"
											disabled={loadingInstitutions}
										>
											<span className="truncate">
												{selectedInstitutionId
													? `${selectedInstitution?.institution_code} - ${selectedInstitution?.institution_name}`
													: "Select institution"}
											</span>
											<ChevronsUpDown className="h-3 w-3 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[400px] p-0" align="start">
										<Command filter={(value, search) => {
											if (value.toLowerCase().includes(search.toLowerCase())) return 1
											return 0
										}}>
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
															<Check className={cn("mr-2 h-3 w-3", selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0")} />
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
						{mustSelectSession && (
						<div className="space-y-2">
							<Label className="text-xs font-medium">
								Examination Session <span className="text-red-500">*</span>
							</Label>
							<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										className="h-9 w-full justify-between text-xs"
										disabled={!selectedInstitutionId || loadingSessions}
									>
										<span className="truncate">
											{selectedSessionId
												? `${selectedSession?.session_name} (${selectedSession?.session_type})`
												: "Select session"}
										</span>
										<ChevronsUpDown className="h-3 w-3 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[350px] p-0" align="start">
									<Command filter={(value, search) => {
										if (value.toLowerCase().includes(search.toLowerCase())) return 1
										return 0
									}}>
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
														<Check className={cn("mr-2 h-3 w-3", selectedSessionId === session.id ? "opacity-100" : "opacity-0")} />
														{session.session_name} ({session.session_type})
													</CommandItem>
												))}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>
						)}

						{/* Program */}
						<div className="space-y-2">
							<Label className="text-xs font-medium">
								Program <span className="text-red-500">*</span>
							</Label>
							<Popover open={programOpen} onOpenChange={setProgramOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										className="h-9 w-full justify-between text-xs"
										disabled={!selectedSessionId || loadingPrograms}
									>
										<span className="truncate">
											{selectedProgramId
												? `${selectedProgram?.program_code} - ${selectedProgram?.program_name}`
												: "Select program"}
										</span>
										<ChevronsUpDown className="h-3 w-3 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[400px] p-0" align="start">
									<Command filter={(value, search) => {
										if (value.toLowerCase().includes(search.toLowerCase())) return 1
										return 0
									}}>
										<CommandInput placeholder="Search program..." className="h-8 text-xs" />
										<CommandList>
											<CommandEmpty className="text-xs py-2">No program found.</CommandEmpty>
											<CommandGroup>
												{programs.map((prog) => (
													<CommandItem
														key={prog.id}
														value={`${prog.program_code} ${prog.program_name}`}
														onSelect={() => {
															setSelectedProgramId(prog.id)
															setProgramOpen(false)
														}}
														className="text-xs"
													>
														<Check className={cn("mr-2 h-3 w-3", selectedProgramId === prog.id ? "opacity-100" : "opacity-0")} />
														{prog.program_code} - {prog.program_name}
													</CommandItem>
												))}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						{/* Semester */}
						<div className="space-y-2">
							<Label className="text-xs font-medium">
								Semester <span className="text-red-500">*</span>
							</Label>
							<Popover open={semesterOpen} onOpenChange={setSemesterOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										className="h-9 w-full justify-between text-xs"
										disabled={!selectedProgramId || loadingSemesters}
									>
										<span className="truncate">
											{selectedSemester
												? `Semester ${selectedSemester}`
												: "Select semester"}
										</span>
										<ChevronsUpDown className="h-3 w-3 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[200px] p-0" align="start">
									<Command>
										<CommandList>
											<CommandGroup>
												{semesters.map((sem) => (
													<CommandItem
														key={sem.semester}
														onSelect={() => {
															setSelectedSemester(sem.semester.toString())
															setSemesterOpen(false)
														}}
														className="text-xs"
													>
														<Check className={cn("mr-2 h-3 w-3", selectedSemester === sem.semester.toString() ? "opacity-100" : "opacity-0")} />
														{sem.label}
													</CommandItem>
												))}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>
					</div>

					{/* Action Buttons */}
					<div className="flex flex-wrap gap-2 pt-2">
						<Button
							onClick={handleGenerateReport}
							disabled={!selectedInstitutionId || !selectedSessionId || !selectedProgramId || !selectedSemester || loadingReport}
							className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
						>
							{loadingReport ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Generating Report...
								</>
							) : (
								<>
									<FileText className="mr-2 h-4 w-4" />
									Generate Report
								</>
							)}
						</Button>

						{reportData && (
							<Button
								onClick={handleDownloadPDF}
								disabled={generatingPDF}
								variant="outline"
								className="border-green-500 text-green-600 hover:bg-green-50"
							>
								{generatingPDF ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Generating PDF...
									</>
								) : (
									<>
										<Download className="mr-2 h-4 w-4" />
										Download PDF
									</>
								)}
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Report Content */}
			{reportData && (
				<>
					{/* Overview Section */}
					<Card>
						<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
							<div className="flex items-center gap-3">
								<div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
									<GraduationCap className="h-5 w-5 text-white" />
								</div>
								<div>
									<CardTitle className="text-lg font-heading">
										{reportData.program?.program_name}
									</CardTitle>
									<CardDescription>
										{reportData.session?.session_name} | Semester {reportData.semester} | Batch {reportData.batch}
									</CardDescription>
								</div>
							</div>
						</CardHeader>
					</Card>

					{/* Statistics Cards */}
					<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
						<Card>
							<CardContent className="pt-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<Users className="h-5 w-5 text-blue-600" />
									</div>
									<div>
										<p className="text-2xl font-bold">{reportData.statistics.total_students}</p>
										<p className="text-xs text-muted-foreground">Total Learners</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="pt-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
										<TrendingUp className="h-5 w-5 text-green-600" />
									</div>
									<div>
										<p className="text-2xl font-bold">{reportData.statistics.total_passed}</p>
										<p className="text-xs text-muted-foreground">Passed</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="pt-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
										<AlertTriangle className="h-5 w-5 text-red-600" />
									</div>
									<div>
										<p className="text-2xl font-bold">{reportData.statistics.total_failed}</p>
										<p className="text-xs text-muted-foreground">Failed</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="pt-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
										<AlertCircle className="h-5 w-5 text-yellow-600" />
									</div>
									<div>
										<p className="text-2xl font-bold">{reportData.statistics.total_with_backlogs}</p>
										<p className="text-xs text-muted-foreground">With Backlogs</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="pt-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
										<Target className="h-5 w-5 text-purple-600" />
									</div>
									<div>
										<p className="text-2xl font-bold">{reportData.statistics.pass_percentage}%</p>
										<p className="text-xs text-muted-foreground">Pass %</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="pt-4">
								<div className="flex items-center gap-3">
									<div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/20 flex items-center justify-center">
										<BookOpen className="h-5 w-5 text-indigo-600" />
									</div>
									<div>
										<p className="text-2xl font-bold">{reportData.courseAnalysis.length}</p>
										<p className="text-xs text-muted-foreground">Total Courses</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Tabs for different sections */}
					<Tabs defaultValue="learners" className="space-y-4">
						<TabsList className="grid w-full grid-cols-4 h-11 p-1 bg-muted/50">
							<TabsTrigger
								value="learners"
								className="text-xs gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-purple-500/25 transition-all duration-200"
							>
								<Users className="h-3.5 w-3.5" />
								Learner Results
							</TabsTrigger>
							<TabsTrigger
								value="courses"
								className="text-xs gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/25 transition-all duration-200"
							>
								<BookOpen className="h-3.5 w-3.5" />
								Course Analysis
							</TabsTrigger>
							<TabsTrigger
								value="charts"
								className="text-xs gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-amber-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-orange-500/25 transition-all duration-200"
							>
								<BarChart3 className="h-3.5 w-3.5" />
								Charts
							</TabsTrigger>
							<TabsTrigger
								value="toppers"
								className="text-xs gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-amber-500/25 transition-all duration-200"
							>
								<Trophy className="h-3.5 w-3.5" />
								Top Performers
							</TabsTrigger>
						</TabsList>

						{/* Learner Results Tab */}
						<TabsContent value="learners">
							<Card>
								<CardHeader>
									<CardTitle className="text-base">Learner Performance Summary</CardTitle>
									<CardDescription className="text-xs">Individual learner-wise results with course marks</CardDescription>
								</CardHeader>
								<CardContent>
									<ScrollArea className="h-[600px]">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-12 text-xs">S.No</TableHead>
													<TableHead className="text-xs">Reg. No.</TableHead>
													<TableHead className="text-xs">Learner Name</TableHead>
													{reportData.courseAnalysis.slice(0, 6).map((ca) => (
														<TableHead key={ca.course.id} className="text-xs text-center">
															<div className="flex flex-col">
																<span>{ca.course.course_code}</span>
																<span className="text-[10px] text-muted-foreground">INT | EXT | TOT</span>
															</div>
														</TableHead>
													))}
													<TableHead className="text-xs text-center">SGPA</TableHead>
													<TableHead className="text-xs text-center">CGPA</TableHead>
													<TableHead className="text-xs text-center">Result</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{reportData.students.map((student, index) => (
													<TableRow key={student.student.id}>
														<TableCell className="text-xs">{index + 1}</TableCell>
														<TableCell className="text-xs font-medium">{student.student.register_number}</TableCell>
														<TableCell className="text-xs">
															{student.student.first_name} {student.student.last_name || ''}
														</TableCell>
														{reportData.courseAnalysis.slice(0, 6).map((ca) => {
															const courseMarks = student.courses.find(c => c.course.id === ca.course.id)
															const evalType = (ca.course.evaluation_type || 'CIA + ESE').trim().toUpperCase()
															const intDisplay = evalType === 'ESE' ? '-' : (courseMarks?.internal_marks ?? '-')
															const extDisplay = evalType === 'CIA' ? '-' : (courseMarks?.external_marks ?? '-')

															return (
																<TableCell key={ca.course.id} className="text-xs text-center">
																	{courseMarks ? (
																		<div className="flex flex-col gap-0.5">
																			<div className="flex justify-center gap-1">
																				<span>{intDisplay}</span>
																				<span>|</span>
																				<span>{extDisplay}</span>
																				<span>|</span>
																				<span className="font-medium">{courseMarks.total_marks}</span>
																			</div>
																			<Badge
																				variant="outline"
																				className={cn(
																					"text-[10px] px-1 py-0",
																					courseMarks.is_pass ? "border-green-500 text-green-600" : "border-red-500 text-red-600"
																				)}
																			>
																				{courseMarks.letter_grade || courseMarks.pass_status}
																			</Badge>
																		</div>
																	) : (
																		<span className="text-muted-foreground">-</span>
																	)}
																</TableCell>
															)
														})}
														<TableCell className="text-xs text-center font-medium">
															{student.semester_result?.sgpa?.toFixed(2) || '-'}
														</TableCell>
														<TableCell className="text-xs text-center font-medium">
															{student.semester_result?.cgpa?.toFixed(2) || '-'}
														</TableCell>
														<TableCell className="text-xs text-center">
															<Badge
																variant={student.semester_result?.result_status === 'Pass' ? 'default' : 'destructive'}
																className="text-[10px]"
															>
																{student.semester_result?.result_status || 'Pending'}
															</Badge>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</ScrollArea>
								</CardContent>
							</Card>
						</TabsContent>

						{/* Course Analysis Tab */}
						<TabsContent value="courses">
							<Card>
								<CardHeader>
									<CardTitle className="text-base">Course-wise Analysis</CardTitle>
									<CardDescription className="text-xs">Performance metrics for each course</CardDescription>
								</CardHeader>
								<CardContent>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="text-xs">Course Code</TableHead>
												<TableHead className="text-xs">Course Title</TableHead>
												<TableHead className="text-xs text-center">Int Max</TableHead>
												<TableHead className="text-xs text-center">Ext Max</TableHead>
												<TableHead className="text-xs text-center">Total Max</TableHead>
												<TableHead className="text-xs text-center">Registered</TableHead>
												<TableHead className="text-xs text-center">Appeared</TableHead>
												<TableHead className="text-xs text-center">Absent</TableHead>
												<TableHead className="text-xs text-center">Passed</TableHead>
												<TableHead className="text-xs text-center">Re-Appear</TableHead>
												<TableHead className="text-xs text-center">Pass %</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{reportData.courseAnalysis.map((ca) => {
											const evalType = (ca.course.evaluation_type || 'CIA + ESE').trim().toUpperCase()
											const intMax = evalType === 'ESE' ? '-' : (ca.course.internal_max_mark || '-')
											const extMax = evalType === 'CIA' ? '-' : (ca.course.external_max_mark || '-')

											return (
												<TableRow key={ca.course.id}>
													<TableCell className="text-xs font-medium">{ca.course.course_code}</TableCell>
													<TableCell className="text-xs">{ca.course.course_name}</TableCell>
													<TableCell className="text-xs text-center">{intMax}</TableCell>
													<TableCell className="text-xs text-center">{extMax}</TableCell>
													<TableCell className="text-xs text-center">{ca.course.total_max_mark}</TableCell>
													<TableCell className="text-xs text-center">{ca.registered}</TableCell>
													<TableCell className="text-xs text-center">{ca.appeared}</TableCell>
													<TableCell className="text-xs text-center">{ca.absent}</TableCell>
													<TableCell className="text-xs text-center text-green-600 font-medium">{ca.passed}</TableCell>
													<TableCell className="text-xs text-center text-yellow-600">{ca.reappear}</TableCell>
													<TableCell className="text-xs text-center">
														<Badge
															variant="outline"
															className={cn(
																"font-medium",
																parseFloat(ca.pass_percentage) >= 80 ? "border-green-500 text-green-600" :
																	parseFloat(ca.pass_percentage) >= 60 ? "border-blue-500 text-blue-600" :
																		parseFloat(ca.pass_percentage) >= 40 ? "border-yellow-500 text-yellow-600" :
																			"border-red-500 text-red-600"
															)}
														>
															{ca.pass_percentage}%
														</Badge>
													</TableCell>
												</TableRow>
											)
										})}
										</TableBody>
									</Table>
								</CardContent>
							</Card>
						</TabsContent>

						{/* Charts Tab */}
						<TabsContent value="charts">
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
								{/* Grade Distribution Pie Chart */}
								<Card>
									<CardHeader>
										<CardTitle className="text-base flex items-center gap-2">
											<PieChartIcon className="h-4 w-4" />
											Grade Distribution
										</CardTitle>
										<CardDescription className="text-xs">Overall grade distribution across all courses</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="h-[300px]">
											<ResponsiveContainer width="100%" height="100%">
												<PieChart>
													<Pie
														data={gradeChartData}
														cx="50%"
														cy="50%"
														labelLine={false}
														label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
														outerRadius={100}
														fill="#8884d8"
														dataKey="value"
													>
														{gradeChartData.map((entry, index) => (
															<Cell key={`cell-${index}`} fill={entry.fill} />
														))}
													</Pie>
													<Tooltip />
													<Legend />
												</PieChart>
											</ResponsiveContainer>
										</div>
									</CardContent>
								</Card>

								{/* Course-wise Pass Percentage Bar Chart */}
								<Card>
									<CardHeader>
										<CardTitle className="text-base flex items-center gap-2">
											<BarChart3 className="h-4 w-4" />
											Course-wise Pass Percentage
										</CardTitle>
										<CardDescription className="text-xs">Pass percentage for each course</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="h-[300px]">
											<ResponsiveContainer width="100%" height="100%">
												<BarChart data={coursePassChartData} layout="vertical">
													<CartesianGrid strokeDasharray="3 3" />
													<XAxis type="number" domain={[0, 100]} />
													<YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} />
													<Tooltip
														content={({ active, payload }) => {
															if (active && payload && payload.length) {
																const data = payload[0].payload
																return (
																	<div className="bg-background border rounded-lg p-2 shadow-lg">
																		<p className="text-xs font-medium">{data.fullName}</p>
																		<p className="text-xs text-muted-foreground">Pass %: {data.pass_percentage}%</p>
																		<p className="text-xs text-muted-foreground">Passed: {data.passed}/{data.registered}</p>
																	</div>
																)
															}
															return null
														}}
													/>
													<Bar
														dataKey="pass_percentage"
														fill="#3b82f6"
														radius={[0, 4, 4, 0]}
													/>
												</BarChart>
											</ResponsiveContainer>
										</div>
									</CardContent>
								</Card>
							</div>
						</TabsContent>

						{/* Top Performers Tab */}
						<TabsContent value="toppers">
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
								{/* Top CGPA Performers */}
								<Card>
									<CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20">
										<CardTitle className="text-base flex items-center gap-2">
											<Trophy className="h-4 w-4 text-amber-500" />
											Top Performers (by CGPA)
										</CardTitle>
										<CardDescription className="text-xs">Learners with highest CGPA</CardDescription>
									</CardHeader>
									<CardContent className="pt-4">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-12 text-xs">Rank</TableHead>
													<TableHead className="text-xs">Reg. No.</TableHead>
													<TableHead className="text-xs">Name</TableHead>
													<TableHead className="text-xs text-center">SGPA</TableHead>
													<TableHead className="text-xs text-center">CGPA</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{reportData.statistics.top_performers.map((student, index) => (
													<TableRow key={student.register_number}>
														<TableCell className="text-xs">
															{index === 0 && <Award className="h-4 w-4 text-amber-500" />}
															{index === 1 && <Award className="h-4 w-4 text-gray-400" />}
															{index === 2 && <Award className="h-4 w-4 text-amber-700" />}
															{index > 2 && index + 1}
														</TableCell>
														<TableCell className="text-xs font-medium">{student.register_number}</TableCell>
														<TableCell className="text-xs">{student.name}</TableCell>
														<TableCell className="text-xs text-center">{student.sgpa?.toFixed(2) || '-'}</TableCell>
														<TableCell className="text-xs text-center font-bold text-blue-600">{student.cgpa?.toFixed(2) || '-'}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</CardContent>
								</Card>

								{/* Highest Scorer */}
								{reportData.statistics.highest_scorer && (
									<Card>
										<CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
											<CardTitle className="text-base flex items-center gap-2">
												<Award className="h-4 w-4 text-green-500" />
												Highest Total Marks
											</CardTitle>
											<CardDescription className="text-xs">Learner with highest aggregate marks</CardDescription>
										</CardHeader>
										<CardContent className="pt-6">
											<div className="flex flex-col items-center gap-4">
												<div className="h-20 w-20 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
													<Trophy className="h-10 w-10 text-white" />
												</div>
												<div className="text-center">
													<p className="text-lg font-bold">{reportData.statistics.highest_scorer.name}</p>
													<p className="text-sm text-muted-foreground">{reportData.statistics.highest_scorer.register_number}</p>
												</div>
												<div className="text-center">
													<p className="text-3xl font-bold text-green-600">
														{reportData.statistics.highest_scorer.total_marks}
													</p>
													<p className="text-sm text-muted-foreground">
														out of {reportData.statistics.highest_scorer.total_max}
													</p>
												</div>
											</div>
										</CardContent>
									</Card>
								)}
							</div>
						</TabsContent>
					</Tabs>
				</>
			)}
		</>
	)
}
