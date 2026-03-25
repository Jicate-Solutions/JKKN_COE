-- ============================================================
-- MARKSHEET COLUMN GROUP MAPPING
-- ============================================================
-- This migration adds column_group calculation to course_mapping table
-- for dynamic marksheet PDF generation.
--
-- Pattern: course_order → column_group
--   Order 1 → Group 1
--   Order 2 → Group 2
--   Order 3 → Group 3
--   Order 4 → Group 1
--   Order 5 → Group 4
--   Order 6 → Group 3
--   Order 7 → Group 1
--   (Pattern repeats every 7 orders)
--
-- Layout in PDF:
--   | REG NO | NAME | CG1 courses | CG2 courses | CG3 courses | CG4 courses | SGPA | CGPA | RESULT |
-- ============================================================

-- Step 1: Create the column_group calculation function
CREATE OR REPLACE FUNCTION public.calculate_column_group(p_course_order numeric)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  pattern integer[] := ARRAY[1, 2, 3, 1, 4, 3, 1];
  idx integer;
BEGIN
  -- Handle null or invalid input
  IF p_course_order IS NULL OR p_course_order < 1 THEN
    RETURN 1;
  END IF;

  -- Convert to integer for index calculation
  -- Pattern: [1, 2, 3, 1, 4, 3, 1] repeating
  idx := ((p_course_order::integer - 1) % 7) + 1;
  RETURN pattern[idx];
END;
$$;

COMMENT ON FUNCTION public.calculate_column_group(numeric) IS
'Maps course_order to column_group (1-4) for marksheet layout.
Pattern: [1, 2, 3, 1, 4, 3, 1] repeating every 7 orders.
Used for grouping courses in PDF marksheet generation.';

-- Step 2: Add column_group column to course_mapping (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'course_mapping'
    AND column_name = 'column_group'
  ) THEN
    ALTER TABLE public.course_mapping
    ADD COLUMN column_group integer;
  END IF;
END $$;

-- Step 3: Update existing records with calculated column_group
UPDATE public.course_mapping
SET column_group = public.calculate_column_group(course_order)
WHERE column_group IS NULL;

-- Step 4: Add default value using function
ALTER TABLE public.course_mapping
ALTER COLUMN column_group SET DEFAULT 1;

-- Step 5: Create trigger to auto-calculate column_group on insert/update
CREATE OR REPLACE FUNCTION public.trigger_set_column_group()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.column_group := public.calculate_column_group(NEW.course_order);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_mapping_column_group ON public.course_mapping;

CREATE TRIGGER trg_course_mapping_column_group
BEFORE INSERT OR UPDATE OF course_order ON public.course_mapping
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_column_group();

COMMENT ON TRIGGER trg_course_mapping_column_group ON public.course_mapping IS
'Auto-calculates column_group when course_order changes';

-- Step 6: Create index for efficient grouping queries
CREATE INDEX IF NOT EXISTS idx_course_mapping_column_group_order
ON public.course_mapping(institution_code, program_code, batch_code, semester_code, column_group, course_order)
WHERE is_active = true;

-- Step 7: Create view for marksheet course data
CREATE OR REPLACE VIEW public.v_marksheet_courses AS
SELECT
  cm.id AS course_mapping_id,
  cm.institution_code,
  cm.program_code,
  cm.batch_code,
  cm.semester_code,
  cm.course_id,
  cm.course_code,
  c.course_name,
  c.display_code,
  c.credit,
  cm.course_order,
  cm.column_group,
  COALESCE(cm.internal_max_mark, c.internal_max_mark, 25) AS internal_max,
  COALESCE(cm.external_max_mark, c.external_max_mark, 75) AS external_max,
  COALESCE(cm.total_max_mark, c.total_max_mark, 100) AS total_max,
  s.semester AS semester_number,
  s.semester_code AS sem_code
FROM public.course_mapping cm
JOIN public.courses c ON c.id = cm.course_id
LEFT JOIN public.semesters s ON s.semester_code = cm.semester_code
WHERE cm.is_active = true;

COMMENT ON VIEW public.v_marksheet_courses IS
'View for marksheet PDF generation with pre-calculated column groups.
Courses are ordered within column groups for layout: CG1 | CG2 | CG3 | CG4';

-- Step 8: Grant permissions
GRANT SELECT ON public.v_marksheet_courses TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_column_group(numeric) TO authenticated;

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================
-- Run this to verify the column_group mapping:
/*
SELECT
  course_order,
  column_group,
  course_code,
  course_name
FROM public.v_marksheet_courses
WHERE institution_code = 'YOUR_INST_CODE'
  AND program_code = 'YOUR_PROG_CODE'
  AND batch_code = 'YOUR_BATCH'
  AND semester_code = 'YOUR_SEM'
ORDER BY column_group, course_order;
*/

-- ============================================================
-- MAPPING TABLE FOR REFERENCE
-- ============================================================
/*
┌─────────────┬──────────────┐
│ course_order│ column_group │
├─────────────┼──────────────┤
│      1      │      1       │
│      2      │      2       │
│      3      │      3       │
│      4      │      1       │
│      5      │      4       │
│      6      │      3       │
│      7      │      1       │
│      8      │      1       │  (cycle repeats)
│      9      │      2       │
│     10      │      3       │
│     11      │      1       │
│     12      │      4       │
│     13      │      3       │
│     14      │      1       │
└─────────────┴──────────────┘

PDF Layout:
╔════════════════════════════════════════════════════════════════════════════════════════╗
║ REG NO │ NAME │    CG1 (orders: 1,4,7)    │ CG2 (order: 2) │ CG3 (orders: 3,6) │ CG4 (order: 5) │ SGPA │ CGPA │ RESULT ║
╚════════════════════════════════════════════════════════════════════════════════════════╝
*/
