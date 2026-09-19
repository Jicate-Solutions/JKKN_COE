-- =====================================================
-- Final Exam Registration Approval - unapprove + log
-- Date: 2026-09-19
--
-- A learner approved by mistake on
--   /exam-management/exam-registration-final-approval  (Approved tab)
-- can be sent back to the pending list. In ONE transaction:
--
--   1. exam_registration_approval_logs (NEW) keeps what was approved - fee
--      heads, mode of payment, approver, the paper ids - plus who unapproved
--      it, when and why. Append-only.
--   2. exam_registrations: every 'Approved' paper of the learner in the session
--      goes back to
--          fee_paid = false, registration_status = 'Applied'
--      and the payment / approval stamps are cleared.
--   3. exam_registration_fee_details: the learner's consolidated row is removed,
--      so a later re-approval starts from zero instead of adding to it.
--
-- Run AFTER 20260919_final_approval_manual_late_fine.sql (payment_mode column).
-- Idempotent: re-running this migration has no side effects.
-- =====================================================

-- -----------------------------------------------------
-- 1. Log table
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_registration_approval_logs (
	id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	institutions_id        UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code       VARCHAR(50),
	examination_session_id UUID NOT NULL REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
	session_code           VARCHAR(50),

	student_id             UUID,
	stu_register_no        VARCHAR(100) NOT NULL,
	student_name           VARCHAR(255),
	regulation_code        VARCHAR(50),
	program_code           VARCHAR(50),
	semester               INTEGER,

	action                 VARCHAR(30) NOT NULL DEFAULT 'Unapproved',
	reason                 TEXT NOT NULL,

	-- Snapshot of the approval that was undone
	total_subjects         INTEGER       NOT NULL DEFAULT 0,
	exam_fee               NUMERIC(10,2) NOT NULL DEFAULT 0,
	application_fee        NUMERIC(10,2) NOT NULL DEFAULT 0,
	mark_statement_fee     NUMERIC(10,2) NOT NULL DEFAULT 0,
	late_fine              NUMERIC(10,2) NOT NULL DEFAULT 0,
	final_amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
	payment_mode           VARCHAR(20),
	payment_transaction_id VARCHAR(255),
	approved_by            UUID,
	approved_at            TIMESTAMP WITH TIME ZONE,

	-- The exam_registrations rows that were moved back to 'Applied'
	registration_ids       UUID[] NOT NULL DEFAULT '{}',

	performed_by           UUID REFERENCES public.users(id) ON DELETE SET NULL,
	performed_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT chk_exam_registration_approval_logs_action
		CHECK (action IN ('Approved', 'Unapproved'))
);

COMMENT ON TABLE public.exam_registration_approval_logs IS
	'Append-only log of final exam registration approvals that were undone (and why), with a snapshot of the fee that had been approved.';

CREATE INDEX IF NOT EXISTS idx_exam_reg_approval_logs_session
	ON public.exam_registration_approval_logs (institutions_id, examination_session_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_reg_approval_logs_register_no
	ON public.exam_registration_approval_logs (stu_register_no);

-- -----------------------------------------------------
-- 2. Atomic unapprove
-- -----------------------------------------------------
-- p_register_numbers : learners to send back to the pending list
-- p_reason           : mandatory - why the approval is being undone
-- p_performed_by     : users.id of the person undoing it
CREATE OR REPLACE FUNCTION public.unapprove_final_exam_registration(
	p_institutions_id        UUID,
	p_examination_session_id UUID,
	p_register_numbers       TEXT[],
	p_reason                 TEXT,
	p_performed_by           UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_now       TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
	v_reason    TEXT := NULLIF(TRIM(p_reason), '');
	v_wanted    TEXT[];
	v_detail    public.exam_registration_fee_details%ROWTYPE;
	v_ids       UUID[];
	v_learners  INTEGER := 0;
	v_subjects  INTEGER := 0;
BEGIN
	IF v_reason IS NULL THEN
		RAISE EXCEPTION 'A reason is required to unapprove a registration'
			USING ERRCODE = 'P0001';
	END IF;

	SELECT array_agg(DISTINCT UPPER(TRIM(r)))
	INTO v_wanted
	FROM unnest(p_register_numbers) AS r
	WHERE NULLIF(TRIM(r), '') IS NOT NULL;

	IF v_wanted IS NULL THEN
		RAISE EXCEPTION 'No learner selected'
			USING ERRCODE = 'P0001';
	END IF;

	FOR v_detail IN
		SELECT *
		FROM public.exam_registration_fee_details
		WHERE institutions_id = p_institutions_id
		  AND examination_session_id = p_examination_session_id
		  AND UPPER(TRIM(stu_register_no)) = ANY (v_wanted)
		FOR UPDATE
	LOOP
		SELECT COALESCE(array_agg(id), '{}')
		INTO v_ids
		FROM public.exam_registrations
		WHERE institutions_id = p_institutions_id
		  AND examination_session_id = p_examination_session_id
		  AND UPPER(TRIM(stu_register_no)) = UPPER(TRIM(v_detail.stu_register_no))
		  AND registration_status = 'Approved';

		INSERT INTO public.exam_registration_approval_logs (
			institutions_id, institution_code, examination_session_id, session_code,
			student_id, stu_register_no, student_name, regulation_code, program_code, semester,
			action, reason,
			total_subjects, exam_fee, application_fee, mark_statement_fee, late_fine, final_amount,
			payment_mode, payment_transaction_id, approved_by, approved_at,
			registration_ids, performed_by, performed_at
		) VALUES (
			v_detail.institutions_id, v_detail.institution_code, v_detail.examination_session_id, v_detail.session_code,
			v_detail.student_id, v_detail.stu_register_no, v_detail.student_name, v_detail.regulation_code, v_detail.program_code, v_detail.semester,
			'Unapproved', v_reason,
			v_detail.total_subjects, v_detail.exam_fee, v_detail.application_fee, v_detail.mark_statement_fee, v_detail.late_fine, v_detail.final_amount,
			v_detail.payment_mode, v_detail.payment_transaction_id, v_detail.approved_by, v_detail.approved_at,
			v_ids, p_performed_by, v_now
		);

		-- Back to the pending pool. The late fine goes too: it is keyed in again
		-- (or not) when the learner is approved the next time.
		UPDATE public.exam_registrations
		SET
			fee_paid               = false,
			registration_status    = 'Applied',
			payment_date           = NULL,
			payment_mode           = NULL,
			payment_transaction_id = NULL,
			approved_by            = NULL,
			approved_date          = NULL,
			late_fine              = 0,
			updated_at             = v_now
		WHERE id = ANY (v_ids);

		DELETE FROM public.exam_registration_fee_details WHERE id = v_detail.id;

		v_learners := v_learners + 1;
		v_subjects := v_subjects + COALESCE(array_length(v_ids, 1), 0);
	END LOOP;

	IF v_learners = 0 THEN
		RAISE EXCEPTION 'None of the selected learners is approved any more. Refresh the list and try again.'
			USING ERRCODE = 'P0001';
	END IF;

	RETURN jsonb_build_object(
		'students_unapproved', v_learners,
		'subjects_updated', v_subjects,
		'performed_at', v_now
	);
END;
$$;

COMMENT ON FUNCTION public.unapprove_final_exam_registration(UUID, UUID, TEXT[], TEXT, UUID) IS
	'Undo a final exam registration approval: logs it, moves the learner''s Approved papers back to Applied / fee_paid = false and removes the learner-level fee row, all in one transaction.';

NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------
-- 3. Permission
-- -----------------------------------------------------
WITH page_perms(name, description, resource, action, role_names) AS (
	VALUES
		(
			'page.exam_management.exam_registration_final_approval.unapprove',
			'Undo a final exam registration approval given by mistake',
			'page.exam_management.exam_registration_final_approval',
			'unapprove',
			ARRAY['super_admin', 'coe']
		)
),
upsert_perms AS (
	INSERT INTO public.permissions (name, description, resource, action, is_active)
	SELECT name, description, resource, action, true FROM page_perms
	ON CONFLICT (name) DO UPDATE
		SET description = EXCLUDED.description,
		    resource    = EXCLUDED.resource,
		    action      = EXCLUDED.action,
		    is_active   = true
	RETURNING id, name
),
exploded AS (
	SELECT
		up.id AS permission_id,
		unnest(pp.role_names) AS role_name
	FROM page_perms pp
	JOIN upsert_perms up ON up.name = pp.name
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, e.permission_id
FROM exploded e
JOIN public.roles r ON r.name = e.role_name
WHERE r.is_active IS NOT FALSE
ON CONFLICT (role_id, permission_id) DO NOTHING;
