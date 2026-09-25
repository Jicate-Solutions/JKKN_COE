-- =====================================================================
-- DATA REPAIR: 29 UZO learners applied on 2026-09-21 with no session charges
-- =====================================================================
-- 24JUGZOO101-112 and AUG26ZY01-17 (NOV-DEC-2026, CAS) were moved to 'Applied'
-- at 12:45-12:48 IST on 21 Sep (deployment of commit 175ce60). Every paper got
-- its correct per-paper fee, but application_fee / mark_statement_fee stayed 0
-- on all rows, so Final Approval shows them with no application / mark
-- statement fee. They are the only uncharged applied learners in the session.
-- The cause could not be reproduced from the code or the data; the rate book
-- (UZO application 90, mark statement 150, effective 2026-08-01) was in force.
--
-- Rule restored here = what the apply screen stamps: the two heads on ONE
-- anchor row per learner (alphabetically first applied paper), 0 on the rest.
-- Late fine is keyed by hand at final approval, so it is left at 0.
--
-- Guarded: only learners in the list, still 'Applied', not yet final-approved
-- (no payment_date, no fee_details row) and carrying no charge anywhere in the
-- session. Re-running it is a no-op.
-- =====================================================================

-- STEP 0 - preview: expect 29 learners
SELECT r.stu_register_no, COUNT(*) AS applied_rows
FROM public.exam_registrations r
WHERE r.examination_session_id = 'beea2869-daf8-44eb-9a44-8aee4c29f64f'
  AND r.program_code = 'UZO'
  AND r.registration_status = 'Applied'
  AND r.payment_date IS NULL
  AND (r.stu_register_no LIKE '24JUGZOO1__' OR r.stu_register_no LIKE 'AUG26ZY__')
  AND NOT EXISTS (
	SELECT 1 FROM public.exam_registrations c
	WHERE c.examination_session_id = r.examination_session_id
	  AND c.stu_register_no = r.stu_register_no
	  AND (COALESCE(c.application_fee, 0) > 0 OR COALESCE(c.mark_statement_fee, 0) > 0)
  )
GROUP BY r.stu_register_no
ORDER BY r.stu_register_no;

-- STEP 1 - repair (single statement, atomic)
DO $$
DECLARE
	v_app  NUMERIC;
	v_ms   NUMERIC;
	v_rows INTEGER;
BEGIN
	-- Amounts from the rate book, not hard-coded
	SELECT amount INTO v_app FROM public.exam_fee_master
	WHERE institutions_id = '5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4' AND is_active
	  AND sub_category = 'APPLICATION' AND program_code = 'UZO' AND effective_from <= CURRENT_DATE
	ORDER BY effective_from DESC LIMIT 1;
	SELECT amount INTO v_ms FROM public.exam_fee_master
	WHERE institutions_id = '5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4' AND is_active
	  AND sub_category = 'MARK_STATEMENT' AND program_code = 'UZO' AND effective_from <= CURRENT_DATE
	ORDER BY effective_from DESC LIMIT 1;

	IF v_app IS NULL OR v_ms IS NULL THEN
		RAISE EXCEPTION 'UZO application / mark statement rate not found in exam_fee_master';
	END IF;

	WITH anchors AS (
		SELECT DISTINCT ON (r.stu_register_no) r.id
		FROM public.exam_registrations r
		WHERE r.examination_session_id = 'beea2869-daf8-44eb-9a44-8aee4c29f64f'
		  AND r.program_code = 'UZO'
		  AND r.registration_status = 'Applied'
		  AND r.payment_date IS NULL
		  AND (r.stu_register_no LIKE '24JUGZOO1__' OR r.stu_register_no LIKE 'AUG26ZY__')
		  AND NOT EXISTS (
			SELECT 1 FROM public.exam_registration_fee_details d
			WHERE d.examination_session_id = r.examination_session_id
			  AND UPPER(TRIM(d.stu_register_no)) = UPPER(TRIM(r.stu_register_no))
		  )
		  AND NOT EXISTS (
			SELECT 1 FROM public.exam_registrations c
			WHERE c.examination_session_id = r.examination_session_id
			  AND c.stu_register_no = r.stu_register_no
			  AND (COALESCE(c.application_fee, 0) > 0 OR COALESCE(c.mark_statement_fee, 0) > 0)
		  )
		ORDER BY r.stu_register_no, r.course_code, r.id
	)
	UPDATE public.exam_registrations r
	SET application_fee    = v_app,
		mark_statement_fee = v_ms,
		updated_at         = NOW()
	FROM anchors a
	WHERE r.id = a.id;

	GET DIAGNOSTICS v_rows = ROW_COUNT;
	RAISE NOTICE 'Stamped application % + mark statement % on % learners', v_app, v_ms, v_rows;
END $$;

-- STEP 2 - confirm: expect 0 rows (re-run STEP 0)
