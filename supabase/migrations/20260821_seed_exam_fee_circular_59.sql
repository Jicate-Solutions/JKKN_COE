-- =====================================================
-- Seed: Exam fee rates from CoE Circular-59 (2026-27)
-- Created: 2026-08-21
-- Reference: JKKNCAS/Circular-59/CoE/Exam Fee Sem-I,III,V/26-27
--
--   S.No  Particulars                      UG    PG    MCA
--   1     Theory paper                     115   205   400
--   2     Practical paper - 3 Hrs          135   265   465
--   3     Practical paper - Above 3 Hrs    205   370    -
--   4     Internship / Project / Viva-Voce 205   400   660
--   5     Mark Statement                   150   150   150
--   6     Application                       90    90    90
--
--   Last date without fine : 09.09.2026
--   Last date with fine    : 17.09.2026  (fine Rs. 290)
--
-- Heads 1-4 are charged PER_PAPER; heads 5-6 are charged PER_STUDENT (once per
-- learner per session); the fine is FLAT.
--
-- EDIT BEFORE RUNNING if your institution / session codes differ - the two
-- literals below are the only things that need changing. The seed no-ops when
-- either lookup finds nothing, so it is safe to run on any environment.
--
-- Idempotent: re-running updates the amounts in place rather than duplicating.
-- =====================================================

DO $$
DECLARE
	-- >>> EDIT THESE TWO IF NEEDED <<<
	v_institution_code CONSTANT VARCHAR := 'CAS';
	v_session_code     CONSTANT VARCHAR := 'NOV-DEC-2026';

	-- The circular is dated June 2026; rates apply from the start of that month.
	v_effective_from   CONSTANT DATE    := DATE '2026-06-01';

	v_institution_id UUID;
	v_session_id     UUID;
BEGIN
	SELECT id INTO v_institution_id
	FROM public.institutions
	WHERE institution_code = v_institution_code
	LIMIT 1;

	IF v_institution_id IS NULL THEN
		RAISE NOTICE 'Institution % not found - exam fee seed skipped.', v_institution_code;
		RETURN;
	END IF;

	-- -------------------------------------------------
	-- 1. Per-paper and per-student rates
	-- -------------------------------------------------
	INSERT INTO public.exam_fee_master (
		institutions_id, institution_code, fee_type, category, sub_category,
		program_level, label, calc_basis, amount, effective_from, notes, is_active
	)
	SELECT
		v_institution_id,
		v_institution_code,
		'CREDIT',
		'EXAM_PAPER',
		r.sub_category,
		r.program_level,
		r.label,
		r.calc_basis,
		r.amount,
		v_effective_from,
		'Seeded from CoE Circular-59 (2026-27)',
		true
	FROM (VALUES
		('THEORY',             'UG',  'UG Theory Paper',                    'PER_PAPER',   115.00),
		('THEORY',             'PG',  'PG Theory Paper',                    'PER_PAPER',   205.00),
		('THEORY',             'MCA', 'MCA Theory Paper',                   'PER_PAPER',   400.00),

		('PRACTICAL',          'UG',  'UG Practical - up to 3 Hrs',         'PER_PAPER',   135.00),
		('PRACTICAL',          'PG',  'PG Practical - up to 3 Hrs',         'PER_PAPER',   265.00),
		('PRACTICAL',          'MCA', 'MCA Practical - up to 3 Hrs',        'PER_PAPER',   465.00),

		-- The circular prints "-" for MCA above 3 Hrs, so no MCA row exists here.
		('PRACTICAL_ABOVE_3H', 'UG',  'UG Practical - above 3 Hrs',         'PER_PAPER',   205.00),
		('PRACTICAL_ABOVE_3H', 'PG',  'PG Practical - above 3 Hrs',         'PER_PAPER',   370.00),

		('PROJECT',            'UG',  'UG Internship / Project / Viva',     'PER_PAPER',   205.00),
		('PROJECT',            'PG',  'PG Internship / Project / Viva',     'PER_PAPER',   400.00),
		('PROJECT',            'MCA', 'MCA Internship / Project / Viva',    'PER_PAPER',   660.00),

		('MARK_STATEMENT',     'UG',  'UG Mark Statement',                  'PER_STUDENT', 150.00),
		('MARK_STATEMENT',     'PG',  'PG Mark Statement',                  'PER_STUDENT', 150.00),
		('MARK_STATEMENT',     'MCA', 'MCA Mark Statement',                 'PER_STUDENT', 150.00),

		('APPLICATION',        'UG',  'UG Application Fee',                 'PER_STUDENT',  90.00),
		('APPLICATION',        'PG',  'PG Application Fee',                 'PER_STUDENT',  90.00),
		('APPLICATION',        'MCA', 'MCA Application Fee',                'PER_STUDENT',  90.00)
	) AS r(sub_category, program_level, label, calc_basis, amount)
	ON CONFLICT ON CONSTRAINT unique_exam_fee_version DO UPDATE
		SET amount    = EXCLUDED.amount,
		    label     = EXCLUDED.label,
		    is_active = true;

	-- -------------------------------------------------
	-- 2. Late fine (level-independent, so guard by hand:
	--    a NULL program_level never conflicts in a UNIQUE)
	-- -------------------------------------------------
	IF NOT EXISTS (
		SELECT 1 FROM public.exam_fee_master
		WHERE institutions_id = v_institution_id
		  AND fee_type = 'CREDIT'
		  AND category = 'FINE'
		  AND sub_category = 'LATE_FEE'
		  AND effective_from = v_effective_from
	) THEN
		INSERT INTO public.exam_fee_master (
			institutions_id, institution_code, fee_type, category, sub_category,
			program_level, label, calc_basis, amount, effective_from, notes, is_active
		) VALUES (
			v_institution_id, v_institution_code, 'CREDIT', 'FINE', 'LATE_FEE',
			NULL, 'Late Exam Fee Fine', 'FLAT', 290.00, v_effective_from,
			'Seeded from CoE Circular-59 (2026-27)', true
		);
	ELSE
		UPDATE public.exam_fee_master
		SET amount = 290.00, is_active = true
		WHERE institutions_id = v_institution_id
		  AND fee_type = 'CREDIT'
		  AND category = 'FINE'
		  AND sub_category = 'LATE_FEE'
		  AND effective_from = v_effective_from;
	END IF;

	-- -------------------------------------------------
	-- 3. Programme -> fee tier map (MCA is "PCA" at JKKN)
	-- -------------------------------------------------
	INSERT INTO public.exam_fee_program_levels (
		institutions_id, institution_code, program_code, program_level, notes, is_active
	)
	SELECT v_institution_id, v_institution_code, m.program_code, 'MCA',
	       'MCA is priced separately on CoE Circular-59', true
	FROM (VALUES ('PCA'), ('MCA')) AS m(program_code)
	ON CONFLICT ON CONSTRAINT unique_exam_fee_program_level DO UPDATE
		SET program_level = EXCLUDED.program_level,
		    is_active     = true;

	-- -------------------------------------------------
	-- 4. Cut-off dates + fine for the session
	-- -------------------------------------------------
	SELECT id INTO v_session_id
	FROM public.examination_sessions
	WHERE session_code = v_session_code
	  AND institutions_id = v_institution_id
	LIMIT 1;

	IF v_session_id IS NULL THEN
		RAISE NOTICE 'Session % not found for institution % - fee schedule skipped (rates were still seeded).',
			v_session_code, v_institution_code;
		RETURN;
	END IF;

	INSERT INTO public.exam_fee_schedules (
		institutions_id, institution_code, examination_session_id, session_code,
		circular_ref, circular_date,
		last_date_without_fine, last_date_with_fine, fine_amount, is_active
	) VALUES (
		v_institution_id, v_institution_code, v_session_id, v_session_code,
		'JKKNCAS/Circular-59/CoE/Exam Fee Sem-I,III,V/26-27', v_effective_from,
		DATE '2026-09-09', DATE '2026-09-17', 290.00, true
	)
	ON CONFLICT ON CONSTRAINT unique_exam_fee_schedule DO UPDATE
		SET circular_ref            = EXCLUDED.circular_ref,
		    circular_date           = EXCLUDED.circular_date,
		    last_date_without_fine  = EXCLUDED.last_date_without_fine,
		    last_date_with_fine     = EXCLUDED.last_date_with_fine,
		    fine_amount             = EXCLUDED.fine_amount,
		    is_active               = true;
END $$;

-- =====================================================
-- Seed Complete
-- =====================================================
