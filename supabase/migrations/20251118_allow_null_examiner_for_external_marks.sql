-- Allow null examiner_assignment_id for external mark entry
-- External marks are entered directly without examiner assignment

ALTER TABLE marks_entry
ALTER COLUMN examiner_assignment_id DROP NOT NULL;

-- Update foreign key constraint to allow null
ALTER TABLE marks_entry
DROP CONSTRAINT IF EXISTS marks_entry_examiner_assignment_id_fkey;

ALTER TABLE marks_entry
ADD CONSTRAINT marks_entry_examiner_assignment_id_fkey
FOREIGN KEY (examiner_assignment_id)
REFERENCES examiner_assignments (id)
ON DELETE RESTRICT;

-- Add a check constraint to ensure either examiner_assignment_id is provided
-- OR the entry is marked as external entry (we'll use evaluator_remarks to identify)
-- This allows both internal (via examiner) and external mark entry

COMMENT ON COLUMN marks_entry.examiner_assignment_id IS 'Examiner assignment ID - NULL for external direct entry, required for internal evaluation';

-- Update unique constraint to handle external entries
-- External entries are identified by institution + dummy_number + course + session
ALTER TABLE marks_entry
DROP CONSTRAINT IF EXISTS unique_marks_entry;

-- Create composite unique index for external entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_external_marks_entry
ON marks_entry(institutions_id, examination_session_id, student_dummy_number_id, course_id)
WHERE examiner_assignment_id IS NULL;

-- Keep unique constraint for examiner-based entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_examiner_marks_entry
ON marks_entry(institutions_id, examination_session_id, student_dummy_number_id, course_id, examiner_assignment_id)
WHERE examiner_assignment_id IS NOT NULL;
