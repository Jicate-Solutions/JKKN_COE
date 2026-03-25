"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
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
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Calendar, TrendingUp, FileSpreadsheet, RefreshCw, CheckCircle, XCircle, AlertTriangle, MoreHorizontal } from "lucide-react"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNPrograms } from "@/hooks/myjkkn/use-myjkkn-data"
import type { COEProgram } from "@/services/myjkkn/myjkkn-adapter-service"

interface ExaminationSession {
	id: string
	institutions_id: string
	session_code: string
	session_name: string
	month_year: string | null
	exam_type_id: string
	academic_year_id: string
	semester_year: number[]
	semester_type: string
	programs_included: string[]
	registration_start_date: string
	registration_end_date: string
	exam_start_date: string
	exam_end_date: string
	result_declaration_date: string | null
	session_status: string
	is_online_exam: boolean
	allow_late_registration: boolean
	late_registration_fee: number
	total_courses_scheduled: number
	total_students_registered: number
	total_marks_obtained_count: number
	created_at: string
}

interface Institution {
	id: string
	institution_code: string
	institution_name: string
}

interface ExamType {
	id: string
	examination_code: string
	examination_name: string
}

interface AcademicYear {
	id: string
	academic_year: string
	start_date: string
	end_date: string
}

export default function ExaminationSessionsPage() {
	const { toast } = useToast()

	// Institution filter hook
	const {
		shouldFilter,
		isReady: isInstitutionReady,
		institutionId: currentInstitutionId,
		appendToUrl,
		isLoading: isInstitutionLoading,
		mustSelectInstitution,
		getInstitutionIdForCreate
	} = useInstitutionFilter()

	// Main data state
	const [sessions, setSessions] = useState<ExaminationSession[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [deleteTarget, setDeleteTarget] = useState<ExaminationSession | null>(null)

	// Form state
	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<ExaminationSession | null>(null)
	const [statusFilter, setStatusFilter] = useState("all")

	// Error tracking state
	const [errorPopupOpen, setErrorPopupOpen] = useState(false)
	const [importErrors, setImportErrors] = useState<Array<{
		row: number
		session_code: string
		session_name: string
		errors: string[]
	}>>([])
	const [uploadSummary, setUploadSummary] = useState<{
		total: number
		success: number
		failed: number
	}>({ total: 0, success: 0, failed: 0 })

	// Foreign key dropdown data
	const [institutions, setInstitutions] = useState<Institution[]>([])
	const [examTypes, setExamTypes] = useState<ExamType[]>([])
	const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
	const { data: programs } = useMyJKKNPrograms({
		is_active: true,
	})

	// Form data
	const [formData, setFormData] = useState({
		institutions_id: "",
		session_code: "",
		session_name: "",
		month_year: "",
		exam_type_id: "",
		academic_year_id: "",
		semester_year: [] as number[],
		semester_type: "",
		programs_included: [] as string[],
		registration_start_date: "",
		registration_end_date: "",
		exam_start_date: "",
		exam_end_date: "",
		result_declaration_date: "",
		session_status: "Planned",
		is_online_exam: false,
		allow_late_registration: false,
		late_registration_fee: 0,
		total_courses_scheduled: 0,
		total_students_registered: 0,
		total_marks_obtained_count: 0,
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Fetch examination sessions with institution filter
	const fetchSessions = useCallback(async () => {
		try {
			setLoading(true)
			// Apply institution filter to URL
			const url = appendToUrl('/api/exam-management/examination-sessions')
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch examination sessions')
			}
			const data = await response.json()

			// Filter by institution if needed (client-side safety)
			let filteredData = data
			if (shouldFilter && currentInstitutionId) {
				filteredData = data.filter((session: ExaminationSession) =>
					session.institutions_id === currentInstitutionId
				)
			}

			setSessions(filteredData)
		} catch (error) {
			console.error('Error fetching examination sessions:', error)
			setSessions([])
		} finally {
			setLoading(false)
		}
	}, [appendToUrl, shouldFilter, currentInstitutionId])

	// Fetch institutions with filter
	const fetchInstitutions = useCallback(async () => {
		try {
			const url = appendToUrl('/api/master/institutions')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				let mapped = Array.isArray(data)
					? data.filter((i: any) => i?.institution_code).map((i: any) => ({
						id: i.id,
						institution_code: i.institution_code,
						institution_name: i.institution_name || i.name
					}))
					: []

				// Client-side filter for institution
				if (shouldFilter && currentInstitutionId) {
					mapped = mapped.filter((i: Institution) => i.id === currentInstitutionId)
				}

				setInstitutions(mapped)
			}
		} catch (e) {
			console.error('Failed to load institutions:', e)
		}
	}, [appendToUrl, shouldFilter, currentInstitutionId])

	// Fetch exam types with institution filter
	const fetchExamTypes = useCallback(async () => {
		try {
			const url = appendToUrl('/api/exam-management/exam-types')
			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				const mapped = Array.isArray(data)
					? data.filter((i: any) => i?.examination_code).map((i: any) => ({
						id: i.id,
						examination_code: i.examination_code,
						examination_name: i.examination_name
					}))
					: []
				setExamTypes(mapped)
			}
		} catch (e) {
			console.error('Failed to load exam types:', e)
		}
	}, [appendToUrl])

	// Fetch academic years
	const fetchAcademicYears = useCallback(async () => {
		try {
			const res = await fetch('/api/master/academic-years')
			if (res.ok) {
				const data = await res.json()
				const mapped = Array.isArray(data)
					? data.map((i: any) => ({
						id: i.id,
						academic_year: i.academic_year,
						start_date: i.start_date,
						end_date: i.end_date
					}))
					: []
				setAcademicYears(mapped)
			}
		} catch (e) {
			console.error('Failed to load academic years:', e)
		}
	}, [])

	// Load data when institution filter is ready (run once when ready)
	useEffect(() => {
		if (!isInstitutionReady) return

		fetchSessions()
		fetchInstitutions()
		fetchExamTypes()
		fetchAcademicYears()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isInstitutionReady])

	// Auto-set institution when filter changes (for non-super_admin users)
	useEffect(() => {
		if (currentInstitutionId && !formData.institutions_id && !editing) {
			setFormData(prev => ({ ...prev, institutions_id: currentInstitutionId }))
		}
	}, [currentInstitutionId, formData.institutions_id, editing])

	// Reset form
	const resetForm = () => {
		const autoInstitutionId = getInstitutionIdForCreate() || ''
		setFormData({
			// Auto-populate institution for non-super_admin users
			institutions_id: autoInstitutionId,
			session_code: "",
			session_name: "",
			month_year: "",
			exam_type_id: "",
			academic_year_id: "",
			semester_year: [],
			semester_type: "",
			programs_included: [],
			registration_start_date: "",
			registration_end_date: "",
			exam_start_date: "",
			exam_end_date: "",
			result_declaration_date: "",
			session_status: "Planned",
			is_online_exam: false,
			allow_late_registration: false,
			late_registration_fee: 0,
			total_courses_scheduled: 0,
			total_students_registered: 0,
			total_marks_obtained_count: 0,
		})
		setErrors({})
		setEditing(null)
	}

	// Validation
	const validate = () => {
		const e: Record<string, string> = {}

		// Required field validation
		if (!formData.institutions_id.trim()) e.institutions_id = "Institution is required"
		if (!formData.session_code.trim()) e.session_code = "Session code is required"
		if (!formData.session_name.trim()) e.session_name = "Session name is required"
		if (!formData.exam_type_id.trim()) e.exam_type_id = "Exam type is required"
		if (!formData.academic_year_id.trim()) e.academic_year_id = "Academic year is required"
		if (!formData.semester_type.trim()) e.semester_type = "Semester type is required"
		if (!formData.registration_start_date.trim()) e.registration_start_date = "Registration start date is required"
		if (!formData.registration_end_date.trim()) e.registration_end_date = "Registration end date is required"
		if (!formData.exam_start_date.trim()) e.exam_start_date = "Exam start date is required"
		if (!formData.exam_end_date.trim()) e.exam_end_date = "Exam end date is required"

		// Format validation for session code
		if (formData.session_code && !/^[A-Za-z0-9\-_]+$/.test(formData.session_code)) {
			e.session_code = "Session code can only contain letters, numbers, hyphens, and underscores"
		}

		// Length validation
		if (formData.session_code && formData.session_code.length > 50) {
			e.session_code = "Session code must be 50 characters or less"
		}
		if (formData.session_name && formData.session_name.length > 200) {
			e.session_name = "Session name must be 200 characters or less"
		}

		// Date sequence validation
		if (formData.registration_start_date && formData.registration_end_date) {
			const regStart = new Date(formData.registration_start_date)
			const regEnd = new Date(formData.registration_end_date)
			if (regStart >= regEnd) {
				e.registration_end_date = "Registration end date must be after start date"
			}
		}

		if (formData.registration_end_date && formData.exam_start_date) {
			const regEnd = new Date(formData.registration_end_date)
			const examStart = new Date(formData.exam_start_date)
			if (regEnd > examStart) {
				e.exam_start_date = "Registration must end on or before exam start date"
			}
		}

		if (formData.exam_start_date && formData.exam_end_date) {
			const examStart = new Date(formData.exam_start_date)
			const examEnd = new Date(formData.exam_end_date)
			if (examStart > examEnd) {
				e.exam_end_date = "Exam end date must be after start date"
			}
		}

		// Array validation
		if (formData.semester_year.length === 0) {
			e.semester_year = "At least one semester/year must be selected"
		}

		if (formData.programs_included.length === 0) {
			e.programs_included = "At least one program must be selected"
		}

		// Late registration fee validation
		if (formData.allow_late_registration && formData.late_registration_fee < 0) {
			e.late_registration_fee = "Late registration fee must be 0 or greater"
		}

		if (!formData.allow_late_registration && formData.late_registration_fee !== 0) {
			e.late_registration_fee = "Late registration fee must be 0 when late registration is disabled"
		}

		setErrors(e)
		return Object.keys(e).length === 0
	}

	// CREATE & UPDATE
	const save = async () => {
		if (!validate()) return

		try {
			setLoading(true)

			const payload = {
				...formData,
				late_registration_fee: Number(formData.late_registration_fee),
				total_courses_scheduled: Number(formData.total_courses_scheduled),
				total_students_registered: Number(formData.total_students_registered),
				total_marks_obtained_count: Number(formData.total_marks_obtained_count),
			}

			if (editing) {
				// UPDATE
				const response = await fetch('/api/exam-management/examination-sessions', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ id: editing.id, ...payload }),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to update examination session')
				}

				const updated = await response.json()
				setSessions((prev) => prev.map((p) => (p.id === editing.id ? updated : p)))

				toast({
					title: "✅ Examination Session Updated",
					description: `${updated.session_name} has been successfully updated.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			} else {
				// CREATE
				const response = await fetch('/api/exam-management/examination-sessions', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(payload),
				})

				if (!response.ok) {
					const errorData = await response.json()
					throw new Error(errorData.error || 'Failed to create examination session')
				}

				const created = await response.json()
				setSessions((prev) => [created, ...prev])

				toast({
					title: "✅ Examination Session Created",
					description: `${created.session_name} has been successfully created.`,
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			}

			setSheetOpen(false)
			resetForm()
		} catch (error) {
			console.error('Error saving examination session:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to save examination session. Please try again.'
			toast({
				title: "❌ Save Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
			})
		} finally {
			setLoading(false)
		}
	}

	// DELETE
	const remove = async (id: string) => {
		try {
			setLoading(true)
			const itemName = sessions.find(i => i.id === id)?.session_name || 'Examination Session'

			const response = await fetch(`/api/exam-management/examination-sessions?id=${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to delete examination session')
			}

			setSessions((prev) => prev.filter((p) => p.id !== id))

			toast({
				title: "✅ Examination Session Deleted",
				description: `${itemName} has been successfully deleted.`,
				className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
			})
		} catch (error) {
			console.error('Error deleting examination session:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete examination session. Please try again.'
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

	// Edit handler
	const edit = (session: ExaminationSession) => {
		setEditing(session)
		setFormData({
			institutions_id: session.institutions_id,
			session_code: session.session_code,
			session_name: session.session_name,
			month_year: session.month_year || "",
			exam_type_id: session.exam_type_id,
			academic_year_id: session.academic_year_id,
			semester_year: session.semester_year || [],
			semester_type: session.semester_type,
			programs_included: session.programs_included || [],
			registration_start_date: session.registration_start_date,
			registration_end_date: session.registration_end_date,
			exam_start_date: session.exam_start_date,
			exam_end_date: session.exam_end_date,
			result_declaration_date: session.result_declaration_date || "",
			session_status: session.session_status,
			is_online_exam: session.is_online_exam,
			allow_late_registration: session.allow_late_registration,
			late_registration_fee: session.late_registration_fee,
			total_courses_scheduled: session.total_courses_scheduled,
			total_students_registered: session.total_students_registered,
			total_marks_obtained_count: session.total_marks_obtained_count,
		})
		setSheetOpen(true)
	}

	// Filtering and sorting
	const filtered = useMemo(() => {
		let result = sessions

		// Search filter
		if (searchTerm) {
			result = result.filter(
				(item) =>
					item.session_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
					item.session_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
					(item.month_year || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
					item.session_status.toLowerCase().includes(searchTerm.toLowerCase())
			)
		}

		// Status filter
		if (statusFilter !== "all") {
			result = result.filter((item) => item.session_status === statusFilter)
		}

		// Sorting
		if (sortColumn) {
			result.sort((a, b) => {
				const aVal = a[sortColumn as keyof ExaminationSession]
				const bVal = b[sortColumn as keyof ExaminationSession]
				if (aVal < bVal) return sortDirection === "asc" ? -1 : 1
				if (aVal > bVal) return sortDirection === "asc" ? 1 : -1
				return 0
			})
		}

		return result
	}, [sessions, searchTerm, statusFilter, sortColumn, sortDirection])

	// Pagination
	const pageSizeOptions = useMemo(() => [10, 20, 50, 100], [])
	const isShowAll = itemsPerPage === -1
	const effectivePerPage = isShowAll ? filtered.length : itemsPerPage

	const paginated = useMemo(() => {
		if (isShowAll) return filtered
		const startIndex = (currentPage - 1) * effectivePerPage
		return filtered.slice(startIndex, startIndex + effectivePerPage)
	}, [filtered, currentPage, isShowAll, effectivePerPage])

	const totalPages = isShowAll ? 1 : Math.ceil(filtered.length / effectivePerPage)

	// Sort handler
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

	// Semester/Year checkbox handlers
	const handleSemesterYearToggle = (value: number) => {
		setFormData((prev) => ({
			...prev,
			semester_year: prev.semester_year.includes(value)
				? prev.semester_year.filter((v) => v !== value)
				: [...prev.semester_year, value]
		}))
	}

	const handleSemesterYearSelectAll = () => {
		if (formData.semester_year.length === 8) {
			setFormData((prev) => ({ ...prev, semester_year: [] }))
		} else {
			setFormData((prev) => ({ ...prev, semester_year: [1, 2, 3, 4, 5, 6, 7, 8] }))
		}
	}

	// Programs checkbox handlers
	const handleProgramToggle = (programId: string) => {
		setFormData((prev) => ({
			...prev,
			programs_included: prev.programs_included.includes(programId)
				? prev.programs_included.filter((id) => id !== programId)
				: [...prev.programs_included, programId]
		}))
	}

	const handleProgramSelectAll = () => {
		// Get institution_code from selected institution
		const selectedInstitution = institutions.find(i => i.id === formData.institutions_id)
		const institutionCode = selectedInstitution?.institution_code || ''

		// Filter programs by institution_code
		const filteredPrograms = institutionCode
			? programs.filter(p => p.institution_code === institutionCode)
			: []

		const filteredProgramIds = filteredPrograms.map(p => p.id)

		// Check if all filtered programs are selected
		const allSelected = filteredProgramIds.length > 0 && filteredProgramIds.every(id => formData.programs_included.includes(id))

		if (allSelected) {
			setFormData((prev) => ({ ...prev, programs_included: [] }))
		} else {
			setFormData((prev) => ({ ...prev, programs_included: filteredProgramIds }))
		}
	}

	// Group programs by type and filter by institution
	const programsByType = useMemo(() => {
		const grouped: Record<string, COEProgram[]> = {}

		// Get institution_code from selected institution
		const selectedInstitution = institutions.find(i => i.id === formData.institutions_id)
		const institutionCode = selectedInstitution?.institution_code || ''

		// Filter programs by institution_code
		const filteredPrograms = institutionCode
			? programs.filter(p => p.institution_code === institutionCode)
			: []

		// Group filtered programs by type
		filteredPrograms.forEach((program) => {
			const type = program.program_type || 'UG'
			if (!grouped[type]) {
				grouped[type] = []
			}
			grouped[type].push(program)
		})

		// Sort programs within each type by program_order (fallback to 0 if undefined)
		Object.keys(grouped).forEach((type) => {
			grouped[type].sort((a, b) => (a.program_order || 0) - (b.program_order || 0))
		})

		return grouped
	}, [programs, formData.institutions_id, institutions])

	// Get status badge color
	const getStatusBadgeColor = (status: string) => {
		switch (status) {
			case 'Planned':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200'
			case 'Registration Open':
				return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200'
			case 'Registration Closed':
				return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200'
			case 'Exam Ongoing':
				return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-200'
			case 'Completed':
				return 'bg-teal-100 text-teal-800 dark:bg-teal-900/20 dark:text-teal-200'
			case 'Results Declared':
				return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200'
			case 'Cancelled':
				return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200'
			default:
				return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-200'
		}
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-auto">
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
								<BreadcrumbPage>Examination Sessions</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					{/* Scorecard Section */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Total Sessions</p>
										<p className="text-xl font-bold">{sessions.length}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Active Sessions</p>
										<p className="text-xl font-bold text-green-600">{sessions.filter(s => s.session_status === 'Registration Open' || s.session_status === 'Exam Ongoing').length}</p>
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
										<p className="text-xs font-medium text-muted-foreground">Planned Sessions</p>
										<p className="text-xl font-bold text-blue-600">{sessions.filter(s => s.session_status === 'Planned').length}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Completed Sessions</p>
										<p className="text-xl font-bold text-purple-600">{sessions.filter(s => s.session_status === 'Completed' || s.session_status === 'Results Declared').length}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
										<TrendingUp className="h-3 w-3 text-purple-600 dark:text-purple-400" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Main Content */}
					<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 p-3">
							<div className="flex items-center justify-between mb-2">
								<div className="flex items-center gap-2">
									<div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
										<Calendar className="h-3 w-3 text-primary" />
									</div>
									<div>
										<h2 className="text-sm font-semibold">Examination Sessions</h2>
										<p className="text-xs text-muted-foreground">Manage examination sessions</p>
									</div>
								</div>
								<div className="hidden" />
							</div>

							<div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
								<div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
									<Select value={statusFilter} onValueChange={setStatusFilter}>
										<SelectTrigger className="w-[140px] h-8">
											<SelectValue placeholder="All Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Statuses</SelectItem>
											<SelectItem value="Planned">Planned</SelectItem>
											<SelectItem value="Registration Open">Registration Open</SelectItem>
											<SelectItem value="Registration Closed">Registration Closed</SelectItem>
											<SelectItem value="Exam Ongoing">Exam Ongoing</SelectItem>
											<SelectItem value="Completed">Completed</SelectItem>
											<SelectItem value="Results Declared">Results Declared</SelectItem>
											<SelectItem value="Cancelled">Cancelled</SelectItem>
										</SelectContent>
									</Select>

									<div className="relative w-full sm:w-[220px]">
										<Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
										<Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-xs" />
									</div>
								</div>

								<div className="flex gap-1 flex-wrap">
									<Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={fetchSessions} disabled={loading}>
										<RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
										Refresh
									</Button>
									<Button size="sm" className="text-xs px-2 h-8" onClick={() => { resetForm(); setSheetOpen(true) }} disabled={loading}>
										<PlusCircle className="h-3 w-3 mr-1" />
										Add
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">

							<div className="rounded-md border overflow-hidden" style={{ height: "440px" }}>
								<div className="h-full overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												{mustSelectInstitution && (
													<TableHead className="text-xs">Institution</TableHead>
												)}
												<TableHead className="text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort("session_code")} className="h-auto p-0 font-medium hover:bg-transparent">
														Session Code
														<span className="ml-1">{getSortIcon("session_code")}</span>
													</Button>
												</TableHead>
												<TableHead className="text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort("session_name")} className="h-auto p-0 font-medium hover:bg-transparent">
														Session Name
														<span className="ml-1">{getSortIcon("session_name")}</span>
													</Button>
												</TableHead>
												<TableHead className="text-xs">Month & Year</TableHead>
												<TableHead className="text-xs">Exam Type</TableHead>
												<TableHead className="text-xs">Academic Year</TableHead>
												<TableHead className="text-xs">Semester</TableHead>
												<TableHead className="text-xs">
													<Button variant="ghost" size="sm" onClick={() => handleSort("session_status")} className="h-auto p-0 font-medium hover:bg-transparent">
														Status
														<span className="ml-1">{getSortIcon("session_status")}</span>
													</Button>
												</TableHead>
												<TableHead className="text-xs w-[60px]">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading || isInstitutionLoading ? (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 9 : 8} className="h-24 text-center text-sm">Loading…</TableCell>
												</TableRow>
											) : paginated.length === 0 ? (
												<TableRow>
													<TableCell colSpan={mustSelectInstitution ? 9 : 8} className="h-24 text-center text-sm">No data</TableCell>
												</TableRow>
											) : (
												paginated.map((session) => (
													<TableRow key={session.id}>
														{mustSelectInstitution && (
															<TableCell className="text-xs">
																{institutions.find(i => i.id === session.institutions_id)?.institution_name || 'N/A'}
															</TableCell>
														)}
														<TableCell className="text-sm font-medium">{session.session_code}</TableCell>
														<TableCell className="text-xs">{session.session_name}</TableCell>
														<TableCell className="text-xs">{session.month_year || '-'}</TableCell>
														<TableCell className="text-xs">
															{examTypes.find(et => et.id === session.exam_type_id)?.examination_name || 'N/A'}
														</TableCell>
														<TableCell className="text-xs">
															{academicYears.find(ay => ay.id === session.academic_year_id)?.academic_year || 'N/A'}
														</TableCell>
														<TableCell className="text-xs">{session.semester_type}</TableCell>
														<TableCell>
															<Badge
																variant="outline"
																className={`text-xs ${getStatusBadgeColor(session.session_status)}`}
															>
																{session.session_status}
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
																	<DropdownMenuItem onClick={() => edit(session)}>
																		<Edit className="h-3 w-3 mr-2" /> Edit
																	</DropdownMenuItem>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem className="text-red-600" onClick={() => setDeleteTarget(session)}>
																		<Trash2 className="h-3 w-3 mr-2" /> Delete
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</div>
							</div>

							<div className="flex items-center justify-between space-x-2 py-2 mt-2">
								<div className="text-xs text-muted-foreground">
									<span>Showing {filtered.length === 0 ? 0 : (currentPage - 1) * effectivePerPage + 1}-{Math.min(currentPage * effectivePerPage, filtered.length)} of {filtered.length}</span>
								<Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(v === '-1' ? -1 : Number(v)); setCurrentPage(1) }}><SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger><SelectContent>{pageSizeOptions.map(size => (<SelectItem key={size} value={String(size)}>{size} / page</SelectItem>))}<SelectItem value="-1">All</SelectItem></SelectContent></Select>
								</div>
								<div className="flex items-center gap-2">
									<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1 || isShowAll} className="h-7 px-2 text-xs">
										<ChevronLeft className="h-3 w-3 mr-1" /> Previous
									</Button>
									<div className="text-xs text-muted-foreground px-2">Page {currentPage} of {totalPages}</div>
									<Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || isShowAll} className="h-7 px-2 text-xs">
										Next <ChevronRight className="h-3 w-3 ml-1" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
				<AppFooter />
			</SidebarInset>

			{/* Form Sheet */}
			<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[900px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle>{editing ? "Edit Examination Session" : "Add Examination Session"}</SheetTitle>
						<p className="text-sm text-muted-foreground">{editing ? "Update examination session information" : "Create a new examination session"}</p>
					</SheetHeader>

					<div className="mt-6 space-y-8">
						{/* Basic Information Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Basic Information</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Institution - show only when needed */}
								{(mustSelectInstitution || !shouldFilter || !currentInstitutionId) && (
									<div className="space-y-2">
										<Label htmlFor="institutions_id" className="text-sm font-semibold">
											Institution <span className="text-red-500">*</span>
										</Label>
										<Select
											value={formData.institutions_id}
											onValueChange={(v) => setFormData({ ...formData, institutions_id: v, programs_included: [] })}
										>
											<SelectTrigger id="institutions_id" className={`h-10 ${errors.institutions_id ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map((inst) => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.institution_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.institutions_id && <p className="text-xs text-destructive">{errors.institutions_id}</p>}
									</div>
								)}

								{/* Session Code */}
								<div className="space-y-2">
									<Label htmlFor="session_code" className="text-sm font-semibold">
										Session Code <span className="text-red-500">*</span>
									</Label>
									<Input
										id="session_code"
										value={formData.session_code}
										onChange={(e) => setFormData({ ...formData, session_code: e.target.value })}
										className={`h-10 ${errors.session_code ? 'border-destructive' : ''}`}
										placeholder="e.g., JKKNCAS-NOV-DEC-2025"
									/>
									{errors.session_code && <p className="text-xs text-destructive">{errors.session_code}</p>}
								</div>

								{/* Session Name */}
								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="session_name" className="text-sm font-semibold">
										Session Name <span className="text-red-500">*</span>
									</Label>
									<Input
										id="session_name"
										value={formData.session_name}
										onChange={(e) => setFormData({ ...formData, session_name: e.target.value })}
										className={`h-10 ${errors.session_name ? 'border-destructive' : ''}`}
										placeholder="e.g., Arts college Nov-Dec Examination 2025"
									/>
									{errors.session_name && <p className="text-xs text-destructive">{errors.session_name}</p>}
								</div>

								{/* Month & Year */}
								<div className="space-y-2">
									<Label className="text-sm font-semibold">
										Month & Year
									</Label>
									<div className="flex gap-2">
										<Select
											value={formData.month_year ? formData.month_year.split('-')[0] : ''}
											onValueChange={(month) => {
												const year = formData.month_year ? formData.month_year.split('-')[1] : ''
												setFormData({ ...formData, month_year: year ? `${month}-${year}` : month })
											}}
										>
											<SelectTrigger className={`h-10 flex-1 ${errors.month_year ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Month" />
											</SelectTrigger>
											<SelectContent>
												{['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map((m) => (
													<SelectItem key={m} value={m}>{m}</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Select
											value={formData.month_year ? formData.month_year.split('-')[1] || '' : ''}
											onValueChange={(year) => {
												const month = formData.month_year ? formData.month_year.split('-')[0] : ''
												setFormData({ ...formData, month_year: month ? `${month}-${year}` : year })
											}}
										>
											<SelectTrigger className={`h-10 flex-1 ${errors.month_year ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Year" />
											</SelectTrigger>
											<SelectContent>
												{Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
													<SelectItem key={y} value={String(y)}>{y}</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									{errors.month_year && <p className="text-xs text-destructive">{errors.month_year}</p>}
								</div>

								{/* Exam Type */}
								<div className="space-y-2">
									<Label htmlFor="exam_type_id" className="text-sm font-semibold">
										Exam Type <span className="text-red-500">*</span>
									</Label>
									<Select value={formData.exam_type_id} onValueChange={(v) => setFormData({ ...formData, exam_type_id: v })}>
										<SelectTrigger id="exam_type_id" className={`h-10 ${errors.exam_type_id ? 'border-destructive' : ''}`}>
											<SelectValue placeholder="Select exam type" />
										</SelectTrigger>
										<SelectContent>
											{examTypes.map((et) => (
												<SelectItem key={et.id} value={et.id}>
													{et.examination_name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errors.exam_type_id && <p className="text-xs text-destructive">{errors.exam_type_id}</p>}
								</div>

								{/* Academic Year */}
								<div className="space-y-2">
									<Label htmlFor="academic_year_id" className="text-sm font-semibold">
										Academic Year <span className="text-red-500">*</span>
									</Label>
									<Select value={formData.academic_year_id} onValueChange={(v) => setFormData({ ...formData, academic_year_id: v })}>
										<SelectTrigger id="academic_year_id" className={`h-10 ${errors.academic_year_id ? 'border-destructive' : ''}`}>
											<SelectValue placeholder="Select academic year" />
										</SelectTrigger>
										<SelectContent>
											{academicYears.map((ay) => (
												<SelectItem key={ay.id} value={ay.id}>
													{ay.academic_year}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errors.academic_year_id && <p className="text-xs text-destructive">{errors.academic_year_id}</p>}
								</div>

								{/* Semester Type */}
								<div className="space-y-2">
									<Label htmlFor="semester_type" className="text-sm font-semibold">
										Semester Type <span className="text-red-500">*</span>
									</Label>
									<Select value={formData.semester_type} onValueChange={(v) => setFormData({ ...formData, semester_type: v })}>
										<SelectTrigger id="semester_type" className={`h-10 ${errors.semester_type ? 'border-destructive' : ''}`}>
											<SelectValue placeholder="Select semester type" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="ODD">ODD</SelectItem>
											<SelectItem value="EVEN">EVEN</SelectItem>
											<SelectItem value="SUMMER">SUMMER</SelectItem>
											<SelectItem value="ALL">ALL</SelectItem>
										</SelectContent>
									</Select>
									{errors.semester_type && <p className="text-xs text-destructive">{errors.semester_type}</p>}
								</div>

								{/* Session Status */}
								<div className="space-y-2">
									<Label htmlFor="session_status" className="text-sm font-semibold">
										Session Status
									</Label>
									<Select value={formData.session_status} onValueChange={(v) => setFormData({ ...formData, session_status: v })}>
										<SelectTrigger id="session_status" className="h-10">
											<SelectValue placeholder="Select status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="Planned">Planned</SelectItem>
											<SelectItem value="Registration Open">Registration Open</SelectItem>
											<SelectItem value="Registration Closed">Registration Closed</SelectItem>
											<SelectItem value="Exam Ongoing">Exam Ongoing</SelectItem>
											<SelectItem value="Completed">Completed</SelectItem>
											<SelectItem value="Results Declared">Results Declared</SelectItem>
											<SelectItem value="Cancelled">Cancelled</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>

						{/* Semester/Year Selection Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Semester/Year Selection</h3>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label className="text-sm font-semibold">
										Select Semester/Year <span className="text-red-500">*</span>
									</Label>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleSemesterYearSelectAll}
									>
										{formData.semester_year.length === 8 ? 'Deselect All' : 'Select All'}
									</Button>
								</div>
								<div className="grid grid-cols-4 gap-2">
									{[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
										<div key={sem} className="flex items-center space-x-2 border rounded-lg p-2">
											<Checkbox
												id={`sem-${sem}`}
												checked={formData.semester_year.includes(sem)}
												onCheckedChange={() => handleSemesterYearToggle(sem)}
											/>
											<label
												htmlFor={`sem-${sem}`}
												className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
											>
												Semester {sem}
											</label>
										</div>
									))}
								</div>
								{errors.semester_year && <p className="text-xs text-destructive">{errors.semester_year}</p>}
							</div>
						</div>

						{/* Programs Selection Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Programs Selection</h3>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label className="text-sm font-semibold">
										Select Programs <span className="text-red-500">*</span>
									</Label>
									{formData.institutions_id && Object.keys(programsByType).length > 0 && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleProgramSelectAll}
										>
											{formData.programs_included.length === Object.values(programsByType).flat().length && Object.values(programsByType).flat().length > 0 ? 'Deselect All' : 'Select All'}
										</Button>
									)}
								</div>
								{!formData.institutions_id ? (
									<div className="border rounded-lg p-6 text-center bg-muted/30">
										<p className="text-sm text-muted-foreground">Please select an institution first to view available programs</p>
									</div>
								) : Object.keys(programsByType).length === 0 ? (
									<div className="border rounded-lg p-6 text-center bg-muted/30">
										<p className="text-sm text-muted-foreground">
											No programs found for the selected institution
										</p>
										<p className="text-xs text-muted-foreground mt-2">
											Institution Code: {institutions.find(i => i.id === formData.institutions_id)?.institution_code || 'N/A'}
										</p>
										<p className="text-xs text-muted-foreground">
											Total Programs in System: {programs.length}
										</p>
										<p className="text-xs text-muted-foreground">
											Programs with matching institution_code: {programs.filter(p => p.institution_code === institutions.find(i => i.id === formData.institutions_id)?.institution_code).length}
										</p>
									</div>
								) : (
									<div className="space-y-4 max-h-[300px] overflow-y-auto border rounded-lg p-3">
										{Object.keys(programsByType).sort().map((type) => (
											<div key={type} className="space-y-2">
												<h4 className="font-semibold text-sm text-primary">{type} Programs</h4>
												<div className="grid grid-cols-1 gap-2">
													{programsByType[type].map((program) => (
														<div key={program.id} className="flex items-center space-x-2 border rounded-lg p-2 hover:bg-muted/50">
															<Checkbox
																id={`prog-${program.id}`}
																checked={formData.programs_included.includes(program.id)}
																onCheckedChange={() => handleProgramToggle(program.id)}
															/>
															<label
																htmlFor={`prog-${program.id}`}
																className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
															>
																{program.program_name} ({program.program_code})
															</label>
														</div>
													))}
												</div>
											</div>
										))}
									</div>
								)}
								{errors.programs_included && <p className="text-xs text-destructive">{errors.programs_included}</p>}
							</div>
						</div>

						{/* Date Configuration Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Date Configuration</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Registration Start Date */}
								<div className="space-y-2">
									<Label htmlFor="registration_start_date" className="text-sm font-semibold">
										Registration Start Date <span className="text-red-500">*</span>
									</Label>
									<Input
										id="registration_start_date"
										type="date"
										value={formData.registration_start_date}
										onChange={(e) => setFormData({ ...formData, registration_start_date: e.target.value })}
										className={`h-10 ${errors.registration_start_date ? 'border-destructive' : ''}`}
									/>
									{errors.registration_start_date && <p className="text-xs text-destructive">{errors.registration_start_date}</p>}
								</div>

								{/* Registration End Date */}
								<div className="space-y-2">
									<Label htmlFor="registration_end_date" className="text-sm font-semibold">
										Registration End Date <span className="text-red-500">*</span>
									</Label>
									<Input
										id="registration_end_date"
										type="date"
										value={formData.registration_end_date}
										onChange={(e) => setFormData({ ...formData, registration_end_date: e.target.value })}
										className={`h-10 ${errors.registration_end_date ? 'border-destructive' : ''}`}
									/>
									{errors.registration_end_date && <p className="text-xs text-destructive">{errors.registration_end_date}</p>}
								</div>

								{/* Exam Start Date */}
								<div className="space-y-2">
									<Label htmlFor="exam_start_date" className="text-sm font-semibold">
										Exam Start Date <span className="text-red-500">*</span>
									</Label>
									<Input
										id="exam_start_date"
										type="date"
										value={formData.exam_start_date}
										onChange={(e) => setFormData({ ...formData, exam_start_date: e.target.value })}
										className={`h-10 ${errors.exam_start_date ? 'border-destructive' : ''}`}
									/>
									{errors.exam_start_date && <p className="text-xs text-destructive">{errors.exam_start_date}</p>}
								</div>

								{/* Exam End Date */}
								<div className="space-y-2">
									<Label htmlFor="exam_end_date" className="text-sm font-semibold">
										Exam End Date <span className="text-red-500">*</span>
									</Label>
									<Input
										id="exam_end_date"
										type="date"
										value={formData.exam_end_date}
										onChange={(e) => setFormData({ ...formData, exam_end_date: e.target.value })}
										className={`h-10 ${errors.exam_end_date ? 'border-destructive' : ''}`}
									/>
									{errors.exam_end_date && <p className="text-xs text-destructive">{errors.exam_end_date}</p>}
								</div>

								{/* Result Declaration Date */}
								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="result_declaration_date" className="text-sm font-semibold">
										Result Declaration Date
									</Label>
									<Input
										id="result_declaration_date"
										type="date"
										value={formData.result_declaration_date}
										onChange={(e) => setFormData({ ...formData, result_declaration_date: e.target.value })}
										className="h-10"
									/>
								</div>
							</div>
						</div>

						{/* Configuration Section */}
						<div className="space-y-4">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 border-b">Configuration</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Is Online Exam */}
								<div className="flex items-center gap-4">
									<Label className="text-sm font-semibold">Online Exam</Label>
									<button
										type="button"
										onClick={() => setFormData({ ...formData, is_online_exam: !formData.is_online_exam })}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.is_online_exam ? 'bg-green-500' : 'bg-gray-300'
											}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_online_exam ? 'translate-x-6' : 'translate-x-1'
												}`}
										/>
									</button>
									<span className={`text-sm font-medium ${formData.is_online_exam ? 'text-green-600' : 'text-gray-500'}`}>
										{formData.is_online_exam ? 'Yes' : 'No'}
									</span>
								</div>

								{/* Allow Late Registration */}
								<div className="flex items-center gap-4">
									<Label className="text-sm font-semibold">Allow Late Registration</Label>
									<button
										type="button"
										onClick={() => setFormData({ ...formData, allow_late_registration: !formData.allow_late_registration, late_registration_fee: !formData.allow_late_registration ? formData.late_registration_fee : 0 })}
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.allow_late_registration ? 'bg-green-500' : 'bg-gray-300'
											}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.allow_late_registration ? 'translate-x-6' : 'translate-x-1'
												}`}
										/>
									</button>
									<span className={`text-sm font-medium ${formData.allow_late_registration ? 'text-green-600' : 'text-gray-500'}`}>
										{formData.allow_late_registration ? 'Yes' : 'No'}
									</span>
								</div>

								{/* Late Registration Fee */}
								<div className="space-y-2">
									<Label htmlFor="late_registration_fee" className="text-sm font-semibold">
										Late Registration Fee
									</Label>
									<Input
										id="late_registration_fee"
										type="number"
										step="0.01"
										min="0"
										value={formData.late_registration_fee}
										onChange={(e) => setFormData({ ...formData, late_registration_fee: parseFloat(e.target.value) || 0 })}
										className={`h-10 ${errors.late_registration_fee ? 'border-destructive' : ''} ${!formData.allow_late_registration ? 'bg-muted cursor-not-allowed' : ''}`}
										disabled={!formData.allow_late_registration}
									/>
									{errors.late_registration_fee && <p className="text-xs text-destructive">{errors.late_registration_fee}</p>}
								</div>

								{/* Total Courses Scheduled */}
								<div className="space-y-2">
									<Label htmlFor="total_courses_scheduled" className="text-sm font-semibold">
										Total Courses Scheduled
									</Label>
									<Input
										id="total_courses_scheduled"
										type="number"
										min="0"
										value={formData.total_courses_scheduled}
										onChange={(e) => setFormData({ ...formData, total_courses_scheduled: parseInt(e.target.value) || 0 })}
										className="h-10"
									/>
								</div>

								{/* Total Learners Registered */}
								<div className="space-y-2">
									<Label htmlFor="total_students_registered" className="text-sm font-semibold">
										Total Learners Registered
									</Label>
									<Input
										id="total_students_registered"
										type="number"
										min="0"
										value={formData.total_students_registered}
										onChange={(e) => setFormData({ ...formData, total_students_registered: parseInt(e.target.value) || 0 })}
										className="h-10"
									/>
								</div>

								{/* Total Marks Obtained Count */}
								<div className="space-y-2">
									<Label htmlFor="total_marks_obtained_count" className="text-sm font-semibold">
										Total Marks Obtained Count
									</Label>
									<Input
										id="total_marks_obtained_count"
										type="number"
										min="0"
										value={formData.total_marks_obtained_count}
										onChange={(e) => setFormData({ ...formData, total_marks_obtained_count: parseInt(e.target.value) || 0 })}
										className="h-10"
									/>
								</div>
							</div>
						</div>

						{/* Action Buttons */}
						<div className="flex justify-end gap-3 pt-6 border-t">
							<Button
								variant="outline"
								size="sm"
								className="h-10 px-6"
								onClick={() => { setSheetOpen(false); resetForm() }}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								className="h-10 px-6"
								onClick={save}
								disabled={loading}
							>
								{editing ? "Update Session" : "Create Session"}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			<AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Examination Session</AlertDialogTitle>
						<AlertDialogDescription>Are you sure you want to delete {deleteTarget?.session_name}? This action cannot be undone.</AlertDialogDescription>
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
