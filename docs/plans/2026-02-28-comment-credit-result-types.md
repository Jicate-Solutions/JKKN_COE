# Comment & Credit Result Types Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add two new `result_type` values — `comment` (descriptive grade entry) and `credit` (credit-only assignment) — with dedicated entry pages that write directly to the existing `final_marks` table.

**Architecture:** The existing `courses.result_type` field already drives all mark workflows. We extend it with two new values. `comment` courses bypass numeric marks and write a descriptive grade (`letter_grade`, `grade_description`) to `final_marks`. `credit` courses write only the `credit` column. The existing `grades` table provides configurable comment grade options via a new `grade_category` column.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL), Shadcn UI, Tailwind CSS, `useInstitutionFilter` hook, `getSupabaseServer()`

**Reference pattern:** `app/(coe)/marks-management/status-grades/page.tsx` — follow this page structure exactly for both new pages.

---

## Overview of Result Types (DO NOT CHANGE existing Mark/Status logic)

| `result_type` | `evaluation_type` | Writes To | New? |
|---|---|---|---|
| `Mark` | CIA / ESE / CIA+ESE | `internal_marks` + `marks_entry` → `final_marks` | No |
| `Status` | CIA / ESE | `internal_marks` / `marks_entry` | No |
| `comment` | Any | `final_marks.letter_grade` + `grade_description` | **YES** |
| `credit` | Any | `final_marks.credit` | **YES** |

---

## Task 1: DB — Add `grade_category` to `grades` table

**Files:**
- Migration: via Supabase MCP `apply_migration`

**Step 1: Apply migration**

Run via Supabase MCP tool:
```sql
ALTER TABLE grades
  ADD COLUMN IF NOT EXISTS grade_category VARCHAR(20) DEFAULT 'mark'
    CHECK (grade_category IN ('mark', 'comment'));

-- Set all existing rows to 'mark'
UPDATE grades SET grade_category = 'mark' WHERE grade_category IS NULL;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_grades_grade_category ON grades(grade_category);
```

**Step 2: Seed sample comment grades (run manually in Supabase SQL editor)**

```sql
-- Add sample comment grades for testing (use actual institution_code from your DB)
-- INSERT INTO grades (institutions_id, institutions_code, grade, grade_point, description, regulation_code, qualify, grade_category)
-- VALUES ('{uuid}', 'INST001', 'Highly Commended', 0, 'Highly Commended performance', 'REG001', true, 'comment'),
--        ('{uuid}', 'INST001', 'Commended', 0, 'Commended performance', 'REG001', true, 'comment'),
--        ('{uuid}', 'INST001', 'Satisfactory', 0, 'Satisfactory performance', 'REG001', true, 'comment');
-- (Un-comment and fill real values when testing)
```

**Step 3: Commit**
```bash
git add -A
git commit -m "feat: add grade_category column to grades table for comment grade type"
```

---

## Task 2: DB — Allow `comment` and `credit` in `courses.result_type`

**Files:**
- Migration: via Supabase MCP `apply_migration`

**Step 1: Check current constraint**

```sql
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name ILIKE '%result_type%';
```

**Step 2: If there's a CHECK constraint, drop and recreate. If it's a plain varchar (no constraint), skip this step.**

```sql
-- Only run if a CHECK constraint exists on result_type
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_result_type_check;
ALTER TABLE courses
  ADD CONSTRAINT courses_result_type_check
    CHECK (result_type IN ('Mark', 'Status', 'comment', 'credit'));
```

**Step 3: Verify**
```sql
SELECT DISTINCT result_type FROM courses ORDER BY result_type;
-- Should still show: Mark, Status (existing data is fine)
```

**Step 4: Commit**
```bash
git commit -m "feat: allow comment and credit result_type values in courses"
```

---

## Task 3: Types — `types/comment-grades.ts`

**Files:**
- Create: `types/comment-grades.ts`

**Step 1: Create the file**

```typescript
/**
 * Comment Grade Types
 *
 * For courses with result_type = 'comment'.
 * Coordinator assigns a descriptive grade (from grades table where grade_category = 'comment')
 * directly to final_marks.letter_grade + grade_description.
 * No numeric marks are entered.
 */

// =========================================================
// Row displayed in the entry table
// =========================================================

export interface CommentGradeRow {
  student_id: string
  exam_registration_id: string
  final_marks_id: string | null   // null if no final_marks record yet
  register_number: string
  student_name: string
  current_grade: string | null    // final_marks.letter_grade
  current_description: string | null // final_marks.grade_description
  new_grade: string               // selected from dropdown
  is_modified: boolean
  is_saving: boolean
  error: string | null
}

// =========================================================
// Grade option from grades table (grade_category = 'comment')
// =========================================================

export interface CommentGradeOption {
  id: string
  grade: string
  description: string
  qualify: boolean
  order_index: number | null
}

// =========================================================
// Filters
// =========================================================

export interface CommentGradeFilters {
  institutionId: string
  sessionId: string
  programCode: string
  courseId: string
  searchTerm: string
}

// =========================================================
// API Payloads
// =========================================================

export interface SaveCommentGradePayload {
  institutions_id: string
  examination_session_id: string
  course_id: string
  course_offering_id: string
  program_id: string
  entries: {
    student_id: string
    exam_registration_id: string
    register_number: string
    grade: string
    description: string
  }[]
}
```

**Step 2: Commit**
```bash
git add types/comment-grades.ts
git commit -m "feat: add TypeScript types for comment grade entry"
```

---

## Task 4: Types — `types/credit-entry.ts`

**Files:**
- Create: `types/credit-entry.ts`

**Step 1: Create the file**

```typescript
/**
 * Credit Entry Types
 *
 * For courses with result_type = 'credit'.
 * Coordinator assigns credit to learners — no grade, no marks.
 * Writes to final_marks.credit column.
 */

export interface CreditEntryRow {
  student_id: string
  exam_registration_id: string
  final_marks_id: string | null
  register_number: string
  student_name: string
  credit_value: number            // from course_offerings or courses
  already_assigned: boolean       // true if final_marks record exists
  is_saving: boolean
  error: string | null
}

export interface CreditEntryFilters {
  institutionId: string
  sessionId: string
  programCode: string
  courseId: string
  searchTerm: string
}

export interface SaveCreditPayload {
  institutions_id: string
  examination_session_id: string
  course_id: string
  course_offering_id: string
  program_id: string
  credit_value: number
  entries: {
    student_id: string
    exam_registration_id: string
    register_number: string
  }[]
}
```

**Step 2: Commit**
```bash
git add types/credit-entry.ts
git commit -m "feat: add TypeScript types for credit entry"
```

---

## Task 5: API — Extend `grades` route to support `grade_category` filter

**Files:**
- Modify: `app/api/grading/grades/route.ts`

**Step 1: Read the file** (already read — it's at line 17–35 of the GET handler)

**Step 2: Add `grade_category` filter after the existing `regulationCode` filter**

In `app/api/grading/grades/route.ts`, inside the GET handler, after the `regulationCode` filter block, add:

```typescript
// (add after the regulationCode block, before the final query execution)
const gradeCategory = searchParams.get('grade_category')
if (gradeCategory) {
  query = query.eq('grade_category', gradeCategory)
}
```

Also update the `order` to use `order_index` for comment grades:
```typescript
// Change the existing order line from:
.order('grade_point', { ascending: false })
// To:
.order('order_index', { ascending: true, nullsFirst: false })
.order('grade_point', { ascending: false })
```

**Step 3: Test via browser**
```
GET /api/grading/grades?grade_category=comment&institutions_id={uuid}
```
Should return only comment-type grades.

**Step 4: Commit**
```bash
git add app/api/grading/grades/route.ts
git commit -m "feat: support grade_category filter in grades API"
```

---

## Task 6: API — `app/api/marks/comment-grades/route.ts`

**Files:**
- Create: `app/api/marks/comment-grades/route.ts`

**Step 1: Create the file**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/marks/comment-grades
 *
 * Actions:
 *   ?action=institutions  - list active institutions
 *   ?action=sessions      - list sessions for institution
 *   ?action=courses       - list courses with result_type='comment'
 *   ?action=students      - list learners + their current grades
 */
export async function GET(request: Request) {
  const supabase = getSupabaseServer()
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  // ── institutions ──────────────────────────────────────────
  if (action === 'institutions') {
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name, institution_code')
      .eq('is_active', true)
      .order('name')
    if (error) return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
    return NextResponse.json(data || [])
  }

  // ── sessions ───────────────────────────────────────────────
  if (action === 'sessions') {
    const institutionId = searchParams.get('institutionId')
    if (!institutionId) return NextResponse.json({ error: 'institutionId required' }, { status: 400 })
    const { data, error } = await supabase
      .from('examination_sessions')
      .select('id, session_name, session_code')
      .eq('institutions_id', institutionId)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    return NextResponse.json(data || [])
  }

  // ── courses with result_type = 'comment' ──────────────────
  if (action === 'courses') {
    const institutionId = searchParams.get('institutionId')
    const sessionId = searchParams.get('sessionId')
    if (!institutionId || !sessionId) {
      return NextResponse.json({ error: 'institutionId and sessionId required' }, { status: 400 })
    }
    // Fetch course_offerings joined to courses, filtered by result_type
    const { data, error } = await supabase
      .from('course_offerings')
      .select(`
        id,
        course_id,
        courses!inner(id, course_code, course_title, result_type, evaluation_type)
      `)
      .eq('institutions_id', institutionId)
      .eq('examination_session_id', sessionId)
      .eq('courses.result_type', 'comment')
      .range(0, 9999)
    if (error) return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
    return NextResponse.json(data || [])
  }

  // ── students for a course ─────────────────────────────────
  if (action === 'students') {
    const institutionId = searchParams.get('institutionId')
    const sessionId = searchParams.get('sessionId')
    const courseId = searchParams.get('courseId')
    if (!institutionId || !sessionId || !courseId) {
      return NextResponse.json({ error: 'institutionId, sessionId, courseId required' }, { status: 400 })
    }

    // Get exam registrations
    const { data: registrations, error: regError } = await supabase
      .from('exam_registrations')
      .select('id, student_id, register_number')
      .eq('institutions_id', institutionId)
      .eq('examination_session_id', sessionId)
      .eq('course_id', courseId)
      .eq('is_active', true)
      .order('register_number')
      .range(0, 9999)

    if (regError) return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
    if (!registrations || registrations.length === 0) {
      return NextResponse.json({ students: [], total: 0 })
    }

    const studentIds = registrations.map(r => r.student_id)
    const examRegIds = registrations.map(r => r.id)

    // Get existing final_marks for these registrations
    const { data: finalMarks } = await supabase
      .from('final_marks')
      .select('id, student_id, exam_registration_id, letter_grade, grade_description')
      .eq('institutions_id', institutionId)
      .eq('examination_session_id', sessionId)
      .eq('course_id', courseId)
      .in('exam_registration_id', examRegIds)
      .range(0, 9999)

    const finalMarksMap = new Map(
      (finalMarks || []).map(fm => [fm.exam_registration_id, fm])
    )

    // Build student rows (names come from register_number for now — MyJKKN for full name)
    const students = registrations.map(reg => {
      const fm = finalMarksMap.get(reg.id)
      return {
        student_id: reg.student_id,
        exam_registration_id: reg.id,
        final_marks_id: fm?.id || null,
        register_number: reg.register_number,
        current_grade: fm?.letter_grade || null,
        current_description: fm?.grade_description || null,
      }
    })

    return NextResponse.json({ students, total: students.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

/**
 * POST /api/marks/comment-grades
 * Save comment grades to final_marks for multiple learners.
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServer()
    const body = await request.json()

    const { institutions_id, examination_session_id, course_id, course_offering_id, program_id, entries } = body

    if (!institutions_id || !examination_session_id || !course_id || !entries?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Fetch grade details for grade_points, result_status etc.
    const gradeValues = [...new Set(entries.map((e: any) => e.grade))]
    const { data: gradeData } = await supabase
      .from('grades')
      .select('grade, grade_point, description, qualify, result_status')
      .eq('institutions_id', institutions_id)
      .eq('grade_category', 'comment')
      .in('grade', gradeValues)

    const gradeMap = new Map((gradeData || []).map(g => [g.grade, g]))

    const results = { successful: 0, failed: 0, errors: [] as any[] }

    for (const entry of entries) {
      const gradeInfo = gradeMap.get(entry.grade)

      const payload = {
        institutions_id,
        examination_session_id,
        exam_registration_id: entry.exam_registration_id,
        course_offering_id,
        program_id,
        course_id,
        student_id: entry.student_id,
        register_number: entry.register_number,
        // Marks all zero for comment type
        internal_marks_obtained: 0,
        internal_marks_maximum: 0,
        external_marks_obtained: 0,
        external_marks_maximum: 0,
        total_marks_obtained: 0,
        total_marks_maximum: 0,
        percentage: 0,
        // Grade info
        letter_grade: entry.grade,
        grade_description: gradeInfo?.description || entry.grade,
        grade_points: gradeInfo?.grade_point || 0,
        is_pass: gradeInfo?.qualify ?? true,
        pass_status: gradeInfo?.result_status || 'Pass',
        result_status: 'Pending',
        is_active: true,
      }

      // Upsert: update if final_marks_id exists, insert otherwise
      if (entry.final_marks_id) {
        const { error } = await supabase
          .from('final_marks')
          .update({
            letter_grade: payload.letter_grade,
            grade_description: payload.grade_description,
            grade_points: payload.grade_points,
            is_pass: payload.is_pass,
            pass_status: payload.pass_status,
          })
          .eq('id', entry.final_marks_id)

        if (error) {
          results.failed++
          results.errors.push({ register_number: entry.register_number, error: error.message })
        } else {
          results.successful++
        }
      } else {
        const { error } = await supabase.from('final_marks').insert(payload)
        if (error) {
          results.failed++
          results.errors.push({ register_number: entry.register_number, error: error.message })
        } else {
          results.successful++
        }
      }
    }

    return NextResponse.json(results)
  } catch (e) {
    console.error('Comment grades save error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 2: Commit**
```bash
git add app/api/marks/comment-grades/route.ts
git commit -m "feat: add comment-grades API route for direct final_marks entry"
```

---

## Task 7: API — `app/api/marks/credit-entry/route.ts`

**Files:**
- Create: `app/api/marks/credit-entry/route.ts`

**Step 1: Create the file**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/marks/credit-entry
 *
 * Actions:
 *   ?action=institutions
 *   ?action=sessions
 *   ?action=courses       — courses with result_type='credit'
 *   ?action=students      — learners + assignment status
 */
export async function GET(request: Request) {
  const supabase = getSupabaseServer()
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'institutions') {
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name, institution_code')
      .eq('is_active', true)
      .order('name')
    if (error) return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
    return NextResponse.json(data || [])
  }

  if (action === 'sessions') {
    const institutionId = searchParams.get('institutionId')
    if (!institutionId) return NextResponse.json({ error: 'institutionId required' }, { status: 400 })
    const { data, error } = await supabase
      .from('examination_sessions')
      .select('id, session_name, session_code')
      .eq('institutions_id', institutionId)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    return NextResponse.json(data || [])
  }

  if (action === 'courses') {
    const institutionId = searchParams.get('institutionId')
    const sessionId = searchParams.get('sessionId')
    if (!institutionId || !sessionId) {
      return NextResponse.json({ error: 'institutionId and sessionId required' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('course_offerings')
      .select(`
        id,
        course_id,
        courses!inner(id, course_code, course_title, result_type, evaluation_type)
      `)
      .eq('institutions_id', institutionId)
      .eq('examination_session_id', sessionId)
      .eq('courses.result_type', 'credit')
      .range(0, 9999)
    if (error) return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
    return NextResponse.json(data || [])
  }

  if (action === 'students') {
    const institutionId = searchParams.get('institutionId')
    const sessionId = searchParams.get('sessionId')
    const courseId = searchParams.get('courseId')
    if (!institutionId || !sessionId || !courseId) {
      return NextResponse.json({ error: 'institutionId, sessionId, courseId required' }, { status: 400 })
    }

    const { data: registrations, error: regError } = await supabase
      .from('exam_registrations')
      .select('id, student_id, register_number')
      .eq('institutions_id', institutionId)
      .eq('examination_session_id', sessionId)
      .eq('course_id', courseId)
      .eq('is_active', true)
      .order('register_number')
      .range(0, 9999)

    if (regError) return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
    if (!registrations?.length) return NextResponse.json({ students: [], total: 0 })

    const examRegIds = registrations.map(r => r.id)

    const { data: finalMarks } = await supabase
      .from('final_marks')
      .select('id, student_id, exam_registration_id, credit')
      .eq('institutions_id', institutionId)
      .eq('examination_session_id', sessionId)
      .eq('course_id', courseId)
      .in('exam_registration_id', examRegIds)
      .range(0, 9999)

    const finalMarksMap = new Map(
      (finalMarks || []).map(fm => [fm.exam_registration_id, fm])
    )

    const students = registrations.map(reg => {
      const fm = finalMarksMap.get(reg.id)
      return {
        student_id: reg.student_id,
        exam_registration_id: reg.id,
        final_marks_id: fm?.id || null,
        register_number: reg.register_number,
        already_assigned: !!fm,
        current_credit: fm?.credit || null,
      }
    })

    return NextResponse.json({ students, total: students.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

/**
 * POST /api/marks/credit-entry
 * Assign credit to all learners in a course.
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServer()
    const body = await request.json()

    const { institutions_id, examination_session_id, course_id, course_offering_id, program_id, credit_value, entries } = body

    if (!institutions_id || !examination_session_id || !course_id || !entries?.length || credit_value == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const results = { successful: 0, failed: 0, errors: [] as any[] }

    for (const entry of entries) {
      if (entry.final_marks_id) {
        const { error } = await supabase
          .from('final_marks')
          .update({ credit: credit_value })
          .eq('id', entry.final_marks_id)

        if (error) {
          results.failed++
          results.errors.push({ register_number: entry.register_number, error: error.message })
        } else {
          results.successful++
        }
      } else {
        const { error } = await supabase.from('final_marks').insert({
          institutions_id,
          examination_session_id,
          exam_registration_id: entry.exam_registration_id,
          course_offering_id,
          program_id,
          course_id,
          student_id: entry.student_id,
          register_number: entry.register_number,
          // All marks zero
          internal_marks_obtained: 0,
          internal_marks_maximum: 0,
          external_marks_obtained: 0,
          external_marks_maximum: 0,
          total_marks_obtained: 0,
          total_marks_maximum: 0,
          percentage: 0,
          credit: credit_value,
          is_pass: true,
          pass_status: 'Credit',
          result_status: 'Pending',
          is_active: true,
        })

        if (error) {
          results.failed++
          results.errors.push({ register_number: entry.register_number, error: error.message })
        } else {
          results.successful++
        }
      }
    }

    return NextResponse.json(results)
  } catch (e) {
    console.error('Credit entry save error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 2: Commit**
```bash
git add app/api/marks/credit-entry/route.ts
git commit -m "feat: add credit-entry API route for credit assignment to final_marks"
```

---

## Task 8: Page — Comment Grade Entry

**Files:**
- Create: `app/(coe)/marks-management/comment-grades/page.tsx`

**Reference:** `app/(coe)/marks-management/status-grades/page.tsx` — copy its structure, adapt for comment grades.

**Key differences from status-grades page:**
1. Filter courses by `result_type = 'comment'` (not 'Status')
2. Grade dropdown populated from API (`/api/grading/grades?grade_category=comment&institutions_id=...`)
3. Save goes to `/api/marks/comment-grades` (POST)
4. Student data from `/api/marks/comment-grades?action=students`

**Step 1: Create the page — follow this skeleton exactly**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { Save, Loader2, MessageSquare, Search, RefreshCw } from 'lucide-react'
import type { CommentGradeRow, CommentGradeOption } from '@/types/comment-grades'

export default function CommentGradeEntryPage() {
  const { toast } = useToast()
  const { filter, isReady, institutionId } = useInstitutionFilter()

  // Filter state
  const [sessionId, setSessionId] = useState('')
  const [courseOfferingId, setCourseOfferingId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // Data state
  const [sessions, setSessions] = useState<any[]>([])
  const [courses, setCourses] = useState<any[]>([])
  const [gradeOptions, setGradeOptions] = useState<CommentGradeOption[]>([])
  const [students, setStudents] = useState<CommentGradeRow[]>([])

  // Loading state
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load sessions when institution is ready
  useEffect(() => {
    if (!isReady || !institutionId) return
    setLoadingSessions(true)
    fetch(`/api/marks/comment-grades?action=sessions&institutionId=${institutionId}`)
      .then(r => r.json())
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .finally(() => setLoadingSessions(false))
  }, [isReady, institutionId])

  // Load grade options when institution changes
  useEffect(() => {
    if (!institutionId) return
    fetch(`/api/grading/grades?grade_category=comment&institutions_id=${institutionId}`)
      .then(r => r.json())
      .then(data => setGradeOptions(Array.isArray(data) ? data : []))
  }, [institutionId])

  // Load courses when session selected
  useEffect(() => {
    if (!institutionId || !sessionId) { setCourses([]); return }
    setLoadingCourses(true)
    fetch(`/api/marks/comment-grades?action=courses&institutionId=${institutionId}&sessionId=${sessionId}`)
      .then(r => r.json())
      .then(data => setCourses(Array.isArray(data) ? data : []))
      .finally(() => setLoadingCourses(false))
  }, [institutionId, sessionId])

  // Load students when course selected
  const loadStudents = useCallback(() => {
    if (!institutionId || !sessionId || !courseId) { setStudents([]); return }
    setLoadingStudents(true)
    fetch(`/api/marks/comment-grades?action=students&institutionId=${institutionId}&sessionId=${sessionId}&courseId=${courseId}`)
      .then(r => r.json())
      .then(data => {
        const rows: CommentGradeRow[] = (data.students || []).map((s: any) => ({
          ...s,
          new_grade: s.current_grade || '',
          is_modified: false,
          is_saving: false,
          error: null,
        }))
        setStudents(rows)
      })
      .finally(() => setLoadingStudents(false))
  }, [institutionId, sessionId, courseId])

  useEffect(() => { loadStudents() }, [loadStudents])

  // Update grade for a single student
  const handleGradeChange = (examRegId: string, grade: string) => {
    setStudents(prev => prev.map(s =>
      s.exam_registration_id === examRegId
        ? { ...s, new_grade: grade, is_modified: grade !== (s.current_grade || '') }
        : s
    ))
  }

  // Save all modified rows
  const handleSave = async () => {
    const modified = students.filter(s => s.is_modified && s.new_grade)
    if (!modified.length) {
      toast({ title: 'No changes', description: 'Select grades for learners first.' })
      return
    }

    const selectedCourse = courses.find(c => c.course_id === courseId)
    setSaving(true)
    try {
      const payload = {
        institutions_id: institutionId,
        examination_session_id: sessionId,
        course_id: courseId,
        course_offering_id: selectedCourse?.id || '',
        program_id: '', // TODO: add program filter if needed
        entries: modified.map(s => ({
          student_id: s.student_id,
          exam_registration_id: s.exam_registration_id,
          final_marks_id: s.final_marks_id,
          register_number: s.register_number,
          grade: s.new_grade,
          description: gradeOptions.find(g => g.grade === s.new_grade)?.description || s.new_grade,
        })),
      }

      const res = await fetch('/api/marks/comment-grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()

      if (result.successful > 0) {
        toast({
          title: '✅ Saved',
          description: `${result.successful} grade(s) saved successfully.`,
          className: 'bg-green-50 border-green-200 text-green-800',
        })
        loadStudents()
      }
      if (result.failed > 0) {
        toast({
          title: '❌ Some failed',
          description: `${result.failed} grade(s) failed to save.`,
          variant: 'destructive',
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const filteredStudents = students.filter(s =>
    !searchTerm || s.register_number.toLowerCase().includes(searchTerm.toLowerCase())
  )
  const modifiedCount = students.filter(s => s.is_modified).length

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex flex-col gap-6 p-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/dashboard">Home</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Comment Grade Entry</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-blue-600" />
                Comment Grade Entry
              </h1>
              <p className="text-muted-foreground mt-1">
                Assign descriptive grades to learners for comment-type courses
              </p>
            </div>
            {modifiedCount > 0 && (
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save {modifiedCount} Change{modifiedCount !== 1 ? 's' : ''}
              </Button>
            )}
          </div>

          {/* Filters */}
          <Card>
            <CardHeader><CardTitle>Select Course</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Examination Session</label>
                <Select value={sessionId} onValueChange={setSessionId} disabled={loadingSessions}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingSessions ? 'Loading...' : 'Select session'} />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Course (Comment type)</label>
                <Select value={courseId} onValueChange={(v) => {
                  const co = courses.find(c => c.course_id === v)
                  setCourseId(v)
                  setCourseOfferingId(co?.id || '')
                }} disabled={!sessionId || loadingCourses}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCourses ? 'Loading...' : 'Select course'} />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map(c => (
                      <SelectItem key={c.course_id} value={c.course_id}>
                        {c.courses?.course_code} — {c.courses?.course_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Student Table */}
          {courseId && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Learners</CardTitle>
                  <CardDescription>{filteredStudents.length} learner(s)</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search register no..."
                      className="pl-9 w-48"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="icon" onClick={loadStudents}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingStudents ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Register No</TableHead>
                        <TableHead>Current Grade</TableHead>
                        <TableHead>New Grade</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No learners found for this course.
                          </TableCell>
                        </TableRow>
                      ) : filteredStudents.map((student, idx) => (
                        <TableRow key={student.exam_registration_id} className={student.is_modified ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-mono font-medium">{student.register_number}</TableCell>
                          <TableCell>
                            {student.current_grade
                              ? <Badge variant="outline">{student.current_grade}</Badge>
                              : <span className="text-muted-foreground text-sm">Not assigned</span>
                            }
                          </TableCell>
                          <TableCell>
                            <Select
                              value={student.new_grade}
                              onValueChange={(v) => handleGradeChange(student.exam_registration_id, v)}
                            >
                              <SelectTrigger className="w-48">
                                <SelectValue placeholder="Select grade..." />
                              </SelectTrigger>
                              <SelectContent>
                                {gradeOptions.map(g => (
                                  <SelectItem key={g.id} value={g.grade}>{g.grade}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {student.is_modified && (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200">Modified</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**Step 2: Commit**
```bash
git add app/(coe)/marks-management/comment-grades/page.tsx
git commit -m "feat: add Comment Grade Entry page for result_type=comment courses"
```

---

## Task 9: Page — Credit Entry

**Files:**
- Create: `app/(coe)/marks-management/credit-entry/page.tsx`

**Key differences from comment-grades page:**
1. Filter courses by `result_type = 'credit'`
2. No grade dropdown — shows credit value, coordinator clicks "Assign All"
3. Save goes to `/api/marks/credit-entry` (POST)

**Step 1: Create the page**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { Award, Loader2, Save, Search, RefreshCw, CheckCircle } from 'lucide-react'

export default function CreditEntryPage() {
  const { toast } = useToast()
  const { isReady, institutionId } = useInstitutionFilter()

  const [sessionId, setSessionId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [courseOfferingId, setCourseOfferingId] = useState('')
  const [creditValue, setCreditValue] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [sessions, setSessions] = useState<any[]>([])
  const [courses, setCourses] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])

  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isReady || !institutionId) return
    setLoadingSessions(true)
    fetch(`/api/marks/credit-entry?action=sessions&institutionId=${institutionId}`)
      .then(r => r.json())
      .then(d => setSessions(Array.isArray(d) ? d : []))
      .finally(() => setLoadingSessions(false))
  }, [isReady, institutionId])

  useEffect(() => {
    if (!institutionId || !sessionId) { setCourses([]); return }
    setLoadingCourses(true)
    fetch(`/api/marks/credit-entry?action=courses&institutionId=${institutionId}&sessionId=${sessionId}`)
      .then(r => r.json())
      .then(d => setCourses(Array.isArray(d) ? d : []))
      .finally(() => setLoadingCourses(false))
  }, [institutionId, sessionId])

  const loadStudents = useCallback(() => {
    if (!institutionId || !sessionId || !courseId) { setStudents([]); return }
    setLoadingStudents(true)
    fetch(`/api/marks/credit-entry?action=students&institutionId=${institutionId}&sessionId=${sessionId}&courseId=${courseId}`)
      .then(r => r.json())
      .then(d => setStudents(d.students || []))
      .finally(() => setLoadingStudents(false))
  }, [institutionId, sessionId, courseId])

  useEffect(() => { loadStudents() }, [loadStudents])

  const handleSave = async () => {
    if (!creditValue) {
      toast({ title: 'Credit value required', variant: 'destructive' })
      return
    }
    const selectedCourse = courses.find(c => c.course_id === courseId)
    setSaving(true)
    try {
      const payload = {
        institutions_id: institutionId,
        examination_session_id: sessionId,
        course_id: courseId,
        course_offering_id: selectedCourse?.id || '',
        program_id: '',
        credit_value: creditValue,
        entries: students.map(s => ({
          student_id: s.student_id,
          exam_registration_id: s.exam_registration_id,
          final_marks_id: s.final_marks_id,
          register_number: s.register_number,
        })),
      }

      const res = await fetch('/api/marks/credit-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()

      if (result.successful > 0) {
        toast({
          title: '✅ Credit Assigned',
          description: `${result.successful} learner(s) assigned credit successfully.`,
          className: 'bg-green-50 border-green-200 text-green-800',
        })
        loadStudents()
      }
      if (result.failed > 0) {
        toast({ title: '❌ Some failed', description: `${result.failed} failed.`, variant: 'destructive' })
      }
    } finally {
      setSaving(false)
    }
  }

  const filteredStudents = students.filter(s =>
    !searchTerm || s.register_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex flex-col gap-6 p-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/dashboard">Home</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Credit Entry</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Award className="h-6 w-6 text-purple-600" />
                Credit Entry
              </h1>
              <p className="text-muted-foreground mt-1">
                Assign credit to learners for credit-type courses (no marks or grades)
              </p>
            </div>
            {courseId && students.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium whitespace-nowrap">Credit Value</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    className="w-24"
                    value={creditValue ?? ''}
                    onChange={e => setCreditValue(Number(e.target.value))}
                    placeholder="e.g. 3"
                  />
                </div>
                <Button onClick={handleSave} disabled={saving || !creditValue} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Assign All ({students.length})
                </Button>
              </div>
            )}
          </div>

          <Card>
            <CardHeader><CardTitle>Select Course</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Examination Session</label>
                <Select value={sessionId} onValueChange={setSessionId} disabled={loadingSessions}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingSessions ? 'Loading...' : 'Select session'} />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.session_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Course (Credit type)</label>
                <Select value={courseId} onValueChange={(v) => {
                  const co = courses.find(c => c.course_id === v)
                  setCourseId(v)
                  setCourseOfferingId(co?.id || '')
                }} disabled={!sessionId || loadingCourses}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCourses ? 'Loading...' : 'Select course'} />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map(c => (
                      <SelectItem key={c.course_id} value={c.course_id}>
                        {c.courses?.course_code} — {c.courses?.course_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {courseId && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Learners</CardTitle>
                  <CardDescription>{filteredStudents.length} learner(s)</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search register no..."
                      className="pl-9 w-48"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="icon" onClick={loadStudents}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingStudents ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Register No</TableHead>
                        <TableHead>Credit Status</TableHead>
                        <TableHead>Current Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No learners found for this course.
                          </TableCell>
                        </TableRow>
                      ) : filteredStudents.map((s, idx) => (
                        <TableRow key={s.exam_registration_id}>
                          <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-mono font-medium">{s.register_number}</TableCell>
                          <TableCell>
                            {s.already_assigned
                              ? <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                                  <CheckCircle className="h-3 w-3" /> Assigned
                                </Badge>
                              : <Badge variant="outline" className="text-amber-600 border-amber-300">Pending</Badge>
                            }
                          </TableCell>
                          <TableCell>
                            {s.current_credit != null
                              ? <span className="font-medium">{s.current_credit}</span>
                              : <span className="text-muted-foreground text-sm">—</span>
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**Step 2: Commit**
```bash
git add app/(coe)/marks-management/credit-entry/page.tsx
git commit -m "feat: add Credit Entry page for result_type=credit courses"
```

---

## Task 10: Navigation — Add sidebar menu items

**Files:**
- Modify: `components/layout/app-sidebar.tsx`

**Step 1: Find the "Grading" section (around line 176–189)**

Add two new items to the `Grading` section's `items` array:

```typescript
// Add after the existing "Galley Report" item:
{ title: "Comment Grade Entry", url: "/marks-management/comment-grades", icon: MessageSquare },
{ title: "Credit Entry",        url: "/marks-management/credit-entry",   icon: Award },
```

**Step 2: Add the icon imports at the top**

Find the existing lucide-react import block and add `MessageSquare` and `Award` if not already present:

```typescript
import {
  // ... existing icons ...
  MessageSquare,
  Award,
} from 'lucide-react'
```

**Step 3: Verify by running dev server**
```bash
npm run dev
```
Navigate to sidebar → Grading section → verify two new items appear.

**Step 4: Commit**
```bash
git add components/layout/app-sidebar.tsx
git commit -m "feat: add Comment Grade Entry and Credit Entry to sidebar navigation"
```

---

## Task 11: Manual Testing Checklist

**Before testing, ensure test data exists:**

1. Create a course with `result_type = 'comment'` and an active course offering
2. Create exam registrations for that course in an active session
3. Add comment grades in the `grades` table with `grade_category = 'comment'` for that institution

**Comment Grade Entry (`/marks-management/comment-grades`):**
- [ ] Page loads without errors
- [ ] Session dropdown populates
- [ ] Course dropdown shows only `result_type = 'comment'` courses
- [ ] Grade dropdown shows options from `grades` table where `grade_category = 'comment'`
- [ ] Selecting a grade marks row as "Modified" (amber highlight)
- [ ] Save button shows count of modifications
- [ ] After save, reload shows saved grades in "Current Grade" column
- [ ] Search by register number filters correctly

**Credit Entry (`/marks-management/credit-entry`):**
- [ ] Page loads without errors
- [ ] Course dropdown shows only `result_type = 'credit'` courses
- [ ] Learners listed with Pending/Assigned badges
- [ ] Setting credit value and clicking "Assign All" saves to all learners
- [ ] After save, rows show "Assigned" badge with credit value
- [ ] Re-assigning updates existing `final_marks.credit` (no duplicate rows)

---

## Task 12: Verify `final_marks` rows are correct

Run in Supabase SQL editor after testing:

```sql
-- Check comment grade rows
SELECT register_number, letter_grade, grade_description, grade_points,
       internal_marks_obtained, external_marks_obtained, total_marks_obtained, result_status
FROM final_marks
WHERE course_id IN (
  SELECT id FROM courses WHERE result_type = 'comment'
)
ORDER BY register_number;

-- Check credit rows
SELECT register_number, credit, internal_marks_obtained, external_marks_obtained, pass_status
FROM final_marks
WHERE course_id IN (
  SELECT id FROM courses WHERE result_type = 'credit'
)
ORDER BY register_number;
```

**Expected for comment:** `letter_grade` set, all mark columns = 0, `result_status = 'Pending'`
**Expected for credit:** `credit` set, all mark columns = 0, `pass_status = 'Credit'`

---

## Summary of Files Changed

| Action | File | Purpose |
|---|---|---|
| DB migration | `grades.grade_category` column | Tag comment vs mark grades |
| DB migration | `courses.result_type` constraint | Allow 'comment', 'credit' values |
| Create | `types/comment-grades.ts` | TypeScript types for comment entry |
| Create | `types/credit-entry.ts` | TypeScript types for credit entry |
| Modify | `app/api/grading/grades/route.ts` | Add `grade_category` filter |
| Create | `app/api/marks/comment-grades/route.ts` | Comment grade API (GET + POST) |
| Create | `app/api/marks/credit-entry/route.ts` | Credit entry API (GET + POST) |
| Create | `app/(coe)/marks-management/comment-grades/page.tsx` | Comment grade entry page |
| Create | `app/(coe)/marks-management/credit-entry/page.tsx` | Credit entry page |
| Modify | `components/layout/app-sidebar.tsx` | Add 2 nav items to Grading section |
