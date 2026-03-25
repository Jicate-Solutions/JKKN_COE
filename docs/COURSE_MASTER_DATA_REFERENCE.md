# Course & Course Mapping - Master Data Reference Sheet

**Version:** 1.0  
**Last Updated:** October 8, 2025  
**Purpose:** Comprehensive reference for all master data, validation rules, and dropdown values used in Course and Course Mapping modules

---

## Table of Contents
1. [Master Data Dependencies](#master-data-dependencies)
2. [Course Module Reference](#course-module-reference)
3. [Course Mapping Module Reference](#course-mapping-module-reference)
4. [Upload Template Field Mappings](#upload-template-field-mappings)
5. [Validation Rules Summary](#validation-rules-summary)
6. [Common Errors & Solutions](#common-errors--solutions)

---

## Master Data Dependencies

### Required Tables (Must Exist Before Course/Mapping Creation)

| Table | Primary Key | Used In | Required For | API Endpoint |
|-------|------------|---------|--------------|--------------|
| **institutions** | institution_code | Course, Course Mapping | Course creation | `/api/institutions` |
| **regulations** | regulation_code | Course | Course creation | `/api/regulations` |
| **departments** | department_code | Course | Offering department (optional) | `/api/departments` |
| **courses** | id (UUID), course_code | Course Mapping | Mapping creation | `/api/courses` |
| **batches** | batch_code | Course Mapping | Mapping creation | `/api/batch` |
| **semesters** | semester_code | Course Mapping | Semester assignment (optional) | `/api/semesters` |
| **programs** | program_code | Course Mapping (via course) | Auto-populated | `/api/programs` |

---

## Course Module Reference

### 1. Required Fields (*)

| Field Name | Data Type | Source | Validation Rules | Example |
|-----------|-----------|--------|------------------|---------|
| **Institution Code*** | String | Dropdown (institutions table) | Must exist in institutions table | `JKKN` |
| **Regulation Code*** | String | Dropdown (regulations table) | Must exist in regulations table | `REG2023` |
| **Course Code*** | String | Manual Input | Alphanumeric + hyphens/underscores only. Pattern: `/^[A-Za-z0-9\-_]+$/` | `CS101`, `MAT-201` |
| **Course Title*** | String | Manual Input | Non-empty string | `Data Structures` |
| **Display Code*** | String | Auto-populated from Course Code | Non-empty string | `CS101` |
| **QP Code*** | String | Auto-populated from Course Code | Non-empty string | `CS101` |
| **Course Category*** | String | Dropdown | Must select from predefined list | `Theory` |
| **Evaluation Type*** | String | Dropdown | Must be: `CA`, `ESE`, or `CA + ESE` | `CA + ESE` |
| **Result Type*** | String | Dropdown | Must be: `Mark` or `Status` | `Mark` |

### 2. Optional Fields

| Field Name | Data Type | Source | Validation Rules | Example |
|-----------|-----------|--------|------------------|---------|
| **Offering Department Code** | String | Dropdown (departments table) | Must exist in departments table if provided | `CSE` |
| **Course Type** | String | Dropdown | Select from predefined list | `Core` |
| **Part** | String | Dropdown | `Part I` to `Part V` | `Part III` |
| **Credit** | Integer | Manual Input | 0-99 | `4` |
| **Split Credit** | Boolean | Toggle Switch | `true`/`false` | `true` |
| **Theory Credit** | Integer | Manual Input (enabled when Split Credit = true) | 0-99, required if Split Credit enabled | `3` |
| **Practical Credit** | Integer | Manual Input (enabled when Split Credit = true) | 0-99, required if Split Credit enabled | `1` |
| **E-Code Name** | String | Dropdown | Optional language selection | `Tamil` |
| **Duration (hours)** | Integer | Manual Input | 0-9999 | `45` |
| **Self Study Course** | Boolean | Toggle Switch | `true`/`false` | `false` |
| **Outside Class Course** | Boolean | Toggle Switch | `true`/`false` | `false` |
| **Open Book** | Boolean | Toggle Switch | `true`/`false` | `false` |
| **Online Course** | Boolean | Toggle Switch | `true`/`false` | `true` |
| **Dummy Number Required** | Boolean | Toggle Switch | `true`/`false` | `false` |
| **Annual Course** | Boolean | Toggle Switch | `true`/`false` | `false` |
| **Multiple QP Set** | Boolean | Toggle Switch | `true`/`false` | `false` |
| **No of QP Setter** | Integer | Manual Input | 0-100 | `2` |
| **No of Scrutinizer** | Integer | Manual Input | 0-100 | `1` |
| **Fee Exception** | Boolean | Toggle Switch | `true`/`false` | `false` |
| **Syllabus PDF URL** | String (URL) | Manual Input | Valid URL format | `https://example.com/syllabus.pdf` |
| **Description** | Text | Textarea | Free text | `Advanced course on...` |
| **Status** | Boolean | Toggle Switch | `true` (Active) / `false` (Inactive) | `true` |

### 3. Dropdown Value Lists

#### Course Category Options
- `Theory`
- `Practical`
- `Project`
- `Non Academic`
- `Theory + Practical`
- `Theory + Project`
- `Field Work`
- `Community Service`
- `Group Project`

#### Course Type Options
- `Core`
- `Generic Elective`
- `Skill Enhancement`
- `Ability Enhancement`
- `Language`
- `English`
- `Advance learner course`
- `Additional Credit course`
- `Discipline Specific elective`
- `Audit Course`
- `Bridge course`
- `Non Academic`
- `Naanmuthalvan`

#### Part Options
- `Part I`
- `Part II`
- `Part III`
- `Part IV`
- `Part V`

#### Evaluation Type Options
- `CA` (Continuous Assessment)
- `ESE` (End Semester Examination)
- `CA + ESE`

#### Result Type Options
- `Mark`
- `Status`

#### E-Code Name (Language) Options
- `Tamil`
- `English`
- `French`
- `Malayalam`
- `Hindi`

### 4. Auto-Populated Fields

| Field | Auto-Populates From | Logic |
|-------|-------------------|-------|
| **Display Code** | Course Code | Defaults to Course Code if not manually changed |
| **QP Code** | Course Code | Defaults to Course Code if not manually changed |

### 5. Conditional Field Logic

| Condition | Affected Fields | Behavior |
|-----------|----------------|----------|
| **Split Credit = TRUE** | Theory Credit, Practical Credit | Both fields become **required** and enabled |
| **Split Credit = FALSE** | Theory Credit, Practical Credit | Both fields disabled and optional |

### 6. Validation Rules (Courses)

| Field | Rule | Error Message |
|-------|------|---------------|
| Institution Code | Required, must exist | `Institution code is required` |
| Regulation Code | Required, must exist | `Regulation code is required` |
| Course Code | Required, alphanumeric + `-_` only | `Course code can only contain letters, numbers, hyphens, and underscores` |
| Course Title | Required | `Course name is required` |
| Display Code | Required | `Display code is required` |
| QP Code | Required | `QP code is required` |
| Course Category | Required | `Course category is required` |
| Evaluation Type | Required | `Evaluation type is required` |
| Result Type | Required | `Result type is required` |
| Credit | 0-99 | `Credit must be a positive number` / `Credit cannot exceed 99` |
| Theory Credit | 0-99, required if Split Credit enabled | `Theory credit is required when split credit is enabled` |
| Practical Credit | 0-99, required if Split Credit enabled | `Practical credit is required when split credit is enabled` |
| Split Credit Sum | Theory + Practical must equal Total Credit | `Total credit should equal theory + practical credits` |
| Duration | 0-9999 | `Duration cannot exceed 9999 hours` |
| QP Setter Count | 0-100 | `Number of QP setter cannot exceed 100` |
| Scrutinizer Count | 0-100 | `Number of scrutinizer cannot exceed 100` |
| Syllabus URL | Valid URL format | `Please enter a valid URL` |

---

## Course Mapping Module Reference

### 1. Required Fields (*)

| Field Name | Data Type | Source | Validation Rules | Example |
|-----------|-----------|--------|------------------|---------|
| **Course ID*** | UUID | Dropdown (courses table) | Must exist in courses table | `550e8400-e29b-41d4-a716-446655440000` |
| **Batch Code*** | String | Dropdown (batches table) | Must exist in batches table | `2024` |

### 2. Auto-Populated Fields

| Field | Auto-Populates From | Logic |
|-------|-------------------|-------|
| **Institution Code** | Selected Course | Fetched from course.institution_code |
| **Program Code** | Selected Course | Fetched from course.program_code |

### 3. Optional Fields

| Field Name | Data Type | Source | Validation Rules | Example |
|-----------|-----------|--------|------------------|---------|
| **Semester Code** | String | Dropdown (semesters table) | Must exist in semesters table if provided | `S1`, `SEM1` |
| **Course Group** | String | Manual Input | Free text | `General`, `Elective Group A` |
| **Course Order** | Integer | Manual Input | 0-999 | `1` |
| **Internal Max Mark** | Integer | Manual Input | Positive number | `40` |
| **Internal Pass Mark** | Integer | Manual Input | Positive, ≤ Internal Max Mark | `14` |
| **External Max Mark** | Integer | Manual Input | Positive number | `60` |
| **External Pass Mark** | Integer | Manual Input | Positive, ≤ External Max Mark | `26` |
| **Total Max Mark** | Integer | Manual Input | Positive number | `100` |
| **Total Pass Mark** | Integer | Manual Input | Positive, ≤ Total Max Mark | `40` |
| **Status** | Boolean | Toggle Switch | `true` (Active) / `false` (Inactive) | `true` |

### 4. Validation Rules (Course Mapping)

| Field | Rule | Error Message |
|-------|------|---------------|
| Course ID | Required, must exist | `Course is required` |
| Batch Code | Required, must exist | `Batch code is required` |
| Course Order | 0-999 | `Course order must be between 0 and 999` |
| Internal Max Mark | Positive number | `Internal max mark must be a positive number` |
| Internal Pass Mark | Positive, ≤ Max | `Pass mark cannot exceed max mark` |
| External Max Mark | Positive number | `External max mark must be a positive number` |
| External Pass Mark | Positive, ≤ Max | `Pass mark cannot exceed max mark` |
| Total Max Mark | Positive number | `Total max mark must be a positive number` |
| Total Pass Mark | Positive, ≤ Max | `Pass mark cannot exceed max mark` |

---

## Upload Template Field Mappings

### Course Upload Template (Excel/JSON)

#### Column Headers (Excel Template)
```
Institution Code*, Regulation Code*, Offering Department Code,
Course Code*, Course Name*, Display Code*,
Course Category*, Course Type, Part,
Credit, Split Credit (TRUE/FALSE), Theory Credit, Practical Credit,
QP Code*, E-Code Name (Tamil/English/French/Malayalam/Hindi), Duration (hours),
Evaluation Type* (CA/ESE/CA + ESE), Result Type* (Mark/Status),
Self Study Course (TRUE/FALSE), Outside Class Course (TRUE/FALSE),
Open Book (TRUE/FALSE), Online Course (TRUE/FALSE),
Dummy Number Required (TRUE/FALSE), Annual Course (TRUE/FALSE),
Multiple QP Set (TRUE/FALSE), No of QP Setter, No of Scrutinizer,
Fee Exception (TRUE/FALSE), Syllabus PDF URL, Description, Status (TRUE/FALSE)
```

#### JSON Field Mapping (Course)
```json
{
  "institution_code": "JKKN",
  "regulation_code": "REG2023",
  "offering_department_code": "CSE",
  "course_code": "CS101",
  "course_title": "Data Structures",
  "display_code": "CS101",
  "course_category": "Theory",
  "course_type": "Core",
  "course_part_master": "Part III",
  "credits": 4,
  "split_credit": true,
  "theory_credit": 3,
  "practical_credit": 1,
  "qp_code": "CS101",
  "e_code_name": "English",
  "duration_hours": 45,
  "evaluation_type": "CA + ESE",
  "result_type": "Mark",
  "self_study_course": false,
  "outside_class_course": false,
  "open_book": false,
  "online_course": false,
  "dummy_number_required": false,
  "annual_course": false,
  "multiple_qp_set": false,
  "no_of_qp_setter": 2,
  "no_of_scrutinizer": 1,
  "fee_exception": false,
  "syllabus_pdf_url": "https://example.com/syllabus.pdf",
  "description": "Advanced course on data structures",
  "is_active": true
}
```

### Course Mapping Upload Template (Excel/JSON)

#### Column Headers (Excel Template)
```
course_id, batch_code, course_group, semester_code, course_order,
internal_max_mark, internal_pass_mark,
external_max_mark, external_pass_mark,
total_max_mark, total_pass_mark
```

**Note:** Institution Code and Program Code are **auto-fetched** from the selected course and do not need to be in the upload file.

#### JSON Field Mapping (Course Mapping)
```json
{
  "course_id": "550e8400-e29b-41d4-a716-446655440000",
  "batch_code": "2024",
  "course_group": "General",
  "semester_code": "S1",
  "course_order": 1,
  "internal_max_mark": 40,
  "internal_pass_mark": 14,
  "external_max_mark": 60,
  "external_pass_mark": 26,
  "total_max_mark": 100,
  "total_pass_mark": 40
}
```

### Boolean Field Format (Excel/JSON)

| Excel Format | JSON Format | Result |
|--------------|-------------|--------|
| `TRUE` | `true` | Boolean true |
| `FALSE` | `false` | Boolean false |
| `1` | `1` (converted) | Boolean true |
| `0` | `0` (converted) | Boolean false |
| Empty/blank | `null` or omitted | Boolean false (default) |

---

## Validation Rules Summary

### Client-Side Validation (Frontend)

#### Course Form Validation
```typescript
// Required fields
if (!formData.institution_code.trim()) error
if (!formData.regulation_code.trim()) error
if (!formData.course_code.trim()) error
if (!formData.course_title.trim()) error
if (!formData.display_code.trim()) error
if (!formData.qp_code.trim()) error
if (!formData.course_category) error
if (!formData.evaluation_type) error
if (!formData.result_type) error

// Format validation
if (!/^[A-Za-z0-9\-_]+$/.test(formData.course_code)) error

// Numeric range validation
if (credits < 0 || credits > 99) error
if (theory_credit < 0 || theory_credit > 99) error
if (practical_credit < 0 || practical_credit > 99) error
if (duration_hours < 0 || duration_hours > 9999) error
if (no_of_qp_setter < 0 || no_of_qp_setter > 100) error
if (no_of_scrutinizer < 0 || no_of_scrutinizer > 100) error

// Conditional validation
if (split_credit && (!theory_credit || theory_credit === 0)) error
if (split_credit && (!practical_credit || practical_credit === 0)) error
if (split_credit && (theory_credit + practical_credit !== credits)) error

// URL validation
if (syllabus_pdf_url && !isValidURL(syllabus_pdf_url)) error
```

#### Course Mapping Form Validation
```typescript
// Required fields
if (!formData.course_id.trim()) error
if (!formData.batch_code.trim()) error

// Numeric range validation
if (course_order < 0 || course_order > 999) error

// Pass/Max mark validation
if (internal_pass_mark > internal_max_mark) error
if (external_pass_mark > external_max_mark) error
if (total_pass_mark > total_max_mark) error

// Positive number validation
if (internal_max_mark < 0) error
if (internal_pass_mark < 0) error
if (external_max_mark < 0) error
if (external_pass_mark < 0) error
if (total_max_mark < 0) error
if (total_pass_mark < 0) error
```

### Server-Side Validation (API)

#### Foreign Key Validation (Course)
```typescript
// Check institution_code exists
const institution = await supabase
  .from('institutions')
  .select('id')
  .eq('institution_code', institution_code)
  .single()

if (!institution) return error

// Check regulation_code exists
const regulation = await supabase
  .from('regulations')
  .select('id')
  .eq('regulation_code', regulation_code)
  .single()

if (!regulation) return error

// Check offering_department_code exists (if provided)
if (offering_department_code) {
  const department = await supabase
    .from('departments')
    .select('id')
    .eq('department_code', offering_department_code)
    .single()
  
  if (!department) return error
}
```

#### Foreign Key Validation (Course Mapping)
```typescript
// Check course_id exists
const course = await supabase
  .from('courses')
  .select('id, institution_code, program_code')
  .eq('id', course_id)
  .single()

if (!course) return error

// Auto-populate institution_code and program_code from course
institution_code = course.institution_code
program_code = course.program_code

// Check batch_code exists
const batch = await supabase
  .from('batches')
  .select('id')
  .eq('batch_code', batch_code)
  .single()

if (!batch) return error

// Check semester_code exists (if provided)
if (semester_code) {
  const semester = await supabase
    .from('semesters')
    .select('id')
    .eq('semester_code', semester_code)
    .single()
  
  if (!semester) return error
}
```

---

## Common Errors & Solutions

### Course Upload Errors

| Error Message | Cause | Solution |
|--------------|-------|----------|
| `Institution code required` | Missing or empty institution_code | Ensure institution_code column has valid data |
| `Institution with code "XXX" not found` | institution_code doesn't exist in DB | Create the institution first or check spelling |
| `Regulation code required` | Missing or empty regulation_code | Ensure regulation_code column has valid data |
| `Regulation with code "XXX" not found` | regulation_code doesn't exist in DB | Create the regulation first or check spelling |
| `Course code required` | Missing or empty course_code | Ensure course_code column has valid data |
| `Invalid course code format` | Course code contains invalid characters | Use only letters, numbers, hyphens, and underscores |
| `Course name required` | Missing or empty course_title | Ensure course name column has valid data |
| `Display code required` | Missing or empty display_code | Ensure display_code column has valid data |
| `QP code required` | Missing or empty qp_code | Ensure QP code column has valid data |
| `Course category required` | Missing or empty course_category | Select from predefined category list |
| `Evaluation type required` | Missing or empty evaluation_type | Use: CA, ESE, or CA + ESE |
| `Result type required` | Missing or empty result_type | Use: Mark or Status |
| `Credit must be 0-99` | Credit value out of range | Ensure credit is between 0 and 99 |
| `Theory credit required when split credit enabled` | Split credit is TRUE but theory_credit is missing/0 | Provide theory_credit when split_credit = TRUE |
| `Practical credit required when split credit enabled` | Split credit is TRUE but practical_credit is missing/0 | Provide practical_credit when split_credit = TRUE |
| `Total credit should equal theory + practical` | Theory + Practical ≠ Total Credit | Ensure theory_credit + practical_credit = credits |
| `Please enter a valid URL` | Invalid syllabus_pdf_url format | Use full URL: https://example.com/file.pdf |

### Course Mapping Upload Errors

| Error Message | Cause | Solution |
|--------------|-------|----------|
| `Course ID required` | Missing or empty course_id | Ensure course_id column has valid UUID |
| `Course ID not found in database` | course_id doesn't exist in courses table | Create the course first or check UUID |
| `Batch code required` | Missing or empty batch_code | Ensure batch_code column has valid data |
| `Batch with code "XXX" not found` | batch_code doesn't exist in batches table | Create the batch first or check spelling |
| `Semester with code "XXX" not found` | semester_code doesn't exist in semesters table | Create the semester first or check spelling |
| `Course order must be between 0 and 999` | course_order out of range | Ensure course_order is 0-999 |
| `Internal pass mark cannot exceed max mark` | internal_pass_mark > internal_max_mark | Reduce pass mark or increase max mark |
| `External pass mark cannot exceed max mark` | external_pass_mark > external_max_mark | Reduce pass mark or increase max mark |
| `Total pass mark cannot exceed max mark` | total_pass_mark > total_max_mark | Reduce pass mark or increase max mark |

---

## Data Flow Diagram

### Course Creation Flow
```
1. User inputs data OR uploads Excel/JSON
2. Frontend validates required fields
3. Frontend validates formats (course_code pattern, URL, etc.)
4. Frontend validates numeric ranges
5. API receives request
6. API validates foreign keys (institution_code, regulation_code, department_code)
7. API resolves codes to IDs
8. API inserts course with both codes and IDs
9. Success response OR error with specific message
```

### Course Mapping Creation Flow
```
1. User selects course from dropdown OR uploads Excel/JSON
2. Frontend auto-populates institution_code & program_code from course
3. User selects batch_code (required)
4. User optionally selects semester_code
5. Frontend validates required fields & numeric ranges
6. API receives request
7. API validates course_id exists
8. API validates batch_code exists
9. API validates semester_code exists (if provided)
10. API inserts mapping
11. Success response OR error with specific message
```

---

## Quick Reference Checklist

### Before Creating Courses
- ✅ Institutions table populated with institution_code
- ✅ Regulations table populated with regulation_code
- ✅ Departments table populated with department_code (if using offering department)

### Before Creating Course Mappings
- ✅ Courses table populated with courses (including institution_code & program_code)
- ✅ Batches table populated with batch_code
- ✅ Semesters table populated with semester_code (if assigning to semester)
- ✅ Programs table populated with program_code (referenced via courses)

### Upload Preparation
- ✅ Excel file has correct column headers (case-sensitive)
- ✅ Required fields (*) are filled in every row
- ✅ Boolean fields use TRUE/FALSE (uppercase)
- ✅ Numeric fields contain valid numbers (no text)
- ✅ Foreign key codes exist in respective tables
- ✅ No special characters in codes (except hyphens/underscores for course_code)

---

## API Endpoints Reference

| Entity | Method | Endpoint | Purpose |
|--------|--------|----------|---------|
| Institutions | GET | `/api/institutions` | Fetch all institutions |
| Regulations | GET | `/api/regulations` | Fetch all regulations |
| Departments | GET | `/api/departments` | Fetch all departments |
| Courses | GET | `/api/courses` | Fetch all courses |
| Courses | POST | `/api/courses` | Create new course |
| Courses | PUT | `/api/courses/[id]` | Update existing course |
| Courses | DELETE | `/api/courses/[id]` | Delete course |
| Batches | GET | `/api/batch` | Fetch all batches |
| Semesters | GET | `/api/semesters` | Fetch all semesters |
| Programs | GET | `/api/programs` | Fetch all programs |
| Course Mapping | GET | `/api/course-mapping` | Fetch all mappings |
| Course Mapping | POST | `/api/course-mapping` | Create new mapping |
| Course Mapping | PUT | `/api/course-mapping` | Update existing mapping |
| Course Mapping | DELETE | `/api/course-mapping?id={id}` | Delete mapping |

---

**End of Reference Sheet**

