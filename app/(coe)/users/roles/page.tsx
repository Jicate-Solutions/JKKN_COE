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
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Edit, FileSpreadsheet, MoreHorizontal, PlusCircle, RefreshCw, Search, Shield, Trash2, Upload, ChevronDown } from "lucide-react"
import { ProtectedRoute } from "@/components/common/protected-route"

interface Role {
  id: string
  name?: string
  role_name?: string
  role_description?: string
  description?: string
  is_active: boolean
  created_at: string
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)

  const fetchRoles = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/users/roles')
      if (response.ok) {
        const data = await response.json()
        setRoles(data)
      }
    } catch (e) {
      console.error('Failed to fetch roles', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRoles()
  }, [])

  const getRoleName = (r: Role) => r.role_name || r.name || ''
  const getRoleDescription = (r: Role) => r.role_description || r.description || ''

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const filtered = useMemo(() => {
    return roles
      .filter(r => {
        const matches = getRoleName(r).toLowerCase().includes(searchTerm.toLowerCase()) || getRoleDescription(r).toLowerCase().includes(searchTerm.toLowerCase())
        const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && r.is_active) || (statusFilter === 'inactive' && !r.is_active)
        return matches && matchesStatus
      })
      .sort((a, b) => {
        if (!sortColumn) return 0
        let aVal: string | number = ''
        let bVal: string | number = ''
        switch (sortColumn) {
          case 'name':
            aVal = getRoleName(a).toLowerCase()
            bVal = getRoleName(b).toLowerCase()
            break
          case 'created_at':
            aVal = new Date(a.created_at).getTime()
            bVal = new Date(b.created_at).getTime()
            break
          case 'status':
            aVal = a.is_active ? 1 : 0
            bVal = b.is_active ? 1 : 0
            break
          default:
            return 0
        }
        if (sortDirection === 'asc') return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
      })
  }, [roles, searchTerm, statusFilter, sortColumn, sortDirection])

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

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, sortColumn, sortDirection, itemsPerPage])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/users/roles/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setRoles(prev => prev.filter(r => r.id !== id))
      }
    } catch (e) {
      console.error('Delete failed', e)
    }
  }

  const handleDownloadJson = () => {
    const json = JSON.stringify(filtered, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `roles_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleTemplate = () => {
    const sample = [
      {
        Name: 'admin',
        Description: 'Administrator role',
        Active: 'Active'
      }
    ]
    const ws = XLSX.utils.json_to_sheet(sample)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Roles Template')
    XLSX.writeFile(wb, `roles_template_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleExport = () => {
    const rows = filtered.map(r => ({
      Name: getRoleName(r),
      Description: getRoleDescription(r),
      Active: r.is_active ? 'Active' : 'Inactive',
      Created: new Date(r.created_at).toLocaleDateString('en-US')
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Roles')
    XLSX.writeFile(wb, `roles_export_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        let items: { name: string; description?: string; is_active?: boolean }[] = []
        if (file.name.endsWith('.json')) {
          const text = await file.text()
          const parsed = JSON.parse(text) as any[]
          items = parsed.map(p => ({
            name: p.name || p.role_name || p.Name || '',
            description: p.description || p.role_description || p.Description || '',
            is_active: typeof p.is_active === 'boolean' ? p.is_active : (String(p.Active || '').toLowerCase() === 'active')
          }))
        } else if (file.name.endsWith('.csv')) {
          const text = await file.text()
          const [headerLine, ...lines] = text.split(/\r?\n/)
          const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''))
          const nameIdx = headers.findIndex(h => /name/i.test(h))
          const descIdx = headers.findIndex(h => /(description|role_description)/i.test(h))
          const activeIdx = headers.findIndex(h => /(active|is_active)/i.test(h))
          for (const line of lines) {
            if (!line.trim()) continue
            const vals = line.match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/"/g, '').trim()) || []
            items.push({
              name: vals[nameIdx] || '',
              description: vals[descIdx] || '',
              is_active: (vals[activeIdx] || '').toLowerCase() === 'active'
            })
          }
        } else {
          const buf = new Uint8Array(await file.arrayBuffer())
          const wb = XLSX.read(buf, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
          items = data.map(row => ({
            name: String(row['Name'] || row['name'] || row['role_name'] || ''),
            description: String(row['Description'] || row['description'] || row['role_description'] || ''),
            is_active: String(row['Active'] || row['is_active'] || '').toLowerCase() === 'active'
          }))
        }

        let success = 0
        let fail = 0
        for (const item of items) {
          try {
            const res = await fetch('/api/users/roles', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                role_name: item.name,
                name: item.name,
                role_description: item.description,
                description: item.description,
                is_active: item.is_active ?? true
              })
            })
            if (res.ok) success++; else fail++
          } catch {
            fail++
          }
        }

        const refresh = await fetch('/api/users/roles')
        if (refresh.ok) setRoles(await refresh.json())
        alert(`Import completed. Success: ${success}, Failed: ${fail}`)
      } catch (err) {
        console.error('Import error', err)
        alert('Import failed. Please check your file.')
      }
    }
    input.click()
  }

  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const stats = {
    total: roles.length,
    active: roles.filter(r => r.is_active).length,
    inactive: roles.filter(r => !r.is_active).length,
  }

  return (
    <ProtectedRoute requiredRoles={["admin","super_admin"]} requireAnyRole={true}>
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen">
        <AppHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/" className="hover:text-primary">Dashboard</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Roles</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Scorecard Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-shrink-0">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Total Roles</p>
                    <p className="text-xl font-bold">{stats.total}</p>
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
                    <p className="text-xs font-medium text-muted-foreground">Active</p>
                    <p className="text-xl font-bold text-green-600">{stats.active}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <Shield className="h-3 w-3 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Inactive</p>
                    <p className="text-xl font-bold text-red-600">{stats.inactive}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <Shield className="h-3 w-3 text-red-600 dark:text-red-400" />
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
                    <h2 className="text-sm font-semibold">Roles</h2>
                    <p className="text-xs text-muted-foreground">Browse, filter and manage roles</p>
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
                    <Input placeholder="Search roles..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs" />
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs h-8 w-8 p-0" onClick={fetchRoles} disabled={loading}>
                          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refresh</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleTemplate}>
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
                      <DropdownMenuItem onClick={handleDownloadJson}>
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Download JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="sm" className="text-xs px-2 h-8" onClick={handleImport}>
                    <Upload className="h-3 w-3 mr-1" />
                    Upload
                  </Button>
                  <Button size="sm" className="text-xs px-2 h-8" onClick={() => (window.location.href = '/users/roles/add')}>
                    <PlusCircle className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
              <div className="rounded-md border overflow-hidden" style={{ height: '440px' }}>
                <div className="h-full overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
                      <TableRow>
                        <TableHead className="w-[200px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('name')} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Name
                            <span className="ml-1">{!sortColumn || sortColumn !== 'name' ? <ArrowUpDown className="h-3 w-3 text-muted-foreground" /> : (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="w-[100px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('status')} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Status
                            <span className="ml-1">{!sortColumn || sortColumn !== 'status' ? <ArrowUpDown className="h-3 w-3 text-muted-foreground" /> : (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[120px] text-xs">
                          <Button variant="ghost" size="sm" onClick={() => handleSort('created_at')} className="h-auto p-0 font-medium hover:bg-transparent text-xs">
                            Created
                            <span className="ml-1">{!sortColumn || sortColumn !== 'created_at' ? <ArrowUpDown className="h-3 w-3 text-muted-foreground" /> : (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
                          </Button>
                        </TableHead>
                        <TableHead className="w-[80px] text-xs text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-sm">Loading roles...</TableCell>
                        </TableRow>
                      ) : pageItems.length > 0 ? (
                        pageItems.map(role => (
                          <TableRow key={role.id}>
                            <TableCell className="font-medium text-sm">{getRoleName(role)}</TableCell>
                            <TableCell className="text-sm">{getRoleDescription(role)}</TableCell>
                            <TableCell>
                              <Badge variant={role.is_active ? 'default' : 'secondary'} className="text-xs">{role.is_active ? 'Active' : 'Inactive'}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(role.created_at)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36">
                                    <DropdownMenuItem onClick={() => (window.location.href = `/users/roles/edit/${role.id}`)}>
                                      <Edit className="h-3.5 w-3.5 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
                                      onClick={() => setDeleteTarget(role)}
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
                          <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                            <div className="flex flex-col items-center gap-2">
                              <Shield className="h-8 w-8 text-muted-foreground" />
                              No roles found.
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
                    Showing {filtered.length === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, filtered.length)} of {filtered.length} roles
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
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="h-7 px-2 text-xs">
                    <ChevronLeft className="h-3 w-3 mr-1" />
                    Previous
                  </Button>
                  <div className="text-xs text-muted-foreground px-2">Page {currentPage} of {totalPages || 1}</div>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages} className="h-7 px-2 text-xs">
                    Next
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>

    {/* Standalone Delete Dialog */}
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Role</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{deleteTarget ? getRoleName(deleteTarget) : ''}</strong>? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { if (deleteTarget) { handleDelete(deleteTarget.id); setDeleteTarget(null) } }}
            className="bg-red-600 hover:bg-red-700"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </ProtectedRoute>
  )
}
