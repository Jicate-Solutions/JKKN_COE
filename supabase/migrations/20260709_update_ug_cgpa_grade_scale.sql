-- =====================================================
-- CAS — UG + PG cumulative CGPA grade scales
--
-- Inserts institution-specific rows for institution_code = 'CAS' into
-- cgpa_grades (grade master) and cgpa_grade_system (CGPA band -> grade +
-- classification). Replaces any existing CAS rows. Global defaults
-- (institutions_id IS NULL) and other institutions are left untouched.
--
-- UG (13 bands):
--   CGPA              GRADE  CLASSIFICATION OF FINAL RESULT
--   9.5 - 10.0        O+     First Class with Exemplary*
--   9.0 - <9.5        O      First Class with Exemplary*
--   8.5 - <9.0        D++    First Class with Distinction*
--   8.0 - <8.5        D+     First Class with Distinction*
--   7.5 - <8.0        D      First Class with Distinction*
--   7.0 - <7.5        A++    First Class
--   6.5 - <7.0        A+     First Class
--   6.0 - <6.5        A      First Class
--   5.5 - <6.0        B+     Second Class
--   5.0 - <5.5        B      Second Class
--   4.5 - <5.0        C+     Third Class
--   4.0 - <4.5        C      Third Class
--   0.0 - <4.0        U      Re-appear
--
-- PG (11 bands): identical from O+ down to B, but there is NO Third Class —
--   0.0 - <5.0        U      Re-appear
--
-- Band matching in code is `cgpa >= min_cgpa AND cgpa <= max_cgpa` (inclusive),
-- so "below 9.5" is stored as max_cgpa 9.49 (CGPA is compared at 2 decimals).
--
-- * Exemplary/Distinction apply only to candidates who passed every course in
--   the FIRST appearance within the prescribed semesters (for PG: Core,
--   Elective and Extra Disciplinary courses alone). That check is NOT in this
--   table — it must be enforced by the result-classification code.
--
-- Idempotent: safe to re-run. Run in the Supabase SQL Editor.
-- =====================================================

-- 0. Align the live tables with the schema the app code expects.
--    (The live cgpa_grades lacks is_absent etc., so the API insert on
--    /grading/curriculum-grades would fail with the same 42703 error.)
ALTER TABLE public.cgpa_grades
  ADD COLUMN IF NOT EXISTS classification  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description     TEXT NULL,
  ADD COLUMN IF NOT EXISTS regulation_code VARCHAR NULL,
  ADD COLUMN IF NOT EXISTS qualify         BOOLEAN NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_cgpa    BOOLEAN NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_index     INTEGER NULL,
  ADD COLUMN IF NOT EXISTS is_absent       BOOLEAN NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS result_status   VARCHAR NULL,
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NULL DEFAULT true;

ALTER TABLE public.cgpa_grade_system
  ADD COLUMN IF NOT EXISTS classification  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description     TEXT NULL,
  ADD COLUMN IF NOT EXISTS regulation_code VARCHAR NULL,
  ADD COLUMN IF NOT EXISTS cgpa_grade_id   UUID NULL,
  ADD COLUMN IF NOT EXISTS grade_point     NUMERIC NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NULL DEFAULT true;

DO $$
DECLARE
  v_inst_id UUID := '5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4';
  v_inst_code VARCHAR;
BEGIN
  SELECT institution_code INTO v_inst_code
  FROM public.institutions
  WHERE id = v_inst_id;

  IF v_inst_code IS NULL THEN
    RAISE EXCEPTION 'Institution % not found', v_inst_id;
  END IF;

  -- 1. Remove existing CAS rows (bands first, then master grades)
  DELETE FROM public.cgpa_grade_system WHERE institutions_id = v_inst_id;
  DELETE FROM public.cgpa_grades       WHERE institutions_id = v_inst_id;

  -- 2. Grade master rows for CAS (13 grades, shared by UG and PG)
  INSERT INTO public.cgpa_grades
    (institutions_id, institutions_code, grade, grade_point, classification, description, qualify, exclude_cgpa, order_index, is_absent, result_status, is_active)
  VALUES
    (v_inst_id, v_inst_code, 'O+',  10.0, 'First Class with Exemplary',   'CGPA 9.5 - 10.0',               true,  false,  1, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'O',    9.0, 'First Class with Exemplary',   'CGPA 9.0 and above, below 9.5', true,  false,  2, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'D++',  8.5, 'First Class with Distinction', 'CGPA 8.5 and above, below 9.0', true,  false,  3, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'D+',   8.0, 'First Class with Distinction', 'CGPA 8.0 and above, below 8.5', true,  false,  4, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'D',    7.5, 'First Class with Distinction', 'CGPA 7.5 and above, below 8.0', true,  false,  5, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'A++',  7.0, 'First Class',                  'CGPA 7.0 and above, below 7.5', true,  false,  6, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'A+',   6.5, 'First Class',                  'CGPA 6.5 and above, below 7.0', true,  false,  7, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'A',    6.0, 'First Class',                  'CGPA 6.0 and above, below 6.5', true,  false,  8, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'B+',   5.5, 'Second Class',                 'CGPA 5.5 and above, below 6.0', true,  false,  9, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'B',    5.0, 'Second Class',                 'CGPA 5.0 and above, below 5.5', true,  false, 10, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'C+',   4.5, 'Third Class',                  'CGPA 4.5 and above, below 5.0 (UG only)', true,  false, 11, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'C',    4.0, 'Third Class',                  'CGPA 4.0 and above, below 4.5 (UG only)', true,  false, 12, false, 'PASS',          true),
    (v_inst_id, v_inst_code, 'U',    0.0, 'Re-appear',                    'Below pass CGPA (UG < 4.0, PG < 5.0)',    false, false, 13, false, 'RE-APPEARANCE', true);

  -- 3. UG CGPA bands (13), linked to the master rows via cgpa_grade_id
  INSERT INTO public.cgpa_grade_system
    (institutions_id, institutions_code, grade_system_code, cgpa_grade_id, grade, grade_point, classification, min_cgpa, max_cgpa, description, is_active)
  SELECT
    v_inst_id, v_inst_code, 'UG', g.id, g.grade, g.grade_point, b.classification, b.min_cgpa, b.max_cgpa, b.description, true
  FROM (VALUES
    ('O+'::varchar,  9.50::numeric, 10.00::numeric, 'First Class with Exemplary'::text,   'CGPA 9.5 - 10.0'::text),
    ('O'::varchar,   9.00::numeric,  9.49::numeric, 'First Class with Exemplary'::text,   'CGPA 9.0 and above but below 9.5'::text),
    ('D++'::varchar, 8.50::numeric,  8.99::numeric, 'First Class with Distinction'::text, 'CGPA 8.5 and above but below 9.0'::text),
    ('D+'::varchar,  8.00::numeric,  8.49::numeric, 'First Class with Distinction'::text, 'CGPA 8.0 and above but below 8.5'::text),
    ('D'::varchar,   7.50::numeric,  7.99::numeric, 'First Class with Distinction'::text, 'CGPA 7.5 and above but below 8.0'::text),
    ('A++'::varchar, 7.00::numeric,  7.49::numeric, 'First Class'::text,                  'CGPA 7.0 and above but below 7.5'::text),
    ('A+'::varchar,  6.50::numeric,  6.99::numeric, 'First Class'::text,                  'CGPA 6.5 and above but below 7.0'::text),
    ('A'::varchar,   6.00::numeric,  6.49::numeric, 'First Class'::text,                  'CGPA 6.0 and above but below 6.5'::text),
    ('B+'::varchar,  5.50::numeric,  5.99::numeric, 'Second Class'::text,                 'CGPA 5.5 and above but below 6.0'::text),
    ('B'::varchar,   5.00::numeric,  5.49::numeric, 'Second Class'::text,                 'CGPA 5.0 and above but below 5.5'::text),
    ('C+'::varchar,  4.50::numeric,  4.99::numeric, 'Third Class'::text,                  'CGPA 4.5 and above but below 5.0'::text),
    ('C'::varchar,   4.00::numeric,  4.49::numeric, 'Third Class'::text,                  'CGPA 4.0 and above but below 4.5'::text),
    ('U'::varchar,   0.00::numeric,  3.99::numeric, 'Re-appear'::text,                    'CGPA 0.0 and above but below 4.0'::text)
  ) AS b(grade, min_cgpa, max_cgpa, classification, description)
  JOIN public.cgpa_grades g
    ON g.grade = b.grade AND g.institutions_id = v_inst_id;

  -- 4. PG CGPA bands (11 — no Third Class; U covers 0.0 to below 5.0)
  INSERT INTO public.cgpa_grade_system
    (institutions_id, institutions_code, grade_system_code, cgpa_grade_id, grade, grade_point, classification, min_cgpa, max_cgpa, description, is_active)
  SELECT
    v_inst_id, v_inst_code, 'PG', g.id, g.grade, g.grade_point, b.classification, b.min_cgpa, b.max_cgpa, b.description, true
  FROM (VALUES
    ('O+'::varchar,  9.50::numeric, 10.00::numeric, 'First Class with Exemplary'::text,   'CGPA 9.5 - 10.0'::text),
    ('O'::varchar,   9.00::numeric,  9.49::numeric, 'First Class with Exemplary'::text,   'CGPA 9.0 and above but below 9.5'::text),
    ('D++'::varchar, 8.50::numeric,  8.99::numeric, 'First Class with Distinction'::text, 'CGPA 8.5 and above but below 9.0'::text),
    ('D+'::varchar,  8.00::numeric,  8.49::numeric, 'First Class with Distinction'::text, 'CGPA 8.0 and above but below 8.5'::text),
    ('D'::varchar,   7.50::numeric,  7.99::numeric, 'First Class with Distinction'::text, 'CGPA 7.5 and above but below 8.0'::text),
    ('A++'::varchar, 7.00::numeric,  7.49::numeric, 'First Class'::text,                  'CGPA 7.0 and above but below 7.5'::text),
    ('A+'::varchar,  6.50::numeric,  6.99::numeric, 'First Class'::text,                  'CGPA 6.5 and above but below 7.0'::text),
    ('A'::varchar,   6.00::numeric,  6.49::numeric, 'First Class'::text,                  'CGPA 6.0 and above but below 6.5'::text),
    ('B+'::varchar,  5.50::numeric,  5.99::numeric, 'Second Class'::text,                 'CGPA 5.5 and above but below 6.0'::text),
    ('B'::varchar,   5.00::numeric,  5.49::numeric, 'Second Class'::text,                 'CGPA 5.0 and above but below 5.5'::text),
    ('U'::varchar,   0.00::numeric,  4.99::numeric, 'Re-appear'::text,                    'CGPA 0.0 and above but below 5.0'::text)
  ) AS b(grade, min_cgpa, max_cgpa, classification, description)
  JOIN public.cgpa_grades g
    ON g.grade = b.grade AND g.institutions_id = v_inst_id;
END $$;

-- Verify
-- SELECT grade_system_code, grade, min_cgpa, max_cgpa, classification
-- FROM cgpa_grade_system
-- WHERE institutions_code = 'CAS'
-- ORDER BY grade_system_code, min_cgpa DESC;
