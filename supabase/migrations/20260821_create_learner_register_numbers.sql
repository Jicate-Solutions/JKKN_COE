-- =====================================================
-- Migration: Generated learner register numbers
-- Created: 2026-08-21
-- Description:
--   Backing store for the "Generate Register Number" page
--   (/users/generate-register-number).
--
--   Learner master data lives in MyJKKN and is read-only from COE, so a
--   register number issued by the CoE cannot be written back to the learner
--   profile. This table is the COE-side record of what was issued: one row
--   per learner per institution, carrying the cohort it was generated for
--   (program + semester) and the prefix/start rule that produced it.
--
--   Numbering rule (mirrors the UI):
--     register_number = prefix || lpad(serial_no, length(start_number), '0')
--   e.g. prefix 'BCS26', start_number '001' -> BCS26001, BCS26002, ...
--   The zero-padding width is the LENGTH of start_number, so '1' yields
--   unpadded numbers and '0001' yields four digits.
--
--   Learners are sorted by name A-Z within the cohort before numbering.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.learner_register_numbers (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	-- Institution (COE side)
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code VARCHAR(50),

	-- Cohort the number was generated for
	program_code VARCHAR(50) NOT NULL,
	program_name TEXT,
	-- semester_code is the cohort key, not semester_id: course_mapping rows
	-- predating the semester sync carry a NULL semester_id, so the code is the
	-- only value guaranteed present for every semester.
	semester_code VARCHAR(50) NOT NULL,
	semester_id UUID,
	semester_number INTEGER,

	-- Learner (MyJKKN learner profile — id is the MyJKKN UUID, kept as TEXT
	-- because COE holds no FK-able mirror of learners_profiles)
	learner_id TEXT NOT NULL,
	learner_name TEXT NOT NULL,
	roll_number TEXT,
	-- Whatever register number the learner already carried in MyJKKN at
	-- generation time (blank for fresh admissions). Kept for audit only.
	previous_register_number TEXT,

	-- The issued number
	register_number TEXT NOT NULL,
	serial_no INTEGER NOT NULL,
	prefix VARCHAR(50) NOT NULL,
	start_number VARCHAR(20) NOT NULL,

	-- Audit
	generated_by UUID,
	generated_at TIMESTAMPTZ DEFAULT NOW(),
	is_active BOOLEAN DEFAULT true,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),

	-- A register number is unique within an institution
	CONSTRAINT unique_register_number_per_institution
		UNIQUE (institutions_id, register_number),
	-- A learner holds at most one issued register number per institution
	CONSTRAINT unique_learner_per_institution
		UNIQUE (institutions_id, learner_id)
);

COMMENT ON TABLE public.learner_register_numbers IS
	'Register numbers issued by the CoE to learners, generated program-wise in A-Z name order from a prefix + start number. MyJKKN is read-only, so this is the COE system of record for issued numbers.';

COMMENT ON COLUMN public.learner_register_numbers.start_number IS
	'Kept as text — its LENGTH is the zero-padding width (''001'' -> 3 digits).';

-- Cohort lookup: the page loads every number already issued for
-- institution + program + semester before previewing.
CREATE INDEX IF NOT EXISTS idx_learner_register_numbers_cohort
	ON public.learner_register_numbers (institutions_id, program_code, semester_code);

-- Reverse lookup by learner across institutions
CREATE INDEX IF NOT EXISTS idx_learner_register_numbers_learner
	ON public.learner_register_numbers (learner_id);

-- Lookup by the issued number itself (verification / search)
CREATE INDEX IF NOT EXISTS idx_learner_register_numbers_number
	ON public.learner_register_numbers (register_number);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_learner_register_numbers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_learner_register_numbers_updated_at
	ON public.learner_register_numbers;

CREATE TRIGGER trigger_update_learner_register_numbers_updated_at
	BEFORE UPDATE ON public.learner_register_numbers
	FOR EACH ROW
	EXECUTE FUNCTION update_learner_register_numbers_updated_at();

-- =====================================================
-- Page permission for the sidebar entry
-- (naming convention: page.<url with / -> . and - -> _>.view)
-- =====================================================
WITH page_perms(name, description, resource, role_names) AS (
	VALUES (
		'page.users.generate_register_number.view',
		'Access Generate Register Number page',
		'page.users.generate_register_number',
		ARRAY['super_admin', 'coe']::text[]
	)
),
upsert_perms AS (
	INSERT INTO public.permissions (name, description, resource, action, is_active)
	SELECT name, description, resource, 'view', true FROM page_perms
	ON CONFLICT (name) DO UPDATE
		SET description = EXCLUDED.description,
		    resource    = EXCLUDED.resource,
		    is_active   = true
	RETURNING id, name
),
exploded AS (
	SELECT up.id AS permission_id, unnest(pp.role_names) AS role_name
	FROM page_perms pp
	JOIN upsert_perms up ON up.name = pp.name
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, e.permission_id
FROM exploded e
JOIN public.roles r ON r.name = e.role_name
WHERE r.is_active IS NOT FALSE
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================
-- Migration Complete
-- =====================================================
