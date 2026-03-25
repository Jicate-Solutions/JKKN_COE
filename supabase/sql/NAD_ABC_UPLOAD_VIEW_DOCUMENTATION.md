# NAD ABC Upload View Documentation

## Overview

The `nad_abc_upload_view` is a PostgreSQL database view designed to generate NAD (National Academic Depository) and ABC (Academic Bank of Credits) compliant data exports in the **Official Upload Format**.

**Key Difference from Consolidated View:**
- **Consolidated View (deprecated):** One row per student per exam session with fixed SUB1-SUB14 columns
- **Upload View (new):** One row per student per SUBJECT with 24 fixed columns

**File Location:** `supabase/sql/nad_abc_upload_view.sql`

---

## Why Per-Subject Format?

The consolidated format (SUB1-SUB14) has limitations:

| Issue | Consolidated | Upload Format |
|-------|--------------|---------------|
| Subject count | Fixed (max 14) | **Unlimited** |
| Arrear handling | Complex pivoting | Natural rows |
| NAD portal compatibility | Requires transformation | **Direct upload** |
| Different programs | May exceed column limit | Works for all |

**Real-world scenarios:**
- Engineering students: 8-10 subjects per semester + arrears = can exceed 14
- Arts programs: Different credit structures per semester
- NAD/ABC mandates: Complete credit & subject reporting, not fixed columns

---

## Official NAD Upload Format (24 Columns)

| # | Column | Description | Example |
|---|--------|-------------|---------|
| 1 | ABC_ID | Academic Bank of Credits ID (12 digits) | 100000000001 |
| 2 | STUDENT_NAME | Full name in UPPERCASE | ARUN KUMAR K |
| 3 | FATHER_NAME | Father's name in UPPERCASE | KUMAR VELU |
| 4 | MOTHER_NAME | Mother's name in UPPERCASE | LAKSHMI DEVI |
| 5 | DATE_OF_BIRTH | DD-MM-YYYY format | 15-06-2003 |
| 6 | GENDER | MALE/FEMALE/OTHER | MALE |
| 7 | PROGRAM_NAME | Full program name in UPPERCASE | BACHELOR OF ARTS HISTORY |
| 8 | PROGRAM_CODE | Program code | BA-HIST |
| 9 | SEMESTER | Semester number as string | 1 |
| 10 | ENROLLMENT_NUMBER | Student enrollment number | ENR20210001 |
| 11 | ROLL_NUMBER | Student roll number | 21BA101 |
| 12 | INSTITUTION_NAME | Institution name in UPPERCASE | JKKN ARTS AND SCIENCE COLLEGE |
| 13 | INSTITUTION_CODE | Institution code | JKKNASC |
| 14 | UNIVERSITY_NAME | Affiliating university in UPPERCASE | PERIYAR UNIVERSITY |
| 15 | ACADEMIC_YEAR | YYYY-YY format | 2024-25 |
| 16 | EXAM_SESSION | Exam session name | MAY 2024 |
| 17 | SUBJECT_CODE | Course/subject code | TAM101 |
| 18 | SUBJECT_NAME | Course/subject name in UPPERCASE | TAMIL LITERATURE |
| 19 | MAX_MARKS | Maximum marks for subject | 100 |
| 20 | MARKS_OBTAINED | Marks obtained by student | 83 |
| 21 | RESULT_STATUS | PASS or FAIL only | PASS |
| 22 | SGPA | Semester GPA (repeated per subject) | 8.28 |
| 23 | CGPA | Cumulative GPA (repeated per subject) | 8.28 |
| 24 | RESULT_DATE | DD-MM-YYYY format | 15-12-2024 |

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      nad_abc_upload_view                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Base Table: final_marks (one row per student per subject)       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Each row in final_marks = one subject for one student       ││
│  │ Filters: is_active = true, result_status = 'Published'      ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  JOINs for data enrichment:                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ students         → Personal info (name, DOB, gender)        ││
│  │ courses          → Subject code, name, max marks            ││
│  │ institutions     → Institution name, code, university       ││
│  │ programs         → Program name, code                       ││
│  │ examination_sessions → Exam session, academic year          ││
│  │ semester_results → SGPA, CGPA, result date                  ││
│  │ exam_registrations → is_regular (for ordering)              ││
│  │ course_offerings → Subject semester                         ││
│  │ course_mapping   → Course order for sorting                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↓                                   │
│  Output: One row per student per subject (dynamic count)         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Student A, Subject 1 → Row 1                                ││
│  │ Student A, Subject 2 → Row 2                                ││
│  │ Student A, Subject 3 → Row 3                                ││
│  │ Student A, Subject 4 → Row 4                                ││
│  │ Student A, Subject 5 → Row 5                                ││
│  │ Student B, Subject 1 → Row 6                                ││
│  │ ... (no fixed limit on subjects)                            ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Table Relationships (ERD)

```
final_marks  (BASE – 1 row per student per subject)
        │
        ├──→ students
        │       └── abc_id, name, DOB, gender, parent names
        │
        ├──→ courses
        │       └── course_code, course_name, total_max_mark
        │
        ├──→ institutions
        │       └── name, institution_code, affiliated_university
        │
        ├──→ programs
        │       └── program_name, program_code
        │
        ├──→ examination_sessions
        │       └── session_name, academic_year_id
        │           └──→ academic_years
        │
        ├──→ exam_registrations
        │       └── is_regular (for subject ordering)
        │
        ├──→ course_offerings
        │       └── semester (subject's original semester)
        │
        ├──→ course_mapping
        │       └── course_order (for sorting within semester)
        │
        └──→ semester_results
                └── sgpa, cgpa, result_declared_date
```

---

## Subject Ordering

Within each student's exam session, subjects are ordered:

| Priority | Type | Sort Order |
|----------|------|------------|
| 1st | Regular subjects (`is_regular = TRUE`) | By `course_order` ASC |
| 2nd | Arrear subjects (`is_regular = FALSE`) | By `semester` DESC, then `course_order` ASC |

The `subject_order` column provides the sequence number for each subject.

---

## API Endpoint

### GET /api/result-analytics/nad-csv-export

Generates CSV in the official NAD upload format.

**Query Parameters:**
- `institution_id` (optional): Filter by institution
- `examination_session_id` (optional): Filter by exam session
- `program_id` (optional): Filter by program
- `semester` (optional): Filter by semester number

**Response:** CSV file with 24 columns (one row per student per subject)

**Example:**
```bash
GET /api/result-analytics/nad-csv-export?program_id=xxx&semester=2
```

---

## Comparison: Old vs New Format

### Example: Student with 5 subjects

**Old Consolidated Format (deprecated):**
```csv
REGN_NO,CNAME,...,SUB1,SUB1_TOT,SUB2,SUB2_TOT,SUB3,SUB3_TOT,SUB4,SUB4_TOT,SUB5,SUB5_TOT
21BA101,ARUN KUMAR,...,TAM101,83,ENG101,78,HIS101,94,COM101P,86,ENV101,71
```
→ 1 row, many columns (up to 210+ for 14 subjects)

**New Upload Format:**
```csv
ABC_ID,STUDENT_NAME,...,SUBJECT_CODE,SUBJECT_NAME,MAX_MARKS,MARKS_OBTAINED,RESULT_STATUS,SGPA,CGPA,...
100000000001,ARUN KUMAR,...,TAM101,TAMIL LITERATURE,100,83,PASS,8.28,8.28,...
100000000001,ARUN KUMAR,...,ENG101,ENGLISH LITERATURE,100,78,PASS,8.28,8.28,...
100000000001,ARUN KUMAR,...,HIS101,HISTORY OF INDIA,100,94,PASS,8.28,8.28,...
100000000001,ARUN KUMAR,...,COM101P,COMPUTER PRACTICAL,100,86,PASS,8.28,8.28,...
100000000001,ARUN KUMAR,...,ENV101,ENVIRONMENTAL STUDIES,100,71,PASS,8.28,8.28,...
```
→ 5 rows, 24 fixed columns

---

## SQL Query Examples

### 1. Get all NAD upload data:
```sql
SELECT
    "ABC_ID", "STUDENT_NAME", "FATHER_NAME", "MOTHER_NAME",
    "DATE_OF_BIRTH", "GENDER", "PROGRAM_NAME", "PROGRAM_CODE",
    "SEMESTER", "ENROLLMENT_NUMBER", "ROLL_NUMBER",
    "INSTITUTION_NAME", "INSTITUTION_CODE", "UNIVERSITY_NAME",
    "ACADEMIC_YEAR", "EXAM_SESSION", "SUBJECT_CODE", "SUBJECT_NAME",
    "MAX_MARKS", "MARKS_OBTAINED", "RESULT_STATUS",
    "SGPA", "CGPA", "RESULT_DATE"
FROM nad_abc_upload_view;
```

### 2. Filter by program and semester:
```sql
SELECT *
FROM nad_abc_upload_view
WHERE program_id = 'your-program-uuid'
  AND semester_number = 2;
```

### 3. Count subjects per student:
```sql
SELECT
    "STUDENT_NAME",
    "SEMESTER",
    COUNT(*) as subject_count
FROM nad_abc_upload_view
WHERE program_id = 'your-program-uuid'
GROUP BY student_id, "STUDENT_NAME", "SEMESTER"
ORDER BY subject_count DESC;
```

---

## TypeScript Types

Reference: `types/naad-csv-format.ts`

```typescript
export interface NADUploadRow {
    ABC_ID: string
    STUDENT_NAME: string
    FATHER_NAME: string
    MOTHER_NAME: string
    DATE_OF_BIRTH: string  // DD-MM-YYYY
    GENDER: 'MALE' | 'FEMALE' | 'OTHER'
    PROGRAM_NAME: string
    PROGRAM_CODE: string
    SEMESTER: string
    ENROLLMENT_NUMBER: string
    ROLL_NUMBER: string
    INSTITUTION_NAME: string
    INSTITUTION_CODE: string
    UNIVERSITY_NAME: string
    ACADEMIC_YEAR: string  // YYYY-YY
    EXAM_SESSION: string
    SUBJECT_CODE: string
    SUBJECT_NAME: string
    MAX_MARKS: string
    MARKS_OBTAINED: string
    RESULT_STATUS: 'PASS' | 'FAIL'
    SGPA: string
    CGPA: string
    RESULT_DATE: string  // DD-MM-YYYY
}

export const NAD_UPLOAD_COLUMNS = [
    'ABC_ID', 'STUDENT_NAME', 'FATHER_NAME', 'MOTHER_NAME',
    'DATE_OF_BIRTH', 'GENDER', 'PROGRAM_NAME', 'PROGRAM_CODE',
    'SEMESTER', 'ENROLLMENT_NUMBER', 'ROLL_NUMBER',
    'INSTITUTION_NAME', 'INSTITUTION_CODE', 'UNIVERSITY_NAME',
    'ACADEMIC_YEAR', 'EXAM_SESSION', 'SUBJECT_CODE', 'SUBJECT_NAME',
    'MAX_MARKS', 'MARKS_OBTAINED', 'RESULT_STATUS',
    'SGPA', 'CGPA', 'RESULT_DATE'
] as const
```

---

## Migration Notes

### To migrate from consolidated view to upload view:

1. **Create the new view:**
   ```bash
   psql -f supabase/sql/nad_abc_upload_view.sql
   ```

2. **Update API calls:**
   - Old: `/api/result-analytics/naad-csv-export`
   - New: `/api/result-analytics/nad-csv-export`

3. **Update frontend:**
   - Tab value: `naad` → `nad`
   - Labels: "NAAD" → "NAD"

4. **The old view remains available** for backward compatibility but is deprecated.

---

## File References

| File | Purpose |
|------|---------|
| `supabase/sql/nad_abc_upload_view.sql` | New SQL view (per-subject format) |
| `supabase/sql/naad_abc_consolidated_view.sql` | Old SQL view (deprecated) |
| `app/api/result-analytics/nad-csv-export/route.ts` | New API endpoint |
| `app/api/result-analytics/naad-csv-export/route.ts` | Old API endpoint (deprecated) |
| `types/naad-csv-format.ts` | TypeScript type definitions |
| `app/(coe)/result/dashboard/page.tsx` | Dashboard with NAD tab |
| `components/layout/app-sidebar.tsx` | Sidebar with NAD link |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2024-12-24 | 1.0 | Initial consolidated view (NAAD) |
| 2024-12-26 | 2.0 | New per-subject upload view (NAD), renamed NAAD→NAD |
