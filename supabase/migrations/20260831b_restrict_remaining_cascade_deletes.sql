-- =====================================================================
-- Restrict ALL remaining destructive FK edges on the academic core.
--
-- Follow-up to 20260831_restrict_academic_cascade_deletes.sql, whose
-- hand-written list of 26 edges turned out to cover only a fraction of
-- the real graph. Its STEP 3 verification returned ~168 surviving
-- CASCADE / SET NULL edges:
--
--     parent                  still-destructive children
--     ----------------------  --------------------------
--     course_offerings          5   (incl. student_backlogs, student_grades)
--     courses                  14
--     exam_registrations       13   (marks, attendance, grades, revaluation)
--     examination_sessions     33
--     institutions           ~103   (the entire tenant, incl. courses,
--                                    programs, departments, sessions, library)
--
-- Two corrections this encodes:
--   1. student_backlogs.course_offering_id is CASCADE in the live DB,
--      even though 20251203_create_student_backlogs_table.sql:103
--      declares RESTRICT. Migration files do not describe this database.
--   2. exam_registrations is NOT a leaf. Thirteen tables cascade off it,
--      so before the first migration an offering delete destroyed the
--      learner's marks, attendance and grades two levels down.
--
-- This pass is driven by pg_constraint itself rather than a list, so it
-- cannot miss an edge or be fooled by schema drift. Every FK whose
-- parent is one of the protected tables becomes ON DELETE RESTRICT.
--
-- HOW TO RUN: Supabase SQL Editor. STEP A snapshots the current rules
-- (keep the output). STEP B applies the core tables. STEP C applies
-- institutions -- read its note first, you may want to skip it. STEP D
-- verifies and must return zero rows.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP A - SNAPSHOT (read-only). Keep this output as the rollback record:
-- it is the only surviving description of the pre-change delete rules.
-- ---------------------------------------------------------------------
SELECT
	con.conname     AS constraint_name,
	child.relname   AS child_table,
	att.attname     AS child_column,
	parent.relname  AS parent_table,
	CASE con.confdeltype
		WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
		WHEN 'c' THEN 'CASCADE'   WHEN 'n' THEN 'SET NULL'
		WHEN 'd' THEN 'SET DEFAULT'
	END             AS on_delete_before
FROM pg_constraint con
JOIN pg_class     child  ON child.oid  = con.conrelid
JOIN pg_class     parent ON parent.oid = con.confrelid
JOIN pg_attribute att    ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
WHERE con.contype = 'f'
  AND con.confdeltype IN ('c', 'n')
  AND parent.relname IN ('courses', 'course_mapping', 'course_offerings',
                         'exam_registrations', 'examination_sessions', 'institutions')
ORDER BY parent.relname, child.relname, att.attname;


-- ---------------------------------------------------------------------
-- Shared worker: rewrite every destructive FK for the given parents.
--
-- Notes on correctness:
--   * The target set is snapshotted into a jsonb array BEFORE any DDL,
--     so mutating pg_constraint cannot disturb the iteration.
--   * The referenced column is read from confkey rather than assumed to
--     be the primary key, so an FK pointing at a UNIQUE column is
--     rebuilt against that same column.
--   * ON UPDATE is preserved; only ON DELETE changes.
--   * Composite FKs (conkey length > 1) are reported, not touched.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.restrict_destructive_fks(p_parents text[])
RETURNS TABLE (action text, detail text)
LANGUAGE plpgsql AS $fn$
DECLARE
	todo    jsonb;
	item    jsonb;
	upd     text;
BEGIN
	SELECT jsonb_agg(jsonb_build_object(
		'con',    con.conname,
		'ct',     child.relname,
		'cc',     att.attname,
		'pt',     parent.relname,
		'pc',     patt.attname,
		'rule',   con.confdeltype::text,
		'upd',    con.confupdtype::text,
		'ncols',  array_length(con.conkey, 1)
	))
	INTO todo
	FROM pg_constraint con
	JOIN pg_class     child  ON child.oid  = con.conrelid
	JOIN pg_class     parent ON parent.oid = con.confrelid
	JOIN pg_namespace ns     ON ns.oid     = child.relnamespace
	JOIN pg_attribute att    ON att.attrelid  = con.conrelid  AND att.attnum  = con.conkey[1]
	JOIN pg_attribute patt   ON patt.attrelid = con.confrelid AND patt.attnum = con.confkey[1]
	WHERE con.contype = 'f'
	  AND con.confdeltype IN ('c', 'n')
	  AND ns.nspname = 'public'
	  AND parent.relname = ANY (p_parents);

	FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(todo, '[]'::jsonb))
	LOOP
		IF (item->>'ncols')::int > 1 THEN
			action := 'SKIP-COMPOSITE';
			detail := format('%s.%s -> %s', item->>'ct', item->>'cc', item->>'pt');
			RETURN NEXT;
			CONTINUE;
		END IF;

		upd := CASE item->>'upd'
			WHEN 'c' THEN ' ON UPDATE CASCADE'
			WHEN 'n' THEN ' ON UPDATE SET NULL'
			WHEN 'r' THEN ' ON UPDATE RESTRICT'
			WHEN 'd' THEN ' ON UPDATE SET DEFAULT'
			ELSE ''
		END;

		EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
			item->>'ct', item->>'con');
		EXECUTE format(
			'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE RESTRICT%s',
			item->>'ct', item->>'con', item->>'cc', item->>'pt', item->>'pc', upd);

		action := 'RESTRICTED';
		detail := format('%s.%s -> %s (was %s)', item->>'ct', item->>'cc', item->>'pt',
			CASE item->>'rule' WHEN 'c' THEN 'CASCADE' ELSE 'SET NULL' END);
		RETURN NEXT;
	END LOOP;
END $fn$;


-- ---------------------------------------------------------------------
-- STEP B - the academic core. Run this.
-- ---------------------------------------------------------------------
SELECT * FROM pg_temp.restrict_destructive_fks(ARRAY[
	'course_offerings',
	'exam_registrations',
	'courses',
	'course_mapping',
	'examination_sessions'
]);


-- ---------------------------------------------------------------------
-- STEP C - institutions (~103 edges). READ BEFORE RUNNING.
--
-- Today, deleting one of the 7 institution rows silently destroys that
-- tenant entirely: courses, programs, departments, examination_sessions,
-- every mark, and the whole library and BoS module. There is no
-- confirmation anywhere in the stack that would stop it.
--
-- Restricting these means an institution row cannot be deleted while any
-- data hangs off it. Removing a tenant becomes a deliberate, scripted
-- operation instead of one DELETE. That is almost certainly what you
-- want with 7 tenants and no soft-delete.
--
-- To skip this tier, comment out the statement below -- STEP D will then
-- still report the institutions edges as outstanding, which is expected.
-- ---------------------------------------------------------------------
SELECT * FROM pg_temp.restrict_destructive_fks(ARRAY[
	'institutions'
]);


-- ---------------------------------------------------------------------
-- STEP D - VERIFY. Must return zero rows (or institutions-only if you
-- skipped STEP C).
-- ---------------------------------------------------------------------
SELECT
	parent.relname AS parent_table,
	child.relname  AS child_table,
	att.attname    AS child_column,
	CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' END AS still_destructive
FROM pg_constraint con
JOIN pg_class     child  ON child.oid  = con.conrelid
JOIN pg_class     parent ON parent.oid = con.confrelid
JOIN pg_attribute att    ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
WHERE con.contype = 'f'
  AND con.confdeltype IN ('c', 'n')
  AND parent.relname IN ('courses', 'course_mapping', 'course_offerings',
                         'exam_registrations', 'examination_sessions', 'institutions')
ORDER BY parent.relname, child.relname;
