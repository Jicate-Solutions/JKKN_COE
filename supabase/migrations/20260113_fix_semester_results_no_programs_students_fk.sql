-- =====================================================
-- Fix semester_results table to remove programs and students FK dependencies
-- =====================================================
-- Date: 2026-01-13
-- Issue: Programs and Students tables no longer exist locally
--        - Programs are now fetched from MyJKKN API
--        - Students are now fetched from MyJKKN API
-- Fix:
--   1. Add program_code and register_number columns to store codes directly
--   2. Drop FK constraints to programs and students tables
--   3. Update trigger function to not query programs table
-- =====================================================

-- Step 1: Add program_code column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'semester_results'
        AND column_name = 'program_code'
    ) THEN
        ALTER TABLE public.semester_results
        ADD COLUMN program_code TEXT;

        COMMENT ON COLUMN public.semester_results.program_code IS 'Program code from MyJKKN API (e.g., UEN, BCA)';
    END IF;
END $$;

-- Step 2: Add register_number column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'semester_results'
        AND column_name = 'register_number'
    ) THEN
        ALTER TABLE public.semester_results
        ADD COLUMN register_number TEXT;

        COMMENT ON COLUMN public.semester_results.register_number IS 'Student register number (stored directly, no students table FK)';
    END IF;
END $$;

-- Step 3: Drop the FK constraint to students table if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'semester_results_student_id_fkey'
        AND table_name = 'semester_results'
    ) THEN
        ALTER TABLE public.semester_results
        DROP CONSTRAINT semester_results_student_id_fkey;

        RAISE NOTICE 'Dropped semester_results_student_id_fkey constraint';
    END IF;
END $$;

-- Step 4: Drop the FK constraint to programs table if exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'semester_results_program_id_fkey'
        AND table_name = 'semester_results'
    ) THEN
        ALTER TABLE public.semester_results
        DROP CONSTRAINT semester_results_program_id_fkey;

        RAISE NOTICE 'Dropped semester_results_program_id_fkey constraint';
    END IF;
END $$;

-- Step 5: Create index on program_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_semester_results_program_code
    ON public.semester_results(program_code);

-- Step 6: Create index on register_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_semester_results_register_number
    ON public.semester_results(register_number);

-- Step 7: Update the auto_calculate_result_class trigger function
-- to not query programs table (programs are from MyJKKN API)
CREATE OR REPLACE FUNCTION auto_calculate_result_class()
RETURNS TRIGGER AS $$
DECLARE
    v_program_type VARCHAR(10);
    v_regulation_id UUID;
    v_grade_info RECORD;
BEGIN
    -- Only calculate if result is Pass or Pending
    IF NEW.result_status NOT IN ('Pass', 'Pending') THEN
        NEW.is_distinction = false;
        NEW.is_first_class = false;
        RETURN NEW;
    END IF;

    -- Determine program type from program_code prefix
    -- UG programs typically start with 'U' (UEN, UCA, UCM, etc.)
    -- PG programs typically start with 'P' (PEN, PCA, PCM, etc.)
    IF NEW.program_code IS NOT NULL THEN
        IF NEW.program_code LIKE 'P%' THEN
            v_program_type := 'PG';
        ELSE
            v_program_type := 'UG';
        END IF;
    ELSE
        -- Default to UG if no program_code
        v_program_type := 'UG';
    END IF;

    -- Try to get regulation from student_grades for dynamic grade calculation
    SELECT sg.regulation_id
    INTO v_regulation_id
    FROM public.student_grades sg
    WHERE sg.student_id = NEW.student_id
        AND sg.examination_session_id = NEW.examination_session_id
        AND sg.is_active = true
    LIMIT 1;

    -- Try to get result class from grade_system based on percentage
    IF v_regulation_id IS NOT NULL THEN
        SELECT
            gs.grade,
            gs.description,
            gs.grade_point
        INTO v_grade_info
        FROM public.grade_system gs
        WHERE gs.regulation_id = v_regulation_id
            AND gs.grade_system_code = v_program_type
            AND gs.is_active = true
            AND NEW.percentage >= gs.min_mark
            AND NEW.percentage <= gs.max_mark
        ORDER BY gs.grade_point DESC
        LIMIT 1;

        IF FOUND THEN
            -- Use dynamic grade system
            NEW.result_class = v_grade_info.grade || ' - ' || v_grade_info.description;
            NEW.is_distinction = v_grade_info.grade_point >= 9.0;
            NEW.is_first_class = v_grade_info.grade_point >= 7.0;
            RETURN NEW;
        END IF;
    END IF;

    -- Fallback to hardcoded values if no grade_system match
    IF NEW.percentage >= 75 THEN
        NEW.result_class = 'Distinction';
        NEW.is_distinction = true;
        NEW.is_first_class = true;
    ELSIF NEW.percentage >= 60 THEN
        NEW.result_class = 'First Class';
        NEW.is_distinction = false;
        NEW.is_first_class = true;
    ELSIF NEW.percentage >= 50 THEN
        NEW.result_class = 'Second Class';
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    ELSIF NEW.percentage >= 40 THEN
        NEW.result_class = 'Pass';
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    ELSE
        NEW.result_class = 'Fail';
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_calculate_result_class() IS 'Auto-calculates result class based on percentage. Programs are from MyJKKN API, no local FK.';

-- Step 8: Add comments explaining the schema changes
COMMENT ON COLUMN public.semester_results.student_id IS 'Student UUID - no FK constraint, students from MyJKKN API';
COMMENT ON COLUMN public.semester_results.program_id IS 'Program UUID from MyJKKN - no FK constraint, programs from MyJKKN API';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
