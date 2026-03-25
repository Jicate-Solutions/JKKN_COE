-- Migration: Add grade column to internal_marks table
-- Purpose: Support status-based papers (Commended, Highly Commended, AAA) for CIA-only courses
-- Date: 2026-02-10

-- Add grade column to internal_marks table
ALTER TABLE internal_marks
ADD COLUMN IF NOT EXISTS grade VARCHAR(50);

-- Add comment
COMMENT ON COLUMN internal_marks.grade IS 'Grade for status-based papers (Commended, Highly Commended, AAA). NULL for mark-based papers.';

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_internal_marks_grade
ON internal_marks(grade)
WHERE grade IS NOT NULL;

-- Add check constraint to ensure valid status values
ALTER TABLE internal_marks
ADD CONSTRAINT chk_internal_marks_grade_values
CHECK (
  grade IS NULL OR
  grade IN ('Commended', 'Highly Commended', 'AAA')
);
