"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import XLSX from "@/lib/utils/excel-compat"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
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
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronDown, Download, Edit, FileSpreadsheet, Key, MoreHorizontal, PlusCircle, RefreshCw, Search, Shield, Trash2, Upload, CheckCircle, XCircle, AlertTriangle } from "lucide-react"

interface Permission {
  id: string
  name: string
  description?: string
  resource: string
  action: string
  is_active: boolean
  created_at: string
}

export default function PermissionsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [deleteTarget, setDeleteTarget] = useState<Permission | null>(null)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Permission | null>(null)
  const [errorPopupOpen, setErrorPopupOpen] = useState(false)
  const [importErrors, setImportErrors] = useState<Array<{
    row: number
    name: string
    resource: string
    errors: string[]
  }>>([])

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    resource: "",
    action: "",
    is_active: true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const fetchPermissions = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/users/permissions')
      if (!response.ok) throw new Error('Failed to fetch permissions')
      const data = await response.json()
      setItems(data)
    } catch (error) {
      console.error('Error fetching permissions:', error)
      toast({
        title: "Fetch Failed",
        description: "Failed to fetch permissions. Please try again.",
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPermissions()
  }, [])

  const resetForm = () => {
    setFormData({ name: "", description: "", resource: "", action: "", is_active: true })
    setErrors({})
    setEditing(null)
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    else { setSortColumn(column); setSortDirection('asc') }
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase()
    const data = items
      .filter((p) => [p.name, p.resource, p.action, p.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .filter((p) => statusFilter === "all" || (statusFilter === "active" ? p.is_active : !p.is_active))

    if (!sortColumn) return data
    const sorted = [...data].sort((a, b) => {
      const av = (a as any)[sortColumn]
      const bv = (b as any)[sortColumn]
      if (av === bv) return 0
      if (sortDirection === "asc") return av > bv ? 1 : -1
      return av < bv ? 1 : -1
    })
    return sorted
  }, [items, searchTerm, statusFilter, sortColumn, sortDirection])

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

  useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection, itemsPerPage])

  const openAdd = () => {
    resetForm()
    setSheetOpen(true)
  }

  const openEdit = (row: Permission) => {
    setEditing(row)
    setFormData({
      name: row.name,
      description: row.description || "",
      resource: row.resource,
      action: row.action,
      is_active: row.is_active,
    })
    setSheetOpen(true)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!formData.name.trim()) e.name = "Required"
    if (!formData.resource.trim()) e.resource = "Required"
    if (!formData.action.trim()) e.action = "Required"
    if (formData.name && formData.name.length > 100) e.name = "Name must be 100 characters or less"
    if (formData.resource && formData.resource.length > 100) e.resource = "Resource must be 100 characters or less"
    if (formData.action && formData.action.length > 50) e.action = "Action must be 50 characters or less"
    if (formData.description && formData.description.length > 500) e.description = "Description must be 500 characters or less"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = async () => {
    if (!validate()) return

    try {
      setLoading(true)

      if (editing) {
        const response = await fetch(`/api/users/permissions/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to update permission')
        }

        const updatedPermission = await response.json()
        setItems((prev) => prev.map((p) => (p.id === editing.id ? updatedPermission : p)))

        toast({
          title: "Permission Updated",
          description: `${updatedPermission.name} has been successfully updated.`,
          className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
        })
      } else {
        const response = await fetch('/api/users/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to create permission')
        }

        const newPermission = await response.json()
        setItems((prev) => [newPermission, ...prev])

        toast({
          title: "Permission Created",
          description: `${newPermission.name} has been successfully created.`,
          className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
        })
      }

      setSheetOpen(false)
      resetForm()
    } catch (error) {
      console.error('Error saving permission:', error)
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save permission. Please try again.",
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

      const response = await fetch(`/api/users/permissions/${id}`, { method: 'DELETE' })

      if (!response.ok) throw new Error('Failed to delete permission')

      const permissionName = items.find(p => p.id === id)?.name || 'Permission'
      setItems((prev) => prev.filter((p) => p.id !== id))

      toast({
        title: "Permission Deleted",
        description: `${permissionName} has been successfully deleted.`,
        className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
      })
    } catch (error) {
      console.error('Error deleting permission:', error)
      toast({
        title: "Delete Failed",
        description: "Failed to delete permission. Please try again.",
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })

  const validatePermissionData = (data: any, rowIndex: number, existingPermissions: Permission[] = []) => {
    const errors: string[] = []
    if (!data.name || data.name.trim() === '') errors.push('Permission Name is required')
    else if (data.name.length > 100) errors.push('Permission Name must be 100 characters or less')
    if (!data.resource || data.resource.trim() === '') errors.push('Resource is required')
    else if (data.resource.length > 100) errors.push('Resource must be 100 characters or less')
    if (!data.action || data.action.trim() === '') errors.push('Action is required')
    else if (data.action.length > 50) errors.push('Action must be 50 characters or less')
    if (data.description && data.description.length > 500) errors.push('Description must be 500 characters or less')
    if (data.name) {
      const existingNamePermission = existingPermissions.find(p => p.name === data.name)
      if (existingNamePermission) errors.push(`Permission name conflict: A permission with name "${data.name}" already exists`)
    }
    if (data.resource && data.action) {
      const existingPermission = existingPermissions.find(p => p.resource === data.resource && p.action === data.action)
      if (existingPermission) errors.push(`Permission conflict: resource "${data.resource}" + action "${data.action}" already exists`)
    }
    return errors
  }

  const handleDownload = async () => {
    try {
      const response = await fetch('/api/users/permissions')
      if (!response.ok) throw new Error('Failed to fetch permissions for export')
      const allPermissions = await response.json()
      const exportData = allPermissions.map((item: Permission) => ({
        name: item.name, description: item.description || '', resource: item.resource,
        action: item.action, is_active: item.is_active, created_at: item.created_at
      }))
      const json = JSON.stringify(exportData, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `permissions_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: "Export Successful", description: `Exported ${allPermissions.length} permission(s).`, className: "bg-green-50 border-green-200 text-green-800" })
    } catch (error) {
      toast({ title: "Export Failed", description: "Failed to export permissions.", variant: "destructive" })
    }
  }

  const handleExport = async () => {
    try {
      const response = await fetch('/api/users/permissions')
      if (!response.ok) throw new Error('Failed to fetch permissions for export')
      const allPermissions = await response.json()
      const excelData = allPermissions.map((p: Permission) => ({
        'Permission Name': p.name, 'Description': p.description || '', 'Resource': p.resource,
        'Action': p.action, 'Status': p.is_active ? 'Active' : 'Inactive',
        'Created': new Date(p.created_at).toISOString().split('T')[0],
      }))
      const ws = XLSX.utils.json_to_sheet(excelData)
      ws['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 12 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Permissions')
      XLSX.writeFile(wb, `permissions_export_${new Date().toISOString().split('T')[0]}.xlsx`)
      toast({ title: "Export Successful", description: `Exported ${allPermissions.length} permission(s).`, className: "bg-green-50 border-green-200 text-green-800" })
    } catch (error) {
      toast({ title: "Export Failed", description: "Failed to export permissions.", variant: "destructive" })
    }
  }

  const handleTemplateExport = () => {
    const sample = [{ 'Permission Name': 'permissions.view', 'Description': 'View permissions', 'Resource': 'permissions', 'Action': 'view', 'Status': 'Active' }]
    const ws = XLSX.utils.json_to_sheet(sample)
    ws['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')
    XLSX.writeFile(wb, `permissions_template_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        let rows: Partial<Permission>[] = []
        if (file.name.endsWith('.json')) {
          const text = await file.text()
          rows = JSON.parse(text)
        } else if (file.name.endsWith('.csv')) {
          const text = await file.text()
          const lines = text.split('\n').filter(line => line.trim())
          if (lines.length < 2) { toast({ title: "Invalid CSV File", description: "CSV must have header + data rows", variant: "destructive" }); return }
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
          const dataRows = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
            const row: Record<string, string> = {}
            headers.forEach((header, index) => { row[header] = values[index] || '' })
            return row
          })
          rows = dataRows.map(j => ({
            name: String(j['Permission Name *'] || j['Permission Name'] || ''),
            description: String(j['Description'] || ''),
            resource: String(j['Resource *'] || j['Resource'] || ''),
            action: String(j['Action *'] || j['Action'] || ''),
            is_active: String(j['Status'] || '').toLowerCase() === 'active'
          }))
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const data = new Uint8Array(await file.arrayBuffer())
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
          rows = json.map(j => ({
            name: String(j['Permission Name *'] || j['Permission Name'] || ''),
            description: String(j['Description'] || ''),
            resource: String(j['Resource *'] || j['Resource'] || ''),
            action: String(j['Action *'] || j['Action'] || ''),
            is_active: String(j['Status'] || '').toLowerCase() === 'active'
          }))
        }

        const validationErrors: Array<{ row: number; name: string; resource: string; errors: string[] }> = []
        const mapped = rows.map((r, index) => {
          const permissionData = { name: r.name!, description: r.description || '', resource: r.resource as string, action: r.action as string, is_active: (r as any).is_active ?? true }
          const errs = validatePermissionData(permissionData, index + 2, items)
          if (errs.length > 0) validationErrors.push({ row: index + 2, name: permissionData.name || 'N/A', resource: permissionData.resource || 'N/A', errors: errs })
          return permissionData
        }).filter(r => r.name && r.resource && r.action) as Permission[]

        if (validationErrors.length > 0) { setImportErrors(validationErrors); setErrorPopupOpen(true); return }
        if (mapped.length === 0) { toast({ title: "No Valid Data", description: "No valid data found.", variant: "destructive" }); return }

        setLoading(true)
        let successCount = 0; let errorCount = 0; let skippedCount = 0
        const importErrs: Array<{ row: number; name: string; resource: string; errors: string[] }> = []

        for (const permission of mapped) {
          try {
            const response = await fetch('/api/users/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(permission) })
            if (response.ok) { const saved = await response.json(); setItems(prev => [saved, ...prev]); successCount++ }
            else if (response.status === 409) { skippedCount++ }
            else { const errorData = await response.json().catch(() => ({ error: 'Unknown error' })); importErrs.push({ row: mapped.findIndex(p => p.name === permission.name) + 2, name: permission.name, resource: permission.resource, errors: [errorData.error || 'Failed'] }); errorCount++ }
          } catch (error) { importErrs.push({ row: mapped.findIndex(p => p.name === permission.name) + 2, name: permission.name, resource: permission.resource, errors: [error instanceof Error ? error.message : 'Network error'] }); errorCount++ }
        }
        setLoading(false)

        if (importErrs.length > 0) { setImportErrors(importErrs); setErrorPopupOpen(true) }
        const description = [successCount > 0 && `${successCount} imported`, skippedCount > 0 && `${skippedCount} skipped`, errorCount > 0 && `${errorCount} failed`].filter(Boolean).join(', ')
        toast({ title: successCount > 0 && errorCount === 0 ? "Import Completed" : "Import Completed", description, className: errorCount === 0 ? "bg-green-50 border-green-200 text-green-800" : undefined })
      } catch (err) {
        setLoading(false)
        toast({ title: "Import Error", description: "Import failed. Please check your file format.", variant: "destructive" })
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
                  <BreadcrumbPage>Permissions</BreadcrumbPage>
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
                    <p className="text-xs font-medium text-muted-foreground">Total Permissions</p>
                    <p className="text-xl font-bold">{items.length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                    <Shield className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Active Permissions</p>
                    <p className="text-xl font-bold text-green-600">{items.filter(p=>p.is_active).length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Inactive Permissions</p>
                    <p className="text-xl font-bold text-red-600">{items.filter(p=>!p.is_active).length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Unique Resources</p>
                    <p className="text-xl font-bold text-purple-600">{new Set(items.map(p => p.resource)).size}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                    <Key className="h-3 w-3 text-purple-600 dark:text-purple-400" />
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
                    <Shield className="h-3 w-3 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Permissions</h2>
                    <p className="text-xs text-muted-foreground">Manage system permissions</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center justify-between">
                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
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
                    <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="pl-8 h-8 text-xs" />
                  </div>
                </div>

                <div className="flex gap-1 flex-wrap">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs h-8 w-8 p-0" onClick={fetchPermissions} disabled={loading}>
                          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleTemplateExport}>
                    <FileSpreadsheet className="h-3 w-3 mr-1" />
                    Template
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="text-xs px-2 h-8">
                        <Download className="h-3 w-3 mr-1" />
                        Export
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExport}>
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-2" />
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
                    Upload
                  </Button>
                  <Button size="sm" className="text-xs px-2 h-8" onClick={openAdd} disabled={loading}>
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
                        <TableHead className="w-[200px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("name")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Permission Name <span className="ml-1">{getSortIcon("name")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[120px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("resource")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Resource <span className="ml-1">{getSortIcon("resource")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[100px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("action")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Action <span className="ml-1">{getSortIcon("action")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="w-[100px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort("is_active")} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Status <span className="ml-1">{getSortIcon("is_active")}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[80px] text-xs text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-sm">Loading...</TableCell>
                        </TableRow>
                      ) : pageItems.length ? (
                        pageItems.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="text-sm font-medium">{row.name}</TableCell>
                            <TableCell className="text-sm">{row.resource}</TableCell>
                            <TableCell className="text-sm">{row.action}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.description || '-'}</TableCell>
                            <TableCell>
                              <Badge
                                variant={row.is_active ? "default" : "secondary"}
                                className={`text-xs ${row.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200'}`}
                              >
                                {row.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
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
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
                                      onClick={() => setDeleteTarget(row)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <Shield className="h-8 w-8 text-muted-foreground" />
                              No permissions found.
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex items-center justify-between space-x-2 py-2 mt-2">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-muted-foreground">
                    Showing {filtered.length === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, filtered.length)} of {filtered.length}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Rows:</span>
                    <Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
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
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 px-2 text-xs">
                    <ChevronLeft className="h-3 w-3 mr-1" /> Previous
                  </Button>
                  <div className="text-xs text-muted-foreground px-2">Page {currentPage} of {totalPages}</div>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="h-7 px-2 text-xs">
                    Next <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <AppFooter />
      </SidebarInset>

      {/* Standalone Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Permission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
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

      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
        <SheetContent className="sm:max-w-[600px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-lg font-semibold">
                  {editing ? "Edit Permission" : "Add Permission"}
                </SheetTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editing ? "Update permission information" : "Create a new permission record"}
                </p>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Permission Details</p>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-semibold">
                    Permission Name <span className="text-red-500">*</span>
                  </Label>
                  <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={`h-10 ${errors.name ? 'border-destructive' : ''}`} placeholder="e.g., permissions.view" />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="resource" className="text-sm font-semibold">Resource <span className="text-red-500">*</span></Label>
                    <Input id="resource" value={formData.resource} onChange={(e) => setFormData({ ...formData, resource: e.target.value })} className={`h-10 ${errors.resource ? 'border-destructive' : ''}`} placeholder="e.g., permission" />
                    {errors.resource && <p className="text-xs text-destructive">{errors.resource}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="action" className="text-sm font-semibold">Action <span className="text-red-500">*</span></Label>
                    <Input id="action" value={formData.action} onChange={(e) => setFormData({ ...formData, action: e.target.value })} className={`h-10 ${errors.action ? 'border-destructive' : ''}`} placeholder="e.g., view" />
                    {errors.action && <p className="text-xs text-destructive">{errors.action}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                  <Input id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className={`h-10 ${errors.description ? 'border-destructive' : ''}`} placeholder="Brief description of the permission" />
                  {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Status</p>
              <div className="flex items-center gap-4">
                <Label className="text-sm font-semibold">Permission Status</Label>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className={`text-sm font-medium ${formData.is_active ? 'text-green-600' : 'text-red-500'}`}>
                  {formData.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button variant="outline" size="sm" className="h-10 px-6" onClick={() => { setSheetOpen(false); resetForm() }}>Cancel</Button>
              <Button size="sm" className="h-10 px-6" onClick={save} disabled={loading}>
                {loading ? 'Saving...' : (editing ? "Update Permission" : "Create Permission")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Error Popup Dialog */}
      <AlertDialog open={errorPopupOpen} onOpenChange={setErrorPopupOpen}>
        <AlertDialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <AlertDialogTitle className="text-xl font-bold text-red-600 dark:text-red-400">Data Validation Errors</AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-muted-foreground mt-1">Please fix the following errors before importing the data</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="font-semibold text-red-800 dark:text-red-200">{importErrors.length} record(s) have validation errors</span>
              </div>
              <p className="text-sm text-red-700 dark:text-red-300">Please correct these errors in your file and try importing again.</p>
            </div>

            <div className="space-y-3">
              {importErrors.map((error, index) => (
                <div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-900/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-700">Row {error.row}</Badge>
                    <span className="font-medium text-sm">{error.name} - {error.resource}</span>
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
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700">Close</AlertDialogCancel>
            <Button onClick={() => { setErrorPopupOpen(false); setImportErrors([]) }} className="bg-blue-600 hover:bg-blue-700 text-white">Try Again</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  )
}
