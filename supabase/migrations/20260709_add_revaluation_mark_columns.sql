-- =====================================================
-- Revaluation Mark Columns (marks_entry + final_marks)
-- Date: 2026-07-09
-- Purpose:
--   1. marks_entry: store the revaluation (new) external mark in a
--      SEPARATE column. The original mark is preserved untouched in
--      total_marks_obtained.
--   2. final_marks: snapshot the original (pre-revaluation) values in
--      original_* columns BEFORE the row is updated with revaluation
--      results, so both old and new marks are always available.
-- Run manually in the Supabase SQL Editor.
-- =====================================================

-- =====================================================
-- 1. MARKS_ENTRY: revaluation mark columns
-- =====================================================

ALTER TABLE public.marks_entry
	ADD COLUMN IF NOT EXISTS revaluation_marks_obtained NUMERIC(5,2),
	ADD COLUMN IF NOT EXISTS revaluation_marks_in_words VARCHAR(255),
	ADD COLUMN IF NOT EXISTS revaluation_entry_date TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS revaluation_entered_by UUID,
	ADD COLUMN IF NOT EXISTS revaluation_remarks TEXT;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.table_constraints
		WHERE table_name = 'marks_entry'
			AND constraint_name = 'marks_entry_revaluation_entered_by_fkey'
	) THEN
		ALTER TABLE public.marks_entry
			ADD CONSTRAINT marks_entry_revaluation_entered_by_fkey
			FOREIGN KEY (revaluation_entered_by) REFERENCES users(id) ON DELETE SET NULL;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM information_schema.table_constraints
		WHERE table_name = 'marks_entry'
			AND constraint_name = 'check_revaluation_marks_valid'
	) THEN
		ALTER TABLE public.marks_entry
			ADD CONSTRAINT check_revaluation_marks_valid CHECK (
				revaluation_marks_obtained IS NULL OR
				(revaluation_marks_obtained >= 0 AND revaluation_marks_obtained <= marks_out_of)
			);
	END IF;
END $$;

-- Fast lookup of entries that have a revaluation mark pending/applied
CREATE INDEX IF NOT EXISTS idx_marks_entry_revaluation
	ON public.marks_entry(exam_registration_id)
	WHERE revaluation_marks_obtained IS NOT NULL;

COMMENT ON COLUMN public.marks_entry.revaluation_marks_obtained
	IS 'Revaluation (new) external mark. Original mark stays in total_marks_obtained.';
COMMENT ON COLUMN public.marks_entry.revaluation_entry_date
	IS 'When the revaluation mark was entered';
COMMENT ON COLUMN public.marks_entry.revaluation_remarks
	IS 'Remarks for the revaluation mark entry';

-- =====================================================
-- 2. FINAL_MARKS: original (pre-revaluation) snapshot + applied flags
-- =====================================================

ALTER TABLE public.final_marks
	ADD COLUMN IF NOT EXISTS original_external_marks_obtained NUMERIC(10,2),
	ADD COLUMN IF NOT EXISTS original_total_marks_obtained NUMERIC(10,2),
	ADD COLUMN IF NOT EXISTS original_percentage NUMERIC(5,2),
	ADD COLUMN IF NOT EXISTS original_letter_grade VARCHAR(50),
	ADD COLUMN IF NOT EXISTS original_grade_points NUMERIC(5,2),
	ADD COLUMN IF NOT EXISTS original_pass_status VARCHAR(20),
	ADD COLUMN IF NOT EXISTS is_revaluation_applied BOOLEAN DEFAULT false,
	ADD COLUMN IF NOT EXISTS revaluation_applied_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS revaluation_applied_by UUID;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.table_constraints
		WHERE table_name = 'final_marks'
			AND constraint_name = 'final_marks_revaluation_applied_by_fkey'
	) THEN
		ALTER TABLE public.final_marks
			ADD CONSTRAINT final_marks_revaluation_applied_by_fkey
			FOREIGN KEY (revaluation_applied_by) REFERENCES users(id) ON DELETE SET NULL;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_final_marks_revaluation_applied
	ON public.final_marks(course_id, examination_session_id)
	WHERE is_revaluation_applied = true;

COMMENT ON COLUMN public.final_marks.original_external_marks_obtained
	IS 'External mark BEFORE revaluation was applied (snapshot, never overwritten)';
COMMENT ON COLUMN public.final_marks.original_total_marks_obtained
	IS 'Total mark before revaluation was applied';
COMMENT ON COLUMN public.final_marks.original_percentage
	IS 'Percentage before revaluation was applied';
COMMENT ON COLUMN public.final_marks.original_letter_grade
	IS 'Letter grade before revaluation was applied';
COMMENT ON COLUMN public.final_marks.original_grade_points
	IS 'Grade points before revaluation was applied';
COMMENT ON COLUMN public.final_marks.original_pass_status
	IS 'Pass status before revaluation was applied';
COMMENT ON COLUMN public.final_marks.is_revaluation_applied
	IS 'True once the row has been updated with revaluation marks';

-- =====================================================
-- Migration Complete
-- =====================================================
