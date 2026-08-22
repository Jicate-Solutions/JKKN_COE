-- =====================================================
-- Migration: Extend exam fee configuration for the CoE exam-fee circular
-- Created: 2026-08-21
-- Reference: JKKNCAS/Circular-59/CoE/Exam Fee Sem-I,III,V/26-27
--
-- The circular prices exam papers in THREE tiers (UG / PG / MCA) and adds two
-- per-learner charges (Mark Statement, Application) plus a late fine with two
-- cut-off dates. exam_fee_master already models versioned rates but only allows
-- UG/PG, so this migration:
--
--   1. Allows 'MCA' in exam_fee_master.program_level
--   2. Adds exam_fee_program_levels — an explicit program_code -> fee tier map,
--      so MCA is never guessed from the code (the JKKN MCA code is "PCA", which
--      every UG/PG heuristic in the codebase reads as plain PG)
--   3. Adds exam_fee_schedules — the per-session cut-off dates and fine amount
--      printed on the circular
--
-- Idempotent: re-running this migration has no side effects.
-- =====================================================

-- =====================================================
-- 1. ALLOW THE MCA FEE TIER
-- =====================================================

ALTER TABLE public.exam_fee_master
	DROP CONSTRAINT IF EXISTS exam_fee_master_program_level_check;

ALTER TABLE public.exam_fee_master
	ADD CONSTRAINT exam_fee_master_program_level_check
	CHECK (program_level IN ('UG', 'PG', 'MCA') OR program_level IS NULL);

COMMENT ON COLUMN public.exam_fee_master.program_level IS
	'Fee tier: UG, PG or MCA (the circular prices MCA separately from other PG programmes). NULL = applies to every tier.';

-- =====================================================
-- 2. PROGRAM CODE -> FEE TIER MAP
-- =====================================================
-- A fee tier cannot be derived reliably from the programme code alone:
-- get_program_type_from_code() returns only UG/PG, and JKKN's MCA programme
-- code is "PCA" which matches the generic PG pattern. Rather than widen a
-- heuristic that other modules depend on, the fee module reads an explicit map
-- and falls back to the UG/PG heuristic only for unmapped programmes.

CREATE TABLE IF NOT EXISTS public.exam_fee_program_levels (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	institutions_id UUID NOT NULL,
	institution_code VARCHAR(50),

	program_code VARCHAR(50) NOT NULL,
	program_level VARCHAR(10) NOT NULL CHECK (program_level IN ('UG', 'PG', 'MCA')),

	notes TEXT,
	is_active BOOLEAN NOT NULL DEFAULT true,

	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT unique_exam_fee_program_level UNIQUE (institutions_id, program_code)
);

COMMENT ON TABLE public.exam_fee_program_levels IS
	'Explicit programme_code -> exam fee tier (UG/PG/MCA) map. Overrides the UG/PG heuristic when resolving exam fees.';

CREATE INDEX IF NOT EXISTS idx_exam_fee_program_levels_lookup
	ON public.exam_fee_program_levels(institutions_id, program_code)
	WHERE is_active = true;

-- =====================================================
-- 3. PER-SESSION FEE SCHEDULE (circular dates + fine)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.exam_fee_schedules (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	institutions_id UUID NOT NULL,
	institution_code VARCHAR(50),

	examination_session_id UUID NOT NULL,
	session_code VARCHAR(50),

	-- Provenance: which circular these dates came from
	circular_ref VARCHAR(200),
	circular_date DATE,

	-- Circular point 2 and 3
	last_date_without_fine DATE,
	last_date_with_fine DATE,
	fine_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),

	notes TEXT,
	is_active BOOLEAN NOT NULL DEFAULT true,

	created_by VARCHAR(150),
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT unique_exam_fee_schedule UNIQUE (institutions_id, examination_session_id),
	CONSTRAINT exam_fee_schedule_date_order CHECK (
		last_date_without_fine IS NULL
		OR last_date_with_fine IS NULL
		OR last_date_with_fine >= last_date_without_fine
	)
);

COMMENT ON TABLE public.exam_fee_schedules IS
	'Per examination-session exam fee cut-off dates and late fine, as published on the CoE fee circular.';
COMMENT ON COLUMN public.exam_fee_schedules.last_date_without_fine IS
	'Applications submitted on or before this date pay no fine.';
COMMENT ON COLUMN public.exam_fee_schedules.last_date_with_fine IS
	'Final date; applications after last_date_without_fine and on or before this date pay fine_amount.';

CREATE INDEX IF NOT EXISTS idx_exam_fee_schedules_session
	ON public.exam_fee_schedules(institutions_id, examination_session_id)
	WHERE is_active = true;

-- updated_at triggers (reuse the function created with exam_fee_master)
DROP TRIGGER IF EXISTS trigger_update_exam_fee_schedules_updated_at ON public.exam_fee_schedules;
CREATE TRIGGER trigger_update_exam_fee_schedules_updated_at
	BEFORE UPDATE ON public.exam_fee_schedules
	FOR EACH ROW
	EXECUTE FUNCTION update_exam_fee_master_updated_at();

DROP TRIGGER IF EXISTS trigger_update_exam_fee_program_levels_updated_at ON public.exam_fee_program_levels;
CREATE TRIGGER trigger_update_exam_fee_program_levels_updated_at
	BEFORE UPDATE ON public.exam_fee_program_levels
	FOR EACH ROW
	EXECUTE FUNCTION update_exam_fee_master_updated_at();

-- =====================================================
-- Migration Complete
-- =====================================================
