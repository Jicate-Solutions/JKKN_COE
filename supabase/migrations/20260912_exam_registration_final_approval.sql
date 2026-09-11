-- =====================================================
-- Final Exam Registration Approval
-- Date: 2026-09-12
--
-- After a learner's exam application (and its payment) is approved, the CoE
-- office gives the registration its FINAL approval on
--   /exam-management/exam-registration-final-approval
--
-- That approval touches two places:
--
--   1. exam_registrations (paper level) - every paper the learner applied for
--      in the session moves in ONE transaction to
--          fee_paid            = true
--          registration_status = 'Approved'
--
--   2. exam_registration_fee_details (learner level) - one consolidated row
--      per (learner, session) holding the subject count, the fee heads and the
--      final amount that was approved. Reports read this table so a
--      learner-wise report never has to re-sum paper rows.
--
-- Both writes happen inside approve_final_exam_registration(), a plpgsql
-- function, so a failure anywhere rolls back everything - no learner is ever
-- left half-approved.
--
-- Idempotent: re-running this migration has no side effects.
-- =====================================================

-- -----------------------------------------------------
-- 1. Learner-level fee / approval record
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_registration_fee_details (
	id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	institutions_id        UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code       VARCHAR(50),
	examination_session_id UUID NOT NULL REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
	session_code           VARCHAR(50),

	-- Learner (student_id is nullable on exam_registrations too; the register
	-- number is the stable key)
	student_id             UUID,
	stu_register_no        VARCHAR(100) NOT NULL,
	student_name           VARCHAR(255),

	-- Scope the learner was approved under
	regulation_code        VARCHAR(50),
	program_code           VARCHAR(50),
	semester               INTEGER,

	-- Consolidated fee (sum of the learner's paper rows at approval time)
	total_subjects         INTEGER       NOT NULL DEFAULT 0,
	exam_fee               NUMERIC(10,2) NOT NULL DEFAULT 0,
	application_fee        NUMERIC(10,2) NOT NULL DEFAULT 0,
	mark_statement_fee     NUMERIC(10,2) NOT NULL DEFAULT 0,
	late_fine              NUMERIC(10,2) NOT NULL DEFAULT 0,
	final_amount           NUMERIC(10,2) NOT NULL DEFAULT 0,

	fee_paid               BOOLEAN NOT NULL DEFAULT false,
	payment_status         VARCHAR(50) NOT NULL DEFAULT 'Payment Approved',
	registration_status    VARCHAR(50) NOT NULL DEFAULT 'Approved',

	approved_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
	approved_at            TIMESTAMP WITH TIME ZONE,

	created_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT uq_exam_registration_fee_details_learner_session
		UNIQUE (institutions_id, examination_session_id, stu_register_no),
	CONSTRAINT chk_exam_registration_fee_details_payment_status
		CHECK (payment_status IN ('Payment Pending', 'Payment Submitted', 'Payment Approved')),
	CONSTRAINT chk_exam_registration_fee_details_registration_status
		CHECK (registration_status IN ('Final Approval Pending', 'Approved'))
);

COMMENT ON TABLE public.exam_registration_fee_details IS
	'Learner-level consolidated exam fee and final registration approval, one row per learner per examination session. Paper-level detail stays on exam_registrations.';
COMMENT ON COLUMN public.exam_registration_fee_details.exam_fee IS
	'Sum of exam_registrations.fee_amount over every paper approved for the learner in the session.';
COMMENT ON COLUMN public.exam_registration_fee_details.final_amount IS
	'exam_fee + application_fee + mark_statement_fee + late_fine at the time of approval.';

CREATE INDEX IF NOT EXISTS idx_exam_reg_fee_details_session
	ON public.exam_registration_fee_details (institutions_id, examination_session_id);
CREATE INDEX IF NOT EXISTS idx_exam_reg_fee_details_program_semester
	ON public.exam_registration_fee_details (examination_session_id, program_code, semester);
CREATE INDEX IF NOT EXISTS idx_exam_reg_fee_details_register_no
	ON public.exam_registration_fee_details (stu_register_no);

CREATE OR REPLACE FUNCTION public.update_exam_registration_fee_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_exam_registration_fee_details_updated_at
	ON public.exam_registration_fee_details;
CREATE TRIGGER trigger_update_exam_registration_fee_details_updated_at
	BEFORE UPDATE ON public.exam_registration_fee_details
	FOR EACH ROW EXECUTE FUNCTION public.update_exam_registration_fee_details_updated_at();

-- -----------------------------------------------------
-- 2. Atomic approval
-- -----------------------------------------------------
-- p_registration_ids : every exam_registrations.id of the selected learners
--                      (the API derives the list from the database, never from
--                      the browser)
-- p_fee_details      : JSON array, one object per learner, matching the
--                      exam_registration_fee_details columns
-- p_approved_by      : users.id of the approver
--
-- Every id must still be in 'Applied'. If even one row has moved on (approved
-- by someone else, cancelled, withdrawn) the whole call is rejected and
-- nothing is written - the screen is stale and must be refreshed.
CREATE OR REPLACE FUNCTION public.approve_final_exam_registration(
	p_registration_ids UUID[],
	p_fee_details      JSONB,
	p_approved_by      UUID DEFAULT NULL
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
BEGIN
	IF v_expected = 0 THEN
		RAISE EXCEPTION 'No subject registrations to approve'
			USING ERRCODE = 'P0001';
	END IF;
	IF p_fee_details IS NULL OR jsonb_typeof(p_fee_details) <> 'array' OR jsonb_array_length(p_fee_details) = 0 THEN
		RAISE EXCEPTION 'No learner fee details supplied'
			USING ERRCODE = 'P0001';
	END IF;

	-- 2a. Paper level: all papers of the selected learners, together
	UPDATE public.exam_registrations
	SET
		fee_paid            = true,
		registration_status = 'Approved',
		payment_date        = COALESCE(payment_date, v_now),
		approved_date       = v_now,
		updated_at          = v_now
	WHERE id = ANY (p_registration_ids)
	  AND registration_status = 'Applied';

	GET DIAGNOSTICS v_updated = ROW_COUNT;

	IF v_updated <> v_expected THEN
		RAISE EXCEPTION
			'Only % of % subject registrations are still awaiting final approval. Nothing was changed - refresh the list and try again.',
			v_updated, v_expected
			USING ERRCODE = 'P0001';
	END IF;

	-- 2b. Learner level: one consolidated row per learner per session
	INSERT INTO public.exam_registration_fee_details (
		institutions_id, institution_code, examination_session_id, session_code,
		student_id, stu_register_no, student_name,
		regulation_code, program_code, semester,
		total_subjects, exam_fee, application_fee, mark_statement_fee, late_fine, final_amount,
		fee_paid, payment_status, registration_status,
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

COMMENT ON FUNCTION public.approve_final_exam_registration(UUID[], JSONB, UUID) IS
	'Final exam registration approval: marks every listed exam_registrations row fee_paid/Approved and upserts the learner-level exam_registration_fee_details row, all in one transaction.';

-- -----------------------------------------------------
-- 3. Page permissions (sidebar + API guard)
-- -----------------------------------------------------
-- Follows 20260513_seed_page_permissions.sql:
--   name = 'page.<slug>.<action>', resource = 'page.<slug>'
WITH page_perms(name, description, resource, action, role_names) AS (
	VALUES
		(
			'page.exam_management.exam_registration_final_approval.view',
			'Access Final Exam Registration Approval page',
			'page.exam_management.exam_registration_final_approval',
			'view',
			ARRAY['super_admin', 'coe', 'coe_office_1']
		),
		(
			'page.exam_management.exam_registration_final_approval.approve',
			'Give final approval to payment-approved exam registrations',
			'page.exam_management.exam_registration_final_approval',
			'approve',
			ARRAY['super_admin', 'coe', 'coe_office_1']
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
JOIN public.roles r ON (
	e.role_name = '*' OR r.name = e.role_name
)
WHERE r.is_active IS NOT FALSE
ON CONFLICT (role_id, permission_id) DO NOTHING;
