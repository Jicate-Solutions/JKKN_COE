"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppFooter } from "@/components/layout/app-footer"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Download,
  Upload,
  PlusCircle,
  Settings,
  Search,
  ChevronLeft,
  ChevronRight,
  BookText,
  GraduationCap,
  Clock,
  TrendingUp,
  Edit,
  Trash2,
  FileSpreadsheet,
  RefreshCw,
  FileJson,
  AlertTriangle,
  XCircle,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import * as XLSX from 'xlsx'

// Import the new toast utilities
import {
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showValidationToast,
  showInfoToast,
  showUploadSummaryToast,
  showProcessingToast,
  handleApiResponse,
  withToastHandler
} from '@/lib/utils/toast-utils'
import { ENTITY_NAMES } from '@/lib/constants/toast-config'

// Course type definition (same as before)
interface Course {
  id: string
  institutions_id?: string
  regulation_id?: string
  offering_department_id?: string
  institution_code?: string
  regulation_code?: string
  offering_department_code?: string
  course_code: string
  course_title: string
  display_code?: string
  course_category?: string
  course_type: string
  course_part_master?: string
  credits: number
  split_credit?: boolean
  theory_credit?: number
  practical_credit?: number
  qp_code?: string
  e_code_name?: string
  exam_duration?: number
  evaluation_type?: string
  result_type?: string
  self_study_course?: boolean
  outside_class_course?: boolean
  open_book?: boolean
  online_course?: boolean
  dummy_number_required?: boolean
  annual_course?: boolean
  multiple_qp_set?: boolean
  no_of_qp_setter?: number
  no_of_scrutinizer?: number
  fee_exception?: boolean
  syllabus_pdf_url?: string
  description?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export default function CoursesPageRefactored() {
  // All the same state variables as before
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Upload tracking state (enhanced)
  const [uploadSummary, setUploadSummary] = useState<{
    total: number
    success: number
    failed: number
  }>({ total: 0, success: 0, failed: 0 })

  const [uploadErrors, setUploadErrors] = useState<Array<{
    row: number
    course_code: string
    course_title: string
    errors: string[]
  }>>([])

  const [showErrorDialog, setShowErrorDialog] = useState(false)

  // Dropdown state
  const [institutions, setInstitutions] = useState<any[]>([])
  const [departmentsSrc, setDepartmentsSrc] = useState<any[]>([])
  const [regulations, setRegulations] = useState<any[]>([])
  const [codesLoading, setCodesLoading] = useState(false)

  // Form data state (same as before)
  const [formData, setFormData] = useState({
    institution_code: "",
    regulation_code: "",
    offering_department_code: "",
    course_code: "",
    course_title: "",
    display_code: "",
    course_category: "",
    course_type: "",
    course_part_master: "",
    credits: "",
    split_credit: false,
    theory_credit: "",
    practical_credit: "",
    qp_code: "",
    e_code_name: "",
    exam_duration: "",
    evaluation_type: "",
    result_type: "Mark",
    self_study_course: false,
    outside_class_course: false,
    open_book: false,
    online_course: false,
    dummy_number_required: false,
    annual_course: false,
    multiple_qp_set: false,
    no_of_qp_setter: "",
    no_of_scrutinizer: "",
    fee_exception: false,
    syllabus_pdf_url: "",
    description: "",
    is_active: true,
  })

  // Initialize data on mount (same as before)
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/master/courses')
        if (response.ok) {
          const data = await response.json()
          setCourses(data)
        } else {
          const errorData = await response.json()
          if (errorData.error === 'Courses table not found') {
            showErrorToast(
              'Database Setup Required: ' + errorData.message,
              undefined,
              ENTITY_NAMES.courses
            )
            console.log('Setup Instructions:', errorData.instructions)
          }
        }
      } catch (error) {
        showErrorToast(error, undefined, ENTITY_NAMES.courses)
      } finally {
        setLoading(false)
      }
    }

    fetchCourses()

    // Fetch dropdown codes
    ;(async () => {
      try {
        setCodesLoading(true)
        const [instRes, deptRes, regRes] = await Promise.all([
          fetch('/api/master/institutions').catch(() => null),
          fetch('/api/master/departments').catch(() => null),
          fetch('/api/master/regulations').catch(() => null),
        ])
        if (instRes && instRes.ok) {
          const data = await instRes.json()
          const mapped = Array.isArray(data) ? data.filter((i: any) => i?.institution_code).map((i: any) => ({ id: i.id, institution_code: i.institution_code })) : []
          setInstitutions(mapped)
        }
        if (deptRes && deptRes.ok) {
          const data = await deptRes.json()
          const mapped = Array.isArray(data) ? data.filter((d: any) => d?.department_code).map((d: any) => ({ id: d.id, department_code: d.department_code, department_name: d.department_name })) : []
          setDepartmentsSrc(mapped)
        }
        if (regRes && regRes.ok) {
          const data = await regRes.json()
          const mapped = Array.isArray(data) ? data.filter((r: any) => r?.regulation_code).map((r: any) => ({ id: r.id, regulation_code: r.regulation_code })) : []
          setRegulations(mapped)
        }
      } catch (e) {
        console.error('Error loading codes:', e)
      } finally {
        setCodesLoading(false)
      }
    })()
  }, [])

  // Update time every second
  useEffect(() => {
    setCurrentTime(new Date())
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Filter courses based on search and filters
  const filteredCourses = courses.filter((course) => {
    const matchesSearch = course.course_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         course.course_title.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" ||
                         (statusFilter === "active" && course.is_active) ||
                         (statusFilter === "inactive" && !course.is_active)
    const matchesType = typeFilter === "all" || course.course_type === typeFilter

    return matchesSearch && matchesStatus && matchesType
  })

  // Validation function
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
    if (!formData.result_type) e.result_type = 'Result type is required'

    // Course code validation
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

  // Refactored save function using new toast utilities
  const save = async () => {
    if (!validate()) {
      showValidationToast(errors)
      return
    }

    await withToastHandler(
      async () => {
        const payload = {
          institution_code: formData.institution_code,
          regulation_code: formData.regulation_code,
          offering_department_code: formData.offering_department_code || null,
          course_code: formData.course_code,
          course_title: formData.course_title,
          display_code: formData.display_code || null,
          course_category: formData.course_category || null,
          course_type: formData.course_type || null,
          course_part_master: formData.course_part_master || null,
          credits: formData.credits ? Math.trunc(Number(formData.credits)) : 0,
          split_credit: Boolean(formData.split_credit),
          theory_credit: formData.theory_credit ? Math.trunc(Number(formData.theory_credit)) : 0,
          practical_credit: formData.practical_credit ? Math.trunc(Number(formData.practical_credit)) : 0,
          qp_code: formData.qp_code || null,
          e_code_name: formData.e_code_name || null,
          exam_duration: formData.exam_duration ? Math.trunc(Number(formData.exam_duration)) : 0,
          evaluation_type: formData.evaluation_type,
          result_type: formData.result_type,
          self_study_course: Boolean(formData.self_study_course),
          outside_class_course: Boolean(formData.outside_class_course),
          open_book: Boolean(formData.open_book),
          online_course: Boolean(formData.online_course),
          dummy_number_required: Boolean(formData.dummy_number_required),
          annual_course: Boolean(formData.annual_course),
          multiple_qp_set: Boolean(formData.multiple_qp_set),
          no_of_qp_setter: formData.no_of_qp_setter ? Number(formData.no_of_qp_setter) : null,
          no_of_scrutinizer: formData.no_of_scrutinizer ? Number(formData.no_of_scrutinizer) : null,
          fee_exception: Boolean(formData.fee_exception),
          syllabus_pdf_url: formData.syllabus_pdf_url || null,
          description: formData.description || null,
          is_active: Boolean(formData.is_active),
        }

        const url = editing ? `/api/master/courses/${editing.id}` : '/api/master/courses'
        const method = editing ? 'PUT' : 'POST'

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        const result = await handleApiResponse(
          response,
          editing ? 'update' : 'create',
          ENTITY_NAMES.course
        )

        if (result.success) {
          if (editing) {
            setCourses(prev => prev.map(c => c.id === editing.id ? { ...c, ...payload, id: editing.id } : c))
          } else {
            setCourses(prev => [result.data, ...prev])
          }
          setSheetOpen(false)
          resetForm()
        } else {
          throw new Error(result.error)
        }
      },
      {
        operation: editing ? 'update' : 'create',
        entityName: ENTITY_NAMES.course,
        onError: (error) => {
          console.error('Save course error:', error)
        }
      }
    )
  }

  // Refactored delete function using new toast utilities
  const handleDeleteCourse = async (courseId: string) => {
    await withToastHandler(
      async () => {
        const response = await fetch(`/api/master/courses/${courseId}`, {
          method: 'DELETE'
        })

        const result = await handleApiResponse(
          response,
          'delete',
          ENTITY_NAMES.course
        )

        if (result.success) {
          setCourses(courses.filter(course => course.id !== courseId))
          setDeleteCourseId(null)
        } else {
          throw new Error(result.error)
        }
      },
      {
        operation: 'delete',
        entityName: ENTITY_NAMES.course
      }
    )
  }

  // Refactored upload function with enhanced error tracking
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    showProcessingToast('Processing uploaded file...')

    try {
      let jsonData: any[] = []

      // Parse file
      if (file.name.endsWith('.json')) {
        const text = await file.text()
        const parsed = JSON.parse(text)
        jsonData = Array.isArray(parsed) ? parsed : [parsed]
      } else {
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data)
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]
      }

      let successCount = 0
      let errorCount = 0
      const uploadErrors: Array<{
        row: number
        course_code: string
        course_title: string
        errors: string[]
      }> = []

      // Process each row
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i]
        const rowNumber = i + 2

        try {
          // Map fields
          const payload = {
            institution_code: row['Institution Code*'] || row['Institution Code'] || row.institution_code,
            regulation_code: row['Regulation Code*'] || row['Regulation Code'] || row.regulation_code,
            offering_department_code: row['Offering Department Code'] || row.offering_department_code || null,
            course_code: row['Course Code*'] || row['Course Code'] || row.course_code,
            course_title: row['Course Name*'] || row['Course Name'] || row.course_title,
            display_code: row['Display Code*'] || row['Display Code'] || row.display_code,
            course_category: row['Course Category*'] || row['Course Category'] || row.course_category,
            course_type: row['Course Type'] || row.course_type || null,
            course_part_master: row['Part'] || row.course_part_master || null,
            credits: Number(row['Credit'] || row.credits) || 0,
            split_credit: typeof row.split_credit === 'boolean' ? row.split_credit : String(row['Split Credit (TRUE/FALSE)'] || row['Split Credit'] || '').toUpperCase() === 'TRUE',
            theory_credit: Number(row['Theory Credit'] || row.theory_credit) || 0,
            practical_credit: Number(row['Practical Credit'] || row.practical_credit) || 0,
            qp_code: row['QP Code*'] || row['QP Code'] || row.qp_code,
            e_code_name: row['E-Code Name (None/Tamil/English/French/Malayalam/Hindi)'] || row['E-Code Name'] || row.e_code_name || null,
            exam_duration: Number(row['Exam Duration (hours)'] || row['Duration'] || row.exam_duration) || 0,
            evaluation_type: row['Evaluation Type* (CA/ESE/CA + ESE)'] || row['Evaluation Type'] || row.evaluation_type,
            result_type: row['Result Type* (Mark/Status)'] || row['Result Type'] || row.result_type || 'Mark',
            self_study_course: typeof row.self_study_course === 'boolean' ? row.self_study_course : String(row['Self Study Course (TRUE/FALSE)'] || row['Self Study Course'] || '').toUpperCase() === 'TRUE',
            outside_class_course: typeof row.outside_class_course === 'boolean' ? row.outside_class_course : String(row['Outside Class Course (TRUE/FALSE)'] || row['Outside Class Course'] || '').toUpperCase() === 'TRUE',
            open_book: typeof row.open_book === 'boolean' ? row.open_book : String(row['Open Book (TRUE/FALSE)'] || row['Open Book'] || '').toUpperCase() === 'TRUE',
            online_course: typeof row.online_course === 'boolean' ? row.online_course : String(row['Online Course (TRUE/FALSE)'] || row['Online Course'] || '').toUpperCase() === 'TRUE',
            dummy_number_required: typeof row.dummy_number_required === 'boolean' ? row.dummy_number_required : String(row['Dummy Number Required (TRUE/FALSE)'] || row['Dummy Number Required'] || '').toUpperCase() === 'TRUE',
            annual_course: typeof row.annual_course === 'boolean' ? row.annual_course : String(row['Annual Course (TRUE/FALSE)'] || row['Annual Course'] || '').toUpperCase() === 'TRUE',
            multiple_qp_set: typeof row.multiple_qp_set === 'boolean' ? row.multiple_qp_set : String(row['Multiple QP Set (TRUE/FALSE)'] || row['Multiple QP Set'] || '').toUpperCase() === 'TRUE',
            no_of_qp_setter: Number(row['No of QP Setter'] || row.no_of_qp_setter) || null,
            no_of_scrutinizer: Number(row['No of Scrutinizer'] || row.no_of_scrutinizer) || null,
            fee_exception: typeof row.fee_exception === 'boolean' ? row.fee_exception : String(row['Fee Exception (TRUE/FALSE)'] || row['Fee Exception'] || '').toUpperCase() === 'TRUE',
            syllabus_pdf_url: row['Syllabus PDF URL'] || row.syllabus_pdf_url || null,
            description: row['Description'] || row.description || null,
            is_active: typeof row.is_active === 'boolean' ? row.is_active : String(row['Status (TRUE/FALSE)'] || row['Status'] || 'TRUE').toUpperCase() !== 'FALSE'
          }

          // Client-side validation
          const validationErrors: string[] = []
          if (!payload.institution_code?.trim()) validationErrors.push('Institution code required')
          if (!payload.regulation_code?.trim()) validationErrors.push('Regulation code required')
          if (!payload.course_code?.trim()) validationErrors.push('Course code required')
          if (!payload.course_title?.trim()) validationErrors.push('Course name required')

          if (validationErrors.length > 0) {
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              course_code: payload.course_code || 'N/A',
              course_title: payload.course_title || 'N/A',
              errors: validationErrors
            })
            continue
          }

          // API call
          const res = await fetch('/api/master/courses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })

          if (res.ok) {
            const saved = await res.json()
            setCourses(prev => [saved, ...prev])
            successCount++
          } else {
            const errorData = await res.json()
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              course_code: payload.course_code || 'N/A',
              course_title: payload.course_title || 'N/A',
              errors: [errorData.error || 'Failed to save course']
            })
          }
        } catch (error) {
          errorCount++
          uploadErrors.push({
            row: rowNumber,
            course_code: row.course_code || 'N/A',
            course_title: row.course_title || 'N/A',
            errors: [error instanceof Error ? error.message : 'Processing error']
          })
        }
      }

      // Update summary
      setUploadSummary({
        total: jsonData.length,
        success: successCount,
        failed: errorCount
      })

      // Show errors if any
      if (uploadErrors.length > 0) {
        setUploadErrors(uploadErrors)
        setShowErrorDialog(true)
      }

      // Show summary toast
      showUploadSummaryToast(
        jsonData.length,
        successCount,
        errorCount,
        ENTITY_NAMES.course
      )

    } catch (error) {
      showErrorToast(error, 'upload', ENTITY_NAMES.courses)
    } finally {
      // Reset file input
      e.target.value = ''
    }
  }

  // Refactored export function
  const exportToJSON = () => {
    if (courses.length === 0) {
      showWarningToast('No Data', 'No courses to export')
      return
    }

    const data = courses.map(c => ({
      institution_code: c.institution_code || '',
      regulation_code: c.regulation_code || '',
      offering_department_code: c.offering_department_code || '',
      course_code: c.course_code,
      course_title: c.course_title,
      display_code: c.display_code || '',
      course_category: c.course_category || '',
      course_type: c.course_type || '',
      course_part_master: c.course_part_master || '',
      credits: c.credits,
      split_credit: c.split_credit,
      theory_credit: c.theory_credit,
      practical_credit: c.practical_credit,
      qp_code: c.qp_code || '',
      e_code_name: c.e_code_name || '',
      exam_duration: c.exam_duration,
      evaluation_type: c.evaluation_type || '',
      result_type: c.result_type || '',
      self_study_course: c.self_study_course,
      outside_class_course: c.outside_class_course,
      open_book: c.open_book,
      online_course: c.online_course,
      dummy_number_required: c.dummy_number_required,
      annual_course: c.annual_course,
      multiple_qp_set: c.multiple_qp_set,
      no_of_qp_setter: c.no_of_qp_setter,
      no_of_scrutinizer: c.no_of_scrutinizer,
      fee_exception: c.fee_exception,
      syllabus_pdf_url: c.syllabus_pdf_url || '',
      description: c.description || '',
      is_active: c.is_active
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

    showSuccessToast('export', ENTITY_NAMES.courses, {
      count: courses.length
    })
  }

  // Refactored refresh function
  const refreshCourses = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/master/courses')
      const result = await handleApiResponse(
        response,
        'fetch',
        ENTITY_NAMES.courses
      )

      if (result.success) {
        setCourses(result.data)
        showInfoToast(
          '✅ Refreshed',
          `Loaded ${result.data.length} ${ENTITY_NAMES.courses.toLowerCase()}.`
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      institution_code: "",
      regulation_code: "",
      offering_department_code: "",
      course_code: "",
      course_title: "",
      display_code: "",
      course_category: "",
      course_type: "",
      course_part_master: "",
      credits: "",
      split_credit: false,
      theory_credit: "",
      practical_credit: "",
      qp_code: "",
      e_code_name: "",
      exam_duration: "",
      evaluation_type: "",
      result_type: "Mark",
      self_study_course: false,
      outside_class_course: false,
      open_book: false,
      online_course: false,
      dummy_number_required: false,
      annual_course: false,
      multiple_qp_set: false,
      no_of_qp_setter: "",
      no_of_scrutinizer: "",
      fee_exception: false,
      syllabus_pdf_url: "",
      description: "",
      is_active: true,
    })
    setErrors({})
    setEditing(null)
  }

  const openAdd = () => {
    resetForm()
    setSheetOpen(true)
  }

  const openEdit = (row: Course) => {
    setEditing(row)
    setFormData({
      institution_code: row.institution_code || "",
      regulation_code: row.regulation_code || "",
      offering_department_code: row.offering_department_code || "",
      course_code: row.course_code || "",
      course_title: row.course_title || "",
      display_code: row.display_code || (row.course_code || ''),
      course_category: row.course_category || "",
      course_type: row.course_type || "",
      course_part_master: row.course_part_master || "",
      credits: String(row.credits ?? '0'),
      split_credit: Boolean(row.split_credit) || false,
      theory_credit: String(row.theory_credit ?? '0'),
      practical_credit: String(row.practical_credit ?? '0'),
      qp_code: row.qp_code || "",
      e_code_name: row.e_code_name || "",
      exam_duration: String(row.exam_duration ?? ''),
      evaluation_type: row.evaluation_type || "",
      result_type: row.result_type || "Mark",
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
      syllabus_pdf_url: row.syllabus_pdf_url || "",
      description: row.description || "",
      is_active: row.is_active,
    })
    setSheetOpen(true)
  }

  // The rest of your component JSX would be the same...
  // For brevity, I'll just return a simple div here
  return (
    <div>
      {/* Your existing JSX here - forms, tables, dialogs etc. */}
      {/* The UI remains the same, only the toast handling changes */}

      {/* Enhanced Error Dialog */}
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
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
                Please correct these errors in your Excel file and try uploading again.
              </p>
            </div>

            {/* Detailed Error List */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {uploadErrors.map((error, index) => (
                <div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700">
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
                    <li>• Foreign keys must reference existing records</li>
                    <li>• Check field length constraints</li>
                    <li>• Verify data format matches expected patterns</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowErrorDialog(false)}>
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}