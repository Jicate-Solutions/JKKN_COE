# Courses & Course Mapping API Integration Spec

**For:** MyJKKN Portal Development Team
**Version:** 1.0
**Date:** 2026-05-07

---

## Overview

This document describes how MyJKKN can integrate with COE's **Courses** and **Course Mapping** master data via the external `/api/v1` API.

- **Courses** — Subject definitions (course code, title, credits, mark scheme, evaluation type, hours).
- **Course Mapping** — Linkage between a course and a program / regulation / semester / batch (the "which courses belong to which semester of which program" relationship).

### Architecture

```
MyJKKN Portal                          COE System
+------------------+                   +-------------------+
| Course Catalog   |                   | courses table     |
| Curriculum Mgmt  | --- API Key ----> | course_mapping    |
| Sync Service     |                   | institutions      |
+------------------+                   +-------------------+
```

### Key Points

- **Auth**: API key from Developer Portal (`X-API-Key-Id` + `X-API-Secret` headers).
- **Institution scoping**: Each API key is bound to one or more institutions. Requests are automatically filtered to those institutions; explicit `institution_code` / `institutions_id` filters are validated against allowed scope.
- **Response format**: Both **mapped** (friendly: `course_title`, `credits`, `is_active`) and **raw** (DB: `course_name`, `credit`, `status`) formats are supported via `?format=mapped|raw`. Default is `mapped`.
- **Rate limit**: 60 requests/minute per API key.

---

## Authentication

### API Key Setup

1. Go to **Developer Portal > Applications** in COE.
2. Create application: e.g. "MyJKKN Course Sync".
3. Generate API key pair (returns `ak_coe_*` access ID + `sk_coe_*` secret — secret is shown only once).
4. Assign permissions:

| Module | Operations |
|--------|-----------|
| `courses` | `read`, `create`, `update`, `delete` |
| `course-mapping` | `read`, `create`, `update`, `delete` |

### Request Headers

```
X-API-Key-Id: ak_coe_xxxxxxxxxxxxxxxxxxxxxxxx
X-API-Secret: sk_coe_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

### Auth Error Responses

| Status | Error | Meaning |
|--------|-------|---------|
| 401 | `Missing API credentials` | Headers not provided |
| 401 | `Invalid API key` | Key not found or secret mismatch |
| 401 | `API key expired` | Past expiry date |
| 403 | `Insufficient permissions` | Key lacks required module/operation |
| 403 | `Access denied for this institution` | Institution not in key's scope |
| 429 | `Rate limit exceeded` | More than 60 req/min |

### Response Headers (all endpoints)

```
X-Request-Id: <uuid>          # Use for support/troubleshooting
X-RateLimit-Limit: 60
X-RateLimit-Remaining: <n>
```

---

## Base URL

```
Production:  https://coe.jkkn.ai/api/v1
Development: http://localhost:3000/api/v1
```

---

## Common Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `format` | `mapped` \| `raw` | `mapped` | Response field-naming style |

**Mapped vs Raw example for a course:**

| Field | Mapped (default) | Raw |
|-------|------------------|-----|
| Title | `course_title` | `course_name` |
| Credits | `credits` | `credit` |
| Active flag | `is_active` (bool) | `status` (bool) |
| Dummy number | `dummy_number_required` (bool) | `dummy_number_not_required` (inverted) |

---

# 1. Courses API

## 1.1 List Courses

```
GET /api/v1/courses
```

**Permission:** `courses:read`

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `format` | string | `mapped` (default) or `raw` |
| `institution_code` | string | Filter by institution code (e.g. `JKKN`) |
| `program_code` | string | Filter by `offering_department_code` |
| `regulation_code` | string | Filter by regulation (e.g. `R2023`) |
| `course_code` | string | Exact match on course code |
| `search` | string | Substring match on `course_code` or `course_name` |
| `is_active` | `true` \| `false` | Filter by active flag |

### Example Request

```bash
curl -H "X-API-Key-Id: ak_coe_..." \
     -H "X-API-Secret: sk_coe_..." \
     "https://coe.jkkn.ai/api/v1/courses?institution_code=JKKN&regulation_code=R2023&is_active=true"
```

### Example Response (200, mapped)

```json
{
  "data": [
    {
      "id": "8e3f...",
      "institutions_id": "a1b2...",
      "institution_code": "JKKN",
      "regulation_code": "R2023",
      "offering_department_code": "CSE",
      "course_code": "CS101",
      "course_title": "Programming Fundamentals",
      "course_type": "Theory",
      "course_category": "Core",
      "credits": 4,
      "theory_credit": 3,
      "practical_credit": 1,
      "exam_duration": 180,
      "evaluation_type": "CIA + ESE",
      "result_type": "Mark",
      "internal_max_mark": 25,
      "internal_pass_mark": 10,
      "external_max_mark": 75,
      "external_pass_mark": 30,
      "total_max_mark": 100,
      "total_pass_mark": 40,
      "class_hours": 60,
      "theory_hours": 45,
      "practical_hours": 15,
      "is_active": true,
      "created_at": "2026-01-15T10:00:00Z",
      "updated_at": "2026-04-22T14:30:00Z"
    }
  ]
}
```

---

## 1.2 Get Single Course

```
GET /api/v1/courses/{id}
```

**Permission:** `courses:read`

### Example Request

```bash
curl -H "X-API-Key-Id: ak_coe_..." -H "X-API-Secret: sk_coe_..." \
     "https://coe.jkkn.ai/api/v1/courses/8e3f1234-5678-90ab-cdef-1234567890ab?format=mapped"
```

### Response

- `200` — `{ "data": <course> }`
- `404` — `{ "error": "Course not found" }`
- `403` — `{ "error": "Access denied for this institution" }`

---

## 1.3 Create Course

```
POST /api/v1/courses
```

**Permission:** `courses:create`

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `institution_code` | string | Must exist in `institutions` table |
| `regulation_code` | string | Regulation code (resolved to `regulation_id` if found) |
| `course_code` | string | Course code (unique per regulation) |
| `course_title` | string | Course name |

### Optional Fields (subset)

| Field | Type | Notes |
|-------|------|-------|
| `offering_department_code` | string | Resolved to `offering_department_id` |
| `board_code` | string | Resolved to `board_id` (must exist for institution) |
| `display_code` | string | Display-friendly code |
| `course_category` | string | e.g. Core, Elective |
| `course_type` | string | e.g. Theory, Practical |
| `credits` | number | Total credits |
| `theory_credit` | number | |
| `practical_credit` | number | |
| `qp_code` | string | Question paper code |
| `exam_duration` | number | Minutes |
| `evaluation_type` | string | e.g. `CIA`, `ESE`, `CIA + ESE` |
| `result_type` | string | Default `Mark` |
| `internal_max_mark` | number | |
| `internal_pass_mark` | number | |
| `external_max_mark` | number | |
| `external_pass_mark` | number | |
| `total_max_mark` | number | |
| `total_pass_mark` | number | |
| `class_hours` | number | |
| `theory_hours` | number | |
| `practical_hours` | number | |
| `dummy_number_required` | bool | Default `true` (stored inverted) |
| `is_active` | bool | Default `true` |

### Example Request

```bash
curl -X POST \
  -H "X-API-Key-Id: ak_coe_..." -H "X-API-Secret: sk_coe_..." \
  -H "Content-Type: application/json" \
  -d '{
    "institution_code": "JKKN",
    "regulation_code": "R2023",
    "course_code": "CS101",
    "course_title": "Programming Fundamentals",
    "offering_department_code": "CSE",
    "credits": 4,
    "course_type": "Theory",
    "course_category": "Core",
    "evaluation_type": "CIA + ESE",
    "internal_max_mark": 25,
    "internal_pass_mark": 10,
    "external_max_mark": 75,
    "external_pass_mark": 30,
    "total_max_mark": 100,
    "total_pass_mark": 40
  }' \
  "https://coe.jkkn.ai/api/v1/courses"
```

### Responses

| Status | Body |
|--------|------|
| `201` | `{ "data": <course> }` |
| `400` | `{ "error": "Missing required fields: ..." }` or FK / duplicate / check-constraint |
| `403` | `{ "error": "Access denied for this institution" }` |

---

## 1.4 Update Course

```
PUT /api/v1/courses/{id}
```

**Permission:** `courses:update`

Send only the fields you want to change. `institution_code` and `institutions_id` are **immutable** (silently ignored if sent).

### Example

```bash
curl -X PUT \
  -H "X-API-Key-Id: ak_coe_..." -H "X-API-Secret: sk_coe_..." \
  -H "Content-Type: application/json" \
  -d '{ "credits": 5, "internal_max_mark": 30, "is_active": false }' \
  "https://coe.jkkn.ai/api/v1/courses/8e3f1234-5678-90ab-cdef-1234567890ab"
```

### Responses

- `200` — `{ "data": <course> }`
- `404` — `{ "error": "Course not found" }`
- `400` — Validation / FK / duplicate

---

## 1.5 Delete Course

```
DELETE /api/v1/courses/{id}
DELETE /api/v1/courses/{id}?check=true
```

**Permission:** `courses:delete`

### `?check=true` (dry-run dependency check)

Returns whether the course can be deleted without actually deleting:

```json
{
  "can_delete": false,
  "dependencies": [
    { "table": "course_mapping", "count": 3 },
    { "table": "internal_marks", "count": 25 }
  ]
}
```

### Default (actual delete)

| Status | Meaning |
|--------|---------|
| `200` | Deleted: `{ "data": { "id": "...", "deleted": true } }` |
| `409` | Has dependencies (lists them) |
| `404` | Course not found |
| `403` | Institution access denied |

Dependency tables checked: `course_mapping`, `internal_marks`, `final_marks`, `marks_entry`, `exam_registrations`, `examiner_assignments`.

---

# 2. Course Mapping API

A course mapping links a `course_id` to a specific `program_code` + `regulation_code` + `semester_code` + `batch_code` (with optional `course_group`, `course_order`, `course_category`).

## 2.1 List Course Mappings

```
GET /api/v1/course-mapping
```

**Permission:** `course-mapping:read`

### Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `format` | string | `mapped` (default) or `raw` |
| `id` | uuid | Fetch single mapping by ID |
| `institutions_id` | uuid | Filter by COE institution UUID |
| `institution_code` | string | Filter by institution code |
| `program_code` | string | e.g. `UEN`, `BCA` |
| `course_code` | string | |
| `semester_code` | string | e.g. `S1`, `S2` |
| `batch_code` | string | |
| `regulation_code` | string | |
| `course_category` | string | |
| `is_active` | `true` \| `false` \| `all` | Default `true` |
| `details` | `true` | Enrich each row with `courses` object (code, title, mark scheme, credits) |
| `limit` | number | Max 10000, default 5000 |

### Example: List for a Program/Semester with Course Details

```bash
curl -H "X-API-Key-Id: ak_coe_..." -H "X-API-Secret: sk_coe_..." \
  "https://coe.jkkn.ai/api/v1/course-mapping?program_code=BCA&semester_code=S2&details=true"
```

### Example Response (200)

```json
{
  "data": [
    {
      "id": "1234...",
      "course_id": "8e3f...",
      "course_code": "CS101",
      "institution_code": "JKKN",
      "institutions_id": "a1b2...",
      "program_code": "BCA",
      "program_id": "p-uuid-from-myjkkn",
      "regulation_code": "R2023",
      "regulation_id": "r-uuid-from-myjkkn",
      "semester_code": "S2",
      "semester_id": "s-uuid-from-myjkkn",
      "course_order": 1,
      "course_group": null,
      "is_active": true,
      "courses": {
        "course_code": "CS101",
        "course_title": "Programming Fundamentals",
        "credits": 4,
        "internal_max_mark": 25,
        "external_max_mark": 75,
        "total_max_mark": 100
      }
    }
  ],
  "total": 1
}
```

---

## 2.2 Create Single Mapping

```
POST /api/v1/course-mapping
```

**Permission:** `course-mapping:create`

### Required Fields

| Field | Type | Notes |
|-------|------|-------|
| `course_id` **OR** `course_code` | string | Either is acceptable |
| `institution_code` | string | |
| `program_code` | string | |
| `regulation_code` | string | |

### Optional Fields

| Field | Type | Notes |
|-------|------|-------|
| `program_id` | uuid | MyJKKN's `program.id` (recommended) |
| `regulation_id` | uuid | MyJKKN's `regulation.id` |
| `semester_id` | uuid | MyJKKN's `semester.id` |
| `semester_code` | string | e.g. `S2` |
| `batch_id` | uuid | |
| `batch_code` | string | |
| `course_order` | number | Display order |
| `course_group` | string | |
| `course_category` | string | |
| `annual_semester` | bool | |
| `registration_based` | bool | |
| `is_active` | bool | Default `true` |

### Example

```bash
curl -X POST \
  -H "X-API-Key-Id: ak_coe_..." -H "X-API-Secret: sk_coe_..." \
  -H "Content-Type: application/json" \
  -d '{
    "course_code": "CS101",
    "institution_code": "JKKN",
    "program_code": "BCA",
    "program_id": "p-uuid-from-myjkkn",
    "regulation_code": "R2023",
    "regulation_id": "r-uuid-from-myjkkn",
    "semester_code": "S2",
    "semester_id": "s-uuid-from-myjkkn",
    "course_order": 1
  }' \
  "https://coe.jkkn.ai/api/v1/course-mapping"
```

### Responses

| Status | Body |
|--------|------|
| `201` | `{ "data": <mapping> }` |
| `400` | Missing required fields |
| `404` | Course or institution not found |
| `409` | `Course mapping already exists for this combination` |

---

## 2.3 Bulk Create / Upsert Mappings

```
POST /api/v1/course-mapping
```

**Permission:** `course-mapping:create` + `course-mapping:update`

Send either:
- A top-level array: `[ { ... }, { ... } ]`, OR
- An object with `mappings` array: `{ "mappings": [ ... ] }`

Records **with** an `id` are updated (upsert by `id`); records **without** an `id` are inserted.

### Example: Upsert 3 mappings for BCA Semester 2

```bash
curl -X POST \
  -H "X-API-Key-Id: ak_coe_..." -H "X-API-Secret: sk_coe_..." \
  -H "Content-Type: application/json" \
  -d '{
    "mappings": [
      {
        "course_code": "CS101",
        "institution_code": "JKKN",
        "program_code": "BCA",
        "regulation_code": "R2023",
        "semester_code": "S2",
        "course_order": 1
      },
      {
        "course_code": "CS102",
        "institution_code": "JKKN",
        "program_code": "BCA",
        "regulation_code": "R2023",
        "semester_code": "S2",
        "course_order": 2
      },
      {
        "id": "existing-mapping-uuid",
        "course_code": "CS103",
        "institution_code": "JKKN",
        "program_code": "BCA",
        "regulation_code": "R2023",
        "semester_code": "S2",
        "course_order": 3,
        "is_active": false
      }
    ]
  }' \
  "https://coe.jkkn.ai/api/v1/course-mapping"
```

### Bulk Response

```json
{
  "data": [ { "id": "...", "course_code": "CS101", ... }, ... ],
  "errors": [
    { "index": 1, "course_id": "...", "error": "Course not found" }
  ],
  "message": "2 mappings saved, 1 failed"
}
```

- Per-record `errors` array shows which input rows failed and why.
- `index` matches the position in your input array (when error happened during validation).

---

## 2.4 Update Mapping

```
PUT /api/v1/course-mapping
```

**Permission:** `course-mapping:update`

Body **must** include `id`. `institutions_id` is immutable.

```bash
curl -X PUT \
  -H "X-API-Key-Id: ak_coe_..." -H "X-API-Secret: sk_coe_..." \
  -H "Content-Type: application/json" \
  -d '{ "id": "1234...", "course_order": 5, "is_active": false }' \
  "https://coe.jkkn.ai/api/v1/course-mapping"
```

If you change `course_id`, the API auto-syncs `course_code` from the new course.

---

## 2.5 Delete Mapping

```
DELETE /api/v1/course-mapping?id={uuid}
```

**Permission:** `course-mapping:delete`

```bash
curl -X DELETE \
  -H "X-API-Key-Id: ak_coe_..." -H "X-API-Secret: sk_coe_..." \
  "https://coe.jkkn.ai/api/v1/course-mapping?id=1234..."
```

Returns `{ "data": { "id": "...", "deleted": true } }` on success.

---

# 3. Common Patterns & Tips

## 3.1 Sync Workflow (MyJKKN → COE)

When MyJKKN's curriculum module changes:

1. **Push course masters first** (`POST /api/v1/courses`) — courses are referenced by mappings.
2. **Push course mappings in bulk** (`POST /api/v1/course-mapping` with `mappings: [...]`) — let COE upsert.
3. **Use MyJKKN UUIDs** for `program_id`, `regulation_id`, `semester_id` — these are stored as foreign references and used by other COE modules.

## 3.2 Institution Scoping

If your API key is bound to institutions A and B:

- A request without `institution_code` → returns rows for A and B.
- A request with `institution_code=A` → returns only A.
- A request with `institution_code=C` (not in scope) → `403 Access denied for this institution`.

## 3.3 Idempotent Bulk Upserts

Re-sending the same bulk payload is safe:
- Records without `id` and matching `(course_id, institution_code, program_code, regulation_code, semester_code)` may fail with `409` for the single endpoint, but bulk insert will simply error-collect them per row — your sync job can ignore those errors.
- Records **with** `id` are upserted, so re-sending updates them in place.

## 3.4 Field-Name Mapping Quick Reference

| API name (mapped) | DB column (raw) | Notes |
|-------------------|-----------------|-------|
| `course_title` | `course_name` | |
| `credits` | `credit` | |
| `is_active` | `status` (course) / `is_active` (mapping) | |
| `dummy_number_required` | `dummy_number_not_required` | Inverted boolean |

For programmatic clients, prefer `?format=raw` to match DB columns directly.

## 3.5 Standard Error Shape

All error responses use:

```json
{ "error": "Human-readable message" }
```

Plus relevant headers (`X-Request-Id`, `X-RateLimit-*`) for support.

---

## 4. Support

- **Issues / Bugs**: Include the `X-Request-Id` from response headers.
- **API Key Management**: Developer Portal in COE.
- **Versioning**: This is `v1`. Breaking changes will appear in `/api/v2`.
