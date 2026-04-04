# CIA Marks Module — MyJKKN Development Prompt

## Context

JKKN COE (Controller of Examination) manages internal assessment marks. Currently, marks entry is restricted to COE users only. We need to enable **all faculty (Learning Facilitators)** to enter CIA (Continuous Internal Assessment) marks directly in the MyJKKN app, which then syncs to COE's `internal_marks` table.

**Architecture:**
```
Faculty enters CIA marks in MyJKKN
  → Saves to MyJKKN local `cia_marks` table
  → MyJKKN backend calls COE API: POST /api/v1/cia-marks/sync
  → COE validates + upserts into `internal_marks` table
  → Returns per-record success/error to MyJKKN
```

---

## 1. Database: Create `cia_marks` Table in MyJKKN Supabase

Create the `cia_marks` table in MyJKKN's Supabase project (`psfflrqjmplaljfpllyn`). The schema is identical to COE's `internal_marks` table for 1:1 field mapping during sync.

### Table Schema

```sql
CREATE TABLE IF NOT EXISTS public.cia_marks (
  id UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Core References (UUIDs must match COE's tables)
  institutions_id UUID NOT NULL,           -- maps to COE institutions.id
  examination_session_id UUID NOT NULL,    -- maps to COE examination_sessions.id
  exam_registration_id UUID NOT NULL,      -- maps to COE exam_registrations.id
  course_offering_id UUID NOT NULL,        -- maps to COE course_offerings.id
  program_id UUID NOT NULL,               -- maps to COE programs.id
  course_id UUID NOT NULL,                -- maps to COE courses.id
  student_id UUID NOT NULL,               -- maps to COE students.id
  faculty_id UUID,                        -- maps to COE users.id (the Learning Facilitator)

  -- Component Marks (Individual Assessment Types) — all INTEGER, default 0
  assignment_marks INTEGER DEFAULT 0,
  quiz_marks INTEGER DEFAULT 0,
  mid_term_marks INTEGER DEFAULT 0,
  presentation_marks INTEGER DEFAULT 0,
  attendance_marks INTEGER DEFAULT 0,
  lab_marks INTEGER DEFAULT 0,
  project_marks INTEGER DEFAULT 0,
  seminar_marks INTEGER DEFAULT 0,
  viva_marks INTEGER DEFAULT 0,
  other_marks INTEGER DEFAULT 0,

  -- Test Marks
  test_1_mark INTEGER DEFAULT 0,
  test_2_mark INTEGER DEFAULT 0,
  test_3_mark INTEGER DEFAULT 0,

  -- Calculated Totals (NOT NULL)
  total_internal_marks INTEGER NOT NULL,
  max_internal_marks INTEGER NOT NULL,

  -- Component Max Marks (nullable — only set when component is used)
  max_assignment_marks INTEGER,
  max_quiz_marks INTEGER,
  max_mid_term_marks INTEGER,
  max_presentation_marks INTEGER,
  max_attendance_marks INTEGER,
  max_lab_marks INTEGER,
  max_project_marks INTEGER,
  max_seminar_marks INTEGER,
  max_viva_marks INTEGER,
  max_other_marks INTEGER,
  max_test_1_mark INTEGER,
  max_test_2_mark INTEGER,
  max_test_3_mark INTEGER,

  -- Auto-calculated percentage
  internal_percentage NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN max_internal_marks > 0 THEN ROUND((total_internal_marks::numeric / max_internal_marks::numeric) * 100, 2)
      ELSE 0::numeric
    END
  ) STORED,

  -- Grade for status-based papers (CIA-only courses with no numerical marks)
  grade VARCHAR(50),  -- 'Commended', 'Highly Commended', 'AAA', or NULL

  -- Submission
  submission_date DATE NOT NULL,
  submitted_by UUID,

  -- Approval Workflow
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_date DATE,
  approval_remarks TEXT,

  -- Verification
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID,
  verified_date DATE,
  verification_remarks TEXT,

  -- Lock Mechanism (locked = read-only, cannot be modified)
  is_locked BOOLEAN DEFAULT false,
  locked_by UUID,
  locked_date DATE,

  -- Status: Draft → Submitted → Approved → Verified → Locked (or Rejected)
  marks_status VARCHAR(50) DEFAULT 'Draft',
  remarks TEXT,
  is_active BOOLEAN DEFAULT true,

  -- Sync tracking
  sync_status VARCHAR(20) DEFAULT 'pending',  -- pending, synced, failed
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_error TEXT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,

  -- Constraints
  CONSTRAINT cia_marks_pkey PRIMARY KEY (id),
  CONSTRAINT unique_cia_marks UNIQUE(institutions_id, exam_registration_id, course_offering_id),
  CONSTRAINT unique_cia_student_course UNIQUE(student_id, course_offering_id, examination_session_id),

  CONSTRAINT chk_cia_total_non_negative CHECK (total_internal_marks >= 0),
  CONSTRAINT chk_cia_total_valid CHECK (total_internal_marks <= max_internal_marks),
  CONSTRAINT chk_cia_max_positive CHECK (max_internal_marks > 0),
  CONSTRAINT chk_cia_status CHECK (marks_status IN ('Draft', 'Submitted', 'Approved', 'Verified', 'Locked', 'Rejected', 'Pending Review')),
  CONSTRAINT chk_cia_grade CHECK (grade IS NULL OR grade IN ('Commended', 'Highly Commended', 'AAA')),
  CONSTRAINT chk_cia_sync_status CHECK (sync_status IN ('pending', 'synced', 'failed'))
);

-- Key indexes
CREATE INDEX idx_cia_marks_institution ON cia_marks(institutions_id);
CREATE INDEX idx_cia_marks_session ON cia_marks(examination_session_id);
CREATE INDEX idx_cia_marks_student ON cia_marks(student_id);
CREATE INDEX idx_cia_marks_course_offering ON cia_marks(course_offering_id);
CREATE INDEX idx_cia_marks_faculty ON cia_marks(faculty_id);
CREATE INDEX idx_cia_marks_status ON cia_marks(marks_status);
CREATE INDEX idx_cia_marks_sync ON cia_marks(sync_status) WHERE sync_status != 'synced';

-- Enable RLS
ALTER TABLE cia_marks ENABLE ROW LEVEL SECURITY;

-- Faculty can read/write their own institution's marks
CREATE POLICY "Faculty can manage their marks"
  ON cia_marks FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

> **NOTE:** This table has 3 extra columns vs COE's `internal_marks`: `sync_status`, `last_synced_at`, `sync_error`. These are local tracking fields — they are NOT sent to COE during sync.

---

## 2. UUID Resolution: Getting COE IDs

The `cia_marks` table uses COE UUIDs for all reference fields. MyJKKN needs to resolve these **before** saving marks.

### How to Get COE UUIDs

COE already syncs `courses` and `course_mappings` to MyJKKN's Supabase (via the existing trigger-sync → receive-sync edge functions). These synced tables contain `coe_course_id` and `coe_mapping_id` fields linking back to COE.

For other entities, use COE's external API:

```
GET https://<COE_URL>/api/v1/registrations
Headers:
  X-API-Key-Id: <your_access_key_id>
  X-API-Secret: <your_secret_key>
Query params:
  ?institutions_id=<uuid>&examination_session_id=<uuid>
```

**Available COE v1 API endpoints:**
- `GET /api/v1/registrations` — exam registrations with student_id, course_offering_id, program_id
- `GET /api/v1/marks/internal` — existing internal marks
- `GET /api/v1/results` — published results
- `GET /api/v1/learners` — learner/student records
- `GET /api/v1/courses` — course records

All v1 endpoints use the same `X-API-Key-Id` + `X-API-Secret` auth headers.

### Reference Data Flow

```
MyJKKN local tables (synced from COE):
  courses.coe_course_id → use as course_id in cia_marks
  course_mappings.coe_mapping_id → use to find course_offering_id

COE v1 API (fetch on demand):
  exam_registrations → provides exam_registration_id, student_id, course_offering_id
  examination_sessions → provides examination_session_id
  programs → provides program_id
  institutions → provides institutions_id
```

---

## 3. CIA Marks Entry UI

Build a page where Learning Facilitators enter CIA marks for their assigned courses.

### Page: `/cia-marks` or `/internal-assessment`

**User Flow:**
1. Faculty logs in → sees their assigned courses for the current exam session
2. Selects a course → sees list of registered learners
3. Enters component marks for each learner (assignment, quiz, mid-term, etc.)
4. Saves as Draft → can edit later
5. Submits → marks become read-only, status changes to "Submitted"
6. Sync triggers → marks pushed to COE

### UI Requirements

**Filter Bar:**
- Institution (auto-filled from user's institution, or dropdown for super_admin)
- Examination Session (dropdown)
- Course (filtered by faculty's assigned courses)

**Marks Entry Table:**

| # | Register No | Learner Name | Assignment (/{max}) | Quiz (/{max}) | Mid-term (/{max}) | Test 1 (/{max}) | Test 2 (/{max}) | Total | % | Status | Actions |
|---|-------------|--------------|---------------------|---------------|-------------------|-----------------|-----------------|-------|---|--------|---------|
| 1 | 22BCA001 | Arun Kumar | [input]/20 | [input]/10 | [input]/30 | [input]/20 | [input]/20 | auto | auto | Draft | Save |

**Key Behaviors:**
- `total_internal_marks` = sum of all component marks (auto-calculated)
- `internal_percentage` = (total / max) * 100 (auto-calculated, stored as generated column)
- Validate each component mark: `0 ≤ mark ≤ max_component_mark`
- Validate total: `0 ≤ total ≤ max_internal_marks`
- Show red border on invalid inputs
- Bulk save: save all rows at once
- Status badge: Draft (gray), Submitted (blue), Synced (green), Failed (red)

**Form Actions:**
- **Save Draft** — saves to local `cia_marks` table with `marks_status = 'Draft'`
- **Submit** — changes `marks_status` to `'Submitted'`, triggers sync to COE
- **Export Template** — download Excel template for bulk entry
- **Import** — upload filled Excel, validate, preview, then save

### JKKN Terminology (CRITICAL)

| Standard Term | JKKN Term | Use In UI |
|---------------|-----------|-----------|
| Student | **Learner** | "Learner Name", not "Student Name" |
| Teacher/Faculty | **Learning Facilitator** | "Assigned Facilitator" |
| Internal Marks | **CIA Marks** | Page title: "CIA Marks Entry" |
| Failed | **Needs Improvement** | Never use "Failed" |
| Backlog | **Learning Opportunity** | Never use "Backlog" |

---

## 4. Sync Service: Push Marks to COE

### COE Sync API Contract

```
POST https://<COE_URL>/api/v1/cia-marks/sync

Headers:
  Content-Type: application/json
  X-API-Key-Id: <access_key_id>    ← from COE Developer Portal
  X-API-Secret: <secret_key>       ← from COE Developer Portal

Body:
{
  "records": [
    {
      "institutions_id": "uuid",
      "examination_session_id": "uuid",
      "exam_registration_id": "uuid",
      "course_offering_id": "uuid",
      "program_id": "uuid",
      "course_id": "uuid",
      "student_id": "uuid",
      "faculty_id": "uuid",

      "assignment_marks": 18,
      "quiz_marks": 8,
      "mid_term_marks": 25,
      "test_1_mark": 17,
      "test_2_mark": 15,

      "max_assignment_marks": 20,
      "max_quiz_marks": 10,
      "max_mid_term_marks": 30,
      "max_test_1_mark": 20,
      "max_test_2_mark": 20,

      "total_internal_marks": 83,
      "max_internal_marks": 100,
      "submission_date": "2026-04-02",
      "marks_status": "Submitted"
    }
  ]
}
```

### Response Format

**Success (HTTP 200):**
```json
{
  "success": true,
  "synced": 48,
  "failed": 2,
  "total": 50,
  "results": [
    { "index": 0, "student_id": "uuid", "course_offering_id": "uuid", "status": "updated" },
    { "index": 1, "student_id": "uuid", "course_offering_id": "uuid", "status": "error", "error": "Invalid reference — ..." }
  ]
}
```

**Auth Error (HTTP 401):**
```json
{ "error": "Invalid API key", "code": "INVALID_KEY" }
```

**Validation Error (HTTP 400):**
```json
{
  "error": "No valid records to sync",
  "synced": 0,
  "failed": 5,
  "results": [
    { "index": 0, "status": "error", "error": "Missing required fields: course_id, student_id" }
  ]
}
```

### Sync Rules

| Rule | Detail |
|------|--------|
| **Max batch size** | 500 records per request |
| **Idempotent** | Safe to retry — upserts on `(student_id, course_offering_id, examination_session_id)` |
| **Required fields** | `institutions_id`, `examination_session_id`, `exam_registration_id`, `course_offering_id`, `program_id`, `course_id`, `student_id`, `total_internal_marks`, `max_internal_marks`, `submission_date` |
| **Sanitized fields** | Only allowed fields pass through — `is_locked`, `is_approved`, `is_verified` are BLOCKED (COE controls approval workflow) |
| **Institution check** | API key is scoped to an institution — cannot sync marks for other institutions |
| **Grade values** | Only `Commended`, `Highly Commended`, `AAA`, or `null` |

### Sync Service Implementation

Build a service in MyJKKN to handle the sync:

```typescript
// services/cia-marks-sync.ts

const COE_API_URL = process.env.COE_API_URL           // e.g. https://coe.jkkn.ai
const COE_API_KEY_ID = process.env.COE_API_KEY_ID     // from COE Developer Portal
const COE_API_SECRET = process.env.COE_API_SECRET     // from COE Developer Portal

interface SyncResult {
  index: number
  student_id: string
  course_offering_id: string
  status: 'created' | 'updated' | 'error'
  error?: string
}

interface SyncResponse {
  success: boolean
  synced: number
  failed: number
  total: number
  results: SyncResult[]
}

export async function syncCiaMarksToCoe(records: Record<string, unknown>[]): Promise<SyncResponse> {
  // Batch into chunks of 500
  const BATCH_SIZE = 500
  const allResults: SyncResult[] = []
  let totalSynced = 0
  let totalFailed = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)

    const response = await fetch(`${COE_API_URL}/api/v1/cia-marks/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key-Id': COE_API_KEY_ID!,
        'X-API-Secret': COE_API_SECRET!,
      },
      body: JSON.stringify({ records: batch }),
    })

    const data: SyncResponse = await response.json()

    // Adjust indexes for batched results
    for (const r of data.results) {
      r.index += i
    }

    allResults.push(...data.results)
    totalSynced += data.synced || 0
    totalFailed += data.failed || 0
  }

  return {
    success: totalSynced > 0,
    synced: totalSynced,
    failed: totalFailed,
    total: records.length,
    results: allResults,
  }
}
```

### Sync Trigger Points

```
1. Faculty clicks "Submit" on CIA marks entry page
   → Save to local cia_marks with marks_status = 'Submitted'
   → Call syncCiaMarksToCoe() immediately
   → Update local sync_status based on response

2. Retry failed syncs (background job or manual button)
   → Query: SELECT * FROM cia_marks WHERE sync_status = 'failed'
   → Re-call syncCiaMarksToCoe()
   → Update sync_status

3. Optional: Cron job every 5 minutes
   → Query: SELECT * FROM cia_marks WHERE sync_status = 'pending' AND marks_status = 'Submitted'
   → Sync in batches
```

### Updating Local Sync Status After Sync

```typescript
// After sync response received:
for (const result of syncResponse.results) {
  if (result.status === 'error') {
    await supabase
      .from('cia_marks')
      .update({
        sync_status: 'failed',
        sync_error: result.error,
      })
      .eq('student_id', result.student_id)
      .eq('course_offering_id', result.course_offering_id)
  } else {
    await supabase
      .from('cia_marks')
      .update({
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq('student_id', result.student_id)
      .eq('course_offering_id', result.course_offering_id)
  }
}
```

---

## 5. Environment Variables Required

Add these to MyJKKN's `.env`:

```env
# COE Sync API
COE_API_URL=https://coe.jkkn.ai
COE_API_KEY_ID=<access_key_id from COE Developer Portal>
COE_API_SECRET=<secret_key from COE Developer Portal>
```

### Getting API Keys from COE

1. Login to COE as admin
2. Go to **Developer Portal → Applications**
3. Create application: Name = "MyJKKN CIA Sync", Owner = "MyJKKN Platform"
4. Go to **Permissions tab** → enable **CIA Marks: Create** (required for sync)
5. Generate API Key: Key Name = "cia-marks-sync-production"
6. Copy `access_key_id` and `secret_key` (secret shown only once!)
7. Set the application's `institutions_id` to scope which institutions it can sync for (or leave empty for all)

**Permission required:** `cia-marks:create` — Without this, the sync endpoint returns 403 Permission Denied.

---

## 6. Field Mapping Reference

Fields sent to COE sync endpoint map 1:1 to COE's `internal_marks` table:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `institutions_id` | UUID | Yes | COE institution UUID |
| `examination_session_id` | UUID | Yes | COE exam session UUID |
| `exam_registration_id` | UUID | Yes | COE exam registration UUID |
| `course_offering_id` | UUID | Yes | COE course offering UUID |
| `program_id` | UUID | Yes | COE program UUID |
| `course_id` | UUID | Yes | COE course UUID |
| `student_id` | UUID | Yes | COE student UUID |
| `faculty_id` | UUID | No | COE user UUID of the Learning Facilitator |
| `assignment_marks` | int | No | Default 0 |
| `quiz_marks` | int | No | Default 0 |
| `mid_term_marks` | int | No | Default 0 |
| `presentation_marks` | int | No | Default 0 |
| `attendance_marks` | int | No | Default 0 |
| `lab_marks` | int | No | Default 0 |
| `project_marks` | int | No | Default 0 |
| `seminar_marks` | int | No | Default 0 |
| `viva_marks` | int | No | Default 0 |
| `other_marks` | int | No | Default 0 |
| `test_1_mark` | int | No | Default 0 |
| `test_2_mark` | int | No | Default 0 |
| `test_3_mark` | int | No | Default 0 |
| `max_assignment_marks` | int | No | Null if component not used |
| `max_quiz_marks` | int | No | Null if component not used |
| `max_mid_term_marks` | int | No | Null if component not used |
| `max_presentation_marks` | int | No | Null if component not used |
| `max_attendance_marks` | int | No | Null if component not used |
| `max_lab_marks` | int | No | Null if component not used |
| `max_project_marks` | int | No | Null if component not used |
| `max_seminar_marks` | int | No | Null if component not used |
| `max_viva_marks` | int | No | Null if component not used |
| `max_other_marks` | int | No | Null if component not used |
| `max_test_1_mark` | int | No | Null if component not used |
| `max_test_2_mark` | int | No | Null if component not used |
| `max_test_3_mark` | int | No | Null if component not used |
| `total_internal_marks` | int | Yes | Sum of all component marks |
| `max_internal_marks` | int | Yes | Must be > 0 |
| `grade` | string | No | Only for status-based papers |
| `submission_date` | date | Yes | ISO format: "2026-04-02" |
| `submitted_by` | UUID | No | User who submitted |
| `marks_status` | string | No | Default "Draft". Values: Draft, Submitted |
| `remarks` | text | No | Optional notes |

### Fields NOT Sent (COE controls these)

| Field | Why |
|-------|-----|
| `is_approved` | COE admin approves after sync |
| `approved_by`, `approved_date` | Set by COE approval workflow |
| `is_verified`, `verified_by` | Set by COE verification workflow |
| `is_locked`, `locked_by` | Set by COE lock workflow |
| `created_by`, `updated_by` | Set by COE server |
| `internal_percentage` | Auto-calculated GENERATED column |

---

## 7. Error Handling

### Sync Errors to Handle

| Error | Cause | Resolution |
|-------|-------|------------|
| `401 Invalid API key` | Wrong or expired API credentials | Regenerate key in COE Developer Portal |
| `401 API key has expired` | Key past expiry date | Create new key in Developer Portal |
| `403 Application is suspended` | COE admin suspended the app | Contact COE admin |
| `400 Missing required fields` | Record missing UUID references | Fetch missing IDs from COE v1 API |
| `400 Not authorized for this institution` | API key scoped to different institution | Check key's institution assignment |
| `400 max_internal_marks must be > 0` | Invalid max marks value | Fix course configuration |
| `400 Duplicate record` | Marks already exist (shouldn't happen with upsert) | Safe to ignore — upsert handles this |
| `400 Invalid reference` | UUID doesn't exist in COE | Re-fetch reference data from COE |
| `500 Internal server error` | COE server issue | Retry after delay |

### Retry Strategy

```
Attempt 1: Immediate
Attempt 2: After 5 seconds
Attempt 3: After 30 seconds
Attempt 4: After 5 minutes
Then: Mark as 'failed', show retry button in UI
```

---

## 8. Testing Checklist

- [ ] Faculty can see only their assigned courses
- [ ] Marks entry validates component marks against max values
- [ ] Total auto-calculates from components
- [ ] Save as Draft works (local only, no sync)
- [ ] Submit triggers sync to COE
- [ ] Sync success updates local `sync_status = 'synced'`
- [ ] Sync failure stores error in `sync_error`
- [ ] Retry failed sync works
- [ ] Bulk import from Excel works
- [ ] Export template downloads correctly
- [ ] Cannot edit marks after Submit (unless rejected)
- [ ] API key auth works end-to-end
- [ ] Marks appear in COE's internal_marks table after sync
- [ ] Institution scoping prevents cross-institution sync
- [ ] Grade-only papers (Commended/Highly Commended/AAA) work
- [ ] 500+ learners batch syncs in chunks correctly
