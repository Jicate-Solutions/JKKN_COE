-- =====================================================
-- Final Exam Registration Approval - manual late fine
-- Date: 2026-09-19
--
-- Policy change:
--   * A late exam APPLICATION carries no fine any more (the app no longer
--     stamps exam_registrations.late_fine when a learner applies).
--   * The fine is for late PAYMENT. The CoE office keys it in per learner on
--       /exam-management/exam-registration-final-approval
--     (default 0) and it is collected as part of the final amount.
--
-- approve_final_exam_registration() gains p_late_fines so the entered fine is
-- written in the SAME transaction as the approval:
--   - exam_registration_fee_details.late_fine / final_amount already come in
--     through p_fee_details;
--   - exam_registrations.late_fine of the approved papers is cleared, then the
--     entered fine is stamped on the learner's anchor paper row, so paper-level
--     reports agree with the learner-level record.
--
-- Payment is collected at this step too, so the approval also records HOW it
-- was paid:
--   - payment_mode ('Cash' | 'Online') - new column on exam_registrations and
--     exam_registration_fee_details;
--   - payment_transaction_id (required by the app when the mode is Online);
--   - payment_date, approved_by, approved_date on every approved paper row.
--
-- Requires 20260824_add_application_fees_to_exam_registrations.sql (late_fine
-- column) and 20260912_exam_registration_final_approval.sql.
-- Idempotent: re-running this migration has no side effects.
-- =====================================================

-- -----------------------------------------------------
-- 1. Mode of payment
-- -----------------------------------------------------
ALTER TABLE public.exam_registrations
	ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20);

ALTER TABLE public.exam_registration_fee_details
	ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20),
	ADD COLUMN IF NOT EXISTS payment_transaction_id VARCHAR(255);

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_exam_registrations_payment_mode') THEN
		ALTER TABLE public.exam_registrations
			ADD CONSTRAINT chk_exam_registrations_payment_mode
			CHECK (payment_mode IS NULL OR payment_mode IN ('Cash', 'Online'));
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_exam_registration_fee_details_payment_mode') THEN
		ALTER TABLE public.exam_registration_fee_details
			ADD CONSTRAINT chk_exam_registration_fee_details_payment_mode
			CHECK (payment_mode IS NULL OR payment_mode IN ('Cash', 'Online'));
	END IF;
END $$;

COMMENT ON COLUMN public.exam_registrations.payment_mode IS
	'How the exam fee was collected at final approval: Cash or Online (Online carries payment_transaction_id).';

-- -----------------------------------------------------
-- 2. Atomic approval
-- -----------------------------------------------------
-- Older signatures must go: leaving one next to the new function makes a call
-- ambiguous for PostgREST (PGRST203).
DROP FUNCTION IF EXISTS public.approve_final_exam_registration(UUID[], JSONB, UUID);
DROP FUNCTION IF EXISTS public.approve_final_exam_registration(UUID[], JSONB, UUID, JSONB);

-- p_late_fines : JSON array, one object per learner
--                  { "registration_id": <anchor exam_registrations.id>, "late_fine": <amount> }
--                NULL = leave exam_registrations.late_fine untouched
-- p_payment    : { "payment_mode": "Cash" | "Online", "payment_transaction_id": <text or null> }
--                applies to every learner approved in this call
CREATE OR REPLACE FUNCTION public.approve_final_exam_registration(
	p_registration_ids UUID[],
	p_fee_details      JSONB,
	p_approved_by      UUID DEFAULT NULL,
	p_late_fines       JSONB DEFAULT NULL,
	p_payment          JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_expected  INTEGER := COALESCE(array_length(p_registration_ids, 1), 0);
	v_updated   INTEGER := 0;
	v_learners  INTEGER := 0;
	v_now       TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
	v_mode      VARCHAR := NULLIF(TRIM(p_payment ->> 'payment_mode'), '');
	v_txn       VARCHAR := NULLIF(TRIM(p_payment ->> 'payment_transaction_id'), '');
BEGIN
	IF v_mode IS NOT NULL AND v_mode NOT IN ('Cash', 'Online') THEN
		RAISE EXCEPTION 'Mode of payment must be Cash or Online'
			USING ERRCODE = 'P0001';
	END IF;
	IF v_mode = 'Online' AND v_txn IS NULL THEN
		RAISE EXCEPTION 'An online payment needs its transaction id'
			USING ERRCODE = 'P0001';
	END IF;
	IF v_expected = 0 THEN
		RAISE EXCEPTION 'No subject registrations to approve'
			USING ERRCODE = 'P0001';
	END IF;
	IF p_fee_details IS NULL OR jsonb_typeof(p_fee_details) <> 'array' OR jsonb_array_length(p_fee_details) = 0 THEN
		RAISE EXCEPTION 'No learner fee details supplied'
			USING ERRCODE = 'P0001';
	END IF;
	IF p_late_fines IS NOT NULL AND jsonb_typeof(p_late_fines) <> 'array' THEN
		RAISE EXCEPTION 'Late fines must be a JSON array'
			USING ERRCODE = 'P0001';
	END IF;
	IF p_late_fines IS NOT NULL AND EXISTS (
		SELECT 1
		FROM jsonb_to_recordset(p_late_fines) AS f(registration_id UUID, late_fine NUMERIC)
		WHERE COALESCE(f.late_fine, 0) < 0
	) THEN
		RAISE EXCEPTION 'Late fine cannot be negative'
			USING ERRCODE = 'P0001';
	END IF;

	-- 2a. Paper level: all papers of the selected learners, together
	UPDATE public.exam_registrations
	SET
		fee_paid               = true,
		registration_status    = 'Approved',
		payment_date           = v_now,
		payment_mode           = v_mode,
		payment_transaction_id = COALESCE(v_txn, payment_transaction_id),
		approved_date          = v_now,
		updated_at             = v_now
	WHERE id = ANY (p_registration_ids)
	  AND registration_status = 'Applied';

	GET DIAGNOSTICS v_updated = ROW_COUNT;

	IF v_updated <> v_expected THEN
		RAISE EXCEPTION
			'Only % of % subject registrations are still awaiting final approval. Nothing was changed - refresh the list and try again.',
			v_updated, v_expected
			USING ERRCODE = 'P0001';
	END IF;

	-- approved_by: written on its own so an approver id the column's foreign key
	-- does not accept (a legacy FK target) can never block the approval itself -
	-- the learner-level row below records the approver either way.
	IF p_approved_by IS NOT NULL THEN
		BEGIN
			UPDATE public.exam_registrations
			SET approved_by = p_approved_by
			WHERE id = ANY (p_registration_ids);
		EXCEPTION WHEN foreign_key_violation THEN
			NULL;
		END;
	END IF;

	-- 2b. Late fine: only the amount entered at approval counts. Clear whatever
	--     an older build stamped at application time, then stamp the entered
	--     fine on the learner's anchor row.
	IF p_late_fines IS NOT NULL THEN
		UPDATE public.exam_registrations
		SET late_fine = 0
		WHERE id = ANY (p_registration_ids)
		  AND COALESCE(late_fine, 0) <> 0;

		UPDATE public.exam_registrations r
		SET late_fine = f.late_fine
		FROM jsonb_to_recordset(p_late_fines) AS f(registration_id UUID, late_fine NUMERIC)
		WHERE r.id = f.registration_id
		  AND r.id = ANY (p_registration_ids)
		  AND COALESCE(f.late_fine, 0) > 0;
	END IF;

	-- 2c. Learner level: one consolidated row per learner per session
	INSERT INTO public.exam_registration_fee_details (
		institutions_id, institution_code, examination_session_id, session_code,
		student_id, stu_register_no, student_name,
		regulation_code, program_code, semester,
		total_subjects, exam_fee, application_fee, mark_statement_fee, late_fine, final_amount,
		fee_paid, payment_status, registration_status,
		payment_mode, payment_transaction_id,
		approved_by, approved_at
	)
	SELECT
		d.institutions_id, d.institution_code, d.examination_session_id, d.session_code,
		d.student_id, d.stu_register_no, d.student_name,
		d.regulation_code, d.program_code, d.semester,
		COALESCE(d.total_subjects, 0),
		COALESCE(d.exam_fee, 0), COALESCE(d.application_fee, 0), COALESCE(d.mark_statement_fee, 0), COALESCE(d.late_fine, 0),
		COALESCE(d.final_amount, 0),
		true, 'Payment Approved', 'Approved',
		v_mode, v_txn,
		p_approved_by, v_now
	FROM jsonb_to_recordset(p_fee_details) AS d(
		institutions_id        UUID,
		institution_code       VARCHAR,
		examination_session_id UUID,
		session_code           VARCHAR,
		student_id             UUID,
		stu_register_no        VARCHAR,
		student_name           VARCHAR,
		regulation_code        VARCHAR,
		program_code           VARCHAR,
		semester               INTEGER,
		total_subjects         INTEGER,
		exam_fee               NUMERIC,
		application_fee        NUMERIC,
		mark_statement_fee     NUMERIC,
		late_fine              NUMERIC,
		final_amount           NUMERIC
	)
	ON CONFLICT (institutions_id, examination_session_id, stu_register_no) DO UPDATE SET
		student_id          = COALESCE(EXCLUDED.student_id, exam_registration_fee_details.student_id),
		student_name        = COALESCE(EXCLUDED.student_name, exam_registration_fee_details.student_name),
		institution_code    = COALESCE(EXCLUDED.institution_code, exam_registration_fee_details.institution_code),
		session_code        = COALESCE(EXCLUDED.session_code, exam_registration_fee_details.session_code),
		regulation_code     = COALESCE(EXCLUDED.regulation_code, exam_registration_fee_details.regulation_code),
		program_code        = COALESCE(EXCLUDED.program_code, exam_registration_fee_details.program_code),
		semester            = COALESCE(EXCLUDED.semester, exam_registration_fee_details.semester),
		-- A learner approved earlier and now approved for more papers (an arrear
		-- added after the first approval) carries the running total.
		total_subjects      = exam_registration_fee_details.total_subjects + EXCLUDED.total_subjects,
		exam_fee            = exam_registration_fee_details.exam_fee + EXCLUDED.exam_fee,
		application_fee     = exam_registration_fee_details.application_fee + EXCLUDED.application_fee,
		mark_statement_fee  = exam_registration_fee_details.mark_statement_fee + EXCLUDED.mark_statement_fee,
		late_fine           = exam_registration_fee_details.late_fine + EXCLUDED.late_fine,
		final_amount        = exam_registration_fee_details.final_amount + EXCLUDED.final_amount,
		fee_paid            = true,
		payment_status      = 'Payment Approved',
		registration_status = 'Approved',
		payment_mode        = COALESCE(EXCLUDED.payment_mode, exam_registration_fee_details.payment_mode),
		payment_transaction_id = COALESCE(EXCLUDED.payment_transaction_id, exam_registration_fee_details.payment_transaction_id),
		approved_by         = COALESCE(EXCLUDED.approved_by, exam_registration_fee_details.approved_by),
		approved_at         = EXCLUDED.approved_at,
		updated_at          = v_now;

	GET DIAGNOSTICS v_learners = ROW_COUNT;

	RETURN jsonb_build_object(
		'subjects_updated', v_updated,
		'students_approved', v_learners,
		'approved_at', v_now
	);
END;
$$;

COMMENT ON FUNCTION public.approve_final_exam_registration(UUID[], JSONB, UUID, JSONB, JSONB) IS
	'Final exam registration approval: marks every listed exam_registrations row fee_paid/Approved with the mode of payment and approver, stores the late-payment fine entered at approval, and upserts the learner-level exam_registration_fee_details row, all in one transaction.';

-- Make PostgREST pick the new signature up straight away
NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------
-- OPTIONAL - not run by default
-- -----------------------------------------------------
-- Learners who applied after the no-fine date under the old rule still carry an
-- auto-stamped late_fine on their pending ('Applied') rows. The approval screen
-- already ignores it and the approval clears it, but until then the Exam
-- Registration Reports keep showing it. Uncomment to clear it now:
--
-- UPDATE public.exam_registrations
-- SET late_fine = 0
-- WHERE registration_status = 'Applied'
--   AND COALESCE(late_fine, 0) <> 0;
