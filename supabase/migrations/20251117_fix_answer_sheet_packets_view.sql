-- =====================================================
-- FIX ANSWER SHEET PACKETS DETAIL VIEW
-- Created: 2025-11-17
-- Description: Fix course column naming - add course_title alias for course_name
--              to match TypeScript interface expectations
-- =====================================================

-- Drop existing views first to avoid column name conflicts
DROP VIEW IF EXISTS public.answer_sheet_packets_detail_view CASCADE;
DROP VIEW IF EXISTS public.answer_sheet_packets_summary_view CASCADE;
DROP VIEW IF EXISTS public.pending_answer_sheet_packets_view CASCADE;

-- Recreate the detail view with corrected column names
CREATE VIEW public.answer_sheet_packets_detail_view AS
SELECT
  asp.id,
  asp.packet_no,
  asp.barcode,
  asp.total_sheets,
  asp.sheets_evaluated,
  asp.evaluation_progress,
  asp.packet_status,
  asp.packet_location,
  asp.remarks,

  -- Assignment Details
  asp.assigned_to,
  au.full_name AS assigned_to_name,
  au.email AS assigned_to_email,
  asp.assigned_at,

  -- Evaluation Timing
  asp.evaluation_started_at,
  asp.evaluation_completed_at,
  CASE
    WHEN asp.evaluation_completed_at IS NOT NULL AND asp.evaluation_started_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (asp.evaluation_completed_at - asp.evaluation_started_at))/3600
    ELSE NULL
  END AS evaluation_duration_hours,

  -- Institution Details
  asp.institutions_id,
  i.institution_code,
  i.name AS institution_name,

  -- Examination Session Details
  asp.examination_session_id,
  es.session_code,
  es.session_name,


  -- Course Details (FIXED: Added course_title alias)
  asp.course_id,
  c.course_code,
  c.course_name,
  c.course_name AS course_title, -- Alias for TypeScript interface compatibility
  c.course_type,

  -- Exam Timetable Details
  asp.exam_timetable_id,
  et.exam_date,
  et.session AS exam_session,

  -- Created By
  cu.full_name AS created_by_name,
  cu.email AS created_by_email,

  -- Updated By
  uu.full_name AS updated_by_name,
  uu.email AS updated_by_email,

  -- Metadata
  asp.is_active,
  asp.created_at,
  asp.updated_at,
  asp.created_by,
  asp.updated_by
FROM public.answer_sheet_packets asp
LEFT JOIN public.users au ON asp.assigned_to = au.id
LEFT JOIN public.users cu ON asp.created_by = cu.id
LEFT JOIN public.users uu ON asp.updated_by = uu.id
LEFT JOIN public.institutions i ON asp.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON asp.examination_session_id = es.id
LEFT JOIN public.courses c ON asp.course_id = c.id
LEFT JOIN public.exam_timetables et ON asp.exam_timetable_id = et.id;

-- Recreate the summary view
CREATE VIEW public.answer_sheet_packets_summary_view AS
SELECT
  i.institution_code,
  i.name AS institution_name,
  es.session_code,
  es.session_name,
  c.course_code,
  c.course_name,
  c.course_name AS course_title, -- Alias for consistency
  COUNT(*) AS total_packets,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Created') AS created_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Assigned') AS assigned_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'In Evaluation') AS in_evaluation_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Completed') AS completed_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Archived') AS archived_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Returned') AS returned_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Missing') AS missing_count,
  SUM(asp.total_sheets) AS total_sheets,
  SUM(asp.sheets_evaluated) AS total_evaluated_sheets,
  ROUND(AVG(asp.evaluation_progress), 2) AS average_progress,
  ROUND(100.0 * SUM(asp.sheets_evaluated) / NULLIF(SUM(asp.total_sheets), 0), 2) AS overall_completion_percentage
FROM public.answer_sheet_packets asp
LEFT JOIN public.institutions i ON asp.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON asp.examination_session_id = es.id
LEFT JOIN public.courses c ON asp.course_id = c.id
WHERE asp.is_active = true
GROUP BY
  i.institution_code, i.name,
  es.session_code, es.session_name,
  c.course_code, c.course_name;

-- Recreate pending packets view
CREATE VIEW public.pending_answer_sheet_packets_view AS
SELECT
  asp.id,
  asp.packet_no,
  asp.barcode,
  asp.total_sheets,
  asp.packet_status,
  asp.packet_location,
  asp.created_at,
  i.institution_code,
  i.name AS institution_name,
  es.session_code,
  es.session_name,
  c.course_code,
  c.course_name,
  c.course_name AS course_title, -- Alias for consistency
  et.exam_date,
  et.session AS exam_session,
  asp.assigned_to,
  u.full_name AS assigned_to_name,
  asp.assigned_at,
  CASE
    WHEN asp.packet_status = 'Assigned'
    THEN EXTRACT(DAY FROM (CURRENT_TIMESTAMP - asp.assigned_at))
    ELSE NULL
  END AS days_since_assignment
FROM public.answer_sheet_packets asp
LEFT JOIN public.users u ON asp.assigned_to = u.id
LEFT JOIN public.institutions i ON asp.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON asp.examination_session_id = es.id
LEFT JOIN public.courses c ON asp.course_id = c.id
LEFT JOIN public.exam_timetables et ON asp.exam_timetable_id = et.id
WHERE asp.is_active = true
  AND asp.packet_status IN ('Created', 'Assigned', 'In Evaluation')
ORDER BY
  CASE asp.packet_status
    WHEN 'Created' THEN 1
    WHEN 'Assigned' THEN 2
    WHEN 'In Evaluation' THEN 3
  END,
  asp.created_at ASC;

-- Add comment
COMMENT ON VIEW public.answer_sheet_packets_detail_view IS 'Detailed view of answer sheet packets with all related information. Includes course_title alias for TypeScript compatibility.';
