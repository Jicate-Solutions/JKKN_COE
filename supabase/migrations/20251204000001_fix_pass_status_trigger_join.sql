-- =====================================================
-- FIX: auto_determine_pass_status trigger
-- =====================================================
-- Pass marks are ALWAYS read from the COURSES table for each course.
-- Each course has its own pass mark configuration:
--   - internal_pass_mark
--   - external_pass_mark
--   - total_pass_mark
--
-- The trigger compares obtained marks against course-specific pass marks.
-- No hardcoded UG/PG defaults - all values come from courses table.
-- =====================================================

CREATE OR REPLACE FUNCTION auto_determine_pass_status()
RETURNS TRIGGER AS $$
DECLARE
    v_internal_pass_mark NUMERIC;
    v_external_pass_mark NUMERIC;
    v_total_pass_mark NUMERIC;
    v_internal_max_mark NUMERIC;
    v_external_max_mark NUMERIC;
    v_total_max_mark NUMERIC;
    v_internal_pct DECIMAL(5,2);
    v_external_pct DECIMAL(5,2);
    v_total_pct DECIMAL(5,2);
    v_internal_pass_pct DECIMAL(5,2);
    v_external_pass_pct DECIMAL(5,2);
    v_total_pass_pct DECIMAL(5,2);
    v_passes_internal BOOLEAN;
    v_passes_external BOOLEAN;
    v_passes_total BOOLEAN;
BEGIN
    -- =====================================================
    -- Step 1: Fetch pass criteria from COURSES table
    -- Each course has its own pass mark requirements
    -- =====================================================
    SELECT
        c.internal_pass_mark,
        c.external_pass_mark,
        c.total_pass_mark,
        c.internal_max_mark,
        c.external_max_mark,
        c.total_max_mark
    INTO
        v_internal_pass_mark,
        v_external_pass_mark,
        v_total_pass_mark,
        v_internal_max_mark,
        v_external_max_mark,
        v_total_max_mark
    FROM public.course_offerings co
    INNER JOIN public.courses c ON co.course_id = c.id
    WHERE co.id = NEW.course_offering_id;

    -- Default max marks from NEW record if not found in courses table
    v_internal_max_mark := COALESCE(v_internal_max_mark, NEW.internal_marks_maximum);
    v_external_max_mark := COALESCE(v_external_max_mark, NEW.external_marks_maximum);
    v_total_max_mark := COALESCE(v_total_max_mark, NEW.total_marks_maximum);

    -- Pass marks default to 0 (meaning no minimum required if not set)
    v_internal_pass_mark := COALESCE(v_internal_pass_mark, 0);
    v_external_pass_mark := COALESCE(v_external_pass_mark, 0);
    v_total_pass_mark := COALESCE(v_total_pass_mark, 0);

    -- =====================================================
    -- Step 2: Calculate OBTAINED percentages from marks
    -- =====================================================
    IF NEW.internal_marks_maximum > 0 THEN
        v_internal_pct := ROUND((NEW.internal_marks_obtained / NEW.internal_marks_maximum) * 100, 2);
    ELSE
        v_internal_pct := 0;
    END IF;

    IF NEW.external_marks_maximum > 0 THEN
        v_external_pct := ROUND((NEW.external_marks_obtained / NEW.external_marks_maximum) * 100, 2);
    ELSE
        v_external_pct := 0;
    END IF;

    IF NEW.total_marks_maximum > 0 THEN
        v_total_pct := ROUND((NEW.total_marks_obtained / NEW.total_marks_maximum) * 100, 2);
    ELSE
        v_total_pct := 0;
    END IF;

    -- =====================================================
    -- Step 3: Calculate PASS PERCENTAGE thresholds from course pass marks
    -- If pass_mark < max_mark, it's an absolute value - convert to percentage
    -- If pass_mark >= max_mark, assume it's already stored as percentage
    -- If pass_mark = 0, no minimum required for that component
    -- =====================================================

    -- Internal pass percentage
    IF v_internal_max_mark > 0 AND v_internal_pass_mark > 0 THEN
        IF v_internal_pass_mark < v_internal_max_mark THEN
            -- Pass mark is absolute (e.g., 10 out of 25) - convert to percentage
            v_internal_pass_pct := ROUND((v_internal_pass_mark / v_internal_max_mark) * 100, 2);
        ELSE
            -- Pass mark is already a percentage (e.g., 40)
            v_internal_pass_pct := v_internal_pass_mark;
        END IF;
    ELSE
        v_internal_pass_pct := 0; -- No internal passing minimum
    END IF;

    -- External pass percentage
    IF v_external_max_mark > 0 AND v_external_pass_mark > 0 THEN
        IF v_external_pass_mark < v_external_max_mark THEN
            -- Pass mark is absolute (e.g., 38 out of 75) - convert to percentage
            v_external_pass_pct := ROUND((v_external_pass_mark / v_external_max_mark) * 100, 2);
        ELSE
            -- Pass mark is already a percentage (e.g., 50)
            v_external_pass_pct := v_external_pass_mark;
        END IF;
    ELSE
        v_external_pass_pct := 0; -- No external passing minimum
    END IF;

    -- Total pass percentage
    IF v_total_max_mark > 0 AND v_total_pass_mark > 0 THEN
        IF v_total_pass_mark < v_total_max_mark THEN
            -- Pass mark is absolute (e.g., 50 out of 100) - convert to percentage
            v_total_pass_pct := ROUND((v_total_pass_mark / v_total_max_mark) * 100, 2);
        ELSE
            -- Pass mark is already a percentage (e.g., 50)
            v_total_pass_pct := v_total_pass_mark;
        END IF;
    ELSE
        v_total_pass_pct := 0; -- No total passing minimum
    END IF;

    -- =====================================================
    -- Step 4: Determine pass/fail based on PERCENTAGE comparison
    -- A component passes if: pass_pct = 0 (no minimum) OR obtained_pct >= pass_pct
    -- =====================================================
    v_passes_internal := (v_internal_pass_pct = 0) OR (v_internal_pct >= v_internal_pass_pct);
    v_passes_external := (v_external_pass_pct = 0) OR (v_external_pct >= v_external_pass_pct);
    v_passes_total := (v_total_pass_pct = 0) OR (v_total_pct >= v_total_pass_pct);

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
        NEW.pass_status = 'Fail';
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- UPDATE existing final_marks records to recalculate is_pass
-- This UPDATE will trigger the fixed auto_determine_pass_status function
-- =====================================================
UPDATE public.final_marks
SET updated_at = CURRENT_TIMESTAMP
WHERE is_active = true;

-- =====================================================
-- VERIFICATION: Log summary of pass/fail distribution after fix
-- =====================================================
DO $$
DECLARE
    v_total INTEGER;
    v_passed INTEGER;
    v_failed INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM public.final_marks WHERE is_active = true;
    SELECT COUNT(*) INTO v_passed FROM public.final_marks WHERE is_active = true AND is_pass = true;
    SELECT COUNT(*) INTO v_failed FROM public.final_marks WHERE is_active = true AND is_pass = false;

    RAISE NOTICE '=== PASS STATUS FIX SUMMARY ===';
    RAISE NOTICE 'Total records: %', v_total;
    RAISE NOTICE 'Passed: %', v_passed;
    RAISE NOTICE 'Failed: %', v_failed;
    RAISE NOTICE 'Pass rate: %', CASE WHEN v_total > 0 THEN ROUND((v_passed::DECIMAL / v_total) * 100, 2) ELSE 0 END || '%';
END $$;
