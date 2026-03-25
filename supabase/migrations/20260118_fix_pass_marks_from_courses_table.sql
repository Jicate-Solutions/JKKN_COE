-- =====================================================
-- FIX: Pass marks should come from courses table
-- =====================================================
-- Date: 2026-01-18
-- Issue: course_mapping table no longer has pass mark columns
--        (internal_pass_mark, external_pass_mark, total_pass_mark)
--        These fields are now in the courses table
--
-- Fix: Update trigger functions to get pass marks from courses table
-- =====================================================

-- =====================================================
-- STEP 1: Update auto_determine_pass_status trigger function
-- Pass marks come from courses table (course-specific)
-- =====================================================

CREATE OR REPLACE FUNCTION auto_determine_pass_status()
RETURNS TRIGGER AS $$
DECLARE
    v_internal_pass_mark NUMERIC;
    v_external_pass_mark NUMERIC;
    v_total_pass_mark NUMERIC;
    v_total_pct DECIMAL(5,2);
    v_passes_internal BOOLEAN;
    v_passes_external BOOLEAN;
    v_passes_total BOOLEAN;
    v_program_type VARCHAR(10);
    v_default_total_pass NUMERIC;
BEGIN
    -- Get course-specific pass marks from courses table
    -- Pass marks are configured per course in the courses table
    -- course_offerings.course_id -> course_mapping.id -> course_mapping.course_id -> courses.id
    -- OR course_offerings may directly reference courses.id
    SELECT
        COALESCE(c.internal_pass_mark, 0),
        COALESCE(c.external_pass_mark, 0),
        COALESCE(c.total_pass_mark, 0)
    INTO
        v_internal_pass_mark,
        v_external_pass_mark,
        v_total_pass_mark
    FROM public.course_offerings co
    LEFT JOIN public.course_mapping cm ON co.course_mapping_id = cm.id
    LEFT JOIN public.courses c ON c.id = COALESCE(cm.course_id, co.course_id)
    WHERE co.id = NEW.course_offering_id;

    -- If no course found, try direct lookup via course_id in final_marks
    IF v_internal_pass_mark IS NULL AND v_external_pass_mark IS NULL AND v_total_pass_mark IS NULL THEN
        SELECT
            COALESCE(c.internal_pass_mark, 0),
            COALESCE(c.external_pass_mark, 0),
            COALESCE(c.total_pass_mark, 0)
        INTO
            v_internal_pass_mark,
            v_external_pass_mark,
            v_total_pass_mark
        FROM public.courses c
        WHERE c.id = NEW.course_id;
    END IF;

    -- Default to 0 if still null
    v_internal_pass_mark := COALESCE(v_internal_pass_mark, 0);
    v_external_pass_mark := COALESCE(v_external_pass_mark, 0);
    v_total_pass_mark := COALESCE(v_total_pass_mark, 0);

    -- Calculate total percentage for distinction/first class checks
    IF NEW.total_marks_maximum > 0 THEN
        v_total_pct := ROUND((NEW.total_marks_obtained / NEW.total_marks_maximum) * 100, 2);
    ELSE
        v_total_pct := 0;
    END IF;

    -- Determine program type for fallback pass marks
    v_program_type := get_program_type_from_code(NEW.program_code);

    -- If total_pass_mark is not configured (0 or NULL), use program-type defaults
    -- UG: 40% of total_marks_maximum, PG: 50% of total_marks_maximum
    IF COALESCE(v_total_pass_mark, 0) = 0 THEN
        IF v_program_type = 'PG' THEN
            v_default_total_pass := NEW.total_marks_maximum * 0.50;  -- 50% for PG
        ELSE
            v_default_total_pass := NEW.total_marks_maximum * 0.40;  -- 40% for UG
        END IF;
        v_total_pass_mark := v_default_total_pass;
    END IF;

    -- Determine pass/fail based on course-specific pass marks
    -- If pass mark is 0 or NULL, that component is auto-pass (for internal/external only)
    v_passes_internal := (COALESCE(v_internal_pass_mark, 0) = 0) OR
                         (NEW.internal_marks_obtained >= v_internal_pass_mark);

    v_passes_external := (COALESCE(v_external_pass_mark, 0) = 0) OR
                         (NEW.external_marks_obtained >= v_external_pass_mark);

    -- Total pass mark always checked (uses default if not configured)
    v_passes_total := (NEW.total_marks_obtained >= v_total_pass_mark);

    IF v_passes_internal AND v_passes_external AND v_passes_total THEN
        NEW.is_pass = true;
        NEW.pass_status = 'Pass';

        -- Check for distinction (>=75% total)
        IF v_total_pct >= 75 THEN
            NEW.is_distinction = true;
        ELSE
            NEW.is_distinction = false;
        END IF;

        -- Check for first class (>=60% total)
        IF v_total_pct >= 60 THEN
            NEW.is_first_class = true;
        ELSE
            NEW.is_first_class = false;
        END IF;
    ELSE
        NEW.is_pass = false;
        NEW.pass_status = 'Reappear';
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 2: Recreate triggers (order matters)
-- =====================================================

DROP TRIGGER IF EXISTS trigger_01_auto_determine_pass_status ON final_marks;
DROP TRIGGER IF EXISTS trigger_02_auto_assign_letter_grade ON final_marks;
DROP TRIGGER IF EXISTS trigger_auto_determine_pass_status ON final_marks;
DROP TRIGGER IF EXISTS trigger_auto_assign_letter_grade ON final_marks;

-- First: Determine pass status
CREATE TRIGGER trigger_01_auto_determine_pass_status
BEFORE INSERT OR UPDATE ON final_marks
FOR EACH ROW
WHEN (NEW.percentage IS NOT NULL)
EXECUTE FUNCTION auto_determine_pass_status();

-- Second: Assign letter grade (after pass status is determined)
CREATE TRIGGER trigger_02_auto_assign_letter_grade
BEFORE INSERT OR UPDATE ON final_marks
FOR EACH ROW
WHEN (NEW.percentage IS NOT NULL)
EXECUTE FUNCTION auto_assign_letter_grade();

-- =====================================================
-- STEP 3: Verification
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=== PASS MARKS TRIGGER FIX COMPLETE ===';
    RAISE NOTICE 'Pass marks now come from courses table instead of course_mapping';
    RAISE NOTICE 'Triggers recreated successfully';
END $$;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
