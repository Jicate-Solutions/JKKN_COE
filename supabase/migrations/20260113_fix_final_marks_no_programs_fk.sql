-- =====================================================
-- Fix final_marks table and views to not require programs FK
-- =====================================================
-- Date: 2026-01-13
-- Issue: Programs are now fetched from MyJKKN API, so:
--        - program_id stores MyJKKN UUID (no local FK)
--        - programs table does not exist locally
-- Fix: Add program_code column to final_marks table
--      Update all views to use program_code directly
-- =====================================================

-- Step 1: Drop the FK constraint if it exists
ALTER TABLE IF EXISTS public.final_marks
    DROP CONSTRAINT IF EXISTS final_marks_program_id_fkey;

-- Step 2: Add program_code column to final_marks if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'final_marks'
        AND column_name = 'program_code'
    ) THEN
        ALTER TABLE public.final_marks ADD COLUMN program_code VARCHAR(50);
    END IF;
END $$;

-- Step 3: Update program_code from course_offerings if available
UPDATE public.final_marks fm
SET program_code = co.program_code
FROM public.course_offerings co
WHERE fm.course_offering_id = co.id
    AND (fm.program_code IS NULL OR fm.program_code = '');

-- Step 4: Add comment explaining the columns
COMMENT ON COLUMN public.final_marks.program_id IS 'MyJKKN program UUID - no FK constraint as programs are external';
COMMENT ON COLUMN public.final_marks.program_code IS 'Program code (e.g., UEN, BCA) from MyJKKN API - used for display and filtering';

-- Step 5: Drop and recreate all views that reference programs table

-- 5.1 final_marks_detailed_view
DROP VIEW IF EXISTS public.final_marks_detailed_view;
CREATE OR REPLACE VIEW public.final_marks_detailed_view AS
SELECT
	-- Final Marks Details
	fm.id,

	-- Marks Breakdown
	fm.internal_marks_obtained,
	fm.internal_marks_maximum,
	fm.internal_percentage,
	fm.external_marks_obtained,
	fm.external_marks_maximum,
	fm.external_percentage,
	fm.grace_marks,
	fm.grace_marks_reason,
	fm.total_marks_obtained,
	fm.total_marks_maximum,
	fm.percentage,

	-- Grade Details
	fm.letter_grade,
	fm.grade_points,
	fm.grade_description,

	-- Status
	fm.is_pass,
	fm.is_distinction,
	fm.is_first_class,
	fm.pass_status,
	fm.result_status,

	-- Moderation
	fm.is_moderated,
	fm.moderated_by,
	fm.moderation_date,
	mbu.full_name AS moderated_by_name,
	fm.marks_before_moderation,
	fm.moderation_remarks,

	-- Lock Status
	fm.is_locked,
	fm.locked_by,
	fm.locked_date,
	lbu.full_name AS locked_by_name,

	-- Publication
	fm.published_date,
	fm.published_by,
	pbu.full_name AS published_by_name,

	-- Calculation
	fm.calculated_by,
	fm.calculated_at,
	cbu.full_name AS calculated_by_name,
	fm.calculation_notes,
	fm.remarks,

	-- Student Details
	fm.student_id,
	s.full_name AS student_name,
	s.email AS student_email,

	-- Exam Registration Details
	fm.exam_registration_id,
	er.stu_register_no,

	-- Institution Details
	fm.institutions_id,
	i.institution_code,
	i.name AS institution_name,

	-- Examination Session Details
	fm.examination_session_id,
	es.session_code,
	es.session_name,

	-- Program Details (from final_marks directly - no programs table join)
	fm.program_id,
	fm.program_code,
	fm.program_code AS program_name, -- program_name not available locally

	-- Course Details
	fm.course_id,
	c.course_code,
	c.course_name,
	c.credit,

	-- Course Offering Details
	fm.course_offering_id,
	co.semester,
	co.section,

	-- Reference IDs
	fm.internal_marks_id,
	fm.marks_entry_id,

	-- Audit
	fm.is_active,
	fm.created_at,
	fm.updated_at
FROM public.final_marks fm
LEFT JOIN public.users s ON fm.student_id = s.id
LEFT JOIN public.users mbu ON fm.moderated_by = mbu.id
LEFT JOIN public.users lbu ON fm.locked_by = lbu.id
LEFT JOIN public.users pbu ON fm.published_by = pbu.id
LEFT JOIN public.users cbu ON fm.calculated_by = cbu.id
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.courses c ON fm.course_id = c.id
LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id;

-- 5.2 final_marks_summary_view
DROP VIEW IF EXISTS public.final_marks_summary_view;
CREATE OR REPLACE VIEW public.final_marks_summary_view AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	fm.program_code,
	fm.program_code AS program_name, -- program_name not available locally
	c.course_code,
	c.course_name,
	COUNT(*) AS total_students,
	COUNT(*) FILTER (WHERE fm.is_pass = true) AS passed_count,
	COUNT(*) FILTER (WHERE fm.is_pass = false) AS failed_count,
	COUNT(*) FILTER (WHERE fm.is_distinction = true) AS distinction_count,
	COUNT(*) FILTER (WHERE fm.is_first_class = true) AS first_class_count,
	COUNT(*) FILTER (WHERE fm.result_status = 'Published') AS published_count,
	COUNT(*) FILTER (WHERE fm.grace_marks > 0) AS grace_marks_count,
	ROUND(AVG(fm.percentage), 2) AS average_percentage,
	ROUND(AVG(fm.internal_percentage), 2) AS avg_internal_percentage,
	ROUND(AVG(fm.external_percentage), 2) AS avg_external_percentage,
	MIN(fm.percentage) AS min_percentage,
	MAX(fm.percentage) AS max_percentage,
	ROUND(STDDEV(fm.percentage), 2) AS percentage_std_deviation,
	ROUND((COUNT(*) FILTER (WHERE fm.is_pass = true)::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 2) AS pass_percentage
FROM public.final_marks fm
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.is_active = true
GROUP BY
	i.institution_code, i.name,
	es.session_code, es.session_name,
	fm.program_code,
	c.course_code, c.course_name;

-- 5.3 student_results_view
DROP VIEW IF EXISTS public.student_results_view;
CREATE OR REPLACE VIEW public.student_results_view AS
SELECT
	s.id AS student_id,
	s.full_name AS student_name,
	er.stu_register_no,
	i.institution_code,
	es.session_code,
	es.session_name,
	fm.program_code,
	fm.program_code AS program_name,
	c.course_code,
	c.course_name,
	c.credit,
	fm.internal_marks_obtained,
	fm.external_marks_obtained,
	fm.grace_marks,
	fm.total_marks_obtained,
	fm.total_marks_maximum,
	fm.percentage,
	fm.letter_grade,
	fm.grade_points,
	fm.grade_description,
	fm.is_pass,
	fm.is_distinction,
	fm.pass_status,
	fm.published_date
FROM public.final_marks fm
LEFT JOIN public.users s ON fm.student_id = s.id
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.result_status = 'Published'
	AND fm.is_active = true;

-- 5.4 grade_distribution_view
DROP VIEW IF EXISTS public.grade_distribution_view;
CREATE OR REPLACE VIEW public.grade_distribution_view AS
SELECT
	i.institution_code,
	es.session_code,
	fm.program_code,
	c.course_code,
	fm.letter_grade,
	fm.grade_description,
	COUNT(*) AS student_count,
	ROUND((COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY i.institution_code, es.session_code, fm.program_code, c.course_code), 0)) * 100, 2) AS percentage_of_class
FROM public.final_marks fm
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.is_active = true
	AND fm.letter_grade IS NOT NULL
GROUP BY
	i.institution_code,
	es.session_code,
	fm.program_code,
	c.course_code,
	fm.letter_grade,
	fm.grade_description
ORDER BY
	i.institution_code,
	es.session_code,
	fm.program_code,
	c.course_code,
	fm.letter_grade;

-- 5.5 failed_students_view
DROP VIEW IF EXISTS public.failed_students_view;
CREATE OR REPLACE VIEW public.failed_students_view AS
SELECT
	fm.id,
	i.institution_code,
	es.session_code,
	fm.program_code,
	c.course_code,
	c.course_name,
	s.full_name AS student_name,
	er.stu_register_no,
	fm.internal_marks_obtained,
	fm.internal_percentage,
	fm.external_marks_obtained,
	fm.external_percentage,
	fm.total_marks_obtained,
	fm.percentage,
	fm.pass_status,
	CASE
		WHEN fm.internal_percentage < 40 AND fm.external_percentage < 40 THEN 'Both Components'
		WHEN fm.internal_percentage < 40 THEN 'Internal'
		WHEN fm.external_percentage < 40 THEN 'External'
		ELSE 'Overall'
	END AS failure_reason
FROM public.final_marks fm
LEFT JOIN public.users s ON fm.student_id = s.id
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.is_pass = false
	AND fm.is_active = true
ORDER BY es.session_code, fm.program_code, c.course_code, er.stu_register_no;

-- 5.6 student_cgpa_view
DROP VIEW IF EXISTS public.student_cgpa_view;
CREATE OR REPLACE VIEW public.student_cgpa_view AS
SELECT
	fm.student_id,
	s.full_name AS student_name,
	er.stu_register_no,
	fm.examination_session_id,
	es.session_code,
	fm.program_id,
	fm.program_code,
	COUNT(*) AS total_courses,
	COUNT(*) FILTER (WHERE fm.is_pass = true) AS passed_courses,
	COUNT(*) FILTER (WHERE fm.is_pass = false) AS failed_courses,
	SUM(c.credit) AS total_credits,
	SUM(CASE WHEN fm.is_pass = true THEN c.credit ELSE 0 END) AS credits_earned,
	ROUND(SUM(fm.grade_points * c.credit) / NULLIF(SUM(c.credit), 0), 2) AS cgpa,
	ROUND(AVG(fm.percentage), 2) AS average_percentage
FROM public.final_marks fm
LEFT JOIN public.users s ON fm.student_id = s.id
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.is_active = true
	AND fm.result_status = 'Published'
GROUP BY
	fm.student_id, s.full_name, er.stu_register_no,
	fm.examination_session_id, es.session_code,
	fm.program_id, fm.program_code;

-- 5.7 pending_publication_view
DROP VIEW IF EXISTS public.pending_publication_view;
CREATE OR REPLACE VIEW public.pending_publication_view AS
SELECT
	fm.id,
	i.institution_code,
	es.session_code,
	fm.program_code,
	c.course_code,
	COUNT(*) OVER (PARTITION BY fm.course_id) AS total_students,
	fm.calculated_at,
	CURRENT_DATE - DATE(fm.calculated_at) AS days_since_calculation,
	COUNT(*) FILTER (WHERE fm.is_locked = true) OVER (PARTITION BY fm.course_id) AS locked_count,
	COUNT(*) FILTER (WHERE fm.is_locked = false) OVER (PARTITION BY fm.course_id) AS unlocked_count
FROM public.final_marks fm
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.result_status = 'Pending'
	AND fm.calculated_at IS NOT NULL
	AND fm.is_active = true
ORDER BY fm.calculated_at ASC;

-- Step 6: Grant permissions on views
GRANT SELECT ON public.final_marks_detailed_view TO authenticated;
GRANT SELECT ON public.final_marks_detailed_view TO service_role;
GRANT SELECT ON public.final_marks_summary_view TO authenticated;
GRANT SELECT ON public.final_marks_summary_view TO service_role;
GRANT SELECT ON public.student_results_view TO authenticated;
GRANT SELECT ON public.student_results_view TO service_role;
GRANT SELECT ON public.grade_distribution_view TO authenticated;
GRANT SELECT ON public.grade_distribution_view TO service_role;
GRANT SELECT ON public.failed_students_view TO authenticated;
GRANT SELECT ON public.failed_students_view TO service_role;
GRANT SELECT ON public.student_cgpa_view TO authenticated;
GRANT SELECT ON public.student_cgpa_view TO service_role;
GRANT SELECT ON public.pending_publication_view TO authenticated;
GRANT SELECT ON public.pending_publication_view TO service_role;

-- Step 7: Add comments
COMMENT ON VIEW public.final_marks_detailed_view IS 'Detailed view for final marks - programs from MyJKKN API, no local FK';
COMMENT ON VIEW public.final_marks_summary_view IS 'Summary statistics view - programs from MyJKKN API';
COMMENT ON VIEW public.student_results_view IS 'Published student results - programs from MyJKKN API';
COMMENT ON VIEW public.grade_distribution_view IS 'Grade distribution statistics - programs from MyJKKN API';
COMMENT ON VIEW public.failed_students_view IS 'Failed students listing - programs from MyJKKN API';
COMMENT ON VIEW public.student_cgpa_view IS 'Student CGPA calculation - programs from MyJKKN API';
COMMENT ON VIEW public.pending_publication_view IS 'Pending publication queue - programs from MyJKKN API';
