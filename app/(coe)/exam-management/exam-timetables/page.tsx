"use client"

import React, { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Calendar, TrendingUp, CheckCircle, XCircle, FileSpreadsheet, Upload, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, DoorOpen, Users, MapPin, Download, Loader2, MoreHorizontal } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useSessionSync } from "@/hooks/use-session-sync"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { DateRange } from "react-day-picker"

interface ExamTimetable {
	id: string
	institutions_id: string
	examination_session_id: string
	course_id?: string
	course_offering_id?: string
	course_code?: string
	exam_date: string
	session: string
	exam_mode: string
	is_published: boolean
	instructions?: string
	created_at: string
	duration_minutes?: number
	// Joined data
	institution_code?: string
	institution_name?: string
	session_code?: string
	session_name?: string
	course_name?: string
	program_code?: string
	program_name?: string
	student_count?: number
	seat_alloc_count?: number
	exam_type?: string
	batch_capacity?: number | null
}

interface CourseDetail {
	exam_timetable_id: string
	course_code: string
	course_name: string
	program_code: string
	program_name: string
	student_count: number
}

interface ExamRoom {
	id: string
	room_code: string
	room_name: string
	building?: string
	floor?: string
	room_order: number
	seating_capacity: number
	exam_capacity: number
	rows: number
	columns: number
}

interface RoomAllocation {
	room: ExamRoom
	column_start: string
	student_count: number
}

export default function ExamTimetablesListPage() {
	const router = useRouter()
	const { toast } = useToast()

	// Institution filter hook
	const {
		filter,
		isReady,
		appendToUrl,
		mustSelectInstitution,
		shouldFilter,
		institutionId
	} = useInstitutionFilter()

	const [items, setItems] = useState<ExamTimetable[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>("exam_date")
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [deleteTarget, setDeleteTarget] = useState<ExamTimetable | null>(null)

	const [statusFilter, setStatusFilter] = useState("all")
	const [sessionFilter, setSessionFilter] = useState("all")
	const [modeFilter, setModeFilter] = useState("all")
	const [examTypeFilter, setExamTypeFilter] = useState("all")
	const { selectedSessionId: syncedSessionId, mustSelectSession } = useSessionSync()
	const [examSessionFilter, setExamSessionFilter] = useState("") // Will be set to latest session after fetch

	// Date range filter - default "upcoming" to show upcoming exams
	const [dateRangePreset, setDateRangePreset] = useState("upcoming") // upcoming, today, this_week, this_month, custom, all
	const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined)

	// Reference data for filters and template
	const [examinationSessions, setExaminationSessions] = useState<Array<{id: string, session_code: string, session_name: string}>>([])
	const [institutions, setInstitutions] = useState<Array<{id: string, institution_code: string, name: string}>>([])
	const [courses, setCourses] = useState<Array<{id: string, course_code: string, course_name: string}>>([])

	// Fetch reference data for filters and template
	const fetchReferenceData = async () => {
		try {
			// Fetch all reference data in parallel (independent requests)
			const [sessionsRes, instRes, coursesRes] = await Promise.all([
				fetch('/api/exam-management/examination-sessions'),
				fetch('/api/master/institutions'),
				fetch('/api/master/courses'),
			])

			if (sessionsRes.ok) {
				const sessionsData = await sessionsRes.json()
				setExaminationSessions(sessionsData || [])

				// Auto-select: global session takes priority, otherwise use latest session
				if (syncedSessionId) {
					setExamSessionFilter(syncedSessionId)
				} else if (sessionsData && sessionsData.length > 0 && !examSessionFilter) {
					setExamSessionFilter(sessionsData[0].id)
				}
			}

			if (instRes.ok) {
				const instData = await instRes.json()
				setInstitutions(instData || [])
			}

			if (coursesRes.ok) {
				const coursesData = await coursesRes.json()
				setCourses(coursesData || [])
			}
		} catch (error) {
			console.error('Error fetching reference data:', error)
		}
	}

	// Sync examSessionFilter from global session selector
	useEffect(() => {
		if (syncedSessionId) {
			setExamSessionFilter(syncedSessionId)
		}
	}, [syncedSessionId])

	// Upload state
	const [uploadSummary, setUploadSummary] = useState<{
		total: number
		success: number
		failed: number
	}>({ total: 0, success: 0, failed: 0 })

	const [uploadErrors, setUploadErrors] = useState<Array<{
		row: number
		course_code: string
		exam_date: string
		errors: string[]
		// Store original row data for failed download
		originalRow?: Record<string, any>
	}>>([])

	const [showErrorDialog, setShowErrorDialog] = useState(false)

	// Import progress tracking state
	const [importInProgress, setImportInProgress] = useState(false)
	const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })

	// Hall allocation state
	const [showHallAllocation, setShowHallAllocation] = useState(false)
	const [selectedTimetable, setSelectedTimetable] = useState<ExamTimetable | null>(null)
	const [availableRooms, setAvailableRooms] = useState<ExamRoom[]>([])
	const [roomAllocations, setRoomAllocations] = useState<RoomAllocation[]>([])
	const [allocating, setAllocating] = useState(false)

	// Edit dialog state
	const [showEditDialog, setShowEditDialog] = useState(false)
	const [editTarget, setEditTarget] = useState<ExamTimetable | null>(null)
	const [editForm, setEditForm] = useState({
		exam_date: '',
		session: 'FN',
		exam_mode: 'Offline',
		exam_type: 'Theory',
		batch_capacity: '' as string | number,
		is_published: false,
		instructions: '',
	})
	const [editSaving, setEditSaving] = useState(false)

	// Expanded row state for course details
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
	const [courseDetails, setCourseDetails] = useState<Map<string, CourseDetail[]>>(new Map())

	// Fetch exam timetables with institution filter + session filter
	const fetchExamTimetables = async (sessionId?: string) => {
		try {
			setLoading(true)
			let url = appendToUrl('/api/exam-management/exam-timetables')
			// Pass examination_session_id for server-side filtering
			const activeSession = sessionId || examSessionFilter
			if (activeSession && activeSession !== 'all') {
				const separator = url.includes('?') ? '&' : '?'
				url += `${separator}examination_session_id=${activeSession}`
			}
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch exam timetables')
			}
			let data = await response.json()

			// Client-side filter for safety
			if (shouldFilter && institutionId) {
				data = data.filter((item: any) => item.institutions_id === institutionId)
			}

			// API route already returns flattened data with course_code, course_name, etc.
			// Just use the data directly
			setItems(data)
		} catch (error) {
			console.error('Error fetching exam timetables:', error)
			setItems([])
			toast({
				title: "❌ Error",
				description: "Failed to load exam timetables",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}

	// Fetch reference data on mount
	useEffect(() => {
		if (!isReady) return
		fetchReferenceData()
	}, [isReady, filter])

	// Re-fetch timetables when session filter changes
	useEffect(() => {
		if (!isReady || !examSessionFilter) return
		fetchExamTimetables()
	}, [isReady, filter, examSessionFilter])

	// Delete handler
	const remove = async (id: string) => {
		try {
			setLoading(true)
			const itemName = items.find(i => i.id === id)?.course_name || 'Exam Timetable'

			const response = await fetch(`/api/exam-management/exam-timetables?id=${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to delete exam timetable')
			}

			setItems((prev) => prev.filter((p) => p.id !== id))

			toast({
				title: "✅ Exam Timetable Deleted",
				description: `${itemName} has been successfully deleted.`,
				className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
			})
		} catch (error) {
			console.error('Error deleting exam timetable:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete exam timetable. Please try again.'
			toast({
				title: "❌ Delete Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	// Open edit dialog with pre-filled data
	const openEdit = (item: ExamTimetable) => {
		setEditTarget(item)
		setEditForm({
			exam_date: item.exam_date || '',
			session: item.session || 'FN',
			exam_mode: item.exam_mode || 'Offline',
			exam_type: item.exam_type || 'Theory',
			batch_capacity: item.batch_capacity ?? '',
			is_published: item.is_published ?? false,
			instructions: item.instructions || '',
		})
		setShowEditDialog(true)
	}

	// Save edit
	const saveEdit = async () => {
		if (!editTarget) return
		setEditSaving(true)
		try {
			const response = await fetch('/api/exam-management/exam-timetables', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: editTarget.id,
					course_id: editTarget.course_id,
					course_offering_id: editTarget.course_offering_id,
					course_code: editTarget.course_code,
					duration_minutes: editTarget.duration_minutes,
					exam_date: editForm.exam_date,
					session: editForm.session,
					exam_mode: editForm.exam_mode,
					exam_type: editForm.exam_type,
					batch_capacity: editForm.exam_type === 'Practical' ? (Number(editForm.batch_capacity) || null) : null,
					is_published: editForm.is_published,
					instructions: editForm.instructions || null,
				}),
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to update')
			}

			toast({
				title: '✅ Timetable Updated',
				description: `${editTarget.course_code} on ${editForm.exam_date} has been updated.`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			setShowEditDialog(false)
			setEditTarget(null)
			fetchExamTimetables()
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Failed to update'
			toast({
				title: '❌ Update Failed',
				description: msg,
				variant: 'destructive',
			})
		} finally {
			setEditSaving(false)
		}
	}

	// Get date boundaries for filtering
	const dateBoundaries = useMemo(() => {
		const now = new Date()
		const today = now.toISOString().split('T')[0]

		// This week (Monday to Sunday)
		const dayOfWeek = now.getDay()
		const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
		const weekStart = new Date(now)
		weekStart.setDate(now.getDate() + mondayOffset)
		const weekEnd = new Date(weekStart)
		weekEnd.setDate(weekStart.getDate() + 6)

		// This month
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
		const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

		return {
			today,
			weekStart: weekStart.toISOString().split('T')[0],
			weekEnd: weekEnd.toISOString().split('T')[0],
			monthStart: monthStart.toISOString().split('T')[0],
			monthEnd: monthEnd.toISOString().split('T')[0],
		}
	}, [])

	// Get date range based on preset
	const getDateRange = useMemo(() => {
		switch (dateRangePreset) {
			case "today":
				return { from: dateBoundaries.today, to: dateBoundaries.today }
			case "this_week":
				return { from: dateBoundaries.weekStart, to: dateBoundaries.weekEnd }
			case "this_month":
				return { from: dateBoundaries.monthStart, to: dateBoundaries.monthEnd }
			case "custom":
				return {
					from: customDateRange?.from ? customDateRange.from.toISOString().split('T')[0] : "",
					to: customDateRange?.to ? customDateRange.to.toISOString().split('T')[0] : ""
				}
			case "upcoming":
				return { from: dateBoundaries.today, to: "" } // From today onwards
			case "all":
			default:
				return { from: "", to: "" }
		}
	}, [dateRangePreset, dateBoundaries, customDateRange])

	// Filter, sort, and paginate
	const filtered = useMemo(() => {
		const q = searchTerm.toLowerCase()
		const { from: dateFrom, to: dateTo } = getDateRange

		const data = items
			.filter((i) =>
				[i.course_code, i.course_name, i.session_name, i.institution_name, i.program_name]
					.filter(Boolean)
					.some((v) => String(v).toLowerCase().includes(q))
			)
			.filter((i) => statusFilter === "all" || (statusFilter === "published" ? i.is_published : !i.is_published))
			.filter((i) => sessionFilter === "all" || i.session === sessionFilter)
			.filter((i) => modeFilter === "all" || i.exam_mode?.toLowerCase() === modeFilter.toLowerCase())
			.filter((i) => examTypeFilter === "all" || (i.exam_type || 'Theory') === examTypeFilter)
			.filter((i) => !examSessionFilter || examSessionFilter === "all" || i.examination_session_id === examSessionFilter)
			// Date range filter
			.filter((i) => {
				if (!dateFrom && !dateTo) return true // No date filter (all)
				if (dateFrom && !dateTo) return i.exam_date >= dateFrom // From date onwards
				if (!dateFrom && dateTo) return i.exam_date <= dateTo // Up to date
				return i.exam_date >= dateFrom && i.exam_date <= dateTo // Between dates
			})

		if (!sortColumn) return data
		const sorted = [...data].sort((a, b) => {
			const av = (a as any)[sortColumn]
			const bv = (b as any)[sortColumn]
			if (av === bv) return 0
			if (sortDirection === "asc") return av > bv ? 1 : -1
			return av < bv ? 1 : -1
		})
		return sorted
	}, [items, searchTerm, sortColumn, sortDirection, statusFilter, sessionFilter, modeFilter, examTypeFilter, examSessionFilter, getDateRange])

	const pageSizeOptions = useMemo(() => [10, 20, 50, 100], [])
	const isShowAll = itemsPerPage === -1
	const effectivePerPage = isShowAll ? filtered.length : itemsPerPage
	const totalPages = isShowAll ? 1 : Math.ceil(filtered.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = isShowAll ? filtered.length : startIndex + effectivePerPage
	const paginatedItems = filtered.slice(startIndex, endIndex)

	useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, dateRangePreset, customDateRange, examSessionFilter])

	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc")
		} else {
			setSortColumn(column)
			setSortDirection("asc")
		}
	}

	const getSortIcon = (column: string) => {
		if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-4 w-4" />
		return sortDirection === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-GB', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		})
	}

	// Template Export with dropdown validations
	const handleTemplateExport = async () => {
		const wb = XLSX.utils.book_new()

		// Sheet 1: Template with empty row for user to fill
		const sample = [{
			'Institution Code *': '',
			'Examination Session Code *': '',
			'Course Code *': '',
			'Exam Date *': '',
			'Session (FN/AN) *': '',
			'Exam Mode': 'Offline',
			'Exam Type': 'Theory',
			'Batch Capacity': '',
			'Is Published': 'No',
			'Instructions': ''
		}]

		const ws = XLSX.utils.json_to_sheet(sample)

		// Set column widths
		const colWidths = [
			{ wch: 20 }, // Institution Code
			{ wch: 28 }, // Examination Session Code
			{ wch: 20 }, // Course Code
			{ wch: 15 }, // Exam Date
			{ wch: 18 }, // Session
			{ wch: 14 }, // Exam Mode
			{ wch: 14 }, // Exam Type
			{ wch: 16 }, // Batch Capacity
			{ wch: 14 }, // Is Published
			{ wch: 35 }  // Instructions
		]
		ws['!cols'] = colWidths

		// Add data validations (dropdown lists + conditional formatting)
		const validations: any[] = []

		// Column A: Institution Code dropdown
		// For normal users, only show their institution
		const instCodes = shouldFilter && institutionId
			? institutions.filter(i => i.id === institutionId).map(i => i.institution_code)
			: institutions.map(i => i.institution_code).filter(Boolean)
		if (instCodes.length > 0) {
			validations.push({
				type: 'list',
				sqref: 'A2:A1000',
				formula1: `"${instCodes.join(',')}"`,
				showDropDown: true,
				showErrorMessage: true,
				errorTitle: 'Invalid Institution',
				error: 'Please select from the dropdown list',
			})
		}

		// Column B: Examination Session Code dropdown
		const examSessionCodes = examinationSessions.map(s => s.session_code).filter(Boolean)
		if (examSessionCodes.length > 0) {
			validations.push({
				type: 'list',
				sqref: 'B2:B1000',
				formula1: `"${examSessionCodes.join(',')}"`,
				showDropDown: true,
				showErrorMessage: true,
				errorTitle: 'Invalid Session Code',
				error: 'Please select from the dropdown list',
			})
		}

		// Column C: Course Code dropdown
		const courseCodes = courses.map(c => c.course_code).filter(Boolean)
		if (courseCodes.length > 0) {
			validations.push({
				type: 'list',
				sqref: 'C2:C1000',
				formula1: `"${courseCodes.join(',')}"`,
				showDropDown: true,
				showErrorMessage: true,
				errorTitle: 'Invalid Course Code',
				error: 'Please select from the dropdown list',
			})
		}

		// Column E: Session (FN/AN) dropdown
		validations.push({
			type: 'list',
			sqref: 'E2:E1000',
			formula1: '"FN,AN"',
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Session',
			error: 'Select: FN or AN',
		})

		// Column F: Exam Mode dropdown
		validations.push({
			type: 'list',
			sqref: 'F2:F1000',
			formula1: '"Offline,Online"',
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Exam Mode',
			error: 'Select: Offline or Online',
		})

		// Column G: Exam Type dropdown
		validations.push({
			type: 'list',
			sqref: 'G2:G1000',
			formula1: '"Theory,Practical"',
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Exam Type',
			error: 'Select: Theory or Practical',
		})

		// Column I: Is Published dropdown
		validations.push({
			type: 'list',
			sqref: 'I2:I1000',
			formula1: '"Yes,No"',
			showDropDown: true,
			showErrorMessage: true,
			errorTitle: 'Invalid Value',
			error: 'Select: Yes or No',
		})

		// Attach validations to worksheet
		ws['!dataValidation'] = validations

		XLSX.utils.book_append_sheet(wb, ws, 'Template')

		// Sheet 2: Reference Codes (for user documentation)
		const referenceData: any[] = []

		// Institution codes section
		referenceData.push({ 'Type': '═══ INSTITUTION CODES ═══', 'Code': '', 'Name/Description': '' })
		institutions.forEach(inst => {
			referenceData.push({
				'Type': 'Institution',
				'Code': inst.institution_code,
				'Name/Description': inst.name || 'N/A'
			})
		})

		// Examination session codes section
		referenceData.push({ 'Type': '═══ EXAMINATION SESSION CODES ═══', 'Code': '', 'Name/Description': '' })
		examinationSessions.forEach(session => {
			referenceData.push({
				'Type': 'Exam Session',
				'Code': session.session_code,
				'Name/Description': session.session_name || 'N/A'
			})
		})

		// Course codes section
		referenceData.push({ 'Type': '═══ COURSE CODES ═══', 'Code': '', 'Name/Description': '' })
		courses.forEach(course => {
			referenceData.push({
				'Type': 'Course',
				'Code': course.course_code,
				'Name/Description': course.course_name || 'N/A'
			})
		})

		// Session values section
		referenceData.push({ 'Type': '═══ SESSION VALUES ═══', 'Code': '', 'Name/Description': '' })
		referenceData.push({ 'Type': 'Session', 'Code': 'FN', 'Name/Description': 'Forenoon (10:00 AM - 1:00 PM)' })
		referenceData.push({ 'Type': 'Session', 'Code': 'AN', 'Name/Description': 'Afternoon (2:00 PM - 5:00 PM)' })

		// Exam mode values section
		referenceData.push({ 'Type': '═══ EXAM MODE VALUES ═══', 'Code': '', 'Name/Description': '' })
		referenceData.push({ 'Type': 'Exam Mode', 'Code': 'Offline', 'Name/Description': 'Traditional paper-based examination' })
		referenceData.push({ 'Type': 'Exam Mode', 'Code': 'Online', 'Name/Description': 'Computer-based online examination' })

		// Exam type values section
		referenceData.push({ 'Type': '═══ EXAM TYPE VALUES ═══', 'Code': '', 'Name/Description': '' })
		referenceData.push({ 'Type': 'Exam Type', 'Code': 'Theory', 'Name/Description': 'Theory (written) examination' })
		referenceData.push({ 'Type': 'Exam Type', 'Code': 'Practical', 'Name/Description': 'Practical examination (requires Batch Capacity)' })

		// Is Published values section
		referenceData.push({ 'Type': '═══ PUBLISHED STATUS ═══', 'Code': '', 'Name/Description': '' })
		referenceData.push({ 'Type': 'Published', 'Code': 'Yes', 'Name/Description': 'Timetable is visible to students' })
		referenceData.push({ 'Type': 'Published', 'Code': 'No', 'Name/Description': 'Timetable is in draft mode' })

		const wsRef = XLSX.utils.json_to_sheet(referenceData)
		wsRef['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 50 }]
		XLSX.utils.book_append_sheet(wb, wsRef, 'Reference Codes')

		// Sheet 3: Instructions
		const instructionsData = [
			{ 'Field': 'Institution Code *', 'Format': 'Select from dropdown', 'Example': institutions[0]?.institution_code || 'JKKN001', 'Required': 'Yes' },
			{ 'Field': 'Examination Session Code *', 'Format': 'Select from dropdown', 'Example': examinationSessions[0]?.session_code || 'APR2025', 'Required': 'Yes' },
			{ 'Field': 'Course Code *', 'Format': 'Select from dropdown', 'Example': courses[0]?.course_code || '23BCA101', 'Required': 'Yes' },
			{ 'Field': 'Exam Date *', 'Format': 'YYYY-MM-DD', 'Example': '2025-04-15', 'Required': 'Yes' },
			{ 'Field': 'Session (FN/AN) *', 'Format': 'FN or AN', 'Example': 'FN', 'Required': 'Yes' },
			{ 'Field': 'Exam Mode', 'Format': 'Offline or Online', 'Example': 'Offline', 'Required': 'No (default: Offline)' },
			{ 'Field': 'Exam Type', 'Format': 'Theory or Practical', 'Example': 'Theory', 'Required': 'No (default: Theory)' },
			{ 'Field': 'Batch Capacity', 'Format': 'Number', 'Example': '30', 'Required': 'Yes when Exam Type is Practical' },
			{ 'Field': 'Is Published', 'Format': 'Yes or No', 'Example': 'No', 'Required': 'No (default: No)' },
			{ 'Field': 'Instructions', 'Format': 'Free text', 'Example': 'Calculators allowed', 'Required': 'No' }
		]

		const wsInstructions = XLSX.utils.json_to_sheet(instructionsData)
		wsInstructions['!cols'] = [{ wch: 28 }, { wch: 25 }, { wch: 35 }, { wch: 25 }]
		XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

		// IMPORTANT: await is required - XLSX.writeFile is async (ExcelJS)
		await XLSX.writeFile(wb, `exam_timetable_template_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: "✅ Template Downloaded",
			description: "Template file with dropdown validations and reference sheets has been downloaded.",
			className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
		})
	}

	// Export current filtered data to Excel
	const handleDataExport = async () => {
		if (filtered.length === 0) {
			toast({
				title: "❌ No Data",
				description: "No exam timetables to export. Apply different filters or add data first.",
				variant: "destructive",
			})
			return
		}

		const wb = XLSX.utils.book_new()

		// Map data for export
		const exportData = filtered.map((item, index) => ({
			'S.No': index + 1,
			'Institution Code': item.institution_code || 'N/A',
			'Session Code': item.session_code || 'N/A',
			'Session Name': item.session_name || 'N/A',
			'Course Code': item.course_code || 'N/A',
			'Course Name': item.course_name || 'N/A',
			'Program Code': item.program_code || 'N/A',
			'Exam Date': item.exam_date || '',
			'Session (FN/AN)': item.session || '',
			'Exam Mode': item.exam_mode || 'Offline',
			'Status': item.is_published ? 'Published' : 'Draft',
			'Learners': item.student_count || 0,
			'Seats Allocated': item.seat_alloc_count || 0,
			'Instructions': item.instructions || ''
		}))

		const ws = XLSX.utils.json_to_sheet(exportData)

		// Set column widths
		ws['!cols'] = [
			{ wch: 6 },   // S.No
			{ wch: 18 },  // Institution Code
			{ wch: 18 },  // Session Code
			{ wch: 30 },  // Session Name
			{ wch: 15 },  // Course Code
			{ wch: 35 },  // Course Name
			{ wch: 15 },  // Program Code
			{ wch: 12 },  // Exam Date
			{ wch: 14 },  // Session
			{ wch: 12 },  // Exam Mode
			{ wch: 10 },  // Status
			{ wch: 10 },  // Learners
			{ wch: 15 },  // Seats Allocated
			{ wch: 40 }   // Instructions
		]

		XLSX.utils.book_append_sheet(wb, ws, 'Exam Timetables')

		// Generate filename with date and session filter
		const sessionName = examSessionFilter !== 'all'
			? examinationSessions.find(s => s.id === examSessionFilter)?.session_code || ''
			: 'all'
		const filename = `exam_timetables_${sessionName}_${new Date().toISOString().split('T')[0]}.xlsx`

		await XLSX.writeFile(wb, filename)

		toast({
			title: "✅ Data Exported",
			description: `${filtered.length} exam timetable(s) exported successfully.`,
			className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
		})
	}

	// Import/Upload from Excel
	const handleImport = () => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.xlsx,.xls,.csv'
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0]
			if (!file) return

			try {
				setLoading(true)
				setImportInProgress(true)
				setImportProgress({ current: 0, total: 0 })
				let rows: any[] = []

				if (file.name.endsWith('.csv')) {
					const text = await file.text()
					const lines = text.split('\n').filter(line => line.trim())
					if (lines.length < 2) {
						toast({
							title: "❌ Invalid CSV File",
							description: "CSV file must have at least a header row and one data row",
							variant: "destructive",
						})
						setLoading(false)
						return
					}

					const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
					const dataRows = lines.slice(1).map(line => {
						const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
						const row: Record<string, string> = {}
						headers.forEach((header, index) => {
							row[header] = values[index] || ''
						})
						return row
					})

					rows = dataRows
				} else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
					const data = await file.arrayBuffer()
					const wb = await XLSX.read(data)

					if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
						toast({
							title: "❌ Invalid File",
							description: "The Excel file appears to be empty or corrupted.",
							variant: "destructive",
						})
						setLoading(false)
						return
					}

					const ws = wb.Sheets[wb.SheetNames[0]]
					if (!ws) {
						toast({
							title: "❌ Invalid File",
							description: "Could not read the worksheet from the Excel file.",
							variant: "destructive",
						})
						setLoading(false)
						return
					}

					rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
				}

				if (rows.length === 0) {
					toast({
						title: "❌ No Data Found",
						description: "The file contains no data rows.",
						variant: "destructive",
					})
					setLoading(false)
					return
				}

				// Process upload
				await processUpload(rows)
			} catch (err) {
				console.error('Import error:', err)
				toast({
					title: "❌ Import Error",
					description: "Import failed. Please check your file format and try again.",
					variant: "destructive",
				})
				setLoading(false)
				setImportInProgress(false)
			}
		}
		input.click()
	}

	// Process Upload - Validate and Save
	const processUpload = async (rows: any[]) => {
		let successCount = 0
		let errorCount = 0
		const uploadErrorsList: Array<{
			row: number
			course_code: string
			exam_date: string
			errors: string[]
			originalRow?: Record<string, any>
		}> = []

		// Set import progress total
		setImportProgress({ current: 0, total: rows.length })

		// Get allowed institution code for normal users
		const userInstitution = shouldFilter && institutionId
			? institutions.find(i => i.id === institutionId)
			: null

		// Build lookup Maps from already-loaded state to avoid per-row API calls
		const institutionMap = new Map(institutions.map(i => [i.institution_code, i]))

		// Pre-fetch sessions once if not already loaded
		let sessionsForLookup = examinationSessions
		if (sessionsForLookup.length === 0) {
			try {
				const sessionsRes = await fetch('/api/exam-management/examination-sessions')
				if (sessionsRes.ok) {
					sessionsForLookup = await sessionsRes.json()
				}
			} catch (e) {
				console.error('Failed to pre-fetch sessions for upload:', e)
			}
		}
		const sessionMap = new Map(sessionsForLookup.map((s: any) => [s.session_code, s]))

		for (let i = 0; i < rows.length; i++) {
			// Update progress
			setImportProgress({ current: i + 1, total: rows.length })

			const row = rows[i]
			const rowNumber = i + 2 // +2 for header row in Excel
			const validationErrors: string[] = []

			// Extract fields - support both old headers and new headers with * suffix
			const institution_code = String(row['Institution Code *'] || row['Institution Code'] || row.institution_code || '').trim()
			const examination_session_code = String(row['Examination Session Code *'] || row['Examination Session Code'] || row.examination_session_code || '').trim()
			const course_code = String(row['Course Code *'] || row['Course Code'] || row.course_code || '').trim()

			// Handle date - Excel may return Date object or string
			const rawExamDate = row['Exam Date *'] || row['Exam Date'] || row.exam_date || ''
			let exam_date = ''
			if (rawExamDate instanceof Date) {
				// Convert Date object to YYYY-MM-DD
				exam_date = rawExamDate.toISOString().split('T')[0]
			} else if (typeof rawExamDate === 'number') {
				// Excel serial date number - convert to Date then to string
				const excelEpoch = new Date(1899, 11, 30) // Excel epoch is Dec 30, 1899
				const dateObj = new Date(excelEpoch.getTime() + rawExamDate * 86400000)
				exam_date = dateObj.toISOString().split('T')[0]
			} else {
				exam_date = String(rawExamDate).trim()
			}

			const session = String(row['Session (FN/AN) *'] || row['Session (FN/AN)'] || row['Session'] || row.session || '').trim()
			const exam_mode = String(row['Exam Mode'] || row.exam_mode || 'Offline').trim()
			const exam_type = String(row['Exam Type'] || row.exam_type || 'Theory').trim()
			const batch_capacity_raw = row['Batch Capacity'] || row.batch_capacity || null
			const batch_capacity = batch_capacity_raw ? parseInt(String(batch_capacity_raw)) : null
			const is_published = String(row['Is Published'] || row.is_published || 'No').toLowerCase() === 'yes'
			const instructions = String(row['Instructions'] || row.instructions || '').trim()

			// Validation
			if (!institution_code) validationErrors.push('Institution Code required')
			if (!examination_session_code) validationErrors.push('Examination Session Code required')
			if (!course_code) validationErrors.push('Course Code required')
			if (!exam_date) validationErrors.push('Exam Date required')
			if (!session) validationErrors.push('Session required')

			// Restrict normal users to upload only their own institution
			if (userInstitution && institution_code && institution_code !== userInstitution.institution_code) {
				validationErrors.push(`You can only upload data for your institution (${userInstitution.institution_code})`)
			}

			// Format validation
			if (session && !['FN', 'AN'].includes(session.toUpperCase())) {
				validationErrors.push('Session must be FN or AN')
			}

			if (exam_mode && !['Offline', 'Online'].includes(exam_mode)) {
				validationErrors.push('Exam Mode must be Offline or Online')
			}

			if (exam_type && !['Theory', 'Practical', 'Project', 'Field Work', 'Group Project'].includes(exam_type)) {
				validationErrors.push('Exam Type must be Theory, Practical, Project, Field Work, or Group Project')
			}

			if (['Practical', 'Project', 'Field Work', 'Group Project'].includes(exam_type) && (!batch_capacity || batch_capacity < 1)) {
				validationErrors.push('Batch Capacity is required and must be at least 1 for Practical/Project exams')
			}

			// Date format validation
			if (exam_date && !/^\d{4}-\d{2}-\d{2}$/.test(exam_date)) {
				validationErrors.push('Exam Date must be in YYYY-MM-DD format')
			}

			if (validationErrors.length > 0) {
				errorCount++
				uploadErrorsList.push({
					row: rowNumber,
					course_code: course_code || 'N/A',
					exam_date: exam_date || 'N/A',
					errors: validationErrors,
					originalRow: row
				})
				continue
			}

			// Look up institution_id from institution_code using pre-built Map
			try {
				const institution = institutionMap.get(institution_code)

				if (!institution) {
					errorCount++
					uploadErrorsList.push({
						row: rowNumber,
						course_code: course_code,
						exam_date: exam_date,
						errors: [`Institution with code "${institution_code}" not found`],
						originalRow: row
					})
					continue
				}

				// Look up examination_session_id from examination_session_code using pre-built Map
				const examSession = sessionMap.get(examination_session_code)

				if (!examSession) {
					errorCount++
					uploadErrorsList.push({
						row: rowNumber,
						course_code: course_code,
						exam_date: exam_date,
						errors: [`Examination session with code "${examination_session_code}" not found`],
						originalRow: row
					})
					continue
				}

				// Create payload - API will look up course_offering_id from course_code
				// duration_minutes will be auto-populated by the API from course's exam_duration (hours × 60)
				const payload = {
					institutions_id: institution.id,
					examination_session_id: examSession.id,
					course_code: course_code,
					exam_date: exam_date,
					session: session.toUpperCase(),
					exam_mode: exam_mode,
					is_published: is_published,
					exam_type: exam_type || 'Theory',
					batch_capacity: batch_capacity || null,
					instructions: instructions || null
				}

				// Save to API
				const response = await fetch('/api/exam-management/exam-timetables', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				})

				if (response.ok) {
					const saved = await response.json()
					setItems(prev => [saved, ...prev])
					successCount++
				} else {
					const errorData = await response.json()
					errorCount++
					uploadErrorsList.push({
						row: rowNumber,
						course_code: course_code,
						exam_date: exam_date,
						errors: [errorData.error || 'Failed to save'],
						originalRow: row
					})
				}
			} catch (error) {
				errorCount++
				uploadErrorsList.push({
					row: rowNumber,
					course_code: course_code,
					exam_date: exam_date,
					errors: [error instanceof Error ? error.message : 'Network error'],
					originalRow: row
				})
			}
		}

		setLoading(false)
		setImportInProgress(false)
		const totalRows = rows.length

		// Update upload summary
		setUploadSummary({
			total: totalRows,
			success: successCount,
			failed: errorCount
		})

		// Show error dialog if needed
		if (uploadErrorsList.length > 0) {
			setUploadErrors(uploadErrorsList)
			setShowErrorDialog(true)
		}

		// Refresh data
		if (successCount > 0) {
			fetchExamTimetables()
		}

		// Show appropriate toast message
		if (successCount > 0 && errorCount === 0) {
			toast({
				title: "✅ Upload Complete",
				description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} exam timetable${successCount > 1 ? 's' : ''}) to the database.`,
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				duration: 5000,
			})
		} else if (successCount > 0 && errorCount > 0) {
			toast({
				title: "⚠️ Partial Upload Success",
				description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: ${successCount} successful, ${errorCount} failed. View error details below.`,
				className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
				duration: 6000,
			})
		} else if (errorCount > 0) {
			toast({
				title: "❌ Upload Failed",
				description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: 0 successful, ${errorCount} failed. View error details below.`,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
				duration: 6000,
			})
		}
	}

	// Download failed rows as Excel file with error message column
	const handleDownloadFailedRows = async () => {
		if (uploadErrors.length === 0) return

		try {
			// Create workbook with failed rows data + error column
			const wb = XLSX.utils.book_new()

			// Build rows data in the same format as template with Error Message column
			const failedRowsData = uploadErrors.map(error => {
				const originalRow = error.originalRow || {}
				return {
					'Institution Code *': originalRow['Institution Code *'] || originalRow['Institution Code'] || originalRow.institution_code || '',
					'Examination Session Code *': originalRow['Examination Session Code *'] || originalRow['Examination Session Code'] || originalRow.examination_session_code || '',
					'Course Code *': originalRow['Course Code *'] || originalRow['Course Code'] || originalRow.course_code || error.course_code || '',
					'Exam Date *': originalRow['Exam Date *'] || originalRow['Exam Date'] || originalRow.exam_date || error.exam_date || '',
					'Session (FN/AN) *': originalRow['Session (FN/AN) *'] || originalRow['Session (FN/AN)'] || originalRow['Session'] || originalRow.session || '',
					'Exam Mode': originalRow['Exam Mode'] || originalRow.exam_mode || 'Offline',
					'Exam Type': originalRow['Exam Type'] || originalRow.exam_type || 'Theory',
					'Batch Capacity': originalRow['Batch Capacity'] || originalRow.batch_capacity || '',
					'Is Published': originalRow['Is Published'] || originalRow.is_published || 'No',
					'Instructions': originalRow['Instructions'] || originalRow.instructions || '',
					'Error Message': error.errors.join('; '),
					'Row #': error.row
				}
			})

			const ws = XLSX.utils.json_to_sheet(failedRowsData)

			// Set column widths
			ws['!cols'] = [
				{ wch: 20 },  // Institution Code
				{ wch: 25 },  // Examination Session Code
				{ wch: 20 },  // Course Code
				{ wch: 15 },  // Exam Date
				{ wch: 15 },  // Session
				{ wch: 12 },  // Exam Mode
				{ wch: 14 },  // Exam Type
				{ wch: 16 },  // Batch Capacity
				{ wch: 12 },  // Is Published
				{ wch: 30 },  // Instructions
				{ wch: 50 },  // Error Message
				{ wch: 8 },   // Row #
			]

			XLSX.utils.book_append_sheet(wb, ws, 'Failed Rows')

			// Download the file
			await XLSX.writeFile(wb, `exam_timetables_failed_rows_${new Date().toISOString().split('T')[0]}.xlsx`)

			toast({
				title: "✅ Download Complete",
				description: `Downloaded ${uploadErrors.length} failed row${uploadErrors.length > 1 ? 's' : ''} with error messages.`,
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
			})
		} catch (err) {
			console.error('Error downloading failed rows:', err)
			toast({
				title: "❌ Download Error",
				description: "Failed to download failed rows. Please try again.",
				variant: "destructive",
			})
		}
	}

	return (
		<SidebarProvider>
			{/* Import Loading Overlay */}
			{importInProgress && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
					<div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4">
						<div className="flex flex-col items-center gap-4">
							<div className="relative">
								<Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
							</div>
							<div className="text-center">
								<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
									Importing Exam Timetables
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
			<SidebarInset>
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4">
					{/* Breadcrumb */}
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link href="/">Home</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage>Exam Timetables</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Premium Stats Cards - Based on filtered data */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						<Card className="border-slate-200 shadow-sm rounded-2xl">
							<CardContent className="p-6">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm text-slate-600">Total Timetables</p>
										<p className="text-3xl font-bold text-slate-900 mt-1 font-grotesk">{filtered.length}</p>
									</div>
									<div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center ring-1 ring-blue-100">
										<Calendar className="h-6 w-6 text-blue-600" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card className="border-slate-200 shadow-sm rounded-2xl">
							<CardContent className="p-6">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm text-slate-600">Published</p>
										<p className="text-3xl font-bold text-emerald-600 mt-1 font-grotesk">{filtered.filter(i => i.is_published).length}</p>
									</div>
									<div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center ring-1 ring-emerald-100">
										<CheckCircle className="h-6 w-6 text-emerald-600" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card className="border-slate-200 shadow-sm rounded-2xl">
							<CardContent className="p-6">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm text-slate-600">Draft</p>
										<p className="text-3xl font-bold text-amber-600 mt-1 font-grotesk">{filtered.filter(i => !i.is_published).length}</p>
									</div>
									<div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center ring-1 ring-amber-100">
										<XCircle className="h-6 w-6 text-amber-600" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card className="border-slate-200 shadow-sm rounded-2xl">
							<CardContent className="p-6">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm text-slate-600">Upcoming</p>
										<p className="text-3xl font-bold text-purple-600 mt-1 font-grotesk">
											{filtered.filter(i => {
												const examDate = new Date(i.exam_date)
												const today = new Date()
												today.setHours(0, 0, 0, 0)
												return examDate >= today
											}).length}
										</p>
									</div>
									<div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center ring-1 ring-purple-100">
										<TrendingUp className="h-6 w-6 text-purple-600" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Main Content */}
					<Card className="flex-1 flex flex-col min-h-0 border-slate-200 shadow-sm rounded-2xl">
						<CardHeader className="flex-shrink-0 px-8 py-6 border-b border-slate-200">
							<div className="space-y-4">
								{/* Row 1: Title (Left) & Action Buttons (Right) - Same Line */}
								<div className="flex items-center justify-between">
									{/* Title Section - Left */}
									<div className="flex items-center gap-3">
										<div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center ring-1 ring-blue-100">
											<Calendar className="h-6 w-6 text-blue-600" />
										</div>
										<div>
											<h2 className="text-xl font-bold text-slate-900 font-grotesk">All Exam Timetables</h2>
											<p className="text-sm text-slate-600">Manage examination schedules and timetables</p>
										</div>
									</div>

									{/* Action Buttons - Right (Icon Only) */}
									<div className="flex items-center gap-2">
										<Button variant="outline" size="sm" onClick={fetchExamTimetables} disabled={loading} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors border border-slate-300 p-0" title="Refresh">
											<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
										</Button>
										<Button variant="outline" size="sm" onClick={handleTemplateExport} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors border border-slate-300 p-0" title="Download Template">
											<FileSpreadsheet className="h-4 w-4" />
										</Button>
										<Button variant="outline" size="sm" onClick={handleImport} disabled={loading} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors border border-slate-300 p-0" title="Import File">
											<Upload className="h-4 w-4" />
										</Button>
										<Button variant="outline" size="sm" onClick={handleDataExport} disabled={loading || filtered.length === 0} className="h-9 w-9 rounded-lg hover:bg-green-100 text-green-600 hover:text-green-700 transition-colors border border-green-300 p-0" title="Export Data">
											<Download className="h-4 w-4" />
										</Button>
										<Button size="sm" onClick={() => router.push('/exam-management/exam-timetable')} disabled={loading} className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" title="Add Timetable">
											<PlusCircle className="h-4 w-4 mr-2" />
											Add Timetable
										</Button>
									</div>
								</div>

								{/* Row 2: Filter and Search Row - Exam Session (1st), Date (2nd) */}
								<div className="flex items-center gap-2 flex-wrap">
									{/* 1. Exam Session Filter — hidden when global session selected */}
									{mustSelectSession && (
									<Select value={examSessionFilter} onValueChange={setExamSessionFilter}>
										<SelectTrigger className="h-9 rounded-lg border-slate-300 focus:border-blue-500 w-[180px]">
											<SelectValue placeholder="All Exam Sessions" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Exam Sessions</SelectItem>
											{examinationSessions.map((session) => (
												<SelectItem key={session.id} value={session.id}>
													{session.session_code} - {session.session_name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									)}

									{/* 2. Date Range Filter (Secondary) */}
									<Select value={dateRangePreset} onValueChange={(val) => {
										setDateRangePreset(val)
										if (val !== "custom") {
											setCustomDateRange(undefined)
										}
									}}>
										<SelectTrigger className="h-9 rounded-lg border-slate-300 focus:border-blue-500 w-[150px]">
											<SelectValue placeholder="Date Range" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="upcoming">Upcoming</SelectItem>
											<SelectItem value="today">Today</SelectItem>
											<SelectItem value="this_week">This Week</SelectItem>
											<SelectItem value="this_month">This Month</SelectItem>
											<SelectItem value="custom">Custom Range</SelectItem>
											<SelectItem value="all">All Dates</SelectItem>
										</SelectContent>
									</Select>

									{/* Custom Date Range Picker */}
									{dateRangePreset === "custom" && (
										<DateRangePicker
											dateRange={customDateRange}
											onDateRangeChange={setCustomDateRange}
											placeholder="Select date range"
										/>
									)}

									<Select value={statusFilter} onValueChange={setStatusFilter}>
										<SelectTrigger className="h-9 rounded-lg border-slate-300 focus:border-blue-500 w-[140px]">
											<SelectValue placeholder="All Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Status</SelectItem>
											<SelectItem value="published">Published</SelectItem>
											<SelectItem value="draft">Draft</SelectItem>
										</SelectContent>
									</Select>

									<Select value={sessionFilter} onValueChange={setSessionFilter}>
										<SelectTrigger className="h-9 rounded-lg border-slate-300 focus:border-blue-500 w-[150px]">
											<SelectValue placeholder="All Sessions" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Sessions</SelectItem>
											<SelectItem value="FN">Forenoon (FN)</SelectItem>
											<SelectItem value="AN">Afternoon (AN)</SelectItem>
										</SelectContent>
									</Select>

									<Select value={modeFilter} onValueChange={setModeFilter}>
										<SelectTrigger className="h-9 rounded-lg border-slate-300 focus:border-blue-500 w-[140px]">
											<SelectValue placeholder="All Modes" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Modes</SelectItem>
											<SelectItem value="offline">Offline</SelectItem>
											<SelectItem value="online">Online</SelectItem>
										</SelectContent>
									</Select>

									<Select value={examTypeFilter} onValueChange={setExamTypeFilter}>
										<SelectTrigger className="h-9 rounded-lg border-slate-300 focus:border-blue-500 w-[140px]">
											<SelectValue placeholder="Exam Type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Types</SelectItem>
											<SelectItem value="Theory">Theory</SelectItem>
											<SelectItem value="Practical">Practical</SelectItem>
										</SelectContent>
									</Select>

									<div className="relative flex-1 max-w-sm">
										<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
										<Input
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											placeholder="Search timetables..."
											className="pl-8 h-9 rounded-lg border-slate-300 focus:border-blue-500 focus:ring-blue-500/20"
										/>
									</div>
								</div>
							</div>
						</CardHeader>
						<CardContent className="flex-1 overflow-auto px-8 py-6 bg-slate-50/50">
							<div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
								<div className="overflow-auto" style={{ maxHeight: "480px" }}>
									<Table>
										<TableHeader className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
											<TableRow>
												<TableHead className="w-[40px] text-sm font-semibold text-slate-700"></TableHead>
												<TableHead className="text-sm font-semibold text-slate-700">
													<Button variant="ghost" size="sm" onClick={() => handleSort("exam_date")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
														Date
														<span className="ml-1">{getSortIcon("exam_date")}</span>
													</Button>
												</TableHead>
												<TableHead className="text-sm font-semibold text-slate-700">
													<Button variant="ghost" size="sm" onClick={() => handleSort("session")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
														Session
														<span className="ml-1">{getSortIcon("session")}</span>
													</Button>
												</TableHead>
												{mustSelectInstitution && (
												<TableHead className="text-sm font-semibold text-slate-700">
													<Button variant="ghost" size="sm" onClick={() => handleSort("institution_code")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
														Institution
														<span className="ml-1">{getSortIcon("institution_code")}</span>
													</Button>
												</TableHead>
											)}
												<TableHead className="text-sm font-semibold text-slate-700">
													<Button variant="ghost" size="sm" onClick={() => handleSort("course_code")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
														Course
														<span className="ml-1">{getSortIcon("course_code")}</span>
													</Button>
												</TableHead>
												<TableHead className="text-sm font-semibold text-slate-700 text-center">
													<Button variant="ghost" size="sm" onClick={() => handleSort("student_count")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
														Learners
														<span className="ml-1">{getSortIcon("student_count")}</span>
													</Button>
												</TableHead>
												<TableHead className="text-sm font-semibold text-slate-700 text-center">
													<Button variant="ghost" size="sm" onClick={() => handleSort("seat_alloc_count")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
														Seats
														<span className="ml-1">{getSortIcon("seat_alloc_count")}</span>
													</Button>
												</TableHead>
												<TableHead className="text-sm font-semibold text-slate-700">
													<Button variant="ghost" size="sm" onClick={() => handleSort("exam_mode")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
														Mode
														<span className="ml-1">{getSortIcon("exam_mode")}</span>
													</Button>
												</TableHead>
												<TableHead className="text-sm font-semibold text-slate-700">Type</TableHead>
												<TableHead className="text-sm font-semibold text-slate-700">
													<Button variant="ghost" size="sm" onClick={() => handleSort("is_published")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
														Status
														<span className="ml-1">{getSortIcon("is_published")}</span>
													</Button>
												</TableHead>
												<TableHead className="text-center text-sm font-semibold text-slate-700">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading || !isReady ? (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 11 : 10} className="h-24 text-center text-sm text-slate-500">Loading…</TableCell>
												</TableRow>
											) : paginatedItems.length ? (
												<>
													{paginatedItems.map((item) => {
														const dateKey = `${item.exam_date}-${item.session}`
														const isExpanded = expandedRows.has(dateKey)
														return (
															<React.Fragment key={item.id}>
																<TableRow className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
																	<TableCell className="text-sm text-slate-700">
																		<Button
																			variant="ghost"
																			size="sm"
																			className="h-7 w-7 p-0 hover:bg-slate-100 rounded-lg"
																			onClick={() => {
																				const newExpanded = new Set(expandedRows)
																				if (isExpanded) {
																					newExpanded.delete(dateKey)
																				} else {
																					newExpanded.add(dateKey)
																				}
																				setExpandedRows(newExpanded)
																			}}
																		>
																			{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
																		</Button>
																	</TableCell>
																	<TableCell className="font-medium text-sm text-slate-900 font-grotesk">
																		{formatDate(item.exam_date)}
																	</TableCell>
																	<TableCell className="text-sm text-slate-700">
																		<Badge variant="outline" className={`text-xs ${
																			item.session === 'FN'
																				? 'bg-amber-50 text-amber-700 border-amber-200'
																				: 'bg-indigo-50 text-indigo-700 border-indigo-200'
																		}`}>
																			{item.session === 'FN' ? 'Forenoon' : 'Afternoon'}
																		</Badge>
																	</TableCell>
																	{mustSelectInstitution && (
																		<TableCell className="text-sm text-slate-700">{item.institution_code}</TableCell>
																	)}
																	<TableCell className="text-sm text-slate-700">
																		<div className="flex flex-col">
																			<span className="font-medium text-slate-900">{item.course_code}</span>
																			<span className="text-xs text-slate-500">{item.course_name}</span>
																		</div>
																	</TableCell>
																	<TableCell className="text-sm text-center">
																		<Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">{item.student_count || 0}</Badge>
																	</TableCell>
																	<TableCell className="text-sm text-center">
																		<Badge variant="secondary" className="text-xs bg-purple-50 text-purple-700">{item.seat_alloc_count || 0}</Badge>
																	</TableCell>
																	<TableCell>
																		<Badge
																			variant={item.exam_mode?.toLowerCase() === 'online' ? 'default' : 'secondary'}
																			className={`text-xs ${
																				item.exam_mode?.toLowerCase() === 'online'
																					? 'bg-cyan-50 text-cyan-700 border-cyan-200'
																					: 'bg-slate-100 text-slate-700'
																			}`}
																		>
																			{item.exam_mode || 'Offline'}
																		</Badge>
																	</TableCell>
																	<TableCell>
																		<Badge
																			variant={item.exam_type === 'Practical' ? 'secondary' : 'outline'}
																			className={`text-xs ${
																				item.exam_type === 'Practical'
																					? 'bg-violet-50 text-violet-700 border-violet-200'
																					: 'bg-slate-50 text-slate-600 border-slate-200'
																			}`}
																		>
																			{item.exam_type || 'Theory'}
																		</Badge>
																		{item.batch_capacity && (
																			<span className="ml-2 text-xs text-muted-foreground">
																				(Cap: {item.batch_capacity})
																			</span>
																		)}
																	</TableCell>
																	<TableCell>
																		<Badge
																			variant={item.is_published ? "default" : "secondary"}
																			className={`text-xs ${
																				item.is_published
																					? 'bg-emerald-50 text-emerald-700 border-emerald-200'
																					: 'bg-amber-50 text-amber-700 border-amber-200'
																			}`}
																		>
																			{item.is_published ? 'Published' : 'Draft'}
																		</Badge>
																	</TableCell>
																	<TableCell>
																		<DropdownMenu>
																			<DropdownMenuTrigger asChild>
																				<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																					<MoreHorizontal className="h-4 w-4" />
																				</Button>
																			</DropdownMenuTrigger>
																			<DropdownMenuContent align="end">
																				<DropdownMenuItem onSelect={(e) => { e.preventDefault(); openEdit(item) }}>
																					<Edit className="h-3 w-3 mr-2" /> Edit
																				</DropdownMenuItem>
																				<DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSelectedTimetable(item); setShowHallAllocation(true) }}>
																					<DoorOpen className="h-3 w-3 mr-2" /> Hall Allocation
																				</DropdownMenuItem>
																				<DropdownMenuSeparator />
																				<DropdownMenuItem className="text-red-600" onClick={() => setDeleteTarget(item)}>
																					<Trash2 className="h-3 w-3 mr-2" /> Delete
																				</DropdownMenuItem>
																			</DropdownMenuContent>
																		</DropdownMenu>
																	</TableCell>
																</TableRow>
															</React.Fragment>
														)
													})}
												</>
											) : (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 11 : 10} className="h-24 text-center text-sm text-slate-500">No exam timetables found</TableCell>
												</TableRow>
											)}
										</TableBody>
									</Table>
								</div>
							</div>

							{/* Pagination */}
							<div className="flex items-center justify-between pt-4 border-t border-slate-200 mt-4">
								<div className="text-sm text-slate-600">
									<span>Showing {filtered.length === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, filtered.length)} of {filtered.length} timetables</span>
								<Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(v === '-1' ? -1 : Number(v)); setCurrentPage(1) }}><SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger><SelectContent>{pageSizeOptions.map(size => (<SelectItem key={size} value={String(size)}>{size} / page</SelectItem>))}<SelectItem value="-1">All</SelectItem></SelectContent></Select>
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
										disabled={currentPage === 1 || isShowAll}
										className="h-9 px-3 rounded-lg border-slate-300 hover:bg-slate-100 disabled:opacity-50"
									>
										<ChevronLeft className="h-4 w-4 mr-1" /> Previous
									</Button>
									<div className="text-sm text-slate-600 px-3">Page {currentPage} of {totalPages}</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
										disabled={currentPage >= totalPages || isShowAll}
										className="h-9 px-3 rounded-lg border-slate-300 hover:bg-slate-100 disabled:opacity-50"
									>
										Next <ChevronRight className="h-4 w-4 ml-1" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Upload Error Dialog */}
				<AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
					<AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
						<AlertDialogHeader>
							<div className="flex items-center gap-3">
								<div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
									<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
								</div>
								<div>
									<AlertDialogTitle className="text-xl font-bold text-red-600 dark:text-red-400">
										Upload Validation Errors
									</AlertDialogTitle>
									<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
										Please fix the following errors before uploading the data
									</AlertDialogDescription>
								</div>
							</div>
						</AlertDialogHeader>

						<div className="space-y-4">
							{/* Upload Summary Cards */}
							{uploadSummary.total > 0 && (
								<div className="grid grid-cols-3 gap-3">
									<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
										<div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Total Rows</div>
										<div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{uploadSummary.total}</div>
									</div>
									<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
										<div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Successful</div>
										<div className="text-2xl font-bold text-green-700 dark:text-green-300">{uploadSummary.success}</div>
									</div>
									<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3">
										<div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Failed</div>
										<div className="text-2xl font-bold text-red-700 dark:text-red-300">{uploadSummary.failed}</div>
									</div>
								</div>
							)}

							{/* Error Summary */}
							<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
								<div className="flex items-center gap-2 mb-2">
									<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
									<span className="font-semibold text-red-800 dark:text-red-200">
										{uploadErrors.length} row{uploadErrors.length > 1 ? 's' : ''} failed validation
									</span>
								</div>
								<p className="text-sm text-red-700 dark:text-red-300">
									Please correct these errors in your Excel file and try uploading again. Row numbers correspond to your Excel file (including header row).
								</p>
							</div>

							{/* Detailed Error List */}
							<div className="space-y-3">
								{uploadErrors.map((error, index) => (
									<div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5">
										<div className="flex items-start justify-between mb-2">
											<div className="flex items-center gap-2">
												<Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700">
													Row {error.row}
												</Badge>
												<span className="font-medium text-sm">
													{error.course_code} - {error.exam_date}
												</span>
											</div>
										</div>

										<div className="space-y-1">
											{error.errors.map((err, errIndex) => (
												<div key={errIndex} className="flex items-start gap-2 text-sm">
													<XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
													<span className="text-red-700 dark:text-red-300">{err}</span>
												</div>
											))}
										</div>
									</div>
								))}
							</div>

							{/* Helpful Tips */}
							<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
								<div className="flex items-start gap-2">
									<div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mt-0.5">
										<span className="text-xs font-bold text-blue-600 dark:text-blue-400">i</span>
									</div>
									<div>
										<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Common Fixes:</h4>
										<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
											<li>• Ensure all required fields are provided and not empty</li>
											<li>• Institution Code and Examination Session Code must exist in the system</li>
											<li>• Course Offering ID must be a valid UUID format</li>
											<li>• Exam Date must be in YYYY-MM-DD format (e.g., 2025-04-15)</li>
											<li>• Session must be either FN or AN</li>
											<li>• Exam Mode must be either Offline or Online</li>
											<li>• Exam Type must be Theory, Practical, Project, Field Work, or Group Project (default: Theory)</li>
											<li>• Batch Capacity is required (number) when Exam Type is Practical</li>
											<li>• Is Published values: Yes/No</li>
										</ul>
									</div>
								</div>
							</div>
						</div>

						<AlertDialogFooter className="flex-col sm:flex-row gap-2">
							<Button
								variant="outline"
								onClick={handleDownloadFailedRows}
								className="flex items-center gap-2"
							>
								<Download className="h-4 w-4" />
								Download Failed Rows
							</Button>
							<AlertDialogAction onClick={() => setShowErrorDialog(false)}>
								Close
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				{/* Edit Timetable Dialog */}
				<Dialog open={showEditDialog} onOpenChange={(o) => { if (!o) { setShowEditDialog(false); setEditTarget(null) } }}>
					<DialogContent className="sm:max-w-[520px]">
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<Edit className="h-5 w-5" />
								Edit Timetable
							</DialogTitle>
							<DialogDescription>
								{editTarget?.course_code} — {editTarget?.course_name}
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4 py-2">
							{/* Exam Date */}
							<div className="space-y-2">
								<Label htmlFor="edit-exam-date">Exam Date</Label>
								<Input
									id="edit-exam-date"
									type="date"
									value={editForm.exam_date}
									onChange={(e) => setEditForm(f => ({ ...f, exam_date: e.target.value }))}
								/>
							</div>

							{/* Session + Exam Mode row */}
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label>Session</Label>
									<Select value={editForm.session} onValueChange={(v) => setEditForm(f => ({ ...f, session: v }))}>
										<SelectTrigger><SelectValue /></SelectTrigger>
										<SelectContent>
											<SelectItem value="FN">Forenoon (FN)</SelectItem>
											<SelectItem value="AN">Afternoon (AN)</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label>Exam Mode</Label>
									<Select value={editForm.exam_mode} onValueChange={(v) => setEditForm(f => ({ ...f, exam_mode: v }))}>
										<SelectTrigger><SelectValue /></SelectTrigger>
										<SelectContent>
											<SelectItem value="Offline">Offline</SelectItem>
											<SelectItem value="Online">Online</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							{/* Exam Type + Batch Capacity row */}
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label>Exam Type</Label>
									<Select value={editForm.exam_type} onValueChange={(v) => setEditForm(f => ({ ...f, exam_type: v }))}>
										<SelectTrigger><SelectValue /></SelectTrigger>
										<SelectContent>
											<SelectItem value="Theory">Theory</SelectItem>
											<SelectItem value="Practical">Practical</SelectItem>
											<SelectItem value="Project">Project</SelectItem>
											<SelectItem value="Field Work">Field Work</SelectItem>
											<SelectItem value="Group Project">Group Project</SelectItem>
										</SelectContent>
									</Select>
								</div>
								{['Practical', 'Project', 'Field Work', 'Group Project'].includes(editForm.exam_type || '') && (
									<div className="space-y-2">
										<Label>Batch Capacity</Label>
										<Input
											type="number"
											placeholder="e.g. 30"
											value={editForm.batch_capacity}
											onChange={(e) => setEditForm(f => ({ ...f, batch_capacity: e.target.value }))}
										/>
									</div>
								)}
							</div>

							{/* Published toggle */}
							<div className="flex items-center justify-between rounded-lg border p-3">
								<div className="space-y-0.5">
									<Label htmlFor="edit-published">Published</Label>
									<p className="text-xs text-muted-foreground">Make this timetable visible to learners</p>
								</div>
								<Switch
									id="edit-published"
									checked={editForm.is_published}
									onCheckedChange={(c) => setEditForm(f => ({ ...f, is_published: c }))}
								/>
							</div>

							{/* Instructions */}
							<div className="space-y-2">
								<Label htmlFor="edit-instructions">Instructions</Label>
								<Textarea
									id="edit-instructions"
									placeholder="Optional instructions for this exam..."
									value={editForm.instructions}
									onChange={(e) => setEditForm(f => ({ ...f, instructions: e.target.value }))}
									rows={3}
								/>
							</div>
						</div>

						<DialogFooter>
							<Button variant="outline" onClick={() => { setShowEditDialog(false); setEditTarget(null) }}>
								Cancel
							</Button>
							<Button onClick={saveEdit} disabled={editSaving || !editForm.exam_date}>
								{editSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
								Save Changes
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Hall Allocation Dialog */}
				<Dialog open={showHallAllocation} onOpenChange={setShowHallAllocation}>
					<DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<DoorOpen className="h-5 w-5" />
								Hall Allocation - {selectedTimetable?.course_code}
							</DialogTitle>
							<DialogDescription>
								Allocate learners to examination halls for {selectedTimetable?.course_name} on {selectedTimetable?.exam_date} ({selectedTimetable?.session})
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4">
							{/* Summary */}
							<div className="grid grid-cols-3 gap-3">
								<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 rounded-lg p-3">
									<div className="text-xs text-blue-600 font-medium mb-1">Total Learners</div>
									<div className="text-2xl font-bold text-blue-700">{selectedTimetable?.student_count || 0}</div>
								</div>
								<div className="bg-green-50 dark:bg-green-900/10 border border-green-200 rounded-lg p-3">
									<div className="text-xs text-green-600 font-medium mb-1">Seats Allocated</div>
									<div className="text-2xl font-bold text-green-700">{selectedTimetable?.seat_alloc_count || 0}</div>
								</div>
								<div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 rounded-lg p-3">
									<div className="text-xs text-orange-600 font-medium mb-1">Remaining</div>
									<div className="text-2xl font-bold text-orange-700">
										{(selectedTimetable?.student_count || 0) - (selectedTimetable?.seat_alloc_count || 0)}
									</div>
								</div>
							</div>

							{/* Room Selection - Placeholder for future implementation */}
							<div className="border rounded-lg p-4">
								<h3 className="font-semibold mb-2 flex items-center gap-2">
									<MapPin className="h-4 w-4" />
									Room Allocation
								</h3>
								<p className="text-sm text-muted-foreground">
									Room selection and seat allocation interface will be implemented here.
									This will include:
								</p>
								<ul className="text-sm text-muted-foreground mt-2 space-y-1 ml-4">
									<li>• Select rooms sorted by room_order</li>
									<li>• Enter column start (C1, C2, etc.)</li>
									<li>• Enter learner count (validated against room capacity)</li>
									<li>• Auto-populate learners by program_code, attempt_number, learner_reg_no</li>
									<li>• Display room capacity, balance, rows, and columns</li>
								</ul>
							</div>
						</div>

						<DialogFooter>
							<Button variant="outline" onClick={() => setShowHallAllocation(false)}>
								Close
							</Button>
							<Button onClick={() => {
								toast({
									title: "Feature Coming Soon",
									description: "Complete hall allocation implementation is in progress.",
								})
							}}>
								<Users className="h-4 w-4 mr-2" />
								Allocate Seats
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<AppFooter />
			</SidebarInset>
		<AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Exam Timetable</AlertDialogTitle>
					<AlertDialogDescription>Are you sure you want to delete this exam timetable? This action cannot be undone.</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={() => { if (deleteTarget) { remove(deleteTarget.id); setDeleteTarget(null) } }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	</SidebarProvider>
	)
}
