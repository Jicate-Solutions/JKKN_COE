-- =====================================================
-- Exam Settings Table (per-institution)
-- =====================================================
-- Purpose: Store institution-specific examination configuration,
-- starting with answer sheet bundle size (students per bundle).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.exam_settings (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	-- Institution scope (one row per institution)
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

	-- Bundle cover configuration
	students_per_bundle INTEGER NOT NULL DEFAULT 60 CHECK (students_per_bundle > 0 AND students_per_bundle <= 500),

	-- Audit
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
	updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

	-- One settings row per institution
	CONSTRAINT exam_settings_institution_unique UNIQUE (institutions_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exam_settings_institution ON public.exam_settings(institutions_id);

-- RLS Policies
ALTER TABLE public.exam_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their institution's exam settings"
	ON public.exam_settings
	FOR SELECT
	TO authenticated
	USING (true);

CREATE POLICY "Users can insert exam settings"
	ON public.exam_settings
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

CREATE POLICY "Users can update exam settings"
	ON public.exam_settings
	FOR UPDATE
	TO authenticated
	USING (true);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_exam_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = NOW();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_exam_settings_updated_at ON public.exam_settings;
CREATE TRIGGER trg_exam_settings_updated_at
	BEFORE UPDATE ON public.exam_settings
	FOR EACH ROW
	EXECUTE FUNCTION public.set_exam_settings_updated_at();

-- Comments
COMMENT ON TABLE public.exam_settings IS 'Per-institution examination configuration (bundle size, etc.)';
COMMENT ON COLUMN public.exam_settings.students_per_bundle IS 'Max number of students per answer sheet bundle cover (default 60)';
