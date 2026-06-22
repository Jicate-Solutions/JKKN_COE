-- =====================================================
-- Migration: Type + UG/PG based revaluation fee rates
-- Created: 2026-06-20
-- Description:
--   The official fee circular charges per revaluation TYPE and per
--   program LEVEL (UG/PG), e.g. Revaluation UG 575 / PG 690, Retotaling
--   405, Transparency (Copy of Answer Script) 405. The legacy
--   revaluation_fee_config table is attempt-based and cannot express
--   this, so this table stores one rate per (institution, type, level).
--
--   program_level:
--     'UG'  -> applies only to UG learners
--     'PG'  -> applies only to PG learners
--     'ALL' -> applies to both (used when a type costs the same regardless
--              of level, e.g. Retotaling / Transparency)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.revaluation_fee_rates (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code VARCHAR(50) NOT NULL,

	-- type_code from revaluation_types (REVALUATION / RETOTALING / COPY OF ANSWER SCRIPT)
	revaluation_type VARCHAR(50) NOT NULL,
	program_level VARCHAR(10) NOT NULL DEFAULT 'ALL'
		CHECK (program_level IN ('UG', 'PG', 'ALL')),

	fee_per_paper NUMERIC(10, 2) NOT NULL CHECK (fee_per_paper >= 0),

	effective_from DATE NOT NULL,
	effective_to DATE,
	is_active BOOLEAN DEFAULT true,

	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	created_by UUID,
	updated_by UUID,

	CHECK (effective_to IS NULL OR effective_to >= effective_from),
	-- one rate per institution + type + level
	CONSTRAINT unique_fee_rate UNIQUE (institutions_id, revaluation_type, program_level)
);

COMMENT ON TABLE public.revaluation_fee_rates IS
	'Per-paper revaluation fees keyed by institution, revaluation type, and program level (UG/PG/ALL). Mirrors the CoE fee circular.';

CREATE INDEX IF NOT EXISTS idx_revaluation_fee_rates_lookup
	ON public.revaluation_fee_rates (institutions_id, revaluation_type, program_level)
	WHERE is_active = true;

-- Soft FK to the types master so rates always reference a real type
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.table_constraints
		WHERE table_schema = 'public'
		AND table_name = 'revaluation_fee_rates'
		AND constraint_name = 'fk_fee_rate_type'
	) THEN
		ALTER TABLE public.revaluation_fee_rates
		ADD CONSTRAINT fk_fee_rate_type
		FOREIGN KEY (revaluation_type)
		REFERENCES public.revaluation_types(type_code)
		ON UPDATE CASCADE
		ON DELETE RESTRICT;
	END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_revaluation_fee_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_revaluation_fee_rates_updated_at
	ON public.revaluation_fee_rates;

CREATE TRIGGER trigger_update_revaluation_fee_rates_updated_at
	BEFORE UPDATE ON public.revaluation_fee_rates
	FOR EACH ROW
	EXECUTE FUNCTION update_revaluation_fee_rates_updated_at();

-- =====================================================
-- Seed: J.K.K. Nataraja College of Arts & Science (CAS)
-- Ref circular JKKNCAS/Circular-01/COE/Revaluation/April-May2026/26-27
--   Revaluation  UG  575 | PG 690
--   Retotaling   ALL 405
--   Transparency ALL 405  (type_code 'COPY OF ANSWER SCRIPT')
-- effective_to kept open through the academic year so the active-window
-- check (effective_to >= current_date) passes.
-- =====================================================
INSERT INTO public.revaluation_fee_rates (
	institutions_id, institution_code, revaluation_type, program_level,
	fee_per_paper, effective_from, effective_to, is_active
)
SELECT i.id, i.institution_code, r.revaluation_type, r.program_level,
       r.fee_per_paper, DATE '2026-04-01', DATE '2027-03-31', true
FROM public.institutions i
CROSS JOIN (
	VALUES
		('REVALUATION',           'UG',  575),
		('REVALUATION',           'PG',  690),
		('RETOTALING',            'ALL', 405),
		('COPY OF ANSWER SCRIPT', 'ALL', 405)
) AS r(revaluation_type, program_level, fee_per_paper)
WHERE i.id = '5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4'
ON CONFLICT (institutions_id, revaluation_type, program_level) DO NOTHING;

-- =====================================================
-- Migration Complete
-- =====================================================
