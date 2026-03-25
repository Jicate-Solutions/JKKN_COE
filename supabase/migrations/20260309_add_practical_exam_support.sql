-- Add practical exam support to exam_timetables
-- exam_type: 'Theory' (default) or 'Practical'
-- batch_capacity: number of students per practical batch (NULL for theory)

ALTER TABLE exam_timetables
ADD COLUMN IF NOT EXISTS exam_type VARCHAR(20) DEFAULT 'Theory';

ALTER TABLE exam_timetables
ADD COLUMN IF NOT EXISTS batch_capacity INTEGER;

-- Add check constraint for valid exam_type values
ALTER TABLE exam_timetables
ADD CONSTRAINT check_valid_exam_type
CHECK (exam_type IN ('Theory', 'Practical'));

-- Add check constraint: batch_capacity required for practical, NULL for theory
ALTER TABLE exam_timetables
ADD CONSTRAINT check_practical_batch_capacity
CHECK (
  (exam_type = 'Theory' AND batch_capacity IS NULL)
  OR (exam_type = 'Practical' AND batch_capacity IS NOT NULL AND batch_capacity > 0)
);

COMMENT ON COLUMN exam_timetables.exam_type IS 'Theory or Practical. Practical exams have multiple timetable rows (one per batch)';
COMMENT ON COLUMN exam_timetables.batch_capacity IS 'Max students per practical batch. NULL for theory exams';
