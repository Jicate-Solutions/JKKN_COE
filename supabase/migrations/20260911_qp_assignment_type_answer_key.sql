-- Examiner assignment type, answer-key willingness and the accepted claim
-- Date: 2026-09-11
--
-- An appointment is now one of three kinds:
--
--   question_paper   set the question paper                (QP fee)
--   answer_key       write the answer key to a paper       (AK fee)
--   both             set the paper AND write its answer key (QP + AK)
--
-- The fees are copied from exam_fee_master (DEBIT / QP_HANDLING / QP_SETTING and
-- ANSWER_KEY, newest effective_from on or before the appointment date) onto the
-- assignment, so a later rate change never restates an order already issued.
--
-- The examiner then CONFIRMS what they are willing to do, in the portal, before
-- authoring: each component can be declined independently. The claim is the sum
-- of the components accepted — never the assignment type alone — and is stored
-- as claim_amount. `remuneration` keeps meaning "as printed on the order"
-- (the potential claim for the type), so an order copy never changes after it
-- has been sent.
--
-- The answer key itself lives on each question of ese_question_papers.questions
-- (JSONB: answer_key, answer_key_image) — no table change is needed for it.
--
-- Idempotent. Run in the Supabase SQL Editor.

ALTER TABLE public.ia_qp_assignments
	ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20) NOT NULL DEFAULT 'question_paper',
	-- Fees as resolved at appointment time (NULL = no rate configured then).
	ADD COLUMN IF NOT EXISTS qp_fee NUMERIC(12, 2),
	ADD COLUMN IF NOT EXISTS ak_fee NUMERIC(12, 2),
	-- The examiner's confirmed willingness. NULL until confirmed in the portal.
	ADD COLUMN IF NOT EXISTS qp_willing BOOLEAN,
	ADD COLUMN IF NOT EXISTS ak_willing BOOLEAN,
	ADD COLUMN IF NOT EXISTS willingness_confirmed_at TIMESTAMPTZ,
	-- What the examiner can actually claim: the accepted components' fees.
	ADD COLUMN IF NOT EXISTS claim_amount NUMERIC(12, 2);

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'ia_qp_assignments_assignment_type_check'
	) THEN
		ALTER TABLE public.ia_qp_assignments
			ADD CONSTRAINT ia_qp_assignments_assignment_type_check
			CHECK (assignment_type IN ('question_paper', 'answer_key', 'both'));
	END IF;
END $$;

-- Appointments made before this change were question-paper-only, and their
-- remuneration is the fee they were issued with. Treat them as accepted so the
-- claim figure they already show does not vanish.
UPDATE public.ia_qp_assignments
SET
	qp_fee = COALESCE(qp_fee, remuneration),
	qp_willing = COALESCE(qp_willing, true),
	ak_willing = COALESCE(ak_willing, false),
	claim_amount = COALESCE(claim_amount, remuneration)
WHERE assignment_type = 'question_paper'
  AND willingness_confirmed_at IS NULL
  AND submitted_at IS NOT NULL;

COMMENT ON COLUMN public.ia_qp_assignments.assignment_type IS
'question_paper | answer_key | both — what the examiner was appointed to do.';
COMMENT ON COLUMN public.ia_qp_assignments.qp_fee IS
'Question Paper Setting fee resolved from exam_fee_master at appointment.';
COMMENT ON COLUMN public.ia_qp_assignments.ak_fee IS
'Answer Key fee resolved from exam_fee_master at appointment.';
COMMENT ON COLUMN public.ia_qp_assignments.qp_willing IS
'Examiner willing to set the question paper. NULL = not yet confirmed.';
COMMENT ON COLUMN public.ia_qp_assignments.ak_willing IS
'Examiner willing to write the answer key. NULL = not yet confirmed.';
COMMENT ON COLUMN public.ia_qp_assignments.claim_amount IS
'Sum of the fees for the components the examiner accepted. This, not remuneration, is what the claim form pays.';

CREATE INDEX IF NOT EXISTS idx_qp_assignments_type
	ON public.ia_qp_assignments(institutions_id, assignment_type);
