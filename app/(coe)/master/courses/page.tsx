"use client"

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect, toSearchableOptions } from '@/components/ui/searchable-select'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { PageTransition } from '@/components/common/page-transition'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useToast } from '@/hooks/common/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Download,
  Upload,
  PlusCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  BookText,
  Edit,
  Trash2,
  FileSpreadsheet,
  RefreshCw,
  FileJson,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  XCircle,
  Eye,
  FileUp,
  MoreHorizontal,
  Loader2,
  CheckCircle,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import XLSX from '@/lib/utils/excel-compat'
import type { Course, CourseImportError, UploadSummary, CourseStatus, CourseInfo } from '@/types/courses'
import { COURSE_STATUS_OPTIONS, COURSE_LEVELS } from '@/types/courses'
import {
  fetchCourses as fetchCoursesService,
  createCourse,
  updateCourse,
  deleteCourse as deleteCourseService,
  fetchDropdownData,
  downloadTemplate,
  fetchRegulationsForCourse,
  fetchDepartmentsForCourse,
  fetchBoardsForCourse,
  fetchCourseInfo,
} from '@/services/master/courses-service'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'

// Fallback list of course types — used only if the course_info API call fails.
// In normal operation, this dropdown is populated from the public.course_info
// master table (see /api/master/course-info). Keep this list as a safety net.
const COURSE_TYPES_FALLBACK = [
  'Ability Enhancement', 'Additional Credit course', 'Advance learner course',
  'Audit Course', 'Bridge course', 'Core Practical', 'Core',
  'Discipline Specific elective Practical', 'Discipline Specific elective',
  'Elective Practical', 'Elective', 'English',
  'Extra Disciplinary Elective Practical', 'Extra Disciplinary',
  'Foundation Course', 'Generic Elective Practical', 'Generic Elective',
  'Internship', 'Language', 'Naanmuthalvan', 'Non Academic',
  'Non Major Elective Practical', 'Non Major Elective',
  'Practical', 'Project', 'Skill Enhancement Practical', 'Skill Enhancement',
  'Humanities, Social Sciences & Management Courses',
  'Basic Science Courses',
  'Engineering Science Courses',
  'Employability Enhancement Courses',
  'Professional Core Courses',
  'Programme Core',
  'Programme Elective',
  'Open Elective Courses',
  'Mandatory Courses',
  'Engineering Science (General)',
  'Basic Science',
  'Humanities',
  'Skill Development',
  'Self Learning',
  'Project Work',
  'Internship cum Project Work',
  'Lab Integrated Theory',
  'Department Intro Course',
  'Total Contact Period',
  'Professional Competency Skill',
] as const

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [evaluationTypeFilter, setEvaluationTypeFilter] = useState("all")
  const [courseStatusFilter, setCourseStatusFilter] = useState<'all' | CourseStatus>('all')

  // Warning dialog when changing courses_status away from 'Locked'
  const [lockedWarning, setLockedWarning] = useState<{
    open: boolean
    targetValue: CourseStatus | null
  }>({ open: false, targetValue: null })
  const [sortField, setSortField] = useState<'course_code' | 'course_title' | 'course_category' | 'credits' | 'exam_duration' | 'is_active' | 'qp_code' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)

  // Single-page add/edit state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const { toast } = useToast()
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Dropdown sources
  const [institutions, setInstitutions] = useState<Array<{ id: string, institution_code: string, name?: string, counselling_code?: string | null }>>([])
  const [departmentsSrc, setDepartmentsSrc] = useState<Array<{ id: string, department_code: string, department_name?: string }>>([])
  const [regulations, setRegulations] = useState<Array<{ id: string, regulation_code: string, regulation_name?: string, effective_year?: number }>>([])
  const [boardsSrc, setBoardsSrc] = useState<Array<{ id: string, board_code: string, board_name?: string }>>([])
  const [courseInfoList, setCourseInfoList] = useState<CourseInfo[]>([])
  // Active course type names — sourced from course_info table, falls back to legacy hardcoded list.
  const COURSE_TYPES: string[] = courseInfoList.length > 0
    ? courseInfoList.map(ci => ci.course_type)
    : (COURSE_TYPES_FALLBACK as unknown as string[])
  // Lookup: course_type -> display_code (used to render live preview of course_type_code)
  const displayCodeByType = courseInfoList.reduce<Record<string, string>>((acc, ci) => {
    acc[ci.course_type] = ci.display_code
    return acc
  }, {})
  const [levelFilter, setLevelFilter] = useState('all')
  const [courseInfoLoading, setCourseInfoLoading] = useState(false)
  const [codesLoading, setCodesLoading] = useState(false)
  const [regulationsLoading, setRegulationsLoading] = useState(false)
  const [departmentsLoading, setDepartmentsLoading] = useState(false)
  const [boardsLoading, setBoardsLoading] = useState(false)
   
  // Import error handling

  const [errorPopupOpen, setErrorPopupOpen] = useState(false)
  const [importErrors, setImportErrors] = useState<CourseImportError[]>([])
  const [uploadSummary, setUploadSummary] = useState<UploadSummary>({ total: 0, success: 0, failed: 0 })
  const [importInProgress, setImportInProgress] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importPhase, setImportPhase] = useState<'reading' | 'processing' | 'finalizing'>('reading')
  const [failedRowsData, setFailedRowsData] = useState<Record<string, unknown>[]>([])

  // Helper to sanitize null/undefined/"null" string values to empty string
  const s = (val: any): string => (!val || val === 'null') ? '' : String(val)

  const [formData, setFormData] = useState({
    institution_code: '',
    regulation_code: '',
    board_code: '',
    course_code: '',
    course_title: '',
    display_code: '',
    course_category: '',
    course_type: '',
    course_level: '',
    course_part_master: '',
    credits: '',
    split_credit: false,
    theory_credit: '',
    practical_credit: '',
    qp_code: '',
    e_code_name: '',
    exam_duration: '',
    evaluation_type: '',
    result_type: 'Mark',
    credit_included: true,
    self_study_course: false,
    outside_class_course: false,
    open_book: false,
    online_course: false,
    dummy_number_required: false,
    annual_course: false,
    multiple_qp_set: false,
    no_of_qp_setter: '',
    no_of_scrutinizer: '',
    fee_exception: false,
    has_hall_ticket: true,
    syllabus_pdf_url: '',
    description: '',
    is_active: true,
    courses_status: 'Pending' as CourseStatus,
    // Required fields for marks and hours
    class_hours: '0',
    theory_hours: '0',
    tutorial_hours: '0',
    practical_hours: '0',
    internal_max_mark: '0',
    internal_pass_mark: '0',
    internal_converted_mark: '0',
    external_max_mark: '0',
    external_pass_mark: '0',
    external_converted_mark: '0',
    total_pass_mark: '0',
    total_max_mark: '0',
    annual_semester: false,
    registration_based: false,
  })

  // Institution filtering hook - automatically filters data by institution
  const {
    filter: institutionFilter,
    shouldFilter,
    isReady,
    institutionCode,
    appendToUrl,
    getInstitutionCodeForCreate,
    mustSelectInstitution
  } = useInstitutionFilter()

  // Auto-fill institution_code for create based on global filter
  useEffect(() => {
    if (!isReady) return
    if (!formData.institution_code && institutionCode) {
      setFormData(prev => ({
        ...prev,
        institution_code: prev.institution_code || institutionCode,
      }))
    }
  }, [isReady, institutionCode, formData.institution_code])

  // Fetch courses from API with institution filtering
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        // Pass institution filter to service - courses are filtered by institution_code
        // shouldFilter=true for non-super admin ensures empty results if no institution assigned
        const data = await fetchCoursesService(shouldFilter ? institutionFilter : undefined, shouldFilter)
        setCourses(data)
      } catch (error: any) {
        console.error('Error fetching courses:', error)

        // Check if courses table doesn't exist
        if (error.message && error.message.includes('Courses table not found')) {
          alert(`Database Setup Required:\n\n${error.message}\n\nPlease check the console for setup instructions.`)
        }
      } finally {
        setLoading(false)
      }
    }

    // Wait for institution context to be ready before fetching
    if (isReady) {
      fetchCourses()
    }
    // also fetch dropdown codes (regulations are now fetched separately based on selected institution)
    ;(async () => {
      try {
        setCodesLoading(true)
        const { institutions, departments, boards } = await fetchDropdownData()
        setInstitutions(institutions)
        setDepartmentsSrc(departments)
        setBoardsSrc(boards)
        // Note: regulations are no longer pre-loaded - they are fetched dynamically when institution changes
      } catch (e) {
        console.error('Error loading codes:', e)
      } finally {
        setCodesLoading(false)
      }
    })()
    // Load course_info master list (drives Course Type dropdown)
    ;(async () => {
      try {
        setCourseInfoLoading(true)
        const data = await fetchCourseInfo()
        setCourseInfoList(data)
      } catch (e) {
        console.error('Error loading course_info:', e)
      } finally {
        setCourseInfoLoading(false)
      }
    })()
  }, [institutionFilter, shouldFilter, isReady]) // Re-fetch when institution changes

  // Fetch regulations, departments, and boards in PARALLEL when institution changes
  useEffect(() => {
    const loadInstitutionData = async () => {
      if (!formData.institution_code) {
        setRegulations([])
        setDepartmentsSrc([])
        setBoardsSrc([])
        return
      }

      // Find the institution to get its counselling_code for regulations
      const institution = institutions.find(i => i.institution_code === formData.institution_code)
      const counsellingCode = institution?.counselling_code

      // Set all loading states at once
      setRegulationsLoading(true)
      setDepartmentsLoading(true)
      setBoardsLoading(true)

      // Fetch all data in parallel for faster loading
      const [regsResult, deptsResult, boardsResult] = await Promise.allSettled([
        // Regulations - requires counselling_code
        counsellingCode
          ? fetchRegulationsForCourse(counsellingCode)
          : Promise.resolve([]),
        // Departments - uses institution_code directly
        fetchDepartmentsForCourse(formData.institution_code),
        // Boards - uses institution_code directly
        fetchBoardsForCourse(formData.institution_code)
      ])

      // Handle regulations result
      if (regsResult.status === 'fulfilled') {
        setRegulations(regsResult.value)
      } else {
        console.error('[CoursesPage] Error loading regulations:', regsResult.reason)
        setRegulations([])
      }
      setRegulationsLoading(false)

      // Handle departments result
      if (deptsResult.status === 'fulfilled') {
        setDepartmentsSrc(deptsResult.value)
      } else {
        console.error('[CoursesPage] Error loading departments:', deptsResult.reason)
        setDepartmentsSrc([])
      }
      setDepartmentsLoading(false)

      // Handle boards result
      if (boardsResult.status === 'fulfilled') {
        setBoardsSrc(boardsResult.value)
      } else {
        console.error('[CoursesPage] Error loading boards:', boardsResult.reason)
        setBoardsSrc([])
      }
      setBoardsLoading(false)

      if (!counsellingCode && formData.institution_code) {
        console.warn('[CoursesPage] No counselling_code found for institution:', formData.institution_code)
      }
    }

    loadInstitutionData()
  }, [formData.institution_code, institutions])

  // Handle sorting
  const handleSort = (field: 'course_code' | 'course_title' | 'course_category' | 'credits' | 'exam_duration' | 'is_active' | 'qp_code') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: string) => {
    if (sortField !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  // Memoized filtering and sorting
  const filteredCourses = useMemo(() => {
    const q = searchTerm.toLowerCase()
    const data = courses
      .filter((course) => {
        const matchesSearch = [course.course_code, course.course_title, course.qp_code]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
        const matchesStatus = statusFilter === "all" ||
                             (statusFilter === "active" && course.is_active) ||
                             (statusFilter === "inactive" && !course.is_active)
        const matchesType = typeFilter === "all" || course.course_type === typeFilter
        const matchesLevel = levelFilter === "all" || (course.course_level ?? '') === levelFilter
        const matchesEvaluationType = evaluationTypeFilter === "all" || course.evaluation_type === evaluationTypeFilter
        const matchesCourseStatus = courseStatusFilter === 'all' || (course.courses_status ?? 'Pending') === courseStatusFilter
        return matchesSearch && matchesStatus && matchesType && matchesLevel && matchesEvaluationType && matchesCourseStatus
      })

    if (!sortField) return data

    return [...data].sort((a, b) => {
      let aValue: any = a[sortField]
      let bValue: any = b[sortField]

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) aValue = ''
      if (bValue === null || bValue === undefined) bValue = ''

      // Handle boolean for is_active
      if (sortField === 'is_active') {
        aValue = aValue ? 1 : 0
        bValue = bValue ? 1 : 0
      }

      // Handle numeric values
      if (sortField === 'credits' || sortField === 'exam_duration') {
        aValue = Number(aValue) || 0
        bValue = Number(bValue) || 0
      }

      // Handle string values
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase()
        bValue = String(bValue).toLowerCase()
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [courses, searchTerm, statusFilter, typeFilter, levelFilter, evaluationTypeFilter, courseStatusFilter, sortField, sortDirection])

  // Page size options
  const pageSizeOptions = useMemo(() => {
    const base = [10, 20, 50, 100]
    const total = filteredCourses.length
    const options = base.filter(n => n < total)
    if (!options.includes(total) && total > 0) options.push(total)
    return options
  }, [filteredCourses.length])

  // Memoized pagination calculations
  const isShowAll = itemsPerPage >= filteredCourses.length && filteredCourses.length > 0
  const effectivePerPage = itemsPerPage
  const { totalPages, startIndex, endIndex, pageItems } = useMemo(() => {
    const total = Math.ceil(filteredCourses.length / effectivePerPage) || 1
    const start = (currentPage - 1) * effectivePerPage
    const end = start + effectivePerPage
    const items = filteredCourses.slice(start, end)
    return { totalPages: total, startIndex: start, endIndex: end, pageItems: items }
  }, [filteredCourses, effectivePerPage, currentPage])

  // Reset page when filters change
  useEffect(() => setCurrentPage(1), [searchTerm, sortField, sortDirection, itemsPerPage, statusFilter, typeFilter, levelFilter, evaluationTypeFilter, courseStatusFilter])

  const getStatusBadgeVariant = (course: Course) => {
    return course.is_active ? "default" : "secondary"
  }

  const getStatusText = (course: Course) => {
    return course.is_active ? "Active" : "Inactive"
  }

  const getTypeBadgeVariant = (courseType: string | null | undefined) => {
    if (!courseType) return "default"
    switch (courseType.toLowerCase()) {
      case 'core': return "default"
      case 'elective': return "secondary"
      case 'practical': return "outline"
      case 'project': return "destructive"
      default: return "default"
    }
  }

  const resetForm = () => {
    setFormData({
      institution_code: institutionCode || '',
      regulation_code: '',
      board_code: '',
      course_code: '',
      course_title: '',
      display_code: '',
      course_category: '',
      course_type: '',
      course_level: '',
      course_part_master: '',
      credits: '',
      split_credit: false,
      theory_credit: '',
      practical_credit: '',
      qp_code: '',
      e_code_name: '',
      exam_duration: '',
      evaluation_type: '',
      result_type: 'Mark',
      credit_included: true,
      self_study_course: false,
      outside_class_course: false,
      open_book: false,
      online_course: false,
      dummy_number_required: false,
      annual_course: false,
      multiple_qp_set: false,
      no_of_qp_setter: '',
      no_of_scrutinizer: '',
      fee_exception: false,
      has_hall_ticket: true,
      syllabus_pdf_url: '',
      description: '',
      is_active: true,
      courses_status: 'Pending' as CourseStatus,
      // Required fields for marks and hours
      class_hours: '0',
      theory_hours: '0',
      tutorial_hours: '0',
      practical_hours: '0',
      internal_max_mark: '0',
      internal_pass_mark: '0',
      internal_converted_mark: '0',
      external_max_mark: '0',
      external_pass_mark: '0',
      external_converted_mark: '0',
      total_pass_mark: '0',
      total_max_mark: '0',
      annual_semester: false,
      registration_based: false,
    })
    setErrors({})
    setEditing(null)
  }

  const openAdd = () => { resetForm(); setSheetOpen(true) }
  const openEdit = (row: Course) => {
    setEditing(row)
    setFormData({
      institution_code: s(row.institution_code) || institutionCode || "",
      regulation_code: s(row.regulation_code),
      board_code: s(row.board_code),
      course_code: s(row.course_code),
      course_title: s(row.course_title),
      display_code: s(row.display_code) || s(row.course_code),
      course_category: s(row.course_category),
      course_type: s(row.course_type),
      course_level: s(row.course_level),
      course_part_master: s(row.course_part_master),
      credits: String(row.credits ?? '0'),
      split_credit: Boolean(row.split_credit) || false,
      theory_credit: String(row.theory_credit ?? '0'),
      practical_credit: String(row.practical_credit ?? '0'),
      qp_code: s(row.qp_code),
      e_code_name: s(row.e_code_name),
      exam_duration: String(row.exam_duration ?? ''),
      evaluation_type: s(row.evaluation_type),
      result_type: s(row.result_type) || "Mark",
      credit_included: row.credit_included ?? true,
      self_study_course: Boolean(row.self_study_course) || false,
      outside_class_course: Boolean(row.outside_class_course) || false,
      open_book: Boolean(row.open_book) || false,
      online_course: Boolean(row.online_course) || false,
      dummy_number_required: Boolean(row.dummy_number_required) || false,
      annual_course: Boolean(row.annual_course) || false,
      multiple_qp_set: Boolean(row.multiple_qp_set) || false,
      no_of_qp_setter: String(row.no_of_qp_setter ?? ''),
      no_of_scrutinizer: String(row.no_of_scrutinizer ?? ''),
      fee_exception: Boolean(row.fee_exception) || false,
      has_hall_ticket: row.has_hall_ticket ?? true,
      syllabus_pdf_url: s(row.syllabus_pdf_url),
      description: s(row.description),
      is_active: row.is_active ?? true,
      courses_status: (row.courses_status ?? 'Pending') as CourseStatus,
      // Required fields for marks and hours
      class_hours: String(row.class_hours ?? 0),
      theory_hours: String(row.theory_hours ?? 0),
      tutorial_hours: String(row.tutorial_hours ?? 0),
      practical_hours: String(row.practical_hours ?? 0),
      internal_max_mark: String(row.internal_max_mark ?? 0),
      internal_pass_mark: String(row.internal_pass_mark ?? 0),
      internal_converted_mark: String(row.internal_converted_mark ?? 0),
      external_max_mark: String(row.external_max_mark ?? 0),
      external_pass_mark: String(row.external_pass_mark ?? 0),
      external_converted_mark: String(row.external_converted_mark ?? 0),
      total_pass_mark: String(row.total_pass_mark ?? 0),
      total_max_mark: String(row.total_max_mark ?? 0),
      annual_semester: Boolean(row.annual_semester),
      registration_based: Boolean(row.registration_based),
    })
    setSheetOpen(true)
  }

  const validate = () => {
    const e: Record<string, string> = {}

    // Required fields
    if (!formData.institution_code.trim()) e.institution_code = 'Institution code is required'
    if (!formData.regulation_code.trim()) e.regulation_code = 'Regulation code is required'
    if (!formData.course_code.trim()) e.course_code = 'Course code is required'
    if (!formData.course_title.trim()) e.course_title = 'Course name is required'
    if (!formData.display_code.trim()) e.display_code = 'Display code is required'
    if (!formData.qp_code.trim()) e.qp_code = 'QP code is required'
    if (!formData.course_category) e.course_category = 'Course category is required'
    if (!formData.evaluation_type) e.evaluation_type = 'Evaluation type is required'
    if (formData.evaluation_type && !['CIA', 'ESE', 'CIA + ESE', 'CA', 'CA + ESE'].includes(formData.evaluation_type)) {
      e.evaluation_type = 'Evaluation type must be CIA, ESE, CIA + ESE, CA, or CA + ESE'
    }
    if (!formData.result_type) e.result_type = 'Result type is required'
    if (formData.result_type && !['Mark', 'Status', 'comment', 'credit'].includes(formData.result_type)) {
      e.result_type = 'Result type must be Mark, Status, Comment, or Credit'
    }

    // Course code validation (alphanumeric and special characters)
    if (formData.course_code && !/^[A-Za-z0-9\-_]+$/.test(formData.course_code)) {
      e.course_code = 'Course code can only contain letters, numbers, hyphens, and underscores'
    }

    // Numeric field validations
    if (formData.credits && Number(formData.credits) < 0) {
      e.credits = 'Credit must be a positive number'
    }
    if (formData.credits && Number(formData.credits) > 99) {
      e.credits = 'Credit cannot exceed 99'
    }

    if (formData.theory_credit && Number(formData.theory_credit) < 0) {
      e.theory_credit = 'Theory credit must be a positive number'
    }
    if (formData.theory_credit && Number(formData.theory_credit) > 99) {
      e.theory_credit = 'Theory credit cannot exceed 99'
    }

    if (formData.practical_credit && Number(formData.practical_credit) < 0) {
      e.practical_credit = 'Practical credit must be a positive number'
    }
    if (formData.practical_credit && Number(formData.practical_credit) > 99) {
      e.practical_credit = 'Practical credit cannot exceed 99'
    }

    if (formData.exam_duration && Number(formData.exam_duration) < 0) {
      e.exam_duration = 'Duration must be a positive number'
    }
    if (formData.exam_duration && Number(formData.exam_duration) > 150) {
      e.exam_duration = 'Duration cannot exceed 9999 hours'
    }

    // Split credit validation
    if (formData.split_credit) {
      if (!formData.theory_credit || Number(formData.theory_credit) === 0) {
        e.theory_credit = 'Theory credit is required when split credit is enabled'
      }
      if (!formData.practical_credit || Number(formData.practical_credit) === 0) {
        e.practical_credit = 'Practical credit is required when split credit is enabled'
      }
      // Validate that theory + practical credits match total credits
      const totalSplit = Number(formData.theory_credit || 0) + Number(formData.practical_credit || 0)
      const totalCredit = Number(formData.credits || 0)
      if (totalSplit !== totalCredit && totalCredit > 0) {
        e.credits = 'Total credit should equal theory + practical credits'
      }
    }

    // QP setter and scrutinizer validations
    if (formData.no_of_qp_setter && Number(formData.no_of_qp_setter) < 0) {
      e.no_of_qp_setter = 'Number of QP setter must be a positive number'
    }
    if (formData.no_of_qp_setter && Number(formData.no_of_qp_setter) > 100) {
      e.no_of_qp_setter = 'Number of QP setter cannot exceed 100'
    }

    // Validate required numeric fields for marks and hours
    const requiredNumericFields = [
      { field: 'class_hours', label: 'Total Class Hours', max: 999 },
      { field: 'theory_hours', label: 'Theory Hours', max: 999 },
      { field: 'practical_hours', label: 'Practical Hours', max: 999 },
      { field: 'internal_max_mark', label: 'Internal Max Mark', max: 999 },
      { field: 'internal_pass_mark', label: 'Internal Pass Mark', max: 999 },
      { field: 'internal_converted_mark', label: 'Internal Converted Mark', max: 999 },
      { field: 'external_max_mark', label: 'External Max Mark', max: 999 },
      { field: 'external_pass_mark', label: 'External Pass Mark', max: 999 },
      { field: 'external_converted_mark', label: 'External Converted Mark', max: 999 },
      { field: 'total_pass_mark', label: 'Total Pass Mark', max: 999 },
      { field: 'total_max_mark', label: 'Total Max Mark', max: 999 },
    ]

    requiredNumericFields.forEach(({ field, label, max }) => {
      const value = (formData as any)[field]
      if (!value || value.trim() === '') {
        e[field] = `${label} is required`
      } else if (isNaN(Number(value))) {
        e[field] = `${label} must be a number`
      } else if (Number(value) < 0) {
        e[field] = `${label} must be positive or zero`
      } else if (Number(value) > max) {
        e[field] = `${label} cannot exceed ${max}`
      }
    })

    if (formData.no_of_scrutinizer && Number(formData.no_of_scrutinizer) < 0) {
      e.no_of_scrutinizer = 'Number of scrutinizer must be a positive number'
    }
    if (formData.no_of_scrutinizer && Number(formData.no_of_scrutinizer) > 100) {
      e.no_of_scrutinizer = 'Number of scrutinizer cannot exceed 100'
    }

    // URL validation
    if (formData.syllabus_pdf_url && formData.syllabus_pdf_url.trim()) {
      try {
        new URL(formData.syllabus_pdf_url)
      } catch {
        e.syllabus_pdf_url = 'Please enter a valid URL'
      }
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = async () => {
    if (!validate()) {
      toast({
        title: '❌ Validation Failed',
        description: 'Please correct the errors in the form before submitting.',
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
      return
    }
    try {
      const saved = editing
        ? await updateCourse(editing.id, formData as any)
        : await createCourse(formData as any)

      if (editing) {
        setCourses(p => p.map(c => c.id === editing.id ? saved : c))
        toast({ title: '✅ Record Updated', description: `${formData.course_title} has been successfully updated.`, className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200' })
      } else {
        setCourses(p => [saved, ...p])
        toast({ title: '✅ Record Created', description: `${formData.course_title} has been successfully created.`, className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200' })
      }
      setSheetOpen(false)
      resetForm()
    } catch (e) {
      console.error('Save course error:', e)
      const errorMessage = e instanceof Error ? e.message : 'Failed to save record. Please try again.'
      toast({ title: '❌ Operation Failed', description: errorMessage, variant: 'destructive', className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200' })
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleDeleteCourse = async (courseId: string) => {
    try {
      await deleteCourseService(courseId)
      setCourses(courses.filter(course => course.id !== courseId))
      toast({
        title: '✅ Course Deleted',
        description: 'The course has been successfully deleted.',
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      })
    } catch (error) {
      console.error('Error deleting course:', error)
      toast({
        title: '❌ Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete course',
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    }
  }

  const handleDownloadTemplate = async () => {
    try {
      await downloadTemplate(institutionCode || undefined)
      toast({
        title: '✅ Template Downloaded',
        description: 'Course master template with reference data has been downloaded successfully.',
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      })
    } catch (error) {
      console.error('Template download error:', error)
      toast({
        title: '❌ Download Failed',
        description: 'Failed to download course template. Please try again.',
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    }
  }

  const downloadCoursesExcel = async () => {
    const data = courses.map(c => ({
      'Institution Code': c.institution_code || '',
      'Regulation Code': c.regulation_code || '',
      'Board Code': c.board_code || '',
      'Course Code': c.course_code,
      'Course Name': c.course_title,
      'Display Code': c.display_code || '',
      'Course Category': c.course_category || '',
      'Course Type': c.course_type || '',
      'Course Level': c.course_level || '',
      'Course Type Code': c.course_type_code || '',
      'Part': c.course_part_master || '',
      'Credit': c.credits || 0,
      'Split Credit': c.split_credit ? 'TRUE' : 'FALSE',
      'Theory Credit': c.theory_credit || 0,
      'Practical Credit': c.practical_credit || 0,
      'QP Code': c.qp_code || '',
      'E-Code Name': c.e_code_name || '',
      'Exam hours': c.exam_duration || 0,
      'Evaluation Type': c.evaluation_type || '',
      'Result Type': c.result_type || 'Mark',
      'Self Study Course': c.self_study_course ? 'TRUE' : 'FALSE',
      'Outside Class Course': c.outside_class_course ? 'TRUE' : 'FALSE',
      'Open Book': c.open_book ? 'TRUE' : 'FALSE',
      'Online Course': c.online_course ? 'TRUE' : 'FALSE',
      'Dummy Number Required': c.dummy_number_required ? 'TRUE' : 'FALSE',
      'Annual Course': c.annual_course ? 'TRUE' : 'FALSE',
      'Multiple QP Set': c.multiple_qp_set ? 'TRUE' : 'FALSE',
      'No of QP Setter': c.no_of_qp_setter || '',
      'No of Scrutinizer': c.no_of_scrutinizer || '',
      'Fee Exception': c.fee_exception ? 'TRUE' : 'FALSE',
      'Has Hall Ticket': c.has_hall_ticket !== false ? 'TRUE' : 'FALSE',
      'Syllabus PDF URL': c.syllabus_pdf_url || '',
      'Description': c.description || '',
      'Class Hours*': c.class_hours || 0,
      'Theory Hours*': c.theory_hours || 0,
      'Tutorial Hours': c.tutorial_hours || 0,
      'Practical Hours*': c.practical_hours || 0,
      'Internal Max Mark*': c.internal_max_mark || 0,
      'Internal Pass Mark*': c.internal_pass_mark || 0,
      'Internal Converted Mark*': c.internal_converted_mark || 0,
      'External Max Mark*': c.external_max_mark || 0,
      'External Pass Mark*': c.external_pass_mark || 0,
      'External Converted Mark*': c.external_converted_mark || 0,
      'Total Pass Mark*': c.total_pass_mark || 0,
      'Total Max Mark*': c.total_max_mark || 0,
      'Annual Semester*': c.annual_semester ? 'TRUE' : 'FALSE',
      'Registration Based*': c.registration_based ? 'TRUE' : 'FALSE',
      'Status': c.is_active ? 'TRUE' : 'FALSE',
      'Course Status': c.courses_status ?? 'Pending',
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Courses')
    await XLSX.writeFile(wb, `courses_${new Date().toISOString().split('T')[0]}.xlsx`)

    toast({
      title: '✅ Export Successful',
      description: `${courses.length} courses exported to Excel.`,
      className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
    })
  }

  const downloadCoursesJSON = () => {
    const data = courses.map(c => ({
      institution_code: c.institution_code || '',
      regulation_code: c.regulation_code || '',
      board_code: c.board_code || '',
      course_code: c.course_code,
      course_title: c.course_title,
      display_code: c.display_code || '',
      course_category: c.course_category || '',
      course_type: c.course_type || '',
      course_level: c.course_level || '',
      course_type_code: c.course_type_code || '',
      course_part_master: c.course_part_master || '',
      credits: c.credits || 0,
      split_credit: c.split_credit || false,
      theory_credit: c.theory_credit || 0,
      practical_credit: c.practical_credit || 0,
      qp_code: c.qp_code || '',
      e_code_name: c.e_code_name || '',
      exam_duration: c.exam_duration || 0,
      evaluation_type: c.evaluation_type || '',
      result_type: c.result_type || 'Mark',
      self_study_course: c.self_study_course || false,
      outside_class_course: c.outside_class_course || false,
      open_book: c.open_book || false,
      online_course: c.online_course || false,
      dummy_number_required: c.dummy_number_required || false,
      annual_course: c.annual_course || false,
      multiple_qp_set: c.multiple_qp_set || false,
      no_of_qp_setter: c.no_of_qp_setter || null,
      no_of_scrutinizer: c.no_of_scrutinizer || null,
      fee_exception: c.fee_exception || false,
      has_hall_ticket: c.has_hall_ticket ?? true,
      syllabus_pdf_url: c.syllabus_pdf_url || '',
      description: c.description || '',
      is_active: c.is_active,
      class_hours: c.class_hours || null,
      theory_hours: c.theory_hours || null,
      tutorial_hours: c.tutorial_hours || null,
      practical_hours: c.practical_hours || null,
      internal_max_mark: c.internal_max_mark || null,
      internal_pass_mark: c.internal_pass_mark || null,
      internal_converted_mark: c.internal_converted_mark || null,
      external_max_mark: c.external_max_mark || null,
      external_pass_mark: c.external_pass_mark || null,
      external_converted_mark: c.external_converted_mark || null,
      total_pass_mark: c.total_pass_mark || null,
      total_max_mark: c.total_max_mark || null,
    }))

    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `courses_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: '✅ Export Successful',
      description: `${courses.length} courses exported to JSON.`,
      className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
    })
  }

  const refreshCourses = async () => {
    setLoading(true)
    try {
      const data = await fetchCoursesService(shouldFilter ? institutionFilter : undefined, shouldFilter)
      setCourses(data)
      toast({
        title: '✅ Refreshed',
        description: `Loaded ${data.length} courses.`,
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      })
    } catch (error) {
      console.error('Error refreshing courses:', error)
      toast({
        title: '❌ Refresh Failed',
        description: 'Failed to load courses.',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportInProgress(true)
    setImportPhase('reading')
    setImportProgress({ current: 0, total: 0 })
    setFailedRowsData([])
    setImportErrors([])

    try {
      let jsonData: any[] = []

      // Check file type
      if (file.name.endsWith('.json')) {
        // Handle JSON file
        const text = await file.text()
        const parsed = JSON.parse(text)
        jsonData = Array.isArray(parsed) ? parsed : [parsed]
      } else {
        // Handle Excel file
        const data = await file.arrayBuffer()
        const workbook = await XLSX.read(data)
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]
      }

      // Filter out empty rows
      jsonData = jsonData.filter(row => {
        const values = Object.values(row || {})
        return values.some(val => val !== null && val !== undefined && String(val).trim() !== '')
      })

      let successCount = 0
      let errorCount = 0
      const errorDetails: CourseImportError[] = []
      const failedRows: Record<string, unknown>[] = []

      setImportPhase('processing')
      setImportProgress({ current: 0, total: jsonData.length })

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i]
        const rowNumber = i + 2 // +2 because row 1 is headers and array is 0-indexed

        // Update progress and yield to UI every 5 rows to prevent freeze
        setImportProgress({ current: i + 1, total: jsonData.length })
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }

        try {
          // Coerce Excel values to strings (Excel auto-parses numeric-only codes as numbers)
          const str = (v: unknown): string | null => {
            if (v === null || v === undefined || v === '') return null
            return String(v).trim() || null
          }

          const payload = {
            institution_code: str(row['Institution Code*'] || row['Institution Code'] || row.institution_code),
            regulation_code: str(row['Regulation Code*'] || row['Regulation Code'] || row.regulation_code),
            board_code: str(row['Board Code'] || row.board_code),
            course_code: str(row['Course Code*'] || row['Course Code'] || row.course_code),
            course_title: str(row['Course Name*'] || row['Course Name'] || row.course_title),
            display_code: str(row['Display Code*'] || row['Display Code'] || row.display_code),
            course_category: str(row['Course Category*'] || row['Course Category'] || row.course_category),
            course_type: str(row['Course Type'] || row.course_type),
            course_level: str(row['Course Level'] || row.course_level),
            course_part_master: str(row['Course Part Master'] || row['Part'] || row.course_part_master),
            credits: Number(row['Credit'] || row.credits) || 0,
            split_credit: typeof row.split_credit === 'boolean' ? row.split_credit : String(row['Split Credit'] || row['Split Credit (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE',
            theory_credit: Number(row['Theory Credit'] || row.theory_credit) || 0,
            practical_credit: Number(row['Practical Credit'] || row.practical_credit) || 0,
            qp_code: str(row['QP Code*'] || row['QP Code'] || row.qp_code),
            e_code_name: str(row['E Code Name'] || row['E-Code Name'] || row['E-Code Name (Tamil/English/French/Malayalam/Hindi)'] || row.e_code_name),
            exam_duration: Number(row['Exam Hours'] || row['Exam hours'] || row['Exam hours'] || row.exam_duration) || 0,
            evaluation_type: str(row['Evaluation Type*'] || row['Evaluation Type'] || row['Evaluation Type* (CIA/ESE/CIA + ESE)'] || row.evaluation_type),
            result_type: str(row['Result Type*'] || row['Result Type'] || row['Result Type* (Mark/Status)'] || row.result_type) || 'Mark',
            self_study_course: typeof row.self_study_course === 'boolean' ? row.self_study_course : String(row['Self Study Course'] || row['Self Study Course (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE',
            outside_class_course: typeof row.outside_class_course === 'boolean' ? row.outside_class_course : String(row['Outside Class Course'] || row['Outside Class Course (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE',
            open_book: typeof row.open_book === 'boolean' ? row.open_book : String(row['Open Book'] || row['Open Book (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE',
            online_course: typeof row.online_course === 'boolean' ? row.online_course : String(row['Online Course'] || row['Online Course (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE',
            dummy_number_required: typeof row.dummy_number_required === 'boolean' ? row.dummy_number_required : String(row['Dummy Number Not Required'] || row['Dummy Number Required'] || row['Dummy Number Required (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE',
            annual_course: typeof row.annual_course === 'boolean' ? row.annual_course : String(row['Annual Course'] || row['Annual Course (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE',
            multiple_qp_set: typeof row.multiple_qp_set === 'boolean' ? row.multiple_qp_set : String(row['Multiple QP Set'] || row['Multiple QP Set (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE',
            no_of_qp_setter: Number(row['No of QP Setter'] || row.no_of_qp_setter) || null,
            no_of_scrutinizer: Number(row['No of Scrutinizer'] || row.no_of_scrutinizer) || null,
            fee_exception: typeof row.fee_exception === 'boolean' ? row.fee_exception : String(row['Fee Exception'] || row['Fee Exception (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE',
            has_hall_ticket: typeof row.has_hall_ticket === 'boolean' ? row.has_hall_ticket : row['Has Hall Ticket'] !== undefined ? String(row['Has Hall Ticket'] || '').toUpperCase() === 'TRUE' : true,
            syllabus_pdf_url: str(row['Syllabus PDF URL'] || row.syllabus_pdf_url),
            description: str(row['Description'] || row.description),
            class_hours: Number(row['Class Hours*'] || row['Class Hours'] || row['Total Class Hours'] || row.class_hours) || 0,
            theory_hours: Number(row['Theory Hours*'] || row['Theory Hours'] || row.theory_hours) || 0,
            tutorial_hours: Number(row['Tutorial Hours'] || row.tutorial_hours) || 0,
            practical_hours: Number(row['Practical Hours*'] || row['Practical Hours'] || row.practical_hours) || 0,
            internal_max_mark: Number(row['Internal Max Mark*'] || row['Internal Max Mark'] || row.internal_max_mark) || 0,
            internal_pass_mark: Number(row['Internal Pass Mark*'] || row['Internal Pass Mark'] || row.internal_pass_mark) || 0,
            internal_converted_mark: Number(row['Internal Converted Mark*'] || row['Internal Converted Mark'] || row.internal_converted_mark) || 0,
            external_max_mark: Number(row['External Max Mark*'] || row['External Max Mark'] || row.external_max_mark) || 0,
            external_pass_mark: Number(row['External Pass Mark*'] || row['External Pass Mark'] || row.external_pass_mark) || 0,
            external_converted_mark: Number(row['External Converted Mark*'] || row['External Converted Mark'] || row.external_converted_mark) || 0,
            total_pass_mark: Number(row['Total Pass Mark*'] || row['Total Pass Mark'] || row.total_pass_mark) || 0,
            total_max_mark: Number(row['Total Max Mark*'] || row['Total Max Mark'] || row.total_max_mark) || 0,
            annual_semester: typeof row.annual_semester === 'boolean' ? row.annual_semester : String(row['Annual Semester*'] || row['Annual Semester'] || row['Annual Semester (TRUE/FALSE)'] || 'FALSE').toUpperCase() === 'TRUE',
            registration_based: typeof row.registration_based === 'boolean' ? row.registration_based : String(row['Registration Based*'] || row['Registration Based'] || row['Registration Based (TRUE/FALSE)'] || 'FALSE').toUpperCase() === 'TRUE',
            is_active: typeof row.is_active === 'boolean' ? row.is_active : String(row['Status'] || row['Status (TRUE/FALSE)'] || 'TRUE').toUpperCase() !== 'FALSE'
          }

          // Client-side validation
          const validationErrors: string[] = []

          if (!payload.institution_code?.trim()) validationErrors.push('Institution code required')
          if (!payload.regulation_code?.trim()) validationErrors.push('Regulation code required')
          if (!payload.course_code?.trim()) validationErrors.push('Course code required')
          if (!payload.course_title?.trim()) validationErrors.push('Course name required')
          if (!payload.display_code?.trim()) validationErrors.push('Display code required')
          if (!payload.qp_code?.trim()) validationErrors.push('QP code required')
          if (!payload.course_category) validationErrors.push('Course category required')
          if (!payload.evaluation_type) validationErrors.push('Evaluation type required')
          if (payload.evaluation_type && !['CIA', 'ESE', 'CIA + ESE', 'CA', 'CA + ESE'].includes(payload.evaluation_type)) {
            validationErrors.push('Evaluation type must be CIA, ESE, CIA + ESE, CA, or CA + ESE')
          }
          if (!payload.result_type) validationErrors.push('Result type required')
          if (payload.result_type && !['Mark', 'Status', 'comment', 'credit'].includes(payload.result_type)) {
            validationErrors.push('Result type must be Mark, Status, comment, or credit')
          }

          // Validate course_type against course_info master list (loaded at runtime).
          if (payload.course_type && COURSE_TYPES.length > 0 && !COURSE_TYPES.includes(payload.course_type)) {
            validationErrors.push(`Invalid course type "${payload.course_type}". Must be one of the defined course types.`)
          }
          // Validate course_level (optional, but must be a valid Roman numeral I..XX)
          if (payload.course_level && !(COURSE_LEVELS as readonly string[]).includes(payload.course_level)) {
            validationErrors.push(`Invalid course level "${payload.course_level}". Must be one of: ${COURSE_LEVELS.join(', ')}`)
          }

          if (payload.course_code && !/^[A-Za-z0-9\-_]+$/.test(payload.course_code)) {
            validationErrors.push('Invalid course code format')
          }

          if (payload.credits && (payload.credits < 0 || payload.credits > 99)) {
            validationErrors.push('Credit must be 0-99')
          }

          if (validationErrors.length > 0) {
            errorCount++
            errorDetails.push({
              row: rowNumber,
              course_code: payload.course_code || 'N/A',
              course_title: payload.course_title || 'N/A',
              errors: validationErrors
            })
            failedRows.push(row)
            continue
          }

          // Check if course already exists by course_code
          const existingCourse = courses.find(c => c.course_code === payload.course_code?.trim())

          let res: Response
          if (existingCourse) {
            // Update existing course using PUT
            res = await fetch(`/api/master/courses/${existingCourse.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
          } else {
            // Create new course using POST
            res = await fetch('/api/master/courses', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
          }

          if (res.ok) {
            successCount++
          } else {
            errorCount++
            const errorData = await res.json().catch(() => ({}))
            const errorMsg = errorData.error || errorData.details || (existingCourse ? 'Failed to update' : 'Failed to save')
            errorDetails.push({
              row: rowNumber,
              course_code: payload.course_code || 'N/A',
              course_title: payload.course_title || 'N/A',
              errors: [errorMsg]
            })
            failedRows.push(row)
          }
        } catch (err) {
          errorCount++
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          errorDetails.push({
            row: rowNumber,
            course_code: row['Course Code*'] || row['Course Code'] || row.course_code || 'N/A',
            course_title: row['Course Name*'] || row['Course Name'] || row.course_title || 'N/A',
            errors: [errorMsg]
          })
          failedRows.push(row)
        }
      }

      setImportPhase('finalizing')

      // Refresh courses list with institution filter
      const refreshedData = await fetchCoursesService(shouldFilter ? institutionFilter : undefined, shouldFilter)
      setCourses(refreshedData)

      // Update upload summary
      setUploadSummary({
        total: jsonData.length,
        success: successCount,
        failed: errorCount
      })
      setFailedRowsData(failedRows)

      // Show detailed results
      if (errorCount === 0) {
        toast({
          title: '✅ Upload Complete',
          description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} to the database.`,
          className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
          duration: 5000
        })
      } else if (successCount > 0) {
        setImportErrors(errorDetails)
        setErrorPopupOpen(true)
        toast({
          title: '⚠️ Partial Upload Success',
          description: `Processed ${jsonData.length} row${jsonData.length > 1 ? 's' : ''}: ${successCount} successful, ${errorCount} failed. Download failed rows to review errors.`,
          className: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
          duration: 6000
        })
      } else {
        setImportErrors(errorDetails)
        setErrorPopupOpen(true)
        toast({
          title: '❌ Upload Failed',
          description: `Processed ${jsonData.length} row${jsonData.length > 1 ? 's' : ''}: 0 successful, ${errorCount} failed. Download failed rows to review errors.`,
          variant: 'destructive',
          className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
          duration: 6000
        })
      }

      // Reset file input
      e.target.value = ''
    } catch (error) {
      console.error('Upload error:', error)
      toast({
        title: '❌ Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to process file.',
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    } finally {
      setImportInProgress(false)
    }
  }

  // Download failed rows as Excel file (original columns + Error Reason)
  const handleDownloadFailedRows = () => {
    if (failedRowsData.length === 0) return

    // Map errors by row number for precise matching
    const errorByRow = new Map<number, string[]>()
    importErrors.forEach(err => {
      errorByRow.set(err.row, err.errors)
    })

    // Determine column order from first row's keys + Error Reason at the end
    const sampleKeys = failedRowsData.length > 0 ? Object.keys(failedRowsData[0]) : []
    const columns = [...sampleKeys, 'Error Reason']

    const rowsWithErrors = failedRowsData.map((row, index) => {
      // Row number in original file = index in failedRows is NOT the original row position,
      // but importErrors is in the same order failures occurred. Match by index.
      const errors = importErrors[index]?.errors
      const errorReason = errors?.join('; ') || 'Unknown error'

      const ordered: Record<string, unknown> = {}
      for (const col of columns) {
        ordered[col] = col === 'Error Reason' ? errorReason : (row as any)[col] ?? ''
      }
      return ordered
    })

    const ws = XLSX.utils.json_to_sheet(rowsWithErrors, { header: columns })

    // Set reasonable widths
    ws['!cols'] = columns.map(col => ({ wch: col === 'Error Reason' ? 60 : 20 }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Failed Rows')

    const timestamp = new Date().toISOString().slice(0, 10)
    const filename = `courses-failed-${timestamp}.xlsx`

    XLSX.writeFile(wb, filename)

    toast({
      title: '📥 Downloaded',
      description: `${failedRowsData.length} failed row${failedRowsData.length > 1 ? 's' : ''} with error details exported to ${filename}`,
      className: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200'
    })
  }

  const handleBulkUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      let jsonData: any[] = []

      // Check file type
      if (file.name.endsWith('.json')) {
        // Handle JSON file
        const text = await file.text()
        const parsed = JSON.parse(text)
        jsonData = Array.isArray(parsed) ? parsed : [parsed]
      } else {
        // Handle Excel file
        const data = await file.arrayBuffer()
        const workbook = await XLSX.read(data)
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]
      }

      let successCount = 0
      let errorCount = 0
      let notFoundCount = 0
      const errorDetails: CourseImportError[] = []

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i]
        const rowNumber = i + 2 // +2 because row 1 is headers and array is 0-indexed

        try {
          // Get course_code from various possible column names
          const courseCode = row['Course Code*'] || row['Course Code'] || row.course_code

          if (!courseCode?.trim()) {
            errorCount++
            errorDetails.push({
              row: rowNumber,
              course_code: 'N/A',
              course_title: row['Course Name*'] || row['Course Name'] || row.course_title || 'N/A',
              errors: ['Course code is required for bulk update']
            })
            continue
          }

          // Find the existing course by course_code
          const existingCourse = courses.find(c => c.course_code === courseCode.trim())

          if (!existingCourse) {
            notFoundCount++
            errorCount++
            errorDetails.push({
              row: rowNumber,
              course_code: courseCode,
              course_title: row['Course Name*'] || row['Course Name'] || row.course_title || 'N/A',
              errors: [`Course with code "${courseCode}" not found in database`]
            })
            continue
          }

          // Build update payload - only include fields that are present in the Excel
          const payload: Record<string, any> = {}

          // Map Excel columns to API fields
          if (row['Institution Code*'] || row['Institution Code'] || row.institution_code) {
            payload.institution_code = row['Institution Code*'] || row['Institution Code'] || row.institution_code
          }
          if (row['Regulation Code*'] || row['Regulation Code'] || row.regulation_code) {
            payload.regulation_code = row['Regulation Code*'] || row['Regulation Code'] || row.regulation_code
          }
          if (row['Board Code'] || row.board_code) {
            payload.board_code = row['Board Code'] || row.board_code
          }
          if (row['Course Code*'] || row['Course Code'] || row.course_code) {
            payload.course_code = row['Course Code*'] || row['Course Code'] || row.course_code
          }
          if (row['Course Name*'] || row['Course Name'] || row.course_title) {
            payload.course_title = row['Course Name*'] || row['Course Name'] || row.course_title
          }
          if (row['Display Code*'] || row['Display Code'] || row.display_code) {
            payload.display_code = row['Display Code*'] || row['Display Code'] || row.display_code
          }
          if (row['Course Category*'] || row['Course Category'] || row.course_category) {
            payload.course_category = row['Course Category*'] || row['Course Category'] || row.course_category
          }
          if (row['Course Type'] || row.course_type) {
            payload.course_type = row['Course Type'] || row.course_type
          }
          if (row['Course Level'] || row.course_level) {
            payload.course_level = row['Course Level'] || row.course_level
          }
          if (row['Course Part Master'] || row['Part'] || row.course_part_master) {
            payload.course_part_master = row['Course Part Master'] || row['Part'] || row.course_part_master
          }
          if (row['Credit'] !== undefined || row.credits !== undefined) {
            payload.credits = Number(row['Credit'] || row.credits) || 0
          }
          if (row['Split Credit'] !== undefined || row['Split Credit (TRUE/FALSE)'] !== undefined || row.split_credit !== undefined) {
            payload.split_credit = typeof row.split_credit === 'boolean' ? row.split_credit : String(row['Split Credit'] || row['Split Credit (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE'
          }
          if (row['Theory Credit'] !== undefined || row.theory_credit !== undefined) {
            payload.theory_credit = Number(row['Theory Credit'] || row.theory_credit) || 0
          }
          if (row['Practical Credit'] !== undefined || row.practical_credit !== undefined) {
            payload.practical_credit = Number(row['Practical Credit'] || row.practical_credit) || 0
          }
          if (row['QP Code*'] || row['QP Code'] || row.qp_code) {
            payload.qp_code = row['QP Code*'] || row['QP Code'] || row.qp_code
          }
          if (row['E Code Name'] || row['E-Code Name'] || row['E-Code Name (Tamil/English/French/Malayalam/Hindi)'] || row.e_code_name) {
            payload.e_code_name = row['E Code Name'] || row['E-Code Name'] || row['E-Code Name (Tamil/English/French/Malayalam/Hindi)'] || row.e_code_name
          }
          if (row['Exam Hours'] !== undefined || row['Exam hours'] !== undefined || row.exam_duration !== undefined) {
            payload.exam_duration = Number(row['Exam Hours'] || row['Exam hours'] || row.exam_duration) || 0
          }
          if (row['Evaluation Type*'] || row['Evaluation Type'] || row['Evaluation Type* (CIA/ESE/CIA + ESE)'] || row.evaluation_type) {
            payload.evaluation_type = row['Evaluation Type*'] || row['Evaluation Type'] || row['Evaluation Type* (CIA/ESE/CIA + ESE)'] || row.evaluation_type
          }
          if (row['Result Type*'] || row['Result Type'] || row['Result Type* (Mark/Status)'] || row.result_type) {
            payload.result_type = row['Result Type*'] || row['Result Type'] || row['Result Type* (Mark/Status)'] || row.result_type
          }
          if (row['Self Study Course'] !== undefined || row['Self Study Course (TRUE/FALSE)'] !== undefined || row.self_study_course !== undefined) {
            payload.self_study_course = typeof row.self_study_course === 'boolean' ? row.self_study_course : String(row['Self Study Course'] || row['Self Study Course (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE'
          }
          if (row['Outside Class Course'] !== undefined || row['Outside Class Course (TRUE/FALSE)'] !== undefined || row.outside_class_course !== undefined) {
            payload.outside_class_course = typeof row.outside_class_course === 'boolean' ? row.outside_class_course : String(row['Outside Class Course'] || row['Outside Class Course (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE'
          }
          if (row['Open Book'] !== undefined || row['Open Book (TRUE/FALSE)'] !== undefined || row.open_book !== undefined) {
            payload.open_book = typeof row.open_book === 'boolean' ? row.open_book : String(row['Open Book'] || row['Open Book (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE'
          }
          if (row['Online Course'] !== undefined || row['Online Course (TRUE/FALSE)'] !== undefined || row.online_course !== undefined) {
            payload.online_course = typeof row.online_course === 'boolean' ? row.online_course : String(row['Online Course'] || row['Online Course (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE'
          }
          if (row['Dummy Number Not Required'] !== undefined || row['Dummy Number Required'] !== undefined || row['Dummy Number Required (TRUE/FALSE)'] !== undefined || row.dummy_number_required !== undefined) {
            payload.dummy_number_required = typeof row.dummy_number_required === 'boolean' ? row.dummy_number_required : String(row['Dummy Number Not Required'] || row['Dummy Number Required'] || row['Dummy Number Required (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE'
          }
          if (row['Annual Course'] !== undefined || row['Annual Course (TRUE/FALSE)'] !== undefined || row.annual_course !== undefined) {
            payload.annual_course = typeof row.annual_course === 'boolean' ? row.annual_course : String(row['Annual Course'] || row['Annual Course (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE'
          }
          if (row['Multiple QP Set'] !== undefined || row['Multiple QP Set (TRUE/FALSE)'] !== undefined || row.multiple_qp_set !== undefined) {
            payload.multiple_qp_set = typeof row.multiple_qp_set === 'boolean' ? row.multiple_qp_set : String(row['Multiple QP Set'] || row['Multiple QP Set (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE'
          }
          if (row['No of QP Setter'] !== undefined || row.no_of_qp_setter !== undefined) {
            payload.no_of_qp_setter = Number(row['No of QP Setter'] || row.no_of_qp_setter) || null
          }
          if (row['No of Scrutinizer'] !== undefined || row.no_of_scrutinizer !== undefined) {
            payload.no_of_scrutinizer = Number(row['No of Scrutinizer'] || row.no_of_scrutinizer) || null
          }
          if (row['Fee Exception'] !== undefined || row['Fee Exception (TRUE/FALSE)'] !== undefined || row.fee_exception !== undefined) {
            payload.fee_exception = typeof row.fee_exception === 'boolean' ? row.fee_exception : String(row['Fee Exception'] || row['Fee Exception (TRUE/FALSE)'] || '').toUpperCase() === 'TRUE'
          }
          if (row['Has Hall Ticket'] !== undefined || row.has_hall_ticket !== undefined) {
            payload.has_hall_ticket = typeof row.has_hall_ticket === 'boolean' ? row.has_hall_ticket : String(row['Has Hall Ticket'] || '').toUpperCase() === 'TRUE'
          }
          if (row['Syllabus PDF URL'] || row.syllabus_pdf_url) {
            payload.syllabus_pdf_url = row['Syllabus PDF URL'] || row.syllabus_pdf_url
          }
          if (row['Description'] || row.description) {
            payload.description = row['Description'] || row.description
          }
          if (row['Class Hours*'] !== undefined || row['Class Hours'] !== undefined || row['Total Class Hours'] !== undefined || row.class_hours !== undefined) {
            payload.class_hours = Number(row['Class Hours*'] || row['Class Hours'] || row['Total Class Hours'] || row.class_hours) || 0
          }
          if (row['Theory Hours*'] !== undefined || row['Theory Hours'] !== undefined || row.theory_hours !== undefined) {
            payload.theory_hours = Number(row['Theory Hours*'] || row['Theory Hours'] || row.theory_hours) || 0
          }
          if (row['Tutorial Hours'] !== undefined || row.tutorial_hours !== undefined) {
            payload.tutorial_hours = Number(row['Tutorial Hours'] || row.tutorial_hours) || 0
          }
          if (row['Practical Hours*'] !== undefined || row['Practical Hours'] !== undefined || row.practical_hours !== undefined) {
            payload.practical_hours = Number(row['Practical Hours*'] || row['Practical Hours'] || row.practical_hours) || 0
          }
          if (row['Internal Max Mark*'] !== undefined || row['Internal Max Mark'] !== undefined || row.internal_max_mark !== undefined) {
            payload.internal_max_mark = Number(row['Internal Max Mark*'] || row['Internal Max Mark'] || row.internal_max_mark) || 0
          }
          if (row['Internal Pass Mark*'] !== undefined || row['Internal Pass Mark'] !== undefined || row.internal_pass_mark !== undefined) {
            payload.internal_pass_mark = Number(row['Internal Pass Mark*'] || row['Internal Pass Mark'] || row.internal_pass_mark) || 0
          }
          if (row['Internal Converted Mark*'] !== undefined || row['Internal Converted Mark'] !== undefined || row.internal_converted_mark !== undefined) {
            payload.internal_converted_mark = Number(row['Internal Converted Mark*'] || row['Internal Converted Mark'] || row.internal_converted_mark) || 0
          }
          if (row['External Max Mark*'] !== undefined || row['External Max Mark'] !== undefined || row.external_max_mark !== undefined) {
            payload.external_max_mark = Number(row['External Max Mark*'] || row['External Max Mark'] || row.external_max_mark) || 0
          }
          if (row['External Pass Mark*'] !== undefined || row['External Pass Mark'] !== undefined || row.external_pass_mark !== undefined) {
            payload.external_pass_mark = Number(row['External Pass Mark*'] || row['External Pass Mark'] || row.external_pass_mark) || 0
          }
          if (row['External Converted Mark*'] !== undefined || row['External Converted Mark'] !== undefined || row.external_converted_mark !== undefined) {
            payload.external_converted_mark = Number(row['External Converted Mark*'] || row['External Converted Mark'] || row.external_converted_mark) || 0
          }
          if (row['Total Pass Mark*'] !== undefined || row['Total Pass Mark'] !== undefined || row.total_pass_mark !== undefined) {
            payload.total_pass_mark = Number(row['Total Pass Mark*'] || row['Total Pass Mark'] || row.total_pass_mark) || 0
          }
          if (row['Total Max Mark*'] !== undefined || row['Total Max Mark'] !== undefined || row.total_max_mark !== undefined) {
            payload.total_max_mark = Number(row['Total Max Mark*'] || row['Total Max Mark'] || row.total_max_mark) || 0
          }
          if (row['Annual Semester*'] !== undefined || row['Annual Semester'] !== undefined || row['Annual Semester (TRUE/FALSE)'] !== undefined || row.annual_semester !== undefined) {
            payload.annual_semester = typeof row.annual_semester === 'boolean' ? row.annual_semester : String(row['Annual Semester*'] || row['Annual Semester'] || row['Annual Semester (TRUE/FALSE)'] || 'FALSE').toUpperCase() === 'TRUE'
          }
          if (row['Registration Based*'] !== undefined || row['Registration Based'] !== undefined || row['Registration Based (TRUE/FALSE)'] !== undefined || row.registration_based !== undefined) {
            payload.registration_based = typeof row.registration_based === 'boolean' ? row.registration_based : String(row['Registration Based*'] || row['Registration Based'] || row['Registration Based (TRUE/FALSE)'] || 'FALSE').toUpperCase() === 'TRUE'
          }
          if (row['Status'] !== undefined || row['Status (TRUE/FALSE)'] !== undefined || row.is_active !== undefined) {
            payload.is_active = typeof row.is_active === 'boolean' ? row.is_active : String(row['Status'] || row['Status (TRUE/FALSE)'] || 'TRUE').toUpperCase() !== 'FALSE'
          }

          // Send PUT request to update the course
          const res = await fetch(`/api/master/courses/${existingCourse.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })

          if (res.ok) {
            successCount++
          } else {
            errorCount++
            const errorData = await res.json().catch(() => ({}))
            const errorMsg = errorData.error || errorData.details || 'Failed to update'
            errorDetails.push({
              row: rowNumber,
              course_code: courseCode,
              course_title: row['Course Name*'] || row['Course Name'] || row.course_title || 'N/A',
              errors: [errorMsg]
            })
          }
        } catch (err) {
          errorCount++
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          errorDetails.push({
            row: rowNumber,
            course_code: row['Course Code*'] || row['Course Code'] || row.course_code || 'N/A',
            course_title: row['Course Name*'] || row['Course Name'] || row.course_title || 'N/A',
            errors: [errorMsg]
          })
        }
      }

      // Refresh courses list with institution filter
      const refreshedData = await fetchCoursesService(shouldFilter ? institutionFilter : undefined, shouldFilter)
      setCourses(refreshedData)

      // Update upload summary
      setUploadSummary({
        total: jsonData.length,
        success: successCount,
        failed: errorCount
      })

      // Show detailed results
      if (errorCount === 0) {
        toast({
          title: '✅ Bulk Update Complete',
          description: `Successfully updated all ${successCount} course${successCount > 1 ? 's' : ''}.`,
          className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
          duration: 5000
        })
      } else if (successCount > 0) {
        setImportErrors(errorDetails)
        setErrorPopupOpen(true)
        toast({
          title: '⚠️ Partial Update Success',
          description: `Processed ${jsonData.length} row${jsonData.length > 1 ? 's' : ''}: ${successCount} updated, ${errorCount} failed${notFoundCount > 0 ? ` (${notFoundCount} not found)` : ''}. View error details below.`,
          className: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
          duration: 6000
        })
      } else {
        setImportErrors(errorDetails)
        setErrorPopupOpen(true)
        toast({
          title: '❌ Bulk Update Failed',
          description: `Processed ${jsonData.length} row${jsonData.length > 1 ? 's' : ''}: 0 updated, ${errorCount} failed${notFoundCount > 0 ? ` (${notFoundCount} not found)` : ''}. View error details below.`,
          variant: 'destructive',
          className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
          duration: 6000
        })
      }

      // Reset file input
      e.target.value = ''
    } catch (error) {
      console.error('Bulk update error:', error)
      toast({
        title: '❌ Bulk Update Failed',
        description: error instanceof Error ? error.message : 'Failed to process file.',
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    }
  }

  const formatCurrentDateTime = (date: Date | null) => {
    if (!date) return "Loading..."
    
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
    
    return `${day}-${month}-${year} | ${weekday} | ${time}`
  }

  return (
    <SidebarProvider>
      {/* Import Loading Overlay */}
      {importInProgress && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-8 shadow-2xl max-w-md w-full mx-4">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {importPhase === 'reading' && 'Reading File...'}
                  {importPhase === 'processing' && 'Importing Courses'}
                  {importPhase === 'finalizing' && 'Finalizing...'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {importPhase === 'reading' && 'Please wait while the file is being parsed...'}
                  {importPhase === 'processing' && 'Please wait while the data is being processed...'}
                  {importPhase === 'finalizing' && 'Refreshing list and preparing results...'}
                </p>
              </div>
              {importProgress.total > 0 && importPhase === 'processing' && (
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                    <span>Progress</span>
                    <span>{importProgress.current} / {importProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (importProgress.current / importProgress.total) * 100)}%` }}
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
                    <BreadcrumbPage>Courses</BreadcrumbPage>
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
                      <p className="text-2xl font-bold tracking-tight">{courses.length}</p>
                      <p className="text-xs font-medium text-muted-foreground mt-0.5">Total Courses</p>
                    </div>
                    <BookText className="h-5 w-5 text-blue-500/40" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold tracking-tight">{courses.filter(c => c.is_active).length}</p>
                      <p className="text-xs font-medium text-muted-foreground mt-0.5">Active</p>
                    </div>
                    <BookText className="h-5 w-5 text-emerald-500/40" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold tracking-tight">{courses.filter(c => !c.is_active).length}</p>
                      <p className="text-xs font-medium text-muted-foreground mt-0.5">Inactive</p>
                    </div>
                    <BookText className="h-5 w-5 text-amber-500/40" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold tracking-tight">{courses.filter(c => c.course_category === 'Theory').length}</p>
                      <p className="text-xs font-medium text-muted-foreground mt-0.5">Theory</p>
                    </div>
                    <BookText className="h-5 w-5 text-purple-500/40" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <TooltipProvider delayDuration={300}>
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader className="flex-shrink-0 px-4 py-3 border-b">
                <div className="space-y-3">
                  {/* Row 1: Title & Action Buttons */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold">All Courses</h2>
                      <p className="text-xs text-muted-foreground">Manage and organize courses</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={refreshCourses} disabled={loading}>
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh</TooltipContent>
                      </Tooltip>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 text-sm px-3">
                            <Download className="h-3.5 w-3.5 mr-1.5" />Export<ChevronDown className="h-3 w-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={handleDownloadTemplate}>
                            <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Download Template
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={downloadCoursesExcel}>
                            <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Export Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={downloadCoursesJSON}>
                            <FileJson className="h-3.5 w-3.5 mr-2" />Export JSON
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button variant="outline" size="sm" className="h-8 text-sm px-3" onClick={() => document.getElementById('file-upload')?.click()}>
                        <Upload className="h-3.5 w-3.5 mr-1.5" />Import
                      </Button>
                      <input
                        id="file-upload"
                        type="file"
                        accept=".xlsx,.xls,.json"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => document.getElementById('bulk-update-upload')?.click()}>
                            <FileUp className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Bulk Update</TooltipContent>
                      </Tooltip>
                      <input
                        id="bulk-update-upload"
                        type="file"
                        accept=".xlsx,.xls,.json"
                        onChange={handleBulkUpdate}
                        className="hidden"
                      />
                      <Button size="sm" onClick={openAdd} disabled={loading} className="h-8 text-sm px-4">
                        <PlusCircle className="h-3.5 w-3.5 mr-1.5" />Add Course
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

                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="h-8 text-sm w-[130px]">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[400px]">
                        <SelectItem value="all">All Types</SelectItem>
                        {COURSE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={levelFilter} onValueChange={setLevelFilter}>
                      <SelectTrigger className="h-8 text-sm w-[120px]">
                        <SelectValue placeholder="All Levels" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[400px]">
                        <SelectItem value="all">All Levels</SelectItem>
                        {COURSE_LEVELS.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={evaluationTypeFilter} onValueChange={setEvaluationTypeFilter}>
                      <SelectTrigger className="h-8 text-sm w-[130px]">
                        <SelectValue placeholder="All Evaluations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Evaluations</SelectItem>
                        <SelectItem value="CIA">CIA</SelectItem>
                        <SelectItem value="ESE">ESE</SelectItem>
                        <SelectItem value="CIA + ESE">CIA + ESE</SelectItem>
                        <SelectItem value="CA">CA</SelectItem>
                        <SelectItem value="CA + ESE">CA + ESE</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={courseStatusFilter} onValueChange={(v) => setCourseStatusFilter(v as 'all' | CourseStatus)}>
                      <SelectTrigger className="h-8 text-sm w-[150px]">
                        <SelectValue placeholder="All Course Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Course Status</SelectItem>
                        {COURSE_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search courses..."
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
                            Institution
                          </TableHead>
                        )}
                        <TableHead className="text-xs font-semibold">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('course_code')} className="px-2 transition-colors">
                            Course Code
                            <span className="ml-1">{getSortIcon('course_code')}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('course_title')} className="px-2 transition-colors">
                            Course Name
                            <span className="ml-1">{getSortIcon('course_title')}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('course_category')} className="px-2 transition-colors">
                            Category
                            <span className="ml-1">{getSortIcon('course_category')}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Course Type Code
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('credits')} className="px-2 transition-colors">
                            Credit
                            <span className="ml-1">{getSortIcon('credits')}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('qp_code')} className="px-2 transition-colors">
                            QP Code
                            <span className="ml-1">{getSortIcon('qp_code')}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          Hall Ticket
                        </TableHead>
                        <TableHead className="text-xs font-semibold">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('is_active')} className="px-2 transition-colors">
                            Status
                            <span className="ml-1">{getSortIcon('is_active')}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-xs font-semibold">Course Status</TableHead>
                        <TableHead className="text-center text-xs font-semibold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={mustSelectInstitution ? 11 : 10} className="h-24 text-center">
                            <div className="flex items-center justify-center gap-2 text-muted-foreground">
                              <RefreshCw className="h-5 w-5 animate-spin" />
                              <span className="text-sm">Loading courses...</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : pageItems.length ? (
                        <>
                          {pageItems.map((course) => (
                            <TableRow key={course.id}>
                              {mustSelectInstitution && (
                                <TableCell className="text-sm">
                                  {course.institution_code || '-'}
                                </TableCell>
                              )}
                              <TableCell className="font-medium text-sm">{course.course_code}</TableCell>
                              <TableCell className="text-sm">{course.course_title}</TableCell>
                              <TableCell className="text-sm">{course.course_category || '-'}</TableCell>
                              <TableCell className="text-sm font-mono">{course.course_type_code || '-'}</TableCell>
                              <TableCell className="text-sm">{course.credits}</TableCell>
                              <TableCell className="text-sm">{course.qp_code || '-'}</TableCell>
                              <TableCell>
                                <Badge variant={course.has_hall_ticket !== false ? "default" : "secondary"} className={`text-xs ${course.has_hall_ticket !== false ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                  {course.has_hall_ticket !== false ? 'Yes' : 'No'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={course.is_active ? "default" : "secondary"} className={`text-xs ${course.is_active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                                  {course.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  const cs = (course.courses_status ?? 'Pending') as CourseStatus
                                  const cls = cs === 'Locked'
                                    ? 'bg-slate-200 text-slate-800 border-slate-300'
                                    : cs === 'BOS Approved'
                                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                                      : 'bg-amber-100 text-amber-700 border-amber-200'
                                  return (
                                    <Badge variant="outline" className={`text-xs ${cls}`}>{cs}</Badge>
                                  )
                                })()}
                              </TableCell>
                              <TableCell className="text-center">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36">
                                    <DropdownMenuItem onClick={() => openEdit(course)}>
                                      <Eye className="h-3.5 w-3.5 mr-2" />
                                      View / Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
                                      onClick={() => setDeleteTarget(course)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                        ) : (
                          <TableRow>
                            <TableCell colSpan={mustSelectInstitution ? 11 : 10} className="h-24 text-center">
                              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                <BookText className="h-8 w-8 opacity-20" />
                                <span className="text-sm font-medium">No courses found</span>
                                <span className="text-xs">Try adjusting your filters or add a new course</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                    </TableBody>
                  </Table>
              </CardContent>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {filteredCourses.length === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, filteredCourses.length)} of {filteredCourses.length} courses
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="page-size" className="text-sm text-muted-foreground">
                      Rows:
                    </Label>
                    <Select
                      value={String(itemsPerPage)}
                      onValueChange={(value) => setItemsPerPage(Number(value))}
                    >
                      <SelectTrigger id="page-size" className="h-7 w-[70px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {pageSizeOptions.map(opt => (
                          <SelectItem key={opt} value={String(opt)}>{opt === filteredCourses.length && filteredCourses.length > 100 ? 'All' : opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
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
            </Card>
            </TooltipProvider>
          </div>
        </PageTransition>
        <AppFooter />
      </SidebarInset>

      {/* Error Popup Dialog */}
        <AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
          <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-red-600 flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Data Validation Errors
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-muted-foreground">
                Please fix the following errors before importing the data
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4">
              {/* Upload Summary Cards */}
              {uploadSummary.total > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 border-blue-200 rounded-lg p-3">
                    <div className="text-xs text-blue-600 font-medium mb-1">Total Rows</div>
                    <div className="text-2xl font-bold text-blue-700">{uploadSummary.total}</div>
                  </div>
                  <div className="bg-green-50 border-green-200 rounded-lg p-3">
                    <div className="text-xs text-green-600 font-medium mb-1">Successful</div>
                    <div className="text-2xl font-bold text-green-700">{uploadSummary.success}</div>
                  </div>
                  <div className="bg-red-50 border-red-200 rounded-lg p-3">
                    <div className="text-xs text-red-600 font-medium mb-1">Failed</div>
                    <div className="text-2xl font-bold text-red-700">{uploadSummary.failed}</div>
                  </div>
                </div>
              )}

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="font-semibold text-red-800">
                    {importErrors.length} row{importErrors.length > 1 ? 's' : ''} failed validation
                  </span>
                </div>
                <p className="text-sm text-red-700">
                  Please correct these errors in your Excel file and try uploading again.
                </p>
              </div>

              <div className="space-y-3">
                {importErrors.map((error, index) => (
                  <div key={index} className="border border-red-200 rounded-md p-4 bg-red-50/50">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 rounded-lg">
                          Row {error.row}
                        </Badge>
                        <span className="font-medium text-sm">
                          {error.course_code} - {error.course_title}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {error.errors.map((err, errIndex) => (
                        <div key={errIndex} className="flex items-start gap-2 text-sm">
                          <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                          <span className="text-red-700">{err}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel className="bg-gray-100 hover:bg-gray-200">
                Close
              </AlertDialogCancel>
              {failedRowsData.length > 0 && (
                <Button
                  onClick={handleDownloadFailedRows}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download Failed Rows
                </Button>
              )}
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

        {/* Locked → other status warning */}
        <AlertDialog open={lockedWarning.open} onOpenChange={(open) => { if (!open) setLockedWarning({ open: false, targetValue: null }) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-amber-700">Change locked course status?</AlertDialogTitle>
              <AlertDialogDescription>
                This course is currently <span className="font-semibold">Locked</span>. Changing it to{' '}
                <span className="font-semibold">{lockedWarning.targetValue}</span> may unlock downstream workflows
                (mappings, exam configuration, marks). Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => {
                  if (lockedWarning.targetValue) {
                    setFormData({ ...formData, courses_status: lockedWarning.targetValue })
                  }
                  setLockedWarning({ open: false, targetValue: null })
                }}
              >
                Yes, change status
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Standalone Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Course</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deleteTarget?.course_title}</strong>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteTarget) handleDeleteCourse(deleteTarget.id)
                  setDeleteTarget(null)
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sheet for Add/Edit */}
        <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
          <SheetContent className="sm:max-w-[1000px] overflow-y-auto">
            <SheetHeader className="pb-4 border-b">
              <SheetTitle className="text-lg font-semibold">{editing ? 'Edit Course' : 'Add Course'}</SheetTitle>
              <p className="text-sm text-muted-foreground">{editing ? 'Update course information' : 'Add a new course record'}</p>
            </SheetHeader>

            <div className="mt-6 space-y-8">
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Institution Code - show selector only when user can/must choose institution */}
                  {(mustSelectInstitution || !shouldFilter || !institutionCode) && (
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Institution Code <span className="text-red-500">*</span></Label>
                      <SearchableSelect
                        value={formData.institution_code}
                        onValueChange={(v) => setFormData({ ...formData, institution_code: v, regulation_code: "", board_code: "" })}
                        options={institutions.map(i => ({ value: i.institution_code, label: `${i.institution_code}${i.name ? ` - ${i.name}` : ''}` }))}
                        placeholder="Select institution"
                        searchPlaceholder="Search institutions..."
                        loading={codesLoading}
                        loadingText="Loading..."
                        error={!!errors.institution_code}
                        clearable
                        wrapText
                      />
                      {errors.institution_code && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {errors.institution_code}
                        </p>
                      )}
                    </div>
                  )}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Regulation Code <span className="text-red-500">*</span></Label>
                  <SearchableSelect
                    value={formData.regulation_code}
                    onValueChange={(v) => setFormData({ ...formData, regulation_code: v })}
                    options={regulations.map(r => ({ value: r.regulation_code, label: r.regulation_name ? `${r.regulation_code} - ${r.regulation_name}` : r.regulation_code }))}
                    placeholder={!formData.institution_code ? "Select institution first" : "Select regulation"}
                    searchPlaceholder="Search regulations..."
                    loading={regulationsLoading}
                    loadingText="Loading regulations..."
                    error={!!errors.regulation_code}
                    clearable
                    wrapText
                    disabled={!formData.institution_code}
                  />
                  {errors.regulation_code && <p className="text-xs text-destructive">{errors.regulation_code}</p>}
                  {!formData.institution_code && <p className="text-xs text-muted-foreground">Select an institution to load regulations</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Board Code</Label>
                  <SearchableSelect
                    value={formData.board_code}
                    onValueChange={(v) => setFormData({ ...formData, board_code: v })}
                    options={boardsSrc.map(b => ({
                      value: b.board_code,
                      label: b.board_name ? `${b.board_code} - ${b.board_name}` : b.board_code,
                      description: b.board_name
                    }))}
                    placeholder="Select board"
                    searchPlaceholder="Search boards..."
                    loading={boardsLoading}
                    loadingText="Loading boards..."
                    clearable
                    wrapText
                    disabled={!formData.institution_code}
                  />
                  {!formData.institution_code && <p className="text-xs text-muted-foreground">Select an institution to load boards</p>}
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label className="text-sm font-semibold">Course Code <span className="text-red-500">*</span></Label>
                  <Input value={formData.course_code} onChange={(e) => {
                    const v = e.target.value
                    setFormData({
                      ...formData,
                      course_code: v,
                      display_code: formData.display_code || v,
                      qp_code: formData.qp_code || v,
                    })
                  }} className={`h-10 ${errors.course_code ? 'border-destructive' : ''}`} placeholder="e.g., CS101" />
                  {errors.course_code && <p className="text-xs text-destructive">{errors.course_code}</p>}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-semibold">Course Name <span className="text-red-500">*</span></Label>
                  <Input value={formData.course_title} onChange={(e) => setFormData({ ...formData, course_title: e.target.value })} className={`h-10 ${errors.course_title ? 'border-destructive' : ''}`} placeholder="Enter course name" />
                  {errors.course_title && <p className="text-xs text-destructive">{errors.course_title}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Display Code <span className="text-red-500">*</span></Label>
                  <Input value={formData.display_code} onChange={(e) => setFormData({ ...formData, display_code: e.target.value })} className={`h-10 ${errors.display_code ? 'border-destructive' : ''}`} placeholder="Will default from course code" />
                  {errors.display_code && <p className="text-xs text-destructive">{errors.display_code}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Course Category <span className="text-red-500">*</span></Label>
                  <SearchableSelect
                    value={formData.course_category}
                    onValueChange={(v) => setFormData({ ...formData, course_category: v })}
                    options={toSearchableOptions([
                      "Theory", "Practical", "Project", "Non Academic",
                      "Theory + Practical", "Theory + Project", "Field Work",
                      "Community Service", "Group Project"
                    ])}
                    placeholder="Select category"
                    searchPlaceholder="Search categories..."
                    error={!!errors.course_category}
                    clearable
                    wrapText
                  />
                  {errors.course_category && <p className="text-xs text-destructive">{errors.course_category}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Course Type</Label>
                  <SearchableSelect
                    value={formData.course_type}
                    onValueChange={(v) => setFormData({ ...formData, course_type: v })}
                    options={toSearchableOptions(COURSE_TYPES as unknown as string[])}
                    placeholder={courseInfoLoading ? 'Loading types...' : 'Select type'}
                    searchPlaceholder="Search course types..."
                    clearable
                    wrapText
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Course Level</Label>
                  <SearchableSelect
                    value={formData.course_level}
                    onValueChange={(v) => setFormData({ ...formData, course_level: v })}
                    options={toSearchableOptions(COURSE_LEVELS as unknown as string[])}
                    placeholder="Select level (optional)"
                    searchPlaceholder="Search levels..."
                    clearable
                    wrapText
                  />
                  {(formData.course_type || formData.course_level) && (
                    <p className="text-xs text-muted-foreground">
                      Course Type Code:{' '}
                      <span className="font-mono font-semibold text-foreground">
                        {(() => {
                          const code = displayCodeByType[formData.course_type] || formData.course_type
                          if (!code) return '—'
                          return formData.course_level ? `${code}-${formData.course_level}` : code
                        })()}
                      </span>
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Part</Label>
                  <SearchableSelect
                    value={formData.course_part_master}
                    onValueChange={(v) => setFormData({ ...formData, course_part_master: v })}
                    options={toSearchableOptions([
                      "Part I", "Part II", "Part III", "Part IV", "Part V", "Part A", "Part B"
                    ])}
                    placeholder="Select part"
                    searchPlaceholder="Search parts..."
                    clearable
                    wrapText
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Credit <span className="text-red-500">*</span></Label>
                  <Input type="number" step="1" value={formData.credits} onChange={(e) => setFormData({ ...formData, credits: e.target.value })} className={`h-10 ${errors.credits ? 'border-destructive' : ''}`} placeholder="e.g., 3" />
                  {errors.credits && <p className="text-xs text-destructive">{errors.credits}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Split Credit</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.split_credit} onCheckedChange={(v) => setFormData({ ...formData, split_credit: v })} />
                    <span className={`text-sm font-medium ${formData.split_credit ? 'text-green-600' : 'text-gray-500'}`}>{formData.split_credit ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className={`text-sm font-semibold ${!formData.split_credit ? 'text-gray-400' : ''}`}>Theory Credit</Label>
                  <Input
                    type="number"
                    step="1"
                    value={formData.theory_credit}
                    onChange={(e) => setFormData({ ...formData, theory_credit: e.target.value })}
                    className={`h-10 ${errors.theory_credit ? 'border-destructive' : ''}`}
                    disabled={!formData.split_credit}
                  />
                  {errors.theory_credit && <p className="text-xs text-destructive">{errors.theory_credit}</p>}
                </div>
                <div className="space-y-2">
                  <Label className={`text-sm font-semibold ${!formData.split_credit ? 'text-gray-400' : ''}`}>Practical Credit</Label>
                  <Input
                    type="number"
                    step="1"
                    value={formData.practical_credit}
                    onChange={(e) => setFormData({ ...formData, practical_credit: e.target.value })}
                    className={`h-10 ${errors.practical_credit ? 'border-destructive' : ''}`}
                    disabled={!formData.split_credit}
                  />
                  {errors.practical_credit && <p className="text-xs text-destructive">{errors.practical_credit}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">QP Code <span className="text-red-500">*</span></Label>
                  <Input value={formData.qp_code} onChange={(e) => setFormData({ ...formData, qp_code: e.target.value })} className={`h-10 ${errors.qp_code ? 'border-destructive' : ''}`} />
                  {errors.qp_code && <p className="text-xs text-destructive">{errors.qp_code}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">E-Code Name</Label>
                  <SearchableSelect
                    value={formData.e_code_name || ""}
                    onValueChange={(v) => setFormData({ ...formData, e_code_name: v })}
                    options={toSearchableOptions([
                      "Tamil", "English", "French", "Malayalam", "Hindi"
                    ])}
                    placeholder="Select language (optional)"
                    searchPlaceholder="Search languages..."
                    clearable
                    wrapText
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Exam hours <span className="text-red-500">*</span></Label>
                  <Input type="number" step="1" value={formData.exam_duration} onChange={(e) => setFormData({ ...formData, exam_duration: e.target.value })} className={`h-10 ${errors.exam_duration ? 'border-destructive' : ''}`} />
                  {errors.exam_duration && <p className="text-xs text-destructive">{errors.exam_duration}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Evaluation Type <span className="text-red-500">*</span></Label>
                  <SearchableSelect
                    value={formData.evaluation_type}
                    onValueChange={(v) => setFormData({ ...formData, evaluation_type: v })}
                    options={toSearchableOptions(["CIA", "ESE", "CIA + ESE", "CA", "CA + ESE"])}
                    placeholder="Select evaluation type"
                    searchPlaceholder="Search evaluation types..."
                    error={!!errors.evaluation_type}
                    clearable
                    wrapText
                  />
                  {errors.evaluation_type && <p className="text-xs text-destructive">{errors.evaluation_type}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Result Type <span className="text-red-500">*</span></Label>
                  <SearchableSelect
                    value={formData.result_type}
                    onValueChange={(v) => setFormData({ ...formData, result_type: v })}
                    options={[
                      { value: 'Mark', label: 'Mark' },
                      { value: 'Status', label: 'Status' },
                      { value: 'comment', label: 'Comment' },
                      { value: 'credit', label: 'Credit' },
                    ]}
                    placeholder="Select result type"
                    searchPlaceholder="Search result types..."
                    error={!!errors.result_type}
                    clearable
                    wrapText
                  />
                  {errors.result_type && <p className="text-xs text-destructive">{errors.result_type}</p>}
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label className="text-sm font-semibold">Syllabus PDF URL</Label>
                  <Input value={formData.syllabus_pdf_url} onChange={(e) => setFormData({ ...formData, syllabus_pdf_url: e.target.value })} className={`h-10 ${errors.syllabus_pdf_url ? 'border-destructive' : ''}`} />
                  {errors.syllabus_pdf_url && <p className="text-xs text-destructive">{errors.syllabus_pdf_url}</p>}
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label className="text-sm font-semibold">Description</Label>
                  <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="min-h-[100px]" placeholder="Add details about the course" />
                </div>
              </div>
            </div>
{/* Course Setting Section */}
<div className="space-y-4 pt-2 border-t">
  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Course Setting</h3>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div className="space-y-2 md:col-span-3">
      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
        <div>
          <Label className="text-sm font-semibold">Credit Included</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Include this course credit in GPA / CGPA calculation</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={formData.credit_included}
          onClick={() => setFormData({ ...formData, credit_included: !formData.credit_included })}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${formData.credit_included ? 'bg-primary' : 'bg-input'}`}
        >
          <span className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${formData.credit_included ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  </div>
</div>
{/* Marks and Hours Section */}
<div className="space-y-4 pt-2 border-t">
  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Marks & Hours</h3>

  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Total Class Hours <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.class_hours} onChange={(e) => setFormData({ ...formData, class_hours: e.target.value })} className={`h-10 ${errors.class_hours ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.class_hours && <p className="text-xs text-destructive">{errors.class_hours}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Theory Hours <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.theory_hours} onChange={(e) => setFormData({ ...formData, theory_hours: e.target.value })} className={`h-10 ${errors.theory_hours ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.theory_hours && <p className="text-xs text-destructive">{errors.theory_hours}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Tutorial Hours</Label>
      <Input type="number" step="1" value={formData.tutorial_hours} onChange={(e) => setFormData({ ...formData, tutorial_hours: e.target.value })} className={`h-10 ${errors.tutorial_hours ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.tutorial_hours && <p className="text-xs text-destructive">{errors.tutorial_hours}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Practical Hours <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.practical_hours} onChange={(e) => setFormData({ ...formData, practical_hours: e.target.value })} className={`h-10 ${errors.practical_hours ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.practical_hours && <p className="text-xs text-destructive">{errors.practical_hours}</p>}
    </div>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Internal Max Mark <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.internal_max_mark} onChange={(e) => setFormData({ ...formData, internal_max_mark: e.target.value })} className={`h-10 ${errors.internal_max_mark ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.internal_max_mark && <p className="text-xs text-destructive">{errors.internal_max_mark}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Internal Pass Mark <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.internal_pass_mark} onChange={(e) => setFormData({ ...formData, internal_pass_mark: e.target.value })} className={`h-10 ${errors.internal_pass_mark ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.internal_pass_mark && <p className="text-xs text-destructive">{errors.internal_pass_mark}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Internal Converted Mark <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.internal_converted_mark} onChange={(e) => setFormData({ ...formData, internal_converted_mark: e.target.value })} className={`h-10 ${errors.internal_converted_mark ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.internal_converted_mark && <p className="text-xs text-destructive">{errors.internal_converted_mark}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">External Max Mark <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.external_max_mark} onChange={(e) => setFormData({ ...formData, external_max_mark: e.target.value })} className={`h-10 ${errors.external_max_mark ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.external_max_mark && <p className="text-xs text-destructive">{errors.external_max_mark}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">External Pass Mark <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.external_pass_mark} onChange={(e) => setFormData({ ...formData, external_pass_mark: e.target.value })} className={`h-10 ${errors.external_pass_mark ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.external_pass_mark && <p className="text-xs text-destructive">{errors.external_pass_mark}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">External Converted Mark <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.external_converted_mark} onChange={(e) => setFormData({ ...formData, external_converted_mark: e.target.value })} className={`h-10 ${errors.external_converted_mark ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.external_converted_mark && <p className="text-xs text-destructive">{errors.external_converted_mark}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Total Pass Mark <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.total_pass_mark} onChange={(e) => setFormData({ ...formData, total_pass_mark: e.target.value })} className={`h-10 ${errors.total_pass_mark ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.total_pass_mark && <p className="text-xs text-destructive">{errors.total_pass_mark}</p>}
    </div>
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Total Max Mark <span className="text-red-500">*</span></Label>
      <Input type="number" step="1" value={formData.total_max_mark} onChange={(e) => setFormData({ ...formData, total_max_mark: e.target.value })} className={`h-10 ${errors.total_max_mark ? 'border-destructive' : ''}`} placeholder="0" />
      {errors.total_max_mark && <p className="text-xs text-destructive">{errors.total_max_mark}</p>}
    </div>
  </div>
</div>
            <div className="space-y-4 pt-2 border-t">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Course Settings</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Self Study Course</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.self_study_course} onCheckedChange={(v) => setFormData({ ...formData, self_study_course: v })} />
                    <span className={`text-sm font-medium ${formData.self_study_course ? 'text-green-600' : 'text-gray-500'}`}>{formData.self_study_course ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Outside Class Course</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.outside_class_course} onCheckedChange={(v) => setFormData({ ...formData, outside_class_course: v })} />
                    <span className={`text-sm font-medium ${formData.outside_class_course ? 'text-green-600' : 'text-gray-500'}`}>{formData.outside_class_course ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Open Book</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.open_book} onCheckedChange={(v) => setFormData({ ...formData, open_book: v })} />
                    <span className={`text-sm font-medium ${formData.open_book ? 'text-green-600' : 'text-gray-500'}`}>{formData.open_book ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Online Course</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.online_course} onCheckedChange={(v) => setFormData({ ...formData, online_course: v })} />
                    <span className={`text-sm font-medium ${formData.online_course ? 'text-green-600' : 'text-gray-500'}`}>{formData.online_course ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Dummy Number Required</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.dummy_number_required} onCheckedChange={(v) => setFormData({ ...formData, dummy_number_required: v })} />
                    <span className={`text-sm font-medium ${formData.dummy_number_required ? 'text-green-600' : 'text-gray-500'}`}>{formData.dummy_number_required ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Annual Course</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.annual_course} onCheckedChange={(v) => setFormData({ ...formData, annual_course: v })} />
                    <span className={`text-sm font-medium ${formData.annual_course ? 'text-green-600' : 'text-gray-500'}`}>{formData.annual_course ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Multiple QP Set</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.multiple_qp_set} onCheckedChange={(v) => setFormData({ ...formData, multiple_qp_set: v })} />
                    <span className={`text-sm font-medium ${formData.multiple_qp_set ? 'text-green-600' : 'text-gray-500'}`}>{formData.multiple_qp_set ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">No of QP Setter</Label>
                  <Input type="number" step="1" value={formData.no_of_qp_setter} onChange={(e) => setFormData({ ...formData, no_of_qp_setter: e.target.value })} className={`h-10 ${errors.no_of_qp_setter ? 'border-destructive' : ''}`} placeholder="0" />
                  {errors.no_of_qp_setter && <p className="text-xs text-destructive">{errors.no_of_qp_setter}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">No of Scrutinizer</Label>
                  <Input type="number" step="1" value={formData.no_of_scrutinizer} onChange={(e) => setFormData({ ...formData, no_of_scrutinizer: e.target.value })} className={`h-10 ${errors.no_of_scrutinizer ? 'border-destructive' : ''}`} placeholder="0" />
                  {errors.no_of_scrutinizer && <p className="text-xs text-destructive">{errors.no_of_scrutinizer}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Fee Exception</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.fee_exception} onCheckedChange={(v) => setFormData({ ...formData, fee_exception: v })} />
                    <span className={`text-sm font-medium ${formData.fee_exception ? 'text-green-600' : 'text-gray-500'}`}>{formData.fee_exception ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Has Hall Ticket</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.has_hall_ticket} onCheckedChange={(v) => setFormData({ ...formData, has_hall_ticket: v })} />
                    <span className={`text-sm font-medium ${formData.has_hall_ticket ? 'text-green-600' : 'text-gray-500'}`}>{formData.has_hall_ticket ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Annual Semester *</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.annual_semester} onCheckedChange={(v) => setFormData({ ...formData, annual_semester: v })} />
                    <span className={`text-sm font-medium ${formData.annual_semester ? 'text-green-600' : 'text-gray-500'}`}>{formData.annual_semester ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Registration Based *</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.registration_based} onCheckedChange={(v) => setFormData({ ...formData, registration_based: v })} />
                    <span className={`text-sm font-medium ${formData.registration_based ? 'text-green-600' : 'text-gray-500'}`}>{formData.registration_based ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Status</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
                    <span className={`text-sm font-medium ${formData.is_active ? 'text-green-600' : 'text-red-500'}`}>{formData.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-semibold">Course Status</Label>
                  <Select
                    value={formData.courses_status}
                    onValueChange={(v) => {
                      const next = v as CourseStatus
                      // If currently Locked and user is changing to anything else, show warning first
                      if (formData.courses_status === 'Locked' && next !== 'Locked') {
                        setLockedWarning({ open: true, targetValue: next })
                        return
                      }
                      setFormData({ ...formData, courses_status: next })
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {COURSE_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.courses_status === 'Locked' && (
                    <p className="text-xs text-amber-700">This course is Locked. Changing the status will require confirmation.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <Button variant="outline" size="sm" className="h-10 px-6" onClick={() => { setSheetOpen(false); resetForm() }}>Cancel</Button>
              <Button size="sm" className="h-10 px-6" onClick={save}>{editing ? 'Update Course' : 'Create Course'}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}