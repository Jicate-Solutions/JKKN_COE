-- Fix internal_marks.student_id foreign key to reference students table instead of users table
-- This makes it consistent with exam_attendance and other exam-related tables

-- Step 1: Drop the existing incorrect foreign key constraint
ALTER TABLE public.internal_marks
DROP CONSTRAINT IF EXISTS internal_marks_student_id_fkey;

-- Step 2: Add the correct foreign key constraint referencing students table
ALTER TABLE public.internal_marks
ADD CONSTRAINT internal_marks_student_id_fkey
	FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

-- Step 3: Also fix final_marks table if it has the same issue
ALTER TABLE public.final_marks
DROP CONSTRAINT IF EXISTS final_marks_student_id_fkey;

ALTER TABLE public.final_marks
ADD CONSTRAINT final_marks_student_id_fkey
	FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

-- Add comment explaining the change
COMMENT ON CONSTRAINT internal_marks_student_id_fkey ON public.internal_marks IS
'References students table to be consistent with exam_registrations and exam_attendance';

COMMENT ON CONSTRAINT final_marks_student_id_fkey ON public.final_marks IS
'References students table to be consistent with exam_registrations and exam_attendance';
