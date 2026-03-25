# 5-Layer Refactoring Quick Reference

## ⚡ Quick Commands

```bash
# Basic generation (types + services)
node generate-5-layer.js <entity-name>

# Full generation (types + services + hook + validation + export)
node generate-5-layer.js <entity-name> --with-hook --with-validation --with-export

# Preview (dry run)
node generate-5-layer.js <entity-name> --with-hook --dry-run

# Batch generate all entities
node batch-generate.js

# Batch dry run
node batch-generate.js --dry-run
```

## 📁 File Structure Pattern

```
<entity-name>/
├── types/<entity>.ts              # Layer 1: Types
├── services/<entity>-service.ts   # Layer 2: Services
├── hooks/use-<entity>.ts          # Layer 3: Hook
└── lib/utils/<entity>/
    ├── validation.ts              # Layer 3: Validation
    └── export-import.ts           # Layer 3: Export/Import
```

## 🎯 5-Layer Architecture

| Layer | Location | Purpose | Example |
|-------|----------|---------|---------|
| 1 | `types/` | Type definitions | `Course`, `CourseFormData` |
| 2 | `services/` | API calls | `fetchCourses()`, `createCourse()` |
| 3 | `hooks/` | State management | `useCourses()` |
| 3 | `lib/utils/` | Business logic | `validateCourseData()`, `exportToExcel()` |
| 5 | `app/coe/` | UI components | Page component |

## 📝 Import Pattern in page.tsx

```typescript
// Types
import type { Course } from '@/types/courses'

// Hook (recommended - includes state + CRUD)
import { useCourses } from '@/hooks/use-courses'

// OR Services (if not using hook)
import {
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse
} from '@/services/courses-service'

// Utilities
import { validateCourseData } from '@/lib/utils/courses/validation'
import { exportToExcel, exportToJSON } from '@/lib/utils/courses/export-import'
```

## 🔧 Custom Hook Usage

```typescript
export default function CoursesPage() {
  // Get everything from custom hook
  const {
    courses,          // State: array of items
    loading,          // State: loading indicator
    saveCourse,       // Function: create or update
    removeCourse,     // Function: delete
    refreshCourses,   // Function: reload data
  } = useCourses()

  // Your UI code here...
}
```

## ✅ Refactoring Checklist

**Before Starting:**
- [ ] Identify the entity name (e.g., "courses", "exam-rooms")
- [ ] Note the current line count of page.tsx
- [ ] Backup the current page.tsx file

**Step 1: Generate Boilerplate**
```bash
cd scripts/refactoring-automation
node generate-5-layer.js <entity> --with-hook --with-validation --with-export
```

**Step 2: Extract Types**
- [ ] Find `interface` or `type` definitions in page.tsx
- [ ] Copy to `types/<entity>.ts`
- [ ] Remove from page.tsx

**Step 3: Extract Services**
- [ ] Find `fetch()` calls in page.tsx
- [ ] Move to `services/<entity>-service.ts`
- [ ] Update function names (e.g., `fetch` → `fetchCourses`)
- [ ] Remove from page.tsx

**Step 4: Extract Validation**
- [ ] Find validation functions (e.g., `validate()`)
- [ ] Move to `lib/utils/<entity>/validation.ts`
- [ ] Remove from page.tsx

**Step 5: Extract Export/Import**
- [ ] Find Excel/JSON export functions
- [ ] Move to `lib/utils/<entity>/export-import.ts`
- [ ] Remove from page.tsx

**Step 6: Update page.tsx**
- [ ] Add imports for types, hook, utilities
- [ ] Replace inline logic with hook usage
- [ ] Replace inline validation with utility calls
- [ ] Replace inline export with utility calls
- [ ] Test all functionality

**Step 7: Verify**
- [ ] TypeScript compilation passes
- [ ] CRUD operations work
- [ ] Validation works
- [ ] Export/import works
- [ ] Check new line count (should be 25-35% less)

## 🎨 Code Templates

### Basic Page with Hook
```typescript
"use client"

import { useCourses } from '@/hooks/use-courses'

export default function CoursesPage() {
  const { courses, loading, saveCourse, removeCourse } = useCourses()

  if (loading) return <div>Loading...</div>

  return (
    <div>
      {/* Your UI here */}
    </div>
  )
}
```

### Form with Validation
```typescript
import { validateCourseData } from '@/lib/utils/courses/validation'

const handleSubmit = () => {
  const errors = validateCourseData(formData)
  if (Object.keys(errors).length > 0) {
    setErrors(errors)
    return
  }

  saveCourse(formData, editing)
}
```

### Export Button
```typescript
import { exportToExcel } from '@/lib/utils/courses/export-import'

<Button onClick={() => exportToExcel(courses)}>
  Export to Excel
</Button>
```

## 📊 Expected Metrics

| Metric | Target |
|--------|--------|
| Line Reduction | 25-35% |
| Files Created | 3-5 per entity |
| Type Safety | 100% (no `any` types) |
| Code Reusability | Services reusable across pages |
| Maintainability | +20 points on index |

## 🚀 Batch Processing

For multiple entities at once:

```bash
# Edit batch-generate.js to add your entities
# Then run:
node batch-generate.js

# Or dry run first:
node batch-generate.js --dry-run
```

## 💡 Pro Tips

1. **Always dry run first**: Use `--dry-run` to preview
2. **Generate everything**: Use all flags for complex pages
3. **Review generated code**: Update TODOs with actual logic
4. **Test incrementally**: Test each step before moving to next
5. **Use custom hooks**: They dramatically simplify page components

## 🐛 Common Issues

**Import not found**
- Check the entity name matches the file name
- Verify the file was created in the correct location

**Type errors**
- Update generated type definitions with your actual fields
- Make sure FormData omits the correct fields

**Hook not updating state**
- Check that you're calling the hook at the component level
- Verify the API endpoints match the service function calls

## 📚 References

- [Full README](./README.md)
- [Refactoring Summary](../../REFACTORING_SUMMARY.md)
- [Development Standards](../../.cursor/rules/DEVELOPMENT_STANDARDS.md)

---

**Quick Help:** `node generate-5-layer.js --help`
