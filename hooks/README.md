# Custom Hooks Documentation

This directory contains all custom React hooks for the JKKN COE (Controller of Examination) application. These hooks are organized by functionality and designed to promote code reusability, maintainability, and developer productivity.

## Folder Structure

The hooks are organized to align with the COE application architecture:

```
hooks/
├── index.ts                    # Barrel export file for all hooks
├── common/                     # Shared hooks used across all modules
│   ├── use-api.ts             # Generic API requests
│   ├── use-crud.ts            # CRUD operations
│   ├── use-data-table.ts      # Table management
│   ├── use-sheet.ts           # Sheet/modal state
│   ├── use-confirm-dialog.ts  # Confirmation dialogs
│   ├── use-excel-import.ts    # Excel import
│   ├── use-excel-export.ts    # Excel export
│   ├── use-dropdown-data.ts   # Dropdown options
│   ├── use-debounce.ts        # Debounce utility
│   ├── use-local-storage.ts   # LocalStorage sync
│   ├── use-toggle.ts          # Boolean toggle
│   ├── use-async.ts           # Async operations
│   ├── use-copy-to-clipboard.ts # Clipboard operations
│   ├── use-media-query.ts     # Responsive design
│   ├── use-window-size.ts     # Window dimensions
│   ├── use-on-click-outside.ts # Click outside detection
│   ├── use-scroll-position.ts # Scroll tracking
│   ├── use-key-press.ts       # Keyboard events
│   ├── use-event-listener.ts  # Event management
│   ├── use-interval.ts        # Intervals & timeouts
│   ├── use-array.ts           # Array utilities
│   ├── use-advanced-filter.ts # Advanced filtering
│   ├── use-advanced-sort.ts   # Multi-column sorting
│   ├── use-form-validation.ts # Form validation
│   └── use-toast.ts           # Toast notifications
├── auth/                       # Authentication & authorization
│   ├── use-auth-guard.tsx     # Route protection
│   ├── use-permission-sync.tsx # Permission sync
│   └── use-session-timeout.ts # Session timeout
├── course-management/          # Course-related hooks
│   └── use-course-mapping.ts  # Course mapping service
├── exam-management/            # Examination-related hooks
│   ├── use-exam-schedule.ts   # Exam scheduling
│   ├── use-exam-rooms.ts      # Room management
│   ├── use-exam-registrations.ts # Exam registrations
│   └── use-exam_timetable.ts  # Timetable management
├── grading/                    # Grading & result processing
│   ├── use-grade-calculator.ts # Grade calculations
│   └── use-result-processor.ts # Result processing
├── master/                     # Master data management
│   └── use-regulations.ts     # Regulations management
├── users/                      # User management
│   └── use-students.ts        # Student operations
└── mobile/                     # Mobile-specific hooks
    └── use-mobile.tsx         # Mobile detection
```

## Import Methods

### Method 1: Import from index (Recommended)

Import multiple hooks from the barrel export for better tree-shaking:

```typescript
import { useAPI, useCRUD, useDataTable, useSheet } from '@/hooks'
```

### Method 2: Direct import from folder

Import directly from the specific folder when needed:

```typescript
import { useAPI } from '@/hooks/common/use-api'
import { useAuthGuard } from '@/hooks/auth/use-auth-guard'
import { useExamSchedule } from '@/hooks/exam-management/use-exam-schedule'
```

## Table of Contents

- [Data Fetching Hooks](#data-fetching-hooks) - `common/`
- [Table Management Hooks](#table-management-hooks) - `common/`
- [Form & UI Hooks](#form--ui-hooks) - `common/`
- [Excel Hooks](#excel-hooks) - `common/`
- [Utility Hooks](#utility-hooks) - `common/`
- [UI/UX Hooks](#uiux-hooks) - `common/`
- [Interaction Hooks](#interaction-hooks) - `common/`
- [Data Manipulation Hooks](#data-manipulation-hooks) - `common/`
- [Examination-Specific Hooks](#examination-specific-hooks) - `exam-management/`, `grading/`
- [Auth & Permission Hooks](#auth--permission-hooks) - `auth/`
- [Course Management Hooks](#course-management-hooks) - `course-management/`
- [Master Data Hooks](#master-data-hooks) - `master/`
- [User Management Hooks](#user-management-hooks) - `users/`
- [Mobile Hooks](#mobile-hooks) - `mobile/`

---

## Data Fetching Hooks

### `useAPI`

Generic hook for making API requests with loading and error states.

```typescript
import { useAPI } from '@/hooks'

const { data, loading, error, execute, reset } = useAPI()

// GET request
const courses = await execute('/api/courses')

// POST request
const newCourse = await execute('/api/courses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(courseData)
})
```

### `useCRUD`

Full CRUD operations hook with automatic state management and toast notifications.

```typescript
import { useCRUD } from '@/hooks'

const {
  items: courses,
  loading,
  createItem,
  updateItem,
  deleteItem,
  refreshItems
} = useCRUD<Course>({
  apiEndpoint: '/api/courses',
  entityName: 'Course'
})

await createItem(newCourseData)
await updateItem(course.id, updatedData)
await deleteItem(course.id)
```

### `useDropdownData`

Fetch and manage dropdown/select options from API endpoints.

```typescript
import { useDropdownData } from '@/hooks'

const { data: institutions, loading } = useDropdownData('/api/institutions')
```

---

## Table Management Hooks

### `useDataTable`

Comprehensive data table management with search, sort, pagination, filters, and selection.

```typescript
import { useDataTable } from '@/hooks'

const {
  paginatedData,
  searchTerm,
  setSearchTerm,
  sortField,
  handleSort,
  currentPage,
  setCurrentPage,
  totalPages,
  selectedItems,
  toggleSelection
} = useDataTable({
  data: courses,
  initialPageSize: 10,
  searchableFields: ['course_code', 'course_title'],
})
```

---

## Form & UI Hooks

### `useSheet`

Manage sheet/modal state and edit mode.

```typescript
import { useSheet } from '@/hooks'

const { isOpen, isEditing, editingItem, open, close, openForEdit } = useSheet<Course>()

// Open for create
open()

// Open for edit
openForEdit(course)

// Close
close()
```

### `useConfirmDialog`

Manage confirmation dialogs for destructive actions.

```typescript
import { useConfirmDialog } from '@/hooks'

const { isOpen, confirm } = useConfirmDialog()

const handleDelete = async () => {
  const confirmed = await confirm({
    title: 'Delete Course',
    message: 'Are you sure you want to delete this course?'
  })

  if (confirmed) {
    await deleteItem(id)
  }
}
```

### `useFormValidation`

Reusable form validation with multiple validation rules per field.

```typescript
import { useFormValidation, ValidationPresets } from '@/hooks'

const { errors, validate, clearErrors } = useFormValidation({
  course_code: [
    ValidationPresets.required(),
    ValidationPresets.alphanumericWithSpecial()
  ],
  credits: [
    ValidationPresets.required(),
    ValidationPresets.range(0, 10)
  ]
})

const handleSubmit = () => {
  if (!validate(formData)) {
    return // Validation failed
  }
  // Proceed with submission
}
```

---

## Excel Hooks

### `useExcelImport`

Handle Excel file imports with validation and error tracking.

```typescript
import { useExcelImport } from '@/hooks'

const {
  importing,
  importErrors,
  importSummary,
  showErrorDialog,
  handleFileUpload,
  triggerFileInput,
  fileInputRef
} = useExcelImport<Course>({
  onImport: async (courses) => {
    // Import logic
    return errors // Return array of errors
  },
  validateRow: (row, index) => {
    const errors = []
    if (!row.course_code) errors.push('Course code required')
    return errors.length > 0 ? errors : null
  },
  entityName: 'Course'
})
```

### `useExcelExport`

Export data to Excel files.

```typescript
import { useExcelExport } from '@/hooks'

const { exportToExcel, exporting } = useExcelExport()

exportToExcel(courses, 'courses.xlsx', {
  sheetName: 'Courses',
  columns: ['course_code', 'course_title', 'credits']
})
```

---

## Utility Hooks

### `useDebounce`

Debounce a value to reduce unnecessary updates.

```typescript
import { useDebounce } from '@/hooks'

const [searchTerm, setSearchTerm] = useState('')
const debouncedSearch = useDebounce(searchTerm, 500)

useEffect(() => {
  fetchResults(debouncedSearch)
}, [debouncedSearch])
```

### `useLocalStorage`

Sync state with localStorage with cross-tab support.

```typescript
import { useLocalStorage } from '@/hooks'

const [theme, setTheme, removeTheme] = useLocalStorage('theme', 'light')
setTheme('dark') // Automatically syncs to localStorage
```

### `useToggle`

Simple boolean toggle state management.

```typescript
import { useToggle } from '@/hooks'

const [isOpen, toggle, setIsOpen] = useToggle(false)
toggle() // Toggles between true/false
setIsOpen(true) // Set to specific value
```

### `useAsync`

Handle async operations with loading and error states.

```typescript
import { useAsync } from '@/hooks'

const { data, loading, error, execute } = useAsync(
  async () => {
    const response = await fetch('/api/courses')
    return response.json()
  },
  { immediate: true }
)
```

### `useCopyToClipboard`

Copy text to clipboard with feedback.

```typescript
import { useCopyToClipboard } from '@/hooks'

const { copied, copy } = useCopyToClipboard()

<button onClick={() => copy('Text to copy')}>
  {copied ? 'Copied!' : 'Copy'}
</button>
```

---

## UI/UX Hooks

### `useMediaQuery`

Responsive design using media queries.

```typescript
import { useMediaQuery, useIsMobile, useIsTablet, useIsDesktop } from '@/hooks'

const isMobile = useIsMobile()
const isTablet = useIsTablet()
const isDesktop = useIsDesktop()
const isDark = useMediaQuery('(prefers-color-scheme: dark)')
```

### `useWindowSize`

Track window dimensions for responsive layouts.

```typescript
import { useWindowSize } from '@/hooks'

const { width, height } = useWindowSize()

if (width < 768) {
  // Mobile layout
}
```

### `useOnClickOutside`

Detect clicks outside a referenced element.

```typescript
import { useOnClickOutside } from '@/hooks'

const ref = useRef<HTMLDivElement>(null)
useOnClickOutside(ref, () => {
  setIsOpen(false)
})

return <div ref={ref}>Click outside me!</div>
```

### `useScrollPosition`

Track scroll position with debouncing.

```typescript
import { useScrollPosition, useScrollThreshold } from '@/hooks'

const { x, y } = useScrollPosition()
const hasScrolled = useScrollThreshold(100)

{hasScrolled && <BackToTopButton />}
```

---

## Interaction Hooks

### `useKeyPress`

Detect key presses and combinations.

```typescript
import { useKeyPress, useKeyCombo } from '@/hooks'

const enterPressed = useKeyPress('Enter')
const escapePressed = useKeyPress('Escape')

useKeyCombo(['Control', 's'], (event) => {
  event.preventDefault()
  handleSave()
})
```

### `useEventListener`

Manage event listeners with automatic cleanup.

```typescript
import { useEventListener } from '@/hooks'

useEventListener('resize', handleResize)

// With element ref
const ref = useRef<HTMLDivElement>(null)
useEventListener('click', handleClick, ref)
```

### `useInterval` & `useTimeout`

Manage intervals and timeouts with React hooks.

```typescript
import { useInterval, useTimeout } from '@/hooks'

const [count, setCount] = useState(0)

useInterval(() => {
  setCount(count + 1)
}, 1000)

useTimeout(() => {
  console.log('Delayed execution')
}, 5000)
```

---

## Data Manipulation Hooks

### `useArray`

Array state management with utility methods.

```typescript
import { useArray } from '@/hooks'

const { array, push, remove, update, filter, sort, clear } = useArray<Course>([])

push(newCourse)
remove((c) => c.id === courseId)
update((c) => c.id === courseId, updatedCourse)
filter((c) => c.credits >= 3)
sort((a, b) => a.course_code.localeCompare(b.course_code))
```

### `useAdvancedFilter`

Advanced filtering with multiple filter operations.

```typescript
import { useAdvancedFilter } from '@/hooks'

const {
  filteredData,
  addFilter,
  removeFilter,
  clearFilters
} = useAdvancedFilter(courses)

addFilter({ field: 'credits', operator: 'gte', value: 3 })
addFilter({ field: 'course_code', operator: 'contains', value: 'CS' })
```

### `useAdvancedSort`

Multi-column sorting with toggle functionality.

```typescript
import { useAdvancedSort } from '@/hooks'

const {
  sortedData,
  sortBy,
  addSort,
  toggleSort,
  clearSort
} = useAdvancedSort(courses)

sortBy('credits', 'desc')
addSort('course_title', 'asc') // Multi-column sort
toggleSort('course_code') // Toggle sort direction
```

---

## Examination-Specific Hooks

Located in `hooks/exam-management/` and `hooks/grading/`

### `useExamSchedule` (`exam-management/`)

Manage examination schedules with auto-status updates.

```typescript
import { useExamSchedule } from '@/hooks'

const {
  exams,
  upcomingExams,
  todayExams,
  stats,
  addExam,
  updateExam,
  hasConflict
} = useExamSchedule(examSessions)

addExam({
  id: '1',
  examName: 'Mid Term',
  courseCode: 'CS101',
  date: new Date(),
  startTime: '09:00',
  endTime: '12:00',
  duration: 180,
  status: 'upcoming'
})
```

### `useExamRooms` (`exam-management/`)

Manage examination room allocation and availability.

```typescript
import { useExamRooms } from '@/hooks'

const {
  rooms,
  loading,
  createRoom,
  updateRoom,
  deleteRoom,
  checkAvailability
} = useExamRooms()
```

### `useExamRegistrations` (`exam-management/`)

Handle student exam registrations and eligibility.

```typescript
import { useExamRegistrations } from '@/hooks'

const {
  registrations,
  loading,
  registerStudent,
  updateRegistration,
  cancelRegistration,
  checkEligibility
} = useExamRegistrations()
```

### `useExamTimetable` (`exam-management/`)

Manage exam timetable creation and conflicts.

```typescript
import { useExamTimetable } from '@/hooks'

const {
  timetable,
  loading,
  createSlot,
  updateSlot,
  deleteSlot,
  detectConflicts
} = useExamTimetable()
```

### `useGradeCalculator` (`grading/`)

Grade and CGPA calculations for examination results.

```typescript
import { useGradeCalculator } from '@/hooks'

const { calculateGrade, calculateCGPA, calculatePercentage } = useGradeCalculator()

const grade = calculateGrade(85) // Returns { grade: 'A+', gradePoint: 9, ... }
const cgpaResult = calculateCGPA([
  { courseCode: 'CS101', credits: 4, marksObtained: 85, maxMarks: 100 },
  { courseCode: 'CS102', credits: 3, marksObtained: 78, maxMarks: 100 }
])
```

### `useResultProcessor` (`grading/`)

Process and analyze examination results with statistics.

```typescript
import { useResultProcessor } from '@/hooks'

const {
  processedResults,
  statistics,
  processResults,
  filterByStatus,
  getTopPerformers,
  exportToCSV
} = useResultProcessor()

processResults(studentMarks)

const passedStudents = filterByStatus('pass')
const topTen = getTopPerformers(10)
const csvData = exportToCSV()
```

---

## Auth & Permission Hooks

### `useAuthGuard`

Route protection based on authentication and permissions.

```typescript
import { useAuthGuard } from '@/hooks'

useAuthGuard({
  requiredPermissions: ['courses:read'],
  requiredRoles: ['admin', 'teacher'],
  redirectTo: '/login'
})
```

### `usePermissionSync`

Real-time permission synchronization across tabs.

```typescript
import { usePermissionSync } from '@/hooks'

usePermissionSync(userId, onPermissionChange)
```

### `useSessionTimeout`

Handle session timeout with warnings.

```typescript
import { useSessionTimeout } from '@/hooks'

useSessionTimeout({
  timeout: 15, // minutes
  warning: 2, // minutes before timeout
  onTimeout: () => {
    logout()
  }
})
```

---

## Course Management Hooks

Located in `hooks/course-management/`

### `useCourseMappingService`

Service hook for course mapping operations.

```typescript
import { useCourseMappingService } from '@/hooks'

const {
  courseMappings,
  loading,
  createMapping,
  updateMapping,
  deleteMapping
} = useCourseMappingService()
```

---

## Master Data Hooks

Located in `hooks/master/`

### `useRegulations`

Manage academic regulations data.

```typescript
import { useRegulations } from '@/hooks'

const {
  regulations,
  loading,
  createRegulation,
  updateRegulation,
  deleteRegulation
} = useRegulations()
```

---

## User Management Hooks

Located in `hooks/users/`

### `useStudents`

Student management operations.

```typescript
import { useStudents } from '@/hooks'

const {
  students,
  loading,
  createStudent,
  updateStudent,
  deleteStudent,
  searchStudents
} = useStudents()
```

---

## Mobile Hooks

Located in `hooks/mobile/`

### `useMobile`

Mobile device detection and responsive behavior.

```typescript
import { useMobile } from '@/hooks'

const { isMobile, isTablet } = useMobile()

if (isMobile) {
  // Render mobile layout
}
```

---

## Best Practices

1. **Import from index**: Always import hooks from `@/hooks` for better tree-shaking
   ```typescript
   import { useAPI, useCRUD } from '@/hooks'
   ```

2. **Type Safety**: Use TypeScript generics for type-safe hooks
   ```typescript
   const { items } = useCRUD<Course>({ apiEndpoint: '/api/courses' })
   ```

3. **Memoization**: Hooks with expensive computations use `useMemo` internally
4. **Cleanup**: All event listeners and intervals are automatically cleaned up
5. **SSR Compatible**: Hooks check for `window` availability for Next.js SSR

---

## Contributing

When adding new hooks:

1. **Determine the appropriate folder** based on the COE module structure:
   - `common/` - Shared hooks used across all modules
   - `auth/` - Authentication and authorization hooks
   - `course-management/` - Course-related hooks
   - `exam-management/` - Examination-related hooks
   - `grading/` - Grading and result processing hooks
   - `master/` - Master data management hooks
   - `users/` - User management hooks
   - `mobile/` - Mobile-specific hooks

2. **Create the hook file** in the appropriate folder (e.g., `hooks/common/use-my-hook.ts`)

3. **Export it from `hooks/index.ts`** under the appropriate section:
   ```typescript
   // Add to the relevant section
   export { useMyHook } from './common/use-my-hook'
   ```

4. **Add JSDoc comments** with usage examples and parameter descriptions

5. **Follow naming conventions**:
   - Hook name: `use[HookName]` (camelCase)
   - File name: `use-[hook-name].ts` (kebab-case)

6. **Update this README** with:
   - Hook description
   - Usage examples
   - Import statements
   - Add to the appropriate section

7. **Type Safety**: Use TypeScript generics where applicable
   ```typescript
   export function useMyCRUD<T>() {
     // Hook implementation
   }
   ```

---

## License

Internal use for JKKN COE Application
