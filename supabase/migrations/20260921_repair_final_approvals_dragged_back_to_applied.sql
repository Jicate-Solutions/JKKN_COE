-- =====================================================================
-- DATA REPAIR: final-approved registrations dragged back to 'Applied'
-- =====================================================================
-- Date: 2026-09-21
--
-- What happened
--   The Exam Application screens only recognised 'Applied' as "already applied
--   for". A learner who had been through Final Approval ('Approved') therefore
--   showed as Not Applied and stayed selectable, and applying the cohort again
--   wrote over the approved rows:
--
--     registration_status  'Approved' -> 'Applied'
--     application_fee / mark_statement_fee / late_fine -> 0 on every row
--
--   fee_paid, payment_date, approved_date and the exam_registration_fee_details
--   row were left alone, so the learner was half approved: paid and receipted,
--   yet back in the Final Approval pending pool with every paper.
--
--   NOV-DEC-2026 (CAS): 65 learners / 579 rows (UCM 48, UZO 17), approved on
--   19 Sep, dragged back on 21 Sep 13:05 and 15:32. Paper fee_amount was NOT
--   changed (no concessions were involved); 57 learners lost their charges.
--
-- How a dragged-back row is told apart from a legitimately unapproved one
--   unapprove_final_exam_registration() clears payment_date and DELETES the
--   fee_details row. A dragged-back row still has both. So:
--
--     registration_status = 'Applied' AND payment_date IS NOT NULL
--     AND an 'Approved' exam_registration_fee_details row exists for the learner
--
-- Source of truth: exam_registration_fee_details (untouched by the bug).
--
-- IMPORTANT - run this BEFORE anyone final-approves these learners again.
--   Approving a dragged-back learner upserts fee_details from the zeroed rows
--   and would overwrite the correct application / mark statement / late fine.
--
-- Deploy the application fix first (lib/exam-registration-status.ts ->
-- isFinalApprovedRegistration), or the next re-apply repeats the damage.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 0 - PREVIEW (read-only). Run this on its own first.
-- ---------------------------------------------------------------------
SELECT
	d.session_code,
	d.program_code,
	COUNT(DISTINCT d.id)  AS learners,
	COUNT(r.id)           AS rows_to_restore
FROM public.exam_registration_fee_details d
JOIN public.exam_registrations r
	ON  r.institutions_id        = d.institutions_id
	AND r.examination_session_id = d.examination_session_id
	AND UPPER(TRIM(r.stu_register_no)) = UPPER(TRIM(d.stu_register_no))
WHERE d.registration_status = 'Approved'
  AND r.registration_status = 'Applied'
  AND r.payment_date IS NOT NULL
GROUP BY d.session_code, d.program_code
ORDER BY d.session_code, d.program_code;
-- Expected on 2026-09-21: NOV-DEC-2026 UCM 48 learners, UZO 17 learners, 579 rows.


-- ---------------------------------------------------------------------
-- STEP 1 + 2 + 3 - REPAIR (ONE statement = ONE transaction)
-- ---------------------------------------------------------------------
-- Deliberately a single DO block and not BEGIN ... COMMIT: the Supabase SQL
-- Editor may run each statement of a script in its own transaction, which
-- drops an ON COMMIT DROP temp table the moment it is created (42P01
-- "_dragged_back does not exist"). One statement is atomic however it is run -
-- a failed check raises, and the whole repair rolls back.
--
-- Select and run this block on its own, after STEP 0.
DO $$
DECLARE
	v_learners INTEGER;
	v_restored INTEGER;
	v_left     INTEGER;
	v_mismatch INTEGER;
BEGIN
	-- The learners to repair, fixed up front so every step acts on the same set
	CREATE TEMP TABLE _dragged_back ON COMMIT DROP AS
	SELECT DISTINCT
		d.id AS detail_id,
		d.institutions_id,
		d.examination_session_id,
		UPPER(TRIM(d.stu_register_no)) AS reg_no,
		COALESCE(d.application_fee, 0)    AS application_fee,
		COALESCE(d.mark_statement_fee, 0) AS mark_statement_fee,
		COALESCE(d.late_fine, 0)          AS late_fine
	FROM public.exam_registration_fee_details d
	JOIN public.exam_registrations r
		ON  r.institutions_id        = d.institutions_id
		AND r.examination_session_id = d.examination_session_id
		AND UPPER(TRIM(r.stu_register_no)) = UPPER(TRIM(d.stu_register_no))
	WHERE d.registration_status = 'Approved'
	  AND r.registration_status = 'Applied'
	  AND r.payment_date IS NOT NULL;

	SELECT COUNT(*) INTO v_learners FROM _dragged_back;
	IF v_learners = 0 THEN
		RAISE NOTICE 'Nothing to repair - no final-approved registration is sitting at Applied.';
		RETURN;
	END IF;

	-- STEP 1 - status back to 'Approved'. payment_date / fee_paid / approved_date
	-- were never cleared, so only the status needs restoring.
	UPDATE public.exam_registrations r
	SET registration_status = 'Approved',
		updated_at          = NOW()
	FROM _dragged_back b
	WHERE r.institutions_id        = b.institutions_id
	  AND r.examination_session_id = b.examination_session_id
	  AND UPPER(TRIM(r.stu_register_no)) = b.reg_no
	  AND r.registration_status = 'Applied'
	  AND r.payment_date IS NOT NULL;

	GET DIAGNOSTICS v_restored = ROW_COUNT;

	-- STEP 2 - the once-per-session charges back onto ONE anchor row per learner
	-- (alphabetically first approved paper - the same rule the apply screen uses),
	-- 0 on the rest, so summing a learner's rows equals the fee_details snapshot.
	WITH ranked AS (
		SELECT
			r.id,
			b.application_fee,
			b.mark_statement_fee,
			b.late_fine,
			ROW_NUMBER() OVER (
				PARTITION BY b.detail_id
				ORDER BY r.course_code, r.id
			) AS rn
		FROM _dragged_back b
		JOIN public.exam_registrations r
			ON  r.institutions_id        = b.institutions_id
			AND r.examination_session_id = b.examination_session_id
			AND UPPER(TRIM(r.stu_register_no)) = b.reg_no
		WHERE r.registration_status = 'Approved'
		  AND r.payment_date IS NOT NULL
	)
	UPDATE public.exam_registrations r
	SET application_fee    = CASE WHEN k.rn = 1 THEN k.application_fee    ELSE 0 END,
		mark_statement_fee = CASE WHEN k.rn = 1 THEN k.mark_statement_fee ELSE 0 END,
		late_fine          = CASE WHEN k.rn = 1 THEN k.late_fine          ELSE 0 END
	FROM ranked k
	WHERE r.id = k.id;

	-- STEP 3a - nothing left dragged back
	SELECT COUNT(*) INTO v_left
	FROM public.exam_registrations r
	JOIN _dragged_back b
		ON  r.institutions_id        = b.institutions_id
		AND r.examination_session_id = b.examination_session_id
		AND UPPER(TRIM(r.stu_register_no)) = b.reg_no
	WHERE r.registration_status = 'Applied'
	  AND r.payment_date IS NOT NULL;

	-- STEP 3b - every repaired learner's rows add up to their fee_details snapshot
	SELECT COUNT(*) INTO v_mismatch
	FROM (
		SELECT b.reg_no
		FROM _dragged_back b
		JOIN public.exam_registrations r
			ON  r.institutions_id        = b.institutions_id
			AND r.examination_session_id = b.examination_session_id
			AND UPPER(TRIM(r.stu_register_no)) = b.reg_no
		WHERE r.registration_status = 'Approved'
		  AND r.payment_date IS NOT NULL
		GROUP BY b.reg_no, b.application_fee, b.mark_statement_fee, b.late_fine
		HAVING SUM(COALESCE(r.application_fee, 0))    <> b.application_fee
			OR SUM(COALESCE(r.mark_statement_fee, 0)) <> b.mark_statement_fee
			OR SUM(COALESCE(r.late_fine, 0))          <> b.late_fine
	) x;

	IF v_left > 0 OR v_mismatch > 0 THEN
		RAISE EXCEPTION 'Repair check failed: % rows still dragged back, % learners whose charges do not match fee_details. Nothing was changed.', v_left, v_mismatch;
	END IF;

	RAISE NOTICE 'Repaired % learners / % rows - statuses and session charges match exam_registration_fee_details.', v_learners, v_restored;
END $$;


-- ---------------------------------------------------------------------
-- STEP 4 - CONFIRM (read-only). Run after the block above: expect 0 rows.
-- ---------------------------------------------------------------------
SELECT d.program_code, COUNT(*) AS rows_still_dragged_back
FROM public.exam_registration_fee_details d
JOIN public.exam_registrations r
	ON  r.institutions_id        = d.institutions_id
	AND r.examination_session_id = d.examination_session_id
	AND UPPER(TRIM(r.stu_register_no)) = UPPER(TRIM(d.stu_register_no))
WHERE d.registration_status = 'Approved'
  AND r.registration_status = 'Applied'
  AND r.payment_date IS NOT NULL
GROUP BY d.program_code;
