-- =====================================================
-- Drop FK: examination_sessions.academic_year_id -> academic_years(id)
-- =====================================================
-- Academic Year for examination sessions is now sourced from the MyJKKN API
-- (/api-management/academic/academic-years). The selected MyJKKN academic-year
-- id is stored directly in examination_sessions.academic_year_id, so it no
-- longer references the local academic_years table. Any foreign-key constraint
-- pointing academic_year_id at academic_years must be dropped, otherwise inserts
-- of MyJKKN ids fail with a 23503 (foreign_key_violation).
--
-- This block finds the constraint by catalog lookup (its name may vary), so it
-- is safe to run whether or not the constraint exists.
-- =====================================================

DO $$
DECLARE
	con record;
BEGIN
	FOR con IN
		SELECT c.conname
		FROM pg_constraint c
		JOIN pg_class t          ON t.oid = c.conrelid
		JOIN pg_namespace n      ON n.oid = t.relnamespace
		JOIN pg_attribute a      ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
		WHERE c.contype = 'f'
		  AND n.nspname = 'public'
		  AND t.relname = 'examination_sessions'
		  AND a.attname = 'academic_year_id'
	LOOP
		EXECUTE format(
			'ALTER TABLE public.examination_sessions DROP CONSTRAINT %I',
			con.conname
		);
		RAISE NOTICE 'Dropped FK constraint % on examination_sessions.academic_year_id', con.conname;
	END LOOP;
END $$;
