-- Fix: auto_determine_pass_status was reading GENERATED columns before they were computed
-- GENERATED columns are computed AFTER triggers run, so NEW.internal_percentage and
-- NEW.external_percentage were NULL/stale when the trigger checked them.
--
-- Solution:
-- 1. Calculate percentages directly from raw marks in the trigger function
-- 2. Fetch pass criteria from course_mapping table via course_offerings

CREATE OR REPLACE FUNCTION auto_determine_pass_status()
RETURNS TRIGGER AS $$
DECLARE
    v_internal_pass_mark NUMERIC;
    v_external_pass_mark NUMERIC;
    v_total_pass_mark NUMERIC;
    v_internal_pct DECIMAL(5,2);
    v_external_pct DECIMAL(5,2);
    v_passes_internal BOOLEAN;
    v_passes_external BOOLEAN;
    v_passes_total BOOLEAN;
BEGIN
    -- Fetch pass criteria from course_mapping via course_offerings
    SELECT
        cm.internal_pass_mark,
        cm.external_pass_mark,
        cm.total_pass_mark
    INTO
        v_internal_pass_mark,
        v_external_pass_mark,
        v_total_pass_mark
    FROM public.course_offerings co
    INNER JOIN public.course_mapping cm ON co.course_id = cm.id
    WHERE co.id = NEW.course_offering_id;

    -- If no pass criteria found, use defaults (40 for UG)
    v_internal_pass_mark := COALESCE(v_internal_pass_mark, 0);
    v_external_pass_mark := COALESCE(v_external_pass_mark, 0);
    v_total_pass_mark := COALESCE(v_total_pass_mark, 0);

    -- Calculate percentages directly from marks (don't rely on GENERATED columns)
    -- GENERATED columns are computed AFTER triggers, so NEW.internal_percentage is stale
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

    -- Determine pass/fail based on course-specific criteria
    -- Pass if obtained marks >= pass marks for each component
    v_passes_internal := (v_internal_pass_mark = 0) OR (NEW.internal_marks_obtained >= v_internal_pass_mark);
    v_passes_external := (v_external_pass_mark = 0) OR (NEW.external_marks_obtained >= v_external_pass_mark);
    v_passes_total := (v_total_pass_mark = 0) OR (NEW.total_marks_obtained >= v_total_pass_mark);

    IF v_passes_internal AND v_passes_external AND v_passes_total THEN
        NEW.is_pass = true;
        NEW.pass_status = 'Pass';

        -- Check for distinction (>=75%)
        IF NEW.percentage >= 75 THEN
            NEW.is_distinction = true;
        ELSE
            NEW.is_distinction = false;
        END IF;

        -- Check for first class (>=60%)
        IF NEW.percentage >= 60 THEN
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

-- Now update all existing final_marks records to recalculate is_pass
-- This UPDATE will trigger the fixed auto_determine_pass_status function
UPDATE public.final_marks
SET updated_at = CURRENT_TIMESTAMP
WHERE is_active = true;
