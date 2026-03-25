-- Add min_mark and max_mark columns to grades table
ALTER TABLE grades
ADD COLUMN IF NOT EXISTS min_mark REAL NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_mark REAL NOT NULL DEFAULT 100;

-- Add check constraints to ensure values are between 0 and 100
ALTER TABLE grades
ADD CONSTRAINT check_min_mark_range CHECK (min_mark >= 0 AND min_mark <= 100),
ADD CONSTRAINT check_max_mark_range CHECK (max_mark >= 0 AND max_mark <= 100),
ADD CONSTRAINT check_min_less_than_max CHECK (min_mark <= max_mark);

-- Add comments
COMMENT ON COLUMN grades.min_mark IS 'Minimum mark required for this grade (0-100)';
COMMENT ON COLUMN grades.max_mark IS 'Maximum mark for this grade (0-100)';
