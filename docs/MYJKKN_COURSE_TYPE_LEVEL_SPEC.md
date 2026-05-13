# MyJKKN Integration Spec: Course Type & Course Level

**Audience:** MyJKKN engineering team
**Status:** Required — COE has shipped breaking-additive changes to course master data
**Effective:** 2026-05-13

---

## 1. What changed in COE

Two new fields are now stored on every COE course, plus a new master table that drives the Course Type dropdown.

| Field | Type | Source | Example |
|------|------|--------|---------|
| `course_type` | text | User-selected from `course_info` master | `"Core"` |
| `course_level` | text \| null | User-selected Roman numeral (I…XX) | `"I"` |
| `course_type_code` | text \| null | **Generated** by COE DB trigger | `"Core-I"` |

### Generation rule (do NOT replicate client-side)

```
course_type_code =
    NULL                                        when course_type ∉ course_info
    course_info.display_code                    when course_level IS NULL
    course_info.display_code || '-' || level    otherwise
```

> **Do not compute `course_type_code` yourself.** It is generated server-side by a Postgres trigger in COE. Always read the value from the API response.

### display_code change worth noting

To resolve a duplicate, **Non Major Elective** now has `display_code = 'NME'` (was `'NM'`). Naanmuthalvan keeps `'NM'`. If MyJKKN previously used `'NM'` for Non Major Elective, update mappings.

---

## 2. Public API endpoints to consume

All endpoints under `/api/v1`. Auth: send `X-API-Key-Id` and `X-API-Secret` headers. Each requires `read` (or `create`/`update`) permission on the listed module.

### 2.1 `GET /api/v1/course-info`  *(NEW, read-only)*

Master list of course types. Use this to populate dropdowns or to map a `course_type` string back to its `display_code`.

**Permission module:** `course-info`, operation `read`.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `active` \| `inactive` | `active` | Filter by row status |
| `search` | string | — | ILIKE on `course_type` or `display_code` |
| `course_type` | string | — | Exact match |

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "course_type": "Core",
      "display_code": "Core",
      "description": null,
      "sort_order": 7,
      "status": true,
      "created_at": "2026-05-13T...",
      "updated_at": "2026-05-13T..."
    },
    {
      "id": "uuid",
      "course_type": "Discipline Specific elective",
      "display_code": "DSE",
      "sort_order": 9,
      "status": true,
      ...
    }
  ],
  "total": 46
}
```

### 2.2 `GET /api/v1/courses`  *(EXTENDED — new fields + filters)*

Returns courses with the three new fields populated.

**New filter query parameters (additive — old ones still work):**

| Param | Example | Notes |
|-------|---------|-------|
| `course_type` | `Core` | Exact match |
| `course_level` | `I` | Roman numeral I..XX |
| `course_type_code` | `Core-I` | Exact match — most precise filter |

**Sample response (one course, abbreviated):**

```json
{
  "data": [
    {
      "id": "uuid",
      "course_code": "CS101",
      "course_title": "Programming in C",
      "course_type": "Core",
      "course_level": "I",
      "course_type_code": "Core-I",
      "display_code": "PGC101",
      "credits": 3,
      "...": "other fields unchanged"
    }
  ]
}
```

### 2.3 `POST /api/v1/courses`  *(EXTENDED)*

Accepts a new optional `course_level` field. `course_type_code` is **read-only**; do not send it — it will be ignored.

```json
POST /api/v1/courses
{
  "institution_code": "JKKN",
  "regulation_code": "R2021",
  "course_code": "CS101",
  "course_title": "Programming in C",
  "course_type": "Core",
  "course_level": "I",
  "credits": 3
}
```

The response includes the generated `course_type_code = "Core-I"`.

### 2.4 `PUT /api/v1/courses/{id}`  *(EXTENDED)*

Same: accept `course_level` (set to `null` or omit to clear). `course_type_code` will be re-generated automatically.

```json
PUT /api/v1/courses/{id}
{ "course_level": "II" }    // course_type_code → display_code-II
```

---

## 3. Validation rules

| Field | Required | Allowed values |
|-------|----------|----------------|
| `course_type` | Optional | Any `course_type` from `GET /api/v1/course-info` |
| `course_level` | Optional | `I`, `II`, `III`, `IV`, `V`, `VI`, `VII`, `VIII`, `IX`, `X`, `XI`, `XII`, `XIII`, `XIV`, `XV`, `XVI`, `XVII`, `XVIII`, `XIX`, `XX` |
| `course_type_code` | Never sent | Generated server-side |

If `course_type` is not in `course_info`, the trigger sets `course_type_code` to `NULL`. The course is saved anyway — use the `null` value to detect bad data.

---

## 4. Action items for MyJKKN

| # | Action | Priority |
|---|--------|----------|
| 1 | Grant the MyJKKN app `read` permission on the **`course-info`** module (via COE API permissions UI) | **Required** before calling 2.1 |
| 2 | If you mirror/cache course types, refresh from `/api/v1/course-info` and adopt `course_type` strings as the source of truth | High |
| 3 | If MyJKKN previously had `'NM'` for **Non Major Elective**, migrate to `'NME'` | High |
| 4 | Add `course_level` field to any course-create/edit UI (optional Roman numeral I–XX dropdown) | Medium |
| 5 | Display `course_type_code` wherever the combined code is useful (timetables, marksheets, transcripts) | Medium |
| 6 | Where MyJKKN currently filters courses by `course_type` string, you may now also filter precisely by `course_type_code` (e.g., `"Core-I"`) | Low |

---

## 5. Edge cases

- **course_type set, course_level null** → `course_type_code = display_code` (e.g., `"Core"`).
- **course_type changed to a new value** → trigger re-computes `course_type_code` on UPDATE.
- **course_type does not exist in `course_info`** → `course_type_code` becomes `null` until corrected. MyJKKN UI should treat null gracefully.
- **`course_info.display_code` edited later** → existing `courses.course_type_code` does NOT auto-refresh on the master change. COE will run a backfill if a display_code is modified. MyJKKN should re-pull affected courses if it cached `course_type_code` locally.

---

## 6. Auth & errors (reference)

Send on every request:

```
X-API-Key-Id: <your access key id>
X-API-Secret: <your secret>
```

Common errors:

| HTTP | code | Cause |
|------|------|-------|
| 401 | `MISSING_CREDENTIALS` | Headers absent |
| 401 | (validator codes) | Key invalid/expired/revoked |
| 403 | `DOMAIN_NOT_ALLOWED` | Origin not whitelisted on the app |
| 403 | `PERMISSION_DENIED` | App lacks `read` on `course-info` or `courses` |
| 429 | rate-limit | Back off using `X-RateLimit-Remaining` header |

---

## 7. Quick smoke test

```bash
# 1. Pull master list (sanity check after permission granted)
curl -s -H "X-API-Key-Id: $KEY" -H "X-API-Secret: $SECRET" \
     "https://<coe-host>/api/v1/course-info?status=active" | jq '.total, .data[0]'

# 2. Filter courses by the combined code
curl -s -H "X-API-Key-Id: $KEY" -H "X-API-Secret: $SECRET" \
     "https://<coe-host>/api/v1/courses?course_type_code=Core-I&institution_code=JKKN" | jq '.data | length'

# 3. Create a course with level
curl -X POST -H "X-API-Key-Id: $KEY" -H "X-API-Secret: $SECRET" \
     -H "Content-Type: application/json" \
     -d '{ "institution_code":"JKKN","regulation_code":"R2021","course_code":"TST-1","course_title":"Test","course_type":"Core","course_level":"I" }' \
     "https://<coe-host>/api/v1/courses" | jq '.data.course_type_code'
# → expect: "Core-I"
```

---

**Contact:** COE engineering — flag any field-name or behavior question before MyJKKN merges client changes.
