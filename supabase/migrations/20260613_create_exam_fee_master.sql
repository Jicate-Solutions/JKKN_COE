-- =====================================================
-- Migration: Create exam_fee_master table
-- Created: 2026-06-13
-- Description:
--   Institution-wise master of ALL exam-related fee amounts.
--   A single unified table holds both:
--     * CREDIT items  — fees collected FROM learners
--                       (exam paper fee, revaluation, retotaling,
--                        copy of answer script, hall-ticket missing fine)
--     * DEBIT items   — amounts PAID OUT to staff/examiners
--                       (hall supervisor day/session/per-km/practical,
--                        internal/external examiner, QP quartering,
--                        paper evaluation)
--
--   Versioned by effective_from ("w.e.f"). A rate change is a NEW row
--   with a new effective_from; old rows are kept for audit / back-dated
--   calculation. The "current" amount for a fee key is the row with the
--   greatest effective_from <= the calculation date.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.exam_fee_master (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	-- Tenant
	institutions_id UUID NOT NULL,
	institution_code VARCHAR(50),

	-- Classification
	fee_type VARCHAR(10) NOT NULL CHECK (fee_type IN ('CREDIT', 'DEBIT')),
	category VARCHAR(50) NOT NULL,        -- EXAM_PAPER, REVALUATION, FINE, SUPERVISOR, EXAMINER, QP_HANDLING, EVALUATION
	sub_category VARCHAR(60) NOT NULL,    -- THEORY, PRACTICAL, PROJECT, RETOTALING, INTERNAL_EXAMINER ...
	program_level VARCHAR(10) CHECK (program_level IN ('UG', 'PG') OR program_level IS NULL),

	-- A human-readable label for the fee item (e.g. "UG Theory Paper Fee")
	label VARCHAR(150) NOT NULL,

	-- How the amount is charged / paid
	calc_basis VARCHAR(20) NOT NULL CHECK (
		calc_basis IN ('FLAT', 'PER_PAPER', 'PER_STUDENT', 'PER_DAY', 'PER_SESSION', 'PER_KM')
	),
	amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
	currency VARCHAR(5) NOT NULL DEFAULT 'INR',

	-- Versioning ("with effect from")
	effective_from DATE NOT NULL,

	notes TEXT,
	is_active BOOLEAN NOT NULL DEFAULT true,

	created_by VARCHAR(150),
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	-- Only one amount per fee key per effective date (re-applying the same
	-- date overwrites via upsert in the API).
	CONSTRAINT unique_exam_fee_version UNIQUE (
		institutions_id, fee_type, category, sub_category, program_level, calc_basis, effective_from
	)
);

COMMENT ON TABLE public.exam_fee_master IS
	'Institution-wise master of exam-related fees. CREDIT = collected from learners, DEBIT = paid to staff/examiners. Versioned by effective_from.';
COMMENT ON COLUMN public.exam_fee_master.calc_basis IS
	'How the amount applies: FLAT, PER_PAPER, PER_STUDENT, PER_DAY, PER_SESSION, PER_KM';
COMMENT ON COLUMN public.exam_fee_master.effective_from IS
	'w.e.f date. Current amount = row with greatest effective_from <= calc date for the fee key.';

-- Indexes for the common lookups
CREATE INDEX IF NOT EXISTS idx_exam_fee_institution
	ON public.exam_fee_master(institutions_id);

CREATE INDEX IF NOT EXISTS idx_exam_fee_lookup
	ON public.exam_fee_master(institutions_id, fee_type, category, sub_category, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_exam_fee_active
	ON public.exam_fee_master(is_active)
	WHERE is_active = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_exam_fee_master_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_exam_fee_master_updated_at
	ON public.exam_fee_master;

CREATE TRIGGER trigger_update_exam_fee_master_updated_at
	BEFORE UPDATE ON public.exam_fee_master
	FOR EACH ROW
	EXECUTE FUNCTION update_exam_fee_master_updated_at();

-- =====================================================
-- Migration Complete
-- =====================================================
