-- =====================================================
-- Migration: Create revaluation_types master table
-- Created: 2026-06-13
-- Description:
--   Master/child table for revaluation types so they can be managed
--   dynamically (added/disabled) without code changes. The
--   revaluation_registration_periods.revaluation_type column stores the
--   type_code from this table.
--   Seeds the 3 current types: REVALUATION, RETOTALING, COPY OF ANSWER SCRIPT
-- =====================================================

-- 1. Create the master table
CREATE TABLE IF NOT EXISTS public.revaluation_types (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	type_code VARCHAR(50) NOT NULL UNIQUE,
	type_name VARCHAR(150) NOT NULL,
	description TEXT,
	display_order INTEGER DEFAULT 0,
	is_active BOOLEAN DEFAULT true,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.revaluation_types IS 'Master list of revaluation types (REVALUATION, RETOTALING, COPY OF ANSWER SCRIPT, ...). Managed dynamically.';

CREATE INDEX IF NOT EXISTS idx_revaluation_types_active
	ON public.revaluation_types(is_active)
	WHERE is_active = true;

-- 2. Seed the current types (idempotent)
INSERT INTO public.revaluation_types (type_code, type_name, display_order)
VALUES
	('REVALUATION', 'Revaluation', 1),
	('RETOTALING', 'Retotaling', 2),
	('COPY OF ANSWER SCRIPT', 'Copy of Answer Script (Transparency)', 3)
ON CONFLICT (type_code) DO NOTHING;

-- 3. Ensure the periods.revaluation_type column exists (self-contained: this
--    migration does not depend on 20260613_add_revaluation_type_to_periods.sql
--    having run first).
ALTER TABLE public.revaluation_registration_periods
	ADD COLUMN IF NOT EXISTS revaluation_type VARCHAR(50) NOT NULL DEFAULT 'REVALUATION';

-- Swap the unique constraint to include revaluation_type (idempotent)
ALTER TABLE public.revaluation_registration_periods
	DROP CONSTRAINT IF EXISTS unique_session_period;

ALTER TABLE public.revaluation_registration_periods
	DROP CONSTRAINT IF EXISTS unique_session_period_type;

ALTER TABLE public.revaluation_registration_periods
	ADD CONSTRAINT unique_session_period_type
	UNIQUE (institutions_id, examination_session_id, revaluation_type);

-- Drop the old static CHECK constraint on periods (types are dynamic now)
ALTER TABLE public.revaluation_registration_periods
	DROP CONSTRAINT IF EXISTS revaluation_periods_type_check;

-- 4. Index for filtering periods by type
CREATE INDEX IF NOT EXISTS idx_revaluation_periods_type
	ON public.revaluation_registration_periods(revaluation_type);

-- 5. Soft referential integrity: ensure period type_code exists in master.
--    ON DELETE RESTRICT so a type in use cannot be deleted.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.table_constraints
		WHERE table_schema = 'public'
		AND table_name = 'revaluation_registration_periods'
		AND constraint_name = 'fk_revaluation_period_type'
	) THEN
		ALTER TABLE public.revaluation_registration_periods
		ADD CONSTRAINT fk_revaluation_period_type
		FOREIGN KEY (revaluation_type)
		REFERENCES public.revaluation_types(type_code)
		ON UPDATE CASCADE
		ON DELETE RESTRICT;
	END IF;
END $$;

-- 6. updated_at trigger
CREATE OR REPLACE FUNCTION update_revaluation_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_revaluation_types_updated_at
	ON public.revaluation_types;

CREATE TRIGGER trigger_update_revaluation_types_updated_at
	BEFORE UPDATE ON public.revaluation_types
	FOR EACH ROW
	EXECUTE FUNCTION update_revaluation_types_updated_at();

-- =====================================================
-- Migration Complete
-- =====================================================
