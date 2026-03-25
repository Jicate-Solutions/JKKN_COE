'use client'

import { useMemo, useState, useEffect } from 'react'
import XLSX from '@/lib/utils/excel-compat'
import supabaseAuthService from '@/services/auth/supabase-auth-service'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useInstitution } from '@/context/institution-context'
import { useMyJKKNInstitutionFilter } from '@/hooks/use-myjkkn-institution-filter'
import { useMyJKKNReferenceLookup } from '@/hooks/myjkkn/use-myjkkn-reference-lookup'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/common/use-toast'
import Link from 'next/link'
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, BookOpen, TrendingUp, FileSpreadsheet, RefreshCw, CheckCircle, XCircle, AlertTriangle, Users, Upload, Loader2, FileJson, Download, LayoutList, MoreHorizontal, ChevronDown } from 'lucide-react'

// Import types from centralized module
import type {
	CourseOffering,
	Institution,
	Course,
	ExaminationSession,
	Program,
	CourseOfferingFormData as FormDataType,
	CourseOfferingPayload,
} from '@/types/course-offering'

// Import service layer functions
import {
	fetchCourseOfferings as fetchCourseOfferingsService,
	fetchInstitutions as fetchInstitutionsService,
	fetchCourses as fetchCoursesService,
	fetchExaminationSessions as fetchExaminationSessionsService,
	fetchPrograms as fetchProgramsService,
	createCourseOffering,
	updateCourseOffering,
	deleteCourseOffering as deleteCourseOfferingService,
} from '@/services/course-management/course-offering-service'

// Import validation utilities
import { validateCourseOfferingData } from '@/lib/utils/course-offering/validation'

// Import export/import utilities
import {
	exportToJSON,
	exportToExcel,
	exportTemplate,
	type TemplateSemester,
} from '@/lib/utils/course-offering/export-import'

export default function CourseOfferingPage() {
	const { toast } = useToast()

	// Institution filter skill - for institution-based filtering
	const {
		institutionCode: contextInstitutionCode,
		institutionId: contextInstitutionId,
		isReady: institutionContextReady,
		appendToUrl,
		filterData,
		mustSelectInstitution,
		shouldFilter,
		getInstitutionIdForCreate
	} = useInstitutionFilter()

	const {
		availableInstitutions,
		canSwitchInstitution,
		currentInstitution
	} = useInstitution()

	// MyJKKN institution filter hook for fetching programs and semesters
	const { fetchPrograms: fetchMyJKKNPrograms, fetchSemesters: fetchMyJKKNSemesters } = useMyJKKNInstitutionFilter()

	// MyJKKN reference lookup hook for resolving program names in index view
	const { lookupProgram, lookupMultiple } = useMyJKKNReferenceLookup()

	// Map to store resolved program data for display
	const [programsMap, setProgramsMap] = useState<Map<string, { program_code: string; program_name: string }>>(new Map())

	const [items, setItems] = useState<CourseOffering[]>([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage, setItemsPerPage] = useState(10)
	const [deleteTarget, setDeleteTarget] = useState<CourseOffering | null>(null)

	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<CourseOffering | null>(null)
	const [statusFilter, setStatusFilter] = useState("all")
	const [programFilter, setProgramFilter] = useState("all")
	const [semesterFilter, setSemesterFilter] = useState("all")
	const [errorPopupOpen, setErrorPopupOpen] = useState(false)
	const [importErrors, setImportErrors] = useState<Array<{
		row: number
		semester: string
		section: string
		errors: string[]
	}>>([])
	const [uploadSummary, setUploadSummary] = useState<{
		total: number
		success: number
		failed: number
	}>({ total: 0, success: 0, failed: 0 })

	// Import preview state
	const [importPreviewOpen, setImportPreviewOpen] = useState(false)
	const [importPreviewData, setImportPreviewData] = useState<Array<{
		rowNumber: number
		institution_code: string
		course_code: string
		session_code: string
		program_code: string
		semester_name: string
		semester_code: string
		semester_order: number
		is_active: boolean
		status: 'valid' | 'error'
		errors: string[]
	}>>([])
	const [importInProgress, setImportInProgress] = useState(false)

	// Foreign key dropdowns
	const [institutions, setInstitutions] = useState<Array<{
		id: string
		institution_code: string
		institution_name: string
		myjkkn_institution_ids: string[] | null
	}>>([])
	const [courses, setCourses] = useState<Course[]>([])
	const [examinationSessions, setExaminationSessions] = useState<ExaminationSession[]>([])
	// Programs from MyJKKN API - id is UUID, program_code is the code
	const [programs, setPrograms] = useState<Array<{
		id: string
		program_code: string
		program_name: string
	}>>([])
	const [programsLoading, setProgramsLoading] = useState(false)

	// Semesters from MyJKKN API - filtered by program
	const [semesters, setSemesters] = useState<Array<{
		id: string
		semester_number?: number
		semester_name: string
		semester_code?: string
		program_id?: string
	}>>([])
	const [semestersLoading, setSemestersLoading] = useState(false)

	// Inline search state for dropdown filters
	const [programSearch, setProgramSearch] = useState('')
	const [semesterSearch, setSemesterSearch] = useState('')
	const [courseSearch, setCourseSearch] = useState('')

	const [formData, setFormData] = useState({
		institutions_id: "",
		course_id: "",
		examination_session_id: "",
		program_id: "",
		semester_id: "", // MyJKKN semester UUID
		semester_code: "", // Generated: INST-PROG-SemX
		semester_number: "", // Semester number for filtering courses
		semester_order: "", // Display order for sorting
		section: "",
		faculty_id: "",
		max_enrollment: "",
		enrolled_count: "",
		is_active: true,
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	// Filtered dropdowns based on institution + inline search (derived via useMemo)
	const filteredPrograms = useMemo(() => {
		if (!formData.institutions_id) return []
		const search = programSearch.toLowerCase()
		const base = programs
		if (!search) return base
		return base.filter(p =>
			p.program_code?.toLowerCase().includes(search) ||
			p.program_name?.toLowerCase().includes(search)
		)
	}, [programs, formData.institutions_id, programSearch])

	const filteredSemesters = useMemo(() => {
		if (!formData.institutions_id) return []
		const search = semesterSearch.toLowerCase()
		const base = semesters
		if (!search) return base
		return base.filter(s =>
			s.semester_name?.toLowerCase().includes(search) ||
			s.semester_code?.toLowerCase().includes(search)
		)
	}, [semesters, formData.institutions_id, semesterSearch])

	const filteredExaminationSessions = useMemo(() => {
		if (!formData.institutions_id) return []
		return examinationSessions.filter(s => (s as any).institutions_id === formData.institutions_id)
	}, [examinationSessions, formData.institutions_id])

	const filteredCourses = useMemo(() => {
		if (!formData.institutions_id) return []
		const search = courseSearch.toLowerCase()
		const base = courses
		if (!search) return base
		return base.filter(c =>
			c.course_code?.toLowerCase().includes(search) ||
			c.course_title?.toLowerCase().includes(search)
		)
	}, [courses, formData.institutions_id, courseSearch])

	// Fetch data from API using service layer with institution filter
	const fetchCourseOfferings = async () => {
		try {
			setLoading(true)
			// Use appendToUrl to apply institution filter when active
			const url = appendToUrl('/api/course-management/course-offering')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to fetch course offerings')
			const data = await response.json()
			setItems(data)
		} catch (error) {
			console.error('Error fetching course offers:', error)
			setItems([])
		} finally {
			setLoading(false)
		}
	}

	const fetchInstitutions = async () => {
		try {
			// Use institutions from context if available (for super_admin or single institution)
			if (availableInstitutions.length > 0) {
				const mapped = availableInstitutions.map(inst => ({
					id: inst.id,
					institution_code: inst.institution_code,
					institution_name: inst.institution_name,
					myjkkn_institution_ids: (inst as any).myjkkn_institution_ids || []
				}))
				setInstitutions(mapped)
				return mapped
			} else {
				const res = await fetch('/api/master/institutions')
				if (res.ok) {
					const data = await res.json()
					const mapped = Array.isArray(data)
						? data.filter((i: any) => i?.institution_code).map((i: any) => ({
							id: i.id,
							institution_code: i.institution_code,
							institution_name: i.institution_name || i.name,
							myjkkn_institution_ids: i.myjkkn_institution_ids || []
						}))
						: []
					setInstitutions(mapped)
					return mapped
				}
			}
			return []
		} catch (e) {
			console.error('Failed to load institutions:', e)
			return []
		}
	}

	const fetchCourses = async (institutionId?: string, institutionsList?: Array<{ id: string; institution_code: string }>) => {
		try {
			// If institution is provided, filter courses by institution
			let url = '/api/course-management/course-mapping'
			if (institutionId) {
				// Use provided institutionsList or fall back to state
				const instList = institutionsList || institutions
				if (instList.length > 0) {
					const institution = instList.find(i => i.id === institutionId)
					if (institution?.institution_code) {
						url += `?institution_code=${encodeURIComponent(institution.institution_code)}`
					}
				}
			}

			const res = await fetch(url)
			if (res.ok) {
				const data = await res.json()
				const mapped = Array.isArray(data)
					? data.filter((c: any) => c?.course_id).map((c: any) => ({
						id: c.course_id,
						course_code: c.courses?.course_code || c.course_code,
						course_title: c.courses?.course_title || c.course_title || 'N/A',
						institutions_id: c.institutions_id
					}))
					: []
				setCourses(mapped)
			}
		} catch (e) {
			console.error('Failed to load courses:', e)
		}
	}

	const fetchExaminationSessions = async () => {
		try {
			const data = await fetchExaminationSessionsService()
			setExaminationSessions(data)
		} catch (e) {
			console.error('Failed to load examination sessions:', e)
		}
	}

	// Fetch programs from MyJKKN API using myjkkn_institution_ids
	const fetchPrograms = async (institutionId?: string) => {
		try {
			setProgramsLoading(true)
			setPrograms([])

			// Determine which institution to use
			const targetInstitutionId = institutionId || formData.institutions_id
			if (!targetInstitutionId) {
				setPrograms([])
				setProgramsLoading(false)
				return
			}

			// Get the institution with its myjkkn_institution_ids
			const institution = institutions.find(i => i.id === targetInstitutionId)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				console.warn('No MyJKKN institution IDs found for institution:', targetInstitutionId)
				setPrograms([])
				setProgramsLoading(false)
				return
			}

			// Fetch programs from MyJKKN API using the hook
			const progs = await fetchMyJKKNPrograms(myjkknIds)
			setPrograms(progs)
		} catch (e) {
			console.error('Failed to load programs from MyJKKN:', e)
			setPrograms([])
		} finally {
			setProgramsLoading(false)
		}
	}

	// Cache for semesters by program ID
	const semestersCache = useMemo(() => new Map<string, typeof semesters>(), [])

	// Fetch semesters from MyJKKN API filtered by program
	const fetchSemesters = async (programId?: string) => {
		try {
			setSemestersLoading(true)

			// Determine which program to use
			const targetProgramId = programId || formData.program_id
			if (!targetProgramId || !formData.institutions_id) {
				setSemesters([])
				setSemestersLoading(false)
				return
			}

			// Check cache first
			const cached = semestersCache.get(targetProgramId)
			if (cached) {
				console.log('[CourseOffering] Using cached semesters for program:', targetProgramId)
				setSemesters(cached)
				setSemestersLoading(false)
				return
			}

			// Get the institution with its myjkkn_institution_ids
			const institution = institutions.find(i => i.id === formData.institutions_id)
			const myjkknIds = institution?.myjkkn_institution_ids || []

			if (myjkknIds.length === 0) {
				console.warn('No MyJKKN institution IDs found for institution:', formData.institutions_id)
				setSemesters([])
				setSemestersLoading(false)
				return
			}

			// Get program_code (MyJKKN uses program_id as CODE field like "BCA")
			const program = programs.find(p => p.id === targetProgramId)
			if (!program?.program_code) {
				console.warn('Program code not found for program:', targetProgramId)
				setSemesters([])
				setSemestersLoading(false)
				return
			}

			// Fetch semesters from MyJKKN API using the hook
			// Use program_id (MyJKKN UUID) to filter semesters by program
			const sems = await fetchMyJKKNSemesters(myjkknIds, { program_id: targetProgramId })
			console.log('[CourseOffering] Fetched semesters for program UUID:', targetProgramId, '- Count:', sems.length)

			// Cache the results
			semestersCache.set(targetProgramId, sems)
			setSemesters(sems)
		} catch (e) {
			console.error('Failed to load semesters from MyJKKN:', e)
			setSemesters([])
		} finally {
			setSemestersLoading(false)
		}
	}

	// Fetch programs when institution changes
	useEffect(() => {
		if (formData.institutions_id) {
			// If institutions are not loaded yet, wait for them
			if (institutions.length === 0) {
				// Institutions will be loaded, programs will be fetched when institutions are ready
				return
			}
			// Fetch programs from MyJKKN API for the selected institution
			fetchPrograms(formData.institutions_id)
		} else {
			setPrograms([])
			setSemesters([])
			setCourses([])
		}
	}, [formData.institutions_id, institutions])

	// Fetch semesters when program changes
	useEffect(() => {
		if (formData.program_id && programs.length > 0) {
			// Fetch semesters from MyJKKN API for the selected program
			fetchSemesters(formData.program_id)
		} else {
			setSemesters([])
		}
	}, [formData.program_id, programs])

	// Auto-select semester when editing (match by semester_number)
	useEffect(() => {
		if (editing && semesters.length > 0 && formData.semester_number && !formData.semester_id) {
			const matchingSemester = semesters.find(s => s.semester_number?.toString() === formData.semester_number)
			if (matchingSemester) {
				// Get institution and program codes
				const institution = institutions.find(i => i.id === formData.institutions_id)
				const program = programs.find(p => p.id === formData.program_id)

				// Use semester_code from MyJKKN if available, otherwise generate it
				const semesterCode = matchingSemester.semester_code ||
					`${institution?.institution_code}-${program?.program_code}-Sem${matchingSemester.semester_number}`

				setFormData(prev => ({
					...prev,
					semester_id: matchingSemester.id,
					semester_code: semesterCode,
					semester_number: matchingSemester.semester_number?.toString() || "",
					semester_order: matchingSemester.semester_number?.toString() || ""
				}))

				// After setting semester_code, courses will be fetched automatically by the useEffect
				console.log('[CourseOffering] Auto-selected semester for editing:', semesterCode)
			}
		}
	}, [editing, semesters, formData.semester_number, formData.semester_id, formData.institutions_id, formData.program_id, institutions, programs])

	// Auto-select course when editing and courses are loaded
	useEffect(() => {
		if (editing && courses.length > 0 && formData.course_id) {
			// Check if the current course_id exists in the loaded courses
			const courseExists = courses.find(c => c.id === formData.course_id)
			if (courseExists) {
				console.log('[CourseOffering] Course auto-selected for editing:', courseExists)
			} else {
				console.warn('[CourseOffering] Course not found in loaded courses:', formData.course_id)
			}
		}
	}, [editing, courses, formData.course_id])

	// Fetch courses when program and semester change
	useEffect(() => {
		const fetchProgramCourses = async () => {
			console.log('[CourseOffering] Fetch courses triggered:', {
				institutions_id: formData.institutions_id,
				program_id: formData.program_id,
				semester_code: formData.semester_code
			})

			if (formData.institutions_id && formData.program_id && formData.semester_code) {
				try {
					// Get institution code
					const institution = institutions.find(i => i.id === formData.institutions_id)
					if (!institution?.institution_code) {
						console.warn('[CourseOffering] Institution code not found')
						return
					}

					// Get program code from selected program
					const program = programs.find(p => p.id === formData.program_id)
					if (!program?.program_code) {
						console.warn('[CourseOffering] Program code not found')
						return
					}

					// Fetch courses from course_mapping filtered by institution, program, and semester_code
					const url = `/api/course-management/course-mapping?institution_code=${encodeURIComponent(institution.institution_code)}&program_code=${encodeURIComponent(program.program_code)}&semester_code=${encodeURIComponent(formData.semester_code)}`

					console.log('[CourseOffering] Fetching courses from:', url)

					const res = await fetch(url)
					if (res.ok) {
						const data = await res.json()
						console.log('[CourseOffering] Course mapping data received:', data.length, 'courses for semester_code:', formData.semester_code)
						console.log('[CourseOffering] First item with courses object:', data[0])

						// Extract unique courses (server already enriched with course names)
						// NOTE: Use course_mapping.id as the course_id for course_offerings
						const semesterCourses = Array.isArray(data)
							? data
								.filter((c: any) => c.id) // course_mapping.id
								.map((c: any) => {
									console.log('[CourseOffering] Mapping course_mapping.id:', c.id, c.course_code, '- Title:', c.courses?.course_title)
									return {
										id: c.id, // course_mapping.id (this will be stored as course_id in course_offerings)
										course_code: c.courses?.course_code || c.course_code,
										course_title: c.courses?.course_title || 'N/A',
										institutions_id: c.institutions_id
									}
								})
							: []

						console.log('[CourseOffering] Mapped courses:', semesterCourses)
						setCourses(semesterCourses)
					}
				} catch (e) {
					console.error('Failed to load program courses:', e)
					setCourses([])
				}
			} else {
				console.log('[CourseOffering] Clearing courses - missing required fields')
				setCourses([])
			}
		}

		fetchProgramCourses()
	}, [formData.institutions_id, formData.program_id, formData.semester_code, institutions, programs])

	// Reset dependent form fields when data changes and selected values become invalid
	useEffect(() => {
		if (formData.institutions_id) {
			// Don't reset dependent fields if editing - they should remain set
			// Only reset if the values are invalid (not found in filtered lists)
			if (formData.program_id && !programs.find(p => p.id === formData.program_id)) {
				// Only reset if not editing (editing means we're loading the data)
				if (!editing) {
					setFormData(prev => ({ ...prev, program_id: "" }))
				}
			}
			if (formData.semester_id && !semesters.find(s => s.id === formData.semester_id)) {
				if (!editing) {
					setFormData(prev => ({ ...prev, semester_id: "", semester_code: "", semester_number: "", semester_order: "" }))
				}
			}
			const instSessions = examinationSessions.filter(s => (s as any).institutions_id === formData.institutions_id)
			if (formData.examination_session_id && !instSessions.find(s => s.id === formData.examination_session_id)) {
				if (!editing) {
					setFormData(prev => ({ ...prev, examination_session_id: "" }))
				}
			}
			if (formData.course_id && !courses.find(c => c.id === formData.course_id)) {
				if (!editing) {
					setFormData(prev => ({ ...prev, course_id: "" }))
				}
			}
		}
	}, [formData.institutions_id, programs, semesters, examinationSessions, courses, formData.program_id, formData.semester_id, formData.examination_session_id, formData.course_id, editing])

	// Load reference data on component mount
	useEffect(() => {
		const loadData = async () => {
			await fetchInstitutions()
			// Don't fetch all courses on mount - fetch when institution is selected
			await fetchExaminationSessions()
			// Don't fetch programs here - they will be fetched when institution is selected
		}
		loadData()
	}, [])

	// Fetch course offerings when institution context is ready or changes
	useEffect(() => {
		if (!institutionContextReady) return
		fetchCourseOfferings()
	}, [institutionContextReady, contextInstitutionCode])

	// Load program names from MyJKKN for all course offerings (for index display)
	useEffect(() => {
		if (items.length === 0) return

		const loadProgramNames = async () => {
			// Get unique program IDs from course offerings
			const uniqueProgramIds = Array.from(new Set(items.map(item => item.program_id).filter(Boolean)))

			if (uniqueProgramIds.length === 0) return

			// Lookup all programs at once
			const programsData = await lookupMultiple(uniqueProgramIds, 'program')

			// Create a map for quick lookup
			const newMap = new Map<string, { program_code: string; program_name: string }>()
			for (const [id, program] of programsData) {
				if (program) {
					// MyJKKN uses program_id as CODE field, fallback to program_code
					const programCode = (program as any).program_id || (program as any).program_code || ''
					const programName = (program as any).program_name || (program as any).name || programCode
					newMap.set(id, {
						program_code: programCode,
						program_name: programName
					})
				}
			}

			setProgramsMap(newMap)
		}

		loadProgramNames()
	}, [items, lookupMultiple])

	// Auto-select institution for non-super_admin users using skill helper
	useEffect(() => {
		if (!institutionContextReady) return
		if (!formData.institutions_id) {
			const autoId = getInstitutionIdForCreate()
			if (autoId) {
				setFormData(prev => ({ ...prev, institutions_id: autoId }))
			}
		}
	}, [institutionContextReady, getInstitutionIdForCreate, formData.institutions_id])

	const resetForm = () => {
		// Use institution filter helper to preserve or auto-fill institution
		const preservedInstitutionId = getInstitutionIdForCreate() || ''
		setFormData({
			institutions_id: preservedInstitutionId,
			course_id: "",
			examination_session_id: "",
			program_id: "",
			semester_id: "",
			semester_code: "",
			semester_number: "",
			semester_order: "",
			section: "",
			faculty_id: "",
			max_enrollment: "",
			enrolled_count: "",
			is_active: true,
		})
		setErrors({})
		setEditing(null)
	}

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

	const filtered = useMemo(() => {
		const q = searchTerm.toLowerCase()
		const data = items
			.filter((i) => {
				const course = courses.find(c => c.id === i.course_id)
				const session = examinationSessions.find(s => s.id === i.examination_session_id)
				// Use programsMap for index view (from MyJKKN), fallback to programs array (for form)
				const programData = programsMap.get(i.program_id) || programs.find(p => p.id === i.program_id)
				return [
					course?.course_code,
					course?.course_title,
					session?.session_code,
					session?.session_name,
					programData?.program_code,
					programData?.program_name,
					i.program_code, // Also search by stored program_code
					i.semester?.toString(),
					i.section
				].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
			})
			.filter((i) => statusFilter === "all" || (statusFilter === "active" ? i.is_active : !i.is_active))
			.filter((i) => programFilter === "all" || i.program_id === programFilter || i.program_code === programFilter)
			.filter((i) => semesterFilter === "all" || i.semester?.toString() === semesterFilter)

		if (!sortColumn) return data
		const sorted = [...data].sort((a, b) => {
			const av = (a as any)[sortColumn]
			const bv = (b as any)[sortColumn]
			if (av === bv) return 0
			if (sortDirection === "asc") return av > bv ? 1 : -1
			return av < bv ? 1 : -1
		})
		return sorted
	}, [items, searchTerm, sortColumn, sortDirection, statusFilter, programFilter, semesterFilter, courses, examinationSessions, programs, programsMap])

	const pageSizeOptions = useMemo(() => {
		const base = [10, 20, 50, 100]
		if (filtered.length > 100 && !base.includes(filtered.length)) return [...base]
		return base
	}, [filtered.length])

	const isShowAll = itemsPerPage >= filtered.length && filtered.length > 0
	const effectivePerPage = itemsPerPage
	const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
	const startIndex = (currentPage - 1) * effectivePerPage
	const endIndex = startIndex + effectivePerPage
	const pageItems = filtered.slice(startIndex, endIndex)

	useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, statusFilter, programFilter, semesterFilter, itemsPerPage])

	const openAdd = () => {
		resetForm()
		setSheetOpen(true)
	}

	const openEdit = async (row: CourseOffering) => {
		setEditing(row)

		// For editing, we need to extract semester_number from semester (which is a number in DB)
		// And find the matching MyJKKN semester later
		setFormData({
			institutions_id: row.institutions_id,
			course_id: (row as any).course_mapping_id || row.course_id, // Use course_mapping_id if available
			examination_session_id: row.examination_session_id,
			program_id: row.program_id,
			semester_id: "", // Will be populated after fetching semesters
			semester_code: (row as any).semester_code || "", // Use semester_code from DB if available
			semester_number: row.semester.toString(),
			semester_order: row.semester.toString(), // Assuming semester number is the order
			section: row.section || "",
			faculty_id: row.faculty_id || "",
			max_enrollment: row.max_enrollment?.toString() || "",
			enrolled_count: row.enrolled_count.toString(),
			is_active: row.is_active,
		})

		console.log('[CourseOffering] Editing row:', {
			course_mapping_id: (row as any).course_mapping_id,
			course_id: row.course_id,
			semester_code: (row as any).semester_code,
			semester: row.semester
		})

		// Ensure institutions are loaded before fetching programs
		let institutionsList = institutions
		if (institutionsList.length === 0) {
			institutionsList = await fetchInstitutions()
		}

		// Fetch programs and semesters for the institution when editing
		if (row.institutions_id && row.program_id) {
			const institution = institutionsList.find(i => i.id === row.institutions_id)
			if (institution) {
				// Fetch programs first
				await fetchPrograms(row.institutions_id)
				// Then fetch semesters for the selected program
				await fetchSemesters(row.program_id)

				// After semesters are loaded, we need to match the semester by number
				// This will trigger the useEffect that watches semesters state
			} else {
				console.warn('Institution not found for course offering:', row.institutions_id)
			}
		}

		setSheetOpen(true)
	}

	const validate = () => {
		const e = validateCourseOfferingData(formData)
		setErrors(e)
		return Object.keys(e).length === 0
	}

	const save = async () => {
		if (!validate()) {
			toast({
				title: '⚠️ Validation Error',
				description: 'Please fix all validation errors before submitting.',
				variant: 'destructive',
				className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
			})
			return
		}

		try {
			setLoading(true)

			const payload = {
				institutions_id: formData.institutions_id,
				course_mapping_id: formData.course_id, // course_id stores course_mapping.id
				examination_session_id: formData.examination_session_id,
				program_id: formData.program_id,
				semester: parseInt(formData.semester_order), // Use semester_order for database
				semester_code: formData.semester_code, // Add semester_code from MyJKKN semester
				section: formData.section || null,
				faculty_id: formData.faculty_id || null,
				max_enrollment: formData.max_enrollment ? parseInt(formData.max_enrollment) : null,
				enrolled_count: formData.enrolled_count ? parseInt(formData.enrolled_count) : 0,
				is_active: formData.is_active,
			}

			if (editing) {
				// Update existing Course Offers
				const response = await fetch('/api/course-management/course-offering', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ id: editing.id, ...payload }),
				})

				if (!response.ok) {
					const errorData = await response.json()

					// Build detailed error message
					let errorMessage = errorData.error || 'Failed to update Course Offer'
					if (errorData.details) {
						errorMessage += '\n\n' + (typeof errorData.details === 'string' ? errorData.details : JSON.stringify(errorData.details, null, 2))
					}
					if (errorData.suggestion) {
						errorMessage += '\n\n💡 ' + errorData.suggestion
					}

					throw new Error(errorMessage)
				}

				const updated = await response.json()
				setItems((prev) => prev.map((p) => (p.id === editing.id ? updated : p)))

				toast({
					title: "✅ Course Offer Updated",
					description: "Course Offer has been successfully updated.",
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			} else {
				// Create new Course Offer
				const response = await fetch('/api/course-management/course-offering', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(payload),
				})

				if (!response.ok) {
					const errorData = await response.json()

					// 409 Conflict: offering already exists — guide user to edit it
					if (response.status === 409 && errorData.existingId) {
						const statusLabel = errorData.existingIsActive ? 'Active' : 'Inactive'
						const existingItem = items.find((i) => i.id === errorData.existingId)

						if (existingItem) {
							setSheetOpen(false)
							resetForm()
							toast({
								title: '⚠️ Already Exists',
								description: `This offering already exists (${statusLabel}). Opening it for editing.`,
								className: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200',
								duration: 5000,
							})
							setTimeout(() => openEdit(existingItem), 300)
							return
						}

						// Not in local state — refresh list and inform user
						fetchCourseOfferings()
						toast({
							title: '⚠️ Already Exists',
							description: `This offering already exists (${statusLabel}). The list has been refreshed — find and edit it there.`,
							className: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200',
							duration: 6000,
						})
						setSheetOpen(false)
						resetForm()
						return
					}

					// Build detailed error message for other errors
					let errorMessage = errorData.error || 'Failed to create Course Offer'
					if (errorData.details) {
						if (typeof errorData.details === 'object' && !Array.isArray(errorData.details)) {
							const detailsText = Object.entries(errorData.details)
								.map(([key, value]) => `${key}: ${value}`)
								.join(', ')
							errorMessage += '\n\nDetails: ' + detailsText
						} else {
							errorMessage += '\n\n' + (typeof errorData.details === 'string' ? errorData.details : JSON.stringify(errorData.details))
						}
					}
					if (errorData.suggestion) {
						errorMessage += '\n\n💡 Suggestion: ' + errorData.suggestion
					}

					throw new Error(errorMessage)
				}

				const created = await response.json()
				setItems((prev) => [created, ...prev])

				toast({
					title: "✅ Course Offer Created",
					description: "Course Offer has been successfully created.",
					className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
				})
			}

			setSheetOpen(false)
			resetForm()
		} catch (error) {
			console.error('Error saving Course Offer:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to save Course Offer. Please try again.'
			toast({
				title: "❌ Save Failed",
				description: errorMessage,
				variant: "destructive",
				className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
				duration: 8000, // Longer duration for detailed errors
			})
		} finally {
			setLoading(false)
		}
	}

	const remove = async (id: string) => {
		try {
			setLoading(true)

			const response = await fetch(`/api/course-management/course-offering?id=${id}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || 'Failed to delete Course Offer')
			}

			setItems((prev) => prev.filter((p) => p.id !== id))

			toast({
				title: "✅ Course Offer Deleted",
				description: "Course Offer has been successfully deleted.",
				className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
			})
		} catch (error) {
			console.error('Error deleting Course Offer:', error)
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete Course Offer. Please try again.'
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

	const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })

	// Export/Import/Template handlers
	const handleDownload = () => {
		exportToJSON(filtered, institutions, courses, examinationSessions, programs)
	}

	const handleExport = () => {
		exportToExcel(filtered, institutions, courses, examinationSessions, programs)
	}

	const handleTemplateExport = async () => {
		try {
			// Show loading toast
			toast({
				title: "⏳ Generating Template...",
				description: "Fetching reference data from MyJKKN...",
				className: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200",
			})

			// Get institution(s) to fetch data for - filtered by context
			const targetInstitutions = shouldFilter && contextInstitutionId
				? institutions.filter(i => i.id === contextInstitutionId)
				: institutions

			// Filter sessions by institution context
			const targetSessions = shouldFilter && contextInstitutionId
				? examinationSessions.filter(s => (s as any).institutions_id === contextInstitutionId)
				: examinationSessions

			// Fetch programs and semesters in PARALLEL for all institutions
			const allSemesters: TemplateSemester[] = []
			const allPrograms: Array<{ id: string; program_code: string; program_name: string; program_order?: number }>[] = []

			// Parallel fetch: get programs for all target institutions at once
			const programPromises = targetInstitutions.map(async (inst) => {
				const myjkknIds = inst.myjkkn_institution_ids || []
				if (myjkknIds.length === 0) return []
				const progs = await fetchMyJKKNPrograms(myjkknIds)
				// Map to include program_order from MyJKKN response
				return progs.map(p => ({
					id: p.id,
					program_code: p.program_code,
					program_name: p.program_name,
					program_order: (p as any).program_order ?? (p as any).sort_order ?? 999
				}))
			})

			const programResults = await Promise.all(programPromises)

			// Collect all programs and prepare semester fetch
			const semesterPromises: Promise<void>[] = []

			for (let i = 0; i < targetInstitutions.length; i++) {
				const inst = targetInstitutions[i]
				const instPrograms = programResults[i] || []
				allPrograms.push(instPrograms)

				const myjkknIds = inst.myjkkn_institution_ids || []
				if (myjkknIds.length === 0) continue

				// Fetch semesters for ALL programs in parallel (not sequentially)
				for (const prog of instPrograms) {
					semesterPromises.push(
						fetchMyJKKNSemesters(myjkknIds, { program_id: prog.id }).then(sems => {
							sems.forEach(sem => {
								allSemesters.push({
									id: sem.id,
									semester_name: sem.semester_name,
									semester_code: sem.semester_code,
									semester_number: sem.semester_number,
									semester_order: (sem as any).semester_order ?? sem.semester_number,
									program_code: prog.program_code,
									program_name: prog.program_name
								})
							})
						})
					)
				}
			}

			// Wait for all semester fetches to complete in parallel
			await Promise.all(semesterPromises)

			// Flatten programs for export
			const flatPrograms = allPrograms.flat()

			console.log('[Template Export] Target institutions:', targetInstitutions.length, targetInstitutions.map(i => ({ code: i.institution_code, myjkknIds: i.myjkkn_institution_ids })))
			console.log('[Template Export] Programs fetched:', flatPrograms.length, flatPrograms.slice(0, 5))
			console.log('[Template Export] Semesters fetched:', allSemesters.length, allSemesters.slice(0, 5))
			console.log('[Template Export] Sessions:', targetSessions.length)
			console.log('[Template Export] Courses:', courses.length)

			// Export with filtered data (exportTemplate is async)
			await exportTemplate(
				targetInstitutions,
				courses,
				targetSessions,
				flatPrograms,
				allSemesters
			)

			toast({
				title: "✅ Template Downloaded",
				description: "Course offering template with institution-filtered reference data has been downloaded.",
				className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
			})
		} catch (error) {
			console.error('Error generating template:', error)

			// Fallback: export template with basic data (no MyJKKN fetch)
			const targetInstitutions = shouldFilter && contextInstitutionId
				? institutions.filter(i => i.id === contextInstitutionId)
				: institutions
			const targetSessions = shouldFilter && contextInstitutionId
				? examinationSessions.filter(s => (s as any).institutions_id === contextInstitutionId)
				: examinationSessions

			await exportTemplate(targetInstitutions, courses, targetSessions, programs)

			toast({
				title: "⚠️ Template Downloaded",
				description: "Template downloaded but semester reference data could not be loaded from MyJKKN.",
				className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
			})
		}
	}

	// Confirm import after preview - uses bulk API for batch insert
	const handleConfirmImport = async () => {
		if (importPreviewData.length === 0) return

		const validItems = importPreviewData.filter(item => item.status === 'valid')
		if (validItems.length === 0) {
			toast({
				title: "❌ No Valid Data",
				description: "No valid rows to import. Please fix the errors first.",
				variant: "destructive",
			})
			return
		}

		setImportInProgress(true)

		try {
			const response = await fetch('/api/course-management/course-offering/bulk-import', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					items: validItems.map(item => ({
						rowNumber: item.rowNumber,
						institution_code: item.institution_code,
						course_code: item.course_code,
						session_code: item.session_code,
						program_code: item.program_code,
						semester_code: item.semester_code,
						semester_order: item.semester_order,
						is_active: item.is_active,
					})),
				}),
			})

			const result = await response.json()
			const successCount = result.success || 0
			const errorCount = result.failed || 0
			const uploadErrors = (result.errors || []).map((e: any) => ({
				row: e.row,
				semester: '',
				section: 'N/A',
				errors: e.errors,
			}))

			setImportInProgress(false)
			setImportPreviewOpen(false)
			setImportPreviewData([])

			if (errorCount > 0) {
				setImportErrors(uploadErrors)
				setErrorPopupOpen(true)
			}

			setUploadSummary({ total: validItems.length, success: successCount, failed: errorCount })

			toast({
				title: successCount > 0 ? "✅ Import Complete" : "❌ Import Failed",
				description: `${successCount} imported, ${errorCount} failed`,
				className: successCount > 0
					? "bg-green-50 border-green-200 text-green-800"
					: "bg-red-50 border-red-200 text-red-800",
			})

			if (successCount > 0) {
				fetchCourseOfferings()
			}
		} catch {
			setImportInProgress(false)
			toast({
				title: "❌ Import Failed",
				description: "Network error during bulk import",
				variant: "destructive",
			})
		}
	}

	const handleImport = () => {
		console.log('[Import] Starting import...')
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.json,.csv,.xlsx,.xls'
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0]
			console.log('[Import] File selected:', file?.name, file?.size, 'bytes')
			if (!file) return

			setLoading(true)
			toast({
				title: "⏳ Parsing file...",
				description: "Reading and validating your file...",
				className: "bg-blue-50 border-blue-200 text-blue-800",
			})

			try {
				let rows: any[] = []

				// Parse file based on type
				if (file.name.endsWith('.json')) {
					rows = JSON.parse(await file.text())
				} else if (file.name.endsWith('.csv')) {
					const text = await file.text()
					const lines = text.split('\n').filter(line => line.trim())
					if (lines.length < 2) {
						toast({ title: "❌ Invalid CSV", description: "Need header + data rows", variant: "destructive" })
						setLoading(false)
						return
					}
					const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
					rows = lines.slice(1).map(line => {
						const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
						const row: Record<string, string> = {}
						headers.forEach((h, i) => { row[h] = values[i] || '' })
						return row
					})
				} else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
					const wb = await XLSX.read(await file.arrayBuffer())
					if (!wb.SheetNames?.length) {
						toast({ title: "❌ Invalid Excel", description: "No sheets found", variant: "destructive" })
						setLoading(false)
						return
					}
					rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as any[]
				}

				if (rows.length === 0) {
					toast({ title: "❌ No Data", description: "File is empty", variant: "destructive" })
					setLoading(false)
					return
				}

				// Map rows to standard format
				// cleanCode: strip trailing commas, semicolons, whitespace from Excel cell values
				const cleanCode = (v: string) => v.trim().replace(/[,;]+$/, '').trim()
				const mapped = rows.map((j, index) => ({
					rowNumber: index + 2,
					institution_code: cleanCode(String(j['Institution Code *'] || j['Institution Code'] || j['institution_code'] || '')),
					course_code: cleanCode(String(j['Course Code *'] || j['Course Code'] || j['course_code'] || '')),
					session_code: cleanCode(String(j['Session Code *'] || j['Session Code'] || j['session_code'] || '')),
					program_code: cleanCode(String(j['Program Code *'] || j['Program Code'] || j['program_code'] || '')),
					semester_name: String(j['Semester Name *'] || j['Semester Name'] || j['semester_name'] || '').trim(),
					semester_code: cleanCode(String(j['Semester Code *'] || j['Semester Code'] || j['semester_code'] || '')),
					is_active: String(j['Status'] || j['is_active'] || 'active').toLowerCase() === 'active'
				}))

				// Quick validation for required fields
				const previewData: typeof importPreviewData = []

				for (const item of mapped) {
					const errors: string[] = []
					if (!item.institution_code) errors.push('Institution Code required')
					if (!item.course_code) errors.push('Course Code required')
					if (!item.session_code) errors.push('Session Code required')
					if (!item.program_code) errors.push('Program Code required')
					if (!item.semester_name && !item.semester_code) errors.push('Semester Name required')

					previewData.push({
						...item,
						semester_order: 1,
						status: errors.length > 0 ? 'error' : 'valid',
						errors
					})
				}

				// Get unique institution codes to validate
				const uniqueInstitutions = [...new Set(mapped.map(m => m.institution_code).filter(Boolean))]

				// Validate against MyJKKN (fetch programs & semesters ONCE)
				for (const instCode of uniqueInstitutions) {
					const institution = institutions.find(i => i.institution_code === instCode)
					if (!institution) {
						previewData.filter(p => p.institution_code === instCode).forEach(p => {
							p.status = 'error'
							p.errors.push(`Institution "${instCode}" not found`)
						})
						continue
					}

					const myjkknIds = institution.myjkkn_institution_ids || []
					if (myjkknIds.length === 0) {
						previewData.filter(p => p.institution_code === instCode).forEach(p => {
							p.status = 'error'
							p.errors.push('No MyJKKN IDs configured')
						})
						continue
					}

					// Fetch programs once for this institution
					const myJKKNPrograms = await fetchMyJKKNPrograms(myjkknIds)

					// Get unique program codes for this institution
					const uniquePrograms = [...new Set(
						previewData.filter(p => p.institution_code === instCode && p.status === 'valid')
							.map(p => p.program_code)
					)]

					// Fetch semesters for each unique program (in parallel)
					const semestersByProgram: Record<string, Array<{ semester_code: string; semester_name: string; semester_number?: number }>> = {}

					await Promise.all(uniquePrograms.map(async (progCode) => {
						const program = myJKKNPrograms.find(p =>
							(p as any).program_id === progCode || p.program_code === progCode
						)
						if (program) {
							const sems = await fetchMyJKKNSemesters(myjkknIds, { program_id: program.id })
							semestersByProgram[progCode] = sems
						}
					}))

					// Validate each row for this institution
					for (const item of previewData.filter(p => p.institution_code === instCode)) {
						if (item.status === 'error') continue

						// Validate program
						const program = myJKKNPrograms.find(p =>
							(p as any).program_id === item.program_code || p.program_code === item.program_code
						)
						if (!program) {
							item.status = 'error'
							item.errors.push(`Program "${item.program_code}" not found`)
							continue
						}

						// Validate semester
						const semesters = semestersByProgram[item.program_code] || []
						let semester = null

						if (item.semester_name) {
							semester = semesters.find(s =>
								s.semester_name.toLowerCase() === item.semester_name.toLowerCase()
							)
						} else if (item.semester_code) {
							semester = semesters.find(s => s.semester_code === item.semester_code)
						}

						if (!semester) {
							item.status = 'error'
							const availableSems = semesters.map(s => s.semester_name).join(', ')
							item.errors.push(`Semester "${item.semester_name || item.semester_code}" not found. Available: ${availableSems || 'none'}`)
						} else {
							item.semester_code = semester.semester_code
							item.semester_order = semester.semester_number || parseInt(semester.semester_name.replace(/\D/g, '')) || 1
						}
					}
				}

				setLoading(false)
				setImportPreviewData(previewData)
				setImportPreviewOpen(true)

			} catch (error) {
				console.error('[Import] Error:', error)
				setLoading(false)
				toast({
					title: "❌ Import Error",
					description: error instanceof Error ? error.message : "Failed to parse file",
					variant: "destructive",
				})
			}
		}
		input.click()
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col min-h-screen">
				<AppHeader />
				<PageTransition>
					<div className="flex flex-1 flex-col gap-3 p-4 pt-0 overflow-y-auto">
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
									<BreadcrumbPage>Course Offers</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>

					{/* Stats Cards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
						<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{items.length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Offerings</p>
									</div>
									<BookOpen className="h-5 w-5 text-blue-500/40" />
								</div>
							</CardContent>
						</Card>

						<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{items.filter(i => i.is_active).length}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Active</p>
									</div>
									<CheckCircle className="h-5 w-5 text-emerald-500/40" />
								</div>
							</CardContent>
						</Card>

						<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">{items.reduce((sum, i) => sum + i.enrolled_count, 0)}</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Enrolled</p>
									</div>
									<Users className="h-5 w-5 text-purple-500/40" />
								</div>
							</CardContent>
						</Card>

						<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
							<CardContent className="p-4">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-2xl font-bold tracking-tight">
											{items.length > 0 ? Math.round(items.reduce((sum, i) => sum + i.enrolled_count, 0) / items.length) : 0}
										</p>
										<p className="text-xs font-medium text-muted-foreground mt-0.5">Avg Enrollment</p>
									</div>
									<TrendingUp className="h-5 w-5 text-amber-500/40" />
								</div>
							</CardContent>
						</Card>
					</div>

					<TooltipProvider delayDuration={300}>
					<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 px-6 py-4 border-b">
							<div className="space-y-3">
								{/* Row 1: Title (Left) & Action Buttons (Right) */}
								<div className="flex items-center justify-between">
									<div>
										<h2 className="text-base font-semibold">All Course Offers</h2>
										<p className="text-xs text-muted-foreground">Manage course offerings by program and semester</p>
									</div>

									<div className="flex items-center gap-2">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button variant="outline" size="sm" onClick={fetchCourseOfferings} disabled={loading} className="h-8 w-8 p-0">
													<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Refresh</TooltipContent>
										</Tooltip>

										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="outline" size="sm" className="h-8 text-sm px-3">
													<Download className="h-4 w-4 mr-1" />
													Export
													<ChevronDown className="h-3 w-3 ml-1" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-44">
												<DropdownMenuItem onClick={handleTemplateExport}>
													<FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Download Template
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem onClick={handleExport}>
													<Download className="h-3.5 w-3.5 mr-2" /> Export Excel
												</DropdownMenuItem>
												<DropdownMenuItem onClick={handleDownload}>
													<FileJson className="h-3.5 w-3.5 mr-2" /> Export JSON
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>

										<Button variant="outline" size="sm" onClick={handleImport} className="h-8 text-sm px-3">
											<Upload className="h-4 w-4 mr-1" />
											Import
										</Button>

										<Link href="/course-management/course-offering/program-wise">
											<Button variant="outline" size="sm" className="h-8 text-sm px-3">
												<LayoutList className="h-4 w-4 mr-1" />
												Program Wise
											</Button>
										</Link>

										<Button size="sm" onClick={openAdd} disabled={loading} className="h-8 text-sm px-4">
											<PlusCircle className="h-4 w-4 mr-1" />
											Add Offer
										</Button>
									</div>
								</div>

								{/* Row 2: Filter and Search Row */}
								<div className="flex items-center gap-2 flex-wrap">
									<Select value={statusFilter} onValueChange={setStatusFilter}>
										<SelectTrigger className="h-8 text-sm w-[130px]">
											<SelectValue placeholder="All Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Status</SelectItem>
											<SelectItem value="active">Active</SelectItem>
											<SelectItem value="inactive">Inactive</SelectItem>
										</SelectContent>
									</Select>

									<Select value={programFilter} onValueChange={setProgramFilter}>
										<SelectTrigger className="h-8 text-sm w-[180px]">
											<SelectValue placeholder="All Programs" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Programs</SelectItem>
											{/* Get unique programs from items */}
											{Array.from(new Set(items.map(i => i.program_id).filter(Boolean))).map(progId => {
												const programData = programsMap.get(progId) || programs.find(p => p.id === progId)
												return programData ? (
													<SelectItem key={progId} value={progId}>
														{programData.program_code} - {programData.program_name}
													</SelectItem>
												) : null
											})}
										</SelectContent>
									</Select>

									<Select value={semesterFilter} onValueChange={setSemesterFilter}>
										<SelectTrigger className="h-8 text-sm w-[140px]">
											<SelectValue placeholder="All Semesters" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Semesters</SelectItem>
											{/* Get unique semesters from items */}
											{Array.from(new Set(items.map(i => i.semester).filter(Boolean))).sort((a, b) => a - b).map(sem => (
												<SelectItem key={sem} value={sem.toString()}>
													Semester {sem}
												</SelectItem>
											))}
										</SelectContent>
									</Select>

									<div className="relative flex-1 max-w-sm">
										<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
										<Input
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											placeholder="Search course offerings..."
											className="pl-8 h-8 text-sm"
										/>
									</div>
								</div>
							</div>
						</CardHeader>
						<CardContent className="flex-1 overflow-auto p-0">
							<Table>
								<TableHeader className="sticky top-0 z-10 bg-muted/50">
									<TableRow>
										{/* Show Institution column only when "All Institutions" is selected globally */}
										{mustSelectInstitution && (
											<TableHead className="text-xs font-semibold">
												<Button variant="ghost" size="sm" onClick={() => handleSort("institution_code")} className="px-2 h-auto">
													Institution
													<span className="ml-1">{getSortIcon("institution_code")}</span>
												</Button>
											</TableHead>
										)}
										<TableHead className="text-xs font-semibold">
											<Button variant="ghost" size="sm" onClick={() => handleSort("course_code")} className="px-2 h-auto">
												Course Code
												<span className="ml-1">{getSortIcon("course_code")}</span>
											</Button>
										</TableHead>
										<TableHead className="text-xs font-semibold">
											<Button variant="ghost" size="sm" onClick={() => handleSort("program_code")} className="px-2 h-auto">
												Program
												<span className="ml-1">{getSortIcon("program_code")}</span>
											</Button>
										</TableHead>
										<TableHead className="text-xs font-semibold">
											<Button variant="ghost" size="sm" onClick={() => handleSort("semester")} className="px-2 h-auto">
												Semester
												<span className="ml-1">{getSortIcon("semester")}</span>
											</Button>
										</TableHead>
										<TableHead className="text-xs font-semibold">
											<Button variant="ghost" size="sm" onClick={() => handleSort("is_active")} className="px-2 h-auto">
												Status
												<span className="ml-1">{getSortIcon("is_active")}</span>
											</Button>
										</TableHead>
										<TableHead className="text-center text-xs font-semibold">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{loading ? (
										<TableRow>
											<TableCell colSpan={mustSelectInstitution ? 6 : 5} className="h-32 text-center">
												<div className="flex flex-col items-center gap-2 text-muted-foreground">
													<RefreshCw className="h-5 w-5 animate-spin" />
													<span className="text-sm">Loading course offerings...</span>
												</div>
											</TableCell>
										</TableRow>
									) : pageItems.length ? (
										<>
											{pageItems.map((row) => {
												// Use programsMap for index view (from MyJKKN), fallback to programs array (for form)
												const programData = programsMap.get(row.program_id) || programs.find(p => p.id === row.program_id)
												const programDisplay = programData
													? `${programData.program_code} - ${programData.program_name}`
													: row.program_code || 'N/A'
												return (
													<TableRow key={row.id} className="hover:bg-muted/50">
														{mustSelectInstitution && (
															<TableCell>{row.institution_code || '-'}</TableCell>
														)}
														<TableCell className="font-medium">{row.course_code || 'N/A'}</TableCell>
														<TableCell>{programDisplay}</TableCell>
														<TableCell className="font-medium">{row.semester}</TableCell>
														<TableCell>
															<Badge
																variant={row.is_active ? "default" : "secondary"}
																className={`text-xs ${row.is_active
																	? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400'
																	: 'bg-muted text-muted-foreground'
																	}`}
															>
																{row.is_active ? "Active" : "Inactive"}
															</Badge>
														</TableCell>
														<TableCell className="text-center">
															<DropdownMenu>
																<DropdownMenuTrigger asChild>
																	<Button variant="ghost" size="sm" className="h-7 w-7 p-0">
																		<MoreHorizontal className="h-4 w-4" />
																	</Button>
																</DropdownMenuTrigger>
																<DropdownMenuContent align="end" className="w-36">
																	<DropdownMenuItem onClick={() => openEdit(row)}>
																		<Edit className="h-3.5 w-3.5 mr-2" /> Edit
																	</DropdownMenuItem>
																	<DropdownMenuSeparator />
																	<DropdownMenuItem
																		className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
																		onClick={() => setDeleteTarget(row)}
																	>
																		<Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
																	</DropdownMenuItem>
																</DropdownMenuContent>
															</DropdownMenu>
														</TableCell>
													</TableRow>
												)
											})}
										</>
									) : (
										<TableRow>
											<TableCell colSpan={mustSelectInstitution ? 6 : 5} className="h-32 text-center">
												<div className="flex flex-col items-center gap-2 text-muted-foreground">
													<BookOpen className="h-8 w-8 opacity-20" />
													<p className="text-sm font-medium">No course offerings found</p>
													<p className="text-xs">Try adjusting your filters or add a new offering</p>
												</div>
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>

							{/* Pagination */}
							<div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
								<div className="flex items-center gap-3">
									<p className="text-xs text-muted-foreground">
										{filtered.length === 0 ? 'No results' : `${startIndex + 1}-${Math.min(endIndex, filtered.length)} of ${filtered.length}`}
									</p>
									<div className="flex items-center gap-1.5">
										<span className="text-xs text-muted-foreground">Rows:</span>
										<Select
											value={String(itemsPerPage)}
											onValueChange={(value) => setItemsPerPage(Number(value))}
										>
											<SelectTrigger className="h-7 w-[70px] text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="10">10</SelectItem>
												<SelectItem value="20">20</SelectItem>
												<SelectItem value="50">50</SelectItem>
												<SelectItem value="100">100</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
								<div className="flex items-center gap-1">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
										disabled={currentPage === 1}
										className="h-7 w-7 p-0"
									>
										<ChevronLeft className="h-4 w-4" />
									</Button>
									<span className="text-xs text-muted-foreground px-2">
										{currentPage} / {totalPages}
									</span>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
										disabled={currentPage >= totalPages}
										className="h-7 w-7 p-0"
									>
										<ChevronRight className="h-4 w-4" />
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
					</TooltipProvider>
				</div>
				</PageTransition>
				<AppFooter />
			</SidebarInset>

			<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
				<SheetContent className="sm:max-w-[600px] overflow-y-auto">
					<SheetHeader className="pb-4 border-b">
						<SheetTitle className="text-lg font-semibold">
							{editing ? "Edit Course Offering" : "Add Course Offering"}
						</SheetTitle>
						<p className="text-sm text-muted-foreground">
							{editing ? "Update course offering information" : "Create a new course offering"}
						</p>
					</SheetHeader>

					<div className="mt-6 space-y-8">
						{/* Basic Information Section */}
						<div className="space-y-4">
							<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</p>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Institution - show field only when selection is needed */}
								{mustSelectInstitution || !shouldFilter || !contextInstitutionId ? (
									<div className="space-y-2 md:col-span-2">
										<Label htmlFor="institutions_id" className="text-sm font-semibold">
											Institution <span className="text-red-500">*</span>
										</Label>
										<Select
											value={formData.institutions_id}
											onValueChange={(v) => setFormData({ ...formData, institutions_id: v })}
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
								) : null}

								{/* Examination Session */}
								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="examination_session_id" className="text-sm font-semibold">
										Examination Session <span className="text-red-500">*</span>
									</Label>
									<Select
										value={formData.examination_session_id}
										onValueChange={(v) => setFormData({ ...formData, examination_session_id: v })}
										disabled={!formData.institutions_id}
									>
										<SelectTrigger id="examination_session_id" className={`h-10 ${errors.examination_session_id ? 'border-destructive' : ''}`}>
											<SelectValue placeholder={formData.institutions_id ? "Select examination session" : "Select institution first"} />
										</SelectTrigger>
										<SelectContent>
											{filteredExaminationSessions.map((session) => (
												<SelectItem key={session.id} value={session.id}>
													{session.session_name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errors.examination_session_id && <p className="text-xs text-destructive">{errors.examination_session_id}</p>}
								</div>

								{/* Program */}
								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="program_id" className="text-sm font-semibold">
										Program <span className="text-red-500">*</span>
									</Label>
									<Select
										value={formData.program_id}
										onValueChange={(v) => setFormData({ ...formData, program_id: v })}
										disabled={!formData.institutions_id || programsLoading}
									>
										<SelectTrigger id="program_id" className={`h-10 ${errors.program_id ? 'border-destructive' : ''}`}>
											<SelectValue placeholder={
												!formData.institutions_id
													? "Select institution first"
													: programsLoading
														? "Loading programs..."
														: filteredPrograms.length === 0
															? "No programs found"
															: "Select program"
											} />
										</SelectTrigger>
										<SelectContent>
											<div className="p-2">
												<Input
													placeholder="Search programs..."
													className="h-8 text-xs"
													onChange={(e) => setProgramSearch(e.target.value)}
												/>
											</div>
											{filteredPrograms
												.sort((a, b) => {
													// Sort by program_code for now (program_order if available)
													return (a.program_code || '').localeCompare(b.program_code || '')
												})
												.map((program) => (
													<SelectItem key={program.id} value={program.id}>
														{program.program_code} - {program.program_name}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
									{errors.program_id && <p className="text-xs text-destructive">{errors.program_id}</p>}
								</div>

								{/* Semester */}
								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="semester" className="text-sm font-semibold">
										Semester <span className="text-red-500">*</span>
									</Label>
									<Select
										value={formData.semester_id}
										onValueChange={(v) => {
											// Find the selected semester to populate all fields
											const selectedSem = semesters.find(s => s.id === v)
											if (selectedSem) {
												// Get institution and program codes
												const institution = institutions.find(i => i.id === formData.institutions_id)
												const program = programs.find(p => p.id === formData.program_id)

												// Use semester_code from MyJKKN if available, otherwise generate it
												const semesterCode = selectedSem.semester_code ||
													`${institution?.institution_code}-${program?.program_code}-Sem${selectedSem.semester_number}`

												setFormData({
													...formData,
													semester_id: v,
													semester_code: semesterCode,
													semester_number: selectedSem.semester_number?.toString() || "",
													semester_order: selectedSem.semester_number?.toString() || "" // Use semester_number as order for now
												})
											}
										}}
										disabled={!formData.program_id || semestersLoading}
									>
										<SelectTrigger id="semester" className={`h-10 ${errors.semester_code ? 'border-destructive' : ''}`}>
											<SelectValue placeholder={
												!formData.program_id
													? "Select program first"
													: semestersLoading
														? "Loading semesters..."
														: filteredSemesters.length === 0
															? "No semesters found"
															: "Select semester"
											} />
										</SelectTrigger>
										<SelectContent>
											<div className="p-2">
												<Input
													placeholder="Search semesters..."
													className="h-8 text-xs"
													onChange={(e) => setSemesterSearch(e.target.value)}
												/>
											</div>
											{filteredSemesters
												.sort((a, b) => {
													// Sort by semester_number (which we extract from semester data)
													return (a.semester_number || 0) - (b.semester_number || 0)
												})
												.map((semester) => (
													<SelectItem key={semester.id} value={semester.id}>
														{semester.semester_name}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
									{errors.semester_code && <p className="text-xs text-destructive">{errors.semester_code}</p>}
								</div>

								{/* Course */}
								<div className="space-y-2 md:col-span-2">
									<Label htmlFor="course_id" className="text-sm font-semibold">
										Course <span className="text-red-500">*</span>
									</Label>
									<Select
										value={formData.course_id}
										onValueChange={(v) => setFormData({ ...formData, course_id: v })}
										disabled={!formData.program_id || !formData.semester_code}
									>
										<SelectTrigger id="course_id" className={`h-10 ${errors.course_id ? 'border-destructive' : ''}`}>
											<SelectValue placeholder={
												!formData.program_id
													? "Select program first"
													: !formData.semester_code
														? "Select semester first"
														: filteredCourses.length === 0
															? "No courses found"
															: "Select course"
											} />
										</SelectTrigger>
										<SelectContent>
											<div className="p-2">
												<Input
													placeholder="Search courses..."
													className="h-8 text-xs"
													onChange={(e) => setCourseSearch(e.target.value)}
												/>
											</div>
											{filteredCourses.map((course) => (
												<SelectItem key={course.id} value={course.id}>
													{course.course_code} - {course.course_title}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errors.course_id && <p className="text-xs text-destructive">{errors.course_id}</p>}
								</div>
							</div>
						</div>

						{/* Status Section */}
						<div className="space-y-4">
							<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
							<div className="flex items-center gap-4">
								<Label className="text-sm font-semibold">Offering Status</Label>
								<button
									type="button"
									onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
									className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.is_active ? 'bg-green-500' : 'bg-gray-300'
										}`}
								>
									<span
										className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_active ? 'translate-x-6' : 'translate-x-1'
											}`}
									/>
								</button>
								<span className={`text-sm font-medium ${formData.is_active ? 'text-green-600' : 'text-red-500'}`}>
									{formData.is_active ? 'Active' : 'Inactive'}
								</span>
							</div>
						</div>

						{/* Action Buttons */}
						<div className="flex justify-end gap-3 pt-6 border-t">
							<Button
								variant="outline"
								className="h-10 px-6"
								onClick={() => { setSheetOpen(false); resetForm() }}
							>
								Cancel
							</Button>
							<Button
								className="h-10 px-6"
								onClick={save}
								disabled={loading}
							>
								{editing ? "Update Offering" : "Create Offering"}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Standalone Delete AlertDialog */}
			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Course Offering</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete <strong>{deleteTarget?.course_code}</strong>? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => { if (deleteTarget) remove(deleteTarget.id); setDeleteTarget(null) }}
							className="bg-red-600 hover:bg-red-700"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Import Preview Dialog */}
			<AlertDialog open={importPreviewOpen} onOpenChange={setImportPreviewOpen}>
				<AlertDialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
					<AlertDialogHeader>
						<AlertDialogTitle className="text-xl font-bold flex items-center gap-2">
							<FileSpreadsheet className="h-5 w-5" />
							Import Preview
						</AlertDialogTitle>
						<AlertDialogDescription>
							Review the data before importing. {importPreviewData.filter(d => d.status === 'valid').length} of {importPreviewData.length} rows are valid.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className="flex-1 overflow-auto border rounded-lg">
						<table className="w-full text-sm">
							<thead className="bg-muted sticky top-0">
								<tr>
									<th className="px-3 py-2 text-left font-medium">Row</th>
									<th className="px-3 py-2 text-left font-medium">Status</th>
									<th className="px-3 py-2 text-left font-medium">Institution</th>
									<th className="px-3 py-2 text-left font-medium">Course</th>
									<th className="px-3 py-2 text-left font-medium">Session</th>
									<th className="px-3 py-2 text-left font-medium">Program</th>
									<th className="px-3 py-2 text-left font-medium">Semester</th>
									<th className="px-3 py-2 text-left font-medium">Errors</th>
								</tr>
							</thead>
							<tbody>
								{importPreviewData.map((item, index) => (
									<tr key={index} className={item.status === 'error' ? 'bg-red-50 dark:bg-red-900/10' : 'hover:bg-muted/50'}>
										<td className="px-3 py-2 font-mono text-xs">{item.rowNumber}</td>
										<td className="px-3 py-2">
											{item.status === 'valid' ? (
												<Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300">Valid</Badge>
											) : (
												<Badge variant="destructive">Error</Badge>
											)}
										</td>
										<td className="px-3 py-2 font-mono text-xs">{item.institution_code}</td>
										<td className="px-3 py-2 font-mono text-xs">{item.course_code}</td>
										<td className="px-3 py-2 font-mono text-xs">{item.session_code}</td>
										<td className="px-3 py-2 font-mono text-xs">{item.program_code}</td>
										<td className="px-3 py-2 text-xs">{item.semester_name || item.semester_code}</td>
										<td className="px-3 py-2 text-xs text-red-600 dark:text-red-400">
											{item.errors.length > 0 && (
												<ul className="list-disc list-inside">
													{item.errors.map((err, i) => <li key={i}>{err}</li>)}
												</ul>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<AlertDialogFooter className="flex-shrink-0 pt-4">
						<AlertDialogCancel disabled={importInProgress}>Cancel</AlertDialogCancel>
						<Button
							onClick={handleConfirmImport}
							disabled={importInProgress || importPreviewData.filter(d => d.status === 'valid').length === 0}
							className="bg-green-600 hover:bg-green-700"
						>
							{importInProgress ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Importing...
								</>
							) : (
								<>
									<Upload className="mr-2 h-4 w-4" />
									Import {importPreviewData.filter(d => d.status === 'valid').length} Valid Rows
								</>
							)}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Error Popup Dialog */}
			<AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
				<AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
					<AlertDialogHeader>
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
								<XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
							</div>
							<div>
								<AlertDialogTitle className="text-xl font-bold text-red-600 dark:text-red-400">
									Data Validation Errors
								</AlertDialogTitle>
								<AlertDialogDescription className="text-sm text-muted-foreground mt-1">
									Please fix the following errors before importing the data
								</AlertDialogDescription>
							</div>
						</div>
					</AlertDialogHeader>

					<div className="space-y-4">
						{/* Upload Summary */}
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

						<div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
							<div className="flex items-center gap-2 mb-2">
								<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
								<span className="font-semibold text-red-800 dark:text-red-200">
									{importErrors.length} row{importErrors.length > 1 ? 's' : ''} failed validation
								</span>
							</div>
							<p className="text-sm text-red-700 dark:text-red-300">
								Please correct these errors in your Excel file and try uploading again. Row numbers correspond to your Excel file (including header row).
							</p>
						</div>

						<div className="space-y-3">
							{importErrors.map((error, index) => (
								<div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5">
									<div className="flex items-start justify-between mb-2">
										<div className="flex items-center gap-2">
											<Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700">
												Row {error.row}
											</Badge>
											<span className="font-medium text-sm">
												Semester {error.semester} - Section {error.section}
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

						<div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
							<div className="flex items-start gap-2">
								<div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mt-0.5">
									<span className="text-xs font-bold text-blue-600 dark:text-blue-400">i</span>
								</div>
								<div>
									<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Common Fixes:</h4>
									<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
										<li>• Ensure all required fields are provided (institution, course, session, program, semester)</li>
										<li>• Semester must be between 1 and 12</li>
										<li>• Max enrollment must be greater than 0 (if provided)</li>
										<li>• Enrolled count cannot be negative</li>
										<li>• Enrolled count cannot exceed max enrollment</li>
										<li>• All foreign keys must reference existing records</li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">
							Close
						</AlertDialogCancel>
						<Button
							onClick={() => {
								setErrorPopupOpen(false)
								setImportErrors([])
							}}
							className="bg-blue-600 hover:bg-blue-700 text-white"
						>
							Try Again
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SidebarProvider>
	)
}
