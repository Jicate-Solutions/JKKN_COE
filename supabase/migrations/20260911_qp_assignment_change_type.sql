-- QP examiner assignment: change the appointment type after appointment
-- Date: 2026-09-11
--
-- An examiner appointed for the question paper alone may later be asked for
-- the answer key as well (or vice versa). The type change is a CoE action with
-- a reason, audited like a reopen. When the paper has already been submitted
-- the appointment is reopened for the ANSWER KEY ONLY: the examiner enters the
-- key under each question and resubmits, but the questions themselves stay
-- locked — a submitted paper is not reopened for editing by a fee change.
--
--   reopen_scope  'full'        the paper was reopened for revision (questions editable)
--                 'answer_key'  reopened only to add the answer key (questions locked)
--                 NULL          not reopened
--
-- Idempotent. Run in the Supabase SQL Editor.

ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS reopen_scope VARCHAR(20),
	ADD COLUMN IF NOT EXISTS type_changed_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS type_changed_by UUID,
	ADD COLUMN IF NOT EXISTS type_change_reason TEXT;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'ia_qp_assignments_reopen_scope_check'
	) THEN
		ALTER TABLE public.ia_qp_assignments
			ADD CONSTRAINT ia_qp_assignments_reopen_scope_check
			CHECK (reopen_scope IS NULL OR reopen_scope IN ('full', 'answer_key'));
	END IF;
END $$;

COMMENT ON COLUMN public.ia_qp_assignments.reopen_scope IS
'While status = returned: full = questions editable; answer_key = only the answer key may be entered (paper already submitted, type changed to include the key).';

-- ───────────────────────────────────────────────────────────────────────────
-- Uniqueness: one live appointment per examiner per course per session.
-- The same subject may go to several examiners (each gets their own set /
-- paper), but one examiner never holds two live appointments for one course
-- in one session, and never the same paper twice (see the paper index in
-- 20260911_qp_assignment_cancelled_reassign.sql).
-- ───────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ia_qp_assignments_examiner_course_live_unique
	ON public.ia_qp_assignments (institutions_id, examination_session_id, course_code, examiner_id)
	WHERE status <> 'cancelled';
