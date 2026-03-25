# Custom Hooks Guide - JKKN COE

This guide documents all custom hooks created for the JKKN Controller of Examination project. These hooks extract common patterns and simplify development of CRUD pages, data tables, Excel import/export, and more.

---

## 📚 Table of Contents

1. [Data Fetching Hooks](#data-fetching-hooks)
   - [useAPI](#useapi)
   - [useCRUD](#usecrud)
   - [useDropdownData](#usedropdowndata)
2. [Table Management Hooks](#table-management-hooks)
   - [useDataTable](#usedatatable)
3. [Form & UI Hooks](#form--ui-hooks)
   - [useSheet](#usesheet)
   - [useConfirmDialog](#useconfirmdialog)
4. [Excel Hooks](#excel-hooks)
   - [useExcelImport](#useexcelimport)
   - [useExcelExport](#useexcelexport)
5. [Utility Hooks](#utility-hooks)
   - [useDebounce](#usedebounce)
6. [Complete Examples](#complete-examples)

---

## Data Fetching Hooks

### useAPI

Generic hook for making API requests with loading and error states.

**Location:** `hooks/use-api.ts`

**Features:**
- Automatic loading state management
- Error handling
- Success/error callbacks
- Reset functionality

**Usage:**
```typescript
import { useAPI } from '@/hooks/use-api'

function MyComponent() {
  const { data, loading, error, execute } = useAPI<Course[]>({
    onSuccess: (data) => console.log('Success:', data),
    onError: (error) => console.error('Error:', error)
  })

  // GET request
  const fetchCourses = async () => {
    const courses = await execute('/api/courses')
  }

  // POST request
  const createCourse = async (courseData: Course) => {
    const newCourse = await execute('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(courseData)
    })
  }

  return (
    <div>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  )
}
```

---

### useCRUD

Complete CRUD operations for any entity with automatic state management and toast notifications.

**Location:** `hooks/use-crud.ts`

**Features:**
- Full CRUD operations (Create, Read, Update, Delete)
- Automatic loading states for each operation
- Toast notifications
- Optimistic UI updates
- Success/error callbacks

**Usage:**
```typescript
import { useCRUD } from '@/hooks/use-crud'

interface Course {
  id: string
  course_code: string
  course_title: string
  credits: number
}

function CoursesPage() {
  const {
    items: courses,
    loading,
    creating,
    updating,
    deleting,
    createItem,
    updateItem,
    deleteItem,
    refreshItems
  } = useCRUD<Course>({
    apiEndpoint: '/api/courses',
    entityName: 'Course',
    onCreateSuccess: (course) => {
      console.log('Created:', course)
    }
  })

  const handleCreate = async () => {
    await createItem({
      course_code: 'CS101',
      course_title: 'Introduction to CS',
      credits: 3
    })
  }

  const handleUpdate = async (id: string) => {
    await updateItem(id, { credits: 4 })
  }

  const handleDelete = async (id: string) => {
    await deleteItem(id)
  }

  return (
    <div>
      {loading && <p>Loading courses...</p>}
      <button onClick={handleCreate} disabled={creating}>
        {creating ? 'Creating...' : 'Create Course'}
      </button>

      {courses.map(course => (
        <div key={course.id}>
          <h3>{course.course_title}</h3>
          <button
            onClick={() => handleUpdate(course.id)}
            disabled={updating}
          >
            Update
          </button>
          <button
            onClick={() => handleDelete(course.id)}
            disabled={deleting}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}
```

---

### useDropdownData

Fetch dropdown options (institutions, departments, regulations, etc.) with caching.

**Location:** `hooks/use-dropdown-data.ts`

**Features:**
- Automatic caching (5 minutes)
- Loading states
- Error handling
- Refetch functionality
- Multi-dropdown support

**Usage:**

**Single Dropdown:**
```typescript
import { useDropdownData } from '@/hooks/use-dropdown-data'

function CourseForm() {
  const { data: institutions, loading } = useDropdownData<Institution>(
    '/api/institutions'
  )

  return (
    <Select>
      {loading && <SelectItem value="">Loading...</SelectItem>}
      {institutions.map(inst => (
        <SelectItem key={inst.id} value={inst.id}>
          {inst.institution_code}
        </SelectItem>
      ))}
    </Select>
  )
}
```

**Multiple Dropdowns:**
```typescript
import { useMultipleDropdowns } from '@/hooks/use-dropdown-data'

function CourseForm() {
  const {
    institutions,
    departments,
    regulations,
    loading
  } = useMultipleDropdowns({
    institutions: '/api/institutions',
    departments: '/api/departments',
    regulations: '/api/regulations'
  })

  if (loading) return <p>Loading...</p>

  return (
    <form>
      <Select>
        {institutions?.map(inst => (
          <SelectItem key={inst.id} value={inst.id}>
            {inst.institution_code}
          </SelectItem>
        ))}
      </Select>

      <Select>
        {departments?.map(dept => (
          <SelectItem key={dept.id} value={dept.id}>
            {dept.department_code}
          </SelectItem>
        ))}
      </Select>
    </form>
  )
}
```

---

## Table Management Hooks

### useDataTable

Complete data table state management (search, sort, pagination, filters, selection).

**Location:** `hooks/use-data-table.ts`

**Features:**
- Search across multiple fields
- Column sorting (asc/desc)
- Pagination
- Filters
- Row selection
- Automatic data filtering and sorting

**Usage:**
```typescript
import { useDataTable } from '@/hooks/use-data-table'

function CoursesTable({ courses }: { courses: Course[] }) {
  const {
    paginatedData,
    searchTerm,
    setSearchTerm,
    sortField,
    sortDirection,
    handleSort,
    currentPage,
    setCurrentPage,
    totalPages,
    totalItems,
    setFilter,
    filters,
    selectedItems,
    toggleSelection,
    isAllSelected,
    toggleSelectAll
  } = useDataTable({
    data: courses,
    initialPageSize: 10,
    searchableFields: ['course_code', 'course_title'],
  })

  return (
    <div>
      {/* Search */}
      <Input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search courses..."
      />

      {/* Filter */}
      <Select value={filters.is_active} onValueChange={(v) => setFilter('is_active', v)}>
        <SelectItem value="all">All Status</SelectItem>
        <SelectItem value="true">Active</SelectItem>
        <SelectItem value="false">Inactive</SelectItem>
      </Select>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                checked={isAllSelected}
                onCheckedChange={toggleSelectAll}
              />
            </TableHead>
            <TableHead onClick={() => handleSort('course_code')}>
              Course Code
              {sortField === 'course_code' && (
                sortDirection === 'asc' ? '↑' : '↓'
              )}
            </TableHead>
            <TableHead onClick={() => handleSort('course_title')}>
              Course Title
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData.map(course => (
            <TableRow key={course.id}>
              <TableCell>
                <Checkbox
                  checked={selectedItems.has(course.id)}
                  onCheckedChange={() => toggleSelection(course.id)}
                />
              </TableCell>
              <TableCell>{course.course_code}</TableCell>
              <TableCell>{course.course_title}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div>
        <p>Total: {totalItems} items</p>
        <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
          Previous
        </button>
        <span>Page {currentPage} of {totalPages}</span>
        <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>
          Next
        </button>
      </div>
    </div>
  )
}
```

---

## Form & UI Hooks

### useSheet

Manage sheet/modal state and edit mode.

**Location:** `hooks/use-sheet.ts`

**Features:**
- Open/close state
- Edit mode detection
- Auto-reset on close
- Callbacks for open/close

**Usage:**
```typescript
import { useSheet } from '@/hooks/use-sheet'

function CoursesPage() {
  const { isOpen, isEditing, editingItem, open, close, openForEdit } = useSheet<Course>()

  return (
    <div>
      <Button onClick={() => open()}>Add Course</Button>

      <Table>
        {courses.map(course => (
          <TableRow key={course.id}>
            <TableCell>{course.course_title}</TableCell>
            <TableCell>
              <Button onClick={() => openForEdit(course)}>Edit</Button>
            </TableCell>
          </TableRow>
        ))}
      </Table>

      <Sheet open={isOpen} onOpenChange={close}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {isEditing ? 'Edit Course' : 'Create Course'}
            </SheetTitle>
          </SheetHeader>

          <CourseForm
            initialData={editingItem}
            onSubmit={async (data) => {
              if (isEditing) {
                await updateCourse(editingItem.id, data)
              } else {
                await createCourse(data)
              }
              close()
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
```

---

### useConfirmDialog

Manage confirmation dialog state (e.g., delete confirmations).

**Location:** `hooks/use-confirm-dialog.ts`

**Features:**
- Open/close state
- Store item ID and name
- Confirm/cancel actions

**Usage:**
```typescript
import { useConfirmDialog } from '@/hooks/use-confirm-dialog'

function CoursesTable({ courses }: { courses: Course[] }) {
  const { isOpen, itemId, itemName, openDialog, closeDialog, confirm } = useConfirmDialog()

  const handleDelete = async () => {
    const id = confirm()
    if (id) {
      await deleteCourse(id)
    }
  }

  return (
    <div>
      <Table>
        {courses.map(course => (
          <TableRow key={course.id}>
            <TableCell>{course.course_title}</TableCell>
            <TableCell>
              <Button
                onClick={() => openDialog(course.id, course.course_title)}
                variant="destructive"
              >
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </Table>

      <AlertDialog open={isOpen} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

---

## Excel Hooks

### useExcelImport

Import data from Excel files with validation and error reporting.

**Location:** `hooks/use-excel-import.ts`

**Features:**
- Excel file parsing
- Row-by-row validation
- Error tracking with row numbers
- Import summary (total/success/failed)
- Visual error dialog support

**Usage:**
```typescript
import { useExcelImport } from '@/hooks/use-excel-import'

function CoursesPage() {
  const {
    importing,
    importErrors,
    importSummary,
    showErrorDialog,
    handleFileUpload,
    triggerFileInput,
    closeErrorDialog,
    fileInputRef
  } = useExcelImport<Course>({
    onImport: async (courses) => {
      const errors: ImportError[] = []

      for (let i = 0; i < courses.length; i++) {
        const course = courses[i]
        try {
          await createCourse(course)
        } catch (error) {
          errors.push({
            row: i + 2,
            errors: [error.message],
            data: course
          })
        }
      }

      return errors
    },
    validateRow: (row, index) => {
      const errors: string[] = []
      if (!row.course_code) errors.push('Course code required')
      if (!row.course_title) errors.push('Course title required')
      if (row.credits < 0) errors.push('Credits must be positive')

      return errors.length > 0 ? errors : null
    },
    entityName: 'Course'
  })

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      <Button onClick={triggerFileInput} disabled={importing}>
        {importing ? 'Importing...' : 'Import Excel'}
      </Button>

      {/* Error Dialog */}
      {showErrorDialog && (
        <AlertDialog open={showErrorDialog} onOpenChange={closeErrorDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Import Errors</AlertDialogTitle>
              <AlertDialogDescription>
                {importSummary.failed} of {importSummary.total} rows failed
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="max-h-96 overflow-y-auto">
              {importErrors.map((error, index) => (
                <div key={index} className="mb-2">
                  <p className="font-semibold">Row {error.row}:</p>
                  <ul className="list-disc list-inside">
                    {error.errors.map((err, i) => (
                      <li key={i} className="text-sm text-red-600">{err}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <AlertDialogFooter>
              <AlertDialogAction onClick={closeErrorDialog}>Close</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
```

---

### useExcelExport

Export data to Excel files with custom formatting.

**Location:** `hooks/use-excel-export.ts`

**Features:**
- Export data to Excel
- Custom column mapping
- Data formatting
- Template generation
- Auto-sized columns

**Usage:**
```typescript
import { useExcelExport } from '@/hooks/use-excel-export'

function CoursesPage({ courses }: { courses: Course[] }) {
  const { exportToExcel, downloadTemplate } = useExcelExport<Course>({
    filename: 'courses',
    sheetName: 'Courses',
    columns: [
      { key: 'course_code', header: 'Course Code' },
      { key: 'course_title', header: 'Course Title' },
      { key: 'credits', header: 'Credits' },
      { key: 'is_active', header: 'Status' }
    ],
    formatData: (course) => ({
      'Course Code': course.course_code,
      'Course Title': course.course_title,
      'Credits': course.credits,
      'Status': course.is_active ? 'Active' : 'Inactive'
    })
  })

  return (
    <div>
      <Button onClick={() => exportToExcel(courses)}>
        Export to Excel ({courses.length} records)
      </Button>

      <Button onClick={() => downloadTemplate(['Course Code', 'Course Title', 'Credits', 'Status'])}>
        Download Template
      </Button>
    </div>
  )
}
```

---

## Utility Hooks

### useDebounce

Debounce a value to avoid excessive updates.

**Location:** `hooks/use-debounce.ts`

**Features:**
- Delays value updates
- Configurable delay
- Automatic cleanup

**Usage:**
```typescript
import { useDebounce } from '@/hooks/use-debounce'

function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebounce(searchTerm, 500)

  useEffect(() => {
    // This only runs 500ms after user stops typing
    if (debouncedSearch) {
      fetchResults(debouncedSearch)
    }
  }, [debouncedSearch])

  return (
    <Input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search..."
    />
  )
}
```

---

## Complete Examples

### Full CRUD Page with All Hooks

```typescript
'use client'

import { useCRUD } from '@/hooks/use-crud'
import { useDataTable } from '@/hooks/use-data-table'
import { useSheet } from '@/hooks/use-sheet'
import { useConfirmDialog } from '@/hooks/use-confirm-dialog'
import { useExcelImport } from '@/hooks/use-excel-import'
import { useExcelExport } from '@/hooks/use-excel-export'
import { useDropdownData } from '@/hooks/use-dropdown-data'

interface Course {
  id: string
  course_code: string
  course_title: string
  credits: number
  is_active: boolean
}

export default function CoursesPage() {
  // CRUD operations
  const {
    items: courses,
    loading,
    createItem,
    updateItem,
    deleteItem
  } = useCRUD<Course>({
    apiEndpoint: '/api/courses',
    entityName: 'Course'
  })

  // Data table
  const {
    paginatedData,
    searchTerm,
    setSearchTerm,
    handleSort,
    sortField,
    sortDirection,
    currentPage,
    setCurrentPage,
    totalPages
  } = useDataTable({
    data: courses,
    initialPageSize: 10,
    searchableFields: ['course_code', 'course_title']
  })

  // Sheet management
  const { isOpen, isEditing, editingItem, open, close, openForEdit } = useSheet<Course>()

  // Confirm dialog
  const { isOpen: deleteDialogOpen, itemName, openDialog, confirm, closeDialog } = useConfirmDialog()

  // Excel import
  const {
    importing,
    handleFileUpload,
    triggerFileInput,
    fileInputRef
  } = useExcelImport<Course>({
    onImport: async (data) => {
      const errors = []
      for (const item of data) {
        const result = await createItem(item)
        if (!result) errors.push({ row: 0, errors: ['Failed'] })
      }
      return errors
    },
    entityName: 'Course'
  })

  // Excel export
  const { exportToExcel } = useExcelExport<Course>({
    filename: 'courses',
    columns: [
      { key: 'course_code', header: 'Course Code' },
      { key: 'course_title', header: 'Course Title' }
    ]
  })

  // Dropdown data
  const { data: institutions } = useDropdownData('/api/institutions')

  const handleDelete = async () => {
    const id = confirm()
    if (id) await deleteItem(id)
  }

  return (
    <div>
      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={() => open()}>Create Course</Button>
        <Button onClick={triggerFileInput} disabled={importing}>Import</Button>
        <Button onClick={() => exportToExcel(courses)}>Export</Button>
      </div>

      {/* Search */}
      <Input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search..."
      />

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead onClick={() => handleSort('course_code')}>
              Code {sortField === 'course_code' && (sortDirection === 'asc' ? '↑' : '↓')}
            </TableHead>
            <TableHead onClick={() => handleSort('course_title')}>
              Title
            </TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData.map(course => (
            <TableRow key={course.id}>
              <TableCell>{course.course_code}</TableCell>
              <TableCell>{course.course_title}</TableCell>
              <TableCell>
                <Button onClick={() => openForEdit(course)}>Edit</Button>
                <Button onClick={() => openDialog(course.id, course.course_title)}>Delete</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />

      {/* Sheet */}
      <Sheet open={isOpen} onOpenChange={close}>
        <SheetContent>
          <SheetTitle>{isEditing ? 'Edit' : 'Create'} Course</SheetTitle>
          {/* Form here */}
        </SheetContent>
      </Sheet>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{itemName}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFileUpload} hidden />
    </div>
  )
}
```

---

## Benefits

1. **Reduced Boilerplate**: 80% less code in CRUD pages
2. **Consistency**: All pages use the same patterns
3. **Type Safety**: Full TypeScript support
4. **Maintainability**: Centralized logic
5. **Performance**: Optimized with caching and debouncing
6. **DX**: Excellent developer experience with clear APIs

---

## Contributing

When creating new hooks:
1. Add TypeScript types
2. Include JSDoc comments
3. Provide usage examples
4. Update this guide
5. Test thoroughly

---

**Questions?** Check existing pages for real-world usage examples.
