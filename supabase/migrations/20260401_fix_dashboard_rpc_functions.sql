-- =====================================================
-- Fix dashboard RPC functions to properly filter by institution
-- =====================================================
-- Date: 2026-04-01
-- Issue: dashboard_student_count, dashboard_grade_distribution, and
--        dashboard_performance_trends RPC functions ignore the inst_id
--        parameter, returning unfiltered results for all institutions.
-- Fix: DROP and recreate each function with proper WHERE clause
--      filtering on institutions_id when inst_id is provided.
-- Column fixes: final_marks uses 'letter_grade' not 'grade';
--               semester_results uses examination_session_id FK (JOIN needed).
-- =====================================================

-- Drop existing functions (return types may differ)
DROP FUNCTION IF EXISTS dashboard_student_count(UUID);
DROP FUNCTION IF EXISTS dashboard_grade_distribution(UUID);
DROP FUNCTION IF EXISTS dashboard_performance_trends(UUID);

-- 1. dashboard_student_count - Count distinct learners from exam_registrations
CREATE FUNCTION dashboard_student_count(inst_id UUID DEFAULT NULL)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(DISTINCT student_id)
  FROM exam_registrations
  WHERE (inst_id IS NULL OR institutions_id = inst_id);
$$;

-- 2. dashboard_grade_distribution - Grade distribution with institution filter
--    Uses letter_grade column from final_marks table
CREATE FUNCTION dashboard_grade_distribution(inst_id UUID DEFAULT NULL)
RETURNS TABLE(grade TEXT, count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT fm.letter_grade::TEXT as grade, COUNT(*) as count
  FROM final_marks fm
  WHERE fm.letter_grade IS NOT NULL
    AND fm.letter_grade != ''
    AND (inst_id IS NULL OR fm.institutions_id = inst_id)
  GROUP BY fm.letter_grade
  ORDER BY count DESC;
$$;

-- 3. dashboard_performance_trends - Performance trends with institution filter
--    JOINs to examination_sessions for session_name (semester_results has FK only)
CREATE FUNCTION dashboard_performance_trends(inst_id UUID DEFAULT NULL)
RETURNS TABLE(session TEXT, pass_rate NUMERIC, avg_gpa NUMERIC, total_results BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    es.session_name as session,
    ROUND(
      (COUNT(*) FILTER (WHERE sr.result_status = 'Pass')::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
      1
    ) as pass_rate,
    ROUND(AVG(sr.sgpa)::NUMERIC, 2) as avg_gpa,
    COUNT(*) as total_results
  FROM semester_results sr
  JOIN examination_sessions es ON es.id = sr.examination_session_id
  WHERE sr.is_active = true
    AND sr.is_published = true
    AND (inst_id IS NULL OR sr.institutions_id = inst_id)
  GROUP BY es.session_name
  ORDER BY es.session_name;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION dashboard_student_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_student_count(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION dashboard_grade_distribution(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_grade_distribution(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION dashboard_performance_trends(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_performance_trends(UUID) TO service_role;
