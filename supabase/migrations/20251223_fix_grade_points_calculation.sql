-- =====================================================
-- FIX: Update grade_points calculation formula
-- =====================================================
-- Date: 2024-12-23
-- Issue: grade_points was using values from grade_system table
-- Fix: grade_points = total_marks_obtained / 10
--      (e.g., 63 marks = 6.3 GP, 74 marks = 7.4 GP)
--      For fail/absent: grade_points = 0
-- =====================================================

-- Update the auto_assign_letter_grade trigger function
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
    SELECT ea.attendance_status
    INTO v_attendance_status
    FROM public.exam_attendance ea
    WHERE ea.student_id = NEW.student_id
      AND ea.course_id = NEW.course_id
      AND ea.examination_session_id = NEW.examination_session_id
    LIMIT 1;

    -- Check if student was ABSENT from exam_attendance table
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
    -- Grade points = 0 for failed students
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
    -- Student PASSED - get letter grade from grade_system table
    -- But grade_points = total_marks_obtained / 10
    -- =========================================================
    NEW.pass_status := 'Pass';

    -- Get grade system code (UG/PG) based on program duration
    SELECT
        CASE
            WHEN p.program_duration_yrs <= 3 THEN 'UG'
            ELSE 'PG'
        END INTO v_grade_system_code
    FROM public.programs p
    WHERE p.id = NEW.program_id;

    v_grade_system_code := COALESCE(v_grade_system_code, 'UG');

    -- Get letter grade and description from grade_system based on percentage
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

    -- Set letter grade from grade_system
    IF v_grade_record.grade IS NOT NULL THEN
        NEW.letter_grade := v_grade_record.grade;
        NEW.grade_description := v_grade_record.description;
    ELSE
        -- Fallback letter grades based on percentage
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

    -- =========================================================
    -- FIXED: Grade points = total_marks_obtained / 10
    -- Example: 63 marks = 6.3 GP, 74 marks = 7.4 GP
    -- =========================================================
    NEW.grade_points := ROUND(NEW.total_marks_obtained / 10.0, 2);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add documentation
COMMENT ON FUNCTION auto_assign_letter_grade IS
'Automatically assigns letter grade, grade points, and grade description.
Grade points formula: total_marks_obtained / 10 (e.g., 63 marks = 6.3 GP)
For fail/absent: grade_points = 0

Priority order:
1. If pass_status = ''Absent'' (from API): AAA grade, 0 points
2. If letter_grade = ''AAA'' (explicit marker): preserve as absent
3. If exam_attendance.attendance_status = ''Absent'': AAA grade
4. If is_pass = false: U grade, 0 points
5. If is_pass = true: Letter grade from grade_system, GP = total_marks / 10';

-- =====================================================
-- Update existing records with correct grade_points
-- =====================================================
UPDATE public.final_marks
SET grade_points =
    CASE
        WHEN is_pass = true THEN ROUND(total_marks_obtained / 10.0, 2)
        ELSE 0
    END,
    total_grade_points =
    CASE
        WHEN is_pass = true THEN ROUND((total_marks_obtained / 10.0) * COALESCE(credit, 0), 2)
        ELSE 0
    END
WHERE is_active = true;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
