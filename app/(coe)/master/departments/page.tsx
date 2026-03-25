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
import Link from "next/link"
import { PlusCircle, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Building2, TrendingUp, FileSpreadsheet, RefreshCw, XCircle, AlertTriangle, MoreHorizontal, ChevronDown, Download, Upload } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/common/use-toast"
import { useFormValidation, ValidationPresets } from "@/hooks/common/use-form-validation"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"

type Department = {
  id: string
  institutions_id: string
  institution_code: string
  department_code: string
  department_name: string
  display_name?: string
  stream?: string
  department_order?: number
  is_active: boolean
  created_at: string
}

export default function DepartmentPage() {
  // Institution filter hook
  const {
    filter,
    isReady,
    appendToUrl,
    getInstitutionIdForCreate,
    getInstitutionCodeForCreate,
    mustSelectInstitution,
    shouldFilter,
    institutionId
  } = useInstitutionFilter()

  const [items, setItems] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null)

  const [formData, setFormData] = useState({ institutions_id: "", institution_code: "", department_code: "", department_name: "", display_name: "", description: "", stream: "", department_order: "", is_active: true })

  // Validation hook
  const { errors, validate, clearErrors } = useFormValidation({
    institution_code: [ValidationPresets.required('Institution code is required')],
    department_code: [
      ValidationPresets.required('Department code is required'),
      ValidationPresets.custom(
        (value) => !value || value.length <= 50,
        'Department code must be 50 characters or less'
      )
    ],
    department_name: [ValidationPresets.required('Department name is required')],
  })

  // Upload summary state
  const [uploadSummary, setUploadSummary] = useState<{
    total: number
    success: number
    failed: number
  }>({ total: 0, success: 0, failed: 0 })

  const [importErrors, setImportErrors] = useState<Array<{
    row: number
    department_code: string
    department_name: string
    errors: string[]
  }>>([])

  const [errorPopupOpen, setErrorPopupOpen] = useState(false)
  const { toast } = useToast()

  // Institutions for dropdown
  const [institutions, setInstitutions] = useState<Array<{ id: string; institution_code: string; institution_name?: string; counselling_code?: string | null }>>([])
  const [institutionsLoading, setInstitutionsLoading] = useState(true)

  // Fetch departments from API with institution filter
  const fetchDepartments = async () => {
    try {
      setLoading(true)
      const url = appendToUrl('/api/master/departments')
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch departments')
      const data = await res.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Error fetching departments:', e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch institutions for dropdown
  const fetchInstitutions = async () => {
    try {
      setInstitutionsLoading(true)
      const res = await fetch('/api/master/institutions')
      if (res.ok) {
        const data = await res.json()
        const mapped = Array.isArray(data)
          ? data.filter((i: any) => i?.institution_code).map((i: any) => ({
            id: i.id,
            institution_code: i.institution_code,
            institution_name: i.institution_name || i.name,
            counselling_code: i.counselling_code || null
          }))
          : []
        setInstitutions(mapped)
      } else {
        console.error('Failed to fetch institutions:', res.status, res.statusText)
      }
    } catch (error) {
      console.error('Error fetching institutions:', error)
    } finally {
      setInstitutionsLoading(false)
    }
  }

  // Load data when institution filter is ready
  useEffect(() => {
    if (isReady) {
      fetchDepartments()
      fetchInstitutions()
    }
  }, [isReady, filter])

  const resetForm = () => {
    const autoInstitutionId = getInstitutionIdForCreate() || ""
    const autoInstitutionCode = getInstitutionCodeForCreate() || ""
    setFormData({ institutions_id: autoInstitutionId, institution_code: autoInstitutionCode, department_code: "", department_name: "", display_name: "", description: "", stream: "", department_order: "", is_active: true }); clearErrors(); setEditing(null)
  }

  const handleSort = (c: string) => { if (sortColumn === c) setSortDirection(sortDirection === "asc" ? "desc" : "asc"); else { setSortColumn(c); setSortDirection("asc") } }
  const getSortIcon = (c: string) => sortColumn !== c ? <ArrowUpDown className="h-3 w-3 text-muted-foreground" /> : (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase()
    const data = items
      .filter((i) => [i.institution_code, i.department_code, i.department_name, i.display_name, i.stream].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
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
    const base = [10, 25, 50]
    if (filtered.length > 50) base.push(100)
    if (filtered.length > 100) base.push(filtered.length)
    return base
  }, [filtered.length])

  const isShowAll = itemsPerPage >= filtered.length && filtered.length > 0
  const effectivePerPage = isShowAll ? filtered.length : itemsPerPage
  const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
  const startIndex = (currentPage - 1) * effectivePerPage
  const endIndex = startIndex + effectivePerPage
  const pageItems = filtered.slice(startIndex, endIndex)
  useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, statusFilter, itemsPerPage])

  const openAdd = () => { resetForm(); setSheetOpen(true) }
  const openEdit = (row: Department) => { setEditing(row); setFormData({ institutions_id: row.institutions_id || "", institution_code: row.institution_code, department_code: row.department_code, department_name: row.department_name, display_name: row.display_name || "", description: (row as any).description || "", stream: row.stream || "", department_order: row.department_order ? String(row.department_order) : "", is_active: row.is_active }); setSheetOpen(true) }

  const save = async () => {
    if (!validate(formData)) {
      toast({
        title: 'Validation Error',
        description: 'Please fix all validation errors before submitting.',
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
      return
    }

    try {
      setLoading(true)

      if (editing) {
        const response = await fetch('/api/master/departments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: (editing as any).id, ...formData })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.error || errorData.details || 'Failed to update department'
          throw new Error(errorMessage)
        }

        const updated = await response.json()
        setItems(p => p.map(x => x.id === (editing as any).id ? updated : x))

        toast({
          title: 'Updated',
          description: `Department "${updated.department_name}" has been successfully updated.`,
          className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
        })
      } else {
        const response = await fetch('/api/master/departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.error || errorData.details || 'Failed to create department'
          throw new Error(errorMessage)
        }

        const created = await response.json()
        setItems(p => [created, ...p])

        toast({
          title: 'Created',
          description: `Department "${created.department_name}" has been successfully created.`,
          className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
        })
      }

      setSheetOpen(false)
      resetForm()
    } catch (e) {
      console.error('Save department error:', e)
      const errorMessage = e instanceof Error ? e.message : 'Failed to save department'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id: string) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/master/departments?id=${id}`, { method: 'DELETE' })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const errorMessage = errorData.error || errorData.details || 'Delete failed'
        throw new Error(errorMessage)
      }

      setItems(p => p.filter(x => x.id !== id))
      toast({
        title: 'Deleted',
        description: 'Department has been successfully deleted.',
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      })
    } catch (e) {
      console.error('Delete department error:', e)
      const errorMessage = e instanceof Error ? e.message : 'Failed to delete department'
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => { const json = JSON.stringify(filtered, null, 2); const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `department_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url) }
  const handleExport = () => {
    const excelData = filtered.map(r=>({
      'Institution Code': r.institution_code,
      'Department Code': r.department_code,
      'Department Name': r.department_name,
      'Display Name': r.display_name || '',
      'Description': (r as any).description || '',
      'Stream': r.stream || '',
      'Department Order': r.department_order ?? '',
      'Status': r.is_active ? 'Active' : 'Inactive',
      'Created': new Date(r.created_at).toISOString().split('T')[0]
    }))
    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Department')
    XLSX.writeFile(wb, `department_export_${new Date().toISOString().split('T')[0]}.xlsx`)
  }
  const handleTemplateExport = () => {
    const wb = XLSX.utils.book_new()
    const sample = [{
      'Institution Code': 'JKKN',
      'Department Code': 'CSE',
      'Department Name': 'Computer Science and Engineering',
      'Display Name': 'CSE',
      'Description': 'Dept of Computer Science',
      'Stream': 'Engineering',
      'Department Order': '1',
      'Status': 'Active'
    }]
    const ws = XLSX.utils.json_to_sheet(sample)
    const colWidths = [
      { wch: 18 }, { wch: 15 }, { wch: 35 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 10 }
    ]
    ws['!cols'] = colWidths
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    const mandatoryFields = ['Institution Code', 'Department Code', 'Department Name']
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
      if (!ws[cellAddress]) continue
      const cell = ws[cellAddress]
      const isMandatory = mandatoryFields.includes(cell.v as string)
      if (isMandatory) {
        cell.v = cell.v + ' *'
        cell.s = { font: { color: { rgb: 'FF0000' }, bold: true }, fill: { fgColor: { rgb: 'FFE6E6' } } }
      } else {
        cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'F0F0F0' } } }
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    const institutionReference = institutions.map(inst => ({
      'Institution Code': inst.institution_code,
      'Institution Name': inst.institution_name || 'N/A',
      'Status': (inst as any).is_active ? 'Active' : 'Inactive'
    }))
    const wsRef = XLSX.utils.json_to_sheet(institutionReference)
    wsRef['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, wsRef, 'Institution Codes')
    XLSX.writeFile(wb, `department_template_${new Date().toISOString().split('T')[0]}.xlsx`)
  }
  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.xlsx,.xls'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        let rows: Partial<Department & { description?: string }>[] = []

        if (file.name.endsWith('.json')) {
          rows = JSON.parse(await file.text())
        } else {
          const data = new Uint8Array(await file.arrayBuffer())
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]

          if (json.length === 0) {
            toast({
              title: 'Empty File',
              description: 'The uploaded file contains no data rows.',
              variant: 'destructive',
              className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
            })
            return
          }

          const firstRow = json[0]
          const availableColumns = Object.keys(firstRow)
          console.log('Available columns in Excel:', availableColumns)

          const getColumnValue = (row: Record<string, unknown>, possibleNames: string[]): string => {
            for (const name of possibleNames) {
              let value = row[name]
              if (value !== undefined && value !== null) return String(value).trim()
              value = row[`${name} *`]
              if (value !== undefined && value !== null) return String(value).trim()
              const columnWithAsterisk = Object.keys(row).find(key => {
                const cleanKey = key.replace(/\s*\*\s*$/, '').trim()
                return cleanKey === name
              })
              if (columnWithAsterisk) {
                value = row[columnWithAsterisk]
                if (value !== undefined && value !== null) return String(value).trim()
              }
            }
            return ''
          }

          rows = json.map(j => {
            const statusStr = getColumnValue(j, ['Status', 'status', 'is_active']).toLowerCase()
            const orderStr = getColumnValue(j, ['Department Order', 'department_order', 'DepartmentOrder', 'Order', 'order'])
            return {
              institution_code: getColumnValue(j, ['Institution Code', 'institution_code', 'InstitutionCode', 'Inst Code', 'inst_code']),
              department_code: getColumnValue(j, ['Department Code', 'department_code', 'DepartmentCode', 'Dept Code', 'dept_code']),
              department_name: getColumnValue(j, ['Department Name', 'department_name', 'DepartmentName', 'Dept Name', 'dept_name']),
              display_name: getColumnValue(j, ['Display Name', 'display_name', 'DisplayName']),
              description: getColumnValue(j, ['Description', 'description']),
              stream: getColumnValue(j, ['Stream', 'stream']),
              department_order: orderStr ? Number(orderStr) : undefined,
              is_active: statusStr === 'active' || statusStr === 'true' || statusStr === '1' || statusStr === ''
            }
          }).filter(r => {
            return r.institution_code || r.department_code || r.department_name
          })

          if (rows.length === 0) {
            toast({
              title: 'Empty Template',
              description: 'The template file is empty. Please add department data to the rows and try again.',
              className: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200',
              duration: 6000,
            })
            return
          }

          const allEmpty = rows.every(r => !r.institution_code && !r.department_code && !r.department_name)
          if (allEmpty) {
            toast({
              title: 'Column Mismatch',
              description: `Found columns: ${availableColumns.join(', ')}. Expected: Institution Code, Department Code, Department Name. Please check your Excel headers.`,
              variant: 'destructive',
              className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
              duration: 8000,
            })
            return
          }
        }

        const allowed = ['Arts', 'Science', 'Management', 'Commerce', 'Engineering', 'Medical', 'Law']
        const validationErrors: Array<{
          row: number
          department_code: string
          department_name: string
          errors: string[]
        }> = []

        const mapped = rows
          .map((r, idx) => {
            const rowNumber = idx + 2
            const errors: string[] = []
            const instCode = String(r.institution_code || '').trim()
            const deptCode = String(r.department_code || '').trim()
            const deptName = String(r.department_name || '').trim()

            if (!instCode) errors.push('Institution Code is required')
            if (!deptCode) errors.push('Department Code is required')
            if (!deptName) errors.push('Department Name is required')

            if (deptCode && !/^[A-Za-z0-9\-_]+$/.test(deptCode)) {
              errors.push('Department Code can only contain letters, numbers, hyphens, and underscores')
            }

            const streamVal = String((r as any).stream || '').trim()
            if (streamVal && !allowed.includes(streamVal)) {
              errors.push(`Stream must be one of: ${allowed.join(', ')}`)
            }

            const deptOrder = (r as any).department_order
            if (deptOrder !== undefined && deptOrder !== null && deptOrder !== '') {
              const orderNum = Number(deptOrder)
              if (isNaN(orderNum) || orderNum < 0 || !Number.isInteger(orderNum)) {
                errors.push('Department Order must be a positive whole number')
              }
            }

            if (errors.length > 0) {
              validationErrors.push({
                row: rowNumber,
                department_code: deptCode || 'N/A',
                department_name: deptName || 'N/A',
                errors
              })
              return null
            }

            return {
              institution_code: instCode,
              department_code: deptCode,
              department_name: deptName,
              display_name: String((r as any).display_name || '').trim(),
              description: String((r as any).description || '').trim(),
              stream: streamVal && allowed.includes(streamVal) ? streamVal : '',
              department_order: deptOrder !== undefined && deptOrder !== null && deptOrder !== '' ? Number(deptOrder) : undefined,
              is_active: (r as any).is_active ?? true,
            }
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)

        if (validationErrors.length > 0) {
          setImportErrors(validationErrors)
          setErrorPopupOpen(true)
          setLoading(false)
          toast({
            title: 'Validation Failed',
            description: `${validationErrors.length} row${validationErrors.length > 1 ? 's' : ''} failed validation. View error details below.`,
            variant: 'destructive',
            className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
            duration: 6000,
          })
          return
        }

        if (mapped.length === 0) {
          toast({
            title: 'No Valid Data',
            description: 'No valid rows found to import. Please check your file.',
            variant: 'destructive',
            className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
          })
          return
        }

        setLoading(true)
        let successCount = 0
        let errorCount = 0
        const uploadErrors: Array<{
          row: number
          department_code: string
          department_name: string
          errors: string[]
        }> = []

        for (let i = 0; i < mapped.length; i++) {
          const department = mapped[i]
          const rowNumber = i + 2

          try {
            const existing = items.find(
              item => item.institution_code === department.institution_code &&
                      item.department_code === department.department_code
            )

            let response
            if (existing) {
              response = await fetch('/api/master/departments', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: existing.id, ...department }),
              })
            } else {
              response = await fetch('/api/master/departments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(department),
              })
            }

            if (response.ok) {
              const savedDepartment = await response.json()
              if (existing) {
                setItems(prev => prev.map(x => x.id === existing.id ? savedDepartment : x))
              } else {
                setItems(prev => [savedDepartment, ...prev])
              }
              successCount++
            } else {
              const errorData = await response.json()
              errorCount++
              uploadErrors.push({
                row: rowNumber,
                department_code: department.department_code || 'N/A',
                department_name: department.department_name || 'N/A',
                errors: [errorData.error || errorData.details || 'Failed to save department']
              })
            }
          } catch (error) {
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              department_code: department.department_code || 'N/A',
              department_name: department.department_name || 'N/A',
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
            description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} department${successCount > 1 ? 's' : ''}) to the database.`,
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
      } catch (error) {
        toast({
          title: 'Import Failed',
          description: 'Failed to process the file. Please check your file format.',
          variant: 'destructive',
          className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
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
                  <BreadcrumbPage>Department</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Scorecard Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
            <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Departments</p>
                <p className="text-2xl font-bold mt-1">{items.length}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">{items.filter(i=>i.is_active).length}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inactive</p>
                <p className="text-2xl font-bold mt-1 text-rose-600">{items.filter(i=>!i.is_active).length}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
              <CardContent className="p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New This Month</p>
                <p className="text-2xl font-bold mt-1 text-purple-600">{items.filter(i=>{ const d=new Date(i.created_at); const n=new Date(); return d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear() }).length}</p>
              </CardContent>
            </Card>
          </div>

          <TooltipProvider>
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex-shrink-0 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-3 w-3 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Department</h2>
                    <p className="text-xs text-muted-foreground">Manage departments</p>
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
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={fetchDepartments} disabled={loading}>
                        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Refresh</TooltipContent>
                  </Tooltip>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs px-2">
                        <Download className="h-3 w-3 mr-1" />
                        Export
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleTemplateExport}>
                        <FileSpreadsheet className="h-3 w-3 mr-2" />
                        Template
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDownload}>
                        <Download className="h-3 w-3 mr-2" />
                        JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExport}>
                        <FileSpreadsheet className="h-3 w-3 mr-2" />
                        Excel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleImport}>
                        <Upload className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Upload</TooltipContent>
                  </Tooltip>

                  <Button size="sm" className="text-xs px-2 h-8" onClick={openAdd}>
                    <PlusCircle className="h-3 w-3 mr-1" /> Add
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
                          <TableHead className="w-[120px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("institution_code")} className="h-auto p-0 font-medium hover:bg-transparent">Institution <span className="ml-1">{getSortIcon("institution_code")}</span></Button></TableHead>
                        )}
                        <TableHead className="w-[120px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("department_code")} className="h-auto p-0 font-medium hover:bg-transparent">Dept. Code <span className="ml-1">{getSortIcon("department_code")}</span></Button></TableHead>
                        <TableHead className="text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("department_name")} className="h-auto p-0 font-medium hover:bg-transparent">Department Name <span className="ml-1">{getSortIcon("department_name")}</span></Button></TableHead>
                        <TableHead className="w-[160px] text-xs">Display</TableHead>
                        <TableHead className="w-[120px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("stream")} className="h-auto p-0 font-medium hover:bg-transparent">Stream <span className="ml-1">{getSortIcon("stream")}</span></Button></TableHead>
                        <TableHead className="w-[80px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("department_order")} className="h-auto p-0 font-medium hover:bg-transparent">Order <span className="ml-1">{getSortIcon("department_order")}</span></Button></TableHead>
                        <TableHead className="w-[100px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("is_active")} className="h-auto p-0 font-medium hover:bg-transparent">Status <span className="ml-1">{getSortIcon("is_active")}</span></Button></TableHead>
                        <TableHead className="w-[60px] text-xs text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={mustSelectInstitution ? 8 : 7} className="h-32 text-center">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <RefreshCw className="h-5 w-5 animate-spin" />
                              <span className="text-sm">Loading departments...</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : pageItems.length ? (
                        <>
                          {pageItems.map((row) => (
                            <TableRow key={row.id}>
                              {mustSelectInstitution && (
                                <TableCell className="text-sm font-medium">{row.institution_code}</TableCell>
                              )}
                              <TableCell className="text-sm">{row.department_code}</TableCell>
                              <TableCell className="text-sm">{row.department_name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{row.display_name}</TableCell>
                              <TableCell className="text-sm">{row.stream}</TableCell>
                              <TableCell className="text-sm text-center">{row.department_order ?? '-'}</TableCell>
                              <TableCell><Badge variant={row.is_active ? "default" : "secondary"} className="text-xs">{row.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                              <TableCell className="text-center">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openEdit(row)}>
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600"
                                      onClick={() => setDeleteTarget(row)}
                                    >
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
                          <TableCell colSpan={mustSelectInstitution ? 8 : 7} className="h-32 text-center">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Building2 className="h-8 w-8 opacity-30" />
                              <span className="text-sm">No departments found</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows per page</span>
                  <Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
                    <SelectTrigger className="h-7 w-[70px] text-xs">
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
                  <span className="text-xs text-muted-foreground">
                    {filtered.length === 0 ? '0' : `${startIndex + 1}-${Math.min(endIndex, filtered.length)}`} of {filtered.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-2">Page {currentPage} of {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
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
            <SheetTitle className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {editing ? "Edit Department" : "Add Department"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {editing ? "Update department information" : "Create a new department"}
            </p>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {/* Validation Summary */}
            {Object.keys(errors).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-900/20 dark:border-red-800">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">
                    Please fix the following errors:
                  </h4>
                </div>
                <ul className="text-xs text-red-700 dark:text-red-300 space-y-1">
                  {Object.entries(errors).map(([field, message]) => (
                    <li key={field} className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                      <span className="capitalize">{field.replace('_', ' ')}: {message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Basic Information Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Basic Information</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Institution field - show only when needed */}
                {(mustSelectInstitution || !shouldFilter || !institutionId) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="institution_code" className="text-sm font-semibold">
                        Institution <span className="text-red-500">*</span>
                      </Label>
                      {institutions.length === 0 && !institutionsLoading && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={fetchInstitutions}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Refresh
                        </Button>
                      )}
                    </div>
                    <Select
                      value={formData.institutions_id}
                      onValueChange={(id) => {
                        const selectedInst = institutions.find(i => i.id === id)
                        setFormData({
                          ...formData,
                          institutions_id: id,
                          institution_code: selectedInst?.institution_code || ''
                        })
                      }}
                      disabled={institutionsLoading}
                    >
                      <SelectTrigger className={`h-10 ${errors.institution_code ? 'border-destructive' : ''}`}>
                        <SelectValue placeholder={institutionsLoading ? "Loading institutions..." : "Select Institution"} />
                      </SelectTrigger>
                      <SelectContent>
                        {institutionsLoading ? (
                          <SelectItem value="loading" disabled>Loading institutions...</SelectItem>
                        ) : institutions.length === 0 ? (
                          <SelectItem value="empty" disabled>No institutions available</SelectItem>
                        ) : (
                          institutions.map(inst => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.institution_code}{inst.institution_name ? ` - ${inst.institution_name}` : ''}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {errors.institution_code && (
                      <p className="text-xs text-destructive">{errors.institution_code}</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="department_code" className="text-sm font-semibold">
                    Department Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="department_code"
                    value={formData.department_code}
                    onChange={(e) => setFormData({ ...formData, department_code: e.target.value })}
                    className={`h-10 ${errors.department_code ? 'border-destructive' : ''}`}
                    placeholder="e.g., CSE, ECE, MECH"
                  />
                  {errors.department_code && (
                    <p className="text-xs text-destructive">{errors.department_code}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department_name" className="text-sm font-semibold">
                  Department Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="department_name"
                  value={formData.department_name}
                  onChange={(e) => setFormData({ ...formData, department_name: e.target.value })}
                  className={`h-10 ${errors.department_name ? 'border-destructive' : ''}`}
                  placeholder="e.g., Computer Science and Engineering"
                />
                {errors.department_name && (
                  <p className="text-xs text-destructive">{errors.department_name}</p>
                )}
              </div>
            </div>

            {/* Additional Information Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Additional Information</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="display_name" className="text-sm font-semibold">Display Name</Label>
                  <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    className="h-10"
                    placeholder="e.g., CSE, Computer Science"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stream" className="text-sm font-semibold">Stream</Label>
                  <Select value={formData.stream} onValueChange={(v)=> setFormData({ ...formData, stream: v })}>
                    <SelectTrigger className={`h-10 ${errors.stream ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Select Stream" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Arts">Arts</SelectItem>
                      <SelectItem value="Science">Science</SelectItem>
                      <SelectItem value="Management">Management</SelectItem>
                      <SelectItem value="Commerce">Commerce</SelectItem>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Medical">Medical</SelectItem>
                      <SelectItem value="Law">Law</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.stream && (
                    <p className="text-xs text-destructive">{errors.stream}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department_order" className="text-sm font-semibold">Department Order</Label>
                  <Input
                    id="department_order"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.department_order}
                    onChange={(e) => setFormData({ ...formData, department_order: e.target.value })}
                    className={`h-10 ${errors.department_order ? 'border-destructive' : ''}`}
                    placeholder="e.g., 1, 2, 3"
                  />
                  {errors.department_order && (
                    <p className="text-xs text-destructive">{errors.department_order}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Display order for department listing (optional)</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold">Description</Label>
                <Input
                  id="description"
                  value={(formData as any).description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="h-10"
                  placeholder="Optional description about the department"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Status</Label>
                <div className="flex items-center gap-3">
                  <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
                  <span className={`text-sm font-medium ${formData.is_active ? 'text-green-600' : 'text-red-500'}`}>
                    {formData.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-6 flex justify-end gap-3">
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
                {loading ? "Saving..." : editing ? "Update Department" : "Create Department"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Standalone Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Department</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteTarget?.department_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) { remove(deleteTarget.id); setDeleteTarget(null) } }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Error Dialog for Upload Errors */}
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
                        {error.department_code} - {error.department_name}
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
                  <h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">Required Excel Format:</h4>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <li>• <strong>Institution Code</strong> (required): Must match existing institution code (e.g., JKKN)</li>
                    <li>• <strong>Department Code</strong> (required): Alphanumeric with hyphens/underscores only (e.g., CSE, IT-01)</li>
                    <li>• <strong>Department Name</strong> (required): Full name (max 255 chars)</li>
                    <li>• <strong>Display Name</strong> (optional): Short display name</li>
                    <li>• <strong>Description</strong> (optional): Department description</li>
                    <li>• <strong>Stream</strong> (optional): One of: Arts, Science, Management, Commerce, Engineering, Medical, Law</li>
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
