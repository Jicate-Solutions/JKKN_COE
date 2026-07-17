-- =====================================================
-- IA QP: author as a plain UUID (MyJKKN staff profile id) + drop users FKs
-- Created: 2026-07-17
-- Why: created_by/approved_by/paper_setter_id FK'd to local public.users, but
--      the acting user comes from MyJKKN and may not exist locally. Store the
--      MyJKKN staff profile UUID directly (no FK) so it can link back to a
--      MyJKKN staff profile. Also add an explicit author_id column.
-- Idempotent: guards + IF EXISTS.
-- =====================================================

-- ── ia_question_papers ──
ALTER TABLE public.ia_question_papers
	ADD COLUMN IF NOT EXISTS author_id UUID;      -- MyJKKN staff profile id (no FK)

ALTER TABLE public.ia_question_papers DROP CONSTRAINT IF EXISTS ia_question_papers_created_by_fkey;
ALTER TABLE public.ia_question_papers DROP CONSTRAINT IF EXISTS ia_question_papers_approved_by_fkey;
ALTER TABLE public.ia_question_papers DROP CONSTRAINT IF EXISTS ia_question_papers_paper_setter_id_fkey;

COMMENT ON COLUMN public.ia_question_papers.author_id IS
	'MyJKKN staff profile UUID of the paper author. Plain UUID (no FK) — links to MyJKKN staff, not local users.';
COMMENT ON COLUMN public.ia_question_papers.created_by IS
	'Acting user UUID (MyJKKN staff profile id). No FK — may not exist in local public.users.';

-- Backfill author_id from created_by where already set
UPDATE public.ia_question_papers SET author_id = created_by
WHERE author_id IS NULL AND created_by IS NOT NULL;

-- ── ia_paper_templates ──
ALTER TABLE public.ia_paper_templates
	ADD COLUMN IF NOT EXISTS author_id UUID;

ALTER TABLE public.ia_paper_templates DROP CONSTRAINT IF EXISTS ia_paper_templates_created_by_fkey;
ALTER TABLE public.ia_paper_templates DROP CONSTRAINT IF EXISTS ia_paper_templates_approved_by_fkey;

COMMENT ON COLUMN public.ia_paper_templates.author_id IS
	'MyJKKN staff profile UUID of the template author. Plain UUID (no FK).';

UPDATE public.ia_paper_templates SET author_id = created_by
WHERE author_id IS NULL AND created_by IS NOT NULL;

-- ── ia_paper_setters.assigned_by (also drop FK to users) ──
ALTER TABLE public.ia_paper_setters DROP CONSTRAINT IF EXISTS ia_paper_setters_assigned_by_fkey;

CREATE INDEX IF NOT EXISTS idx_ia_papers_author ON public.ia_question_papers(author_id);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
