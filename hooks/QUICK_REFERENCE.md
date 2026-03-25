# Hooks Quick Reference Guide

Quick reference for all custom hooks in JKKN COE application.

## 📊 Data Fetching

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useAPI` | Generic API requests | Loading states, error handling, automatic reset |
| `useCRUD` | Full CRUD operations | Auto state management, toast notifications, refresh |
| `useDropdownData` | Dropdown options | Cached data, loading states |

## 📋 Table Management

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useDataTable` | Complete table state | Search, sort, pagination, filters, selection |

## 📝 Forms & UI

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useSheet` | Modal/sheet management | Edit mode, auto reset, callbacks |
| `useConfirmDialog` | Confirmation dialogs | Promise-based, customizable |
| `useFormValidation` | Form validation | Multiple rules, presets, inline errors |

## 📑 Excel Operations

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useExcelImport` | Import from Excel | Row validation, error tracking, progress |
| `useExcelExport` | Export to Excel | Custom columns, formatting, multiple sheets |

## 🔧 Utilities

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useDebounce` | Debounce values | Configurable delay, performance optimization |
| `useLocalStorage` | localStorage sync | Cross-tab sync, SSR safe, auto serialization |
| `useToggle` | Boolean toggle | Simple state management |
| `useAsync` | Async operations | Loading, error states, cancellation |
| `useCopyToClipboard` | Copy to clipboard | Toast feedback, timeout reset |

## 🎨 UI/UX

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useMediaQuery` | Responsive design | Breakpoint detection, theme detection |
| `useIsMobile/Tablet/Desktop` | Device detection | Predefined breakpoints |
| `useWindowSize` | Window dimensions | Real-time updates, SSR safe |
| `useOnClickOutside` | Outside click detection | Dropdown/modal closing |
| `useScrollPosition` | Scroll tracking | Debounced, back-to-top button |
| `useScrollThreshold` | Scroll threshold | Simple boolean check |

## ⌨️ Interactions

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useKeyPress` | Key detection | Single key, press/release states |
| `useKeyCombo` | Keyboard shortcuts | Multi-key combinations, preventDefault |
| `useEventListener` | Event management | Auto cleanup, element/window targeting |
| `useInterval` | Interval management | Auto cleanup, pause/resume |
| `useTimeout` | Timeout management | Auto cleanup, delay control |

## 🔢 Data Manipulation

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useArray` | Array operations | Push, remove, update, sort, filter |
| `useAdvancedFilter` | Multi-filter | Operators (equals, contains, gt, lt, between, in) |
| `useAdvancedSort` | Multi-column sort | Toggle direction, priority sorting |

## 🎓 Examination-Specific

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useGradeCalculator` | Grade & CGPA | Customizable grading scale, percentage calculation |
| `useExamSchedule` | Exam scheduling | Auto status updates, conflict detection, statistics |
| `useResultProcessor` | Result processing | Statistics, filtering, top performers, CSV export |

## 🔐 Auth & Permissions

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useAuthGuard` | Route protection | Permission/role checking, auto redirect |
| `usePermissionSync` | Permission sync | Real-time updates, cross-tab |
| `useSessionTimeout` | Session management | Warning notifications, auto logout |

---

## Common Patterns

### API Call with Loading State
```typescript
const { data, loading, execute } = useAPI()
const courses = await execute('/api/courses')
```

### CRUD with Auto Refresh
```typescript
const { items, createItem, updateItem, deleteItem } = useCRUD<Course>({
  apiEndpoint: '/api/courses',
  entityName: 'Course'
})
```

### Form with Validation
```typescript
const { errors, validate } = useFormValidation({
  field: [ValidationPresets.required(), ValidationPresets.email()]
})
if (!validate(formData)) return
```

### Table with Everything
```typescript
const {
  paginatedData,
  searchTerm,
  setSearchTerm,
  handleSort,
  currentPage,
  setCurrentPage
} = useDataTable({
  data: courses,
  searchableFields: ['course_code', 'course_title']
})
```

### Grade Calculation
```typescript
const { calculateCGPA } = useGradeCalculator()
const result = calculateCGPA(courseResults)
console.log(`CGPA: ${result.cgpa}`)
```

### Responsive Design
```typescript
const isMobile = useIsMobile()
const { width } = useWindowSize()
return isMobile ? <MobileView /> : <DesktopView />
```

### Keyboard Shortcuts
```typescript
useKeyCombo(['Control', 's'], () => {
  handleSave()
})
```

---

## Performance Tips

1. **Debouncing**: Use `useDebounce` for search inputs
2. **Memoization**: Hooks internally use `useMemo` and `useCallback`
3. **SSR**: All hooks are SSR-safe (check for `window`)
4. **Cleanup**: Event listeners and intervals auto-cleanup
5. **Type Safety**: Use TypeScript generics for better DX

---

## Quick Import Examples

```typescript
// Single import
import { useAPI } from '@/hooks'

// Multiple imports
import {
  useAPI,
  useCRUD,
  useDataTable,
  useFormValidation
} from '@/hooks'

// With types
import {
  useExcelImport,
  type ImportError,
  type ImportSummary
} from '@/hooks'
```
