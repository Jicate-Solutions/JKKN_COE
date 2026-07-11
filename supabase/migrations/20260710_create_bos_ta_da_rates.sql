-- ============================================================================
-- Migration: 20260710_create_bos_ta_da_rates.sql
-- Description: TA/DA rate master for BoS external experts.
--              Configured per institution + expert category with effective
--              date ranges. Rates feed default values when creating
--              bos_ta_da_claims for a meeting.
-- Managed ONLY by super_admin (enforced at app level).
-- Run manually in the Supabase SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bos_ta_da_rates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,

  -- Expert category the rate applies to ('all' = default for any category)
  category            VARCHAR(50) NOT NULL CHECK (category IN (
    'university_nominee', 'subject_expert', 'industry_expert', 'alumni', 'all'
  )),

  -- Rates
  honorarium_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,  -- sitting fee per meeting
  da_rate_per_day     NUMERIC(8,2)  NOT NULL DEFAULT 0,  -- daily allowance
  ta_rate_per_km      NUMERIC(8,2)  NOT NULL DEFAULT 0,  -- own-vehicle travel rate
  max_travel_amount   NUMERIC(10,2),                     -- optional cap; NULL = actual fare

  -- Validity
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to        DATE,                              -- NULL = open-ended
  is_active           BOOLEAN DEFAULT true,

  notes               TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT bos_ta_da_rates_amounts_check CHECK (
    honorarium_amount >= 0 AND da_rate_per_day >= 0 AND ta_rate_per_km >= 0 AND
    (max_travel_amount IS NULL OR max_travel_amount >= 0)
  ),
  CONSTRAINT bos_ta_da_rates_dates_check CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),
  UNIQUE(institutions_id, category, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_bos_ta_da_rates_institutions
  ON bos_ta_da_rates(institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_ta_da_rates_category
  ON bos_ta_da_rates(category);
CREATE INDEX IF NOT EXISTS idx_bos_ta_da_rates_is_active
  ON bos_ta_da_rates(is_active);

COMMENT ON TABLE bos_ta_da_rates
  IS 'TA/DA rate master per institution + BoS expert category; defaults for bos_ta_da_claims';
COMMENT ON COLUMN bos_ta_da_rates.category
  IS 'Expert category the rate applies to; ''all'' acts as the institution default';
COMMENT ON COLUMN bos_ta_da_rates.max_travel_amount
  IS 'Optional reimbursement cap for travel; NULL means actual fare';

-- ============================================================================
-- Migration Complete
-- ============================================================================
