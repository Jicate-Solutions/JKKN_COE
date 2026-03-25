-- Make exam_timetable_id nullable in student_dummy_numbers table
-- This allows registration-based dummy number generation without timetable reference

ALTER TABLE student_dummy_numbers
ALTER COLUMN exam_timetable_id DROP NOT NULL;

COMMENT ON COLUMN student_dummy_numbers.exam_timetable_id IS
'Optional reference to exam timetable. Required for attendance-based generation, null for registration-based generation.';
