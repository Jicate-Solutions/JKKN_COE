"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import XLSX from "@/lib/utils/excel-compat"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/common/use-toast"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useInstitution } from "@/context/institution-context"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import Link from "next/link"
import {
	Calculator,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Download,
	FileSpreadsheet,
	GraduationCap,
	Loader2,
	Save,
	Search,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	Users,
	BookOpen,
	Award,
	TrendingUp,
	AlertTriangle,
	RefreshCw,
	SkipForward,
	X
} from "lucide-react"
import type { StudentResultRow, InstitutionOption, ProgramData, ExamSessionData, CourseOfferingData } from "@/types/final-marks"

// Step indicator component
const StepIndicator = ({ currentStep, steps }: { currentStep: number; steps: string[] }) => {
	return (
		<div className="flex items-center justify-center mb-6">
			{steps.map((step, index) => (
				<div key={index} className="flex items-center">
					<div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-semibold transition-all ${
						index < currentStep
							? 'bg-green-500 border-green-500 text-white'
							: index === currentStep
								? 'bg-primary border-primary text-white'
								: 'bg-muted border-muted-foreground/30 text-muted-foreground'
					}`}>
						{index < currentStep ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
					</div>
					<span className={`ml-2 text-sm font-medium ${
						index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
					}`}>
						{step}
					</span>
					{index < steps.length - 1 && (
						<div className={`w-12 h-0.5 mx-3 ${
							index < currentStep ? 'bg-green-500' : 'bg-muted-foreground/30'
						}`} />
					)}
				</div>
			))}
		</div>
	)
}

// Progress overlay component - blocks UI during operations
const ProgressOverlay = ({
	isVisible,
	title,
	description,
	onCancel
}: {
	isVisible: boolean
	title: string
	description: string
	onCancel?: () => void
}) => {
	if (!isVisible) return null

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div className="bg-background border rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
				<div className="flex flex-col items-center text-center space-y-4">
					<div className="relative">
						<div className="h-16 w-16 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
						<Calculator className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
					</div>
					<div>
						<h3 className="text-lg font-semibold">{title}</h3>
						<p className="text-sm text-muted-foreground mt-1">{description}</p>
					</div>
					<p className="text-xs text-muted-foreground">
						Please wait. Do not close this window or navigate away.
					</p>
					{onCancel && (
						<Button
							variant="outline"
							size="sm"
							onClick={onCancel}
							className="mt-2"
						>
							<X className="h-4 w-4 mr-1" />
							Cancel
						</Button>
					)}
				</div>
			</div>
		</div>
	)
}

export default function GenerateFinalMarksPage() {
	const { toast } = useToast()
	const steps = ['Select Program', 'Select Courses', 'Generate Results', 'Save & Export']

	// Institution filter hook
	const {
		filter,
		isReady,
		appendToUrl,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		shouldFilter,
		institutionId
	} = useInstitutionFilter()

	// Institution context for accessing available institutions with myjkkn_institution_ids
	const { availableInstitutions } = useInstitution()

	// MyJKKN institution filter hook for fetching programs from MyJKKN API
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Step state
	const [currentStep, setCurrentStep] = useState(0)

	// Dropdown data
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [programs, setPrograms] = useState<ProgramData[]>([])
	const [programsLoading, setProgramsLoading] = useState(false)
	const [sessions, setSessions] = useState<ExamSessionData[]>([])
	const [courseOfferings, setCourseOfferings] = useState<CourseOfferingData[]>([])

	// Use ref for institutions to avoid dependency cycle in useEffect
	const institutionsRef = useRef(institutions)
	useEffect(() => {
		institutionsRef.current = institutions
	}, [institutions])

	// Selection state
	const [selectedInstitution, setSelectedInstitution] = useState("")
	const [selectedProgram, setSelectedProgram] = useState("")
	const [selectedSession, setSelectedSession] = useState("")
	const [selectedCourses, setSelectedCourses] = useState<string[]>([])
	// gradeSystemCode and regulationId are derived from the selected program (useMemo)
	const gradeSystemCode = useMemo<'UG' | 'PG'>(() => {
		if (!selectedProgram) return 'UG'
		const program = programs.find(p => p.id === selectedProgram)
		return program?.grade_system_code || 'UG'
	}, [selectedProgram, programs])

	const regulationId = useMemo(() => {
		if (!selectedProgram) return ''
		const program = programs.find(p => p.id === selectedProgram)
		return program?.regulation_id || ''
	}, [selectedProgram, programs])

	// Results state
	const [results, setResults] = useState<StudentResultRow[]>([])
	const [summary, setSummary] = useState({
		passed: 0,
		failed: 0,
		absent: 0,
		reappear: 0,
		withheld: 0,
		distinction: 0,
		first_class: 0,
		skipped_no_attendance: 0,
		skipped_missing_marks: 0
	})

	// UI state
	const [loading, setLoading] = useState(false)
	const [generating, setGenerating] = useState(false)
	const [saving, setSaving] = useState(false)
	const [isSaved, setIsSaved] = useState(false)
	const [savedCount, setSavedCount] = useState(0)
	const [errorCount, setErrorCount] = useState(0)
	const [saveErrors, setSaveErrors] = useState<Array<{ student_name: string; register_no: string; course_code: string; error: string }>>([])
	const [skippedRecords, setSkippedRecords] = useState<Array<{ student_name: string; register_no: string; course_code: string; reason: string }>>([])
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
	const itemsPerPage = 15

	// Fetch institutions on mount when ready
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady])

	// Auto-fill institution from context when available
	useEffect(() => {
		if (isReady && !mustSelectInstitution && institutions.length > 0) {
			const autoId = getInstitutionIdForCreate()
			if (autoId && !selectedInstitution) {
				setSelectedInstitution(autoId)
			}
		}
	}, [isReady, mustSelectInstitution, institutions, getInstitutionIdForCreate, selectedInstitution])

	// Fetch sessions and programs when institution changes
	// Note: Programs need institutions to be loaded to get myjkkn_institution_ids
	// Using institutionsRef to avoid dependency cycle - only run when selectedInstitution changes
	useEffect(() => {
		const currentInstitutions = institutionsRef.current
		if (selectedInstitution && currentInstitutions.length > 0) {
			fetchSessions(selectedInstitution)
			fetchPrograms(selectedInstitution)
		} else if (selectedInstitution && currentInstitutions.length === 0) {
			// Institution selected but institutions not loaded yet - just fetch sessions
			fetchSessions(selectedInstitution)
		} else {
			setSessions([])
			setPrograms([])
		}
		setSelectedSession("")
		setSelectedProgram("")
		setSelectedCourses([])
		setResults([])
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedInstitution])

	// Fetch course offerings when program and session change
	useEffect(() => {
		if (selectedProgram && selectedSession) {
			fetchCourseOfferings(selectedProgram, selectedSession)
		} else {
			setCourseOfferings([])
		}
		setSelectedCourses([])
		setResults([])
	}, [selectedProgram, selectedSession])

	const fetchInstitutions = async () => {
		try {
			if (availableInstitutions.length > 0) {
				const mapped = availableInstitutions.map(inst => ({
					id: inst.id,
					institution_code: inst.institution_code,
					name: inst.institution_name,
					myjkkn_institution_ids: (inst as any).myjkkn_institution_ids || []
				}))
				setInstitutions(mapped)
				return
			}

			const url = appendToUrl('/api/grading/final-marks?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					institution_code: i.institution_code,
					name: i.name,
					myjkkn_institution_ids: i.myjkkn_institution_ids || []
				})))
			}
		} catch (e) {
			console.error('Failed to fetch institutions:', e)
		}
	}

	const fetchSessions = async (institutionId: string) => {
		try {
			const res = await fetch(`/api/grading/final-marks?action=sessions&institutionId=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(data.map((s: any) => ({
					id: s.id,
					session_code: s.session_code,
					session_name: s.session_name,
					institutions_id: institutionId
				})))
			}
		} catch (e) {
			console.error('Failed to fetch sessions:', e)
		}
	}

	// Fetch programs from MyJKKN API using myjkkn_institution_ids
	const fetchPrograms = async (institutionId: string) => {
		try {
			setProgramsLoading(true)
			setPrograms([])

			const currentInstitutions = institutionsRef.current
			const institution = currentInstitutions.find(i => i.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				console.warn('[GenerateFinalMarks] No MyJKKN institution IDs found for institution:', institutionId)
				setPrograms([])
				return
			}

			console.log('[GenerateFinalMarks] Fetching programs from MyJKKN for institution IDs:', myjkknIds)
			const progs = await fetchMyJKKNPrograms(myjkknIds)

			const transformedPrograms: ProgramData[] = progs.map(p => ({
				id: p.id,
				program_code: p.program_code,
				program_name: p.program_name,
				institutions_id: institutionId,
				program_order: p.program_order ?? 999,
				grade_system_code: inferGradeSystemFromProgram(p.program_code, p.program_name)
			})).sort((a, b) => {
				const orderA = a.program_order ?? 999
				const orderB = b.program_order ?? 999
				if (orderA !== orderB) return orderA - orderB
				return a.program_code.localeCompare(b.program_code)
			})

			console.log('[GenerateFinalMarks] Fetched', transformedPrograms.length, 'programs from MyJKKN')
			setPrograms(transformedPrograms)
		} catch (e) {
			console.error('Failed to fetch programs:', e)
			setPrograms([])
		} finally {
			setProgramsLoading(false)
		}
	}

	// Helper function to infer UG/PG grade system from program code/name
	// This must match the database function get_program_type_from_code()
	const inferGradeSystemFromProgram = (programCode?: string, programName?: string): 'UG' | 'PG' => {
		const code = (programCode || '').toUpperCase()
		const name = (programName || '').toUpperCase()

		const pgPrefixes = ['MSC', 'M.SC', 'M SC', 'MBA', 'MCA', 'MA', 'M.A', 'MCOM', 'M.COM', 'M COM', 'MSW', 'MPHIL', 'PHD', 'PH.D', 'MASTER', 'POST', 'PG']
		for (const prefix of pgPrefixes) {
			if (code.startsWith(prefix) || name.startsWith(prefix)) {
				return 'PG'
			}
		}

		const yearPrefixPgPattern = /^[0-9]{2}P[A-Z]/
		if (yearPrefixPgPattern.test(code)) {
			return 'PG'
		}

		const shortPgPattern = /^P[A-Z]{2,3}$/
		if (shortPgPattern.test(code)) {
			return 'PG'
		}

		return 'UG'
	}

	const fetchCourseOfferings = async (programId: string, sessionId: string) => {
		try {
			setLoading(true)
			const program = programs.find(p => p.id === programId)
			const programCode = program?.program_code || ''

			const res = await fetch(`/api/grading/final-marks?action=course-offerings&institutionId=${selectedInstitution}&programId=${programId}&programCode=${encodeURIComponent(programCode)}&sessionId=${sessionId}`)
			if (res.ok) {
				const data = await res.json()
				setCourseOfferings(data)
			}
		} catch (e) {
			console.error('Failed to fetch course offerings:', e)
		} finally {
			setLoading(false)
		}
	}

	const handleCourseToggle = (courseId: string) => {
		const course = courseOfferings.find(co => co.course_id === courseId)
		if (course && (course.can_regenerate === false || (course.is_cia_only && !course.has_internal_marks))) return

		setSelectedCourses(prev =>
			prev.includes(courseId)
				? prev.filter(id => id !== courseId)
				: [...prev, courseId]
		)
	}

	const handleSelectAllCourses = () => {
		const regeneratableCourses = courseOfferings.filter(co =>
			co.can_regenerate !== false && !(co.is_cia_only && !co.has_internal_marks)
		)
		if (selectedCourses.length === regeneratableCourses.length) {
			setSelectedCourses([])
		} else {
			setSelectedCourses(regeneratableCourses.map(co => co.course_id))
		}
	}

	const handleGenerate = async () => {
		if (!selectedInstitution || !selectedProgram || !selectedSession || selectedCourses.length === 0) {
			toast({
				title: 'Missing Selection',
				description: 'Please select all required fields and at least one course.',
				variant: 'destructive'
			})
			return
		}

		try {
			setGenerating(true)
			setResults([])

			const program = programs.find(p => p.id === selectedProgram)
			const programCode = program?.program_code || ''

			const payload = {
				institutions_id: selectedInstitution,
				program_id: selectedProgram,
				program_code: programCode,
				examination_session_id: selectedSession,
				course_ids: selectedCourses,
				regulation_id: regulationId,
				grade_system_code: gradeSystemCode,
				save_to_db: false
			}

			const res = await fetch('/api/grading/final-marks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			})

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to generate final marks')
			}

			const data = await res.json()
			setResults(data.results || [])
			setSummary(data.summary || {
				passed: 0, failed: 0, absent: 0, reappear: 0, withheld: 0, distinction: 0, first_class: 0,
				skipped_no_attendance: 0, skipped_missing_marks: 0
			})
			setSkippedRecords(data.skipped_records || [])
			setIsSaved(false)

			const skippedTotal = (data.summary?.skipped_no_attendance || 0) + (data.summary?.skipped_missing_marks || 0)
			let description = `Generated results for ${data.total_students} learners across ${data.total_courses} course(s).`
			if (skippedTotal > 0) {
				description += ` (${skippedTotal} skipped due to missing data)`
			}

			toast({
				title: 'Generation Complete',
				description,
				className: 'bg-green-50 border-green-200 text-green-800'
			})

			setCurrentStep(2)
		} catch (e) {
			console.error('Generation error:', e)
			toast({
				title: 'Generation Failed',
				description: e instanceof Error ? e.message : 'Failed to generate final marks',
				variant: 'destructive'
			})
		} finally {
			setGenerating(false)
		}
	}

	const handleSaveToDatabase = async () => {
		if (results.length === 0) {
			toast({
				title: 'No Results',
				description: 'Please generate results first.',
				variant: 'destructive'
			})
			return
		}

		try {
			setSaving(true)

			const program = programs.find(p => p.id === selectedProgram)
			const programCode = program?.program_code || ''

			const payload = {
				institutions_id: selectedInstitution,
				program_id: selectedProgram,
				program_code: programCode,
				examination_session_id: selectedSession,
				course_ids: selectedCourses,
				regulation_id: regulationId,
				grade_system_code: gradeSystemCode,
				save_to_db: true
			}

			const res = await fetch('/api/grading/final-marks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			})

			if (!res.ok) {
				const errorData = await res.json()
				throw new Error(errorData.error || 'Failed to save final marks')
			}

			const data = await res.json()
			setIsSaved(true)
			setSavedCount(data.saved_count || 0)
			setErrorCount(data.errors?.length || 0)
			setSaveErrors(data.errors || [])

			if (data.errors && data.errors.length > 0) {
				console.error('Save errors:', data.errors)
				toast({
					title: 'Partial Save',
					description: `Saved ${data.saved_count} of ${results.length} records. ${data.errors.length} records failed to save.`,
					variant: 'destructive'
				})
			} else {
				toast({
					title: 'Saved Successfully',
					description: `Saved ${data.saved_count} final marks records to the database.`,
					className: 'bg-green-50 border-green-200 text-green-800'
				})
			}

			setCurrentStep(3)
		} catch (e) {
			console.error('Save error:', e)
			toast({
				title: 'Save Failed',
				description: e instanceof Error ? e.message : 'Failed to save final marks',
				variant: 'destructive'
			})
		} finally {
			setSaving(false)
			setConfirmDialogOpen(false)
		}
	}

	const handleExportExcel = () => {
		if (results.length === 0) {
			toast({
				title: 'No Data',
				description: 'No results to export.',
				variant: 'destructive'
			})
			return
		}

		const program = programs.find(p => p.id === selectedProgram)
		const session = sessions.find(s => s.id === selectedSession)

		const excelData = results.map(r => ({
			'Register No': r.register_no,
			'Learner Name': r.student_name,
			'Course Code': r.course_code,
			'Course Name': r.course_name,
			'Internal Marks': r.internal_marks,
			'Internal Max': r.internal_max,
			'Internal Pass': r.internal_pass_mark,
			'External Marks': r.external_marks,
			'External Max': r.external_max,
			'External Pass': r.external_pass_mark,
			'Total Marks': r.total_marks,
			'Total Max': r.total_max,
			'Total Pass': r.total_pass_mark,
			'Percentage': r.percentage,
			'Grade': r.grade,
			'Grade Point': r.grade_point,
			'Credits': r.credits,
			'Credit Points': r.credit_points,
			'Result': r.pass_status,
			'Fail Reason': r.fail_reason || ''
		}))

		const ws = XLSX.utils.json_to_sheet(excelData)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Final Marks')

		const fileName = `final_marks_${program?.program_code || 'program'}_${session?.session_code || 'session'}_${new Date().toISOString().split('T')[0]}.xlsx`
		XLSX.writeFile(wb, fileName)

		toast({
			title: 'Export Successful',
			description: `Exported ${results.length} records to Excel.`,
			className: 'bg-green-50 border-green-200 text-green-800'
		})
	}

	// Sorting and filtering
	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(prev => prev === "asc" ? "desc" : "asc")
		} else {
			setSortColumn(column)
			setSortDirection("asc")
		}
	}

	const getSortIcon = (column: string) => {
		if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		return sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
	}

	const filteredResults = useMemo(() => {
		let filtered = results.filter(r => {
			const searchLower = searchTerm.toLowerCase()
			return (
				r.register_no.toLowerCase().includes(searchLower) ||
				r.student_name.toLowerCase().includes(searchLower) ||
				r.course_code.toLowerCase().includes(searchLower)
			)
		})

		if (sortColumn) {
			filtered = [...filtered].sort((a, b) => {
				const aVal = (a as any)[sortColumn]
				const bVal = (b as any)[sortColumn]
				if (aVal === bVal) return 0
				const comparison = aVal > bVal ? 1 : -1
				return sortDirection === "asc" ? comparison : -comparison
			})
		}

		return filtered
	}, [results, searchTerm, sortColumn, sortDirection])

	const totalPages = Math.ceil(filteredResults.length / itemsPerPage) || 1
	const startIndex = (currentPage - 1) * itemsPerPage
	const pageResults = filteredResults.slice(startIndex, startIndex + itemsPerPage)

	useEffect(() => {
		setCurrentPage(1)
	}, [searchTerm, sortColumn, sortDirection])

	const canProceedStep1 = selectedInstitution && selectedProgram && selectedSession
	const canProceedStep2 = selectedCourses.length > 0

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
					{/* Breadcrumb */}
					<div className="flex items-center gap-2">
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
										<Link href="/grading/grades">Grading</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Generate Final Marks</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Page Header */}
					<div className="flex items-center gap-3 mb-2">
						<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
							<Calculator className="h-5 w-5 text-white" />
						</div>
						<div>
							<h1 className="text-2xl font-bold">Generate Final Marks</h1>
							<p className="text-sm text-muted-foreground">Calculate and save learner final grades</p>
						</div>
					</div>

					{/* Step Indicator */}
					<Card className="p-4">
						<StepIndicator currentStep={currentStep} steps={steps} />
					</Card>

					{/* Step 1: Select Program */}
					{currentStep === 0 && (
						<Card>
							<CardHeader>
								<div className="flex items-center gap-3">
									<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
										<GraduationCap className="h-4 w-4 text-white" />
									</div>
									<div>
										<CardTitle>Step 1: Select Program & Session</CardTitle>
										<CardDescription>Choose the institution, program, and examination session</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className={`grid grid-cols-1 gap-4 ${mustSelectInstitution ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
									{/* Institution - Show only when mustSelectInstitution is true */}
									{mustSelectInstitution && (
										<div className="space-y-2">
											<Label>Institution *</Label>
											<Select value={selectedInstitution} onValueChange={setSelectedInstitution}>
												<SelectTrigger>
													<SelectValue placeholder="Select institution" />
												</SelectTrigger>
												<SelectContent>
													{institutions.map(inst => (
														<SelectItem key={inst.id} value={inst.id}>
															{inst.institution_code} - {inst.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}
									<div className="space-y-2">
										<Label>Examination Session *</Label>
										<Select value={selectedSession} onValueChange={setSelectedSession} disabled={mustSelectInstitution && !selectedInstitution}>
											<SelectTrigger>
												<SelectValue placeholder="Select session" />
											</SelectTrigger>
											<SelectContent>
												{sessions.map(s => (
													<SelectItem key={s.id} value={s.id}>
														{s.session_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label>Program *</Label>
										<Select value={selectedProgram} onValueChange={setSelectedProgram} disabled={(mustSelectInstitution && !selectedInstitution) || programsLoading}>
											<SelectTrigger>
												{programsLoading ? (
													<span className="flex items-center gap-2 text-muted-foreground">
														<Loader2 className="h-4 w-4 animate-spin" />
														Loading programs...
													</span>
												) : (
													<SelectValue placeholder="Select program" />
												)}
											</SelectTrigger>
											<SelectContent>
												{programs.map(p => (
													<SelectItem key={p.id} value={p.id}>
														{p.program_code} - {p.program_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								</div>

								{selectedProgram && (
									<div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
										<Badge variant="outline">{gradeSystemCode} Grade System</Badge>
										{regulationId && <span className="text-sm text-muted-foreground">Regulation: {programs.find(p => p.id === selectedProgram)?.regulation_code}</span>}
									</div>
								)}

								<div className="flex justify-end pt-4">
									<Button onClick={() => setCurrentStep(1)} disabled={!canProceedStep1}>
										Next: Select Courses
										<ChevronRight className="h-4 w-4 ml-1" />
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Step 2: Select Courses */}
					{currentStep === 1 && (
						<Card>
							<CardHeader>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center">
											<BookOpen className="h-4 w-4 text-white" />
										</div>
										<div>
											<CardTitle>Step 2: Select Courses</CardTitle>
											<CardDescription>Choose courses for final marks calculation</CardDescription>
										</div>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={handleSelectAllCourses}
										disabled={courseOfferings.filter(co => co.can_regenerate !== false).length === 0}
									>
										{selectedCourses.length === courseOfferings.filter(co => co.can_regenerate !== false).length && selectedCourses.length > 0 ? 'Deselect All' : 'Select All'}
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								{loading ? (
									<div className="flex items-center justify-center py-8">
										<Loader2 className="h-6 w-6 animate-spin mr-2" />
										<span>Loading courses...</span>
									</div>
								) : courseOfferings.length === 0 ? (
									<div className="text-center py-8 text-muted-foreground">
										<BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
										<p>No course offerings found for the selected program and session.</p>
									</div>
								) : (
									<div className="space-y-4">
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
											{courseOfferings.map(co => {
												const canSelect = co.can_regenerate !== false &&
													!(co.is_cia_only && !co.has_internal_marks)
												const isLocked = co.is_saved === true || (co.is_cia_only && !co.has_internal_marks)

												return (
													<div
														key={co.id}
														className={`p-3 border rounded-lg transition-all ${
															isLocked
																? co.is_cia_only && !co.has_internal_marks && !co.is_saved
																	? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-700 cursor-not-allowed opacity-70'
																	: 'border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700 cursor-not-allowed opacity-70'
																: selectedCourses.includes(co.course_id)
																	? 'border-primary bg-primary/5 cursor-pointer'
																	: 'border-border hover:border-primary/50 cursor-pointer'
														}`}
														onClick={() => canSelect && handleCourseToggle(co.course_id)}
													>
														<div className="flex items-start gap-3">
															<Checkbox
																checked={selectedCourses.includes(co.course_id)}
																onCheckedChange={() => canSelect && handleCourseToggle(co.course_id)}
																onClick={(e) => e.stopPropagation()}
																disabled={!canSelect}
																className={!canSelect ? 'opacity-50' : ''}
															/>
															<div className="flex-1">
																<div className="flex items-center gap-2 flex-wrap">
																	<div className="font-medium text-sm">{co.course_code}</div>
																	{co.is_saved && co.result_status && (
																		<Badge
																			variant="outline"
																			className={`text-xs ${
																				co.result_status === 'Pending'
																					? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700'
																					: co.result_status === 'Published'
																						? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700'
																						: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700'
																			}`}
																		>
																			{co.result_status === 'Pending' ? (
																				<CheckCircle2 className="h-3 w-3 mr-1" />
																			) : (
																				<AlertTriangle className="h-3 w-3 mr-1" />
																			)}
																			{co.result_status}
																		</Badge>
																	)}
																</div>
																<div className="text-xs text-muted-foreground">{co.course_name}</div>
																<div className="flex items-center gap-2 mt-1">
																	<Badge variant="secondary" className="text-xs">Sem {co.semester}</Badge>
																	<Badge variant="outline" className="text-xs">{co.credits} Credits</Badge>
																	{co.is_cia_only && (
																		<Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-700">
																			CIA Only
																		</Badge>
																	)}
																</div>
																{co.is_cia_only && !co.is_saved && (
																	<div className={`text-xs mt-2 flex items-center gap-1 ${
																		co.has_internal_marks
																			? 'text-green-600 dark:text-green-400'
																			: 'text-red-600 dark:text-red-400'
																	}`}>
																		{co.has_internal_marks ? (
																			<>
																				<CheckCircle2 className="h-3 w-3" />
																				Internal marks available ({co.internal_marks_count} entries)
																			</>
																		) : (
																			<>
																				<AlertTriangle className="h-3 w-3" />
																				No internal marks found - Cannot generate
																			</>
																		)}
																	</div>
																)}
																{co.is_saved && (
																	<div className={`text-xs mt-2 flex items-center gap-1 ${
																		co.result_status === 'Pending'
																			? 'text-amber-600 dark:text-amber-400'
																			: 'text-red-600 dark:text-red-400'
																	}`}>
																		<AlertTriangle className="h-3 w-3" />
																		Already saved - Status: {co.result_status} (Cannot regenerate)
																	</div>
																)}
															</div>
														</div>
													</div>
												)
											})}
										</div>

										<div className="flex items-center justify-between pt-4 border-t">
											<div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
												<span>{selectedCourses.length} of {courseOfferings.filter(co => co.can_regenerate !== false).length} course(s) selected</span>
												{courseOfferings.filter(co => co.is_saved).length > 0 && (
													<span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
														<AlertTriangle className="h-3.5 w-3.5" />
														{courseOfferings.filter(co => co.is_saved).length} already saved (locked)
													</span>
												)}
											</div>
											<div className="flex gap-2">
												<Button variant="outline" onClick={() => setCurrentStep(0)} disabled={generating}>
													<ChevronLeft className="h-4 w-4 mr-1" />
													Back
												</Button>
												<Button onClick={handleGenerate} disabled={!canProceedStep2 || generating}>
													{generating ? (
														<>
															<Loader2 className="h-4 w-4 mr-2 animate-spin" />
															Generating...
														</>
													) : (
														<>
															Generate Results
															<Calculator className="h-4 w-4 ml-1" />
														</>
													)}
												</Button>
											</div>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
					)}

					{/* Step 3: Review Results */}
					{currentStep === 2 && (
						<>
							{/* Summary Cards */}
							<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
								<Card className="border-l-4 border-l-blue-500">
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Total</p>
												<p className="text-xl font-bold">{results.length}</p>
											</div>
											<Users className="h-5 w-5 text-blue-500" />
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-green-500">
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Passed</p>
												<p className="text-xl font-bold text-green-600">{summary.passed}</p>
											</div>
											<CheckCircle2 className="h-5 w-5 text-green-500" />
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-red-500">
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Failed</p>
												<p className="text-xl font-bold text-red-600">{summary.failed}</p>
											</div>
											<AlertTriangle className="h-5 w-5 text-red-500" />
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-orange-500">
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Absent</p>
												<p className="text-xl font-bold text-orange-600">{summary.absent}</p>
											</div>
											<Users className="h-5 w-5 text-orange-500" />
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-purple-500">
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Distinction</p>
												<p className="text-xl font-bold text-purple-600">{summary.distinction}</p>
											</div>
											<Award className="h-5 w-5 text-purple-500" />
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-indigo-500">
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">First Class</p>
												<p className="text-xl font-bold text-indigo-600">{summary.first_class}</p>
											</div>
											<TrendingUp className="h-5 w-5 text-indigo-500" />
										</div>
									</CardContent>
								</Card>
								<Card className="border-l-4 border-l-sky-500">
									<CardContent className="p-3">
										<div className="flex items-center justify-between">
											<div>
												<p className="text-xs font-medium text-muted-foreground">Pass %</p>
												<p className="text-xl font-bold">{results.length > 0 ? Math.round((summary.passed / results.length) * 100) : 0}%</p>
											</div>
											<TrendingUp className="h-5 w-5 text-blue-500" />
										</div>
									</CardContent>
								</Card>
							</div>

							{/* Skipped Records Info */}
							{(summary.skipped_no_attendance > 0 || summary.skipped_missing_marks > 0) && (
								<Card className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
									<CardContent className="p-3">
										<div className="flex items-center gap-3">
											<SkipForward className="h-5 w-5 text-amber-600 dark:text-amber-400" />
											<div className="flex-1">
												<p className="text-sm font-medium text-amber-800 dark:text-amber-200">
													{summary.skipped_no_attendance + summary.skipped_missing_marks} record(s) skipped due to incomplete data
												</p>
												<p className="text-xs text-amber-600 dark:text-amber-400">
													{summary.skipped_no_attendance > 0 && `${summary.skipped_no_attendance} missing attendance`}
													{summary.skipped_no_attendance > 0 && summary.skipped_missing_marks > 0 && ' • '}
													{summary.skipped_missing_marks > 0 && `${summary.skipped_missing_marks} missing marks (internal/external)`}
												</p>
											</div>
										</div>
										{skippedRecords.length > 0 && (
											<div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-700">
												<p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">Skipped Records Details:</p>
												<div className="max-h-32 overflow-y-auto space-y-1">
													{skippedRecords.map((record, idx) => (
														<div key={idx} className="text-xs bg-white dark:bg-gray-800 rounded px-2 py-1 flex justify-between items-center">
															<span>
																<span className="font-medium">{record.register_no}</span>
																<span className="text-gray-500 mx-1">-</span>
																<span>{record.student_name}</span>
																<span className="text-gray-400 mx-1">|</span>
																<span className="text-gray-600 dark:text-gray-400">{record.course_code}</span>
															</span>
															<span className="text-amber-600 dark:text-amber-400 ml-2">{record.reason}</span>
														</div>
													))}
												</div>
											</div>
										)}
									</CardContent>
								</Card>
							)}

							{/* Results Table */}
							<Card>
								<CardHeader className="p-3">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center">
												<FileSpreadsheet className="h-4 w-4 text-white" />
											</div>
											<div>
												<CardTitle className="text-lg">Step 3: Review Results</CardTitle>
												<CardDescription>Review and verify calculated results</CardDescription>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<div className="relative">
												<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
												<Input
													value={searchTerm}
													onChange={(e) => setSearchTerm(e.target.value)}
													placeholder="Search..."
													className="pl-7 h-8 w-48 text-xs"
												/>
											</div>
											<Button variant="outline" size="sm" onClick={handleExportExcel} className="text-xs">
												<Download className="h-3 w-3 mr-1" />
												Excel
											</Button>
										</div>
									</div>
								</CardHeader>
								<CardContent className="p-3 pt-0">
									<div className="rounded-md border overflow-hidden" style={{ height: "400px" }}>
										<div className="h-full overflow-auto">
											<Table>
												<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
													<TableRow>
														<TableHead className="w-[100px] text-xs">
															<Button variant="ghost" size="sm" onClick={() => handleSort("register_no")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
																Register No {getSortIcon("register_no")}
															</Button>
														</TableHead>
														<TableHead className="text-xs">
															<Button variant="ghost" size="sm" onClick={() => handleSort("student_name")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
																Name {getSortIcon("student_name")}
															</Button>
														</TableHead>
														<TableHead className="w-[80px] text-xs">Course</TableHead>
														<TableHead className="w-[60px] text-xs text-center">Int</TableHead>
														<TableHead className="w-[60px] text-xs text-center">Ext</TableHead>
														<TableHead className="w-[60px] text-xs text-center">Total</TableHead>
														<TableHead className="w-[50px] text-xs text-center">%</TableHead>
														<TableHead className="w-[50px] text-xs text-center">Grade</TableHead>
														<TableHead className="w-[40px] text-xs text-center">GP</TableHead>
														<TableHead className="w-[40px] text-xs text-center">Cr</TableHead>
														<TableHead className="w-[50px] text-xs text-center">CP</TableHead>
														<TableHead className="w-[70px] text-xs text-center">Result</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{pageResults.length === 0 ? (
														<TableRow>
															<TableCell colSpan={12} className="h-24 text-center text-sm text-muted-foreground">
																{searchTerm ? 'No matching results' : 'No results generated'}
															</TableCell>
														</TableRow>
													) : (
														pageResults.map((row, idx) => (
															<TableRow key={`${row.student_id}-${row.course_id}-${idx}`}>
																<TableCell className="text-sm font-medium">{row.register_no}</TableCell>
																<TableCell className="text-sm">{row.student_name}</TableCell>
																<TableCell className="text-sm">{row.course_code}</TableCell>
																<TableCell className="text-sm text-center">{row.internal_marks}/{row.internal_max}</TableCell>
																<TableCell className="text-sm text-center">{row.external_marks}/{row.external_max}</TableCell>
																<TableCell className="text-sm text-center font-medium">{row.total_marks}/{row.total_max}</TableCell>
																<TableCell className="text-sm text-center">{row.percentage.toFixed(1)}</TableCell>
																<TableCell className="text-sm text-center font-bold">{row.grade}</TableCell>
																<TableCell className="text-sm text-center">{row.grade_point}</TableCell>
																<TableCell className="text-sm text-center">{row.credits}</TableCell>
																<TableCell className="text-sm text-center">{row.credit_points.toFixed(1)}</TableCell>
																<TableCell className="text-center">
																	<Badge
																		variant={row.is_pass ? "default" : "destructive"}
																		className={`text-xs ${
																			row.pass_status === 'Pass' ? 'bg-green-600' :
																			row.pass_status === 'Absent' ? 'bg-orange-500' :
																			'bg-red-600'
																		}`}
																	>
																		{row.pass_status}
																	</Badge>
																</TableCell>
															</TableRow>
														))
													)}
												</TableBody>
											</Table>
										</div>
									</div>

									{/* Pagination */}
									<div className="flex items-center justify-between space-x-2 py-2 mt-2">
										<div className="text-xs text-muted-foreground">
											Showing {filteredResults.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredResults.length)} of {filteredResults.length}
										</div>
										<div className="flex items-center gap-2">
											<Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 px-2 text-xs">
												<ChevronLeft className="h-3 w-3 mr-1" /> Previous
											</Button>
											<div className="text-xs text-muted-foreground px-2">Page {currentPage} of {totalPages}</div>
											<Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-7 px-2 text-xs">
												Next <ChevronRight className="h-3 w-3 ml-1" />
											</Button>
										</div>
									</div>

									{/* Actions */}
									<div className="flex items-center justify-between pt-4 border-t">
										<Button variant="outline" onClick={() => setCurrentStep(1)} disabled={saving || generating}>
											<ChevronLeft className="h-4 w-4 mr-1" />
											Back to Courses
										</Button>
										<div className="flex gap-2">
											<Button variant="outline" onClick={() => {
												setResults([])
												handleGenerate()
											}} disabled={saving || generating}>
												<RefreshCw className="h-4 w-4 mr-1" />
												Regenerate
											</Button>
											<Button onClick={() => setConfirmDialogOpen(true)} disabled={results.length === 0 || isSaved || saving || generating}>
												{saving ? (
													<>
														<Loader2 className="h-4 w-4 mr-1 animate-spin" />
														Saving...
													</>
												) : (
													<>
														<Save className="h-4 w-4 mr-1" />
														{isSaved ? 'Saved' : 'Save to Database'}
													</>
												)}
											</Button>
										</div>
									</div>
								</CardContent>
							</Card>
						</>
					)}

					{/* Step 4: Save & Export */}
					{currentStep === 3 && (
						<Card>
							<CardHeader>
								<div className="flex items-center gap-3">
									<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
										<CheckCircle2 className="h-4 w-4 text-white" />
									</div>
									<div>
										<CardTitle>Step 4: Complete</CardTitle>
										<CardDescription>Final marks have been saved successfully</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className="space-y-6">
								{/* Summary Stats */}
								<div className={`${errorCount > 0 ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'} border rounded-lg p-6 text-center`}>
									<CheckCircle2 className={`h-16 w-16 mx-auto ${errorCount > 0 ? 'text-amber-500' : 'text-green-500'} mb-4`} />
									<h3 className={`text-xl font-bold ${errorCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-300'} mb-2`}>
										{errorCount > 0 ? 'Final Marks Partially Saved' : 'Final Marks Saved Successfully!'}
									</h3>
									<div className="flex flex-wrap justify-center gap-4 mt-4">
										<div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow-sm">
											<div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{results.length}</div>
											<div className="text-xs text-gray-500">Total Generated</div>
										</div>
										<div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow-sm">
											<div className="text-2xl font-bold text-green-600">{savedCount}</div>
											<div className="text-xs text-gray-500">Saved</div>
										</div>
										{errorCount > 0 && (
											<div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow-sm">
												<div className="text-2xl font-bold text-red-600">{errorCount}</div>
												<div className="text-xs text-gray-500">Failed</div>
											</div>
										)}
									</div>
								</div>

								{/* Error Details */}
								{saveErrors.length > 0 && (
									<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
										<h4 className="font-semibold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2">
											<X className="h-4 w-4" />
											Failed Records ({saveErrors.length})
										</h4>
										<div className="max-h-48 overflow-y-auto space-y-2">
											{saveErrors.map((err, idx) => (
												<div key={idx} className="text-sm bg-white dark:bg-gray-800 rounded p-2 border border-red-100 dark:border-red-800">
													<span className="font-medium">{err.student_name}</span>
													<span className="text-gray-500 mx-1">({err.register_no})</span>
													<span className="text-gray-400">-</span>
													<span className="text-gray-600 dark:text-gray-400 ml-1">{err.course_code}</span>
													<div className="text-xs text-red-600 dark:text-red-400 mt-1">{err.error}</div>
												</div>
											))}
										</div>
									</div>
								)}

								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<Card className="p-4">
										<h4 className="font-semibold mb-3 flex items-center gap-2">
											<Download className="h-4 w-4" />
											Export Options
										</h4>
										<div className="space-y-2">
											<Button variant="outline" className="w-full justify-start" onClick={handleExportExcel}>
												<FileSpreadsheet className="h-4 w-4 mr-2" />
												Export to Excel
											</Button>
										</div>
									</Card>
									<Card className="p-4">
										<h4 className="font-semibold mb-3 flex items-center gap-2">
											<TrendingUp className="h-4 w-4" />
											Quick Actions
										</h4>
										<div className="space-y-2">
											<Button variant="outline" className="w-full justify-start" onClick={() => {
												setCurrentStep(0)
												setSelectedCourses([])
												setResults([])
												setIsSaved(false)
												setSavedCount(0)
												setErrorCount(0)
												setSaveErrors([])
											}}>
												<RefreshCw className="h-4 w-4 mr-2" />
												Generate for Another Program
											</Button>
											<Button variant="outline" className="w-full justify-start" asChild>
												<Link href="/grading/grades">
													<Award className="h-4 w-4 mr-2" />
													View All Final Marks
												</Link>
											</Button>
										</div>
									</Card>
								</div>
							</CardContent>
						</Card>
					)}
				</div>
				<AppFooter />
			</SidebarInset>

			{/* Confirmation Dialog */}
			<AlertDialog open={confirmDialogOpen} onOpenChange={(open) => !saving && setConfirmDialogOpen(open)}>
				<AlertDialogContent>
					{!saving && (
						<button
							onClick={() => setConfirmDialogOpen(false)}
							className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
						>
							<X className="h-4 w-4" />
							<span className="sr-only">Close</span>
						</button>
					)}
					<AlertDialogHeader>
						<AlertDialogTitle>Save Final Marks to Database?</AlertDialogTitle>
						<AlertDialogDescription>
							This will save {results.length} final marks records to the database.
							Existing records for the same learner-course-session combination will be updated.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleSaveToDatabase} disabled={saving}>
							{saving ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Saving...
								</>
							) : (
								<>
									<Save className="h-4 w-4 mr-2" />
									Save to Database
								</>
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Progress Overlay - blocks UI during generate/save operations */}
			<ProgressOverlay
				isVisible={generating}
				title="Generating Final Marks"
				description={`Calculating results for ${selectedCourses.length} course(s)...`}
			/>
			<ProgressOverlay
				isVisible={saving}
				title="Saving to Database"
				description={`Saving ${results.length} final marks records...`}
			/>
		</SidebarProvider>
	)
}
