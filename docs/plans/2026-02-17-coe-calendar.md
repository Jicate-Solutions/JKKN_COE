# COE Calendar Management System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a per-institution COE academic calendar module with CRUD management at `/pre-exam/coe-calendar`, Excel bulk upload, and dual-layer display (exam timetable dots + COE event pills) on the existing dashboard calendar widget.

**Architecture:** Each institution's COE admin manages their own calendar of academic milestone events (CIA-I, CIA-II, Model Exam, Practical Exam, Semester Theory, General). A dedicated `useCoeCalendar` hook fetches events and feeds them to an enhanced `ExamCalendar` component. Super admin sees all institutions.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), TypeScript, Shadcn UI, Tailwind CSS, xlsx (for Excel import/export), Zod (for validation)

---

## Overview of Tasks

1. Database migration — create `coe_calendar` table
2. Database migration — seed the 27 events from the physical calendar
3. Types — `types/coe-calendar.ts`
4. API — `GET /api/coe-calendar` and `POST /api/coe-calendar`
5. API — `PUT /api/coe-calendar/[id]` and `DELETE /api/coe-calendar/[id]`
6. API — `GET /api/coe-calendar/template` (download Excel template)
7. API — `POST /api/coe-calendar/bulk-upload` (parse Excel → insert)
8. Hook — `hooks/use-coe-calendar.ts`
9. Dashboard — enhance `ExamCalendar` component with COE event pills
10. Dashboard — wire `useCoeCalendar` into dashboard page
11. Management page — `app/(coe)/pre-exam/coe-calendar/page.tsx`
12. Sidebar — add COE Calendar nav entry

---

## Task 1: Database Migration — Create Table

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_create_coe_calendar.sql`
  (Use `date +%Y%m%d%H%M%S` in bash to get the timestamp, or name it sequentially after your latest migration)

**Step 1: Check your latest migration filename**

```bash
ls supabase/migrations/ | tail -5
```

**Step 2: Apply the migration via Supabase MCP**

Use the `apply_migration` MCP tool with name `create_coe_calendar` and the following SQL:

```sql
CREATE TABLE coe_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  institution_code TEXT,
  academic_year TEXT NOT NULL DEFAULT '2025-2026',
  programme_type TEXT NOT NULL CHECK (programme_type IN ('UG', 'PG', 'BOTH')),
  exam_category TEXT NOT NULL CHECK (exam_category IN (
    'CIA_I', 'CIA_II', 'MODEL_EXAM', 'PRACTICAL_EXAM', 'SEMESTER_THEORY', 'GENERAL'
  )),
  event_title TEXT NOT NULL,
  event_description TEXT,
  event_start_date DATE NOT NULL,
  event_end_date DATE NOT NULL,
  is_bulk_uploaded BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for institution-based queries (primary access pattern)
CREATE INDEX idx_coe_calendar_institutions_id ON coe_calendar(institutions_id);

-- Index for date range queries (dashboard calendar)
CREATE INDEX idx_coe_calendar_dates ON coe_calendar(event_start_date, event_end_date);

-- Index for category filtering
CREATE INDEX idx_coe_calendar_category ON coe_calendar(exam_category);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_coe_calendar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coe_calendar_updated_at
  BEFORE UPDATE ON coe_calendar
  FOR EACH ROW EXECUTE FUNCTION update_coe_calendar_updated_at();
```

**Step 3: Verify table was created**

Use `execute_sql` MCP tool:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'coe_calendar' ORDER BY ordinal_position;
```

Expected: 13 rows, one per column.

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: create coe_calendar table with indexes and trigger"
```

---

## Task 2: Database Migration — Seed the 27 Events

> **Note:** The seed targets ALL institutions in the system (each institution gets the same base calendar). If there are no institutions yet, skip and seed manually per institution via the UI once it's built.

**Step 1: Check what institutions exist**

Use `execute_sql` MCP tool:
```sql
SELECT id, institution_code FROM institutions LIMIT 10;
```

**Step 2: Apply seed migration**

Use `apply_migration` MCP tool with name `seed_coe_calendar_2025_2026` and the following SQL (replace `YOUR_INSTITUTION_ID` with actual UUID from Step 1, or use a subquery):

```sql
-- Seed for each institution — wrap in a DO block so it loops
DO $$
DECLARE
  inst RECORD;
BEGIN
  FOR inst IN SELECT id, institution_code FROM institutions LOOP
    INSERT INTO coe_calendar
      (institutions_id, institution_code, academic_year, programme_type, exam_category, event_title, event_start_date, event_end_date, is_bulk_uploaded)
    VALUES
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'GENERAL',           'Commencement of I,II UG and PG classes',                '2025-11-24', '2025-11-24', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'GENERAL',           'Collection of Course List from all Departments',          '2025-11-24', '2025-11-24', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'CIA_I',           'CIA_I',  'CIA-I Circular',                                          '2026-01-07', '2026-01-07', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'CIA_I',             'Last date for question paper submission (CIA-I)',          '2026-01-20', '2026-01-20', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'CIA_I',             'CIA-I Commencement',                                      '2026-02-03', '2026-02-03', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'CIA_I',             'CIA-I Ends',                                              '2026-02-11', '2026-02-11', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'GENERAL',           'Examination Fees Circular',                               '2026-01-27', '2026-01-27', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'GENERAL',           'Nominal Roll Submission',                                 '2026-02-11', '2026-02-11', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'GENERAL',           'Exam Fees without Fine - Last Date',                      '2026-02-11', '2026-02-11', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'GENERAL',           'Exam Fees with Fine - Last Date',                         '2026-02-16', '2026-02-16', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'CIA_II',            'CIA-II Circular',                                         '2026-02-16', '2026-02-16', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'CIA_II',            'CIA-II QP Submission',                                    '2026-02-20', '2026-02-20', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'CIA_II',            'CIA-II Commencement',                                     '2026-03-10', '2026-03-10', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'CIA_II',            'CIA-II Ends',                                             '2026-03-18', '2026-03-18', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'MODEL_EXAM',        'Model Exam Circular',                                     '2026-02-23', '2026-02-23', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'MODEL_EXAM',        'Model QP Submission',                                     '2026-03-02', '2026-03-02', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'MODEL_EXAM',        'Model Exam Starts',                                       '2026-04-01', '2026-04-01', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'MODEL_EXAM',        'Model Exam Ends',                                         '2026-04-10', '2026-04-10', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'PRACTICAL_EXAM',    'Practical Circular',                                      '2026-03-05', '2026-03-05', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'PRACTICAL_EXAM',    'Practical Exam Starts',                                   '2026-03-20', '2026-03-20', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'PRACTICAL_EXAM',    'Practical Exam Ends',                                     '2026-03-30', '2026-03-30', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'SEMESTER_THEORY',   'End Semester Circular',                                   '2026-04-06', '2026-04-06', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'SEMESTER_THEORY',   'Last Working Day',                                        '2026-04-10', '2026-04-10', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'SEMESTER_THEORY',   'End Semester Exams Start',                                '2026-04-20', '2026-04-20', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'SEMESTER_THEORY',   'Central Valuation Start',                                 '2026-04-24', '2026-04-24', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'SEMESTER_THEORY',   'Semester Exams End',                                      '2026-05-16', '2026-05-16', TRUE),
      (inst.id, inst.institution_code, '2025-2026', 'BOTH', 'SEMESTER_THEORY',   'Result Publication',                                      '2026-05-29', '2026-05-29', TRUE)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
```

**Step 3: Verify seed**

```sql
SELECT exam_category, COUNT(*) FROM coe_calendar GROUP BY exam_category ORDER BY exam_category;
```

Expected: 6 category rows, totalling 27 × (number of institutions).

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: seed coe_calendar with 2025-2026 academic calendar events"
```

---

## Task 3: Types

**Files:**
- Create: `types/coe-calendar.ts`

**Step 1: Write the types**

```typescript
// types/coe-calendar.ts

export type CoeCalendarCategory =
  | 'CIA_I'
  | 'CIA_II'
  | 'MODEL_EXAM'
  | 'PRACTICAL_EXAM'
  | 'SEMESTER_THEORY'
  | 'GENERAL'

export type CoeCalendarProgrammeType = 'UG' | 'PG' | 'BOTH'

export type CoeCalendarStatus = 'ACTIVE' | 'INACTIVE'

export interface CoeCalendarEvent {
  id: string
  institutions_id: string
  institution_code: string | null
  academic_year: string
  programme_type: CoeCalendarProgrammeType
  exam_category: CoeCalendarCategory
  event_title: string
  event_description: string | null
  event_start_date: string   // ISO date: 'YYYY-MM-DD'
  event_end_date: string     // ISO date: 'YYYY-MM-DD'
  is_bulk_uploaded: boolean
  status: CoeCalendarStatus
  created_at: string
  updated_at: string
}

export interface CoeCalendarFormData {
  event_title: string
  event_description: string
  exam_category: CoeCalendarCategory | ''
  programme_type: CoeCalendarProgrammeType | ''
  academic_year: string
  event_start_date: string
  event_end_date: string
  status: CoeCalendarStatus
  institutions_id: string
  institution_code: string
}

// Category display config used in UI and calendar legend
export const COE_CATEGORY_CONFIG: Record<CoeCalendarCategory, { label: string; color: string; bgColor: string; textColor: string }> = {
  CIA_I:            { label: 'CIA-I',          color: 'bg-blue-500',    bgColor: 'bg-blue-50 dark:bg-blue-500/10',    textColor: 'text-blue-700 dark:text-blue-400' },
  CIA_II:           { label: 'CIA-II',         color: 'bg-amber-500',   bgColor: 'bg-amber-50 dark:bg-amber-500/10',  textColor: 'text-amber-700 dark:text-amber-400' },
  MODEL_EXAM:       { label: 'Model Exam',     color: 'bg-purple-500',  bgColor: 'bg-purple-50 dark:bg-purple-500/10',textColor: 'text-purple-700 dark:text-purple-400' },
  PRACTICAL_EXAM:   { label: 'Practical',      color: 'bg-teal-500',    bgColor: 'bg-teal-50 dark:bg-teal-500/10',    textColor: 'text-teal-700 dark:text-teal-400' },
  SEMESTER_THEORY:  { label: 'Semester',       color: 'bg-rose-500',    bgColor: 'bg-rose-50 dark:bg-rose-500/10',    textColor: 'text-rose-700 dark:text-rose-400' },
  GENERAL:          { label: 'General',        color: 'bg-slate-400',   bgColor: 'bg-slate-50 dark:bg-slate-500/10',  textColor: 'text-slate-600 dark:text-slate-400' },
}

export const COE_CATEGORIES: CoeCalendarCategory[] = [
  'CIA_I', 'CIA_II', 'MODEL_EXAM', 'PRACTICAL_EXAM', 'SEMESTER_THEORY', 'GENERAL'
]

export const COE_PROGRAMME_TYPES: CoeCalendarProgrammeType[] = ['UG', 'PG', 'BOTH']
```

**Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `coe-calendar.ts`

**Step 3: Commit**

```bash
git add types/coe-calendar.ts
git commit -m "feat: add CoeCalendarEvent types and category config"
```

---

## Task 4: API — GET and POST `/api/coe-calendar`

**Files:**
- Create: `app/api/coe-calendar/route.ts`

**Step 1: Create the route file**

```typescript
// app/api/coe-calendar/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
  const supabase = getSupabaseServer()
  const { searchParams } = new URL(request.url)

  const institutionsId = searchParams.get('institutions_id')
  const institutionCode = searchParams.get('institution_code')
  const academicYear = searchParams.get('academic_year')
  const examCategory = searchParams.get('exam_category')
  const status = searchParams.get('status') || 'ACTIVE'

  let query = supabase.from('coe_calendar').select('*')

  if (institutionsId) {
    query = query.eq('institutions_id', institutionsId)
  } else if (institutionCode) {
    query = query.eq('institution_code', institutionCode)
  }

  if (academicYear) query = query.eq('academic_year', academicYear)
  if (examCategory) query = query.eq('exam_category', examCategory)
  if (status !== 'ALL') query = query.eq('status', status)

  query = query.order('event_start_date', { ascending: true })

  const { data, error } = await query.range(0, 9999)

  if (error) {
    console.error('coe_calendar GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  const supabase = getSupabaseServer()
  const body = await request.json()

  // Required field validation
  if (!body.event_title?.trim()) {
    return NextResponse.json({ error: 'Event title is required' }, { status: 400 })
  }
  if (!body.exam_category) {
    return NextResponse.json({ error: 'Category is required' }, { status: 400 })
  }
  if (!body.event_start_date) {
    return NextResponse.json({ error: 'Start date is required' }, { status: 400 })
  }
  if (!body.event_end_date) {
    return NextResponse.json({ error: 'End date is required' }, { status: 400 })
  }

  // Resolve institution FK if only code provided
  let institutions_id = body.institutions_id
  let institution_code = body.institution_code

  if (institution_code && !institutions_id) {
    const { data: inst } = await supabase
      .from('institutions')
      .select('id')
      .eq('institution_code', institution_code)
      .maybeSingle()
    if (!inst) {
      return NextResponse.json({ error: `Institution "${institution_code}" not found` }, { status: 400 })
    }
    institutions_id = inst.id
  }

  if (!institutions_id) {
    return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('coe_calendar')
    .insert({
      institutions_id,
      institution_code,
      academic_year: body.academic_year || '2025-2026',
      programme_type: body.programme_type || 'BOTH',
      exam_category: body.exam_category,
      event_title: body.event_title.trim(),
      event_description: body.event_description?.trim() || null,
      event_start_date: body.event_start_date,
      event_end_date: body.event_end_date,
      status: body.status || 'ACTIVE',
      is_bulk_uploaded: false,
    })
    .select()
    .single()

  if (error) {
    console.error('coe_calendar POST error:', error)
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
```

**Step 2: Test GET manually**

Start dev server (`npm run dev`) and visit:
```
http://localhost:3000/api/coe-calendar?status=ACTIVE
```
Expected: JSON array of 27 events (or 27 × institution count).

**Step 3: Test POST via curl**

```bash
curl -X POST http://localhost:3000/api/coe-calendar \
  -H "Content-Type: application/json" \
  -d '{"event_title":"Test Event","exam_category":"GENERAL","event_start_date":"2026-03-01","event_end_date":"2026-03-01","institutions_id":"YOUR_INSTITUTION_UUID"}'
```
Expected: 201 with the created event JSON.

**Step 4: Commit**

```bash
git add app/api/coe-calendar/route.ts
git commit -m "feat: add GET and POST /api/coe-calendar routes"
```

---

## Task 5: API — PUT and DELETE `/api/coe-calendar/[id]`

**Files:**
- Create: `app/api/coe-calendar/[id]/route.ts`

**Step 1: Create the dynamic route**

```typescript
// app/api/coe-calendar/[id]/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseServer()
  const { id } = params
  const body = await request.json()

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  // Never allow changing institution after creation
  const { institutions_id: _i, institution_code: _c, ...updateData } = body

  const { data, error } = await supabase
    .from('coe_calendar')
    .update({
      ...updateData,
      event_title: updateData.event_title?.trim(),
      event_description: updateData.event_description?.trim() || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('coe_calendar PUT error:', error)
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseServer()
  const { id } = params

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('coe_calendar')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('coe_calendar DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

**Step 2: Test PUT via curl**

```bash
# Replace EVENT_ID with an actual id from the GET response
curl -X PUT http://localhost:3000/api/coe-calendar/EVENT_ID \
  -H "Content-Type: application/json" \
  -d '{"event_title":"Updated Title","status":"INACTIVE"}'
```
Expected: 200 with updated event.

**Step 3: Test DELETE via curl**

```bash
curl -X DELETE http://localhost:3000/api/coe-calendar/EVENT_ID
```
Expected: `{"success":true}`

**Step 4: Commit**

```bash
git add app/api/coe-calendar/[id]/route.ts
git commit -m "feat: add PUT and DELETE /api/coe-calendar/[id] routes"
```

---

## Task 6: API — Excel Template Download

**Files:**
- Create: `app/api/coe-calendar/template/route.ts`

**Step 1: Install xlsx if not already present**

```bash
npm list xlsx 2>/dev/null | grep xlsx || npm install xlsx
```

**Step 2: Create template route**

```typescript
// app/api/coe-calendar/template/route.ts
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Data entry template
  const dataRows = [
    ['Programme', 'Category', 'Event Title', 'From Date', 'To Date', 'Description'],
    ['BOTH', 'CIA_I', 'CIA-I Commencement', '03-02-2026', '03-02-2026', ''],
  ]
  const dataSheet = XLSX.utils.aoa_to_sheet(dataRows)
  dataSheet['!cols'] = [
    { wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 30 }
  ]
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Calendar Events')

  // Sheet 2: Reference values
  const refRows = [
    ['Field', 'Valid Values'],
    ['Programme', 'UG'],
    ['Programme', 'PG'],
    ['Programme', 'BOTH'],
    ['', ''],
    ['Category', 'CIA_I — Continuous Internal Assessment I'],
    ['Category', 'CIA_II — Continuous Internal Assessment II'],
    ['Category', 'MODEL_EXAM — Model Examination'],
    ['Category', 'PRACTICAL_EXAM — Practical Examination'],
    ['Category', 'SEMESTER_THEORY — Semester Theory Examination'],
    ['Category', 'GENERAL — General Academic Event'],
  ]
  const refSheet = XLSX.utils.aoa_to_sheet(refRows)
  refSheet['!cols'] = [{ wch: 14 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, refSheet, 'Reference')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="coe-calendar-template.xlsx"',
    },
  })
}
```

**Step 3: Test template download**

Visit `http://localhost:3000/api/coe-calendar/template` — browser should download `coe-calendar-template.xlsx` with 2 sheets.

**Step 4: Commit**

```bash
git add app/api/coe-calendar/template/route.ts
git commit -m "feat: add COE Calendar Excel template download API"
```

---

## Task 7: API — Bulk Upload

**Files:**
- Create: `app/api/coe-calendar/bulk-upload/route.ts`

**Step 1: Create bulk upload route**

```typescript
// app/api/coe-calendar/bulk-upload/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import * as XLSX from 'xlsx'

const VALID_CATEGORIES = ['CIA_I', 'CIA_II', 'MODEL_EXAM', 'PRACTICAL_EXAM', 'SEMESTER_THEORY', 'GENERAL']
const VALID_PROGRAMMES = ['UG', 'PG', 'BOTH']

function parseDate(raw: string | number): string | null {
  if (!raw) return null
  // Handle Excel serial number dates
  if (typeof raw === 'number') {
    const date = XLSX.SSF.parse_date_code(raw)
    if (!date) return null
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  // Handle DD-MM-YYYY or DD.MM.YYYY strings
  const str = String(raw).trim()
  const match = str.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/)
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  }
  // Try YYYY-MM-DD directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return null
}

export async function POST(request: Request) {
  const supabase = getSupabaseServer()
  const { searchParams } = new URL(request.url)
  const institutionsId = searchParams.get('institutions_id')
  const institutionCode = searchParams.get('institution_code')
  const academicYear = searchParams.get('academic_year') || '2025-2026'

  if (!institutionsId) {
    return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]

  if (rows.length < 2) {
    return NextResponse.json({ error: 'File has no data rows' }, { status: 400 })
  }

  const errors: string[] = []
  const toInsert: object[] = []

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(cell => !cell)) continue // skip empty rows

    const [programme, category, title, fromDate, toDate, description] = row

    if (!title?.toString().trim()) {
      errors.push(`Row ${i + 1}: Event title is required`)
      continue
    }

    const cat = category?.toString().trim().toUpperCase()
    if (!VALID_CATEGORIES.includes(cat)) {
      errors.push(`Row ${i + 1}: Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`)
      continue
    }

    const prog = programme?.toString().trim().toUpperCase()
    if (!VALID_PROGRAMMES.includes(prog)) {
      errors.push(`Row ${i + 1}: Invalid programme "${programme}". Must be UG, PG, or BOTH`)
      continue
    }

    const startDate = parseDate(fromDate as any)
    const endDate = parseDate(toDate as any)

    if (!startDate) {
      errors.push(`Row ${i + 1}: Invalid From Date "${fromDate}". Use DD-MM-YYYY format`)
      continue
    }
    if (!endDate) {
      errors.push(`Row ${i + 1}: Invalid To Date "${toDate}". Use DD-MM-YYYY format`)
      continue
    }

    toInsert.push({
      institutions_id: institutionsId,
      institution_code: institutionCode,
      academic_year: academicYear,
      programme_type: prog,
      exam_category: cat,
      event_title: title.toString().trim(),
      event_description: description?.toString().trim() || null,
      event_start_date: startDate,
      event_end_date: endDate,
      status: 'ACTIVE',
      is_bulk_uploaded: true,
    })
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 })
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ error: 'No valid rows found' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('coe_calendar')
    .insert(toInsert)
    .select()

  if (error) {
    console.error('bulk-upload insert error:', error)
    return NextResponse.json({ error: 'Failed to insert events' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    inserted: data?.length || 0,
    total: toInsert.length,
  }, { status: 201 })
}
```

**Step 2: Commit**

```bash
git add app/api/coe-calendar/bulk-upload/route.ts
git commit -m "feat: add COE Calendar Excel bulk upload API"
```

---

## Task 8: Hook — `useCoeCalendar`

**Files:**
- Create: `hooks/use-coe-calendar.ts`

**Step 1: Create the hook**

```typescript
// hooks/use-coe-calendar.ts
'use client'

import { useState, useEffect, useCallback } from 'react'
import { CoeCalendarEvent } from '@/types/coe-calendar'

interface UseCoeCalendarOptions {
  institutionsId?: string | null
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL'
  academicYear?: string
}

interface UseCoeCalendarReturn {
  events: CoeCalendarEvent[]
  eventsByDate: Map<string, CoeCalendarEvent[]>
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useCoeCalendar({
  institutionsId,
  status = 'ACTIVE',
  academicYear,
}: UseCoeCalendarOptions): UseCoeCalendarReturn {
  const [events, setEvents] = useState<CoeCalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    if (!institutionsId) {
      setEvents([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('institutions_id', institutionsId)
      if (status !== 'ALL') params.set('status', status)
      if (academicYear) params.set('academic_year', academicYear)

      const res = await fetch(`/api/coe-calendar?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch COE calendar')
      const data = await res.json()
      setEvents(data || [])
    } catch (err) {
      console.error('useCoeCalendar error:', err)
      setError('Failed to load calendar events')
    } finally {
      setLoading(false)
    }
  }, [institutionsId, status, academicYear])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Build date → events map for O(1) calendar lookup
  const eventsByDate = new Map<string, CoeCalendarEvent[]>()
  for (const event of events) {
    const date = event.event_start_date
    if (!eventsByDate.has(date)) eventsByDate.set(date, [])
    eventsByDate.get(date)!.push(event)
  }

  return { events, eventsByDate, loading, error, refetch: fetchEvents }
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep coe-calendar
```

Expected: no errors.

**Step 3: Commit**

```bash
git add hooks/use-coe-calendar.ts
git commit -m "feat: add useCoeCalendar hook"
```

---

## Task 9: Enhance ExamCalendar Dashboard Widget

**Files:**
- Modify: `components/dashboard/exam-calendar.tsx`

**Step 1: Add the `calendarEvents` prop and category color imports**

At the top of the file, add the import:

```typescript
import { CoeCalendarEvent, COE_CATEGORY_CONFIG, CoeCalendarCategory } from '@/types/coe-calendar'
```

**Step 2: Update `ExamCalendarProps` interface** (around line 24)

Add `calendarEvents` prop:

```typescript
interface ExamCalendarProps {
  exams: CalendarExam[]
  calendarEvents?: CoeCalendarEvent[]   // NEW
  loading?: boolean
}
```

**Step 3: Update the component signature** (around line 52)

```typescript
export const ExamCalendar = memo(function ExamCalendar({ exams, calendarEvents = [], loading }: ExamCalendarProps) {
```

**Step 4: Add `coeEventsByDate` memo** (after `examsByDate` memo, around line 71)

```typescript
const coeEventsByDate = useMemo(() => {
  const map = new Map<string, CoeCalendarEvent[]>()
  for (const event of calendarEvents) {
    const date = event.event_start_date
    if (!map.has(date)) map.set(date, [])
    map.get(date)!.push(event)
  }
  return map
}, [calendarEvents])
```

**Step 5: Update `getExamsForDay` to also return COE events** (around line 73)

Rename and extend:

```typescript
const getEventsForDay = useCallback((day: number) => {
  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return {
    exams: examsByDate.get(dateStr) || [],
    coeEvents: coeEventsByDate.get(dateStr) || [],
  }
}, [currentYear, currentMonth, examsByDate, coeEventsByDate])
```

**Step 6: Update `calendarDays` useMemo** (around line 95)

Change the day data structure to include `coeEvents`:

```typescript
const calendarDays = useMemo(() => {
  const days: Array<{ day: number; isCurrentMonth: boolean; exams: CalendarExam[]; coeEvents: CoeCalendarEvent[] }> = []

  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ day: prevMonthDays - i, isCurrentMonth: false, exams: [], coeEvents: [] })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const { exams, coeEvents } = getEventsForDay(day)
    days.push({ day, isCurrentMonth: true, exams, coeEvents })
  }

  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({ day: i, isCurrentMonth: false, exams: [], coeEvents: [] })
  }

  return days
}, [firstDay, prevMonthDays, daysInMonth, getEventsForDay])
```

**Step 7: Update `totalExamsThisMonth` count** (around line 118)

```typescript
const totalEventsThisMonth = useMemo(() => {
  return calendarDays
    .filter(d => d.isCurrentMonth)
    .reduce((count, d) => count + d.exams.length + d.coeEvents.length, 0)
}, [calendarDays])
```

**Step 8: Update the header subtitle** (around line 149)

```typescript
{totalEventsThisMonth} event{totalEventsThisMonth !== 1 ? 's' : ''} this month
```

**Step 9: Update cell rendering to show COE event pills**

In the calendar grid, after the existing exam dots block (around line 222), add the COE event pills. The cell render becomes:

```typescript
// Inside the button/div for each day cell, after the exam dots:
{cell.coeEvents.length > 0 && (
  <div className="mt-0.5 space-y-0.5">
    {cell.coeEvents.slice(0, 2).map((event, i) => {
      const config = COE_CATEGORY_CONFIG[event.exam_category as CoeCalendarCategory]
      return (
        <div
          key={i}
          className={cn(
            'text-[8px] font-medium px-1 rounded truncate leading-tight',
            config.bgColor,
            config.textColor
          )}
          title={event.event_title}
        >
          {event.event_title.length > 10 ? event.event_title.slice(0, 10) + '…' : event.event_title}
        </div>
      )
    })}
    {cell.coeEvents.length > 2 && (
      <span className="text-[8px] text-slate-400">+{cell.coeEvents.length - 2}</span>
    )}
  </div>
)}
```

**Step 10: Update the popover content to show COE events**

In the `PopoverContent` section (around line 259), after the exam list, add:

```typescript
{cell.coeEvents.length > 0 && (
  <>
    <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        Academic Calendar
      </p>
    </div>
    {cell.coeEvents.map((event) => {
      const config = COE_CATEGORY_CONFIG[event.exam_category as CoeCalendarCategory]
      return (
        <div
          key={event.id}
          className={cn('mx-2 mb-1.5 p-2 rounded-lg', config.bgColor)}
        >
          <p className={cn('text-xs font-medium', config.textColor)}>
            {event.event_title}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {config.label}
          </p>
        </div>
      )
    })}
  </>
)}
```

**Step 11: Update the legend** (around line 319)

Replace the existing legend with a two-section legend:

```typescript
<div className="px-6 py-3 border-t border-slate-200/50 dark:border-white/5 space-y-2">
  <div className="flex items-center gap-4 flex-wrap">
    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Exam Mode:</span>
    {Object.entries(examModeColors)
      .filter(([key]) => key !== 'default')
      .map(([mode, color]) => (
        <div key={mode} className="flex items-center gap-1.5">
          <div className={cn('h-2 w-2 rounded-full', color)} />
          <span className="text-[10px] text-slate-500 dark:text-slate-400">{mode}</span>
        </div>
      ))}
  </div>
  <div className="flex items-center gap-4 flex-wrap">
    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">COE Events:</span>
    {Object.entries(COE_CATEGORY_CONFIG).map(([key, config]) => (
      <div key={key} className="flex items-center gap-1.5">
        <div className={cn('h-2 w-2 rounded-full', config.color)} />
        <span className="text-[10px] text-slate-500 dark:text-slate-400">{config.label}</span>
      </div>
    ))}
  </div>
</div>
```

**Step 12: Check TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep exam-calendar
```

Expected: no errors.

**Step 13: Commit**

```bash
git add components/dashboard/exam-calendar.tsx
git commit -m "feat: enhance ExamCalendar with COE event pills and dual legend"
```

---

## Task 10: Wire useCoeCalendar into Dashboard Page

**Files:**
- Modify: `app/(coe)/dashboard/page.tsx`

**Step 1: Add the hook import** (top of file, after existing imports)

```typescript
import { useCoeCalendar } from '@/hooks/use-coe-calendar'
```

**Step 2: Add the hook call** (inside the `Page` component, after `useInstitutionFilter`)

```typescript
const institutionId = stats?.institutionId || null
const { events: coeCalendarEvents, loading: coeLoading } = useCoeCalendar({
  institutionsId: institutionId,
})
```

**Step 3: Update `ExamCalendar` usage** (around line 437)

Add the `calendarEvents` prop:

```typescript
<ExamCalendar
  exams={calendarExams}
  calendarEvents={coeCalendarEvents}
  loading={loading || coeLoading}
/>
```

**Step 4: Verify in browser**

Visit `http://localhost:3000/dashboard` — the calendar should now show colored event pills (CIA-II in amber, etc.) alongside the green exam dots.

**Step 5: Commit**

```bash
git add app/(coe)/dashboard/page.tsx
git commit -m "feat: wire COE calendar events into dashboard ExamCalendar widget"
```

---

## Task 11: Management Page

**Files:**
- Create: `app/(coe)/pre-exam/coe-calendar/page.tsx`

**Step 1: Create the page file**

This is a large file. Follow the existing CRUD page pattern from `app/(coe)/master/degrees/page.tsx`.

Key sections:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeaderWhite } from '@/components/layout/app-header-white'
import { AppFooter } from '@/components/layout/app-footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { Plus, Upload, Download, Pencil, Trash2, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CoeCalendarEvent,
  CoeCalendarFormData,
  CoeCalendarCategory,
  CoeCalendarProgrammeType,
  COE_CATEGORY_CONFIG,
  COE_CATEGORIES,
  COE_PROGRAMME_TYPES,
} from '@/types/coe-calendar'

// ── Constants ────────────────────────────────────────────────────────

const EMPTY_FORM: CoeCalendarFormData = {
  event_title: '',
  event_description: '',
  exam_category: '',
  programme_type: 'BOTH',
  academic_year: '2025-2026',
  event_start_date: '',
  event_end_date: '',
  status: 'ACTIVE',
  institutions_id: '',
  institution_code: '',
}

// ── Page ─────────────────────────────────────────────────────────────

export default function CoeCalendarPage() {
  const { toast } = useToast()
  const { isReady, appendToUrl, institutionId, mustSelectInstitution, getInstitutionIdForCreate } = useInstitutionFilter()

  const [events, setEvents] = useState<CoeCalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CoeCalendarEvent | null>(null)
  const [form, setForm] = useState<CoeCalendarFormData>(EMPTY_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filter state
  const [filterCategory, setFilterCategory] = useState<string>('ALL')
  const [filterStatus, setFilterStatus] = useState<string>('ACTIVE')
  const [filterYear, setFilterYear] = useState<string>('ALL')

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    if (!isReady) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterCategory !== 'ALL') params.set('exam_category', filterCategory)
      if (filterStatus !== 'ALL') params.set('status', filterStatus)
      if (filterYear !== 'ALL') params.set('academic_year', filterYear)
      const url = appendToUrl(`/api/coe-calendar?${params.toString()}`)
      const res = await fetch(url)
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
    } catch {
      toast({ title: '❌ Error', description: 'Failed to load events', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [isReady, appendToUrl, filterCategory, filterStatus, filterYear, toast])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // ── Form Helpers ───────────────────────────────────────────────────

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setErrors({})
    setEditingEvent(null)
  }

  const openAdd = () => {
    resetForm()
    const instId = getInstitutionIdForCreate()
    setForm(prev => ({ ...prev, institutions_id: instId || '' }))
    setSheetOpen(true)
  }

  const openEdit = (event: CoeCalendarEvent) => {
    setEditingEvent(event)
    setForm({
      event_title: event.event_title,
      event_description: event.event_description || '',
      exam_category: event.exam_category,
      programme_type: event.programme_type,
      academic_year: event.academic_year,
      event_start_date: event.event_start_date,
      event_end_date: event.event_end_date,
      status: event.status,
      institutions_id: event.institutions_id,
      institution_code: event.institution_code || '',
    })
    setErrors({})
    setSheetOpen(true)
  }

  // ── Validation ─────────────────────────────────────────────────────

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.event_title.trim()) e.event_title = 'Event title is required'
    if (!form.exam_category) e.exam_category = 'Category is required'
    if (!form.programme_type) e.programme_type = 'Programme type is required'
    if (!form.event_start_date) e.event_start_date = 'Start date is required'
    if (!form.event_end_date) e.event_end_date = 'End date is required'
    if (form.event_start_date && form.event_end_date && form.event_end_date < form.event_start_date) {
      e.event_end_date = 'End date must be on or after start date'
    }
    if (!form.institutions_id) e.institutions_id = 'Institution is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Save ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const isEdit = !!editingEvent
      const url = isEdit ? `/api/coe-calendar/${editingEvent!.id}` : '/api/coe-calendar'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const result = await res.json()

      if (!res.ok) {
        toast({ title: '❌ Failed', description: result.error || 'Save failed', variant: 'destructive' })
        return
      }

      toast({
        title: isEdit ? '✅ Updated' : '✅ Created',
        description: `"${form.event_title}" ${isEdit ? 'updated' : 'added'} successfully`,
        className: 'bg-green-50 border-green-200 text-green-800',
      })
      setSheetOpen(false)
      resetForm()
      fetchEvents()
    } catch {
      toast({ title: '❌ Error', description: 'Unexpected error', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────

  const handleDelete = async (event: CoeCalendarEvent) => {
    if (!confirm(`Delete "${event.event_title}"?`)) return
    setDeletingId(event.id)
    try {
      const res = await fetch(`/api/coe-calendar/${event.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast({ title: '❌ Failed', description: 'Could not delete event', variant: 'destructive' })
        return
      }
      toast({
        title: '✅ Deleted',
        description: `"${event.event_title}" removed`,
        className: 'bg-green-50 border-green-200 text-green-800',
      })
      fetchEvents()
    } catch {
      toast({ title: '❌ Error', description: 'Unexpected error', variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  // ── Upload ─────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!uploadFile || !institutionId) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      const res = await fetch(`/api/coe-calendar/bulk-upload?institutions_id=${institutionId}`, {
        method: 'POST',
        body: fd,
      })
      const result = await res.json()
      if (!res.ok) {
        const errMsg = result.errors?.join('\n') || result.error || 'Upload failed'
        toast({ title: '❌ Upload Failed', description: errMsg, variant: 'destructive' })
        return
      }
      toast({
        title: '✅ Uploaded',
        description: `${result.inserted} events imported successfully`,
        className: 'bg-green-50 border-green-200 text-green-800',
      })
      setUploadSheetOpen(false)
      setUploadFile(null)
      fetchEvents()
    } catch {
      toast({ title: '❌ Error', description: 'Upload failed', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  const handleTemplateDownload = () => {
    window.open('/api/coe-calendar/template', '_blank')
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeaderWhite />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
                <CalendarDays className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">COE Calendar</h1>
                <p className="text-sm text-slate-500">{events.length} events</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleTemplateDownload}>
                <Download className="h-4 w-4 mr-1.5" /> Template
              </Button>
              <Button variant="outline" size="sm" onClick={() => setUploadSheetOpen(true)}>
                <Upload className="h-4 w-4 mr-1.5" /> Upload Excel
              </Button>
              <Button size="sm" onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="h-4 w-4 mr-1.5" /> Add Event
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {COE_CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{COE_CATEGORY_CONFIG[cat].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Academic Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Years</SelectItem>
                <SelectItem value="2025-2026">2025-2026</SelectItem>
                <SelectItem value="2024-2025">2024-2025</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-white/5">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Event Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Programme</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-slate-400">
                      No events found
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event, idx) => {
                    const config = COE_CATEGORY_CONFIG[event.exam_category as CoeCalendarCategory]
                    return (
                      <TableRow key={event.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                        <TableCell className="text-slate-400 text-sm">{idx + 1}</TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white max-w-[200px] truncate">
                          {event.event_title}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-[11px] border-0', config.bgColor, config.textColor)}>
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-400 text-sm">
                          {event.programme_type}
                        </TableCell>
                        <TableCell className="text-slate-600 text-sm">
                          {new Date(event.event_start_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-slate-600 text-sm">
                          {new Date(event.event_end_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">{event.academic_year}</TableCell>
                        <TableCell>
                          <Badge variant={event.status === 'ACTIVE' ? 'default' : 'secondary'}
                            className={event.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-0'
                              : 'bg-slate-100 text-slate-500 border-0'
                            }>
                            {event.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="sm"
                              className="h-8 w-8 p-0 hover:text-emerald-600"
                              onClick={() => openEdit(event)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-8 w-8 p-0 hover:text-red-600"
                              onClick={() => handleDelete(event)}
                              disabled={deletingId === event.id}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ── Add/Edit Sheet ── */}
        <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
          <SheetContent className="sm:max-w-[600px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{editingEvent ? 'Edit Event' : 'Add Calendar Event'}</SheetTitle>
            </SheetHeader>

            <div className="space-y-5 py-6">
              {/* Event Title */}
              <div className="space-y-1.5">
                <Label htmlFor="event_title">Event Title <span className="text-red-500">*</span></Label>
                <Input
                  id="event_title"
                  value={form.event_title}
                  onChange={e => setForm(prev => ({ ...prev, event_title: e.target.value }))}
                  placeholder="e.g. CIA-I Commencement"
                />
                {errors.event_title && <p className="text-xs text-red-500">{errors.event_title}</p>}
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label>Category <span className="text-red-500">*</span></Label>
                <Select
                  value={form.exam_category}
                  onValueChange={val => setForm(prev => ({ ...prev, exam_category: val as CoeCalendarCategory }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {COE_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{COE_CATEGORY_CONFIG[cat].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.exam_category && <p className="text-xs text-red-500">{errors.exam_category}</p>}
              </div>

              {/* Programme Type */}
              <div className="space-y-1.5">
                <Label>Programme Type <span className="text-red-500">*</span></Label>
                <Select
                  value={form.programme_type}
                  onValueChange={val => setForm(prev => ({ ...prev, programme_type: val as CoeCalendarProgrammeType }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select programme" />
                  </SelectTrigger>
                  <SelectContent>
                    {COE_PROGRAMME_TYPES.map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.programme_type && <p className="text-xs text-red-500">{errors.programme_type}</p>}
              </div>

              {/* Academic Year */}
              <div className="space-y-1.5">
                <Label htmlFor="academic_year">Academic Year</Label>
                <Input
                  id="academic_year"
                  value={form.academic_year}
                  onChange={e => setForm(prev => ({ ...prev, academic_year: e.target.value }))}
                  placeholder="2025-2026"
                />
              </div>

              {/* Start Date / End Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start_date">Start Date <span className="text-red-500">*</span></Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={form.event_start_date}
                    onChange={e => setForm(prev => ({ ...prev, event_start_date: e.target.value }))}
                  />
                  {errors.event_start_date && <p className="text-xs text-red-500">{errors.event_start_date}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end_date">End Date <span className="text-red-500">*</span></Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={form.event_end_date}
                    onChange={e => setForm(prev => ({ ...prev, event_end_date: e.target.value }))}
                  />
                  {errors.event_end_date && <p className="text-xs text-red-500">{errors.event_end_date}</p>}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.event_description}
                  onChange={e => setForm(prev => ({ ...prev, event_description: e.target.value }))}
                  placeholder="Optional details…"
                  rows={3}
                />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={val => setForm(prev => ({ ...prev, status: val as 'ACTIVE' | 'INACTIVE' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <SheetFooter>
              <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? 'Saving…' : editingEvent ? 'Update Event' : 'Create Event'}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* ── Upload Sheet ── */}
        <Sheet open={uploadSheetOpen} onOpenChange={(o) => { if (!o) setUploadFile(null); setUploadSheetOpen(o) }}>
          <SheetContent className="sm:max-w-[500px]">
            <SheetHeader>
              <SheetTitle>Bulk Upload Calendar Events</SheetTitle>
            </SheetHeader>
            <div className="space-y-5 py-6">
              <p className="text-sm text-slate-500">
                Upload an Excel file using the template format. Download the template first if needed.
              </p>
              <Button variant="outline" size="sm" onClick={handleTemplateDownload} className="w-full">
                <Download className="h-4 w-4 mr-2" /> Download Template
              </Button>
              <div className="space-y-1.5">
                <Label>Select Excel File</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>
              {uploadFile && (
                <p className="text-sm text-emerald-600">Selected: {uploadFile.name}</p>
              )}
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setUploadSheetOpen(false)}>Cancel</Button>
              <Button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {uploading ? 'Uploading…' : 'Upload & Import'}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

**Step 2: Verify page loads**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Or visit `http://localhost:3000/pre-exam/coe-calendar` in the browser.

**Step 3: Commit**

```bash
git add app/(coe)/pre-exam/coe-calendar/page.tsx
git commit -m "feat: add COE Calendar management page with CRUD and bulk upload"
```

---

## Task 12: Sidebar Navigation

**Files:**
- Modify: `components/layout/app-sidebar.tsx`

**Step 1: Update the "Pre-Exam" section** (around line 194)

In the `navMain` array, find the Pre-Exam section and add COE Calendar:

```typescript
{
  title: "Pre-Exam",
  url: "#",
  icon: CalendarClock,
  roles: ["super_admin", "coe"],
  items: [
    { title: "Exam Types",            url: "/exam-management/exam-types",           icon: Tags },
    { title: "Examination Sessions",  url: "/exam-management/examination-sessions", icon: CalendarDays },
    { title: "Exam Registrations",    url: "/exam-management/exam-registrations",   icon: UserPlus },
    { title: "Registration Lookup",   url: "/exam-management/exam-registrations/lookup", icon: Search },
    { title: "Exam Timetable",        url: "/exam-management/exam-timetables",      icon: Calendar },
    { title: "Hall Tickets",          url: "/pre-exam/hall-tickets",                icon: Ticket },
    { title: "Bulk Internal Marks",   url: "/pre-exam/bulk-internal-marks",         icon: FileText },
    { title: "COE Calendar",          url: "/pre-exam/coe-calendar",               icon: CalendarDays },  // ← ADD THIS
  ],
},
```

Also update the existing `COE Calender` entry in the Master section (line 145) to link to the real page:

```typescript
{ title: "COE Calendar",  url: "/pre-exam/coe-calendar",  icon: CalendarDays },
```

**Step 2: Verify navigation**

Visit the app and confirm "COE Calendar" appears under Pre-Exam in the sidebar and navigates correctly.

**Step 3: Commit**

```bash
git add components/layout/app-sidebar.tsx
git commit -m "feat: add COE Calendar to Pre-Exam sidebar navigation"
```

---

## Final Verification Checklist

Run through these manually before marking complete:

- [ ] `GET /api/coe-calendar` returns 27 seeded events per institution
- [ ] `POST /api/coe-calendar` creates a new event
- [ ] `PUT /api/coe-calendar/[id]` updates an event
- [ ] `DELETE /api/coe-calendar/[id]` removes an event
- [ ] Template download returns `.xlsx` with 2 sheets
- [ ] Bulk upload with the template file imports rows correctly
- [ ] Dashboard calendar shows COE event pills alongside exam dots
- [ ] Dashboard legend shows both exam mode and COE category sections
- [ ] `/pre-exam/coe-calendar` table loads and shows all events
- [ ] Add event form validates and saves
- [ ] Edit event form pre-fills and updates
- [ ] Delete prompts and removes
- [ ] Institution filter respected (non-super-admin sees only own events)
- [ ] Sidebar "COE Calendar" link works

```bash
npm run build
npm run lint
```

Both should pass with no errors.
