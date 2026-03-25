-- =====================================================
-- FIX: Assign 'AAA' grade for absent students
-- =====================================================
-- When a student is ABSENT (attendance_status = 'Absent' in exam_attendance),
-- the grade should be:
--   letter_grade = 'AAA'
--   grade_points = 0
--   grade_description = 'ABSENT'
--   pass_status = 'Absent'
--
-- When a student FAILED (attempted but didn't pass):
--   letter_grade = 'U'
--   grade_points = 0
--   grade_description = 'Re-Appear'
--   pass_status = 'Fail'
-- =====================================================

-- First, ensure the grade_system table has the AAA grade for both UG and PG
-- (This should already exist based on the code, but let's ensure it)

INSERT INTO public.grade_system (grade_system_code, grade, grade_point, min_mark, max_mark, description, is_active)
VALUES
    ('UG', 'AAA', 0, -1, -1, 'ABSENT', true),
    ('PG', 'AAA', 0, -1, -1, 'ABSENT', true)
ON CONFLICT (grade_system_code, grade) DO UPDATE SET
    grade_point = EXCLUDED.grade_point,
    min_mark = EXCLUDED.min_mark,
    max_mark = EXCLUDED.max_mark,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- =====================================================
-- Update the auto_assign_letter_grade function
-- to check attendance status and assign AAA for absent
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
    -- First, check if the student passed using the pass status from auto_determine_pass_status trigger
    -- The auto_determine_pass_status trigger runs BEFORE this one and sets is_pass
    v_is_pass := COALESCE(NEW.is_pass, false);

    -- Check if student was absent by looking up exam_attendance table
    -- Match by student_id, course_id, and examination_session_id
    SELECT
        ea.is_absent,
        ea.attendance_status
    INTO v_is_absent, v_attendance_status
    FROM public.exam_attendance ea
    WHERE ea.student_id = NEW.student_id
      AND ea.course_id = NEW.course_id
      AND ea.examination_session_id = NEW.examination_session_id
    LIMIT 1;

    -- Check if student was ABSENT
    -- Absent if: is_absent = true OR attendance_status = 'Absent'
    IF COALESCE(v_is_absent, false) = true OR COALESCE(v_attendance_status, '') = 'Absent' THEN
        NEW.letter_grade := 'AAA';
        NEW.grade_points := 0;
        NEW.grade_description := 'ABSENT';
        NEW.pass_status := 'Absent';
        NEW.is_pass := false;
        RETURN NEW;
    END IF;

    -- If student FAILED (attempted but didn't pass), always assign U grade with 0 grade points
    IF NOT v_is_pass THEN
        NEW.letter_grade := 'U';
        NEW.grade_points := 0;
        NEW.grade_description := 'Re-Appear';
        NEW.pass_status := 'Fail';
        RETURN NEW;
    END IF;

    -- Student PASSED - get grade from grade_system table based on percentage
    NEW.pass_status := 'Pass';

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
-- UPDATE existing final_marks records where student was absent
-- to have the correct AAA grade
-- =====================================================

UPDATE public.final_marks fm
SET
    letter_grade = 'AAA',
    grade_points = 0,
    grade_description = 'ABSENT',
    pass_status = 'Absent',
    is_pass = false,
    updated_at = CURRENT_TIMESTAMP
FROM public.exam_attendance ea
WHERE fm.student_id = ea.student_id
  AND fm.course_id = ea.course_id
  AND fm.examination_session_id = ea.examination_session_id
  AND (ea.is_absent = true OR ea.attendance_status = 'Absent')
  AND fm.is_active = true
  AND (fm.letter_grade != 'AAA' OR fm.letter_grade IS NULL);

-- =====================================================
-- VERIFICATION: Check the results
-- =====================================================
DO $$
DECLARE
    v_total INTEGER;
    v_passed INTEGER;
    v_failed INTEGER;
    v_absent INTEGER;
    v_failed_with_u INTEGER;
    v_absent_with_aaa INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM public.final_marks WHERE is_active = true;
    SELECT COUNT(*) INTO v_passed FROM public.final_marks WHERE is_active = true AND is_pass = true;
    SELECT COUNT(*) INTO v_failed FROM public.final_marks WHERE is_active = true AND is_pass = false AND pass_status = 'Fail';
    SELECT COUNT(*) INTO v_absent FROM public.final_marks WHERE is_active = true AND pass_status = 'Absent';
    SELECT COUNT(*) INTO v_failed_with_u FROM public.final_marks WHERE is_active = true AND is_pass = false AND letter_grade = 'U';
    SELECT COUNT(*) INTO v_absent_with_aaa FROM public.final_marks WHERE is_active = true AND pass_status = 'Absent' AND letter_grade = 'AAA';

    RAISE NOTICE '=== ABSENT GRADE (AAA) FIX SUMMARY ===';
    RAISE NOTICE 'Total records: %', v_total;
    RAISE NOTICE 'Passed: %', v_passed;
    RAISE NOTICE 'Failed (attempted): %', v_failed;
    RAISE NOTICE 'Absent: %', v_absent;
    RAISE NOTICE 'Failed with correct U grade: %', v_failed_with_u;
    RAISE NOTICE 'Absent with correct AAA grade: %', v_absent_with_aaa;

    IF v_absent > 0 AND v_absent_with_aaa = v_absent THEN
        RAISE NOTICE 'SUCCESS: All absent records have correct AAA grade!';
    ELSIF v_absent = 0 THEN
        RAISE NOTICE 'INFO: No absent records found.';
    ELSE
        RAISE NOTICE 'WARNING: % absent records may not have AAA grade!', (v_absent - v_absent_with_aaa);
    END IF;
END $$;

-- =====================================================
-- Add comment to document the grade assignment logic
-- =====================================================
COMMENT ON FUNCTION auto_assign_letter_grade IS
'Automatically assigns letter grade, grade points, and grade description based on:
1. If student was ABSENT (from exam_attendance table): AAA grade, 0 points, ABSENT description
2. If student FAILED (is_pass = false): U grade, 0 points, Re-Appear description
3. If student PASSED: Grade from grade_system table based on percentage

Trigger order: This runs after trigger_01_auto_determine_pass_status';
