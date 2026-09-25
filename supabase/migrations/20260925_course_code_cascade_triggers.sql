-- =====================================================================================
-- Permanent fix: keep every denormalised course_code in step with courses.course_code
-- without disturbing sessions whose results are already published
-- =====================================================================================
-- Scenario (EE25C04 / EE25C10, Aug–Sep 2026): a course code was renamed in the Courses
-- master, but course_mapping.course_code, course_offerings.course_code and
-- exam_registrations.course_code kept the old value. Offerings were later fixed by hand,
-- registrations were not, and screens that resolve titles by code showed the wrong course.
--
-- This migration moves the cascade into the database so it runs inside the same
-- transaction as the rename, whoever performs it (Courses page, /api/v1, SQL editor):
--
--   courses.course_code changes
--     ├─ BEFORE  trg_courses_mirror_codes        display_code / qp_code that still equal
--     │                                          the OLD code (or are empty) follow it
--     └─ AFTER   trg_courses_cascade_code        course_mapping   by course_id   (always)
--                                                course_offerings by course_id   (open only)
--                                                exam_registrations via offerings (open only)
--   course_offerings.course_code changes
--     └─ AFTER   trg_course_offerings_cascade_code   exam_registrations by course_offering_id
--
-- "Open" vs "frozen": an offering is FROZEN, and is never touched by the cascade or the
-- backfill, when its examination session is 'Results Declared' or any of its final_marks
-- rows is Published or locked. Published results, marksheets and old-session registrations
-- therefore keep the code they were examined under. Marks/result tables are never written.
--
-- Rows are matched by UUID only — never by the old code string, which duplicate master
-- rows can share. Every UPDATE is guarded by "IS DISTINCT FROM", so re-running is a no-op
-- and the chain cannot loop. Section 5 backfills the drift that already exists.
--
-- Run in the Supabase SQL Editor, top to bottom. Safe to re-run.
-- =====================================================================================


-- ===== 1. Frozen-offering test (shared by triggers and backfill) =====================
CREATE OR REPLACE FUNCTION public.course_offering_is_frozen(p_offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
	SELECT EXISTS (
		SELECT 1
		  FROM public.course_offerings co
		  JOIN public.examination_sessions es ON es.id = co.examination_session_id
		 WHERE co.id = p_offering_id
		   AND es.session_status = 'Results Declared'
	)
	OR EXISTS (
		SELECT 1
		  FROM public.final_marks fm
		 WHERE fm.course_offering_id = p_offering_id
		   AND (fm.result_status = 'Published' OR fm.is_locked = true)
	);
$$;

COMMENT ON FUNCTION public.course_offering_is_frozen(uuid) IS
	'TRUE when the offering''s session is Results Declared or any of its final_marks is Published/locked. Frozen offerings and their registrations are never rewritten by the course_code cascade.';


-- ===== 2. courses: mirror display_code / qp_code on rename ==========================
CREATE OR REPLACE FUNCTION public.tg_courses_mirror_codes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
	IF NEW.display_code IS NULL OR btrim(NEW.display_code) = '' OR NEW.display_code = OLD.course_code THEN
		NEW.display_code := NEW.course_code;
	END IF;
	IF NEW.qp_code IS NULL OR btrim(NEW.qp_code) = '' OR NEW.qp_code = OLD.course_code THEN
		NEW.qp_code := NEW.course_code;
	END IF;
	RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_courses_mirror_codes() IS
	'On a course_code rename, display_code / qp_code that still mirror the old code (or are empty) follow the new code; deliberately different values are kept.';

DROP TRIGGER IF EXISTS trg_courses_mirror_codes ON public.courses;
CREATE TRIGGER trg_courses_mirror_codes
BEFORE UPDATE OF course_code ON public.courses
FOR EACH ROW
WHEN (OLD.course_code IS DISTINCT FROM NEW.course_code)
EXECUTE FUNCTION public.tg_courses_mirror_codes();


-- ===== 3. courses: propagate the new code to OPEN dependents by course UUID =========
CREATE OR REPLACE FUNCTION public.tg_courses_cascade_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	-- Curriculum-level mapping: not session-bound, always follows the master.
	UPDATE public.course_mapping
	   SET course_code = NEW.course_code,
	       updated_at  = now()
	 WHERE course_id = NEW.id
	   AND course_code IS DISTINCT FROM NEW.course_code;

	-- Open offerings only. Fires trg_course_offerings_cascade_code per offering,
	-- which rewrites that offering's registrations.
	UPDATE public.course_offerings
	   SET course_code = NEW.course_code,
	       updated_at  = now()
	 WHERE course_id = NEW.id
	   AND course_code IS DISTINCT FROM NEW.course_code
	   AND NOT public.course_offering_is_frozen(id);

	-- Catch-all for open offerings that already carried the new code but whose
	-- registrations still hold an old value (e.g. an offering fixed by hand earlier).
	UPDATE public.exam_registrations er
	   SET course_code = NEW.course_code,
	       updated_at  = now()
	  FROM public.course_offerings co
	 WHERE co.id = er.course_offering_id
	   AND co.course_id = NEW.id
	   AND er.course_code IS DISTINCT FROM NEW.course_code
	   AND NOT public.course_offering_is_frozen(co.id);

	-- Question papers (end-semester and internal) and examiner appointments carry the
	-- code too. Papers follow while their offering is open; appointments follow while
	-- their session's results are not declared.
	UPDATE public.ese_question_papers p
	   SET course_code = NEW.course_code,
	       updated_at  = now()
	 WHERE p.course_id = NEW.id
	   AND p.course_code IS DISTINCT FROM NEW.course_code
	   AND (p.course_offering_id IS NULL OR NOT public.course_offering_is_frozen(p.course_offering_id));

	UPDATE public.ia_question_papers p
	   SET course_code = NEW.course_code,
	       updated_at  = now()
	 WHERE p.course_id = NEW.id
	   AND p.course_code IS DISTINCT FROM NEW.course_code
	   AND (p.course_offering_id IS NULL OR NOT public.course_offering_is_frozen(p.course_offering_id));

	UPDATE public.ia_qp_assignments a
	   SET course_code = NEW.course_code,
	       updated_at  = now()
	 WHERE a.course_id = NEW.id
	   AND a.course_code IS DISTINCT FROM NEW.course_code
	   AND NOT EXISTS (SELECT 1 FROM public.examination_sessions es
	                    WHERE es.id = a.examination_session_id AND es.session_status = 'Results Declared');

	RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.tg_courses_cascade_code() IS
	'After courses.course_code changes: rewrite course_mapping (always), and course_offerings, exam_registrations, ese/ia question papers and ia_qp_assignments of OPEN offerings/sessions only (frozen = results declared/published/locked). Matched by UUID, guarded by IS DISTINCT FROM.';

DROP TRIGGER IF EXISTS trg_courses_cascade_code ON public.courses;
CREATE TRIGGER trg_courses_cascade_code
AFTER UPDATE OF course_code ON public.courses
FOR EACH ROW
WHEN (OLD.course_code IS DISTINCT FROM NEW.course_code)
EXECUTE FUNCTION public.tg_courses_cascade_code();


-- ===== 4. course_offerings: a code change on an offering reaches its registrations ===
-- Not frozen-guarded on purpose: the cascade above never touches a frozen offering, so
-- this only fires for open offerings or for a deliberate manual edit of one offering,
-- in which case its registrations must stay consistent with it.
CREATE OR REPLACE FUNCTION public.tg_course_offerings_cascade_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	UPDATE public.exam_registrations
	   SET course_code = NEW.course_code,
	       updated_at  = now()
	 WHERE course_offering_id = NEW.id
	   AND course_code IS DISTINCT FROM NEW.course_code;
	RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.tg_course_offerings_cascade_code() IS
	'After course_offerings.course_code changes (cascade or manual fix): rewrite exam_registrations.course_code for that offering.';

DROP TRIGGER IF EXISTS trg_course_offerings_cascade_code ON public.course_offerings;
CREATE TRIGGER trg_course_offerings_cascade_code
AFTER UPDATE OF course_code ON public.course_offerings
FOR EACH ROW
WHEN (OLD.course_code IS DISTINCT FROM NEW.course_code)
EXECUTE FUNCTION public.tg_course_offerings_cascade_code();


-- ===== 5. One-time backfill of existing drift — OPEN offerings only =================
-- Measured 2026-09-25 before the EE25C04 repair: course_mapping 47, course_offerings 13,
-- exam_registrations 555. Frozen offerings and their registrations are deliberately left
-- as they are; section 6 lists what stays untouched. Orphan mappings whose course_id no
-- longer exists are skipped by the inner join.

UPDATE public.course_mapping cm
   SET course_code = c.course_code,
       updated_at  = now()
  FROM public.courses c
 WHERE c.id = cm.course_id
   AND cm.course_code IS DISTINCT FROM c.course_code;

UPDATE public.course_offerings co
   SET course_code = c.course_code,
       updated_at  = now()
  FROM public.courses c
 WHERE c.id = co.course_id
   AND co.course_code IS DISTINCT FROM c.course_code
   AND NOT public.course_offering_is_frozen(co.id);

UPDATE public.exam_registrations er
   SET course_code = c.course_code,
       updated_at  = now()
  FROM public.course_offerings co
  JOIN public.courses c ON c.id = co.course_id
 WHERE co.id = er.course_offering_id
   AND er.course_code IS DISTINCT FROM c.course_code
   AND NOT public.course_offering_is_frozen(co.id);

-- Question papers / appointments whose code lags their (correct) course_id. Papers linked
-- to the WRONG course_id are corrected by 20260925_repair_qp_course_codes.sql — run that first.
UPDATE public.ese_question_papers p
   SET course_code = c.course_code,
       updated_at  = now()
  FROM public.courses c
 WHERE c.id = p.course_id
   AND p.course_code IS DISTINCT FROM c.course_code
   AND (p.course_offering_id IS NULL OR NOT public.course_offering_is_frozen(p.course_offering_id));

UPDATE public.ia_question_papers p
   SET course_code = c.course_code,
       updated_at  = now()
  FROM public.courses c
 WHERE c.id = p.course_id
   AND p.course_code IS DISTINCT FROM c.course_code
   AND (p.course_offering_id IS NULL OR NOT public.course_offering_is_frozen(p.course_offering_id));

UPDATE public.ia_qp_assignments a
   SET course_code = c.course_code,
       updated_at  = now()
  FROM public.courses c
 WHERE c.id = a.course_id
   AND a.course_code IS DISTINCT FROM c.course_code
   AND NOT EXISTS (SELECT 1 FROM public.examination_sessions es
                    WHERE es.id = a.examination_session_id AND es.session_status = 'Results Declared');


-- ===== 6. Verify ====================================================================
-- open_out_of_sync must be 0 everywhere; frozen_kept_as_is is informational.
SELECT 'course_mapping' AS table_name,
       COUNT(*) AS open_out_of_sync,
       0        AS frozen_kept_as_is
  FROM public.course_mapping cm
  JOIN public.courses c ON c.id = cm.course_id
 WHERE cm.course_code IS DISTINCT FROM c.course_code
UNION ALL
SELECT 'course_offerings',
       COUNT(*) FILTER (WHERE NOT public.course_offering_is_frozen(co.id)),
       COUNT(*) FILTER (WHERE     public.course_offering_is_frozen(co.id))
  FROM public.course_offerings co
  JOIN public.courses c ON c.id = co.course_id
 WHERE co.course_code IS DISTINCT FROM c.course_code
UNION ALL
SELECT 'exam_registrations',
       COUNT(*) FILTER (WHERE NOT public.course_offering_is_frozen(co.id)),
       COUNT(*) FILTER (WHERE     public.course_offering_is_frozen(co.id))
  FROM public.exam_registrations er
  JOIN public.course_offerings co ON co.id = er.course_offering_id
  JOIN public.courses c ON c.id = co.course_id
 WHERE er.course_code IS DISTINCT FROM c.course_code
UNION ALL
SELECT 'ese_question_papers',
       COUNT(*) FILTER (WHERE p.course_offering_id IS NULL OR NOT public.course_offering_is_frozen(p.course_offering_id)),
       COUNT(*) FILTER (WHERE p.course_offering_id IS NOT NULL AND public.course_offering_is_frozen(p.course_offering_id))
  FROM public.ese_question_papers p
  JOIN public.courses c ON c.id = p.course_id
 WHERE p.course_code IS DISTINCT FROM c.course_code
UNION ALL
SELECT 'ia_question_papers',
       COUNT(*) FILTER (WHERE p.course_offering_id IS NULL OR NOT public.course_offering_is_frozen(p.course_offering_id)),
       COUNT(*) FILTER (WHERE p.course_offering_id IS NOT NULL AND public.course_offering_is_frozen(p.course_offering_id))
  FROM public.ia_question_papers p
  JOIN public.courses c ON c.id = p.course_id
 WHERE p.course_code IS DISTINCT FROM c.course_code
UNION ALL
SELECT 'ia_qp_assignments',
       COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.examination_sessions es WHERE es.id = a.examination_session_id AND es.session_status = 'Results Declared')),
       COUNT(*) FILTER (WHERE     EXISTS (SELECT 1 FROM public.examination_sessions es WHERE es.id = a.examination_session_id AND es.session_status = 'Results Declared'))
  FROM public.ia_qp_assignments a
  JOIN public.courses c ON c.id = a.course_id
 WHERE a.course_code IS DISTINCT FROM c.course_code
UNION ALL
SELECT 'triggers_installed (expect 3)',
       COUNT(*),
       0
  FROM pg_trigger
 WHERE tgname IN ('trg_courses_mirror_codes', 'trg_courses_cascade_code', 'trg_course_offerings_cascade_code')
   AND NOT tgisinternal;
