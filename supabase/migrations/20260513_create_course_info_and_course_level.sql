-- =====================================================
-- Migration: course_info table + course_level/course_type_code on courses
-- Date: 2026-05-13
-- =====================================================
-- 1. Creates `course_info` master table to drive the Course Type dropdown
--    on the /master/courses page. Replaces the hardcoded COURSE_TYPES array.
-- 2. Adds `course_level` (Roman numeral I–XX, nullable) and `course_type_code`
--    (auto-generated combined value, nullable) columns to `courses`.
-- 3. Installs a BEFORE INSERT/UPDATE trigger that fills `course_type_code` as:
--      - display_code-LEVEL   (when course_level provided, e.g. 'Core-I')
--      - display_code         (when course_level is NULL, e.g. 'Core')
--      - NULL                 (when course_type has no match in course_info)
-- 4. Seeds 46 entries (45 from the spec + 'Total Contact Period' from legacy
--    list). 'Non Major Elective' is seeded as 'NME' to avoid clashing with
--    'Naanmuthalvan' (NM) when forming course_type_code.
-- =====================================================

-- -----------------------------------------------------
-- 1. course_info table
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_info (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_type   TEXT NOT NULL UNIQUE,
  display_code  TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  status        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_info_status ON public.course_info(status);
CREATE INDEX IF NOT EXISTS idx_course_info_sort_order ON public.course_info(sort_order);

-- updated_at trigger (uses existing helper if present)
CREATE OR REPLACE FUNCTION public.tg_course_info_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_course_info_updated_at ON public.course_info;
CREATE TRIGGER trg_course_info_updated_at
BEFORE UPDATE ON public.course_info
FOR EACH ROW EXECUTE FUNCTION public.tg_course_info_set_updated_at();

-- -----------------------------------------------------
-- 2. Seed course_info
-- -----------------------------------------------------
INSERT INTO public.course_info (course_type, display_code, sort_order) VALUES
  ('Ability Enhancement',                              'Ability Enhancement',                              1),
  ('Additional Credit course',                         'Additional Credit course',                         2),
  ('Advance learner course',                           'Advance learner course',                           3),
  ('Audit Course',                                     'Audit Course',                                     4),
  ('Bridge course',                                    'Bridge course',                                    5),
  ('Core Practical',                                   'Core Practical',                                   6),
  ('Core',                                             'Core',                                             7),
  ('Discipline Specific elective Practical',           'DSEP',                                             8),
  ('Discipline Specific elective',                     'DSE',                                              9),
  ('Elective Practical',                               'Elective Practical',                              10),
  ('Elective',                                         'Elective',                                        11),
  ('English',                                          'English',                                         12),
  ('Extra Disciplinary Elective Practical',            'EDEP',                                            13),
  ('Extra Disciplinary',                               'ED',                                              14),
  ('Foundation Course',                                'Foundation Course',                               15),
  ('Generic Elective Practical',                       'Generic Elective Practical',                      16),
  ('Generic Elective',                                 'Generic Elective',                                17),
  ('Internship',                                       'Internship',                                      18),
  ('Language',                                         'Language',                                        19),
  ('Naanmuthalvan',                                    'NM',                                              20),
  ('Non Academic',                                     'Non Academic',                                    21),
  ('Non Major Elective Practical',                     'NMEP',                                            22),
  ('Non Major Elective',                               'NME',                                             23),
  ('Practical',                                        'Practical',                                       24),
  ('Project',                                          'Project',                                         25),
  ('Skill Enhancement Practical',                      'SECP',                                            26),
  ('Skill Enhancement',                                'SEC',                                             27),
  ('Humanities, Social Sciences & Management Courses', 'Humanities, Social Sciences & Management Courses', 28),
  ('Basic Science Courses',                            'Basic Science Courses',                           29),
  ('Engineering Science Courses',                      'Engineering Science Courses',                     30),
  ('Employability Enhancement Courses',                'Employability Enhancement Courses',               31),
  ('Professional Core Courses',                        'Professional Core Courses',                       32),
  ('Programme Core',                                   'Programme Core',                                  33),
  ('Programme Elective',                               'Programme Elective',                              34),
  ('Open Elective Courses',                            'Open Elective Courses',                           35),
  ('Mandatory Courses',                                'Mandatory Courses',                               36),
  ('Engineering Science (General)',                    'Engineering Science (General)',                   37),
  ('Basic Science',                                    'Basic Science',                                   38),
  ('Humanities',                                       'Humanities',                                      39),
  ('Skill Development',                                'Skill Development',                               40),
  ('Self Learning',                                    'Self Learning',                                   41),
  ('Project Work',                                     'Project Work',                                    42),
  ('Internship cum Project Work',                      'Internship cum Project Work',                     43),
  ('Lab Integrated Theory',                            'Lab Integrated Theory',                           44),
  ('Department Intro Course',                          'Department Intro Course',                         45),
  ('Total Contact Period',                             'Total Contact Period',                            46)
ON CONFLICT (course_type) DO UPDATE
  SET display_code = EXCLUDED.display_code,
      sort_order   = EXCLUDED.sort_order;

-- -----------------------------------------------------
-- 3. Add course_level + course_type_code to courses
-- -----------------------------------------------------
-- Drop the legacy hardcoded CHECK constraint on course_type so the dropdown
-- can be driven entirely by course_info (which now supports 46+ types and
-- can grow without a schema change).
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS course_course_type_check;

-- Also drop alternate-name variants if they exist (defensive)
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_course_type_check;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS course_level     TEXT NULL,
  ADD COLUMN IF NOT EXISTS course_type_code TEXT NULL;

-- Allowed levels (Roman numerals I..XX) — soft constraint, NULL allowed
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_course_level_chk;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_course_level_chk
  CHECK (
    course_level IS NULL
    OR course_level IN (
      'I','II','III','IV','V','VI','VII','VIII','IX','X',
      'XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'
    )
  );

CREATE INDEX IF NOT EXISTS idx_courses_course_type_code ON public.courses(course_type_code);
CREATE INDEX IF NOT EXISTS idx_courses_course_level ON public.courses(course_level);

-- -----------------------------------------------------
-- 4. Trigger to auto-fill course_type_code
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_courses_fill_course_type_code()
RETURNS TRIGGER AS $$
DECLARE
  v_display_code TEXT;
BEGIN
  -- No type means no code
  IF NEW.course_type IS NULL OR NEW.course_type = '' THEN
    NEW.course_type_code := NULL;
    RETURN NEW;
  END IF;

  SELECT display_code
    INTO v_display_code
  FROM public.course_info
  WHERE course_type = NEW.course_type
  LIMIT 1;

  -- Unknown course_type → NULL (admin can fix data later)
  IF v_display_code IS NULL THEN
    NEW.course_type_code := NULL;
    RETURN NEW;
  END IF;

  IF NEW.course_level IS NULL OR NEW.course_level = '' THEN
    NEW.course_type_code := v_display_code;
  ELSE
    NEW.course_type_code := v_display_code || '-' || NEW.course_level;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_courses_fill_course_type_code ON public.courses;
CREATE TRIGGER trg_courses_fill_course_type_code
BEFORE INSERT OR UPDATE OF course_type, course_level ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.tg_courses_fill_course_type_code();

-- -----------------------------------------------------
-- 5. Backfill course_type_code for existing rows
-- -----------------------------------------------------
UPDATE public.courses c
   SET course_type_code = CASE
         WHEN ci.display_code IS NULL THEN NULL
         WHEN c.course_level IS NULL OR c.course_level = '' THEN ci.display_code
         ELSE ci.display_code || '-' || c.course_level
       END
  FROM public.course_info ci
 WHERE c.course_type IS NOT NULL
   AND c.course_type = ci.course_type;

-- -----------------------------------------------------
-- 6. RLS — match existing pattern (open to authenticated)
-- -----------------------------------------------------
ALTER TABLE public.course_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_info_read_all" ON public.course_info;
CREATE POLICY "course_info_read_all"
  ON public.course_info FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "course_info_write_authenticated" ON public.course_info;
CREATE POLICY "course_info_write_authenticated"
  ON public.course_info FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

GRANT SELECT ON public.course_info TO anon, authenticated;
GRANT ALL    ON public.course_info TO service_role;

COMMENT ON TABLE  public.course_info               IS 'Master list of course types — drives the Course Type dropdown on /master/courses.';
COMMENT ON COLUMN public.course_info.display_code  IS 'Short code combined with courses.course_level into courses.course_type_code (e.g., Core-I).';
COMMENT ON COLUMN public.courses.course_level      IS 'Roman numeral I–XX. Optional. Combined with course_info.display_code into course_type_code.';
COMMENT ON COLUMN public.courses.course_type_code  IS 'Auto-generated by trigger from course_info.display_code + course_level (e.g., Core-I). DO NOT update directly.';
