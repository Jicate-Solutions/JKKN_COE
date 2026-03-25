-- =====================================================
-- Bundle Covers Table
-- =====================================================
-- Purpose: Track generated answer sheet bundle covers
-- =====================================================

CREATE TABLE IF NOT EXISTS public.bundle_covers (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	-- Examination Details
	examination_session_id UUID REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
	session_code TEXT NOT NULL,
	exam_date DATE NOT NULL,
	session TEXT NOT NULL CHECK (session IN ('FN', 'AN')),

	-- Program & Course Details
	program_code TEXT NOT NULL,
	program_name TEXT NOT NULL,
	subject_code TEXT NOT NULL,
	subject_name TEXT NOT NULL,

	-- Bundle Information
	total_students INTEGER NOT NULL CHECK (total_students > 0),
	total_bundles INTEGER NOT NULL CHECK (total_bundles > 0),

	-- Metadata
	generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
	generated_at TIMESTAMPTZ DEFAULT NOW(),
	pdf_url TEXT,

	-- Audit
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_bundle_covers_session ON public.bundle_covers(examination_session_id);
CREATE INDEX idx_bundle_covers_session_code ON public.bundle_covers(session_code);
CREATE INDEX idx_bundle_covers_program ON public.bundle_covers(program_code);
CREATE INDEX idx_bundle_covers_subject ON public.bundle_covers(subject_code);
CREATE INDEX idx_bundle_covers_exam_date ON public.bundle_covers(exam_date);

-- RLS Policies
ALTER TABLE public.bundle_covers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bundle covers"
	ON public.bundle_covers
	FOR SELECT
	TO authenticated
	USING (true);

CREATE POLICY "Users can insert bundle covers"
	ON public.bundle_covers
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

CREATE POLICY "Users can update their own bundle covers"
	ON public.bundle_covers
	FOR UPDATE
	TO authenticated
	USING (generated_by = auth.uid());

-- Comments
COMMENT ON TABLE public.bundle_covers IS 'Tracks generated exam answer sheet bundle cover PDFs';
COMMENT ON COLUMN public.bundle_covers.session IS 'FN (Forenoon) or AN (Afternoon)';
COMMENT ON COLUMN public.bundle_covers.total_bundles IS 'Number of bundles generated (60 students per bundle)';
