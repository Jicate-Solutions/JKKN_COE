-- =====================================================
-- FIX: Preserve AAA grade for ABSENT students
-- =====================================================
-- Issue: When saving final marks for absent students:
--   - API correctly sets letter_grade = 'AAA', pass_status = 'Absent'
--   - But database trigger overwrites to letter_grade = 'U', pass_status = 'Fail'
--
-- Root Cause:
--   The auto_assign_letter_grade trigger checks exam_attendance table
--   but may not find matching records due to different join conditions.
--   When no absence is found, it treats the student as "failed" and assigns U grade.
--
-- Solution:
--   1. Check if pass_status is already 'Absent' (set by API) FIRST
--   2. If pass_status = 'Absent', preserve AAA grade without exam_attendance lookup
--   3. Only check exam_attendance as a fallback
--   4. Respect incoming letter_grade = 'AAA' as an explicit absent marker
-- =====================================================

-- =====================================================
-- Step 1: Update auto_determine_pass_status to preserve Absent status
-- =====================================================

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
    -- CRITICAL: If pass_status is already 'Absent', preserve it
    -- This allows the API to explicitly mark students as absent
    IF NEW.pass_status = 'Absent' THEN
        NEW.is_pass := false;
        NEW.is_distinction := false;
        NEW.is_first_class := false;
        RETURN NEW;
    END IF;

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
        -- Only set to 'Fail' if not already 'Absent'
        IF NEW.pass_status IS NULL OR NEW.pass_status NOT IN ('Absent', 'Withheld', 'Expelled') THEN
            NEW.pass_status = 'Fail';
        END IF;
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Step 2: Update auto_assign_letter_grade to preserve AAA grade
-- =====================================================

CREATE OR REPLACE FUNCTION auto_assign_letter_grade()
RETURNS TRIGGER AS $$
DECLARE
    v_grade_system_code VARCHAR(10);
    v_grade_record RECORD;
    v_is_pass BOOLEAN;
    v_is_absent BOOLEAN;
    v_attendance_status VARCHAR(20);
BEGIN
    -- Get the is_pass status from the pass_status trigger
    v_is_pass := COALESCE(NEW.is_pass, false);

    -- =========================================================
    -- CRITICAL FIX: Check if already marked as ABSENT
    -- =========================================================
    -- Priority 1: If pass_status is already 'Absent' (set by API), preserve AAA grade
    IF NEW.pass_status = 'Absent' THEN
        NEW.letter_grade := 'AAA';
        NEW.grade_points := 0;
        NEW.grade_description := 'Absent';
        NEW.is_pass := false;
        RETURN NEW;
    END IF;

    -- Priority 2: If letter_grade is already 'AAA' (explicit absent marker), preserve it
    IF NEW.letter_grade = 'AAA' THEN
        NEW.grade_points := 0;
        NEW.grade_description := 'Absent';
        NEW.pass_status := 'Absent';
        NEW.is_pass := false;
        RETURN NEW;
    END IF;

    -- Priority 3: Check exam_attendance table as fallback
    SELECT
        ea.is_absent,
        ea.attendance_status
    INTO v_is_absent, v_attendance_status
    FROM public.exam_attendance ea
    WHERE ea.student_id = NEW.student_id
      AND ea.course_id = NEW.course_id
      AND ea.examination_session_id = NEW.examination_session_id
    LIMIT 1;

    -- Check if student was ABSENT from exam_attendance table
    IF COALESCE(v_is_absent, false) = true OR COALESCE(v_attendance_status, '') = 'Absent' THEN
        NEW.letter_grade := 'AAA';
        NEW.grade_points := 0;
        NEW.grade_description := 'Absent';
        NEW.pass_status := 'Absent';
        NEW.is_pass := false;
        RETURN NEW;
    END IF;

    -- =========================================================
    -- If student FAILED (attempted but didn't pass), assign U grade
    -- =========================================================
    IF NOT v_is_pass THEN
        NEW.letter_grade := 'U';
        NEW.grade_points := 0;
        NEW.grade_description := 'Re-Appear';
        -- Only set pass_status to Fail if not already set to a special status
        IF NEW.pass_status IS NULL OR NEW.pass_status NOT IN ('Absent', 'Withheld', 'Expelled') THEN
            NEW.pass_status := 'Fail';
        END IF;
        RETURN NEW;
    END IF;

    -- =========================================================
    -- Student PASSED - get grade from grade_system table
    -- =========================================================
    NEW.pass_status := 'Pass';

    -- Get the grade system code for this program (UG or PG)
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
            -- Below passing threshold
            NEW.letter_grade := 'U';
            NEW.grade_points := 0;
            NEW.grade_description := 'Re-Appear';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Step 3: Fix existing records where absent students have wrong grade
-- =====================================================

-- Update records where pass_status is 'Absent' but letter_grade is not 'AAA'
UPDATE public.final_marks
SET
    letter_grade = 'AAA',
    grade_points = 0,
    grade_description = 'Absent',
    is_pass = false,
    updated_at = CURRENT_TIMESTAMP
WHERE pass_status = 'Absent'
  AND (letter_grade != 'AAA' OR letter_grade IS NULL)
  AND is_active = true;

-- Update records found in exam_attendance as absent but with wrong grade
UPDATE public.final_marks fm
SET
    letter_grade = 'AAA',
    grade_points = 0,
    grade_description = 'Absent',
    pass_status = 'Absent',
    is_pass = false,
    updated_at = CURRENT_TIMESTAMP
FROM public.exam_attendance ea
WHERE fm.student_id = ea.student_id
  AND fm.course_id = ea.course_id
  AND fm.examination_session_id = ea.examination_session_id
  AND (ea.is_absent = true OR ea.attendance_status = 'Absent')
  AND fm.is_active = true
  AND (fm.letter_grade != 'AAA' OR fm.pass_status != 'Absent');

-- =====================================================
-- Step 4: Verification
-- =====================================================
DO $$
DECLARE
    v_total INTEGER;
    v_passed INTEGER;
    v_failed INTEGER;
    v_absent INTEGER;
    v_absent_with_aaa INTEGER;
    v_absent_with_wrong_grade INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM public.final_marks WHERE is_active = true;
    SELECT COUNT(*) INTO v_passed FROM public.final_marks WHERE is_active = true AND is_pass = true;
    SELECT COUNT(*) INTO v_failed FROM public.final_marks WHERE is_active = true AND is_pass = false AND pass_status = 'Fail';
    SELECT COUNT(*) INTO v_absent FROM public.final_marks WHERE is_active = true AND pass_status = 'Absent';
    SELECT COUNT(*) INTO v_absent_with_aaa FROM public.final_marks WHERE is_active = true AND pass_status = 'Absent' AND letter_grade = 'AAA';
    SELECT COUNT(*) INTO v_absent_with_wrong_grade FROM public.final_marks WHERE is_active = true AND pass_status = 'Absent' AND letter_grade != 'AAA';

    RAISE NOTICE '=== ABSENT GRADE PRESERVATION FIX SUMMARY ===';
    RAISE NOTICE 'Total records: %', v_total;
    RAISE NOTICE 'Passed: %', v_passed;
    RAISE NOTICE 'Failed (U grade): %', v_failed;
    RAISE NOTICE 'Absent: %', v_absent;
    RAISE NOTICE 'Absent with correct AAA grade: %', v_absent_with_aaa;
    RAISE NOTICE 'Absent with WRONG grade (should be 0): %', v_absent_with_wrong_grade;

    IF v_absent > 0 AND v_absent_with_wrong_grade = 0 THEN
        RAISE NOTICE 'SUCCESS: All absent records have correct AAA grade!';
    ELSIF v_absent = 0 THEN
        RAISE NOTICE 'INFO: No absent records found.';
    ELSE
        RAISE NOTICE 'WARNING: % absent records still have wrong grade!', v_absent_with_wrong_grade;
    END IF;
END $$;

-- =====================================================
-- Add documentation
-- =====================================================
COMMENT ON FUNCTION auto_assign_letter_grade IS
'Automatically assigns letter grade, grade points, and grade description.
Priority order:
1. If pass_status = ''Absent'' (from API): AAA grade, 0 points, Absent description
2. If letter_grade = ''AAA'' (explicit marker): preserve as absent
3. If exam_attendance shows absent: AAA grade
4. If is_pass = false: U grade, Re-Appear description
5. If is_pass = true: Grade from grade_system table based on percentage

IMPORTANT: This trigger preserves absent grades set by the API to prevent overwrites.';

COMMENT ON FUNCTION auto_determine_pass_status IS
'Determines pass/fail status based on marks and pass criteria.
IMPORTANT: If pass_status is already ''Absent'', it is preserved without recalculation.
This allows the API to explicitly mark students as absent.';
