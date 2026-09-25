-- =====================================================================================
-- CAS course master clean-up (JKKN College of Arts and Science) — 2026-09-25
-- =====================================================================================
-- Verified read-only on the live DB before writing this script:
--   * No course_code drift at CAS (mappings / offerings / registrations all match master).
--   * 15 courses renamed on 24 Sep still carry the PREVIOUS code as display_code. None of
--     them has any final_marks row, and no other course uses the new code as display_code.
--   * 4 course_mapping rows have course_id NULL and a blank programme; nothing references them.
--   * 6 duplicate master rows keep renames failing on the global unique constraints. In five
--     pairs the unused twin has no offerings / marks; its single mapping (where it has one)
--     is either an exact duplicate of the survivor's mapping or is moved to the survivor.
--     In the sixth pair (24UVCS04 / 24UVCSEC02) the LIVE course keeps its row (it has
--     published marks) and takes the code from the empty twin.
--
-- Published results are never touched: no marks / result table is written, and offerings in
-- a 'Results Declared' session or with Published / locked final_marks keep their old code.
--
-- Runs as ONE transaction: any unexpected dependency aborts the whole script, nothing partial.
-- Every step is guarded, so re-running is harmless. Run in the Supabase SQL Editor.
-- =====================================================================================

BEGIN;

-- ===== 1. display_code follows course_code (15 rows) ===============================
WITH before AS (
	SELECT c.id, c.course_code, c.display_code AS old_display
	  FROM public.courses c
	 WHERE c.institution_code = 'CAS'
	   AND c.course_code IN ('24UCYDE01','24UCYDE02','24UCYDE03','24UCYDE04','24UCYDE05','24UCYDE06',
	                         '24UCYDE07','24UCYDE08','24UCYDE09','24UCYDE10','24UCYDE11','24UCYDE12',
	                         '24UCYIN01','24UZOPCS1','24UCSPR1')
	   AND c.display_code IS DISTINCT FROM c.course_code
	   AND NOT EXISTS (SELECT 1 FROM public.courses o WHERE o.id <> c.id AND o.display_code = c.course_code)
	   AND NOT EXISTS (SELECT 1 FROM public.final_marks fm WHERE fm.course_id = c.id
	                     AND (fm.result_status = 'Published' OR fm.is_locked = true))
), upd AS (
	UPDATE public.courses c
	   SET display_code = c.course_code,
	       updated_at   = now()
	  FROM before b
	 WHERE c.id = b.id
	RETURNING c.id
)
INSERT INTO public.transaction_logs (action, resource_type, resource_id, old_values, new_values, status, user_agent, metadata)
SELECT 'update', 'course', '/master/courses',
       jsonb_build_object('course_code', b.course_code, 'display_code', b.old_display),
       jsonb_build_object('course_code', b.course_code, 'display_code', b.course_code),
       'success', 'sql-editor clean-up',
       jsonb_build_object('record_id', b.id, 'reason', 'CAS clean-up 2026-09-25: display_code lagged the 24 Sep rename')
  FROM before b;

-- ===== 2. Orphan course_mapping rows (course_id NULL, blank programme, unreferenced) ==
WITH gone AS (
	DELETE FROM public.course_mapping cm
	 WHERE cm.id IN ('6753b5c5-57ba-4571-9475-43195ce1aea7',
	                 '00af3bdb-f9c8-466c-9d05-4b6da3dea0f6',
	                 '2b659674-5386-4f7d-aa46-88d82b81fc18',
	                 '9e08ec6b-5392-41a4-8f23-cbf77b2c40d9')
	   AND cm.course_id IS NULL
	   AND NOT EXISTS (SELECT 1 FROM public.course_offerings co WHERE co.course_mapping_id = cm.id)
	RETURNING cm.*
)
INSERT INTO public.transaction_logs (action, resource_type, resource_id, old_values, new_values, status, user_agent, metadata)
SELECT 'delete', 'course_mapping', '/master/courses', to_jsonb(g), NULL, 'success', 'sql-editor clean-up',
       jsonb_build_object('record_id', g.id, 'reason', 'CAS clean-up 2026-09-25: orphan mapping without course')
  FROM gone g;

-- ===== 3. Duplicate master rows ======================================================

-- 3a. 25UZOC07's mapping (UZO-5, inactive) duplicates 24UZOC07's active UZO-5 mapping
-- 3b. 24UVE01's mapping (UCS-5) duplicates 24UVED01's UCS-5 mapping
WITH gone AS (
	DELETE FROM public.course_mapping cm
	 WHERE (   (cm.id = '86c8c180-63dc-4d79-85a4-71c6577ad2fc' AND cm.course_code = '25UZOC07' AND cm.program_code = 'UZO' AND cm.semester_code = 'UZO-5')
	        OR (cm.id = 'b7c12301-2c43-467b-8393-1cc957cd0241' AND cm.course_code = '24UVE01'  AND cm.program_code = 'UCS' AND cm.semester_code = 'UCS-5'))
	   AND NOT EXISTS (SELECT 1 FROM public.course_offerings co WHERE co.course_mapping_id = cm.id)
	RETURNING cm.*
)
INSERT INTO public.transaction_logs (action, resource_type, resource_id, old_values, new_values, status, user_agent, metadata)
SELECT 'delete', 'course_mapping', '/master/courses', to_jsonb(g), NULL, 'success', 'sql-editor clean-up',
       jsonb_build_object('record_id', g.id, 'reason', 'CAS clean-up 2026-09-25: duplicate mapping of the surviving course')
  FROM gone g;

-- 3c. 24UCASE07 -> 24UCSS07: the UCA-6 mapping moves to the surviving course (same title, syllabus there)
WITH tgt AS (
	SELECT id FROM public.courses WHERE institution_code = 'CAS' AND course_code = '24UCSS07'
), moved AS (
	UPDATE public.course_mapping cm
	   SET course_id   = tgt.id,
	       course_code = '24UCSS07',
	       updated_at  = now()
	  FROM tgt
	 WHERE cm.id = 'f5629a62-976d-46ae-bce1-eed20a1cc710'
	   AND cm.course_code = '24UCASE07'
	   AND cm.program_code = 'UCA' AND cm.semester_code = 'UCA-6'
	   AND NOT EXISTS (SELECT 1 FROM public.course_mapping x
	                    WHERE x.course_id = tgt.id AND x.program_code = 'UCA' AND x.semester_code = 'UCA-6'
	                      AND x.batch_code = cm.batch_code AND x.regulation_code = cm.regulation_code AND x.is_active = true)
	RETURNING cm.id, tgt.id AS new_course_id
)
INSERT INTO public.transaction_logs (action, resource_type, resource_id, old_values, new_values, status, user_agent, metadata)
SELECT 'update', 'course_mapping', '/master/courses',
       jsonb_build_object('course_code', '24UCASE07'),
       jsonb_build_object('course_code', '24UCSS07', 'course_id', m.new_course_id),
       'success', 'sql-editor clean-up',
       jsonb_build_object('record_id', m.id, 'reason', 'CAS clean-up 2026-09-25: UCA-6 mapping merged into 24UCSS07')
  FROM moved m;

-- 3c-bis. Four internal question papers (all draft, NOV-DEC-2026) were generated against the
--         twin 24UVE01 because the generator looked the course up by code. Move them to the
--         surviving course 24UVED01 before the twin is removed (ia_question_papers.course_id is
--         RESTRICT). Their offerings already point at 24UVED01.
WITH tgt AS (
	SELECT id, course_code, course_name FROM public.courses WHERE institution_code = 'CAS' AND course_code = '24UVED01'
), src AS (
	SELECT id FROM public.courses WHERE institution_code = 'CAS' AND course_code = '24UVE01'
), moved AS (
	UPDATE public.ia_question_papers p
	   SET course_id     = tgt.id,
	       course_code   = tgt.course_code,
	       subject_title = tgt.course_name,
	       updated_at    = now()
	  FROM tgt, src
	 WHERE p.course_id = src.id
	RETURNING p.id
)
INSERT INTO public.transaction_logs (action, resource_type, resource_id, old_values, new_values, status, user_agent, metadata)
SELECT 'update', 'ia_question_paper', '/pre-exam/question-papers',
       jsonb_build_object('course_code', '24UVE01'), jsonb_build_object('course_code', '24UVED01'),
       'success', 'sql-editor clean-up',
       jsonb_build_object('record_id', m.id, 'reason', 'CAS clean-up 2026-09-25: paper generated against duplicate 24UVE01, moved to 24UVED01')
  FROM moved m;

-- 3d. Remove the unused twins (guarded: no mapping / offering / marks / paper may remain)
WITH gone AS (
	DELETE FROM public.courses c
	 WHERE c.institution_code = 'CAS'
	   AND c.course_code IN ('24UMASP03', '25UZOC07', '24UVE01', '24UCASE07', '24UUCSDSE11', '24UVCSEC02')
	   AND NOT EXISTS (SELECT 1 FROM public.course_mapping      x WHERE x.course_id = c.id)
	   AND NOT EXISTS (SELECT 1 FROM public.course_offerings    x WHERE x.course_id = c.id)
	   AND NOT EXISTS (SELECT 1 FROM public.final_marks         x WHERE x.course_id = c.id)
	   AND NOT EXISTS (SELECT 1 FROM public.internal_marks      x WHERE x.course_id = c.id)
	   AND NOT EXISTS (SELECT 1 FROM public.cia_marks           x WHERE x.course_id = c.id)
	   AND NOT EXISTS (SELECT 1 FROM public.marks_entry         x WHERE x.course_id = c.id)
	   AND NOT EXISTS (SELECT 1 FROM public.student_backlogs    x WHERE x.course_id = c.id)
	   AND NOT EXISTS (SELECT 1 FROM public.ia_question_papers  x WHERE x.course_id = c.id)
	   AND NOT EXISTS (SELECT 1 FROM public.ese_question_papers x WHERE x.course_id = c.id)
	   AND NOT EXISTS (SELECT 1 FROM public.ia_qp_assignments   x WHERE x.course_id = c.id)
	RETURNING c.*
)
INSERT INTO public.transaction_logs (action, resource_type, resource_id, old_values, new_values, status, user_agent, metadata)
SELECT 'delete', 'course', '/master/courses', to_jsonb(g), NULL, 'success', 'sql-editor clean-up',
       jsonb_build_object('record_id', g.id, 'reason', 'CAS clean-up 2026-09-25: unused duplicate master row')
  FROM gone g;

-- 3e. 24UVCS04 (live, published marks in two earlier sessions) takes the freed code 24UVCSEC02.
--     display_code / qp_code follow only if they still mirror 24UVCS04. Then the cascade,
--     written out here so it works whether or not the trigger migration is installed:
--     mapping always; offerings + their registrations only when the offering is OPEN.
WITH before AS (
	SELECT c.id, c.display_code, c.qp_code
	  FROM public.courses c
	 WHERE c.institution_code = 'CAS' AND c.course_code = '24UVCS04'
	   AND NOT EXISTS (SELECT 1 FROM public.courses o WHERE o.course_code = '24UVCSEC02' OR o.display_code = '24UVCSEC02')
), upd AS (
	UPDATE public.courses c
	   SET course_code  = '24UVCSEC02',
	       display_code = CASE WHEN c.display_code IS NULL OR c.display_code = '24UVCS04' THEN '24UVCSEC02' ELSE c.display_code END,
	       qp_code      = CASE WHEN c.qp_code      IS NULL OR c.qp_code      = '24UVCS04' THEN '24UVCSEC02' ELSE c.qp_code      END,
	       updated_at   = now()
	  FROM before b
	 WHERE c.id = b.id
	RETURNING c.id
)
INSERT INTO public.transaction_logs (action, resource_type, resource_id, old_values, new_values, status, user_agent, metadata)
SELECT 'update', 'course', '/master/courses',
       jsonb_build_object('course_code', '24UVCS04', 'display_code', b.display_code, 'qp_code', b.qp_code),
       jsonb_build_object('course_code', '24UVCSEC02'),
       'success', 'sql-editor clean-up',
       jsonb_build_object('record_id', b.id, 'reason', 'CAS clean-up 2026-09-25: live course takes code freed from empty twin; frozen offerings keep 24UVCS04')
  FROM before b;

UPDATE public.course_mapping cm
   SET course_code = '24UVCSEC02', updated_at = now()
  FROM public.courses c
 WHERE c.id = cm.course_id AND c.institution_code = 'CAS' AND c.course_code = '24UVCSEC02'
   AND cm.course_code IS DISTINCT FROM '24UVCSEC02';

UPDATE public.course_offerings co
   SET course_code = '24UVCSEC02', updated_at = now()
  FROM public.courses c
 WHERE c.id = co.course_id AND c.institution_code = 'CAS' AND c.course_code = '24UVCSEC02'
   AND co.course_code IS DISTINCT FROM '24UVCSEC02'
   AND NOT EXISTS (SELECT 1 FROM public.examination_sessions es
                    WHERE es.id = co.examination_session_id AND es.session_status = 'Results Declared')
   AND NOT EXISTS (SELECT 1 FROM public.final_marks fm
                    WHERE fm.course_offering_id = co.id AND (fm.result_status = 'Published' OR fm.is_locked = true));

UPDATE public.exam_registrations er
   SET course_code = '24UVCSEC02', updated_at = now()
  FROM public.course_offerings co
  JOIN public.courses c ON c.id = co.course_id
 WHERE co.id = er.course_offering_id
   AND c.institution_code = 'CAS' AND c.course_code = '24UVCSEC02'
   AND co.course_code = '24UVCSEC02'                -- only offerings that followed (open ones)
   AND er.course_code IS DISTINCT FROM '24UVCSEC02';

COMMIT;

-- ===== 4. Verify (single result set) ================================================
-- Expected: lagging_display 0 | orphan_mappings 0 | twins_left 0 | old_code_left 0 |
--           survivor_open_offerings 1 (NOV-DEC-2026 = 24UVCSEC02) | survivor_frozen_offerings 2 (keep 24UVCS04)
SELECT
	(SELECT COUNT(*) FROM public.courses c
	  WHERE c.institution_code = 'CAS'
	    AND c.course_code IN ('24UCYDE01','24UCYDE02','24UCYDE03','24UCYDE04','24UCYDE05','24UCYDE06','24UCYDE07','24UCYDE08','24UCYDE09','24UCYDE10','24UCYDE11','24UCYDE12','24UCYIN01','24UZOPCS1','24UCSPR1')
	    AND c.display_code IS DISTINCT FROM c.course_code)                                          AS lagging_display,
	(SELECT COUNT(*) FROM public.course_mapping WHERE institution_code = 'CAS' AND course_id IS NULL) AS orphan_mappings,
	(SELECT COUNT(*) FROM public.courses WHERE institution_code = 'CAS'
	    AND course_code IN ('24UMASP03','25UZOC07','24UVE01','24UCASE07','24UUCSDSE11'))          AS twins_left,
	(SELECT COUNT(*) FROM public.courses WHERE institution_code = 'CAS' AND course_code = '24UVCS04') AS old_code_left,
	(SELECT COUNT(*) FROM public.course_offerings co JOIN public.courses c ON c.id = co.course_id
	  WHERE c.institution_code = 'CAS' AND c.course_code = '24UVCSEC02' AND co.course_code = '24UVCSEC02') AS survivor_open_offerings,
	(SELECT COUNT(*) FROM public.course_offerings co JOIN public.courses c ON c.id = co.course_id
	  WHERE c.institution_code = 'CAS' AND c.course_code = '24UVCSEC02' AND co.course_code = '24UVCS04')   AS survivor_frozen_offerings,
	(SELECT string_agg(cm.program_code || '/' || cm.semester_code || '=' || cm.course_code, ', ')
	   FROM public.course_mapping cm JOIN public.courses c ON c.id = cm.course_id
	  WHERE c.institution_code = 'CAS' AND c.course_code = '24UCSS07')                               AS office_automation_mappings;
