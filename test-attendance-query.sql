-- Test query to verify attendance data structure
-- Run this in Supabase SQL Editor to check if data exists

-- 1. Check exam_attendance_child table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'exam_attendance_child'
ORDER BY ordinal_position;

-- 2. Count total records in exam_attendance_child
SELECT COUNT(*) as total_attendance_records
FROM exam_attendance_child;

-- 3. Count students marked as present
SELECT COUNT(*) as present_students
FROM exam_attendance_child
WHERE is_present = true;

-- 4. Sample data from exam_attendance_child (first 5 records)
SELECT id, student_id, is_present, created_at
FROM exam_attendance_child
WHERE is_present = true
LIMIT 5;

-- 5. Check if any students match between dummy numbers and attendance
SELECT COUNT(*) as matching_students
FROM student_dummy_numbers sdn
INNER JOIN students s ON s.register_number = sdn.actual_register_number
INNER JOIN exam_attendance_child eac ON eac.student_id = s.id
WHERE sdn.examination_session_id = (
  SELECT id FROM examination_sessions WHERE session_code = 'JKKNCAS-NOV-DEC-2025' LIMIT 1
)
AND eac.is_present = true;
