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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/common/use-toast"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { Toaster } from "@/components/ui/toaster"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, BookOpen, TrendingUp, FileSpreadsheet, RefreshCw, XCircle, AlertTriangle, Upload, MoreHorizontal, ChevronDown, Download } from "lucide-react"


type Semester = {
  id: string
  institution_code: string
  program_code: string
  semester_code: string
  semester_name: string
  display_name?: string
  semester_type?: string
  semester_group?: string
  display_order?: number
  initial_semester?: boolean
  terminal_semester?: boolean
  created_at: string
}

const MOCK_SEMESTERS: Semester[] = [
  { id: "1", institution_code: "JKKN", program_code: "JKKN-BSC-CS", semester_code: "SEM1", semester_name: "Semester 1", display_name: "1", semester_type: "Odd", semester_group: "UG", display_order: 1, initial_semester: true, terminal_semester: false, created_at: new Date().toISOString() },
]

export default function SemesterPage() {
  const { toast } = useToast()
  const { isReady, appendToUrl, mustSelectInstitution, getInstitutionCodeForCreate } = useInstitutionFilter()
  const [items, setItems] = useState<Semester[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [deleteTarget, setDeleteTarget] = useState<Semester | null>(null)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Semester | null>(null)
  const [yearFilter, setYearFilter] = useState("all")

  // Add state for institutions and programs
  const [institutions, setInstitutions] = useState<Array<{id: string, institution_code: string, name: string}>>([])
  const [programs, setPrograms] = useState<Array<{id: string, program_code: string, program_name: string}>>([])
  const [loadingDropdowns, setLoadingDropdowns] = useState(false)

  const [formData, setFormData] = useState({
    institution_code: "",
    program_code: "",
    semester_code: "",
    semester_name: "",
    display_name: "",
    semester_type: "",
    semester_group: "",
    display_order: 1,
    initial_semester: false,
    terminal_semester: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Upload tracking state
  const [uploadSummary, setUploadSummary] = useState<{
    total: number
    success: number
    failed: number
  }>({ total: 0, success: 0, failed: 0 })

  const [importErrors, setImportErrors] = useState<Array<{
    row: number
    semester_code: string
    semester_name: string
    errors: string[]
  }>>([])

  const [errorPopupOpen, setErrorPopupOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch data from API
  const fetchSemesters = async () => {
    try {
      setLoading(true)
      const response = await fetch(appendToUrl('/api/master/semesters'))
      if (!response.ok) {
        throw new Error('Failed to fetch semesters')
      }
      const data = await response.json()
      setItems(data)
    } catch (error) {
      console.error('Error fetching semesters:', error)
      toast({
        title: "Fetch Failed",
        description: "Failed to load semesters. Please try again.",
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
      // Fallback to mock data on error
      setItems(MOCK_SEMESTERS)
    } finally {
      setLoading(false)
    }
  }

  // Fetch institutions for dropdown
  const fetchInstitutions = async () => {
    try {
      setLoadingDropdowns(true)
      const response = await fetch('/api/master/institutions')
      if (!response.ok) {
        throw new Error('Failed to fetch institutions')
      }
      const data = await response.json()

      // Remove duplicates and create unique entries
      const uniqueInstitutions = data.reduce((acc: any[], institution: any) => {
        const existingIndex = acc.findIndex(i => i.institution_code === institution.institution_code)
        if (existingIndex === -1) {
          acc.push({
            id: institution.id,
            institution_code: institution.institution_code,
            name: institution.name
          })
        }
        return acc
      }, [])

      setInstitutions(uniqueInstitutions)
    } catch (error) {
      console.error('Error fetching institutions:', error)
    } finally {
      setLoadingDropdowns(false)
    }
  }

  // Fetch programs for dropdown
  const fetchPrograms = async () => {
    try {
      setLoadingDropdowns(true)
      const response = await fetch('/api/master/programs')
      if (!response.ok) {
        throw new Error('Failed to fetch programs')
      }
      const data = await response.json()

      // Remove duplicates and create unique entries
      const uniquePrograms = data.reduce((acc: any[], program: any) => {
        const existingIndex = acc.findIndex(p => p.program_code === program.program_code)
        if (existingIndex === -1) {
          acc.push({
            program_code: program.program_code,
            program_name: program.program_name,
            id: program.id // Add id for unique key
          })
        }
        return acc
      }, [])

      setPrograms(uniquePrograms)
    } catch (error) {
      console.error('Error fetching programs:', error)
    } finally {
      setLoadingDropdowns(false)
    }
  }

  // Load data when institution filter is ready
  useEffect(() => {
    if (isReady) {
      fetchSemesters()
      fetchInstitutions()
      fetchPrograms()
    }
  }, [isReady])

  const resetForm = () => { setFormData({ institution_code: getInstitutionCodeForCreate() || "", program_code: "", semester_code: "", semester_name: "", display_name: "", semester_type: "", semester_group: "", display_order: 1, initial_semester: false, terminal_semester: false }); setErrors({}); setEditing(null) }

  const handleSort = (c: string) => { if (sortColumn === c) setSortDirection(sortDirection === "asc" ? "desc" : "asc"); else { setSortColumn(c); setSortDirection("asc") } }
  const getSortIcon = (c: string) => sortColumn !== c ? <ArrowUpDown className="h-3 w-3 text-muted-foreground" /> : (sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase()
    const data = items
      .filter((i) => [i.institution_code, i.program_code, i.semester_code, i.semester_name, i.display_name, i.semester_type, i.semester_group].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .filter((i) => yearFilter === "all" || new Date(i.created_at).getFullYear().toString() === yearFilter)
    if (!sortColumn) return data
    return [...data].sort((a, b) => {
      const av = (a as any)[sortColumn]
      const bv = (b as any)[sortColumn]
      if (av === bv) return 0
      return sortDirection === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
  }, [items, searchTerm, sortColumn, sortDirection, yearFilter])

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
  useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, yearFilter])
  const uniqueYears = useMemo(() => Array.from(new Set(items.map(i => new Date(i.created_at).getFullYear()))).sort((a,b)=>b-a), [items])

  const openAdd = () => { resetForm(); setSheetOpen(true) }
  const openEdit = (row: Semester) => { setEditing(row); setFormData({ institution_code: row.institution_code, program_code: row.program_code, semester_code: row.semester_code, semester_name: row.semester_name, display_name: row.display_name || "", semester_type: row.semester_type || "", semester_group: row.semester_group || "", display_order: row.display_order || 1, initial_semester: !!row.initial_semester, terminal_semester: !!row.terminal_semester }); setSheetOpen(true) }

  const validate = () => { const e: Record<string, string> = {}; if (!formData.institution_code.trim()) e.institution_code = "Required"; if (!formData.program_code.trim()) e.program_code = "Required"; if (!formData.semester_code.trim()) e.semester_code = "Required"; if (!formData.semester_name.trim()) e.semester_name = "Required"; setErrors(e); return Object.keys(e).length === 0 }

  const save = async () => {
    if (!validate()) {
      toast({
        title: "Validation Error",
        description: "Please fix all validation errors before submitting.",
        variant: "destructive",
        className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
      })
      return
    }

    try {
      setSaving(true)

      if (editing) {
        // Update existing semester
        const response = await fetch(`/api/master/semesters/${editing.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorData.error || 'Failed to update semester')
        }

        const updatedSemester = await response.json()
        setItems((prev) => prev.map((p) => (p.id === editing.id ? updatedSemester : p)))

        toast({
          title: "Semester Updated",
          description: `${updatedSemester.semester_name} has been successfully updated.`,
          className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
        })
      } else {
        // Create new semester
        const response = await fetch('/api/master/semesters', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorData.error || 'Failed to create semester')
        }

        const newSemester = await response.json()
        setItems((prev) => [newSemester, ...prev])

        toast({
          title: "Semester Created",
          description: `${newSemester.semester_name} has been successfully created.`,
          className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
        })
      }

      setSheetOpen(false)
      resetForm()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save semester. Please try again.'
      toast({
        title: "Save Failed",
        description: errorMessage,
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    try {
      setLoading(true)

      const response = await fetch(`/api/master/semesters/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete semester')
      }

      setItems((prev) => prev.filter((p) => p.id !== id))
    } catch (error) {
      console.error('Error deleting semester:', error)
      toast({
        title: "Delete Failed",
        description: "Failed to delete semester. Please try again.",
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
    } finally {
      setLoading(false)
    }
  }
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })

  const handleDownload = () => { const json = JSON.stringify(filtered, null, 2); const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `semester_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url) }
  const handleExport = () => { const excelData = filtered.map(r=>({'Institution Code':r.institution_code,'Program Code':r.program_code,'Semester Code':r.semester_code,'Semester Name':r.semester_name,'Display Name':r.display_name||'','Semester Type':r.semester_type||'','Semester Group':r.semester_group||'','Order':r.display_order||'', 'Initial':r.initial_semester?'Yes':'No','Terminal':r.terminal_semester?'Yes':'No','Created':new Date(r.created_at).toISOString().split('T')[0]})); const ws=XLSX.utils.json_to_sheet(excelData); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Semester'); XLSX.writeFile(wb,`semester_export_${new Date().toISOString().split('T')[0]}.xlsx`) }
  const handleTemplateExport = () => {
    // Main template sheet
    const sample = [{
      'Institution Code': 'JKKN',
      'Program Code': 'JKKN-BSC-CS',
      'Semester Code': 'SEM1',
      'Semester Name': 'Semester 1',
      'Display Name': '1',
      'Semester Type': 'Odd',
      'Semester Group': 'Year 1',
      'Order': 1,
      'Initial': 'Yes',
      'Terminal': 'No'
    }]
    const wsTemplate = XLSX.utils.json_to_sheet(sample)

    // Combined Reference sheet with all reference data
    const referenceData: any[] = []

    // Section 1: Institution Codes
    referenceData.push({ 'Category': 'INSTITUTION CODES', 'Code/Value': '', 'Name/Description': '', '': '' })
    referenceData.push({ 'Category': 'Institution Code', 'Code/Value': 'Institution Name', 'Name/Description': '', '': '' })
    if (institutions.length > 0) {
      institutions.forEach(inst => {
        referenceData.push({
          'Category': '',
          'Code/Value': inst.institution_code,
          'Name/Description': inst.name,
          '': ''
        })
      })
    } else {
      referenceData.push({ 'Category': '', 'Code/Value': 'JKKN', 'Name/Description': 'Example Institution', '': '' })
    }

    // Add spacing
    referenceData.push({ 'Category': '', 'Code/Value': '', 'Name/Description': '', '': '' })

    // Section 2: Program Codes
    referenceData.push({ 'Category': 'PROGRAM CODES', 'Code/Value': '', 'Name/Description': '', '': '' })
    referenceData.push({ 'Category': 'Program Code', 'Code/Value': 'Program Name', 'Name/Description': '', '': '' })
    if (programs.length > 0) {
      programs.forEach(prog => {
        referenceData.push({
          'Category': '',
          'Code/Value': prog.program_code,
          'Name/Description': prog.program_name,
          '': ''
        })
      })
    } else {
      referenceData.push({ 'Category': '', 'Code/Value': 'JKKN-BSC-CS', 'Name/Description': 'Example Program', '': '' })
    }

    // Add spacing
    referenceData.push({ 'Category': '', 'Code/Value': '', 'Name/Description': '', '': '' })

    // Section 3: Semester Type
    referenceData.push({ 'Category': 'SEMESTER TYPE', 'Code/Value': '', 'Name/Description': '', '': '' })
    referenceData.push({ 'Category': 'Value', 'Code/Value': 'Description', 'Name/Description': '', '': '' })
    referenceData.push({ 'Category': '', 'Code/Value': 'Odd', 'Name/Description': 'Odd semester (e.g., 1st, 3rd, 5th)', '': '' })
    referenceData.push({ 'Category': '', 'Code/Value': 'Even', 'Name/Description': 'Even semester (e.g., 2nd, 4th, 6th)', '': '' })

    // Add spacing
    referenceData.push({ 'Category': '', 'Code/Value': '', 'Name/Description': '', '': '' })

    // Section 4: Semester Group
    referenceData.push({ 'Category': 'SEMESTER GROUP', 'Code/Value': '', 'Name/Description': '', '': '' })
    referenceData.push({ 'Category': 'Value', 'Code/Value': 'Description', 'Name/Description': '', '': '' })
    referenceData.push({ 'Category': '', 'Code/Value': 'Year 1', 'Name/Description': 'First year semesters', '': '' })
    referenceData.push({ 'Category': '', 'Code/Value': 'Year 2', 'Name/Description': 'Second year semesters', '': '' })
    referenceData.push({ 'Category': '', 'Code/Value': 'Year 3', 'Name/Description': 'Third year semesters', '': '' })
    referenceData.push({ 'Category': '', 'Code/Value': 'Year 4', 'Name/Description': 'Fourth year semesters', '': '' })
    referenceData.push({ 'Category': '', 'Code/Value': 'Year 5', 'Name/Description': 'Fifth year semesters', '': '' })

    const wsReference = XLSX.utils.json_to_sheet(referenceData)

    // Create workbook and append sheets
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template')
    XLSX.utils.book_append_sheet(wb, wsReference, 'Reference')

    // Write file
    XLSX.writeFile(wb, `semester_template_${new Date().toISOString().split('T')[0]}.xlsx`)
  }
  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        setLoading(true)
        let rows: any[] = []

        if (file.name.endsWith('.json')) {
          rows = JSON.parse(await file.text())
        } else {
          const data = new Uint8Array(await file.arrayBuffer())
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
          rows = json.map(j => ({
            institution_code: String(j['Institution Code'] || ''),
            program_code: String(j['Program Code'] || ''),
            semester_code: String(j['Semester Code'] || ''),
            semester_name: String(j['Semester Name'] || ''),
            display_name: String(j['Display Name'] || ''),
            semester_type: String(j['Semester Type'] || ''),
            semester_group: String(j['Semester Group'] || ''),
            display_order: Number(j['Order'] || 0),
            initial_semester: String(j['Initial'] || '').toLowerCase() === 'yes',
            terminal_semester: String(j['Terminal'] || '').toLowerCase() === 'yes'
          }))
        }

        const mapped = rows.filter(r => r.institution_code && r.program_code && r.semester_code && r.semester_name)

        // Row-by-row upload with error tracking
        let successCount = 0
        let errorCount = 0
        const uploadErrors: Array<{
          row: number
          semester_code: string
          semester_name: string
          errors: string[]
        }> = []

        for (let i = 0; i < mapped.length; i++) {
          const semester = mapped[i]
          const rowNumber = i + 2 // +2 for header row in Excel

          try {
            const response = await fetch('/api/master/semesters', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(semester),
            })

            if (response.ok) {
              const savedSemester = await response.json()
              setItems(prev => [savedSemester, ...prev])
              successCount++
            } else {
              const errorData = await response.json()
              errorCount++
              uploadErrors.push({
                row: rowNumber,
                semester_code: semester.semester_code || 'N/A',
                semester_name: semester.semester_name || 'N/A',
                errors: [errorData.error || 'Failed to save semester']
              })
            }
          } catch (error) {
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              semester_code: semester.semester_code || 'N/A',
              semester_name: semester.semester_name || 'N/A',
              errors: [error instanceof Error ? error.message : 'Network error']
            })
          }
        }

        setLoading(false)
        const totalRows = mapped.length

        // Update upload summary
        setUploadSummary({
          total: totalRows,
          success: successCount,
          failed: errorCount
        })

        // Show error dialog if needed
        if (uploadErrors.length > 0) {
          setImportErrors(uploadErrors)
          setErrorPopupOpen(true)
        }

        // Show appropriate toast message
        if (successCount > 0 && errorCount === 0) {
          toast({
            title: "Upload Complete",
            description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} semester${successCount > 1 ? 's' : ''}) to the database.`,
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
        setLoading(false)
        toast({
          title: "Import Failed",
          description: "Failed to parse file. Please check your file format.",
          variant: "destructive",
          className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
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
                  <BreadcrumbPage>Semester</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Scorecard Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
            <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{items.length}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">Total Semesters</p>
                  </div>
                  <BookOpen className="h-5 w-5 text-blue-500/40" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{items.filter(i=>i.initial_semester).length}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">Initial Semesters</p>
                  </div>
                  <BookOpen className="h-5 w-5 text-emerald-500/40" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{items.filter(i=>i.terminal_semester).length}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">Terminal Semesters</p>
                  </div>
                  <BookOpen className="h-5 w-5 text-red-500/40" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold tracking-tight">{items.filter(i=>{ const d=new Date(i.created_at); const n=new Date(); return d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear() }).length}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">New This Month</p>
                  </div>
                  <TrendingUp className="h-5 w-5 text-purple-500/40" />
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
                      <h2 className="text-sm font-semibold">Semester</h2>
                      <p className="text-xs text-muted-foreground">Manage semesters</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
                  <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                    <Select value={yearFilter} onValueChange={setYearFilter}>
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue placeholder="All Years" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {uniqueYears.map(y => (
                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="relative w-full sm:w-[220px]">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-xs" />
                    </div>
                  </div>

                  <div className="flex gap-1 flex-wrap">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={fetchSemesters} disabled={loading}>
                          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs px-2 h-8">
                          <Download className="h-3 w-3 mr-1" />
                          Export
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleTemplateExport}>
                          <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
                          Template
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownload}>
                          <Download className="h-3.5 w-3.5 mr-2" />
                          JSON
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExport}>
                          <Download className="h-3.5 w-3.5 mr-2" />
                          Excel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleImport} disabled={loading}>
                      <Upload className="h-3 w-3 mr-1" />
                      Upload
                    </Button>
                    <Button size="sm" className="text-xs px-2 h-8" onClick={openAdd} disabled={loading}><PlusCircle className="h-3 w-3 mr-1" /> Add</Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
                <div className="rounded-md border overflow-hidden" style={{ height: "440px" }}>
                  <div className="h-full overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
                        <TableRow>
                          <TableHead className="w-[100px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("institution_code")} className="h-auto p-0 font-medium hover:bg-transparent">Inst. Code <span className="ml-1">{getSortIcon("institution_code")}</span></Button></TableHead>
                          <TableHead className="w-[140px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("program_code")} className="h-auto p-0 font-medium hover:bg-transparent">Program <span className="ml-1">{getSortIcon("program_code")}</span></Button></TableHead>
                          <TableHead className="w-[100px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("semester_code")} className="h-auto p-0 font-medium hover:bg-transparent">Sem Code <span className="ml-1">{getSortIcon("semester_code")}</span></Button></TableHead>
                          <TableHead className="text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("semester_name")} className="h-auto p-0 font-medium hover:bg-transparent">Semester Name <span className="ml-1">{getSortIcon("semester_name")}</span></Button></TableHead>
                          <TableHead className="w-[100px] text-xs">Type</TableHead>
                          <TableHead className="w-[80px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("display_order")} className="h-auto p-0 font-medium hover:bg-transparent">Order <span className="ml-1">{getSortIcon("display_order")}</span></Button></TableHead>
                          <TableHead className="w-[80px] text-xs">Initial</TableHead>
                          <TableHead className="w-[80px] text-xs">Terminal</TableHead>
                          <TableHead className="w-[110px] text-xs"><Button variant="ghost" size="sm" onClick={() => handleSort("created_at")} className="h-auto p-0 font-medium hover:bg-transparent">Created <span className="ml-1">{getSortIcon("created_at")}</span></Button></TableHead>
                          <TableHead className="w-[60px] text-xs text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell colSpan={10} className="h-24 text-center">
                              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                <span className="text-sm">Loading...</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : pageItems.length ? (
                          <>
                            {pageItems.map((row) => (
                              <TableRow key={row.id}>
                                <TableCell className="text-sm font-medium">{row.institution_code}</TableCell>
                                <TableCell className="text-sm">{row.program_code}</TableCell>
                                <TableCell className="text-sm font-medium">{row.semester_code}</TableCell>
                                <TableCell className="text-sm">{row.semester_name}</TableCell>
                                <TableCell className="text-sm">{row.semester_type}</TableCell>
                                <TableCell className="text-sm">{row.display_order}</TableCell>
                                <TableCell className="text-sm">{row.initial_semester ? "Yes" : "No"}</TableCell>
                                <TableCell className="text-sm">{row.terminal_semester ? "Yes" : "No"}</TableCell>
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
                          <TableRow>
                            <TableCell colSpan={10} className="h-24 text-center text-sm text-muted-foreground">No semesters found</TableCell>
                          </TableRow>
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
        <SheetContent className="sm:max-w-[520px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-lg font-semibold">
              {editing ? "Edit Semester" : "Add Semester"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {editing ? "Update semester information" : "Add a new semester"}
            </p>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {/* Basic Information Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Institution <span className="text-red-500">*</span></Label>
                  <Select
                    value={formData.institution_code}
                    onValueChange={(value) => setFormData({ ...formData, institution_code: value })}
                    disabled={loadingDropdowns}
                  >
                    <SelectTrigger className={`h-9 ${errors.institution_code ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder={loadingDropdowns ? "Loading..." : "Select Institution"} />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((institution) => (
                        <SelectItem key={institution.id} value={institution.institution_code}>
                          {institution.institution_code} - {institution.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.institution_code && <p className="text-xs text-destructive">{errors.institution_code}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Program <span className="text-red-500">*</span></Label>
                  <Select
                    value={formData.program_code}
                    onValueChange={(value) => setFormData({ ...formData, program_code: value })}
                    disabled={loadingDropdowns}
                  >
                    <SelectTrigger className={`h-9 ${errors.program_code ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder={loadingDropdowns ? "Loading..." : "Select Program"} />
                    </SelectTrigger>
                    <SelectContent>
                      {programs.map((program) => (
                        <SelectItem key={program.id} value={program.program_code}>
                          {program.program_code} - {program.program_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.program_code && <p className="text-xs text-destructive">{errors.program_code}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Semester Code <span className="text-red-500">*</span></Label>
                  <Input value={formData.semester_code} onChange={(e) => setFormData({ ...formData, semester_code: e.target.value })} className={`h-9 ${errors.semester_code ? 'border-destructive' : ''}`} placeholder="e.g., SEM1" />
                  {errors.semester_code && <p className="text-xs text-destructive">{errors.semester_code}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Semester Type</Label>
                  <Select
                    value={formData.semester_type}
                    onValueChange={(value) => setFormData({ ...formData, semester_type: value })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Odd">Odd</SelectItem>
                      <SelectItem value="Even">Even</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Semester Name <span className="text-red-500">*</span></Label>
                <Input value={formData.semester_name} onChange={(e) => setFormData({ ...formData, semester_name: e.target.value })} className={`h-9 ${errors.semester_name ? 'border-destructive' : ''}`} placeholder="e.g., Semester 1" />
                {errors.semester_name && <p className="text-xs text-destructive">{errors.semester_name}</p>}
              </div>
            </div>

            {/* Display Information Section */}
            <div className="space-y-4 pt-2 border-t">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Display Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Display Name</Label>
                  <Input value={formData.display_name} onChange={(e) => setFormData({ ...formData, display_name: e.target.value })} className="h-9" placeholder="e.g., 1" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Semester Group</Label>
                  <Select
                    value={formData.semester_group}
                    onValueChange={(value) => setFormData({ ...formData, semester_group: value })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Year 1">Year 1</SelectItem>
                      <SelectItem value="Year 2">Year 2</SelectItem>
                      <SelectItem value="Year 3">Year 3</SelectItem>
                      <SelectItem value="Year 4">Year 4</SelectItem>
                      <SelectItem value="Year 5">Year 5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Display Order</Label>
                <Input type="number" inputMode="numeric" value={formData.display_order} onChange={(e) => setFormData({ ...formData, display_order: Number(e.target.value || 0) })} className="h-9" placeholder="1" />
              </div>
            </div>

            {/* Semester Properties Section */}
            <div className="space-y-4 pt-2 border-t">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Semester Properties</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, initial_semester: !formData.initial_semester })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                      formData.initial_semester ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.initial_semester ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <Label className="text-sm font-medium">Initial Semester</Label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, terminal_semester: !formData.terminal_semester })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                      formData.terminal_semester ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.terminal_semester ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <Label className="text-sm font-medium">Terminal Semester</Label>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button variant="outline" size="sm" className="h-10 px-6" onClick={() => { setSheetOpen(false); resetForm() }} disabled={saving}>Cancel</Button>
              <Button size="sm" className="h-10 px-6" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : (editing ? "Update Semester" : "Create Semester")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Semester</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.semester_name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) remove(deleteTarget.id); setDeleteTarget(null) }} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
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
                        {error.semester_code} - {error.semester_name}
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
                    <li>- Ensure all required fields are provided and not empty</li>
                    <li>- Foreign keys must reference existing records (institution_code, program_code)</li>
                    <li>- Check field length constraints (e.g., semester_code 50 chars)</li>
                    <li>- Verify data format matches expected patterns</li>
                    <li>- Semester Type values: Odd/Even</li>
                    <li>- Semester Group values: Year 1, Year 2, Year 3, Year 4, Year 5</li>
                    <li>- Initial/Terminal values: Yes/No</li>
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

      <Toaster />
    </SidebarProvider>

  )
}
