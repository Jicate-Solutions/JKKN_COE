# Dummy Number Generation - Sorting Implementation

## Overview

This document explains how dummy numbers are generated with proper sorting based on board_order, course_order, program_order, is_regular, and stu_register_no.

## Database Schema Relationships

```
exam_attendance / exam_registrations
    ↓ (exam_registration_id / id)
exam_registrations
    ↓ (course_offering_id)
course_offerings
    ↓ (course_id)                ↓ (program_id)
courses                         programs
    ↓ (board_code)                  ↓ (program_order)
board
    ↓ (board_order)

PLUS:
course_offerings.id = course_mapping.id  (shared primary key)
    ↓
course_mapping
    ↓ (course_order)
```

## Sort Order Specification

**Priority:**
1. `board.board_order` ASC (via `courses.board_code` → `board.board_code`)
2. `course_mapping.course_order` ASC (via `course_offerings.id` = `course_mapping.id`)
3. `programs.program_order` ASC (via `course_offerings.program_id`)
4. `exam_registrations.is_regular` DESC (Regular students first)
5. `exam_registrations.stu_register_no` ASC (Alphanumeric sort)

## SQL Equivalent

```sql
-- Complete query with sorting (Registration Mode)
SELECT
    er.id,
    er.stu_register_no,
    er.is_regular,

    -- Board
    b.board_code,
    b.board_order,

    -- Course
    c.course_code,
    c.course_name,

    -- Course Order (from course_mapping)
    cm.course_order,

    -- Program
    p.program_code,
    p.program_name,
    p.program_order,

    -- Student
    s.roll_number,
    s.first_name,
    s.last_name,

    -- Dummy number sequence
    ROW_NUMBER() OVER (
        ORDER BY
            COALESCE(b.board_order, 999) ASC,
            COALESCE(cm.course_order, 999) ASC,
            COALESCE(p.program_order, 999) ASC,
            er.is_regular DESC,
            er.stu_register_no ASC
    ) AS dummy_number_sequence

FROM exam_registrations er
LEFT JOIN course_offerings co ON er.course_offering_id = co.id
LEFT JOIN courses c ON co.course_id = c.id
LEFT JOIN board b ON c.board_code = b.board_code
LEFT JOIN course_mapping cm ON co.id = cm.id
LEFT JOIN programs p ON co.program_id = p.id
LEFT JOIN students s ON er.student_id = s.id

WHERE
    er.institutions_id = 'YOUR_INSTITUTION_ID'
    AND er.examination_session_id = 'YOUR_SESSION_ID'
    AND er.registration_status = 'Approved'
    AND c.course_category = 'Theory'

ORDER BY dummy_number_sequence;
```

## Implementation (TypeScript)

### Step 1: Fetch Data with Joins

```typescript
// Attendance Mode
const query = supabase
    .from('exam_attendance')
    .select(`
        id,
        exam_registration_id,
        exam_timetable_id,
        student_id,
        attendance_status,
        exam_registration:exam_registrations (
            id,
            stu_register_no,
            is_regular,
            course_offering:course_offerings (
                course_code,
                course:courses (
                    course_code,
                    course_name,
                    course_type,
                    course_category,
                    board_code,
                    board:board (
                        board_code,
                        board_order
                    )
                ),
                program:programs (
                    program_code,
                    program_name,
                    program_order
                )
            )
        ),
        student:students (
            id,
            roll_number,
            first_name,
            last_name
        )
    `)
    .eq('institutions_id', institutions_id)
    .eq('examination_session_id', examination_session_id)
    .eq('attendance_status', 'Present')
```

### Step 2: Fetch Course Mapping (Separate Query)

```typescript
// Get unique course offering IDs
const uniqueCourseOfferingIds = [...new Set(studentsData.map(s =>
    s.exam_registration?.course_offering?.id
).filter(Boolean))]

// Fetch course_mapping where id = course_offering.id
const { data: courseMappings } = await supabase
    .from('course_mapping')
    .select('id, course_id, course_order')
    .in('id', uniqueCourseOfferingIds)

// Create Map for fast lookup
const courseMappingMap = new Map<string, number>()
courseMappings.forEach((cm: any) => {
    courseMappingMap.set(cm.id, cm.course_order || 999)
})
```

**Why Separate Query?**
- Supabase PostgREST doesn't support joining tables on shared primary keys
- JavaScript Map provides O(1) lookup performance
- Cleaner data structure than nested joins

### Step 3: Sort in JavaScript

```typescript
const sortedStudents = studentsData.sort((a, b) => {
    // 1. Board order
    // Path: courses.board_code -> board.board_order
    const aBoardOrder = a.exam_registration?.course_offering?.course?.board?.board_order || 999
    const bBoardOrder = b.exam_registration?.course_offering?.course?.board?.board_order || 999
    if (aBoardOrder !== bBoardOrder) return aBoardOrder - bBoardOrder

    // 2. Course order
    // Path: course_offerings.id = course_mapping.id -> course_mapping.course_order
    const aCourseOfferingId = a.exam_registration?.course_offering?.id
    const bCourseOfferingId = b.exam_registration?.course_offering?.id
    const aCourseOrder = aCourseOfferingId ? (courseMappingMap.get(aCourseOfferingId) || 999) : 999
    const bCourseOrder = bCourseOfferingId ? (courseMappingMap.get(bCourseOfferingId) || 999) : 999
    if (aCourseOrder !== bCourseOrder) return aCourseOrder - bCourseOrder

    // 3. Program order
    // Path: course_offerings.program_id -> programs.program_order
    const aProgramOrder = a.exam_registration?.course_offering?.program?.program_order || 999
    const bProgramOrder = b.exam_registration?.course_offering?.program?.program_order || 999
    if (aProgramOrder !== bProgramOrder) return aProgramOrder - bProgramOrder

    // 4. Regular students first (DESC)
    // Path: exam_registrations.is_regular
    const aRegular = a.exam_registration?.is_regular ?? false
    const bRegular = b.exam_registration?.is_regular ?? false
    if (aRegular !== bRegular) return bRegular ? 1 : -1

    // 5. Student register number (ASC)
    // Path: exam_registrations.stu_register_no
    const aRegNo = a.exam_registration?.stu_register_no || ''
    const bRegNo = b.exam_registration?.stu_register_no || ''
    return aRegNo.localeCompare(bRegNo)
})
```

## Testing Queries

### Test Board Join

```sql
SELECT
    c.course_code,
    c.course_name,
    c.board_code,
    b.board_code AS board_table_code,
    b.board_order,
    b.board_name

FROM courses c
LEFT JOIN board b ON c.board_code = b.board_code

WHERE c.course_category = 'Theory'
ORDER BY b.board_order NULLS LAST, c.course_code
LIMIT 100;
```

### Test Complete Sorting

```sql
WITH student_data AS (
    SELECT
        er.id,
        er.stu_register_no,
        er.is_regular,
        COALESCE(b.board_order, 999) AS board_order,
        b.board_code,
        COALESCE(cm.course_order, 999) AS course_order,
        c.course_code,
        COALESCE(p.program_order, 999) AS program_order,
        p.program_code,
        s.roll_number,
        s.first_name,
        s.last_name

    FROM exam_registrations er
    LEFT JOIN course_offerings co ON er.course_offering_id = co.id
    LEFT JOIN courses c ON co.course_id = c.id
    LEFT JOIN board b ON c.board_code = b.board_code
    LEFT JOIN programs p ON co.program_id = p.id
    LEFT JOIN students s ON er.student_id = s.id
    LEFT JOIN course_mapping cm ON co.id = cm.id

    WHERE
        er.institutions_id = 'YOUR_INSTITUTION_ID'
        AND er.examination_session_id = 'YOUR_SESSION_ID'
        AND er.registration_status = 'Approved'
        AND c.course_category = 'Theory'
)

SELECT
    *,
    ROW_NUMBER() OVER (
        ORDER BY
            board_order ASC,
            course_order ASC,
            program_order ASC,
            is_regular DESC,
            stu_register_no ASC
    ) AS dummy_number_sequence

FROM student_data
ORDER BY dummy_number_sequence
LIMIT 100;
```

## Key Points

1. **Board Access**: Board information comes from `courses.board_code` → `board` table join, NOT directly from `exam_registrations`

2. **Course Order**: `course_mapping` table shares the same `id` as `course_offerings` (not a foreign key, same primary key)

3. **Fallback Values**: All order fields use `999` as fallback for NULL values to sort them last

4. **Regular Students**: `is_regular DESC` means `true` (regular) comes before `false` (arrear)

5. **Pagination**: System supports up to 100,000 records with 5000-record batches for fetching and 1000-record batches for inserting

## File Locations

- **Generate Endpoint**: [app/api/dummy-numbers/generate/route.ts](../app/api/dummy-numbers/generate/route.ts)
- **GET Endpoint**: [app/api/dummy-numbers/route.ts](../app/api/dummy-numbers/route.ts)
- **Frontend Page**: [app/coe/dummy-numbers/page.tsx](../app/coe/dummy-numbers/page.tsx)

## Migration Files

- Board Table: Check migrations for `board` table structure
- Course Mapping: [supabase/migrations/20251006_create_course_mapping_table.sql](../supabase/migrations/20251006_create_course_mapping_table.sql)
- Course Order Update: [supabase/migrations/20251013_update_course_order_to_decimal.sql](../supabase/migrations/20251013_update_course_order_to_decimal.sql)
