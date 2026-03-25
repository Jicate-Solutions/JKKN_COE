-- Fix the course_mapping_detailed_view to use correct column name
-- Run this in your Supabase SQL Editor

DROP VIEW IF EXISTS public.course_mapping_detailed_view;

CREATE OR REPLACE VIEW public.course_mapping_detailed_view AS
SELECT
  cm.id,
  cm.course_id,
  cm.institution_code,
  cm.program_code,
  cm.batch_code,
  cm.semester_code,
  cm.course_group,
  cm.course_order,
  cm.internal_max_mark,
  cm.internal_pass_mark,
  cm.external_max_mark,
  cm.external_pass_mark,
  cm.total_max_mark,
  cm.total_pass_mark,
  cm.is_active,
  cm.created_at,
  cm.updated_at,
  -- Course details (from courses table)
  c.course_code,
  c.course_title,
  c.course_short_name,
  c.course_type,
  c.credits,
  c.lecture_hours,
  c.tutorial_hours,
  c.practical_hours,
  c.credit_hours,
  -- Institution details (from course's institution)
  i.name as institution_name,
  -- Program details (from course's program)
  p.program_name,
  p.program_short_name,
  p.duration_years,
  -- Semester details
  s.semester_name,
  s.semester_number,
  -- Batch details
  b.batch_name,
  b.batch_year
FROM public.course_mapping cm
LEFT JOIN public.courses c ON cm.course_id = c.id
LEFT JOIN public.institutions i ON c.institution_code = i.institution_code
LEFT JOIN public.programs p ON c.program_code = p.program_code
LEFT JOIN public.semesters s ON cm.semester_code = s.semester_code
LEFT JOIN public.batch b ON cm.batch_code = b.batch_code;

COMMENT ON VIEW public.course_mapping_detailed_view IS 'Denormalized view of course mappings with all related entity information';
