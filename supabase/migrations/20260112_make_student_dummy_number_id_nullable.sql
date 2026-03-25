-- Make student_dummy_number_id nullable in marks_entry
-- This allows external marks to be uploaded via Register Number mode
-- without requiring dummy numbers to be allocated first

-- Make student_dummy_number_id nullable
ALTER TABLE marks_entry
ALTER COLUMN student_dummy_number_id DROP NOT NULL;

-- Drop the existing unique index for external marks that requires student_dummy_number_id
DROP INDEX IF EXISTS idx_unique_external_marks_entry;

-- Create new unique index that handles nullable student_dummy_number_id
-- For entries with student_dummy_number_id (dummy number mode)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_external_marks_with_dummy
ON marks_entry(institutions_id, examination_session_id, student_dummy_number_id, course_id)
WHERE examiner_assignment_id IS NULL AND student_dummy_number_id IS NOT NULL;

-- For entries without student_dummy_number_id (register number mode without dummy allocation)
-- Use exam_registration_id for uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_external_marks_by_registration
ON marks_entry(institutions_id, examination_session_id, exam_registration_id, course_id)
WHERE examiner_assignment_id IS NULL AND student_dummy_number_id IS NULL;

-- Add comment explaining the nullable field
COMMENT ON COLUMN marks_entry.student_dummy_number_id IS 'Student dummy number ID - NULL for Register Number mode uploads where dummy numbers are not yet allocated';
