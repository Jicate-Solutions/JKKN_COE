-- Check attendance status for the students who shouldn't have packet numbers
-- Run this in Supabase SQL Editor

SELECT
  sdn.dummy_number,
  sdn.actual_register_number,
  sdn.packet_no,
  s.id as student_id,
  ea.attendance_status,
  ea.is_absent,
  CASE
    WHEN ea.attendance_status = 'Present' THEN '❌ PRESENT - Should have packet'
    WHEN ea.attendance_status = 'Absent' THEN '✓ ABSENT - Should NOT have packet'
    WHEN ea.id IS NULL THEN '⚠️ NO ATTENDANCE RECORD'
    ELSE '? Unknown status: ' || ea.attendance_status
  END as analysis
FROM student_dummy_numbers sdn
LEFT JOIN students s ON s.register_number = sdn.actual_register_number
LEFT JOIN exam_attendance ea ON ea.student_id = s.id
  AND ea.examination_session_id = sdn.examination_session_id
WHERE sdn.dummy_number IN ('D069', 'D255', 'D273', 'D366', 'D540', 'D549', 'D557', 'D590')
ORDER BY sdn.dummy_number;
