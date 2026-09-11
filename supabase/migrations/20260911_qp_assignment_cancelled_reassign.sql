-- QP examiner assignment: a cancelled appointment must not block the paper
-- Date: 2026-09-11
--
-- ia_qp_assignments carried UNIQUE (paper_id): one appointment per paper, ever.
-- That made a CANCELLED appointment a permanent lock — the CoE had to delete
-- it before appointing anyone else, and deleting it cascaded away its access
-- log, which the audit rules forbid. The rule is now "one LIVE appointment per
-- paper": cancelled rows stay on record with their history, and the paper can
-- be re-assigned.
--
-- Idempotent. Run in the Supabase SQL Editor.

ALTER TABLE public.ia_qp_assignments
	DROP CONSTRAINT IF EXISTS ia_qp_assignments_paper_unique;

CREATE UNIQUE INDEX IF NOT EXISTS ia_qp_assignments_paper_live_unique
	ON public.ia_qp_assignments (paper_id)
	WHERE status <> 'cancelled';

COMMENT ON INDEX public.ia_qp_assignments_paper_live_unique IS
'One live (non-cancelled) appointment per question paper. Cancelled appointments remain as history.';
