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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useToast } from "@/hooks/common/use-toast"
import { Loader2, FileText, Check, ChevronsUpDown, GraduationCap, ChevronDown, ChevronRight, Download, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { downloadSemesterMarksheetPDF, downloadMergedMarksheetPDF, fetchImageAsBase64, type StudentMarksheetData } from "@/lib/utils/generate-semester-marksheet-pdf"
import { PDFProgressModal } from "@/components/ui/pdf-progress-modal"

// =====================================================
// TYPE DEFINITIONS
// =====================================================

interface Institution {
	id: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids?: string[] | null
}

interface Program {
	program_code: string
	program_name: string
}

interface ExamSession {
	id: string
	session_code: string
	session_name: string
}

interface Student {
	id: string
	registerNo: string
	name: string
}

interface CourseResult {
	courseCode: string
	courseName: string
	part: string
	partDescription?: string
	semester: number
	semesterCode?: string
	courseOrder: number
	credits: number
	eseMax: number
	ciaMax: number
	totalMax: number
	eseMarks: number
	ciaMarks: number
	totalMarks: number
	percentage: number
	gradePoint: number
	letterGrade: string
	creditPoints: number
	isPassing: boolean
	result: string
	resultType?: string
	passStatus?: string
	creditValue?: number
}

interface PartBreakdown {
	partName: string
	partDescription: string
	courses: CourseResult[]
	totalCredits: number
	totalCreditPoints: number
	partGPA: number
	creditsEarned: number
}

interface MarksheetData {
	student: {
		id: string
		name: string
		registerNo: string
		dateOfBirth?: string
		photoUrl?: string
		firstName?: string
		lastName?: string
		fatherName?: string
		motherName?: string
		gender?: string
	}
	semester: number
	session: {
		id: string
		name: string
		monthYear: string
	}
	program: {
		code: string
		name: string
		isPG?: boolean
	}
	courses: CourseResult[]
	partBreakdown: PartBreakdown[]
	summary: {
		totalCourses: number
		totalCredits: number
		creditsEarned: number
		totalCreditPoints: number
		semesterGPA: number
		cgpa?: number
		passedCount: number
		failedCount: number
		overallResult: string
		folio?: string
	}
}

// Part colors for UI
const PART_COLORS: Record<string, string> = {
	'Part I': 'bg-blue-500',
	'Part II': 'bg-green-500',
	'Part III': 'bg-purple-500',
	'Part IV': 'bg-orange-500',
	'Part V': 'bg-pink-500'
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export default function SemesterMarksheetPage() {
	const { toast } = useToast()

	// Institution filter hook
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId
	} = useInstitutionFilter()

	// MyJKKN data fetching hook
	const { fetchPrograms: fetchMyJKKNPrograms } = useMyJKKNInstitutionFilter()

	// Dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [sessions, setSessions] = useState<ExamSession[]>([])
	const [semesters, setSemesters] = useState<number[]>([])
	const [students, setStudents] = useState<Student[]>([])

	// Selected values
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const [selectedProgramCode, setSelectedProgramCode] = useState<string>("")
	const [selectedSessionId, setSelectedSessionId] = useState<string>("")
	const [selectedSemester, setSelectedSemester] = useState<string>("")
	const [selectedStudentId, setSelectedStudentId] = useState<string>("")

	// Loading states
	const [loadingInstitutions, setLoadingInstitutions] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingSessions, setLoadingSessions] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)
	const [loadingStudents, setLoadingStudents] = useState(false)
	const [loadingMarksheet, setLoadingMarksheet] = useState(false)
	const [generatingPDF, setGeneratingPDF] = useState(false)
	const [generatingBatchPDF, setGeneratingBatchPDF] = useState(false)

	// Progress tracking for PDF generation
	const [pdfProgress, setPdfProgress] = useState({
		isOpen: false,
		currentStep: 0,
		totalSteps: 0,
		currentOperation: '',
		operationType: 'single' as 'single' | 'batch'
	})

	// Popover open states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [semesterOpen, setSemesterOpen] = useState(false)
	const [studentOpen, setStudentOpen] = useState(false)

	// Marksheet data
	const [marksheetData, setMarksheetData] = useState<MarksheetData | null>(null)

	// Collapsible states for parts
	const [openParts, setOpenParts] = useState<Record<string, boolean>>({})

	// =====================================================
	// DATA FETCHING
	// =====================================================

	// Load institutions when context is ready
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady])

	// Auto-select institution from context when available (for non-super_admin users)
	useEffect(() => {
		if (isReady && contextInstitutionId && !selectedInstitutionId) {
			setSelectedInstitutionId(contextInstitutionId)
		}
	}, [isReady, contextInstitutionId, selectedInstitutionId])

	const fetchInstitutions = useCallback(async () => {
		try {
			setLoadingInstitutions(true)
			const url = appendToUrl('/api/exam-management/exam-attendance/dropdowns?type=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)

				// Auto-select logic
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

	const fetchSessions = useCallback(async (institutionId: string) => {
		try {
			setLoadingSessions(true)
			// Filter sessions by institution for better performance
			const url = `/api/exam-management/examination-sessions?institutions_id=${institutionId}`
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setSessions(data)
			}
		} catch (error) {
			console.error('Error fetching sessions:', error)
		} finally {
			setLoadingSessions(false)
		}
	}, [])

	// Institution -> Sessions
	useEffect(() => {
		if (selectedInstitutionId) {
			setSelectedSessionId("")
			setSelectedProgramCode("")
			setSelectedSemester("")
			setSelectedStudentId("")
			setSessions([])
			setPrograms([])
			setSemesters([])
			setStudents([])
			setMarksheetData(null)
			fetchSessions(selectedInstitutionId)
		}
	}, [selectedInstitutionId, fetchSessions])

	const fetchPrograms = useCallback(async (institutionId: string) => {
		try {
			setLoadingPrograms(true)
			setPrograms([])

			// Get the institution with its myjkkn_institution_ids
			const institution = institutions.find(i => i.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			console.log('[Semester Marksheet] Fetching programs for institution:', institution?.institution_code, 'myjkknIds:', myjkknIds)

			if (myjkknIds.length === 0) {
				console.warn('[Semester Marksheet] No MyJKKN institution IDs found for institution:', institutionId)
				setPrograms([])
				return
			}

			// Fetch programs from MyJKKN API using the hook
			const progs = await fetchMyJKKNPrograms(myjkknIds)
			console.log('[Semester Marksheet] Programs from MyJKKN:', progs.length)

			// Map to our Program interface
			const mappedPrograms: Program[] = progs.map((p: any) => ({
				program_code: p.program_code,
				program_name: p.program_name
			}))

			setPrograms(mappedPrograms)
		} catch (error) {
			console.error('Error fetching programs:', error)
			setPrograms([])
		} finally {
			setLoadingPrograms(false)
		}
	}, [institutions, fetchMyJKKNPrograms])

	// Session -> Programs
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId && institutions.length > 0) {
			setSelectedProgramCode("")
			setSelectedSemester("")
			setSelectedStudentId("")
			setPrograms([])
			setSemesters([])
			setStudents([])
			setMarksheetData(null)
			fetchPrograms(selectedInstitutionId)
		}
	}, [selectedSessionId, selectedInstitutionId, institutions.length, fetchPrograms])

	const fetchSemesters = useCallback(async (institutionId: string, programCode: string, sessionId: string) => {
		try {
			setLoadingSemesters(true)
			const res = await fetch(`/api/reports/semester-marksheet?action=semesters&institutionId=${institutionId}&programCode=${programCode}&sessionId=${sessionId}`)
			if (res.ok) {
				const data = await res.json()
				setSemesters(data.semesters || [])
			}
		} catch (error) {
			console.error('Error fetching semesters:', error)
		} finally {
			setLoadingSemesters(false)
		}
	}, [])

	// Program -> Semesters
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId && selectedProgramCode) {
			setSelectedSemester("")
			setSelectedStudentId("")
			setSemesters([])
			setStudents([])
			setMarksheetData(null)
			fetchSemesters(selectedInstitutionId, selectedProgramCode, selectedSessionId)
		}
	}, [selectedProgramCode, selectedInstitutionId, selectedSessionId, fetchSemesters])

	const fetchStudents = useCallback(async (institutionId: string, sessionId: string, programCode: string, semester: string) => {
		try {
			setLoadingStudents(true)
			const url = `/api/reports/semester-marksheet?action=students&institutionId=${institutionId}&sessionId=${sessionId}&programCode=${programCode}&semester=${semester}`

			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setStudents(data.students || [])
			}
		} catch (error) {
			console.error('Error fetching students:', error)
		} finally {
			setLoadingStudents(false)
		}
	}, [])

	// Semester -> Students
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId && selectedProgramCode && selectedSemester) {
			setSelectedStudentId("")
			setStudents([])
			setMarksheetData(null)
			fetchStudents(selectedInstitutionId, selectedSessionId, selectedProgramCode, selectedSemester)
		}
	}, [selectedSemester, selectedInstitutionId, selectedSessionId, selectedProgramCode, fetchStudents])

	// Load marksheet when student selected (optional - for individual view)
	useEffect(() => {
		if (selectedStudentId && selectedSessionId) {
			fetchMarksheet()
		} else {
			setMarksheetData(null)
		}
	}, [selectedStudentId])

	const fetchMarksheet = async () => {
		if (!selectedStudentId || !selectedSessionId) return

		try {
			setLoadingMarksheet(true)
			let url = `/api/reports/semester-marksheet?action=student-marksheet&studentId=${selectedStudentId}&sessionId=${selectedSessionId}`
			if (selectedSemester) url += `&semester=${selectedSemester}`

			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setMarksheetData(data)

				// Open all parts by default
				const parts: Record<string, boolean> = {}
				data.partBreakdown?.forEach((p: PartBreakdown) => {
					parts[p.partName] = true
				})
				setOpenParts(parts)
			} else {
				const error = await res.json()
				toast({
					title: '❌ Error',
					description: error.error || 'Failed to load marksheet',
					variant: 'destructive'
				})
			}
		} catch (error) {
			console.error('Error fetching marksheet:', error)
			toast({
				title: '❌ Error',
				description: 'Failed to load marksheet',
				variant: 'destructive'
			})
		} finally {
			setLoadingMarksheet(false)
		}
	}

	// =====================================================
	// PDF GENERATION
	// =====================================================

	const handleDownloadPDF = async (withHeader: boolean = false) => {
		if (!marksheetData) return

		try {
			setGeneratingPDF(true)

			const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
			const selectedSession = sessions.find(s => s.id === selectedSessionId)

			// Step 1: Initialize progress modal
			const totalSteps = 4 // photo + logo + prepare + generate
			setPdfProgress({
				isOpen: true,
				currentStep: 0,
				totalSteps,
				currentOperation: 'Loading student photo...',
				operationType: 'single'
			})

			// Convert photo URL to base64 for PDF (jsPDF needs base64, not URL)
			let photoBase64: string | null = null
			console.log('[handleDownloadPDF] Student photoUrl from API:', marksheetData.student.photoUrl)
			if (marksheetData.student.photoUrl) {
				photoBase64 = await fetchImageAsBase64(marksheetData.student.photoUrl)
				console.log('[handleDownloadPDF] Photo converted to base64:', photoBase64 ? `Success (${photoBase64.length} chars)` : 'Failed')
			} else {
				console.log('[handleDownloadPDF] No photo URL available for student')
			}

			// Step 2: Photo loaded
			setPdfProgress(prev => ({
				...prev,
				currentStep: 1,
				currentOperation: 'Loading institution logo...'
			}))

			// Fetch logo for header (only needed when withHeader is true)
			let logoBase64: string | undefined = undefined
			if (withHeader) {
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
				} catch (e) {
					console.warn('Logo not loaded:', e)
				}
			}

			// Step 3: Logo loaded
			setPdfProgress(prev => ({
				...prev,
				currentStep: 2,
				currentOperation: 'Preparing marksheet data...'
			}))

			// Prepare data for PDF
			const pdfData: StudentMarksheetData = {
				student: {
					...marksheetData.student,
					photoUrl: photoBase64 || undefined  // Use base64 instead of URL
				},
				semester: marksheetData.semester,
				session: {
					id: selectedSessionId,
					name: selectedSession?.session_name || '',
					monthYear: marksheetData.session?.monthYear || ''
				},
				program: marksheetData.program,
				institution: selectedInstitution ? {
					name: selectedInstitution.institution_name,
					code: selectedInstitution.institution_code
				} : undefined,
				courses: marksheetData.courses,
				partBreakdown: marksheetData.partBreakdown,
				summary: marksheetData.summary,
				logoImage: logoBase64,
				generatedDate: new Date().toLocaleDateString('en-IN', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric'
				})
			}

			// Step 4: Data prepared
			setPdfProgress(prev => ({
				...prev,
				currentStep: 3,
				currentOperation: 'Generating PDF document...'
			}))

			// Download PDF directly with header option
			const suffix = withHeader ? '_with_header' : ''
			downloadSemesterMarksheetPDF(
				pdfData,
				`Marksheet_${marksheetData.student.registerNo}_Sem${marksheetData.semester}${suffix}.pdf`,
				{ showHeader: withHeader }
			)

			// Step 5: Complete
			setPdfProgress(prev => ({
				...prev,
				currentStep: totalSteps,
				currentOperation: 'PDF generated successfully!'
			}))

			// Close modal after a brief delay
			setTimeout(() => {
				setPdfProgress(prev => ({ ...prev, isOpen: false }))
			}, 1500)

			toast({
				title: '✅ PDF Downloaded',
				description: withHeader ? 'Marksheet PDF (with header) has been downloaded' : 'Marksheet PDF has been downloaded',
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (error) {
			console.error('Error generating PDF:', error)
			setPdfProgress(prev => ({ ...prev, isOpen: false }))
			toast({
				title: '❌ Error',
				description: 'Failed to generate PDF',
				variant: 'destructive'
			})
		} finally {
			setGeneratingPDF(false)
		}
	}

	// Batch download for all learners in selected semester
	const handleBatchDownload = async (withHeader: boolean = false) => {
		if (!selectedInstitutionId || !selectedSessionId || !selectedProgramCode || !selectedSemester) {
			toast({
				title: '❌ Missing Filters',
				description: 'Please select institution, session, program, and semester',
				variant: 'destructive'
			})
			return
		}

		if (students.length === 0) {
			toast({
				title: '❌ No Learners',
				description: 'No learners found for the selected filters',
				variant: 'destructive'
			})
			return
		}

		try {
			setGeneratingBatchPDF(true)

			const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
			const selectedSession = sessions.find(s => s.id === selectedSessionId)

			// Step 1: Initialize progress modal
			setPdfProgress({
				isOpen: true,
				currentStep: 0,
				totalSteps: 4, // Initial placeholder (will update after fetch)
				currentOperation: 'Fetching marksheet data...',
				operationType: 'batch'
			})

			// Fetch batch marksheet data
			const url = `/api/reports/semester-marksheet?action=batch-marksheet&institutionId=${selectedInstitutionId}&sessionId=${selectedSessionId}&programCode=${selectedProgramCode}&semester=${selectedSemester}`
			const res = await fetch(url)

			if (!res.ok) {
				const error = await res.json()
				throw new Error(error.error || 'Failed to fetch batch data')
			}

			const batchData = await res.json()
			const marksheets = batchData.marksheets || []

			if (marksheets.length === 0) {
				setPdfProgress(prev => ({ ...prev, isOpen: false }))
				toast({
					title: '❌ No Data',
					description: 'No marksheet data available for the selected filters',
					variant: 'destructive'
				})
				return
			}

			// Step 2: Update progress - data fetched
			// Use students.length (filtered count) for totalSteps to match expected progress
			const totalSteps = students.length + 3 // photos + logo + preparing + generating
			setPdfProgress(prev => ({
				...prev,
				currentStep: 1,
				totalSteps, // Based on filtered student count
				currentOperation: `Loading student photos (0/${marksheets.length})...`
			}))

			// Convert all student photos to base64 (track progress for each)
			const photoBase64Array: (string | null)[] = []
			for (let i = 0; i < marksheets.length; i++) {
				const data = marksheets[i]
				if (data.student.photoUrl) {
					const photo = await fetchImageAsBase64(data.student.photoUrl)
					photoBase64Array.push(photo)
				} else {
					photoBase64Array.push(null)
				}

				// Update progress for each student photo
				setPdfProgress(prev => ({
					...prev,
					currentStep: 1 + i + 1,
					currentOperation: `Loading student photos (${i + 1}/${marksheets.length})...`
				}))
			}

			// Step 3: Update progress - fetch logo
			setPdfProgress(prev => ({
				...prev,
				currentStep: 1 + marksheets.length,
				currentOperation: 'Loading institution logo...'
			}))

			// Fetch logo for header (only needed when withHeader is true)
			let logoBase64: string | undefined = undefined
			if (withHeader) {
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
				} catch (e) {
					console.warn('Logo not loaded:', e)
				}
			}

			// Step 4: Update progress - preparing PDF
			setPdfProgress(prev => ({
				...prev,
				currentStep: 2 + marksheets.length,
				currentOperation: `Preparing PDF (${marksheets.length} marksheets)...`
			}))

			// Prepare all student data for merged PDF
			const allStudentData: StudentMarksheetData[] = marksheets.map((data: any, index: number) => ({
				student: {
					...data.student,
					photoUrl: photoBase64Array[index] || undefined  // Use base64 instead of URL
				},
				semester: data.semester,
				session: {
					id: selectedSessionId,
					name: selectedSession?.session_name || '',
					monthYear: data.session?.monthYear || ''
				},
				program: data.program,
				institution: selectedInstitution ? {
					name: selectedInstitution.institution_name,
					code: selectedInstitution.institution_code
				} : undefined,
				courses: data.courses,
				partBreakdown: data.partBreakdown,
				summary: data.summary,
				logoImage: logoBase64,
				generatedDate: new Date().toLocaleDateString('en-IN', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric'
				})
			}))

			// Step 5: Update progress - generating PDF
			setPdfProgress(prev => ({
				...prev,
				currentStep: 3 + marksheets.length,
				currentOperation: 'Generating PDF document...'
			}))

			// Download single merged PDF with all marksheets
			const suffix = withHeader ? '_with_header' : ''
			downloadMergedMarksheetPDF(
				allStudentData,
				`Marksheets_${selectedProgramCode}_Sem${selectedSemester}_${marksheets.length}students${suffix}.pdf`,
				{ showHeader: withHeader }
			)

			// Step 6: Complete
			setPdfProgress(prev => ({
				...prev,
				currentStep: totalSteps,
				currentOperation: 'PDF generated successfully!'
			}))

			// Close modal after a brief delay
			setTimeout(() => {
				setPdfProgress(prev => ({ ...prev, isOpen: false }))
			}, 1500)

			toast({
				title: '✅ Download Complete',
				description: withHeader
					? `Downloaded merged PDF with header (${marksheets.length} marksheets)`
					: `Downloaded merged PDF with ${marksheets.length} marksheets`,
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} catch (error) {
			console.error('Error in batch download:', error)
			setPdfProgress(prev => ({ ...prev, isOpen: false }))
			toast({
				title: '❌ Error',
				description: error instanceof Error ? error.message : 'Failed to generate batch PDFs',
				variant: 'destructive'
			})
		} finally {
			setGeneratingBatchPDF(false)
		}
	}

	// =====================================================
	// RENDER HELPERS
	// =====================================================

	const toRoman = (num: number): string => {
		const romanNumerals: [number, string][] = [
			[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
		]
		let result = ''
		for (const [value, symbol] of romanNumerals) {
			while (num >= value) {
				result += symbol
				num -= value
			}
		}
		return result
	}

	// =====================================================
	// RENDER
	// =====================================================

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />

				<div className="flex flex-1 flex-col gap-4 p-4">
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
								<BreadcrumbPage>Semester Marksheet</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Filter Card */}
					<Card>
						<CardHeader className="pb-4">
							<CardTitle className="flex items-center gap-2">
								<FileText className="h-5 w-5" />
								Semester Marksheet Generator
							</CardTitle>
							<CardDescription>
								Generate individual student marksheets with course-wise grades and GPA
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
								{/* Institution Select */}
								{(mustSelectInstitution || !shouldFilter) && (
									<div className="space-y-2">
										<Label>Institution</Label>
										<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													role="combobox"
													className="w-full justify-between"
													disabled={loadingInstitutions}
												>
													{loadingInstitutions ? (
														<span className="flex items-center gap-2">
															<Loader2 className="h-4 w-4 animate-spin" />
															Loading...
														</span>
													) : selectedInstitutionId ? (
														institutions.find(i => i.id === selectedInstitutionId)?.institution_code
													) : (
														"Select institution"
													)}
													{!loadingInstitutions && <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />}
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[300px] p-0">
												<Command>
													<CommandInput placeholder="Search institution..." />
													<CommandList>
														<CommandEmpty>No institution found.</CommandEmpty>
														<CommandGroup>
															{institutions.map(inst => (
																<CommandItem
																	key={inst.id}
																	value={`${inst.institution_code} ${inst.institution_name}`}
																	keywords={[inst.institution_code, inst.institution_name]}
																	onSelect={() => {
																		setSelectedInstitutionId(inst.id)
																		setInstitutionOpen(false)
																	}}
																>
																	<Check className={cn("mr-2 h-4 w-4", selectedInstitutionId === inst.id ? "opacity-100" : "opacity-0")} />
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

								{/* Session Select */}
								<div className="space-y-2">
									<Label>Exam Session</Label>
									<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												className="w-full justify-between"
												disabled={!selectedInstitutionId || loadingSessions}
											>
												{loadingSessions ? (
													<span className="flex items-center gap-2">
														<Loader2 className="h-4 w-4 animate-spin" />
														Loading...
													</span>
												) : selectedSessionId ? (
													sessions.find(s => s.id === selectedSessionId)?.session_name
												) : (
													"Select session"
												)}
												{!loadingSessions && <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />}
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[300px] p-0">
											<Command>
												<CommandInput placeholder="Search session..." />
												<CommandList>
													<CommandEmpty>No session found.</CommandEmpty>
													<CommandGroup>
														{sessions.map(sess => (
															<CommandItem
																key={sess.id}
																value={`${sess.session_code} ${sess.session_name}`}
																keywords={[sess.session_code, sess.session_name]}
																onSelect={() => {
																	setSelectedSessionId(sess.id)
																	setSessionOpen(false)
																}}
															>
																<Check className={cn("mr-2 h-4 w-4", selectedSessionId === sess.id ? "opacity-100" : "opacity-0")} />
																{sess.session_name}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Program Select */}
								<div className="space-y-2">
									<Label>Program</Label>
									<Popover open={programOpen} onOpenChange={setProgramOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												className="w-full justify-between text-left"
												disabled={!selectedSessionId || loadingPrograms}
											>
												{loadingPrograms ? (
													<span className="flex items-center gap-2">
														<Loader2 className="h-4 w-4 animate-spin" />
														Loading...
													</span>
												) : (
													<span className="truncate">
														{selectedProgramCode
															? `${selectedProgramCode} - ${programs.find(p => p.program_code === selectedProgramCode)?.program_name || ''}`
															: "Select program"}
													</span>
												)}
												{!loadingPrograms && <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[400px] p-0">
											<Command>
												<CommandInput placeholder="Search program..." />
												<CommandList>
													<CommandEmpty>No program found.</CommandEmpty>
													<CommandGroup>
														{programs.map(prog => (
															<CommandItem
																key={prog.program_code}
																value={`${prog.program_code} ${prog.program_name}`}
																onSelect={() => {
																	setSelectedProgramCode(prog.program_code)
																	setProgramOpen(false)
																}}
															>
																<Check className={cn("mr-2 h-4 w-4 shrink-0", selectedProgramCode === prog.program_code ? "opacity-100" : "opacity-0")} />
																<span>{prog.program_code} - {prog.program_name}</span>
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Semester Select */}
								<div className="space-y-2">
									<Label>Semester</Label>
									<Popover open={semesterOpen} onOpenChange={setSemesterOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												className="w-full justify-between"
												disabled={!selectedProgramCode || loadingSemesters}
											>
												{loadingSemesters ? (
													<span className="flex items-center gap-2">
														<Loader2 className="h-4 w-4 animate-spin" />
														Loading...
													</span>
												) : selectedSemester ? (
													`Semester ${toRoman(parseInt(selectedSemester))}`
												) : (
													"Select semester"
												)}
												{!loadingSemesters && <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />}
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[200px] p-0">
											<Command>
												<CommandList>
													<CommandEmpty>No semester found.</CommandEmpty>
													<CommandGroup>
														{semesters.map(sem => (
															<CommandItem
																key={sem}
																value={sem.toString()}
																onSelect={() => {
																	setSelectedSemester(sem.toString())
																	setSemesterOpen(false)
																}}
															>
																<Check className={cn("mr-2 h-4 w-4", selectedSemester === sem.toString() ? "opacity-100" : "opacity-0")} />
																Semester {toRoman(sem)}
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>

								{/* Student Select (Optional) */}
								<div className="space-y-2">
									<Label>Learner <span className="text-xs text-muted-foreground">(Optional)</span></Label>
									<Popover open={studentOpen} onOpenChange={setStudentOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												className="w-full justify-between"
												disabled={!selectedSemester || loadingStudents}
											>
												{loadingStudents ? (
													<span className="flex items-center gap-2">
														<Loader2 className="h-4 w-4 animate-spin" />
														Loading...
													</span>
												) : selectedStudentId ? (
													students.find(s => s.id === selectedStudentId)?.registerNo
												) : (
													"All learners"
												)}
												{!loadingStudents && <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />}
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[300px] p-0">
											<Command>
												<CommandInput placeholder="Search by register no..." />
												<CommandList>
													<CommandEmpty>No learner found.</CommandEmpty>
													<CommandGroup>
														<CommandItem
															value=""
															onSelect={() => {
																setSelectedStudentId("")
																setStudentOpen(false)
															}}
														>
															<Check className={cn("mr-2 h-4 w-4", selectedStudentId === "" ? "opacity-100" : "opacity-0")} />
															<div className="flex items-center gap-2">
																<Users className="h-4 w-4" />
																<span>All learners</span>
															</div>
														</CommandItem>
														{students.map(student => (
															<CommandItem
																key={student.id}
																value={`${student.registerNo} ${student.name}`}
																keywords={[student.registerNo, student.name]}
																onSelect={() => {
																	setSelectedStudentId(student.id)
																	setStudentOpen(false)
																}}
															>
																<Check className={cn("mr-2 h-4 w-4", selectedStudentId === student.id ? "opacity-100" : "opacity-0")} />
																<div className="flex flex-col">
																	<span className="font-medium">{student.registerNo}</span>
																	<span className="text-xs text-muted-foreground">{student.name}</span>
																</div>
															</CommandItem>
														))}
													</CommandGroup>
												</CommandList>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							</div>

							{/* Batch Download Section */}
							{selectedSemester && !selectedStudentId && students.length > 0 && (
								<div className="mt-4 p-4 bg-muted/50 rounded-lg border">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<Users className="h-5 w-5 text-muted-foreground" />
											<div>
												<p className="font-medium">{students.length} Learners Found</p>
												<p className="text-sm text-muted-foreground">Download all marksheets in a single merged PDF</p>
											</div>
										</div>
										<div className="flex gap-3">
											<Button onClick={() => handleBatchDownload(false)} disabled={generatingBatchPDF} className="bg-emerald-600 hover:bg-emerald-700 text-white">
												{generatingBatchPDF ? (
													<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												) : (
													<Download className="h-4 w-4 mr-2" />
												)}
												Download PDF
											</Button>
											<Button onClick={() => handleBatchDownload(true)} disabled={generatingBatchPDF} className="bg-blue-600 hover:bg-blue-700 text-white">
												{generatingBatchPDF ? (
													<Loader2 className="h-4 w-4 mr-2 animate-spin" />
												) : (
													<Download className="h-4 w-4 mr-2" />
												)}
												Download (With Header)
											</Button>
										</div>
									</div>
								</div>
							)}
						</CardContent>
					</Card>


					{/*  Marksheet Display */}
					{loadingMarksheet ? (
						<Card>
							<CardContent className="flex items-center justify-center py-20">
								<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
								<span className="ml-2 text-muted-foreground">Loading marksheet...</span>
							</CardContent>
						</Card>
					) : marksheetData ? (
						<Card>
							<CardHeader className="pb-4">
								<div className="flex items-start justify-between">
									<div>
										<CardTitle className="text-xl flex items-center gap-2">
											<GraduationCap className="h-5 w-5" />
											{marksheetData.student.registerNo}
										</CardTitle>
										<CardDescription className="text-base mt-1">
											{marksheetData.student.name}
										</CardDescription>
									</div>
									<div className="flex items-center gap-2">
										<Badge variant="outline">{marksheetData.summary.totalCourses} Courses</Badge>
										<Badge variant="outline">{marksheetData.summary.totalCredits} Credits</Badge>
										<Badge variant={marksheetData.summary.failedCount === 0 ? "default" : "destructive"}>
											{marksheetData.summary.overallResult === 'PASS' ? 'Passed' : 'RA'}
										</Badge>
										<Badge className="bg-yellow-500 text-black">
											GPA: {marksheetData.summary.semesterGPA.toFixed(2)}
										</Badge>
									</div>
								</div>
							</CardHeader>

							<CardContent className="space-y-4">
								{/* Part-wise Course Tables */}
								{marksheetData.partBreakdown.map((part) => (
									<Collapsible
										key={part.partName}
										open={openParts[part.partName]}
										onOpenChange={(open) => setOpenParts(prev => ({ ...prev, [part.partName]: open }))}
									>
										<CollapsibleTrigger asChild>
											<div className={cn(
												"flex items-center justify-between p-3 rounded-t-lg cursor-pointer text-white",
												PART_COLORS[part.partName] || 'bg-gray-500'
											)}>
												<div className="flex items-center gap-2">
													{openParts[part.partName] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
													<span className="font-semibold">{part.partName}</span>
													<span className="text-sm opacity-90">({part.partDescription})</span>
												</div>
												<div className="flex items-center gap-4 text-sm">
													<span>{part.totalCredits} Credits</span>
													<span>GPA: {part.partGPA.toFixed(2)}</span>
												</div>
											</div>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<div className="border border-t-0 rounded-b-lg overflow-hidden">
												<Table>
													<TableHeader>
														<TableRow className="bg-muted/50">
															<TableHead className="w-[300px]">Course</TableHead>
															<TableHead className="text-center w-[60px]">Cr</TableHead>
															<TableHead className="text-center w-[80px]">Int</TableHead>
															<TableHead className="text-center w-[80px]">Ext</TableHead>
															<TableHead className="text-center w-[80px]">Total</TableHead>
															<TableHead className="text-center w-[60px]">%</TableHead>
															<TableHead className="text-center w-[60px]">Grade</TableHead>
															<TableHead className="text-center w-[60px]">GP</TableHead>
															<TableHead className="text-center w-[60px]">CP</TableHead>
															<TableHead className="text-center w-[80px]">Status</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{part.courses.map((course, idx) => (
															<TableRow key={idx}>
																<TableCell className="font-medium">
																	<span className="text-xs text-muted-foreground">{course.courseCode}</span>
																	{' - '}
																	{course.courseName}
																</TableCell>
																<TableCell className="text-center">{course.credits}</TableCell>
																<TableCell className="text-center">{course.ciaMarks}/{course.ciaMax}</TableCell>
																<TableCell className="text-center">{course.eseMarks}/{course.eseMax}</TableCell>
																<TableCell className="text-center font-medium">{course.totalMarks}/{course.totalMax}</TableCell>
																<TableCell className="text-center">{course.percentage.toFixed(1)}</TableCell>
																<TableCell className="text-center">
																	<Badge variant="outline">{course.letterGrade}</Badge>
																</TableCell>
																<TableCell className="text-center">{course.gradePoint.toFixed(1)}</TableCell>
																<TableCell className="text-center">{course.creditPoints.toFixed(1)}</TableCell>
																<TableCell className="text-center">
																	<Badge variant={course.isPassing ? "default" : "destructive"} className={course.isPassing ? "bg-green-600" : ""}>
																		{course.result}
																	</Badge>
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											</div>
										</CollapsibleContent>
									</Collapsible>
								))}

								{/* Part Summary Table */}
								<div className="mt-6">
									<h3 className="font-semibold mb-3">(IN THE CURRENT SEMESTER)</h3>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="text-center">PART</TableHead>
												<TableHead className="text-center">CREDITS EARNED</TableHead>
												<TableHead className="text-center">GPA</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{marksheetData.partBreakdown.filter(p => p.courses.length > 0).map((part) => (
												<TableRow key={part.partName}>
													<TableCell className="text-center">{marksheetData.program.isPG ? '-' : part.partName.replace('Part ', '')}</TableCell>
													<TableCell className="text-center">{part.creditsEarned}</TableCell>
													<TableCell className="text-center">{part.partGPA.toFixed(2)}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>

								{/* Footer Note */}
								<div className="text-xs text-muted-foreground mt-4 p-3 bg-muted/50 rounded-lg">
									Passing Minimum is 40% of Maximum (in ESE and Total separately) P: Pass, RA: Re-Appear, AAA: Absent, ESE: End Semester Examination, CIA: Continuous Internal Assessment, GPA: Grade Points Average, ***Not Secured Passing Minimum.
								</div>

								{/* Action Buttons */}
								<div className="flex gap-3 mt-6">
									<Button onClick={() => handleDownloadPDF(false)} disabled={generatingPDF} className="bg-emerald-600 hover:bg-emerald-700 text-white">
										{generatingPDF ? (
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										) : (
											<Download className="h-4 w-4 mr-2" />
										)}
										Download PDF
									</Button>
									<Button onClick={() => handleDownloadPDF(true)} disabled={generatingPDF} className="bg-blue-600 hover:bg-blue-700 text-white">
										{generatingPDF ? (
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										) : (
											<Download className="h-4 w-4 mr-2" />
										)}
										Download (With Header)
									</Button>
								</div>
							</CardContent>
						</Card>
					) : selectedSemester && !selectedStudentId && students.length > 0 ? (
						<Card>
							<CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
								<Users className="h-16 w-16 mb-4 opacity-20" />
								<p className="text-lg font-medium">Ready to Download Marksheets</p>
								<p className="text-sm">Select a specific learner for preview, or use "Download All Marksheets" above</p>
							</CardContent>
						</Card>
					) : (
						<Card>
							<CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
								<FileText className="h-16 w-16 mb-4 opacity-20" />
								<p className="text-lg font-medium">Select filters to view marksheet</p>
								<p className="text-sm">Choose institution, session, program, and semester</p>
							</CardContent>
						</Card>
					)}
				</div>

				<AppFooter />
			</SidebarInset>

			{/* PDF Generation Progress Modal */}
			<PDFProgressModal
				isOpen={pdfProgress.isOpen}
				currentStep={pdfProgress.currentStep}
				totalSteps={pdfProgress.totalSteps}
				currentOperation={pdfProgress.currentOperation}
				operationType={pdfProgress.operationType}
			/>
		</SidebarProvider>
	)
}
