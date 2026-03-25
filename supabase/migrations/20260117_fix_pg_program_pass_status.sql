-- =====================================================
-- FIX: Pass marks should use course-specific configuration
-- =====================================================
-- Date: 2026-01-17
-- Issue: Pass marks should come from course_mapping table,
--        NOT from fixed percentages based on program type
--
-- Fix: Use pass marks from course_mapping/courses table directly
--      Also ensure proper grade system lookup by regulation_code
-- =====================================================

-- =====================================================
-- STEP 1: Create helper function to detect program type from code
-- (Used for grade_system lookup, NOT for pass marks)
-- =====================================================

CREATE OR REPLACE FUNCTION get_program_type_from_code(p_program_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_upper_code VARCHAR;
BEGIN
    IF p_program_code IS NULL OR p_program_code = '' THEN
        RETURN 'UG';
    END IF;

    v_upper_code := UPPER(p_program_code);

    -- Check for common PG program prefixes
    -- MSC, MBA, MCA, MA, MCom, MSW, MPhil, PhD, etc.
    IF v_upper_code ~ '^(MSC|M\.SC|M SC|MBA|MCA|MA|M\.A|MCOM|M\.COM|M COM|MSW|MPHIL|PHD|PG)' THEN
        RETURN 'PG';
    END IF;

    -- Check for year-prefixed PG codes like "24PCHC02" where P indicates PG
    -- Pattern: 2 digits + P + letters = PG program
    IF v_upper_code ~ '^[0-9]{2}P[A-Z]' THEN
        RETURN 'PG';
    END IF;

    -- Check for short PG program codes like "PCH" (P + 2-3 letters)
    -- These are typically PG program abbreviations where P = Postgraduate
    -- PCH = PG Chemistry, PMT = PG Mathematics, PCS = PG Computer Science, etc.
    IF v_upper_code ~ '^P[A-Z]{2,3}$' THEN
        RETURN 'PG';
    END IF;

    -- Default to UG for all other patterns
    RETURN 'UG';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- STEP 2: Update calculate_pass_status function
-- Pass marks come from course configuration, no program type fallback
-- =====================================================

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
    v_passes_internal BOOLEAN;
    v_passes_external BOOLEAN;
    v_passes_total BOOLEAN;
BEGIN
    -- Pass/fail is determined by comparing obtained marks with pass marks
    -- Pass marks come from course_mapping table (configured per course)
    -- If pass mark is 0 or NULL, that component is auto-pass

    -- Check internal pass condition
    v_passes_internal := (COALESCE(p_internal_pass_mark, 0) = 0) OR
                         (p_internal_obtained >= p_internal_pass_mark);

    -- Check external pass condition
    v_passes_external := (COALESCE(p_external_pass_mark, 0) = 0) OR
                         (p_external_obtained >= p_external_pass_mark);

    -- Check total pass condition
    v_passes_total := (COALESCE(p_total_pass_mark, 0) = 0) OR
                      (p_total_obtained >= p_total_pass_mark);

    -- Student passes only if ALL conditions are met
    RETURN v_passes_internal AND v_passes_external AND v_passes_total;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 3: Update auto_determine_pass_status trigger function
-- Pass marks come from course_mapping table (course-specific)
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
    -- Get course-specific pass marks from course_mapping table
    -- Pass marks are configured per course, NOT derived from program type
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
-- STEP 4: Update auto_assign_letter_grade
-- Uses regulation_code and grade_system_code for proper lookup
-- =====================================================

CREATE OR REPLACE FUNCTION auto_assign_letter_grade()
RETURNS TRIGGER AS $$
DECLARE
    v_grade_system_code VARCHAR(10);
    v_regulation_id UUID;
    v_regulation_code VARCHAR(50);
    v_grade VARCHAR(10);
    v_description VARCHAR(100);
    v_is_pass BOOLEAN;
    v_attendance_status VARCHAR(20);
    v_grade_found BOOLEAN := false;
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
    -- Priority: regulation_code > grade_system_code (UG/PG)
    IF v_regulation_code IS NOT NULL AND v_regulation_code != '' THEN
        -- Use regulation_code for grade lookup (most specific)
        SELECT
            gs.grade,
            gs.description
        INTO v_grade, v_description
        FROM public.grade_system gs
        WHERE gs.regulation_code = v_regulation_code
          AND gs.is_active = true
          AND NEW.percentage >= gs.min_mark
          AND NEW.percentage <= gs.max_mark
        ORDER BY gs.min_mark DESC
        LIMIT 1;

        IF FOUND THEN
            v_grade_found := true;
        END IF;
    END IF;

    -- If no regulation_code grade found, try regulation_id
    IF NOT v_grade_found AND v_regulation_id IS NOT NULL THEN
        SELECT
            gs.grade,
            gs.description
        INTO v_grade, v_description
        FROM public.grade_system gs
        WHERE gs.regulation_id = v_regulation_id
          AND gs.is_active = true
          AND NEW.percentage >= gs.min_mark
          AND NEW.percentage <= gs.max_mark
        ORDER BY gs.min_mark DESC
        LIMIT 1;

        IF FOUND THEN
            v_grade_found := true;
        END IF;
    END IF;

    -- If still no grade found, fallback to grade_system_code (UG/PG)
    IF NOT v_grade_found THEN
        SELECT
            gs.grade,
            gs.description
        INTO v_grade, v_description
        FROM public.grade_system gs
        WHERE gs.grade_system_code = v_grade_system_code
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
        -- Fallback letter grades based on program type
        IF v_grade_system_code = 'PG' THEN
            -- PG fallback grades (pass mark 50%)
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
                -- Below 50% = Fail for PG
                NEW.letter_grade := 'U';
                NEW.grade_description := 'Re-Appear';
            END IF;
        ELSE
            -- UG fallback grades (pass mark 40%)
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
-- STEP 5: Recreate triggers
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
-- STEP 6: Fix existing incorrect data in final_marks table
-- Check grade and pass_status consistency, fix mismatches
-- =====================================================

-- Fix records where letter_grade indicates FAIL (U) but is_pass = true
-- Grade U means fail - set is_pass=false, grade_points=0, pass_status='Reappear'
UPDATE public.final_marks
SET
    is_pass = false,
    pass_status = 'Reappear',
    grade_points = 0,
    total_grade_points = 0,
    is_distinction = false,
    is_first_class = false,
    updated_at = CURRENT_TIMESTAMP
WHERE letter_grade = 'U'
  AND (is_pass = true OR grade_points > 0 OR pass_status = 'Pass')
  AND is_active = true;

-- Fix records where letter_grade = 'AAA' (Absent) - ensure all fields are correct
UPDATE public.final_marks
SET
    is_pass = false,
    pass_status = 'Absent',
    grade_points = 0,
    total_grade_points = 0,
    is_distinction = false,
    is_first_class = false,
    updated_at = CURRENT_TIMESTAMP
WHERE letter_grade = 'AAA'
  AND (is_pass = true OR grade_points > 0 OR pass_status != 'Absent')
  AND is_active = true;

-- Fix records where letter_grade indicates PASS (O, D+, D, A+, A, B, C) but is_pass = false
-- These passing grades should have is_pass=true, pass_status='Pass'
UPDATE public.final_marks
SET
    is_pass = true,
    pass_status = 'Pass',
    -- Recalculate grade_points as total_marks / 10
    grade_points = ROUND(total_marks_obtained / 10.0, 2),
    total_grade_points = ROUND(credit * (total_marks_obtained / 10.0), 2),
    updated_at = CURRENT_TIMESTAMP
WHERE letter_grade IN ('O', 'D+', 'D', 'A+', 'A', 'B', 'C')
  AND (is_pass = false OR pass_status != 'Pass')
  AND is_active = true;

-- Ensure all failed records have grade_points = 0 and total_grade_points = 0
UPDATE public.final_marks
SET
    grade_points = 0,
    total_grade_points = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE is_pass = false
  AND (grade_points > 0 OR total_grade_points > 0)
  AND is_active = true;

-- =====================================================
-- STEP 7: Verification
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

    RAISE NOTICE '=== PASS STATUS RECALCULATION SUMMARY ===';
    RAISE NOTICE 'Total records: %', v_total;
    RAISE NOTICE 'Passed: %', v_passed;
    RAISE NOTICE 'Failed/Reappear/Absent: %', v_failed;
    RAISE NOTICE 'Pass marks now use course_mapping configuration';
END $$;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
