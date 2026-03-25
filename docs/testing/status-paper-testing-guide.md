# Status Paper Support - Testing Guide

## Overview

This guide provides step-by-step instructions for testing the newly implemented status paper support feature.

## Prerequisites

Before testing, ensure:
- ✅ All migrations applied successfully
- ✅ Database has `marks_entry.grade` column
- ✅ You have test courses with `result_type = 'Status'`
- ✅ Development server is running (`npm run dev`)

---

## Test 1: Database Schema Verification

**Purpose:** Verify migration was applied correctly

**Steps:**

```sql
-- 1. Check column exists
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'marks_entry' AND column_name = 'grade';

-- Expected: grade | character varying | 50

-- 2. Check index exists
SELECT indexname FROM pg_indexes
WHERE tablename = 'marks_entry' AND indexname = 'idx_marks_entry_grade';

-- Expected: idx_marks_entry_grade

-- 3. Check constraint exists
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'marks_entry' AND constraint_name = 'chk_marks_entry_grade_values';

-- Expected: chk_marks_entry_grade_values
```

**Expected Result:** ✅ All schema elements present

---

## Test 2: Internal-Only Status Paper (CIA)

**Purpose:** Test status paper with internal assessment only

**Test Data Setup:**

```sql
-- 1. Create/verify test course
UPDATE courses
SET result_type = 'Status', evaluation_type = 'CIA'
WHERE course_code = 'TEST_CIA_STATUS';

-- 2. Insert internal grade
INSERT INTO internal_marks (
  student_id, course_id, institutions_id, examination_session_id,
  total_internal_marks, max_internal_marks, grade, is_active
) VALUES (
  '<test-student-id>',
  '<test-course-id>',
  '<institution-id>',
  '<session-id>',
  0, 0, 'Commended', true
);
```

**API Call:**

```bash
curl -X POST http://localhost:3000/api/grading/final-marks \
  -H "Content-Type: application/json" \
  -d '{
    "institutions_id": "<institution-id>",
    "program_id": "<program-id>",
    "program_code": "TEST",
    "examination_session_id": "<session-id>",
    "course_ids": ["<test-course-id>"],
    "regulation_id": "<regulation-id>",
    "grade_system_code": "UG",
    "save_to_db": true
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "results": [
    {
      "grade": "Commended",
      "grade_point": 0,
      "total_marks": 0,
      "percentage": 0,
      "pass_status": "Pass",
      "is_pass": true,
      "is_absent": false
    }
  ],
  "summary": {
    "passed": 1,
    "failed": 0,
    "absent": 0
  }
}
```

**Database Verification:**

```sql
SELECT
  letter_grade, grade_points, total_marks_obtained, percentage,
  pass_status, is_pass
FROM final_marks
WHERE student_id = '<test-student-id>'
AND course_id = '<test-course-id>';

-- Expected:
-- letter_grade: Commended
-- grade_points: NULL
-- total_marks_obtained: NULL
-- percentage: NULL
-- pass_status: Pass
-- is_pass: true
```

**✅ Pass Criteria:**
- API returns success
- Result has `grade = "Commended"`
- All numeric marks are 0 in response
- Database stores NULL for marks fields
- `pass_status = "Pass"`

---

## Test 3: External-Only Status Paper with AAA (Absent)

**Purpose:** Test absent case auto-assigns AAA grade

**Test Data Setup:**

```sql
-- 1. Create/verify test course
UPDATE courses
SET result_type = 'Status', evaluation_type = 'External'
WHERE course_code = 'TEST_EXT_STATUS';

-- 2. Mark student as absent in attendance
INSERT INTO exam_attendance (
  exam_registration_id, course_id, attendance_status
) VALUES (
  '<exam-reg-id>', '<test-course-id>', 'Absent'
);

-- 3. External grade (will be overridden by attendance)
INSERT INTO marks_entry (
  exam_registration_id, grade
) VALUES (
  '<exam-reg-id>', 'Highly Commended'
);
```

**API Call:** (Same as Test 2, different course)

**Expected Response:**

```json
{
  "success": true,
  "results": [
    {
      "grade": "AAA",
      "pass_status": "Absent",
      "is_pass": false,
      "is_absent": true
    }
  ],
  "summary": {
    "passed": 0,
    "failed": 0,
    "absent": 1
  }
}
```

**✅ Pass Criteria:**
- Grade forced to "AAA" despite external grade
- `pass_status = "Absent"`
- `is_pass = false`
- `is_absent = true`

---

## Test 4: Backlog Auto-Insert for AAA Status

**Purpose:** Verify AAA creates backlog entry

**Prerequisites:** Run Test 3 first (AAA result exists)

**API Call:**

```bash
curl -X POST http://localhost:3000/api/results/generate-semester-results \
  -H "Content-Type: application/json" \
  -d '{
    "institutions_id": "<institution-id>",
    "examination_session_id": "<session-id>",
    "program_id": "<program-id>"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "backlogs_created": 1,
  "summary": {
    "total_backlogs": 1,
    "mark_backlogs": 0,
    "status_backlogs": 1
  },
  "passed": 0,
  "failed": 1
}
```

**Database Verification:**

```sql
SELECT * FROM student_backlog
WHERE student_id = '<test-student-id>'
AND course_id = '<test-course-id>';

-- Expected: 1 row with backlog_type = 'Absent'

SELECT result FROM semester_results
WHERE student_id = '<test-student-id>'
AND examination_session_id = '<session-id>';

-- Expected: result = 'Fail' (any backlog = semester fail)
```

**✅ Pass Criteria:**
- 1 backlog created for AAA grade
- `backlog_type = "Absent"`
- Semester result = "Fail"
- `status_backlogs = 1` in response

---

## Test 5: Validation Report

**Purpose:** Test pre-generation validation

**Test Data Setup:**

```sql
-- Create registration without internal grade
-- (will show in validation report as missing data)
```

**API Call:**

```bash
curl "http://localhost:3000/api/results/validation-report?institutions_id=<id>&examination_session_id=<id>&program_code=TEST"
```

**Expected Response:**

```json
{
  "ready_to_generate": false,
  "summary": {
    "total_students": 5,
    "total_registrations": 10,
    "ready": 8,
    "missing_data": 2
  },
  "missing_data_details": [
    {
      "student_name": "Test Student",
      "register_no": "TEST001",
      "course_code": "TEST_CIA_STATUS",
      "result_type": "Status",
      "exam_type": "Internal",
      "issue": "Missing internal_marks.grade"
    }
  ]
}
```

**✅ Pass Criteria:**
- Detects missing internal grades for CIA courses
- Detects missing external grades for External courses
- Returns detailed error list
- `ready_to_generate = false` when data missing

---

## Test 6: Mixed Mark & Status Papers

**Purpose:** Verify both types can be processed together

**Test Data Setup:**

```sql
-- Ensure session has:
-- 1. Mark-based courses (existing)
-- 2. Status-based courses (new)
```

**API Call:** Generate final marks for multiple courses including both types

**Expected Response:**

```json
{
  "success": true,
  "results": [
    {
      "course_code": "MARK_COURSE",
      "grade": "A+",
      "grade_point": 9.5,
      "total_marks": 95,
      "pass_status": "Pass"
    },
    {
      "course_code": "STATUS_COURSE",
      "grade": "Highly Commended",
      "grade_point": 0,
      "total_marks": 0,
      "pass_status": "Pass"
    }
  ]
}
```

**✅ Pass Criteria:**
- Both mark and status results generated
- Mark-based: Has numeric marks and grade points
- Status-based: Has NULL marks, status grade
- No interference between types

---

## Test 7: Invalid Status Grade Validation

**Purpose:** Test constraint prevents invalid status values

**Test Data Setup:**

```sql
-- Try to insert invalid grade
INSERT INTO marks_entry (
  exam_registration_id, grade
) VALUES (
  '<exam-reg-id>', 'Invalid Grade'
);

-- Expected: ERROR - check constraint violation
```

**✅ Pass Criteria:**
- Database rejects invalid grades
- Only accepts: 'Commended', 'Highly Commended', 'AAA', NULL

---

## Test Results Template

Use this template to document your test results:

```markdown
## Test Results - Status Paper Support

**Date:** YYYY-MM-DD
**Tester:** [Name]
**Environment:** Development/Staging/Production

### Test 1: Database Schema Verification
- [x] Column exists ✅
- [x] Index created ✅
- [x] Constraint added ✅

### Test 2: Internal-Only Status Paper (CIA)
- [x] API success ✅
- [x] Grade = "Commended" ✅
- [x] Marks stored as NULL ✅
- [x] Pass status correct ✅

### Test 3: External-Only Status Paper with AAA
- [x] AAA forced on absent ✅
- [x] Pass status = "Absent" ✅
- [x] is_absent = true ✅

### Test 4: Backlog Auto-Insert
- [x] Backlog created ✅
- [x] Backlog type = "Absent" ✅
- [x] Semester result = "Fail" ✅
- [x] Status backlog counted ✅

### Test 5: Validation Report
- [x] Detects missing data ✅
- [x] Returns detailed errors ✅
- [x] ready_to_generate accurate ✅

### Test 6: Mixed Papers
- [x] Mark-based works ✅
- [x] Status-based works ✅
- [x] No interference ✅

### Test 7: Invalid Grade Validation
- [x] Constraint enforced ✅

### Overall Status: ✅ ALL TESTS PASSED

**Notes:**
[Any issues, observations, or edge cases found]
```

---

## Troubleshooting

### Issue: "Missing internal_marks.grade"

**Solution:**
```sql
UPDATE internal_marks
SET grade = 'Commended'
WHERE course_id IN (
  SELECT id FROM courses WHERE result_type = 'Status' AND evaluation_type = 'CIA'
);
```

### Issue: "Invalid status grade"

**Solution:** Only use valid values:
- `'Commended'`
- `'Highly Commended'`
- `'AAA'`

### Issue: Status papers showing in mark-based report

**Solution:** Check `courses.result_type` field is set to `'Status'` (case-sensitive)

---

## Success Criteria Summary

✅ **Feature Complete When:**

1. Database migration applied successfully
2. All 7 tests pass
3. Mixed mark + status papers work together
4. Backlogs auto-insert for AAA grades
5. Semester result calculation includes status papers
6. Validation report detects missing status data
7. No regression in existing mark-based functionality

---

## Next Steps After Testing

1. Document any bugs found
2. Fix issues and re-test
3. Update this guide with new findings
4. Get stakeholder sign-off
5. Deploy to staging
6. Conduct UAT (User Acceptance Testing)
7. Deploy to production

---

**Testing Complete!** 🎉

If all tests pass, the status paper support feature is ready for deployment.
