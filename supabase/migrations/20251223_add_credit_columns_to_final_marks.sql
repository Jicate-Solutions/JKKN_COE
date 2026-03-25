-- =====================================================
-- Migration: Add Credit and Total Grade Points to final_marks
-- =====================================================
-- Date: 2024-12-23
-- Purpose: Add credit and total_grade_points columns for NAAD/ABC export
--
-- Logic:
-- - credit: Copied from courses.credit
-- - grade_points: If pass → grade_point from grade_system, else 0
-- - total_grade_points: credit * grade_points
-- =====================================================

-- Add the new columns if they don't exist
DO $$
BEGIN
    -- Add credit column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'final_marks'
        AND column_name = 'credit'
    ) THEN
        ALTER TABLE public.final_marks
        ADD COLUMN credit DECIMAL(4,2);

        COMMENT ON COLUMN public.final_marks.credit IS 'Credit value copied from courses.credit at time of calculation';
    END IF;

    -- Add total_grade_points column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'final_marks'
        AND column_name = 'total_grade_points'
    ) THEN
        ALTER TABLE public.final_marks
        ADD COLUMN total_grade_points DECIMAL(6,2);

        COMMENT ON COLUMN public.final_marks.total_grade_points IS 'Total grade points = credit * grade_points (for GPA calculation)';
    END IF;
END $$;

-- =====================================================
-- Update existing records with calculated values
-- =====================================================
-- This updates all existing final_marks records with:
-- - credit from courses table
-- - total_grade_points = credit * grade_points (0 if fail/absent)
-- =====================================================

UPDATE public.final_marks fm
SET
    credit = COALESCE(c.credit, 0),
    total_grade_points =
        COALESCE(c.credit, 0) *
        CASE
            WHEN fm.is_pass = true
            THEN COALESCE(fm.grade_points, 0)
            ELSE 0
        END
FROM public.courses c
WHERE fm.course_id = c.id
    AND (fm.credit IS NULL OR fm.total_grade_points IS NULL);

-- =====================================================
-- Create/Update trigger to auto-calculate on insert/update
-- =====================================================

CREATE OR REPLACE FUNCTION public.calculate_final_marks_credit_points()
RETURNS TRIGGER AS $$
DECLARE
    v_credit DECIMAL(4,2);
BEGIN
    -- Get credit from courses table
    SELECT COALESCE(credit, 0) INTO v_credit
    FROM public.courses
    WHERE id = NEW.course_id;

    -- Set credit
    NEW.credit := v_credit;

    -- Calculate total_grade_points
    -- If pass: credit * grade_points
    -- If fail/absent: 0
    IF NEW.is_pass = true THEN
        NEW.total_grade_points := v_credit * COALESCE(NEW.grade_points, 0);
    ELSE
        NEW.total_grade_points := 0;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_calculate_final_marks_credit_points ON public.final_marks;

-- Create trigger for insert and update
CREATE TRIGGER trg_calculate_final_marks_credit_points
    BEFORE INSERT OR UPDATE ON public.final_marks
    FOR EACH ROW
    EXECUTE FUNCTION public.calculate_final_marks_credit_points();

-- =====================================================
-- Add indexes for performance
-- =====================================================

-- Index on credit for filtering/aggregation
CREATE INDEX IF NOT EXISTS idx_final_marks_credit
ON public.final_marks(credit)
WHERE is_active = true;

-- Index on total_grade_points for GPA calculation queries
CREATE INDEX IF NOT EXISTS idx_final_marks_total_grade_points
ON public.final_marks(total_grade_points)
WHERE is_active = true;

-- =====================================================
-- Grant permissions
-- =====================================================

-- The columns inherit table permissions, but ensure trigger function is accessible
GRANT EXECUTE ON FUNCTION public.calculate_final_marks_credit_points() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_final_marks_credit_points() TO service_role;

-- =====================================================
-- Verification query (optional - run manually to verify)
-- =====================================================
/*
-- Check that all records have credit and total_grade_points populated
SELECT
    COUNT(*) AS total_records,
    COUNT(credit) AS with_credit,
    COUNT(total_grade_points) AS with_grade_points,
    COUNT(*) FILTER (WHERE credit IS NULL) AS missing_credit,
    COUNT(*) FILTER (WHERE total_grade_points IS NULL) AS missing_grade_points
FROM public.final_marks
WHERE is_active = true;

-- Sample data check
SELECT
    fm.id,
    s.register_number,
    c.course_code,
    c.credit AS course_credit,
    fm.credit AS stored_credit,
    fm.grade_points,
    fm.total_grade_points,
    fm.is_pass
FROM public.final_marks fm
INNER JOIN public.students s ON fm.student_id = s.id
INNER JOIN public.courses c ON fm.course_id = c.id
WHERE fm.is_active = true
LIMIT 10;
*/

-- =====================================================
-- END OF MIGRATION
-- =====================================================
