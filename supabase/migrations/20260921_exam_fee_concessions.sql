-- =====================================================
-- Exam Fee Concessions
-- Date: 2026-09-21
--
-- Some learners (disability and similar cases) are granted a concession on
-- their exam fee by an approval letter. The CoE office records it on
--   /exam-management/exam-fee-concessions
-- per learner per session: an amount waived on each fee head (exam fee,
-- application fee, mark statement fee) plus the approval letter.
--
-- Final approval then collects   actual fee - concession (+ late fine)   and,
-- in the SAME transaction as the approval:
--   - reduces exam_registrations.fee_amount / application_fee /
--     mark_statement_fee of the learner's paper rows to the net amounts;
--   - marks the concession 'Applied' and remembers exactly what was taken off
--     which row (applied_adjustments), so Unapprove can put it back.
--
-- Run AFTER 20260919_final_approval_manual_late_fine.sql and
-- 20260919_final_approval_unapprove.sql.
-- Idempotent: re-running this migration has no side effects.
-- =====================================================

-- -----------------------------------------------------
-- 1. Concession table
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_fee_concessions (
	id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	institutions_id           UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code          VARCHAR(50),
	examination_session_id    UUID NOT NULL REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
	session_code              VARCHAR(50),

	student_id                UUID,
	stu_register_no           VARCHAR(100) NOT NULL,
	student_name              VARCHAR(255),
	program_code              VARCHAR(50),

	concession_type           VARCHAR(50) NOT NULL DEFAULT 'Disability',

	-- Amount waived on each fee head
	exam_fee_waiver           NUMERIC(10,2) NOT NULL DEFAULT 0,
	application_fee_waiver    NUMERIC(10,2) NOT NULL DEFAULT 0,
	mark_statement_fee_waiver NUMERIC(10,2) NOT NULL DEFAULT 0,

	-- The approval letter the amounts were taken from
	letter_ref_no             VARCHAR(100),
	letter_date               DATE,
	letter_file_path          TEXT,
	letter_file_name          VARCHAR(255),
	remarks                   TEXT,

	-- Active  : recorded, waiting for the learner's final approval
	-- Applied : taken off the fee at final approval
	status                    VARCHAR(20) NOT NULL DEFAULT 'Active',
	applied_at                TIMESTAMP WITH TIME ZONE,
	-- [{ registration_id, fee_amount, application_fee, mark_statement_fee }] -
	-- what was subtracted from which exam_registrations row
	applied_adjustments       JSONB,

	created_by                UUID REFERENCES public.users(id) ON DELETE SET NULL,
	created_at                TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at                TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT uq_exam_fee_concessions_learner_session
		UNIQUE (institutions_id, examination_session_id, stu_register_no),
	CONSTRAINT chk_exam_fee_concessions_status
		CHECK (status IN ('Active', 'Applied')),
	CONSTRAINT chk_exam_fee_concessions_amounts
		CHECK (exam_fee_waiver >= 0 AND application_fee_waiver >= 0 AND mark_statement_fee_waiver >= 0
			AND exam_fee_waiver + application_fee_waiver + mark_statement_fee_waiver > 0)
);

COMMENT ON TABLE public.exam_fee_concessions IS
	'Exam fee concession granted to a learner for one examination session (disability etc.), per fee head, with the approval letter. Taken off the fee at final registration approval.';

CREATE INDEX IF NOT EXISTS idx_exam_fee_concessions_session
	ON public.exam_fee_concessions (institutions_id, examination_session_id, status);

CREATE OR REPLACE FUNCTION public.update_exam_fee_concessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_exam_fee_concessions_updated_at ON public.exam_fee_concessions;
CREATE TRIGGER trigger_update_exam_fee_concessions_updated_at
	BEFORE UPDATE ON public.exam_fee_concessions
	FOR EACH ROW EXECUTE FUNCTION public.update_exam_fee_concessions_updated_at();

-- The learner-level record and the unapprove log both say how much was waived
ALTER TABLE public.exam_registration_fee_details
	ADD COLUMN IF NOT EXISTS concession_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.exam_registration_approval_logs
	ADD COLUMN IF NOT EXISTS concession_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.exam_registration_fee_details.concession_amount IS
	'Fee concession taken off at approval. exam_fee / application_fee / mark_statement_fee / final_amount are already NET of it.';

-- -----------------------------------------------------
-- 2. Atomic approval - now applies concessions
-- -----------------------------------------------------
DROP FUNCTION IF EXISTS public.approve_final_exam_registration(UUID[], JSONB, UUID, JSONB, JSONB);

-- p_concessions : JSON array, one object per learner with a concession
--                   { "concession_id": <exam_fee_concessions.id>,
--                     "adjustments": [ { "registration_id": ..., "fee_amount": n,
--                                        "application_fee": n, "mark_statement_fee": n } ] }
--                 The amounts are what to SUBTRACT from each paper row.
--                 p_fee_details already carries the NET heads + concession_amount.
CREATE OR REPLACE FUNCTION public.approve_final_exam_registration(
	p_registration_ids UUID[],
	p_fee_details      JSONB,
	p_approved_by      UUID DEFAULT NULL,
	p_late_fines       JSONB DEFAULT NULL,
	p_payment          JSONB DEFAULT NULL,
	p_concessions      JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_expected    INTEGER := COALESCE(array_length(p_registration_ids, 1), 0);
	v_updated     INTEGER := 0;
	v_learners    INTEGER := 0;
	v_concessions INTEGER := 0;
	v_marked      INTEGER := 0;
	v_now         TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
	v_mode        VARCHAR := NULLIF(TRIM(p_payment ->> 'payment_mode'), '');
	v_txn         VARCHAR := NULLIF(TRIM(p_payment ->> 'payment_transaction_id'), '');
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
	IF p_concessions IS NOT NULL AND jsonb_typeof(p_concessions) <> 'array' THEN
		RAISE EXCEPTION 'Concessions must be a JSON array'
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

	-- 2c. Fee concession: the paper rows drop to the NET amounts, and the
	--     concession remembers what it took off which row.
	IF p_concessions IS NOT NULL AND jsonb_array_length(p_concessions) > 0 THEN
		v_concessions := jsonb_array_length(p_concessions);

		-- Every concession must still be unused - one already applied (or deleted
		-- meanwhile) means the screen is stale.
		UPDATE public.exam_fee_concessions c
		SET
			status              = 'Applied',
			applied_at          = v_now,
			applied_adjustments = p.adjustments
		FROM jsonb_to_recordset(p_concessions) AS p(concession_id UUID, adjustments JSONB)
		WHERE c.id = p.concession_id
		  AND c.status = 'Active';

		GET DIAGNOSTICS v_marked = ROW_COUNT;

		IF v_marked <> v_concessions THEN
			RAISE EXCEPTION
				'A fee concession on this selection has changed since the list was loaded. Nothing was changed - refresh the list and try again.'
				USING ERRCODE = 'P0001';
		END IF;

		UPDATE public.exam_registrations r
		SET
			fee_amount         = GREATEST(COALESCE(r.fee_amount, 0) - COALESCE(a.fee_amount, 0), 0),
			application_fee    = GREATEST(COALESCE(r.application_fee, 0) - COALESCE(a.application_fee, 0), 0),
			mark_statement_fee = GREATEST(COALESCE(r.mark_statement_fee, 0) - COALESCE(a.mark_statement_fee, 0), 0)
		FROM jsonb_to_recordset(p_concessions) AS p(concession_id UUID, adjustments JSONB),
			LATERAL jsonb_to_recordset(COALESCE(p.adjustments, '[]'::jsonb))
				AS a(registration_id UUID, fee_amount NUMERIC, application_fee NUMERIC, mark_statement_fee NUMERIC)
		WHERE r.id = a.registration_id
		  AND r.id = ANY (p_registration_ids);
	END IF;

	-- 2d. Learner level: one consolidated row per learner per session
	INSERT INTO public.exam_registration_fee_details (
		institutions_id, institution_code, examination_session_id, session_code,
		student_id, stu_register_no, student_name,
		regulation_code, program_code, semester,
		total_subjects, exam_fee, application_fee, mark_statement_fee, late_fine, concession_amount, final_amount,
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
		COALESCE(d.concession_amount, 0),
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
		concession_amount      NUMERIC,
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
		concession_amount   = exam_registration_fee_details.concession_amount + EXCLUDED.concession_amount,
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
		'concessions_applied', v_concessions,
		'approved_at', v_now
	);
END;
$$;

COMMENT ON FUNCTION public.approve_final_exam_registration(UUID[], JSONB, UUID, JSONB, JSONB, JSONB) IS
	'Final exam registration approval: marks every listed exam_registrations row fee_paid/Approved with the mode of payment and approver, stores the late fine, takes the fee concession off the paper rows, and upserts the learner-level exam_registration_fee_details row, all in one transaction.';

-- -----------------------------------------------------
-- 3. Atomic unapprove - now gives the concession back
-- -----------------------------------------------------
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
			total_subjects, exam_fee, application_fee, mark_statement_fee, late_fine, concession_amount, final_amount,
			payment_mode, payment_transaction_id, approved_by, approved_at,
			registration_ids, performed_by, performed_at
		) VALUES (
			v_detail.institutions_id, v_detail.institution_code, v_detail.examination_session_id, v_detail.session_code,
			v_detail.student_id, v_detail.stu_register_no, v_detail.student_name, v_detail.regulation_code, v_detail.program_code, v_detail.semester,
			'Unapproved', v_reason,
			v_detail.total_subjects, v_detail.exam_fee, v_detail.application_fee, v_detail.mark_statement_fee, v_detail.late_fine, v_detail.concession_amount, v_detail.final_amount,
			v_detail.payment_mode, v_detail.payment_transaction_id, v_detail.approved_by, v_detail.approved_at,
			v_ids, p_performed_by, v_now
		);

		-- Give the concession back: the paper rows return to the ACTUAL fee and
		-- the concession waits, Active again, for the next approval.
		UPDATE public.exam_registrations r
		SET
			fee_amount         = COALESCE(r.fee_amount, 0) + COALESCE(a.fee_amount, 0),
			application_fee    = COALESCE(r.application_fee, 0) + COALESCE(a.application_fee, 0),
			mark_statement_fee = COALESCE(r.mark_statement_fee, 0) + COALESCE(a.mark_statement_fee, 0)
		FROM public.exam_fee_concessions c,
			LATERAL jsonb_to_recordset(COALESCE(c.applied_adjustments, '[]'::jsonb))
				AS a(registration_id UUID, fee_amount NUMERIC, application_fee NUMERIC, mark_statement_fee NUMERIC)
		WHERE c.institutions_id = p_institutions_id
		  AND c.examination_session_id = p_examination_session_id
		  AND UPPER(TRIM(c.stu_register_no)) = UPPER(TRIM(v_detail.stu_register_no))
		  AND c.status = 'Applied'
		  AND r.id = a.registration_id
		  AND r.id = ANY (v_ids);

		UPDATE public.exam_fee_concessions
		SET status = 'Active', applied_at = NULL, applied_adjustments = NULL
		WHERE institutions_id = p_institutions_id
		  AND examination_session_id = p_examination_session_id
		  AND UPPER(TRIM(stu_register_no)) = UPPER(TRIM(v_detail.stu_register_no))
		  AND status = 'Applied';

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

NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------
-- 4. Page permissions (sidebar + API guard)
-- -----------------------------------------------------
WITH page_perms(name, description, resource, action, role_names) AS (
	VALUES
		(
			'page.exam_management.exam_fee_concessions.view',
			'Access Exam Fee Concessions page',
			'page.exam_management.exam_fee_concessions',
			'view',
			ARRAY['super_admin', 'coe', 'coe_office_1']
		),
		(
			'page.exam_management.exam_fee_concessions.manage',
			'Record, change and remove exam fee concessions',
			'page.exam_management.exam_fee_concessions',
			'manage',
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
JOIN public.roles r ON r.name = e.role_name
WHERE r.is_active IS NOT FALSE
ON CONFLICT (role_id, permission_id) DO NOTHING;
