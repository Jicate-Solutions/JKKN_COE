-- ============================================================================
-- Examiner submission wizard + claim workflow
-- ============================================================================
--
-- PART 1 — SUBMISSION WIZARD
--
-- Submitting a question paper is three steps, not one. The examiner hands over
-- the content, then attests to a check list, then signs; only when all three are
-- done is the submission complete:
--
--     authoring ──Submit──► checklist ──ticked──► signature ──sign──► completed
--
-- The content is handed over at the FIRST step: status becomes 'submitted' and
-- the questions stop being editable there, so an examiner who abandons the
-- wizard has still delivered a paper the CoE can use. What the later steps add
-- is the attestation, not the paper.
--
-- The check list and the signature stay reachable AFTER valid_to. Only question
-- content is time-limited; refusing a signature because the window closed would
-- strand a delivered paper and create support work for a step that exposes
-- nothing.
--
-- PART 2 — CLAIM WORKFLOW
--
-- Until now an examiner's claim was a single timestamp (claim_submitted_at):
-- either claimed or not. The claim actually travels through four states before
-- the examiner is paid, and the examiner is entitled to see where theirs is:
--
--     pending  → submitted → approved → paid
--     (bank      (with CoE)   (CoE ok)   (money sent)
--      details
--      needed)
--
-- 'pending' is the resting state of every row, including rows whose question
-- paper has not been submitted yet. A claim only becomes ACTIONABLE once the
-- paper is in, and that is derived from ia_qp_assignments.status rather than
-- stored, so the two can never contradict each other.
--
-- BANK DETAILS ARE SNAPSHOT, NOT REFERENCED. examiners.bank_* is the examiner's
-- current account and they may change it at any time; a submitted claim must
-- keep the account it was actually submitted with, for the same reason
-- `remuneration` is copied at assign time rather than read live. Editing the
-- profile afterwards must never silently restate a claim the CoE has already
-- approved or paid.
--
-- Safe to re-run.

-- ── Submission wizard ───────────────────────────────────────────────────────

ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS submission_stage VARCHAR(20) NOT NULL DEFAULT 'authoring';

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'ia_qp_assignments_submission_stage_check'
	) THEN
		ALTER TABLE public.ia_qp_assignments
			ADD CONSTRAINT ia_qp_assignments_submission_stage_check
			CHECK (submission_stage IN ('authoring', 'checklist', 'signature', 'completed'));
	END IF;
END $$;

ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS checklist_completed_at TIMESTAMPTZ,
	-- Object path in the PRIVATE examiner-signatures bucket. Per assignment, not
	-- per examiner: examiners.signature_path is the specimen on file, this is the
	-- signature actually given for THIS submission.
	ADD COLUMN IF NOT EXISTS submission_signature_path TEXT,
	ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS final_submitted_at TIMESTAMPTZ;

-- Papers submitted before the wizard existed are complete as far as the examiner
-- is concerned; there is no attestation to collect retrospectively and stranding
-- them in 'checklist' would demand a signature for work already accepted.
UPDATE public.ia_qp_assignments
SET submission_stage = 'completed',
    final_submitted_at = COALESCE(final_submitted_at, submitted_at)
WHERE submitted_at IS NOT NULL
	AND submission_stage = 'authoring';

-- ── Claim state ─────────────────────────────────────────────────────────────

ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS claim_status VARCHAR(20) NOT NULL DEFAULT 'pending';

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'ia_qp_assignments_claim_status_check'
	) THEN
		ALTER TABLE public.ia_qp_assignments
			ADD CONSTRAINT ia_qp_assignments_claim_status_check
			CHECK (claim_status IN ('pending', 'submitted', 'approved', 'paid'));
	END IF;
END $$;

-- ── Bank details as submitted (snapshot of examiners.bank_* at claim time) ──

ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS claim_account_holder VARCHAR(200),
	ADD COLUMN IF NOT EXISTS claim_bank_name      VARCHAR(200),
	ADD COLUMN IF NOT EXISTS claim_account_number VARCHAR(60),
	ADD COLUMN IF NOT EXISTS claim_branch         VARCHAR(200),
	ADD COLUMN IF NOT EXISTS claim_ifsc           VARCHAR(20);

-- ── CoE verification ────────────────────────────────────────────────────────

ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS claim_approved_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS claim_approved_by UUID,
	ADD COLUMN IF NOT EXISTS claim_remarks     TEXT;

-- ── Payment ─────────────────────────────────────────────────────────────────

ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS payment_reference    VARCHAR(120),
	ADD COLUMN IF NOT EXISTS payment_amount       NUMERIC(10, 2);

-- ── Back-fill ───────────────────────────────────────────────────────────────
-- Rows that already carry claim_submitted_at were claimed under the old
-- single-timestamp model. They are 'submitted' — never 'approved', because no
-- CoE user has verified them under a workflow that did not exist yet.

UPDATE public.ia_qp_assignments
SET claim_status = 'submitted'
WHERE claim_submitted_at IS NOT NULL
	AND claim_status = 'pending';

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- The examiner's Claim Form screen filters their own rows by state, and the CoE
-- review queue will filter every institution's rows by state.

CREATE INDEX IF NOT EXISTS idx_qp_assign_claim_status
	ON public.ia_qp_assignments(claim_status);
CREATE INDEX IF NOT EXISTS idx_qp_assign_examiner_claim
	ON public.ia_qp_assignments(examiner_id, claim_status);

-- ── Documentation ───────────────────────────────────────────────────────────

COMMENT ON COLUMN public.ia_qp_assignments.submission_stage IS
'authoring → checklist → signature → completed. Content is handed over (status=submitted) at the FIRST step; the rest is attestation. The check list and signature stay reachable after valid_to.';
COMMENT ON COLUMN public.ia_qp_assignments.submission_signature_path IS
'Signature given for THIS submission, in the private examiner-signatures bucket. Distinct from examiners.signature_path, which is the specimen on file.';
COMMENT ON COLUMN public.ia_qp_assignments.claim_status IS
'pending → submitted → approved → paid. A claim is only ACTIONABLE by the examiner once the question paper is submitted; that is derived from status, not stored here.';
COMMENT ON COLUMN public.ia_qp_assignments.claim_account_holder IS
'Bank details AS SUBMITTED. Snapshot of examiners.bank_* taken when the claim was submitted, so a later profile edit cannot restate a claim the CoE has approved or paid.';
COMMENT ON COLUMN public.ia_qp_assignments.claim_approved_by IS
'The CoE user who verified the claim. No FK: portal and panel users live in different tables.';
COMMENT ON COLUMN public.ia_qp_assignments.payment_amount IS
'What was actually paid. May differ from remuneration (the rate quoted on the order) if the CoE adjusts it during verification.';
