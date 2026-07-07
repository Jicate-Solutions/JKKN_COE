-- =====================================================
-- CGPA cumulative-grade tables (mirror of grades / grade_system)
--
-- Same structure as the mark-based `grades` and `grade_system` tables, but
-- keyed on the CGPA scale (0–10) instead of marks (0–100). Used by the
-- consolidated marksheet to print a cumulative GRADE + CLASSIFICATION derived
-- from a learner's overall CGPA.
--
--   cgpa_grades        — master list (mirror of `grades`) + classification
--   cgpa_grade_system  — CGPA band (min_cgpa..max_cgpa) → grade + classification
--                        (mirror of `grade_system`, min_mark/max_mark → min_cgpa/max_cgpa)
--
-- institutions_id / regulation_id are left NULLABLE (they are NOT NULL on the
-- source tables) so a set of GLOBAL DEFAULT rows (institutions_id = NULL) can be
-- seeded and used as a fallback when an institution has no rows of its own.
--
-- Run this file in the Supabase SQL Editor.
-- =====================================================

-- ---------- cgpa_grades (mirror of grades) ----------
CREATE TABLE IF NOT EXISTS public.cgpa_grades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id   UUID NULL,
  institutions_code VARCHAR NULL,
  grade             VARCHAR NOT NULL,
  grade_point       NUMERIC NULL DEFAULT 0,
  classification    TEXT NOT NULL DEFAULT '',
  description       TEXT NULL,
  regulation_id     BIGINT NULL,
  regulation_code   VARCHAR NULL,
  qualify           BOOLEAN NULL DEFAULT false,
  exclude_cgpa      BOOLEAN NULL DEFAULT false,
  order_index       INTEGER NULL,
  is_absent         BOOLEAN NULL DEFAULT false,
  result_status     VARCHAR NULL,
  grade_category    VARCHAR(20) NULL DEFAULT 'mark',
  is_active         BOOLEAN NULL DEFAULT true,
  created_at        TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NULL DEFAULT NOW(),
  -- regulation_id is UUID (matching grade_system), no FK to regulations (mirrors live schema)
  CONSTRAINT fk_cgpa_grades_institutions FOREIGN KEY (institutions_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT cgpa_grades_grade_category_check CHECK (grade_category IN ('mark', 'comment'))
);

CREATE INDEX IF NOT EXISTS idx_cgpa_grades_institutions_id ON public.cgpa_grades(institutions_id);
CREATE INDEX IF NOT EXISTS idx_cgpa_grades_regulation_id ON public.cgpa_grades(regulation_id);
CREATE INDEX IF NOT EXISTS idx_cgpa_grades_grade ON public.cgpa_grades(grade);

-- ---------- cgpa_grade_system (mirror of grade_system) ----------
CREATE TABLE IF NOT EXISTS public.cgpa_grade_system (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  institutions_id   UUID NULL,
  institutions_code VARCHAR NULL,
  grade_system_code VARCHAR NOT NULL,
  cgpa_grade_id     UUID NULL,
  grade             VARCHAR NOT NULL,
  grade_point       NUMERIC NULL DEFAULT 0,
  classification    TEXT NOT NULL DEFAULT '',
  min_cgpa          NUMERIC NOT NULL,
  max_cgpa          NUMERIC NOT NULL,
  description       TEXT NULL,
  regulation_id     UUID NULL,
  regulation_code   VARCHAR NULL,
  is_active         BOOLEAN NULL DEFAULT true,
  created_at        TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT cgpa_grade_system_pkey PRIMARY KEY (id),
  CONSTRAINT fk_cgpa_grade_system_grades FOREIGN KEY (cgpa_grade_id) REFERENCES cgpa_grades (id) ON DELETE SET NULL,
  CONSTRAINT fk_cgpa_grade_system_institutions FOREIGN KEY (institutions_id) REFERENCES institutions (id) ON DELETE CASCADE,
  -- regulation_id is UUID (matching grade_system), no FK to regulations (mirrors live schema)
  CONSTRAINT check_cgpa_range CHECK (min_cgpa <= max_cgpa),
  CONSTRAINT check_cgpa_system_code CHECK (grade_system_code IN ('UG', 'PG'))
);

CREATE INDEX IF NOT EXISTS idx_cgpa_grade_system_institutions_id ON public.cgpa_grade_system(institutions_id);
CREATE INDEX IF NOT EXISTS idx_cgpa_grade_system_cgpa_grade_id ON public.cgpa_grade_system(cgpa_grade_id);
CREATE INDEX IF NOT EXISTS idx_cgpa_grade_system_is_active ON public.cgpa_grade_system(is_active);
CREATE INDEX IF NOT EXISTS idx_cgpa_grade_system_min_max_cgpa ON public.cgpa_grade_system(min_cgpa, max_cgpa);
CREATE INDEX IF NOT EXISTS idx_cgpa_grade_system_code ON public.cgpa_grade_system(grade_system_code);

-- ---------- updated_at triggers (mirror source tables) ----------
CREATE OR REPLACE FUNCTION update_cgpa_grades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_cgpa_grades_updated_at ON cgpa_grades;
CREATE TRIGGER trigger_update_cgpa_grades_updated_at
BEFORE UPDATE ON cgpa_grades
FOR EACH ROW
EXECUTE FUNCTION update_cgpa_grades_updated_at();

CREATE OR REPLACE FUNCTION update_cgpa_grade_system_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_cgpa_grade_system_updated_at ON cgpa_grade_system;
CREATE TRIGGER trigger_update_cgpa_grade_system_updated_at
BEFORE UPDATE ON cgpa_grade_system
FOR EACH ROW
EXECUTE FUNCTION update_cgpa_grade_system_updated_at();

-- ---------- Comments ----------
COMMENT ON TABLE public.cgpa_grades IS 'CGPA-based cumulative grade definitions (mirror of grades, keyed on CGPA 0-10)';
COMMENT ON TABLE public.cgpa_grade_system IS 'CGPA band (min_cgpa..max_cgpa) -> cumulative grade + classification (mirror of grade_system)';
COMMENT ON COLUMN public.cgpa_grade_system.classification IS 'Overall class label for the band (e.g. First Class with Distinction)';
COMMENT ON COLUMN public.cgpa_grade_system.min_cgpa IS 'Minimum CGPA (inclusive) for this cumulative grade';
COMMENT ON COLUMN public.cgpa_grade_system.max_cgpa IS 'Maximum CGPA (inclusive) for this cumulative grade';

-- =====================================================
-- GLOBAL DEFAULT rows (institutions_id = NULL). Idempotent: skips if present.
-- =====================================================
INSERT INTO public.cgpa_grades (institutions_id, institutions_code, grade, grade_point, classification, description, order_index, is_active)
SELECT * FROM (VALUES
  (NULL::uuid, NULL::varchar, 'O'::varchar,  10::numeric, 'First Class with Distinction'::text, 'Outstanding'::text,    1, true),
  (NULL::uuid, NULL::varchar, 'A+'::varchar,  9::numeric, 'First Class with Distinction'::text, 'Excellent'::text,      2, true),
  (NULL::uuid, NULL::varchar, 'A'::varchar,   8::numeric, 'First Class'::text,                  'Very Good'::text,       3, true),
  (NULL::uuid, NULL::varchar, 'B+'::varchar,  7::numeric, 'First Class'::text,                  'Good'::text,            4, true),
  (NULL::uuid, NULL::varchar, 'B'::varchar,   6::numeric, 'Second Class'::text,                 'Above Average'::text,   5, true),
  (NULL::uuid, NULL::varchar, 'C'::varchar,   5::numeric, 'Second Class'::text,                 'Average'::text,         6, true),
  (NULL::uuid, NULL::varchar, 'U'::varchar,   0::numeric, 'Re-Appear'::text,                    'Re-Appear'::text,       7, true)
) AS v(institutions_id, institutions_code, grade, grade_point, classification, description, order_index, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.cgpa_grades WHERE institutions_id IS NULL);

-- CGPA bands for BOTH UG and PG (same default scale). min..max are inclusive.
INSERT INTO public.cgpa_grade_system (institutions_id, institutions_code, grade_system_code, grade, grade_point, classification, min_cgpa, max_cgpa, description, is_active)
SELECT g.institutions_id, g.institutions_code, sc.code, g.grade, g.grade_point, g.classification, g.min_cgpa, g.max_cgpa, g.description, true
FROM (VALUES
  (NULL::uuid, NULL::varchar, 'O'::varchar,  10::numeric, 'First Class with Distinction'::text, 9.00::numeric, 10.00::numeric, 'Outstanding'::text),
  (NULL::uuid, NULL::varchar, 'A+'::varchar,  9::numeric, 'First Class with Distinction'::text, 8.50::numeric,  8.99::numeric, 'Excellent'::text),
  (NULL::uuid, NULL::varchar, 'A+'::varchar,  9::numeric, 'First Class'::text,                  8.00::numeric,  8.49::numeric, 'Excellent'::text),
  (NULL::uuid, NULL::varchar, 'A'::varchar,   8::numeric, 'First Class'::text,                  7.00::numeric,  7.99::numeric, 'Very Good'::text),
  (NULL::uuid, NULL::varchar, 'B+'::varchar,  7::numeric, 'First Class'::text,                  6.00::numeric,  6.99::numeric, 'Good'::text),
  (NULL::uuid, NULL::varchar, 'B'::varchar,   6::numeric, 'Second Class'::text,                 5.50::numeric,  5.99::numeric, 'Above Average'::text),
  (NULL::uuid, NULL::varchar, 'C'::varchar,   5::numeric, 'Second Class'::text,                 5.00::numeric,  5.49::numeric, 'Average'::text),
  (NULL::uuid, NULL::varchar, 'U'::varchar,   0::numeric, 'Re-Appear'::text,                    0.00::numeric,  4.99::numeric, 'Re-Appear'::text)
) AS g(institutions_id, institutions_code, grade, grade_point, classification, min_cgpa, max_cgpa, description)
CROSS JOIN (VALUES ('UG'), ('PG')) AS sc(code)
WHERE NOT EXISTS (SELECT 1 FROM public.cgpa_grade_system WHERE institutions_id IS NULL);
