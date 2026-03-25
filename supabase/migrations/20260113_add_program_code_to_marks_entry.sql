-- Migration: Add program_code column to marks_entry table
-- This stores the denormalized program code from exam_registrations
-- Allows direct access to program_code without joining programs table (which uses MyJKKN API)

-- Add program_code column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'marks_entry'
        AND column_name = 'program_code'
    ) THEN
        ALTER TABLE public.marks_entry ADD COLUMN program_code VARCHAR(50);
        RAISE NOTICE 'program_code column added to marks_entry';
    ELSE
        RAISE NOTICE 'program_code column already exists in marks_entry';
    END IF;
END $$;

-- Create index for program_code lookups
CREATE INDEX IF NOT EXISTS idx_marks_entry_program_code
    ON public.marks_entry(program_code) WHERE program_code IS NOT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.marks_entry.program_code IS 'Denormalized program code from exam_registrations. Stored directly to avoid MyJKKN API lookups for performance.';
