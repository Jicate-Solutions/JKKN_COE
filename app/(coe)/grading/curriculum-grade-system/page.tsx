"use client"

import { useMemo, useState, useEffect } from "react"
import XLSX from "@/lib/utils/excel-compat"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import {
  PlusCircle,
  Edit,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Award,
  TrendingUp,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MoreHorizontal,
  Download,
  Upload,
  ChevronDown,
} from "lucide-react"

import type {
  CurriculumGradeSystem,
} from '@/lib/utils/curriculum-grade-system/validation'

import {
  fetchInstitutions as fetchInstitutionsService,
  fetchRegulations as fetchRegulationsService,
} from '@/services/grading/grade-system-service'

import {
  validateCurriculumGradeSystemFormData,
  validateCurriculumGradeSystemImportRow,
} from '@/lib/utils/curriculum-grade-system/validation'

import {
  exportToJSON,
  exportToExcel,
  exportTemplate,
} from '@/lib/utils/curriculum-grade-system/export-import'

export default function CurriculumGradeSystemPage() {
  const { toast } = useToast()

  const {
    filter,
    isReady,
    appendToUrl,
    getInstitutionCodeForCreate,
    mustSelectInstitution,
    shouldFilter,
    institutionCode,
    institutionId
  } = useInstitutionFilter()

  const [items, setItems] = useState<CurriculumGradeSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [deleteTarget, setDeleteTarget] = useState<CurriculumGradeSystem | null>(null)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<CurriculumGradeSystem | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [errorPopupOpen, setErrorPopupOpen] = useState(false)
  const [importErrors, setImportErrors] = useState<Array<{
    row: number
    grade_system_code: string
    grade: string
    errors: string[]
  }>>([])
  const [uploadSummary, setUploadSummary] = useState<{
    total: number
    success: number
    failed: number
  }>({ total: 0, success: 0, failed: 0 })

  const [institutions, setInstitutions] = useState<Array<{ id: string; institution_code: string; name?: string; counselling_code?: string | null }>>([])
  const [regulations, setRegulations] = useState<Array<{ id: string; regulation_code: string; name?: string }>>([])
  const [regulationsLoading, setRegulationsLoading] = useState(false)
  const [allGrades, setAllGrades] = useState<Array<{ id: string; grade: string; grade_point: number; regulation_code?: string }>>([])

  const gradeSystemCodeOptions: Array<'UG' | 'PG'> = ['UG', 'PG']

  const [formData, setFormData] = useState({
    institutions_code: "",
    grade_system_code: "" as '' | 'UG' | 'PG',
    cgpa_grade_id: "",
    regulation_id: "",
    classification: "",
    min_cgpa: "",
    max_cgpa: "",
    description: "",
    is_active: true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Client-side filter: grades filtered by selected regulation
  const filteredGrades = useMemo(() => {
    if (!formData.regulation_id) return []
    const selectedReg = regulations.find(r => r.id === formData.regulation_id)
    if (!selectedReg) return allGrades
    // Grades without a regulation_code are regulation-agnostic — always offer them
    return allGrades.filter(g => !g.regulation_code || g.regulation_code === selectedReg.regulation_code)
  }, [allGrades, formData.regulation_id, regulations])

  const fetchGradeSystems = async () => {
    try {
      setLoading(true)
      const url = appendToUrl('/api/grading/curriculum-grade-system')
      const res = await fetch(url)
      if (!res.ok) throw new Error('Fetch failed')
      const data = await res.json()
      setItems(data)
    } catch (error) {
      console.error('Error fetching curriculum grade systems:', error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const fetchInstitutionsList = async () => {
    try {
      const data = await fetchInstitutionsService()
      setInstitutions(data)
    } catch (e) {
      console.error('Failed to load institutions:', e)
    }
  }

  const fetchRegulationsList = async (institutionCode?: string) => {
    try {
      setRegulationsLoading(true)
      let counsellingCode: string | undefined
      if (institutionCode) {
        const institution = institutions.find(i => i.institution_code === institutionCode)
        counsellingCode = institution?.counselling_code || undefined
      }
      const data = await fetchRegulationsService(counsellingCode)
      setRegulations(data)
    } catch (e) {
      console.error('Failed to load regulations:', e)
    } finally {
      setRegulationsLoading(false)
    }
  }

  const fetchGradesList = async (instId?: string | null) => {
    try {
      let url = '/api/grading/curriculum-grades'
      if (instId) {
        url += `?institutions_id=${instId}`
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const mapped = Array.isArray(data)
          ? data.filter((i: any) => i?.grade).map((i: any) => ({
            id: i.id,
            grade: i.grade,
            grade_point: i.grade_point || 0,
            regulation_code: i.regulation_code || '',
          }))
          : []
        setAllGrades(mapped)
      }
    } catch (e) {
      console.error('Failed to load curriculum grades:', e)
    }
  }

  useEffect(() => {
    if (isReady) {
      fetchGradeSystems()
      fetchInstitutionsList()
      fetchGradesList(institutionId)
    }
  }, [isReady, filter, institutionId])

  useEffect(() => {
    if (formData.institutions_code) {
      fetchRegulationsList(formData.institutions_code)
    } else {
      setRegulations([])
    }
  }, [formData.institutions_code, institutions])


  const resetForm = () => {
    const autoInstitutionCode = getInstitutionCodeForCreate() || ""
    setFormData({
      institutions_code: autoInstitutionCode,
      grade_system_code: "" as '' | 'UG' | 'PG',
      cgpa_grade_id: "",
      regulation_id: "",
      classification: "",
      min_cgpa: "",
      max_cgpa: "",
      description: "",
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
      .filter((i) => [i.institutions_code, i.grade_system_code, i.grade, i.classification, i.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .filter((i) => statusFilter === "all" || (statusFilter === "active" ? i.is_active : !i.is_active))

    if (!sortColumn) return data
    const sorted = [...data].sort((a, b) => {
      const av = (a as any)[sortColumn]
      const bv = (b as any)[sortColumn]
      if (av === bv) return 0
      if (sortDirection === "asc") return av > bv ? 1 : -1
      return av < bv ? 1 : -1
    })
    return sorted
  }, [items, searchTerm, sortColumn, sortDirection, statusFilter])

  const pageSizeOptions = useMemo(() => {
    const allSizes = [10, 20, 50, 100, 250, 500, 1000]
    const total = filtered.length
    const options = allSizes.filter(s => s < total)
    if (!options.includes(10)) options.unshift(10)
    if (total > 10) options.push(total)
    return options
  }, [filtered.length])

  const isShowAll = itemsPerPage >= filtered.length
  const effectivePerPage = isShowAll ? filtered.length || 1 : itemsPerPage
  const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
  const startIndex = (currentPage - 1) * effectivePerPage
  const endIndex = startIndex + effectivePerPage
  const pageItems = filtered.slice(startIndex, endIndex)

  useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, statusFilter, itemsPerPage])

  const openAdd = () => {
    resetForm()
    setSheetOpen(true)
  }

  const openEdit = (row: CurriculumGradeSystem) => {
    setEditing(row)
    setFormData({
      institutions_code: row.institutions_code,
      grade_system_code: row.grade_system_code as '' | 'UG' | 'PG',
      cgpa_grade_id: row.cgpa_grade_id || "",
      regulation_id: row.regulation_id ? String(row.regulation_id) : "",
      classification: row.classification || "",
      min_cgpa: String(row.min_cgpa),
      max_cgpa: String(row.max_cgpa),
      description: row.description || "",
      is_active: row.is_active,
    })
    setSheetOpen(true)
  }

  const validate = () => {
    const e = validateCurriculumGradeSystemFormData(formData)
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = async () => {
    if (!validate()) {
      toast({
        title: "Validation Error",
        description: "Please fix all validation errors before submitting.",
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
      })
      return
    }

    try {
      setLoading(true)

      const selectedInstitution = institutions.find(inst => inst.institution_code === formData.institutions_code)
      const selectedGrade = allGrades.find(g => g.id === formData.cgpa_grade_id)

      if (!selectedInstitution) {
        toast({
          title: "Error",
          description: "Selected institution not found. Please refresh and try again.",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      if (!selectedGrade) {
        toast({
          title: "Error",
          description: "Selected grade not found. Please refresh and try again.",
          variant: "destructive",
        })
        setLoading(false)
        return
      }

      const payload = {
        ...formData,
        institutions_id: selectedInstitution.id,
        grade: selectedGrade.grade,
        grade_point: selectedGrade.grade_point,
        min_cgpa: Number(formData.min_cgpa),
        max_cgpa: Number(formData.max_cgpa),
        regulation_id: formData.regulation_id
      }

      if (editing) {
        const response = await fetch('/api/grading/curriculum-grade-system', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to update curriculum grade system')
        }

        const updatedSystem = await response.json()
        setItems((prev) => prev.map((p) => (p.id === editing.id ? updatedSystem : p)))

        toast({
          title: "Curriculum Grade System Updated",
          description: `${updatedSystem.grade_system_code} has been successfully updated.`,
          className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
        })
      } else {
        const response = await fetch('/api/grading/curriculum-grade-system', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to create curriculum grade system')
        }

        const newSystem = await response.json()
        setItems((prev) => [newSystem, ...prev])

        toast({
          title: "Curriculum Grade System Created",
          description: `${newSystem.grade_system_code} has been successfully created.`,
          className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
        })
      }

      setSheetOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving curriculum grade system:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save curriculum grade system. Please try again.'
      toast({
        title: "Save Failed",
        description: errorMessage,
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id: string) => {
    try {
      setLoading(true)
      const systemName = items.find(i => i.id === id)?.grade_system_code || 'Curriculum Grade System'

      const response = await fetch(`/api/grading/curriculum-grade-system?id=${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete curriculum grade system')
      }

      setItems((prev) => prev.filter((p) => p.id !== id))

      toast({
        title: "Curriculum Grade System Deleted",
        description: `${systemName} has been successfully deleted.`,
        className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
      })
    } catch (error) {
      console.error('Error deleting curriculum grade system:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete curriculum grade system. Please try again.'
      toast({
        title: "Delete Failed",
        description: errorMessage,
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
    } finally {
      setLoading(false)
    }
  }

  const validateGradeSystemData = (data: any, rowIndex: number) => {
    return validateCurriculumGradeSystemImportRow(data, rowIndex)
  }

  const handleDownload = () => {
    exportToJSON(filtered)
  }

  const handleExport = () => {
    exportToExcel(filtered)
  }

  const handleTemplateExport = () => {
    exportTemplate(institutions, regulations, allGrades)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        let rows: any[] = []
        if (file.name.endsWith('.json')) {
          const text = await file.text()
          rows = JSON.parse(text)
        } else if (file.name.endsWith('.csv')) {
          const text = await file.text()
          const lines = text.split('\n').filter(line => line.trim())
          if (lines.length < 2) {
            toast({
              title: "Invalid CSV File",
              description: "CSV file must have at least a header row and one data row",
              variant: "destructive",
              className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
            })
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

          rows = dataRows.map(j => {
            const systemCode = String(j['System Code *'] || j['System Code'] || '').toUpperCase()
            return {
              institutions_code: String(j['Institution Code *'] || j['Institution Code'] || ''),
              grade_system_code: (systemCode === 'UG' || systemCode === 'PG') ? systemCode as 'UG' | 'PG' : systemCode,
              cgpa_grade_id: String(j['Grade ID *'] || j['Grade ID'] || ''),
              regulation_id: String(j['Regulation ID *'] || j['Regulation ID'] || ''),
              classification: String(j['Classification *'] || j['Classification'] || ''),
              min_cgpa: Number(j['Min CGPA *'] || j['Min CGPA'] || 0),
              max_cgpa: Number(j['Max CGPA *'] || j['Max CGPA'] || 0),
              description: String(j['Description *'] || j['Description'] || ''),
              is_active: String(j['Status'] || '').toLowerCase() === 'active'
            }
          })
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const data = new Uint8Array(await file.arrayBuffer())
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
          rows = json.map(j => {
            const systemCode = String(j['System Code *'] || j['System Code'] || '').toUpperCase()
            return {
              institutions_code: String(j['Institution Code *'] || j['Institution Code'] || ''),
              grade_system_code: (systemCode === 'UG' || systemCode === 'PG') ? systemCode as 'UG' | 'PG' : systemCode,
              cgpa_grade_id: String(j['Grade ID *'] || j['Grade ID'] || ''),
              regulation_id: String(j['Regulation ID *'] || j['Regulation ID'] || ''),
              classification: String(j['Classification *'] || j['Classification'] || ''),
              min_cgpa: Number(j['Min CGPA *'] || j['Min CGPA'] || 0),
              max_cgpa: Number(j['Max CGPA *'] || j['Max CGPA'] || 0),
              description: String(j['Description *'] || j['Description'] || ''),
              is_active: String(j['Status'] || '').toLowerCase() === 'active'
            }
          })
        }

        const now = new Date().toISOString()
        const validationErrors: Array<{
          row: number
          grade_system_code: string
          grade: string
          errors: string[]
        }> = []

        const mapped = rows.map((r, index) => {
          const systemData = {
            id: String(Date.now() + Math.random()),
            institutions_code: (r as any).institutions_code || '',
            grade_system_code: r.grade_system_code!,
            cgpa_grade_id: r.cgpa_grade_id || '',
            regulation_id: r.regulation_id || 0,
            classification: r.classification || '',
            min_cgpa: r.min_cgpa || 0,
            max_cgpa: r.max_cgpa || 0,
            description: r.description || '',
            is_active: r.is_active ?? true,
            created_at: now,
          }

          const validErrs = validateGradeSystemData(systemData, index + 2)
          if (validErrs.length > 0) {
            validationErrors.push({
              row: index + 2,
              grade_system_code: systemData.grade_system_code || 'N/A',
              grade: 'N/A',
              errors: validErrs
            })
          }

          return systemData
        }).filter(r => r.grade_system_code && r.cgpa_grade_id) as any[]

        if (validationErrors.length > 0) {
          setImportErrors(validationErrors)
          setUploadSummary({
            total: rows.length,
            success: 0,
            failed: validationErrors.length
          })
          setErrorPopupOpen(true)
          return
        }

        if (mapped.length === 0) {
          toast({
            title: "No Valid Data",
            description: "No valid data found in the file. Please check that required fields are provided.",
            variant: "destructive",
            className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
          })
          return
        }

        setLoading(true)
        let successCount = 0
        let errorCount = 0
        const uploadErrors: Array<{
          row: number
          grade_system_code: string
          grade: string
          errors: string[]
        }> = []

        for (let i = 0; i < mapped.length; i++) {
          const system = mapped[i]
          const rowNumber = i + 2

          try {
            const response = await fetch('/api/grading/curriculum-grade-system', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(system),
            })

            if (response.ok) {
              const savedSystem = await response.json()
              setItems(prev => [savedSystem, ...prev])
              successCount++
            } else {
              const errorData = await response.json()
              errorCount++
              uploadErrors.push({
                row: rowNumber,
                grade_system_code: system.grade_system_code || 'N/A',
                grade: system.grade || 'N/A',
                errors: [errorData.error || 'Failed to save curriculum grade system']
              })
            }
          } catch (error) {
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              grade_system_code: system.grade_system_code || 'N/A',
              grade: system.grade || 'N/A',
              errors: [error instanceof Error ? error.message : 'Network error']
            })
          }
        }

        setLoading(false)

        const totalRows = mapped.length
        setUploadSummary({
          total: totalRows,
          success: successCount,
          failed: errorCount
        })

        if (uploadErrors.length > 0) {
          setImportErrors(uploadErrors)
          setErrorPopupOpen(true)
        }

        if (successCount > 0 && errorCount === 0) {
          toast({
            title: "Upload Complete",
            description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''}.`,
            className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
            duration: 5000,
          })
        } else if (successCount > 0 && errorCount > 0) {
          toast({
            title: "Partial Upload Success",
            description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: ${successCount} successful, ${errorCount} failed.`,
            className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
            duration: 6000,
          })
        } else if (errorCount > 0) {
          toast({
            title: "Upload Failed",
            description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: 0 successful, ${errorCount} failed.`,
            variant: "destructive",
            className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
            duration: 6000,
          })
        }
      } catch (err) {
        console.error('Import error:', err)
        setLoading(false)
        toast({
          title: "Import Error",
          description: "Import failed. Please check your file format and try again.",
          variant: "destructive",
          className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
        })
      }
    }
    input.click()
  }

  const colSpan = mustSelectInstitution ? 10 : 9

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen">
        <AppHeader />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
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
                  <BreadcrumbPage>Curriculum Grade System</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Scorecard Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Total Systems</p>
                    <p className="text-xl font-bold">{items.length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                    <Award className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Active Systems</p>
                    <p className="text-xl font-bold text-green-600">{items.filter(i => i.is_active).length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <Award className="h-3 w-3 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Inactive Systems</p>
                    <p className="text-xl font-bold text-red-600">{items.filter(i => !i.is_active).length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <Award className="h-3 w-3 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">New This Month</p>
                    <p className="text-xl font-bold text-purple-600">
                      {items.filter(i => {
                        const d = new Date(i.created_at)
                        const n = new Date()
                        return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
                      }).length}
                    </p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                    <TrendingUp className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex-shrink-0 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Award className="h-3 w-3 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Curriculum Grade Systems</h2>
                    <p className="text-xs text-muted-foreground">Manage curriculum grading systems</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={fetchGradeSystems}
                          disabled={loading}
                        >
                          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={handleTemplateExport}
                  >
                    <FileSpreadsheet className="h-3 w-3 mr-1" />
                    Template
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs px-2">
                        <Download className="h-3 w-3 mr-1" />
                        Export
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExport}>
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
                        Export as Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDownload}>
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Export as JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={handleImport}
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Import
                  </Button>

                  <Button size="sm" className="h-8 text-xs px-2" onClick={openAdd} disabled={loading}>
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
                          <TableHead className="w-[120px] text-xs">
                            <Button variant="ghost" size="sm" onClick={() => handleSort("institutions_code")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                              Institution
                              <span className="ml-1">{getSortIcon("institutions_code")}</span>
                            </Button>
                          </TableHead>
                        )}
                        <TableHead className="w-[120px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("grade_system_code")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            System Code
                            <span className="ml-1">{getSortIcon("grade_system_code")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[80px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("grade")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Grade
                            <span className="ml-1">{getSortIcon("grade")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[100px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("grade_point")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Grade Point
                            <span className="ml-1">{getSortIcon("grade_point")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[120px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("classification")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Classification
                            <span className="ml-1">{getSortIcon("classification")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[80px] text-xs">Min CGPA</TableHead>
                        <TableHead className="w-[80px] text-xs">Max CGPA</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="w-[100px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("is_active")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Status
                            <span className="ml-1">{getSortIcon("is_active")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[60px] text-xs text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={colSpan} className="h-24 text-center text-sm">Loading...</TableCell>
                        </TableRow>
                      ) : pageItems.length ? (
                        pageItems.map((row) => (
                          <TableRow key={row.id}>
                            {mustSelectInstitution && (
                              <TableCell className="text-sm font-medium">{row.institutions_code}</TableCell>
                            )}
                            <TableCell className="text-sm">{row.grade_system_code}</TableCell>
                            <TableCell className="text-sm font-semibold">{row.grade}</TableCell>
                            <TableCell className="text-sm">{row.grade_point}</TableCell>
                            <TableCell className="text-sm">{row.classification}</TableCell>
                            <TableCell className="text-sm">{row.min_cgpa}</TableCell>
                            <TableCell className="text-sm">{row.max_cgpa}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.description}</TableCell>
                            <TableCell>
                              <Badge
                                variant={row.is_active ? "default" : "secondary"}
                                className={`text-xs ${row.is_active
                                  ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
                                  : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200'
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
                                    <Edit className="h-3.5 w-3.5 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                                    onClick={() => setDeleteTarget(row)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={colSpan} className="h-24 text-center text-sm text-muted-foreground">
                            {searchTerm || statusFilter !== 'all' ? 'No matching curriculum grade systems' : 'No curriculum grade systems yet'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between py-2 mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {filtered.length === 0 ? '0' : `${startIndex + 1}-${Math.min(endIndex, filtered.length)}`} of {filtered.length}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">Rows:</span>
                  <Select
                    value={String(itemsPerPage)}
                    onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}
                  >
                    <SelectTrigger className="h-7 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pageSizeOptions.map(size => (
                        <SelectItem key={size} value={String(size)} className="text-xs">
                          {size >= filtered.length && filtered.length > 0 ? 'All' : size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" /> Previous
                  </Button>
                  <div className="text-xs text-muted-foreground px-2">Page {currentPage} of {totalPages}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="h-7 px-2 text-xs"
                  >
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
        <SheetContent className="sm:max-w-[800px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Award className="h-4 w-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-lg font-semibold">
                  {editing ? "Edit Curriculum Grade System" : "Add Curriculum Grade System"}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {editing ? "Update curriculum grade system information" : "Create a new curriculum grade system record"}
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            {/* Basic Information */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(mustSelectInstitution || !shouldFilter || !institutionCode) ? (
                  <div className="space-y-2">
                    <Label htmlFor="institutions_code" className="text-sm font-medium">
                      Institution Code <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={formData.institutions_code}
                      onValueChange={(code) => {
                        setFormData(prev => ({ ...prev, institutions_code: code, regulation_id: '', cgpa_grade_id: '' }))
                      }}
                    >
                      <SelectTrigger className={`h-10 ${errors.institutions_code ? 'border-destructive' : ''}`}>
                        <SelectValue placeholder="Select Institution Code" />
                      </SelectTrigger>
                      <SelectContent>
                        {institutions.map(inst => (
                          <SelectItem key={inst.id} value={inst.institution_code}>
                            {inst.institution_code}{inst.name ? ` - ${inst.name}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.institutions_code && <p className="text-xs text-destructive">{errors.institutions_code}</p>}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="grade_system_code" className="text-sm font-medium">
                    System Code (UG/PG) <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.grade_system_code}
                    onValueChange={(value) => setFormData({ ...formData, grade_system_code: value as 'UG' | 'PG' })}
                  >
                    <SelectTrigger className={`h-10 ${errors.grade_system_code ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Select System Code" />
                    </SelectTrigger>
                    <SelectContent>
                      {gradeSystemCodeOptions.map(code => (
                        <SelectItem key={code} value={code}>
                          {code} - {code === 'UG' ? 'Undergraduate' : 'Postgraduate'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.grade_system_code && <p className="text-xs text-destructive">{errors.grade_system_code}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="regulation_id" className="text-sm font-medium">
                    Regulation <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.regulation_id}
                    onValueChange={(id) => setFormData(prev => ({ ...prev, regulation_id: id, cgpa_grade_id: '' }))}
                    disabled={!formData.institutions_code || regulationsLoading}
                  >
                    <SelectTrigger className={`h-10 ${errors.regulation_id ? 'border-destructive' : ''} ${!formData.institutions_code ? 'bg-muted' : ''}`}>
                      <SelectValue placeholder={
                        !formData.institutions_code
                          ? "Select institution first"
                          : regulationsLoading
                            ? "Loading regulations..."
                            : "Select Regulation"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {regulations.map(reg => (
                        <SelectItem key={reg.id} value={reg.id}>
                          {reg.regulation_code}{reg.name ? ` - ${reg.name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.regulation_id && <p className="text-xs text-destructive">{errors.regulation_id}</p>}
                  {!formData.institutions_code && (
                    <p className="text-xs text-muted-foreground">Select an institution to see available regulations</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cgpa_grade_id" className="text-sm font-medium">
                    Grade <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.cgpa_grade_id}
                    onValueChange={(id) => setFormData(prev => ({ ...prev, cgpa_grade_id: id }))}
                    disabled={!formData.regulation_id}
                  >
                    <SelectTrigger className={`h-10 ${errors.cgpa_grade_id ? 'border-destructive' : ''} ${!formData.regulation_id ? 'bg-muted' : ''}`}>
                      <SelectValue placeholder={
                        !formData.regulation_id
                          ? "Select regulation first"
                          : "Select Grade"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredGrades.map(g => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.grade} (GP: {g.grade_point})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.cgpa_grade_id && <p className="text-xs text-destructive">{errors.cgpa_grade_id}</p>}
                  {!formData.regulation_id && (
                    <p className="text-xs text-muted-foreground">Select a regulation to see available grades</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="classification" className="text-sm font-medium">
                    Classification
                  </Label>
                  <Input
                    id="classification"
                    value={formData.classification}
                    onChange={(e) => setFormData({ ...formData, classification: e.target.value })}
                    className={`h-10 ${errors.classification ? 'border-destructive' : ''}`}
                    placeholder="e.g., First Class"
                  />
                  {errors.classification && <p className="text-xs text-destructive">{errors.classification}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="min_cgpa" className="text-sm font-medium">
                    Min CGPA (-1 or 0-10) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="min_cgpa"
                    type="number"
                    step="0.01"
                    min="-1"
                    max="10"
                    value={formData.min_cgpa}
                    onChange={(e) => setFormData({ ...formData, min_cgpa: e.target.value })}
                    className={`h-10 ${errors.min_cgpa ? 'border-destructive' : ''}`}
                    placeholder="e.g., 6.5 (-1 for absent)"
                  />
                  {errors.min_cgpa && <p className="text-xs text-destructive">{errors.min_cgpa}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_cgpa" className="text-sm font-medium">
                    Max CGPA (-1 or 0-10) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="max_cgpa"
                    type="number"
                    step="0.01"
                    min="-1"
                    max="10"
                    value={formData.max_cgpa}
                    onChange={(e) => setFormData({ ...formData, max_cgpa: e.target.value })}
                    className={`h-10 ${errors.max_cgpa ? 'border-destructive' : ''}`}
                    placeholder="e.g., 7.5 (-1 for absent)"
                  />
                  {errors.max_cgpa && <p className="text-xs text-destructive">{errors.max_cgpa}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description" className="text-sm font-medium">
                    Description <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={`h-10 ${errors.description ? 'border-destructive' : ''}`}
                    placeholder="e.g., Outstanding performance"
                  />
                  {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
              <div className="flex items-center gap-4">
                <Label className="text-sm font-medium">System Status</Label>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    formData.is_active ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-sm font-medium ${formData.is_active ? 'text-green-600' : 'text-red-500'}`}>
                  {formData.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
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
                {editing ? "Update Curriculum Grade System" : "Create Curriculum Grade System"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Standalone Delete AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Curriculum Grade System</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{deleteTarget?.grade_system_code}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  remove(deleteTarget.id)
                  setDeleteTarget(null)
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
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
                Please correct these errors in your file and try uploading again.
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
                        {error.grade_system_code} - {error.grade}
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
                    <li>Ensure all required fields are provided (Institution Code, System Code, Grade ID, Regulation ID, Min CGPA, Max CGPA, Description)</li>
                    <li>Institution Code must reference existing institutions</li>
                    <li>Grade ID must reference existing curriculum grades</li>
                    <li>Min CGPA and Max CGPA must be between 0 and 10</li>
                    <li>Min CGPA must be less than Max CGPA</li>
                    <li>Status values: true/false or Active/Inactive</li>
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
