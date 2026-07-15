-- Add optional group_order column to course_mapping.
-- Purpose: cluster elective papers into one group. The value refers to a
-- course order number; give elective courses the same group_order to group them.
-- Not mandatory: nullable, defaults to the course's order value in the UI.
ALTER TABLE public.course_mapping
	ADD COLUMN IF NOT EXISTS group_order integer NULL;

COMMENT ON COLUMN public.course_mapping.group_order IS
	'Optional grouping value referring to a course order number; electives sharing the same value form one group.';

-- Note: course_mapping_detailed_view is intentionally NOT recreated here.
--   1. No application code reads that view (the pages and v1 API select
--      group_order directly from the course_mapping table).
--   2. Course mapping is regulation-based, not batch-based, and the old view
--      definition joined a "public.batch" table that does not exist in this DB.
--   3. The old view also referenced courses columns that differ from the live
--      schema (course_title/credits/lecture_hours), so recreating it would fail.
-- If a working regulation-based view is ever needed, it must be built after
-- verifying the exact live column names on the courses table.
