# Practical Exam Batch Allotment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Replace stateless batch derivation with a persistent `practical_batch_students` table and a dedicated Batch Allotment page where admins manually assign students to practical exam batches.

**Architecture:** New `practical_batch_students` table stores which students are assigned to which practical timetable row (batch). A new `/pre-exam/batch-allotment` page provides cascading filters (Institution → Session → Course → Date → Session) and auto-selects the top N unassigned students. The existing `practical-marks` API and `attendance-sheet` batch logic are updated to query this table instead of deriving batches statically.

**Tech Stack:** Next.js 15, Supabase (PostgreSQL), Shadcn UI, Tailwind CSS, TypeScript

---

## Context: Existing Files You Need to Know

| File | Purpose |
|------|---------|
| `app/api/post-exam/practical-marks/route.ts` | Practical marks API — has `batch-students` action that currently derives students by slicing. **Must be updated to query `practical_batch_students`.** |
| `lib/utils/practical-batch-assignment.ts` | Stateless batch utility (`deriveBatchAssignments`, `getBatchNumber`). **Will be replaced/removed.** |
| `app/(coe)/post-exam/practical-mark-entry/page.tsx` | Practical mark entry page — uses `batch-students` API action. **No changes needed** (it consumes the API which we'll update). |
| `app/api/pre-exam/exam-attendance-sheet/batches/route.ts` | Returns practical timetable rows for attendance. **May need update to show assigned student counts.** |
| `app/api/pre-exam/exam-attendance-sheet/route.ts` | Attendance sheet with optional `batch_timetable_id`. **Must be updated to query `practical_batch_students` instead of deriving.** |
| `components/layout/app-sidebar.tsx` | Sidebar navigation — needs new "Batch Allotment" entry. |

## Sort Order (Critical)

Students must always be sorted in this order:
1. `program_order` ASC (from `programs` table, joined via `program_code`)
2. Regular students first (`is_regular = true`), then arrear students (`is_regular = false`)
3. `stu_register_no` ASC

The `programs` table has a `program_order INTEGER` column. The `exam_registrations` table has `program_code VARCHAR` which can be joined to `programs.program_code` to get `program_order`.

---

### Task 1: Database Migration — Create `practical_batch_students` Table

**Files:**
- Create: `supabase/migrations/20260310_create_practical_batch_students.sql`

**Step 1: Write the migration SQL**

```sql
-- Create practical_batch_students table
-- Stores which students are assigned to which practical exam batch (timetable row)

CREATE TABLE IF NOT EXISTS practical_batch_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_timetable_id UUID NOT NULL REFERENCES exam_timetables(id) ON DELETE CASCADE,
    exam_registration_id UUID NOT NULL REFERENCES exam_registrations(id) ON DELETE CASCADE,
    institutions_id UUID NOT NULL REFERENCES institutions(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    UNIQUE(exam_timetable_id, exam_registration_id)
);

-- Index for fast lookups by timetable (batch)
CREATE INDEX idx_practical_batch_students_timetable
    ON practical_batch_students(exam_timetable_id);

-- Index for checking if a student is already assigned to any batch for a course
CREATE INDEX idx_practical_batch_students_registration
    ON practical_batch_students(exam_registration_id);

-- Composite index for "find all assigned students across all batches for a course's timetables"
CREATE INDEX idx_practical_batch_students_institution
    ON practical_batch_students(institutions_id);

COMMENT ON TABLE practical_batch_students IS 'Maps students to practical exam batches (timetable rows). Each student can only appear in one batch per timetable row.';
```

**Step 2: Apply migration**

Use Supabase MCP tool: `mcp__supabase__apply_migration` with the SQL above and name `create_practical_batch_students`.

**Step 3: Verify table exists**

Use Supabase MCP tool: `mcp__supabase__execute_sql` with:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'practical_batch_students'
ORDER BY ordinal_position;
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260310_create_practical_batch_students.sql
git commit -m "feat: create practical_batch_students table for persistent batch assignment"
```

---

### Task 2: Batch Allotment API Route

**Files:**
- Create: `app/api/pre-exam/batch-allotment/route.ts`

This API handles two things:
1. **GET**: Fetch unassigned students for a course (excluding those already assigned to other batches), plus batch assignment summary
2. **POST**: Save batch assignments (insert into `practical_batch_students`)
3. **DELETE**: Remove all assignments for a specific timetable row (to re-assign)

**Step 1: Create the API route**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// GET — Fetch data for batch allotment page
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const action = searchParams.get('action')
		const supabase = getSupabaseServer()

		// Institution filter params
		const institutionCode = searchParams.get('institution_code')
		const institutionsIdParam = searchParams.get('institutions_id')

		switch (action) {

			// ------------------------------------------------------------------
			// action='institutions'
			// ------------------------------------------------------------------
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
				if (error) return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 400 })
				return NextResponse.json(data)
			}

			// ------------------------------------------------------------------
			// action='sessions'
			// Requires: institutionId
			// ------------------------------------------------------------------
			case 'sessions': {
				const institutionId = searchParams.get('institutionId')
				if (!institutionId) return NextResponse.json({ error: 'institutionId required' }, { status: 400 })

				const { data, error } = await supabase
					.from('examination_sessions')
					.select('id, session_name, session_code')
					.eq('institutions_id', institutionId)
					.order('session_name', { ascending: false })

				if (error) return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 400 })
				return NextResponse.json(data)
			}

			// ------------------------------------------------------------------
			// action='practical-courses'
			// Return courses that have Practical timetable entries.
			// Requires: institutionId, sessionId
			// ------------------------------------------------------------------
			case 'practical-courses': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				if (!institutionId || !sessionId) {
					return NextResponse.json({ error: 'institutionId and sessionId required' }, { status: 400 })
				}

				// Get all practical timetable entries for this institution+session
				const { data: timetables, error: ttError } = await supabase
					.from('exam_timetables')
					.select('course_id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('exam_type', 'Practical')
					.eq('is_published', true)

				if (ttError) return NextResponse.json({ error: 'Failed to fetch timetables' }, { status: 400 })
				if (!timetables || timetables.length === 0) return NextResponse.json([])

				const courseIds = [...new Set(timetables.map((t: any) => t.course_id))]

				const { data: courses, error: courseError } = await supabase
					.from('courses')
					.select('id, course_code, course_name')
					.in('id', courseIds)
					.order('course_code')

				if (courseError) return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 400 })
				return NextResponse.json(courses || [])
			}

			// ------------------------------------------------------------------
			// action='batches'
			// Return all practical timetable rows for a course, with assignment counts.
			// Requires: institutionId, sessionId, courseId
			// ------------------------------------------------------------------
			case 'batches': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const courseId = searchParams.get('courseId')
				if (!institutionId || !sessionId || !courseId) {
					return NextResponse.json({ error: 'institutionId, sessionId, courseId required' }, { status: 400 })
				}

				// Get timetable rows
				const { data: rows, error } = await supabase
					.from('exam_timetables')
					.select('id, exam_date, session, batch_capacity')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)
					.eq('exam_type', 'Practical')
					.eq('is_published', true)

				if (error) return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 400 })
				if (!rows || rows.length === 0) return NextResponse.json([])

				// Sort: date ASC, FN before AN
				const sorted = [...rows].sort((a: any, b: any) => {
					if (a.exam_date !== b.exam_date) return a.exam_date < b.exam_date ? -1 : 1
					return a.session === 'FN' ? -1 : 1
				})

				// Get assigned counts per timetable
				const timetableIds = sorted.map((r: any) => r.id)
				const { data: assignments } = await supabase
					.from('practical_batch_students')
					.select('exam_timetable_id')
					.in('exam_timetable_id', timetableIds)

				const countMap = new Map<string, number>()
				for (const a of assignments || []) {
					countMap.set(a.exam_timetable_id, (countMap.get(a.exam_timetable_id) || 0) + 1)
				}

				const batches = sorted.map((row: any, idx: number) => ({
					...row,
					batch_no: idx + 1,
					assigned_count: countMap.get(row.id) || 0,
				}))

				return NextResponse.json(batches)
			}

			// ------------------------------------------------------------------
			// action='unassigned-students'
			// Return students registered for this course who are NOT yet assigned
			// to ANY practical batch for this course.
			// Sorted by: program_order ASC, is_regular DESC, register_no ASC
			// Requires: institutionId, sessionId, courseId
			// ------------------------------------------------------------------
			case 'unassigned-students': {
				const institutionId = searchParams.get('institutionId')
				const sessionId = searchParams.get('sessionId')
				const courseId = searchParams.get('courseId')
				if (!institutionId || !sessionId || !courseId) {
					return NextResponse.json({ error: 'institutionId, sessionId, courseId required' }, { status: 400 })
				}

				// Get course_code from courses table
				const { data: course } = await supabase
					.from('courses')
					.select('course_code')
					.eq('id', courseId)
					.single()

				if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

				// Get ALL registrations for this course (fee paid)
				const { data: allRegistrations, error: regError } = await supabase
					.from('exam_registrations')
					.select('id, stu_register_no, student_name, is_regular, program_code')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_code', (course as any).course_code)
					.eq('fee_paid', true)

				if (regError) return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 400 })
				if (!allRegistrations || allRegistrations.length === 0) return NextResponse.json({ students: [], total_registered: 0 })

				// Get ALL timetable rows for this course to find already-assigned students
				const { data: timetables } = await supabase
					.from('exam_timetables')
					.select('id')
					.eq('institutions_id', institutionId)
					.eq('examination_session_id', sessionId)
					.eq('course_id', courseId)
					.eq('exam_type', 'Practical')

				const timetableIds = (timetables || []).map((t: any) => t.id)

				// Get already-assigned registration IDs
				let assignedRegIds = new Set<string>()
				if (timetableIds.length > 0) {
					const { data: assigned } = await supabase
						.from('practical_batch_students')
						.select('exam_registration_id')
						.in('exam_timetable_id', timetableIds)

					assignedRegIds = new Set((assigned || []).map((a: any) => a.exam_registration_id))
				}

				// Filter out already-assigned students
				const unassigned = allRegistrations.filter((r: any) => !assignedRegIds.has(r.id))

				// Get program_order for sorting
				const programCodes = [...new Set(unassigned.map((r: any) => r.program_code).filter(Boolean))]
				let programOrderMap = new Map<string, number>()
				if (programCodes.length > 0) {
					const { data: programs } = await supabase
						.from('programs')
						.select('program_code, program_order')
						.in('program_code', programCodes)

					for (const p of programs || []) {
						programOrderMap.set(p.program_code, p.program_order ?? 999)
					}
				}

				// Sort: program_order ASC → regular first → register_no ASC
				const sorted = [...unassigned].sort((a: any, b: any) => {
					const orderA = programOrderMap.get(a.program_code) ?? 999
					const orderB = programOrderMap.get(b.program_code) ?? 999
					if (orderA !== orderB) return orderA - orderB

					const regA = a.is_regular !== false ? 1 : 0
					const regB = b.is_regular !== false ? 1 : 0
					if (regA !== regB) return regB - regA

					return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
				})

				const students = sorted.map((s: any, idx: number) => ({
					serial_number: idx + 1,
					exam_registration_id: s.id,
					register_number: s.stu_register_no || '',
					student_name: s.student_name || '',
					is_regular: s.is_regular ?? true,
					program_code: s.program_code || '',
					program_order: programOrderMap.get(s.program_code) ?? 999,
				}))

				return NextResponse.json({
					students,
					total_registered: allRegistrations.length,
					total_assigned: assignedRegIds.size,
					total_unassigned: students.length,
				})
			}

			// ------------------------------------------------------------------
			// action='batch-assigned-students'
			// Return students assigned to a specific batch (timetable row).
			// Requires: timetableId
			// ------------------------------------------------------------------
			case 'batch-assigned-students': {
				const timetableId = searchParams.get('timetableId')
				if (!timetableId) return NextResponse.json({ error: 'timetableId required' }, { status: 400 })

				const { data: assignments, error } = await supabase
					.from('practical_batch_students')
					.select('exam_registration_id')
					.eq('exam_timetable_id', timetableId)

				if (error) return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 400 })

				const regIds = (assignments || []).map((a: any) => a.exam_registration_id)
				if (regIds.length === 0) return NextResponse.json([])

				const { data: students } = await supabase
					.from('exam_registrations')
					.select('id, stu_register_no, student_name, is_regular, program_code')
					.in('id', regIds)

				return NextResponse.json(students || [])
			}

			default:
				return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 })
		}
	} catch (error) {
		console.error('Error in GET /api/pre-exam/batch-allotment:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// ---------------------------------------------------------------------------
// POST — Save batch assignments
// Body: { timetable_id, institutions_id, exam_registration_ids: string[] }
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()
		const { timetable_id, institutions_id, exam_registration_ids } = body

		if (!timetable_id) return NextResponse.json({ error: 'timetable_id required' }, { status: 400 })
		if (!institutions_id) return NextResponse.json({ error: 'institutions_id required' }, { status: 400 })
		if (!Array.isArray(exam_registration_ids) || exam_registration_ids.length === 0) {
			return NextResponse.json({ error: 'exam_registration_ids array required' }, { status: 400 })
		}

		// Verify timetable exists and is Practical
		const { data: timetable, error: ttError } = await supabase
			.from('exam_timetables')
			.select('id, batch_capacity, exam_type')
			.eq('id', timetable_id)
			.single()

		if (ttError || !timetable) {
			return NextResponse.json({ error: 'Timetable entry not found' }, { status: 404 })
		}

		if ((timetable as any).exam_type !== 'Practical') {
			return NextResponse.json({ error: 'Timetable entry is not a Practical exam' }, { status: 400 })
		}

		// Check: assignment count must not exceed batch_capacity
		const capacity = (timetable as any).batch_capacity || 0
		if (exam_registration_ids.length > capacity) {
			return NextResponse.json({
				error: `Cannot assign ${exam_registration_ids.length} students — batch capacity is ${capacity}`,
			}, { status: 400 })
		}

		// Build insert rows
		const rows = exam_registration_ids.map((regId: string) => ({
			exam_timetable_id: timetable_id,
			exam_registration_id: regId,
			institutions_id,
		}))

		const { data, error } = await supabase
			.from('practical_batch_students')
			.insert(rows)
			.select()

		if (error) {
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Some students are already assigned to this batch' }, { status: 400 })
			}
			if (error.code === '23503') {
				return NextResponse.json({ error: 'Invalid timetable or registration reference' }, { status: 400 })
			}
			console.error('Error saving batch assignments:', error)
			return NextResponse.json({ error: 'Failed to save assignments' }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			assigned: data?.length || 0,
		}, { status: 201 })
	} catch (error) {
		console.error('Error in POST /api/pre-exam/batch-allotment:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// ---------------------------------------------------------------------------
// DELETE — Remove all assignments for a specific timetable row (re-assign)
// Query param: timetable_id
// ---------------------------------------------------------------------------

export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const timetableId = searchParams.get('timetable_id')
		const supabase = getSupabaseServer()

		if (!timetableId) return NextResponse.json({ error: 'timetable_id required' }, { status: 400 })

		const { error } = await supabase
			.from('practical_batch_students')
			.delete()
			.eq('exam_timetable_id', timetableId)

		if (error) {
			console.error('Error deleting batch assignments:', error)
			return NextResponse.json({ error: 'Failed to remove assignments' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE /api/pre-exam/batch-allotment:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

**Step 2: Verify API starts without errors**

Run: `npm run build` or test via dev server that `/api/pre-exam/batch-allotment?action=institutions` returns data.

**Step 3: Commit**

```bash
git add app/api/pre-exam/batch-allotment/route.ts
git commit -m "feat: create batch allotment API with CRUD for practical_batch_students"
```

---

### Task 3: Batch Allotment Page

**Files:**
- Create: `app/(coe)/pre-exam/batch-allotment/page.tsx`

**Design:**
- Cascading filters: Institution → Session → Course (practical) → Batch selector cards
- Each batch card shows: Batch N — date, session, capacity, assigned count
- Selecting a batch loads unassigned students with checkboxes
- Auto-selects top N (batch_capacity) students
- "Assign to Batch" button saves
- Already-full batches show green checkmark

**UI Layout:**

```
┌─────────────────────────────────────────────────────┐
│ [Institution ▼] [Session ▼] [Course ▼]             │
├─────────────────────────────────────────────────────┤
│ Batch Summary Cards:                                │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│ │ Batch 1  │ │ Batch 2  │ │ Batch 3  │             │
│ │ 23-03 FN │ │ 24-03 FN │ │ 24-03 AN │             │
│ │ 31/31 ✓  │ │ 14/14 ◼  │ │ 0/34     │  ← click   │
│ └──────────┘ └──────────┘ └──────────┘             │
├─────────────────────────────────────────────────────┤
│ Unassigned Students (for selected batch):           │
│ ┌────┬─────────┬────────────┬─────────┬──────────┐  │
│ │ ☑  │ Reg No  │ Name       │ Program │ Type     │  │
│ ├────┼─────────┼────────────┼─────────┼──────────┤  │
│ │ ☑  │ 24CA001 │ Student A  │ BCA     │ Regular  │  │
│ │ ☑  │ 24CA002 │ Student B  │ BCA     │ Regular  │  │
│ │ ...│ (auto-selected up to capacity)  │          │  │
│ │ ☐  │ 22CA015 │ Student X  │ BCA     │ Arrear   │  │
│ └────┴─────────┴────────────┴─────────┴──────────┘  │
│ Selected: 34 / 34 capacity     [Assign to Batch]    │
└─────────────────────────────────────────────────────┘
```

**Step 1: Create the page**

Create `app/(coe)/pre-exam/batch-allotment/page.tsx` with the following structure. This is a large file — use the same patterns as `app/(coe)/post-exam/practical-mark-entry/page.tsx` for:
- `'use client'` directive
- `useInstitutionFilter()` hook for institution context
- Combobox pattern (Popover + Command) for Institution, Session, Course dropdowns
- Layout: AppSidebar + SidebarInset + AppHeader with Breadcrumb

**Key state variables:**

```typescript
// Filter state
const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
const [selectedSessionId, setSelectedSessionId] = useState('')
const [selectedCourseId, setSelectedCourseId] = useState('')

// Data
const [institutions, setInstitutions] = useState<any[]>([])
const [sessions, setSessions] = useState<any[]>([])
const [courses, setCourses] = useState<any[]>([])
const [batches, setBatches] = useState<any[]>([])
const [unassignedStudents, setUnassignedStudents] = useState<any[]>([])

// Selection
const [selectedBatchId, setSelectedBatchId] = useState('')
const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())

// Loading
const [loadingStudents, setLoadingStudents] = useState(false)
const [saving, setSaving] = useState(false)

// Summary
const [totalRegistered, setTotalRegistered] = useState(0)
const [totalAssigned, setTotalAssigned] = useState(0)
```

**Cascading filter fetch pattern** (same as practical-mark-entry):
- Institution changes → fetch sessions, reset session/course/batch
- Session changes → fetch practical-courses, reset course/batch
- Course changes → fetch batches (with assigned counts), reset batch/students

**When a batch card is clicked:**
1. Fetch unassigned students via `action=unassigned-students`
2. Auto-select the top N students (N = batch capacity - already assigned count)
3. Show in table with checkboxes

**Assign button handler:**
```typescript
const handleAssign = async () => {
	setSaving(true)
	try {
		const response = await fetch('/api/pre-exam/batch-allotment', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				timetable_id: selectedBatchId,
				institutions_id: effectiveInstitutionId,
				exam_registration_ids: Array.from(selectedStudentIds),
			}),
		})
		const result = await response.json()
		if (response.ok && result.success) {
			toast({ title: '✅ Assigned', description: `${result.assigned} students assigned to batch` })
			// Refresh batches and students
			await fetchBatches()
			setUnassignedStudents([])
			setSelectedStudentIds(new Set())
			setSelectedBatchId('')
		} else {
			toast({ title: '❌ Failed', description: result.error, variant: 'destructive' })
		}
	} finally {
		setSaving(false)
	}
}
```

**Batch card component** (inline, not separate file):
```tsx
{batches.map(batch => {
	const isFull = batch.assigned_count >= batch.batch_capacity
	const isSelected = selectedBatchId === batch.id
	return (
		<div
			key={batch.id}
			onClick={() => !isFull && handleBatchSelect(batch.id)}
			className={cn(
				'p-3 rounded-lg border-2 cursor-pointer transition-all',
				isSelected && 'border-violet-500 bg-violet-50 dark:bg-violet-900/20',
				isFull && 'border-green-300 bg-green-50 dark:bg-green-900/20 cursor-default',
				!isSelected && !isFull && 'border-border hover:border-violet-300'
			)}
		>
			<div className="text-sm font-semibold">Batch {batch.batch_no}</div>
			<div className="text-xs text-muted-foreground">
				{formatDate(batch.exam_date)} {batch.session}
			</div>
			<div className="text-xs mt-1">
				{batch.assigned_count} / {batch.batch_capacity}
				{isFull && <Check className="inline h-3 w-3 ml-1 text-green-600" />}
			</div>
		</div>
	)
})}
```

**Student table with checkboxes:**
```tsx
<Table>
	<TableHeader>
		<TableRow>
			<TableHead className="w-10">
				<Checkbox
					checked={selectedStudentIds.size === unassignedStudents.length && unassignedStudents.length > 0}
					onCheckedChange={handleSelectAll}
				/>
			</TableHead>
			<TableHead>S.No</TableHead>
			<TableHead>Register No</TableHead>
			<TableHead>Name</TableHead>
			<TableHead>Program</TableHead>
			<TableHead>Type</TableHead>
		</TableRow>
	</TableHeader>
	<TableBody>
		{unassignedStudents.map(student => (
			<TableRow key={student.exam_registration_id}>
				<TableCell>
					<Checkbox
						checked={selectedStudentIds.has(student.exam_registration_id)}
						onCheckedChange={() => toggleStudent(student.exam_registration_id)}
					/>
				</TableCell>
				<TableCell>{student.serial_number}</TableCell>
				<TableCell className="font-mono text-xs">{student.register_number}</TableCell>
				<TableCell>{student.student_name}</TableCell>
				<TableCell>{student.program_code}</TableCell>
				<TableCell>
					<Badge variant={student.is_regular ? 'default' : 'secondary'} className="text-xs">
						{student.is_regular ? 'Regular' : 'Arrear'}
					</Badge>
				</TableCell>
			</TableRow>
		))}
	</TableBody>
</Table>
```

**Auto-select logic when batch is clicked:**
```typescript
const handleBatchSelect = async (batchId: string) => {
	setSelectedBatchId(batchId)
	setLoadingStudents(true)
	try {
		// Fetch unassigned students
		const url = `/api/pre-exam/batch-allotment?action=unassigned-students&institutionId=${effectiveInstitutionId}&sessionId=${selectedSessionId}&courseId=${selectedCourseId}`
		const response = await fetch(url)
		const data = await response.json()
		const students = data.students || []
		setUnassignedStudents(students)
		setTotalRegistered(data.total_registered || 0)
		setTotalAssigned(data.total_assigned || 0)

		// Auto-select top N (remaining capacity)
		const batch = batches.find(b => b.id === batchId)
		const remaining = batch ? batch.batch_capacity - batch.assigned_count : 0
		const autoSelected = new Set<string>()
		for (let i = 0; i < Math.min(remaining, students.length); i++) {
			autoSelected.add(students[i].exam_registration_id)
		}
		setSelectedStudentIds(autoSelected)
	} finally {
		setLoadingStudents(false)
	}
}
```

**Important UI details:**
- Use violet accent color (consistent with practical mark entry)
- Page icon: `Users` from lucide-react
- Breadcrumb: Dashboard > Pre-Exam > Batch Allotment
- Counter bar showing: "Selected: 34 / 34 capacity" with warning if over capacity
- Warn (don't block) if selection count > batch capacity — the API POST will reject it

**Step 2: Verify page renders**

Navigate to `http://localhost:3000/pre-exam/batch-allotment` and confirm:
- Cascading filters load
- Batch cards appear after selecting course
- Students load after clicking a batch
- Auto-selection works

**Step 3: Commit**

```bash
git add "app/(coe)/pre-exam/batch-allotment/page.tsx"
git commit -m "feat: create batch allotment page with cascading filters and auto-select"
```

---

### Task 4: Add Batch Allotment to Sidebar Navigation

**Files:**
- Modify: `components/layout/app-sidebar.tsx`

**Step 1: Add navigation entry**

In the Pre-Exam section of the sidebar, add a new entry for Batch Allotment. Find the Pre-Exam section items array and add:

```typescript
{ title: "Batch Allotment", url: "/pre-exam/batch-allotment", icon: Users }
```

Make sure `Users` is imported from `lucide-react`. Place it after existing Pre-Exam items like "Exam Attendance Sheet".

**Step 2: Verify sidebar shows the new entry**

Navigate to the app and confirm "Batch Allotment" appears in Pre-Exam section.

**Step 3: Commit**

```bash
git add components/layout/app-sidebar.tsx
git commit -m "feat: add batch allotment to sidebar navigation"
```

---

### Task 5: Update Practical Marks API to Use `practical_batch_students`

**Files:**
- Modify: `app/api/post-exam/practical-marks/route.ts` (lines 194-379, the `batch-students` action)

**Current behavior:** The `batch-students` action derives students by sorting ALL registrations and slicing by cumulative capacity across timetable rows.

**New behavior:** Query `practical_batch_students` table to get students assigned to the requested timetable row.

**Step 1: Replace the batch-students action**

Replace the entire `case 'batch-students'` block (lines 194-379) with:

```typescript
case 'batch-students': {
	const institutionId = searchParams.get('institutionId')
	const sessionId = searchParams.get('sessionId')
	const courseId = searchParams.get('courseId')
	const timetableId = searchParams.get('timetableId')

	if (!institutionId || !sessionId || !courseId || !timetableId) {
		return NextResponse.json(
			{ error: 'Institution ID, session ID, course ID, and timetable ID are required' },
			{ status: 400 }
		)
	}

	// Step 1: Get course details
	const { data: course, error: courseError } = await supabase
		.from('courses')
		.select('id, course_code, course_name, external_max_mark')
		.eq('id', courseId)
		.single()

	if (courseError || !course) {
		return NextResponse.json({ error: 'Course not found' }, { status: 404 })
	}

	// Step 2: Get students assigned to this batch from practical_batch_students
	const { data: batchAssignments, error: batchError } = await supabase
		.from('practical_batch_students')
		.select('exam_registration_id')
		.eq('exam_timetable_id', timetableId)

	if (batchError) {
		return NextResponse.json({ error: 'Failed to fetch batch assignments' }, { status: 400 })
	}

	if (!batchAssignments || batchAssignments.length === 0) {
		return NextResponse.json({
			students: [],
			course_details: {
				course_code: (course as any).course_code,
				course_name: (course as any).course_name,
				maximum_marks: (course as any).external_max_mark,
			},
			total_students: 0,
		})
	}

	// Step 3: Get student details from exam_registrations
	const regIds = batchAssignments.map((a: any) => a.exam_registration_id)

	const { data: registrations, error: regError } = await supabase
		.from('exam_registrations')
		.select('id, stu_register_no, student_name, is_regular, program_code')
		.in('id', regIds)

	if (regError) {
		return NextResponse.json({ error: 'Failed to fetch student registrations' }, { status: 400 })
	}

	// Sort: program_order ASC → regular first → register_no ASC
	const programCodes = [...new Set((registrations || []).map((r: any) => r.program_code).filter(Boolean))]
	let programOrderMap = new Map<string, number>()
	if (programCodes.length > 0) {
		const { data: programs } = await supabase
			.from('programs')
			.select('program_code, program_order')
			.in('program_code', programCodes)

		for (const p of programs || []) {
			programOrderMap.set(p.program_code, p.program_order ?? 999)
		}
	}

	const sortedStudents = [...(registrations || [])].sort((a: any, b: any) => {
		const orderA = programOrderMap.get(a.program_code) ?? 999
		const orderB = programOrderMap.get(b.program_code) ?? 999
		if (orderA !== orderB) return orderA - orderB

		if (a.is_regular !== b.is_regular) return b.is_regular === true ? 1 : -1

		return (a.stu_register_no || '').localeCompare(b.stu_register_no || '')
	})

	// Step 4: Check existing marks_entry for these students
	const { data: existingMarks } = await supabase
		.from('marks_entry')
		.select('id, exam_registration_id, total_marks_obtained, evaluator_remarks, entry_status')
		.eq('course_id', courseId)
		.eq('examination_session_id', sessionId)
		.eq('source', 'Practical Entry')
		.in('exam_registration_id', regIds)

	const marksMap = new Map<string, any>()
	for (const m of existingMarks || []) {
		marksMap.set(m.exam_registration_id, m)
	}

	// Step 5: Build response
	const students = sortedStudents.map((student: any, idx: number) => {
		const existing = marksMap.get(student.id)
		let status: string | null = null
		let total_marks_obtained: number | null = null

		if (existing) {
			if (existing.evaluator_remarks === 'AB') {
				status = 'AB'
				total_marks_obtained = null
			} else {
				status = 'Present'
				total_marks_obtained = existing.total_marks_obtained != null
					? Number(existing.total_marks_obtained)
					: null
			}
		}

		return {
			serial_number: idx + 1,
			exam_registration_id: student.id,
			register_number: student.stu_register_no || '',
			student_name: student.student_name || '',
			is_regular: student.is_regular ?? true,
			program_code: student.program_code || null,
			total_marks_obtained,
			status,
			has_existing_marks: !!existing,
		}
	})

	return NextResponse.json({
		students,
		course_details: {
			course_code: (course as any).course_code,
			course_name: (course as any).course_name,
			maximum_marks: (course as any).external_max_mark,
		},
		total_students: students.length,
	})
}
```

**Step 2: Remove the import of `practical-batch-assignment.ts`**

If the route file imports from `lib/utils/practical-batch-assignment.ts`, remove that import. (Check — it may not import it since it does inline derivation.)

**Step 3: Verify practical mark entry still works**

Navigate to `/post-exam/practical-mark-entry`, select a course/batch that has been allotted via the new page. Confirm students load correctly.

**Step 4: Commit**

```bash
git add app/api/post-exam/practical-marks/route.ts
git commit -m "refactor: use practical_batch_students table for batch-students action"
```

---

### Task 6: Update Attendance Sheet to Use `practical_batch_students`

**Files:**
- Modify: `app/api/pre-exam/exam-attendance-sheet/route.ts` (the `batch_timetable_id` handling section)

**Current behavior:** When `batch_timetable_id` is provided, it derives batch students using stateless slicing (Step 7b in the route).

**New behavior:** Query `practical_batch_students` to get students assigned to the batch.

**Step 1: Find and replace the Step 7b section**

Find the section after "Step 7" that handles `batchTimetableId`. It currently:
1. Fetches all timetable rows and registrations
2. Calls sorting/slicing logic
3. Rebuilds registrationMap

Replace with a simpler query:

```typescript
// Step 7b: If a practical batch is specified, filter to only batch-assigned students
if (batchTimetableId) {
	const { data: batchAssignments } = await supabase
		.from('practical_batch_students')
		.select('exam_registration_id')
		.eq('exam_timetable_id', batchTimetableId)

	if (batchAssignments && batchAssignments.length > 0) {
		const batchRegIds = new Set(batchAssignments.map((a: any) => a.exam_registration_id))

		// Filter registrationMap to only include batch students
		const newMap = new Map()
		const newSheetKeySet = new Set<string>()

		for (const [key, reg] of registrationMap) {
			if (batchRegIds.has(reg.id)) {
				newMap.set(key, reg)
				newSheetKeySet.add(key)
			}
		}

		registrationMap.clear()
		for (const [k, v] of newMap) registrationMap.set(k, v)
		sheetKeySet.clear()
		for (const k of newSheetKeySet) sheetKeySet.add(k)
	} else {
		// No students assigned to this batch
		registrationMap.clear()
		sheetKeySet.clear()
	}
}
```

**Step 2: Verify attendance sheet batch filtering works**

Navigate to `/pre-exam/exam-attendance-sheet`, select a date with practical batches, select a batch, and verify only batch students appear.

**Step 3: Commit**

```bash
git add app/api/pre-exam/exam-attendance-sheet/route.ts
git commit -m "refactor: use practical_batch_students for attendance sheet batch filtering"
```

---

### Task 7: Clean Up — Remove Stateless Batch Utility

**Files:**
- Delete: `lib/utils/practical-batch-assignment.ts`
- Modify: Any files that import from it

**Step 1: Check for imports**

Search the codebase for any imports of `practical-batch-assignment`:

```bash
grep -r "practical-batch-assignment" --include="*.ts" --include="*.tsx" .
```

**Step 2: Remove imports and the file**

If no other files import it (the practical-marks API route does inline derivation, not via this utility), delete the file:

```bash
rm lib/utils/practical-batch-assignment.ts
```

If any files import `getBatchNumber` or `deriveBatchAssignments`, update them to remove the import and use alternative logic (batch numbers come from the API now).

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove stateless batch assignment utility (replaced by practical_batch_students)"
```

---

### Task 8: Verify End-to-End Flow

**Manual test checklist:**

1. **Timetable setup**: Verify practical timetable entries exist (e.g., 3 batches for 24UMAGEP03 with capacities 31, 14, 34)

2. **Batch Allotment page** (`/pre-exam/batch-allotment`):
   - Select institution → session → course
   - Verify 3 batch cards appear with 0/31, 0/14, 0/34
   - Click Batch 1 → verify students load sorted by program_order, regular first, register_no
   - Verify top 31 are auto-selected
   - Click "Assign to Batch" → verify success toast
   - Verify Batch 1 card now shows 31/31 with checkmark
   - Click Batch 2 → verify previously assigned 31 students are NOT shown
   - Verify top 14 auto-selected
   - Assign → verify Batch 2 shows 14/14
   - Repeat for Batch 3

3. **Practical Mark Entry** (`/post-exam/practical-mark-entry`):
   - Select same course → select Batch 1
   - Verify exactly 31 students load (the ones assigned in step 2)
   - Enter marks, save → verify PDF downloads

4. **Attendance Sheet** (`/pre-exam/exam-attendance-sheet`):
   - Select date/session with practical exams
   - Select practical batch → verify only batch students appear

**No automated tests** — this is a UI-heavy feature best validated manually.

---

## Summary of Changes

| Component | Action | Purpose |
|-----------|--------|---------|
| `practical_batch_students` table | CREATE | Persist student-to-batch assignments |
| `/api/pre-exam/batch-allotment` | CREATE | CRUD API for batch assignments |
| `/pre-exam/batch-allotment` page | CREATE | UI for manual batch allotment |
| Sidebar | MODIFY | Add Batch Allotment nav item |
| `/api/post-exam/practical-marks` | MODIFY | Query `practical_batch_students` instead of deriving |
| `/api/pre-exam/exam-attendance-sheet` | MODIFY | Query `practical_batch_students` for batch filtering |
| `practical-batch-assignment.ts` | DELETE | No longer needed |
