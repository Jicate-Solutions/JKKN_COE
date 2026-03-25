# Attendance Reports Page - Implementation Logic

## Overview

This page generates three types of attendance reports:
1. **Student Attendance Sheet** - Student-wise attendance for PDF generation
2. **Summary Report** - Aggregated attendance statistics
3. **Bundle Cover** - Cover sheet for exam bundles

## MyJKKN COE Dev Rules Applied

### 1. Institution Filtering

Uses `useInstitutionFilter` hook for role-based filtering:

```typescript
const {
  isReady,
  appendToUrl,
  mustSelectInstitution,
  shouldFilter,
  institutionId: contextInstitutionId,
  getInstitutionIdForCreate
} = useInstitutionFilter()
```

| User Type | Behavior |
|-----------|----------|
| Normal User | Auto-selects own institution, cannot change |
| Super Admin (All) | Must select institution from dropdown |
| Super Admin (Specific) | Auto-selects from global dropdown |

### 2. Programs from MyJKKN API

Programs are fetched from MyJKKN API, NOT from local `programs` table:

```typescript
const { fetchPrograms: fetchProgramsFromMyJKKN } = useMyJKKNInstitutionFilter()

// Get myjkkn_institution_ids from COE institution
const institution = institutions.find(inst => inst.id === institutionId)
const myjkknIds = institution?.myjkkn_institution_ids || []

// Fetch programs using MyJKKN institution UUIDs
const programData = await fetchProgramsFromMyJKKN(myjkknIds)
```

**Key Points:**
- `myjkkn_institution_ids` is an array of MyJKKN UUIDs stored in COE institutions table
- No two-step lookup needed - use IDs directly
- `program_code` is the CODE field (e.g., "BCA", "UCM"), NOT a UUID

### 3. Student Details from exam_registrations

Student details come from `exam_registrations` table (denormalized at import time):
- `er.stu_register_no` - Student register number
- `er.student_name` - Student name

**NOT** from local `students` table (learner data is from MyJKKN API).

### 4. program_code Instead of FK Relationship

All queries use `program_code` directly instead of FK to programs table:

```sql
-- Database function uses COALESCE pattern
COALESCE(co.program_code, ea.program_code, '-')::TEXT AS program_code

-- LEFT JOIN to programs table only for name/order lookup
LEFT JOIN public.programs p ON (
  p.program_code = COALESCE(co.program_code, ea.program_code)
  AND p.institutions_id = er.institutions_id
)
```

## Filter Cascade

```
Institution → Sessions → Programs (MyJKKN API)
                      ↓
               Exam Dates → Session Type (FN/AN) → Courses
```

## API Endpoints

### Student Sheet API
```
GET /api/exam-management/exam-attendance/student-sheet
  ?session_code={session_code}
  &exam_date={optional}
  &session={optional: FN/AN}
  &program_code={optional}
  &course_code={optional}
```

Calls database function: `get_student_attendance_sheet()`

### Bundle Cover API
```
GET /api/exam-management/exam-attendance/bundle-cover
  ?institution_id={required}
  &session_id={required}
  &exam_date={required}
  &session={required: FN/AN}
  &program_code={optional}
  &course_code={optional}
```

Uses Supabase query with program_code filtering (no programs table JOIN).

### Summary Report API
```
GET /api/exam-management/exam-attendance/report
  ?institution_id={required}
  &session_code={required}
```

## Database Function: get_student_attendance_sheet

**Purpose:** Generate student-wise attendance sheets for PDF generation

**Key Features:**
- Uses `session_code` for filtering (not session_id)
- Uses `program_code` directly (MyJKKN pattern)
- Uses `exam_registrations` for student details
- LEFT JOIN to `programs` table for optional name/order lookup
- Returns all TEXT types with explicit `::TEXT` casts

**Tables Joined:**
- `exam_attendance` (ea) - Main table
- `exam_registrations` (er) - Student details
- `course_offerings` (co) - Course and program info
- `courses` (c) - Course details
- `programs` (p) - Optional name/order lookup
- `regulations` (r) - Regulation code
- `examination_sessions` (es) - Session info
- `institutions` (i) - Institution info
- `exam_timetables` (et) - Exam date/session

## Files Modified

1. **Page:** `app/(coe)/exam-management/reports/attendance/page.tsx`
   - Added `useMyJKKNInstitutionFilter` hook
   - Programs fetched from MyJKKN API
   - Added `myjkkn_institution_ids` to Institution interface

2. **Migration:** `supabase/migrations/20260110_update_student_attendance_sheet_use_program_code.sql`
   - Updated function to use `program_code` instead of FK
   - Uses `exam_registrations` for student details
   - Removed `students` table JOIN

3. **API Route:** `app/api/exam-management/exam-attendance/bundle-cover/route.ts`
   - Removed INNER JOIN to programs table
   - Uses `program_code` from multiple sources (COALESCE pattern)
   - Program lookup is optional with fallback

## Testing Checklist

- [ ] Institution dropdown shows correct institutions based on user role
- [ ] Sessions dropdown filters by selected institution
- [ ] Programs dropdown loads from MyJKKN API
- [ ] Student Sheet PDF generates with correct data
- [ ] Bundle Cover PDF generates with correct data
- [ ] Summary Report PDF generates with correct data
- [ ] All reports show correct student names from exam_registrations
