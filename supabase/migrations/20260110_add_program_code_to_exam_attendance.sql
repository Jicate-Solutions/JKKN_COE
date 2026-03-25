-- Add program_code and other columns to exam_attendance table
-- This allows storing MyJKKN program_code directly without FK constraint

-- Step 1: Add program_code column
ALTER TABLE public.exam_attendance
ADD COLUMN IF NOT EXISTS program_code VARCHAR(50);

-- Step 2: Add attempt_number column (from exam_registration)
ALTER TABLE public.exam_attendance
ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;

-- Step 3: Add is_regular column (from exam_registration)
ALTER TABLE public.exam_attendance
ADD COLUMN IF NOT EXISTS is_regular BOOLEAN DEFAULT TRUE;

-- Step 4: Add created_by column
ALTER TABLE public.exam_attendance
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id);

-- Step 5: Add updated_by column
ALTER TABLE public.exam_attendance
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.users(id);

-- Step 6: Add entry_time column (time when student entered the exam hall)
ALTER TABLE public.exam_attendance
ADD COLUMN IF NOT EXISTS entry_time TIME;

-- Step 8: Make program_id nullable (since we'll use program_code instead)
ALTER TABLE public.exam_attendance
ALTER COLUMN program_id DROP NOT NULL;

-- Step 9: Drop the FK constraint on program_id (it references local programs table)
ALTER TABLE public.exam_attendance
DROP CONSTRAINT IF EXISTS fk_exam_attendance_program;

-- Step 10: Create index on program_code for performance
CREATE INDEX IF NOT EXISTS idx_exam_attendance_program_code
    ON public.exam_attendance USING btree (program_code) TABLESPACE pg_default;

-- Step 11: Update existing records - copy program_code from programs table
UPDATE public.exam_attendance ea
SET program_code = p.program_code
FROM public.programs p
WHERE ea.program_id = p.id
AND ea.program_code IS NULL;

-- Step 12: Update existing records - copy attempt_number and is_regular from exam_registrations
UPDATE public.exam_attendance ea
SET
    attempt_number = COALESCE(er.attempt_number, 1),
    is_regular = COALESCE(er.is_regular, TRUE)
FROM public.exam_registrations er
WHERE ea.exam_registration_id = er.id
AND (ea.attempt_number IS NULL OR ea.is_regular IS NULL);

-- Add comments
COMMENT ON COLUMN public.exam_attendance.program_code IS 'MyJKKN program code (e.g., BCA, MBA). Used instead of program_id FK for MyJKKN integration.';
COMMENT ON COLUMN public.exam_attendance.attempt_number IS 'Attempt number for this exam (1 = first attempt, 2+ = re-attempt)';
COMMENT ON COLUMN public.exam_attendance.is_regular IS 'Whether student is regular (TRUE) or arrear/supplementary (FALSE)';
COMMENT ON COLUMN public.exam_attendance.created_by IS 'User who created this attendance record';
COMMENT ON COLUMN public.exam_attendance.updated_by IS 'User who last updated this attendance record';
COMMENT ON COLUMN public.exam_attendance.entry_time IS 'Time when the student entered the exam hall';
