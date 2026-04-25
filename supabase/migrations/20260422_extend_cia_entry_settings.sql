-- =====================================================
-- CIA Entry Settings — add default conversion rule reference
-- Created: 2026-04-22
-- =====================================================

ALTER TABLE public.cia_entry_settings
	ADD COLUMN IF NOT EXISTS conversion_rule_id UUID NULL;

ALTER TABLE public.cia_entry_settings
	ADD CONSTRAINT ces_conversion_rule_fk
	FOREIGN KEY (conversion_rule_id)
	REFERENCES public.mark_conversion_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ces_conversion_rule_id
	ON public.cia_entry_settings(conversion_rule_id)
	WHERE conversion_rule_id IS NOT NULL;

COMMENT ON COLUMN public.cia_entry_settings.conversion_rule_id IS
	'Default conversion rule for all rounds in this setting. Per-round override stored inside cia_rounds JSONB.';
