"use client"

import { useMemo, useState, useEffect } from "react"
import XLSX from "@/lib/utils/excel-compat"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useSessionSync } from "@/hooks/use-session-sync"
import Link from "next/link"
import {
	Trash2,
	Search,
	ChevronLeft,
	ChevronRight,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	FileSpreadsheet,
	RefreshCw,
	Upload,
	Download,
	CheckCircle,
	XCircle,
	AlertTriangle,
	FileUp,
	ClipboardList,
	FileJson,
	Loader2
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// Import export/import utilities
import {
	exportToJSON,
	exportToExcel,
	exportTemplate,
	parseImportFile,
	mapImportRow,
	type InternalMarkExport
} from "@/lib/utils/internal-marks/export-import"

// Types
interface InternalMark {
	id: string
	institutions_id: string
	examination_session_id: string
	program_id: string
	course_id: string
	student_id: string
	student_name: string
	register_no: string
	course_code: string
	course_name: string
	program_name: string
	session_name: string
	institution_code: string
	institution_name: string
	assignment_marks: number | null
	quiz_marks: number | null
	mid_term_marks: number | null
	presentation_marks: number | null
	attendance_marks: number | null
	lab_marks: number | null
	project_marks: number | null
	seminar_marks: number | null
	viva_marks: number | null
	other_marks: number | null
	test_1_mark: number | null
	test_2_mark: number | null
	test_3_mark: number | null
	total_internal_marks: number | null
	max_internal_marks: number | null
	internal_percentage: number | null
	marks_status: string
	remarks: string | null
	is_active: boolean
	created_at: string
}

interface ImportPreviewRow {
	row: number
	institution_code: string
	register_no: string
	course_code: string
	session_code: string
	program_code: string
	assignment_marks: number | null
	quiz_marks: number | null
	mid_term_marks: number | null
	presentation_marks: number | null
	attendance_marks: number | null
	lab_marks: number | null
	project_marks: number | null
	seminar_marks: number | null
	viva_marks: number | null
	other_marks: number | null
	test_1_mark: number | null
	test_2_mark: number | null
	test_3_mark: number | null
	max_internal_marks: number
	remarks: string
	errors: string[]
	isValid: boolean
}

interface Institution {
	id: string
	name: string
	institution_code: string
	institution_name: string
	myjkkn_institution_ids: string[] | null  // Required for MyJKKN integration
}

interface Session {
	id: string
	session_name: string
	session_code: string
	institutions_id?: string
}

interface Program {
	id: string
	program_code: string
	program_name: string
}

interface Course {
	id: string
	course_code: string
	course_name: string
	internal_max_mark: number
}

export default function BulkInternalMarksPage() {
	const { toast } = useToast()
	const { user } = useAuth()

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

	const [items, setItems] = useState<InternalMark[]>([])
	const [loading, setLoading] = useState(false)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(15)

	// Filters
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [sessions, setSessions] = useState<Session[]>([])
	const [programs, setPrograms] = useState<Program[]>([])
	const [courses, setCourses] = useState<Course[]>([])
	const { selectedSessionId: selectedSession, setSelectedSessionId: setSelectedSession, mustSelectSession } = useSessionSync()
	const [selectedProgram, setSelectedProgram] = useState("")
	const [selectedCourse, setSelectedCourse] = useState("")
	const [statusFilter, setStatusFilter] = useState("all")

	// Selection
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [selectAll, setSelectAll] = useState(false)

	// Dialogs
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
	const [errorDialogOpen, setErrorDialogOpen] = useState(false)
	const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false)

	// Import/Upload
	const [importPreviewData, setImportPreviewData] = useState<ImportPreviewRow[]>([])
	const [uploadErrors, setUploadErrors] = useState<any[]>([])
	const [uploadSummary, setUploadSummary] = useState({
		total: 0,
		success: 0,
		failed: 0,
		skipped: 0
	})
	const [templateExportLoading, setTemplateExportLoading] = useState(false)
	const [importInProgress, setImportInProgress] = useState(false)
	// Track failed rows for download
	const [failedRowsData, setFailedRowsData] = useState<Record<string, unknown>[]>([])
	// Import progress tracking to prevent page freeze
	const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })

	// Fetch institutions and sessions on mount when ready
	useEffect(() => {
		if (isReady) {
			fetchInstitutions()
			fetchSessions()  // Fetch all sessions upfront
		}
	}, [isReady])


	// Fetch programs and courses based on institution context
	// For normal users: uses their institution
	// For super_admin: fetches all if "All Institutions", otherwise selected institution
	useEffect(() => {
		if (isReady) {
			const instId = getInstitutionIdForCreate()
			if (instId) {
				fetchPrograms(instId)
				fetchCourses(instId)
			} else if (mustSelectInstitution) {
				// super_admin with "All Institutions" - fetch all programs/courses
				fetchAllPrograms()
				fetchAllCourses()
			}
		}
	}, [isReady, mustSelectInstitution, getInstitutionIdForCreate])

	// Fetch marks when ready AND filters are selected
	// Only fetch when session is selected AND at least one of program/course is selected
	useEffect(() => {
		if (isReady && selectedSession && (selectedProgram || selectedCourse)) {
			fetchMarks()
		}
	}, [isReady, selectedSession, selectedProgram, selectedCourse])

	const fetchInstitutions = async () => {
		try {
			const url = appendToUrl('/api/pre-exam/internal-marks?action=institutions')
			const res = await fetch(url)
			const data = await res.json()

			if (res.ok) {
				// Map institutions with all required fields including myjkkn_institution_ids
				setInstitutions(data.map((i: any) => ({
					id: i.id,
					name: i.name || i.institution_name,
					institution_code: i.institution_code,
					institution_name: i.institution_name || i.name,
					myjkkn_institution_ids: i.myjkkn_institution_ids || []
				})))
			} else {
				console.error('Failed to fetch institutions:', data.error || 'Unknown error')
				toast({
					title: "❌ Failed to Load Institutions",
					description: data.error || "Unable to fetch institutions. Please refresh the page.",
					variant: "destructive",
				})
			}
		} catch (error) {
			console.error('Failed to fetch institutions:', error)
			toast({
				title: "❌ Network Error",
				description: "Unable to connect to server. Please check your connection.",
				variant: "destructive",
			})
		}
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch('/api/pre-exam/internal-marks?action=sessions')
			if (res.ok) {
				const data = await res.json()
				setSessions(data)
			}
		} catch (error) {
			console.error('Failed to fetch sessions:', error)
		}
	}

	const fetchPrograms = async (institutionId: string) => {
		try {
			const res = await fetch(`/api/pre-exam/internal-marks?action=programs&institutionId=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setPrograms(data)
			}
		} catch (error) {
			console.error('Failed to fetch programs:', error)
		}
	}

	// Fetch all programs (for super_admin with "All Institutions")
	const fetchAllPrograms = async () => {
		try {
			const res = await fetch('/api/pre-exam/internal-marks?action=all-programs')
			if (res.ok) {
				const data = await res.json()
				setPrograms(data)
			}
		} catch (error) {
			console.error('Failed to fetch all programs:', error)
		}
	}

	const fetchCourses = async (institutionId: string) => {
		try {
			const res = await fetch(`/api/pre-exam/internal-marks?action=courses&institutionId=${institutionId}`)
			if (res.ok) {
				const data = await res.json()
				setCourses(data)
			}
		} catch (error) {
			console.error('Failed to fetch courses:', error)
		}
	}

	// Fetch all courses (for super_admin with "All Institutions")
	const fetchAllCourses = async () => {
		try {
			const res = await fetch('/api/pre-exam/internal-marks?action=all-courses')
			if (res.ok) {
				const data = await res.json()
				setCourses(data)
			}
		} catch (error) {
			console.error('Failed to fetch all courses:', error)
		}
	}

	const fetchMarks = async () => {
		try {
			setLoading(true)
			// Use appendToUrl for proper institution filtering based on user role
			let url = appendToUrl('/api/pre-exam/internal-marks?action=marks')
			if (selectedSession) url += `&sessionId=${selectedSession}`
			if (selectedProgram) url += `&programCode=${selectedProgram}`
			if (selectedCourse) url += `&courseId=${selectedCourse}`

			console.log('[fetchMarks] Fetching from URL:', url)
			const res = await fetch(url)
			const data = await res.json()

			console.log('[fetchMarks] Response status:', res.ok, 'Data length:', Array.isArray(data) ? data.length : 'not array')
			if (Array.isArray(data) && data.length > 0) {
				console.log('[fetchMarks] First item sample:', data[0])
			}

			if (res.ok) {
				console.log('[fetchMarks] Setting items, count:', data?.length || 0)
				setItems(data)
			} else {
				console.error('Failed to fetch marks:', data.error || 'Unknown error')
				toast({
					title: "❌ Failed to Load Marks",
					description: data.error || "Unable to fetch internal marks. Please try again.",
					variant: "destructive",
				})
				setItems([])
			}
		} catch (error) {
			console.error('Failed to fetch marks:', error)
			toast({
				title: "❌ Network Error",
				description: "Unable to connect to server. Please check your connection.",
				variant: "destructive",
			})
			setItems([])
		} finally {
			setLoading(false)
		}
	}

	// Sorting
	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc")
		} else {
			setSortColumn(column)
			setSortDirection("asc")
		}
	}

	const getSortIcon = (column: string) => {
		if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		return sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
	}

	// Get internal type and marks for display
	const getInternalTypeAndMarks = (mark: InternalMark): { type: string; marks: number | null } => {
		if (mark.assignment_marks !== null) return { type: 'Assignment', marks: mark.assignment_marks }
		if (mark.quiz_marks !== null) return { type: 'Quiz', marks: mark.quiz_marks }
		if (mark.mid_term_marks !== null) return { type: 'Mid Term', marks: mark.mid_term_marks }
		if (mark.presentation_marks !== null) return { type: 'Presentation', marks: mark.presentation_marks }
		if (mark.attendance_marks !== null) return { type: 'Attendance', marks: mark.attendance_marks }
		if (mark.lab_marks !== null) return { type: 'Lab', marks: mark.lab_marks }
		if (mark.project_marks !== null) return { type: 'Project', marks: mark.project_marks }
		if (mark.seminar_marks !== null) return { type: 'Seminar', marks: mark.seminar_marks }
		if (mark.viva_marks !== null) return { type: 'Viva', marks: mark.viva_marks }
		if (mark.test_1_mark !== null) return { type: 'Test 1', marks: mark.test_1_mark }
		if (mark.test_2_mark !== null) return { type: 'Test 2', marks: mark.test_2_mark }
		if (mark.test_3_mark !== null) return { type: 'Test 3', marks: mark.test_3_mark }
		if (mark.other_marks !== null) return { type: 'Other', marks: mark.other_marks }
		return { type: 'N/A', marks: null }
	}

	// Filter sessions by user's institution context (client-side filtering)
	// For normal users: filtered to their institution
	// For super_admin with "All Institutions": show all sessions
	const filteredSessions = useMemo(() => {
		const userInstitutionId = getInstitutionIdForCreate()
		if (!userInstitutionId) {
			// super_admin with "All Institutions" - show all sessions
			return sessions
		}
		// Normal user or super_admin with specific institution - filter by institution
		return sessions.filter(session => session.institutions_id === userInstitutionId)
	}, [sessions, getInstitutionIdForCreate])

	// Filter and sort
	const filtered = useMemo(() => {
		const q = searchTerm.toLowerCase()
		let data = items.filter((i) =>
			[i.register_no, i.student_name, i.course_code, i.course_name]
				.filter(Boolean)
				.some((v) => String(v).toLowerCase().includes(q))
		)

		if (statusFilter !== "all") {
			data = data.filter((i) => i.marks_status?.toLowerCase() === statusFilter.toLowerCase())
		}

		if (!sortColumn) return data

		return [...data].sort((a, b) => {
			const av = (a as any)[sortColumn]
			const bv = (b as any)[sortColumn]
			if (av === bv) return 0
			if (sortDirection === "asc") return av > bv ? 1 : -1
			return av < bv ? 1 : -1
		})
	}, [items, searchTerm, sortColumn, sortDirection, statusFilter])

	// Dynamic pagination options
	const pageSizeOptions = useMemo(() => {
		const allSizes = [10, 15, 20, 50, 100, 250, 500, 1000]
		const total = filtered.length
		const options = allSizes.filter((s) => s < total)
		if (!options.includes(15)) options.unshift(15)
		if (total > 15) options.push(total)
		return options
	}, [filtered.length])

	const isShowAll = itemsPerPage >= filtered.length
	const effectivePerPage = isShowAll ? filtered.length || 1 : itemsPerPage

	// Pagination
	const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const pageItems = filtered.slice(startIndex, endIndex)

	useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, statusFilter])

	// Selection handlers
	const handleSelectAll = (checked: boolean) => {
		setSelectAll(checked)
		if (checked) {
			setSelectedIds(new Set(pageItems.map(item => item.id)))
		} else {
			setSelectedIds(new Set())
		}
	}

	const handleSelectItem = (id: string, checked: boolean) => {
		const newSelected = new Set(selectedIds)
		if (checked) {
			newSelected.add(id)
		} else {
			newSelected.delete(id)
		}
		setSelectedIds(newSelected)
		setSelectAll(newSelected.size === pageItems.length)
	}

	// Download Template - uses utility function with loading state
	const handleDownloadTemplate = async () => {
		setTemplateExportLoading(true)
		toast({
			title: "Generating template...",
			description: "Fetching reference data for template",
		})

		try {
			// Use the utility function with current reference data
			exportTemplate(institutions, sessions, programs, courses)

			toast({
				title: "✅ Template Downloaded",
				description: "Internal marks template with reference sheets has been downloaded successfully.",
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
			})
		} catch (error) {
			console.error('Template export error:', error)
			toast({
				title: "❌ Template Export Failed",
				description: "Failed to generate template. Please try again.",
				variant: "destructive",
			})
		} finally {
			setTemplateExportLoading(false)
		}
	}

	// Download failed rows as Excel file (same format as import template + Error columns)
	const handleDownloadFailedRows = () => {
		if (failedRowsData.length === 0) return

		// Create a map of errors by register_no + course_code for matching
		const errorMap = new Map<string, string[]>()
		uploadErrors.forEach((err: any) => {
			const key = `${err.register_no}|${err.course_code}`
			errorMap.set(key, err.errors || [err.error || 'Unknown error'])
		})

		// Helper function to categorize error and provide reference
		const getErrorReference = (errors: string[]): { category: string; reference: string } => {
			const errorText = errors.join(' ').toLowerCase()

			// Check for "Mark already added" - skipped rows
			if (errorText.includes('mark already added') || errorText.includes('already added')) {
				return {
					category: 'MARK_ALREADY_EXISTS',
					reference: 'Mark already added for this learner and course. Row skipped to prevent duplicate. No action needed - this is expected if re-uploading same data.'
				}
			}
			if (errorText.includes('learner') || errorText.includes('student') || errorText.includes('register')) {
				return {
					category: 'LEARNER_NOT_FOUND',
					reference: 'Check: 1) Learner exists and is registered for exam, 2) Register number is correct, 3) Learner has exam registration for this session/course'
				}
			}
			if (errorText.includes('course') && (errorText.includes('not found') || errorText.includes('invalid'))) {
				return {
					category: 'COURSE_INVALID',
					reference: 'Check: 1) Course Code exists, 2) Course belongs to the selected Institution'
				}
			}
			if (errorText.includes('session') && (errorText.includes('not found') || errorText.includes('invalid'))) {
				return {
					category: 'SESSION_INVALID',
					reference: 'Check: 1) Session Code exists, 2) Session belongs to the selected Institution'
				}
			}
			if (errorText.includes('marks') && (errorText.includes('exceed') || errorText.includes('negative') || errorText.includes('invalid'))) {
				return {
					category: 'MARKS_VALIDATION_ERROR',
					reference: 'Check: Marks must be non-negative and not exceed max internal marks (default 40)'
				}
			}
			if (errorText.includes('duplicate') || errorText.includes('already exists')) {
				return {
					category: 'DUPLICATE_ENTRY',
					reference: 'This marks entry already exists for this student and course combination'
				}
			}
			if (errorText.includes('required')) {
				return {
					category: 'MISSING_REQUIRED_FIELD',
					reference: 'Fill in all required fields: Register No, Course Code are mandatory'
				}
			}

			return {
				category: 'UNKNOWN_ERROR',
				reference: 'Review the error reason and correct the data accordingly'
			}
		}

		// Define column order to match template format + error columns
		const templateColumns = [
			'Register No',
			'Course Code',
			'Session Code',
			'Program Code',
			'Assignment',
			'Quiz',
			'Mid Term',
			'Presentation',
			'Attendance',
			'Lab',
			'Project',
			'Seminar',
			'Viva',
			'Test 1',
			'Test 2',
			'Test 3',
			'Other',
			'Max Internal',
			'Remarks',
			'Error Category',
			'Error Reason',
			'Error Reference'
		]

		// Add error columns to each failed row
		const rowsWithErrors = failedRowsData.map((row, index) => {
			const registerNo = String(row['Register No'] || row['register_no'] || '').trim()
			const courseCode = String(row['Course Code'] || row['course_code'] || '').trim()
			const key = `${registerNo || 'N/A'}|${courseCode || 'N/A'}`

			// Find matching error
			let errors = errorMap.get(key)
			if (!errors && uploadErrors[index]) {
				errors = uploadErrors[index].errors || [uploadErrors[index].error || 'Unknown error']
			}
			const errorReason = errors?.join('; ') || 'Unknown error'
			const { category, reference } = getErrorReference(errors || [])

			// Create row with explicit column order
			const orderedRow: Record<string, unknown> = {}
			templateColumns.forEach(col => {
				if (col === 'Error Category') {
					orderedRow[col] = category
				} else if (col === 'Error Reason') {
					orderedRow[col] = errorReason
				} else if (col === 'Error Reference') {
					orderedRow[col] = reference
				} else {
					orderedRow[col] = row[col] ?? ''
				}
			})

			return orderedRow
		})

		// Create worksheet from failed rows with error reasons
		const ws = XLSX.utils.json_to_sheet(rowsWithErrors, { header: templateColumns })

		// Set column widths
		const colWidths = [
			{ wch: 18 }, // Register No
			{ wch: 15 }, // Course Code
			{ wch: 18 }, // Session Code
			{ wch: 15 }, // Program Code
			{ wch: 12 }, // Assignment
			{ wch: 10 }, // Quiz
			{ wch: 12 }, // Mid Term
			{ wch: 12 }, // Presentation
			{ wch: 12 }, // Attendance
			{ wch: 10 }, // Lab
			{ wch: 10 }, // Project
			{ wch: 10 }, // Seminar
			{ wch: 10 }, // Viva
			{ wch: 10 }, // Test 1
			{ wch: 10 }, // Test 2
			{ wch: 10 }, // Test 3
			{ wch: 10 }, // Other
			{ wch: 14 }, // Max Internal
			{ wch: 25 }, // Remarks
			{ wch: 25 }, // Error Category
			{ wch: 60 }, // Error Reason
			{ wch: 80 }  // Error Reference
		]
		ws['!cols'] = colWidths

		// Create workbook
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Failed Rows')

		// Generate filename with timestamp
		const timestamp = new Date().toISOString().slice(0, 10)
		const filename = `internal-marks-failed-${timestamp}.xlsx`

		// Download the file
		XLSX.writeFile(wb, filename)

		toast({
			title: "📥 Downloaded",
			description: `${failedRowsData.length} failed row${failedRowsData.length > 1 ? 's' : ''} with error details exported to ${filename}`,
			className: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200",
		})
	}

	// JSON Export handler
	const handleExportJSON = () => {
		if (!items || items.length === 0) {
			toast({
				title: "⚠️ No Data to Export",
				description: "Please load some data before exporting.",
				variant: "destructive",
				className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
			})
			return
		}

		const exportData: InternalMarkExport[] = items.map(item => ({
			register_no: item.register_no || '',
			student_name: item.student_name || '',
			course_code: item.course_code || '',
			course_name: item.course_name || '',
			program_name: item.program_name || '',
			session_name: item.session_name || '',
			assignment_marks: item.assignment_marks,
			quiz_marks: item.quiz_marks,
			mid_term_marks: item.mid_term_marks,
			presentation_marks: item.presentation_marks,
			attendance_marks: item.attendance_marks,
			lab_marks: item.lab_marks,
			project_marks: item.project_marks,
			seminar_marks: item.seminar_marks,
			viva_marks: item.viva_marks,
			other_marks: item.other_marks,
			test_1_mark: item.test_1_mark,
			test_2_mark: item.test_2_mark,
			test_3_mark: item.test_3_mark,
			total_internal_marks: item.total_internal_marks,
			max_internal_marks: item.max_internal_marks,
			internal_percentage: item.internal_percentage,
			marks_status: item.marks_status || 'Draft',
			remarks: item.remarks
		}))

		exportToJSON(exportData)

		toast({
			title: "✅ JSON Exported",
			description: `Successfully exported ${items.length} record${items.length > 1 ? 's' : ''} to JSON.`,
			className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
		})
	}

	// Export Current Data - uses utility function
	const handleExportData = () => {
		if (!items || items.length === 0) {
			toast({
				title: "⚠️ No Data to Export",
				description: "Please load some data before exporting.",
				variant: "destructive",
				className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
			})
			return
		}

		const exportData: InternalMarkExport[] = items.map(item => ({
			register_no: item.register_no || '',
			student_name: item.student_name || '',
			course_code: item.course_code || '',
			course_name: item.course_name || '',
			program_name: item.program_name || '',
			session_name: item.session_name || '',
			assignment_marks: item.assignment_marks,
			quiz_marks: item.quiz_marks,
			mid_term_marks: item.mid_term_marks,
			presentation_marks: item.presentation_marks,
			attendance_marks: item.attendance_marks,
			lab_marks: item.lab_marks,
			project_marks: item.project_marks,
			seminar_marks: item.seminar_marks,
			viva_marks: item.viva_marks,
			other_marks: item.other_marks,
			test_1_mark: item.test_1_mark,
			test_2_mark: item.test_2_mark,
			test_3_mark: item.test_3_mark,
			total_internal_marks: item.total_internal_marks,
			max_internal_marks: item.max_internal_marks,
			internal_percentage: item.internal_percentage,
			marks_status: item.marks_status || 'Draft',
			remarks: item.remarks
		}))

		// Get institution code from context for filename
		const userInstitutionId = getInstitutionIdForCreate()
		const institutionCode = userInstitutionId
			? institutions.find(i => i.id === userInstitutionId)?.institution_code
			: undefined

		exportToExcel(exportData, institutionCode)

		toast({
			title: "✅ Data Exported",
			description: `Successfully exported ${items.length} record${items.length > 1 ? 's' : ''} to Excel.`,
			className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
		})
	}

	// Import File - uses utility functions
	const handleImportFile = () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.xlsx,.xls,.csv,.json'
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (!file) return

			setImportInProgress(true)
			toast({
				title: "📂 Processing File...",
				description: `Reading ${file.name}`,
			})

			try {
				// Parse file using utility function
				const rows = await parseImportFile(file)

				if (rows.length === 0) {
					toast({
						title: "❌ Empty File",
						description: "The file contains no data rows.",
						variant: "destructive",
					})
					setImportInProgress(false)
					return
				}

				// Map and validate rows using utility function
				const previewData: ImportPreviewRow[] = rows.map((row, index) => {
					const mapped = mapImportRow(row, index)
					return {
						row: mapped.rowNumber,
						institution_code: mapped.institution_code,
						register_no: mapped.register_no,
						course_code: mapped.course_code,
						session_code: mapped.session_code,
						program_code: mapped.program_code,
						assignment_marks: mapped.assignment_marks,
						quiz_marks: mapped.quiz_marks,
						mid_term_marks: mapped.mid_term_marks,
						presentation_marks: mapped.presentation_marks,
						attendance_marks: mapped.attendance_marks,
						lab_marks: mapped.lab_marks,
						project_marks: mapped.project_marks,
						seminar_marks: mapped.seminar_marks,
						viva_marks: mapped.viva_marks,
						other_marks: mapped.other_marks,
						test_1_mark: mapped.test_1_mark,
						test_2_mark: mapped.test_2_mark,
						test_3_mark: mapped.test_3_mark,
						max_internal_marks: mapped.max_internal_marks,
						remarks: mapped.remarks,
						errors: mapped.errors,
						isValid: mapped.status === 'valid'
					}
				})

				setImportPreviewData(previewData)
				setPreviewDialogOpen(true)

				toast({
					title: "✅ File Parsed Successfully",
					description: `${previewData.length} rows found. ${previewData.filter(r => r.isValid).length} valid, ${previewData.filter(r => !r.isValid).length} with errors.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})

			} catch (error) {
				console.error('Import error:', error)
				toast({
					title: "❌ Import Error",
					description: error instanceof Error ? error.message : "Failed to parse the file. Please check the format.",
					variant: "destructive",
				})
			} finally {
				setImportInProgress(false)
			}
		}
		input.click()
	}

	// Upload Marks
	const handleUploadMarks = async () => {
		// Institution ID is determined per-row from institution_code in Excel
		// For normal users: API validates that all rows match their institution
		// For super_admin: Can import for any institution based on Excel data
		let institutionId: string | null = null

		if (!mustSelectInstitution) {
			// Normal user - get their institution from context
			institutionId = getInstitutionIdForCreate() || null
			if (!institutionId) {
				toast({
					title: "⚠️ Institution Error",
					description: "Unable to determine your institution. Please try again.",
					variant: "destructive",
				})
				return
			}
		}
		// For super_admin (mustSelectInstitution=true), institutionId stays null
		// The API will use institution_code from each row

		const validRows = importPreviewData.filter(row => row.isValid)
		if (validRows.length === 0) {
			toast({
				title: "❌ No Valid Data",
				description: "No valid rows to upload. Please fix the errors and try again.",
				variant: "destructive",
			})
			return
		}

		setPreviewDialogOpen(false)
		setLoading(true)
		setImportInProgress(true)
		setImportProgress({ current: 0, total: validRows.length })
		setFailedRowsData([])  // Reset failed rows

		try {
			// Process in batches to prevent UI freeze
			const BATCH_SIZE = 50
			const totalBatches = Math.ceil(validRows.length / BATCH_SIZE)

			let totalSuccessful = 0
			let totalFailed = 0
			let totalSkipped = 0
			const allErrors: any[] = []
			const failedRows: Record<string, unknown>[] = []

			for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
				const startIdx = batchIndex * BATCH_SIZE
				const endIdx = Math.min(startIdx + BATCH_SIZE, validRows.length)
				const batchRows = validRows.slice(startIdx, endIdx)

				// Update progress before processing batch
				setImportProgress({ current: startIdx, total: validRows.length })

				// Allow UI to update
				await new Promise(resolve => setTimeout(resolve, 0))

				const marksData = batchRows.map(row => ({
					institution_code: row.institution_code,  // Institution code from Excel
					register_no: row.register_no,
					course_code: row.course_code,
					session_code: row.session_code,
					program_code: row.program_code,
					assignment_marks: row.assignment_marks,
					quiz_marks: row.quiz_marks,
					mid_term_marks: row.mid_term_marks,
					presentation_marks: row.presentation_marks,
					attendance_marks: row.attendance_marks,
					lab_marks: row.lab_marks,
					project_marks: row.project_marks,
					seminar_marks: row.seminar_marks,
					viva_marks: row.viva_marks,
					other_marks: row.other_marks,
					test_1_mark: row.test_1_mark,
					test_2_mark: row.test_2_mark,
					test_3_mark: row.test_3_mark,
					max_internal_marks: row.max_internal_marks,
					remarks: row.remarks
				}))

				const response = await fetch('/api/pre-exam/internal-marks', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'bulk-upload',
						institutions_id: institutionId || null,  // Can be null for super_admin
						examination_session_id: selectedSession || null,
						program_id: selectedProgram || null,
						course_id: selectedCourse || null,
						marks_data: marksData,
						file_name: 'bulk_upload.xlsx',
						file_type: 'XLSX',
						user_id: user?.id,
						user_email: user?.email,
						is_super_admin: mustSelectInstitution  // Super admin flag based on mustSelectInstitution
					})
				})

				const result = await response.json()

				if (!response.ok) {
					// Batch failed, but continue with other batches
					console.error(`Batch ${batchIndex + 1} failed:`, result.error)
					totalFailed += batchRows.length
					continue
				}

				// Accumulate results
				totalSuccessful += result.successful || 0
				totalFailed += result.failed || 0
				totalSkipped += result.skipped || 0

				// Collect errors from this batch
				const batchErrors = [
					...(result.errors || []),
					...(result.validation_errors || [])
				]
				allErrors.push(...batchErrors)

				// Track failed rows for download
				batchErrors.forEach((err: any) => {
					const originalRow = batchRows.find(row =>
						row.register_no === err.register_no && row.course_code === err.course_code
					)
					if (originalRow) {
						failedRows.push({
							'Institution Code': originalRow.institution_code,
							'Register No': originalRow.register_no,
							'Course Code': originalRow.course_code,
							'Session Code': originalRow.session_code,
							'Program Code': originalRow.program_code,
							'Assignment': originalRow.assignment_marks,
							'Quiz': originalRow.quiz_marks,
							'Mid Term': originalRow.mid_term_marks,
							'Presentation': originalRow.presentation_marks,
							'Attendance': originalRow.attendance_marks,
							'Lab': originalRow.lab_marks,
							'Project': originalRow.project_marks,
							'Seminar': originalRow.seminar_marks,
							'Viva': originalRow.viva_marks,
							'Test 1': originalRow.test_1_mark,
							'Test 2': originalRow.test_2_mark,
							'Test 3': originalRow.test_3_mark,
							'Other': originalRow.other_marks,
							'Max Internal': originalRow.max_internal_marks,
							'Remarks': originalRow.remarks,
						})
					}
				})

				// Update progress after batch completes
				setImportProgress({ current: endIdx, total: validRows.length })
			}

			// Update summary with accumulated totals
			setUploadSummary({
				total: validRows.length,
				success: totalSuccessful,
				failed: totalFailed,
				skipped: totalSkipped
			})

			// Store failed/skipped rows for potential download
			// Include both failed and skipped rows in the error file
			if ((totalFailed > 0 || totalSkipped > 0) && allErrors.length > 0) {
				setFailedRowsData(failedRows)
				setUploadErrors(allErrors)
			}

			// Update progress to complete
			setImportProgress({ current: validRows.length, total: validRows.length })

			// Always show confirmation dialog after upload
			setConfirmationDialogOpen(true)

			// Refresh data
			fetchMarks()
			setImportPreviewData([])

		} catch (error) {
			console.error('Upload error:', error)
			toast({
				title: "❌ Upload Error",
				description: error instanceof Error ? error.message : 'Failed to upload marks',
				variant: "destructive",
			})
		} finally {
			setLoading(false)
			setImportInProgress(false)
			setImportProgress({ current: 0, total: 0 })
		}
	}

	// Bulk Delete
	const handleBulkDelete = async () => {
		if (selectedIds.size === 0) return

		setLoading(true)
		try {
			const response = await fetch('/api/pre-exam/internal-marks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'bulk-delete',
					ids: Array.from(selectedIds)
				})
			})

			const result = await response.json()

			if (!response.ok) {
				throw new Error(result.error || 'Delete failed')
			}

			toast({
				title: "✅ Deleted Successfully",
				description: `${result.deleted} record(s) have been deleted.`,
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
			})

			setSelectedIds(new Set())
			setSelectAll(false)
			fetchMarks()

		} catch (error) {
			console.error('Delete error:', error)
			toast({
				title: "❌ Delete Failed",
				description: error instanceof Error ? error.message : 'Failed to delete records',
				variant: "destructive",
			})
		} finally {
			setLoading(false)
			setDeleteDialogOpen(false)
		}
	}

	return (
		<SidebarProvider>
			{/* Import Loading Overlay - centered modal pattern like exam-registrations */}
			{importInProgress && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
					<div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4">
						<div className="flex flex-col items-center gap-4">
							<div className="relative">
								<Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
							</div>
							<div className="text-center">
								<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
									Importing Internal Marks
								</h3>
								<p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
									Please wait while the data is being processed...
								</p>
							</div>
							{importProgress.total > 0 && (
								<div className="w-full space-y-2">
									<div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
										<span>Progress</span>
										<span>{importProgress.current} / {importProgress.total}</span>
									</div>
									<div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
										<div
											className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
											style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
										/>
									</div>
									<p className="text-xs text-center text-slate-500 dark:text-slate-400">
										{Math.round((importProgress.current / importProgress.total) * 100)}% complete
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
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
										<Link href="#">Pre Exam</Link>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Bulk Internal Marks Upload</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Scorecard Section */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Total Records</p>
										<p className="text-xl font-bold font-grotesk mt-1">{items.length}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<ClipboardList className="h-3 w-3 text-blue-600 dark:text-blue-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Draft</p>
										<p className="text-xl font-bold text-yellow-600 font-grotesk mt-1">
											{items.filter(i => i.marks_status === 'Draft').length}
										</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
										<FileUp className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Submitted</p>
										<p className="text-xl font-bold text-green-600 font-grotesk mt-1">
											{items.filter(i => i.marks_status === 'Submitted').length}
										</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
										<CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Selected</p>
										<p className="text-xl font-bold text-purple-600 font-grotesk mt-1">{selectedIds.size}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
										<CheckCircle className="h-3 w-3 text-purple-600 dark:text-purple-400" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Main Card */}
					<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 p-3">
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-2">
									<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
										<Upload className="h-3 w-3 text-primary" />
									</div>
									<div>
										<h2 className="text-sm font-semibold">Bulk Internal Marks Upload</h2>
										<p className="text-xs text-muted-foreground">Import and manage internal marks in bulk</p>
									</div>
								</div>
							</div>

							{/* Filters Row 1 - No institution filter in index, institution column shown in table for super_admin */}
							<div className="flex flex-wrap gap-2 mb-2">
								{mustSelectSession && (
								<Select value={selectedSession || "all"} onValueChange={(v) => setSelectedSession(v === "all" ? "" : v)}>
									<SelectTrigger className="w-[180px] h-8">
										<SelectValue placeholder="Select Session" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Sessions</SelectItem>
										{filteredSessions.map(session => (
											<SelectItem key={session.id} value={session.id}>
												{session.session_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								)}

								<Select value={selectedProgram || "all"} onValueChange={(v) => setSelectedProgram(v === "all" ? "" : v)}>
									<SelectTrigger className="w-[180px] h-8">
										<SelectValue placeholder="Select Program" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Programs</SelectItem>
										{programs.map(prog => (
											<SelectItem key={prog.id} value={prog.program_code}>
												{prog.program_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								<Select value={selectedCourse || "all"} onValueChange={(v) => setSelectedCourse(v === "all" ? "" : v)}>
									<SelectTrigger className="w-[180px] h-8">
										<SelectValue placeholder="Select Course" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Courses</SelectItem>
										{courses.map(course => (
											<SelectItem key={course.id} value={course.id}>
												{course.course_code} - {course.course_name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Filters Row 2 & Actions */}
							<div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
								<div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
									<Select value={statusFilter} onValueChange={setStatusFilter}>
										<SelectTrigger className="w-[140px] h-8">
											<SelectValue placeholder="All Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Status</SelectItem>
											<SelectItem value="draft">Draft</SelectItem>
											<SelectItem value="submitted">Submitted</SelectItem>
											<SelectItem value="approved">Approved</SelectItem>
											<SelectItem value="verified">Verified</SelectItem>
										</SelectContent>
									</Select>

									<div className="relative w-full sm:w-[220px]">
										<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
										<Input
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											placeholder="Search..."
											className="pl-8 h-8 text-xs"
										/>
									</div>
								</div>

								<div className="flex gap-1 flex-wrap items-center">
									{/* Refresh */}
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8"
													onClick={fetchMarks}
													disabled={loading}
												>
													<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Refresh Data</TooltipContent>
										</Tooltip>
									</TooltipProvider>

									{/* Template Download */}
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8"
													onClick={handleDownloadTemplate}
													disabled={templateExportLoading}
												>
													{templateExportLoading ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : (
														<FileSpreadsheet className="h-4 w-4" />
													)}
												</Button>
											</TooltipTrigger>
											<TooltipContent>Download Template</TooltipContent>
										</Tooltip>
									</TooltipProvider>

									{/* Import - always available, super_admin selects institution in dialog */}
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8"
													onClick={handleImportFile}
													disabled={importInProgress}
												>
													{importInProgress ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : (
														<Upload className="h-4 w-4" />
													)}
												</Button>
											</TooltipTrigger>
											<TooltipContent>
												{mustSelectInstitution
													? "Import File (select institution in dialog)"
													: "Import File"}
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>

									{/* Export Excel */}
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
													onClick={handleExportData}
													disabled={!items || items.length === 0}
												>
													<Download className="h-4 w-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Export Excel</TooltipContent>
										</Tooltip>
									</TooltipProvider>

									{/* Export JSON */}
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8"
													onClick={handleExportJSON}
													disabled={!items || items.length === 0}
												>
													<FileJson className="h-4 w-4" />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Download JSON</TooltipContent>
										</Tooltip>
									</TooltipProvider>

									{/* Delete Selected */}
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													variant="destructive"
													size="sm"
													className="text-xs px-2 h-8"
													onClick={() => setDeleteDialogOpen(true)}
													disabled={selectedIds.size === 0}
												>
													<Trash2 className="h-3 w-3 mr-1" />
													Delete ({selectedIds.size})
												</Button>
											</TooltipTrigger>
											<TooltipContent>Delete Selected Records</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
							</div>
						</CardHeader>

						<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
							<div className="rounded-md border overflow-hidden" style={{ height: "400px" }}>
										<div className="h-full overflow-auto">
											<Table>
												<TableHeader className="sticky top-0 bg-muted/50 z-10">
													<TableRow>
														<TableHead className="w-[40px] py-2">
															<Checkbox
																checked={selectAll}
																onCheckedChange={handleSelectAll}
															/>
														</TableHead>
														{/* Show Institution column only when "All Institutions" is selected */}
														{mustSelectInstitution && (
															<TableHead className="py-2">
																<div className="text-xs font-medium">Institution</div>
															</TableHead>
														)}
														<TableHead className="py-2 cursor-pointer" onClick={() => handleSort('register_no')}>
															<div className="flex items-center gap-1 text-xs font-medium">
																Register No {getSortIcon('register_no')}
															</div>
														</TableHead>
														<TableHead className="py-2 cursor-pointer" onClick={() => handleSort('student_name')}>
															<div className="flex items-center gap-1 text-xs font-medium">
																Student Name {getSortIcon('student_name')}
															</div>
														</TableHead>
														<TableHead className="py-2 cursor-pointer" onClick={() => handleSort('course_code')}>
															<div className="flex items-center gap-1 text-xs font-medium">
																Course Code {getSortIcon('course_code')}
															</div>
														</TableHead>
														<TableHead className="py-2">
															<div className="text-xs font-medium">Course Name</div>
														</TableHead>
														<TableHead className="py-2">
															<div className="text-xs font-medium">Internal Type</div>
														</TableHead>
														<TableHead className="py-2 text-center">
															<div className="text-xs font-medium">Marks</div>
														</TableHead>
														<TableHead className="py-2">
															<div className="text-xs font-medium">Status</div>
														</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{loading ? (
														<TableRow>
															<TableCell colSpan={mustSelectInstitution ? 9 : 8} className="text-center py-8 text-muted-foreground">
																<RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
																Loading...
															</TableCell>
														</TableRow>
													) : pageItems.length === 0 ? (
														<TableRow>
															<TableCell colSpan={mustSelectInstitution ? 9 : 8} className="text-center py-8 text-muted-foreground">
																No records found
															</TableCell>
														</TableRow>
													) : (
														pageItems.map((item) => {
															const { type, marks } = getInternalTypeAndMarks(item)
															return (
																<TableRow key={item.id} className="hover:bg-muted/30">
																	<TableCell className="py-2">
																		<Checkbox
																			checked={selectedIds.has(item.id)}
																			onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
																		/>
																	</TableCell>
																	{/* Show Institution cell when "All Institutions" is selected */}
																	{mustSelectInstitution && (
																		<TableCell className="py-2 text-xs">
																			{item.institution_code || '-'}
																		</TableCell>
																	)}
																	<TableCell className="py-2 text-xs font-medium">{item.register_no}</TableCell>
																	<TableCell className="py-2 text-xs">{item.student_name}</TableCell>
																	<TableCell className="py-2 text-xs font-mono">{item.course_code}</TableCell>
																	<TableCell className="py-2 text-xs">{item.course_name}</TableCell>
																	<TableCell className="py-2">
																		<Badge variant="outline" className="text-xs">
																			{type}
																		</Badge>
																	</TableCell>
																	<TableCell className="py-2 text-center text-xs font-medium">
																		{marks !== null ? marks : '-'}
																	</TableCell>
																	<TableCell className="py-2">
																		<Badge
																			variant={item.marks_status === 'Submitted' ? 'default' : 'secondary'}
																			className="text-xs"
																		>
																			{item.marks_status}
																		</Badge>
																	</TableCell>
																</TableRow>
															)
														})
													)}
												</TableBody>
											</Table>
										</div>
									</div>

									{/* Pagination */}
									<div className="flex items-center justify-between pt-3 flex-shrink-0">
										<div className="flex items-center gap-3">
											<p className="text-sm text-muted-foreground tabular-nums">
												{filtered.length === 0
													? 'No results'
													: `${startIndex + 1}–${Math.min(endIndex, filtered.length)} of ${filtered.length}`}
											</p>
											<div className="flex items-center gap-1.5">
												<span className="text-xs text-muted-foreground">Rows</span>
												<Select
													value={String(itemsPerPage)}
													onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}
												>
													<SelectTrigger className="h-7 w-[70px] text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{pageSizeOptions.map((size) => (
															<SelectItem key={size} value={String(size)}>
																{size === filtered.length ? 'All' : size}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
										</div>
										<div className="flex items-center gap-1">
											<Button
												variant="outline"
												size="sm"
												className="h-7 w-7 p-0"
												onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
												disabled={currentPage === 1}
											>
												<ChevronLeft className="h-3.5 w-3.5" />
											</Button>
											<span className="text-xs text-muted-foreground px-2 tabular-nums">
												{currentPage} / {totalPages}
											</span>
											<Button
												variant="outline"
												size="sm"
												className="h-7 w-7 p-0"
												onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
												disabled={currentPage >= totalPages}
											>
												<ChevronRight className="h-3.5 w-3.5" />
											</Button>
										</div>
									</div>
						</CardContent>
					</Card>
				</div>

				<AppFooter />
			</SidebarInset>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2 text-red-600">
							<Trash2 className="h-5 w-5" />
							Confirm Bulk Delete
						</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete {selectedIds.size} selected record(s)?
							This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleBulkDelete}
							className="bg-red-600 hover:bg-red-700"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Import Preview Dialog - follows skill pattern */}
			<Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
				<DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<FileSpreadsheet className="h-5 w-5" />
							Import Preview
						</DialogTitle>
						<DialogDescription>
							Review the data before importing.{' '}
							<span className="text-green-600 font-medium">{importPreviewData.filter(i => i.isValid).length} valid</span>,{' '}
							<span className="text-red-600 font-medium">{importPreviewData.filter(i => !i.isValid).length} with errors</span>
						</DialogDescription>
					</DialogHeader>

					{/* Info about institution-based import */}
					<div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-2 mb-2">
						<strong>Note:</strong> Institution is determined from the &quot;Institution Code&quot; column in the Excel file.
						{mustSelectInstitution
							? ' As super admin, you can import for multiple institutions in one file.'
							: ' All rows must match your institution code.'}
					</div>

					<div className="flex-1 overflow-y-auto border rounded-lg">
						<Table>
							<TableHeader className="sticky top-0 bg-muted">
								<TableRow>
									<TableHead className="w-[60px] text-xs">Row</TableHead>
									<TableHead className="text-xs">Status</TableHead>
									<TableHead className="text-xs">Institution</TableHead>
									<TableHead className="text-xs">Register No</TableHead>
									<TableHead className="text-xs">Course Code</TableHead>
									<TableHead className="text-xs">Marks Summary</TableHead>
									<TableHead className="text-xs text-center">Max</TableHead>
									<TableHead className="text-xs">Errors</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{importPreviewData.map((row) => {
									// Build marks summary
									const marksSummary: string[] = []
									if (row.assignment_marks !== null) marksSummary.push(`A:${row.assignment_marks}`)
									if (row.quiz_marks !== null) marksSummary.push(`Q:${row.quiz_marks}`)
									if (row.mid_term_marks !== null) marksSummary.push(`MT:${row.mid_term_marks}`)
									if (row.presentation_marks !== null) marksSummary.push(`P:${row.presentation_marks}`)
									if (row.attendance_marks !== null) marksSummary.push(`Att:${row.attendance_marks}`)
									if (row.lab_marks !== null) marksSummary.push(`L:${row.lab_marks}`)
									if (row.project_marks !== null) marksSummary.push(`Prj:${row.project_marks}`)
									if (row.seminar_marks !== null) marksSummary.push(`S:${row.seminar_marks}`)
									if (row.viva_marks !== null) marksSummary.push(`V:${row.viva_marks}`)
									if (row.test_1_mark !== null) marksSummary.push(`T1:${row.test_1_mark}`)
									if (row.test_2_mark !== null) marksSummary.push(`T2:${row.test_2_mark}`)
									if (row.test_3_mark !== null) marksSummary.push(`T3:${row.test_3_mark}`)
									if (row.other_marks !== null) marksSummary.push(`O:${row.other_marks}`)

									return (
										<TableRow
											key={row.row}
											className={row.isValid ? '' : 'bg-red-50 dark:bg-red-900/10'}
										>
											<TableCell className="text-xs font-mono">{row.row}</TableCell>
											<TableCell>
												{row.isValid ? (
													<Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Valid</Badge>
												) : (
													<Badge variant="destructive">Error</Badge>
												)}
											</TableCell>
											<TableCell className="text-xs font-mono">{row.institution_code || '-'}</TableCell>
											<TableCell className="text-xs font-medium">{row.register_no || '-'}</TableCell>
											<TableCell className="text-xs font-mono">{row.course_code || '-'}</TableCell>
											<TableCell className="text-xs max-w-[200px] truncate">
												{marksSummary.length > 0 ? marksSummary.join(', ') : '-'}
											</TableCell>
											<TableCell className="text-xs text-center">{row.max_internal_marks}</TableCell>
											<TableCell className="text-red-600 text-xs max-w-[200px]">
												{row.errors.join(', ')}
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</div>

					<div className="grid grid-cols-3 gap-3 mt-4">
						<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
							<div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Total Rows</div>
							<div className="text-xl font-bold text-blue-700 dark:text-blue-300">{importPreviewData.length}</div>
						</div>
						<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
							<div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Valid</div>
							<div className="text-xl font-bold text-green-700 dark:text-green-300">
								{importPreviewData.filter(r => r.isValid).length}
							</div>
						</div>
						<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
							<div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Invalid</div>
							<div className="text-xl font-bold text-red-700 dark:text-red-300">
								{importPreviewData.filter(r => !r.isValid).length}
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleUploadMarks}
							disabled={
								importPreviewData.filter(r => r.isValid).length === 0 ||
								loading
							}
						>
							{loading ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Importing...
								</>
							) : (
								<>
									<Upload className="h-4 w-4 mr-2" />
									Import {importPreviewData.filter(r => r.isValid).length} Records
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Error Dialog */}
			<AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
				<AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
					<AlertDialogHeader className="flex-shrink-0">
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
								<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
							</div>
							<div>
								<AlertDialogTitle className="text-xl font-bold text-red-600 dark:text-red-400">
									Upload Errors
								</AlertDialogTitle>
								<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
									Some records failed during upload
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>

					<div className="flex-1 overflow-y-auto space-y-4 py-2">
						{/* Upload Summary Cards */}
						{uploadSummary.total > 0 && (
							<div className="grid grid-cols-4 gap-3">
								<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
									<div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Total</div>
									<div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{uploadSummary.total}</div>
								</div>
								<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
									<div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Success</div>
									<div className="text-2xl font-bold text-green-700 dark:text-green-300">{uploadSummary.success}</div>
								</div>
								<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
									<div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Failed</div>
									<div className="text-2xl font-bold text-red-700 dark:text-red-300">{uploadSummary.failed}</div>
								</div>
								<div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
									<div className="text-xs text-yellow-600 dark:text-yellow-400 font-medium mb-1">Skipped</div>
									<div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{uploadSummary.skipped}</div>
								</div>
							</div>
						)}

						{/* Error List */}
						<div className="border rounded-lg p-4 bg-muted/30 max-h-[200px] overflow-y-auto">
							<div className="space-y-2">
								{uploadErrors.slice(0, 50).map((error, index) => (
									<div key={index} className="p-3 bg-background border border-red-200 rounded-md">
										<div className="flex items-start gap-2">
											<Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
												Row {error.row}
											</Badge>
											<span className="text-xs text-muted-foreground">
												{error.register_no} | {error.course_code}
											</span>
										</div>
										<div className="mt-2 space-y-1">
											{(error.errors || [error.error]).map((err: string, i: number) => (
												<div key={i} className="flex items-start gap-2 text-sm">
													<XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
													<span className="text-red-700 dark:text-red-300">{err}</span>
												</div>
											))}
										</div>
									</div>
								))}
								{uploadErrors.length > 50 && (
									<div className="text-center text-sm text-muted-foreground py-2">
										... and {uploadErrors.length - 50} more errors. Download failed rows for full list.
									</div>
								)}
							</div>
						</div>

						{/* Help Tips */}
						<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
							<div className="flex items-start gap-2">
								<AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
								<div>
									<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Common Fixes:</h4>
									<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-0.5">
										<li>• Ensure register numbers match existing students in exam registrations</li>
										<li>• Verify course codes exist in the system</li>
										<li>• At least one marks type must be provided per row</li>
										<li>• Download the template for proper column format</li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					<AlertDialogFooter className="flex-shrink-0 flex-row gap-2 pt-4 border-t">
						{/* Download Failed/Skipped Rows Button */}
						{failedRowsData.length > 0 && (
							<Button
								variant="outline"
								size="sm"
								onClick={handleDownloadFailedRows}
								className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-300 dark:border-red-800"
							>
								<Download className="h-4 w-4 mr-2" />
								Download Error Report ({failedRowsData.length})
							</Button>
						)}
						<div className="flex-1" />
						<AlertDialogAction
							onClick={() => setErrorDialogOpen(false)}
							className="bg-slate-900 hover:bg-slate-800 text-white px-6"
						>
							Close
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Upload Confirmation Dialog */}
			<AlertDialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
				<AlertDialogContent className="max-w-md">
					<AlertDialogHeader>
						<div className="flex items-center gap-3">
							<div className={`h-12 w-12 rounded-full flex items-center justify-center ${
								uploadSummary.failed === 0
									? 'bg-green-100 dark:bg-green-900/20'
									: uploadSummary.success > 0
										? 'bg-yellow-100 dark:bg-yellow-900/20'
										: 'bg-red-100 dark:bg-red-900/20'
							}`}>
								{uploadSummary.failed === 0 ? (
									<CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
								) : uploadSummary.success > 0 ? (
									<AlertTriangle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
								) : (
									<XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
								)}
							</div>
							<div>
								<AlertDialogTitle className={`text-xl font-bold ${
									uploadSummary.failed === 0
										? 'text-green-600 dark:text-green-400'
										: uploadSummary.success > 0
											? 'text-yellow-600 dark:text-yellow-400'
											: 'text-red-600 dark:text-red-400'
								}`}>
									{uploadSummary.failed === 0
										? 'Upload Successful'
										: uploadSummary.success > 0
											? 'Partial Upload'
											: 'Upload Failed'}
								</AlertDialogTitle>
								<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
									{uploadSummary.failed === 0
										? 'All records have been uploaded successfully'
										: uploadSummary.success > 0
											? 'Some records failed during upload'
											: 'All records failed during upload'}
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>

					{/* Summary Cards */}
					<div className="grid grid-cols-2 gap-3 py-4">
						<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
							<div className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">Total Records</div>
							<div className="text-3xl font-bold text-blue-700 dark:text-blue-300">{uploadSummary.total}</div>
						</div>
						<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
							<div className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">Successful</div>
							<div className="text-3xl font-bold text-green-700 dark:text-green-300">{uploadSummary.success}</div>
						</div>
						<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
							<div className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Failed</div>
							<div className="text-3xl font-bold text-red-700 dark:text-red-300">{uploadSummary.failed}</div>
						</div>
						<div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
							<div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium mb-1">Skipped</div>
							<div className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">{uploadSummary.skipped}</div>
						</div>
					</div>

					<AlertDialogFooter className="flex-row gap-2">
						{uploadSummary.failed > 0 && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setConfirmationDialogOpen(false)
									setErrorDialogOpen(true)
								}}
								className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-300 dark:border-red-800"
							>
								<XCircle className="h-4 w-4 mr-2" />
								View Errors
							</Button>
						)}
						<div className="flex-1" />
						<AlertDialogAction
							onClick={() => setConfirmationDialogOpen(false)}
							className="bg-slate-900 hover:bg-slate-800 text-white px-6"
						>
							Close
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
