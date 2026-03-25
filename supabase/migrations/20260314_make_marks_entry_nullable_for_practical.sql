-- Make marks_entry fields nullable for practical mark entry
-- Practical marks use register numbers from batch allocations, not dummy numbers

-- Make student_dummy_number_id nullable for practical entries
ALTER TABLE marks_entry
ALTER COLUMN student_dummy_number_id DROP NOT NULL;

-- Make dummy_number nullable for practical entries
ALTER TABLE marks_entry
ALTER COLUMN dummy_number DROP NOT NULL;

-- Add register_number column for practical entries (identifies student by register number)
ALTER TABLE marks_entry
ADD COLUMN IF NOT EXISTS register_number VARCHAR(50);

-- Add exam_timetable_id column to link practical marks to their batch
ALTER TABLE marks_entry
ADD COLUMN IF NOT EXISTS exam_timetable_id UUID REFERENCES exam_timetables(id) ON DELETE SET NULL;

-- Create index for practical marks lookup
CREATE INDEX IF NOT EXISTS idx_marks_entry_exam_timetable_id
ON marks_entry(exam_timetable_id) WHERE exam_timetable_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marks_entry_register_number
ON marks_entry(register_number) WHERE register_number IS NOT NULL;

-- Create unique index for practical entries (prevent duplicate marks per student per course per batch)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_practical_marks_entry
ON marks_entry(institutions_id, examination_session_id, exam_registration_id, course_id, exam_timetable_id)
WHERE exam_timetable_id IS NOT NULL AND source = 'Practical Entry';

-- Add comments
COMMENT ON COLUMN marks_entry.student_dummy_number_id IS 'Student dummy number ID - NULL for practical entry (uses register_number instead)';
COMMENT ON COLUMN marks_entry.dummy_number IS 'Blind evaluation number - NULL for practical entry (uses register_number instead)';
COMMENT ON COLUMN marks_entry.register_number IS 'Student register number - used for practical entry where blind evaluation is not needed';
COMMENT ON COLUMN marks_entry.exam_timetable_id IS 'Exam timetable ID - links practical marks to their batch allocation';