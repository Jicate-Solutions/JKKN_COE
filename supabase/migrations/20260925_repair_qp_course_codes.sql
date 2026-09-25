-- =====================================================================================
-- Question papers linked to the WRONG course, and stale codes on papers / appointments
-- =====================================================================================
-- Root cause: the paper generators (internal and end-semester) looked the master course
-- up by the offering's course_code string. While EE25C04 / EE25C10 were swapped (17 Aug –
-- 15 Sep 2026) the ESE paper shell generated for ECE-1 "BASIC ELECTRONICS" on 15 Sep 10:02
-- was linked to ELECTROMAGNETIC THEORY's course_id, and four internal papers at CAS were
-- linked to the duplicate 24UVE01 instead of 24UVED01. The generators now resolve by
-- course_offerings.course_id (lib/api-helpers/course-master-for-offerings.ts).
--
-- Found 2026-09-25 (all NOV-DEC-2026, nothing frozen):
--   ese_question_papers  4 stale codes, 1 wrong course_id (eed4c961 ECE-1 -> Basic Electronics)
--   ia_question_papers  20 stale codes, 4 wrong course_id (24UVE01 -> 24UVED01, handled by
--                          20260925_repair_cas_course_codes.sql; repeated here harmlessly)
--   ia_qp_assignments    1 stale code (5b44c889 EEE, examiner appointed to EE25C04 = EMT)
--
-- Order: run this FIRST, then 20260925_course_code_cascade_triggers.sql (its backfill
-- re-syncs codes and it is safe to re-run). Published results are never touched: rows of
-- frozen offerings (results declared / published / locked) are left as they are.
-- Run in the Supabase SQL Editor. Safe to re-run.
-- =====================================================================================

BEGIN;

-- ===== 1. Papers whose course_id disagrees with their offering's course =============
WITH fixed AS (
	UPDATE public.ese_question_papers p
	   SET course_id     = co.course_id,
	       course_code   = c.course_code,
	       subject_title = c.course_name,
	       updated_at    = now()
	  FROM public.course_offerings co
	  JOIN public.courses c ON c.id = co.course_id
	 WHERE co.id = p.course_offering_id
	   AND p.course_id IS DISTINCT FROM co.course_id
	   AND NOT EXISTS (SELECT 1 FROM public.examination_sessions es
	                    WHERE es.id = co.examination_session_id AND es.session_status = 'Results Declared')
	   AND NOT EXISTS (SELECT 1 FROM public.final_marks fm
	                    WHERE fm.course_offering_id = co.id AND (fm.result_status = 'Published' OR fm.is_locked = true))
	RETURNING p.id, p.course_code
)
INSERT INTO public.transaction_logs (action, resource_type, resource_id, old_values, new_values, status, user_agent, metadata)
SELECT 'update', 'ese_question_paper', '/pre-exam/qp-examiner-assignment', NULL,
       jsonb_build_object('course_code', f.course_code), 'success', 'sql-editor clean-up',
       jsonb_build_object('record_id', f.id, 'reason', 'QP repair 2026-09-25: paper re-linked to its offering''s course')
  FROM fixed f;

WITH fixed AS (
	UPDATE public.ia_question_papers p
	   SET course_id     = co.course_id,
	       course_code   = c.course_code,
	       subject_title = c.course_name,
	       updated_at    = now()
	  FROM public.course_offerings co
	  JOIN public.courses c ON c.id = co.course_id
	 WHERE co.id = p.course_offering_id
	   AND p.course_id IS DISTINCT FROM co.course_id
	   AND NOT EXISTS (SELECT 1 FROM public.examination_sessions es
	                    WHERE es.id = co.examination_session_id AND es.session_status = 'Results Declared')
	   AND NOT EXISTS (SELECT 1 FROM public.final_marks fm
	                    WHERE fm.course_offering_id = co.id AND (fm.result_status = 'Published' OR fm.is_locked = true))
	RETURNING p.id, p.course_code
)
INSERT INTO public.transaction_logs (action, resource_type, resource_id, old_values, new_values, status, user_agent, metadata)
SELECT 'update', 'ia_question_paper', '/pre-exam/question-papers', NULL,
       jsonb_build_object('course_code', f.course_code), 'success', 'sql-editor clean-up',
       jsonb_build_object('record_id', f.id, 'reason', 'QP repair 2026-09-25: paper re-linked to its offering''s course')
  FROM fixed f;

-- ===== 2. Stale codes (course_id correct, code lagging a rename) ====================
UPDATE public.ese_question_papers p
   SET course_code = c.course_code, updated_at = now()
  FROM public.courses c
 WHERE c.id = p.course_id
   AND p.course_code IS DISTINCT FROM c.course_code
   AND (p.course_offering_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.course_offerings co
           JOIN public.examination_sessions es ON es.id = co.examination_session_id
          WHERE co.id = p.course_offering_id AND es.session_status = 'Results Declared'))
   AND NOT EXISTS (SELECT 1 FROM public.final_marks fm
                    WHERE fm.course_offering_id = p.course_offering_id AND (fm.result_status = 'Published' OR fm.is_locked = true));

UPDATE public.ia_question_papers p
   SET course_code = c.course_code, updated_at = now()
  FROM public.courses c
 WHERE c.id = p.course_id
   AND p.course_code IS DISTINCT FROM c.course_code
   AND (p.course_offering_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.course_offerings co
           JOIN public.examination_sessions es ON es.id = co.examination_session_id
          WHERE co.id = p.course_offering_id AND es.session_status = 'Results Declared'))
   AND NOT EXISTS (SELECT 1 FROM public.final_marks fm
                    WHERE fm.course_offering_id = p.course_offering_id AND (fm.result_status = 'Published' OR fm.is_locked = true));

UPDATE public.ia_qp_assignments a
   SET course_code = c.course_code, updated_at = now()
  FROM public.courses c
 WHERE c.id = a.course_id
   AND a.course_code IS DISTINCT FROM c.course_code
   AND NOT EXISTS (SELECT 1 FROM public.examination_sessions es
                    WHERE es.id = a.examination_session_id AND es.session_status = 'Results Declared');

COMMIT;

-- ===== 3. Verify — all three counts should be 0 =====================================
SELECT
	(SELECT COUNT(*) FROM public.ese_question_papers p JOIN public.course_offerings co ON co.id = p.course_offering_id
	  WHERE p.course_id IS DISTINCT FROM co.course_id)                                             AS ese_wrong_course,
	(SELECT COUNT(*) FROM public.ia_question_papers p JOIN public.course_offerings co ON co.id = p.course_offering_id
	  WHERE p.course_id IS DISTINCT FROM co.course_id)                                             AS ia_wrong_course,
	(SELECT COUNT(*) FROM (
		SELECT p.course_code, c.course_code AS master FROM public.ese_question_papers p JOIN public.courses c ON c.id = p.course_id
		UNION ALL
		SELECT p.course_code, c.course_code FROM public.ia_question_papers p JOIN public.courses c ON c.id = p.course_id
		UNION ALL
		SELECT a.course_code, c.course_code FROM public.ia_qp_assignments a JOIN public.courses c ON c.id = a.course_id
	 ) x WHERE x.course_code IS DISTINCT FROM x.master)                                            AS stale_codes;
