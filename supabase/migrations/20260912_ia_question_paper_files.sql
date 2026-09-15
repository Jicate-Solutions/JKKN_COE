-- Question-paper figures move from the public `question-images` Supabase bucket
-- to Google Drive (private — no link sharing).
-- Date: 2026-09-12
--
-- The figure itself stays embedded in ia_question_papers.questions JSONB as
--   { url, drive_file_id, drive_url, path, width_pct, px_w, px_h, bytes }
-- where `url` is the authenticated proxy (/api/examiner/question-paper/file/<id>)
-- and `drive_url` the retained Drive web-view link. This table maps every
-- drive_file_id back to its paper so the proxy can authorise a viewer against
-- the paper, the delete routes can sweep Drive, and the one-off migration from
-- Supabase Storage can be tracked and verified before any bucket object is
-- removed.
--
-- Idempotent. Run in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.ia_question_paper_files (
	id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	paper_id UUID NOT NULL REFERENCES public.ia_question_papers(id) ON DELETE CASCADE,
	institutions_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,

	drive_file_id TEXT NOT NULL UNIQUE,
	drive_url TEXT NOT NULL,
	filename TEXT NOT NULL,
	mime_type TEXT NOT NULL,
	size_bytes INTEGER NOT NULL DEFAULT 0,
	kind TEXT NOT NULL DEFAULT 'question_image',

	uploaded_by_kind TEXT NOT NULL CHECK (uploaded_by_kind IN ('coe', 'examiner', 'migration')),
	uploaded_by TEXT,

	-- Legacy Supabase object path (<paperId>/<uuid>.<ext>) for a migrated figure.
	supabase_path TEXT,
	migrated_at TIMESTAMPTZ,
	supabase_removed_at TIMESTAMPTZ,

	deleted_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ia_question_paper_files_paper
	ON public.ia_question_paper_files(paper_id)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ia_question_paper_files_supabase_path
	ON public.ia_question_paper_files(supabase_path)
	WHERE supabase_path IS NOT NULL;

-- Service role only: the API routes read and write this with the server client.
ALTER TABLE public.ia_question_paper_files ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ia_question_paper_files IS
'Google Drive figures attached to IA question papers. drive_file_id → paper mapping for the authenticated proxy, Drive cleanup on paper delete, and the Supabase→Drive migration audit.';
COMMENT ON COLUMN public.ia_question_paper_files.drive_file_id IS 'Google Drive file id. The file is private; bytes are served via /api/examiner/question-paper/file/<id>.';
COMMENT ON COLUMN public.ia_question_paper_files.supabase_path IS 'Object path in the legacy question-images bucket when this row was migrated; NULL for a direct Drive upload.';
