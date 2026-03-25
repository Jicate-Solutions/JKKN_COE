# Exam Registrations Page Integration Guide

## Overview
This guide shows how to integrate all the completed modules into `app/coe/exam-registrations/page.tsx`.

All supporting modules are **100% complete** and ready to use:
- ✅ `types/exam-registrations.ts` - Type definitions
- ✅ `services/exam-registrations-service.ts` - API calls
- ✅ `hooks/use-exam-registrations.ts` - State management & business logic
- ✅ `lib/utils/exam-registrations/validation.ts` - Form & import validation
- ✅ `lib/utils/exam-registrations/export-import.ts` - Excel/JSON export

## Step 1: Update Imports

### Replace This:
```typescript
import { useMemo, useState, useEffect } from "react"
import * as XLSX from "xlsx"

// Inline type definition
interface ExamRegistration {
  id: string
  // ... 23 fields
}
```

### With This:
```typescript
import { useState, useEffect } from "react"
import type { ExamRegistration } from "@/types/exam-registrations"
import { useExamRegistrations } from "@/hooks/use-exam-registrations"
import { validateExamRegistrationData, validateExamRegistrationImport } from "@/lib/utils/exam-registrations/validation"
import { exportToJSON, exportToExcel, exportTemplate } from "@/lib/utils/exam-registrations/export-import"
```

**Changes:**
- Remove inline type definition (now imported from types)
- Remove `useMemo` (now handled in hook)
- Remove `XLSX` import (now in export-import module)
- Add 4 new imports for hook, validation, and export functions

---

## Step 2: Replace State Management

### Remove These Lines (~80 lines of state):
```typescript
const { toast } = useToast()
const [items, setItems] = useState<ExamRegistration[]>([])
const [loading, setLoading] = useState(true)

// Dropdown state
const [institutions, setInstitutions] = useState<Array<...>>([])
const [allStudents, setAllStudents] = useState<Array<...>>([])
const [allExaminationSessions, setAllExaminationSessions] = useState<Array<...>>([])
const [allCourseOfferings, setAllCourseOfferings] = useState<Array<...>>([])

// Filtered dropdowns
const [filteredStudents, setFilteredStudents] = useState<Array<...>>([])
const [filteredExaminationSessions, setFilteredExaminationSessions] = useState<Array<...>>([])
const [filteredCourseOfferings, setFilteredCourseOfferings] = useState<Array<...>>([])
```

### Replace With This Single Hook Call:
```typescript
const { toast } = useToast()

// Use the custom hook - handles all state and business logic
const {
  examRegistrations,
  loading,
  setLoading,
  saveExamRegistration,
  removeExamRegistration,
  refreshExamRegistrations,
  // Dropdown data
  institutions,
  filteredStudents,
  filteredExaminationSessions,
  filteredCourseOfferings,
  // Dropdown control
  selectedInstitutionId,
  setSelectedInstitutionId,
} = useExamRegistrations()

// Keep UI state in page component
const [items, setItems] = useState<ExamRegistration[]>([])
const [sheetOpen, setSheetOpen] = useState(false)
const [editing, setEditing] = useState<ExamRegistration | null>(null)
const [searchTerm, setSearchTerm] = useState("")
const [statusFilter, setStatusFilter] = useState("all")
// ... other UI-only state
```

**Changes:**
- Hook provides all exam registration data and CRUD functions
- Hook provides filtered dropdowns based on selected institution
- Keep only UI-related state in the component (sheet open, editing, search, filters, pagination)

---

## Step 3: Remove Fetch Functions

### Delete These Functions (~100 lines):
```typescript
const fetchExamRegistrations = async () => { ... }
const fetchInstitutions = async () => { ... }
const fetchStudents = async () => { ... }
const fetchExaminationSessions = async () => { ... }
const fetchCourseOfferings = async () => { ... }
```

### Replace With Hook Usage:
```typescript
// In useEffect, sync hook data with local state
useEffect(() => {
  setItems(examRegistrations)
}, [examRegistrations])

// Institution selection handler
const handleInstitutionChange = (institutionId: string) => {
  setSelectedInstitutionId(institutionId)
  setFormData({
    ...formData,
    institutions_id: institutionId,
    student_id: '',
    examination_session_id: '',
    course_offering_id: ''
  })
}
```

**Changes:**
- All fetching is handled by the hook automatically
- Hook provides `refreshExamRegistrations()` for manual refresh
- Dropdown filtering is automatic via `selectedInstitutionId`

---

## Step 4: Replace CRUD Operations

### Replace Save Function:
**Old (~50 lines):**
```typescript
const handleSave = async () => {
  try {
    const response = await fetch('/api/exam-registrations', {
      method: editing ? 'PUT' : 'POST',
      // ... manual API call
    })
    // ... manual state updates
    // ... manual toast
  } catch (error) {
    // ... error handling
  }
}
```

**New (~10 lines):**
```typescript
const handleSave = async () => {
  const validationErrors = validateExamRegistrationData(formData)
  if (Object.keys(validationErrors).length > 0) {
    setErrors(validationErrors)
    toast({
      title: '⚠️ Validation Error',
      description: 'Please fix all errors before submitting.',
      variant: 'destructive'
    })
    return
  }

  try {
    const saved = await saveExamRegistration(formData, editing)
    setItems(prev => editing
      ? prev.map(item => item.id === editing.id ? saved : item)
      : [saved, ...prev]
    )
    setSheetOpen(false)
    resetForm()
  } catch (error) {
    // Error already handled by hook with toast
  }
}
```

### Replace Delete Function:
**Old (~30 lines):**
```typescript
const handleDelete = async (id: string) => {
  try {
    const response = await fetch(`/api/exam-registrations?id=${id}`, {
      method: 'DELETE'
    })
    // ... manual state updates
    // ... manual toast
  } catch (error) {
    // ... error handling
  }
}
```

**New (~8 lines):**
```typescript
const handleDelete = async (id: string) => {
  try {
    await removeExamRegistration(id)
    setItems(prev => prev.filter(item => item.id !== id))
  } catch (error) {
    // Error already handled by hook with toast
  }
}
```

**Changes:**
- Use `validateExamRegistrationData()` for form validation
- Use `saveExamRegistration()` for create/update
- Use `removeExamRegistration()` for delete
- All toasts are handled automatically by the hook

---

## Step 5: Replace Validation

### Remove Inline Validation (~80 lines):
```typescript
const validate = () => {
  const e: Record<string, string> = {}
  if (!formData.institutions_id) e.institutions_id = 'Institution is required'
  if (!formData.student_id) e.student_id = 'Student is required'
  // ... 15+ more validations
  setErrors(e)
  return Object.keys(e).length === 0
}
```

### Replace With Imported Function:
```typescript
// At the top of handleSave or handleSubmit
const validationErrors = validateExamRegistrationData(formData)
if (Object.keys(validationErrors).length > 0) {
  setErrors(validationErrors)
  toast({
    title: '⚠️ Validation Error',
    description: 'Please fix all errors before submitting.',
    variant: 'destructive'
  })
  return
}
```

**Validation Includes:**
- Required fields (institution, student, session, course, date, status, attempt)
- Date format validation (YYYY-MM-DD)
- Numeric range validation (fee_amount 0-999,999.99, attempt 1-10)
- Conditional validation (payment_date requires fee_paid, approved_date requires approved_by)
- String length limits (transaction_id 100, register_no 50, student_name 200, remarks 500)

---

## Step 6: Replace Export/Import Functions

### Delete Inline Export Functions (~150 lines):
```typescript
const exportToExcel = () => {
  const excelData = items.map(item => ({ ... }))
  const ws = XLSX.utils.json_to_sheet(excelData)
  // ... manual XLSX operations
}

const exportToJSON = () => {
  const json = JSON.stringify(items, null, 2)
  // ... manual download
}

const exportTemplate = () => {
  // ... manual template creation
}
```

### Replace With Imported Functions:
```typescript
import { exportToJSON, exportToExcel, exportTemplate } from "@/lib/utils/exam-registrations/export-import"

// In your UI buttons:
<Button onClick={() => exportToExcel(filteredItems)}>
  <FileSpreadsheet className="mr-2 h-4 w-4" />
  Export to Excel
</Button>

<Button onClick={() => exportToJSON(filteredItems)}>
  Export to JSON
</Button>

<Button onClick={exportTemplate}>
  Download Template
</Button>
```

**Export Features:**
- JSON export with all 23 fields + 5 relation fields
- Excel export with 23 optimized columns
- Template with 2 sheets (sample data + instructions)
- Mandatory fields marked with asterisks and red highlighting

---

## Step 7: Update Import/Upload Function

### Replace Import Validation:
**Old (~60 lines):**
```typescript
const handleFileUpload = async (jsonData: any[]) => {
  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i]
    const errors: string[] = []

    // Inline validation
    if (!row.institution_code) errors.push('Institution code required')
    if (!row.student_register_no) errors.push('Student register no required')
    // ... 10+ more validations

    if (errors.length > 0) {
      // ... error handling
    }
  }
}
```

**New (~40 lines):**
```typescript
import { validateExamRegistrationImport } from "@/lib/utils/exam-registrations/validation"

const handleFileUpload = async (jsonData: any[]) => {
  const errorDetails: Array<{
    row: number
    student_register_no: string
    course_code: string
    errors: string[]
  }> = []

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i]
    const rowNumber = i + 2 // +2 for Excel header row

    // Use imported validation
    const errors = validateExamRegistrationImport(row, rowNumber)

    if (errors.length > 0) {
      errorDetails.push({
        row: rowNumber,
        student_register_no: row.student_register_no || 'N/A',
        course_code: row.course_code || 'N/A',
        errors
      })
      continue
    }

    // If valid, create the registration
    // ... API call
  }

  // Show errors if any
  if (errorDetails.length > 0) {
    setImportErrors(errorDetails)
    setErrorPopupOpen(true)
  }
}
```

**Import Validation Includes:**
- Required fields validation
- Date format validation
- Boolean field validation (true/false, yes/no, 1/0)
- Numeric range validation
- String length validation
- Row-level error tracking for Excel import

---

## Step 8: Update Dropdown Cascade Logic

### Remove useMemo Filters:
```typescript
// DELETE these (now handled in hook)
const filteredStudents = useMemo(() => {
  if (!selectedInstitutionId) return []
  return allStudents.filter(s => s.institution_id === selectedInstitutionId)
}, [allStudents, selectedInstitutionId])

const filteredExaminationSessions = useMemo(() => {
  if (!selectedInstitutionId) return []
  return allExaminationSessions.filter(s => s.institutions_id === selectedInstitutionId)
}, [allExaminationSessions, selectedInstitutionId])

const filteredCourseOfferings = useMemo(() => {
  if (!selectedInstitutionId) return []
  return allCourseOfferings.filter(c => c.institutions_id === selectedInstitutionId)
}, [allCourseOfferings, selectedInstitutionId])
```

### Use Hook's Filtered Data Directly:
```typescript
// Institution dropdown
<Select
  value={formData.institutions_id}
  onValueChange={(value) => {
    setSelectedInstitutionId(value) // Update hook state
    setFormData({
      ...formData,
      institutions_id: value,
      student_id: '',           // Reset dependent fields
      examination_session_id: '',
      course_offering_id: ''
    })
  }}
>
  {institutions.map(inst => (
    <SelectItem key={inst.id} value={inst.id}>
      {inst.institution_code} - {inst.name}
    </SelectItem>
  ))}
</Select>

// Student dropdown (automatically filtered by hook)
<Select
  value={formData.student_id}
  onValueChange={(value) => setFormData({ ...formData, student_id: value })}
  disabled={!formData.institutions_id}
>
  {filteredStudents.map(student => (
    <SelectItem key={student.id} value={student.id}>
      {student.roll_number} - {student.first_name} {student.last_name}
    </SelectItem>
  ))}
</Select>

// Session dropdown (automatically filtered by hook)
<Select value={formData.examination_session_id} onValueChange={(value) => setFormData({ ...formData, examination_session_id: value })} disabled={!formData.institutions_id}>
  {filteredExaminationSessions.map(session => (
    <SelectItem key={session.id} value={session.id}>
      {session.session_code} - {session.session_name}
    </SelectItem>
  ))}
</Select>

// Course dropdown (automatically filtered by hook)
<Select value={formData.course_offering_id} onValueChange={(value) => setFormData({ ...formData, course_offering_id: value })} disabled={!formData.institutions_id}>
  {filteredCourseOfferings.map(course => (
    <SelectItem key={course.id} value={course.id}>
      {course.course_code} - {course.course_name}
    </SelectItem>
  ))}
</Select>
```

**Changes:**
- Hook provides `filteredStudents`, `filteredExaminationSessions`, `filteredCourseOfferings`
- Filtering is automatic when `selectedInstitutionId` changes
- Dropdowns are disabled when no institution is selected
- Dependent fields are reset when institution changes

---

## Expected Line Reduction

**Before:** 1924 lines
**After:** ~1350 lines (-30%)

**Removed:**
- ~80 lines: State declarations (moved to hook)
- ~100 lines: Fetch functions (moved to services)
- ~80 lines: Validation logic (moved to validation module)
- ~150 lines: Export/Import functions (moved to export-import module)
- ~60 lines: Dropdown filtering logic (moved to hook)
- ~50 lines: useMemo declarations (moved to hook)
- **Total:** ~520 lines removed

**Kept:**
- UI components (Card, Table, Sheet, Dialog)
- Form state and handlers
- Pagination logic
- Search and filter logic
- Error display components

---

## Testing Checklist

After integration, test:
- [ ] ✅ Fetch exam registrations on page load
- [ ] ✅ Create new exam registration
- [ ] ✅ Update existing exam registration
- [ ] ✅ Delete exam registration
- [ ] ✅ Form validation (all required fields, date formats, numeric ranges)
- [ ] ✅ Dropdown cascade (students/sessions/courses filter by institution)
- [ ] ✅ Excel export with all 23 columns
- [ ] ✅ JSON export with all fields
- [ ] ✅ Template download with 2 sheets
- [ ] ✅ Excel import with validation
- [ ] ✅ Error dialog with row numbers and specific errors
- [ ] ✅ Toast notifications for all operations
- [ ] ✅ Search and filter functionality
- [ ] ✅ Pagination
- [ ] ✅ Sorting

---

## Summary

All modules are **100% ready to use**. The page integration involves:

1. **Import modules** (4 lines)
2. **Replace state with hook** (~80 lines → 15 lines)
3. **Remove fetch functions** (~100 lines → 0 lines, handled by hook)
4. **Update CRUD operations** (~80 lines → 20 lines)
5. **Replace validation** (~80 lines → 5 lines)
6. **Replace export/import** (~150 lines → 3 function calls)
7. **Remove dropdown filtering** (~60 lines → 0 lines, handled by hook)

**Result:** Cleaner, more maintainable code with -30% line reduction.

---

**Status:** All modules ready ✅ | Page integration pending ⏳
**Estimated Integration Time:** 10-15 minutes
