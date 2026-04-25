-- =====================================================
-- Mark Conversion Rules
-- Created: 2026-04-22
-- Purpose: Versioned master of rules that convert raw component scores
--          (tests, attendance %, rubrics) into CIA component/round/final marks.
--          Keyed by (institutions_id, regulation_code, wef_date).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.mark_conversion_rules (
	id UUID NOT NULL DEFAULT gen_random_uuid(),

	-- Scope
	institutions_id  UUID NOT NULL,
	institution_code VARCHAR(20) NOT NULL,
	regulation_id    UUID NULL,
	regulation_code  VARCHAR(32) NULL,  -- NULL = applies to all regulations
	wef_date         DATE NOT NULL,     -- effective from (must be >= today on insert)

	-- Identity
	rule_name        VARCHAR(200) NOT NULL,
	description      TEXT,

	-- Rule body (JSONB — see docs/plans/2026-04-22-cia-entry-setting-v2.md § Schema Contracts)
	attendance_slabs JSONB NOT NULL DEFAULT '[]'::jsonb,
	component_rules  JSONB NOT NULL DEFAULT '{}'::jsonb,
	round_rules      JSONB NOT NULL DEFAULT '{}'::jsonb,
	final_rule       JSONB NOT NULL DEFAULT '{}'::jsonb,

	-- Flags
	is_active        BOOLEAN DEFAULT true,

	-- Audit
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	created_by UUID NULL,
	updated_by UUID NULL,

	CONSTRAINT mark_conversion_rules_pkey PRIMARY KEY (id),
	CONSTRAINT mcr_institutions_fk FOREIGN KEY (institutions_id)
		REFERENCES public.institutions(id) ON DELETE CASCADE,
	CONSTRAINT mcr_regulation_fk FOREIGN KEY (regulation_id)
		REFERENCES public.regulations(id) ON DELETE SET NULL,
	CONSTRAINT mcr_unique_scope UNIQUE (institutions_id, regulation_code, wef_date)
);

CREATE INDEX IF NOT EXISTS idx_mcr_institutions_id ON public.mark_conversion_rules(institutions_id);
CREATE INDEX IF NOT EXISTS idx_mcr_regulation_code ON public.mark_conversion_rules(regulation_code);
CREATE INDEX IF NOT EXISTS idx_mcr_wef_date ON public.mark_conversion_rules(wef_date DESC);
CREATE INDEX IF NOT EXISTS idx_mcr_resolution
	ON public.mark_conversion_rules(institutions_id, regulation_code, wef_date DESC)
	WHERE is_active = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_mcr_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mcr_updated_at
	BEFORE UPDATE ON public.mark_conversion_rules
	FOR EACH ROW EXECUTE FUNCTION update_mcr_updated_at();

-- RLS — service role bypasses; authenticated can read, coe_admin/super_admin can write
ALTER TABLE public.mark_conversion_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read mark conversion rules"
	ON public.mark_conversion_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage mark conversion rules"
	ON public.mark_conversion_rules FOR ALL TO authenticated
	USING (EXISTS (
		SELECT 1 FROM public.user_roles ur
		JOIN public.roles r ON ur.role_id = r.id
		WHERE ur.user_id = auth.uid()
		  AND r.name IN ('super_admin', 'coe_admin')
		  AND ur.is_active = true
	))
	WITH CHECK (true);

CREATE POLICY "Service role can manage mark conversion rules"
	ON public.mark_conversion_rules FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.mark_conversion_rules IS
	'Versioned conversion rules by (institution, regulation, wef_date). Drives CIA attendance→marks, component scaling, round roll-up, and final CIA calculation.';
COMMENT ON COLUMN public.mark_conversion_rules.wef_date IS
	'Effective from. Must be >= CURRENT_DATE at insert time; enforced at API layer, not DB.';
COMMENT ON COLUMN public.mark_conversion_rules.attendance_slabs IS
	'[{min_pct:95,max_pct:100,award_pct:100},...] — lower-bound inclusive, upper-bound inclusive.';
