-- Check exam registrations for UG ENG students
SELECT 
  er.student_id,
  er.stu_register_no,
  er.is_regular,
  co.semester,
  co.course_id
FROM exam_registrations er
LEFT JOIN course_offerings co ON er.course_offering_id = co.id
WHERE er.examination_session_id = 'dfc11a61-2628-4043-9570-a4917504ec68'
  AND er.stu_register_no LIKE '24JUGENG%'
ORDER BY er.stu_register_no, er.is_regular DESC
LIMIT 20;
