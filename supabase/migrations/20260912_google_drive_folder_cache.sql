-- Google Drive folder cache
-- Date: 2026-09-12
--
-- Every figure upload resolves the Drive folder chain
--   <ROOT> / Examiner / Question Papers / <institution> / <course>
-- with one Drive list call per level (~1 s each, ~4 s cold). The resolved
-- leaf id is remembered here, keyed by the full path, so a fresh server
-- process pays one database read instead of four Drive round trips. The code
-- treats a missing table as a cache miss, and a stale id (folder moved or
-- deleted in Drive) is re-resolved on the first failed upload.
--
-- Idempotent. Run in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.google_drive_folders (
	path TEXT PRIMARY KEY,
	folder_id TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Service role only: written and read by the server-side Drive helper.
ALTER TABLE public.google_drive_folders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.google_drive_folders IS
'Cache of resolved Google Drive folder ids by full path (root id + segments). Safe to truncate: entries are re-resolved on demand.';
