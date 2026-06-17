-- =====================================================
-- Migration: Add revaluation_type to revaluation_registration_periods
-- Created: 2026-06-13
-- Description:
--   Support per-type revaluation windows per examination session.
--   Each (institution, session, revaluation_type) gets its own
--   start/end date so the 3 revaluation types can run on different
--   from/to dates within the same session.
--   Types: REVALUATION, RETOTALING, COPY OF ANSWER SCRIPT
-- =====================================================

-- 1. Add the revaluation_type column (defaults existing rows to 'REVALUATION')
ALTER TABLE public.revaluation_registration_periods
	ADD COLUMN IF NOT EXISTS revaluation_type VARCHAR(50) NOT NULL DEFAULT 'REVALUATION';

-- 2. Replace the old unique constraint (institution, session) with one that
--    also includes revaluation_type, so multiple type windows can coexist.
ALTER TABLE public.revaluation_registration_periods
	DROP CONSTRAINT IF EXISTS unique_session_period;

ALTER TABLE public.revaluation_registration_periods
	DROP CONSTRAINT IF EXISTS unique_session_period_type;

ALTER TABLE public.revaluation_registration_periods
	ADD CONSTRAINT unique_session_period_type
	UNIQUE (institutions_id, examination_session_id, revaluation_type);

-- 3. Index for filtering by type
--    (allowed values are governed by the revaluation_types master table —
--     see 20260613_create_revaluation_types.sql — not a static CHECK)
CREATE INDEX IF NOT EXISTS idx_revaluation_periods_type
	ON public.revaluation_registration_periods(revaluation_type);

COMMENT ON COLUMN public.revaluation_registration_periods.revaluation_type
	IS 'Revaluation type code — references revaluation_types(type_code)';

-- =====================================================
-- Migration Complete
-- =====================================================
