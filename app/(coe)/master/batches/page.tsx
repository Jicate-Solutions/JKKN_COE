"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import XLSX from "@/lib/utils/excel-compat"
import { AppFooter } from "@/components/layout/app-footer"
import { ProtectedRoute } from "@/components/common/protected-route"
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Download,
  Upload,
  PlusCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  SquareStack,
  Users,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  GraduationCap,
  RefreshCw,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/common/use-toast"

// Batch type definition - matching actual database schema
interface Batch {
  id: string
  institutions_id: string | null
  institution_code: string
  batch_year: number
  batch_name: string
  batch_code: string
  start_date: string | null
  end_date: string | null
  status: boolean
  created_at: string
  updated_at: string
}

type InstitutionOption = {
  id: string
  institution_code: string
}

export default function BatchPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [yearFilter, setYearFilter] = useState("all")
  const [deleteTarget, setDeleteTarget] = useState<Batch | null>(null)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Batch | null>(null)
  const [saving, setSaving] = useState(false)
  const [institutionOptions, setInstitutionOptions] = useState<InstitutionOption[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()
  const [formData, setFormData] = useState({
    institutions_id: '' as string | null,
    institution_code: '',
    batch_year: new Date().getFullYear(),
    batch_name: '',
    batch_code: '',
    start_date: '' as string | null,
    end_date: '' as string | null,
    status: true,
  })

  const resetForm = () => {
    setFormData({
      institutions_id: '',
      institution_code: '',
      batch_year: new Date().getFullYear(),
      batch_name: '',
      batch_code: '',
      start_date: '',
      end_date: '',
      status: true,
    })
    setErrors({})
  }

  const validate = () => {
    const e: Record<string, string> = {}

    if (!formData.institution_code.trim()) e.institution_code = 'Institution code is required'
    if (!formData.batch_name.trim()) e.batch_name = 'Batch name is required'
    if (!formData.batch_code.trim()) e.batch_code = 'Batch code is required'

    const currentYear = new Date().getFullYear()
    if (!formData.batch_year) {
      e.batch_year = 'Batch year is required'
    } else if (formData.batch_year < 1900 || formData.batch_year > currentYear + 10) {
      e.batch_year = `Batch year must be between 1900 and ${currentYear + 10}`
    }

    if (formData.batch_code && !/^[A-Za-z0-9\-_]+$/.test(formData.batch_code)) {
      e.batch_code = 'Batch code can only contain letters, numbers, hyphens, and underscores'
    }

    if (formData.start_date && formData.end_date) {
      const startDate = new Date(formData.start_date)
      const endDate = new Date(formData.end_date)
      if (endDate <= startDate) {
        e.end_date = 'End date must be after start date'
      }
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  // When editing changes, populate the form from the selected row
  useEffect(() => {
    if (editing) {
      setFormData({
        institutions_id: editing.institutions_id,
        institution_code: editing.institution_code,
        batch_year: editing.batch_year,
        batch_name: editing.batch_name,
        batch_code: editing.batch_code,
        start_date: editing.start_date || '',
        end_date: editing.end_date || '',
        status: editing.status,
      })
    }
  }, [editing])

  // Fetch batches from API
  const fetchBatches = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/master/batches')
      if (response.ok) {
        const data = await response.json()
        setBatches(data)
      } else {
        const errorData = await response.json()
        console.error('Failed to fetch batch:', errorData)

        if (errorData.error === 'Batch table not found') {
          alert(`Database Setup Required:\n\n${errorData.message}\n\nPlease follow the instructions in the console to create the batch table.`)
          console.log('Setup Instructions:', errorData.instructions)
        }
      }
    } catch (error) {
      console.error('Error fetching batch:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBatches()
  }, [])

  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const res = await fetch('/api/master/institutions')
        if (res.ok) {
          const data = await res.json()
          const opts = (data || []).map((i: any) => ({ id: i.id, institution_code: i.institution_code })) as InstitutionOption[]
          setInstitutionOptions(opts)
        }
      } catch (e) {
        console.error('Failed to fetch institutions', e)
      }
    }
    fetchInstitutions()
  }, [])

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // Filter and sort batches
  const filteredBatches = useMemo(() => batches
    .filter((batch) => {
      const matchesSearch = batch.batch_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (batch.batch_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (batch.institution_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                           batch.batch_year.toString().includes(searchTerm)
      const matchesStatus = statusFilter === "all" ||
                           (statusFilter === "active" && batch.status) ||
                           (statusFilter === "inactive" && !batch.status)
      const matchesYear = yearFilter === "all" || batch.batch_year.toString() === yearFilter
      return matchesSearch && matchesStatus && matchesYear
    })
    .sort((a, b) => {
      if (!sortColumn) return 0

      let aValue: string | number
      let bValue: string | number

      switch (sortColumn) {
        case 'institution_code':
          aValue = (a.institution_code || '').toLowerCase()
          bValue = (b.institution_code || '').toLowerCase()
          break
        case 'batch_code':
          aValue = a.batch_code.toLowerCase()
          bValue = b.batch_code.toLowerCase()
          break
        case 'batch_name':
          aValue = (a.batch_name || '').toLowerCase()
          bValue = (b.batch_name || '').toLowerCase()
          break
        case 'batch_year':
          aValue = a.batch_year
          bValue = b.batch_year
          break
        case 'status':
          aValue = a.status ? 1 : 0
          bValue = b.status ? 1 : 0
          break
        case 'created_at':
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
        default:
          return 0
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
      }
    }), [batches, searchTerm, statusFilter, yearFilter, sortColumn, sortDirection])

  const pageSizeOptions = useMemo(() => {
    const base = [10, 25, 50]
    if (filteredBatches.length > 50) base.push(100)
    if (filteredBatches.length > 100) base.push(filteredBatches.length)
    return base
  }, [filteredBatches.length])

  const getStatusBadgeVariant = (batch: Batch) => {
    return batch.status ? "default" : "secondary"
  }

  const getStatusText = (batch: Batch) => {
    return batch.status ? "Active" : "Inactive"
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleDeleteBatch = async (batchId: string) => {
    try {
      const response = await fetch(`/api/master/batches/${batchId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setBatches(batches.filter(batch => batch.id !== batchId))
        setDeleteTarget(null)
      } else {
        console.error('Failed to delete batch')
      }
    } catch (error) {
      console.error('Error deleting batch:', error)
    }
  }

  // Download function - downloads filtered data as JSON
  const handleDownload = () => {
    const dataToDownload = filteredBatches
    const jsonData = JSON.stringify(dataToDownload, null, 2)
    const blob = new Blob([jsonData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `batch_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Template Export function
  const handleTemplateExport = () => {
    const sampleData = [{
      'Institution Code': 'JKKN',
      'Batch Year': 2024,
      'Batch Name': '2024-2028 B.E. CSE',
      'Batch Code': 'B2024CS01',
      'Start Date': '2024-08-01',
      'End Date': '2028-05-31',
      'Status': 'Active'
    }]

    const ws = XLSX.utils.json_to_sheet(sampleData)
    const wb = XLSX.utils.book_new()

    const colWidths = [
      { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }
    ]
    ws['!cols'] = colWidths

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
      if (!ws[cellAddress]) continue

      ws[cellAddress].s = {
        font: { bold: true, name: 'Arial', sz: 11, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '0066CC' }, bgColor: { rgb: '0066CC' }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      }
    }

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col })
      if (!ws[cellAddress]) continue

      ws[cellAddress].s = {
        font: { name: 'Arial', sz: 10, color: { rgb: '666666' }, italic: true },
        fill: { fgColor: { rgb: 'F0F0F0' }, bgColor: { rgb: 'F0F0F0' }, patternType: 'solid' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      }
    }

    if (!ws.A1.c) ws.A1.c = []
    ws.A1.c.push({
      a: 'Template Instructions',
      t: 'This is a template for importing batch data.\n\nInstructions:\n1. Replace the sample data with your actual data\n2. Keep the header row as is\n3. Status should be either "Active" or "Inactive"\n4. Batch Year should be a 4-digit year (e.g., 2024)\n5. Institution Code must exist in Institutions\n6. Dates should be YYYY-MM-DD\n7. Save the file and use the Upload button to import'
    })

    XLSX.utils.book_append_sheet(wb, ws, 'Batch Template')
    XLSX.writeFile(wb, `batch_template_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // Export function
  const handleExport = () => {
    const excelData = filteredBatches.map((batch, index) => ({
      'S.No': index + 1,
      'Institution Code': batch.institution_code,
      'Batch Year': batch.batch_year,
      'Batch Name': batch.batch_name,
      'Batch Code': batch.batch_code,
      'Start Date': batch.start_date || '',
      'End Date': batch.end_date || '',
      'Status': batch.status ? 'Active' : 'Inactive',
      'Created Date': formatDate(batch.created_at)
    }))

    const ws = XLSX.utils.json_to_sheet(excelData)
    const wb = XLSX.utils.book_new()

    const colWidths = [
      { wch: 5 }, { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 18 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }
    ]
    ws['!cols'] = colWidths

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
      if (!ws[cellAddress]) continue

      ws[cellAddress].s = {
        font: { bold: true, name: 'Times New Roman', sz: 11 },
        fill: { fgColor: { rgb: '16a34a' }, bgColor: { rgb: '16a34a' }, patternType: 'solid' },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      }
    }

    for (let row = 1; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
        if (!ws[cellAddress]) continue

        if (!ws[cellAddress].s) ws[cellAddress].s = {}
        ws[cellAddress].s.font = { name: 'Times New Roman', sz: 11 }
        ws[cellAddress].s.border = {
          top: { style: 'thin', color: { rgb: '000000' } },
          bottom: { style: 'thin', color: { rgb: '000000' } },
          left: { style: 'thin', color: { rgb: '000000' } },
          right: { style: 'thin', color: { rgb: '000000' } }
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Batch')
    XLSX.writeFile(wb, `batch_export_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // Import function
  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        let dataToImport: Partial<Batch>[] = []

        if (file.name.endsWith('.json')) {
          const reader = new FileReader()
          reader.onload = async (event) => {
            const content = event.target?.result as string
            dataToImport = JSON.parse(content)
            await processImport(dataToImport)
          }
          reader.readAsText(file)
        } else if (file.name.endsWith('.csv')) {
          const reader = new FileReader()
          reader.onload = async (event) => {
            const content = event.target?.result as string
            const lines = content.split('\n')
            const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())

            const hasSNo = headers[0] === 'S.No'
            const startIndex = hasSNo ? 1 : 0

            for (let i = 1; i < lines.length; i++) {
              if (!lines[i].trim()) continue
              const values = lines[i].match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/"/g, '').trim()) || []

              const batch: Partial<Batch> = {
                institution_code: values[startIndex] || '',
                batch_year: parseInt(values[startIndex + 1]) || new Date().getFullYear(),
                batch_name: values[startIndex + 2] || '',
                batch_code: values[startIndex + 3] || '',
                start_date: values[startIndex + 4] || '',
                end_date: values[startIndex + 5] || '',
                status: (values[startIndex + 6] || '').toLowerCase() === 'active'
              }
              dataToImport.push(batch)
            }
            await processImport(dataToImport)
          }
          reader.readAsText(file)
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const reader = new FileReader()
          reader.onload = async (event) => {
            const data = new Uint8Array(event.target?.result as ArrayBuffer)
            const workbook = XLSX.read(data, { type: 'array' })
            const worksheet = workbook.Sheets[workbook.SheetNames[0]]
            const jsonData = XLSX.utils.sheet_to_json(worksheet)

            dataToImport = (jsonData as Record<string, unknown>[]).map((row) => ({
              institution_code: String(row['Institution Code'] || ''),
              batch_year: Number(row['Batch Year']) || new Date().getFullYear(),
              batch_name: String(row['Batch Name'] || ''),
              batch_code: String(row['Batch Code'] || ''),
              start_date: String(row['Start Date'] || ''),
              end_date: String(row['End Date'] || ''),
              status: String(row['Status'] || '').toLowerCase() === 'active'
            }))
            await processImport(dataToImport)
          }
          reader.readAsArrayBuffer(file)
        }
      } catch (error) {
        alert('Error reading file. Please check the file format.')
        console.error('File read error:', error)
      }
    }

    async function processImport(dataToImport: Partial<Batch>[]) {
      try {
        let successCount = 0
        let failCount = 0

        for (const batch of dataToImport) {
          try {
            const response = await fetch('/api/master/batches', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(batch)
            })

            if (response.ok) {
              successCount++
            } else {
              failCount++
            }
          } catch (error) {
            failCount++
          }
        }

        const response = await fetch('/api/master/batches')
        if (response.ok) {
          const data = await response.json()
          setBatches(data)
        }

        alert(`Import completed!\nSuccessful: ${successCount}\nFailed: ${failCount}`)

      } catch (error) {
        alert('Error importing file. Please check the file format.')
        console.error('Import error:', error)
      }
    }

    input.click()
  }

  // Get unique years for filters
  const uniqueYears = [...new Set(batches.map(b => b.batch_year))].sort((a, b) => b - a)

  // Calculate pagination
  const isShowAll = itemsPerPage >= filteredBatches.length && filteredBatches.length > 0
  const effectivePerPage = isShowAll ? filteredBatches.length : itemsPerPage
  const totalPages = Math.ceil(filteredBatches.length / effectivePerPage) || 1
  const startIndex = (currentPage - 1) * effectivePerPage
  const endIndex = startIndex + effectivePerPage
  const paginatedBatches = filteredBatches.slice(startIndex, endIndex)

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, yearFilter, sortColumn, sortDirection, itemsPerPage])

  return (
    <ProtectedRoute>
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen">
        <AppHeader />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/dashboard" className="hover:text-primary">Dashboard</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Batch</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            {/* Scorecard Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
              <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Batches</p>
                  <p className="text-2xl font-bold mt-1">{batches.length}</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-600">
                    {batches.filter(batch => batch.status).length}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-rose-500 hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inactive</p>
                  <p className="text-2xl font-bold mt-1 text-rose-600">
                    {batches.filter(batch => !batch.status).length}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New This Month</p>
                  <p className="text-2xl font-bold mt-1 text-purple-600">
                    {batches.filter(batch => {
                      const batchDate = new Date(batch.created_at)
                      const now = new Date()
                      return batchDate.getMonth() === now.getMonth() && batchDate.getFullYear() === now.getFullYear()
                    }).length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Action Bar */}
            <TooltipProvider>
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader className="flex-shrink-0 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <GraduationCap className="h-3 w-3 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold">Batches</h2>
                      <p className="text-xs text-muted-foreground">Manage batches</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
                  <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                    {/* Filter Dropdowns */}
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

                    <Select value={yearFilter} onValueChange={setYearFilter}>
                      <SelectTrigger className="w-[140px] h-8">
                        <SelectValue placeholder="All Years" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {uniqueYears.map(year => (
                          <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Search Bar */}
                    <div className="relative w-full sm:w-[220px]">
                      <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search batches…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-1 flex-wrap items-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={fetchBatches}
                          disabled={loading}
                        >
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

                    <Button size="sm" className="text-xs px-2 h-8" onClick={() => { setSheetOpen(true); setEditing(null); resetForm() }}>
                      <PlusCircle className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
                {/* Data Table */}
                <div className="rounded-md border overflow-hidden" style={{ height: '440px' }}>
                  <div className="h-full overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
                        <TableRow>
                          <TableHead className="w-[50px] text-xs">S.No</TableHead>
                          <TableHead className="w-[160px] text-xs">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSort('institution_code')}
                              className="h-auto p-0 font-medium hover:bg-transparent"
                            >
                              Institution Code
                              <span className="ml-1">{getSortIcon('institution_code')}</span>
                            </Button>
                          </TableHead>
                          <TableHead className="w-[150px] text-xs">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSort('batch_name')}
                              className="h-auto p-0 font-medium hover:bg-transparent"
                            >
                              Batch Name
                              <span className="ml-1">{getSortIcon('batch_name')}</span>
                            </Button>
                          </TableHead>
                          <TableHead className="w-[120px] text-xs">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSort('batch_code')}
                              className="h-auto p-0 font-medium hover:bg-transparent"
                            >
                              Batch Code
                              <span className="ml-1">{getSortIcon('batch_code')}</span>
                            </Button>
                          </TableHead>
                          <TableHead className="w-[100px] text-xs">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSort('batch_year')}
                              className="h-auto p-0 font-medium hover:bg-transparent"
                            >
                              Batch Year
                              <span className="ml-1">{getSortIcon('batch_year')}</span>
                            </Button>
                          </TableHead>
                          <TableHead className="w-[100px] text-xs">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSort('status')}
                              className="h-auto p-0 font-medium hover:bg-transparent"
                            >
                              Status
                              <span className="ml-1">{getSortIcon('status')}</span>
                            </Button>
                          </TableHead>
                          <TableHead className="w-[120px] text-xs">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSort('created_at')}
                              className="h-auto p-0 font-medium hover:bg-transparent"
                            >
                              Created
                              <span className="ml-1">{getSortIcon('created_at')}</span>
                            </Button>
                          </TableHead>
                          <TableHead className="w-[60px] text-xs text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loading ? (
                          <TableRow>
                            <TableCell colSpan={8} className="h-32 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <RefreshCw className="h-5 w-5 animate-spin" />
                                <span className="text-sm">Loading batches...</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : paginatedBatches.length > 0 ? (
                          <>
                            {paginatedBatches.map((batch, index) => (
                              <TableRow key={batch.id}>
                                <TableCell className="text-sm">
                                  {startIndex + index + 1}
                                </TableCell>
                                <TableCell className="font-medium text-sm">
                                  {batch.institution_code}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {batch.batch_name}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {batch.batch_code}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {batch.batch_year}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={getStatusBadgeVariant(batch)} className="text-xs">
                                    {getStatusText(batch)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatDate(batch.created_at)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => { setEditing(batch); setSheetOpen(true) }}>
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600"
                                        onClick={() => setDeleteTarget(batch)}
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
                            <TableCell colSpan={8} className="h-32 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <GraduationCap className="h-8 w-8 opacity-30" />
                                <span className="text-sm">No batches found</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Pagination Controls */}
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
                            {size >= filteredBatches.length && filteredBatches.length > 0 ? 'All' : size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      {filteredBatches.length === 0 ? '0' : `${startIndex + 1}-${Math.min(endIndex, filteredBatches.length)}`} of {filteredBatches.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span className="text-xs text-muted-foreground px-2">
                      Page {currentPage} of {totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage >= totalPages}
                    >
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

      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) { setSheetOpen(o); setEditing(null); resetForm(); } else setSheetOpen(o) }}>
        <SheetContent className="sm:max-w-[800px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="text-lg font-semibold flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              {editing ? 'Edit Batch' : 'Add Batch'}
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {editing ? 'Update batch information' : 'Create a new batch record'}
            </p>
          </SheetHeader>

          <div className="mt-6 space-y-8">
            {/* Basic Information Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Institution Code <span className="text-red-500">*</span></Label>
                  <Select value={formData.institution_code} onValueChange={(v) => setFormData({ ...formData, institution_code: v })}>
                    <SelectTrigger className={`h-10 ${errors.institution_code ? 'border-destructive' : ''}`}>
                      <SelectValue placeholder="Select institution code" />
                    </SelectTrigger>
                    <SelectContent>
                      {institutionOptions.map(opt => (
                        <SelectItem key={opt.id} value={opt.institution_code}>{opt.institution_code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.institution_code && <p className="text-xs text-destructive">{errors.institution_code}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Batch Year <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    value={formData.batch_year}
                    onChange={(e) => setFormData({ ...formData, batch_year: parseInt(e.target.value) || new Date().getFullYear() })}
                    className={`h-10 ${errors.batch_year ? 'border-destructive' : ''}`}
                    placeholder="e.g., 2024"
                  />
                  {errors.batch_year && <p className="text-xs text-destructive">{errors.batch_year}</p>}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-sm font-semibold">Batch Name <span className="text-red-500">*</span></Label>
                  <Input
                    value={formData.batch_name}
                    onChange={(e) => setFormData({ ...formData, batch_name: e.target.value })}
                    className={`h-10 ${errors.batch_name ? 'border-destructive' : ''}`}
                    placeholder="e.g., 2024-2028 B.E. CSE"
                  />
                  {errors.batch_name && <p className="text-xs text-destructive">{errors.batch_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Batch Code <span className="text-red-500">*</span></Label>
                  <Input
                    value={formData.batch_code}
                    onChange={(e) => setFormData({ ...formData, batch_code: e.target.value })}
                    className={`h-10 ${errors.batch_code ? 'border-destructive' : ''}`}
                    placeholder="e.g., B2024CS01"
                  />
                  {errors.batch_code && <p className="text-xs text-destructive">{errors.batch_code}</p>}
                </div>
              </div>
            </div>

            {/* Dates Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Start Date</Label>
                  <Input type="date" value={formData.start_date || ''} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className={`h-10 ${errors.start_date ? 'border-destructive' : ''}`} />
                  {errors.start_date && <p className="text-xs text-destructive">{errors.start_date}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">End Date</Label>
                  <Input type="date" value={formData.end_date || ''} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className={`h-10 ${errors.end_date ? 'border-destructive' : ''}`} />
                  {errors.end_date && <p className="text-xs text-destructive">{errors.end_date}</p>}
                </div>
              </div>
            </div>

            {/* Status Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h3>
              <div className="flex items-center gap-4">
                <Label className="text-sm font-semibold">Batch Status</Label>
                <Switch checked={formData.status} onCheckedChange={(v) => setFormData({ ...formData, status: v })} />
                <span className={`text-sm font-medium ${formData.status ? 'text-green-600' : 'text-red-500'}`}>
                  {formData.status ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button
                variant="outline"
                size="sm"
                className="h-10 px-6"
                onClick={() => { setSheetOpen(false); setEditing(null); resetForm() }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-10 px-6"
                onClick={async () => {
                  if (!validate()) {
                    toast({
                      title: 'Validation Failed',
                      description: 'Please correct the errors in the form before submitting.',
                      variant: 'destructive',
                      className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
                    })
                    return
                  }
                  try {
                    setSaving(true)
                    const method = editing ? 'PUT' : 'POST'
                    const url = editing ? `/api/master/batches/${editing.id}` : '/api/master/batches'
                    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })

                    if (!res.ok) {
                      const errorData = await res.json().catch(() => ({}))
                      const errorMsg = errorData.error || errorData.details || 'Save failed'

                      if (res.status === 401) {
                        throw new Error('Unauthorized. Please login again.')
                      } else if (res.status === 403) {
                        throw new Error('Forbidden. You do not have permission to perform this action.')
                      } else if (errorMsg.includes('duplicate') || errorMsg.includes('already exists')) {
                        throw new Error('This batch already exists. Please use different values.')
                      } else if (errorMsg.includes('Missing required fields')) {
                        throw new Error(errorData.details || 'Missing required fields')
                      }

                      throw new Error(errorMsg)
                    }

                    const saved = await res.json()
                    setBatches(prev => editing ? prev.map(b => (b.id === saved.id ? saved : b)) : [saved, ...prev])
                    toast({
                      title: editing ? 'Batch Updated' : 'Batch Created',
                      description: `${saved.batch_name} has been successfully ${editing ? 'updated' : 'created'}.`,
                      className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
                    })
                    setSheetOpen(false)
                    setEditing(null)
                    resetForm()
                  } catch (e) {
                    const errorMessage = e instanceof Error ? e.message : 'Failed to save batch. Please try again.'
                    console.error('Save error:', e)
                    toast({
                      title: 'Save Failed',
                      description: errorMessage,
                      variant: 'destructive',
                      className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
                    })
                  } finally {
                    setSaving(false)
                  }
                }}
                disabled={saving}
              >
                {saving ? (editing ? 'Updating…' : 'Creating…') : (editing ? 'Update Batch' : 'Create Batch')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Standalone Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteTarget?.batch_name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) handleDeleteBatch(deleteTarget.id.toString()) }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
    </ProtectedRoute>
  )
}
