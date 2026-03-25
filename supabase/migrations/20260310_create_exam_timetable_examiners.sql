-- Migration: Create exam_timetable_examiners table
-- Purpose: Store internal/external examiner assignments for practical/project exam batches
-- Each practical timetable row (batch) gets exactly 1 internal + 1 external examiner

CREATE TABLE IF NOT EXISTS exam_timetable_examiners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_timetable_id UUID NOT NULL REFERENCES exam_timetables(id) ON DELETE CASCADE,
    examiner_type TEXT NOT NULL CHECK (examiner_type IN ('internal', 'external')),

    -- For internal examiners (from MyJKKN staff API)
    staff_id TEXT,
    staff_name TEXT,
    staff_mobile TEXT,

    -- For external examiners (from local examiners table)
    examiner_id UUID REFERENCES examiners(id) ON DELETE SET NULL,

    -- Common
    institutions_id UUID REFERENCES institutions(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One internal + one external per timetable entry
    UNIQUE(exam_timetable_id, examiner_type)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ete_timetable ON exam_timetable_examiners(exam_timetable_id);
CREATE INDEX IF NOT EXISTS idx_ete_examiner ON exam_timetable_examiners(examiner_id);
CREATE INDEX IF NOT EXISTS idx_ete_institution ON exam_timetable_examiners(institutions_id);