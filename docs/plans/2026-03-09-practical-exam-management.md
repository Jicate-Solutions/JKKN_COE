# Practical Examination Management Enhancement - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Add practical exam support with batch-based timetables, batch-wise attendance sheets, and a practical mark entry module.

**Architecture:** Extend `exam_timetables` with `exam_type` and `batch_capacity` columns (each practical batch = one timetable row). Practical marks stored in existing `marks_entry` table with `source='Practical Entry'`. Student batch assignment derived on-the-fly from sorted registrations + cumulative batch capacities — no persistence needed.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL), Shadcn UI, Tailwind CSS

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Batch storage | Fields on `exam_timetables` | Each batch = one timetable row. Reuses existing infrastructure (attendance, dummy numbers, room allocations all link via `exam_timetable_id`) |
| Mark storage | Reuse `marks_entry` table | Same pipeline to `final_marks`. All reports, GPA calculations, NAAD exports work automatically |
| Student assignment | Derive from position (stateless) | Sort registered students (regular first, then arrears, by register_no), slice by cumulative capacity. Zero storage overhead |
| Mark entry UI | Single total mark per student | Matches `marks_entry.total_marks_obtained`. Internal marks handled separately via existing `internal_marks` flow |

## Batch Assignment Algorithm

```
Input: registered students for a course + practical timetable rows (ordered by date ASC, session order FN<AN)
Output: which students belong to which batch (timetable row)

1. Sort students: is_regular DESC, stu_register_no ASC
2. Sort practical timetable rows: exam_date ASC, session='FN' before 'AN'
3. Assign sequentially:
   offset = 0
   for each timetable_row:
     batch_students = students[offset .. offset + batch_capacity - 1]
     offset += batch_capacity
```

---

## Task 1: Database Migration — Add Practical Exam Fields to `exam_timetables`

**Files:**
- Create: `supabase/migrations/20260309_add_practical_exam_support.sql`

**Step 1: Write the migration SQL**

```sql
-- Add practical exam support to exam_timetables
-- exam_type: 'Theory' (default) or 'Practical'
-- batch_capacity: number of students per practical batch (NULL for theory)

ALTER TABLE exam_timetables
ADD COLUMN IF NOT EXISTS exam_type VARCHAR(20) DEFAULT 'Theory';

ALTER TABLE exam_timetables
ADD COLUMN IF NOT EXISTS batch_capacity INTEGER;

-- Add check constraint for valid exam_type values
ALTER TABLE exam_timetables
ADD CONSTRAINT check_valid_exam_type
CHECK (exam_type IN ('Theory', 'Practical'));

-- Add check constraint: batch_capacity required for practical, NULL for theory
ALTER TABLE exam_timetables
ADD CONSTRAINT check_practical_batch_capacity
CHECK (
  (exam_type = 'Theory' AND batch_capacity IS NULL)
  OR (exam_type = 'Practical' AND batch_capacity IS NOT NULL AND batch_capacity > 0)
);

-- Comment on columns
COMMENT ON COLUMN exam_timetables.exam_type IS 'Theory or Practical. Practical exams have multiple timetable rows (one per batch)';
COMMENT ON COLUMN exam_timetables.batch_capacity IS 'Max students per practical batch. NULL for theory exams';
```

**Step 2: Apply the migration**

Run: `npx supabase migration up` or apply via Supabase MCP tool.
Expected: Migration applies successfully, no errors.

**Step 3: Commit**

```bash
git add supabase/migrations/20260309_add_practical_exam_support.sql
git commit -m "feat: add exam_type and batch_capacity columns to exam_timetables for practical exam support"
```

---

## Task 2: Update Types — Add Practical Fields to ExamTimetable Types

**Files:**
- Modify: `types/exam_timetable.ts:2-16` (ExamTimetable interface)
- Modify: `types/exam_timetable.ts:75-86` (ExamTimetableFormData interface)

**Step 1: Add fields to ExamTimetable interface**

In `types/exam_timetable.ts`, add to the `ExamTimetable` interface (after line 13, before `created_by`):

```typescript
exam_type: 'Theory' | 'Practical'
batch_capacity?: number | null
```

**Step 2: Add fields to ExamTimetableFormData interface**

In `types/exam_timetable.ts`, add to `ExamTimetableFormData` (after line 84, before `instructions`):

```typescript
exam_type: 'Theory' | 'Practical'
batch_capacity?: number | null
```

**Step 3: Commit**

```bash
git add types/exam_timetable.ts
git commit -m "feat: add exam_type and batch_capacity to ExamTimetable types"
```

---

## Task 3: Update Exam Timetable API — Support Practical Fields in CRUD

**Files:**
- Modify: `app/api/exam-management/exam-timetables/route.ts:259-271` (POST insertPayload)
- Modify: `app/api/exam-management/exam-timetables/route.ts:430-441` (PUT updatePayload)

**Step 1: Update POST route — add exam_type and batch_capacity to insertPayload**

In `route.ts` POST handler, update the `insertPayload` object (around line 259):

```typescript
const insertPayload: any = {
  institutions_id: body.institutions_id,
  examination_session_id: body.examination_session_id,
  course_id: courseId,
  course_offering_id: courseOfferingId,
  exam_date: body.exam_date,
  session: body.session,
  duration_minutes: durationMinutes,
  exam_mode: body.exam_mode || 'Offline',
  is_published: body.is_published ?? false,
  instructions: body.instructions || null,
  created_by: body.created_by || null,
  exam_type: body.exam_type || 'Theory',
  batch_capacity: body.exam_type === 'Practical' ? (body.batch_capacity || null) : null,
}
```

**Step 2: Update PUT route — add exam_type and batch_capacity to updatePayload**

In `route.ts` PUT handler, update the `updatePayload` object (around line 430):

```typescript
const updatePayload: any = {
  examination_session_id: examinationSessionId,
  course_id: courseId,
  course_offering_id: courseOfferingId,
  exam_date: body.exam_date,
  session: body.session,
  duration_minutes: durationMinutes,
  exam_mode: body.exam_mode || 'Offline',
  is_published: body.is_published ?? false,
  instructions: body.instructions || null,
  updated_at: new Date().toISOString(),
  exam_type: body.exam_type || 'Theory',
  batch_capacity: body.exam_type === 'Practical' ? (body.batch_capacity || null) : null,
}
```

**Step 3: Update GET route — include new fields in enriched response**

The `select('*')` already returns all columns, so the new fields will be included automatically. No change needed for GET.

**Step 4: Commit**

```bash
git add app/api/exam-management/exam-timetables/route.ts
git commit -m "feat: support exam_type and batch_capacity in exam timetable CRUD API"
```

---

## Task 4: Update Exam Timetable Page — Add Practical Fields to UI

**Files:**
- Modify: `app/(coe)/exam-management/exam-timetables/page.tsx`

This is a large file (~1686 lines). The changes are:

**Step 1: Add Exam Type filter to the filter bar**

Find the filter section (look for session FN/AN filter dropdown). Add an exam_type filter nearby:

```tsx
{/* Exam Type Filter */}
<Select value={examTypeFilter} onValueChange={setExamTypeFilter}>
  <SelectTrigger className="w-[140px]">
    <SelectValue placeholder="Exam Type" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Types</SelectItem>
    <SelectItem value="Theory">Theory</SelectItem>
    <SelectItem value="Practical">Practical</SelectItem>
  </SelectContent>
</Select>
```

Add state: `const [examTypeFilter, setExamTypeFilter] = useState('all')`

Add to the filtering logic where other filters are applied:

```typescript
if (examTypeFilter !== 'all') {
  filtered = filtered.filter(t => (t.exam_type || 'Theory') === examTypeFilter)
}
```

**Step 2: Add batch_capacity to the create/edit form**

In the Sheet form (where exam_date, session, duration are entered), add conditional fields:

```tsx
{/* Exam Type */}
<div className="space-y-2">
  <Label>Exam Type</Label>
  <Select
    value={formData.exam_type || 'Theory'}
    onValueChange={(v) => setFormData(prev => ({
      ...prev,
      exam_type: v as 'Theory' | 'Practical',
      batch_capacity: v === 'Theory' ? null : prev.batch_capacity
    }))}
  >
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="Theory">Theory</SelectItem>
      <SelectItem value="Practical">Practical</SelectItem>
    </SelectContent>
  </Select>
</div>

{/* Batch Capacity - only for Practical */}
{formData.exam_type === 'Practical' && (
  <div className="space-y-2">
    <Label>Batch Capacity *</Label>
    <Input
      type="number"
      min={1}
      value={formData.batch_capacity || ''}
      onChange={(e) => setFormData(prev => ({
        ...prev,
        batch_capacity: e.target.value ? parseInt(e.target.value) : null
      }))}
      placeholder="e.g. 30"
    />
  </div>
)}
```

**Step 3: Show exam_type and batch_capacity in timetable table columns**

Add a column to the table displaying exam type with a badge:

```tsx
<TableCell>
  <Badge variant={row.exam_type === 'Practical' ? 'secondary' : 'outline'}>
    {row.exam_type || 'Theory'}
  </Badge>
  {row.batch_capacity && (
    <span className="ml-2 text-xs text-muted-foreground">
      (Cap: {row.batch_capacity})
    </span>
  )}
</TableCell>
```

**Step 4: Update Excel bulk upload template to include exam_type and batch_capacity columns**

Find the template generation code (look for `generateTemplate` or Excel export function). Add two new columns to the template:

- Column: `exam_type` — values: `Theory` or `Practical` (default: `Theory`)
- Column: `batch_capacity` — number, required when exam_type is `Practical`

In the upload processing logic, read these fields and pass them to the API.

**Step 5: Commit**

```bash
git add app/(coe)/exam-management/exam-timetables/page.tsx
git commit -m "feat: add exam_type filter and batch_capacity fields to exam timetable UI"
```

---

## Task 5: Create Batch Assignment Utility

**Files:**
- Create: `lib/utils/practical-batch-assignment.ts`

**Step 1: Create the utility**

```typescript
/**
 * Derives which students belong to which practical batch.
 * Stateless — calculated from sorted registrations + timetable batch capacities.
 *
 * @param registrations - All exam_registrations for a course (fee_paid=true)
 * @param practicalTimetables - Timetable rows for the course where exam_type='Practical',
 *                              sorted by exam_date ASC, session (FN before AN)
 * @returns Map of exam_timetable_id → array of registration objects
 */

interface Registration {
  id: string
  stu_register_no: string
  student_name: string
  is_regular: boolean
  attempt_number?: number
  program_code?: string
  course_code?: string
  [key: string]: any
}

interface PracticalTimetableRow {
  id: string
  exam_date: string
  session: string
  batch_capacity: number
}

export function deriveBatchAssignments(
  registrations: Registration[],
  practicalTimetables: PracticalTimetableRow[]
): Map<string, Registration[]> {
  // 1. Sort students: regular first, then by register number
  const sorted = [...registrations].sort((a, b) => {
    // Regular students first (is_regular=true or is_regular not explicitly false)
    const aRegular = a.is_regular !== false ? 1 : 0
    const bRegular = b.is_regular !== false ? 1 : 0
    if (aRegular !== bRegular) return bRegular - aRegular
    // Then by register number
    return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
  })

  // 2. Sort timetable rows: date ASC, FN before AN
  const sortedTT = [...practicalTimetables].sort((a, b) => {
    const dateCompare = a.exam_date.localeCompare(b.exam_date)
    if (dateCompare !== 0) return dateCompare
    // FN before AN
    const sessionOrder = (s: string) => s === 'FN' ? 0 : 1
    return sessionOrder(a.session) - sessionOrder(b.session)
  })

  // 3. Assign sequentially
  const result = new Map<string, Registration[]>()
  let offset = 0

  for (const tt of sortedTT) {
    const batchStudents = sorted.slice(offset, offset + tt.batch_capacity)
    result.set(tt.id, batchStudents)
    offset += tt.batch_capacity
  }

  return result
}

/**
 * Get a display batch number for a timetable row within its course's practical batches.
 * Batch numbers are 1-indexed, ordered by date ASC then session FN<AN.
 */
export function getBatchNumber(
  timetableId: string,
  allPracticalTimetables: PracticalTimetableRow[]
): number {
  const sorted = [...allPracticalTimetables].sort((a, b) => {
    const dateCompare = a.exam_date.localeCompare(b.exam_date)
    if (dateCompare !== 0) return dateCompare
    const sessionOrder = (s: string) => s === 'FN' ? 0 : 1
    return sessionOrder(a.session) - sessionOrder(b.session)
  })
  const index = sorted.findIndex(tt => tt.id === timetableId)
  return index + 1
}
```

**Step 2: Commit**

```bash
git add lib/utils/practical-batch-assignment.ts
git commit -m "feat: add stateless batch assignment utility for practical exams"
```

---

## Task 6: Create Practical Marks API Route

**Files:**
- Create: `app/api/post-exam/practical-marks/route.ts`

**Reference:** `app/api/post-exam/external-marks/route.ts` — follow same patterns.

**Step 1: Create the GET handler**

The GET handler supports multiple actions via `?action=` query param:

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const supabase = getSupabaseServer()

    const institutionCode = searchParams.get('institution_code')
    const institutionsIdParam = searchParams.get('institutions_id')

    switch (action) {
      case 'institutions': {
        let query = supabase
          .from('institutions')
          .select('id, name, institution_code')
          .eq('is_active', true)

        if (institutionCode) {
          query = query.eq('institution_code', institutionCode)
        } else if (institutionsIdParam) {
          query = query.eq('id', institutionsIdParam)
        }

        const { data, error } = await query.order('name')
        if (error) return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
        return NextResponse.json(data)
      }

      case 'sessions': {
        const institutionId = searchParams.get('institutionId')
        if (!institutionId) return NextResponse.json({ error: 'Institution ID required' }, { status: 400 })

        const { data, error } = await supabase
          .from('examination_sessions')
          .select('id, session_name, session_code')
          .eq('institutions_id', institutionId)
          .order('session_name')

        if (error) return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
        return NextResponse.json(data)
      }

      case 'practical-courses': {
        // Fetch courses that have practical timetable entries for this session
        const institutionId = searchParams.get('institutionId')
        const sessionId = searchParams.get('sessionId')
        if (!institutionId || !sessionId) {
          return NextResponse.json({ error: 'Institution ID and Session ID required' }, { status: 400 })
        }

        // Get distinct course_ids from practical timetable entries
        const { data: timetables, error: ttError } = await supabase
          .from('exam_timetables')
          .select('course_id')
          .eq('institutions_id', institutionId)
          .eq('examination_session_id', sessionId)
          .eq('exam_type', 'Practical')
          .eq('is_published', true)
          .range(0, 9999)

        if (ttError) return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 500 })

        const courseIds = [...new Set((timetables || []).map(t => t.course_id).filter(Boolean))]
        if (courseIds.length === 0) return NextResponse.json([])

        const { data: courses, error: cError } = await supabase
          .from('courses')
          .select('id, course_code, course_name, external_max_mark, internal_max_mark')
          .in('id', courseIds)
          .order('course_code')

        if (cError) return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
        return NextResponse.json(courses || [])
      }

      case 'practical-batches': {
        // Get all practical timetable rows for a specific course (these are the "batches")
        const institutionId = searchParams.get('institutionId')
        const sessionId = searchParams.get('sessionId')
        const courseId = searchParams.get('courseId')
        if (!institutionId || !sessionId || !courseId) {
          return NextResponse.json({ error: 'Institution, Session, and Course IDs required' }, { status: 400 })
        }

        const { data, error } = await supabase
          .from('exam_timetables')
          .select('id, exam_date, session, batch_capacity, is_published')
          .eq('institutions_id', institutionId)
          .eq('examination_session_id', sessionId)
          .eq('course_id', courseId)
          .eq('exam_type', 'Practical')
          .eq('is_published', true)
          .order('exam_date', { ascending: true })

        if (error) return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 })

        // Sort FN before AN within same date, add batch_no
        const sorted = (data || []).sort((a: any, b: any) => {
          const dateCompare = a.exam_date.localeCompare(b.exam_date)
          if (dateCompare !== 0) return dateCompare
          return a.session === 'FN' ? -1 : 1
        })

        const withBatchNo = sorted.map((row: any, idx: number) => ({
          ...row,
          batch_no: idx + 1
        }))

        return NextResponse.json(withBatchNo)
      }

      case 'batch-students': {
        // Get students for a specific practical batch
        const institutionId = searchParams.get('institutionId')
        const sessionId = searchParams.get('sessionId')
        const courseId = searchParams.get('courseId')
        const timetableId = searchParams.get('timetableId') // the specific batch's timetable row
        if (!institutionId || !sessionId || !courseId || !timetableId) {
          return NextResponse.json({ error: 'All filter params required' }, { status: 400 })
        }

        // 1. Get course_code from course_id
        const { data: course } = await supabase
          .from('courses')
          .select('course_code, course_name, external_max_mark, internal_max_mark')
          .eq('id', courseId)
          .single()

        if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

        // 2. Get ALL practical timetable rows for this course (to derive batch assignment)
        const { data: allBatches } = await supabase
          .from('exam_timetables')
          .select('id, exam_date, session, batch_capacity')
          .eq('institutions_id', institutionId)
          .eq('examination_session_id', sessionId)
          .eq('course_id', courseId)
          .eq('exam_type', 'Practical')
          .eq('is_published', true)
          .order('exam_date', { ascending: true })

        if (!allBatches || allBatches.length === 0) {
          return NextResponse.json({ error: 'No practical batches found' }, { status: 404 })
        }

        // 3. Get ALL registrations for this course
        const { data: registrations } = await supabase
          .from('exam_registrations')
          .select('id, stu_register_no, student_name, is_regular, attempt_number, program_code, course_code')
          .eq('institutions_id', institutionId)
          .eq('examination_session_id', sessionId)
          .eq('course_code', course.course_code)
          .eq('fee_paid', true)
          .order('stu_register_no', { ascending: true })
          .range(0, 9999)

        if (!registrations || registrations.length === 0) {
          return NextResponse.json({ error: 'No registrations found for this course' }, { status: 404 })
        }

        // 4. Sort students: regular first, then by register number
        const sorted = [...registrations].sort((a, b) => {
          const aRegular = a.is_regular !== false ? 1 : 0
          const bRegular = b.is_regular !== false ? 1 : 0
          if (aRegular !== bRegular) return bRegular - aRegular
          return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
        })

        // 5. Sort timetable rows: date ASC, FN before AN
        const sortedBatches = [...allBatches].sort((a, b) => {
          const dateCompare = a.exam_date.localeCompare(b.exam_date)
          if (dateCompare !== 0) return dateCompare
          return a.session === 'FN' ? -1 : 1
        })

        // 6. Derive batch assignment — find students for the requested timetableId
        let offset = 0
        let batchStudents: typeof sorted = []

        for (const batch of sortedBatches) {
          const capacity = batch.batch_capacity || 30
          const slice = sorted.slice(offset, offset + capacity)
          if (batch.id === timetableId) {
            batchStudents = slice
            break
          }
          offset += capacity
        }

        // 7. Check if marks already exist for these students
        const regIds = batchStudents.map(s => s.id)
        const { data: existingMarks } = await supabase
          .from('marks_entry')
          .select('exam_registration_id, total_marks_obtained, evaluator_remarks, source')
          .in('exam_registration_id', regIds.length > 0 ? regIds : ['none'])
          .eq('course_id', courseId)

        const marksMap = new Map(
          (existingMarks || []).map(m => [m.exam_registration_id, m])
        )

        // 8. Build response
        const students = batchStudents.map((reg, idx) => {
          const existing = marksMap.get(reg.id)
          return {
            serial_number: idx + 1,
            exam_registration_id: reg.id,
            register_number: reg.stu_register_no,
            student_name: reg.student_name,
            is_regular: reg.is_regular,
            program_code: reg.program_code,
            total_marks_obtained: existing?.total_marks_obtained ?? null,
            status: existing?.evaluator_remarks === 'AB' ? 'AB' : (existing ? 'Present' : null),
            has_existing_marks: !!existing,
          }
        })

        return NextResponse.json({
          students,
          course_details: {
            course_code: course.course_code,
            course_name: course.course_name,
            maximum_marks: course.external_max_mark || 100,
          },
          total_students: students.length,
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (e) {
    console.error('Practical marks API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 2: Create the POST handler**

```typescript
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServer()
    const body = await request.json()

    // body.marks is an array of { exam_registration_id, total_marks_obtained, status }
    const { institutions_id, examination_session_id, course_id, timetable_id, marks } = body

    if (!institutions_id || !examination_session_id || !course_id || !marks?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get course details for validation
    const { data: course } = await supabase
      .from('courses')
      .select('course_code, external_max_mark')
      .eq('id', course_id)
      .single()

    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const maxMarks = course.external_max_mark || 100
    const results = { saved: 0, errors: [] as any[] }

    for (const entry of marks) {
      const { exam_registration_id, total_marks_obtained, status } = entry

      // Validate: AB students cannot have marks
      if (status === 'AB' && total_marks_obtained !== null && total_marks_obtained !== undefined) {
        results.errors.push({
          exam_registration_id,
          error: 'AB students cannot have marks'
        })
        continue
      }

      // Validate: marks cannot exceed maximum
      if (status !== 'AB' && total_marks_obtained > maxMarks) {
        results.errors.push({
          exam_registration_id,
          error: `Marks (${total_marks_obtained}) exceed maximum (${maxMarks})`
        })
        continue
      }

      // Check if marks already exist for this registration + course
      const { data: existing } = await supabase
        .from('marks_entry')
        .select('id')
        .eq('exam_registration_id', exam_registration_id)
        .eq('course_id', course_id)
        .maybeSingle()

      const payload = {
        institutions_id,
        examination_session_id,
        exam_registration_id,
        course_id,
        total_marks_obtained: status === 'AB' ? null : total_marks_obtained,
        marks_out_of: maxMarks,
        evaluator_remarks: status === 'AB' ? 'AB' : (total_marks_obtained >= (course.external_max_mark ? Math.ceil(maxMarks * 0.4) : 0) ? 'PASS' : 'FAIL'),
        evaluation_date: new Date().toISOString().split('T')[0],
        source: 'Practical Entry',
        entry_status: 'Submitted',
      }

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('marks_entry')
          .update(payload)
          .eq('id', existing.id)

        if (error) {
          results.errors.push({ exam_registration_id, error: error.message })
        } else {
          results.saved++
        }
      } else {
        // Insert new
        const { error } = await supabase
          .from('marks_entry')
          .insert(payload)

        if (error) {
          results.errors.push({ exam_registration_id, error: error.message })
        } else {
          results.saved++
        }
      }
    }

    return NextResponse.json({
      success: true,
      saved: results.saved,
      errors: results.errors,
      total: marks.length,
    })
  } catch (e) {
    console.error('Practical marks save error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 3: Commit**

```bash
git add app/api/post-exam/practical-marks/route.ts
git commit -m "feat: create practical marks API with batch student derivation and mark entry"
```

---

## Task 7: Create Practical Mark Entry Page

**Files:**
- Create: `app/(coe)/post-exam/practical-mark-entry/page.tsx`

**Reference:** `app/(coe)/post-exam/external-mark-entry/page.tsx` — follow same layout patterns.

**Step 1: Create the page with cascading dropdowns and mark entry table**

The page structure:

```
┌─────────────────────────────────────────────────┐
│ Breadcrumb: Post Exam > Practical Mark Entry    │
├─────────────────────────────────────────────────┤
│ Filters Card                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│ │Institution│ │Exam Sess.│ │Course    │         │
│ └──────────┘ └──────────┘ └──────────┘         │
│ ┌──────────┐                                    │
│ │Batch     │  ← dropdown showing:              │
│ └──────────┘    "Batch 1 - 09-03-2026 FN (30)" │
│                 "Batch 2 - 09-03-2026 AN (30)" │
│                 "Batch 3 - 10-03-2026 FN (22)" │
├─────────────────────────────────────────────────┤
│ Mark Entry Table (after batch selected)         │
│ ┌────┬────────────┬──────────┬───────┬────────┐ │
│ │S.No│Register No │Name      │Mark   │Status  │ │
│ ├────┼────────────┼──────────┼───────┼────────┤ │
│ │ 1  │24BCA001    │Arun K    │[  78]│Present │ │
│ │ 2  │24BCA002    │Kavi S    │[ AB ]│Absent  │ │
│ │ 3  │24BCA003    │Priya R   │[  85]│Present │ │
│ └────┴────────────┴──────────┴───────┴────────┘ │
│                                    [Save Marks] │
└─────────────────────────────────────────────────┘
```

Key implementation details:

1. **Institution dropdown** — Auto-filled for non-super-admin via `useInstitutionFilter()`. Same pattern as external-mark-entry.

2. **Session dropdown** — Loads after institution selected. Same pattern.

3. **Course dropdown** — Fetches from `?action=practical-courses` — only shows courses with `exam_type='Practical'` timetable entries.

4. **Batch dropdown** — Fetches from `?action=practical-batches` — shows timetable rows as batches with display format: `Batch {n} - {date} {session} (Cap: {capacity})`

5. **Student table** — Fetches from `?action=batch-students`. Shows students derived from position-based batch assignment.

6. **Mark input** — Single `<Input>` per row. Accepts numeric value OR "AB" text.
   - On input: if value is "AB" (case-insensitive), set status='AB', mark=null
   - If numeric and <= max_marks, set the mark value
   - If numeric and > max_marks, show validation error
   - Keyboard navigation: Enter/Tab moves to next row's input

7. **Save** — POST to `/api/post-exam/practical-marks` with all marks as array. Show success/error toast.

8. **AB handling in UI:**
```tsx
<Input
  value={student.status === 'AB' ? 'AB' : (student.total_marks_obtained ?? '')}
  onChange={(e) => {
    const val = e.target.value.trim()
    if (val.toUpperCase() === 'AB') {
      updateStudent(idx, { status: 'AB', total_marks_obtained: null })
    } else if (val === '' || val === null) {
      updateStudent(idx, { status: null, total_marks_obtained: null })
    } else {
      const num = parseFloat(val)
      if (!isNaN(num) && num >= 0 && num <= maxMarks) {
        updateStudent(idx, { status: 'Present', total_marks_obtained: num })
      }
    }
  }}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      // Focus next row's input
      const nextInput = document.querySelector(`#mark-input-${idx + 1}`) as HTMLInputElement
      if (nextInput) {
        e.preventDefault()
        nextInput.focus()
        nextInput.select()
      }
    }
  }}
  id={`mark-input-${idx}`}
  className={cn(
    'w-24 text-center',
    student.status === 'AB' && 'bg-red-50 text-red-600 font-semibold'
  )}
/>
```

**Step 2: Commit**

```bash
git add app/(coe)/post-exam/practical-mark-entry/page.tsx
git commit -m "feat: create practical mark entry page with cascading filters and batch-wise mark entry"
```

---

## Task 8: Add Practical Mark Entry to Sidebar Navigation

**Files:**
- Modify: `components/layout/app-sidebar.tsx:254-258` (post-exam section)

**Step 1: Add navigation item**

Find the Post Exam section items (around line 254-258) and add:

```typescript
{ title: "Practical Mark Entry", url: "/post-exam/practical-mark-entry", icon: FlaskConical },
```

Add `FlaskConical` to the lucide-react imports at the top of the file (or use `Beaker` / `ClipboardPen` if `FlaskConical` is not available).

**Step 2: Commit**

```bash
git add components/layout/app-sidebar.tsx
git commit -m "feat: add practical mark entry to sidebar navigation"
```

---

## Task 9: Update Attendance Sheet for Practical Batch Filtering

**Files:**
- Modify: `app/api/pre-exam/exam-attendance-sheet/route.ts` (add batch filtering)
- Modify: `app/(coe)/pre-exam/exam-attendance-sheet/page.tsx` (add batch selector UI)

**Step 1: Update the attendance sheet API**

In `route.ts`, after Step 4 where timetables are fetched (around line 70-87), add logic to handle practical batches:

When a `batch_timetable_id` query param is provided, the API should:
1. Only use that specific timetable row (not all timetables for the date+session)
2. Derive batch students using the same algorithm as practical marks
3. Filter registrations to only include students in that batch

Add query param handling near the top:
```typescript
const batchTimetableId = searchParams.get('batch_timetable_id') // optional, for practical batches
```

After fetching timetables, if `batchTimetableId` is provided:
```typescript
if (batchTimetableId) {
  // Get the specific timetable row
  const batchTT = timetables.find(t => t.id === batchTimetableId)
  if (!batchTT) {
    return NextResponse.json({ error: 'Batch timetable not found' }, { status: 404 })
  }

  // Get ALL practical timetable rows for this course to derive batch assignment
  const { data: allPracticalBatches } = await supabase
    .from('exam_timetables')
    .select('id, exam_date, session, batch_capacity, course_id')
    .eq('institutions_id', institutionId)
    .eq('examination_session_id', examinationSessionId)
    .eq('course_id', batchTT.course_id)
    .eq('exam_type', 'Practical')
    .eq('is_published', true)
    .order('exam_date', { ascending: true })

  // ... derive batch students using same algorithm
  // ... filter allRegistrations to only include batch students
}
```

**Step 2: Update attendance sheet page UI**

In the page, after the session type dropdown (FN/AN), add a conditional batch selector:

1. After selecting date + session, check if any timetable rows for that date+session have `exam_type='Practical'`
2. If yes, show a batch selector dropdown
3. When batch selected, pass `batch_timetable_id` to the API

```tsx
{/* Practical Batch Selector - shown when practical exams exist for selected date+session */}
{practicalBatches.length > 0 && (
  <div className="space-y-2">
    <Label>Practical Batch (Optional)</Label>
    <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
      <SelectTrigger>
        <SelectValue placeholder="All batches" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Batches</SelectItem>
        {practicalBatches.map(b => (
          <SelectItem key={b.id} value={b.id}>
            Batch {b.batch_no} - {b.exam_date} {b.session} (Cap: {b.batch_capacity})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

**Step 3: Commit**

```bash
git add app/api/pre-exam/exam-attendance-sheet/route.ts app/(coe)/pre-exam/exam-attendance-sheet/page.tsx
git commit -m "feat: add practical batch filtering to attendance sheet"
```

---

## Task 10: Verify End-to-End Flow

**Step 1: Create test practical timetable entries**

Using the exam timetables page or API, create 3 timetable entries:

| course_code | exam_date | session | exam_type | batch_capacity |
|---|---|---|---|---|
| Any practical course | 2026-03-09 | FN | Practical | 30 |
| Same course | 2026-03-09 | AN | Practical | 30 |
| Same course | 2026-03-10 | FN | Practical | 22 |

**Step 2: Verify practical mark entry page**

1. Navigate to `/post-exam/practical-mark-entry`
2. Select institution → session → practical course → batch
3. Verify students appear sorted correctly (regular first, then arrears)
4. Enter marks for some students, enter "AB" for others
5. Save and verify success toast
6. Reload and verify marks persist

**Step 3: Verify attendance sheet batch filtering**

1. Navigate to `/pre-exam/exam-attendance-sheet`
2. Select institution → session → date → session type
3. If practical batches exist, verify batch selector appears
4. Select a batch and generate PDF
5. Verify PDF only contains students from that batch

**Step 4: Verify timetable list**

1. Navigate to `/exam-management/exam-timetables`
2. Filter by exam_type = Practical
3. Verify practical entries show with batch capacity badge
4. Create/edit a practical timetable entry and verify batch_capacity field appears

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete practical examination management enhancement"
```

---

## Summary of All Files

| Action | File | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/20260309_add_practical_exam_support.sql` | DB migration |
| Create | `lib/utils/practical-batch-assignment.ts` | Batch assignment utility |
| Create | `app/api/post-exam/practical-marks/route.ts` | Practical marks API |
| Create | `app/(coe)/post-exam/practical-mark-entry/page.tsx` | Mark entry page |
| Modify | `types/exam_timetable.ts` | Add exam_type, batch_capacity fields |
| Modify | `app/api/exam-management/exam-timetables/route.ts` | Support new fields in CRUD |
| Modify | `app/(coe)/exam-management/exam-timetables/page.tsx` | UI for exam_type filter + batch_capacity |
| Modify | `components/layout/app-sidebar.tsx` | Add navigation item |
| Modify | `app/api/pre-exam/exam-attendance-sheet/route.ts` | Batch filtering |
| Modify | `app/(coe)/pre-exam/exam-attendance-sheet/page.tsx` | Batch selector UI |
