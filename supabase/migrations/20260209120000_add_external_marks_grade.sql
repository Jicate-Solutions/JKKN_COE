-- Migration: Add grade column to external_marks (marks_entry) table
-- Purpose: Support status-based papers (Commended, Highly Commended, AAA)
-- Date: 2026-02-09

-- Add grade column to marks_entry table (external marks)
ALTER TABLE marks_entry
ADD COLUMN IF NOT EXISTS grade VARCHAR(50);

-- Add comment
COMMENT ON COLUMN marks_entry.grade IS 'Grade for status-based papers (Commended, Highly Commended, AAA). NULL for mark-based papers.';

-- Add index for performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_marks_entry_grade
ON marks_entry(grade)
WHERE grade IS NOT NULL;

-- Add check constraint to ensure valid status values (optional but recommended)
ALTER TABLE marks_entry
ADD CONSTRAINT chk_marks_entry_grade_values
CHECK (
  grade IS NULL OR
  grade IN ('Commended', 'Highly Commended', 'AAA')
);
