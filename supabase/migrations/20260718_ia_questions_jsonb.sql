-- =====================================================
-- IA: consolidate ia_paper_questions rows into a single questions JSONB
-- Created: 2026-07-18
-- Adds ia_question_papers.questions (jsonb array) and backfills it from the
-- existing ia_paper_questions rows. The old table is kept for one release as a
-- fallback and dropped by a later migration once verified.
-- Idempotent: safe to re-run (re-backfills from rows).
-- =====================================================

ALTER TABLE public.ia_question_papers
	ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.ia_question_papers.questions IS
	'Ordered array of question objects (id, part_label, question_number, sub_label, is_choice_alternative, question_type_code, question_text, marks, options, correct_option, co_code, k_level, display_order). Replaces per-row ia_paper_questions.';

-- Backfill: aggregate each paper''s rows into an ordered JSON array, reusing the
-- row id as the stable question id.
UPDATE public.ia_question_papers p
SET    questions = COALESCE((
	SELECT jsonb_agg(
		jsonb_build_object(
			'id', q.id,
			'part_label', q.part_label,
			'question_number', q.question_number,
			'sub_label', q.sub_label,
			'is_choice_alternative', q.is_choice_alternative,
			'question_type_code', q.question_type_code,
			'question_text', q.question_text,
			'marks', q.marks,
			'options', q.options,
			'correct_option', q.correct_option,
			'co_code', q.co_code,
			'k_level', q.k_level,
			'display_order', q.display_order
		) ORDER BY q.display_order
	)
	FROM public.ia_paper_questions q
	WHERE q.paper_id = p.id
), '[]'::jsonb)
WHERE EXISTS (SELECT 1 FROM public.ia_paper_questions q WHERE q.paper_id = p.id);

-- Verification helper (run manually):
--   SELECT (SELECT count(*) FROM ia_paper_questions) AS rows,
--          (SELECT sum(jsonb_array_length(questions)) FROM ia_question_papers) AS in_json;
-- The two totals should match.

-- =====================================================
-- NOTE: ia_paper_questions is intentionally NOT dropped here.
-- After verifying the app reads/writes `questions` correctly, drop it with:
--   DROP TABLE public.ia_paper_questions;
-- =====================================================
