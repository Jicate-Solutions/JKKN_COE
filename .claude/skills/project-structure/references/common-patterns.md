# Common Development Patterns for JKKN COE

This document provides concrete examples and patterns for common development tasks in the JKKN COE project.

## Table of Contents

1. [Creating a New CRUD Module](#creating-a-new-crud-module)
2. [Adding a New API Endpoint](#adding-a-new-api-endpoint)
3. [Creating a New Component](#creating-a-new-component)
4. [Adding Form Validation](#adding-form-validation)
5. [Implementing File Upload](#implementing-file-upload)
6. [Foreign Key Auto-Mapping](#foreign-key-auto-mapping)
7. [Error Handling Patterns](#error-handling-patterns)
8. [Authentication & Authorization](#authentication--authorization)

---

## Creating a New CRUD Module

Follow the **5-layer architecture** when creating a new entity module:

### Step 1: Define Types (`types/[entity].ts`)

```typescript
// types/teachers.ts

export interface Teacher {
  id: string
  teacher_id: string
  first_name: string
  last_name: string
  email: string
  department_id: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TeacherFormData {
  teacher_id: string
  first_name: string
  last_name: string
  email: string
  department_id: string
  is_active: boolean
}

export interface TeacherCreatePayload {
  teacher_id: string
  first_name: string
  last_name: string
  email: string
  department_id: string
  is_active?: boolean
}
```

### Step 2: Create Service (`services/teachers-service.ts`)

```typescript
// services/teachers-service.ts

import { getSupabaseServer } from '@/lib/supabase-server'
import type { Teacher, TeacherCreatePayload } from '@/types/teachers'

export async function getTeachers(): Promise<Teacher[]> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Teacher[]
}

export async function createTeacher(payload: TeacherCreatePayload): Promise<Teacher> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('teachers')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as Teacher
}

export async function updateTeacher(id: string, payload: Partial<TeacherCreatePayload>): Promise<Teacher> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('teachers')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Teacher
}

export async function deleteTeacher(id: string): Promise<void> {
  const supabase = getSupabaseServer()
  const { error } = await supabase
    .from('teachers')
    .delete()
    .eq('id', id)

  if (error) throw error
}
```

### Step 3: Create API Routes

#### `app/api/teachers/route.ts` (GET, POST)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getSupabaseServer()
    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching teachers:', error)
    return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = getSupabaseServer()

    const { data, error } = await supabase
      .from('teachers')
      .insert(body)
      .select()
      .single()

    if (error) {
      console.error('Error creating teacher:', error)

      // Handle duplicate key constraint
      if (error.code === '23505') {
        return NextResponse.json({
          error: 'Teacher with this ID or email already exists.'
        }, { status: 400 })
      }

      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating teacher:', error)
    return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 })
  }
}
```

#### `app/api/teachers/[id]/route.ts` (PUT, DELETE)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await req.json()
    const supabase = getSupabaseServer()

    const { data, error } = await supabase
      .from('teachers')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error updating teacher:', error)
    return NextResponse.json({ error: 'Failed to update teacher' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const supabase = getSupabaseServer()

    const { error } = await supabase
      .from('teachers')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ message: 'Teacher deleted successfully' })
  } catch (error) {
    console.error('Error deleting teacher:', error)
    return NextResponse.json({ error: 'Failed to delete teacher' }, { status: 500 })
  }
}
```

### Step 4: Create Page Component (`app/coe/teachers/page.tsx`)

```typescript
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import type { Teacher, TeacherFormData } from "@/types/teachers"

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Teacher | null>(null)
  const [formData, setFormData] = useState<TeacherFormData>({
    teacher_id: '',
    first_name: '',
    last_name: '',
    email: '',
    department_id: '',
    is_active: true
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()

  // Fetch teachers
  useEffect(() => {
    fetchTeachers()
  }, [])

  const fetchTeachers = async () => {
    try {
      const res = await fetch('/api/teachers')
      const data = await res.json()
      setTeachers(data)
    } catch (error) {
      console.error('Error fetching teachers:', error)
      toast({
        title: '❌ Error',
        description: 'Failed to fetch teachers',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  // Validation
  const validate = () => {
    const e: Record<string, string> = {}

    if (!formData.teacher_id.trim()) e.teacher_id = 'Teacher ID is required'
    if (!formData.first_name.trim()) e.first_name = 'First name is required'
    if (!formData.last_name.trim()) e.last_name = 'Last name is required'
    if (!formData.email.trim()) e.email = 'Email is required'
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      e.email = 'Invalid email format'
    }
    if (!formData.department_id) e.department_id = 'Department is required'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Create/Update
  const handleSubmit = async () => {
    if (!validate()) return

    try {
      const url = editing ? `/api/teachers/${editing.id}` : '/api/teachers'
      const method = editing ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to save teacher')
      }

      const savedTeacher = await res.json()

      if (editing) {
        setTeachers(prev => prev.map(t => t.id === savedTeacher.id ? savedTeacher : t))
      } else {
        setTeachers(prev => [savedTeacher, ...prev])
      }

      toast({
        title: editing ? '✅ Teacher Updated' : '✅ Teacher Created',
        description: `${savedTeacher.first_name} ${savedTeacher.last_name} has been saved.`,
        className: 'bg-green-50 border-green-200 text-green-800'
      })

      setSheetOpen(false)
      resetForm()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save teacher'
      toast({
        title: '❌ Save Failed',
        description: errorMessage,
        variant: 'destructive'
      })
    }
  }

  const resetForm = () => {
    setFormData({
      teacher_id: '',
      first_name: '',
      last_name: '',
      email: '',
      department_id: '',
      is_active: true
    })
    setErrors({})
    setEditing(null)
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Teachers</h1>
        <Button onClick={() => setSheetOpen(true)}>Add Teacher</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Teacher ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teachers.map(teacher => (
            <TableRow key={teacher.id}>
              <TableCell>{teacher.teacher_id}</TableCell>
              <TableCell>{teacher.first_name} {teacher.last_name}</TableCell>
              <TableCell>{teacher.email}</TableCell>
              <TableCell>{teacher.is_active ? 'Active' : 'Inactive'}</TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(teacher)
                    setFormData({
                      teacher_id: teacher.teacher_id,
                      first_name: teacher.first_name,
                      last_name: teacher.last_name,
                      email: teacher.email,
                      department_id: teacher.department_id,
                      is_active: teacher.is_active
                    })
                    setSheetOpen(true)
                  }}
                >
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={sheetOpen} onOpenChange={(o) => {
        if (!o) resetForm()
        setSheetOpen(o)
      }}>
        <SheetContent className="sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit Teacher' : 'Add Teacher'}</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label htmlFor="teacher_id">
                Teacher ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="teacher_id"
                value={formData.teacher_id}
                onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                className={errors.teacher_id ? 'border-red-500' : ''}
              />
              {errors.teacher_id && (
                <p className="text-sm text-red-500">{errors.teacher_id}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="first_name">
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className={errors.first_name ? 'border-red-500' : ''}
              />
              {errors.first_name && (
                <p className="text-sm text-red-500">{errors.first_name}</p>
              )}
            </div>

            {/* More form fields... */}

            <Button onClick={handleSubmit} className="w-full">
              {editing ? 'Update' : 'Create'} Teacher
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
```

### Step 5: Add to Sidebar Navigation

Update `components/layout/app-sidebar.tsx`:

```typescript
{
  title: "Teachers",
  url: "/teachers",
  icon: Users,
  permission: "teachers:read"
}
```

---

## Adding a New API Endpoint

### RESTful API Structure

```
app/api/[entity]/
├── route.ts              # GET (list), POST (create)
├── [id]/
│   └── route.ts          # GET (one), PUT (update), DELETE (delete)
└── [custom-action]/
    └── route.ts          # Custom endpoint
```

### Example: Custom Endpoint for Filtering

```typescript
// app/api/teachers/by-department/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const departmentId = searchParams.get('department_id')

    if (!departmentId) {
      return NextResponse.json({
        error: 'department_id is required'
      }, { status: 400 })
    }

    const supabase = getSupabaseServer()
    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('department_id', departmentId)
      .order('last_name', { ascending: true })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching teachers by department:', error)
    return NextResponse.json({
      error: 'Failed to fetch teachers'
    }, { status: 500 })
  }
}
```

---

## Creating a New Component

### Component Structure

```typescript
// components/teachers/teacher-card.tsx

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Teacher } from '@/types/teachers'

interface TeacherCardProps {
  teacher: Teacher
  onEdit?: (teacher: Teacher) => void
  onDelete?: (id: string) => void
}

export function TeacherCard({ teacher, onEdit, onDelete }: TeacherCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>{teacher.first_name} {teacher.last_name}</span>
          <Badge variant={teacher.is_active ? 'default' : 'secondary'}>
            {teacher.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <p><strong>ID:</strong> {teacher.teacher_id}</p>
          <p><strong>Email:</strong> {teacher.email}</p>
        </div>

        <div className="flex gap-2 mt-4">
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(teacher)}
            >
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(teacher.id)}
            >
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

---

## Adding Form Validation

### Comprehensive Validation Pattern

```typescript
const validate = () => {
  const e: Record<string, string> = {}

  // Required field validation
  if (!formData.teacher_id.trim()) {
    e.teacher_id = 'Teacher ID is required'
  }

  // Format validation with regex
  if (formData.teacher_id && !/^[A-Z]{2}\d{4}$/.test(formData.teacher_id)) {
    e.teacher_id = 'Teacher ID must be in format: XX0000 (e.g., TC1234)'
  }

  // Email validation
  if (!formData.email.trim()) {
    e.email = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
    e.email = 'Invalid email format'
  }

  // Numeric range validation
  if (formData.experience_years) {
    const years = Number(formData.experience_years)
    if (years < 0 || years > 50) {
      e.experience_years = 'Experience must be between 0 and 50 years'
    }
  }

  // Conditional validation
  if (formData.has_phd && !formData.phd_university) {
    e.phd_university = 'PhD university is required when PhD is selected'
  }

  // URL validation
  if (formData.profile_url && formData.profile_url.trim()) {
    try {
      new URL(formData.profile_url)
    } catch {
      e.profile_url = 'Please enter a valid URL (e.g., https://example.com)'
    }
  }

  setErrors(e)
  return Object.keys(e).length === 0
}
```

---

## Implementing File Upload

### File Upload Component

```typescript
// components/common/file-upload.tsx

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload } from 'lucide-react'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSize?: number // in MB
}

export function FileUpload({ onFileSelect, accept = '.xlsx,.xls', maxSize = 5 }: FileUploadProps) {
  const [error, setError] = useState<string>('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setError('')

    if (!file) return

    // Validate file size
    if (maxSize && file.size > maxSize * 1024 * 1024) {
      setError(`File size must be less than ${maxSize}MB`)
      return
    }

    // Validate file type
    if (accept) {
      const allowedTypes = accept.split(',').map(t => t.trim())
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase()

      if (!allowedTypes.includes(fileExt)) {
        setError(`File type must be: ${accept}`)
        return
      }
    }

    onFileSelect(file)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon">
          <Upload className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
```

---

## Foreign Key Auto-Mapping

### Pattern for Mapping Codes to IDs

```typescript
// app/api/teachers/route.ts

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { department_code, ...otherFields } = body
    const supabase = getSupabaseServer()

    // 1. Validate and fetch department_id from department_code
    const { data: deptData, error: deptError } = await supabase
      .from('departments')
      .select('id')
      .eq('department_code', String(department_code))
      .single()

    if (deptError || !deptData) {
      return NextResponse.json({
        error: `Department with code "${department_code}" not found.`
      }, { status: 400 })
    }

    // 2. Insert with both ID and code
    const { data, error } = await supabase
      .from('teachers')
      .insert({
        ...otherFields,
        department_id: deptData.id,
        department_code: String(department_code)
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating teacher:', error)
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Foreign key constraint failed.'
        }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 })
  }
}
```

---

## Error Handling Patterns

### API Error Handling

```typescript
// Standardized error response
if (error) {
  console.error('Database error:', error)

  // Duplicate key (23505)
  if (error.code === '23505') {
    return NextResponse.json({
      error: 'Record already exists. Please use different values.'
    }, { status: 400 })
  }

  // Foreign key constraint (23503)
  if (error.code === '23503') {
    return NextResponse.json({
      error: 'Invalid reference. Please select a valid option.'
    }, { status: 400 })
  }

  // Check constraint (23514)
  if (error.code === '23514') {
    return NextResponse.json({
      error: 'Invalid value. Please check your input.'
    }, { status: 400 })
  }

  // Not-null constraint (23502)
  if (error.code === '23502') {
    return NextResponse.json({
      error: 'Missing required field.'
    }, { status: 400 })
  }

  // Generic error
  return NextResponse.json({
    error: 'Failed to save record'
  }, { status: 500 })
}
```

### Frontend Error Handling

```typescript
try {
  const res = await fetch('/api/teachers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  })

  if (!res.ok) {
    const errorData = await res.json()
    throw new Error(errorData.error || 'Failed to save teacher')
  }

  const data = await res.json()

  toast({
    title: '✅ Success',
    description: 'Teacher created successfully',
    className: 'bg-green-50 border-green-200'
  })
} catch (error) {
  const errorMessage = error instanceof Error
    ? error.message
    : 'An unexpected error occurred'

  toast({
    title: '❌ Error',
    description: errorMessage,
    variant: 'destructive'
  })
}
```

---

## Authentication & Authorization

### Protected Route Usage

```typescript
// app/coe/teachers/page.tsx

import { ProtectedRoute } from '@/components/common/protected-route'

export default function TeachersPage() {
  return (
    <ProtectedRoute
      requiredPermissions={['teachers:read']}
      requiredRoles={['admin', 'teacher']}
      requireAnyRole={true}
    >
      {/* Page content */}
    </ProtectedRoute>
  )
}
```

### Permission Checking in Components

```typescript
'use client'

import { useAuth } from '@/hooks/use-auth'

export function TeacherActions() {
  const { hasPermission } = useAuth()

  return (
    <div className="flex gap-2">
      {hasPermission('teachers:update') && (
        <Button>Edit</Button>
      )}
      {hasPermission('teachers:delete') && (
        <Button variant="destructive">Delete</Button>
      )}
    </div>
  )
}
```

---

## Summary

These patterns represent the **standardized approach** for development in the JKKN COE project. Following these patterns ensures:

✅ **Consistency** across all modules
✅ **Maintainability** with clear structure
✅ **Type safety** with TypeScript
✅ **Error handling** with user-friendly messages
✅ **Security** with RBAC and validation
✅ **Scalability** with modular architecture
