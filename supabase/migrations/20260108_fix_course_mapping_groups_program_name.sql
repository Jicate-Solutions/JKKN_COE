-- Fix get_course_mapping_groups function
-- Note: Programs and regulations come from MyJKKN API, not local database
-- So we only join institutions here, and program_name/regulation_name will be null
-- The API route fallback will fetch these from MyJKKN API

-- Drop the existing function first to allow changing return type
DROP FUNCTION IF EXISTS get_course_mapping_groups();

-- Recreate the function
CREATE FUNCTION get_course_mapping_groups()
RETURNS TABLE (
  institution_code TEXT,
  program_code TEXT,
  regulation_code TEXT,
  total_courses BIGINT,
  latest_created_at TIMESTAMPTZ,
  institution_name TEXT,
  program_name TEXT,
  regulation_name TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    cm.institution_code,
    cm.program_code,
    cm.regulation_code,
    COUNT(*) as total_courses,
    MAX(cm.created_at) as latest_created_at,
    i.name as institution_name,
    NULL::TEXT as program_name,  -- Programs come from MyJKKN API
    NULL::TEXT as regulation_name  -- Regulations come from MyJKKN API
  FROM course_mapping cm
  LEFT JOIN institutions i ON i.institution_code = cm.institution_code
  WHERE cm.is_active = true
  GROUP BY
    cm.institution_code,
    cm.program_code,
    cm.regulation_code,
    i.name
  ORDER BY MAX(cm.created_at) DESC;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_course_mapping_groups() TO authenticated;
GRANT EXECUTE ON FUNCTION get_course_mapping_groups() TO service_role;

