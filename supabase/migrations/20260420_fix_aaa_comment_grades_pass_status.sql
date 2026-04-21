-- Fix existing final_marks rows where AAA grade was saved with is_pass=true / pass_status='Pass'
-- These are comment-type courses (internship, project, etc.) where student was absent
-- Without this fix, the semester marksheet counts their credits as "earned"

UPDATE public.final_marks
SET
  is_pass       = false,
  pass_status   = 'Absent',
  updated_at    = now()
WHERE
  letter_grade  = 'AAA'
  AND is_pass   = true
  AND course_id IN (
    SELECT id FROM public.courses WHERE result_type = 'comment'
  );
