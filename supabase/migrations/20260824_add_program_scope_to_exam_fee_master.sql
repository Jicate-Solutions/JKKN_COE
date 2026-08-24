-- =====================================================
-- Migration: Scope an exam fee rate to specific programmes
-- Created: 2026-08-24
--
-- exam_fee_master prices a paper by TIER (UG / PG / MCA). That is right for the
-- circular's default rates, but a programme inside a tier sometimes carries its
-- own rate (a self-financing branch, a lateral-entry programme, a course billed
-- under a different head). Until now the only way to express that was a new
-- tier, which pollutes the tier map every other module reads.
--
-- This migration adds program_code to exam_fee_master:
--
--   program_code IS NULL  -> the tier rate; applies to every programme in the
--                            tier. This is the existing behaviour and stays the
--                            default.
--   program_code = 'BCA'  -> an override that prices only that programme.
--
-- The fee engine (lib/exam-fee/calculate.ts) resolves the programme-specific
-- row first and falls back to the tier row, so existing rates keep working
-- untouched.
--
-- Idempotent: re-running this migration has no side effects.
-- =====================================================

-- =====================================================
-- 1. PROGRAMME SCOPE COLUMN
-- =====================================================

ALTER TABLE public.exam_fee_master
	ADD COLUMN IF NOT EXISTS program_code VARCHAR(50);

COMMENT ON COLUMN public.exam_fee_master.program_code IS
	'Programme this rate is scoped to. NULL = the tier rate, applying to every programme at program_level. A non-null code overrides the tier rate for that programme only.';

-- =====================================================
-- 2. VERSION KEY NOW INCLUDES THE PROGRAMME
-- =====================================================
-- Without this, a programme override and its tier rate collide on the same
-- (institution, fee key, effective_from) and the upsert in
-- app/api/fee-details/route.ts overwrites one with the other.
--
-- NULLS NOT DISTINCT matters as much as the new column. Both program_level and
-- program_code are nullable, and under the default NULLS DISTINCT rule two rows
-- that differ in nothing but a NULL never conflict — so the ON CONFLICT upsert
-- silently INSERTS a duplicate instead of updating the rate. That already
-- affected level-independent rates (fines, examiner pay); a programme-scoped
-- rate carries a NULL level by design, so it would hit the same hole on every
-- re-save.
--
-- Before running this on a database that already holds fee rows, check for
-- duplicates the old constraint let through — the ADD CONSTRAINT below fails
-- until they are resolved:
--
--   SELECT institutions_id, fee_type, category, sub_category, program_level,
--          program_code, calc_basis, effective_from, COUNT(*)
--   FROM public.exam_fee_master
--   GROUP BY 1,2,3,4,5,6,7,8
--   HAVING COUNT(*) > 1;

ALTER TABLE public.exam_fee_master
	DROP CONSTRAINT IF EXISTS unique_exam_fee_version;

DO $$
BEGIN
	IF current_setting('server_version_num')::int >= 150000 THEN
		EXECUTE $ddl$
			ALTER TABLE public.exam_fee_master
				ADD CONSTRAINT unique_exam_fee_version UNIQUE NULLS NOT DISTINCT (
					institutions_id, fee_type, category, sub_category,
					program_level, program_code, calc_basis, effective_from
				)
		$ddl$;
	ELSE
		-- Pre-15: NULL segments of the key stay distinct, so re-saving a rate
		-- with no tier or no programme adds a row instead of updating it.
		RAISE WARNING 'PostgreSQL % is below 15 — unique_exam_fee_version created NULLS DISTINCT; re-saving a rate with a NULL program_level or program_code will duplicate it.',
			current_setting('server_version');
		EXECUTE $ddl$
			ALTER TABLE public.exam_fee_master
				ADD CONSTRAINT unique_exam_fee_version UNIQUE (
					institutions_id, fee_type, category, sub_category,
					program_level, program_code, calc_basis, effective_from
				)
		$ddl$;
	END IF;
END $$;

-- =====================================================
-- 3. LOOKUP INDEX
-- =====================================================
-- loadFeeRateBook() reads every CREDIT rate in force for an institution and
-- keys them by (sub_category, level, programme); this index serves that scan
-- and the programme-override filter on the Fee Details screen.

CREATE INDEX IF NOT EXISTS idx_exam_fee_program_scope
	ON public.exam_fee_master(institutions_id, program_code, effective_from DESC)
	WHERE program_code IS NOT NULL;

-- =====================================================
-- Migration Complete
-- =====================================================
