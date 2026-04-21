# Central Valuation Examiner Allotment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a three-page Central Valuation module under `/post-exam/central-valuation` that lets staff set board/course valuation dates, allot four examiner roles (Internal, External, Chief, Assistant) per course using existing `answer_sheet_packets`, and email templated appointment letters mirroring the practical-allotment flow.

**Architecture:** Extend `answer_sheet_packets` with four examiner columns so all packets of a course carry the same assignment. Introduce two new tables for dates (`board_valuation_windows`, `course_valuation_dates`). Reuse hall-ticket-style PDF header from `lib/pdf/practical-appointment-letter.ts` for appointment letters. Institution-scoped via `useInstitutionFilter` and session-scoped via `useSessionSync`. Central Valuation row = one per course_code; examiner values are persisted across all packets of that course in a single transaction. Email flow mirrors `app/(coe)/pre-exam/practical-allotment/email/page.tsx` and its API routes.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Supabase (service-role server client) · Shadcn UI (Sheet, Tabs, Table, Command/Popover Combobox, Dialog) · Tailwind CSS · Puppeteer (@sparticuz/chromium on Vercel) · Nodemailer (via existing email service) · MyJKKN API (for staff).

---

## Reference Files (read before starting)

| Purpose | File |
|---|---|
| Existing pre-exam examiner allotment UI | `app/(coe)/pre-exam/examiner-allotment/page.tsx` |
| Existing practical examiner allotment UI (closer to target) | `app/(coe)/pre-exam/practical-allotment/examiner/page.tsx` |
| Existing practical email UI | `app/(coe)/pre-exam/practical-allotment/email/page.tsx` |
| Existing practical email API (mirror for central valuation) | `app/api/pre-exam/practical-email/**` |
| Existing examiner allotment API | `app/api/pre-exam/examiner-allotment/route.ts` |
| Appointment letter PDF generator to clone | `lib/pdf/practical-appointment-letter.ts` |
| Appointment letter data type | `types/practical-email.ts` |
| PDF settings type/defaults | `types/pdf-settings.ts` |
| Answer sheet packets schema | `supabase/migrations/20251117_create_answer_sheet_packets_complete.sql` |
| Institution filter hook | `hooks/use-institution-filter.ts` |
| Session sync hook | `hooks/use-session-sync.ts` |
| Server supabase client | `lib/supabase-server.ts` |
| MyJKKN staff fetcher | `lib/myjkkn-api.ts` (`fetchMyJKKNStaff`) |
| External examiners master table | `examiners` (see `supabase/migrations/20251213_create_examiners_table.sql`) — used in `app/api/public/examiner/**` and `app/api/pre-exam/examiner-allotment/route.ts` |
| Sidebar config | `components/layout/app-sidebar.tsx` |
| Role permission gates | `components/protected-route.tsx` |
| Practical allotment-report tab reference | `app/(coe)/pre-exam/practical-allotment/examiner/allotment-report-tab.tsx` |

---

## Task Breakdown Overview

1. Database migrations: two new tables + extend `answer_sheet_packets` + email log table
2. Types for the new domain
3. API routes — boards, board-windows, course-dates, allotment, report
4. Dates page UI (Tab 1: Board windows, Tab 2: Course dates)
5. Examiner allotment page UI (single table, 4 examiner combobox columns)
6. Allotment report tab (PDF per board)
7. PDF appointment letter generator clone
8. Email API routes (assignments, pdf-preview, send, resend, status)
9. Email page UI
10. Sidebar + RBAC + seed permission
11. Smoke test checklist

Each task below is an isolated commit.

---

## Task 1: Database migrations

**Files:**
- Create: `supabase/migrations/20260420_create_central_valuation_schema.sql`

**Step 1: Write the migration SQL**

```sql
-- =====================================================
-- CENTRAL VALUATION SCHEMA
-- Created: 2026-04-20
-- Description: Tables for Central Valuation date windows, course dates,
--              examiner columns on answer_sheet_packets, and email log.
-- =====================================================

-- 1. board_valuation_windows --------------------------------------------------
create table if not exists public.board_valuation_windows (
  id uuid primary key default gen_random_uuid(),
  institutions_id uuid not null references public.institutions(id) on delete cascade,
  examination_session_id uuid not null references public.examination_sessions(id) on delete cascade,
  board_code varchar(20) not null,
  board_name varchar(100) null,
  from_date date not null,
  to_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  constraint board_valuation_windows_unique unique (institutions_id, examination_session_id, board_code),
  constraint board_valuation_windows_date_order check (to_date >= from_date)
);

create index if not exists idx_bvw_session on public.board_valuation_windows (examination_session_id);
create index if not exists idx_bvw_institution on public.board_valuation_windows (institutions_id);

-- 2. course_valuation_dates ---------------------------------------------------
create table if not exists public.course_valuation_dates (
  id uuid primary key default gen_random_uuid(),
  institutions_id uuid not null references public.institutions(id) on delete cascade,
  examination_session_id uuid not null references public.examination_sessions(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  board_code varchar(20) not null,
  valuation_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  constraint course_valuation_dates_unique unique (institutions_id, examination_session_id, course_id)
);

create index if not exists idx_cvd_session on public.course_valuation_dates (examination_session_id);
create index if not exists idx_cvd_board on public.course_valuation_dates (board_code);

-- 3. Extend answer_sheet_packets with examiner columns -----------------------
alter table public.answer_sheet_packets
  add column if not exists internal_examiner_staff_id varchar(50) null,
  add column if not exists external_examiner_id uuid null,
  add column if not exists chief_examiner_staff_id varchar(50) null,
  add column if not exists assistant_examiner_staff_id varchar(50) null,
  add column if not exists valuation_allotted_at timestamptz null,
  add column if not exists valuation_allotted_by uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'asp_internal_xor_external'
  ) then
    alter table public.answer_sheet_packets
      add constraint asp_internal_xor_external
      check (
        internal_examiner_staff_id is null
        or external_examiner_id is null
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'asp_external_examiner_fk'
  ) then
    alter table public.answer_sheet_packets
      add constraint asp_external_examiner_fk
      foreign key (external_examiner_id) references public.examiners(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'asp_valuation_allotted_by_fk'
  ) then
    alter table public.answer_sheet_packets
      add constraint asp_valuation_allotted_by_fk
      foreign key (valuation_allotted_by) references public.users(id) on delete set null;
  end if;
end $$;

create index if not exists idx_asp_internal_examiner on public.answer_sheet_packets (internal_examiner_staff_id);
create index if not exists idx_asp_external_examiner on public.answer_sheet_packets (external_examiner_id);
create index if not exists idx_asp_chief_examiner on public.answer_sheet_packets (chief_examiner_staff_id);
create index if not exists idx_asp_assistant_examiner on public.answer_sheet_packets (assistant_examiner_staff_id);

-- 4. central_valuation_email_log ---------------------------------------------
create table if not exists public.central_valuation_email_log (
  id uuid primary key default gen_random_uuid(),
  institutions_id uuid not null references public.institutions(id) on delete cascade,
  examination_session_id uuid not null references public.examination_sessions(id) on delete cascade,
  examiner_type varchar(20) not null check (examiner_type in ('internal','external','chief','assistant')),
  examiner_key varchar(100) not null,
  examiner_name varchar(200) null,
  email_to varchar(200) not null,
  subject text null,
  status varchar(20) not null default 'PENDING' check (status in ('SENT','FAILED','PENDING')),
  error_message text null,
  sent_at timestamptz not null default now(),
  sent_by uuid null references public.users(id) on delete set null
);

create index if not exists idx_cvel_session on public.central_valuation_email_log (examination_session_id);
create index if not exists idx_cvel_examiner on public.central_valuation_email_log (examiner_type, examiner_key);
```

**Step 2: Apply the migration**

Run: `npx supabase db push` (or via Supabase dashboard SQL editor if direct CLI unavailable)
Expected: Migration applied, no errors.

**Step 3: Verify schema**

Run in Supabase SQL editor:
```sql
select column_name from information_schema.columns
where table_name = 'answer_sheet_packets'
  and column_name in ('internal_examiner_staff_id','external_examiner_id','chief_examiner_staff_id','assistant_examiner_staff_id');
```
Expected: 4 rows.

**Step 4: Commit**

```bash
git add supabase/migrations/20260420_create_central_valuation_schema.sql
git commit -m "feat(db): add central valuation schema - dates, packet examiners, email log"
```

---

## Task 2: Domain types

**Files:**
- Create: `types/central-valuation.ts`
- Create: `types/central-valuation-email.ts`

**Step 1: Write `types/central-valuation.ts`**

```typescript
export interface BoardValuationWindow {
	id: string
	institutions_id: string
	examination_session_id: string
	board_code: string
	board_name: string | null
	from_date: string  // ISO YYYY-MM-DD
	to_date: string
	created_at?: string
	updated_at?: string
}

export interface CourseValuationDate {
	id: string
	institutions_id: string
	examination_session_id: string
	course_id: string
	board_code: string
	valuation_date: string
}

export interface CentralValuationBoardRow {
	board_code: string
	board_name: string
	board_type: string | null
	board_order: number
	course_count: number
	window?: BoardValuationWindow | null
}

export interface InternalStaff {
	staff_id: string
	staff_name: string
	staff_email: string | null
	staff_mobile: string | null
	staff_designation: string | null
	staff_department: string | null
}

export interface ExternalExaminer {
	examiner_id: string           // uuid from external_examiners.id
	full_name: string
	email: string | null
	mobile: string | null
	designation: string | null
	department: string | null
	institution_name: string | null
}

export interface CentralValuationAllotmentRow {
	course_id: string
	course_code: string
	course_name: string
	board_code: string
	board_name: string
	valuation_date: string | null
	packet_count: number
	sheet_count: number
	internal_examiner: InternalStaff | null
	external_examiner: ExternalExaminer | null
	chief_examiner: InternalStaff | null
	assistant_examiner: InternalStaff | null
	status: 'Not Assigned' | 'Paper Evaluator Set' | 'Fully Allotted'
}

export interface CentralValuationAllotmentSavePayload {
	institutions_id: string
	examination_session_id: string
	course_id: string
	internal_examiner_staff_id: string | null
	external_examiner_id: string | null
	chief_examiner_staff_id: string | null
	assistant_examiner_staff_id: string | null
}
```

**Step 2: Write `types/central-valuation-email.ts`**

```typescript
import type { PdfInstitutionSettings } from '@/types/pdf-settings'

export interface CentralValuationCourseEntry {
	course_code: string
	course_name: string
	valuation_date: string
	packet_count: number
	sheet_count: number
}

export type CentralValuationExaminerType = 'internal' | 'external' | 'chief' | 'assistant'

export interface CentralValuationAppointmentData {
	/* Institution header */
	institution_name?: string
	institution_accreditation?: string
	institution_address?: string
	header_image_url?: string | null

	/* COE */
	coe_name?: string
	coe_qualifications?: string
	coe_contact?: string
	coe_email?: string
	coe_seal_url?: string | null
	coe_signature_url?: string | null

	/* Letter meta */
	ref_number: string
	letter_date: string  // ISO YYYY-MM-DD

	/* Examiner */
	examiner_name: string
	examiner_type: CentralValuationExaminerType
	examiner_role: string          // e.g. "External Examiner"
	examiner_designation?: string
	examiner_department?: string
	examiner_institution?: string
	examiner_address?: string
	examiner_mobile?: string

	/* Central Valuation specifics */
	board_name: string
	board_code: string
	exam_session_name: string
	valuation_date_range?: string  // e.g. "15.11.2025"
	courses: CentralValuationCourseEntry[]

	/* Styling */
	primary_color?: string
	accent_color?: string
	pdf_settings?: PdfInstitutionSettings | null
}

export interface CentralValuationExaminerAggregateRow {
	examiner_key: string
	examiner_name: string
	examiner_type: CentralValuationExaminerType
	examiner_email: string | null
	courses: CentralValuationCourseEntry[]
	last_email_status: 'SENT' | 'FAILED' | 'PENDING' | null
	last_email_sent_at: string | null
}
```

**Step 3: Commit**

```bash
git add types/central-valuation.ts types/central-valuation-email.ts
git commit -m "feat(types): add central valuation and email types"
```

---

## Task 3: Boards API route

**Files:**
- Create: `app/api/post-exam/central-valuation/boards/route.ts`

**Step 1: Write the route**

Returns distinct boards that have rows in `answer_sheet_packets` for the session (this naturally filters CIA-only courses).

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { CentralValuationBoardRow } from '@/types/central-valuation'

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('session_id')

		if (!institutionsId || !sessionId) {
			return NextResponse.json({ error: 'institutions_id and session_id are required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// 1. All packets for this session, with their course_id
		const { data: packets, error: packetErr } = await supabase
			.from('answer_sheet_packets')
			.select('course_id')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('is_active', true)
			.range(0, 99999)

		if (packetErr) {
			console.error('Packets fetch error:', packetErr)
			return NextResponse.json({ error: 'Failed to load packets' }, { status: 500 })
		}

		const courseIds = [...new Set((packets || []).map(p => p.course_id))]
		if (courseIds.length === 0) return NextResponse.json([])

		// 2. Courses → board_code
		const { data: courses, error: courseErr } = await supabase
			.from('courses')
			.select('id, board_code')
			.in('id', courseIds)

		if (courseErr) {
			console.error('Courses fetch error:', courseErr)
			return NextResponse.json({ error: 'Failed to load courses' }, { status: 500 })
		}

		const boardCodes = [...new Set((courses || []).map(c => c.board_code).filter(Boolean))]
		if (boardCodes.length === 0) return NextResponse.json([])

		// 3. Board details
		const { data: boards, error: boardErr } = await supabase
			.from('boards')
			.select('board_code, board_name, board_type, board_order')
			.in('board_code', boardCodes)

		if (boardErr) {
			console.error('Boards fetch error:', boardErr)
			return NextResponse.json({ error: 'Failed to load boards' }, { status: 500 })
		}

		// 4. Windows set so far
		const { data: windows } = await supabase
			.from('board_valuation_windows')
			.select('*')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)

		const windowMap = new Map((windows || []).map(w => [w.board_code, w]))

		// 5. Course count per board
		const courseBoardMap = new Map<string, number>()
		for (const c of courses || []) {
			courseBoardMap.set(c.board_code, (courseBoardMap.get(c.board_code) || 0) + 1)
		}

		const result: CentralValuationBoardRow[] = (boards || [])
			.sort((a, b) => (a.board_order || 0) - (b.board_order || 0))
			.map(b => ({
				board_code: b.board_code,
				board_name: b.board_name,
				board_type: b.board_type,
				board_order: b.board_order,
				course_count: courseBoardMap.get(b.board_code) || 0,
				window: windowMap.get(b.board_code) || null,
			}))

		return NextResponse.json(result)
	} catch (e) {
		console.error('boards route error:', e)
		return NextResponse.json({ error: 'Internal error' }, { status: 500 })
	}
}
```

**Step 2: Smoke-test in browser**

Run: `npm run dev`
Open: `http://localhost:3000/api/post-exam/central-valuation/boards?institutions_id=<id>&session_id=<id>`
Expected: JSON array with board rows.

**Step 3: Commit**

```bash
git add app/api/post-exam/central-valuation/boards/route.ts
git commit -m "feat(api): central-valuation boards route"
```

---

## Task 4: Board-windows API route

**Files:**
- Create: `app/api/post-exam/central-valuation/board-windows/route.ts`

**Step 1: Write the route (GET + PUT)**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')

	if (!institutionsId || !sessionId) {
		return NextResponse.json({ error: 'institutions_id and session_id are required' }, { status: 400 })
	}

	const supabase = getSupabaseServer()
	const { data, error } = await supabase
		.from('board_valuation_windows')
		.select('*')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.order('board_code')

	if (error) {
		console.error('board-windows GET error:', error)
		return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
	}
	return NextResponse.json(data || [])
}

export async function PUT(request: Request) {
	const body = await request.json()
	const {
		institutions_id,
		examination_session_id,
		board_code,
		board_name,
		from_date,
		to_date,
	} = body

	if (!institutions_id || !examination_session_id || !board_code || !from_date || !to_date) {
		return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
	}
	if (new Date(to_date) < new Date(from_date)) {
		return NextResponse.json({ error: 'to_date must be >= from_date' }, { status: 400 })
	}

	const supabase = getSupabaseServer()
	const { data, error } = await supabase
		.from('board_valuation_windows')
		.upsert(
			{ institutions_id, examination_session_id, board_code, board_name: board_name ?? null, from_date, to_date, updated_at: new Date().toISOString() },
			{ onConflict: 'institutions_id,examination_session_id,board_code' }
		)
		.select()
		.single()

	if (error) {
		console.error('board-windows PUT error:', error)
		return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
	}
	return NextResponse.json(data)
}
```

**Step 2: Smoke-test**

Run: `curl -X PUT http://localhost:3000/api/post-exam/central-valuation/board-windows -H 'content-type: application/json' -d '{"institutions_id":"...","examination_session_id":"...","board_code":"UTA","from_date":"2025-11-15","to_date":"2025-11-20"}'`
Expected: Returns the upserted row.

**Step 3: Commit**

```bash
git add app/api/post-exam/central-valuation/board-windows/route.ts
git commit -m "feat(api): central-valuation board-windows route"
```

---

## Task 5: Course-dates API route

**Files:**
- Create: `app/api/post-exam/central-valuation/course-dates/route.ts`

**Step 1: Write the route (GET + PUT, batch)**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

interface BatchEntry {
	course_id: string
	board_code: string
	valuation_date: string | null  // null → delete the row
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')
	const boardCode = searchParams.get('board_code')

	if (!institutionsId || !sessionId) {
		return NextResponse.json({ error: 'institutions_id and session_id are required' }, { status: 400 })
	}

	const supabase = getSupabaseServer()

	// 1. Courses that have packets for this session
	const { data: packets } = await supabase
		.from('answer_sheet_packets')
		.select('course_id')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.range(0, 99999)

	const courseIds = [...new Set((packets || []).map(p => p.course_id))]
	if (courseIds.length === 0) return NextResponse.json([])

	// 2. Course details, optionally filtered by board
	let coursesQuery = supabase
		.from('courses')
		.select('id, course_code, course_name, course_title, board_code')
		.in('id', courseIds)

	if (boardCode) coursesQuery = coursesQuery.eq('board_code', boardCode)

	const { data: courses, error: courseErr } = await coursesQuery
	if (courseErr) return NextResponse.json({ error: 'Failed to load courses' }, { status: 500 })

	// 3. Existing valuation dates
	const { data: cvDates } = await supabase
		.from('course_valuation_dates')
		.select('course_id, valuation_date, board_code')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)

	const dateMap = new Map((cvDates || []).map(d => [d.course_id, d]))

	// 4. Packet aggregates per course
	const { data: aggPackets } = await supabase
		.from('answer_sheet_packets')
		.select('course_id, total_sheets')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.range(0, 99999)

	const aggMap = new Map<string, { packet_count: number; sheet_count: number }>()
	for (const p of aggPackets || []) {
		const prev = aggMap.get(p.course_id) || { packet_count: 0, sheet_count: 0 }
		prev.packet_count += 1
		prev.sheet_count += p.total_sheets || 0
		aggMap.set(p.course_id, prev)
	}

	const result = (courses || []).map(c => {
		const agg = aggMap.get(c.id) || { packet_count: 0, sheet_count: 0 }
		const d = dateMap.get(c.id)
		return {
			course_id: c.id,
			course_code: c.course_code,
			course_name: c.course_name || c.course_title,
			board_code: c.board_code,
			valuation_date: d?.valuation_date || null,
			packet_count: agg.packet_count,
			sheet_count: agg.sheet_count,
		}
	})

	return NextResponse.json(result)
}

export async function PUT(request: Request) {
	const body = await request.json()
	const { institutions_id, examination_session_id, entries } = body as {
		institutions_id: string
		examination_session_id: string
		entries: BatchEntry[]
	}

	if (!institutions_id || !examination_session_id || !Array.isArray(entries)) {
		return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
	}

	const supabase = getSupabaseServer()

	// 1. Validate each entry's date is inside its board window
	const boardCodes = [...new Set(entries.map(e => e.board_code))]
	const { data: windows } = await supabase
		.from('board_valuation_windows')
		.select('board_code, from_date, to_date')
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.in('board_code', boardCodes)

	const windowMap = new Map((windows || []).map(w => [w.board_code, w]))

	for (const e of entries) {
		if (e.valuation_date === null) continue
		const w = windowMap.get(e.board_code)
		if (!w) {
			return NextResponse.json({ error: `No board window set for ${e.board_code}` }, { status: 400 })
		}
		if (e.valuation_date < w.from_date || e.valuation_date > w.to_date) {
			return NextResponse.json({
				error: `Date ${e.valuation_date} outside window ${w.from_date}..${w.to_date} for ${e.board_code}`,
			}, { status: 400 })
		}
	}

	// 2. Apply: upsert non-null, delete null
	const upserts = entries
		.filter(e => e.valuation_date !== null)
		.map(e => ({
			institutions_id,
			examination_session_id,
			course_id: e.course_id,
			board_code: e.board_code,
			valuation_date: e.valuation_date as string,
			updated_at: new Date().toISOString(),
		}))

	const deletes = entries.filter(e => e.valuation_date === null).map(e => e.course_id)

	if (upserts.length) {
		const { error } = await supabase
			.from('course_valuation_dates')
			.upsert(upserts, { onConflict: 'institutions_id,examination_session_id,course_id' })
		if (error) {
			console.error('course-dates upsert error:', error)
			return NextResponse.json({ error: 'Failed to save dates' }, { status: 500 })
		}
	}

	if (deletes.length) {
		const { error } = await supabase
			.from('course_valuation_dates')
			.delete()
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.in('course_id', deletes)
		if (error) {
			console.error('course-dates delete error:', error)
			return NextResponse.json({ error: 'Failed to clear dates' }, { status: 500 })
		}
	}

	return NextResponse.json({ success: true, upserted: upserts.length, deleted: deletes.length })
}
```

**Step 2: Commit**

```bash
git add app/api/post-exam/central-valuation/course-dates/route.ts
git commit -m "feat(api): central-valuation course-dates batch route"
```

---

## Task 6: Allotment API route

**Files:**
- Create: `app/api/post-exam/central-valuation/allotment/route.ts`

**Step 1: Write the route (GET + PUT)**

```typescript
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchMyJKKNStaff } from '@/lib/myjkkn-api'
import type { CentralValuationAllotmentRow, InternalStaff, ExternalExaminer } from '@/types/central-valuation'

// ---- GET: list allotment rows for a board ----------------------------------
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')
	const boardCode = searchParams.get('board_code')

	if (!institutionsId || !sessionId || !boardCode) {
		return NextResponse.json({ error: 'institutions_id, session_id, board_code are required' }, { status: 400 })
	}

	const supabase = getSupabaseServer()

	// 1. Courses of this board (from packets ∩ course.board_code)
	const { data: packets } = await supabase
		.from('answer_sheet_packets')
		.select('course_id, total_sheets, internal_examiner_staff_id, external_examiner_id, chief_examiner_staff_id, assistant_examiner_staff_id')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.range(0, 99999)

	const courseIds = [...new Set((packets || []).map(p => p.course_id))]
	if (!courseIds.length) return NextResponse.json([])

	const { data: courses } = await supabase
		.from('courses')
		.select('id, course_code, course_name, course_title, board_code')
		.in('id', courseIds)
		.eq('board_code', boardCode)

	const boardCourses = (courses || [])

	// 2. Aggregate per course
	const agg = new Map<string, { packet_count: number; sheet_count: number; internal: string|null; external: string|null; chief: string|null; assistant: string|null }>()
	for (const p of packets || []) {
		const prev = agg.get(p.course_id) || { packet_count: 0, sheet_count: 0, internal: null, external: null, chief: null, assistant: null }
		prev.packet_count += 1
		prev.sheet_count += p.total_sheets || 0
		// All packets of the same course carry the same examiner values; capture any one
		prev.internal = prev.internal ?? p.internal_examiner_staff_id
		prev.external = prev.external ?? p.external_examiner_id
		prev.chief = prev.chief ?? p.chief_examiner_staff_id
		prev.assistant = prev.assistant ?? p.assistant_examiner_staff_id
		agg.set(p.course_id, prev)
	}

	// 3. Valuation dates
	const { data: cvDates } = await supabase
		.from('course_valuation_dates')
		.select('course_id, valuation_date')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('board_code', boardCode)
	const dateMap = new Map((cvDates || []).map(d => [d.course_id, d.valuation_date]))

	// 4. Board name
	const { data: board } = await supabase
		.from('boards')
		.select('board_name')
		.eq('board_code', boardCode)
		.maybeSingle()

	// 5. Hydrate staff from MyJKKN + external examiners
	const staffIds = new Set<string>()
	const externalIds = new Set<string>()
	for (const a of agg.values()) {
		if (a.internal) staffIds.add(a.internal)
		if (a.chief) staffIds.add(a.chief)
		if (a.assistant) staffIds.add(a.assistant)
		if (a.external) externalIds.add(a.external)
	}

	const staffList = staffIds.size
		? await fetchMyJKKNStaff({ institutionsId })
		: []
	const staffMap = new Map(staffList.map((s: any) => [s.staff_id, s as InternalStaff]))

	let externalMap = new Map<string, ExternalExaminer>()
	if (externalIds.size) {
		const { data: exts } = await supabase
			.from('examiners')
			.select('id, full_name, email, mobile, designation, department, institution_name')
			.in('id', [...externalIds])
		externalMap = new Map(
			(exts || []).map(e => [
				e.id,
				{
					examiner_id: e.id,
					full_name: e.full_name,
					email: e.email,
					mobile: e.mobile,
					designation: e.designation,
					department: e.department,
					institution_name: e.institution_name,
				},
			])
		)
	}

	const rows: CentralValuationAllotmentRow[] = boardCourses.map(c => {
		const a = agg.get(c.id) || { packet_count: 0, sheet_count: 0, internal: null, external: null, chief: null, assistant: null }
		const internal = a.internal ? staffMap.get(a.internal) ?? null : null
		const external = a.external ? externalMap.get(a.external) ?? null : null
		const chief = a.chief ? staffMap.get(a.chief) ?? null : null
		const assistant = a.assistant ? staffMap.get(a.assistant) ?? null : null

		const evaluatorSet = Boolean(internal || external)
		const status: CentralValuationAllotmentRow['status'] =
			!evaluatorSet ? 'Not Assigned'
			: chief ? 'Fully Allotted'
			: 'Paper Evaluator Set'

		return {
			course_id: c.id,
			course_code: c.course_code,
			course_name: c.course_name || c.course_title,
			board_code: c.board_code,
			board_name: board?.board_name || boardCode,
			valuation_date: dateMap.get(c.id) || null,
			packet_count: a.packet_count,
			sheet_count: a.sheet_count,
			internal_examiner: internal,
			external_examiner: external,
			chief_examiner: chief,
			assistant_examiner: assistant,
			status,
		}
	})

	return NextResponse.json(rows)
}

// ---- PUT: save allotment for one course ------------------------------------
export async function PUT(request: Request) {
	const body = await request.json()
	const {
		institutions_id,
		examination_session_id,
		course_id,
		internal_examiner_staff_id,
		external_examiner_id,
		chief_examiner_staff_id,
		assistant_examiner_staff_id,
	} = body

	if (!institutions_id || !examination_session_id || !course_id) {
		return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
	}
	if (internal_examiner_staff_id && external_examiner_id) {
		return NextResponse.json({ error: 'Internal XOR External; pick only one' }, { status: 400 })
	}

	const supabase = getSupabaseServer()
	const { error } = await supabase
		.from('answer_sheet_packets')
		.update({
			internal_examiner_staff_id: internal_examiner_staff_id ?? null,
			external_examiner_id: external_examiner_id ?? null,
			chief_examiner_staff_id: chief_examiner_staff_id ?? null,
			assistant_examiner_staff_id: assistant_examiner_staff_id ?? null,
			valuation_allotted_at: new Date().toISOString(),
		})
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.eq('course_id', course_id)

	if (error) {
		console.error('allotment PUT error:', error)
		return NextResponse.json({ error: 'Failed to save allotment' }, { status: 500 })
	}
	return NextResponse.json({ success: true })
}
```

**Step 2: Commit**

```bash
git add app/api/post-exam/central-valuation/allotment/route.ts
git commit -m "feat(api): central-valuation allotment GET and PUT"
```

---

## Task 7: Central Valuation layout + landing page

**Files:**
- Create: `app/(coe)/post-exam/central-valuation/layout.tsx`
- Create: `app/(coe)/post-exam/central-valuation/page.tsx`

**Step 1: Write the layout (shared sidebar + header, breadcrumb)**

Mirror `app/(coe)/pre-exam/practical-allotment/layout.tsx`.

**Step 2: Write the landing page**

Three card links (Dates, Examiner Allotment, Send Appointments). Each wrapped with `<ProtectedRoute requiredPermissions={['central_valuation:manage']}>`.

**Step 3: Commit**

```bash
git add app/(coe)/post-exam/central-valuation/layout.tsx app/(coe)/post-exam/central-valuation/page.tsx
git commit -m "feat(ui): central-valuation landing page"
```

---

## Task 8: Dates page — Tab 1 (Board Windows)

**Files:**
- Create: `app/(coe)/post-exam/central-valuation/dates/page.tsx`
- Create: `app/(coe)/post-exam/central-valuation/dates/board-windows-tab.tsx`

**Step 1: Scaffold the page with institution + session header and `Tabs` from Shadcn**

Reuse institution/session picker pattern from `app/(coe)/pre-exam/practical-allotment/examiner/page.tsx`.

**Step 2: Build `BoardWindowsTab`**

- Fetch boards via `GET /api/post-exam/central-valuation/boards`
- Table: Board Code · Board Name · From Date · To Date · Courses · Action
- Action → opens a `Sheet` with two `<Input type="date" />` and Save button
- On save → `PUT /api/post-exam/central-valuation/board-windows`, refresh table, toast success

**Step 3: Manual smoke test**

Run: `npm run dev`
Open: `/post-exam/central-valuation/dates`
Expected: Table of boards renders. Editing a window saves and reloads.

**Step 4: Commit**

```bash
git add app/(coe)/post-exam/central-valuation/dates
git commit -m "feat(ui): central-valuation dates page - board windows tab"
```

---

## Task 9: Dates page — Tab 2 (Course Dates)

**Files:**
- Create: `app/(coe)/post-exam/central-valuation/dates/course-dates-tab.tsx`
- Modify: `app/(coe)/post-exam/central-valuation/dates/page.tsx` — wire the second tab

**Step 1: Build `CourseDatesTab`**

- Top filter: Board combobox (only boards with windows set)
- Table: Course Code · Course Name · Packets · Sheets · Valuation Date (date input, `min`/`max` from window) · Clear button
- "Set Selected to Date" bulk control: checkbox column + date picker + Apply
- Save on blur/change → batch-collect changed rows, call `PUT /api/post-exam/central-valuation/course-dates` with `entries`

**Step 2: Manual smoke test**

Expected: Dates outside the board window rejected with toast. In-range dates persist after reload.

**Step 3: Commit**

```bash
git add app/(coe)/post-exam/central-valuation/dates
git commit -m "feat(ui): central-valuation dates page - course dates tab"
```

---

## Task 10: Examiner Allotment page

**Files:**
- Create: `app/(coe)/post-exam/central-valuation/examiner/page.tsx`

**Step 1: Scaffold**

Copy structural skeleton from `app/(coe)/pre-exam/practical-allotment/examiner/page.tsx`. Remove batch-specific columns. Keep institution + session + board filter in header.

**Step 2: Table columns**

`# | Course Code | Course Name | Valuation Date | Packets | Sheets | Internal | External | Chief | Assistant | Status`

**Step 3: Combobox pickers**

- Build two reusable local helpers:
  - `<StaffCombobox value onChange staffList label />`
  - `<ExternalExaminerCombobox value onChange list label />`
- Data sources:
  - Staff: reuse `GET /api/pre-exam/examiner-allotment?action=internal-staff` if available; else call MyJKKN-staff endpoint directly.
  - External: query `examiners` table (pattern from `app/api/pre-exam/examiner-allotment/route.ts:310`).

**Step 4: Internal XOR External UX**

- When Internal picked, clear External + disable External combobox with tooltip.
- When External picked, clear Internal + disable Internal combobox with tooltip.
- Small `✕` clear buttons on each combobox to undo.

**Step 5: Autosave**

- On any examiner change, debounce 500ms, then `PUT /api/post-exam/central-valuation/allotment`.
- Show per-row spinner during save; toast only on error.

**Step 6: Smoke test**

Expected: Assign Internal → row saves. Reload → persists. Try to assign both Internal + External via raw PUT → server rejects.

**Step 7: Commit**

```bash
git add app/(coe)/post-exam/central-valuation/examiner/page.tsx
git commit -m "feat(ui): central-valuation examiner allotment page"
```

---

## Task 11: Allotment report tab

**Files:**
- Create: `app/(coe)/post-exam/central-valuation/examiner/allotment-report-tab.tsx`
- Modify: `app/(coe)/post-exam/central-valuation/examiner/page.tsx` — add `Tabs` wrapping "Allotment" + "Report"
- Create: `lib/utils/generate-central-valuation-allotment-report-pdf.ts`

**Step 1: Clone `app/(coe)/pre-exam/practical-allotment/examiner/allotment-report-tab.tsx` with valuation-specific columns**

Columns: Course Code · Course Name · Valuation Date · Packets · Sheets · Internal · External · Chief · Assistant

**Step 2: Clone `lib/utils/generate-allotment-report-pdf.ts` into the new file, retargeted to valuation data**

**Step 3: Commit**

```bash
git add app/(coe)/post-exam/central-valuation/examiner lib/utils/generate-central-valuation-allotment-report-pdf.ts
git commit -m "feat(ui): central-valuation allotment report tab"
```

---

## Task 12: Appointment letter PDF generator

**Files:**
- Create: `lib/pdf/central-valuation-appointment-letter.ts`

**Step 1: Clone `lib/pdf/practical-appointment-letter.ts` verbatim, then swap:**

- Import type: `CentralValuationAppointmentData` from `@/types/central-valuation-email`
- Subject: `Appointment of ${subjectExaminerLabel} for Central Valuation - ${data.exam_session_name} Examinations - Reg.`
- Body paragraph:

  ```text
  I am pleased to inform that you have been appointed as {examiner_role}
  for the Central Valuation of {board_name} for {exam_session_name} Semester
  Examinations to be held on {valuation_date_range}. Requested to report on
  time at 9.30am to the Office of the Controller of Examinations.
  ```

- Course table columns: `Date | Course Code | Course Name | Packets | Sheets`
- Keep header, COE info row, signature block, watermark, settings plumbing unchanged.
- Role label mapping:
  - `internal` → "Internal Examiner"
  - `external` → "External Examiner"
  - `chief` → "Chief Examiner"
  - `assistant` → "Assistant Examiner"

**Step 2: Commit**

```bash
git add lib/pdf/central-valuation-appointment-letter.ts
git commit -m "feat(pdf): central valuation appointment letter generator"
```

---

## Task 13: Email API routes

**Files:**
- Create: `app/api/post-exam/central-valuation/email/assignments/route.ts`
- Create: `app/api/post-exam/central-valuation/email/pdf-preview/route.ts`
- Create: `app/api/post-exam/central-valuation/email/send/route.ts`
- Create: `app/api/post-exam/central-valuation/email/resend/route.ts`
- Create: `app/api/post-exam/central-valuation/email/status/route.ts`

**Step 1: Clone the five files under `app/api/pre-exam/practical-email/**` to the new paths**

**Step 2: Replace query logic**

In `assignments/route.ts`:
- Source data: `answer_sheet_packets` joined with `course_valuation_dates` joined with `courses`
- Build `CentralValuationExaminerAggregateRow` rows grouped by `(examiner_type, examiner_key)`
- Pull examiner emails:
  - Internal/Chief/Assistant → MyJKKN staff (email = `college_email` fallback `learner_email`)
  - External → `examiners.email`

**Step 3: In `pdf-preview/route.ts`**

- Build a `CentralValuationAppointmentData` from the request params
- Call `generateAppointmentPdf` from `lib/pdf/central-valuation-appointment-letter.ts`
- Return `application/pdf` buffer

**Step 4: In `send/route.ts` and `resend/route.ts`**

- For each selected examiner:
  - Build `CentralValuationAppointmentData`
  - Generate PDF attachment
  - Send email with fixed body:

    ```
    Subject: Appointment of Examiner for {session_name} Examinations- Reg.

    Body:
    Here I have attached your appointment ; we are expecting your acceptance Mail.
    ```

  - Log outcome into `central_valuation_email_log`

**Step 5: In `status/route.ts`**

- Return logs filtered by session + examiner keys

**Step 6: Commit**

```bash
git add app/api/post-exam/central-valuation/email
git commit -m "feat(api): central-valuation email assignments, pdf, send, status"
```

---

## Task 14: Email page UI

**Files:**
- Create: `app/(coe)/post-exam/central-valuation/email/page.tsx`

**Step 1: Clone `app/(coe)/pre-exam/practical-allotment/email/page.tsx`**

**Step 2: Swap all API URLs** from `/api/pre-exam/practical-email/*` to `/api/post-exam/central-valuation/email/*`

**Step 3: Update filters**

- Role filter: Internal / External / Chief / Assistant (add Chief + Assistant, remove Skilled/Programmer)
- Board filter instead of just courses

**Step 4: Update the type imports**

- `ExaminerRow` → `CentralValuationExaminerAggregateRow`
- `CourseEntry` → `CentralValuationCourseEntry`

**Step 5: Smoke test**

Expected: Assigned examiners list renders. Preview PDF opens with correct header + body. Send marks rows SENT. History tab shows log.

**Step 6: Commit**

```bash
git add app/(coe)/post-exam/central-valuation/email/page.tsx
git commit -m "feat(ui): central-valuation email page"
```

---

## Task 15: Sidebar + RBAC + permission seed

**Files:**
- Modify: `components/layout/app-sidebar.tsx` — add "Central Valuation" group under Post-Exam
- Modify: role permission table (look up with `grep -r "central_valuation" .claude` first to find the existing roles config)
- Create: `supabase/migrations/20260420_seed_central_valuation_permission.sql`

**Step 1: Add sidebar entries**

Under the "Post-Exam" section:

```tsx
{
  title: 'Central Valuation',
  icon: ClipboardCheck,
  children: [
    { title: 'Valuation Dates', url: '/post-exam/central-valuation/dates' },
    { title: 'Examiner Allotment', url: '/post-exam/central-valuation/examiner' },
    { title: 'Send Appointments', url: '/post-exam/central-valuation/email' },
  ],
}
```

**Step 2: Write the permission seed**

```sql
insert into public.permissions (permission_code, permission_name, module_name)
values ('central_valuation:manage', 'Manage Central Valuation', 'post_exam')
on conflict (permission_code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.role_code in ('super_admin','coe_office','coe_office_1')
  and p.permission_code = 'central_valuation:manage'
on conflict do nothing;
```

Note: verify actual table + column names via `grep -r "role_permissions\|permission_code" supabase/migrations | head`.

**Step 3: Wrap each page with `<ProtectedRoute requiredPermissions={['central_valuation:manage']}>`**

**Step 4: Commit**

```bash
git add components/layout/app-sidebar.tsx supabase/migrations/20260420_seed_central_valuation_permission.sql app/(coe)/post-exam/central-valuation
git commit -m "feat(rbac): add central valuation permission + sidebar entries"
```

---

## Task 16: Smoke test checklist + typecheck + lint

**Step 1: Run type check**

Run: `npx tsc --noEmit`
Expected: no new errors.

**Step 2: Run lint**

Run: `npm run lint`
Expected: no new violations.

**Step 3: Manual UI walkthrough**

1. Log in as super_admin, select an institution with existing packets.
2. Navigate `/post-exam/central-valuation` → landing renders.
3. Open Dates → Tab 1: set a window for a board. Tab 2: try to set a course date outside window (rejected) then inside (saved).
4. Open Examiner Allotment → pick board → assign Internal for a course → verify External disabled. Reload → values persist.
5. Open Email → filter External, preview PDF, send to a test inbox. Verify log row appears.

**Step 4: Final commit if anything adjusted**

```bash
git add -A
git commit -m "chore: central valuation final fixes post smoke test"
```

---

## Notes & Gotchas

- `answer_sheet_packets.external_examiner_id` is a UUID pointing to `examiners.id`; `internal/chief/assistant` are `varchar(50)` staff ids (MyJKKN staff_id). Keep this type split consistent throughout.
- When updating allotment, always update **all packets of the course** via `.eq('course_id', ...)` — don't iterate packet by packet.
- The Internal XOR External constraint is enforced by DB check + API guard + UI disable. Keep all three in sync.
- MyJKKN staff email field name varies (`college_email` vs `learner_email` vs `email`); use the existing fallback chain from `practical-email/assignments/route.ts`.
- Override default 1000-row limit on packet queries with `.range(0, 99999)` (see CLAUDE.md).
- Never allow changing `institutions_id` in any PUT path.
- Institution filtering: every route must honor `institutions_id` param; never trust client to skip it.

---

## Plan complete
