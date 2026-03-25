# Pages Coding Structure Documentation

## Table of Contents
1. [Overview](#overview)
2. [Page Types](#page-types)
3. [Standard Page Structure](#standard-page-structure)
4. [Index/List Page Template](#indexlist-page-template)
5. [Add Page Template](#add-page-template)
6. [Edit Page Template](#edit-page-template)
7. [View Page Template](#view-page-template)
8. [Code Patterns](#code-patterns)
9. [Premium Design Standards](#premium-design-standards)
10. [Best Practices](#best-practices)

---

## Overview

This document defines the standard coding structure for all CRUD pages in the JKKN COE application. Following these patterns ensures consistency, maintainability, and adherence to the Premium SaaS design system.

### Purpose
- Provide developers with clear templates for creating new pages
- Ensure consistent UI/UX across all modules
- Maintain code quality and architectural standards
- Accelerate development with reusable patterns

### Principles
1. **Consistency**: All pages follow the same structure and naming conventions
2. **Modularity**: Separate concerns (state, validation, API calls, UI)
3. **Reusability**: Extract common patterns into utilities and components
4. **Accessibility**: Follow WCAG 2.1 Level AA standards
5. **Responsiveness**: Mobile-first design with Tailwind CSS

---

## Page Types

### 1. Index/List Page (`page.tsx`)
**Purpose**: Display data in table format with filtering, search, pagination, and bulk operations.

**Key Features**:
- Data table with sorting and pagination
- Search and filter functionality
- Statistics dashboard
- Bulk import/export (Excel, CSV, JSON)
- CRUD action buttons (View, Edit, Delete)
- Responsive design with mobile cards

**Route**: `/[module]/[entity]/page.tsx`

---

### 2. Add Page (`add/page.tsx`)
**Purpose**: Create new entity records with comprehensive form validation.

**Key Features**:
- Multi-section form layout
- Client-side validation with real-time feedback
- Foreign key auto-mapping
- Success/error toast notifications
- Cancel/Reset/Submit actions

**Route**: `/[module]/[entity]/add/page.tsx`

---

### 3. Edit Page (`edit/[id]/page.tsx`)
**Purpose**: Update existing entity records.

**Key Features**:
- Pre-filled form with fetched data
- Loading states during data fetch
- Not found/error handling
- Same validation as Add page
- Update confirmation

**Route**: `/[module]/[entity]/edit/[id]/page.tsx`

---

### 4. View Page (`view/[id]/page.tsx`)
**Purpose**: Display entity details in read-only mode.

**Key Features**:
- Read-only form (disabled inputs)
- Status badges and formatted data
- Loading states
- Edit/Back navigation buttons
- Print-friendly layout

**Route**: `/[module]/[entity]/view/[id]/page.tsx`

---

## Standard Page Structure

### File Header Template

```typescript
'use client'

// 1. React and Next.js imports
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

// 2. UI Component imports (grouped by source)
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'

// 3. Icon imports
import {
  ArrowLeft,
  Save,
  X,
  Building2,
  Mail,
  Phone,
  MapPin,
  // ... other icons
} from 'lucide-react'

// 4. Type imports
import type { EntityFormData, Entity } from '@/types/[module]/[entity]'

// 5. Service/Utility imports
import { createEntity, updateEntity, fetchEntity } from '@/services/[module]/[entity]-service'
import { validateEntityData } from '@/lib/utils/[entity]-validation'

// 6. Component imports
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
```

### Component Structure Template

```typescript
export default function EntityPage() {
  // 1. Hooks (router, params, toast)
  const router = useRouter()
  const { toast } = useToast()
  const params = useParams() // For Edit/View pages

  // 2. State declarations (grouped by purpose)
  // Form state
  const [formData, setFormData] = useState<EntityFormData>({ /* initial values */ })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // UI state
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)

  // 3. Effects
  useEffect(() => {
    // Data fetching, initialization
  }, [])

  // 4. Validation functions
  const validate = () => {
    // Validation logic
  }

  // 5. Form handlers
  const handleSubmit = async () => {
    // Submit logic
  }

  const handleReset = () => {
    // Reset logic
  }

  // 6. Loading/Error states JSX
  if (loading) return <div>Loading...</div>
  if (notFound) return <div>Not Found</div>

  // 7. Main render
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 overflow-auto">
        {/* Page content */}
      </div>
    </SidebarProvider>
  )
}
```

---

## Index/List Page Template

### Complete Structure

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/common/use-toast'
import {
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  Download,
  Upload,
  FileText,
  Filter,
  ChevronLeft,
  ChevronRight,
  Building2 // Entity icon
} from 'lucide-react'
import type { Entity } from '@/types/[module]/[entity]'
import { fetchEntities, deleteEntity } from '@/services/[module]/[entity]-service'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { PremiumEntityStats } from '@/components/stats/premium-entity-stats'

export default function EntityIndexPage() {
  const router = useRouter()
  const { toast } = useToast()

  // Data state
  const [items, setItems] = useState<Entity[]>([])
  const [filteredItems, setFilteredItems] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)

  // Filter/Search state
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Statistics state
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    newThisMonth: 0
  })

  // Fetch data
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await fetchEntities()
      setItems(data)
      setFilteredItems(data)
      calculateStats(data)
    } catch (error) {
      toast({
        title: '❌ Error',
        description: 'Failed to load data',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // Calculate statistics
  const calculateStats = (data: Entity[]) => {
    const total = data.length
    const active = data.filter(item => item.is_active).length
    const inactive = total - active

    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const newThisMonth = data.filter(
      item => new Date(item.created_at) >= firstDayOfMonth
    ).length

    setStats({ total, active, inactive, newThisMonth })
  }

  // Filter and search
  useEffect(() => {
    let filtered = items

    // Status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter(item => item.is_active)
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(item => !item.is_active)
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.entity_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.entity_name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredItems(filtered)
    setCurrentPage(1) // Reset to first page
  }, [searchTerm, statusFilter, items])

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentItems = filteredItems.slice(startIndex, endIndex)

  // Delete handler
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return

    try {
      await deleteEntity(id)

      toast({
        title: '✅ Deleted',
        description: `${name} has been deleted successfully.`,
        className: 'bg-green-50 border-green-200 text-green-800'
      })

      loadData() // Reload data
    } catch (error) {
      toast({
        title: '❌ Delete Failed',
        description: 'Failed to delete record',
        variant: 'destructive'
      })
    }
  }

  // Export handlers
  const handleExportJSON = () => {
    const dataStr = JSON.stringify(filteredItems, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `entities_${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 space-y-8">

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 font-grotesk">
                Entity Management
              </h1>
              <p className="text-slate-600 mt-2">
                Manage and organize your entities
              </p>
            </div>
            <Link href="/[module]/[entity]/add">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 px-6 shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                Add New Entity
              </Button>
            </Link>
          </div>

          {/* Statistics Dashboard */}
          <PremiumEntityStats stats={stats} />

          {/* Filters and Search */}
          <Card className="border-slate-200 shadow-sm rounded-2xl">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Filter className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-xl font-grotesk">Filters & Search</CardTitle>
                  <CardDescription>Filter and search entities</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Search */}
                <div className="space-y-2">
                  <Label>Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by code or name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-11 rounded-lg border-slate-300"
                    />
                  </div>
                </div>

                {/* Status Filter */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 rounded-lg border-slate-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active Only</SelectItem>
                      <SelectItem value="inactive">Inactive Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Export Buttons */}
                <div className="space-y-2">
                  <Label>Export Data</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleExportJSON}
                      className="flex-1 h-11 rounded-lg border-slate-300"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      JSON
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-11 rounded-lg border-slate-300"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Excel
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card className="border-slate-200 shadow-sm rounded-2xl">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-grotesk">
                      All Entities ({filteredItems.length})
                    </CardTitle>
                    <CardDescription>
                      View and manage entity records
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-slate-500">
                  Loading...
                </div>
              ) : currentItems.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No entities found
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left p-4 font-semibold text-slate-700">Code</th>
                          <th className="text-left p-4 font-semibold text-slate-700">Name</th>
                          <th className="text-left p-4 font-semibold text-slate-700">Status</th>
                          <th className="text-left p-4 font-semibold text-slate-700">Created</th>
                          <th className="text-center p-4 font-semibold text-slate-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentItems.map((item) => (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/50 transition-colors"
                          >
                            <td className="p-4">
                              <span className="font-mono text-sm font-medium text-slate-900">
                                {item.entity_code}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className="font-medium text-slate-900">
                                {item.entity_name}
                              </span>
                            </td>
                            <td className="p-4">
                              <Badge
                                variant={item.is_active ? 'default' : 'secondary'}
                                className={
                                  item.is_active
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }
                              >
                                {item.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td className="p-4 text-sm text-slate-600">
                              {new Date(item.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-2">
                                <Link href={`/[module]/[entity]/view/${item.id}`}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Link href={`/[module]/[entity]/edit/${item.id}`}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-colors"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(item.id, item.entity_name)}
                                  className="h-8 w-8 p-0 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {currentItems.map((item) => (
                      <div key={item.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-mono text-sm font-medium text-slate-900">
                              {item.entity_code}
                            </p>
                            <p className="font-medium text-slate-900 mt-1">
                              {item.entity_name}
                            </p>
                          </div>
                          <Badge
                            variant={item.is_active ? 'default' : 'secondary'}
                            className={
                              item.is_active
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }
                          >
                            {item.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/[module]/[entity]/view/${item.id}`} className="flex-1">
                            <Button variant="outline" size="sm" className="w-full">
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          </Link>
                          <Link href={`/[module]/[entity]/edit/${item.id}`} className="flex-1">
                            <Button variant="outline" size="sm" className="w-full">
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-600">
                          Showing {startIndex + 1} to {Math.min(endIndex, filteredItems.length)} of{' '}
                          {filteredItems.length} results
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="h-9 rounded-lg"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                              <Button
                                key={page}
                                variant={currentPage === page ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setCurrentPage(page)}
                                className={
                                  currentPage === page
                                    ? 'h-9 w-9 rounded-lg bg-emerald-600 hover:bg-emerald-700'
                                    : 'h-9 w-9 rounded-lg'
                                }
                              >
                                {page}
                              </Button>
                            ))}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="h-9 rounded-lg"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SidebarProvider>
  )
}
```

---

## Add Page Template

### Complete Structure

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/common/use-toast'
import {
  ArrowLeft,
  Save,
  X,
  Building2,
  Info,
  Settings,
  // ... other icons
} from 'lucide-react'
import type { EntityFormData } from '@/types/[module]/[entity]'
import { createEntity } from '@/services/[module]/[entity]-service'
import { validateEntityData } from '@/lib/utils/[entity]-validation'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

export default function AddEntityPage() {
  const router = useRouter()
  const { toast } = useToast()

  // Form state
  const [formData, setFormData] = useState<EntityFormData>({
    entity_code: '',
    entity_name: '',
    description: '',
    is_active: true,
    // ... other fields with default values
  })

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Validation
  const validate = (): boolean => {
    const e: Record<string, string> = {}

    // Required field validation
    if (!formData.entity_code.trim()) {
      e.entity_code = 'Entity code is required'
    }

    if (!formData.entity_name.trim()) {
      e.entity_name = 'Entity name is required'
    }

    // Format validation
    if (formData.entity_code && !/^[A-Za-z0-9\-_]+$/.test(formData.entity_code)) {
      e.entity_code = 'Entity code can only contain letters, numbers, hyphens, and underscores'
    }

    // Length validation
    if (formData.entity_code && formData.entity_code.length > 50) {
      e.entity_code = 'Entity code must not exceed 50 characters'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Submit handler
  const handleSubmit = async () => {
    if (!validate()) {
      toast({
        title: '⚠️ Validation Error',
        description: 'Please fix all validation errors before submitting.',
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800'
      })
      return
    }

    try {
      setSaving(true)

      const created = await createEntity(formData)

      toast({
        title: '✅ Entity Created',
        description: `${created.entity_name} has been created successfully.`,
        className: 'bg-green-50 border-green-200 text-green-800'
      })

      router.push('/[module]/[entity]')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create entity'

      toast({
        title: '❌ Creation Failed',
        description: errorMessage,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800'
      })
    } finally {
      setSaving(false)
    }
  }

  // Reset handler
  const handleReset = () => {
    setFormData({
      entity_code: '',
      entity_name: '',
      description: '',
      is_active: true,
    })
    setErrors({})
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 max-w-5xl space-y-8">

          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/[module]/[entity]">
                <Button variant="ghost" size="icon" className="rounded-lg">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-4xl font-bold text-slate-900 font-grotesk">
                  Add New Entity
                </h1>
                <p className="text-slate-600 mt-1">
                  Create a new entity record
                </p>
              </div>
            </div>
          </div>

          {/* Form Sections */}
          <div className="space-y-5">

            {/* Basic Information Section */}
            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Info className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-grotesk bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                      Basic Information
                    </CardTitle>
                    <CardDescription className="text-slate-600">
                      Enter the basic details of the entity
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 bg-white space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Entity Code */}
                  <div className="space-y-2">
                    <Label htmlFor="entity_code" className="text-slate-700 font-medium">
                      Entity Code <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="entity_code"
                      value={formData.entity_code}
                      onChange={(e) => setFormData({ ...formData, entity_code: e.target.value })}
                      placeholder="e.g., ENT001"
                      className={`h-11 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20 ${
                        errors.entity_code ? 'border-red-500' : ''
                      }`}
                    />
                    {errors.entity_code && (
                      <p className="text-sm text-red-500">{errors.entity_code}</p>
                    )}
                  </div>

                  {/* Entity Name */}
                  <div className="space-y-2">
                    <Label htmlFor="entity_name" className="text-slate-700 font-medium">
                      Entity Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="entity_name"
                      value={formData.entity_name}
                      onChange={(e) => setFormData({ ...formData, entity_name: e.target.value })}
                      placeholder="Enter entity name"
                      className={`h-11 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20 ${
                        errors.entity_name ? 'border-red-500' : ''
                      }`}
                    />
                    {errors.entity_name && (
                      <p className="text-sm text-red-500">{errors.entity_name}</p>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-slate-700 font-medium">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter description (optional)"
                    rows={3}
                    className="rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Status Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div>
                    <Label htmlFor="is_active" className="text-slate-700 font-medium">
                      Active Status
                    </Label>
                    <p className="text-sm text-slate-500 mt-1">
                      Enable or disable this entity
                    </p>
                  </div>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Additional Sections... */}

          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-white p-4 border-t border-slate-200 rounded-lg shadow-sm">
            <Link href="/[module]/[entity]">
              <Button
                variant="outline"
                className="h-11 px-6 rounded-xl border-slate-300 hover:bg-slate-50"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={handleReset}
              className="h-11 px-6 rounded-xl border-slate-300 hover:bg-slate-50"
            >
              Reset
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Entity'}
            </Button>
          </div>
        </div>
      </div>
    </SidebarProvider>
  )
}
```

---

## Edit Page Template

### Complete Structure

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/common/use-toast'
import { ArrowLeft, Save, X, Info } from 'lucide-react'
import type { Entity, EntityFormData } from '@/types/[module]/[entity]'
import { fetchEntity, updateEntity } from '@/services/[module]/[entity]-service'
import { validateEntityData } from '@/lib/utils/[entity]-validation'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

export default function EditEntityPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()

  // Form state
  const [formData, setFormData] = useState<EntityFormData>({
    entity_code: '',
    entity_name: '',
    description: '',
    is_active: true,
  })

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)

  // Fetch entity data
  useEffect(() => {
    const loadEntity = async () => {
      try {
        setLoading(true)
        const entity = await fetchEntity(params.id as string)

        setFormData({
          entity_code: entity.entity_code,
          entity_name: entity.entity_name,
          description: entity.description || '',
          is_active: entity.is_active,
        })
      } catch (error) {
        setNotFound(true)
        toast({
          title: '❌ Error',
          description: 'Entity not found',
          variant: 'destructive'
        })
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      loadEntity()
    }
  }, [params.id, toast])

  // Validation
  const validate = (): boolean => {
    const e: Record<string, string> = {}

    if (!formData.entity_code.trim()) {
      e.entity_code = 'Entity code is required'
    }

    if (!formData.entity_name.trim()) {
      e.entity_name = 'Entity name is required'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Submit handler
  const handleSubmit = async () => {
    if (!validate()) {
      toast({
        title: '⚠️ Validation Error',
        description: 'Please fix all validation errors before submitting.',
        variant: 'destructive'
      })
      return
    }

    try {
      setSaving(true)

      await updateEntity(params.id as string, formData)

      toast({
        title: '✅ Entity Updated',
        description: `${formData.entity_name} has been updated successfully.`,
        className: 'bg-green-50 border-green-200 text-green-800'
      })

      router.push('/[module]/[entity]')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update entity'

      toast({
        title: '❌ Update Failed',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <div className="flex-1 overflow-auto">
          <div className="container mx-auto p-6">
            <div className="text-center py-12">
              <p className="text-slate-500">Loading...</p>
            </div>
          </div>
        </div>
      </SidebarProvider>
    )
  }

  // Not found state
  if (notFound) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <div className="flex-1 overflow-auto">
          <div className="container mx-auto p-6">
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Entity Not Found</h2>
              <p className="text-slate-500 mb-4">The entity you're looking for doesn't exist.</p>
              <Link href="/[module]/[entity]">
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  Back to List
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </SidebarProvider>
    )
  }

  // Main render (same structure as Add page, with pre-filled values)
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 max-w-5xl space-y-8">

          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/[module]/[entity]">
                <Button variant="ghost" size="icon" className="rounded-lg">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-4xl font-bold text-slate-900 font-grotesk">
                  Edit Entity
                </h1>
                <p className="text-slate-600 mt-1">
                  Update entity information
                </p>
              </div>
            </div>
          </div>

          {/* Form sections (same as Add page) */}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 sticky bottom-0 bg-white p-4 border-t border-slate-200 rounded-lg shadow-sm">
            <Link href="/[module]/[entity]">
              <Button
                variant="outline"
                className="h-11 px-6 rounded-xl border-slate-300 hover:bg-slate-50"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </Link>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Updating...' : 'Update Entity'}
            </Button>
          </div>
        </div>
      </div>
    </SidebarProvider>
  )
}
```

---

## View Page Template

### Complete Structure

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import { ArrowLeft, Edit, Info } from 'lucide-react'
import type { Entity } from '@/types/[module]/[entity]'
import { fetchEntity } from '@/services/[module]/[entity]-service'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

export default function ViewEntityPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()

  // State
  const [entity, setEntity] = useState<Entity | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Fetch entity data
  useEffect(() => {
    const loadEntity = async () => {
      try {
        setLoading(true)
        const data = await fetchEntity(params.id as string)
        setEntity(data)
      } catch (error) {
        setNotFound(true)
        toast({
          title: '❌ Error',
          description: 'Entity not found',
          variant: 'destructive'
        })
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      loadEntity()
    }
  }, [params.id, toast])

  // Loading state
  if (loading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <div className="flex-1 overflow-auto">
          <div className="container mx-auto p-6">
            <div className="text-center py-12">
              <p className="text-slate-500">Loading...</p>
            </div>
          </div>
        </div>
      </SidebarProvider>
    )
  }

  // Not found state
  if (notFound || !entity) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <div className="flex-1 overflow-auto">
          <div className="container mx-auto p-6">
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Entity Not Found</h2>
              <p className="text-slate-500 mb-4">The entity you're looking for doesn't exist.</p>
              <Link href="/[module]/[entity]">
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  Back to List
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 max-w-5xl space-y-8">

          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/[module]/[entity]">
                <Button variant="ghost" size="icon" className="rounded-lg">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-4xl font-bold text-slate-900 font-grotesk">
                  {entity.entity_name}
                </h1>
                <p className="text-slate-600 mt-1">
                  View entity details
                </p>
              </div>
            </div>
            <Link href={`/[module]/[entity]/edit/${entity.id}`}>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 px-6">
                <Edit className="h-4 w-4 mr-2" />
                Edit Entity
              </Button>
            </Link>
          </div>

          {/* Information Sections */}
          <div className="space-y-5">

            {/* Basic Information */}
            <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Info className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-grotesk bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                      Basic Information
                    </CardTitle>
                    <CardDescription className="text-slate-600">
                      Entity details and status
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 bg-white space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Entity Code */}
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-medium">
                      Entity Code
                    </Label>
                    <Input
                      value={entity.entity_code}
                      disabled
                      className="h-11 rounded-lg bg-slate-100 border-slate-300 cursor-not-allowed"
                    />
                  </div>

                  {/* Entity Name */}
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-medium">
                      Entity Name
                    </Label>
                    <Input
                      value={entity.entity_name}
                      disabled
                      className="h-11 rounded-lg bg-slate-100 border-slate-300 cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Status Badge */}
                <div className="space-y-2">
                  <Label className="text-slate-700 font-medium">
                    Status
                  </Label>
                  <div>
                    <Badge
                      variant={entity.is_active ? 'default' : 'secondary'}
                      className={
                        entity.is_active
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }
                    >
                      {entity.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-medium">
                      Created At
                    </Label>
                    <Input
                      value={new Date(entity.created_at).toLocaleString()}
                      disabled
                      className="h-11 rounded-lg bg-slate-100 border-slate-300 cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-medium">
                      Last Updated
                    </Label>
                    <Input
                      value={new Date(entity.updated_at).toLocaleString()}
                      disabled
                      className="h-11 rounded-lg bg-slate-100 border-slate-300 cursor-not-allowed"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Additional sections... */}

          </div>
        </div>
      </div>
    </SidebarProvider>
  )
}
```

---

## Code Patterns

### 1. State Management Pattern

```typescript
// Group related state together
// Form state
const [formData, setFormData] = useState<EntityFormData>({ /* ... */ })
const [errors, setErrors] = useState<Record<string, string>>({})

// UI state
const [loading, setLoading] = useState(false)
const [saving, setSaving] = useState(false)
const [notFound, setNotFound] = useState(false)

// Filter/Search state
const [searchTerm, setSearchTerm] = useState('')
const [statusFilter, setStatusFilter] = useState<string>('all')
```

### 2. Validation Pattern

```typescript
const validate = (): boolean => {
  const e: Record<string, string> = {}

  // Required field validation
  if (!formData.field.trim()) {
    e.field = 'Field is required'
  }

  // Format validation
  if (formData.field && !/regex/.test(formData.field)) {
    e.field = 'Invalid format'
  }

  // Length validation
  if (formData.field && formData.field.length > 50) {
    e.field = 'Must not exceed 50 characters'
  }

  // Conditional validation
  if (formData.condition && !formData.dependentField) {
    e.dependentField = 'Required when condition is true'
  }

  setErrors(e)
  return Object.keys(e).length === 0
}
```

### 3. Error Handling Pattern

```typescript
try {
  setSaving(true)

  const result = await apiCall(data)

  toast({
    title: '✅ Success',
    description: 'Operation completed successfully',
    className: 'bg-green-50 border-green-200 text-green-800'
  })

  router.push('/next-page')
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Operation failed'

  toast({
    title: '❌ Error',
    description: errorMessage,
    variant: 'destructive',
    className: 'bg-red-50 border-red-200 text-red-800'
  })
} finally {
  setSaving(false)
}
```

### 4. Data Fetching Pattern

```typescript
useEffect(() => {
  const loadData = async () => {
    try {
      setLoading(true)
      const data = await fetchEntity(id)
      setEntity(data)
    } catch (error) {
      setNotFound(true)
      toast({
        title: '❌ Error',
        description: 'Entity not found',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  if (id) {
    loadData()
  }
}, [id])
```

### 5. Filter/Search Pattern

```typescript
useEffect(() => {
  let filtered = items

  // Status filter
  if (statusFilter === 'active') {
    filtered = filtered.filter(item => item.is_active)
  } else if (statusFilter === 'inactive') {
    filtered = filtered.filter(item => !item.is_active)
  }

  // Search filter
  if (searchTerm) {
    filtered = filtered.filter(item =>
      item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }

  setFilteredItems(filtered)
  setCurrentPage(1) // Reset pagination
}, [searchTerm, statusFilter, items])
```

### 6. Pagination Pattern

```typescript
const itemsPerPage = 10
const [currentPage, setCurrentPage] = useState(1)

const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
const startIndex = (currentPage - 1) * itemsPerPage
const endIndex = startIndex + itemsPerPage
const currentItems = filteredItems.slice(startIndex, endIndex)

// Pagination UI
<div className="flex gap-2">
  <Button
    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
    disabled={currentPage === 1}
  >
    Previous
  </Button>
  <Button
    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
    disabled={currentPage === totalPages}
  >
    Next
  </Button>
</div>
```

---

## Premium Design Standards

### 1. Typography

```typescript
// Page Titles
<h1 className="text-4xl font-bold text-slate-900 font-grotesk">
  Page Title
</h1>

// Section Titles
<CardTitle className="text-xl font-grotesk bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
  Section Title
</CardTitle>

// Body Text
<p className="text-slate-600">
  Body text content
</p>

// Labels
<Label className="text-slate-700 font-medium">
  Field Label
</Label>
```

### 2. Color Palette

```typescript
// Primary (Emerald)
bg-emerald-600 hover:bg-emerald-700  // Buttons
text-emerald-600                     // Icons, accents
border-emerald-200                   // Borders
bg-emerald-50                        // Backgrounds
bg-emerald-100                       // Badges

// Neutral (Slate)
bg-slate-50                          // Light backgrounds
bg-slate-100                         // Disabled inputs
text-slate-900                       // Dark text
text-slate-600                       // Medium text
text-slate-500                       // Light text
border-slate-200                     // Borders

// Status Colors
bg-green-50 border-green-200 text-green-800    // Success
bg-red-50 border-red-200 text-red-800          // Error
bg-yellow-50 border-yellow-200 text-yellow-800 // Warning
bg-blue-50 border-blue-200 text-blue-800       // Info
```

### 3. Spacing System

```typescript
// Major sections (between cards)
<div className="space-y-8">

// Section content (within cards)
<div className="space-y-5">

// Field groups
<div className="space-y-2">

// Grid gaps
<div className="gap-4">  // Form fields
<div className="gap-3">  // Buttons
<div className="gap-2">  // Icons with text
```

### 4. Border Radius

```typescript
// Cards
className="rounded-2xl"

// Buttons, inputs, sections
className="rounded-xl"

// Small elements (badges, icons)
className="rounded-lg"

// Tiny elements
className="rounded-md"
```

### 5. Component Heights

```typescript
// Inputs, buttons
className="h-11"

// Small buttons
className="h-9"

// Icon buttons
className="h-8 w-8"

// Icon containers
className="h-10 w-10"
```

### 6. Shadows

```typescript
// Cards
className="shadow-sm"

// Hover states
className="hover:shadow-md"

// Sticky elements
className="shadow-sm"
```

### 7. Card Header Pattern

```typescript
<CardHeader className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 pb-4">
  <div className="flex items-center gap-3">
    <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
      <Icon className="h-5 w-5 text-emerald-600" />
    </div>
    <div>
      <CardTitle className="text-xl font-grotesk bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
        Section Title
      </CardTitle>
      <CardDescription className="text-slate-600">
        Section description
      </CardDescription>
    </div>
  </div>
</CardHeader>
```

### 8. Input Field Pattern

```typescript
<div className="space-y-2">
  <Label htmlFor="field_name" className="text-slate-700 font-medium">
    Field Label <span className="text-red-500">*</span>
  </Label>
  <Input
    id="field_name"
    value={formData.field_name}
    onChange={(e) => setFormData({ ...formData, field_name: e.target.value })}
    placeholder="Enter value"
    className={`h-11 rounded-lg border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20 ${
      errors.field_name ? 'border-red-500' : ''
    }`}
  />
  {errors.field_name && (
    <p className="text-sm text-red-500">{errors.field_name}</p>
  )}
</div>
```

### 9. Button Patterns

```typescript
// Primary Button
<Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11 px-6 shadow-sm">
  <Icon className="h-4 w-4 mr-2" />
  Button Text
</Button>

// Secondary Button
<Button variant="outline" className="h-11 px-6 rounded-xl border-slate-300 hover:bg-slate-50">
  Button Text
</Button>

// Icon Button
<Button variant="ghost" size="icon" className="h-8 w-8 p-0 rounded-lg hover:bg-blue-100 text-blue-600">
  <Icon className="h-4 w-4" />
</Button>
```

### 10. Badge Pattern

```typescript
<Badge
  variant={isActive ? 'default' : 'secondary'}
  className={
    isActive
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : 'bg-slate-100 text-slate-600 border-slate-200'
  }
>
  {isActive ? 'Active' : 'Inactive'}
</Badge>
```

---

## Best Practices

### 1. Code Organization

✅ **DO**:
- Group related state variables together
- Place hooks at the top of the component
- Keep validation logic in separate functions
- Extract reusable logic into utilities
- Use meaningful variable names

❌ **DON'T**:
- Mix unrelated state declarations
- Place hooks inside conditions or loops
- Inline complex validation logic
- Repeat code across components
- Use abbreviations or unclear names

### 2. Type Safety

✅ **DO**:
- Define interfaces for all data structures
- Use strict TypeScript types
- Avoid `any` type unless absolutely necessary
- Type function parameters and returns
- Use proper generic types

❌ **DON'T**:
- Use `any` everywhere
- Skip type annotations
- Use type assertions unnecessarily
- Ignore TypeScript errors

### 3. Error Handling

✅ **DO**:
- Always wrap async operations in try-catch
- Provide user-friendly error messages
- Log errors to console for debugging
- Handle loading states properly
- Show appropriate error UI

❌ **DON'T**:
- Ignore errors silently
- Show technical error messages to users
- Skip error logging
- Leave loading states stuck
- Crash the app on errors

### 4. Validation

✅ **DO**:
- Validate all required fields
- Check field formats (email, phone, etc.)
- Validate field lengths
- Provide clear error messages
- Clear errors when fields are corrected

❌ **DON'T**:
- Skip validation
- Show generic error messages
- Validate only on submit
- Keep old errors after correction

### 5. Accessibility

✅ **DO**:
- Use semantic HTML elements
- Provide proper labels for inputs
- Include ARIA attributes where needed
- Ensure keyboard navigation works
- Maintain sufficient color contrast

❌ **DON'T**:
- Use divs for everything
- Skip labels on form fields
- Ignore keyboard users
- Use low-contrast colors

### 6. Performance

✅ **DO**:
- Use proper dependency arrays in useEffect
- Memoize expensive calculations
- Implement pagination for large datasets
- Debounce search inputs
- Lazy load components when possible

❌ **DON'T**:
- Omit dependency arrays
- Recalculate on every render
- Load all data at once
- Trigger searches on every keystroke
- Load everything upfront

### 7. Consistency

✅ **DO**:
- Follow the established patterns
- Use the same spacing system
- Apply consistent colors
- Keep button styles uniform
- Maintain naming conventions

❌ **DON'T**:
- Invent new patterns for each page
- Use random spacing values
- Mix color schemes
- Style buttons differently
- Use inconsistent naming

### 8. User Experience

✅ **DO**:
- Show loading states
- Provide feedback on actions
- Confirm destructive operations
- Auto-save when appropriate
- Make errors recoverable

❌ **DON'T**:
- Leave users waiting without feedback
- Perform actions silently
- Delete without confirmation
- Lose user input on errors
- Make errors unrecoverable

---

## Quick Reference Checklist

### For Every Page

- [ ] `'use client'` directive at the top
- [ ] Proper imports grouped by source
- [ ] TypeScript interfaces for all data
- [ ] State grouped by purpose
- [ ] Loading/error states handled
- [ ] Form validation implemented
- [ ] Error handling in try-catch blocks
- [ ] User feedback via toast notifications
- [ ] Premium design styles applied
- [ ] Mobile-responsive layout
- [ ] Accessibility attributes included
- [ ] Proper spacing (space-y-8/5/2)
- [ ] Consistent colors (emerald primary)
- [ ] Font classes (font-grotesk for headings)
- [ ] Proper input heights (h-11)
- [ ] Rounded corners (rounded-2xl/xl/lg)

### For Index/List Pages

- [ ] Statistics dashboard
- [ ] Search functionality
- [ ] Filter by status
- [ ] Pagination implemented
- [ ] Export functionality (JSON/Excel)
- [ ] Import functionality with validation
- [ ] Action buttons (View/Edit/Delete)
- [ ] Delete confirmation dialog
- [ ] Mobile card view
- [ ] Desktop table view

### For Add/Edit Pages

- [ ] Multi-section layout
- [ ] Validation on all required fields
- [ ] Error messages displayed inline
- [ ] Cancel/Reset/Submit buttons
- [ ] Success/error toast notifications
- [ ] Loading state during save
- [ ] Redirect after successful save
- [ ] Field-level error styling

### For View Pages

- [ ] Read-only inputs (disabled)
- [ ] Status badges
- [ ] Formatted timestamps
- [ ] Edit button navigation
- [ ] Back button navigation
- [ ] Loading state
- [ ] Not found handling

---

## Conclusion

This documentation provides comprehensive templates and patterns for creating consistent, high-quality CRUD pages in the JKKN COE application. By following these standards, developers can:

1. **Accelerate Development**: Reuse proven templates and patterns
2. **Ensure Consistency**: Maintain uniform UI/UX across all modules
3. **Improve Quality**: Follow best practices for code organization and error handling
4. **Enhance Maintainability**: Use standardized structures that are easy to understand and modify
5. **Meet Design Standards**: Apply the Premium SaaS design system correctly

Always refer to this document when creating new pages or updating existing ones to ensure adherence to project standards.

---

**Last Updated**: 2025-11-16
**Version**: 1.0.0
**Maintained By**: JKKN COE Development Team
