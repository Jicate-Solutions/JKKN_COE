-- Migration: Update course_offerings unique constraint to use code columns
-- This migration adds code columns and updates the unique constraint

-- Step 1: Add code columns to course_offerings table
ALTER TABLE public.course_offerings
ADD COLUMN IF NOT EXISTS institution_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS course_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS program_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS session_code VARCHAR(50);

-- Step 2: Populate code columns from existing foreign key relationships
-- Update institution_code
UPDATE public.course_offerings co
SET institution_code = i.institution_code
FROM public.institutions i
WHERE co.institutions_id = i.id
AND co.institution_code IS NULL;

-- Update course_code from course_mapping
UPDATE public.course_offerings co
SET course_code = cm.course_code
FROM public.course_mapping cm
INNER JOIN public.courses c ON cm.course_id = c.id
WHERE co.course_id = cm.id
AND co.course_code IS NULL;

-- Update program_code
UPDATE public.course_offerings co
SET program_code = p.program_code
FROM public.programs p
WHERE co.program_id = p.id
AND co.program_code IS NULL;

-- Update session_code from examination_sessions
UPDATE public.course_offerings co
SET session_code = es.session_code
FROM public.examination_sessions es
WHERE co.examination_session_id = es.id
AND co.session_code IS NULL;

-- Step 3: Make code columns NOT NULL (after populating)
ALTER TABLE public.course_offerings
ALTER COLUMN institution_code SET NOT NULL,
ALTER COLUMN course_code SET NOT NULL,
ALTER COLUMN program_code SET NOT NULL,
ALTER COLUMN session_code SET NOT NULL;

-- Step 4: Drop old unique constraint
ALTER TABLE public.course_offerings
DROP CONSTRAINT IF EXISTS unique_offering;

-- Step 5: Create new unique constraint using code columns
ALTER TABLE public.course_offerings
ADD CONSTRAINT unique_offering_by_codes UNIQUE (
  institution_code,
  course_code,
  program_code,
  session_code,
  semester
);

-- Step 6: Create indexes for better query performance on code columns
CREATE INDEX IF NOT EXISTS idx_course_offerings_institution_code ON public.course_offerings USING btree (institution_code);
CREATE INDEX IF NOT EXISTS idx_course_offerings_course_code ON public.course_offerings USING btree (course_code);
CREATE INDEX IF NOT EXISTS idx_course_offerings_program_code ON public.course_offerings USING btree (program_code);
CREATE INDEX IF NOT EXISTS idx_course_offerings_session_code ON public.course_offerings USING btree (session_code);

-- Step 7: Create composite index for the unique constraint
CREATE INDEX IF NOT EXISTS idx_course_offerings_unique_codes ON public.course_offerings USING btree (
  institution_code,
  course_code,
  program_code,
  session_code,
  semester
);

-- Add comments
COMMENT ON COLUMN public.course_offerings.institution_code IS 'Institution code for human-readable reference';
COMMENT ON COLUMN public.course_offerings.course_code IS 'Course code for human-readable reference';
COMMENT ON COLUMN public.course_offerings.program_code IS 'Program code for human-readable reference';
COMMENT ON COLUMN public.course_offerings.session_code IS 'Examination session code for human-readable reference';
COMMENT ON CONSTRAINT unique_offering_by_codes ON public.course_offerings IS 'Ensures unique course offerings based on institution, course, program, session, and semester codes';
