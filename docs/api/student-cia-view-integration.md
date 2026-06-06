# Student CIA View — MyJKKN Integration Reference

`GET /api/v1/student-cia-view`

A single, purpose-built endpoint that returns a learner's **entire internal
assessment (CIA) view, grouped by exam session**, in **one call** — every session
the learner sat, that session's CIA round/component **configuration**, and the
learner's **component marks per course per round** (regular **and** arrear papers).

It replaces the **40+** separate `/api/v1/*` calls the MyJKKN "Internal Marks" tab
made per student:

```
examination-sessions (1)
+ registrations per session (~15)
+ cia-settings (per session × program)
+ cia-marks/report PER course PER round   (e.g. 8 courses × 3 rounds = 24)
≈ 40+ calls / student
```

On a shared, per-key rate-limited API that fan-out triggered `429` storms on load.
This endpoint collapses it to **one call per student** — the same fix already
shipped for results via [`/student-result-view`](./student-result-view-integration.md).

- **Base host:** `https://coe.jkkn.ai`
- **Permission required:** `cia-report:read` (the same grant the old `/cia-marks/report` call used — no new permission to provision)
- **Auth:** `X-API-Key-Id` + `X-API-Secret` headers (see [Public API Reference](./COE-PUBLIC-API-REFERENCE.md#authentication))

---

## 1. The grouping model (read this first)

The response is organised **by exam session** — one entry per session the learner
sat. Each session is a **tab**, and identical to the result-view model:

- A session tab is **labelled by the semester of its `is_regular = true` papers**.
- A tab contains **every paper sat in that session**: the regular semester papers
  **plus any arrear (re-appear) papers** taken in the same session.
- Each course row carries **its own** `semester_code` / `semester_index` and an
  `is_regular` flag — so an arrear shows *its* original semester even though it
  lives in a later session's tab.

Within a session, two things sit side by side:

- **`settings[]`** — the session's CIA **configuration**: the rounds (CIA-1,
  CIA-2, …) and the components in each round (Assignment, Mid Term, …) with their
  `max_marks`. This is what to render column headers / round tabs from.
- **`courses[]`** — each course the learner registered for, and for each course a
  **`rounds[]`** array carrying **the learner's actual marks** per component per
  round, the round `total`, the `max_total`, and a `marks_status`.

> Unlike results, **there is no publish/visibility gate**. Internal marks are an
> in-progress working surface, so a session's rounds + components are always
> returned with whatever the learner has scored so far (`null` where not entered).

---

## 2. Why switch

| Before (per student page load) | After |
|---|---|
| `examination-sessions` (1) | — |
| `registrations` × N sessions (~15) | — |
| `cia-settings` (per session × program) | — |
| `cia-marks/report` × course × round (~24) | — |
| **≈ 40+ calls / student** | **1 call / student** |

All MyJKKN learners share one API key and COE rate-limits per key. The old
fan-out blew the shared limit on load → `429`. One call per student stays well
under the limit, and the response is served from a precomputed cache.

---

## 3. Request

```http
GET /api/v1/student-cia-view?register_number=24JPGMAT001&institution_id=<uuid> HTTP/1.1
Host: coe.jkkn.ai
X-API-Key-Id: ak_live_xxxxxxxx
X-API-Secret: sk_live_xxxxxxxxxxxxxxxx
```

### Query parameters

| Param | Type | Required | Notes |
|---|---|---|---|
| `student_id` | UUID | one of these | The learner's COE student UUID. |
| `register_number` | string | one of these | The learner's register number (e.g. `24JPGMAT001`). **Provide exactly one** of `student_id` / `register_number`. |
| `institution_id` | UUID | conditional | **Required for global keys.** Auto-applied for a single-institution key; disambiguates a multi-institution key. |
| `examination_session_id` | UUID | optional | Omit to get **all** sessions. Provide to return only that one session's tab. |

### Institution scoping rules

- **Global key**: `institution_id` is **required** → `400` if missing.
- **Single-institution key**: auto-applied; if you pass one it must match → `403` otherwise.
- **Multi-institution key**: pass `institution_id` (must be in the key's allow-list), or it falls back to the key's default; ambiguous → `400`.

A learner is only ever resolved **within** the scoped institution, and the marks
query is filtered to **that one learner** — you can never read another
institution's, or another student's, marks.

---

## 4. Response `200`

```jsonc
{
  "student": {
    "student_id": "…uuid…",
    "register_number": "24JPGMAT001",
    "student_name": "HARSHINI PRIYA K",
    "program_code": "PMA",
    "grade_system_code": "PG"
  },
  "sessions": [
    {
      "examination_session_id": "…uuid…",
      "session_code": "APR-MAY-2026",
      "session_name": "April-May 2026",
      "session_status": "In Progress",
      "semester_code": "PMA-4",
      "semester_label": "Semester 4",
      "semester_index": 4,

      // ── The session's CIA configuration (render headers / round tabs from this) ──
      "settings": [
        {
          "setting_id": "…uuid…",
          "setting_name": "PG Theory CIA",
          "rounds": [
            {
              "round": 1,
              "round_name": "CIA-1",
              "components": [
                { "code": "assignment", "name": "Assignment", "max_marks": 10 },
                { "code": "mid_term",   "name": "Mid Term",   "max_marks": 20 }
              ]
            },
            {
              "round": 2,
              "round_name": "CIA-2",
              "components": [
                { "code": "assignment", "name": "Assignment", "max_marks": 10 },
                { "code": "mid_term",   "name": "Mid Term",   "max_marks": 20 }
              ]
            }
          ]
        }
      ],

      // ── The learner's marks, one entry per registered course ──
      "courses": [
        {
          "course_code": "24PMAC11",
          "course_name": "CORE-XI-FUNCTIONAL ANALYSIS",
          "course_order": 1,
          "internal_max_mark": 25,
          "is_regular": true,
          "semester_code": "PMA-4",
          "semester_index": 4,
          "rounds": [
            {
              "round": 1,
              "round_name": "CIA-1",
              "marks": { "assignment": 8, "mid_term": 18 },   // component code → mark
              "total": 26,
              "max_total": 30,
              "marks_status": "Submitted",
              "has_entries": true
            },
            {
              "round": 2,
              "round_name": "CIA-2",
              "marks": { "assignment": null, "mid_term": null }, // not entered yet
              "total": null,
              "max_total": 30,
              "marks_status": null,
              "has_entries": false
            }
          ]
        },
        // … the other regular Sem-4 papers …
        {
          "course_code": "24PMAC08",
          "course_name": "CORE-VIII-PROBABILITY THEORY",
          "course_order": 8,
          "internal_max_mark": 25,
          "is_regular": false,                  // ← ARREAR (Sem-3 re-appear, sat this session)
          "semester_code": "PMA-3",
          "semester_index": 3,
          "rounds": [ /* … */ ]
        }
      ]
    }
    // … earlier sessions (Sem 3, Sem 2, Sem 1) follow, each its own tab …
  ]
}
```

> Values illustrative. A component **not yet entered** is `null`; a round with **no
> entries at all** has `has_entries: false`, `total: null`, `marks_status: null`.

### `student`

| Field | Type | Notes |
|---|---|---|
| `student_id` | UUID \| null | |
| `register_number` | string \| null | |
| `student_name` | string \| null | |
| `program_code` | string \| null | e.g. `PMA`. |
| `grade_system_code` | `"UG"` \| `"PG"` | Derived from the program code (display parity with the result view). |

### `sessions[]` — one tab per exam session

| Field | Type | Notes |
|---|---|---|
| `examination_session_id` | UUID \| null | |
| `session_code` | string \| null | e.g. `APR-MAY-2026`. |
| `session_name` | string \| null | |
| `session_status` | string \| null | e.g. `In Progress`. |
| `semester_code` | string \| null | **Tab label semester** — from the session's *regular* papers. |
| `semester_label` | string | `Semester N` (use as the tab title); falls back to the code or `"CIA"`. |
| `semester_index` | number | Numeric semester of the regular papers; tabs ordered ascending. |
| `settings[]` | array | The session's CIA round/component config (see below). |
| `courses[]` | array | Regular papers first, then arrears (each by its semester, then `course_order`). |

### `settings[]` — the session's CIA configuration

| Field | Type | Notes |
|---|---|---|
| `setting_id` | UUID | The `cia_entry_settings` row. |
| `setting_name` | string \| null | e.g. `PG Theory CIA`. A session can have several (e.g. Theory vs Lab). |
| `rounds[]` | array | One per configured CIA round. |
| `rounds[].round` | number | Round number (1, 2, 3…). |
| `rounds[].round_name` | string | e.g. `CIA-1`. |
| `rounds[].components[]` | array | The assessment components in that round. |
| `components[].code` | string | e.g. `assignment`, `mid_term`, `quiz`, or an end-user-defined code (e.g. `ai_tools`). |
| `components[].name` | string | Display label, e.g. `Mid Term`. |
| `components[].max_marks` | number \| null | Max for that component. |

> Use `settings[]` to lay out the grid — round tabs/columns and component headers —
> then fill cells from each course's `rounds[].marks` keyed by `components[].code`.

### `courses[]`

| Field | Type | Notes |
|---|---|---|
| `course_code` | string \| null | |
| `course_name` | string \| null | |
| `course_order` | number \| null | From `course_mapping`. |
| `internal_max_mark` | number \| null | The course's total internal ceiling (from `courses`). |
| `is_regular` | boolean \| null | **`false` = arrear / re-appear.** Show a badge; it belongs to an earlier semester. |
| `semester_code` | string \| null | The course's **own** semester (for arrears, earlier than the tab). |
| `semester_index` | number \| null | Numeric form of the above. |
| `rounds[]` | array | The learner's marks per round for this course (see below). |

### `courses[].rounds[]` — the learner's marks per round

| Field | Type | Notes |
|---|---|---|
| `round` | number | Matches a `settings[].rounds[].round`. |
| `round_name` | string | e.g. `CIA-1`. |
| `marks` | object | **Component code → mark.** Value is `null` for a component not yet entered. Keys match the round's `components[].code`. |
| `total` | number \| null | The round total (the stored, server-computed sum). `null` when nothing is entered. |
| `max_total` | number \| null | Sum of the round's component `max_marks`. |
| `marks_status` | string \| null | `Draft` / `Submitted` / `Approved` / `Verified` / `Locked` / `Rejected`; `null` when no entry. |
| `has_entries` | boolean | `false` = no `cia_marks` row for this course+round yet. |

> **Render rule:** iterate the session's `settings[].rounds[].components[]` for the
> column layout; for each `course`, read `course.rounds[r].marks[componentCode]` —
> show a blank cell when it's `null` / `has_entries` is `false`.

---

## 5. Caching

Served from a precomputed per-learner cache (`student_cia_view_cache`), invalidated
whenever that learner's CIA marks are synced — so reads are a single indexed lookup.

| Header | Value |
|---|---|
| `Cache-Control` | `private, max-age=30, stale-while-revalidate=120` |

One fetch per learner page view is enough — reuse for ~30s.

---

## 6. Rate limiting

Per access key, per minute (`X-RateLimit-Limit` / `X-RateLimit-Remaining` on every
response). The MyJKKN key's ceiling can be raised and per-institution keys issued,
so one college's spike can't starve others. On `429`, honour `Retry-After`.

---

## 7. Errors

Standard envelope (`{ error, code, request_id }`):

| Status | When |
|---|---|
| `400` | Neither/both of `student_id` & `register_number`; or `institution_id` required/ambiguous. |
| `401` | Missing/invalid credentials. |
| `403` | `institution_id` not permitted for the key. |
| `404` | Learner not found in the scoped institution. |
| `429` | Rate limit exceeded. |
| `500` | Internal error (quote `request_id` to COE support). |

---

## 8. TypeScript types (client side)

```ts
export interface StudentCiaView {
  student: {
    student_id: string | null
    register_number: string | null
    student_name: string | null
    program_code: string | null
    grade_system_code: 'UG' | 'PG'
  }
  sessions: Array<{
    examination_session_id: string | null
    session_code: string | null
    session_name: string | null
    session_status: string | null
    semester_code: string | null      // tab label semester (regular papers)
    semester_label: string            // "Semester N"
    semester_index: number
    settings: Array<{
      setting_id: string
      setting_name: string | null
      rounds: Array<{
        round: number
        round_name: string
        components: Array<{
          code: string
          name: string
          max_marks: number | null
        }>
      }>
    }>
    courses: Array<{
      course_code: string | null
      course_name: string | null
      course_order: number | null
      internal_max_mark: number | null
      is_regular: boolean | null        // false = arrear / re-appear
      semester_code: string | null      // the course's OWN semester
      semester_index: number | null
      rounds: Array<{
        round: number
        round_name: string
        marks: Record<string, number | null>  // component code → mark (null if not entered)
        total: number | null
        max_total: number | null
        marks_status: string | null
        has_entries: boolean
      }>
    }>
  }>
}
```

### Example fetch + render sketch

```ts
async function fetchCiaView(registerNumber: string, institutionId: string) {
  const url = new URL('https://coe.jkkn.ai/api/v1/student-cia-view')
  url.searchParams.set('register_number', registerNumber)
  url.searchParams.set('institution_id', institutionId)

  const res = await fetch(url, {
    headers: {
      'X-API-Key-Id': process.env.COE_API_KEY_ID!,
      'X-API-Secret': process.env.COE_API_SECRET!,
    },
  })
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After') ?? '5')
    throw new Error(`Rate limited — retry after ${retry}s`)
  }
  if (!res.ok) throw new Error(`COE CIA view failed: ${res.status}`)
  return (await res.json()) as StudentCiaView
}

// One tab per session; tab title = session.semester_label.
// Lay out the grid from the session's settings:
//   const config = session.settings[0]            // (or merge if multiple)
//   for (const round of config.rounds)            // round tabs / column groups
//     for (const comp of round.components)        // component column headers
// Fill each course row:
//   const r = course.rounds.find(x => x.round === round.round)
//   const cell = r?.marks[comp.code]              // null / undefined → blank cell
//   const rowTotal = r?.total                     // out of r?.max_total
// Split regular vs arrear:
//   const regular = session.courses.filter(c => c.is_regular)
//   const arrears = session.courses.filter(c => c.is_regular === false)
```

---

## 9. Migration map — old calls → this endpoint

| Old MyJKKN call | Replaced by (field in this response) |
|---|---|
| `GET /api/v1/examination-sessions` | `sessions[]` (one per session) + `session_code`/`session_name`/`session_status` |
| `GET /api/v1/registrations` (per session) | `sessions[].courses[]` (regular + arrear) |
| `GET /api/v1/cia-settings` (per session × program) | `sessions[].settings[]` (rounds + components + `max_marks`) |
| `GET /api/v1/cia-marks/report` (per course × round) | `sessions[].courses[].rounds[]` (`marks`, `total`, `max_total`, `marks_status`, `has_entries`) |

Render the page from the single `student-cia-view` payload: **one tab per
`sessions[]` entry**, titled by `semester_label`; lay the round/component grid out
from `settings[]`, and fill the learner's cells from each `courses[].rounds[].marks`.

The legacy `/api/v1/*` CIA endpoints are **unchanged** and remain available for any
other use (e.g. faculty mark-entry, the per-course report) — only the learner's
"Internal Marks" tab should switch.
