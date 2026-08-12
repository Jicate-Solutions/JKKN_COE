-- =====================================================
-- Add question_marks JSONB to cia_marks (question-wise CIA entry)
-- Created: 2026-08-12
--
-- A CIA round configured with cia_entry_settings.cia_rounds[].mark_entry_type =
-- 'question_wise' is keyed in question by question, using the question list from
-- the round's question paper (ia_question_papers.questions).
--
-- Per-question marks are stored here as an additive detail. The component total
-- (test_1_mark, assignment_marks, ..., or extra_marks[code]) still holds the SUM,
-- so every downstream consumer — totals, reports, /api/v1 sync, marksheet PDFs —
-- keeps working with no change.
--
-- Shape (keyed by component code):
--   {
--     "test_1": {
--       "paper_id": "uuid",
--       "set_number": 1,
--       "set_label": "A",
--       "marks": { "<question id>": 3, "<question id>": 2.5 }
--     }
--   }
-- Question ids are ia_question_papers.questions[].id, so renumbering or
-- reordering a paper never re-points saved marks at the wrong question.
-- =====================================================

ALTER TABLE public.cia_marks
	ADD COLUMN IF NOT EXISTS question_marks JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.cia_marks.question_marks IS
	'Per-question CIA marks for question-wise rounds, keyed by component code → { paper_id, set_number, set_label, marks: { question_id: mark } }. The component column holds the sum; this is the breakdown behind it.';

-- =====================================================
-- Locked rows must reject question-mark edits too.
-- Mirrors 20260501_add_extra_marks_to_cia_marks.sql: only redefine the trigger
-- when the fixed-column schema (20260402) is the one in place.
-- =====================================================
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'cia_marks' AND column_name = 'assignment_marks'
	) THEN
		CREATE OR REPLACE FUNCTION public.prevent_locked_cia_marks_modification()
		RETURNS TRIGGER AS $TRIGGER_FN$
		BEGIN
			IF OLD.is_locked = true AND (
				NEW.assignment_marks IS DISTINCT FROM OLD.assignment_marks OR
				NEW.quiz_marks IS DISTINCT FROM OLD.quiz_marks OR
				NEW.mid_term_marks IS DISTINCT FROM OLD.mid_term_marks OR
				NEW.presentation_marks IS DISTINCT FROM OLD.presentation_marks OR
				NEW.attendance_marks IS DISTINCT FROM OLD.attendance_marks OR
				NEW.lab_marks IS DISTINCT FROM OLD.lab_marks OR
				NEW.project_marks IS DISTINCT FROM OLD.project_marks OR
				NEW.seminar_marks IS DISTINCT FROM OLD.seminar_marks OR
				NEW.viva_marks IS DISTINCT FROM OLD.viva_marks OR
				NEW.other_marks IS DISTINCT FROM OLD.other_marks OR
				NEW.test_1_mark IS DISTINCT FROM OLD.test_1_mark OR
				NEW.test_2_mark IS DISTINCT FROM OLD.test_2_mark OR
				NEW.test_3_mark IS DISTINCT FROM OLD.test_3_mark OR
				NEW.total_internal_marks IS DISTINCT FROM OLD.total_internal_marks OR
				NEW.extra_marks IS DISTINCT FROM OLD.extra_marks OR
				NEW.question_marks IS DISTINCT FROM OLD.question_marks
			) THEN
				RAISE EXCEPTION 'Cannot modify locked CIA marks. Unlock first.';
			END IF;
			RETURN NEW;
		END;
		$TRIGGER_FN$ LANGUAGE plpgsql;
	END IF;
END $$;
