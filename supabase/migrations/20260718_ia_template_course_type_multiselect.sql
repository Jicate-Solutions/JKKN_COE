-- Allow ia_paper_templates.course_type_applicability to hold MULTIPLE course
-- categories as a comma-joined list (e.g. 'theory,practical') instead of a
-- single token. The old CHECK constraint only permitted one value at a time.
--
-- Tokens are normalized `courses.course_category` values (see types/courses.ts
-- COURSE_CATEGORIES and lib/ia/course-type-applicability.ts):
--   'Theory'             -> theory
--   'Theory + Practical' -> theory_practical
--   'Field Work'         -> field_work
-- plus the catch-all 'all'.
--
-- Existing rows stay valid: 'theory', 'all', and the legacy combined value
-- 'theory_practical' are all still readable — and 'theory_practical' now
-- normalizes to exactly the 'Theory + Practical' category, so it keeps meaning.
--
-- Safe to re-run.

-- 1. Drop the single-value CHECK (inline constraints get the conventional name).
ALTER TABLE public.ia_paper_templates
	DROP CONSTRAINT IF EXISTS ia_paper_templates_course_type_applicability_check;

-- Fallback: drop any other CHECK on this column whatever it was named.
DO $$
DECLARE
	c record;
BEGIN
	FOR c IN
		SELECT con.conname
		FROM pg_constraint con
		JOIN pg_class rel ON rel.oid = con.conrelid
		JOIN pg_namespace ns ON ns.oid = rel.relnamespace
		WHERE ns.nspname = 'public'
			AND rel.relname = 'ia_paper_templates'
			AND con.contype = 'c'
			AND pg_get_constraintdef(con.oid) ILIKE '%course_type_applicability%'
	LOOP
		EXECUTE format('ALTER TABLE public.ia_paper_templates DROP CONSTRAINT %I', c.conname);
	END LOOP;
END $$;

-- 2. TEXT, because all nine categories joined runs well past the old VARCHAR(20).
ALTER TABLE public.ia_paper_templates
	ALTER COLUMN course_type_applicability TYPE text;

-- 3. Re-assert the default.
ALTER TABLE public.ia_paper_templates
	ALTER COLUMN course_type_applicability SET DEFAULT 'all';

-- 4. Guard rail: every comma-separated token must be a known course category.
--    Expressed as a regex because CHECK constraints cannot contain subqueries.
--    Permits 'all', 'theory', 'theory,practical', 'theory_practical', ...
ALTER TABLE public.ia_paper_templates
	ADD CONSTRAINT ia_paper_templates_course_type_applicability_tokens_check
	CHECK (
		course_type_applicability ~ '^(all|(theory|practical|project|non_academic|theory_practical|theory_project|field_work|community_service|group_project)(,(theory|practical|project|non_academic|theory_practical|theory_project|field_work|community_service|group_project))*)$'
	);

COMMENT ON COLUMN public.ia_paper_templates.course_type_applicability IS
	'Comma-joined course categories this template applies to (e.g. ''theory,practical''), or ''all''. Tokens are normalized courses.course_category values.';
