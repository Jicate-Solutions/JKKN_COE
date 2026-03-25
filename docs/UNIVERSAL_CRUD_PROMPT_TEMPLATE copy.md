# Universal CRUD Page Generator Template

This document provides a comprehensive prompt template for generating fully-featured CRUD pages in the JKKN COE application. Use this template by filling in the entity-specific placeholders to generate both frontend pages and backend API routes.

## Reference Implementation

**Complete working examples:**
- Frontend: [app/(coe)/master/degrees/page.tsx](../app/(coe)/master/degrees/page.tsx)
- Backend API: [app/api/master/degrees/route.ts](../app/api/master/degrees/route.ts)

---

## Prompt Template

```
Create a complete CRUD page for managing [ENTITY_NAME_PLURAL] in the JKKN COE application.

## Entity Details

**Entity Name (Singular):** [ENTITY_NAME]
**Entity Name (Plural):** [ENTITY_NAME_PLURAL]
**Database Table:** [TABLE_NAME]
**API Route:** /api/[API_ROUTE]
**Page Route:** /[PAGE_ROUTE]

## Database Schema

**Table Structure:**
```sql
CREATE TABLE [TABLE_NAME] (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  [FIELD_1] [TYPE_1] [CONSTRAINTS_1],
  [FIELD_2] [TYPE_2] [CONSTRAINTS_2],
  [FIELD_3] [TYPE_3] [CONSTRAINTS_3],
  -- Add all fields here
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Foreign Key Relationships:**
- [FK_FIELD_1] references [PARENT_TABLE_1]([PARENT_FIELD_1])
- [FK_FIELD_2] references [PARENT_TABLE_2]([PARENT_FIELD_2])

**Required Fields (marked with *):**
- [REQUIRED_FIELD_1]*
- [REQUIRED_FIELD_2]*
- [REQUIRED_FIELD_3]*

**Optional Fields:**
- [OPTIONAL_FIELD_1]
- [OPTIONAL_FIELD_2]

## Frontend Implementation Requirements

### 1. TypeScript Interface

```typescript
interface [ENTITY_NAME] {
  id: string
  [field_1]: [type_1]
  [field_2]: [type_2]
  // ... all fields
  is_active: boolean
  created_at: string
}
```

### 2. Component Structure

**File Location:** `app/(coe)/[DOMAIN]/[PAGE_ROUTE]/page.tsx`
- Use appropriate domain folder: `master/`, `course-management/`, `exam-management/`, `grading/`, `users/`, or `utilities/`
- Example: `app/(coe)/master/institutions/page.tsx` for institutions page

**Required Imports:**
```typescript
"use client"

import { useMemo, useState, useEffect } from "react"
import * as XLSX from "xlsx"
import supabaseAuthService from "@/lib/auth/supabase-auth-service"
import { AppSidebar } from "@/components/app-sidebar"
import { AppHeader } from "@/components/app-header"
import { AppFooter } from "@/components/app-footer"
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
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, [ICON_NAME], TrendingUp, FileSpreadsheet, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react"
```

### 3. State Management

```typescript
const [items, setItems] = useState<[ENTITY_NAME][]>([])
const [loading, setLoading] = useState(true)
const [searchTerm, setSearchTerm] = useState("")
const [sortColumn, setSortColumn] = useState<string | null>(null)
const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
const [currentPage, setCurrentPage] = useState(1)
const itemsPerPage = 10

const [sheetOpen, setSheetOpen] = useState(false)
const [editing, setEditing] = useState<[ENTITY_NAME] | null>(null)
const [statusFilter, setStatusFilter] = useState("all")

// Upload Summary State
const [errorPopupOpen, setErrorPopupOpen] = useState(false)
const [importErrors, setImportErrors] = useState<Array<{
  row: number
  [primary_display_field]: string
  [secondary_display_field]: string
  errors: string[]
}>>([])
const [uploadSummary, setUploadSummary] = useState<{
  total: number
  success: number
  failed: number
}>({ total: 0, success: 0, failed: 0 })

// Form Data State
const [formData, setFormData] = useState({
  [field_1]: "",
  [field_2]: "",
  // ... all fields with default values
  is_active: true,
})
const [errors, setErrors] = useState<Record<string, string>>({})

// Foreign Key Dropdown Data (if applicable)
const [[FK_DROPDOWN_NAME], set[FK_DROPDOWN_NAME]] = useState<Array<{ id: string; [fk_code_field]: string; [fk_name_field]?: string }>>([])
```

### 4. Data Fetching Functions

```typescript
// Fetch main data
const fetch[ENTITY_NAME_PLURAL] = async () => {
  try {
    setLoading(true)
    const response = await fetch('/api/[API_ROUTE]')
    if (!response.ok) {
      throw new Error('Failed to fetch [entity_name_plural]')
    }
    const data = await response.json()
    setItems(data)
  } catch (error) {
    console.error('Error fetching [entity_name_plural]:', error)
    setItems([])
  } finally {
    setLoading(false)
  }
}

// Fetch foreign key dropdown data (if applicable)
const fetch[FK_DROPDOWN_NAME] = async () => {
  try {
    const res = await fetch('/api/[FK_API_ROUTE]')
    if (res.ok) {
      const data = await res.json()
      const mapped = Array.isArray(data)
        ? data.filter((i: any) => i?.[fk_code_field]).map((i: any) => ({
            id: i.id,
            [fk_code_field]: i.[fk_code_field],
            [fk_name_field]: i.[fk_name_field] || i.name
          }))
        : []
      set[FK_DROPDOWN_NAME](mapped)
    }
  } catch (e) {
    console.error('Failed to load [fk_dropdown_name]:', e)
  }
}

// Load data on mount
useEffect(() => {
  fetch[ENTITY_NAME_PLURAL]()
  fetch[FK_DROPDOWN_NAME]()
}, [])
```

### 5. Form Validation

```typescript
const validate = () => {
  const e: Record<string, string> = {}

  // Required field validation
  if (!formData.[required_field_1].trim()) e.[required_field_1] = "Required"
  if (!formData.[required_field_2].trim()) e.[required_field_2] = "Required"

  // Format validation (example for code fields)
  if (formData.[code_field] && !/^[A-Za-z0-9\-_]+$/.test(formData.[code_field])) {
    e.[code_field] = "Can only contain letters, numbers, hyphens, and underscores"
  }

  // Length validation
  if (formData.[field_name] && formData.[field_name].length > [MAX_LENGTH]) {
    e.[field_name] = "Must be [MAX_LENGTH] characters or less"
  }

  // Numeric validation
  if (formData.[numeric_field] && (Number(formData.[numeric_field]) < [MIN] || Number(formData.[numeric_field]) > [MAX])) {
    e.[numeric_field] = "Must be between [MIN] and [MAX]"
  }

  setErrors(e)
  return Object.keys(e).length === 0
}
```

### 6. CRUD Operations

```typescript
// CREATE & UPDATE
const save = async () => {
  if (!validate()) return

  try {
    setLoading(true)

    // Foreign key resolution (if applicable)
    const selected[FK_NAME] = [FK_DROPDOWN_NAME].find(item => item.[fk_code_field] === formData.[fk_code_field])

    if (!selected[FK_NAME]) {
      toast({
        title: "❌ Error",
        description: "Selected [FK_NAME] not found. Please refresh and try again.",
        variant: "destructive",
      })
      setLoading(false)
      return
    }

    let payload = {
      ...formData,
      [fk_id_field]: selected[FK_NAME].id  // Add foreign key ID
    }

    if (editing) {
      // UPDATE
      const response = await fetch('/api/[API_ROUTE]', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: editing.id, ...payload }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update [entity_name]')
      }

      const updated = await response.json()
      setItems((prev) => prev.map((p) => (p.id === editing.id ? updated : p)))

      toast({
        title: "✅ [ENTITY_NAME] Updated",
        description: `${updated.[display_field]} has been successfully updated.`,
        className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
      })
    } else {
      // CREATE
      const response = await fetch('/api/[API_ROUTE]', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create [entity_name]')
      }

      const created = await response.json()
      setItems((prev) => [created, ...prev])

      toast({
        title: "✅ [ENTITY_NAME] Created",
        description: `${created.[display_field]} has been successfully created.`,
        className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
      })
    }

    setSheetOpen(false)
    resetForm()
  } catch (error) {
    console.error('Error saving [entity_name]:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to save [entity_name]. Please try again.'
    toast({
      title: "❌ Save Failed",
      description: errorMessage,
      variant: "destructive",
      className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
    })
  } finally {
    setLoading(false)
  }
}

// DELETE
const remove = async (id: string) => {
  try {
    setLoading(true)
    const itemName = items.find(i => i.id === id)?.[display_field] || '[ENTITY_NAME]'

    const response = await fetch(`/api/[API_ROUTE]?id=${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to delete [entity_name]')
    }

    setItems((prev) => prev.filter((p) => p.id !== id))

    toast({
      title: "✅ [ENTITY_NAME] Deleted",
      description: `${itemName} has been successfully deleted.`,
      className: "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200",
    })
  } catch (error) {
    console.error('Error deleting [entity_name]:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete [entity_name]. Please try again.'
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
```

### 7. Import/Export Functions

```typescript
// Validation function for imported data
const validate[ENTITY_NAME]Data = (data: any, rowIndex: number) => {
  const errors: string[] = []

  // Required field validations
  if (!data.[required_field_1] || data.[required_field_1].trim() === '') {
    errors.push('[Required Field 1 Display Name] is required')
  } else if (data.[required_field_1].length > [MAX_LENGTH]) {
    errors.push('[Required Field 1 Display Name] must be [MAX_LENGTH] characters or less')
  }

  // Optional field validations
  if (data.[optional_field] && data.[optional_field].length > [MAX_LENGTH]) {
    errors.push('[Optional Field Display Name] must be [MAX_LENGTH] characters or less')
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

// Export to JSON
const handleDownload = () => {
  const exportData = filtered.map(item => ({
    [field_1]: item.[field_1],
    [field_2]: item.[field_2],
    // ... all exportable fields
    is_active: item.is_active,
    created_at: item.created_at
  }))

  const json = JSON.stringify(exportData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `[entity_name_plural]_${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Export to Excel
const handleExport = () => {
  const excelData = filtered.map((r) => ({
    '[Field 1 Display Name]': r.[field_1],
    '[Field 2 Display Name]': r.[field_2],
    // ... all fields
    'Status': r.is_active ? 'Active' : 'Inactive',
    'Created': new Date(r.created_at).toISOString().split('T')[0],
  }))

  const ws = XLSX.utils.json_to_sheet(excelData)

  // Set column widths
  const colWidths = [
    { wch: 20 }, // Field 1
    { wch: 15 }, // Field 2
    // ... adjust for all columns
  ]
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '[ENTITY_NAME_PLURAL]')
  XLSX.writeFile(wb, `[entity_name_plural]_export_${new Date().toISOString().split('T')[0]}.xlsx`)
}

// Template Export with Reference Sheets
const handleTemplateExport = () => {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Template with sample row
  const sample = [{
    '[Field 1 Display Name]': '[SAMPLE_VALUE_1]',
    '[Field 2 Display Name]': '[SAMPLE_VALUE_2]',
    // ... all fields with sample data
    'Status': 'Active'
  }]

  const ws = XLSX.utils.json_to_sheet(sample)

  // Set column widths
  const colWidths = [
    { wch: 20 }, // Field 1
    // ... adjust for all columns
  ]
  ws['!cols'] = colWidths

  // Style mandatory field headers red with asterisk
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const mandatoryFields = ['[Field 1 Display Name]', '[Field 2 Display Name]']

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
    if (!ws[cellAddress]) continue

    const cell = ws[cellAddress]
    const isMandatory = mandatoryFields.includes(cell.v as string)

    if (isMandatory) {
      cell.v = cell.v + ' *'
      cell.s = {
        font: { color: { rgb: 'FF0000' }, bold: true },
        fill: { fgColor: { rgb: 'FFE6E6' } }
      }
    } else {
      cell.s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'F0F0F0' } }
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Template')

  // Sheet 2: Foreign Key Reference (if applicable)
  const [fk_reference] = [FK_DROPDOWN_NAME].map(item => ({
    '[FK Code Field Display Name]': item.[fk_code_field],
    '[FK Name Field Display Name]': item.[fk_name_field] || 'N/A',
    'Status': item.is_active ? 'Active' : 'Inactive'
  }))

  const wsRef = XLSX.utils.json_to_sheet([fk_reference])
  const refColWidths = [
    { wch: 20 },
    { wch: 40 },
    { wch: 10 }
  ]
  wsRef['!cols'] = refColWidths

  XLSX.utils.book_append_sheet(wb, wsRef, '[FK Reference Sheet Name]')

  XLSX.writeFile(wb, `[entity_name_plural]_template_${new Date().toISOString().split('T')[0]}.xlsx`)
}

// Import with Detailed Error Tracking
const handleImport = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.csv,.xlsx,.xls'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      let rows: Partial<[ENTITY_NAME]>[] = []

      // Parse file based on type (JSON/CSV/Excel)
      if (file.name.endsWith('.json')) {
        const text = await file.text()
        rows = JSON.parse(text)
      } else if (file.name.endsWith('.csv')) {
        // CSV parsing logic
        const text = await file.text()
        const lines = text.split('\n').filter(line => line.trim())
        if (lines.length < 2) {
          toast({
            title: "❌ Invalid CSV File",
            description: "CSV file must have at least a header row and one data row",
            variant: "destructive",
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
          [field_1]: String(j['[Field 1 Display Name] *'] || j['[Field 1 Display Name]'] || ''),
          // ... map all fields
          is_active: String(j['Status'] || '').toLowerCase() === 'active'
        }))
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const data = new Uint8Array(await file.arrayBuffer())
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
        rows = json.map(j => ({
          [fk_code_field]: String(j['[FK Code Display Name] *'] || j['[FK Code Display Name]'] || ''),
          [field_1]: String(j['[Field 1 Display Name] *'] || j['[Field 1 Display Name]'] || ''),
          // ... map all fields
          is_active: String(j['Status'] || '').toLowerCase() === 'active'
        }))
      }

      const now = new Date().toISOString()
      const validationErrors: Array<{
        row: number
        [primary_display_field]: string
        [secondary_display_field]: string
        errors: string[]
      }> = []

      const mapped = rows.map((r, index) => {
        const itemData = {
          id: String(Date.now() + Math.random()),
          [fk_code_field]: (r as any).[fk_code_field] || '',
          [field_1]: r.[field_1]!,
          // ... all fields
          is_active: r.is_active ?? true,
          created_at: now,
        }

        // Validate the data
        const errors = validate[ENTITY_NAME]Data(itemData, index + 2)
        if (errors.length > 0) {
          validationErrors.push({
            row: index + 2,
            [primary_display_field]: itemData.[primary_display_field] || 'N/A',
            [secondary_display_field]: itemData.[secondary_display_field] || 'N/A',
            errors: errors
          })
        }

        return itemData
      }).filter(r => r.[required_field_1] && r.[required_field_2]) as [ENTITY_NAME][]

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
          description: "No valid data found in the file. Please check required fields.",
          variant: "destructive",
        })
        return
      }

      // Save each item to the database
      setLoading(true)
      let successCount = 0
      let errorCount = 0
      const uploadErrors: Array<{
        row: number
        [primary_display_field]: string
        [secondary_display_field]: string
        errors: string[]
      }> = []

      for (let i = 0; i < mapped.length; i++) {
        const item = mapped[i]
        const rowNumber = i + 2 // +2 for header row in Excel

        try {
          const response = await fetch('/api/[API_ROUTE]', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(item),
          })

          if (response.ok) {
            const savedItem = await response.json()
            setItems(prev => [savedItem, ...prev])
            successCount++
          } else {
            const errorData = await response.json()
            errorCount++
            uploadErrors.push({
              row: rowNumber,
              [primary_display_field]: item.[primary_display_field] || 'N/A',
              [secondary_display_field]: item.[secondary_display_field] || 'N/A',
              errors: [errorData.error || 'Failed to save [entity_name]']
            })
          }
        } catch (error) {
          errorCount++
          uploadErrors.push({
            row: rowNumber,
            [primary_display_field]: item.[primary_display_field] || 'N/A',
            [secondary_display_field]: item.[secondary_display_field] || 'N/A',
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

      // Show detailed results with error dialog if needed
      if (uploadErrors.length > 0) {
        setImportErrors(uploadErrors)
        setErrorPopupOpen(true)
      }

      // Show appropriate toast messages
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "✅ Upload Complete",
          description: `Successfully uploaded all ${successCount} row${successCount > 1 ? 's' : ''} (${successCount} [entity_name]${successCount > 1 ? 's' : ''}) to the database.`,
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
      })
    }
  }
  input.click()
}
```

### 8. UI Components

**Scorecard Section:**
```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Total [ENTITY_NAME_PLURAL]</p>
          <p className="text-xl font-bold">{items.length}</p>
        </div>
        <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
          <[ICON_NAME] className="h-3 w-3 text-blue-600 dark:text-blue-400" />
        </div>
      </div>
    </CardContent>
  </Card>
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Active [ENTITY_NAME_PLURAL]</p>
          <p className="text-xl font-bold text-green-600">{items.filter(i=>i.is_active).length}</p>
        </div>
        <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
          <[ICON_NAME] className="h-3 w-3 text-green-600 dark:text-green-400" />
        </div>
      </div>
    </CardContent>
  </Card>
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Inactive [ENTITY_NAME_PLURAL]</p>
          <p className="text-xl font-bold text-red-600">{items.filter(i=>!i.is_active).length}</p>
        </div>
        <div className="h-7 w-7 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <[ICON_NAME] className="h-3 w-3 text-red-600 dark:text-red-400" />
        </div>
      </div>
    </CardContent>
  </Card>
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">New This Month</p>
          <p className="text-xl font-bold text-blue-600">{items.filter(i=>{ const d=new Date(i.created_at); const n=new Date(); return d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear() }).length}</p>
        </div>
        <div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
          <TrendingUp className="h-3 w-3 text-purple-600 dark:text-purple-400" />
        </div>
      </div>
    </CardContent>
  </Card>
</div>
```

**Form Sheet Structure:**
```typescript
<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
  <SheetContent className="sm:max-w-[600px] overflow-y-auto">
    <SheetHeader className="pb-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
            <[ICON_NAME] className="h-5 w-5 text-white" />
          </div>
          <div>
            <SheetTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              {editing ? "Edit [ENTITY_NAME]" : "Add [ENTITY_NAME]"}
            </SheetTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {editing ? "Update [entity_name] information" : "Create a new [entity_name] record"}
            </p>
          </div>
        </div>
      </div>
    </SheetHeader>

    <div className="mt-6 space-y-6">
      {/* Form sections */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-blue-200 dark:border-blue-800">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
            <[ICON_NAME] className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Basic Information</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Form fields */}
          <div className="space-y-2">
            <Label htmlFor="[field_name]" className="text-sm font-semibold">
              [Field Display Name] <span className="text-red-500">*</span>
            </Label>
            <Input
              id="[field_name]"
              value={formData.[field_name]}
              onChange={(e) => setFormData({ ...formData, [field_name]: e.target.value })}
              className={`h-10 ${errors.[field_name] ? 'border-destructive' : ''}`}
              placeholder="[placeholder text]"
            />
            {errors.[field_name] && <p className="text-xs text-destructive">{errors.[field_name]}</p>}
          </div>
        </div>
      </div>

      {/* Status Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-teal-200 dark:border-teal-800">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-r from-teal-500 to-green-600 flex items-center justify-center">
            <[ICON_NAME] className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-lg font-bold bg-gradient-to-r from-teal-600 to-green-600 bg-clip-text text-transparent">Status</h3>
        </div>
        <div className="flex items-center gap-4">
          <Label className="text-sm font-semibold">[ENTITY_NAME] Status</Label>
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
      <div className="flex justify-end gap-3 pt-6 border-t">
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
        >
          {editing ? "Update [ENTITY_NAME]" : "Create [ENTITY_NAME]"}
        </Button>
      </div>
    </div>
  </SheetContent>
</Sheet>
```

**Error Dialog:**
```typescript
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
      {/* Upload Summary */}
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
                  {error.[primary_display_field]} - {error.[secondary_display_field]}
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
              <li>• [Common Fix 1]</li>
              <li>• [Common Fix 2]</li>
              <li>• [Common Fix 3]</li>
              <li>• [Common Fix 4]</li>
              <li>• Status: true/false or Active/Inactive</li>
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
```

---

## Backend API Implementation Requirements

### File Location
`app/api/[DOMAIN]/[API_ROUTE]/route.ts`
- Use appropriate domain folder: `master/`, `course-management/`, `exam-management/`, `grading/`, `users/`, or `utilities/`
- Example: `app/api/master/institutions/route.ts` for institutions API

### Required Imports
```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
```

### GET Endpoint
```typescript
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServer()
    const { searchParams } = new URL(request.url)
    const [filter_param] = searchParams.get('[filter_param]')

    let query = supabase
      .from('[TABLE_NAME]')
      .select('*')
      .order('created_at', { ascending: false })

    if ([filter_param]) {
      query = query.eq('[filter_field]', [filter_param])
    }

    const { data, error } = await query

    if (error) {
      console.error('[ENTITY_NAME] table error:', error)
      return NextResponse.json({ error: 'Failed to fetch [entity_name_plural]' }, { status: 500 })
    }

    const normalized = (data || []).map((row: any) => ({
      ...row,
      is_active: row.status ?? row.is_active ?? true,
    }))
    return NextResponse.json(normalized)
  } catch (e) {
    console.error('[ENTITY_NAME] API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### POST Endpoint with Foreign Key Auto-Mapping
```typescript
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    // Auto-map [FK_CODE_FIELD] to [FK_ID_FIELD]
    let [fk_code_field]: string | undefined = body.[fk_code_field]
    let [fk_id_field]: string | undefined = body.[fk_id_field]

    // If [fk_code_field] is provided, fetch [fk_id_field]
    if ([fk_code_field]) {
      const { data: fkData, error: fkError } = await supabase
        .from('[FK_TABLE_NAME]')
        .select('id, [fk_code_field]')
        .eq('[fk_code_field]', [fk_code_field])
        .maybeSingle()

      if (fkError || !fkData) {
        return NextResponse.json({
          error: `Invalid [fk_code_field]: ${[fk_code_field]}. [FK_ENTITY_NAME] not found.`
        }, { status: 400 })
      }

      // Auto-map the [fk_id_field] from the fetched [FK_ENTITY_NAME]
      [fk_id_field] = fkData.id
      console.log(`✅ Auto-mapped [fk_code_field] "${[fk_code_field]}" to [fk_id_field] "${[fk_id_field]}"`)
    }
    // If [fk_id_field] is provided but no [fk_code_field], fetch the code
    else if ([fk_id_field] && ![fk_code_field]) {
      const { data: fkData } = await supabase
        .from('[FK_TABLE_NAME]')
        .select('[fk_code_field]')
        .eq('id', [fk_id_field])
        .maybeSingle()
      if (fkData?.[fk_code_field]) {
        [fk_code_field] = fkData.[fk_code_field]
      }
    }

    // Validate required fields
    if (![fk_code_field] || ![fk_id_field]) {
      return NextResponse.json({
        error: '[fk_code_field] is required and must be valid'
      }, { status: 400 })
    }

    const insertPayload: any = {
      [fk_code_field]: [fk_code_field],
      [fk_id_field]: [fk_id_field],
      [field_1]: body.[field_1],
      [field_2]: body.[field_2],
      // ... all fields
      status: body.is_active ?? true,
    }
    if (body.[optional_field] !== undefined) insertPayload.[optional_field] = body.[optional_field] ?? null

    const { data, error } = await supabase
      .from('[TABLE_NAME]')
      .insert([insertPayload])
      .select()
      .single()

    if (error) {
      console.error('Error creating [entity_name]:', error)

      // Handle duplicate key constraint violation
      if (error.code === '23505') {
        return NextResponse.json({
          error: '[ENTITY_NAME] already exists. Please use different values.'
        }, { status: 400 })
      }

      // Handle foreign key constraint violation
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Invalid reference. Please select a valid option.'
        }, { status: 400 })
      }

      // Check if it's a foreign key constraint error (legacy)
      if (error.message.includes('[TABLE_NAME]_[fk_field]_fkey')) {
        return NextResponse.json({ error: 'Invalid [fk_display_name]' }, { status: 400 })
      }

      return NextResponse.json({ error: 'Failed to create [entity_name]' }, { status: 500 })
    }

    const normalized = data ? { ...data, is_active: (data as any).status ?? (data as any).is_active ?? true } : data
    return NextResponse.json(normalized, { status: 201 })
  } catch (e) {
    console.error('[ENTITY_NAME] creation error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### PUT Endpoint
```typescript
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    // Auto-map [FK_CODE_FIELD] to [FK_ID_FIELD] (same logic as POST)
    let [fk_code_field]: string | undefined = body.[fk_code_field]
    let [fk_id_field]: string | undefined = body.[fk_id_field]

    // If [fk_code_field] is provided, fetch [fk_id_field]
    if ([fk_code_field]) {
      const { data: fkData, error: fkError } = await supabase
        .from('[FK_TABLE_NAME]')
        .select('id, [fk_code_field]')
        .eq('[fk_code_field]', [fk_code_field])
        .maybeSingle()

      if (fkError || !fkData) {
        return NextResponse.json({
          error: `Invalid [fk_code_field]: ${[fk_code_field]}. [FK_ENTITY_NAME] not found.`
        }, { status: 400 })
      }

      // Auto-map the [fk_id_field] from the fetched [FK_ENTITY_NAME]
      [fk_id_field] = fkData.id
      console.log(`✅ Auto-mapped [fk_code_field] "${[fk_code_field]}" to [fk_id_field] "${[fk_id_field]}" (UPDATE)`)
    }
    // If [fk_id_field] is provided but no [fk_code_field], fetch the code
    else if ([fk_id_field] && ![fk_code_field]) {
      const { data: fkData } = await supabase
        .from('[FK_TABLE_NAME]')
        .select('[fk_code_field]')
        .eq('id', [fk_id_field])
        .maybeSingle()
      if (fkData?.[fk_code_field]) {
        [fk_code_field] = fkData.[fk_code_field]
      }
    }

    const updatePayload: any = {
      [field_1]: body.[field_1],
      [field_2]: body.[field_2],
      // ... all fields
      status: body.is_active,
    }
    if (body.[optional_field] !== undefined) updatePayload.[optional_field] = body.[optional_field] ?? null
    if ([fk_code_field]) updatePayload.[fk_code_field] = [fk_code_field]
    if ([fk_id_field]) updatePayload.[fk_id_field] = [fk_id_field]

    const { data, error } = await supabase
      .from('[TABLE_NAME]')
      .update(updatePayload)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating [entity_name]:', error)

      // Handle duplicate key constraint violation
      if (error.code === '23505') {
        return NextResponse.json({
          error: '[ENTITY_NAME] already exists. Please use different values.'
        }, { status: 400 })
      }

      // Handle foreign key constraint violation
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Invalid reference. Please select a valid option.'
        }, { status: 400 })
      }

      // Check if it's a foreign key constraint error (legacy)
      if (error.message.includes('[TABLE_NAME]_[fk_field]_fkey')) {
        return NextResponse.json({ error: 'Invalid [fk_display_name]' }, { status: 400 })
      }

      return NextResponse.json({ error: 'Failed to update [entity_name]' }, { status: 500 })
    }

    const normalized = data ? { ...data, is_active: (data as any).status ?? (data as any).is_active ?? true } : data
    return NextResponse.json(normalized)
  } catch (e) {
    console.error('[ENTITY_NAME] update error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### DELETE Endpoint
```typescript
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '[ENTITY_NAME] ID is required' }, { status: 400 })
    }

    const supabase = getSupabaseServer()

    const { error } = await supabase
      .from('[TABLE_NAME]')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting [entity_name]:', error)
      return NextResponse.json({ error: 'Failed to delete [entity_name]' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[ENTITY_NAME] deletion error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

## Key Features Checklist

Frontend:
- ✅ TypeScript interface definition
- ✅ Complete state management (items, loading, search, sort, pagination, form, errors, upload summary)
- ✅ Data fetching with error handling
- ✅ Comprehensive form validation
- ✅ CRUD operations (Create, Read, Update, Delete)
- ✅ Search and filter functionality
- ✅ Sortable table columns
- ✅ Pagination (10 items per page)
- ✅ Export to JSON
- ✅ Export to Excel with formatted columns
- ✅ Template export with reference sheets
- ✅ Import from JSON/CSV/Excel
- ✅ Row-by-row upload error tracking
- ✅ Visual upload summary (Total/Success/Failed cards)
- ✅ Detailed error dialog with helpful tips
- ✅ Toast notifications (success/partial/failure)
- ✅ Scorecard section (Total/Active/Inactive/New This Month)
- ✅ Responsive design
- ✅ Dark mode support
- ✅ Breadcrumb navigation
- ✅ Status toggle (Active/Inactive)
- ✅ Foreign key dropdown selection (if applicable)

Backend:
- ✅ GET endpoint with filtering
- ✅ POST endpoint with foreign key auto-mapping
- ✅ PUT endpoint with foreign key auto-mapping
- ✅ DELETE endpoint
- ✅ Comprehensive error handling (23505, 23503, 23514 codes)
- ✅ Validation error messages
- ✅ Foreign key constraint validation
- ✅ Status field normalization
- ✅ Detailed console logging

---

## Example Usage

To generate a CRUD page for "Courses", fill in the placeholders:

**Entity Details:**
- [ENTITY_NAME] → Course
- [ENTITY_NAME_PLURAL] → Courses
- [TABLE_NAME] → courses
- [API_ROUTE] → courses
- [PAGE_ROUTE] → courses
- [ICON_NAME] → BookOpen

**Database Fields:**
- [FIELD_1] → course_code (VARCHAR(50), NOT NULL)
- [FIELD_2] → course_title (VARCHAR(255), NOT NULL)
- [FIELD_3] → credits (INTEGER)
- [FK_FIELD_1] → institution_code (references institutions)
- [FK_FIELD_2] → regulation_code (references regulations)

**Required Fields:**
- course_code
- course_title
- institution_code
- regulation_code

**Optional Fields:**
- display_name
- description
- credits
- theory_credit
- practical_credit

Then use this prompt with all placeholders filled to generate the complete implementation.

---

## Additional Customizations

### For entities with multiple foreign keys:
Repeat the foreign key auto-mapping logic for each FK relationship.

### For entities with conditional fields:
Add conditional rendering in the form based on toggle states (see Split Credit pattern in courses).

### For entities with unique constraints:
Update validation and error handling to show specific duplicate field errors.

### For entities with enums:
Add Select dropdowns for enum fields with predefined options.

### For entities with file uploads:
Add file upload input and S3/storage integration logic.

---

## Notes

1. **Always validate both client-side and server-side**
2. **Use foreign key auto-mapping pattern for all FK relationships**
3. **Include detailed error tracking for bulk uploads**
4. **Provide user-friendly error messages**
5. **Maintain consistent UI patterns across all pages**
6. **Follow the degree module as the reference implementation**
7. **Test all CRUD operations thoroughly**
8. **Ensure proper error handling at every step**
9. **Use proper TypeScript types throughout**
10. **Follow the project's development standards from CLAUDE.md**

---

## Reference Files

- Frontend: `app/(coe)/master/degrees/page.tsx`
- Backend: `app/api/master/degrees/route.ts`
- Folder Structure: `docs/FOLDER_STRUCTURE.md`
- Development Standards: `.cursor/rules/DEVELOPMENT_STANDARDS.md`
- Project Instructions: `CLAUDE.md`
- Product Requirements: `CoE PRD.txt`
```

---

## Quick Start Guide

1. Copy this template
2. Replace all `[PLACEHOLDER]` values with your entity-specific details
3. Run the filled prompt through Claude Code
4. Review and test the generated code
5. Make any necessary adjustments for entity-specific requirements

---

**Last Updated:** 2025-01-14
**Template Version:** 1.0
**Reference Implementation:** degree module (lines 1-1276 in page.tsx, lines 1-225 in route.ts)
