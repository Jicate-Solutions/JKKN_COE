-- Fix e_code_name CHECK constraint to allow NULL values
-- This constraint was too restrictive and didn't allow NULL for optional field

-- Drop the existing constraint
ALTER TABLE courses DROP CONSTRAINT IF EXISTS course_e_code_name_check;

-- Add new constraint that allows NULL or specific language values
ALTER TABLE courses ADD CONSTRAINT course_e_code_name_check 
  CHECK (
    e_code_name IS NULL 
    OR e_code_name IN ('Tamil', 'English', 'French', 'Malayalam', 'Hindi')
  );

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT course_e_code_name_check ON courses IS 
  'E-code name must be NULL (optional) or one of the supported languages: Tamil, English, French, Malayalam, Hindi';

