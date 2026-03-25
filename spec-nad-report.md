# NAD Report Module Implementation Spec

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a complete NAD (National Academic Depository) / ABC (Academic Bank of Credits) CSV export engine for autonomous colleges in India. Supports two output formats: (1) Official Upload Format (one row per subject) and (2) Pivot Format (one row per learner with dynamic SUB1-SUBn columns). Includes MyJKKN API enrichment, Theory/Practical mark breakdowns, grade mapping, and arrear handling.

**Architecture:** SQL View (data source) -> API Route (pivot + enrichment) -> Frontend (filter + download). Mark breakdowns driven by `course_category` (Theory/Practical). MyJKKN API provides learner profiles (photo, DOB, gender, parent names, batch).

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL), React, Shadcn UI, Tailwind CSS

---

## Indian Regulatory Framework

### National Academic Depository (NAD)

NAD is a government initiative under the Ministry of Education (formerly MHRD), established under the Depositories Act, 1996. It serves as a digital repository for academic awards (degrees, certificates, mark sheets) issued by institutions.

| Aspect | Details |
|---|---|
| **Portal** | https://nad.digilocker.gov.in/ |
| **Governing Body** | Ministry of Education, Government of India |
| **Mandatory For** | All UGC-recognized universities and affiliated colleges |
| **Upload Format** | CSV with fixed column structure (official NAD template) |
| **Frequency** | After each examination result publication |

### Academic Bank of Credits (ABC)

ABC is a UGC initiative enabling credit accumulation and transfer across institutions. ABC IDs are linked to Aadhaar and stored alongside academic records.

| Aspect | Details |
|---|---|
| **Portal** | https://abc.gov.in/ |
| **ABC ID** | 12-digit unique identifier linked to Aadhaar |
| **Purpose** | Credit mobility, multiple entry/exit, lifelong learning |
| **Integration** | NAD uploads include ABC_ACCOUNT_ID field |

### Upload Requirements

| Requirement | Details |
|---|---|
| **Result Status** | Only `Published` results are exported |
| **Data Completeness** | All mark breakdowns (TH/PR/CE) must be populated per course category |
| **Date Format** | DD-MM-YYYY (with hyphens, not slashes) |
| **Text Case** | All text fields in UPPERCASE |
| **Gender** | Single letter: M, F, or O |
| **Semester** | Roman numerals: I, II, III, IV, V, VI, VII, VIII |

---

## Terminology (JKKN Standard)

| Standard Term | JKKN Term | Usage |
|---|---|---|
| Student | **Learner** | All UI labels, API routes, database columns |
| Teacher / Faculty | **Learning Facilitator** | Staff references |
| Failed | **Needs Improvement** | Status descriptions |
| Backlog | **Learning Opportunity** | Arrear/reappear context |

---

## Domain Overview

### What is NAD Export?

The NAD export generates a CSV file containing learner academic records (marks, grades, credits) in a format compliant with the National Academic Depository portal. Two formats are supported:

1. **Official Upload Format** - One row per learner per subject (24 fixed columns). Matches NAD portal's bulk upload template exactly.
2. **Pivot Format** - One row per learner with subjects pivoted into columns (SUB1, SUB2, ... SUBn). Used by some state portals and for internal reporting. Each subject has 25 sub-columns.

### Data Flow

```
final_marks (source of truth)
    |
    v
nad_abc_upload_view (SQL view - per-subject rows)
    |
    v
API Route (group by student, pivot subjects, enrich from MyJKKN)
    |
    v
CSV File (download)
```

### Key Concepts

| Concept | Description |
|---|---|
| **course_category** | "Theory" or "Practical" - determines which mark columns are populated |
| **External Marks** | Theory exam marks (for Theory) or Practical exam marks (for Practical) |
| **Internal Marks** | Continuous Internal Assessment (CIA) marks |
| **CE Marks** | Continuous Evaluation - same as Internal Marks |
| **Regular Subject** | Current semester subject |
| **Arrear Subject** | Previously failed subject being re-attempted |
| **is_pass** | Boolean pass/fail determination |
| **pass_status** | Detailed status: Pass, Fail, Reappear, Absent, Withheld, Expelled |
| **result_status** | Workflow state: Pending, Published, Withheld, Cancelled, Under Review |

---

## Database Schema

### Source Tables

#### `final_marks` (Primary Source)

Single source of truth for all learner marks per subject per exam session.

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `institutions_id` | UUID | FK -> institutions |
| `examination_session_id` | UUID | FK -> examination_sessions |
| `exam_registration_id` | UUID | FK -> exam_registrations |
| `course_offering_id` | UUID | FK -> course_offerings |
| `program_id` | UUID | FK -> programs |
| `course_id` | UUID | FK -> courses |
| `student_id` | UUID | FK -> students |
| `register_number` | TEXT | Denormalized register number |
| `program_code` | TEXT | Denormalized program code |
| `internal_marks_obtained` | NUMERIC | CIA / Internal marks scored |
| `internal_marks_maximum` | NUMERIC | CIA / Internal max marks (e.g., 25) |
| `external_marks_obtained` | NUMERIC | Theory or Practical exam marks scored |
| `external_marks_maximum` | NUMERIC | Theory or Practical exam max marks |
| `total_marks_obtained` | NUMERIC | Sum of internal + external + grace |
| `total_marks_maximum` | NUMERIC | Sum of max marks |
| `grace_marks` | NUMERIC | Grace marks (if approved) |
| `letter_grade` | VARCHAR | Calculated grade (O, A+, A, B+, B, C, D, F, AAA) |
| `grade_points` | NUMERIC | Numeric grade points (0-10 scale) |
| `credit` | NUMERIC | Course credits |
| `total_grade_points` | NUMERIC | Credit x Grade Points |
| `is_pass` | BOOLEAN | Pass determination |
| `pass_status` | VARCHAR | Pass, Fail, Reappear, Absent, Withheld, Expelled |
| `result_status` | VARCHAR | Pending, Published, Withheld, Cancelled, Under Review |
| `is_active` | BOOLEAN | Soft delete flag |
| `is_locked` | BOOLEAN | Cannot edit if true |

#### `courses` (Subject Details)

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `course_code` | VARCHAR | e.g., "24UGEN03" |
| `course_name` | VARCHAR | e.g., "GENERAL ENGLISH-III" |
| `course_category` | VARCHAR | "Theory" or "Practical" |
| `total_max_mark` | INTEGER | Total maximum marks (e.g., 100) |
| `total_pass_mark` | INTEGER | Total pass marks (e.g., 40) |
| `external_max_mark` | INTEGER | Theory/Practical exam max (e.g., 75) |
| `external_pass_mark` | INTEGER | Theory/Practical exam pass mark (e.g., 30) |
| `internal_max_mark` | INTEGER | CIA/Internal max (e.g., 25) |
| `internal_pass_mark` | INTEGER | CIA/Internal pass mark (e.g., 0) |
| `credit` | NUMERIC | Course credit value |

#### `semester_results` (GPA/CGPA)

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `student_id` | UUID | FK -> students |
| `examination_session_id` | UUID | FK -> examination_sessions |
| `semester` | INTEGER | Semester number (1-8) |
| `sgpa` | NUMERIC | Semester GPA = SUM(Ci x Gi) / SUM(Ci) |
| `cgpa` | NUMERIC | Cumulative GPA (all semesters) |
| `total_credits_earned` | NUMERIC | Credits passed in semester |
| `total_credit_points` | NUMERIC | SUM(Credits x Grade Points) |
| `is_published` | BOOLEAN | True if result published |
| `is_active` | BOOLEAN | Soft delete flag |
| `result_declared_date` | DATE | Date result was declared |
| `folio_number` | VARCHAR | Certificate folio number (CERT_NO in NAD) |

#### `exam_registrations` (Fallback Student Data)

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `student_id` | UUID | FK -> students |
| `student_name` | VARCHAR | Denormalized student name |
| `stu_register_no` | VARCHAR | Register number |
| `is_regular` | BOOLEAN | true = regular, false = arrear |

#### Other Referenced Tables

| Table | Key Columns Used |
|---|---|
| `students` | `first_name`, `last_name`, `register_number`, `roll_number`, `gender`, `date_of_birth`, `aadhar_number`, `father_name`, `mother_name` |
| `programs` | `program_code`, `program_name`, `degree_code`, `offering_department_id` |
| `institutions` | `name`, `institution_code`, `myjkkn_institution_ids` |
| `examination_sessions` | `session_name`, `exam_start_date`, `exam_end_date`, `result_declaration_date`, `academic_year_id` |
| `academic_years` | `academic_year` (e.g., "2024-25") |
| `course_offerings` | `semester` (subject's own semester) |
| `course_mapping` | `course_order`, `program_code`, `course_id` |
| `departments` | `department_name`, `display_name` |

---

### SQL View: `nad_abc_upload_view`

**Purpose:** Provides one row per learner per subject with all fields needed for both export formats.

**Location:** `supabase/sql/nad_abc_upload_view.sql`

**Join Strategy:**

| Table | Join Type | Reason |
|---|---|---|
| `final_marks` | FROM | Base table |
| `students` | LEFT JOIN | May be empty; fallback to `exam_registrations.student_name` and `final_marks.register_number` |
| `programs` | LEFT JOIN | May be empty; fallback to `final_marks.program_code` |
| `courses` | INNER JOIN | Always required (has mark structure) |
| `institutions` | INNER JOIN | Always required |
| `examination_sessions` | INNER JOIN | Always required |
| `exam_registrations` | LEFT JOIN | Provides `student_name` fallback and `is_regular` flag |
| `course_offerings` | LEFT JOIN | Provides subject's own semester |
| `course_mapping` | LEFT JOIN | Provides subject ordering |
| `semester_results` | LEFT JOIN | Provides SGPA/CGPA |
| `academic_years` | LEFT JOIN | Provides academic year string |
| `departments` | LEFT JOIN | Provides stream/specialization name |

**Filter Conditions:**
```sql
WHERE fm.is_active = true
  AND fm.result_status = 'Published'
```

**Subject Ordering** (ROW_NUMBER window function):
```sql
ORDER BY
  CASE WHEN is_regular = true THEN 0 ELSE 1 END,   -- Regular subjects first
  CASE WHEN is_regular = false THEN semester END DESC, -- Arrear by semester DESC
  course_order ASC,                                     -- Then by course order
  course_code ASC                                       -- Finally by code
```

**View Columns:**

NAD Standard Columns (24):
```
ABC_ID, STUDENT_NAME, FATHER_NAME, MOTHER_NAME, DATE_OF_BIRTH, GENDER,
PROGRAM_NAME, PROGRAM_CODE, SEMESTER, ENROLLMENT_NUMBER, ROLL_NUMBER,
INSTITUTION_NAME, INSTITUTION_CODE, UNIVERSITY_NAME, ACADEMIC_YEAR,
EXAM_SESSION, SUBJECT_CODE, SUBJECT_NAME, MAX_MARKS, MARKS_OBTAINED,
RESULT_STATUS, SGPA, CGPA, RESULT_DATE
```

Pivot Helper Columns:
```
degree_code, stream_name, batch_name
```

Filtering Columns:
```
final_mark_id, student_id, course_id, semester_result_id, institution_id,
examination_session_id, program_id, semester_number, is_regular_subject,
subject_semester, credit, grade_points, letter_grade
```

Mark Breakdown Columns:
```
course_category, theory_max_mark, theory_min_mark, theory_marks_obtained,
practical_max_mark, practical_min_mark, practical_marks_obtained,
practical_ce_marks, ce_max_mark, ce_min_mark, ce_marks_obtained,
internal_marks_maximum, raw_pass_status, folio_number
```

Ordering Column:
```
subject_order (ROW_NUMBER)
```

---

## Grading System

### Grade Scale (10-Point CGPA System)

| Grade | Grade Points | Marks Range | Description |
|---|---|---|---|
| O | 10 | >= 90 | Outstanding |
| A+ | 9 | 80-89 | Excellent |
| A | 8 | 70-79 | Very Good |
| B+ | 7 | 60-69 | Good |
| B | 6 | 50-59 | Above Average |
| C | 5 | 45-49 | Average |
| D | 4 | 40-44 | Pass |
| F | 0 | < 40 | Fail |
| AAA / U | 0 | Absent | Absent / Unsuccessful |

### GPA Calculation

```
SGPA = SUM(Credit_i x GradePoints_i) / SUM(Credit_i)
     where i = all courses in current semester

CGPA = SUM(SGPA_j x TotalCredits_j) / SUM(TotalCredits_j)
     where j = all completed semesters
```

### Overall Grade from CGPA

```typescript
if (cgpa >= 9) grade = 'O'
else if (cgpa >= 8) grade = 'A+'
else if (cgpa >= 7) grade = 'A'
else if (cgpa >= 6) grade = 'B+'
else if (cgpa >= 5.5) grade = 'B'
else if (cgpa >= 5) grade = 'C'
else grade = 'F'
```

### Grade Conversions for NAD Export

| Internal Grade | NAD Output | Notes |
|---|---|---|
| AAA | U | Absent -> Unsuccessful |
| All others | As-is | O, A+, A, B+, B, C, D, F |

### Credit Logic

```typescript
// If student failed (grade_points = 0), credit becomes 0
const credit = (grade_points === 0 || grade_points == null) ? 0 : course_credit
```

---

## Mark Breakdown by Course Category

### Theory Courses (`course_category = 'Theory'`)

| NAD Column | DB Source | Example |
|---|---|---|
| SUBn_TH_MAX | `courses.external_max_mark` | 75 |
| SUBn_TH_MIN | `courses.external_pass_mark` | 30 |
| SUBn_TH_MRKS | `final_marks.external_marks_obtained` | 47 |
| SUBn_CE_MAX | `courses.internal_max_mark` | 25 |
| SUBn_CE_MIN | `courses.internal_pass_mark` | 0 |
| SUBn_CE_MRKS | `final_marks.internal_marks_obtained` | 24 |
| SUBn_TOT | `final_marks.total_marks_obtained` | 71 |
| SUBn_PR_MAX | (empty) | |
| SUBn_PR_MIN | (empty) | |
| SUBn_PR_MRKS | (empty) | |
| SUBn_PR_CE_MRKS | (empty) | |

### Practical Courses (`course_category = 'Practical'`)

| NAD Column | DB Source | Example |
|---|---|---|
| SUBn_PR_MAX | `courses.external_max_mark` | 60 |
| SUBn_PR_MIN | `courses.external_pass_mark` | 24 |
| SUBn_PR_MRKS | `final_marks.external_marks_obtained` | 40 |
| SUBn_PR_CE_MRKS | `final_marks.internal_marks_obtained` | 33 |
| SUBn_CE_MAX | `courses.internal_max_mark` | 40 |
| SUBn_CE_MIN | `courses.internal_pass_mark` | 0 |
| SUBn_CE_MRKS | `final_marks.internal_marks_obtained` | 33 |
| SUBn_TOT | `final_marks.total_marks_obtained` | 73 |
| SUBn_TH_MAX | (empty) | |
| SUBn_TH_MIN | (empty) | |
| SUBn_TH_MRKS | (empty) | |

### Common Columns (All Course Categories)

| NAD Column | DB Source |
|---|---|
| SUBnNM | `courses.course_name` |
| SUBn | `courses.course_code` |
| SUBnMAX | `courses.total_max_mark` |
| SUBnMIN | `total_max_mark * 0.4` (40% pass) |
| SUBn_GRADE | `final_marks.letter_grade` (AAA -> U) |
| SUBn_GRADE_POINTS | `final_marks.grade_points` |
| SUBn_CREDIT | `final_marks.credit` (0 if failed) |
| SUBn_CREDIT_POINTS | `grade_points * credit` |
| SUBn_REMARKS | Pass status mapping (see below) |
| SUBn_VV_MRKS | (empty) |
| SUBn_VV_MIN | (empty) |
| SUBn_VV_MAX | (empty) |
| SUBn_TH_CE_MRKS | (empty) |
| SUBn_CREDIT_ELIGIBILITY | (empty) |

---

## Pass Status & Remarks Mapping

### Remarks Conversion (`SUBn_REMARKS`)

| `final_marks.pass_status` | NAD Remarks | Description |
|---|---|---|
| Pass | P | Passed |
| Fail | RA | Re-Appear |
| Absent | RA | Re-Appear (Absent treated as RA per NAD) |
| Reappear | RA | Re-Appear |
| Withheld | (empty) | Withheld |
| Expelled | (empty) | Expelled |

### Implementation

```typescript
let remarks = ''
const rawStatus = (pass_status || '').toLowerCase()
if (rawStatus.includes('absent')) remarks = 'RA'
else if (rawStatus.includes('reappear') || rawStatus.includes('fail')) remarks = 'RA'
else if (rawStatus.includes('pass') || is_pass) remarks = 'P'
```

---

## Pivot Export CSV Format

### Column Structure

The pivot CSV has three sections:

```
[Fixed Columns (29)] + [Subject Columns (25 x N)] + [End Columns (4)]
```

Where N = max subjects per student in the export.

### Fixed Columns (29 columns)

| # | Column | Value Source | Rules |
|---|---|---|---|
| 1 | ORG_NAME | `institutions.name` | UPPERCASE |
| 2 | COURSE_NAME | Parsed from program name | Degree only: "B.A.", "B.Sc.", "M.A." |
| 3 | STREAM | Parsed from program name or `departments.department_name` | Specialization: "ENGLISH", "COMPUTER SCIENCE" |
| 4 | SESSION | MyJKKN `batch_name` or derived from register number | e.g., "2024-2027" |
| 5 | REGN_NO | `final_marks.register_number` | As-is |
| 6 | RROLL | (empty) | Not fetched |
| 7 | CNAME | Student name (from view or MyJKKN) | UPPERCASE |
| 8 | GENDER | MyJKKN profile or COE | Single letter: M, F, O |
| 9 | DOB | MyJKKN profile or COE | DD-MM-YYYY |
| 10 | FNAME | (empty) | Per NAD requirements |
| 11 | MNAME | (empty) | Not fetched |
| 12 | PHOTO | MyJKKN profile photo URL | Full URL |
| 13 | MRKS_REC_STATUS | Hardcoded "O" | Always "O" |
| 14 | RESULT | (empty) | Not fetched |
| 15 | YEAR | Extracted from exam session | YYYY |
| 16 | CSV_MONTH | Extracted from exam session | NOVEMBER, MAY, etc. |
| 17 | MONTH | Extracted from exam session | NOVEMBER, MAY, etc. |
| 18 | PERCENT | (empty) | Not fetched |
| 19 | DOI | (empty) | Not fetched |
| 20 | CERT_NO | (empty) | Not fetched |
| 21 | SEM | Semester number | Roman numeral: I, II, III, IV, V, VI, VII, VIII |
| 22 | EXAM_TYPE | Hardcoded "REGULAR" | Always "REGULAR" |
| 23 | TOT_CREDIT | Sum of all subject credits | Integer |
| 24 | TOT_CREDIT_POINTS | Sum of all credit points | Decimal |
| 25 | CGPA | (empty) | Not fetched |
| 26 | ABC_ACCOUNT_ID | `students.aadhar_number` | 12-digit |
| 27 | TERM_TYPE | Hardcoded "SEMESTER" | Always "SEMESTER" |
| 28 | TOT_GRADE | (empty) | Not fetched |
| 29 | DEPARTMENT | (empty) | Not fetched |

### Subject Columns (25 per subject)

For each subject SUBn (n = 1, 2, 3, ...):

| # | Column | Description |
|---|---|---|
| 1 | SUBnNM | Subject name |
| 2 | SUBn | Subject code |
| 3 | SUBnMAX | Total max marks |
| 4 | SUBnMIN | Total min/pass marks |
| 5 | SUBn_TH_MAX | Theory max (Theory only) |
| 6 | SUBn_VV_MRKS | Viva marks (empty) |
| 7 | SUBn_PR_CE_MRKS | Practical CE marks (Practical only) |
| 8 | SUBn_TH_MIN | Theory min (Theory only) |
| 9 | SUBn_PR_MAX | Practical max (Practical only) |
| 10 | SUBn_PR_MIN | Practical min (Practical only) |
| 11 | SUBn_CE_MAX | CE/Internal max (Theory only) |
| 12 | SUBn_CE_MIN | CE/Internal min (Theory only) |
| 13 | SUBn_TH_MRKS | Theory marks obtained (Theory only) |
| 14 | SUBn_PR_MRKS | Practical marks obtained (Practical only) |
| 15 | SUBn_CE_MRKS | CE/Internal marks obtained (always) |
| 16 | SUBn_TOT | Total marks obtained |
| 17 | SUBn_GRADE | Letter grade (AAA -> U) |
| 18 | SUBn_GRADE_POINTS | Grade points (0-10) |
| 19 | SUBn_CREDIT | Credit (0 if failed) |
| 20 | SUBn_CREDIT_POINTS | Credit x Grade Points |
| 21 | SUBn_REMARKS | P, RA, or empty |
| 22 | SUBn_VV_MIN | Viva min (empty) |
| 23 | SUBn_VV_MAX | Viva max (empty) |
| 24 | SUBn_TH_CE_MRKS | Theory CE marks (empty) |
| 25 | SUBn_CREDIT_ELIGIBILITY | Credit eligibility (empty) |

### End Columns (4 columns)

| # | Column | Value Source |
|---|---|---|
| 1 | AADHAAR_NAME | MyJKKN `aadhaar_name` |
| 2 | ADMISSION_YEAR | MyJKKN `admission_year` |
| 3 | UNSANI_URI_DATA_KEY | (empty) |
| 4 | URI_DATA_KEY | (empty) |

---

## Official Upload CSV Format (24 Columns)

One row per learner per subject. Used for direct upload to NAD portal.

| # | Column | Source |
|---|---|---|
| 1 | ABC_ID | `students.aadhar_number` |
| 2 | STUDENT_NAME | `students.first_name + last_name` (UPPERCASE) |
| 3 | FATHER_NAME | `students.father_name` (UPPERCASE) |
| 4 | MOTHER_NAME | `students.mother_name` (UPPERCASE) |
| 5 | DATE_OF_BIRTH | DD-MM-YYYY |
| 6 | GENDER | MALE / FEMALE / OTHER |
| 7 | PROGRAM_NAME | `programs.program_name` (UPPERCASE) |
| 8 | PROGRAM_CODE | `programs.program_code` (UPPERCASE) |
| 9 | SEMESTER | Number as string |
| 10 | ENROLLMENT_NUMBER | `students.register_number` |
| 11 | ROLL_NUMBER | `students.roll_number` |
| 12 | INSTITUTION_NAME | `institutions.name` (UPPERCASE) |
| 13 | INSTITUTION_CODE | `institutions.institution_code` (UPPERCASE) |
| 14 | UNIVERSITY_NAME | Hardcoded (e.g., "PERIYAR UNIVERSITY") |
| 15 | ACADEMIC_YEAR | YYYY-YY format (e.g., "2024-25") |
| 16 | EXAM_SESSION | e.g., "MAY 2024", "NOVEMBER 2024" (UPPERCASE) |
| 17 | SUBJECT_CODE | `courses.course_code` (UPPERCASE) |
| 18 | SUBJECT_NAME | `courses.course_name` (UPPERCASE) |
| 19 | MAX_MARKS | `courses.total_max_mark` |
| 20 | MARKS_OBTAINED | `final_marks.total_marks_obtained` |
| 21 | RESULT_STATUS | PASS or FAIL |
| 22 | SGPA | Decimal with 2 places |
| 23 | CGPA | Decimal with 2 places |
| 24 | RESULT_DATE | DD-MM-YYYY |

---

## MyJKKN API Integration

### Purpose

Enrich NAD export with learner profile data not stored in COE local database:
- GENDER, DOB, FATHER_NAME, MOTHER_NAME (personal details)
- PHOTO URL (learner photo)
- BATCH_NAME (session/batch identifier)
- PROGRAM_NAME (full program name for COURSE_NAME/STREAM parsing)
- AADHAAR_NAME, ADMISSION_YEAR (end columns)

### Endpoints Used

#### 1. Learner Profiles

```
GET {MYJKKN_API_URL}/api-management/learners/profiles
Headers:
  Authorization: Bearer {MYJKKN_API_KEY}
  Accept: application/json
Query Parameters:
  institution_id: {myjkkn_institution_id}
  limit: 200 (max per page)
  page: {page_number}
Response:
  { data: LearnerProfile[] }
```

#### 2. Programs

```
GET {MYJKKN_API_URL}/api-management/organizations/programs
Headers:
  Authorization: Bearer {MYJKKN_API_KEY}
  Accept: application/json
Query Parameters:
  institution_id: {myjkkn_institution_id}
  is_active: true
  limit: 1000
Response:
  { data: Program[] }
```

### Institution ID Mapping

```typescript
// COE institution has myjkkn_institution_ids array
const { data: institution } = await supabase
  .from('institutions')
  .select('myjkkn_institution_ids')
  .eq('id', institutionId)
  .single()

const myjkknIds: string[] = institution?.myjkkn_institution_ids || []

// MyJKKN ignores institution_id server-side - all learners returned regardless
// Fetch once using first ID to avoid duplicates
const fetchInstId = myjkknIds[0]
```

### Learner Profile Interface

```typescript
interface LearnerProfile {
  register_number?: string
  roll_number?: string
  first_name?: string
  last_name?: string
  father_name?: string
  mother_name?: string
  date_of_birth?: string        // ISO: YYYY-MM-DD
  gender?: string
  students_photo_url?: string   // MyJKKN uses 'students' (plural)
  student_photo_url?: string
  photo_url?: string
  profile_photo?: string
  image_url?: string
  institution_id?: string
  admission_year?: number | string
  aadhaar_name?: string
  batch_name?: string           // e.g., "2024-2027"
}
```

### Photo URL Resolution (Multiple Field Names)

```typescript
student.photo_url = profile.students_photo_url
  || profile.student_photo_url
  || profile.photo_url
  || profile.profile_photo
  || profile.image_url
  || ''
```

### DOB Format Conversion

```typescript
// MyJKKN: YYYY-MM-DD -> NAD: DD-MM-YYYY
if (rawDob && /^\d{4}-\d{2}-\d{2}$/.test(rawDob)) {
  const [y, m, d] = rawDob.split('-')
  student.date_of_birth = `${d}-${m}-${y}`
}
```

### Batch Name Derivation (Fallback)

```typescript
// From register number prefix: "24JUGENG001" -> "2024-2027"
function deriveBatchName(registerNumber: string): string {
  const match = registerNumber.match(/^(\d{2})/)
  if (!match) return ''
  const admYear = 2000 + parseInt(match[1])
  return `${admYear}-${admYear + 3}`
}
```

### Program Name Parsing

```typescript
// "B.A ENGLISH" -> { shortForm: "B.A", stream: "ENGLISH" }
// "B.Sc. COMPUTER SCIENCE" -> { shortForm: "B.SC.", stream: "COMPUTER SCIENCE" }
function parseProgramName(programName: string): { shortForm: string; stream: string } {
  const match = programName.match(/^([A-Z]+\.?[A-Za-z]*\.?)\s+(.+)$/i)
  if (match) return { shortForm: match[1].toUpperCase(), stream: match[2].trim() }
  return { shortForm: programName, stream: '' }
}
```

### Environment Variables

```
MYJKKN_API_URL=https://www.jkkn.ai
MYJKKN_API_KEY=<api-key>
```

---

## Semester Correction & Arrear Handling

### Problem

The view's `semester_number` falls back to `course_offerings.semester` when `semester_results` is missing. This causes arrear students (e.g., Semester 3 student retaking Semester 1 course) to appear under the wrong semester.

### Solution

Compute each student's real semester as `max(subject_semester)` across all subjects, post-grouping:

```typescript
for (const [key, student] of studentMap.entries()) {
  const maxSemester = student.subjects.length > 0
    ? Math.max(...student.subjects.map(s => s.subject_semester))
    : student.semester
  student.semester = maxSemester

  // Filter out students whose real semester doesn't match requested filter
  if (semester && maxSemester !== semester) {
    studentMap.delete(key)
  }
}
```

### Subject Ordering in CSV

1. **Regular subjects first** (current semester, by course_order)
2. **Arrear subjects second** (by semester DESC, then course_order)

---

## Helper Functions

### Roman Numeral Conversion

```typescript
function toRomanNumeral(num: number): string {
  const romanNumerals: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ]
  let result = ''
  for (const [value, numeral] of romanNumerals) {
    while (num >= value) {
      result += numeral
      num -= value
    }
  }
  return result || 'I'
}
```

### Month Extraction

```typescript
function extractMonth(examSession: string): string {
  const monthMap: Record<string, string> = {
    'jan': 'JANUARY', 'feb': 'FEBRUARY', 'mar': 'MARCH',
    'apr': 'APRIL', 'may': 'MAY', 'jun': 'JUNE',
    'jul': 'JULY', 'aug': 'AUGUST', 'sep': 'SEPTEMBER',
    'oct': 'OCTOBER', 'nov': 'NOVEMBER', 'dec': 'DECEMBER'
  }
  for (const [abbrev, full] of Object.entries(monthMap)) {
    if (examSession.toLowerCase().includes(abbrev)) return full
  }
  return ''
}
```

### Year Extraction

```typescript
function extractYear(examSession: string): string {
  const match = examSession.match(/(\d{4})/)
  return match ? match[1] : ''
}
```

### Gender Formatting

```typescript
function formatGender(gender: string): string {
  const g = gender.toLowerCase().trim()
  if (g.startsWith('m')) return 'M'
  if (g.startsWith('f')) return 'F'
  return gender.charAt(0).toUpperCase()
}
```

### CSV Escaping

```typescript
function escapeCSVField(field: string | number | null | undefined): string {
  const str = String(field || '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
```

---

## TypeScript Interfaces

### SubjectData

```typescript
interface SubjectData {
  course_code: string
  course_name: string
  course_category: string           // 'THEORY' or 'PRACTICAL'
  total_max_mark: number
  total_min_mark: number
  theory_max_mark: number | null
  theory_min_mark: number | null
  theory_marks_obtained: number | null
  practical_max_mark: number | null
  practical_min_mark: number | null
  practical_marks_obtained: number | null
  practical_ce_marks: number | null
  internal_max_mark: number | null
  internal_min_mark: number | null
  internal_marks_obtained: number | null
  total_marks_obtained: number
  letter_grade: string | null
  grade_points: number | null
  credit: number
  credit_points: number | null
  pass_status: string
  raw_pass_status: string           // For REMARKS mapping
  is_regular: boolean
  subject_order: number
  subject_semester: number
}
```

### StudentData

```typescript
interface StudentData {
  student_id: string
  register_number: string
  roll_number: string
  student_name: string
  father_name: string
  mother_name: string
  date_of_birth: string             // DD-MM-YYYY
  gender: string
  photo_url: string
  aadhar_number: string
  program_code: string
  program_name: string
  degree_code: string               // B.A, B.Sc
  stream_name: string               // ENGLISH, etc.
  batch_name: string                // 2024-2027
  department_name: string
  institution_name: string
  academic_year: string
  exam_session: string
  semester: number
  sgpa: number
  cgpa: number
  total_credits: number
  total_credit_points: number
  overall_grade: string
  overall_result: string
  percentage: number
  result_date: string
  folio_number: string
  subjects: SubjectData[]
  aadhaar_name: string
  admission_year: string
}
```

### LearnerProfile (MyJKKN)

```typescript
interface LearnerProfile {
  register_number?: string
  roll_number?: string
  first_name?: string
  last_name?: string
  father_name?: string
  mother_name?: string
  date_of_birth?: string
  gender?: string
  students_photo_url?: string
  student_photo_url?: string
  photo_url?: string
  profile_photo?: string
  image_url?: string
  institution_id?: string
  admission_year?: number | string
  aadhaar_name?: string
  batch_name?: string
}
```

---

## Module Structure

```
project/
|
+-- types/
|   +-- naad-csv-format.ts              # NAD/ABC TypeScript interfaces
|
+-- lib/
|   +-- naad-abc-export.ts              # CSV generation utilities
|
+-- supabase/
|   +-- sql/
|   |   +-- nad_abc_upload_view.sql     # SQL view definition (source of truth)
|   +-- migrations/
|       +-- YYYYMMDD_update_nad_abc_upload_view.sql  # Migration file
|
+-- app/
|   +-- api/
|   |   +-- result-analytics/
|   |       +-- nad-csv-export/
|   |       |   +-- route.ts            # GET - Official upload format (24 columns)
|   |       +-- nad-pivot-export/
|   |           +-- route.ts            # GET/POST - Pivot format (SUB1-SUBn)
|   +-- (coe)/
|       +-- result/
|           +-- dashboard/
|               +-- page.tsx            # Result analytics dashboard with export buttons
|
+-- .env.local
    MYJKKN_API_URL=...
    MYJKKN_API_KEY=...
```

---

## API Endpoints

### GET `/api/result-analytics/nad-pivot-export`

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `institution_id` | UUID | No | Filter by institution |
| `examination_session_id` | UUID | No | Filter by exam session |
| `program_id` | UUID | No | Filter by program |
| `semester` | INTEGER | No | Filter by semester (1-8) |
| `max_subjects` | INTEGER | No | Max subject columns (default: 20) |

**Response (Success):**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="nad_pivot_export_2026-03-07.csv"
```

**Response (No Data):**
```json
{
  "success": true,
  "message": "No published results found for the selected filters",
  "csv": "",
  "row_count": 0
}
```

**Response (Error):**
```json
{
  "error": "Failed to generate NAD Pivot CSV export",
  "details": "..."
}
```

### POST `/api/result-analytics/nad-pivot-export`

**Body (Preview Mode):**
```json
{
  "institution_id": "...",
  "examination_session_id": "...",
  "program_id": "...",
  "semester": 3,
  "preview_only": true
}
```

**Response (Preview):**
```json
{
  "success": true,
  "preview": {
    "total_students": 150,
    "total_subject_records": 1200,
    "max_subjects_per_student": 8,
    "total_columns": 229,
    "fixed_columns": 29,
    "subject_columns_per_subject": 25
  }
}
```

### GET `/api/result-analytics/nad-csv-export`

Same query parameters. Returns official upload format CSV (one row per subject, 24 columns).

---

## Processing Pipeline

### Step-by-Step Flow (Pivot Export)

```
1. Parse filter parameters from URL
2. Query nad_abc_upload_view with filters
3. If no data -> return JSON "no data" message
4. Group rows by student (Map: student_id+session_id -> StudentData)
5. For each row:
   a. Initialize student record if new
   b. Create SubjectData from view row
   c. Determine course_category (THEORY/PRACTICAL)
   d. Map mark breakdown fields
   e. Add subject to student, update totals
6. Semester correction: student.semester = max(subject_semester)
7. Filter by semester if requested
8. Calculate percentage and overall grade per student
9. Fetch MyJKKN learner profiles (paginated, 200/page)
10. Create lookup map by register_number
11. Enrich each student with MyJKKN data (gender, DOB, photo, etc.)
12. Fetch MyJKKN programs for COURSE_NAME/STREAM resolution
13. Determine max subjects needed
14. Generate CSV header row
15. Generate CSV data rows (fixed + subject + end columns)
16. Escape CSV fields
17. Return CSV response with download headers
```

---

## Frontend Integration

### Dashboard Page

**Location:** `app/(coe)/result/dashboard/page.tsx`

**Filters:**
- Institution selector (from `useInstitutionFilter()`)
- Examination session dropdown
- Program dropdown
- Semester selector

**Export Buttons:**
- "NAD CSV" button -> calls `/api/result-analytics/nad-csv-export`
- "NAD Pivot CSV" button -> calls `/api/result-analytics/nad-pivot-export`

**Download Handler Pattern:**

```typescript
const handleExport = async () => {
  const params = new URLSearchParams()
  if (institutionId) params.set('institution_id', institutionId)
  if (sessionId) params.set('examination_session_id', sessionId)
  if (programId) params.set('program_id', programId)
  if (semester) params.set('semester', String(semester))

  const response = await fetch(`/api/result-analytics/nad-pivot-export?${params}`)

  if (response.headers.get('content-type')?.includes('text/csv')) {
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = response.headers.get('content-disposition')
      ?.match(/filename="(.+)"/)?.[1] || 'nad_export.csv'
    a.click()
    URL.revokeObjectURL(url)
  } else {
    const json = await response.json()
    toast({ title: 'No data', description: json.message })
  }
}
```

---

## Error Handling & Edge Cases

### View Not Found

```typescript
if (viewError.code === '42P01') {  // PostgreSQL "undefined_table"
  return NextResponse.json({
    error: 'NAD view not found. Please run the SQL migration.',
    details: 'Execute: supabase/sql/nad_abc_upload_view.sql'
  }, { status: 404 })
}
```

### Missing Data Fallbacks

| Missing Field | Fallback Source |
|---|---|
| `students.first_name` | `exam_registrations.student_name` |
| `students.register_number` | `final_marks.register_number` |
| `programs.program_code` | `final_marks.program_code` |
| `programs.program_name` | `final_marks.program_code` |
| MyJKKN DOB | COE `students.date_of_birth` |
| MyJKKN gender | COE `students.gender` |
| MyJKKN father_name | Empty |
| MyJKKN photo | Empty |
| batch_name | Derived from register number prefix |

### MyJKKN API Failure

If MyJKKN API is unreachable or returns errors, the export continues with existing COE data. No enrichment is applied, but the CSV is still generated.

---

## Validation Rules

| Rule | Details |
|---|---|
| Only published results | `result_status = 'Published'` filter in view |
| Active records only | `is_active = true` filter in view |
| Date format | DD-MM-YYYY with hyphens (not slashes) |
| Text case | All text fields UPPERCASE |
| Gender format | Single letter: M, F, or O |
| Semester format | Roman numerals: I, II, III, etc. |
| Grade conversion | AAA -> U |
| Credit when failed | 0 (when grade_points = 0) |
| CSV escaping | Fields with commas/quotes/newlines must be quoted |
| Marks non-negative | All marks >= 0 |
| SGPA/CGPA range | 0.00 to 10.00 |
| Grade points range | 0 to 10 |

---

## Performance Considerations

### Query Optimization

- SQL view uses LEFT JOIN for optional tables (students, programs)
- INNER JOIN only for guaranteed tables (courses, institutions, examination_sessions)
- Indexes recommended: `final_marks(result_status)`, `final_marks(examination_session_id, student_id)`
- Use `.range(0, 9999)` to override Supabase's default 1000-row limit

### MyJKKN API Pagination

- Learner profiles: 200 records per page (API max)
- Programs: Single request with `limit=1000`
- Stop pagination when `records_returned < page_size`
- Fetch from first `myjkkn_institution_id` only (MyJKKN ignores institution_id server-side)

### Memory

- Group data in-memory using `Map<string, StudentData>`
- Key: `student_id-examination_session_id`
- Subjects added as array per student
- CSV rows streamed to response (not buffered)

---

## Testing Checklist

### Functional Tests

- [ ] Export with all filters applied (institution + session + program + semester)
- [ ] Export with no filters (all published data)
- [ ] Export with single semester filter
- [ ] Empty result set returns JSON "No data" message (not empty CSV)
- [ ] CSV file downloads with correct filename
- [ ] CSV headers match NAD format exactly
- [ ] CSV data properly escaped (commas, quotes, newlines in course names)

### Mark Breakdown Tests

- [ ] Theory course: TH_MAX, TH_MIN, TH_MRKS, CE_MAX, CE_MIN, CE_MRKS populated
- [ ] Practical course: PR_MAX, PR_MIN, PR_MRKS, PR_CE_MRKS populated
- [ ] Theory course: PR columns empty
- [ ] Practical course: TH columns empty
- [ ] CE_MRKS always populated (both Theory and Practical)
- [ ] TOT = TH_MRKS + CE_MRKS (Theory) or PR_MRKS + PR_CE_MRKS (Practical)

### Grade & Credit Tests

- [ ] AAA grade converted to U in output
- [ ] Credit = 0 when grade_points = 0
- [ ] Credit points = grade_points x credit
- [ ] SGPA/CGPA formatted to 2 decimal places
- [ ] Pass -> P remarks, Fail/Absent -> RA remarks

### MyJKKN Integration Tests

- [ ] Gender updated from MyJKKN profile
- [ ] DOB converted from ISO (YYYY-MM-DD) to DD-MM-YYYY
- [ ] Photo URL resolved (multiple field name fallbacks)
- [ ] Batch name populated from profile
- [ ] Program names resolved -> COURSE_NAME + STREAM split correctly
- [ ] Pagination works for > 200 learners
- [ ] API failure gracefully handled (continues with COE data)

### Arrear Handling Tests

- [ ] Regular subjects appear before arrear subjects
- [ ] Arrear subjects sorted by semester DESC
- [ ] Student's real semester = max(subject_semester)
- [ ] Semester filter works correctly for students with arrears
- [ ] Student with 17+ subjects (current + arrear) exports all subjects

### Edge Cases

- [ ] Student with 0 subjects (should not appear in CSV)
- [ ] Student with > 20 subjects (respects max_subjects parameter)
- [ ] `students` table empty (fallback to exam_registrations + final_marks)
- [ ] `programs` table empty (fallback to final_marks.program_code)
- [ ] Missing MyJKKN credentials (warns but continues)
- [ ] Multiple institutions in single export

---

## Deployment Notes

### Database Setup

1. Run SQL view creation:
   ```sql
   -- Execute: supabase/sql/nad_abc_upload_view.sql
   ```

2. Verify grants:
   ```sql
   GRANT SELECT ON public.nad_abc_upload_view TO authenticated;
   GRANT SELECT ON public.nad_abc_upload_view TO service_role;
   ```

3. Recommended indexes:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_final_marks_result_status ON final_marks(result_status);
   CREATE INDEX IF NOT EXISTS idx_final_marks_session_student ON final_marks(examination_session_id, student_id);
   CREATE INDEX IF NOT EXISTS idx_final_marks_program ON final_marks(program_id);
   ```

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
MYJKKN_API_URL=https://www.jkkn.ai
MYJKKN_API_KEY=...
```

### Permissions (RBAC)

| Role | Can Export | Scope |
|---|---|---|
| Regular user | Yes | Own institution only |
| super_admin (All Institutions) | Yes | Must select institution first |
| super_admin (Specific Institution) | Yes | Selected institution only |

---

*Spec version: 1.0 | Created: 2026-03-07 | Author: Claude (JKKN COE Project)*
