"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import XLSX from "@/lib/utils/excel-compat"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
	BookOpen,
	UserPlus,
	CreditCard,
	FileText,
	FileSpreadsheet,
	Award,
	BarChart3,
	AlertTriangle,
	AlertCircle,
	Download,
	Loader2,
	Search,
	Check,
	ChevronsUpDown,
	X,
	RefreshCw,
	Filter,
	FileDown,
	ChevronLeft,
	ChevronRight
} from "lucide-react"
import type {
	ReportTabKey,
	InstitutionOption,
	SessionOption,
	ProgramOption,
	CourseOption,
	REPORT_TABS
} from "@/types/comprehensive-reports"
import { generateComprehensiveReportPDF } from "@/lib/utils/generate-comprehensive-report-pdf"

// Tab configuration with icons
const TABS: { key: ReportTabKey; label: string; icon: React.ReactNode; color: string; permission: string }[] = [
	{ key: 'course-offer', label: 'Course Offering', icon: <BookOpen className="h-4 w-4" />, color: 'bg-blue-500', permission: 'reports:course-offer:read' },
	{ key: 'exam-registration', label: 'Exam Registration', icon: <UserPlus className="h-4 w-4" />, color: 'bg-green-500', permission: 'reports:exam-registration:read' },
	{ key: 'fee-paid', label: 'Fee Paid', icon: <CreditCard className="h-4 w-4" />, color: 'bg-emerald-500', permission: 'reports:fee-paid:read' },
	{ key: 'internal-marks', label: 'Internal Marks', icon: <FileText className="h-4 w-4" />, color: 'bg-purple-500', permission: 'reports:internal-marks:read' },
	{ key: 'external-marks', label: 'External Marks', icon: <FileSpreadsheet className="h-4 w-4" />, color: 'bg-orange-500', permission: 'reports:external-marks:read' },
	{ key: 'final-result', label: 'Final Result', icon: <Award className="h-4 w-4" />, color: 'bg-indigo-500', permission: 'reports:final-result:read' },
	{ key: 'semester-result', label: 'Semester Result', icon: <BarChart3 className="h-4 w-4" />, color: 'bg-pink-500', permission: 'reports:semester-result:read' },
	{ key: 'arrear-report', label: 'Arrear Report', icon: <AlertTriangle className="h-4 w-4" />, color: 'bg-red-500', permission: 'reports:arrear:read' },
	{ key: 'missing-data', label: 'Missing Data', icon: <AlertCircle className="h-4 w-4" />, color: 'bg-amber-500', permission: 'reports:missing-data:read' }
]

export default function ComprehensiveReportsPage() {
	const { toast } = useToast()
	const { hasPermission, hasAnyRole } = useAuth()

	// Institution filter hook
	const {
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId: contextInstitutionId
	} = useInstitutionFilter()

	// MyJKKN hook for fetching programs and semesters
	const { fetchPrograms: fetchMyJKKNPrograms, fetchSemesters: fetchMyJKKNSemesters } = useMyJKKNInstitutionFilter()

	// Tab state
	const [activeTab, setActiveTab] = useState<ReportTabKey>('course-offer')

	// Dropdown data
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [sessions, setSessions] = useState<SessionOption[]>([])
	const [programs, setPrograms] = useState<ProgramOption[]>([])
	const [courses, setCourses] = useState<CourseOption[]>([])
	const [semesters, setSemesters] = useState<{ semester_number: number; semester_name: string }[]>([])

	// Selected filters
	const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>("")
	const [selectedSessionId, setSelectedSessionId] = useState<string>("")
	const [selectedProgramId, setSelectedProgramId] = useState<string>("")
	const [selectedSemester, setSelectedSemester] = useState<string>("")
	const [selectedCourseId, setSelectedCourseId] = useState<string>("")
	const [searchTerm, setSearchTerm] = useState("")

	// Report data
	const [reportData, setReportData] = useState<any[]>([])
	const [reportSummary, setReportSummary] = useState<any>(null)

	// Loading states
	const [loadingDropdowns, setLoadingDropdowns] = useState(false)
	const [loadingReport, setLoadingReport] = useState(false)
	const [loadingPrograms, setLoadingPrograms] = useState(false)
	const [loadingSemesters, setLoadingSemesters] = useState(false)
	const [exporting, setExporting] = useState(false)

	// Pagination
	const [currentPage, setCurrentPage] = useState(1)
	const pageSize = 50

	// Popover states
	const [institutionOpen, setInstitutionOpen] = useState(false)
	const [sessionOpen, setSessionOpen] = useState(false)
	const [programOpen, setProgramOpen] = useState(false)
	const [courseOpen, setCourseOpen] = useState(false)

	// Filter tabs by permission (for now, show all tabs for super_admin/coe)
	const visibleTabs = useMemo(() => {
		// Show all tabs for super_admin and coe roles
		if (hasAnyRole(['super_admin', 'coe'])) {
			return TABS
		}
		// For other roles, filter by permission
		return TABS.filter(tab => hasPermission(tab.permission))
	}, [hasAnyRole, hasPermission])

	// Set first visible tab as active
	useEffect(() => {
		if (visibleTabs.length > 0 && !visibleTabs.find(t => t.key === activeTab)) {
			setActiveTab(visibleTabs[0].key)
		}
	}, [visibleTabs, activeTab])

	// Fetch institutions on mount
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
		}
	}, [isReady])

	// Auto-select institution
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

	// Fetch sessions when institution changes
	useEffect(() => {
		if (selectedInstitutionId) {
			fetchSessions(selectedInstitutionId)
			setSelectedSessionId("")
			setSelectedProgramId("")
			setSelectedCourseId("")
			setReportData([])
			setReportSummary(null)
		}
	}, [selectedInstitutionId])

	// Fetch programs when session changes
	useEffect(() => {
		if (selectedInstitutionId && selectedSessionId) {
			fetchProgramsFromMyJKKN(selectedInstitutionId)
			fetchCourses(selectedInstitutionId, selectedSessionId)
			setSelectedProgramId("")
			setSelectedCourseId("")
		}
	}, [selectedInstitutionId, selectedSessionId])

	// Fetch courses and semesters when program changes
	useEffect(() => {
		if (selectedProgramId && selectedSessionId) {
			// Get program_code from programs list (since programs are from MyJKKN)
			const selectedProg = programs.find(p => p.id === selectedProgramId)
			const programCode = selectedProg?.program_code
			fetchCourses(selectedInstitutionId, selectedSessionId, programCode, undefined)
			fetchSemestersForProgram(selectedInstitutionId, selectedProgramId)
		} else {
			setSemesters([])
		}
		setSelectedSemester("")
	}, [selectedProgramId])

	// Refetch courses when semester changes
	useEffect(() => {
		if (selectedProgramId && selectedSessionId && selectedSemester) {
			const selectedProg = programs.find(p => p.id === selectedProgramId)
			const programCode = selectedProg?.program_code
			// Pass semester to filter courses by semester
			fetchCourses(selectedInstitutionId, selectedSessionId, programCode, selectedSemester)
		}
		setSelectedCourseId("")
	}, [selectedSemester])

	// Reset pagination when data changes
	useEffect(() => {
		setCurrentPage(1)
	}, [reportData, searchTerm])

	const fetchInstitutions = async () => {
		try {
			setLoadingDropdowns(true)
			const url = appendToUrl('/api/reports/comprehensive?action=institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setInstitutions(data)
			}
		} catch (error) {
			console.error('Error fetching institutions:', error)
		} finally {
			setLoadingDropdowns(false)
		}
	}

	const fetchSessions = async (institutionId: string) => {
		try {
			const res = await fetch(`/api/reports/comprehensive?action=sessions&institution_id=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setSessions(data)
			}
		} catch (error) {
			console.error('Error fetching sessions:', error)
		}
	}

	// Fetch programs from MyJKKN API based on selected institution
	const fetchProgramsFromMyJKKN = async (institutionId: string) => {
		try {
			setLoadingPrograms(true)
			setPrograms([])

			// Get institution with myjkkn_institution_ids
			const institution = institutions.find(i => i.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				console.warn('[ComprehensiveReports] No MyJKKN institution IDs found, falling back to local DB')
				// Fallback to local database
				const res = await fetch(`/api/reports/comprehensive?action=programs&institution_id=${institutionId}`)
				if (res.ok) {
					const data = await res.json()
					setPrograms(data)
				}
				return
			}

			// Fetch programs from MyJKKN API
			console.log('[ComprehensiveReports] Fetching programs from MyJKKN for institution IDs:', myjkknIds)
			const progData = await fetchMyJKKNPrograms(myjkknIds)

			if (progData && progData.length > 0) {
				// Sort by program_order and set programs
				const sortedPrograms = progData
					.sort((a, b) => (a.program_order || 999) - (b.program_order || 999))
					.map(p => ({
						id: p.id,
						program_code: p.program_code,
						program_name: p.program_name,
						program_order: p.program_order
					}))
				setPrograms(sortedPrograms)
				console.log('[ComprehensiveReports] Fetched', sortedPrograms.length, 'programs from MyJKKN')
			} else {
				// Fallback to local database if MyJKKN returns empty
				console.warn('[ComprehensiveReports] No programs from MyJKKN, falling back to local DB')
				const res = await fetch(`/api/reports/comprehensive?action=programs&institution_id=${institutionId}`)
				if (res.ok) {
					const data = await res.json()
					setPrograms(data)
				}
			}
		} catch (error) {
			console.error('Error fetching programs:', error)
			// Fallback to local database on error
			try {
				const res = await fetch(`/api/reports/comprehensive?action=programs&institution_id=${institutionId}`)
				if (res.ok) {
					const data = await res.json()
					setPrograms(data)
				}
			} catch (e) {
				console.error('Error fetching programs from local DB:', e)
			}
		} finally {
			setLoadingPrograms(false)
		}
	}

	// Fetch courses - accepts program_code (from MyJKKN) and semester for filtering
	const fetchCourses = async (institutionId: string, sessionId: string, programCode?: string, semester?: string) => {
		try {
			let url = `/api/reports/comprehensive?action=courses&institution_id=${institutionId}&session_id=${sessionId}`
			// Pass program_code instead of program_id since programs are from MyJKKN API
			if (programCode) url += `&program_code=${encodeURIComponent(programCode)}`
			// Pass semester to filter courses by semester
			if (semester && semester !== 'all') url += `&semester=${encodeURIComponent(semester)}`
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				setCourses(data)
			}
		} catch (error) {
			console.error('Error fetching courses:', error)
		}
	}

	// Fetch semesters from MyJKKN API based on selected program
	// Semesters are fetched using: institution -> program_code -> unique semester_name, sorted by semester_order
	const fetchSemestersForProgram = async (institutionId: string, programId: string) => {
		try {
			setLoadingSemesters(true)
			setSemesters([])

			// Get institution with myjkkn_institution_ids
			const institution = institutions.find(i => i.id === institutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				console.warn('[ComprehensiveReports] No MyJKKN institution IDs found')
				// Fallback to hardcoded semesters 1-10
				setSemesters([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({
					semester_number: n,
					semester_name: `Semester ${n}`
				})))
				return
			}

			// Get program from programs list - programId here is the MyJKKN program UUID
			// The programs list was fetched from MyJKKN, so program.id is the MyJKKN UUID
			const program = programs.find(p => p.id === programId)
			const myjkknProgramId = program?.id // This is the MyJKKN UUID
			const programCode = program?.program_code

			// Fetch semesters from MyJKKN API using both program_id (UUID) and program_code for filtering
			console.log('[ComprehensiveReports] Fetching semesters for program:', programCode, 'myjkkn_program_id:', myjkknProgramId)
			const semData = await fetchMyJKKNSemesters(myjkknIds, {
				program_id: myjkknProgramId,
				program_code: programCode
			})

			if (semData && semData.length > 0) {
				// Deduplicate by semester_name (unique) and sort by semester_number (semester_order)
				const uniqueSems = Array.from(
					new Map(semData.map(s => [s.semester_name, s])).values()
				).sort((a, b) => (a.semester_number || 0) - (b.semester_number || 0))

				setSemesters(uniqueSems.map(s => ({
					semester_number: s.semester_number || 0,
					semester_name: s.semester_name || `Semester ${s.semester_number}`
				})))
				console.log('[ComprehensiveReports] Fetched', uniqueSems.length, 'unique semesters, sorted by semester_order')
			} else {
				// Fallback if no semesters found
				console.warn('[ComprehensiveReports] No semesters found from MyJKKN, using fallback')
				setSemesters([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({
					semester_number: n,
					semester_name: `Semester ${n}`
				})))
			}
		} catch (error) {
			console.error('Error fetching semesters:', error)
			// Fallback on error
			setSemesters([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({
				semester_number: n,
				semester_name: `Semester ${n}`
			})))
		} finally {
			setLoadingSemesters(false)
		}
	}

	const fetchReport = async () => {
		if (!selectedInstitutionId || !selectedSessionId) {
			toast({
				title: "Missing Filters",
				description: "Please select Institution and Session to generate report.",
				variant: "destructive"
			})
			return
		}

		try {
			setLoadingReport(true)
			setReportData([])
			setReportSummary(null)

			let url = `/api/reports/comprehensive?action=report&report_type=${activeTab}&institution_id=${selectedInstitutionId}&session_id=${selectedSessionId}`
			// Pass program_code instead of program_id since programs are now from MyJKKN API
			if (selectedProgramId) {
				const selectedProg = programs.find(p => p.id === selectedProgramId)
				if (selectedProg?.program_code) {
					url += `&program_code=${encodeURIComponent(selectedProg.program_code)}`
				}
			}
			if (selectedSemester && selectedSemester !== 'all') url += `&semester=${selectedSemester}`
			if (selectedCourseId) url += `&course_id=${selectedCourseId}`

			const res = await fetch(url)
			if (!res.ok) {
				const error = await res.json()
				throw new Error(error.error || 'Failed to fetch report')
			}

			const result = await res.json()
			setReportData(result.data || [])
			setReportSummary(result.summary || null)

			toast({
				title: "Report Generated",
				description: `Found ${result.data?.length || 0} records.`,
				className: "bg-green-50 border-green-200 text-green-800"
			})
		} catch (error) {
			console.error('Error fetching report:', error)
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to fetch report",
				variant: "destructive"
			})
		} finally {
			setLoadingReport(false)
		}
	}

	const handleExportExcel = () => {
		if (reportData.length === 0) {
			toast({ title: "No Data", description: "No data to export.", variant: "destructive" })
			return
		}

		try {
			setExporting(true)

			const ws = XLSX.utils.json_to_sheet(reportData)
			const wb = XLSX.utils.book_new()
			XLSX.utils.book_append_sheet(wb, ws, activeTab.replace(/-/g, '_'))

			const session = sessions.find(s => s.id === selectedSessionId)
			const fileName = `${activeTab}_report_${session?.session_code || 'report'}_${new Date().toISOString().split('T')[0]}.xlsx`
			XLSX.writeFile(wb, fileName)

			toast({
				title: "Export Successful",
				description: `Exported ${reportData.length} records to Excel.`,
				className: "bg-green-50 border-green-200 text-green-800"
			})
		} catch (error) {
			console.error('Export error:', error)
			toast({ title: "Export Failed", description: "Failed to export to Excel.", variant: "destructive" })
		} finally {
			setExporting(false)
		}
	}

	const handleExportPDF = async () => {
		if (reportData.length === 0) {
			toast({ title: "No Data", description: "No data to export.", variant: "destructive" })
			return
		}

		try {
			setExporting(true)

			const institution = institutions.find(i => i.id === selectedInstitutionId)
			const session = sessions.find(s => s.id === selectedSessionId)
			const program = programs.find(p => p.id === selectedProgramId)

			// Load logos
			let logoBase64: string | undefined
			let rightLogoBase64: string | undefined

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

			const fileName = generateComprehensiveReportPDF({
				reportType: activeTab,
				reportTitle: TABS.find(t => t.key === activeTab)?.label + ' Report',
				institutionName: institution?.name || '',
				institutionCode: institution?.institution_code || '',
				sessionCode: session?.session_code || '',
				sessionName: session?.session_name,
				programName: program?.program_name,
				programCode: program?.program_code,
				semester: selectedSemester && selectedSemester !== 'all' ? parseInt(selectedSemester) : undefined,
				logoImage: logoBase64,
				rightLogoImage: rightLogoBase64,
				data: reportData,
				summary: reportSummary
			})

			toast({
				title: "PDF Generated",
				description: `${fileName} has been downloaded.`,
				className: "bg-green-50 border-green-200 text-green-800"
			})
		} catch (error) {
			console.error('PDF export error:', error)
			toast({ title: "Export Failed", description: "Failed to generate PDF.", variant: "destructive" })
		} finally {
			setExporting(false)
		}
	}

	// Filter data by search term
	const filteredData = useMemo(() => {
		if (!searchTerm) return reportData
		const term = searchTerm.toLowerCase()
		return reportData.filter((row: any) =>
			Object.values(row).some(val =>
				val !== null && val !== undefined && String(val).toLowerCase().includes(term)
			)
		)
	}, [reportData, searchTerm])

	// Paginate data
	const paginatedData = useMemo(() => {
		const start = (currentPage - 1) * pageSize
		return filteredData.slice(start, start + pageSize)
	}, [filteredData, currentPage, pageSize])

	const totalPages = Math.ceil(filteredData.length / pageSize) || 1

	// Get table columns based on active tab
	const getTableColumns = () => {
		switch (activeTab) {
			case 'course-offer':
				return ['S.No', 'Program', 'Semester', 'Course Code', 'Course Title', 'Category', 'Credits', 'Enrolled', 'Faculty']
			case 'exam-registration':
				return ['S.No', 'Register No', 'Learner Name', 'Program', 'Semester', 'Course', 'Type', 'Attempt', 'Status', 'Fee Paid']
			case 'fee-paid':
				return ['S.No', 'Register No', 'Learner Name', 'Program', 'Semester', 'Course', 'Amount', 'Status', 'Date', 'Transaction ID']
			case 'internal-marks':
				return ['S.No', 'Register No', 'Learner Name', 'Program', 'Semester', 'Course', 'Marks', 'Max', '%', 'Status']
			case 'external-marks':
				return ['S.No', 'Register No', 'Learner Name', 'Program', 'Semester', 'Course', 'Marks', 'Max', '%', 'Status']
			case 'final-result':
				return ['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Course', 'Int', 'Ext', 'Total', '%', 'Grade', 'GP', 'Result']
			case 'semester-result':
				return ['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Credits', 'Earned', 'SGPA', 'CGPA', '%', 'Arrears', 'Result']
			case 'arrear-report':
				return ['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Course', 'Credits', 'Reason', 'Attempts', 'Status', 'Priority']
			case 'missing-data':
				return ['S.No', 'Register No', 'Learner Name', 'Program', 'Sem', 'Course', 'Internal', 'External', 'Attendance', 'Missing']
			default:
				return []
		}
	}

	// Render table row based on active tab
	const renderTableRow = (row: any, index: number) => {
		const sNo = (currentPage - 1) * pageSize + index + 1

		switch (activeTab) {
			case 'course-offer':
				return (
					<TableRow key={index}>
						<TableCell className="text-center">{sNo}</TableCell>
						<TableCell className="text-center">{row.program_code}</TableCell>
						<TableCell className="text-center">{row.semester}</TableCell>
						<TableCell className="text-center">{row.course_code}</TableCell>
						<TableCell>{row.course_title}</TableCell>
						<TableCell className="text-center">{row.course_category || '-'}</TableCell>
						<TableCell className="text-center">{row.credits}</TableCell>
						<TableCell className="text-center">{row.enrolled_count}</TableCell>
						<TableCell>{row.faculty_name || '-'}</TableCell>
					</TableRow>
				)
			case 'exam-registration':
				return (
					<TableRow key={index}>
						<TableCell className="text-center">{sNo}</TableCell>
						<TableCell className="text-center font-medium">{row.register_number}</TableCell>
						<TableCell>{row.learner_name}</TableCell>
						<TableCell className="text-center">{row.program_code}</TableCell>
						<TableCell className="text-center">{row.semester}</TableCell>
						<TableCell className="text-center">{row.course_code}</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.is_regular ? "default" : "secondary"}>
								{row.is_regular ? 'Regular' : 'Arrear'}
							</Badge>
						</TableCell>
						<TableCell className="text-center">{row.attempt_number}</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.registration_status === 'Approved' ? "default" : "secondary"}>
								{row.registration_status}
							</Badge>
						</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.fee_paid ? "default" : "destructive"} className={row.fee_paid ? "bg-green-600" : ""}>
								{row.fee_paid ? 'Yes' : 'No'}
							</Badge>
						</TableCell>
					</TableRow>
				)
			case 'fee-paid':
				return (
					<TableRow key={index}>
						<TableCell className="text-center">{sNo}</TableCell>
						<TableCell className="text-center font-medium">{row.register_number}</TableCell>
						<TableCell>{row.learner_name}</TableCell>
						<TableCell className="text-center">{row.program_code}</TableCell>
						<TableCell className="text-center">{row.semester}</TableCell>
						<TableCell className="text-center">{row.course_code}</TableCell>
						<TableCell className="text-right">₹{row.fee_amount?.toLocaleString() || 0}</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.fee_paid ? "default" : "destructive"} className={row.fee_paid ? "bg-green-600" : ""}>
								{row.fee_paid ? 'Paid' : 'Pending'}
							</Badge>
						</TableCell>
						<TableCell className="text-center">{row.payment_date ? new Date(row.payment_date).toLocaleDateString('en-GB') : '-'}</TableCell>
						<TableCell className="text-center text-xs">{row.payment_transaction_id || '-'}</TableCell>
					</TableRow>
				)
			case 'internal-marks':
				return (
					<TableRow key={index}>
						<TableCell className="text-center">{sNo}</TableCell>
						<TableCell className="text-center font-medium">{row.register_number}</TableCell>
						<TableCell>{row.learner_name}</TableCell>
						<TableCell className="text-center">{row.program_code}</TableCell>
						<TableCell className="text-center">{row.semester}</TableCell>
						<TableCell className="text-center">{row.course_code}</TableCell>
						<TableCell className="text-center">{row.internal_marks ?? '-'}</TableCell>
						<TableCell className="text-center">{row.internal_max}</TableCell>
						<TableCell className="text-center">{row.internal_percentage !== null ? `${row.internal_percentage.toFixed(1)}%` : '-'}</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.is_internal_pass === true ? "default" : row.is_internal_pass === false ? "destructive" : "secondary"}
								className={row.is_internal_pass === true ? "bg-green-600" : ""}>
								{row.is_internal_pass === true ? 'Pass' : row.is_internal_pass === false ? 'Fail' : 'N/A'}
							</Badge>
						</TableCell>
					</TableRow>
				)
			case 'external-marks':
				return (
					<TableRow key={index}>
						<TableCell className="text-center">{sNo}</TableCell>
						<TableCell className="text-center font-medium">{row.register_number}</TableCell>
						<TableCell>{row.learner_name}</TableCell>
						<TableCell className="text-center">{row.program_code}</TableCell>
						<TableCell className="text-center">{row.semester}</TableCell>
						<TableCell className="text-center">{row.course_code}</TableCell>
						<TableCell className="text-center">{row.is_absent ? 'AB' : (row.external_marks ?? '-')}</TableCell>
						<TableCell className="text-center">{row.external_max}</TableCell>
						<TableCell className="text-center">{row.external_percentage !== null ? `${row.external_percentage.toFixed(1)}%` : '-'}</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.is_absent ? "secondary" : row.is_external_pass === true ? "default" : row.is_external_pass === false ? "destructive" : "secondary"}
								className={row.is_external_pass === true ? "bg-green-600" : row.is_absent ? "bg-orange-500" : ""}>
								{row.is_absent ? 'Absent' : (row.is_external_pass === true ? 'Pass' : row.is_external_pass === false ? 'Fail' : 'N/A')}
							</Badge>
						</TableCell>
					</TableRow>
				)
			case 'final-result':
				return (
					<TableRow key={index}>
						<TableCell className="text-center">{sNo}</TableCell>
						<TableCell className="text-center font-medium">{row.register_number}</TableCell>
						<TableCell>{row.learner_name}</TableCell>
						<TableCell className="text-center">{row.program_code}</TableCell>
						<TableCell className="text-center">{row.semester}</TableCell>
						<TableCell className="text-center">{row.course_code}</TableCell>
						<TableCell className="text-center">{row.internal_marks}</TableCell>
						<TableCell className="text-center">{row.external_marks}</TableCell>
						<TableCell className="text-center font-medium">{row.total_marks}</TableCell>
						<TableCell className="text-center">{row.percentage?.toFixed(1)}%</TableCell>
						<TableCell className="text-center font-bold">{row.letter_grade}</TableCell>
						<TableCell className="text-center">{row.grade_point?.toFixed(1)}</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.is_pass ? "default" : "destructive"}
								className={row.pass_status === 'Pass' ? "bg-green-600" : row.pass_status === 'Absent' ? "bg-orange-500" : ""}>
								{row.pass_status}
							</Badge>
						</TableCell>
					</TableRow>
				)
			case 'semester-result':
				return (
					<TableRow key={index}>
						<TableCell className="text-center">{sNo}</TableCell>
						<TableCell className="text-center font-medium">{row.register_number}</TableCell>
						<TableCell>{row.learner_name}</TableCell>
						<TableCell className="text-center">{row.program_code}</TableCell>
						<TableCell className="text-center">{row.semester}</TableCell>
						<TableCell className="text-center">{row.total_credits_registered}</TableCell>
						<TableCell className="text-center">{row.total_credits_earned}</TableCell>
						<TableCell className="text-center font-medium">{row.sgpa?.toFixed(2)}</TableCell>
						<TableCell className="text-center font-medium">{row.cgpa?.toFixed(2)}</TableCell>
						<TableCell className="text-center">{row.percentage?.toFixed(1)}%</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.total_backlogs > 0 ? "destructive" : "secondary"}>
								{row.total_backlogs}
							</Badge>
						</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.result_status === 'Pass' ? "default" : row.result_status === 'Fail' ? "destructive" : "secondary"}
								className={row.result_status === 'Pass' ? "bg-green-600" : ""}>
								{row.result_class || row.result_status}
							</Badge>
						</TableCell>
					</TableRow>
				)
			case 'arrear-report':
				return (
					<TableRow key={index}>
						<TableCell className="text-center">{sNo}</TableCell>
						<TableCell className="text-center font-medium">{row.register_number}</TableCell>
						<TableCell>{row.learner_name}</TableCell>
						<TableCell className="text-center">{row.program_code}</TableCell>
						<TableCell className="text-center">{row.original_semester}</TableCell>
						<TableCell className="text-center">{row.course_code}</TableCell>
						<TableCell className="text-center">{row.credits}</TableCell>
						<TableCell className="text-center">{row.failure_reason}</TableCell>
						<TableCell className="text-center">{row.attempt_count}</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.is_cleared ? "default" : "destructive"} className={row.is_cleared ? "bg-green-600" : ""}>
								{row.is_cleared ? 'Cleared' : 'Pending'}
							</Badge>
						</TableCell>
						<TableCell className="text-center">
							<Badge variant="outline" className={
								row.priority_level === 'Critical' ? 'border-red-500 text-red-600' :
									row.priority_level === 'High' ? 'border-orange-500 text-orange-600' :
										'border-gray-400'
							}>
								{row.priority_level}
							</Badge>
						</TableCell>
					</TableRow>
				)
			case 'missing-data':
				return (
					<TableRow key={index}>
						<TableCell className="text-center">{sNo}</TableCell>
						<TableCell className="text-center font-medium">{row.register_number}</TableCell>
						<TableCell>{row.learner_name}</TableCell>
						<TableCell className="text-center">{row.program_code}</TableCell>
						<TableCell className="text-center">{row.semester}</TableCell>
						<TableCell className="text-center">{row.course_code}</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.has_internal ? "default" : "destructive"} className={row.has_internal ? "bg-green-600" : ""}>
								{row.has_internal ? 'Yes' : 'No'}
							</Badge>
						</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.has_external ? "default" : "destructive"} className={row.has_external ? "bg-green-600" : ""}>
								{row.has_external ? 'Yes' : 'No'}
							</Badge>
						</TableCell>
						<TableCell className="text-center">
							<Badge variant={row.has_attendance ? "default" : "destructive"} className={row.has_attendance ? "bg-green-600" : ""}>
								{row.has_attendance ? 'Yes' : 'No'}
							</Badge>
						</TableCell>
						<TableCell className="text-center">
							<Badge variant="destructive">
								{row.missing_type?.toUpperCase()}
							</Badge>
						</TableCell>
					</TableRow>
				)
			default:
				return null
		}
	}

	// Get display values
	const selectedInstitution = institutions.find(i => i.id === selectedInstitutionId)
	const selectedSession = sessions.find(s => s.id === selectedSessionId)
	const selectedProgram = programs.find(p => p.id === selectedProgramId)
	const selectedCourse = courses.find(c => c.id === selectedCourseId)

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
								<BreadcrumbPage>Comprehensive Reports</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Page Header */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center">
								<BarChart3 className="h-5 w-5 text-white" />
							</div>
							<div>
								<h1 className="text-2xl font-bold">Comprehensive Reports</h1>
								<p className="text-sm text-muted-foreground">Generate detailed reports for exam management</p>
							</div>
						</div>
					</div>

					{/* Tab Navigation */}
					<div className="flex flex-wrap gap-2 p-1 bg-muted/50 rounded-lg">
						{visibleTabs.map((tab) => (
							<Button
								key={tab.key}
								variant={activeTab === tab.key ? "default" : "ghost"}
								size="sm"
								className={cn(
									"flex items-center gap-2 transition-all",
									activeTab === tab.key && tab.color
								)}
								onClick={() => {
									setActiveTab(tab.key)
									setReportData([])
									setReportSummary(null)
								}}
							>
								{tab.icon}
								<span className="hidden sm:inline">{tab.label}</span>
							</Button>
						))}
					</div>

					{/* Filter Section */}
					<Card>
						<CardHeader className="pb-3">
							<div className="flex items-center gap-2">
								<Filter className="h-4 w-4" />
								<CardTitle className="text-sm">Filters</CardTitle>
							</div>
						</CardHeader>
						<CardContent>
							<div className={cn("grid gap-4", mustSelectInstitution ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-5" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4")}>
								{/* Institution */}
								{mustSelectInstitution && (
									<div className="space-y-2">
										<Label className="text-xs">Institution *</Label>
										<Popover open={institutionOpen} onOpenChange={setInstitutionOpen}>
											<PopoverTrigger asChild>
												<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9">
													<span className="truncate">{selectedInstitution ? `${selectedInstitution.institution_code} - ${selectedInstitution.name}` : "Select"}</span>
													<ChevronsUpDown className="h-3 w-3 ml-2 opacity-50" />
												</Button>
											</PopoverTrigger>
											<PopoverContent className="w-[350px] p-0">
												<Command>
													<CommandInput placeholder="Search..." className="h-8 text-xs" />
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

								{/* Session */}
								<div className="space-y-2">
									<Label className="text-xs">Session *</Label>
									<Popover open={sessionOpen} onOpenChange={setSessionOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9" disabled={!selectedInstitutionId}>
												<span className="truncate">{selectedSession?.session_name || "Select"}</span>
												<ChevronsUpDown className="h-3 w-3 ml-2 opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[300px] p-0">
											<Command>
												<CommandInput placeholder="Search..." className="h-8 text-xs" />
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

								{/* Program */}
								<div className="space-y-2">
									<Label className="text-xs">Program</Label>
									<Popover open={programOpen} onOpenChange={setProgramOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9" disabled={!selectedSessionId || loadingPrograms}>
												{loadingPrograms ? (
													<span className="flex items-center gap-2 text-muted-foreground">
														<Loader2 className="h-3 w-3 animate-spin" />
														Loading...
													</span>
												) : (
													<span className="truncate">{selectedProgram ? `${selectedProgram.program_code} - ${selectedProgram.program_name}` : "All Programs"}</span>
												)}
												<div className="flex items-center gap-1">
													{selectedProgramId && !loadingPrograms && (
														<X className="h-3 w-3 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setSelectedProgramId(""); }} />
													)}
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</div>
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[350px] p-0">
											<Command>
												<CommandInput placeholder="Search..." className="h-8 text-xs" />
												<CommandList>
													<CommandEmpty className="py-2 text-xs">No program found.</CommandEmpty>
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
									<Label className="text-xs">Semester</Label>
									<Select value={selectedSemester} onValueChange={setSelectedSemester} disabled={!selectedProgramId || loadingSemesters}>
										<SelectTrigger className="h-9 text-xs">
											{loadingSemesters ? (
												<span className="flex items-center gap-2 text-muted-foreground">
													<Loader2 className="h-3 w-3 animate-spin" />
													Loading...
												</span>
											) : (
												<SelectValue placeholder="All Semesters" />
											)}
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Semesters</SelectItem>
											{semesters.map(sem => (
												<SelectItem key={sem.semester_number} value={sem.semester_number.toString()}>
													{sem.semester_name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{/* Course */}
								<div className="space-y-2">
									<Label className="text-xs">Course</Label>
									<Popover open={courseOpen} onOpenChange={setCourseOpen}>
										<PopoverTrigger asChild>
											<Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9" disabled={!selectedSessionId}>
												<span className="truncate">{selectedCourse ? `${selectedCourse.course_code}` : "All Courses"}</span>
												<div className="flex items-center gap-1">
													{selectedCourseId && (
														<X className="h-3 w-3 opacity-50 hover:opacity-100" onClick={(e) => { e.stopPropagation(); setSelectedCourseId(""); }} />
													)}
													<ChevronsUpDown className="h-3 w-3 opacity-50" />
												</div>
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-[350px] p-0">
											<Command>
												<CommandInput placeholder="Search..." className="h-8 text-xs" />
												<CommandList>
													<CommandEmpty className="py-2 text-xs">No course found.</CommandEmpty>
													<CommandGroup>
														{courses.map((course) => (
															<CommandItem
																key={course.id}
																value={`${course.course_code} ${course.course_title}`}
																onSelect={() => {
																	setSelectedCourseId(course.id)
																	setCourseOpen(false)
																}}
																className="text-xs"
															>
																<Check className={cn("mr-2 h-3 w-3", selectedCourseId === course.id ? "opacity-100" : "opacity-0")} />
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

							{/* Generate Button */}
							<div className="flex justify-end mt-4">
								<Button onClick={fetchReport} disabled={loadingReport || !selectedInstitutionId || !selectedSessionId}>
									{loadingReport ? (
										<>
											<Loader2 className="h-4 w-4 mr-2 animate-spin" />
											Generating...
										</>
									) : (
										<>
											<RefreshCw className="h-4 w-4 mr-2" />
											Generate Report
										</>
									)}
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Summary Section */}
					{reportSummary && (
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm">Summary Statistics</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
									{Object.entries(reportSummary)
										.filter(([key]) => !key.startsWith('by_') && typeof reportSummary[key] !== 'object')
										.slice(0, 6)
										.map(([key, value]) => (
											<div key={key} className="text-center p-3 bg-muted rounded-lg">
												<p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</p>
												<p className="text-lg font-bold">
													{typeof value === 'number' ? (
														key.includes('percentage') || key.includes('average') || key.includes('sgpa') || key.includes('cgpa')
															? (value as number).toFixed(2)
															: value.toLocaleString()
													) : String(value)}
													{key.includes('percentage') && '%'}
												</p>
											</div>
										))}
								</div>
							</CardContent>
						</Card>
					)}

					{/* Data Table */}
					<Card>
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<CardTitle className="text-sm">Report Data</CardTitle>
								<div className="flex items-center gap-2">
									{/* Search */}
									<div className="relative">
										<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
										<Input
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											placeholder="Search..."
											className="pl-7 h-8 w-48 text-xs"
										/>
									</div>
									{/* Export buttons */}
									<Button variant="outline" size="sm" onClick={handleExportExcel} disabled={exporting || reportData.length === 0}>
										<FileDown className="h-3 w-3 mr-1" />
										Excel
									</Button>
									<Button variant="outline" size="sm" onClick={handleExportPDF} disabled={exporting || reportData.length === 0}>
										<FileText className="h-3 w-3 mr-1" />
										PDF
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<div className="rounded-md border overflow-hidden" style={{ maxHeight: "500px" }}>
								<div className="overflow-auto" style={{ maxHeight: "500px" }}>
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												{getTableColumns().map((col, idx) => (
													<TableHead key={idx} className="text-xs font-semibold whitespace-nowrap">
														{col}
													</TableHead>
												))}
											</TableRow>
										</TableHeader>
										<TableBody>
											{paginatedData.length === 0 ? (
												<TableRow>
													<TableCell colSpan={getTableColumns().length} className="h-24 text-center text-muted-foreground">
														{loadingReport ? "Loading..." : reportData.length === 0 ? "No data. Generate a report to see results." : "No matching records."}
													</TableCell>
												</TableRow>
											) : (
												paginatedData.map((row, idx) => renderTableRow(row, idx))
											)}
										</TableBody>
									</Table>
								</div>
							</div>

							{/* Pagination */}
							<div className="flex items-center justify-between mt-4">
								<div className="text-xs text-muted-foreground">
									Showing {filteredData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} records
								</div>
								<div className="flex items-center gap-2">
									<Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
										<ChevronLeft className="h-3 w-3 mr-1" /> Previous
									</Button>
									<span className="text-xs px-2">Page {currentPage} of {totalPages}</span>
									<Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
										Next <ChevronRight className="h-3 w-3 ml-1" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
