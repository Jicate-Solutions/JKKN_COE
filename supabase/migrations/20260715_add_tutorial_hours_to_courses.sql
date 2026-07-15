-- Add optional tutorial_hours column to courses (mirrors theory_hours / practical_hours)
-- Not mandatory: defaults to 0, nullable.
ALTER TABLE courses
	ADD COLUMN IF NOT EXISTS tutorial_hours integer DEFAULT 0;
