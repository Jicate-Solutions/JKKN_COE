-- =====================================================
-- FIX: Update triggers to use correct exam_attendance columns
-- =====================================================
-- Issue: The triggers reference ea.is_absent which doesn't exist
-- The exam_attendance table only has:
--   - attendance_status (varchar): 'Present', 'Absent', etc.
--   - status (boolean): general active/inactive flag
--
-- Solution: Update triggers to only use attendance_status column
-- =====================================================

-- Step 1: Update auto_determine_pass_status to preserve Absent status
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

    v_internal_pass_mark := COALESCE(v_internal_pass_mark, 0);
    v_external_pass_mark := COALESCE(v_external_pass_mark, 0);
    v_total_pass_mark := COALESCE(v_total_pass_mark, 0);

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

    v_passes_internal := (v_internal_pass_mark = 0) OR (NEW.internal_marks_obtained >= v_internal_pass_mark);
    v_passes_external := (v_external_pass_mark = 0) OR (NEW.external_marks_obtained >= v_external_pass_mark);
    v_passes_total := (v_total_pass_mark = 0) OR (NEW.total_marks_obtained >= v_total_pass_mark);

    IF v_passes_internal AND v_passes_external AND v_passes_total THEN
        NEW.is_pass = true;
        NEW.pass_status = 'Pass';
        IF NEW.percentage >= 75 THEN
            NEW.is_distinction = true;
        ELSE
            NEW.is_distinction = false;
        END IF;
        IF NEW.percentage >= 60 THEN
            NEW.is_first_class = true;
        ELSE
            NEW.is_first_class = false;
        END IF;
    ELSE
        NEW.is_pass = false;
        IF NEW.pass_status IS NULL OR NEW.pass_status NOT IN ('Absent', 'Withheld', 'Expelled') THEN
            NEW.pass_status = 'Fail';
        END IF;
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Update auto_assign_letter_grade to use correct column
-- FIXED: Removed ea.is_absent reference, only use attendance_status
CREATE OR REPLACE FUNCTION auto_assign_letter_grade()
RETURNS TRIGGER AS $$
DECLARE
    v_grade_system_code VARCHAR(10);
    v_grade_record RECORD;
    v_is_pass BOOLEAN;
    v_attendance_status VARCHAR(20);
BEGIN
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
    -- FIXED: Only use attendance_status column (is_absent doesn't exist!)
    SELECT ea.attendance_status
    INTO v_attendance_status
    FROM public.exam_attendance ea
    WHERE ea.student_id = NEW.student_id
      AND ea.course_id = NEW.course_id
      AND ea.examination_session_id = NEW.examination_session_id
    LIMIT 1;

    -- Check if student was ABSENT from exam_attendance table
    -- Only check attendance_status since is_absent column doesn't exist
    IF COALESCE(v_attendance_status, '') = 'Absent' THEN
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
        IF NEW.pass_status IS NULL OR NEW.pass_status NOT IN ('Absent', 'Withheld', 'Expelled') THEN
            NEW.pass_status := 'Fail';
        END IF;
        RETURN NEW;
    END IF;

    -- =========================================================
    -- Student PASSED - get grade from grade_system table
    -- =========================================================
    NEW.pass_status := 'Pass';

    SELECT
        CASE
            WHEN p.program_duration_yrs <= 3 THEN 'UG'
            ELSE 'PG'
        END INTO v_grade_system_code
    FROM public.programs p
    WHERE p.id = NEW.program_id;

    v_grade_system_code := COALESCE(v_grade_system_code, 'UG');

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

    IF v_grade_record.grade IS NOT NULL THEN
        NEW.letter_grade := v_grade_record.grade;
        NEW.grade_points := v_grade_record.grade_point;
        NEW.grade_description := v_grade_record.description;
    ELSE
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
            NEW.letter_grade := 'U';
            NEW.grade_points := 0;
            NEW.grade_description := 'Re-Appear';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add documentation
COMMENT ON FUNCTION auto_assign_letter_grade IS
'Automatically assigns letter grade, grade points, and grade description.
Priority order:
1. If pass_status = ''Absent'' (from API): AAA grade, 0 points, Absent description
2. If letter_grade = ''AAA'' (explicit marker): preserve as absent
3. If exam_attendance.attendance_status = ''Absent'': AAA grade
4. If is_pass = false: U grade, Re-Appear description
5. If is_pass = true: Grade from grade_system table based on percentage

NOTE: This function only uses attendance_status column from exam_attendance table
      (is_absent column does not exist in the schema).';
