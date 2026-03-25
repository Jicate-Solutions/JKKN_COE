"use client"

import { useMemo, useState, useEffect } from "react"
import XLSX from "@/lib/utils/excel-compat"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { PageTransition } from "@/components/common/page-transition"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Building2, FileSpreadsheet, RefreshCw, XCircle, AlertTriangle, Download, Upload, FileJson, Eye } from "lucide-react"

// Import types
import type { MergedInstitution, InstitutionImportError, DepartmentInfo, Institution } from "@/types/institutions"

// Import services
import { fetchInstitutions as fetchInstitutionsService, deleteInstitution } from "@/services/master/institutions-service"

// Import utilities
import { validateInstitutionData } from "@/lib/utils/institution-validation"
import { exportToJSON, exportToExcel, exportTemplate } from "@/lib/utils/institution-export-import"

// Import stats component
import { PremiumInstitutionStats } from "@/components/stats/premium-institution-stats"


export default function InstitutionsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = useAuth()

  // Permission checks for actions (using dot notation to match database: resource.action)
  const canEdit = hasPermission('institutions.edit') || hasPermission('institutions.update')
  const canDelete = hasPermission('institutions.delete')
  const canCreate = hasPermission('institutions.create') || hasPermission('institutions.add')
  const canView = hasPermission('institutions.view') || hasPermission('institutions.read')

  const [items, setItems] = useState<MergedInstitution[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState<number | "all">(10)

  const [statusFilter, setStatusFilter] = useState("all")
  const [errorPopupOpen, setErrorPopupOpen] = useState(false)
  const [importErrors, setImportErrors] = useState<InstitutionImportError[]>([])
  const [uploadSummary, setUploadSummary] = useState<{
    total: number
    success: number
    failed: number
  }>({ total: 0, success: 0, failed: 0 })

  // Fetch data from API
  const fetchInstitutions = async () => {
    try {
      setLoading(true)
      const data = await fetchInstitutionsService()
      setItems(data)
    } catch (error) {
      console.error('Error fetching institutions:', error)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  // Load data on component mount
  useEffect(() => {
    fetchInstitutions()
  }, [])


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
      .filter((i) => [
        i.institution_code,
        i.name,
        i.counselling_code,
        i.myjkkn_name,
        i.myjkkn_short_name,
        i.myjkkn_email,
        i.myjkkn_phone,
        i.myjkkn_city,
        i.myjkkn_state
      ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
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
  }, [items, searchTerm, sortColumn, sortDirection])

  const totalPages = itemsPerPage === "all" ? 1 : Math.ceil(filtered.length / itemsPerPage) || 1
  const startIndex = itemsPerPage === "all" ? 0 : (currentPage - 1) * itemsPerPage
  const endIndex = itemsPerPage === "all" ? filtered.length : startIndex + itemsPerPage
  const pageItems = filtered.slice(startIndex, endIndex)

  useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, itemsPerPage])

  const handleAdd = () => {
    router.push('/master/institutions/add')
  }

  const handleEdit = (id: string) => {
    router.push(`/master/institutions/edit/${id}`)
  }

  const handleView = (id: string) => {
    router.push(`/master/institutions/view/${id}`)
  }

  const remove = async (id: string) => {
    try {
      setLoading(true)
      const institutionName = items.find(i => i.id === id)?.name || 'Institution'

      await deleteInstitution(id)

      setItems((prev) => prev.filter((p) => p.id !== id))

      toast({
        title: "✅ Institution Deleted",
        description: `${institutionName} has been successfully deleted.`,
        className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
      })
    } catch (error) {
      console.error('Error deleting institution:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete institution. Please try again.'
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

  // Export/Import/Template handlers
  const handleDownload = () => exportToJSON(filtered)
  const handleExport = () => exportToExcel(filtered)
  const handleTemplateExport = () => exportTemplate()

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        let rows: Partial<Institution>[] = []
        if (file.name.endsWith('.json')) {
          const text = await file.text()
          rows = JSON.parse(text)
        } else if (file.name.endsWith('.csv')) {
          const text = await file.text()
          const lines = text.split('\n').filter(line => line.trim())
          if (lines.length < 2) {
            toast({
              title: "❌ Invalid CSV File",
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
          
          rows = dataRows.map(j => ({
            institution_code: String(j['Institution Code *'] || j['Institution Code'] || ''),
            name: String(j['Name *'] || j['Name'] || ''),
            phone: String(j['Phone'] || ''),
            email: String(j['Email'] || ''),
            website: String(j['Website'] || ''),
            counselling_code: String(j['Counselling Code'] || ''),
            accredited_by: String(j['Accredited By'] || ''),
            address_line1: String(j['Address Line 1'] || ''),
            address_line2: String(j['Address Line 2'] || ''),
            address_line3: String(j['Address Line 3'] || ''),
            city: String(j['City'] || ''),
            state: String(j['State'] || ''),
            country: String(j['Country'] || ''),
            pin_code: String(j['PIN Code'] || ''),
            logo_url: String(j['Logo URL'] || ''),
            institution_type: String(j['Institution Type'] || 'university'),
            timetable_type: String(j['Timetable Type'] || 'week_order'),
            is_active: String(j['Status'] || '').toLowerCase() === 'active'
          }))
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const data = new Uint8Array(await file.arrayBuffer())
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
          rows = json.map(j => ({
            institution_code: String(j['Institution Code *'] || j['Institution Code'] || ''),
            name: String(j['Name *'] || j['Name'] || ''),
            phone: String(j['Phone'] || ''),
            email: String(j['Email'] || ''),
            website: String(j['Website'] || ''),
            counselling_code: String(j['Counselling Code'] || ''),
            accredited_by: String(j['Accredited By'] || ''),
            address_line1: String(j['Address Line 1'] || ''),
            address_line2: String(j['Address Line 2'] || ''),
            address_line3: String(j['Address Line 3'] || ''),
            city: String(j['City'] || ''),
            state: String(j['State'] || ''),
            country: String(j['Country'] || ''),
            pin_code: String(j['PIN Code'] || ''),
            logo_url: String(j['Logo URL'] || ''),
            institution_type: String(j['Institution Type'] || 'university'),
            timetable_type: String(j['Timetable Type'] || 'week_order'),
            is_active: String(j['Status'] || '').toLowerCase() === 'active'
          }))
        }
        
        const now = new Date().toISOString()
        const validationErrors: Array<{
          row: number
          institution_code: string
          name: string
          errors: string[]
        }> = []
        
        const mapped = rows.map((r, index) => {
          const institutionData = {
            id: String(Date.now() + Math.random()),
            institution_code: r.institution_code!,
            name: r.name as string,
            phone: (r as any).phone || '',
            email: (r as any).email || '',
            website: (r as any).website || '',
            counselling_code: (r as any).counselling_code || '',
            accredited_by: (r as any).accredited_by || '',
            address_line1: (r as any).address_line1 || '',
            address_line2: (r as any).address_line2 || '',
            address_line3: (r as any).address_line3 || '',
            city: (r as any).city || '',
            state: (r as any).state || '',
            country: (r as any).country || '',
            pin_code: (r as any).pin_code || '',
            logo_url: (r as any).logo_url || '',
            institution_type: (r as any).institution_type || 'university',
            timetable_type: (r as any).timetable_type || 'week_order',
            transportation_dept: {} as DepartmentInfo,
            administration_dept: {} as DepartmentInfo,
            accounts_dept: {} as DepartmentInfo,
            admission_dept: {} as DepartmentInfo,
            placement_dept: {} as DepartmentInfo,
            anti_ragging_dept: {} as DepartmentInfo,
            is_active: (r as any).is_active ?? true,
            created_at: now,
          }
          
          // Validate the data
          const errors = validateInstitutionData(institutionData, index + 2) // +2 because index is 0-based and we have header row
          if (errors.length > 0) {
            validationErrors.push({
              row: index + 2,
              institution_code: institutionData.institution_code || 'N/A',
              name: institutionData.name || 'N/A',
              errors: errors
            })
          }
          
          return institutionData
        }).filter(r => r.institution_code && r.name) as Institution[]
        
        // If there are validation errors, show them in popup
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
            title: "❌ No Valid Data",
            description: "No valid data found in the file. Please check that Institution Code and Name are provided.",
            variant: "destructive",
            className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
          })
          return
        }
        
        // Save each institution to the database
        setLoading(true)
        let successCount = 0
        let errorCount = 0
        const uploadErrors: Array<{
          row: number
          institution_code: string
          name: string
          errors: string[]
        }> = []

        for (let i = 0; i < mapped.length; i++) {
          const institution = mapped[i]
          const rowNumber = i + 2 // +2 for header row in Excel

          try {
            const response = await fetch('/api/master/institutions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(institution),
            })

            if (response.ok) {
              const savedInstitution = await response.json()
              setItems(prev => [savedInstitution, ...prev])
              successCount++
            } else {
              const errorData = await response.json()
              errorCount++
              uploadErrors.push({
                row: rowNumber,
                institution_code: institution.institution_code || 'N/A',
                name: institution.name || 'N/A',
                errors: [errorData.error || 'Failed to save institution']
              })
            }
          } catch (error) {
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              institution_code: institution.institution_code || 'N/A',
              name: institution.name || 'N/A',
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
            title: "✅ Upload Complete",
            description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} institution${successCount > 1 ? 's' : ''}) to the database.`,
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
      } catch (err) {
        console.error('Import error:', err)
        setLoading(false)
        toast({
          title: "❌ Import Error",
          description: "Import failed. Please check your file format and try again.",
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
                    <BreadcrumbPage>Institutions</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            {/* Premium Stats Cards */}
            <PremiumInstitutionStats items={items} loading={loading} />

            <Card className="flex-1 flex flex-col min-h-0 border-slate-200 shadow-sm rounded-2xl">
              <CardHeader className="flex-shrink-0 px-8 py-6 border-b border-slate-200">
                <div className="space-y-4">
                  {/* Row 1: Title (Left) & Action Buttons (Right) - Same Line */}
                  <div className="flex items-center justify-between">
                    {/* Title Section - Left */}
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center ring-1 ring-emerald-100">
                        <Building2 className="h-6 w-6 text-emerald-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-900 font-grotesk">All Institutions</h2>
                        <p className="text-sm text-slate-600">Manage and organize institutions</p>
                      </div>
                    </div>

                    {/* Action Buttons - Right (Icon Only) */}
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={fetchInstitutions} disabled={loading} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors border border-slate-300 p-0" title="Refresh">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleTemplateExport} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors border border-slate-300 p-0" title="Download Template">
                        <FileSpreadsheet className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownload} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors border border-slate-300 p-0" title="Export JSON">
                        <FileJson className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleExport} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors border border-slate-300 p-0" title="Export Excel">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleImport} className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors border border-slate-300 p-0" title="Import File">
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={handleAdd} disabled={loading || !canCreate} className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" title={canCreate ? "Add Institution" : "You don't have permission to add institutions"}>
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Add Institution
                      </Button>
                    </div>
                  </div>

                  {/* Row 2: Filter and Search Row */}
                  <div className="flex items-center gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 rounded-lg border-slate-300 focus:border-emerald-500 w-[140px]">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search institutions..."
                        className="pl-8 h-9 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-auto px-8 py-6 bg-slate-50/50">
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                  <Table>
                    <TableHeader className="bg-slate-50 border-b border-slate-200">
                      <TableRow>
                        <TableHead className="text-sm font-semibold text-slate-700">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("institution_code")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
                            COE Code
                            <span className="ml-1">{getSortIcon("institution_code")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-sm font-semibold text-slate-700">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("counselling_code")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
                            MyJKKN Code
                            <span className="ml-1">{getSortIcon("counselling_code")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-sm font-semibold text-slate-700">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("name")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
                            COE Name
                            <span className="ml-1">{getSortIcon("name")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-sm font-semibold text-slate-700">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("myjkkn_name")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
                            MyJKKN Name
                            <span className="ml-1">{getSortIcon("myjkkn_name")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-sm font-semibold text-slate-700">MyJKKN Email</TableHead>
                        <TableHead className="text-sm font-semibold text-slate-700">MyJKKN Phone</TableHead>
                        <TableHead className="text-sm font-semibold text-slate-700">City / State</TableHead>
                        <TableHead className="text-sm font-semibold text-slate-700">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("is_active")} className="px-2 hover:bg-slate-100 rounded-lg transition-colors">
                            Status
                            <span className="ml-1">{getSortIcon("is_active")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-center text-sm font-semibold text-slate-700">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={10} className="h-24 text-center text-sm text-slate-500">Loading…</TableCell>
                        </TableRow>
                      ) : pageItems.length ? (
                        <>
                          {pageItems.map((row) => (
                            <TableRow key={row.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                              <TableCell className="font-medium text-sm text-slate-900 font-grotesk">{row.institution_code}</TableCell>
                              <TableCell className="font-medium text-sm text-blue-600 font-grotesk">{row.counselling_code || '-'}</TableCell>
                              <TableCell className="text-sm text-slate-900 font-grotesk">{row.name}</TableCell>
                              <TableCell className="text-sm text-slate-700">{row.myjkkn_name || '-'}</TableCell>
                              <TableCell className="text-sm text-slate-600">{row.myjkkn_email || '-'}</TableCell>
                              <TableCell className="text-sm text-slate-600">{row.myjkkn_phone || '-'}</TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {row.myjkkn_city || row.myjkkn_state
                                  ? `${row.myjkkn_city || ''}${row.myjkkn_city && row.myjkkn_state ? ', ' : ''}${row.myjkkn_state || ''}`
                                  : '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant={row.is_active ? "default" : "secondary"} className={`text-xs ${row.is_active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                                  {row.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={() => handleView(row.id)}
                                    disabled={!canView}
                                    title={canView ? "View" : "No permission to view"}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={() => handleEdit(row.id)}
                                    disabled={!canEdit}
                                    title={canEdit ? "Edit" : "No permission to edit"}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 rounded-lg hover:bg-red-100 text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={!canDelete}
                                        title={canDelete ? "Delete" : "No permission to delete"}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Institution</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete {row.name}? This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => remove(row.id)} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      ) : (
                        <TableRow>
                          <TableCell colSpan={10} className="h-24 text-center text-sm text-slate-500">No data</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-slate-600">
                      Showing {filtered.length === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, filtered.length)} of {filtered.length} institutions
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="page-size" className="text-sm text-slate-600">
                        Rows per page:
                      </Label>
                      <Select
                        value={String(itemsPerPage)}
                        onValueChange={(value) => setItemsPerPage(value === "all" ? "all" : Number(value))}
                      >
                        <SelectTrigger id="page-size" className="h-9 rounded-lg border-slate-300 w-[100px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || itemsPerPage === "all"}
                      className="h-9 px-4 rounded-lg border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                    </Button>
                    <div className="text-sm text-slate-600 px-2">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages || itemsPerPage === "all"}
                      className="h-9 px-4 rounded-lg border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </PageTransition>
        <AppFooter />

        {/* Error Popup Dialog */}
      <AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
        <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto rounded-3xl border-slate-200">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl font-bold text-red-600">
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
                Please correct these errors in your Excel file and try uploading again. Row numbers correspond to your Excel file (including header row).
              </p>
            </div>

            <div className="space-y-3">
              {importErrors.map((error, index) => (
                <div key={index} className="border border-red-200 rounded-xl p-4 bg-red-50/50">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 rounded-lg">
                        Row {error.row}
                      </Badge>
                      <span className="font-medium text-sm">
                        {error.institution_code} - {error.name}
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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
                  <span className="text-xs font-bold text-blue-600">i</span>
                </div>
                <div>
                  <h4 className="font-semibold text-blue-800 text-sm mb-1">Common Fixes:</h4>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>• Ensure Institution Code and Name are provided and not empty</li>
                    <li>• Use valid email format (e.g., user@domain.com)</li>
                    <li>• Use valid phone format (10-15 digits with optional +, spaces, hyphens)</li>
                    <li>• Use valid website URL format (e.g., https://example.com)</li>
                    <li>• PIN Code must be exactly 6 digits</li>
                    <li>• Institution Type: university, college, school, or institute</li>
                    <li>• Status: true/false or Active/Inactive</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-100 hover:bg-gray-200">
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
      </SidebarInset>
    </SidebarProvider>
  )
}


