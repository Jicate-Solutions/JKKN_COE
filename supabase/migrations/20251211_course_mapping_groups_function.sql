-- Function to get course mapping groups with counts efficiently using SQL GROUP BY
-- This is much faster than fetching all rows and grouping in JavaScript
-- Note: Programs and regulations come from MyJKKN API, not local database
-- So we only join institutions here, and program_name/regulation_name will be null
-- The API route will fetch these from MyJKKN API

CREATE OR REPLACE FUNCTION get_course_mapping_groups()
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

-- Create index for better GROUP BY performance if not exists
CREATE INDEX IF NOT EXISTS idx_course_mapping_groups
ON course_mapping (institution_code, program_code, regulation_code)
WHERE is_active = true;

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_course_mapping_created_at
ON course_mapping (created_at DESC)
WHERE is_active = true;
