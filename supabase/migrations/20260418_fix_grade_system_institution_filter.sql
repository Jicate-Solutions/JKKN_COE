-- =====================================================
-- FIX: auto_assign_letter_grade leaks grades across institutions
-- =====================================================
-- Date: 2026-04-18
-- Issue: When generating final marks, the trigger picks grade rows
--        from the WRONG institution (e.g. CET) because all three
--        grade_system lookups (regulation_code, regulation_id,
--        grade_system_code) miss `institutions_id = NEW.institutions_id`.
--
--        Multiple institutions share the same regulation_code
--        ("R2024"), regulation_id, and grade_system_code ("UG"/"PG").
--        Without an institution filter, ORDER BY min_mark DESC LIMIT 1
--        silently returns whichever institution sorts first.
--
-- Fix: Add `AND gs.institutions_id = NEW.institutions_id` to all
--      three lookups so grades are scoped to the learner's institution.
-- =====================================================

CREATE OR REPLACE FUNCTION auto_assign_letter_grade()
RETURNS TRIGGER AS $$
DECLARE
    v_result_type VARCHAR(20);
    v_grade_system_code VARCHAR(10);
    v_regulation_id UUID;
    v_regulation_code VARCHAR(50);
    v_grade VARCHAR(10);
    v_description VARCHAR(100);
    v_is_pass BOOLEAN;
    v_attendance_status VARCHAR(20);
    v_grade_found BOOLEAN := false;
BEGIN
    -- SKIP auto-grade for comment and credit result types.
    -- These courses have grades/credits set directly by the coordinator
    -- and must not be overridden by percentage-based logic.
    SELECT c.result_type INTO v_result_type
    FROM public.courses c
    WHERE c.id = NEW.course_id;

    IF v_result_type IN ('comment', 'credit') THEN
        RETURN NEW;
    END IF;

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
            NEW.pass_status := 'Reappear';
        END IF;
        RETURN NEW;
    END IF;

    -- Student PASSED - get letter grade from grade_system table
    NEW.pass_status := 'Pass';

    -- Get grade_system_code from program_code (UG/PG)
    v_grade_system_code := get_program_type_from_code(NEW.program_code);

    -- Try to get regulation_id from course_mapping via course_offerings
    SELECT cm.regulation_id, cm.regulation_code
    INTO v_regulation_id, v_regulation_code
    FROM public.course_offerings co
    INNER JOIN public.course_mapping cm ON co.course_id = cm.id
    WHERE co.id = NEW.course_offering_id;

    -- Get letter grade from grade_system based on percentage
    -- Priority: regulation_code > regulation_id > grade_system_code (UG/PG)
    -- ALL lookups MUST filter by institutions_id to prevent cross-institution leaks
    IF v_regulation_code IS NOT NULL AND v_regulation_code != '' THEN
        SELECT
            gs.grade,
            gs.description
        INTO v_grade, v_description
        FROM public.grade_system gs
        WHERE gs.institutions_id = NEW.institutions_id
          AND gs.regulation_code = v_regulation_code
          AND gs.is_active = true
          AND NEW.percentage >= gs.min_mark
          AND NEW.percentage <= gs.max_mark
        ORDER BY gs.min_mark DESC
        LIMIT 1;

        IF FOUND THEN
            v_grade_found := true;
        END IF;
    END IF;

    IF NOT v_grade_found AND v_regulation_id IS NOT NULL THEN
        SELECT
            gs.grade,
            gs.description
        INTO v_grade, v_description
        FROM public.grade_system gs
        WHERE gs.institutions_id = NEW.institutions_id
          AND gs.regulation_id = v_regulation_id
          AND gs.is_active = true
          AND NEW.percentage >= gs.min_mark
          AND NEW.percentage <= gs.max_mark
        ORDER BY gs.min_mark DESC
        LIMIT 1;

        IF FOUND THEN
            v_grade_found := true;
        END IF;
    END IF;

    IF NOT v_grade_found THEN
        SELECT
            gs.grade,
            gs.description
        INTO v_grade, v_description
        FROM public.grade_system gs
        WHERE gs.institutions_id = NEW.institutions_id
          AND gs.grade_system_code = v_grade_system_code
          AND gs.is_active = true
          AND NEW.percentage >= gs.min_mark
          AND NEW.percentage <= gs.max_mark
        ORDER BY gs.min_mark DESC
        LIMIT 1;

        IF FOUND THEN
            v_grade_found := true;
        END IF;
    END IF;

    IF v_grade_found THEN
        NEW.letter_grade := v_grade;
        NEW.grade_description := v_description;

        -- CRITICAL: If grade is 'U' (fail grade from grade_system), override pass status
        IF v_grade = 'U' THEN
            NEW.is_pass := false;
            NEW.grade_points := 0;
            NEW.pass_status := 'Reappear';
            NEW.is_distinction := false;
            NEW.is_first_class := false;
            RETURN NEW;
        END IF;
    ELSE
        -- Fallback letter grades based on program type (no grade_system row for institution)
        IF v_grade_system_code = 'PG' THEN
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
                NEW.grade_description := 'Average';
            ELSE
                NEW.letter_grade := 'U';
                NEW.grade_description := 'Re-Appear';
            END IF;
        ELSE
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
    END IF;

    -- Grade points = total_marks_obtained / 10 for passed students
    NEW.grade_points := ROUND(NEW.total_marks_obtained / 10.0, 2);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Backfill: recalculate letter_grade for existing PASSED records
-- so prior wrong-institution grades are corrected.
-- Triggers fire on UPDATE because of `WHEN (NEW.percentage IS NOT NULL)`.
-- =====================================================
UPDATE public.final_marks
SET updated_at = CURRENT_TIMESTAMP
WHERE is_active = true
  AND is_pass = true
  AND percentage IS NOT NULL;

DO $$
DECLARE
    v_corrected INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_corrected
    FROM public.final_marks
    WHERE is_active = true AND is_pass = true;

    RAISE NOTICE '=== GRADE SYSTEM INSTITUTION FILTER FIX ===';
    RAISE NOTICE 'Recalculated letter_grade for % passed records', v_corrected;
END $$;
