-- Fix: version-freeze trigger raised 'record "new" has no field "data"'
-- Date: 2026-09-11
--
-- 20260910_qp_versioning_audit.sql guards ia_qp_paper_versions and
-- ia_qp_claim_versions with ONE trigger function that referenced NEW.questions
-- and NEW.data directly. PL/pgSQL validates record fields when the expression
-- runs, so on the paper table the reference to NEW.data failed even though the
-- TG_TABLE_NAME test in front of it was false — every "reopen paper" ended in a
-- 500 at the point it marks the current version as reopened.
--
-- The comparison now goes through to_jsonb(), which tolerates a missing key,
-- so one function still serves both tables. Behaviour is otherwise unchanged:
-- no deletes, the snapshot column is frozen, and version identity is fixed.
--
-- Idempotent. Run in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.ia_qp_versions_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
	frozen_col TEXT;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION '% rows are never deleted', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
	END IF;

	frozen_col := CASE TG_TABLE_NAME
		WHEN 'ia_qp_paper_versions' THEN 'questions'
		WHEN 'ia_qp_claim_versions' THEN 'data'
		ELSE NULL
	END;

	IF frozen_col IS NOT NULL
	   AND (to_jsonb(NEW) -> frozen_col) IS DISTINCT FROM (to_jsonb(OLD) -> frozen_col) THEN
		RAISE EXCEPTION 'A submitted % version cannot be altered',
			CASE TG_TABLE_NAME WHEN 'ia_qp_paper_versions' THEN 'question paper' ELSE 'claim' END
			USING ERRCODE = 'insufficient_privilege';
	END IF;

	IF NEW.version <> OLD.version
	   OR NEW.assignment_id <> OLD.assignment_id
	   OR NEW.submitted_at <> OLD.submitted_at THEN
		RAISE EXCEPTION 'Version identity is immutable' USING ERRCODE = 'insufficient_privilege';
	END IF;

	RETURN NEW;
END;
$$;

-- The triggers themselves are unchanged; re-creating them is harmless.
DROP TRIGGER IF EXISTS trg_ia_qp_paper_versions_freeze ON public.ia_qp_paper_versions;
CREATE TRIGGER trg_ia_qp_paper_versions_freeze
	BEFORE UPDATE OR DELETE ON public.ia_qp_paper_versions
	FOR EACH ROW EXECUTE FUNCTION public.ia_qp_versions_freeze();

DROP TRIGGER IF EXISTS trg_ia_qp_claim_versions_freeze ON public.ia_qp_claim_versions;
CREATE TRIGGER trg_ia_qp_claim_versions_freeze
	BEFORE UPDATE OR DELETE ON public.ia_qp_claim_versions
	FOR EACH ROW EXECUTE FUNCTION public.ia_qp_versions_freeze();
