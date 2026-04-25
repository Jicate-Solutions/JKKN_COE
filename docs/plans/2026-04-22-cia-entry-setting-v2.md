# CIA Entry Setting v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Give each CIA round (CIA-1, CIA-2, CIA-3) its own timetable + seating under an existing CIA Entry Setting, auto-fetch attendance from MyJKKN per round, and introduce a Mark Conversion Rules master page that drives attendance %, component scaling, round roll-up, and final CIA calculation — versioned by `(institution, regulation, wef_date)` and snapshot-frozen onto each mark row.

**Architecture:** Extend the existing `cia_entry_settings.cia_rounds` JSONB with `session_from`, `session_to`, `conversion_rule_id`. Add nullable `cia_setting_id` + `cia_round` + `cia_round_name` columns onto `exam_timetables` and `seating_arrangements` so the existing seating/attendance-sheet pipelines cover CIA rows transparently. Introduce `mark_conversion_rules` (institution × regulation × wef_date) and `internal_marks_audit` (append-only). Three pure library modules (`resolve-conversion-rule`, `apply-attendance-slabs`, `calculate-cia`) drive marks logic. No changes to main-exam flow; legacy CIA exam-session data untouched.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Supabase (service-role server client) · Shadcn UI (Sheet, Dialog, Table, Command, Popover) · Tailwind CSS · Zod (payload validation) · MyJKKN Attendance API.

---

## Reference Files (read before starting)

| Purpose | File |
|---|---|
| Existing CIA Entry Setting page | `app/(coe)/pre-exam/internal-mark-entry-setting/page.tsx` |
| Existing CIA API route (to extend) | `app/api/pre-exam/cia-entry-settings/route.ts` |
| Existing internal marks table + RLS | `supabase/migrations/20251113_create_internal_marks_table.sql` |
| Institution filter hook (RBAC-aware) | `hooks/use-institution-filter.ts` |
| MyJKKN institution hook | `hooks/use-myjkkn-institution-filter.ts` |
| Session sync hook | `hooks/use-session-sync.ts` |
| Server Supabase client | `lib/supabase-server.ts` |
| Institution-aware FK mapping pattern | `.claude/CLAUDE.md` → "Foreign Key Auto-Mapping" |
| Form Sheet pattern reference | `app/(coe)/master/degrees/page.tsx` |
| CRUD page standards | `.claude/skills/saas-ui-patterns/SKILL.md` |
| MyJKKN integration rules | `.claude/skills/myjkkn-coe-dev-rules/SKILL.md` |
| Sidebar config | `components/layout/app-sidebar.tsx` |
| Protected route wrapper | `components/protected-route.tsx` |
| Auth context | `lib/auth/auth-context-parent.tsx` |

---

## Milestone Overview (deployable independently)

| # | Milestone | Deliverable | Feature-flag gate |
|---|---|---|---|
| **M1** | **Database migrations** | Schema delta — new columns (nullable), new tables, indexes, RLS | None (additive only) |
| **M2** | **Mark Conversion Rules CRUD page** | Standalone master page; no consumers yet | None (standalone) |
| **M3** | **CIA round extensions + per-round timetable** | Sheet grows; "Schedule Timetable" editor; sheet-saves `cia_setting_id` on `exam_timetables` | `ENABLE_CIA_ROUNDS_V2` env flag |
| **M4** | **Fetch Attendance flow** | MyJKKN pagination → slab → snapshot → upsert | `ENABLE_CIA_ROUNDS_V2` |
| **M5** | **Per-round-per-course lock + final CIA pipeline** | `calculate-cia` integrated into final-marks generation; rule snapshot respected on historical data | `ENABLE_CIA_ROUNDS_V2` |
| **M6** | **Housekeeping + RBAC + audit viewer** | Filter CIA rows out of main-exam timetable views; permission seed; `/post-exam/internal-marks-audit` read-only page | None |

Each milestone is a separate branch. Merge to `main` only after smoke-test checklist passes.

---

## M1 — Database Migrations

### Task 1.1: Create `mark_conversion_rules` table

**Files:**
- Create: `supabase/migrations/20260422_create_mark_conversion_rules.sql`

**Step 1: Write migration SQL**

```sql
-- =====================================================
-- Mark Conversion Rules
-- Created: 2026-04-22
-- Purpose: Versioned master of rules that convert raw component scores
--          (tests, attendance %, rubrics) into CIA component/round/final marks.
--          Keyed by (institutions_id, regulation_code, wef_date).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.mark_conversion_rules (
	id UUID NOT NULL DEFAULT gen_random_uuid(),

	-- Scope
	institutions_id  UUID NOT NULL,
	institution_code VARCHAR(20) NOT NULL,
	regulation_id    UUID NULL,
	regulation_code  VARCHAR(32) NULL,  -- NULL = applies to all regulations
	wef_date         DATE NOT NULL,     -- effective from (must be >= today on insert)

	-- Identity
	rule_name        VARCHAR(200) NOT NULL,
	description      TEXT,

	-- Rule body (JSONB — see docs/plans/2026-04-22-cia-entry-setting-v2.md § Schema Contracts)
	attendance_slabs JSONB NOT NULL DEFAULT '[]'::jsonb,
	component_rules  JSONB NOT NULL DEFAULT '{}'::jsonb,
	round_rules      JSONB NOT NULL DEFAULT '{}'::jsonb,
	final_rule       JSONB NOT NULL DEFAULT '{}'::jsonb,

	-- Flags
	is_active        BOOLEAN DEFAULT true,

	-- Audit
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	created_by UUID NULL,
	updated_by UUID NULL,

	CONSTRAINT mark_conversion_rules_pkey PRIMARY KEY (id),
	CONSTRAINT mcr_institutions_fk FOREIGN KEY (institutions_id)
		REFERENCES public.institutions(id) ON DELETE CASCADE,
	CONSTRAINT mcr_regulation_fk FOREIGN KEY (regulation_id)
		REFERENCES public.regulations(id) ON DELETE SET NULL,
	CONSTRAINT mcr_unique_scope UNIQUE (institutions_id, regulation_code, wef_date)
);

CREATE INDEX IF NOT EXISTS idx_mcr_institutions_id ON public.mark_conversion_rules(institutions_id);
CREATE INDEX IF NOT EXISTS idx_mcr_regulation_code ON public.mark_conversion_rules(regulation_code);
CREATE INDEX IF NOT EXISTS idx_mcr_wef_date ON public.mark_conversion_rules(wef_date DESC);
CREATE INDEX IF NOT EXISTS idx_mcr_resolution
	ON public.mark_conversion_rules(institutions_id, regulation_code, wef_date DESC)
	WHERE is_active = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_mcr_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mcr_updated_at
	BEFORE UPDATE ON public.mark_conversion_rules
	FOR EACH ROW EXECUTE FUNCTION update_mcr_updated_at();

-- RLS — service role bypasses; authenticated can read, coe_admin/super_admin can write
ALTER TABLE public.mark_conversion_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read mark conversion rules"
	ON public.mark_conversion_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage mark conversion rules"
	ON public.mark_conversion_rules FOR ALL TO authenticated
	USING (EXISTS (
		SELECT 1 FROM public.user_roles ur
		JOIN public.roles r ON ur.role_id = r.id
		WHERE ur.user_id = auth.uid()
		  AND r.name IN ('super_admin', 'coe_admin')
		  AND ur.is_active = true
	))
	WITH CHECK (true);

CREATE POLICY "Service role can manage mark conversion rules"
	ON public.mark_conversion_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.mark_conversion_rules IS
	'Versioned conversion rules by (institution, regulation, wef_date). Drives CIA attendance→marks, component scaling, round roll-up, and final CIA calculation.';
COMMENT ON COLUMN public.mark_conversion_rules.wef_date IS
	'Effective from. Must be >= CURRENT_DATE at insert time; enforced at API layer, not DB.';
COMMENT ON COLUMN public.mark_conversion_rules.attendance_slabs IS
	'[{min_pct:95,max_pct:100,award_pct:100},...] — lower-bound inclusive, upper-bound inclusive.';
```

**Step 2: Apply via Supabase MCP or SQL editor**

```bash
# Via supabase CLI (if linked locally):
supabase db push

# Or paste SQL into Supabase Studio SQL Editor and Run.
```

**Step 3: Verify**

Run in SQL Editor:
```sql
select tablename from pg_tables where tablename = 'mark_conversion_rules';
-- Expected: 1 row
\d public.mark_conversion_rules
-- Expected: all 15 columns + 4 indexes + 3 policies
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260422_create_mark_conversion_rules.sql
git commit -m "feat(cia-v2): add mark_conversion_rules master table"
```

---

### Task 1.2: Create `internal_marks_audit` append-only table + `rule_snapshot` on `internal_marks`

**Files:**
- Create: `supabase/migrations/20260422_create_internal_marks_audit.sql`

**Step 1: Write migration SQL**

```sql
-- =====================================================
-- Internal Marks Audit + Rule Snapshot
-- Created: 2026-04-22
-- Purpose: Append-only audit trail + frozen rule snapshot on each mark row.
-- =====================================================

-- 1. Extend internal_marks with rule snapshot references -----------------------
ALTER TABLE public.internal_marks
	ADD COLUMN IF NOT EXISTS rule_snapshot     JSONB NULL,
	ADD COLUMN IF NOT EXISTS rule_snapshot_id  UUID  NULL,
	ADD COLUMN IF NOT EXISTS cia_setting_id    UUID  NULL,
	ADD COLUMN IF NOT EXISTS cia_round         INT   NULL,
	ADD COLUMN IF NOT EXISTS cia_round_name    VARCHAR(40) NULL,
	ADD COLUMN IF NOT EXISTS raw_attendance_pct NUMERIC(5,2) NULL,
	ADD COLUMN IF NOT EXISTS fetched_at        TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_im_cia_setting_id
	ON public.internal_marks(cia_setting_id)
	WHERE cia_setting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_im_cia_round
	ON public.internal_marks(cia_setting_id, cia_round)
	WHERE cia_setting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_im_rule_snapshot_id
	ON public.internal_marks(rule_snapshot_id)
	WHERE rule_snapshot_id IS NOT NULL;

COMMENT ON COLUMN public.internal_marks.rule_snapshot IS
	'Frozen JSONB snapshot of the mark_conversion_rules row at the moment of fetch/compute. Never mutated.';
COMMENT ON COLUMN public.internal_marks.cia_setting_id IS
	'NULL for legacy non-round marks; set for v2 round-based entries. Not a hard FK to avoid cascading during setting deletes.';

-- 2. Append-only audit table --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_marks_audit (
	id UUID NOT NULL DEFAULT gen_random_uuid(),
	internal_mark_id UUID NULL,  -- NULL when action is 'fetch-run' (no specific row yet)
	cia_setting_id   UUID NULL,
	cia_round        INT  NULL,
	action           VARCHAR(30) NOT NULL,  -- 'insert', 'update', 'fetch', 'lock', 'unlock', 'fetch-run'
	before_value     JSONB NULL,
	after_value      JSONB NULL,
	rule_snapshot_id UUID NULL,
	extra            JSONB NULL,            -- free-form context (e.g. {fetched: 147, missing: 3})
	performed_by     UUID NULL,
	performed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
	CONSTRAINT ima_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_ima_internal_mark_id ON public.internal_marks_audit(internal_mark_id);
CREATE INDEX IF NOT EXISTS idx_ima_cia_setting_id ON public.internal_marks_audit(cia_setting_id);
CREATE INDEX IF NOT EXISTS idx_ima_performed_at ON public.internal_marks_audit(performed_at DESC);

-- Prevent UPDATE/DELETE on audit rows
CREATE OR REPLACE FUNCTION block_ima_mutation()
RETURNS TRIGGER AS $$
BEGIN
	RAISE EXCEPTION 'internal_marks_audit is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ima_no_update BEFORE UPDATE ON public.internal_marks_audit
	FOR EACH ROW EXECUTE FUNCTION block_ima_mutation();
CREATE TRIGGER trg_ima_no_delete BEFORE DELETE ON public.internal_marks_audit
	FOR EACH ROW EXECUTE FUNCTION block_ima_mutation();

ALTER TABLE public.internal_marks_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read audit" ON public.internal_marks_audit
	FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can insert audit" ON public.internal_marks_audit
	FOR INSERT TO service_role WITH CHECK (true);

COMMENT ON TABLE public.internal_marks_audit IS 'Append-only audit trail for internal marks. UPDATE/DELETE blocked by trigger.';
```

**Step 2: Apply + verify**

```sql
-- Verify ALTER applied
select column_name from information_schema.columns
 where table_name = 'internal_marks' and column_name in
	 ('rule_snapshot','cia_setting_id','cia_round','raw_attendance_pct','fetched_at');
-- Expected: 5 rows

-- Verify audit trigger blocks UPDATE
insert into internal_marks_audit(action) values ('fetch-run');
update internal_marks_audit set action = 'x' where action = 'fetch-run';
-- Expected: ERROR: internal_marks_audit is append-only
```

**Step 3: Commit**

```bash
git add supabase/migrations/20260422_create_internal_marks_audit.sql
git commit -m "feat(cia-v2): add rule_snapshot + append-only internal_marks_audit"
```

---

### Task 1.3: Extend `exam_timetables` + `seating_arrangements` with CIA columns

**Files:**
- Create: `supabase/migrations/20260422_add_cia_columns_to_exam_tables.sql`

**Step 1: Write migration SQL**

```sql
-- =====================================================
-- CIA columns on exam_timetables + seating_arrangements
-- Created: 2026-04-22
-- Purpose: Allow CIA rounds to reuse main-exam timetable + seating infrastructure.
-- All columns nullable — main-exam queries must filter `cia_setting_id IS NULL`.
-- =====================================================

ALTER TABLE public.exam_timetables
	ADD COLUMN IF NOT EXISTS cia_setting_id UUID NULL,
	ADD COLUMN IF NOT EXISTS cia_round      INT  NULL,
	ADD COLUMN IF NOT EXISTS cia_round_name VARCHAR(40) NULL;

ALTER TABLE public.exam_timetables
	ADD CONSTRAINT cia_setting_fk
	FOREIGN KEY (cia_setting_id) REFERENCES public.cia_entry_settings(id) ON DELETE CASCADE;

ALTER TABLE public.exam_timetables
	ADD CONSTRAINT check_cia_consistency
	CHECK ((cia_setting_id IS NULL) = (cia_round IS NULL));

-- Partial index: main-exam queries remain O(main rows)
CREATE INDEX IF NOT EXISTS idx_et_cia
	ON public.exam_timetables(cia_setting_id, cia_round)
	WHERE cia_setting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_et_main_only
	ON public.exam_timetables(examination_session_id)
	WHERE cia_setting_id IS NULL;

-- seating_arrangements piggybacks via exam_timetables.id (already FK'd),
-- but add direct columns for efficient CIA-scoped queries
ALTER TABLE public.seating_arrangements
	ADD COLUMN IF NOT EXISTS cia_setting_id UUID NULL,
	ADD COLUMN IF NOT EXISTS cia_round      INT  NULL;

CREATE INDEX IF NOT EXISTS idx_sa_cia
	ON public.seating_arrangements(cia_setting_id, cia_round)
	WHERE cia_setting_id IS NOT NULL;

COMMENT ON COLUMN public.exam_timetables.cia_setting_id IS
	'NULL = main exam row. Set = CIA round row; list/detail queries must filter to segregate.';
```

**Step 2: Apply + verify**

```sql
-- Verify columns + FK + check constraint
select constraint_name from information_schema.table_constraints
 where table_name = 'exam_timetables' and constraint_name in ('cia_setting_fk', 'check_cia_consistency');
-- Expected: 2 rows

-- Verify check constraint
insert into exam_timetables(...) values (..., cia_setting_id='x', cia_round=NULL);
-- Expected: CHECK constraint violation
```

**Step 3: Commit**

```bash
git add supabase/migrations/20260422_add_cia_columns_to_exam_tables.sql
git commit -m "feat(cia-v2): add cia_setting_id/cia_round to exam_timetables + seating_arrangements"
```

---

### Task 1.4: Extend `cia_entry_settings.cia_rounds` JSON with session dates + rule reference

No migration needed — `cia_rounds` is already JSONB. But add a `conversion_rule_id` column at setting level as a default.

**Files:**
- Create: `supabase/migrations/20260422_extend_cia_entry_settings.sql`

**Step 1: Write migration SQL**

```sql
-- =====================================================
-- CIA Entry Settings — add default conversion rule reference
-- Created: 2026-04-22
-- =====================================================

ALTER TABLE public.cia_entry_settings
	ADD COLUMN IF NOT EXISTS conversion_rule_id UUID NULL;

ALTER TABLE public.cia_entry_settings
	ADD CONSTRAINT ces_conversion_rule_fk
	FOREIGN KEY (conversion_rule_id)
	REFERENCES public.mark_conversion_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ces_conversion_rule_id
	ON public.cia_entry_settings(conversion_rule_id)
	WHERE conversion_rule_id IS NOT NULL;

COMMENT ON COLUMN public.cia_entry_settings.conversion_rule_id IS
	'Default conversion rule for all rounds in this setting. Per-round override stored inside cia_rounds JSONB.';
```

**Step 2: Verify existing JSONB shape is compatible**

The existing page already stores `{ round, round_name, entry_from, entry_to, components: [...] }`. V2 adds optional keys (no DB migration for JSON):

```ts
// types/cia.ts — v2 shape (for documentation)
{
  round: 1,
  round_name: "CIA-1",
  entry_from: "2026-02-01",
  entry_to:   "2026-02-20",
  session_from: "2025-12-01",       // NEW
  session_to:   "2026-02-15",       // NEW
  conversion_rule_id: null,         // NEW — per-round override
  components: [
    { code: "test_1",     name: "Test 1",     max_marks: 60, raw_out_of: 50 },  // raw_out_of is NEW
    { code: "attendance", name: "Attendance", max_marks: 5,  raw_out_of: 100 }
  ]
}
```

**Step 3: Commit**

```bash
git add supabase/migrations/20260422_extend_cia_entry_settings.sql
git commit -m "feat(cia-v2): add conversion_rule_id to cia_entry_settings"
```

---

## Schema Contracts — JSONB Shapes (reference)

Document these in `types/mark-conversion-rule.ts` in Task 2.2.

### `mark_conversion_rules.attendance_slabs`
```jsonc
[
  { "min_pct": 95, "max_pct": 100, "award_pct": 100 },
  { "min_pct": 90, "max_pct": 94.99, "award_pct": 80 },
  { "min_pct": 85, "max_pct": 89.99, "award_pct": 60 },
  { "min_pct": 75, "max_pct": 84.99, "award_pct": 40 },
  { "min_pct": 0,  "max_pct": 74.99, "award_pct": 0 }
]
```

### `mark_conversion_rules.component_rules`
```jsonc
{
  "test_1":     { "raw_out_of": 50,  "converts_to": 60 },
  "test_2":     { "raw_out_of": 50,  "converts_to": 60 },
  "assignment": { "raw_out_of": 100, "converts_to": 20 },
  "quiz":       { "raw_out_of": 20,  "converts_to": 20 },
  "attendance": { "strategy": "use_slabs" }
}
```

### `mark_conversion_rules.round_rules`
```jsonc
{
  "CIA-1": { "components": ["test_1","assignment","attendance"], "cap_total": 100 },
  "CIA-2": { "components": ["test_2","quiz","attendance"],       "cap_total": 100 },
  "CIA-3": { "components": ["test_3"],                           "cap_total": 100 }
}
```

### `mark_conversion_rules.final_rule`
```jsonc
{
  "formula": "average",           // one of: "sum", "average", "best_of"
  "rounds": ["CIA-1","CIA-2","CIA-3"],
  "best_of": 2,                   // only when formula === "best_of"
  "extras": [                     // optional separate addends
    { "component": "attendance", "marks": 5 }
  ],
  "compare_to": "course.internal_max_marks"
}
```

---

## M2 — Mark Conversion Rules CRUD Page

### Task 2.1: API route `/api/pre-exam/mark-conversion-rules`

**Files:**
- Create: `app/api/pre-exam/mark-conversion-rules/route.ts`

**Step 1: Implement GET/POST/PUT/DELETE**

```ts
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET /api/pre-exam/mark-conversion-rules?institutions_id=...&regulation_code=...
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const institutionCode = searchParams.get('institution_code')
		const regulationCode = searchParams.get('regulation_code')
		const search = searchParams.get('search')

		const supabase = getSupabaseServer()
		let query = supabase
			.from('mark_conversion_rules')
			.select('*')
			.eq('is_active', true)
			.order('wef_date', { ascending: false })

		if (institutionCode) query = query.eq('institution_code', institutionCode)
		else if (institutionsId) query = query.eq('institutions_id', institutionsId)

		if (regulationCode) query = query.eq('regulation_code', regulationCode)

		if (search) {
			const s = `%${search}%`
			query = query.or(`rule_name.ilike.${s},description.ilike.${s}`)
		}

		const { data, error } = await query.range(0, 9999)
		if (error) {
			console.error('MCR GET error:', error)
			return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 })
		}
		return NextResponse.json(data || [])
	} catch (e) {
		console.error('MCR GET exception:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST — validates wef_date >= today, unique (institutions_id, regulation_code, wef_date)
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const {
			institutions_id, institution_code,
			regulation_id, regulation_code,
			wef_date, rule_name, description,
			attendance_slabs, component_rules, round_rules, final_rule,
			created_by,
		} = body

		// Required fields
		if (!institutions_id) return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
		if (!wef_date) return NextResponse.json({ error: 'WEF date is required' }, { status: 400 })
		if (!rule_name?.trim()) return NextResponse.json({ error: 'Rule name is required' }, { status: 400 })

		// WEF date must be today or future
		const today = new Date().toISOString().slice(0, 10)
		if (wef_date < today) {
			return NextResponse.json({ error: 'WEF date cannot be in the past' }, { status: 400 })
		}

		// Validate slabs don't overlap
		if (Array.isArray(attendance_slabs)) {
			const sorted = [...attendance_slabs].sort((a, b) => a.min_pct - b.min_pct)
			for (let i = 1; i < sorted.length; i++) {
				if (sorted[i].min_pct <= sorted[i-1].max_pct) {
					return NextResponse.json({ error: `Attendance slabs overlap near ${sorted[i].min_pct}%` }, { status: 400 })
				}
			}
		}

		const supabase = getSupabaseServer()

		// Resolve institution_code from institutions_id if missing
		let resolvedCode = institution_code
		if (!resolvedCode) {
			const { data: inst } = await supabase
				.from('institutions').select('institution_code').eq('id', institutions_id).single()
			if (!inst) return NextResponse.json({ error: 'Institution not found' }, { status: 400 })
			resolvedCode = inst.institution_code
		}

		const { data, error } = await supabase
			.from('mark_conversion_rules')
			.insert({
				institutions_id,
				institution_code: resolvedCode,
				regulation_id: regulation_id || null,
				regulation_code: regulation_code || null,
				wef_date,
				rule_name: rule_name.trim(),
				description: description?.trim() || null,
				attendance_slabs: attendance_slabs || [],
				component_rules:  component_rules  || {},
				round_rules:      round_rules      || {},
				final_rule:       final_rule       || {},
				created_by: created_by || null,
				is_active: true,
			})
			.select()
			.single()

		if (error) {
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'A rule already exists for this institution/regulation/WEF date.'
				}, { status: 400 })
			}
			console.error('MCR POST error:', error)
			return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
		}
		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('MCR POST exception:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT — allow edits; warn UI-side if rule is referenced by snapshots
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const { id, ...updateData } = body
		if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

		// Never allow scope changes
		delete updateData.institutions_id
		delete updateData.institution_code
		delete updateData.created_by

		if (updateData.wef_date) {
			const today = new Date().toISOString().slice(0, 10)
			if (updateData.wef_date < today) {
				return NextResponse.json({ error: 'WEF date cannot be in the past' }, { status: 400 })
			}
		}

		const supabase = getSupabaseServer()
		const { data, error } = await supabase
			.from('mark_conversion_rules').update(updateData).eq('id', id).select().single()
		if (error) return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 })
		return NextResponse.json(data)
	} catch (e) {
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE — soft-delete (is_active=false) to preserve snapshots
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')
		if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

		const supabase = getSupabaseServer()

		// Check references
		const { data: refs } = await supabase
			.from('cia_entry_settings').select('id').eq('conversion_rule_id', id).limit(1)
		const { data: snaps } = await supabase
			.from('internal_marks').select('id').eq('rule_snapshot_id', id).limit(1)

		if ((refs && refs.length) || (snaps && snaps.length)) {
			// Soft-delete
			const { error } = await supabase
				.from('mark_conversion_rules').update({ is_active: false }).eq('id', id)
			if (error) return NextResponse.json({ error: 'Failed to deactivate' }, { status: 500 })
			return NextResponse.json({ success: true, deactivated: true })
		}

		const { error } = await supabase.from('mark_conversion_rules').delete().eq('id', id)
		if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
		return NextResponse.json({ success: true, deactivated: false })
	} catch (e) {
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

**Step 2: Smoke test**

```bash
# With app running (npm run dev):
curl -X POST http://localhost:3000/api/pre-exam/mark-conversion-rules \
  -H 'Content-Type: application/json' \
  -d '{"institutions_id":"<uuid>","wef_date":"2026-05-01","rule_name":"Test Rule"}'
# Expected: 201 with created row
```

**Step 3: Commit**

```bash
git add app/api/pre-exam/mark-conversion-rules/route.ts
git commit -m "feat(cia-v2): add mark-conversion-rules CRUD API"
```

---

### Task 2.2: TypeScript types

**Files:**
- Create: `types/mark-conversion-rule.ts`

**Step 1: Write types**

```ts
export interface AttendanceSlab {
	min_pct: number    // inclusive
	max_pct: number    // inclusive
	award_pct: number  // 0-100, applied as percent-of-max_marks
}

export interface ComponentRule {
	raw_out_of?: number     // e.g. test raw is out of 50
	converts_to?: number    // scaled to (e.g.) 60
	strategy?: 'use_slabs'  // for attendance
}

export interface RoundRule {
	components: string[]    // component codes included in this round's roll-up
	cap_total:  number      // hard cap for the round total
}

export type FinalFormula = 'sum' | 'average' | 'best_of'

export interface FinalRule {
	formula:    FinalFormula
	rounds:     string[]    // round_name list
	best_of?:   number      // required if formula === 'best_of'
	extras?: Array<{ component: string; marks: number }>
	compare_to: 'course.internal_max_marks'
}

export interface MarkConversionRule {
	id: string
	institutions_id: string
	institution_code: string
	regulation_id: string | null
	regulation_code: string | null
	wef_date: string  // YYYY-MM-DD
	rule_name: string
	description: string | null
	attendance_slabs: AttendanceSlab[]
	component_rules:  Record<string, ComponentRule>
	round_rules:      Record<string, RoundRule>
	final_rule:       FinalRule
	is_active: boolean
	created_at: string
	updated_at: string
	created_by: string | null
	updated_by: string | null
}
```

**Step 2: Commit**

```bash
git add types/mark-conversion-rule.ts
git commit -m "feat(cia-v2): add MarkConversionRule TypeScript types"
```

---

### Task 2.3: Page `/pre-exam/mark-conversion-rules`

**Files:**
- Create: `app/(coe)/pre-exam/mark-conversion-rules/page.tsx`

Follow the CRUD layout in [.claude/skills/saas-ui-patterns/SKILL.md](.claude/skills/saas-ui-patterns/SKILL.md) — 4 scorecards, filters row, table with actions, form sheet with sections.

**Step 1: Scaffold page with scorecards + table + empty form sheet**

Skeleton (full form-sheet body in Task 2.4):

```tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/common/use-toast"
import { useAuth } from "@/lib/auth/auth-context-parent"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useMyJKKNInstitutionFilter } from "@/hooks/use-myjkkn-institution-filter"
import { Plus, Pencil, Trash2, Loader2, MoreHorizontal, Eye, PlusCircle, RefreshCw, Search, Scale, Calendar, Shield, ListChecks } from "lucide-react"
import type { MarkConversionRule } from "@/types/mark-conversion-rule"

// ... standard CRUD page scaffolding:
// - scorecards: total rules, active, institutions-covered, regulations-covered
// - filters: institution (super_admin), regulation, search
// - table: rule_name, institution_code, regulation_code, wef_date, status, actions
// - form sheet: (Task 2.4)

export default function MarkConversionRulesPage() { /* ... */ }
```

**Step 2: Smoke test — page loads, empty state renders**

Run `npm run dev`, visit http://localhost:3000/pre-exam/mark-conversion-rules, verify scorecards + empty table render for super_admin.

**Step 3: Commit**

```bash
git add app/(coe)/pre-exam/mark-conversion-rules/page.tsx
git commit -m "feat(cia-v2): scaffold mark-conversion-rules page"
```

---

### Task 2.4: Conversion rule form sheet (5 sections)

**Files:**
- Modify: `app/(coe)/pre-exam/mark-conversion-rules/page.tsx`
- Create: `components/cia/attendance-slab-editor.tsx`
- Create: `components/cia/component-rule-editor.tsx`
- Create: `components/cia/round-rule-editor.tsx`
- Create: `components/cia/final-rule-editor.tsx`

**Step 1: Build 5 section components + glue them into the sheet**

Each editor is controlled (accepts `value`, emits `onChange`):

```tsx
// components/cia/attendance-slab-editor.tsx
"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2 } from "lucide-react"
import type { AttendanceSlab } from "@/types/mark-conversion-rule"

export function AttendanceSlabEditor({ value, onChange }: {
	value: AttendanceSlab[]
	onChange: (slabs: AttendanceSlab[]) => void
}) {
	const add = () => onChange([...value, { min_pct: 0, max_pct: 0, award_pct: 0 }])
	const update = (i: number, patch: Partial<AttendanceSlab>) =>
		onChange(value.map((s, idx) => idx === i ? { ...s, ...patch } : s))
	const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

	// Preview for 92%, 87%, 74%
	const preview = [92, 87, 74].map(pct => {
		const slab = value.find(s => pct >= s.min_pct && pct <= s.max_pct)
		return { pct, award: slab?.award_pct ?? 0 }
	})

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-xs text-muted-foreground">Define attendance % slabs. Lower-bound inclusive, upper-bound inclusive.</p>
				<Button size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5 mr-1" />Add Slab</Button>
			</div>
			<div className="space-y-1.5">
				{value.map((slab, i) => (
					<div key={i} className="flex items-center gap-2">
						<Input type="number" step="0.01" value={slab.min_pct} onChange={e => update(i, { min_pct: Number(e.target.value) })} className="h-8 w-24 text-xs" placeholder="Min %" />
						<span className="text-xs text-muted-foreground">to</span>
						<Input type="number" step="0.01" value={slab.max_pct} onChange={e => update(i, { max_pct: Number(e.target.value) })} className="h-8 w-24 text-xs" placeholder="Max %" />
						<span className="text-xs text-muted-foreground">→ Award</span>
						<Input type="number" step="0.01" value={slab.award_pct} onChange={e => update(i, { award_pct: Number(e.target.value) })} className="h-8 w-24 text-xs" placeholder="Award %" />
						<span className="text-xs text-muted-foreground">%</span>
						<Button size="icon" variant="ghost" onClick={() => remove(i)} className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
					</div>
				))}
			</div>
			<div className="rounded-md border bg-muted/30 p-3 text-xs">
				<p className="font-semibold mb-1">Preview</p>
				{preview.map(p => <p key={p.pct}>{p.pct}% → award {p.award}% of max</p>)}
			</div>
		</div>
	)
}
```

Follow the same pattern for `ComponentRuleEditor` (table of all 13 component codes with raw_out_of / converts_to columns), `RoundRuleEditor` (per round_name: checkboxes for included components + cap_total input), `FinalRuleEditor` (formula select + rounds multi-select + extras builder).

**Step 2: Sheet layout**

```tsx
<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
	<SheetContent className="sm:max-w-[900px] overflow-y-auto">
		<SheetHeader><SheetTitle>{editingId ? 'Edit' : 'New'} Mark Conversion Rule</SheetTitle></SheetHeader>
		<div className="mt-6 space-y-8">
			{/* Section 1: Scope */}
			<section>
				<h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Scope</h3>
				{/* Institution (when super_admin + !editingId), Regulation select, WEF Date, Rule Name */}
			</section>

			{/* Section 2: Attendance Slabs */}
			<section>
				<h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Attendance Slabs</h3>
				<AttendanceSlabEditor value={form.attendance_slabs} onChange={(v) => setForm({...form, attendance_slabs: v})} />
			</section>

			{/* Section 3: Component Scaling */}
			<section>
				<h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Component Scaling</h3>
				<ComponentRuleEditor value={form.component_rules} onChange={(v) => setForm({...form, component_rules: v})} />
			</section>

			{/* Section 4: Round Rules */}
			<section>
				<h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Round Rules</h3>
				<RoundRuleEditor value={form.round_rules} onChange={(v) => setForm({...form, round_rules: v})} />
			</section>

			{/* Section 5: Final Rule */}
			<section>
				<h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Final CIA Rule</h3>
				<FinalRuleEditor value={form.final_rule} onChange={(v) => setForm({...form, final_rule: v})} />
			</section>

			<div className="flex justify-end gap-2 pt-4 border-t">
				<Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
				<Button onClick={handleSave} disabled={saving}>
					{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
					{editingId ? 'Update Rule' : 'Create Rule'}
				</Button>
			</div>
		</div>
	</SheetContent>
</Sheet>
```

**Step 3: Client-side validation before save**

```ts
const validate = (): string | null => {
	if (!form.institutions_id) return 'Institution is required'
	if (!form.wef_date) return 'WEF date is required'
	const today = new Date().toISOString().slice(0, 10)
	if (form.wef_date < today) return 'WEF date cannot be in the past'
	if (!form.rule_name?.trim()) return 'Rule name is required'
	// Overlap check
	const sorted = [...form.attendance_slabs].sort((a, b) => a.min_pct - b.min_pct)
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].min_pct <= sorted[i-1].max_pct) {
			return `Attendance slabs overlap near ${sorted[i].min_pct}%`
		}
	}
	return null
}
```

**Step 4: Smoke test**

Create a rule end-to-end via UI. Verify row appears in table, appears in DB (`select * from mark_conversion_rules`). Edit it. Try creating a second rule with same `(institution, regulation, wef_date)` → expect error toast.

**Step 5: Commit**

```bash
git add components/cia/ app/(coe)/pre-exam/mark-conversion-rules/
git commit -m "feat(cia-v2): mark conversion rules form sheet with 5 sections"
```

---

### Task 2.5: Add sidebar entry + RBAC permission seed

**Files:**
- Modify: `components/layout/app-sidebar.tsx` — add link under "Pre-Exam"
- Create: `supabase/migrations/20260422_seed_cia_v2_permissions.sql`

**Step 1: Sidebar entry**

Search for existing "CIA Entry Setting" link in `app-sidebar.tsx`, add sibling:

```tsx
{ title: 'Mark Conversion Rules', url: '/pre-exam/mark-conversion-rules', icon: Scale, permission: 'mark-conversion-rules:read' },
```

**Step 2: Permissions seed**

```sql
-- 20260422_seed_cia_v2_permissions.sql
INSERT INTO public.permissions (name, description) VALUES
	('mark-conversion-rules:read',   'Read mark conversion rules'),
	('mark-conversion-rules:create', 'Create mark conversion rules'),
	('mark-conversion-rules:update', 'Update mark conversion rules'),
	('mark-conversion-rules:delete', 'Delete mark conversion rules'),
	('cia-rounds:schedule-timetable','Schedule CIA round timetable'),
	('cia-rounds:fetch-attendance',  'Trigger MyJKKN attendance fetch'),
	('cia-rounds:lock',              'Lock CIA round marks per course')
ON CONFLICT (name) DO NOTHING;

-- Grant all to super_admin and coe_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name IN ('super_admin', 'coe_admin')
  AND p.name IN (
	  'mark-conversion-rules:read','mark-conversion-rules:create',
	  'mark-conversion-rules:update','mark-conversion-rules:delete',
	  'cia-rounds:schedule-timetable','cia-rounds:fetch-attendance','cia-rounds:lock'
  )
ON CONFLICT DO NOTHING;

-- Faculty gets read + fetch-attendance (for their own courses)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'faculty'
  AND p.name IN ('mark-conversion-rules:read', 'cia-rounds:fetch-attendance')
ON CONFLICT DO NOTHING;
```

**Step 3: Wrap page with `<ProtectedRoute>`**

```tsx
// app/(coe)/pre-exam/mark-conversion-rules/page.tsx — wrap return
return (
	<ProtectedRoute requiredPermissions={['mark-conversion-rules:read']}>
		<SidebarProvider>...</SidebarProvider>
	</ProtectedRoute>
)
```

**Step 4: Smoke test**

Log in as a non-admin → nav link absent. Log in as super_admin → nav link visible, page loads.

**Step 5: Commit**

```bash
git add components/layout/app-sidebar.tsx supabase/migrations/20260422_seed_cia_v2_permissions.sql app/(coe)/pre-exam/mark-conversion-rules/page.tsx
git commit -m "feat(cia-v2): sidebar entry + RBAC permissions for conversion rules"
```

---

## M3 — CIA Round Extensions + Per-Round Timetable

### Task 3.1: Add `ENABLE_CIA_ROUNDS_V2` feature flag

**Files:**
- Modify: `.env.example`
- Create: `lib/feature-flags.ts`

**Step 1: Feature flag reader**

```ts
// lib/feature-flags.ts
export const featureFlags = {
	ciaRoundsV2: process.env.NEXT_PUBLIC_ENABLE_CIA_ROUNDS_V2 === 'true',
}
```

**Step 2: Add to .env.example**

```
NEXT_PUBLIC_ENABLE_CIA_ROUNDS_V2=false
```

**Step 3: Commit**

```bash
git add .env.example lib/feature-flags.ts
git commit -m "feat(cia-v2): add feature flag ENABLE_CIA_ROUNDS_V2"
```

---

### Task 3.2: Extend API to accept `session_from`/`session_to`/`conversion_rule_id`

**Files:**
- Modify: `app/api/pre-exam/cia-entry-settings/route.ts`

**Step 1: Add per-round fields to validation + insert/update**

Inside POST handler, after the existing round validation:

```ts
// Validate new v2 fields per round
for (const round of cia_rounds) {
	if (round.session_from && round.session_to) {
		if (round.session_from > round.session_to) {
			return NextResponse.json(
				{ error: `${round.round_name}: session_from must be <= session_to` },
				{ status: 400 }
			)
		}
	}
	if (round.entry_from && round.entry_to && round.entry_from > round.entry_to) {
		return NextResponse.json(
			{ error: `${round.round_name}: entry_from must be <= entry_to` },
			{ status: 400 }
		)
	}
}
```

Add `conversion_rule_id` to the `insert({...})` object:

```ts
.insert({
	// ... existing fields
	conversion_rule_id: body.conversion_rule_id || null,
	// cia_rounds already JSONB — v2 fields stored inside each round object
})
```

Same in PUT handler for `updateData.conversion_rule_id`.

**Step 2: Smoke test**

```bash
curl -X POST http://localhost:3000/api/pre-exam/cia-entry-settings \
  -H 'Content-Type: application/json' \
  -d '{
    "institutions_id":"<uuid>","institution_code":"CAS","examination_session_id":"<uuid>",
    "setting_name":"Test V2","program_codes":["BCA"],"course_type":["Theory"],
    "cia_rounds":[{"round":1,"round_name":"CIA-1","entry_from":"2026-05-01","entry_to":"2026-05-10",
                   "session_from":"2026-03-01","session_to":"2026-04-30",
                   "components":[{"code":"test_1","name":"Test 1","max_marks":50,"raw_out_of":50}]}],
    "conversion_rule_id":"<uuid>"
  }'
# Expected: 201 with conversion_rule_id + session_from/to persisted in JSONB
```

**Step 3: Commit**

```bash
git add app/api/pre-exam/cia-entry-settings/route.ts
git commit -m "feat(cia-v2): accept session_from/to and conversion_rule_id on CIA setting API"
```

---

### Task 3.3: Extend CIA Entry Setting sheet UI (per-round fields)

**Files:**
- Modify: `app/(coe)/pre-exam/internal-mark-entry-setting/page.tsx`

**Step 1: Extend form state + CIARound interface**

```ts
interface RoundComponent {
	code: string
	name: string
	max_marks: number
	raw_out_of?: number          // NEW
}

interface CIARound {
	round: number
	round_name: string
	entry_from?: string
	entry_to?: string
	session_from?: string        // NEW
	session_to?: string          // NEW
	conversion_rule_id?: string  // NEW
	components: RoundComponent[]
}

const emptyForm = () => ({
	// ...existing
	conversion_rule_id: '' as string,  // setting-level default
})
```

**Step 2: Add Session From/To + Conversion Rule dropdown per round card**

Inside the round loop (replacing the existing Entry From/To grid):

```tsx
<div className="grid grid-cols-2 gap-3">
	<div><Label className="text-xs">Entry From</Label>
		<Input type="date" value={round.entry_from || ''} onChange={e => updateRound(rIdx, { entry_from: e.target.value })} className="h-8 text-xs" />
	</div>
	<div><Label className="text-xs">Entry To</Label>
		<Input type="date" value={round.entry_to || ''} onChange={e => updateRound(rIdx, { entry_to: e.target.value })} className="h-8 text-xs" />
	</div>
	{featureFlags.ciaRoundsV2 && (
		<>
			<div><Label className="text-xs">Session From (attendance)</Label>
				<Input type="date" value={round.session_from || ''} onChange={e => updateRound(rIdx, { session_from: e.target.value })} className="h-8 text-xs" />
			</div>
			<div><Label className="text-xs">Session To (attendance)</Label>
				<Input type="date" value={round.session_to || ''} onChange={e => updateRound(rIdx, { session_to: e.target.value })} className="h-8 text-xs" />
			</div>
			<div className="col-span-2">
				<Label className="text-xs">Conversion Rule (overrides setting default)</Label>
				<Select value={round.conversion_rule_id || ''} onValueChange={(v) => updateRound(rIdx, { conversion_rule_id: v })}>
					<SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Use setting default" /></SelectTrigger>
					<SelectContent>
						<SelectItem value="">Use setting default</SelectItem>
						{conversionRules.map(r => <SelectItem key={r.id} value={r.id}>{r.rule_name} (WEF {r.wef_date})</SelectItem>)}
					</SelectContent>
				</Select>
			</div>
		</>
	)}
</div>
```

**Step 3: Fetch conversion rules for institution on sheet open**

```ts
const [conversionRules, setConversionRules] = useState<MarkConversionRule[]>([])

useEffect(() => {
	if (!formInstitutionId || !featureFlags.ciaRoundsV2) return
	fetch(`/api/pre-exam/mark-conversion-rules?institutions_id=${formInstitutionId}`)
		.then(r => r.json()).then(setConversionRules).catch(() => setConversionRules([]))
}, [formInstitutionId])
```

**Step 4: Extend `handleSave` payload**

Already covered by existing `cia_rounds` JSONB — the new keys auto-propagate. Ensure `conversion_rule_id` (top-level) is included:

```ts
const payload = {
	...form,
	conversion_rule_id: form.conversion_rule_id || null,
	// ...
}
```

**Step 5: Smoke test with flag off → on**

With `ENABLE_CIA_ROUNDS_V2=false`: only existing Entry From/To visible. With `=true`: new fields appear; save round; verify JSONB contains all 3 new keys.

**Step 6: Commit**

```bash
git add app/(coe)/pre-exam/internal-mark-entry-setting/page.tsx
git commit -m "feat(cia-v2): add session dates + conversion rule to CIA round sheet"
```

---

### Task 3.4: Per-round timetable API

**Files:**
- Create: `app/api/pre-exam/cia-entry-settings/[id]/timetable/route.ts`

**Step 1: Implement GET (list round timetable rows) + POST (upsert row) + DELETE**

```ts
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

// GET ?round=1  → list exam_timetables rows for this setting+round
export async function GET(request: Request, { params }: Ctx) {
	const { id: settingId } = await params
	const { searchParams } = new URL(request.url)
	const round = Number(searchParams.get('round') || 1)

	const supabase = getSupabaseServer()
	const { data, error } = await supabase
		.from('exam_timetables')
		.select(`
			id, course_offering_id, exam_date, start_time, end_time, room_id, room_name,
			course_offerings(id, course_id, courses:course_id(course_code, course_name))
		`)
		.eq('cia_setting_id', settingId)
		.eq('cia_round', round)
		.order('exam_date', { ascending: true })

	if (error) {
		console.error('CIA timetable GET error:', error)
		return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
	}
	return NextResponse.json(data || [])
}

// POST body: { round, course_offering_id, exam_date, start_time, end_time, room_id?, room_name? }
export async function POST(request: Request, { params }: Ctx) {
	const { id: settingId } = await params
	const body = await request.json()
	const { round, course_offering_id, exam_date, start_time, end_time, room_id, room_name } = body

	if (!round || !course_offering_id || !exam_date) {
		return NextResponse.json({ error: 'round, course_offering_id, exam_date are required' }, { status: 400 })
	}

	const supabase = getSupabaseServer()

	// Load setting for institutions_id, examination_session_id, cia_round_name
	const { data: setting } = await supabase
		.from('cia_entry_settings')
		.select('institutions_id, examination_session_id, cia_rounds')
		.eq('id', settingId).single()
	if (!setting) return NextResponse.json({ error: 'Setting not found' }, { status: 404 })

	const roundObj = (setting.cia_rounds as any[]).find((r: any) => r.round === round)
	const cia_round_name = roundObj?.round_name || `CIA-${round}`

	// Upsert: one row per (setting, round, course_offering) — overwrite if exists
	const { data: existing } = await supabase
		.from('exam_timetables').select('id')
		.eq('cia_setting_id', settingId)
		.eq('cia_round', round)
		.eq('course_offering_id', course_offering_id)
		.maybeSingle()

	const payload = {
		institutions_id: setting.institutions_id,
		examination_session_id: setting.examination_session_id,
		course_offering_id,
		exam_date, start_time, end_time,
		room_id: room_id || null, room_name: room_name || null,
		cia_setting_id: settingId,
		cia_round: round,
		cia_round_name,
	}

	const { data, error } = existing
		? await supabase.from('exam_timetables').update(payload).eq('id', existing.id).select().single()
		: await supabase.from('exam_timetables').insert(payload).select().single()

	if (error) {
		console.error('CIA timetable upsert error:', error)
		return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
	}
	return NextResponse.json(data, { status: existing ? 200 : 201 })
}

// DELETE ?timetable_id=<uuid>
export async function DELETE(request: Request, { params }: Ctx) {
	const { id: settingId } = await params
	const { searchParams } = new URL(request.url)
	const timetableId = searchParams.get('timetable_id')
	if (!timetableId) return NextResponse.json({ error: 'timetable_id is required' }, { status: 400 })

	const supabase = getSupabaseServer()
	const { error } = await supabase
		.from('exam_timetables').delete()
		.eq('id', timetableId).eq('cia_setting_id', settingId)  // scope guard
	if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
	return NextResponse.json({ success: true })
}
```

**Step 2: Smoke test**

```bash
# Upsert CIA-1 slot for a course
curl -X POST http://localhost:3000/api/pre-exam/cia-entry-settings/<id>/timetable \
  -H 'Content-Type: application/json' \
  -d '{"round":1,"course_offering_id":"<uuid>","exam_date":"2026-05-15","start_time":"10:00","end_time":"11:30","room_name":"Room A"}'
# Expected: 201 / 200

# List
curl 'http://localhost:3000/api/pre-exam/cia-entry-settings/<id>/timetable?round=1'
# Expected: array with 1 row
```

**Step 3: Commit**

```bash
git add app/api/pre-exam/cia-entry-settings/
git commit -m "feat(cia-v2): per-round CIA timetable API (GET/POST/DELETE)"
```

---

### Task 3.5: "Schedule Timetable" dialog per round

**Files:**
- Create: `components/cia/cia-round-timetable-dialog.tsx`
- Modify: `app/(coe)/pre-exam/internal-mark-entry-setting/page.tsx`

**Step 1: Dialog component**

```tsx
"use client"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Save } from "lucide-react"
import { useToast } from "@/hooks/common/use-toast"

interface CourseRow {
	course_offering_id: string
	course_code: string
	course_name: string
	exam_date?: string
	start_time?: string
	end_time?: string
	room_name?: string
	existing_timetable_id?: string
}

export function CIARoundTimetableDialog({
	open, onClose, settingId, round, roundName,
}: {
	open: boolean
	onClose: () => void
	settingId: string
	round: number
	roundName: string
}) {
	const { toast } = useToast()
	const [rows, setRows] = useState<CourseRow[]>([])
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState<string | null>(null)

	useEffect(() => {
		if (!open) return
		setLoading(true)
		fetch(`/api/pre-exam/cia-entry-settings/${settingId}/timetable/scope?round=${round}`)
			.then(r => r.json())
			.then((data: CourseRow[]) => setRows(data))
			.catch(() => toast({ title: 'Failed to load courses', variant: 'destructive' }))
			.finally(() => setLoading(false))
	}, [open, settingId, round])

	const saveRow = async (row: CourseRow) => {
		if (!row.exam_date) return
		setSaving(row.course_offering_id)
		try {
			const res = await fetch(`/api/pre-exam/cia-entry-settings/${settingId}/timetable`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					round,
					course_offering_id: row.course_offering_id,
					exam_date: row.exam_date,
					start_time: row.start_time || null,
					end_time: row.end_time || null,
					room_name: row.room_name || null,
				}),
			})
			if (res.ok) toast({ title: '✅ Saved', className: 'bg-green-50 border-green-200 text-green-800' })
			else toast({ title: '❌ Save failed', variant: 'destructive' })
		} finally {
			setSaving(null)
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-w-4xl">
				<DialogHeader><DialogTitle>Schedule {roundName} Timetable</DialogTitle></DialogHeader>
				{loading ? (
					<div className="py-8 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
				) : (
					<Table>
						<TableHeader><TableRow>
							<TableHead>Course</TableHead>
							<TableHead>Date</TableHead>
							<TableHead>Start</TableHead>
							<TableHead>End</TableHead>
							<TableHead>Room</TableHead>
							<TableHead></TableHead>
						</TableRow></TableHeader>
						<TableBody>
							{rows.map((row, i) => (
								<TableRow key={row.course_offering_id}>
									<TableCell className="text-xs">{row.course_code} - {row.course_name}</TableCell>
									<TableCell><Input type="date" value={row.exam_date || ''} onChange={e => setRows(r => r.map((x, idx) => idx === i ? { ...x, exam_date: e.target.value } : x))} className="h-8 text-xs" /></TableCell>
									<TableCell><Input type="time" value={row.start_time || ''} onChange={e => setRows(r => r.map((x, idx) => idx === i ? { ...x, start_time: e.target.value } : x))} className="h-8 text-xs w-24" /></TableCell>
									<TableCell><Input type="time" value={row.end_time || ''} onChange={e => setRows(r => r.map((x, idx) => idx === i ? { ...x, end_time: e.target.value } : x))} className="h-8 text-xs w-24" /></TableCell>
									<TableCell><Input value={row.room_name || ''} onChange={e => setRows(r => r.map((x, idx) => idx === i ? { ...x, room_name: e.target.value } : x))} className="h-8 text-xs" placeholder="Room" /></TableCell>
									<TableCell>
										<Button size="sm" variant="outline" disabled={!row.exam_date || saving === row.course_offering_id} onClick={() => saveRow(row)}>
											{saving === row.course_offering_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</DialogContent>
		</Dialog>
	)
}
```

**Step 2: Scope resolver route**

```ts
// app/api/pre-exam/cia-entry-settings/[id]/timetable/scope/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id: settingId } = await params
	const { searchParams } = new URL(request.url)
	const round = Number(searchParams.get('round') || 1)

	const supabase = getSupabaseServer()

	// 1. Load setting scope
	const { data: setting } = await supabase
		.from('cia_entry_settings')
		.select('institutions_id, examination_session_id, program_codes, course_type, regulation_code')
		.eq('id', settingId).single()
	if (!setting) return NextResponse.json([], { status: 404 })

	// 2. Find matching course_offerings for scope
	let query = supabase
		.from('course_offerings')
		.select('id, course_id, courses:course_id(course_code, course_name, course_type), program_code')
		.eq('institutions_id', setting.institutions_id)
		.eq('examination_session_id', setting.examination_session_id)
	if (setting.program_codes?.length) query = query.in('program_code', setting.program_codes)
	if (setting.regulation_code) query = query.eq('regulation_code', setting.regulation_code)

	const { data: offerings } = await query.range(0, 9999)
	let filtered = offerings || []
	if (Array.isArray(setting.course_type) && setting.course_type.length > 0) {
		filtered = filtered.filter((o: any) => setting.course_type.includes(o.courses?.course_type))
	}

	// 3. Join with existing timetable rows for this setting+round
	const { data: existing } = await supabase
		.from('exam_timetables')
		.select('id, course_offering_id, exam_date, start_time, end_time, room_name')
		.eq('cia_setting_id', settingId)
		.eq('cia_round', round)

	const existingMap = new Map((existing || []).map(t => [t.course_offering_id, t]))

	// 4. Build response
	const rows = filtered.map((o: any) => {
		const tt = existingMap.get(o.id)
		return {
			course_offering_id: o.id,
			course_code: o.courses?.course_code || '',
			course_name: o.courses?.course_name || '',
			exam_date: tt?.exam_date,
			start_time: tt?.start_time,
			end_time: tt?.end_time,
			room_name: tt?.room_name,
			existing_timetable_id: tt?.id,
		}
	})
	return NextResponse.json(rows)
}
```

**Step 3: Wire the "Schedule Timetable" button in round card**

```tsx
{featureFlags.ciaRoundsV2 && editingId && (
	<Button
		variant="outline"
		size="sm"
		className="h-7 text-xs"
		onClick={() => setTimetableDialog({ open: true, round: round.round, roundName: round.round_name })}
	>
		<Calendar className="h-3.5 w-3.5 mr-1" /> Schedule Timetable
	</Button>
)}

{/* Outside the map */}
<CIARoundTimetableDialog
	open={timetableDialog.open}
	onClose={() => setTimetableDialog({ ...timetableDialog, open: false })}
	settingId={editingId!}
	round={timetableDialog.round}
	roundName={timetableDialog.roundName}
/>
```

Button shows only when `editingId` is set (can't schedule before setting is saved).

**Step 4: Smoke test**

Create setting → save → re-open → click "Schedule Timetable" on CIA-1 → scoped courses listed → fill dates/times for 2 courses → save rows → reopen dialog → verify rows persisted. Query DB: `select * from exam_timetables where cia_setting_id=...` → 2 rows with `cia_round=1`.

**Step 5: Commit**

```bash
git add components/cia/cia-round-timetable-dialog.tsx app/api/pre-exam/cia-entry-settings/[id]/timetable/scope/ app/(coe)/pre-exam/internal-mark-entry-setting/page.tsx
git commit -m "feat(cia-v2): per-round timetable scheduler dialog"
```

---

## M4 — Fetch Attendance Flow

### Task 4.1: Shared library — `apply-attendance-slabs` + `resolve-conversion-rule`

**Files:**
- Create: `lib/marks/apply-attendance-slabs.ts`
- Create: `lib/marks/resolve-conversion-rule.ts`

**Step 1: `apply-attendance-slabs.ts`**

```ts
import type { AttendanceSlab } from '@/types/mark-conversion-rule'

export function applyAttendanceSlabs(
	attendancePct: number,
	slabs: AttendanceSlab[],
	maxMarks: number
): number {
	const slab = slabs.find(s => attendancePct >= s.min_pct && attendancePct <= s.max_pct)
	if (!slab) return 0
	return Math.round((slab.award_pct / 100) * maxMarks * 100) / 100
}
```

**Step 2: `resolve-conversion-rule.ts`**

```ts
import { getSupabaseServer } from '@/lib/supabase-server'
import type { MarkConversionRule } from '@/types/mark-conversion-rule'

export async function resolveConversionRule(opts: {
	institutions_id: string
	regulation_code: string | null
	session_start: string   // YYYY-MM-DD
}): Promise<MarkConversionRule | null> {
	const { institutions_id, regulation_code, session_start } = opts
	const supabase = getSupabaseServer()

	// 1. Try exact regulation match
	if (regulation_code) {
		const { data } = await supabase
			.from('mark_conversion_rules')
			.select('*')
			.eq('institutions_id', institutions_id)
			.eq('regulation_code', regulation_code)
			.eq('is_active', true)
			.lte('wef_date', session_start)
			.order('wef_date', { ascending: false })
			.limit(1)
			.maybeSingle()
		if (data) return data as MarkConversionRule
	}

	// 2. Fallback to regulation_code IS NULL (catch-all)
	const { data: fallback } = await supabase
		.from('mark_conversion_rules')
		.select('*')
		.eq('institutions_id', institutions_id)
		.is('regulation_code', null)
		.eq('is_active', true)
		.lte('wef_date', session_start)
		.order('wef_date', { ascending: false })
		.limit(1)
		.maybeSingle()

	return (fallback as MarkConversionRule | null) || null
}
```

**Step 3: Smoke test via Node REPL or dev route**

```ts
// Temporary debug route: app/api/debug/resolve-rule/route.ts
import { NextResponse } from 'next/server'
import { resolveConversionRule } from '@/lib/marks/resolve-conversion-rule'
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const rule = await resolveConversionRule({
		institutions_id: searchParams.get('institutions_id')!,
		regulation_code: searchParams.get('regulation_code'),
		session_start: searchParams.get('session_start')!,
	})
	return NextResponse.json(rule)
}
```

Visit `/api/debug/resolve-rule?institutions_id=<id>&regulation_code=CBCS&session_start=2026-03-01` → verify correct rule returned. **Delete this debug route before committing M4.**

**Step 4: Commit**

```bash
git add lib/marks/apply-attendance-slabs.ts lib/marks/resolve-conversion-rule.ts
git commit -m "feat(cia-v2): resolve-conversion-rule + apply-attendance-slabs libs"
```

---

### Task 4.2: MyJKKN attendance client

**Files:**
- Create: `lib/myjkkn-attendance.ts`

**Step 1: Implement paginated fetch**

```ts
interface MyJKKNAttendanceRow {
	learner_id?: string
	register_number?: string
	attendance_pct?: number
	present_count?: number
	total_count?: number
	institution_id?: string
}

const MYJKKN_API = process.env.MYJKKN_API_URL!
const MYJKKN_API_KEY = process.env.MYJKKN_API_KEY!

export async function fetchMyJKKNAttendance(opts: {
	myjkkn_institution_ids: string[]
	from: string
	to: string
}): Promise<Map<string, number>> {
	const { myjkkn_institution_ids, from, to } = opts
	const byRegNo = new Map<string, number>()

	for (const inst of myjkkn_institution_ids) {
		let page = 1
		// Paginated (200 rows/page; cap at 50 pages for safety = 10k learners)
		for (let attempts = 0; attempts < 50; attempts++) {
			const url = `${MYJKKN_API}/attendance?institution_id=${inst}&from=${from}&to=${to}&page=${page}&per_page=200`
			const res = await fetchWithRetry(url)
			if (!res.ok) throw new Error(`MyJKKN attendance fetch failed: ${res.status}`)
			const body = await res.json()
			const rows: MyJKKNAttendanceRow[] = body.data || body || []
			if (rows.length === 0) break

			for (const row of rows) {
				const reg = (row.register_number || '').trim()
				if (!reg) continue
				let pct = row.attendance_pct
				if (pct == null && row.present_count != null && row.total_count) {
					pct = Math.round((row.present_count / row.total_count) * 10000) / 100
				}
				if (pct != null) byRegNo.set(reg, pct)
			}

			if (rows.length < 200) break
			page++
		}
	}
	return byRegNo
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
	for (let i = 0; i < attempts; i++) {
		try {
			const res = await fetch(url, {
				headers: { 'Authorization': `Bearer ${MYJKKN_API_KEY}` },
				signal: AbortSignal.timeout(30_000),
			})
			if (res.ok || res.status < 500) return res
		} catch (e) { /* retry */ }
		await new Promise(r => setTimeout(r, Math.pow(3, i) * 1000))  // 1s, 3s, 9s
	}
	return fetch(url, { headers: { 'Authorization': `Bearer ${MYJKKN_API_KEY}` } })
}
```

**Step 2: Commit**

```bash
git add lib/myjkkn-attendance.ts
git commit -m "feat(cia-v2): paginated MyJKKN attendance client with retry"
```

---

### Task 4.3: Fetch Attendance API route

**Files:**
- Create: `app/api/pre-exam/cia-entry-settings/[id]/fetch-attendance/route.ts`

**Step 1: Implement POST**

```ts
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { resolveConversionRule } from '@/lib/marks/resolve-conversion-rule'
import { applyAttendanceSlabs } from '@/lib/marks/apply-attendance-slabs'
import { fetchMyJKKNAttendance } from '@/lib/myjkkn-attendance'

type Ctx = { params: Promise<{ id: string }> }

// POST { round_number: 1, performed_by: 'user-uuid' }
export async function POST(request: Request, { params }: Ctx) {
	try {
		const { id: settingId } = await params
		const body = await request.json()
		const roundNumber: number = body.round_number
		const performedBy: string | null = body.performed_by || null
		if (!roundNumber) return NextResponse.json({ error: 'round_number is required' }, { status: 400 })

		const supabase = getSupabaseServer()

		// 1. Load setting + round
		const { data: setting, error: setErr } = await supabase
			.from('cia_entry_settings')
			.select('*, institutions_id, institution_code, regulation_code, examination_session_id, program_codes, course_type, cia_rounds, conversion_rule_id')
			.eq('id', settingId)
			.single()
		if (setErr || !setting) return NextResponse.json({ error: 'Setting not found' }, { status: 404 })

		const round = (setting.cia_rounds as any[]).find(r => r.round === roundNumber)
		if (!round) return NextResponse.json({ error: `Round ${roundNumber} not found` }, { status: 404 })
		if (!round.session_from || !round.session_to) {
			return NextResponse.json({ error: 'Round missing session_from / session_to' }, { status: 400 })
		}

		// 2. Resolve conversion rule (round override > setting default > registry)
		let rule = null
		if (round.conversion_rule_id) {
			const { data } = await supabase.from('mark_conversion_rules').select('*').eq('id', round.conversion_rule_id).single()
			rule = data
		} else if (setting.conversion_rule_id) {
			const { data } = await supabase.from('mark_conversion_rules').select('*').eq('id', setting.conversion_rule_id).single()
			rule = data
		} else {
			rule = await resolveConversionRule({
				institutions_id: setting.institutions_id,
				regulation_code: setting.regulation_code,
				session_start: round.session_from,
			})
		}
		if (!rule) {
			return NextResponse.json({
				error: `No conversion rule effective on ${round.session_from}. Create one at /pre-exam/mark-conversion-rules.`
			}, { status: 400 })
		}
		if (!Array.isArray(rule.attendance_slabs) || rule.attendance_slabs.length === 0) {
			return NextResponse.json({ error: 'Resolved rule has no attendance_slabs defined.' }, { status: 400 })
		}

		// 3. Find attendance component max_marks in round
		const attendanceComp = (round.components || []).find((c: any) => c.code === 'attendance')
		if (!attendanceComp) {
			return NextResponse.json({ error: 'Round has no Attendance component' }, { status: 400 })
		}
		const maxMarks = attendanceComp.max_marks || 0

		// 4. Load myjkkn_institution_ids
		const { data: inst } = await supabase
			.from('institutions').select('myjkkn_institution_ids').eq('id', setting.institutions_id).single()
		const myjkknIds: string[] = inst?.myjkkn_institution_ids || []
		if (myjkknIds.length === 0) {
			return NextResponse.json({ error: 'Institution has no MyJKKN institution IDs configured' }, { status: 400 })
		}

		// 5. Fetch MyJKKN attendance
		let attendanceByRegNo: Map<string, number>
		try {
			attendanceByRegNo = await fetchMyJKKNAttendance({
				myjkkn_institution_ids: myjkknIds,
				from: round.session_from, to: round.session_to,
			})
		} catch (e) {
			console.error('MyJKKN fetch failed:', e)
			return NextResponse.json({ error: 'Attendance service unavailable, try again' }, { status: 503 })
		}

		// 6. Load exam_registrations for scope
		let regQ = supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, course_offering_id, program_id, program_code, institutions_id, examination_session_id')
			.eq('institutions_id', setting.institutions_id)
			.eq('examination_session_id', setting.examination_session_id)
		if (setting.program_codes?.length) regQ = regQ.in('program_code', setting.program_codes)
		const { data: registrations } = await regQ.range(0, 19999)
		if (!registrations?.length) {
			return NextResponse.json({ error: 'No registrations found for this setting' }, { status: 400 })
		}

		// 7. Build rule snapshot (frozen copy)
		const ruleSnapshot = JSON.parse(JSON.stringify(rule))

		// 8. Upsert internal_marks rows (component='attendance' — using existing attendance_marks column)
		let fetched = 0
		let belowThreshold = 0
		const missing: string[] = []
		const thresholdPct = 75   // below 75% = below threshold (informational)

		for (const reg of registrations) {
			const pct = attendanceByRegNo.get((reg.stu_register_no || '').trim())
			if (pct == null) {
				missing.push(reg.stu_register_no || reg.id)
				continue
			}
			const convertedMarks = applyAttendanceSlabs(pct, rule.attendance_slabs, maxMarks)
			if (pct < thresholdPct) belowThreshold++

			// Find existing row for this registration + course_offering
			const { data: existing } = await supabase
				.from('internal_marks')
				.select('id, attendance_marks, raw_attendance_pct')
				.eq('exam_registration_id', reg.id)
				.eq('course_offering_id', reg.course_offering_id)
				.eq('cia_setting_id', settingId)
				.eq('cia_round', roundNumber)
				.maybeSingle()

			const beforeValue = existing ? { attendance_marks: existing.attendance_marks, raw_attendance_pct: existing.raw_attendance_pct } : null
			const payload = {
				attendance_marks: Math.round(convertedMarks),   // INT column
				max_attendance_marks: maxMarks,
				raw_attendance_pct: pct,
				rule_snapshot: ruleSnapshot,
				rule_snapshot_id: rule.id,
				cia_setting_id: settingId,
				cia_round: roundNumber,
				cia_round_name: round.round_name,
				fetched_at: new Date().toISOString(),
			}

			if (existing) {
				await supabase.from('internal_marks').update(payload).eq('id', existing.id)
			} else {
				await supabase.from('internal_marks').insert({
					institutions_id: setting.institutions_id,
					examination_session_id: setting.examination_session_id,
					exam_registration_id: reg.id,
					course_offering_id: reg.course_offering_id,
					program_id: reg.program_id,
					student_id: reg.student_id,
					course_id: null,   // filled by trigger or ignored
					total_internal_marks: Math.round(convertedMarks),
					max_internal_marks: maxMarks,
					submission_date: new Date().toISOString().slice(0, 10),
					...payload,
				})
			}

			// Audit
			await supabase.from('internal_marks_audit').insert({
				internal_mark_id: existing?.id || null,
				cia_setting_id: settingId, cia_round: roundNumber,
				action: existing ? 'fetch' : 'insert',
				before_value: beforeValue, after_value: payload,
				rule_snapshot_id: rule.id,
				performed_by: performedBy,
			})

			fetched++
		}

		// Audit fetch-run summary row
		await supabase.from('internal_marks_audit').insert({
			internal_mark_id: null,
			cia_setting_id: settingId, cia_round: roundNumber,
			action: 'fetch-run',
			extra: { fetched, below_threshold: belowThreshold, missing_count: missing.length, missing_sample: missing.slice(0, 10) },
			rule_snapshot_id: rule.id,
			performed_by: performedBy,
		})

		return NextResponse.json({
			success: true,
			fetched, below_threshold: belowThreshold, missing_count: missing.length,
			missing_sample: missing.slice(0, 10),
		})
	} catch (e) {
		console.error('Fetch-attendance error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
```

**Step 2: Smoke test**

Seed a rule; create a setting + CIA-1 with session_from/to and attendance component (max=5); run:

```bash
curl -X POST http://localhost:3000/api/pre-exam/cia-entry-settings/<id>/fetch-attendance \
  -H 'Content-Type: application/json' \
  -d '{"round_number":1,"performed_by":"<user-uuid>"}'
# Expected: { success:true, fetched: N, below_threshold: M, missing_count: K }
```

Then query: `select id, attendance_marks, raw_attendance_pct, rule_snapshot_id from internal_marks where cia_setting_id=...` — N rows with values.

**Step 3: Commit**

```bash
git add app/api/pre-exam/cia-entry-settings/[id]/fetch-attendance/
git commit -m "feat(cia-v2): fetch-attendance endpoint with retry + snapshot + audit"
```

---

### Task 4.4: "Fetch Attendance" button in sheet

**Files:**
- Modify: `app/(coe)/pre-exam/internal-mark-entry-setting/page.tsx`

**Step 1: Button + handler**

```tsx
const [fetching, setFetching] = useState<number | null>(null)

const handleFetchAttendance = async (roundNumber: number) => {
	if (!editingId) return
	setFetching(roundNumber)
	try {
		const res = await fetch(`/api/pre-exam/cia-entry-settings/${editingId}/fetch-attendance`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ round_number: roundNumber, performed_by: user?.id }),
		})
		const data = await res.json()
		if (res.ok) {
			toast({
				title: '✅ Attendance fetched',
				description: `${data.fetched} learners • ${data.below_threshold} below 75% • ${data.missing_count} missing`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} else {
			toast({ title: '❌ Fetch failed', description: data.error, variant: 'destructive' })
		}
	} catch {
		toast({ title: '❌ Network error', variant: 'destructive' })
	} finally {
		setFetching(null)
	}
}
```

Button in round card (near Schedule Timetable, gated by feature flag + editing + attendance component present + session_from/to set):

```tsx
{featureFlags.ciaRoundsV2 && editingId && round.components.some(c => c.code === 'attendance') && round.session_from && round.session_to && (
	<Button size="sm" variant="outline" className="h-7 text-xs"
			disabled={fetching === round.round}
			onClick={() => handleFetchAttendance(round.round)}>
		{fetching === round.round ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
		Fetch Attendance
	</Button>
)}
```

**Step 2: Smoke test** — Full UI flow: create rule → create setting with CIA-1 (attendance comp + session dates) → save → re-open → Fetch Attendance → verify toast counts + DB rows.

**Step 3: Commit**

```bash
git add app/(coe)/pre-exam/internal-mark-entry-setting/page.tsx
git commit -m "feat(cia-v2): Fetch Attendance button per round"
```

---

## M5 — Per-Round-Per-Course Lock + Final CIA Pipeline

### Task 5.1: Shared library — `calculate-cia`

**Files:**
- Create: `lib/marks/calculate-cia.ts`

**Step 1: Implement pure calculation functions**

```ts
import type { MarkConversionRule, RoundRule, FinalRule } from '@/types/mark-conversion-rule'
import { applyAttendanceSlabs } from './apply-attendance-slabs'

export interface ComponentInput {
	code: string
	raw_marks?: number            // for tests/assignments
	raw_attendance_pct?: number   // for attendance
	max_marks: number             // from CIA round config
}

export function calculateRoundMarks(
	roundName: string,
	components: ComponentInput[],
	rule: MarkConversionRule
): { converted: Record<string, number>; round_total: number; capped_at: number } {
	const roundRule = rule.round_rules[roundName]
	if (!roundRule) return { converted: {}, round_total: 0, capped_at: 0 }

	const converted: Record<string, number> = {}
	for (const comp of components) {
		if (!roundRule.components.includes(comp.code)) continue

		if (comp.code === 'attendance' && comp.raw_attendance_pct != null) {
			converted[comp.code] = applyAttendanceSlabs(comp.raw_attendance_pct, rule.attendance_slabs, comp.max_marks)
		} else if (comp.raw_marks != null) {
			const compRule = rule.component_rules[comp.code]
			if (compRule?.raw_out_of && compRule?.converts_to) {
				converted[comp.code] = Math.round((comp.raw_marks / compRule.raw_out_of) * compRule.converts_to * 100) / 100
			} else {
				converted[comp.code] = comp.raw_marks
			}
		}
	}
	const rawTotal = Object.values(converted).reduce((s, v) => s + v, 0)
	const capped = Math.min(rawTotal, roundRule.cap_total)
	return { converted, round_total: rawTotal, capped_at: capped }
}

export interface RoundResult { round_name: string; capped_total: number }

export function calculateFinalInternal(
	roundResults: RoundResult[],
	extras: Record<string, number>,
	rule: FinalRule,
	courseInternalMax: number
): { raw: number; scaled_to_course_max: number } {
	const includeRounds = rule.rounds
	let vals = roundResults
		.filter(r => includeRounds.includes(r.round_name))
		.map(r => r.capped_total)

	let base = 0
	switch (rule.formula) {
		case 'sum':
			base = vals.reduce((s, v) => s + v, 0); break
		case 'average':
			base = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0; break
		case 'best_of': {
			const n = rule.best_of || vals.length
			base = [...vals].sort((a, b) => b - a).slice(0, n).reduce((s, v) => s + v, 0) / Math.min(n, vals.length || 1)
			break
		}
	}

	// Add extras (separate addends)
	for (const extra of rule.extras || []) {
		base += extras[extra.component] ?? 0
	}

	// Scale to course.internal_max_marks (assume rule produces value on a 0-100 scale)
	const scaled = Math.round((base / 100) * courseInternalMax * 100) / 100
	return { raw: Math.round(base * 100) / 100, scaled_to_course_max: scaled }
}
```

**Step 2: Smoke test inline**

Create a throwaway script `scripts/test-calc.ts`:

```ts
import { calculateRoundMarks, calculateFinalInternal } from '../lib/marks/calculate-cia'
const rule: any = {
	attendance_slabs: [{min_pct:95,max_pct:100,award_pct:100},{min_pct:0,max_pct:94.99,award_pct:0}],
	component_rules: { test_1: { raw_out_of: 50, converts_to: 60 } },
	round_rules: { 'CIA-1': { components: ['test_1','attendance'], cap_total: 100 } },
	final_rule: { formula: 'average', rounds: ['CIA-1','CIA-2'], compare_to: 'course.internal_max_marks' },
}
const r = calculateRoundMarks('CIA-1', [
	{ code: 'test_1', raw_marks: 40, max_marks: 60 },
	{ code: 'attendance', raw_attendance_pct: 96, max_marks: 5 },
], rule)
console.log(r)
// Expected: converted={test_1:48, attendance:5}, round_total=53, capped_at=53
```

Run: `npx tsx scripts/test-calc.ts` → inspect output; delete script after verification.

**Step 3: Commit**

```bash
git add lib/marks/calculate-cia.ts
git commit -m "feat(cia-v2): calculate-cia (round + final) pure library"
```

---

### Task 5.2: Lock endpoint per round per course

**Files:**
- Create: `app/api/pre-exam/cia-entry-settings/[id]/lock-round/route.ts`

**Step 1: Implement POST lock / DELETE unlock**

```ts
import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

type Ctx = { params: Promise<{ id: string }> }

// POST { round, course_offering_id, performed_by }
export async function POST(request: Request, { params }: Ctx) {
	const { id: settingId } = await params
	const body = await request.json()
	const { round, course_offering_id, performed_by } = body
	if (!round || !course_offering_id) return NextResponse.json({ error: 'round and course_offering_id required' }, { status: 400 })

	const supabase = getSupabaseServer()
	const { data: rows, error } = await supabase
		.from('internal_marks')
		.update({ is_locked: true, locked_by: performed_by, locked_date: new Date().toISOString().slice(0, 10), marks_status: 'Locked' })
		.eq('cia_setting_id', settingId)
		.eq('cia_round', round)
		.eq('course_offering_id', course_offering_id)
		.select('id')

	if (error) return NextResponse.json({ error: 'Failed to lock' }, { status: 500 })

	// Audit
	for (const r of rows || []) {
		await supabase.from('internal_marks_audit').insert({
			internal_mark_id: r.id, cia_setting_id: settingId, cia_round: round,
			action: 'lock', performed_by: performed_by || null,
		})
	}

	return NextResponse.json({ success: true, locked: rows?.length || 0 })
}

export async function DELETE(request: Request, { params }: Ctx) {
	const { id: settingId } = await params
	const { searchParams } = new URL(request.url)
	const round = Number(searchParams.get('round'))
	const courseOfferingId = searchParams.get('course_offering_id')
	const performedBy = searchParams.get('performed_by')
	if (!round || !courseOfferingId) return NextResponse.json({ error: 'round and course_offering_id required' }, { status: 400 })

	const supabase = getSupabaseServer()
	const { data: rows, error } = await supabase
		.from('internal_marks')
		.update({ is_locked: false, locked_by: null, locked_date: null, marks_status: 'Verified' })
		.eq('cia_setting_id', settingId).eq('cia_round', round).eq('course_offering_id', courseOfferingId)
		.select('id')

	if (error) return NextResponse.json({ error: 'Failed to unlock' }, { status: 500 })
	for (const r of rows || []) {
		await supabase.from('internal_marks_audit').insert({
			internal_mark_id: r.id, cia_setting_id: settingId, cia_round: round,
			action: 'unlock', performed_by: performedBy,
		})
	}
	return NextResponse.json({ success: true, unlocked: rows?.length || 0 })
}
```

**Step 2: Commit**

```bash
git add app/api/pre-exam/cia-entry-settings/[id]/lock-round/
git commit -m "feat(cia-v2): per-round-per-course lock/unlock endpoint"
```

---

### Task 5.3: Integrate `calculate-cia` into final-marks generation

**Files:**
- Modify: `app/api/post-exam/final-marks/**` (find the existing route that computes internal marks for a course)
- Or create a new helper: `lib/marks/compute-final-internal-for-course.ts`

**Step 1: Helper — compute final internal marks for a course+learner**

```ts
// lib/marks/compute-final-internal-for-course.ts
import { getSupabaseServer } from '@/lib/supabase-server'
import { calculateRoundMarks, calculateFinalInternal } from './calculate-cia'
import type { MarkConversionRule } from '@/types/mark-conversion-rule'

export async function computeFinalInternalForCourse(opts: {
	course_offering_id: string
	student_id: string
}): Promise<{ raw: number; scaled: number; snapshotId: string | null } | null> {
	const supabase = getSupabaseServer()

	// Load all rows for this (course_offering, student)
	const { data: rows } = await supabase
		.from('internal_marks')
		.select('*, rule_snapshot, rule_snapshot_id')
		.eq('course_offering_id', opts.course_offering_id)
		.eq('student_id', opts.student_id)
		.not('cia_setting_id', 'is', null)

	if (!rows?.length) return null

	// Use the newest rule_snapshot (assume all rounds share one rule per setting — typical case)
	const snapshotRow = rows.find(r => r.rule_snapshot) || rows[0]
	const rule: MarkConversionRule = snapshotRow.rule_snapshot as any
	if (!rule) return null

	// Bucket component marks per round
	const byRound = new Map<string, any>()
	for (const r of rows) {
		byRound.set(r.cia_round_name, r)
	}

	const roundResults = Array.from(byRound.entries()).map(([name, r]) => {
		const components = [
			{ code: 'test_1', raw_marks: r.test_1_mark, max_marks: r.max_test_1_mark || 0 },
			{ code: 'test_2', raw_marks: r.test_2_mark, max_marks: r.max_test_2_mark || 0 },
			{ code: 'test_3', raw_marks: r.test_3_mark, max_marks: r.max_test_3_mark || 0 },
			{ code: 'assignment', raw_marks: r.assignment_marks, max_marks: r.max_assignment_marks || 0 },
			{ code: 'quiz', raw_marks: r.quiz_marks, max_marks: r.max_quiz_marks || 0 },
			{ code: 'attendance', raw_attendance_pct: r.raw_attendance_pct, max_marks: r.max_attendance_marks || 0 },
			// ... other components similarly
		]
		const res = calculateRoundMarks(name, components, rule)
		return { round_name: name, capped_total: res.capped_at }
	})

	// Course internal max from courses table
	const { data: co } = await supabase
		.from('course_offerings').select('course_id, courses:course_id(internal_max_marks)')
		.eq('id', opts.course_offering_id).single()
	const courseMax = (co?.courses as any)?.internal_max_marks || 100

	const extras: Record<string, number> = {}   // populate if final_rule.extras defined
	const final = calculateFinalInternal(roundResults, extras, rule.final_rule, courseMax)
	return { raw: final.raw, scaled: final.scaled_to_course_max, snapshotId: snapshotRow.rule_snapshot_id }
}
```

**Step 2: Call from existing final-marks generation**

Inside whichever route currently reads `internal_marks` into `final_marks.internal_marks`, route CIA-v2 rows through this helper. Non-v2 rows (no `cia_setting_id`) continue using the existing sum logic.

Locate the current aggregator (likely `app/api/post-exam/final-marks-generation/route.ts` or similar); modify to check `rows.some(r => r.cia_setting_id)` and branch:

```ts
if (row.cia_setting_id) {
	const result = await computeFinalInternalForCourse({ course_offering_id, student_id })
	if (result) {
		finalInternal = result.scaled
		internal_rule_snapshot_id = result.snapshotId
	}
} else {
	// existing legacy path unchanged
}
```

**Step 3: Smoke test**

Seed full CIA setting with 2 rounds + attendance fetched + manual test marks entered → run final-marks generation → inspect `final_marks.internal_marks` value matches hand-calculation.

**Step 4: Commit**

```bash
git add lib/marks/compute-final-internal-for-course.ts app/api/post-exam/
git commit -m "feat(cia-v2): route CIA v2 rows through rule-based final calculator"
```

---

## M6 — Housekeeping + Audit Viewer

### Task 6.1: Filter CIA rows out of main-exam timetable listings

**Files:**
- Modify: `app/api/exam-management/exam-timetables/route.ts` (and any peer routes that list timetables)

**Step 1: Add `WHERE cia_setting_id IS NULL` filter to the default list query**

```ts
// In the GET handler's query builder, before ordering:
query = query.is('cia_setting_id', null)
```

Add an optional `include_cia=true` query param for admin tooling if needed:

```ts
if (searchParams.get('include_cia') !== 'true') {
	query = query.is('cia_setting_id', null)
}
```

**Step 2: Smoke test**

Confirm `/exam-management/exam-timetable*` pages don't show CIA rows. If any other listing page queries `exam_timetables` directly, add the same filter.

**Step 3: Commit**

```bash
git add app/api/exam-management/exam-timetables/
git commit -m "chore(cia-v2): hide CIA rows from main-exam timetable listings"
```

---

### Task 6.2: Audit viewer page `/post-exam/internal-marks-audit`

**Files:**
- Create: `app/api/post-exam/internal-marks-audit/route.ts`
- Create: `app/(coe)/post-exam/internal-marks-audit/page.tsx`

**Step 1: API — paginated list with filters**

```ts
// GET ?institutions_id=..&cia_setting_id=..&action=..&from=..&to=..&page=1&per_page=50
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const supabase = getSupabaseServer()
	let query = supabase.from('internal_marks_audit').select('*', { count: 'exact' }).order('performed_at', { ascending: false })

	if (searchParams.get('cia_setting_id')) query = query.eq('cia_setting_id', searchParams.get('cia_setting_id')!)
	if (searchParams.get('action')) query = query.eq('action', searchParams.get('action')!)
	if (searchParams.get('from')) query = query.gte('performed_at', searchParams.get('from')!)
	if (searchParams.get('to'))   query = query.lte('performed_at', searchParams.get('to')!)

	const page = Math.max(1, Number(searchParams.get('page') || 1))
	const perPage = Math.min(200, Number(searchParams.get('per_page') || 50))
	const start = (page - 1) * perPage
	const { data, error, count } = await query.range(start, start + perPage - 1)
	if (error) return NextResponse.json({ error: 'Failed to fetch audit' }, { status: 500 })
	return NextResponse.json({ data: data || [], count: count || 0, page, per_page: perPage })
}
```

**Step 2: Page — read-only table with filters + JSON viewer drawer**

Standard CRUD-less page: scorecards (total events, fetch-runs, locks, unlocks), filters (setting, action, date range), table with action, setting, round, performed_at, performed_by, expandable row showing `before_value`/`after_value`/`extra` as pretty JSON.

**Step 3: Commit**

```bash
git add app/api/post-exam/internal-marks-audit/ app/(coe)/post-exam/internal-marks-audit/
git commit -m "feat(cia-v2): audit viewer page for internal marks"
```

---

## Smoke Test Checklist (pre-merge, per milestone)

### After M1
- [ ] All 4 migrations apply without error on a fresh Supabase restore
- [ ] `\d internal_marks` shows `rule_snapshot`, `cia_setting_id`, `cia_round`, `raw_attendance_pct`, `fetched_at`
- [ ] `internal_marks_audit` INSERT works; UPDATE raises exception
- [ ] `exam_timetables.check_cia_consistency` rejects `cia_setting_id='x'` with `cia_round=NULL`

### After M2
- [ ] `/pre-exam/mark-conversion-rules` loads; scorecards render
- [ ] Super-admin (All) sees institution dropdown; normal user doesn't
- [ ] Create rule with past `wef_date` → API rejects with 400
- [ ] Create rule with duplicate `(institution, regulation, wef_date)` → 400
- [ ] Create rule with overlapping slabs → 400
- [ ] Edit rule → persists
- [ ] Delete referenced rule → soft-deletes (`is_active=false`)
- [ ] RBAC: faculty can read but not create

### After M3
- [ ] `ENABLE_CIA_ROUNDS_V2=false` → no new UI fields visible
- [ ] `=true` → Session From/To + Conversion Rule dropdown appears per round
- [ ] Save setting → `cia_rounds` JSONB contains `session_from`, `session_to`, `conversion_rule_id` keys
- [ ] Schedule Timetable dialog: lists all courses in scope
- [ ] Save timetable row → `exam_timetables` row created with `cia_setting_id` + `cia_round` set
- [ ] Reopen dialog → pre-filled values
- [ ] Main-exam timetable page unchanged (rows with `cia_setting_id` hidden)

### After M4
- [ ] Fetch Attendance without attendance component → button not shown
- [ ] Fetch Attendance with missing session dates → button not shown
- [ ] Fetch Attendance, no matching rule → 400 with clear message
- [ ] Fetch Attendance, rule found → N learners fetched, toast shows counts
- [ ] Re-run fetch → overwrites existing rows idempotently; new audit row per run
- [ ] `internal_marks.rule_snapshot` contains frozen JSONB copy
- [ ] MyJKKN API down → retries 3×, 503 response, no partial writes

### After M5
- [ ] Lock CIA-1 for one course → `internal_marks` rows updated, marks_status=Locked
- [ ] Unlock → reverts to Verified
- [ ] Final marks generation for a CIA v2 course uses `calculate-cia` result
- [ ] Final marks generation for legacy CIA session unchanged
- [ ] Mid-rule edit does NOT change historical final marks (snapshot stable)

### After M6
- [ ] `/exam-management/exam-timetable*` shows no CIA rows
- [ ] `?include_cia=true` query param brings them back
- [ ] `/post-exam/internal-marks-audit` page loads; filters work; JSON drawer opens

---

## Backward-Compatibility Guarantees

1. **Legacy CIA exam-session data** — untouched; read paths continue to work; no migration run against legacy rows.
2. **Main-exam pipeline** — all new columns nullable; existing inserts succeed without referencing them; M6 filter ensures main-exam UIs ignore CIA rows.
3. **Existing internal-mark-entry pages** — unchanged; they already handle rounds.
4. **Existing internal-mark-report exports** — unchanged; read from `internal_marks` with same schema.
5. **Rule edits** — never retroactively change historical marks (frozen `rule_snapshot`).
6. **Feature flag** — all M3–M5 UI is gated; production rollout is reversible by unsetting `ENABLE_CIA_ROUNDS_V2`.

---

## Done Definition

- All 6 milestones merged
- All smoke-test checklists signed off
- `NEXT_PUBLIC_ENABLE_CIA_ROUNDS_V2=true` set in production env
- At least one real conversion rule seeded per active institution
- At least one real CIA setting in production using v2 rounds with one successful `fetch-attendance` run
- No regression reports on `/exam-management/exam-timetable*` for 1 week
