-- Ensure course_mapping columns used by /api/v1/course-mapping exist.
-- course_group was in the original table; this migration is idempotent for
-- environments where schema drifted or partial migrations were applied.

ALTER TABLE public.course_mapping
	ADD COLUMN IF NOT EXISTS course_group text NULL;

ALTER TABLE public.course_mapping
	ADD COLUMN IF NOT EXISTS course_category text NULL;

ALTER TABLE public.course_mapping
	ADD COLUMN IF NOT EXISTS batch_id uuid NULL;

ALTER TABLE public.course_mapping
	ADD COLUMN IF NOT EXISTS annual_semester boolean NULL DEFAULT false;

ALTER TABLE public.course_mapping
	ADD COLUMN IF NOT EXISTS registration_based boolean NULL DEFAULT false;

COMMENT ON COLUMN public.course_mapping.course_group IS
	'Elective/paper group label (e.g. General, Elective - I). Used in course mapping UI and v1 API.';

COMMENT ON COLUMN public.course_mapping.course_category IS
	'Course category snapshot at mapping time (e.g. Theory, Practical). Exposed via v1 course-mapping API.';
