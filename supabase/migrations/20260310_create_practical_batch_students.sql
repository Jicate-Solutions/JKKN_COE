-- Create practical_batch_students table
-- Stores which students are assigned to which practical exam batch (timetable row)

CREATE TABLE IF NOT EXISTS practical_batch_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_timetable_id UUID NOT NULL REFERENCES exam_timetables(id) ON DELETE CASCADE,
    exam_registration_id UUID NOT NULL REFERENCES exam_registrations(id) ON DELETE CASCADE,
    institutions_id UUID NOT NULL REFERENCES institutions(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID,
    UNIQUE(exam_timetable_id, exam_registration_id)
);

-- Index for fast lookups by timetable (batch)
CREATE INDEX idx_practical_batch_students_timetable
    ON practical_batch_students(exam_timetable_id);

-- Index for checking if a student is already assigned to any batch
CREATE INDEX idx_practical_batch_students_registration
    ON practical_batch_students(exam_registration_id);

-- Index for institution-scoped queries
CREATE INDEX idx_practical_batch_students_institution
    ON practical_batch_students(institutions_id);

COMMENT ON TABLE practical_batch_students IS 'Maps students to practical exam batches (timetable rows). Each student can only appear in one batch per timetable row.';
