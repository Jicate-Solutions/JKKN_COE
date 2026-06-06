# Student Result View — MyJKKN Integration Reference

`GET /api/v1/student-result-view`

A single, purpose-built endpoint that returns a learner's **entire result history,
grouped by exam session**, in **one call** — every session the learner sat, every
course in it (regular **and** arrear), marks, grades, SGPA, and the grade-band
legend.

It replaces the ~20 separate `/api/v1/*` calls the MyJKKN "Semester Result" page
made per student (examination-sessions + registrations-per-session +
course-mapping + courses + results + grade-system). On result-declaration day,
that collapses 300+ students' load from thousands of calls to **one each**.

- **Base host:** `https://coe.jkkn.ai`
- **Permission required:** `results:read` (same grant the old `/results` call used — no new permission to provision)
- **Auth:** `X-API-Key-Id` + `X-API-Secret` headers (see [Public API Reference](./COE-PUBLIC-API-REFERENCE.md#authentication))

---

## 1. The grouping model (read this first)

The response is organised **by exam session** — one entry per session the learner
sat. Each session is a **tab**.

- A session tab is **labelled by the semester of its `is_regular = true` papers**
  (e.g. the April–May-2026 session for an M.Sc final-year student → **"Semester 4"**).
- A tab contains **every paper sat in that session**: the regular semester papers
  **plus any arrear (re-appear) papers** taken in the same session.
- Each course row carries **its own** `semester_code` / `semester_index` and an
  `is_regular` flag — so an arrear shows *its* original semester even though it
  lives in a later session's tab.
- The tab **`summary`** (SGPA, credits, passed) is computed over the **regular**
  papers only — i.e. the tab's own semester scorecard. Arrears are listed but not
  folded into that semester's SGPA.

This mirrors the printed **galley report** exactly: each session lists the
candidate's regular papers and their arrears together, every paper tagged with its
SEM. Example — in the *April–May-2026 (Sem 4)* session, HARSHINI also sat
`24PMAC08` (a Sem-3 re-appear); it appears **inside the Semester-4 tab**, flagged
`is_regular: false`, `semester_index: 3`.

> Why this matters: the old MyJKKN page only fetched the current session's regular
> registrations, so arrear papers vanished. With session grouping, the arrear sits
> in the very session the learner took it — visible, and clearly labelled.

---

## 2. Why switch

| Before (per student page load) | After |
|---|---|
| `examination-sessions` (1) | — |
| `registrations` × N sessions (~15) | — |
| `course-mapping` (per program) | — |
| `courses` (per regulation) | — |
| `results` (1) | — |
| `grade-system` (1) | — |
| **≈ 20 calls / student** | **1 call / student** |

All MyJKKN learners share one API key and COE rate-limits per key. The old
fan-out blew the shared limit on result day → `429`. One call per student stays
well under the limit, and the response is served from a precomputed cache.

---

## 3. Request

```http
GET /api/v1/student-result-view?register_number=24JPGMAT001&institution_id=<uuid> HTTP/1.1
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

A learner is only ever resolved **within** the scoped institution — you can never read another institution's learner.

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
  "grade_system": [
    { "grade": "O",  "grade_point": 9.0, "min_mark": 90, "max_mark": 100, "description": "Outstanding", "qualify": true,  "is_absent": false, "exclude_cgpa": false, "result_status": "Pass" },
    { "grade": "A+", "grade_point": 7.0, "min_mark": 70, "max_mark": 74,  "description": "Very Good",   "qualify": true,  "is_absent": false, "exclude_cgpa": false, "result_status": "Pass" }
    // … one entry per band for the learner's UG/PG system …
  ],
  "sessions": [
    {
      "examination_session_id": "…uuid…",
      "session_code": "APR-MAY-2026",
      "session_name": "April-May 2026",
      "session_status": "Results Declared",
      "result_declaration_date": "2026-06-06T10:00:00.000Z",
      "semester_code": "PMA-4",
      "semester_label": "Semester 4",
      "semester_index": 4,
      "courses": [
        {
          "course_code": "24PMAC11", "course_name": "CORE-XI-FUNCTIONAL ANALYSIS",
          "course_order": 1, "credit": 5,
          "internal_obtained": 22, "internal_max": 25,
          "external_obtained": 51, "external_max": 75,
          "total_obtained": 73,    "total_max": 100, "percentage": 73,
          "letter_grade": "A+", "grade_points": 7.0, "total_grade_points": 35.0,
          "is_pass": true, "pass_status": "Pass", "result_status": "Published", "is_published": true,
          "is_regular": true, "attempt_number": 1,
          "semester_code": "PMA-4", "semester_index": 4, "credit_included": true,
          "examination_session_id": "…uuid…"
        },
        // … the other regular Sem-4 papers …
        {
          "course_code": "24PMAC08", "course_name": "CORE-VIII-PROBABILITY THEORY",
          "course_order": 8, "credit": 4,
          "internal_obtained": 21, "internal_max": 25,
          "external_obtained": 18, "external_max": 75,
          "total_obtained": 39,    "total_max": 100, "percentage": 39,
          "letter_grade": "U", "grade_points": 0.0, "total_grade_points": 0.0,
          "is_pass": false, "pass_status": "Reappear", "result_status": "Published", "is_published": true,
          "is_regular": false, "attempt_number": 2,        // ← ARREAR (Sem-3 re-appear, sat this session)
          "semester_code": "PMA-3", "semester_index": 3, "credit_included": true,
          "examination_session_id": "…uuid…"
        }
      ],
      "summary": { "sgpa": 7.2, "total_credits": 23, "passed": 6, "total": 6 }
      // summary covers the 6 REGULAR Sem-4 papers; the arrear is listed but not counted here
    }
    // … earlier sessions (Sem 3, Sem 2, Sem 1) follow, each its own tab …
  ]
}
```

> Values illustrative. The `24PMAC08` row shows how an **arrear** appears: inside
> the session it was taken (Sem-4 tab) but tagged `is_regular: false` with its own
> `semester_index: 3`.

### `student`

| Field | Type | Notes |
|---|---|---|
| `student_id` | UUID | |
| `register_number` | string | |
| `student_name` | string | |
| `program_code` | string | e.g. `PMA` |
| `grade_system_code` | `"UG"` \| `"PG"` | Derived from the program code (same classification the COE grade engine uses). |

### `grade_system[]` — grade-band legend for this learner's UG/PG system

| Field | Type | Notes |
|---|---|---|
| `grade` | string | e.g. `O`, `A+`, `U`, `AAA` |
| `grade_point` | number | |
| `min_mark`, `max_mark` | number | Band range. |
| `description` | string | e.g. `Outstanding`. |
| `qualify` | boolean \| null | Qualifies for progression. |
| `is_absent` | boolean \| null | Marks the "absent" band; `null` where not defined. |
| `exclude_cgpa` | boolean \| null | Excluded from CGPA. |
| `result_status` | string \| null | e.g. `Pass` / `Re-Appear`. |

Special grades on a course (e.g. `AAA` = Absent, `Credit`, *Highly Commended*) are
returned **as-is** on the course row even if not present in this band list.

### `sessions[]` — one tab per exam session

| Field | Type | Notes |
|---|---|---|
| `examination_session_id` | UUID \| null | |
| `session_code` | string \| null | e.g. `APR-MAY-2026`. |
| `session_name` | string \| null | |
| `session_status` | string \| null | e.g. `Results Declared`. |
| `result_declaration_date` | ISO datetime \| null | When this session's results went live. |
| `semester_code` | string \| null | **Tab label semester** — from the session's *regular* papers. |
| `semester_label` | string | `Semester N` (use as the tab title). |
| `semester_index` | number | Numeric semester of the regular papers; tabs ordered ascending. |
| `courses[]` | array | Regular papers first, then arrears (each by its semester, then `course_order`). |
| `summary` | object | Over the **regular** papers only — see below. |

### `courses[]`

| Field | Type | Notes |
|---|---|---|
| `course_code` | string | |
| `course_name` | string | |
| `course_order` | number | |
| `credit` | number | |
| `internal_obtained` / `internal_max` | number \| null | `null` until declared. |
| `external_obtained` / `external_max` | number \| null | `null` until declared. |
| `total_obtained` / `total_max` | number \| null | `null` until declared. |
| `percentage` | number \| null | |
| `letter_grade` | string \| null | |
| `grade_points` | number \| null | |
| `total_grade_points` | number \| null | `grade_points × credit`. |
| `is_pass` | boolean \| null | |
| `pass_status` | string \| null | `Pass` / `Reappear` / `Absent` / … |
| `result_status` | string \| null | `Published` when visible. |
| `is_published` | boolean | **Always present.** `false` = not yet declared (all result fields above `null`). |
| `is_regular` | boolean \| null | **`false` = arrear / re-appear.** Show a badge; it belongs to an earlier semester. |
| `attempt_number` | number \| null | 1 = first attempt, higher = re-take. |
| `semester_code` | string \| null | The course's **own** semester (for arrears, earlier than the tab). |
| `semester_index` | number \| null | Numeric form of the above. |
| `credit_included` | boolean \| null | `false` = not counted toward SGPA/credits (e.g. some extension/value-added courses). |
| `examination_session_id` | UUID \| null | The session this paper was sat in (= the parent tab). |

### `summary` (per session tab — regular papers only)

| Field | Type | Notes |
|---|---|---|
| `sgpa` | number \| null | Σ(credit × grade_points) ÷ Σ(credit) over **declared, credit-bearing, regular** papers. `null` until anything is declared. |
| `total_credits` | number | Registered credits of the regular papers (`credit_included !== false`). |
| `passed` | number | Regular papers passed (declared). |
| `total` | number | Count of regular papers (the tab's "N subj"). |

> Arrear papers are intentionally **excluded** from `summary` (they belong to other
> semesters). To show "arrears cleared this session", filter `courses` by
> `is_regular === false` yourself.

---

## 5. Visibility gate (no early leaks)

A course's marks are exposed **only** when **both** hold:

1. `final_marks.result_status = 'Published'`, **and**
2. the owning session's `result_declaration_date` is set **and ≤ now**.

Until then the course is **still listed**, but every result field is `null` and
`is_published = false`. This is the identical rule used by `/api/v1/results`.

**Render rule:** check `is_published` per course; if `false`, show "Result
awaited" rather than reading the (null) marks. The gate is applied **per course /
per session**, so an undeclared arrear stays hidden while the declared regular
papers in the same tab show.

---

## 6. Caching

Served from a precomputed per-learner cache (refreshed when results are
published), so reads are a single indexed lookup.

| Header | Value |
|---|---|
| `Cache-Control` | `private, max-age=30, stale-while-revalidate=120` |

One fetch per learner page view is enough — reuse for ~30s.

---

## 7. Rate limiting

Per access key, per minute (`X-RateLimit-Limit` / `X-RateLimit-Remaining` on every
response). The MyJKKN key's ceiling can be raised and per-institution keys issued,
so one college's spike can't starve others. On `429`, honour `Retry-After`.

---

## 8. Errors

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

## 9. TypeScript types (client side)

```ts
export interface StudentResultView {
  student: {
    student_id: string | null
    register_number: string | null
    student_name: string | null
    program_code: string | null
    grade_system_code: 'UG' | 'PG'
  }
  grade_system: Array<{
    grade: string | null
    grade_point: number | null
    min_mark: number | null
    max_mark: number | null
    description: string | null
    qualify: boolean | null
    is_absent: boolean | null
    exclude_cgpa: boolean | null
    result_status: string | null
  }>
  sessions: Array<{
    examination_session_id: string | null
    session_code: string | null
    session_name: string | null
    session_status: string | null
    result_declaration_date: string | null
    semester_code: string | null      // tab label semester (regular papers)
    semester_label: string            // "Semester N"
    semester_index: number
    courses: Array<{
      course_code: string | null
      course_name: string | null
      course_order: number | null
      credit: number | null
      internal_obtained: number | null
      internal_max: number | null
      external_obtained: number | null
      external_max: number | null
      total_obtained: number | null
      total_max: number | null
      percentage: number | null
      letter_grade: string | null
      grade_points: number | null
      total_grade_points: number | null
      is_pass: boolean | null
      pass_status: string | null
      result_status: string | null
      is_published: boolean
      is_regular: boolean | null        // false = arrear / re-appear
      attempt_number: number | null
      semester_code: string | null      // the course's OWN semester
      semester_index: number | null
      credit_included: boolean | null
      examination_session_id: string | null
    }>
    summary: {
      sgpa: number | null
      total_credits: number
      passed: number
      total: number
    }
  }>
}
```

### Example fetch + render sketch

```ts
async function fetchResultView(registerNumber: string, institutionId: string) {
  const url = new URL('https://coe.jkkn.ai/api/v1/student-result-view')
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
  if (!res.ok) throw new Error(`COE result view failed: ${res.status}`)
  return (await res.json()) as StudentResultView
}

// One tab per session; tab title = session.semester_label.
// Within a tab, split regular vs arrear:
//   const regular = session.courses.filter(c => c.is_regular)
//   const arrears = session.courses.filter(c => c.is_regular === false)
// Show summary (regular scorecard) + a "Re-appear papers" sub-section for arrears.
// Per course: if !c.is_published → render "Result awaited" instead of marks.
```

---

## 10. Migration map — old calls → this endpoint

| Old MyJKKN call | Replaced by (field in this response) |
|---|---|
| `GET /api/v1/examination-sessions` | `sessions[]` (one per session) + `session_code`/`session_name`/`session_status`/`result_declaration_date` |
| `GET /api/v1/registrations` (per session) | `sessions[].courses[]` (regular + arrear) |
| `GET /api/v1/course-mapping` | `course_code`, `course_name`, `course_order`, `credit`, `semester_code` |
| `GET /api/v1/courses` | `course_name`, `credit`, `credit_included` |
| `GET /api/v1/results` | per-course marks + `is_published` visibility gate |
| `GET /api/v1/grade-system` | `grade_system[]` |

Render the page from the single `student-result-view` payload: **one tab per
`sessions[]` entry**, titled by `semester_label`, listing `courses[]` with regular
papers and arrears (`is_regular: false`) clearly distinguished, and the per-tab
`summary` as the semester scorecard. Keep the `is_published` visibility check.

The legacy `/api/v1/*` endpoints are unchanged and remain available for any other
use — only the result page should switch.
