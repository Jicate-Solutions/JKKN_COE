-- QP examiner assignment: one reference per issued order copy
-- Date: 2026-09-11
--
-- An examiner with several papers in a session receives ONE order copy. That
-- letter carries ONE reference (e.g. JKKNCET/COE/QPS/007), allocated from the
-- same running sequence as single orders and stored on every appointment it
-- covers, so the letter can be found by the number printed on it. Each
-- appointment keeps its own order_ref_no as well.
--
-- Idempotent. Run in the Supabase SQL Editor.

ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS combined_order_ref_no VARCHAR(120),
	ADD COLUMN IF NOT EXISTS combined_order_issued_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_qp_assign_combined_ref
	ON public.ia_qp_assignments (institutions_id, combined_order_ref_no)
	WHERE combined_order_ref_no IS NOT NULL;

COMMENT ON COLUMN public.ia_qp_assignments.combined_order_ref_no IS
'Reference of the combined order copy (one letter for all of an examiner''s papers in the session). Shared by every appointment that letter covers.';
