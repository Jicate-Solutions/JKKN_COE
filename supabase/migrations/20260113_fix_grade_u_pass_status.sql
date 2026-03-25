-- =====================================================
-- FIX: Grade U showing incorrect GP and Pass Status
-- =====================================================
-- Date: 2026-01-13
-- Issue: Students with grade U are showing:
--   - GP = total_marks/10 (e.g., 3.1 for 31%)
--   - Status = "Pass" instead of "Fail"
--
-- Root Cause: The is_pass flag is incorrectly set to true
-- when students should have failed based on pass mark criteria.
--
-- The pass criteria for UG:
--   - External: 40%
--   - Total: 40%
--
-- Fix Strategy:
-- 1. First, recalculate is_pass based on actual pass marks
-- 2. Then, update grade_points and pass_status accordingly
-- =====================================================

-- STEP 0: Drop FK constraint on course_offerings.program_id
-- programs table doesn't exist locally (programs come from MyJKKN API)
-- We use program_code instead for filtering
ALTER TABLE IF EXISTS public.course_offerings
    DROP CONSTRAINT IF EXISTS course_offerings_program_id_fkey;

-- STEP 1: Create a function to correctly determine pass status
-- This function will be used for both UPDATE and future trigger operations
CREATE OR REPLACE FUNCTION calculate_pass_status(
    p_internal_obtained NUMERIC,
    p_internal_maximum NUMERIC,
    p_external_obtained NUMERIC,
    p_external_maximum NUMERIC,
    p_total_obtained NUMERIC,
    p_total_maximum NUMERIC,
    p_internal_pass_mark NUMERIC,
    p_external_pass_mark NUMERIC,
    p_total_pass_mark NUMERIC,
    p_program_type VARCHAR DEFAULT 'UG'
) RETURNS BOOLEAN AS $$
DECLARE
    v_external_pct DECIMAL(5,2);
    v_total_pct DECIMAL(5,2);
    v_external_pass_pct DECIMAL(5,2);
    v_total_pass_pct DECIMAL(5,2);
    v_passes_external BOOLEAN;
    v_passes_total BOOLEAN;
BEGIN
    -- Calculate obtained percentages
    IF p_external_maximum > 0 THEN
        v_external_pct := ROUND((p_external_obtained / p_external_maximum) * 100, 2);
    ELSE
        v_external_pct := 100; -- No external marks = auto pass
    END IF;

    IF p_total_maximum > 0 THEN
        v_total_pct := ROUND((p_total_obtained / p_total_maximum) * 100, 2);
    ELSE
        v_total_pct := 0;
    END IF;

    -- Determine pass percentage thresholds
    -- If course has pass marks set, use those
    -- Otherwise use UG defaults: External 40%, Total 40%
    IF COALESCE(p_external_pass_mark, 0) > 0 AND p_external_maximum > 0 THEN
        IF p_external_pass_mark < p_external_maximum THEN
            v_external_pass_pct := ROUND((p_external_pass_mark / p_external_maximum) * 100, 2);
        ELSE
            v_external_pass_pct := p_external_pass_mark;
        END IF;
    ELSE
        -- Default external pass percentage based on program type
        v_external_pass_pct := CASE WHEN p_program_type = 'PG' THEN 50 ELSE 40 END;
    END IF;

    IF COALESCE(p_total_pass_mark, 0) > 0 AND p_total_maximum > 0 THEN
        IF p_total_pass_mark < p_total_maximum THEN
            v_total_pass_pct := ROUND((p_total_pass_mark / p_total_maximum) * 100, 2);
        ELSE
            v_total_pass_pct := p_total_pass_mark;
        END IF;
    ELSE
        -- Default total pass percentage based on program type
        v_total_pass_pct := CASE WHEN p_program_type = 'PG' THEN 50 ELSE 40 END;
    END IF;

    -- Determine pass/fail
    v_passes_external := (v_external_pass_pct = 0) OR (v_external_pct >= v_external_pass_pct);
    v_passes_total := (v_total_pass_pct = 0) OR (v_total_pct >= v_total_pass_pct);

    RETURN v_passes_external AND v_passes_total;
END;
$$ LANGUAGE plpgsql;

-- STEP 2: Update is_pass for all records based on correct pass criteria
-- This fixes records where is_pass is incorrectly set to true
-- NOTE: programs table doesn't exist locally - programs come from MyJKKN API
-- Using default 'UG' for program type (most programs are UG)
-- PG programs should have course-specific pass marks set in course_mapping
UPDATE public.final_marks fm
SET
    is_pass = calculate_pass_status(
        fm.internal_marks_obtained,
        fm.internal_marks_maximum,
        fm.external_marks_obtained,
        fm.external_marks_maximum,
        fm.total_marks_obtained,
        fm.total_marks_maximum,
        cm.internal_pass_mark,
        cm.external_pass_mark,
        cm.total_pass_mark,
        'UG'  -- Default to UG, PG programs use course-specific pass marks
    ),
    updated_at = CURRENT_TIMESTAMP
FROM public.course_offerings co,
     public.course_mapping cm
WHERE fm.course_offering_id = co.id
  AND co.course_id = cm.id
  AND fm.is_active = true;

-- STEP 3: Now fix grade_points and pass_status based on corrected is_pass
-- For failed students (is_pass = false), set GP = 0 and letter_grade = U
-- Note: pass_status = 'Reappear' is used (not 'Fail') to match API behavior
UPDATE public.final_marks
SET
    grade_points = 0,
    letter_grade = 'U',
    grade_description = 'Re-Appear',
    pass_status = 'Reappear',
    is_distinction = false,
    is_first_class = false,
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = true
  AND is_pass = false
  AND pass_status NOT IN ('Absent', 'Withheld', 'Expelled')
  AND letter_grade != 'AAA';

-- STEP 4: For passed students, recalculate grade_points = total_marks/10
UPDATE public.final_marks
SET
    grade_points = ROUND(total_marks_obtained / 10.0, 2),
    pass_status = 'Pass',
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = true
  AND is_pass = true;

-- STEP 5: Preserve AAA grade for absent students
UPDATE public.final_marks
SET
    grade_points = 0,
    is_pass = false,
    pass_status = 'Absent',
    is_distinction = false,
    is_first_class = false,
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = true
  AND (letter_grade = 'AAA' OR pass_status = 'Absent');

-- STEP 6: Update the auto_determine_pass_status trigger to use defaults
-- NOTE: programs table doesn't exist locally - programs come from MyJKKN API
-- We use 'UG' as default since most programs are UG
-- For PG programs, course-specific pass marks should be set in course_mapping
CREATE OR REPLACE FUNCTION auto_determine_pass_status()
RETURNS TRIGGER AS $$
DECLARE
    v_internal_pass_mark NUMERIC;
    v_external_pass_mark NUMERIC;
    v_total_pass_mark NUMERIC;
    v_external_pct DECIMAL(5,2);
    v_total_pct DECIMAL(5,2);
    v_external_pass_pct DECIMAL(5,2);
    v_total_pass_pct DECIMAL(5,2);
    v_program_type VARCHAR(10);
    v_passes_external BOOLEAN;
    v_passes_total BOOLEAN;
BEGIN
    -- Default to UG - programs table doesn't exist locally (MyJKKN API)
    -- PG programs should have course-specific pass marks set in course_mapping
    v_program_type := 'UG';

    -- Get course-specific pass marks from course_mapping table
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

    -- Calculate obtained percentages
    IF NEW.external_marks_maximum > 0 THEN
        v_external_pct := ROUND((NEW.external_marks_obtained / NEW.external_marks_maximum) * 100, 2);
    ELSE
        v_external_pct := 100; -- No external marks = auto pass
    END IF;

    IF NEW.total_marks_maximum > 0 THEN
        v_total_pct := ROUND((NEW.total_marks_obtained / NEW.total_marks_maximum) * 100, 2);
    ELSE
        v_total_pct := 0;
    END IF;

    -- Determine pass percentage thresholds
    -- Use course-specific marks if set, otherwise use program defaults
    IF COALESCE(v_external_pass_mark, 0) > 0 AND NEW.external_marks_maximum > 0 THEN
        IF v_external_pass_mark < NEW.external_marks_maximum THEN
            v_external_pass_pct := ROUND((v_external_pass_mark / NEW.external_marks_maximum) * 100, 2);
        ELSE
            v_external_pass_pct := v_external_pass_mark;
        END IF;
    ELSE
        -- Default: UG = 40%, PG = 50%
        v_external_pass_pct := CASE WHEN v_program_type = 'PG' THEN 50 ELSE 40 END;
    END IF;

    IF COALESCE(v_total_pass_mark, 0) > 0 AND NEW.total_marks_maximum > 0 THEN
        IF v_total_pass_mark < NEW.total_marks_maximum THEN
            v_total_pass_pct := ROUND((v_total_pass_mark / NEW.total_marks_maximum) * 100, 2);
        ELSE
            v_total_pass_pct := v_total_pass_mark;
        END IF;
    ELSE
        -- Default: UG = 40%, PG = 50%
        v_total_pass_pct := CASE WHEN v_program_type = 'PG' THEN 50 ELSE 40 END;
    END IF;

    -- Determine pass/fail based on PERCENTAGE comparison
    v_passes_external := (v_external_pass_pct = 0) OR (v_external_pct >= v_external_pass_pct);
    v_passes_total := (v_total_pass_pct = 0) OR (v_total_pct >= v_total_pass_pct);

    IF v_passes_external AND v_passes_total THEN
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
        NEW.pass_status = 'Reappear';  -- Use 'Reappear' to match API behavior
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 7: Update auto_assign_letter_grade to correctly handle fail cases
CREATE OR REPLACE FUNCTION auto_assign_letter_grade()
RETURNS TRIGGER AS $$
DECLARE
    v_grade_system_code VARCHAR(10);
    v_grade_record RECORD;
    v_is_pass BOOLEAN;
    v_attendance_status VARCHAR(20);
BEGIN
    v_is_pass := COALESCE(NEW.is_pass, false);

    -- CRITICAL: Check if already marked as ABSENT
    IF NEW.pass_status = 'Absent' THEN
        NEW.letter_grade := 'AAA';
        NEW.grade_points := 0;
        NEW.grade_description := 'Absent';
        NEW.is_pass := false;
        RETURN NEW;
    END IF;

    IF NEW.letter_grade = 'AAA' THEN
        NEW.grade_points := 0;
        NEW.grade_description := 'Absent';
        NEW.pass_status := 'Absent';
        NEW.is_pass := false;
        RETURN NEW;
    END IF;

    -- Check exam_attendance table for absent students
    SELECT ea.attendance_status
    INTO v_attendance_status
    FROM public.exam_attendance ea
    WHERE ea.student_id = NEW.student_id
      AND ea.course_id = NEW.course_id
      AND ea.examination_session_id = NEW.examination_session_id
    LIMIT 1;

    IF COALESCE(v_attendance_status, '') = 'Absent' THEN
        NEW.letter_grade := 'AAA';
        NEW.grade_points := 0;
        NEW.grade_description := 'Absent';
        NEW.pass_status := 'Absent';
        NEW.is_pass := false;
        RETURN NEW;
    END IF;

    -- CRITICAL: If student FAILED, always assign U grade with GP = 0
    IF NOT v_is_pass THEN
        NEW.letter_grade := 'U';
        NEW.grade_points := 0;
        NEW.grade_description := 'Re-Appear';
        IF NEW.pass_status IS NULL OR NEW.pass_status NOT IN ('Absent', 'Withheld', 'Expelled') THEN
            NEW.pass_status := 'Reappear';  -- Use 'Reappear' to match API behavior
        END IF;
        RETURN NEW;
    END IF;

    -- Student PASSED - get letter grade from grade_system table
    NEW.pass_status := 'Pass';

    -- Get grade system code (UG/PG)
    -- NOTE: programs table doesn't exist locally (MyJKKN API)
    -- Default to UG - most programs are UG
    v_grade_system_code := 'UG';

    -- Get letter grade from grade_system based on percentage
    SELECT
        gs.grade,
        gs.description
    INTO v_grade_record
    FROM public.grade_system gs
    WHERE gs.grade_system_code = v_grade_system_code
      AND gs.is_active = true
      AND NEW.percentage >= gs.min_mark
      AND NEW.percentage <= gs.max_mark
    ORDER BY gs.min_mark DESC
    LIMIT 1;

    IF v_grade_record.grade IS NOT NULL THEN
        NEW.letter_grade := v_grade_record.grade;
        NEW.grade_description := v_grade_record.description;
    ELSE
        -- Fallback letter grades
        IF NEW.percentage >= 90 THEN
            NEW.letter_grade := 'O';
            NEW.grade_description := 'Outstanding';
        ELSIF NEW.percentage >= 80 THEN
            NEW.letter_grade := 'D+';
            NEW.grade_description := 'Excellent';
        ELSIF NEW.percentage >= 75 THEN
            NEW.letter_grade := 'D';
            NEW.grade_description := 'Distinction';
        ELSIF NEW.percentage >= 70 THEN
            NEW.letter_grade := 'A+';
            NEW.grade_description := 'Very Good';
        ELSIF NEW.percentage >= 60 THEN
            NEW.letter_grade := 'A';
            NEW.grade_description := 'Good';
        ELSIF NEW.percentage >= 50 THEN
            NEW.letter_grade := 'B';
            NEW.grade_description := 'Above Average';
        ELSIF NEW.percentage >= 40 THEN
            NEW.letter_grade := 'C';
            NEW.grade_description := 'Average';
        ELSE
            NEW.letter_grade := 'U';
            NEW.grade_description := 'Re-Appear';
        END IF;
    END IF;

    -- Grade points = total_marks_obtained / 10 for passed students
    NEW.grade_points := ROUND(NEW.total_marks_obtained / 10.0, 2);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 8: Recreate triggers with correct execution order
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

-- STEP 9: Verification - Log summary
DO $$
DECLARE
    v_total INTEGER;
    v_passed INTEGER;
    v_failed INTEGER;
    v_failed_with_u INTEGER;
    v_failed_wrong_grade INTEGER;
    v_failed_with_gp INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM public.final_marks WHERE is_active = true;
    SELECT COUNT(*) INTO v_passed FROM public.final_marks WHERE is_active = true AND is_pass = true;
    SELECT COUNT(*) INTO v_failed FROM public.final_marks WHERE is_active = true AND is_pass = false;
    SELECT COUNT(*) INTO v_failed_with_u FROM public.final_marks WHERE is_active = true AND is_pass = false AND letter_grade = 'U';
    SELECT COUNT(*) INTO v_failed_wrong_grade FROM public.final_marks WHERE is_active = true AND is_pass = false AND letter_grade NOT IN ('U', 'AAA');
    SELECT COUNT(*) INTO v_failed_with_gp FROM public.final_marks WHERE is_active = true AND is_pass = false AND grade_points > 0;

    RAISE NOTICE '=== GRADE U FIX SUMMARY ===';
    RAISE NOTICE 'Total records: %', v_total;
    RAISE NOTICE 'Passed: %', v_passed;
    RAISE NOTICE 'Failed: %', v_failed;
    RAISE NOTICE 'Failed with correct U grade: %', v_failed_with_u;
    RAISE NOTICE 'Failed with WRONG grade (should be 0): %', v_failed_wrong_grade;
    RAISE NOTICE 'Failed with GP > 0 (should be 0): %', v_failed_with_gp;

    IF v_failed_wrong_grade > 0 OR v_failed_with_gp > 0 THEN
        RAISE NOTICE 'WARNING: Some failed records still have incorrect data!';
    ELSE
        RAISE NOTICE 'SUCCESS: All failed records have correct U grade with GP = 0!';
    END IF;
END $$;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
