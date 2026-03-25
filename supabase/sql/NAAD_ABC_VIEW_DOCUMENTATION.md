# NAD ABC Consolidated View Documentation

## Overview

The `naad_abc_consolidated_view` is a PostgreSQL database view designed to generate NAD (National Academic Depository) and ABC (Academic Bank of Credits) compliant data exports. This view transforms normalized examination data into a flat, pivoted format suitable for upload to the NAD/ABC portal.

**File Location:** `supabase/sql/naad_abc_consolidated_view.sql`

---

## Key Design Principles

### 1. One Row Per Student Per Exam Session

The view guarantees **exactly one row** per student per examination session, regardless of how many subjects (regular or arrear) the student has appeared for.

```
Student A + Nov 2024 Exam → 1 row (with all subjects pivoted into columns)
Student A + Apr 2025 Exam → 1 row (with all subjects pivoted into columns)
```

### 2. Subject Ordering Logic

Subjects are ordered using a specific priority:

| Priority | Type | Sort Order |
|----------|------|------------|
| 1st | Regular subjects (`is_regular = TRUE`) | By `course_order` ASC |
| 2nd | Arrear subjects (`is_regular = FALSE`) | By `semester` DESC, then `course_order` ASC |

**Example:** A student in Semester 3 with 4 regular + 2 arrear subjects:
- SUB1-SUB4: Regular Sem 3 subjects (sorted by course_order)
- SUB5: Arrear from Sem 2
- SUB6: Arrear from Sem 1

### 3. Subject Semester Tracking

Each subject column includes a `SUBn_SEM` field to indicate the subject's **original semester**, not the current examination semester.

---

## Architecture

### CTE Structure (Common Table Expressions)

The view uses a two-CTE approach:

```
┌─────────────────────────────────────────────────────────────────┐
│                   naad_abc_consolidated_view                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CTE 1: student_sessions                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Source: semester_results                                     ││
│  │ Purpose: Get ONE unique row per student + exam session       ││
│  │ Fields: student_id, examination_session_id, semester,        ││
│  │         sgpa, cgpa, percentage, credits                      ││
│  │ Filters: is_active = true, is_published = true              ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  CTE 2: ordered_subjects                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Source: final_marks + exam_registrations + courses          ││
│  │ Purpose: Get all subjects with ordering                      ││
│  │ Key: ROW_NUMBER() OVER (PARTITION BY student, session)      ││
│  │ Order: Regular first → Arrear by sem DESC → course_order    ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  Main SELECT: JOIN + GROUP BY + Pivot                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ FROM student_sessions (base - guarantees one row)           ││
│  │ LEFT JOIN ordered_subjects                                   ││
│  │ GROUP BY all non-aggregated fields                          ││
│  │ Use MAX(CASE WHEN subject_seq = N THEN ...) for pivoting    ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Table Relationships

### Entity Relationship Diagram

```
semester_results  (BASE – 1 row per student per exam session)
        │
        ├──→ institutions
        │
        ├──→ examination_sessions
        │       └──→ academic_years
        │
        ├──→ programs
        │
        ├──→ semester
        │
        ├──→ students
        │
        └──→ ordered_subjects (CTE)
                │
                ├──→ exam_registrations
                ├──→ final_marks
                ├──→ course_offerings
                ├──→ course_mapping
                └──→ courses
```

### Table Reference

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `semester_results` | **BASE TABLE** - one row per student per exam session | `student_id`, `examination_session_id`, `semester`, `sgpa`, `cgpa` |
| `institutions` | Institution details | `name`, `aishe_code` |
| `examination_sessions` | Exam session info | `session_code`, `session_name`, `exam_end_date` |
| `academic_years` | Academic year | `academic_year` |
| `programs` | Program/Course details | `program_code`, `program_name` |
| `students` | Personal information | `first_name`, `last_name`, `date_of_birth`, `gender`, `aadhar_number` |
| `exam_registrations` | Registration details | `is_regular` (distinguishes regular vs arrear) |
| `final_marks` | Subject-wise marks | `internal_marks_obtained`, `external_marks_obtained`, `letter_grade`, `grade_points` |
| `course_offerings` | Semester mapping | `semester` (subject's original semester) |
| `course_mapping` | Course ordering | `course_order` |
| `courses` | Subject details | `course_code`, `course_name`, `course_category`, `credit` |

---

## Column Mapping

### Organization & Course Information

| View Column | Source | Description |
|-------------|--------|-------------|
| `ORG_NAME` | `institutions.name` | Institution name (UPPERCASE) |
| `ACADEMIC_COURSE_ID` | `programs.program_code` | Program code (UPPERCASE) |
| `COURSE_NAME` | `programs.program_name` | Program name (UPPERCASE) |
| `STREAM` | - | Blank (as per NAD spec) |
| `SESSION` | `batch.batch_name` or `academic_years.academic_year` | Batch/Session identifier |

### Student Personal Information

| View Column | Source | Description |
|-------------|--------|-------------|
| `REGN_NO` | `students.register_number` or `roll_number` | Registration/Roll number |
| `RROLL` | - | Blank (as per NAD spec) |
| `CNAME` | `students.first_name + last_name` | Full name (UPPERCASE) |
| `GENDER` | `students.gender` | M/F/O |
| `DOB` | `students.date_of_birth` | Date of birth (DD/MM/YYYY format) |
| `FNAME` | `students.father_name` | Father's name (UPPERCASE) |
| `MNAME` | `students.mother_name` | Mother's name (UPPERCASE) |
| `PHOTO` | - | Blank (photo URL if needed) |

### Result Information

| View Column | Source | Description |
|-------------|--------|-------------|
| `MRKS_REC_STATUS` | - | Marks record status (blank) |
| `RESULT` | `examination_sessions.session_code` | Result/Session code |
| `YEAR` | `examination_sessions.exam_end_date` | Year extracted from exam date |
| `CSV_MONTH` | - | CSV month (blank) |
| `MONTH` | `examination_sessions.session_name` | NOV/APR based on session name |
| `PERCENT` | `semester_results.percentage` | Percentage (formatted) |
| `DOI` | - | Date of issue (blank) |
| `CERT_NO` | - | Certificate number (blank) |
| `SEM` | `semester_results.semester` | Current semester being attempted |
| `EXAM_TYPE` | - | Regular/Supplementary (blank) |
| `TOT_CREDIT` | `semester_results.total_credits_earned` | Total credits earned |
| `TOT_CREDIT_POINTS` | `semester_results.total_credit_points` | Total credit points |
| `CGPA` | `semester_results.cgpa` | Cumulative GPA |
| `ABC_ACCOUNT_ID` | `students.aadhar_number` | Aadhaar/ABC ID |
| `TERM_TYPE` | - | Fixed: "SEMESTER" |
| `TOT_GRADE` | - | Total grade (blank) |
| `DEPARTMENT` | `departments.department_name` | Department name (UPPERCASE) |

### Subject Columns (SUB1 to SUB7)

Each subject has the following columns:

| Column Pattern | Source | Description |
|----------------|--------|-------------|
| `SUBnNM` | `courses.course_name` | Subject name (UPPERCASE) |
| `SUBn` | `courses.course_code` | Subject code (UPPERCASE) |
| `SUBn_SEM` | `course_offerings.semester` | Subject's original semester |
| `SUBnMAX` | `courses.total_max_mark` | Maximum marks |
| `SUBnMIN` | `courses.total_pass_mark` | Minimum pass marks |
| `SUBn_TH_MAX` | Conditional | Theory max (only if Theory course) |
| `SUBn_TH_MIN` | Conditional | Theory min (only if Theory course) |
| `SUBn_TH_MRKS` | Conditional | Theory marks obtained |
| `SUBn_PR_MAX` | Conditional | Practical max (only if Practical course) |
| `SUBn_PR_MIN` | Conditional | Practical min (only if Practical course) |
| `SUBn_PR_MRKS` | Conditional | Practical marks obtained |
| `SUBn_PR_CE_MRKS` | Conditional | Practical CE marks |
| `SUBn_VV_MRKS` | - | Viva marks (blank) |
| `SUBn_CE_MAX` | `courses.internal_max_mark` | Internal/CE max marks |
| `SUBn_CE_MIN` | `courses.internal_pass_mark` | Internal/CE min marks |
| `SUBn_CE_MRKS` | `final_marks.internal_marks_obtained` | Internal marks obtained |
| `SUBn_TOT` | `final_marks.total_marks_obtained` | Total marks obtained |
| `SUBn_GRADE` | `final_marks.letter_grade` | Grade (AAA → U) |
| `SUBn_GRADE_POINTS` | `final_marks.grade_points` | Grade points |
| `SUBn_CREDIT` | `final_marks.credit` | Subject credits |
| `SUBn_CREDIT_POINTS` | Calculated | Credit points (grade_points × credit) |
| `SUBn_REMARKS` | `final_marks.pass_status` | P (Pass), U (Absent/Reappear) |

### Metadata Columns (For Filtering Only)

These columns are excluded from the CSV export but used for filtering:

| Column | Source | Purpose |
|--------|--------|---------|
| `semester_result_id` | `semester_results.id` | Primary key reference |
| `student_id` | `semester_results.student_id` | Student filter |
| `institution_id` | `semester_results.institutions_id` | Institution filter |
| `examination_session_id` | `semester_results.examination_session_id` | Exam session filter |
| `program_id` | `semester_results.program_id` | Program filter |
| `semester_number` | `semester_results.semester` | Semester filter |
| `total_subjects` | COUNT(DISTINCT course_id) | Subject count |

---

## Special Logic

### 1. Theory vs Practical Detection

The view uses `courses.course_category` to determine if a subject is Theory or Practical:

```sql
CASE WHEN course_category = 'Theory' THEN ...
CASE WHEN course_category = 'Practical' THEN ...
```

- **Theory courses:** Populate `SUBn_TH_*` columns
- **Practical courses:** Populate `SUBn_PR_*` columns

### 2. Grade Mapping

Special grade handling:
```sql
CASE WHEN letter_grade = 'AAA' THEN 'U'
     ELSE letter_grade
END
```

### 3. Pass Status Mapping

```sql
CASE
    WHEN pass_status = 'Pass' THEN 'P'
    WHEN pass_status IN ('Absent', 'Reappear') THEN 'U'
    ELSE first character of pass_status
END
```

### 4. Date of Birth Formatting

Handles multiple input formats and converts to DD/MM/YYYY:

```sql
CASE
    WHEN date_of_birth ~ '^\d{4}-\d{2}-\d{2}$' THEN
        TO_CHAR(TO_DATE(date_of_birth, 'YYYY-MM-DD'), 'DD/MM/YYYY')
    WHEN date_of_birth ~ '^\d{2}/\d{2}/\d{4}$' THEN
        date_of_birth  -- Already in correct format
    WHEN date_of_birth ~ '^\d{2}-\d{2}-\d{4}$' THEN
        REPLACE(date_of_birth, '-', '/')
    ELSE date_of_birth
END
```

### 5. Month Extraction

Extracts exam month from session name:

```sql
CASE
    WHEN session_name ILIKE '%NOV%' OR session_name ILIKE '%DEC%' THEN 'NOV'
    WHEN session_name ILIKE '%APR%' OR session_name ILIKE '%MAY%' THEN 'APR'
    ELSE first 3 characters (UPPERCASE)
END
```

---

## Subject Ordering Algorithm

The `ROW_NUMBER()` function assigns sequence numbers to subjects:

```sql
ROW_NUMBER() OVER (
    PARTITION BY student_id, examination_session_id
    ORDER BY
        -- Step 1: Regular subjects first (0), Arrear subjects second (1)
        CASE WHEN is_regular = TRUE THEN 0 ELSE 1 END,

        -- Step 2: For Arrear subjects only, sort by semester DESC
        CASE WHEN is_regular = FALSE THEN semester END DESC NULLS LAST,

        -- Step 3: Sort by course_order (from course_mapping)
        COALESCE(course_order, 999),

        -- Step 4: Final tie-breaker: course_code alphabetically
        course_code
)
```

**Visual Example:**

```
Student in Sem 3 appearing for:
- Regular: ENG301 (order 1), HIST302 (order 2), POL303 (order 3)
- Arrear Sem 2: MATH201 (order 1)
- Arrear Sem 1: LANG101 (order 2)

Result Order:
SUB1: ENG301  (Regular, order 1)  → SUB1_SEM = 3
SUB2: HIST302 (Regular, order 2)  → SUB2_SEM = 3
SUB3: POL303  (Regular, order 3)  → SUB3_SEM = 3
SUB4: MATH201 (Arrear Sem 2)      → SUB4_SEM = 2
SUB5: LANG101 (Arrear Sem 1)      → SUB5_SEM = 1
```

---

## API Integration

### Endpoint: `/api/result-analytics/naad-csv-export`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `institution_id` | UUID | Filter by institution |
| `examination_session_id` | UUID | Filter by exam session |
| `program_id` | UUID | Filter by program |
| `semester` | Integer | Filter by current semester |

**Response:** CSV file download

### Filter Application

Filters are applied directly in the Supabase query:

```typescript
let query = supabase
    .from('naad_abc_consolidated_view')
    .select('*')

if (institutionId) query = query.eq('institution_id', institutionId)
if (examinationSessionId) query = query.eq('examination_session_id', examinationSessionId)
if (programId) query = query.eq('program_id', programId)
if (semester) query = query.eq('semester_number', semester)
```

---

## Database Function

A helper function is also provided for programmatic access:

```sql
get_naad_abc_export_data(
    p_institution_id UUID DEFAULT NULL,
    p_examination_session_id UUID DEFAULT NULL,
    p_program_id UUID DEFAULT NULL,
    p_semester INT DEFAULT NULL
)
```

---

## Deployment

### Prerequisites

1. All required tables must exist with proper foreign key relationships
2. `exam_registrations.is_regular` column must exist
3. `course_offerings.semester` column must exist
4. `course_mapping.course_order` column must exist

### Deployment Steps

1. Open Supabase SQL Editor
2. Copy the entire contents of `naad_abc_consolidated_view.sql`
3. Execute the SQL
4. Verify: `SELECT COUNT(*) FROM naad_abc_consolidated_view;`

### Permissions

The script grants the following permissions:

```sql
-- View access
GRANT SELECT ON public.naad_abc_consolidated_view TO authenticated;
GRANT SELECT ON public.naad_abc_consolidated_view TO service_role;

-- Function access
GRANT EXECUTE ON FUNCTION get_naad_abc_export_data(...) TO authenticated;
GRANT EXECUTE ON FUNCTION get_naad_abc_export_data(...) TO service_role;
```

---

## Usage Examples

### 1. Get All Data

```sql
SELECT * FROM naad_abc_consolidated_view;
```

### 2. Filter by Program and Semester

```sql
SELECT * FROM naad_abc_consolidated_view
WHERE program_id = 'your-program-uuid'
  AND semester_number = 2;
```

### 3. Export Using Function

```sql
SELECT * FROM get_naad_abc_export_data(
    NULL,                    -- All institutions
    'exam-session-uuid',     -- Specific exam session
    'program-uuid',          -- Specific program
    3                        -- Semester 3
);
```

### 4. Export Specific Columns

```sql
SELECT
    "ORG_NAME", "ACADEMIC_COURSE_ID", "COURSE_NAME",
    "REGN_NO", "CNAME", "GENDER", "DOB",
    "SEM", "CGPA", "ABC_ACCOUNT_ID",
    "SUB1NM", "SUB1", "SUB1_SEM", "SUB1_TOT", "SUB1_GRADE"
FROM naad_abc_consolidated_view
WHERE "ACADEMIC_COURSE_ID" = 'BA-HIST';
```

---

## Troubleshooting

### Issue: Multiple Rows Per Student

**Cause:** Usually indicates a JOIN issue or missing GROUP BY column.

**Solution:** Verify the base CTE uses `semester_results` as the source.

### Issue: No Data Returned

**Causes:**
1. View not deployed to Supabase
2. No published results (`is_published = true`)
3. No active records (`is_active = true`)

**Solution:** Check data exists in `semester_results` with proper flags.

### Issue: Subjects Not Ordered Correctly

**Cause:** `is_regular` flag not set in `exam_registrations`.

**Solution:** Ensure exam registrations have proper `is_regular` values.

### Issue: Semester Filter Downloads All Semesters

**Cause:** Filter column mismatch.

**Solution:** Use `semester_number` (not `current_semester`) for filtering.

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2024-12-24 | 1.0 | Initial view with 7 subjects |
| 2024-12-26 | 1.1 | Added `SUBn_SEM` columns, fixed subject ordering |

---

## Related Files

- **SQL View:** `supabase/sql/naad_abc_consolidated_view.sql`
- **API Route:** `app/api/result-analytics/naad-csv-export/route.ts`
- **Dashboard:** `app/(coe)/result/dashboard/page.tsx`
- **Types:** `types/result-analytics.ts`
