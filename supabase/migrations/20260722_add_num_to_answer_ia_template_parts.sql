-- =====================================================
-- ADD "ANSWER ANY N" SUPPORT TO IA TEMPLATE PARTS
-- Created: 2026-07-22
-- Purpose: Parts like "Answer any ONE question" print
--          num_questions questions but only num_to_answer
--          of them count toward the part / paper marks.
--          NULL (default) = answer ALL questions (old behaviour).
-- =====================================================

ALTER TABLE public.ia_template_parts
	ADD COLUMN IF NOT EXISTS num_to_answer INTEGER
	CHECK (num_to_answer IS NULL OR num_to_answer > 0);

COMMENT ON COLUMN public.ia_template_parts.num_to_answer IS
'How many questions the learner must answer ("Answer any N"). NULL = all. part_max_marks = COALESCE(num_to_answer, num_questions) * marks_per_question.';

-- Recompute part_max_marks using num_to_answer when set
CREATE OR REPLACE FUNCTION ia_part_before()
RETURNS TRIGGER AS $$
BEGIN
	NEW.part_max_marks :=
		COALESCE(NULLIF(NEW.num_to_answer, 0), NEW.num_questions, 0)
		* COALESCE(NEW.marks_per_question, 0);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Touch existing rows so part_max_marks + template total_marks re-sync
-- (no-op for rows without num_to_answer, but keeps totals consistent).
UPDATE public.ia_template_parts SET updated_at = updated_at;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
