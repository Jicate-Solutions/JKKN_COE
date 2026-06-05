# JKKN COE — Public API Reference

Base path: `/api/v1`

This document covers every endpoint exposed under `/api/v1/*`. These endpoints are the public, key-authenticated surface of the COE platform — intended for consumption by external apps (MyJKKN, child apps, integrations) registered in the **Developer Portal**.

Internal admin/portal routes (under `/api/admin`, `/api/auth`, `/api/master`, `/api/exam-management`, etc.) are session-authenticated and not part of this reference.

---

## Table of Contents

- [Authentication](#authentication)
- [Request / Response Conventions](#request--response-conventions)
- [Errors](#errors)
- [Rate Limiting](#rate-limiting)
- [Endpoints](#endpoints)
  - [Institutions](#institutions)
  - [Boards](#boards)
  - [Examination Sessions](#examination-sessions)
  - [Grade System](#grade-system)
  - [Courses](#courses)
  - [Course Mapping](#course-mapping)
  - [Exam Registrations](#exam-registrations)
  - [Learners](#learners)
  - [Internal Marks](#internal-marks)
  - [Results (Final Marks)](#results-final-marks)
  - [CIA Settings](#cia-settings)
  - [CIA Marks — Sync](#cia-marks--sync)
  - [CIA Marks — Report](#cia-marks--report)
  - [BOS Compositions](#bos-compositions)
  - [BOS Meetings](#bos-meetings)
  - [BOS Experts](#bos-experts)
  - [BOS Reports](#bos-reports)

---

## Authentication

All `/api/v1/*` endpoints require two headers issued through the Developer Portal:

| Header | Value |
|---|---|
| `X-API-Key-Id` | The access key identifier |
| `X-API-Secret` | The secret paired with the access key |

Optional security extensions:

- **Domain allow-list** — requests are rejected if the `Origin` header is not in the key's `allowedDomains`.
- **HMAC request signing** — if the request includes a signature header, it must verify against `X-API-Secret`.
- **Institution scoping** — keys can be restricted to specific institutions. Endpoints automatically filter results to `allowedInstitutionIds`. Requesting a forbidden institution returns `403`.
- **Permissions** — each endpoint requires a permission of the form `<module>:<operation>` (e.g. `courses:read`). The permission grant is configured against the app in the Developer Portal.

Example request:

```http
GET /api/v1/courses?institution_code=CAS HTTP/1.1
Host: coe.jkkn.ai
X-API-Key-Id: ak_live_xxxxxxxx
X-API-Secret: sk_live_xxxxxxxxxxxxxxxx
```

---

## Request / Response Conventions

- All payloads are JSON (`Content-Type: application/json`).
- Identifiers come in two flavours:
  - **Code** — short string (e.g. `institution_code = "CAS"`, `course_code = "BCA101"`). Preferred for inputs from MyJKKN.
  - **UUID** — internal primary key (e.g. `institutions_id`, `course_id`). Required for some endpoints.
- Most collection responses are shaped as `{ data: [...], total: <n> }`. Some legacy endpoints return a bare array. Both shapes are tagged per endpoint below.
- Date/time fields are ISO 8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- Boolean query params are strings: `"true"` / `"false"`.

Every response also carries:

| Header | Purpose |
|---|---|
| `X-Request-Id` | Correlation ID — include in support requests |
| `X-RateLimit-Limit` | Current limit for the access key |
| `X-RateLimit-Remaining` | Remaining requests in the current window |
| `X-Content-Type-Options: nosniff` | Standard hardening |
| `X-Frame-Options: DENY` | Standard hardening |

---

## Errors

All errors return:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_CODE",
  "request_id": "abcd1234..."
}
```

Common status codes:

| Status | Meaning |
|---|---|
| `400` | Validation error — missing or invalid input |
| `401` | Missing or invalid credentials (`MISSING_CREDENTIALS`, `INVALID_SIGNATURE`) |
| `403` | Domain not allowed, permission denied, or institution not allowed |
| `404` | Resource not found |
| `409` | Conflict (duplicate or has dependencies blocking delete) |
| `429` | Rate limit exceeded |
| `207` | Partial success (bulk endpoints — some records succeeded, some failed) |
| `500` | Internal server error |

---

## Rate Limiting

Limits are applied per access key. When the limit is exceeded, the API returns `429 Too Many Requests`. Inspect the `X-RateLimit-Remaining` header on every response to throttle proactively.

---

## Endpoints

---

### Institutions

#### `GET /api/v1/institutions`

List institutions the API key has access to.

**Permission:** `institutions:read`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `institution_code` | string | no | Filter by institution code (e.g. `CAS`) |

**Response (200):** bare array

```json
[
  {
    "id": "uuid",
    "institution_code": "CAS",
    "name": "College of Arts & Science",
    "myjkkn_institution_ids": ["..."],
    "is_active": true
  }
]
```

---

### Boards

#### `GET /api/v1/boards`

List boards. Auto-scoped to the key's institutions.

**Permission:** `boards:read`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `institution_code` | string | no | Filter by institution code |
| `institutions_id` | UUID | no | Filter by institution UUID |
| `board_code` | string | no | Filter by board code (e.g. `MKU`) |
| `board_type` | string | no | e.g. `University`, `Autonomous` |
| `is_active` | `true`\|`false` | no | Filter active status |

**Response (200):** `{ data: [...], total: <n> }`

Each board: `{ id, institutions_id, institution_code, board_code, board_name, display_name, board_type, board_order, status, is_active, created_at, updated_at }`

#### `POST /api/v1/boards`

Create a board.

**Permission:** `boards:create`

**Body:**

```json
{
  "institution_code": "CAS",
  "board_code": "MKU",
  "board_name": "Madurai Kamaraj University",
  "display_name": "MKU Board",
  "board_type": "University",
  "board_order": 1,
  "is_active": true
}
```

Required: `institution_code`, `board_code`, `board_name`.

**Response (201):** `{ data: <board> }`

#### `PUT /api/v1/boards?id=<uuid>`

Update a board.

**Permission:** `boards:update`

**Body:** any subset of `{ board_code, board_name, display_name, board_type, board_order, is_active }`

#### `DELETE /api/v1/boards?id=<uuid>`

Delete a board. Returns `409` if the board is referenced.

**Permission:** `boards:delete`

---

### Examination Sessions

#### `GET /api/v1/examination-sessions`

List examination sessions for an institution.

**Permission:** `examination-sessions:read`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `institutions_id` | UUID | **yes** | COE institution UUID |
| `session_status` | string | no | e.g. `Active`, `Closed` |

**Response (200):** bare array of `{ id, session_code, session_name, institutions_id, exam_start_date, exam_end_date, session_status, month_year }`

---

### Grade System

#### `GET /api/v1/grade-system`

Read-only (view) list of grade system definitions — grade bands, points, and
mark ranges. **View only:** there are no create/update/delete operations on this
resource.

**Permission:** `grade-system:read`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `institution_id` | UUID | no | COE institution UUID. Required for global (all-institution) keys; key-scoped institutions are applied automatically otherwise. |
| `grade_system_code` | string | no | e.g. `UG`, `PG` |
| `regulation_id` | number | no | Filter by regulation |
| `is_active` | boolean | no | `true`/`false`; defaults to active rows only |

**Response (200):** `{ data: [...], total: <n> }`

Each row:

```json
{
  "id": "uuid",
  "institutions_id": "uuid",
  "institutions_code": "CAS",
  "grade_system_code": "UG",
  "grade_id": "uuid",
  "grade": "O",
  "grade_point": 10,
  "min_mark": 90,
  "max_mark": 100,
  "description": "Outstanding",
  "regulation_id": 12,
  "regulation_code": "R2021",
  "is_active": true,
  "grades": { "id": "uuid", "qualify": true, "is_absent": false, "exclude_cgpa": false, "result_status": "Pass" }
}
```

---

### Courses

#### `GET /api/v1/courses`

List courses with filters.

**Permission:** `courses:read`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `format` | `mapped`\|`raw` | no | Default `mapped`. `raw` returns DB column names. |
| `institutions_id` | UUID | no | Institution UUID (also accepts `institution_id`). Scoped to the key's allowed institutions. |
| `institution_code` | string | no | Alternative to `institutions_id`. |
| `program_code` | string | no | Filters on `offering_department_code` |
| `regulation_code` | string | no | e.g. `R-2024` |
| `course_code` | string | no | |
| `search` | string | no | Matches `course_code` or `course_name` |
| `is_active` | `true`\|`false` | no | |
| `courses_status` | string | no | e.g. `Pending`, `Approved` |
| `limit` | number | no | Page size, default `5000`, max `10000`. |
| `offset` | number | no | Row offset for pagination, default `0`. |

Results are ordered by `course_code`. To retrieve the complete set for an
institution + regulation, pass `institutions_id` and `regulation_code`; the
response `total` is the exact match count — page with `limit`/`offset` if it
exceeds your `limit`.

**Response (200):** `{ data: [...], total, limit, offset }` — each item is a mapped course:

```json
{
  "id": "uuid",
  "institutions_id": "uuid",
  "institution_code": "CAS",
  "regulation_code": "R2023",
  "course_code": "BCA101",
  "course_title": "Programming in C",
  "display_code": "BCA101",
  "course_category": "Core",
  "course_type": "Theory",
  "credits": 4,
  "internal_max_mark": 40,
  "internal_pass_mark": 20,
  "external_max_mark": 60,
  "external_pass_mark": 30,
  "total_max_mark": 100,
  "total_pass_mark": 50,
  "dummy_number_required": true,
  "is_active": true,
  "courses_status": "Pending",
  "created_at": "...",
  "updated_at": "..."
}
```

#### `POST /api/v1/courses`

Create a course. Auto-resolves UUIDs from codes (`institution_code` → `institutions_id`, etc.).

**Permission:** `courses:create`

**Required body fields:** `institution_code`, `regulation_code`, `course_code`, `course_title`.

**Other accepted fields:** `display_code`, `course_category`, `course_type`, `course_part_master`, `credits`, `split_credit`, `theory_credit`, `practical_credit`, `qp_code`, `e_code_name`, `exam_duration`, `evaluation_type`, `result_type`, `self_study_course`, `outside_class_course`, `open_book`, `online_course`, `dummy_number_required`, `annual_course`, `multiple_qp_set`, `no_of_qp_setter`, `no_of_scrutinizer`, `fee_exception`, `syllabus_pdf_url`, `description`, `is_active`, `class_hours`, `theory_hours`, `practical_hours`, `internal_max_mark`, `internal_pass_mark`, `internal_converted_mark`, `external_max_mark`, `external_pass_mark`, `external_converted_mark`, `total_pass_mark`, `total_max_mark`, `annual_semester`, `registration_based`, `credit_included`, `has_hall_ticket`, `courses_status`, `board_code`, `offering_department_code`.

**Response (201):** `{ data: <course> }`

#### `GET /api/v1/courses/{id}`

Fetch a single course.

**Permission:** `courses:read`

**Query params:** `format=mapped|raw`

#### `PUT /api/v1/courses/{id}`

Update a course. `institutions_id` and `institution_code` are immutable.

**Permission:** `courses:update`

**Body:** any subset of the create fields above.

#### `DELETE /api/v1/courses/{id}`

Delete a course. Blocked with `409` if the course is referenced in `course_mapping`, `internal_marks`, `final_marks`, `marks_entry`, `exam_registrations`, or `examiner_assignments`.

**Permission:** `courses:delete`

**Query params:**

| Name | Notes |
|---|---|
| `check=true` | Dry-run — returns `{ can_delete, dependencies: [{table, count}] }` without deleting |

---

### Course Mapping

Maps a `course` to a `program × regulation × semester × batch`.

#### `GET /api/v1/course-mapping`

**Permission:** `course-mapping:read`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `format` | `mapped`\|`raw` | no | Default `mapped` |
| `id` | UUID | no | Single-record fetch |
| `institutions_id` | UUID | no | |
| `institution_code` | string | no | |
| `program_code` | string | no | |
| `course_code` | string | no | |
| `semester_code` | string | no | |
| `batch_code` | string | no | |
| `regulation_code` | string | no | |
| `course_category` | string | no | |
| `is_active` | `true`\|`false`\|`all` | no | Default filters to `is_active = true` |
| `details` | `true` | no | Embed the full course detail object (`courses`: title, marks, credits) in each row |
| `limit` | int | no | Default 5000, max 10000 |

**Response (200):** `{ data: [...], total: <n> }`

Every row includes the human course title at the top level as **`course_title`**
(aliased as `course_name`) plus **`regulation_code`** — so MyJKKN can read the
title directly without `details=true`. With `details=true` the row also embeds a
`courses` object (`course_code`, `course_title`, marks, `credits`). Example row:

```json
{
  "id": "uuid",
  "course_id": "uuid",
  "course_code": "24PMAC07",
  "course_title": "CORE-VII-COMPLEX ANALYSIS",
  "course_name": "CORE-VII-COMPLEX ANALYSIS",
  "program_code": "MAMATHS",
  "regulation_code": "R-2024",
  "semester_code": "S3",
  "courses": { "course_code": "24PMAC07", "course_title": "CORE-VII-COMPLEX ANALYSIS", "credits": 5, "total_max_mark": 100, "total_pass_mark": 50 }
}
```

#### `POST /api/v1/course-mapping`

Create one or many mappings.

**Permission:** `course-mapping:create`

**Single body:**

```json
{
  "course_code": "BCA101",
  "institution_code": "CAS",
  "program_code": "BCA",
  "regulation_code": "R2023",
  "semester_code": "S1",
  "batch_code": "2023-2026",
  "course_group": "Core",
  "course_category": "Theory",
  "course_order": 1,
  "annual_semester": false,
  "registration_based": false,
  "is_active": true
}
```

Required: `course_id` **or** `course_code`, `institution_code`, `program_code`, `regulation_code`.

**Bulk body:** `{ "mappings": [ {...}, {...} ] }` — returns a per-row `errors` array alongside `data`.

#### `PUT /api/v1/course-mapping`

Update by ID. Body: `{ id, ...fieldsToUpdate }`. `institutions_id` cannot be changed.

**Permission:** `course-mapping:update`

#### `DELETE /api/v1/course-mapping?id=<uuid>`

**Permission:** `course-mapping:delete`

---

### Exam Registrations

#### `GET /api/v1/registrations`

List exam registrations for a session.

**Permission:** `registrations:read`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `institutions_id` | UUID | **yes** | |
| `examination_session_id` | UUID | **yes** | |
| `program_code` | string | no | e.g. `BCA` |
| `course_code` | string | no | |
| `course_offering_id` | UUID | no | |
| `is_regular` | `true`\|`false` | no | |
| `limit` | int | no | Default 5000, max 10000 |

**Response (200):** `{ data: [...], total: <n> }`

Each row: `{ id, institutions_id, institution_code, examination_session_id, session_code, course_offering_id, course_code, program_code, student_id, stu_register_no, student_name, is_regular, attempt_number, registration_status, fee_paid }`

#### `POST /api/v1/registrations`

Create an exam registration. Body is the full `exam_registrations` record. Institution scoping is enforced.

**Permission:** `registrations:create`

---

### Learners

#### `GET /api/v1/learners`

List unique learners derived from `exam_registrations`. Dedupes by `student_id`.

**Permission:** `learners:read`

**Query params:**

| Name | Type | Required | Notes |
|---|---|---|---|
| `program_id` | string | no | Matches `program_code` (code, not UUID) |
| `search` | string | no | Matches `student_name` or `register_number` |

**Response (200):** `{ data: [...], total: <n> }`

Each row: `{ student_id, student_name, register_number, institution_id, program_code, batch_code }`

> Note: Photos and DOB are **not** returned. Learner profiles live in **MyJKKN** — query MyJKKN APIs for `student_photo_url`, `date_of_birth`, etc.

---

### Internal Marks

#### `GET /api/v1/marks/internal`

**Permission:** `marks:read`

**Query params:**

| Name | Required | Notes |
|---|---|---|
| `course_offering_id` | no | Filter to a single course offering |

**Response (200):** `{ data: [...], total: <n> }` — full `internal_marks` rows.

#### `POST /api/v1/marks/internal`

**Permission:** `marks:create`

Body: a single `internal_marks` row. Institution scoping enforced via `institution_id` in body.

---

### Results (Final Marks)

#### `GET /api/v1/results`

Returns **published** final marks only, and **only after the result has been declared**.

A mark row is returned when **all** conditions hold:

1. `final_marks.result_status = 'Published'`, and
2. its examination session's `session_status = 'Results Declared'`, and
3. its examination session's `result_declaration_date` is set **and** has arrived
   (`result_declaration_date <= now()`).

A session that is not `Results Declared`, or whose `result_declaration_date` is
`NULL` or still in the future, is treated as not-yet-declared — none of its marks
are returned, even if some of them happen to be `Published`.
When results are published in the COE app the declaration date/time is stamped to
the publish moment automatically (unless a future date was scheduled); COE staff
can also schedule or release it from the **Post-Exam → Result Release** page.

**Permission:** `results:read`

**Query params:**

| Name | Required | Notes |
|---|---|---|
| `session_id` | no | `examination_session_id` |
| `institution_id` | no | |
| `learner_id` | no | `student_id` |

**Response (200):** `{ data: [...], total: <n> }`

Each row:

```json
{
  "id": "uuid",
  "student_id": "uuid",
  "register_number": "20BCA001",
  "course_offering_id": "uuid",
  "course_id": "uuid",
  "course_code": "24PMAC07",
  "course_name": "CORE-XI-FUNCTIONAL ANALYSIS",
  "program_code": "BCA",
  "internal_marks_obtained": 35,
  "internal_marks_maximum": 40,
  "external_marks_obtained": 48,
  "external_marks_maximum": 60,
  "total_marks_obtained": 83,
  "total_marks_maximum": 100,
  "percentage": 83.0,
  "letter_grade": "A",
  "grade_points": 9,
  "credit": 4,
  "total_grade_points": 36,
  "is_pass": true,
  "pass_status": "Pass",
  "result_status": "Published",
  "is_locked": true,
  "examination_session_id": "uuid",
  "result_declaration_date": "2026-06-05T10:30:00.000Z",
  "session_status": "Results Declared",
  "created_at": "..."
}
```

---

### CIA Settings

CRUD over `cia_entry_settings` (round/component configuration for a session × program × regulation).

#### `GET /api/v1/cia-settings`

**Permission:** `cia-settings:read`

**Query params:**

| Name | Required | Notes |
|---|---|---|
| `institutions_id` | **yes** | |
| `examination_session_id` | **yes** | |
| `program_code` | no | Filters by `program_codes` array containment |

**Response (200):** bare array of `cia_entry_settings` rows.

#### `POST /api/v1/cia-settings`

**Permission:** `cia-settings:create`

**Required body fields:** `institutions_id`, `institution_code`, `examination_session_id`, `setting_name`, `program_codes` (non-empty array), `cia_rounds` (non-empty array).

**Other fields:** `regulation_code`, `regulation_id`, `course_type` (array), `use_course_max` (bool), `total_rounds`, `conversion_rule_id`, `created_by`.

**Round shape:**

```json
{
  "round": 1,
  "round_name": "CIA-1",
  "entry_from": "2026-03-01",
  "entry_to": "2026-03-15",
  "session_from": "2026-02-01",
  "session_to": "2026-02-28",
  "total_periods": 30,
  "attended_periods": 28,
  "components": [
    { "code": "assignment", "name": "Assignment", "max_marks": 10 },
    {
      "code": "attendance",
      "name": "Attendance",
      "max_marks": 5,
      "attendance_total_periods": 30,
      "attendance_attended_periods": 28
    }
  ]
}
```

#### `PUT /api/v1/cia-settings`

**Permission:** `cia-settings:update`

Body: `{ id, ...updateFields }`. `institutions_id`, `institution_code`, and `created_by` cannot be changed.

#### `DELETE /api/v1/cia-settings?id=<uuid>`

**Permission:** `cia-settings:delete`

If marks already exist for the session, the setting is **soft-deactivated** (`is_active = false`) instead of hard-deleted. Response includes `{ deactivated: true, reason }`.

---

### CIA Marks — Sync

#### `POST /api/v1/cia-marks/sync`

Upsert CIA marks in bulk. Designed for MyJKKN to push marks into COE.

**Permission:** `cia-marks:create`

**Body:**

```json
{
  "records": [
    {
      "institutions_id": "uuid",
      "examination_session_id": "uuid",
      "course_offering_id": "uuid",
      "student_id": "uuid",
      "exam_registration_id": "uuid",
      "cia_round": 1,
      "assignment_marks": 8,
      "quiz_marks": 5,
      "mid_term_marks": 18,
      "max_assignment_marks": 10,
      "max_quiz_marks": 5,
      "max_mid_term_marks": 20,
      "total_internal_marks": 31,
      "max_internal_marks": 35,
      "submission_date": "2026-03-15",
      "marks_status": "Submitted",
      "created_by": "uuid-of-logged-in-myjkkn-user"
    }
  ]
}
```

**Limits:** max **500 records** per request.

**Required per record:** `institutions_id`, `examination_session_id`, `course_offering_id`, `student_id`, and `created_by` (UUID of the logged-in MyJKKN user — must be a valid UUID, otherwise the record is rejected).

**Auto-resolved by COE:** `program_id`, `course_id` (looked up from `course_offerings`).

**Defaults:** `cia_round = 1`, `submission_date = today`, `marks_status = "Submitted"`, `is_active = true`.

**Upsert conflict key:** `(student_id, course_offering_id, examination_session_id, cia_round)`.

**Component mark fields accepted:**
- Components: `assignment_marks`, `quiz_marks`, `mid_term_marks`, `presentation_marks`, `attendance_marks`, `lab_marks`, `project_marks`, `seminar_marks`, `viva_marks`, `other_marks`
- Tests: `test_1_mark`, `test_2_mark`, `test_3_mark`
- Per-component max: `max_<component>_marks`, `max_test_<n>_mark`
- Totals: `total_internal_marks`, `max_internal_marks`
- User-defined: `extra_marks` (JSONB), `extra_marks_max` (JSONB)
- Grade: `grade`
- Status: `marks_status`, `remarks`
- Audit: `created_by`, `updated_by`, `submitted_by` (all UUIDs)

A record is rejected if **no component has marks > 0** and `total_internal_marks` is also 0.

**Response shape:**

```json
{
  "success": true,
  "synced": 487,
  "inserted": 412,
  "updated": 75,
  "failed": 13,
  "total": 500,
  "error": "First error message if any",
  "results": [
    { "index": 0, "student_id": "uuid", "course_offering_id": "uuid", "status": "created" },
    { "index": 1, "student_id": "uuid", "course_offering_id": "uuid", "status": "updated" },
    { "index": 2, "student_id": "uuid", "course_offering_id": "uuid", "status": "error", "error": "course_offering_id \"...\" not found" }
  ],
  "request_id": "..."
}
```

**Status codes:**
- `200` — all records synced
- `207` — partial success (some records failed)
- `400` — request body invalid or no valid records
- `500` — total failure

---

### CIA Marks — Report

#### `GET /api/v1/cia-marks/report`

Returns a CIA report for a course + round with dummy numbers and digit-by-digit "marks in words".

**Permission:** `cia-report:read`

**Query params:**

| Name | Required | Notes |
|---|---|---|
| `institutions_id` | **yes** | |
| `examination_session_id` | **yes** | |
| `course_code` | **yes** | |
| `cia_round` | **yes** | `1`, `2`, `3`, ... |
| `program_code` | no | |

**Response (200):**

```json
{
  "course": {
    "course_code": "BCA101",
    "course_name": "Programming in C",
    "internal_max_mark": 40
  },
  "learners": [
    {
      "register_number": "20BCA001",
      "student_name": "Ramesh Kumar",
      "dummy_number": "D-1042",
      "marks": { "assignment": 8, "quiz": 5, "mid_term": 18 },
      "total": 31,
      "marks_in_words": "THREE ONE"
    }
  ],
  "summary": { "total_learners": 65, "marks_entered": 60, "pending": 5 }
}
```

Available component codes in `marks`: `assignment`, `quiz`, `mid_term`, `presentation`, `attendance`, `lab`, `project`, `seminar`, `viva`, `test_1`, `test_2`, `test_3`, `other`.

---

### BOS Compositions

Board of Studies composition records (term-based member panels).

#### `GET /api/v1/bos-compositions`

**Permission:** `bos-compositions:read`

**Query params:**

| Name | Notes |
|---|---|
| `board_id` | Filter by board UUID |
| `academic_year` | e.g. `2025-2026` |
| `is_active` | `true`\|`false` |

**Response (200):** `{ data: [...], total: <n> }` — each row: `{ id, institutions_id, board_id, composition_title, term_start_date, term_end_date, academic_year, is_active, ratified_by_gc, ratified_date, created_at, updated_at }`

#### `GET /api/v1/bos-compositions/{id}`

Fetch a single composition by ID.

---

### BOS Meetings

#### `GET /api/v1/bos-meetings`

**Permission:** `bos-meetings:read`

**Query params:**

| Name | Notes |
|---|---|
| `board_id` | |
| `status` | `Scheduled`, `Completed`, `Cancelled`, ... |
| `academic_year` | |
| `meeting_type` | |
| `search` | Matches `meeting_title` or `venue` |

**Response (200):** `{ data: [...], total: <n> }`

Each meeting:

```json
{
  "id": "uuid",
  "institutions_id": "uuid",
  "board_id": "uuid",
  "composition_id": "uuid",
  "meeting_number": 1,
  "academic_year": "2025-2026",
  "meeting_title": "BOS Meeting Q1",
  "meeting_type": "Regular",
  "status": "Scheduled",
  "scheduled_date": "2026-04-15",
  "scheduled_time": "10:00",
  "venue": "Conference Hall",
  "actual_date": null,
  "actual_start_time": null,
  "actual_end_time": null,
  "quorum_met": null,
  "ratified_by_ac": null,
  "ratified_date": null,
  "minutes_summary": null,
  "created_at": "...",
  "updated_at": "..."
}
```

#### `GET /api/v1/bos-meetings/{id}`

Fetch a single meeting by ID.

---

### BOS Experts

#### `GET /api/v1/bos-experts`

External subject experts available for BOS panels.

**Permission:** `bos-experts:read`

**Query params:**

| Name | Notes |
|---|---|
| `category` | e.g. `Academic`, `Industry` |
| `is_active` | `true`\|`false` |
| `search` | Matches `name`, `institution_name`, or `specialization` |

**Response (200):** `{ data: [...], total: <n> }`

Each expert: `{ id, institutions_id, name, title, designation, institution_name, department_name, email, contact_no, category, specialization, qualifications, is_active, created_at }`

---

### BOS Reports

#### `GET /api/v1/bos-reports/composition`

Composition report — includes the embedded `bos_members` list.

**Query params:**

| Name | Notes |
|---|---|
| `composition_id` | Fetch a specific composition |
| `board_id` | Filter active compositions by board |
| `academic_year` | |

If `composition_id` is provided, returns that composition only. Otherwise, returns active compositions matching the filters.

**Response (200):** `{ data: [...], total: <n> }`

Each composition includes `bos_members: [{ id, member_type, display_name, display_designation, display_institution, email, contact_no, sort_order, is_active }]`.

#### `GET /api/v1/bos-reports/meeting-register`

Meeting register report — see source for query/response shape.

---

## Versioning

This is the **v1** API surface. Breaking changes will land under `/api/v2`. Additive changes (new optional fields, new endpoints) may be made within v1 without notice.

## Support

Issues with API access (key rotation, permission grants, domain allow-list) should be filed in the JKKN COE Developer Portal. Include the `X-Request-Id` from the failing response.
