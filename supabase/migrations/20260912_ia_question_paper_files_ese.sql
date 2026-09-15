-- Question-paper figure registry: End-Semester papers too
-- Date: 2026-09-12
--
-- 20260912_ia_question_paper_files.sql keyed every Drive figure to
-- ia_question_papers with a foreign key. Examiner-portal papers are
-- ese_question_papers rows, so an examiner's figure upload could never be
-- registered (and the upload route answered "Paper not found").
--
-- The row now records WHICH table its paper lives in and the foreign key goes:
-- a single column cannot reference two tables. Cleanup on paper delete is done
-- in code (deletePaperDriveFiles marks the rows deleted after sweeping Drive),
-- which every delete route already calls.
--
-- Idempotent. Run in the Supabase SQL Editor.

ALTER TABLE public.ia_question_paper_files
	DROP CONSTRAINT IF EXISTS ia_question_paper_files_paper_id_fkey;

ALTER TABLE public.ia_question_paper_files
	ADD COLUMN IF NOT EXISTS paper_kind TEXT NOT NULL DEFAULT 'ia';

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'ia_question_paper_files_paper_kind_check'
	) THEN
		ALTER TABLE public.ia_question_paper_files
			ADD CONSTRAINT ia_question_paper_files_paper_kind_check
			CHECK (paper_kind IN ('ia', 'ese'));
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ia_question_paper_files_paper_kind
	ON public.ia_question_paper_files(paper_kind, paper_id)
	WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.ia_question_paper_files.paper_kind IS
'Table the paper lives in: ia = ia_question_papers (CIA), ese = ese_question_papers (End-Semester, examiner portal).';
COMMENT ON TABLE public.ia_question_paper_files IS
'Google Drive figures attached to question papers (CIA and End-Semester). drive_file_id → paper mapping for the authenticated proxy, Drive cleanup on paper delete, and the Supabase→Drive migration audit. No FK on paper_id: see paper_kind.';
