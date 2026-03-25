-- =====================================================
-- Fix semester_results_detailed_view to get student info from exam_registrations
-- =====================================================
-- Date: 2026-01-12
-- Issue: semester_results.student_id references users table (from final_marks),
--        but the view was joining with students table which has different IDs.
-- Fix: Get student details from exam_registrations using student_id + examination_session_id
-- =====================================================

-- STEP 1: Update existing semester_results with register_number from exam_registrations
-- This ensures data is populated even if the view fallback doesn't work
UPDATE public.semester_results sr
SET register_number = er.stu_register_no
FROM public.exam_registrations er
WHERE sr.student_id = er.student_id
	AND sr.examination_session_id = er.examination_session_id
	AND er.is_active = true
	AND (sr.register_number IS NULL OR sr.register_number = '');

-- STEP 2: If still NULL, try to get from final_marks -> exam_registrations
UPDATE public.semester_results sr
SET register_number = (
	SELECT DISTINCT er.stu_register_no
	FROM public.final_marks fm
	INNER JOIN public.exam_registrations er ON er.id = fm.exam_registration_id
	WHERE fm.student_id = sr.student_id
		AND fm.examination_session_id = sr.examination_session_id
		AND fm.is_active = true
		AND er.is_active = true
	LIMIT 1
)
WHERE sr.register_number IS NULL OR sr.register_number = '';

-- STEP 3: Update program_code from programs table
UPDATE public.semester_results sr
SET program_code = p.program_code
FROM public.programs p
WHERE sr.program_id = p.id
	AND (sr.program_code IS NULL OR sr.program_code = '');

-- Drop and recreate the view
DROP VIEW IF EXISTS public.semester_results_detailed_view;

CREATE OR REPLACE VIEW public.semester_results_detailed_view AS
SELECT
	-- Semester Results Details
	sr.id,
	sr.semester,

	-- Credit Summary
	sr.total_credits_registered,
	sr.total_credits_earned,
	sr.total_credit_points,

	-- Grade Averages
	sr.sgpa,
	sr.cgpa,
	sr.percentage,

	-- Result Classification
	sr.result_class,
	sr.is_distinction,
	sr.is_first_class,

	-- Backlog Details
	sr.total_backlogs,
	sr.new_backlogs,
	sr.cleared_backlogs,

	-- Promotion Status
	sr.is_promoted,
	sr.promotion_remarks,

	-- Result Status
	sr.result_status,
	sr.result_declared_date,
	sr.result_declared_by,
	rdu.full_name AS result_declared_by_name,

	-- Publication Status
	sr.is_published,
	sr.published_date,
	sr.published_by,
	pbu.full_name AS published_by_name,

	-- Lock Status
	sr.is_locked,
	sr.locked_by,
	sr.locked_date,
	lbu.full_name AS locked_by_name,

	-- Remarks
	sr.remarks,
	sr.is_active,

	-- Student Details (from exam_registrations via multiple methods)
	sr.student_id,
	COALESCE(er.student_name, fm_er.student_name, CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))) AS student_name,
	COALESCE(s.student_email, '') AS student_email,
	COALESCE(er.stu_register_no, fm_er.stu_register_no, s.register_number, sr.register_number) AS register_number,

	-- Institution Details
	sr.institutions_id,
	i.institution_code,
	i.name AS institution_name,

	-- Examination Session Details
	sr.examination_session_id,
	es.session_code,
	es.session_name,

	-- Program Details
	sr.program_id,
	p.program_code,
	p.program_name,

	-- Academic Year Details
	sr.academic_year_id,
	ay.academic_year AS academic_year,

	-- Audit Fields
	sr.created_at,
	sr.updated_at,
	sr.created_by,
	sr.updated_by

FROM public.semester_results sr

-- Get student info from exam_registrations (PRIMARY SOURCE)
-- Method 1: Direct match by student_id + examination_session_id
LEFT JOIN LATERAL (
	SELECT DISTINCT ON (student_id)
		student_id,
		stu_register_no,
		student_name
	FROM public.exam_registrations
	WHERE student_id = sr.student_id
		AND examination_session_id = sr.examination_session_id
		AND is_active = true
	ORDER BY student_id, created_at DESC
) er ON true

-- Method 2: Get via final_marks -> exam_registrations relationship
-- This is needed when exam_registration.student_id doesn't match directly
LEFT JOIN LATERAL (
	SELECT DISTINCT ON (fm.student_id)
		er2.stu_register_no,
		er2.student_name
	FROM public.final_marks fm
	INNER JOIN public.exam_registrations er2 ON er2.id = fm.exam_registration_id
	WHERE fm.student_id = sr.student_id
		AND fm.examination_session_id = sr.examination_session_id
		AND fm.is_active = true
		AND er2.is_active = true
	ORDER BY fm.student_id, fm.created_at DESC
) fm_er ON er.stu_register_no IS NULL

-- Fallback: Get from students table matching by register_number
LEFT JOIN public.students s ON s.register_number = COALESCE(er.stu_register_no, fm_er.stu_register_no, sr.register_number)

-- Institution join
LEFT JOIN public.institutions i ON i.id = sr.institutions_id

-- Examination session join
LEFT JOIN public.examination_sessions es ON es.id = sr.examination_session_id

-- Program join
LEFT JOIN public.programs p ON p.id = sr.program_id

-- Academic year join
LEFT JOIN public.academic_years ay ON ay.id = sr.academic_year_id

-- User joins for audit fields
LEFT JOIN public.users rdu ON rdu.id = sr.result_declared_by
LEFT JOIN public.users pbu ON pbu.id = sr.published_by
LEFT JOIN public.users lbu ON lbu.id = sr.locked_by;

-- Grant permissions
GRANT SELECT ON public.semester_results_detailed_view TO authenticated;
GRANT SELECT ON public.semester_results_detailed_view TO service_role;

COMMENT ON VIEW public.semester_results_detailed_view IS 'Detailed view for semester results with student info from exam_registrations';
