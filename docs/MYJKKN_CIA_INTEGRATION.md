# MyJKKN ↔ COE — CIA Integration Reference (May 2026)

This document captures every change made on the COE side that the MyJKKN team
must mirror. Hand this file to the MyJKKN frontend + backend developers.

**Author:** COE  •  **Last updated:** 2026-05-02  •  **Audience:** MyJKKN dev team

---

## 1. What changed in COE (high level)

| Area | Change | Who must mirror |
|---|---|---|
| **CIA settings** — components are now end-user-defined | New components like "AI Tools Usage / Interactive Mode" can be added via the UI without a code change | MyJKKN UI for CIA setting |
| **`cia_marks` schema** | Added `extra_marks JSONB` + `extra_marks_max JSONB` columns | None — COE-only |
| **`/api/v1/cia-marks/sync`** | Now accepts `extra_marks` + `extra_marks_max` fields | MyJKKN sync sender |
| **Mark-entry UI** | Entry/Edit blank by default; View/PDF show `0` for missing | MyJKKN faculty marks-entry |
| **Number-to-words** | Unified to digit-by-digit (`28 → "TWO EIGHT"`, `0 → "ZERO"`) | MyJKKN PDFs |
| **PDF header** | Per-institution name/logo/accreditation/address; no right-side logo | MyJKKN PDFs |
| **PDF "Max Internal Mark"** | Renamed to **"Assessment Mark"**, value = sum of component maxes | MyJKKN PDFs |
| **CIA Entry Setting UI** | Removed the `Max: 50` badge (course internal max). Kept `Total: 100` (sum of components) | MyJKKN setting screen |
| **Entry-window cutoff** | Strict cutoff in IST — Open / Closed status flips the moment IST date reaches `entry_to` | MyJKKN faculty marks-entry |

---

## 2. Schema reference (COE side, read-only for MyJKKN)

### `cia_marks` table

Standard fixed columns are preserved (`assignment_marks`, `quiz_marks`, ...,
`test_3_mark`, `max_internal_marks`, `total_internal_marks`).

New columns (added in [`20260501_add_extra_marks_to_cia_marks.sql`](../supabase/migrations/20260501_add_extra_marks_to_cia_marks.sql)):

| Column | Type | Purpose |
|---|---|---|
| `extra_marks` | JSONB, default `{}` | End-user-defined component scores. Keyed by component code. Example: `{"ai_tools_int_mode": 5}` |
| `extra_marks_max` | JSONB, default `{}` | Mirrors `extra_marks` but holds the max marks. Example: `{"ai_tools_int_mode": 20}` |

**Trigger behavior:** `total_internal_marks` is auto-recalculated to include the
sum of `extra_marks` values whenever any component column or the JSONB itself
changes. The `prevent_locked_cia_marks_modification` trigger now also blocks
edits to `extra_marks` once a row is locked.

### Standard component codes (reserved)

These codes always map to dedicated columns. **Don't reuse them as custom codes.**

```
assignment, quiz, mid_term, presentation, attendance,
lab, project, seminar, viva, other,
test_1, test_2, test_3
```

Any code outside this set is treated as "custom" and stored under
`extra_marks` / `extra_marks_max`.

---

## 3. CIA Settings — supporting end-user components

**Endpoint:** `POST /api/v1/cia-settings`, `PUT /api/v1/cia-settings`

**No payload format changes** — the existing schema already supports arbitrary
component codes. Just stop validating against a hardcoded list and accept any
`{ code, name, max_marks }` triplet inside `cia_rounds[].components[]`.

### Example payload (with custom components)

```json
{
  "institutions_id": "5de4fba1-4564-41ed-8c73-5d948b74b843",
  "examination_session_id": "49a479c8-a637-4905-992e-c54d94b21db5",
  "setting_name": "Continuous Assessment",
  "regulation_code": "R-2021",
  "program_codes": ["CSE", "EEE", "IT", "ECE"],
  "course_type": ["Theory", "Theory + Practical"],
  "use_course_max": false,
  "total_rounds": 1,
  "cia_rounds": [
    {
      "round": 1,
      "round_name": "1",
      "entry_from": "2026-04-27",
      "entry_to": "2026-05-01",
      "session_from": "2026-01-05",
      "session_to": "2026-02-27",
      "components": [
        { "code": "test_1", "name": "Test 1", "max_marks": 60 },
        { "code": "assignment", "name": "Assignment", "max_marks": 20 },
        { "code": "ai_tools_int_mode", "name": "AI Tools Usage/Interactive Mode", "max_marks": 20 }
      ]
    }
  ]
}
```

### MyJKKN UI — "Add Custom Component" (mirror of COE design)

In the round panel, below the standard component checkboxes, render an inline
add form with three fields:

| Field | Validation |
|---|---|
| **Name** (required, free text) | Used as the faculty-facing label |
| **Code** (auto-generated from Name; user can override) | Must match `^[a-z][a-z0-9_]*$`. Auto-generate by lowercasing + replacing non-alphanumerics with `_`. Truncate to 40 chars. |
| **Max** (required, integer ≥ 1 unless "Use course max" is on) | Standard input |

**Rules:**
- Must be unique per round — duplicate code in same round → error toast.
- Don't allow standard codes (the 13 listed above) to be created as custom.
- Codes are immutable identifiers — once marks are saved against a code, do
  not allow editing the code (only the name + max).

**UI sketch:**

```
☐ Test 1     ☐ Test 2
☐ Assignment ☐ Quiz
... built-in 14 components ...

── Custom Components ──
[ AI Tools Usage / Interactive Mode (ai_tools_int_mode) ] [ Max: 20 ] [ ✕ ]

── + Add Custom Component ──
[ Name ........................ ] [ code (auto) ] [ Max ] [ Add ]
Hint: Leave code blank to auto-generate from name. Codes are JSONB keys
on cia_marks.extra_marks.
```

---

## 4. CIA Marks Sync (`POST /api/v1/cia-marks/sync`)

### New optional fields

```json
{
  "records": [
    {
      "institutions_id": "...",
      "examination_session_id": "...",
      "course_offering_id": "...",
      "student_id": "...",
      "exam_registration_id": "...",
      "cia_round": 1,

      "assignment_marks": 18,
      "test_1_mark": 50,

      "extra_marks":      { "ai_tools_int_mode": 16 },
      "extra_marks_max":  { "ai_tools_int_mode": 20 },

      "total_internal_marks": 84,
      "max_internal_marks":   100,

      "submission_date": "2026-05-01",
      "marks_status": "Submitted",
      "created_by": "<logged-in-user-uuid>",
      "submitted_by": "<logged-in-user-uuid>",
      "updated_by": "<logged-in-user-uuid>"
    }
  ]
}
```

### What MyJKKN must do

1. When sending marks, split components into:
   - **Standard codes** (matching the 13 above) → individual fields
     (`assignment_marks`, `test_1_mark`, etc.)
   - **Custom codes** → keys inside `extra_marks` and `extra_marks_max`.
2. Don't drop entries with value `0` — `0` is a valid mark and must round-trip.
3. The `hasAnyMark` check is satisfied if **any** component (fixed or extra) is
   `> 0`, OR `total_internal_marks > 0`.

**Response on partial success:** HTTP 207 with `results` array per record.

---

## 5. UI behavior — Mark Entry table

Three modes faculty toggle through: **Entry** (yellow inputs, initial), **View**
(read-only), **Edit** (green inputs).

| Cell | Entry mode | View mode | Edit mode |
|---|---|---|---|
| Component input | blank until typed | bold blue text, `0` for missing | blank if missing |
| Total cell | blank until any input touched | always shown (incl. `0`) | blank if no entry |
| Marks in Words | blank until any input touched | always shown (incl. `ZERO`) | blank if no entry |

**Trigger for "has entries":** at least one component code key exists in the
form-state object for that learner — typing anything (including `0`) registers
an entry.

**Save filter:** include any learner with at least one component touched, even
if all values are `0`. Don't filter by `> 0`.

**Load from DB:** prefill `0` values back into the form. Treat `null`/`undefined`
as "not entered", treat numeric `0` as "entered as zero".

---

## 6. Entry-window cutoff (Open / Closed status)

The Assessment dropdown on the faculty marks-entry screen labels each round
**Open**, **Closed**, **Upcoming**, or **No-dates** based on whether `today`
falls inside `[entry_from, entry_to)`.

### 6.1 Rule

- **Strict cutoff**: status flips to `Closed` the moment IST `today` reaches
  `entry_to`. The deadline date itself is NOT a submission day.
- `entry_to: 2026-05-01` means "submissions blocked starting 2026-05-01" —
  faculty must finish by end of 2026-04-30 IST.

| `today` (IST) | `entry_from` | `entry_to` | Status |
|---|---|---|---|
| 2026-04-26 | 2026-04-27 | 2026-05-01 | upcoming |
| 2026-04-27 | 2026-04-27 | 2026-05-01 | open |
| 2026-04-30 | 2026-04-27 | 2026-05-01 | open |
| **2026-05-01 00:01 IST** | 2026-04-27 | 2026-05-01 | **expired (Closed)** |
| 2026-05-02 | 2026-04-27 | 2026-05-01 | expired (Closed) |
| (any) | (none set) | (none set) | no-dates *(treat as open)* |

### 6.2 IST date computation

**Critical:** "today" must be computed in **Indian Standard Time** (UTC+5:30),
not the user's machine timezone or UTC. Otherwise faculty in early-morning IST
hours see yesterday's date and stale "open" windows; users abroad see windows
that are off by a day.

Use the runtime's IANA timezone support — no manual offset math:

```ts
// today = "YYYY-MM-DD" string, locked to IST regardless of browser locale
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
```

`'en-CA'` outputs ISO format directly; no parsing, no zero-padding logic.

### 6.3 Status computation (reference implementation)

```ts
type Status = 'open' | 'expired' | 'upcoming' | 'no-dates'

function getRoundStatus(round: { entry_from?: string; entry_to?: string }): Status {
  const from = round.entry_from || ''
  const to   = round.entry_to   || '9999-12-31'
  if (!from) return 'no-dates'

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  if (today < from) return 'upcoming'
  if (today >= to)  return 'expired'   // strict cutoff — see 6.1
  return 'open'
}
```

### 6.4 UI rendering

```
[●] Continuous Assessment - 1   Open       ← selectable, dot in emerald
[○] Continuous Assessment - 2   Closed     ← disabled, line-through, dot in red
[◐] Continuous Assessment - 3   Opens 2026-05-10  ← disabled, dot in amber
```

| Status | Dot color | Selectable | Suffix label |
|---|---|---|---|
| `open` | emerald | ✓ | `Open` |
| `expired` | red | ✗ (disabled, line-through) | `Closed` |
| `upcoming` | amber | ✗ (disabled) | `Opens YYYY-MM-DD` |
| `no-dates` | grey | ✓ | (no suffix) |

### 6.5 Server-side enforcement (recommended)

Even with the UI gate, add a server-side check before persisting marks:

```ts
// In the marks save endpoint
const round = await fetchRoundConfig(setting_id, cia_round)
const today = istToday()  // same helper as above
if (round.entry_from && today < round.entry_from)
  return res.status(403).json({ error: 'Entry window not open yet' })
if (round.entry_to && today >= round.entry_to)
  return res.status(403).json({ error: 'Entry window closed' })
```

Don't trust the client to honor the cutoff — a faculty member with a stale tab
or a hand-crafted POST could otherwise bypass it.

---

## 7. PDF format spec

Apply to **all** mark PDFs (internal mark entry, internal mark report,
practical, foil sheet, consolidated, pending).

### 7.1 Header

```
[INSTITUTION LOGO]    INSTITUTION NAME (UPPERCASE)                [no right logo]
                      (Subtitle, italic)                  ← optional
                      Trust line (italic)                 ← optional
                      Accreditation / affiliation
                      Postal address (bold)
                      SEMESTER EXAMINATION - <session>
                      INTERNAL MARK ENTRY SHEET
                      <Assessment name> — <CIA round name>
```

**Per-institution config** lives in
[`lib/utils/institution-header.ts`](../lib/utils/institution-header.ts) keyed by
`institutions.institution_code`:

```ts
CAS: {
  logo_path: '/jkkncas_logo.png',
  name: 'J.K.K.NATARAJA COLLEGE OF ARTS & SCIENCE (AUTONOMOUS)',
  accreditation: '(Accredited by NAAC, Approved by AICTE, Recognized by UGC Under Section 2(f) & 12(B), Affiliated to Periyar University)',
  address: 'Komarapalayam - 638 183, Namakkal District, Tamil Nadu',
}
CET: {
  logo_path: '/jkkncet_logo.png',
  name: 'J.K.K. NATTRAJA COLLEGE OF ENGINEERING & TECHNOLOGY',
  subtitle: '(An Autonomous Institution)',
  trust_line: 'Managed by J.K.K. Rangammal Charitable Trust',
  accreditation: 'Approved by AICTE & Affiliated to Anna University, Chennai',
  address: 'Natarajapuram, Kumarapalayam – 638 183, Namakkal Dt., Tamil Nadu',
}
```

Adding a new college = adding one entry. **No PDF generator code change needed.**

### 7.2 Course/Program line

```
Program: EEE - B.E. Electrical and Electronics Engineering    Semester: 6
Course:  EE3029 - Testing of Electric Vehicles                Assessment Mark: 100
```

- Right side label is **`Assessment Mark`** (not the old "Max Internal Mark").
- Value = sum of `components[].max_marks` for the round (computed at PDF time;
  no separate DB column needed — `cia_marks.max_internal_marks` already
  carries this in saved rows for back-compat).

### 7.3 Marks table

```
S.No | Reg No | Name | Test 1 (60) | Assignment (20) | AI Tools ... (20) | Total | Marks in Words
  1  | ...001 | ARUN | 2           | 5               | 6                 | 13    | ONE THREE
  ...
 17  | ...311 | PRAB | 0           | 0               | 0                 | 0     | ZERO
 18  | ...312 | PREM | 8           | 5               | 0                 | 13    | ONE THREE
```

**Cell rules:**
- Component value: render `0` (not `-`) when the component key is missing for
  that learner — Option B "every learner has every component".
- Total: always render (including `0`).
- Marks in Words: always render (`ZERO` for `0`, digit-by-digit otherwise).

### 7.4 Footer line

```
Total Learners: 21    Marks Entered: 21    Pending: 0
```

Every learner row counts as entered under Option B — **always** print
`Pending: 0`. Don't compute pending by checking `total > 0`.

### 7.5 Number-to-words specification

Single source of truth:
[`services/post-exam/external-mark-entry-service.ts`](../services/post-exam/external-mark-entry-service.ts).

```ts
export function numberToWords(num: number): string {
  const digitWords = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE',
                     'SIX', 'SEVEN', 'EIGHT', 'NINE']
  const n = Math.floor(Math.abs(num))
  if (n === 0) return num < 0 ? 'MINUS ZERO' : 'ZERO'
  const numStr = n.toString().padStart(2, '0')
  const words = numStr.split('').map(d => digitWords[parseInt(d, 10)]).join(' ')
  return num < 0 ? 'MINUS ' + words : words
}
```

| Input | Output |
|---|---|
| 0 | `ZERO` |
| 5 | `ZERO FIVE` |
| 13 | `ONE THREE` |
| 28 | `TWO EIGHT` |
| 75 | `SEVEN FIVE` |
| 100 | `ONE ZERO ZERO` |
| 550 | `FIVE FIVE ZERO` |

This function applies to **every** mark surface — internal, external, practical,
foil sheet. No more readable-form duplicates.

---

## 8. CIA Setting screen — UI badge changes

Inside the round-summary card on the entry screen:

**Before:**
```
EE3029 - Testing of Electric Vehicles  [Max: 50]  [Total: 100]
```

**After:**
```
EE3029 - Testing of Electric Vehicles  [Total: 100]
```

The course-level "Max: 50" badge (`courses.internal_max_mark`) is removed
because it's not what faculty look at — they care about the **assessment**
total, which is the sum of component maxes for the round.

---

## 9. Migration to apply (COE side — done)

- ✅ `supabase/migrations/20260501_add_extra_marks_to_cia_marks.sql`

**MyJKKN does not need to run this migration** (the `cia_marks` table lives
only in COE). But MyJKKN's sync sender must populate the new fields when
forwarding records.

---

## 10. Testing checklist (MyJKKN integration)

For the MyJKKN team to verify after their changes:

- [ ] CIA setting — add a custom component "Code Review" with code `code_review`, max `5`. Save.
- [ ] In faculty marks-entry UI — verify the new column appears.
- [ ] Type `0` for one learner's Code Review. Save.
- [ ] Sync to COE — verify in COE DB:
  ```sql
  select extra_marks, extra_marks_max from cia_marks
  where exam_registration_id = '<reg-id>' order by created_at desc limit 1;
  ```
  → Should show `{"code_review": 0}` and `{"code_review": 5}`.
- [ ] Reload the MyJKKN faculty UI — that `0` must round-trip back into the form.
- [ ] Download the PDF report — the row must show `... 0 ... ZERO` (not `-`).
- [ ] Header should say `Assessment Mark: <component-sum>`, not "Max Internal Mark".
- [ ] Entry-window cutoff (IST):
   - Set `entry_to: <yesterday in IST>`. Reload — assessment must show **Closed**.
   - Set `entry_to: <today in IST>`. Reload — assessment must show **Closed** (strict cutoff, not Open).
   - Set `entry_to: <tomorrow in IST>`. Reload — assessment must show **Open**.
- [ ] Server-side enforcement: open browser DevTools → submit a marks payload via fetch with a setting whose `entry_to` is in the past. The endpoint must return 403 (don't trust the UI gate alone).

---

## 11. Files of interest in the COE repo (for cross-reference)

| Concern | File |
|---|---|
| `extra_marks` schema | [`supabase/migrations/20260501_add_extra_marks_to_cia_marks.sql`](../supabase/migrations/20260501_add_extra_marks_to_cia_marks.sql) |
| Per-institution PDF header | [`lib/utils/institution-header.ts`](../lib/utils/institution-header.ts) |
| Number-to-words | [`services/post-exam/external-mark-entry-service.ts`](../services/post-exam/external-mark-entry-service.ts) |
| Internal-marks PDF generator | [`lib/utils/generate-internal-marks-pdf.ts`](../lib/utils/generate-internal-marks-pdf.ts) |
| Internal-marks sync API (COE-internal) | [`app/api/pre-exam/internal-mark-entry/route.ts`](../app/api/pre-exam/internal-mark-entry/route.ts) |
| External sync API (used by MyJKKN) | [`app/api/v1/cia-marks/sync/route.ts`](../app/api/v1/cia-marks/sync/route.ts) |
| CIA settings API (used by MyJKKN) | [`app/api/v1/cia-settings/route.ts`](../app/api/v1/cia-settings/route.ts) |
| Faculty marks-entry UI | [`app/(coe)/pre-exam/internal-mark-entry/page.tsx`](../app/(coe)/pre-exam/internal-mark-entry/page.tsx) |
| Mark report UI | [`app/(coe)/pre-exam/internal-mark-report/page.tsx`](../app/(coe)/pre-exam/internal-mark-report/page.tsx) |
| CIA setting UI (custom components) | [`app/(coe)/pre-exam/internal-mark-entry-setting/page.tsx`](../app/(coe)/pre-exam/internal-mark-entry-setting/page.tsx) |

---

## 12. Open questions / future work

- Backfill historical `total_marks_in_words` values that were saved in the old
  digit-by-digit ALL CAPS format (or readable form). Optional cleanup script.
- Per-institution logos for new colleges — drop a `/public/jkkn<code>_logo.png`
  file and add one entry to `institution-header.ts`.

For any clarification on the COE side, ping the COE team with the Git commit
SHAs from May 2026.
