-- =====================================================================
-- Migration: Convert result_declaration_date to date & time (timestamptz)
-- Date: 2026-06-04
-- =====================================================================
-- Context:
--   The "Result Declaration Date" on an examination session previously
--   stored only a calendar date. Post-exam result visibility for learners
--   (via /api/v1/results consumed by MyJKKN) is gated on this value being
--   <= the current date AND time, so we need time precision.
--
-- Why the DO block:
--   Multiple views depend on this column (e.g. active_examination_sessions,
--   upcoming_examination_sessions), so a plain ALTER COLUMN ... TYPE fails:
--     ERROR: cannot alter type of a column used by a view or rule
--   This block DISCOVERS every view that depends on the column, captures
--   each view's definition, drops them all, alters the column, then
--   recreates each view exactly as it was. This avoids hardcoding view
--   definitions that live only in Supabase, and is resilient to however
--   many dependent views exist.
--
-- Notes:
--   - The partial index idx_exam_sessions_result_date is rebuilt
--     automatically by ALTER COLUMN ... TYPE.
--   - Existing date-only values are interpreted at midnight in the database
--     session time zone.
--   - GRANTs on recreated views are NOT restored automatically. These are
--     server-side (service role) views, so that is expected to be a no-op;
--     re-grant manually if any of them are read directly by anon/auth roles.
--   - Run this in the Supabase SQL Editor (no CLI/exec_sql available).
-- =====================================================================

DO $$
DECLARE
	v_rec   record;
	v_names text[] := '{}';
	v_defs  text[] := '{}';
	i       int;
BEGIN
	-- 1. Discover every view depending on
	--    examination_sessions.result_declaration_date and capture its def.
	FOR v_rec IN
		SELECT DISTINCT
			(dv.relnamespace::regnamespace::text || '.' || quote_ident(dv.relname)) AS view_name,
			pg_get_viewdef(dv.oid, true) AS view_def
		FROM pg_depend d
		JOIN pg_rewrite r  ON r.oid = d.objid
		JOIN pg_class   dv ON dv.oid = r.ev_class
		JOIN pg_class   tc ON tc.oid = d.refobjid
		JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
		WHERE tc.relname = 'examination_sessions'
		  AND a.attname  = 'result_declaration_date'
		  AND dv.relkind = 'v'
	LOOP
		v_names := array_append(v_names, v_rec.view_name);
		v_defs  := array_append(v_defs,  v_rec.view_def);
	END LOOP;

	-- 2. Drop all dependent views (CASCADE for any inter-view dependency).
	FOR i IN 1 .. coalesce(array_length(v_names, 1), 0) LOOP
		EXECUTE 'DROP VIEW IF EXISTS ' || v_names[i] || ' CASCADE';
	END LOOP;

	-- 3. Alter the column type date -> timestamptz.
	EXECUTE '
		ALTER TABLE public.examination_sessions
		ALTER COLUMN result_declaration_date TYPE timestamp with time zone
		USING result_declaration_date::timestamp with time zone
	';

	-- 4. Recreate each view exactly as it was.
	FOR i IN 1 .. coalesce(array_length(v_names, 1), 0) LOOP
		EXECUTE 'CREATE VIEW ' || v_names[i] || ' AS ' || v_defs[i];
	END LOOP;

	RAISE NOTICE 'Recreated % dependent view(s): %', coalesce(array_length(v_names, 1), 0), v_names;
END $$;

COMMENT ON COLUMN public.examination_sessions.result_declaration_date IS
	'Date & time results become visible to learners. Results are exposed via the public /api/v1/results API only when this is <= now() AND final_marks.result_status = ''Published''. Auto-set to the publish moment when results are published, unless a future value was already scheduled.';
