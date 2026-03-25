-- =====================================================
-- FIX: auto_assign_letter_grade trigger function
-- =====================================================
-- When a student FAILS (is_pass = false), the grade should always be:
--   letter_grade = 'U'
--   grade_points = 0
--   grade_description = 'Re-Appear'
--
-- Regardless of their percentage score.
-- =====================================================

CREATE OR REPLACE FUNCTION auto_assign_letter_grade()
RETURNS TRIGGER AS $$
DECLARE
    v_grade_system_code VARCHAR(10);
    v_grade_record RECORD;
    v_is_pass BOOLEAN;
BEGIN
    -- First, check if the student passed using the pass status from auto_determine_pass_status trigger
    -- The auto_determine_pass_status trigger runs BEFORE this one and sets is_pass
    v_is_pass := COALESCE(NEW.is_pass, false);

    -- If student FAILED, always assign U grade with 0 grade points
    IF NOT v_is_pass THEN
        NEW.letter_grade := 'U';
        NEW.grade_points := 0;
        NEW.grade_description := 'Re-Appear';
        RETURN NEW;
    END IF;

    -- Student PASSED - get grade from grade_system table based on percentage

    -- Get the grade system code for this program (UG or PG)
    -- Determine from program_duration_yrs: <= 3 years = UG, > 3 years = PG
    SELECT
        CASE
            WHEN p.program_duration_yrs <= 3 THEN 'UG'
            ELSE 'PG'
        END INTO v_grade_system_code
    FROM public.programs p
    WHERE p.id = NEW.program_id;

    -- Default to UG if not found
    v_grade_system_code := COALESCE(v_grade_system_code, 'UG');

    -- Find the matching grade from grade_system table
    SELECT
        gs.grade,
        gs.grade_point,
        gs.description
    INTO v_grade_record
    FROM public.grade_system gs
    WHERE gs.grade_system_code = v_grade_system_code
      AND gs.is_active = true
      AND NEW.percentage >= gs.min_mark
      AND NEW.percentage <= gs.max_mark
    ORDER BY gs.min_mark DESC
    LIMIT 1;

    -- If a matching grade was found, assign it
    IF v_grade_record.grade IS NOT NULL THEN
        NEW.letter_grade := v_grade_record.grade;
        NEW.grade_points := v_grade_record.grade_point;
        NEW.grade_description := v_grade_record.description;
    ELSE
        -- Fallback if no grade found in database - use percentage-based assignment
        IF NEW.percentage >= 90 THEN
            NEW.letter_grade := 'O';
            NEW.grade_points := 10.0;
            NEW.grade_description := 'Outstanding';
        ELSIF NEW.percentage >= 80 THEN
            NEW.letter_grade := 'D+';
            NEW.grade_points := 9.0;
            NEW.grade_description := 'Excellent';
        ELSIF NEW.percentage >= 75 THEN
            NEW.letter_grade := 'D';
            NEW.grade_points := 8.0;
            NEW.grade_description := 'Distinction';
        ELSIF NEW.percentage >= 70 THEN
            NEW.letter_grade := 'A+';
            NEW.grade_points := 7.5;
            NEW.grade_description := 'Very Good';
        ELSIF NEW.percentage >= 60 THEN
            NEW.letter_grade := 'A';
            NEW.grade_points := 7.0;
            NEW.grade_description := 'Good';
        ELSIF NEW.percentage >= 50 THEN
            NEW.letter_grade := 'B';
            NEW.grade_points := 6.0;
            NEW.grade_description := 'Above Average';
        ELSIF NEW.percentage >= 40 THEN
            NEW.letter_grade := 'C';
            NEW.grade_points := 5.0;
            NEW.grade_description := 'Average';
        ELSE
            -- Below passing threshold - this shouldn't happen if is_pass logic is correct
            NEW.letter_grade := 'U';
            NEW.grade_points := 0;
            NEW.grade_description := 'Re-Appear';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- IMPORTANT: Trigger execution order
-- =====================================================
-- The triggers execute in alphabetical order by name:
-- 1. trigger_auto_assign_letter_grade (assigns grade based on percentage)
-- 2. trigger_auto_calculate_final_total_marks (calculates totals)
-- 3. trigger_auto_determine_pass_status (determines pass/fail)
-- 4. trigger_auto_populate_final_marks_lock (lock management)
-- 5. trigger_calculate_final_marks_on_insert (initial calculation)
-- ...
--
-- PROBLEM: auto_assign_letter_grade runs BEFORE auto_determine_pass_status
-- so is_pass is not yet set when grade is assigned!
--
-- SOLUTION: Drop and recreate triggers with proper execution order
-- =====================================================

-- Drop existing triggers (we'll recreate them with proper order)
DROP TRIGGER IF EXISTS trigger_auto_assign_letter_grade ON final_marks;
DROP TRIGGER IF EXISTS trigger_auto_determine_pass_status ON final_marks;

-- Recreate triggers with explicit execution order using trigger names
-- PostgreSQL executes BEFORE triggers in alphabetical order by name
-- We want: pass_status FIRST, then grade assignment

-- 1. First: Determine pass status (rename to sort first alphabetically)
CREATE TRIGGER trigger_01_auto_determine_pass_status
BEFORE INSERT OR UPDATE ON final_marks
FOR EACH ROW
WHEN (NEW.percentage IS NOT NULL)
EXECUTE FUNCTION auto_determine_pass_status();

-- 2. Second: Assign letter grade (after pass status is determined)
CREATE TRIGGER trigger_02_auto_assign_letter_grade
BEFORE INSERT OR UPDATE ON final_marks
FOR EACH ROW
WHEN (NEW.percentage IS NOT NULL)
EXECUTE FUNCTION auto_assign_letter_grade();

-- =====================================================
-- UPDATE existing records to recalculate grades
-- This will trigger the updated functions
-- =====================================================
UPDATE public.final_marks
SET updated_at = CURRENT_TIMESTAMP
WHERE is_active = true;

-- =====================================================
-- VERIFICATION: Check the results
-- =====================================================
DO $$
DECLARE
    v_total INTEGER;
    v_passed INTEGER;
    v_failed INTEGER;
    v_failed_with_u INTEGER;
    v_failed_wrong_grade INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM public.final_marks WHERE is_active = true;
    SELECT COUNT(*) INTO v_passed FROM public.final_marks WHERE is_active = true AND is_pass = true;
    SELECT COUNT(*) INTO v_failed FROM public.final_marks WHERE is_active = true AND is_pass = false;
    SELECT COUNT(*) INTO v_failed_with_u FROM public.final_marks WHERE is_active = true AND is_pass = false AND letter_grade = 'U';
    SELECT COUNT(*) INTO v_failed_wrong_grade FROM public.final_marks WHERE is_active = true AND is_pass = false AND letter_grade != 'U';

    RAISE NOTICE '=== GRADE ASSIGNMENT FIX SUMMARY ===';
    RAISE NOTICE 'Total records: %', v_total;
    RAISE NOTICE 'Passed: %', v_passed;
    RAISE NOTICE 'Failed: %', v_failed;
    RAISE NOTICE 'Failed with correct U grade: %', v_failed_with_u;
    RAISE NOTICE 'Failed with WRONG grade (should be 0): %', v_failed_wrong_grade;

    IF v_failed_wrong_grade > 0 THEN
        RAISE NOTICE 'WARNING: % failed records still have incorrect grades!', v_failed_wrong_grade;
    ELSE
        RAISE NOTICE 'SUCCESS: All failed records have correct U grade!';
    END IF;
END $$;
