# Answer Sheet Packets - Test Cases

## Overview
This document provides comprehensive test cases for the Answer Sheet Packets feature, including packet generation, database persistence, and retrieval.

## Test Environment Setup

### Prerequisites
1. Database migration applied: `20251117_create_answer_sheet_packets_complete.sql`
2. View fix migration applied: `20251117_fix_answer_sheet_packets_view.sql`
3. Required test data:
   - Valid institution with `institution_code`
   - Valid examination session with `session_code`
   - Valid courses with `course_category = 'Theory'`
   - Students with dummy numbers assigned
   - Attendance records marked for students

### Sample Test Data
```sql
-- Institution
INSERT INTO institutions (id, institution_code, name)
VALUES ('inst-uuid', 'JKKN01', 'JKKN College of Arts');

-- Examination Session
INSERT INTO examination_sessions (id, session_code, session_name)
VALUES ('session-uuid', 'NOV2024', 'November 2024 Examination');

-- Course (Theory - UG)
INSERT INTO courses (id, course_code, course_name, course_type, course_category, institution_code)
VALUES ('course-ug-uuid', '24UGTA01', 'Tamil Literature', 'UG', 'Theory', 'JKKN01');

-- Course (Theory - PG)
INSERT INTO courses (id, course_code, course_name, course_type, course_category, institution_code)
VALUES ('course-pg-uuid', '24PGTA01', 'Advanced Tamil', 'PG', 'Theory', 'JKKN01');

-- Student
INSERT INTO students (id, register_number, full_name)
VALUES ('student1-uuid', 'JKKN001', 'John Doe');

-- Exam Registration
INSERT INTO exam_registrations (id, student_id, course_code, examination_session_id)
VALUES ('reg1-uuid', 'student1-uuid', '24UGTA01', 'session-uuid');

-- Dummy Number
INSERT INTO student_dummy_numbers (
  id, institutions_id, examination_session_id, exam_registration_id,
  actual_register_number, dummy_number
) VALUES (
  'dummy1-uuid', 'inst-uuid', 'session-uuid', 'reg1-uuid',
  'JKKN001', '100001'
);

-- Attendance Record
INSERT INTO exam_attendance (id, student_id, examination_session_id, is_present)
VALUES ('attend1-uuid', 'student1-uuid', 'session-uuid', true);
```

---

## Test Cases

### 1. Database View Tests

#### Test 1.1: View Exists
**Objective**: Verify that `answer_sheet_packets_detail_view` exists in the database

**Steps**:
1. Query the database for the view
```sql
SELECT EXISTS (
  SELECT FROM information_schema.views
  WHERE table_schema = 'public'
  AND table_name = 'answer_sheet_packets_detail_view'
);
```

**Expected**: Returns `true`

---

#### Test 1.2: View Returns Correct Columns
**Objective**: Verify that the view includes both `course_name` and `course_title` columns

**Steps**:
1. Query view column definitions
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'answer_sheet_packets_detail_view'
AND column_name IN ('course_name', 'course_title');
```

**Expected**: Returns both `course_name` and `course_title`

---

#### Test 1.3: View Returns Data After Packet Creation
**Objective**: Verify that packets inserted into `answer_sheet_packets` table are visible in the view

**Steps**:
1. Insert a test packet:
```sql
INSERT INTO answer_sheet_packets (
  institutions_id, examination_session_id, course_id,
  packet_no, total_sheets, packet_status
) VALUES (
  'inst-uuid', 'session-uuid', 'course-ug-uuid',
  '1/5', 25, 'Created'
) RETURNING id;
```

2. Query the view:
```sql
SELECT id, packet_no, course_code, course_title, institution_code
FROM answer_sheet_packets_detail_view
WHERE packet_no = '1/5';
```

**Expected**:
- Returns 1 row
- `packet_no` = '1/5'
- `course_code` = '24UGTA01'
- `course_title` = 'Tamil Literature'
- `institution_code` = 'JKKN01'

---

### 2. API Route Tests

#### Test 2.1: GET /api/post-exam/answer-sheet-packets (No Filter)
**Objective**: Verify that GET endpoint retrieves all packets

**Steps**:
1. Send GET request: `GET /api/post-exam/answer-sheet-packets`
2. Check response status and data

**Expected**:
- Status: 200
- Response: Array of packets
- Each packet has: `id`, `packet_no`, `course_code`, `course_title`, `packet_status`

---

#### Test 2.2: GET with Institution Filter
**Objective**: Verify filtering by institution code

**Steps**:
1. Create packets for different institutions
2. Send GET request: `GET /api/post-exam/answer-sheet-packets?institution_code=JKKN01`

**Expected**:
- Status: 200
- Returns only packets for institution JKKN01

---

#### Test 2.3: GET with Session Filter
**Objective**: Verify filtering by examination session

**Steps**:
1. Send GET request: `GET /api/post-exam/answer-sheet-packets?exam_session=NOV2024`

**Expected**:
- Status: 200
- Returns only packets for session NOV2024

---

#### Test 2.4: GET with Course Filter
**Objective**: Verify filtering by course code

**Steps**:
1. Send GET request: `GET /api/post-exam/answer-sheet-packets?course_code=24UGTA01`

**Expected**:
- Status: 200
- Returns only packets for course 24UGTA01

---

#### Test 2.5: POST Manual Packet Creation
**Objective**: Verify manual packet creation via API

**Steps**:
1. Send POST request with valid data:
```json
{
  "institution_code": "JKKN01",
  "exam_session": "NOV2024",
  "course_code": "24UGTA01",
  "packet_no": "1/10",
  "total_sheets": 25,
  "packet_status": "Created"
}
```

**Expected**:
- Status: 201
- Returns created packet with generated ID and barcode

---

### 3. Packet Generation Tests

#### Test 3.1: Generate Packets for UG Course
**Objective**: Verify packet generation for UG courses (25 sheets per packet)

**Test Data**:
- 50 students with attendance
- Course type: UG

**Steps**:
1. Send POST request to `/api/post-exam/answer-sheet-packets/generate-packets`:
```json
{
  "institution_code": "JKKN01",
  "exam_session": "NOV2024",
  "course_code": "24UGTA01"
}
```

**Expected**:
- Status: 200
- Response:
  ```json
  {
    "success": true,
    "total_packets_created": 2,
    "total_students_assigned": 50,
    "courses_processed": 1,
    "course_results": [{
      "course_code": "24UGTA01",
      "packets_created": 2,
      "students_assigned": 50
    }]
  }
  ```
- Packet 1: `1/2` with 25 students
- Packet 2: `2/2` with 25 students

---

#### Test 3.2: Generate Packets for PG Course
**Objective**: Verify packet generation for PG courses (20 sheets per packet)

**Test Data**:
- 40 students with attendance
- Course type: PG

**Steps**:
1. Send POST request with PG course code:
```json
{
  "institution_code": "JKKN01",
  "exam_session": "NOV2024",
  "course_code": "24PGTA01"
}
```

**Expected**:
- Status: 200
- Total packets: 2 (40 students ÷ 20 = 2 packets)
- Packet 1: `1/2` with 20 students
- Packet 2: `2/2` with 20 students

---

#### Test 3.3: Generate Packets for All Courses
**Objective**: Verify generation for all theory courses when no course_code specified

**Steps**:
1. Send POST request without course_code:
```json
{
  "institution_code": "JKKN01",
  "exam_session": "NOV2024"
}
```

**Expected**:
- Status: 200
- Processes all Theory courses
- Returns packet count for each course in `course_results`

---

#### Test 3.4: Attendance Filtering
**Objective**: Verify that only students with attendance records get included in packets

**Test Data**:
- 30 total students with dummy numbers
- 20 students have attendance marked
- 10 students have no attendance

**Steps**:
1. Generate packets for the course

**Expected**:
- Only 20 students included in packets
- Students without attendance are excluded

---

#### Test 3.5: Empty Result - No Students
**Objective**: Verify error handling when no students have dummy numbers

**Steps**:
1. Generate packets for course with no students

**Expected**:
- Status: 200 (success with warning)
- `course_results` includes error:
  ```json
  {
    "course_code": "24UGTA01",
    "packets_created": 0,
    "students_assigned": 0,
    "error": "No students found with dummy numbers"
  }
  ```

---

#### Test 3.6: Empty Result - No Attendance
**Objective**: Verify error handling when students have no attendance

**Steps**:
1. Generate packets for course where students have dummy numbers but no attendance

**Expected**:
- Status: 200
- `course_results` includes error:
  ```json
  {
    "course_code": "24UGTA01",
    "packets_created": 0,
    "students_assigned": 0,
    "error": "No students with attendance found"
  }
  ```

---

#### Test 3.7: Partial Pack Size
**Objective**: Verify handling of incomplete last packet

**Test Data**:
- 28 students (UG course, 25 per packet)

**Steps**:
1. Generate packets

**Expected**:
- Packet 1: `1/2` with 25 students
- Packet 2: `2/2` with 3 students

---

#### Test 3.8: Student Dummy Number Update
**Objective**: Verify that `student_dummy_numbers.packet_no` is updated after generation

**Steps**:
1. Generate packets
2. Query `student_dummy_numbers` table:
```sql
SELECT id, dummy_number, packet_no
FROM student_dummy_numbers
WHERE examination_session_id = 'session-uuid'
AND exam_registration_id IN (
  SELECT id FROM exam_registrations WHERE course_code = '24UGTA01'
);
```

**Expected**:
- All students have `packet_no` populated (e.g., '1/5', '2/5', etc.)
- Students are grouped correctly by packet_no

---

### 4. Persistence Tests

#### Test 4.1: Packet Persistence After Page Refresh
**Objective**: Verify packets remain in database after browser refresh

**Steps**:
1. Generate packets via UI
2. Note the packet count and details
3. Refresh the browser page
4. Verify packets are still displayed

**Expected**:
- Same number of packets displayed
- All packet details match (packet_no, total_sheets, status)

---

#### Test 4.2: Direct Database Query Verification
**Objective**: Verify packets exist in database table

**Steps**:
1. Generate packets via API/UI
2. Query database directly:
```sql
SELECT packet_no, total_sheets, packet_status, course_id
FROM answer_sheet_packets
WHERE examination_session_id = 'session-uuid'
ORDER BY created_at DESC;
```

**Expected**:
- Packets exist in `answer_sheet_packets` table
- All foreign keys properly set

---

#### Test 4.3: View vs Table Consistency
**Objective**: Verify view returns same data as base table

**Steps**:
1. Count records in base table:
```sql
SELECT COUNT(*) FROM answer_sheet_packets;
```

2. Count records in view:
```sql
SELECT COUNT(*) FROM answer_sheet_packets_detail_view;
```

**Expected**:
- Counts match
- All packets in table are visible in view

---

### 5. Frontend Display Tests

#### Test 5.1: Initial Page Load
**Objective**: Verify packets load on page load

**Steps**:
1. Navigate to `/post-exam/answer-sheet-packets`
2. Wait for data to load

**Expected**:
- Loading spinner appears briefly
- Packets table populates with data
- Statistics cards show correct counts

---

#### Test 5.2: Filter Functionality
**Objective**: Verify filters work correctly

**Steps**:
1. Select institution from dropdown
2. Verify table updates
3. Select exam session
4. Verify table updates again

**Expected**:
- Table refreshes after each filter change
- Only matching packets displayed

---

#### Test 5.3: Packet Display After Generation
**Objective**: Verify UI updates immediately after packet generation

**Steps**:
1. Fill generation form
2. Click "Generate Packets"
3. Wait for success toast
4. Check packets table

**Expected**:
- Success toast appears with details
- Packets table automatically refreshes
- New packets appear in the list

---

### 6. Error Handling Tests

#### Test 6.1: Invalid Institution Code
**Objective**: Verify error handling for non-existent institution

**Steps**:
1. Send generation request with invalid institution_code:
```json
{
  "institution_code": "INVALID",
  "exam_session": "NOV2024"
}
```

**Expected**:
- Status: 400
- Error message: "Institution with code 'INVALID' not found"

---

#### Test 6.2: Invalid Session Code
**Objective**: Verify error handling for non-existent session

**Steps**:
1. Send request with invalid exam_session

**Expected**:
- Status: 400
- Error message: "Examination session with code 'INVALID' not found"

---

#### Test 6.3: Duplicate Packet Prevention
**Objective**: Verify that duplicate packets are not created

**Steps**:
1. Generate packets for a course
2. Attempt to generate again for same course

**Expected**:
- Second generation skips existing packets
- Console shows: "Packet X/Y already exists, skipping..."
- No duplicate key errors

---

#### Test 6.4: Non-Theory Course Filtering
**Objective**: Verify that only Theory courses are processed

**Test Data**:
- Course with `course_category = 'Practical'`

**Steps**:
1. Attempt to generate packets specifying a Practical course

**Expected**:
- Course is not processed
- Or appropriate error message returned

---

### 7. Performance Tests

#### Test 7.1: Large Dataset Generation
**Objective**: Test performance with large number of students

**Test Data**:
- 500 students with attendance

**Steps**:
1. Generate packets
2. Measure response time

**Expected**:
- Completes within 30 seconds
- All students assigned to packets
- No timeout errors

---

#### Test 7.2: Bulk Course Processing
**Objective**: Test generation for all courses simultaneously

**Test Data**:
- 10 theory courses with 50 students each

**Steps**:
1. Generate packets for all courses (no course_code specified)

**Expected**:
- All courses processed
- Response time < 60 seconds
- Correct packet count for each course

---

## Debugging Checklist

If packets are not appearing after generation, check:

1. **Database View**:
   ```sql
   -- Verify view exists
   SELECT * FROM answer_sheet_packets_detail_view LIMIT 1;
   ```

2. **Table Data**:
   ```sql
   -- Check base table
   SELECT * FROM answer_sheet_packets ORDER BY created_at DESC LIMIT 10;
   ```

3. **Migration Status**:
   - Verify `20251117_create_answer_sheet_packets_complete.sql` applied
   - Verify `20251117_fix_answer_sheet_packets_view.sql` applied

4. **Column Name Mismatch**:
   ```sql
   -- Check if course_title exists in view
   SELECT course_title FROM answer_sheet_packets_detail_view LIMIT 1;
   ```

5. **RLS Policies**:
   ```sql
   -- Verify RLS policies allow SELECT
   SELECT * FROM pg_policies WHERE tablename = 'answer_sheet_packets';
   ```

6. **API Logs**:
   - Check browser console for errors
   - Check server logs for API errors
   - Verify 200 status on GET request

---

## Test Execution Checklist

- [ ] All database migrations applied
- [ ] Test data inserted
- [ ] View exists and returns data
- [ ] GET endpoint returns packets
- [ ] POST endpoint creates packets
- [ ] UG packet generation (25 sheets/packet)
- [ ] PG packet generation (20 sheets/packet)
- [ ] Attendance filtering works
- [ ] Packets persist after page refresh
- [ ] Frontend displays packets correctly
- [ ] Error handling works
- [ ] Duplicate prevention works
- [ ] Student dummy numbers updated

---

## Common Issues and Fixes

### Issue 1: Packets disappear after refresh
**Cause**: Database view not returning data
**Fix**: Apply `20251117_fix_answer_sheet_packets_view.sql` migration

### Issue 2: "course_title is undefined" error
**Cause**: View doesn't have course_title alias
**Fix**: View must include `c.course_name AS course_title`

### Issue 3: No students in packets
**Cause**: Attendance records missing or wrong filter
**Fix**: Verify attendance records exist for students

### Issue 4: Foreign key errors
**Cause**: institution_code/session_code/course_code not found
**Fix**: Ensure all codes exist in respective tables before generation

---

## Notes

- Always test on a non-production database first
- Keep test data consistent across tests
- Clear test packets between test runs to avoid duplicates
- Monitor server logs during packet generation
