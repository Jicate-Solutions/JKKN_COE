-- =====================================================
-- Institution Seating Settings (per-institution)
-- =====================================================
-- Purpose: Store per-institution seating allocation rule defaults.
-- Each institution can independently enable/disable the 5 rules
-- that govern auto-allocation; users can further override per
-- allocation run.
--
-- Rules:
--  1. Minimize Rooms — pack rooms before opening new ones
--  2. Same Program Separation — no same program in same row across cols
--  3. Shared Course in C2 — shared course codes restricted to C1/C3
--  4. Room Continuity — same program stays in continuous rooms
--  5. Equal Distribution — avoid sparse last rooms (re-run with denser target)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.institution_seating_settings (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	-- Institution scope (one row per institution)
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

	-- Rule toggles — defaults all ON (existing algorithm behaviour)
	rule_1_minimize_rooms BOOLEAN NOT NULL DEFAULT TRUE,
	rule_2_same_program_separation BOOLEAN NOT NULL DEFAULT TRUE,
	rule_3_shared_course_c2 BOOLEAN NOT NULL DEFAULT TRUE,
	rule_4_room_continuity BOOLEAN NOT NULL DEFAULT TRUE,
	rule_5_equal_distribution BOOLEAN NOT NULL DEFAULT TRUE,

	-- Audit
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
	updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

	-- One settings row per institution
	CONSTRAINT institution_seating_settings_unique UNIQUE (institutions_id)
);

CREATE INDEX IF NOT EXISTS idx_institution_seating_settings_institution
	ON public.institution_seating_settings(institutions_id);

-- RLS
ALTER TABLE public.institution_seating_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view institution seating settings"
	ON public.institution_seating_settings
	FOR SELECT
	TO authenticated
	USING (true);

CREATE POLICY "Users can insert institution seating settings"
	ON public.institution_seating_settings
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

CREATE POLICY "Users can update institution seating settings"
	ON public.institution_seating_settings
	FOR UPDATE
	TO authenticated
	USING (true);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_institution_seating_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = NOW();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_institution_seating_settings_updated_at
	ON public.institution_seating_settings;

CREATE TRIGGER trg_institution_seating_settings_updated_at
	BEFORE UPDATE ON public.institution_seating_settings
	FOR EACH ROW
	EXECUTE FUNCTION public.set_institution_seating_settings_updated_at();

COMMENT ON TABLE public.institution_seating_settings IS
	'Per-institution defaults for seating allocation rule toggles';
COMMENT ON COLUMN public.institution_seating_settings.rule_1_minimize_rooms IS
	'Rule 1: pack rooms to full capacity before opening new ones';
COMMENT ON COLUMN public.institution_seating_settings.rule_2_same_program_separation IS
	'Rule 2: students from the same program must not be in the same row across columns';
COMMENT ON COLUMN public.institution_seating_settings.rule_3_shared_course_c2 IS
	'Rule 3: shared course codes restricted to C1/C3 (never C2)';
COMMENT ON COLUMN public.institution_seating_settings.rule_4_room_continuity IS
	'Rule 4: same program stays in consecutive rooms';
COMMENT ON COLUMN public.institution_seating_settings.rule_5_equal_distribution IS
	'Rule 5: re-run allocation when last room is sparse to avoid uneven fill';
