-- Migration: Add program_code column to exam_registrations table
-- This stores the denormalized program code for easier querying
-- Part of the hierarchy validation: Institution → Session → Program → Course

-- Add program_code column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'exam_registrations'
        AND column_name = 'program_code'
    ) THEN
        ALTER TABLE public.exam_registrations ADD COLUMN program_code VARCHAR(50);
        RAISE NOTICE 'program_code column added to exam_registrations';
    ELSE
        RAISE NOTICE 'program_code column already exists in exam_registrations';
    END IF;
END $$;

-- Add a comment explaining the column
COMMENT ON COLUMN public.exam_registrations.program_code IS 'Denormalized program code from course_offering. Used for hierarchy validation: Institution → Session → Program → Course.';
