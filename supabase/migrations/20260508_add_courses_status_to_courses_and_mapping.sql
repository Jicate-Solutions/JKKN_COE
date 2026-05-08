-- Add courses_status column to courses and course_mapping tables
-- Allowed values: 'Pending', 'BOS Approved', 'Locked'
-- Default: 'Pending'

-- ============================================
-- courses table
-- ============================================
ALTER TABLE public.courses
	ADD COLUMN IF NOT EXISTS courses_status text NOT NULL DEFAULT 'Pending';

ALTER TABLE public.courses
	DROP CONSTRAINT IF EXISTS courses_courses_status_check;

ALTER TABLE public.courses
	ADD CONSTRAINT courses_courses_status_check
	CHECK (courses_status IN ('Pending', 'BOS Approved', 'Locked'));

CREATE INDEX IF NOT EXISTS idx_courses_courses_status
	ON public.courses USING btree (courses_status);

-- ============================================
-- course_mapping table
-- ============================================
ALTER TABLE public.course_mapping
	ADD COLUMN IF NOT EXISTS courses_status text NOT NULL DEFAULT 'Pending';

ALTER TABLE public.course_mapping
	DROP CONSTRAINT IF EXISTS course_mapping_courses_status_check;

ALTER TABLE public.course_mapping
	ADD CONSTRAINT course_mapping_courses_status_check
	CHECK (courses_status IN ('Pending', 'BOS Approved', 'Locked'));

CREATE INDEX IF NOT EXISTS idx_course_mapping_courses_status
	ON public.course_mapping USING btree (courses_status);

-- ============================================
-- Comments
-- ============================================
COMMENT ON COLUMN public.courses.courses_status IS
	'Workflow state of the course definition. One of: Pending, BOS Approved, Locked. Defaults to Pending.';

COMMENT ON COLUMN public.course_mapping.courses_status IS
	'Workflow state of the course mapping. One of: Pending, BOS Approved, Locked. Defaults to Pending.';
