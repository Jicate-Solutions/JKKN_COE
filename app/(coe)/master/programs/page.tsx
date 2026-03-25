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
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, BookOpen, TrendingUp, FileSpreadsheet, RefreshCw, Download, Upload, XCircle, AlertTriangle, MoreHorizontal, ChevronDown } from "lucide-react"

type Program = {
  id: string
  institution_code: string
  degree_code: string
  offering_department_code?: string
  program_type?: "UG" | "PG" | "M.Phil" | "Ph.D"
  program_code: string
  program_name: string
  display_name?: string
  program_duration_yrs: number
  program_order: number
  pattern_type: "Year" | "Semester"
  is_active: boolean
  created_at: string
}

export default function ProgramPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<Program[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")

  // Dropdown data
  const [institutions, setInstitutions] = useState<Array<{ id: string; institution_code: string; name: string }>>([])
  const [degrees, setDegrees] = useState<Array<{ id: string; degree_code: string; degree_name: string }>>([])
  const [departments, setDepartments] = useState<Array<{ id: string; department_code: string; department_name: string }>>([])
  // removed year filter per request

  const [formData, setFormData] = useState({
    institution_code: "",
    degree_code: "",
    offering_department_code: "",
    program_type: "" as "" | "UG" | "PG" | "M.Phil" | "Ph.D",
    program_code: "",
    program_name: "",
    display_name: "",
    program_duration_yrs: 3,
    program_order: 1,
    pattern_type: "Semester" as "Year" | "Semester",
    is_active: true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Upload summary state
  const [uploadSummary, setUploadSummary] = useState<{
    total: number
    success: number
    failed: number
  }>({ total: 0, success: 0, failed: 0 })

  const [importErrors, setImportErrors] = useState<Array<{
    row: number
    program_code: string
    program_name: string
    errors: string[]
  }>>([])

  const [errorPopupOpen, setErrorPopupOpen] = useState(false)

  const resetForm = () => {
    setFormData({
      institution_code: "",
      degree_code: "",
      offering_department_code: "",
      program_type: "",
      program_code: "",
      program_name: "",
      display_name: "",
      program_duration_yrs: 3,
      program_order: 1,
      pattern_type: "Semester",
      is_active: true,
    })
    setErrors({})
    setEditing(null)
  }

  const handleSort = (c: string) => {
    if (sortColumn === c) setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    else { setSortColumn(c); setSortDirection("asc") }
  }
  const getSortIcon = (c: string) => sortColumn !== c ? <ArrowUpDown className="h-3 w-3 text-muted-foreground" /> : (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase()
    const data = items
      .filter((i) => [i.institution_code, i.degree_code, i.offering_department_code, i.program_code, i.program_name, i.display_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .filter((i) => statusFilter === "all" || (statusFilter === "active" ? i.is_active : !i.is_active))

    if (!sortColumn) return data
    return [...data].sort((a, b) => {
      const av = (a as any)[sortColumn]
      const bv = (b as any)[sortColumn]
      if (av === bv) return 0
      return sortDirection === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
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
  useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, statusFilter])


  const openAdd = () => { resetForm(); setSheetOpen(true) }
  const openEdit = (row: Program) => {
    setEditing(row)
    setFormData({
      institution_code: row.institution_code,
      degree_code: row.degree_code,
      offering_department_code: row.offering_department_code || "",
      program_type: row.program_type || "",
      program_code: row.program_code,
      program_name: row.program_name,
      display_name: row.display_name || "",
      program_duration_yrs: row.program_duration_yrs,
      program_order: row.program_order,
      pattern_type: row.pattern_type,
      is_active: row.is_active,
    })
    setSheetOpen(true)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!formData.institution_code.trim()) e.institution_code = "Required"
    if (!formData.degree_code.trim()) e.degree_code = "Required"
    if (!formData.program_code.trim()) e.program_code = "Required"
    if (!formData.program_name.trim()) e.program_name = "Required"
    if (formData.program_duration_yrs < 1) e.program_duration_yrs = "Must be at least 1 year"
    if (formData.program_order < 1) e.program_order = "Must be at least 1"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!validate()) return
    try {
      setSaving(true)
      if (editing) {
        const res = await fetch(`/api/master/programs/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || 'Update failed')
        }
        const updated = await res.json()
        setItems((p) => p.map((x) => x.id === editing.id ? updated : x))
      } else {
        const res = await fetch('/api/master/programs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.error || 'Create failed')
        }
        const created = await res.json()
        setItems((p) => [created, ...p])
      }
      setSheetOpen(false)
      resetForm()
    } catch (e) {
      console.error(e)
      const errorMessage = e instanceof Error ? e.message : 'Failed to save program'
      alert(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/master/programs/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setItems((p) => p.filter((x) => x.id !== id))
    } catch (e) {
      console.error(e)
      alert('Failed to delete program')
    }
  }
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })

  const handleDownload = () => {
    const json = JSON.stringify(filtered, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `program_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: 'Export Successful',
      description: `${filtered.length} programs exported to JSON.`,
      className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
    })
  }

  const handleExport = () => {
    const excelData = filtered.map(r => ({
      'Institution Code': r.institution_code,
      'Degree Code': r.degree_code,
      'Program Type': r.program_type || '',
      'Offering Dept': r.offering_department_code || '',
      'Program Code': r.program_code,
      'Program Name': r.program_name,
      'Display Name': r.display_name || '',
      'Duration (Years)': r.program_duration_yrs,
      'Program Order': r.program_order,
      'Pattern': r.pattern_type,
      'Status': r.is_active ? 'Active' : 'Inactive',
      'Created': new Date(r.created_at).toISOString().split('T')[0]
    }))
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Program')
    XLSX.writeFile(wb, `program_export_${new Date().toISOString().split('T')[0]}.xlsx`)

    toast({
      title: 'Export Successful',
      description: `${filtered.length} programs exported to Excel.`,
      className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
    })
  }

  const handleTemplateExport = async () => {
    // Ensure reference data is loaded
    let currentInstitutions = institutions
    let currentDegrees = degrees
    let currentDepartments = departments

    // Fetch data if not already loaded
    if (institutions.length === 0 || degrees.length === 0 || departments.length === 0) {
      toast({
        title: 'Loading Reference Data',
        description: 'Fetching latest reference data...',
        className: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200'
      })

      try {
        // Fetch institutions
        if (institutions.length === 0) {
          const resInst = await fetch('/api/master/institutions')
          if (resInst.ok) {
            const dataInst = await resInst.json()
            currentInstitutions = dataInst.filter((i: any) => i.is_active).map((i: any) => ({
              id: i.id,
              institution_code: i.institution_code,
              name: i.name
            }))
            setInstitutions(currentInstitutions)
          }
        }

        // Fetch degrees
        if (degrees.length === 0) {
          const resDeg = await fetch('/api/master/degrees')
          if (resDeg.ok) {
            const dataDeg = await resDeg.json()
            currentDegrees = dataDeg.filter((d: any) => d.is_active).map((d: any) => ({
              id: d.id,
              degree_code: d.degree_code,
              degree_name: d.degree_name
            }))
            setDegrees(currentDegrees)
          }
        }

        // Fetch departments
        if (departments.length === 0) {
          const resDept = await fetch('/api/master/departments')
          if (resDept.ok) {
            const dataDept = await resDept.json()
            currentDepartments = dataDept.filter((d: any) => d.status || d.is_active).map((d: any) => ({
              id: d.id,
              department_code: d.department_code,
              department_name: d.department_name
            }))
            setDepartments(currentDepartments)
          }
        }
      } catch (error) {
        console.error('Error fetching reference data:', error)
      }
    }

    const wb = XLSX.utils.book_new()

    // Sheet 1: Template with sample row
    const sample = [{
      'Institution Code': 'JKKN',
      'Degree Code': 'BSC',
      'Program Type': 'UG',
      'Offering Dept': 'SCI',
      'Program Code': 'BSC-CS',
      'Program Name': 'B.Sc Computer Science',
      'Display Name': 'BSc CS',
      'Duration (Years)': 3,
      'Program Order': 1,
      'Pattern': 'Semester',
      'Status': 'Active'
    }]

    const wsTemplate = XLSX.utils.json_to_sheet(sample)
    wsTemplate['!cols'] = [
      { wch: 18 }, // Institution Code
      { wch: 15 }, // Degree Code
      { wch: 15 }, // Program Type
      { wch: 15 }, // Offering Dept
      { wch: 18 }, // Program Code
      { wch: 35 }, // Program Name
      { wch: 15 }, // Display Name
      { wch: 18 }, // Duration (Years)
      { wch: 15 }, // Program Order
      { wch: 12 }, // Pattern
      { wch: 10 }  // Status
    ]
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template')

    // Sheet 2: Reference with organized sections
    const referenceData: any[] = []

    // Institution Codes Section
    referenceData.push({ 'Code': 'Institution Codes', 'Name': '' })
    referenceData.push({ 'Code': '', 'Name': '' }) // Blank row
    currentInstitutions.forEach(inst => {
      referenceData.push({
        'Code': inst.institution_code,
        'Name': inst.name
      })
    })
    if (currentInstitutions.length === 0) {
      referenceData.push({ 'Code': 'No data available', 'Name': '' })
    }
    referenceData.push({ 'Code': '', 'Name': '' }) // Blank separator

    // Degree Codes Section
    referenceData.push({ 'Code': 'Degree Codes', 'Name': '' })
    referenceData.push({ 'Code': '', 'Name': '' }) // Blank row
    currentDegrees.forEach(deg => {
      referenceData.push({
        'Code': deg.degree_code,
        'Name': deg.degree_name
      })
    })
    if (currentDegrees.length === 0) {
      referenceData.push({ 'Code': 'No data available', 'Name': '' })
    }
    referenceData.push({ 'Code': '', 'Name': '' }) // Blank separator

    // Department Codes Section
    referenceData.push({ 'Code': 'Department Codes', 'Name': '' })
    referenceData.push({ 'Code': '', 'Name': '' }) // Blank row
    currentDepartments.forEach(dept => {
      referenceData.push({
        'Code': dept.department_code,
        'Name': dept.department_name
      })
    })
    if (currentDepartments.length === 0) {
      referenceData.push({ 'Code': 'No data available', 'Name': '' })
    }
    referenceData.push({ 'Code': '', 'Name': '' }) // Blank separator

    // Program Types Section
    referenceData.push({ 'Code': 'Program Types', 'Name': '' })
    referenceData.push({ 'Code': '', 'Name': '' }) // Blank row
    referenceData.push({ 'Code': 'UG', 'Name': 'Under Graduate' })
    referenceData.push({ 'Code': 'PG', 'Name': 'Post Graduate' })
    referenceData.push({ 'Code': 'M.Phil', 'Name': 'Master of Philosophy' })
    referenceData.push({ 'Code': 'Ph.D', 'Name': 'Doctor of Philosophy' })

    const wsReference = XLSX.utils.json_to_sheet(referenceData)
    wsReference['!cols'] = [
      { wch: 25 }, // Code column
      { wch: 50 }  // Name column
    ]
    XLSX.utils.book_append_sheet(wb, wsReference, 'Reference')

    // Export file
    XLSX.writeFile(wb, `program_template_${new Date().toISOString().split('T')[0]}.xlsx`)

    toast({
      title: 'Template Downloaded',
      description: 'Program upload template with reference data has been downloaded successfully.',
      className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
    })
  }

  // Field validation function
  const validateProgramData = (data: any, rowIndex: number) => {
    const errors: string[] = []

    // Required field validations
    if (!data.institution_code || data.institution_code.trim() === '') {
      errors.push('Institution Code is required')
    }

    if (!data.degree_code || data.degree_code.trim() === '') {
      errors.push('Degree Code is required')
    }

    if (!data.program_code || data.program_code.trim() === '') {
      errors.push('Program Code is required')
    } else if (data.program_code.length > 50) {
      errors.push('Program Code must be 50 characters or less')
    }

    if (!data.program_name || data.program_name.trim() === '') {
      errors.push('Program Name is required')
    } else if (data.program_name.length > 200) {
      errors.push('Program Name must be 200 characters or less')
    }

    // Optional field validations
    if (data.display_name && data.display_name.length > 200) {
      errors.push('Display Name must be 200 characters or less')
    }

    if (data.offering_department_code && data.offering_department_code.length > 50) {
      errors.push('Offering Department Code must be 50 characters or less')
    }

    // Program Type validation
    if (data.program_type && !['UG', 'PG', 'M.Phil', 'Ph.D'].includes(data.program_type)) {
      errors.push('Program Type must be one of: UG, PG, M.Phil, Ph.D')
    }

    // Duration validation
    if (data.program_duration_yrs !== undefined && data.program_duration_yrs !== null) {
      const duration = Number(data.program_duration_yrs)
      if (isNaN(duration) || duration < 1 || duration > 10) {
        errors.push('Duration must be between 1 and 10 years')
      }
    }

    // Order validation
    if (data.program_order !== undefined && data.program_order !== null) {
      const order = Number(data.program_order)
      if (isNaN(order) || order < 1) {
        errors.push('Program Order must be a positive number')
      }
    }

    // Pattern Type validation
    if (data.pattern_type && !['Year', 'Semester'].includes(data.pattern_type)) {
      errors.push('Pattern Type must be either Year or Semester')
    }

    // Status validation
    if (data.is_active !== undefined && data.is_active !== null) {
      if (typeof data.is_active !== 'boolean') {
        const statusValue = String(data.is_active).toLowerCase()
        if (statusValue !== 'true' && statusValue !== 'false' && statusValue !== 'active' && statusValue !== 'inactive') {
          errors.push('Status must be true/false or Active/Inactive')
        }
      }
    }

    return errors
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        let rows: Partial<Program>[] = []
        if (file.name.endsWith('.json')) {
          rows = JSON.parse(await file.text())
        } else {
          const data = new Uint8Array(await file.arrayBuffer())
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
          rows = json.map(j => {
            const programType = String(j['Program Type'] || '').trim()
            const statusValue = String(j['Status'] || '').toLowerCase()
            const isActive = statusValue === 'active' || statusValue === 'true'

            return {
              institution_code: String(j['Institution Code'] || '').trim(),
              degree_code: String(j['Degree Code'] || '').trim(),
              program_type: programType === '' ? undefined : programType as "UG" | "PG" | "M.Phil" | "Ph.D",
              offering_department_code: String(j['Offering Dept'] || '').trim() || undefined,
              program_code: String(j['Program Code'] || '').trim(),
              program_name: String(j['Program Name'] || '').trim(),
              display_name: String(j['Display Name'] || '').trim() || undefined,
              program_duration_yrs: Number(j['Duration (Years)'] || 3),
              program_order: Number(j['Program Order'] || 1),
              pattern_type: String(j['Pattern'] || 'Semester').trim() as "Year" | "Semester",
              is_active: isActive
            }
          })
        }

        // Upload with row tracking and validation
        setLoading(true)
        let successCount = 0
        let errorCount = 0
        const uploadErrors: Array<{
          row: number
          program_code: string
          program_name: string
          errors: string[]
        }> = []

        for (let i = 0; i < rows.length; i++) {
          const program = rows[i]
          const rowNumber = i + 2 // +2 for header row in Excel

          // Validate row data
          const validationErrors = validateProgramData(program, rowNumber)
          if (validationErrors.length > 0) {
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              program_code: program.program_code || 'N/A',
              program_name: program.program_name || 'N/A',
              errors: validationErrors
            })
            continue
          }

          const payload = {
            institution_code: program.institution_code,
            degree_code: program.degree_code,
            program_type: program.program_type || undefined,
            offering_department_code: program.offering_department_code || undefined,
            program_code: program.program_code,
            program_name: program.program_name,
            display_name: program.display_name || undefined,
            program_duration_yrs: program.program_duration_yrs || 3,
            program_order: program.program_order || 1,
            pattern_type: program.pattern_type || "Semester",
            is_active: program.is_active ?? true
          }

          try {
            const response = await fetch('/api/master/programs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })

            if (response.ok) {
              const savedProgram = await response.json()
              setItems(prev => [savedProgram, ...prev])
              successCount++
            } else {
              const errorData = await response.json()
              errorCount++
              uploadErrors.push({
                row: rowNumber,
                program_code: program.program_code || 'N/A',
                program_name: program.program_name || 'N/A',
                errors: [errorData.error || 'Failed to save program']
              })
            }
          } catch (error) {
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              program_code: program.program_code || 'N/A',
              program_name: program.program_name || 'N/A',
              errors: [error instanceof Error ? error.message : 'Network error']
            })
          }
        }

        setLoading(false)
        const totalRows = rows.length

        // Update upload summary
        setUploadSummary({
          total: totalRows,
          success: successCount,
          failed: errorCount
        })

        // Set import errors and show dialog
        setImportErrors(uploadErrors)
        setErrorPopupOpen(true)

        // Show appropriate toast message
        if (successCount > 0 && errorCount === 0) {
          toast({
            title: "Upload Complete",
            description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} program${successCount > 1 ? 's' : ''}) to the database.`,
            className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
            duration: 5000,
          })
        } else if (successCount > 0 && errorCount > 0) {
          toast({
            title: "Partial Upload Success",
            description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: ${successCount} successful, ${errorCount} failed. View error details below.`,
            className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
            duration: 6000,
          })
        } else if (errorCount > 0) {
          toast({
            title: "Upload Failed",
            description: `Processed ${totalRows} row${totalRows > 1 ? 's' : ''}: 0 successful, ${errorCount} failed. View error details below.`,
            variant: "destructive",
            className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
            duration: 6000,
          })
        }
      } catch (err) {
        console.error(err)
        toast({
          title: "Import Failed",
          description: "Failed to parse file. Please check your file format and try again.",
          variant: "destructive",
          className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
        })
      } finally {
        setLoading(false)
      }
    }
    input.click()
  }

  const fetchPrograms = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/master/programs')
      if (!res.ok) throw new Error('Fetch failed')
      const data = await res.json()
      setItems(data)
    } catch (e) {
      console.error(e)
      alert('Failed to fetch programs')
    } finally {
      setLoading(false)
    }
  }

  const fetchInstitutions = async () => {
    try {
      const res = await fetch('/api/master/institutions')
      if (res.ok) {
        const data = await res.json()
        setInstitutions(data.filter((i: any) => i.is_active).map((i: any) => ({
          id: i.id,
          institution_code: i.institution_code,
          name: i.name
        })))
      }
    } catch (e) {
      console.error('Failed to fetch institutions:', e)
    }
  }

  const fetchDegrees = async () => {
    try {
      const res = await fetch('/api/master/degrees')
      if (res.ok) {
        const data = await res.json()
        setDegrees(data.filter((d: any) => d.is_active).map((d: any) => ({
          id: d.id,
          degree_code: d.degree_code,
          degree_name: d.degree_name
        })))
      }
    } catch (e) {
      console.error('Failed to fetch degrees:', e)
    }
  }

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/master/departments')
      if (res.ok) {
        const data = await res.json()
        setDepartments(data.filter((d: any) => d.status || d.is_active).map((d: any) => ({
          id: d.id,
          department_code: d.department_code,
          department_name: d.department_name
        })))
      }
    } catch (e) {
      console.error('Failed to fetch departments:', e)
    }
  }

  useEffect(() => {
    fetchPrograms()
    fetchInstitutions()
    fetchDegrees()
    fetchDepartments()
  }, [])

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
                  <BreadcrumbPage>Program</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Scorecard Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
            <Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{items.length}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">Total Programs</p>
                  </div>
                  <BookOpen className="h-5 w-5 text-emerald-500/40" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{items.filter(i=>i.is_active).length}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">Active Programs</p>
                  </div>
                  <BookOpen className="h-5 w-5 text-green-500/40" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{items.filter(i=>!i.is_active).length}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">Inactive Programs</p>
                  </div>
                  <BookOpen className="h-5 w-5 text-rose-500/40" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{items.filter(i=>{ const d=new Date(i.created_at); const n=new Date(); return d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear() }).length}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">New This Month</p>
                  </div>
                  <TrendingUp className="h-5 w-5 text-blue-500/40" />
                </div>
              </CardContent>
            </Card>
          </div>

          <TooltipProvider delayDuration={300}>
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex-shrink-0 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BookOpen className="h-3 w-3 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Program</h2>
                    <p className="text-xs text-muted-foreground">Manage programs</p>
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
                    <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-xs" />
                  </div>
                </div>

                <div className="flex gap-1 flex-wrap items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={fetchPrograms} disabled={loading}>
                        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Refresh</TooltipContent>
                  </Tooltip>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs px-2">
                        Export <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleTemplateExport}>
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
                        Template
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExport}>
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Download Excel
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDownload}>
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Download JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleImport}>
                    <Upload className="h-3 w-3 mr-1" />
                    Import
                  </Button>
                  <Button size="sm" className="text-xs px-2 h-8" onClick={openAdd}>
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
                        <TableHead className="w-[110px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("institution_code")} className="h-auto p-0 font-medium hover:bg-transparent">Inst. Code <span className="ml-1">{getSortIcon("institution_code")}</span></Button></TableHead>
                        <TableHead className="w-[110px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("degree_code")} className="h-auto p-0 font-medium hover:bg-transparent">Degree <span className="ml-1">{getSortIcon("degree_code")}</span></Button></TableHead>
                        <TableHead className="w-[90px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("program_type")} className="h-auto p-0 font-medium hover:bg-transparent">Type <span className="ml-1">{getSortIcon("program_type")}</span></Button></TableHead>
                        <TableHead className="w-[140px] text-xs">Off. Dept</TableHead>
                        <TableHead className="w-[120px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("program_code")} className="h-auto p-0 font-medium hover:bg-transparent">Program Code <span className="ml-1">{getSortIcon("program_code")}</span></Button></TableHead>
                        <TableHead className="text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("program_name")} className="h-auto p-0 font-medium hover:bg-transparent">Program Name <span className="ml-1">{getSortIcon("program_name")}</span></Button></TableHead>
                        <TableHead className="w-[80px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("program_duration_yrs")} className="h-auto p-0 font-medium hover:bg-transparent">Years <span className="ml-1">{getSortIcon("program_duration_yrs")}</span></Button></TableHead>
                        <TableHead className="w-[110px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("program_order")} className="h-auto p-0 font-medium hover:bg-transparent">Order <span className="ml-1">{getSortIcon("program_order")}</span></Button></TableHead>
                        <TableHead className="w-[110px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("pattern_type")} className="h-auto p-0 font-medium hover:bg-transparent">Pattern <span className="ml-1">{getSortIcon("pattern_type")}</span></Button></TableHead>
                        <TableHead className="w-[100px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("is_active")} className="h-auto p-0 font-medium hover:bg-transparent">Status <span className="ml-1">{getSortIcon("is_active")}</span></Button></TableHead>
                        <TableHead className="w-[120px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("created_at")} className="h-auto p-0 font-medium hover:bg-transparent">Created <span className="ml-1">{getSortIcon("created_at")}</span></Button></TableHead>
                        <TableHead className="w-[60px] text-xs text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={12} className="h-32 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <RefreshCw className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Loading...</span>
                          </div>
                        </TableCell></TableRow>
                      ) : pageItems.length ? (
                        <>
                          {pageItems.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="text-sm font-medium">{row.institution_code}</TableCell>
                              <TableCell className="text-sm">{row.degree_code}</TableCell>
                              <TableCell className="text-sm">{row.program_type ? <Badge variant="outline" className="text-xs">{row.program_type}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                              <TableCell className="text-sm">{row.offering_department_code || "-"}</TableCell>
                              <TableCell className="text-sm">{row.program_code}</TableCell>
                              <TableCell className="text-sm">{row.program_name}</TableCell>
                              <TableCell className="text-sm">{row.program_duration_yrs}</TableCell>
                              <TableCell className="text-sm">{row.program_order}</TableCell>
                              <TableCell className="text-sm">{row.pattern_type}</TableCell>
                              <TableCell><Badge variant={row.is_active ? "default" : "secondary"} className="text-xs">{row.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                              <TableCell className="text-sm text-muted-foreground">{formatDate(row.created_at)}</TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center">
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
                                      <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20" onClick={() => setDeleteTarget(row)}>
                                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      ) : (
                        <TableRow><TableCell colSpan={12} className="h-32 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <BookOpen className="h-8 w-8 opacity-20" />
                            <span className="text-sm">No programs found</span>
                            <span className="text-xs">Add a program to get started</span>
                          </div>
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                <div className="flex items-center gap-3">
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {filtered.length === 0 ? 'No results' : `${startIndex + 1}\u2013${Math.min(endIndex, filtered.length)} of ${filtered.length}`}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Rows</span>
                    <Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
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
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 p-0"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                  <span className="text-xs text-muted-foreground px-2 tabular-nums">{currentPage} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-7 w-7 p-0"><ChevronRight className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
          </TooltipProvider>
        </div>
        <AppFooter />
      </SidebarInset>

      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
        <SheetContent className="sm:max-w-[800px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-lg font-semibold">
              {editing ? "Edit Program" : "Add Program"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {editing ? "Update program information" : "Add a new program"}
            </p>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Institution Code *</Label>
                  <Select value={formData.institution_code} onValueChange={(v) => setFormData({ ...formData, institution_code: v })}>
                    <SelectTrigger className={`h-10 ${errors.institution_code ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Select institution" />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.institution_code}>
                          {inst.institution_code} - {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.institution_code && <p className="text-xs text-destructive">{errors.institution_code}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Degree Code *</Label>
                  <Select value={formData.degree_code} onValueChange={(v) => setFormData({ ...formData, degree_code: v })}>
                    <SelectTrigger className={`h-10 ${errors.degree_code ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Select degree" />
                    </SelectTrigger>
                    <SelectContent>
                      {degrees.map((deg) => (
                        <SelectItem key={deg.id} value={deg.degree_code}>
                          {deg.degree_code} - {deg.degree_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.degree_code && <p className="text-xs text-destructive">{errors.degree_code}</p>}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-semibold">Program Name *</Label>
                  <Input value={formData.program_name} onChange={(e) => setFormData({ ...formData, program_name: e.target.value })} className={`h-10 ${errors.program_name ? 'border-destructive' : ''}`} placeholder="e.g., B.Sc Computer Science" />
                  {errors.program_name && <p className="text-xs text-destructive">{errors.program_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Program Code *</Label>
                  <Input value={formData.program_code} onChange={(e) => setFormData({ ...formData, program_code: e.target.value })} className={`h-10 ${errors.program_code ? 'border-destructive' : ''}`} placeholder="e.g., BSC-CS" />
                  {errors.program_code && <p className="text-xs text-destructive">{errors.program_code}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Program Type</Label>
                  <Select
                    value={formData.program_type || "NONE"}
                    onValueChange={(v) => setFormData({ ...formData, program_type: v === "NONE" ? "" : v as "UG" | "PG" | "M.Phil" | "Ph.D" })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select program type (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      <SelectItem value="UG">UG (Under Graduate)</SelectItem>
                      <SelectItem value="PG">PG (Post Graduate)</SelectItem>
                      <SelectItem value="M.Phil">M.Phil</SelectItem>
                      <SelectItem value="Ph.D">Ph.D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Offering Department Code</Label>
                  <Select
                    value={formData.offering_department_code || "NONE"}
                    onValueChange={(v) => setFormData({ ...formData, offering_department_code: v === "NONE" ? "" : v })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select department (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.department_code}>
                          {dept.department_code} - {dept.department_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Display Name</Label>
                  <Input value={formData.display_name} onChange={(e) => setFormData({ ...formData, display_name: e.target.value })} className="h-10" placeholder="Optional display name" />
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2 border-t">Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Duration (Years) *</Label>
                  <Input type="number" min="1" value={formData.program_duration_yrs} onChange={(e) => setFormData({ ...formData, program_duration_yrs: parseInt(e.target.value) || 3 })} className={`h-10 ${errors.program_duration_yrs ? 'border-destructive' : ''}`} placeholder="e.g., 3" />
                  {errors.program_duration_yrs && <p className="text-xs text-destructive">{errors.program_duration_yrs}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Program Order *</Label>
                  <Input type="number" min="1" value={formData.program_order} onChange={(e) => setFormData({ ...formData, program_order: parseInt(e.target.value) || 1 })} className={`h-10 ${errors.program_order ? 'border-destructive' : ''}`} placeholder="e.g., 1" />
                  {errors.program_order && <p className="text-xs text-destructive">{errors.program_order}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Pattern Type</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant={formData.pattern_type === "Year" ? "default" : "outline"} size="sm" className="h-8 px-3 text-xs" onClick={() => setFormData({ ...formData, pattern_type: "Year" })}>Year</Button>
                    <Button type="button" variant={formData.pattern_type === "Semester" ? "default" : "outline"} size="sm" className="h-8 px-3 text-xs" onClick={() => setFormData({ ...formData, pattern_type: "Semester" })}>Semester</Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2 border-t">Status</h3>
              <div className="flex items-center gap-4">
                <Label className="text-sm font-semibold">Program Status</Label>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
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

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" size="sm" className="h-10 px-6" onClick={() => { setSheetOpen(false); resetForm() }} disabled={saving}>Cancel</Button>
              <Button size="sm" className="h-10 px-6" onClick={save} disabled={saving}>
                {saving ? (editing ? 'Updating…' : 'Creating…') : (editing ? 'Update Program' : 'Create Program')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Standalone Delete AlertDialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Program</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.program_name || deleteTarget?.program_code}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) remove(deleteTarget.id); setDeleteTarget(null) }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Results Dialog */}
      <AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
        <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                importErrors.length === 0
                  ? 'bg-green-100 dark:bg-green-900/20'
                  : 'bg-red-100 dark:bg-red-900/20'
              }`}>
                {importErrors.length === 0 ? (
                  <BookOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                )}
              </div>
              <div>
                <AlertDialogTitle className={`text-xl font-bold ${
                  importErrors.length === 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {importErrors.length === 0 ? 'Upload Successful' : 'Data Validation Errors'}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-muted-foreground mt-1">
                  {importErrors.length === 0
                    ? 'All programs have been successfully uploaded to the database'
                    : 'Please fix the following errors before importing the data'}
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

            {/* Error Summary - Only show if there are errors */}
            {importErrors.length > 0 && (
              <>
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

                {/* Detailed Error List */}
                <div className="space-y-3">
                  {importErrors.map((error, index) => (
                    <div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700">
                            Row {error.row}
                          </Badge>
                          <span className="font-medium text-sm">
                            {error.program_code} - {error.program_name}
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
              </>
            )}

            {/* Success Message - Only show if no errors */}
            {importErrors.length === 0 && uploadSummary.total > 0 && (
              <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-semibold text-green-800 dark:text-green-200">
                    All {uploadSummary.success} program{uploadSummary.success > 1 ? 's' : ''} uploaded successfully
                  </span>
                </div>
              </div>
            )}

            {/* Helpful Tips */}
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mt-0.5">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">i</span>
                </div>
                <div>
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Required Excel Format & Tips:</h4>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <li>• <strong>Institution Code</strong> (required): Must match existing institution (e.g., JKKN)</li>
                    <li>• <strong>Degree Code</strong> (required): Must match existing degree (e.g., BSC, BE)</li>
                    <li>• <strong>Program Code</strong> (required): Unique identifier, max 50 chars (e.g., BSC-CS)</li>
                    <li>• <strong>Program Name</strong> (required): Full name, max 200 chars</li>
                    <li>• <strong>Program Type</strong> (optional): UG, PG, M.Phil, or Ph.D</li>
                    <li>• <strong>Offering Dept</strong> (optional): Department code (must exist if provided)</li>
                    <li>• <strong>Display Name</strong> (optional): Short name, max 200 chars</li>
                    <li>• <strong>Duration (Years)</strong> (optional): 1-10 years (default: 3)</li>
                    <li>• <strong>Program Order</strong> (optional): Positive number (default: 1)</li>
                    <li>• <strong>Pattern</strong> (optional): "Year" or "Semester" (default: Semester)</li>
                    <li>• <strong>Status</strong> (optional): "Active" or "Inactive" (default: Active)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorPopupOpen(false)}>
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>

  )
}
