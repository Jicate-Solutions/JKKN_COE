-- Fix generated_by foreign key constraint in student_dummy_numbers table
-- Option 1: Make generated_by nullable (recommended for flexibility)
-- Option 2: Drop the foreign key constraint to faculty_coe

-- Make generated_by nullable to allow system-generated or anonymous generation
ALTER TABLE student_dummy_numbers
ALTER COLUMN generated_by DROP NOT NULL;

-- Drop the foreign key constraint if it exists
-- This allows storing user IDs without strict validation against faculty_coe table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'student_dummy_numbers_generated_by_fkey'
        AND table_name = 'student_dummy_numbers'
    ) THEN
        ALTER TABLE student_dummy_numbers
        DROP CONSTRAINT student_dummy_numbers_generated_by_fkey;
    END IF;
END $$;

COMMENT ON COLUMN student_dummy_numbers.generated_by IS
'User ID who generated the dummy numbers. Optional field, can be null for system-generated entries.';
