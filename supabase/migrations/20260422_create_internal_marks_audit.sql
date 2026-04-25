-- =====================================================
-- Internal Marks Audit + Rule Snapshot
-- Created: 2026-04-22
-- Purpose: Append-only audit trail + frozen rule snapshot on each mark row.
-- =====================================================

-- 1. Extend internal_marks with rule snapshot references -----------------------
ALTER TABLE public.internal_marks
	ADD COLUMN IF NOT EXISTS rule_snapshot     JSONB NULL,
	ADD COLUMN IF NOT EXISTS rule_snapshot_id  UUID  NULL,
	ADD COLUMN IF NOT EXISTS cia_setting_id    UUID  NULL,
	ADD COLUMN IF NOT EXISTS cia_round         INT   NULL,
	ADD COLUMN IF NOT EXISTS cia_round_name    VARCHAR(40) NULL,
	ADD COLUMN IF NOT EXISTS raw_attendance_pct NUMERIC(5,2) NULL,
	ADD COLUMN IF NOT EXISTS fetched_at        TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_im_cia_setting_id
	ON public.internal_marks(cia_setting_id)
	WHERE cia_setting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_im_cia_round
	ON public.internal_marks(cia_setting_id, cia_round)
	WHERE cia_setting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_im_rule_snapshot_id
	ON public.internal_marks(rule_snapshot_id)
	WHERE rule_snapshot_id IS NOT NULL;

COMMENT ON COLUMN public.internal_marks.rule_snapshot IS
	'Frozen JSONB snapshot of the mark_conversion_rules row at the moment of fetch/compute. Never mutated.';
COMMENT ON COLUMN public.internal_marks.cia_setting_id IS
	'NULL for legacy non-round marks; set for v2 round-based entries. Not a hard FK to avoid cascading during setting deletes.';

-- 2. Append-only audit table --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_marks_audit (
	id UUID NOT NULL DEFAULT gen_random_uuid(),
	internal_mark_id UUID NULL,  -- NULL when action is 'fetch-run' (no specific row yet)
	cia_setting_id   UUID NULL,
	cia_round        INT  NULL,
	action           VARCHAR(30) NOT NULL,  -- 'insert', 'update', 'fetch', 'lock', 'unlock', 'fetch-run'
	before_value     JSONB NULL,
	after_value      JSONB NULL,
	rule_snapshot_id UUID NULL,
	extra            JSONB NULL,            -- free-form context (e.g. {fetched: 147, missing: 3})
	performed_by     UUID NULL,
	performed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
	CONSTRAINT ima_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_ima_internal_mark_id ON public.internal_marks_audit(internal_mark_id);
CREATE INDEX IF NOT EXISTS idx_ima_cia_setting_id ON public.internal_marks_audit(cia_setting_id);
CREATE INDEX IF NOT EXISTS idx_ima_performed_at ON public.internal_marks_audit(performed_at DESC);

-- Prevent UPDATE/DELETE on audit rows
CREATE OR REPLACE FUNCTION block_ima_mutation()
RETURNS TRIGGER AS $$
BEGIN
	RAISE EXCEPTION 'internal_marks_audit is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ima_no_update BEFORE UPDATE ON public.internal_marks_audit
	FOR EACH ROW EXECUTE FUNCTION block_ima_mutation();
CREATE TRIGGER trg_ima_no_delete BEFORE DELETE ON public.internal_marks_audit
	FOR EACH ROW EXECUTE FUNCTION block_ima_mutation();

ALTER TABLE public.internal_marks_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read audit" ON public.internal_marks_audit
	FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can insert audit" ON public.internal_marks_audit
	FOR INSERT TO service_role WITH CHECK (true);

COMMENT ON TABLE public.internal_marks_audit IS 'Append-only audit trail for internal marks. UPDATE/DELETE blocked by trigger.';
