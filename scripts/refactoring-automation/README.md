# 5-Layer Architecture Automation

Automated code generation tools to speed up refactoring of page.tsx files to follow the 5-layer architecture pattern.

## 🚀 Quick Start

### Basic Usage

```bash
# Navigate to the scripts directory
cd scripts/refactoring-automation

# Generate basic 5-layer structure (types + services only)
node generate-5-layer.js courses

# Generate with custom hook
node generate-5-layer.js courses --with-hook

# Generate complete structure (hook + validation + export/import)
node generate-5-layer.js courses --with-hook --with-validation --with-export

# Preview what would be created (dry run)
node generate-5-layer.js courses --with-hook --dry-run
```

### Options

| Option | Description |
|--------|-------------|
| `--with-hook` | Generate custom React hook for state management |
| `--with-validation` | Generate validation utilities |
| `--with-export` | Generate export/import utilities for Excel/JSON |
| `--force` | Overwrite existing files |
| `--dry-run` | Preview what would be created without creating files |

## 📁 Generated File Structure

Running `node generate-5-layer.js courses --with-hook --with-validation --with-export` creates:

```
jkkncoe/
├── types/
│   └── courses.ts                    # Type definitions
├── services/
│   └── courses-service.ts            # API service functions
├── hooks/
│   └── use-courses.ts                # Custom React hook
└── lib/utils/courses/
    ├── validation.ts                 # Validation functions
    └── export-import.ts              # Export/import utilities
```

## 📝 Generated Code Examples

### Layer 1: Types (`types/courses.ts`)

```typescript
export interface Course {
  id: string
  // TODO: Add fields based on your database schema
  created_at: string
  updated_at?: string
  is_active: boolean
}

export interface CourseFormData extends Omit<Course, 'id' | 'created_at' | 'updated_at'> {}

export interface CourseImportError {
  row: number
  errors: string[]
}
```

### Layer 2: Services (`services/courses-service.ts`)

```typescript
export async function fetchCourses(): Promise<Course[]>
export async function createCourse(data: CourseFormData): Promise<Course>
export async function updateCourse(id: string, data: CourseFormData): Promise<Course>
export async function deleteCourse(id: string): Promise<void>
```

### Layer 3: Hook (`hooks/use-courses.ts`)

```typescript
export function useCourses() {
  const { courses, loading, saveCourse, removeCourse, ... } = ...
  return { courses, loading, saveCourse, removeCourse }
}
```

### Layer 3: Validation (`lib/utils/courses/validation.ts`)

```typescript
export function validateCourseData(data: any): Record<string, string>
export function validateCourseImport(data: any, rowIndex: number): string[]
```

### Layer 3: Export/Import (`lib/utils/courses/export-import.ts`)

```typescript
export function exportToJSON(items: Course[]): void
export function exportToExcel(items: Course[]): void
export function exportTemplate(): void
```

## 🔧 Using Generated Code in page.tsx

After generating the files, update your `page.tsx`:

```typescript
"use client"

// Import types
import type { Course } from '@/types/courses'

// Import services (if not using hook)
import {
  fetchCourses,
  createCourse,
  updateCourse,
  deleteCourse
} from '@/services/courses-service'

// OR import custom hook (recommended)
import { useCourses } from '@/hooks/use-courses'

// Import utilities
import { validateCourseData } from '@/lib/utils/courses/validation'
import { exportToJSON, exportToExcel } from '@/lib/utils/courses/export-import'

export default function CoursesPage() {
  // Using custom hook (recommended)
  const {
    courses,
    loading,
    saveCourse,
    removeCourse,
    refreshCourses
  } = useCourses()

  // Your UI logic here
  return (
    // ...
  )
}
```

## 📋 Step-by-Step Refactoring Guide

### Step 1: Generate Boilerplate

```bash
node generate-5-layer.js exam-rooms --with-hook --with-validation --with-export
```

### Step 2: Extract Types from Existing page.tsx

1. Open the existing `page.tsx`
2. Find interface/type definitions (usually at the top)
3. Copy them to `types/exam-rooms.ts`
4. Update generated placeholder fields

**Before (in page.tsx):**
```typescript
interface ExamRoom {
  id: string
  room_code: string
  room_name: string
  capacity: number
  is_active: boolean
  created_at: string
}
```

**After (in types/exam-rooms.ts):**
```typescript
export interface ExamRoom {
  id: string
  room_code: string
  room_name: string
  capacity: number
  is_active: boolean
  created_at: string
}
```

### Step 3: Extract Service Functions

Find functions that make API calls and move them to `services/exam-rooms-service.ts`:

**Before (in page.tsx):**
```typescript
const fetchRooms = async () => {
  const response = await fetch('/api/exam-rooms')
  return response.json()
}
```

**After (in services/exam-rooms-service.ts):**
```typescript
export async function fetchExamRooms(): Promise<ExamRoom[]> {
  const response = await fetch('/api/exam-rooms')
  if (!response.ok) {
    throw new Error('Failed to fetch exam rooms')
  }
  return response.json()
}
```

### Step 4: Extract Validation Logic

Move validation functions to `lib/utils/exam-rooms/validation.ts`:

**Before (in page.tsx):**
```typescript
const validate = () => {
  const errors: Record<string, string> = {}
  if (!formData.room_code) errors.room_code = "Required"
  return errors
}
```

**After (in lib/utils/exam-rooms/validation.ts):**
```typescript
export function validateExamRoomData(data: any): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!data.room_code?.trim()) errors.room_code = "Room code is required"
  if (!data.room_name?.trim()) errors.room_name = "Room name is required"
  // ... more validations
  return errors
}
```

### Step 5: Move Export/Import Logic

Move Excel/JSON export functions to `lib/utils/exam-rooms/export-import.ts`

### Step 6: Update page.tsx

Replace inline logic with imports:

```typescript
"use client"

import { useExamRooms } from '@/hooks/use-exam-rooms'
import { validateExamRoomData } from '@/lib/utils/exam-rooms/validation'
import { exportToExcel, exportToJSON } from '@/lib/utils/exam-rooms/export-import'

export default function ExamRoomsPage() {
  const {
    examRooms,
    loading,
    saveExamRoom,
    removeExamRoom
  } = useExamRooms()

  // Only UI logic remains here
}
```

## 🎯 Refactoring Checklist

- [ ] Generate boilerplate with automation script
- [ ] Extract and move type definitions
- [ ] Extract and move service functions
- [ ] Extract and move validation logic
- [ ] Extract and move export/import logic
- [ ] Update imports in page.tsx
- [ ] Remove old inline code from page.tsx
- [ ] Test CRUD operations
- [ ] Test validation
- [ ] Test export/import
- [ ] Verify TypeScript compilation
- [ ] Check line count reduction (target: 25-35%)

## 📊 Expected Results

| Page Size | Before | After | Reduction |
|-----------|--------|-------|-----------|
| Small (<500 lines) | 500 | 400 | 20% |
| Medium (500-1000) | 750 | 525 | 30% |
| Large (1000-2000) | 1500 | 975 | 35% |
| Very Large (>2000) | 2500 | 1625 | 35% |

## 💡 Pro Tips

### 1. Start with Dry Run
Always run with `--dry-run` first to see what will be created:
```bash
node generate-5-layer.js my-entity --with-hook --dry-run
```

### 2. Generate Everything at Once
For complex pages, generate all utilities:
```bash
node generate-5-layer.js my-entity --with-hook --with-validation --with-export
```

### 3. Use Force to Regenerate
If you want to regenerate files with updated templates:
```bash
node generate-5-layer.js my-entity --with-hook --force
```

### 4. Batch Generation
Create a bash script for multiple entities:
```bash
#!/bin/bash
entities=("exam-rooms" "exam-registrations" "exam-types")
for entity in "${entities[@]}"; do
  node generate-5-layer.js "$entity" --with-hook --with-validation --with-export
done
```

## 🐛 Troubleshooting

### "Please provide an entity name"
- Make sure to pass the entity name as the first argument
- Example: `node generate-5-layer.js courses`

### "File already exists"
- Use `--force` to overwrite existing files
- Or manually delete the files first

### Import errors after generation
- Make sure to update the type definitions with your actual fields
- Verify that API endpoints match the entity name

## 📚 Additional Resources

- [5-Layer Architecture Guide](../../.cursor/rules/DEVELOPMENT_STANDARDS.md)
- [REFACTORING_SUMMARY.md](../../REFACTORING_SUMMARY.md)
- [Project Structure Skill](../../.claude/skills/project-structure/SKILL.md)

## 🤝 Contributing

To improve the automation scripts:

1. Add new templates in the generator functions
2. Update the README with examples
3. Test with different entity types
4. Submit improvements

---

**Last Updated:** 2025-11-08
**Version:** 1.0.0
