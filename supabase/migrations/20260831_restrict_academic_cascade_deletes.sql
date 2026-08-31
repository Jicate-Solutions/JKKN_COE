-- =====================================================================
-- Restrict destructive cascade deletes across the academic data chain
--   courses -> course_mapping -> course_offerings -> exam_registrations
--
-- WHY:
--   On 2026-08-22 16:21 IST a bulk "sync" delete of UZO Semester-5
--   course_offerings silently destroyed ~96 exam_registrations via
--   ON DELETE CASCADE, and orphaned 13 ia_question_papers via SET NULL.
--   The same thing hit UCC Semester 3 on 2026-08-28 14:43 IST
--   (~1,500+ registrations). Neither left an audit trail.
--
--   Registrations and marks are financial/academic records. No parent
--   delete may remove them implicitly. After this migration such a
--   delete raises SQLSTATE 23503 and aborts, instead of succeeding
--   silently.
--
-- HOW TO RUN: paste into the Supabase SQL Editor (this project applies
--   migrations by hand). STEP 1 is read-only -- run it first and keep
--   the output as the "before" record. STEP 2 applies. STEP 3 verifies.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 1 - AUDIT (read-only). Run this FIRST and save the output.
-- Shows the real delete rule of every FK into and out of the chain.
-- ---------------------------------------------------------------------
-- SELECT
--     con.conname                         AS constraint_name,
--     child.relname                       AS child_table,
--     att.attname                         AS child_column,
--     parent.relname                      AS parent_table,
--     CASE con.confdeltype
--         WHEN 'a' THEN 'NO ACTION'
--         WHEN 'r' THEN 'RESTRICT'
--         WHEN 'c' THEN 'CASCADE'      -- destructive
--         WHEN 'n' THEN 'SET NULL'     -- silently orphans
--         WHEN 'd' THEN 'SET DEFAULT'
--     END                                 AS on_delete
-- FROM pg_constraint con
-- JOIN pg_class  child  ON child.oid  = con.conrelid
-- JOIN pg_class  parent ON parent.oid = con.confrelid
-- JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
-- WHERE con.contype = 'f'
--   AND (parent.relname IN ('courses','course_mapping','course_offerings',
--                           'exam_registrations','examination_sessions','institutions')
--     OR child.relname  IN ('courses','course_mapping','course_offerings',
--                           'exam_registrations'))
-- ORDER BY parent.relname, child.relname, att.attname;


-- ---------------------------------------------------------------------
-- STEP 2 - APPLY. Rewrites each listed FK to ON DELETE RESTRICT.
-- Constraint names are looked up, not assumed, so this is safe to run
-- even where the live schema drifted from the migration files.
-- Pairs that do not exist are reported as SKIP and left alone.
-- ---------------------------------------------------------------------
DO $$
DECLARE
	r          RECORD;
	v_conname  name;
	v_current  "char";
	v_changed  int := 0;
	v_already  int := 0;
	v_skipped  int := 0;
BEGIN
	FOR r IN
		SELECT * FROM (VALUES
			-- ---- children of course_offerings (the incident edge) ----
			('exam_registrations',      'course_offering_id',      'course_offerings'),
			('internal_marks',          'course_offering_id',      'course_offerings'),
			('final_marks',             'course_offering_id',      'course_offerings'),
			('cia_marks',               'course_offering_id',      'course_offerings'),
			('marks_upload_batches',    'course_offering_id',      'course_offerings'),
			('examiner_assignments',    'course_offering_id',      'course_offerings'),
			('ia_question_papers',      'course_offering_id',      'course_offerings'),
			('ia_paper_templates',      'course_offering_id',      'course_offerings'),
			('revaluation_marks',       'course_offering_id',      'course_offerings'),
			('revaluation_final_marks', 'course_offering_id',      'course_offerings'),

			-- ---- course_offerings' own parents (session / institution wipe) ----
			('course_offerings',        'examination_session_id',  'examination_sessions'),
			('course_offerings',        'institutions_id',         'institutions'),
			('course_offerings',        'course_mapping_id',       'course_mapping'),
			('course_offerings',        'course_id',               'courses'),

			-- ---- exam_registrations' own parents ----
			('exam_registrations',      'examination_session_id',  'examination_sessions'),
			('exam_registrations',      'institutions_id',         'institutions'),

			-- ---- course_mapping ----
			('course_mapping',          'course_id',               'courses'),
			('course_mapping',          'institutions_id',         'institutions'),

			-- ---- academic records hanging off courses ----
			('internal_marks',          'course_id',               'courses'),
			('final_marks',             'course_id',               'courses'),
			('cia_marks',               'course_id',               'courses'),
			('marks_entry',             'course_id',               'courses'),
			('exam_attendance',         'course_id',               'courses'),
			('exam_timetables',         'course_id',               'courses'),
			('student_backlogs',        'course_id',               'courses'),
			('ia_question_papers',      'course_id',               'courses')
		) AS t(child_table, child_col, parent_table)
	LOOP
		SELECT con.conname, con.confdeltype
		  INTO v_conname, v_current
		FROM pg_constraint con
		JOIN pg_class  child  ON child.oid  = con.conrelid
		JOIN pg_class  parent ON parent.oid = con.confrelid
		JOIN pg_attribute att  ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
		WHERE con.contype = 'f'
		  AND child.relname  = r.child_table
		  AND parent.relname = r.parent_table
		  AND att.attname    = r.child_col
		  AND array_length(con.conkey, 1) = 1
		LIMIT 1;

		IF v_conname IS NULL THEN
			RAISE NOTICE 'SKIP    %.% -> % (no such FK)', r.child_table, r.child_col, r.parent_table;
			v_skipped := v_skipped + 1;
			CONTINUE;
		END IF;

		IF v_current = 'r' THEN
			RAISE NOTICE 'ALREADY %.% -> % is RESTRICT', r.child_table, r.child_col, r.parent_table;
			v_already := v_already + 1;
			v_conname := NULL;
			CONTINUE;
		END IF;

		EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.child_table, v_conname);
		EXECUTE format(
			'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I ON DELETE RESTRICT',
			r.child_table, v_conname, r.child_col, r.parent_table
		);

		RAISE NOTICE 'CHANGED %.% -> % (was %)',
			r.child_table, r.child_col, r.parent_table,
			CASE v_current WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
			               WHEN 'a' THEN 'NO ACTION' WHEN 'd' THEN 'SET DEFAULT' END;
		v_changed := v_changed + 1;
		v_conname := NULL;
	END LOOP;

	RAISE NOTICE '--- % changed, % already restrict, % skipped ---', v_changed, v_already, v_skipped;
END $$;


-- ---------------------------------------------------------------------
-- STEP 3 - VERIFY. Must return zero rows.
-- ---------------------------------------------------------------------
SELECT
	child.relname  AS child_table,
	att.attname    AS child_column,
	parent.relname AS parent_table,
	CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' END AS still_destructive
FROM pg_constraint con
JOIN pg_class  child  ON child.oid  = con.conrelid
JOIN pg_class  parent ON parent.oid = con.confrelid
JOIN pg_attribute att  ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
WHERE con.contype = 'f'
  AND con.confdeltype IN ('c', 'n')
  AND parent.relname IN ('courses', 'course_mapping', 'course_offerings',
                         'exam_registrations', 'examination_sessions', 'institutions')
ORDER BY parent.relname, child.relname;
