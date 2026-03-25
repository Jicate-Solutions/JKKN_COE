-- Migration: Update course_offerings unique constraint to use program_code and semester_code
-- Date: 2026-01-08
-- Description: Replace the unique constraint to use program_code and semester_code instead of program_id and semester number
-- This aligns with the MyJKKN reference system where codes are the stable identifiers

-- Step 1: Drop the old unique constraint
ALTER TABLE public.course_offerings
DROP CONSTRAINT IF EXISTS unique_offering;

-- Step 2: Add the new unique constraint with program_code and semester_code
ALTER TABLE public.course_offerings
ADD CONSTRAINT unique_offering UNIQUE (
  institutions_id,
  course_mapping_id,
  examination_session_id,
  program_code,
  semester_code
);

-- Step 3: Add comment explaining the constraint
COMMENT ON CONSTRAINT unique_offering ON public.course_offerings IS
'Ensures each course offering is unique per institution, course, examination session, program code, and semester code. Both program_code and semester_code come from MyJKKN API for stable references.';
