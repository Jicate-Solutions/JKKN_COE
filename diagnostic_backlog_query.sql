-- =====================================================
-- DIAGNOSTIC QUERY: Investigate Backlog Clearing Issue
-- =====================================================
-- Student: 24JUGENG004
-- Course: 24UGTA01
-- Expected: Backlog should be cleared when student passes

-- 1. Find the student and course IDs
WITH student_info AS (
  SELECT id, register_number, learner_name
  FROM students
  WHERE register_number = '24JUGENG004'
  LIMIT 1
),
course_info AS (
  SELECT id, course_code, course_name
  FROM courses
  WHERE course_code = '24UGTA01'
  LIMIT 1
)

-- 2. Show all final_marks records for this student/course across ALL sessions
SELECT
  '=== FINAL MARKS RECORDS ===' as section,
  fm.id as final_mark_id,
  es.session_name,
  es.session_code,
  c.course_code,
  fm.internal_marks_obtained,
  fm.external_marks_obtained,
  fm.total_marks_obtained,
  fm.is_pass,
  fm.status,
  fm.created_at,
  fm.updated_at
FROM final_marks fm
CROSS JOIN student_info si
CROSS JOIN course_info ci
LEFT JOIN courses c ON c.id = fm.course_id
LEFT JOIN examination_sessions es ON es.id = fm.examination_session_id
WHERE fm.student_id = si.id
  AND fm.course_id = ci.id
ORDER BY fm.created_at DESC

UNION ALL

-- 3. Show student_backlogs records for this student/course
SELECT
  '=== BACKLOG RECORDS ===' as section,
  sb.id as backlog_id,
  '' as session_name,
  '' as session_code,
  c.course_code,
  sb.original_internal_marks,
  sb.original_external_marks,
  sb.original_total_marks,
  sb.is_cleared::text as is_pass,
  COALESCE('Cleared: ' || sb.cleared_date::text, 'Not Cleared') as status,
  sb.created_at,
  sb.updated_at
FROM student_backlogs sb
CROSS JOIN student_info si
CROSS JOIN course_info ci
LEFT JOIN courses c ON c.id = sb.course_id
WHERE sb.student_id = si.id
  AND sb.course_id = ci.id
  AND sb.is_active = true
ORDER BY sb.created_at DESC;
