-- Migration: Make student_id nullable in exam_registrations table
-- This allows bulk import of exam registrations using stu_register_no without requiring student_id
-- The stu_register_no field serves as the primary identifier for students from MyJKKN system

-- Drop NOT NULL constraint on student_id if it exists
DO $$
BEGIN
    -- Check if the column exists and is NOT NULL
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'exam_registrations'
        AND column_name = 'student_id'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.exam_registrations ALTER COLUMN student_id DROP NOT NULL;
        RAISE NOTICE 'student_id column is now nullable';
    ELSE
        RAISE NOTICE 'student_id column is already nullable or does not exist';
    END IF;
END $$;

-- Add a comment explaining the change
COMMENT ON COLUMN public.exam_registrations.student_id IS 'Optional UUID reference to student. For bulk imports, stu_register_no can be used as the primary identifier instead.';
