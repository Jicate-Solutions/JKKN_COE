-- =====================================================
-- IA TEMPLATE PARTS: add the missing num_to_answer column
-- Created: 2026-08-06
-- =====================================================
-- Why: the UI and both API routes (/api/pre-exam/question-paper-templates and
-- /api/v1/ia/paper-templates) always send `num_to_answer` ("Answer any N";
-- NULL = answer ALL), but the column was never created in the live database.
-- Every part insert therefore failed with PostgREST PGRST204
-- ("Could not find the 'num_to_answer' column of 'ia_template_parts'"), which:
--   * on CREATE  -> rolled the new template header back (nothing got saved), and
--   * on EDIT    -> wiped the existing parts (they are deleted before the insert),
--                   leaving a template with 0 parts and total_marks = 0.
--
-- Safe to re-run.

-- 1. The column.
ALTER TABLE public.ia_template_parts
	ADD COLUMN IF NOT EXISTS num_to_answer INTEGER;

COMMENT ON COLUMN public.ia_template_parts.num_to_answer IS
	'"Answer any N" of num_questions. NULL means every question must be answered.';

-- 2. Guard rail: answer-any must be a positive number no larger than the count.
ALTER TABLE public.ia_template_parts
	DROP CONSTRAINT IF EXISTS ia_template_parts_num_to_answer_check;

ALTER TABLE public.ia_template_parts
	ADD CONSTRAINT ia_template_parts_num_to_answer_check
	CHECK (num_to_answer IS NULL OR (num_to_answer > 0 AND num_to_answer <= num_questions));

-- 3. part_max_marks must count the questions that are ANSWERED, not the ones
--    printed — otherwise a "10 questions, answer any 5" part inflates the
--    template total and disagrees with the number the builder screen shows.
CREATE OR REPLACE FUNCTION ia_part_before()
RETURNS TRIGGER AS $$
BEGIN
	NEW.part_max_marks :=
		COALESCE(NULLIF(NEW.num_to_answer, 0), NEW.num_questions, 0)
		* COALESCE(NEW.marks_per_question, 0);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Recompute existing rows through the trigger, then roll the totals up.
UPDATE public.ia_template_parts SET updated_at = updated_at;

UPDATE public.ia_paper_templates t
SET total_marks = COALESCE((
	SELECT SUM(p.part_max_marks)
	FROM public.ia_template_parts p
	WHERE p.template_id = t.id AND p.is_active = true
), 0);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
