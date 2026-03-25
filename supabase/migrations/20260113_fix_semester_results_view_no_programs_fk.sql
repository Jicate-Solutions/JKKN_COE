-- =====================================================
-- Fix semester_results_detailed_view to not require programs FK or students table
-- =====================================================
-- Date: 2026-01-13
-- Issue: Programs and Students are now fetched from MyJKKN API, so:
--        - program_id may not exist in local programs table
--        - students table does not exist locally
-- Fix: Use program_code directly from semester_results
--      Get student info only from exam_registrations (no students table join)
-- =====================================================

-- Drop and recreate the view without programs or students table joins
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

	-- Student Details (from exam_registrations - students table doesn't exist locally)
	sr.student_id,
	COALESCE(er.student_name, fm_er.student_name, '') AS student_name,
	'' AS student_email, -- Email can be fetched from MyJKKN API if needed
	COALESCE(er.stu_register_no, fm_er.stu_register_no, sr.register_number) AS register_number,

	-- Institution Details
	sr.institutions_id,
	i.institution_code,
	i.name AS institution_name,

	-- Examination Session Details
	sr.examination_session_id,
	es.session_code,
	es.session_name,

	-- Program Details (using columns from semester_results directly)
	-- program_id is MyJKKN UUID, program_code is stored in semester_results
	sr.program_id,
	sr.program_code,
	-- program_name can be fetched from MyJKKN API if needed, not from local table
	sr.program_code AS program_name,

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
	ORDER BY fm.student_id, fm.created_at DESC
) fm_er ON er.stu_register_no IS NULL

-- NOTE: students table join removed - students are fetched from MyJKKN API
-- Student info comes from exam_registrations which stores student_name and stu_register_no

-- Institution join
LEFT JOIN public.institutions i ON i.id = sr.institutions_id

-- Examination session join
LEFT JOIN public.examination_sessions es ON es.id = sr.examination_session_id

-- NOTE: Programs table join removed - programs are now from MyJKKN API
-- program_id stores MyJKKN UUID, program_code is stored directly in semester_results

-- Academic year join
LEFT JOIN public.academic_years ay ON ay.id = sr.academic_year_id

-- User joins for audit fields
LEFT JOIN public.users rdu ON rdu.id = sr.result_declared_by
LEFT JOIN public.users pbu ON pbu.id = sr.published_by
LEFT JOIN public.users lbu ON lbu.id = sr.locked_by;

-- Grant permissions
GRANT SELECT ON public.semester_results_detailed_view TO authenticated;
GRANT SELECT ON public.semester_results_detailed_view TO service_role;

COMMENT ON VIEW public.semester_results_detailed_view IS 'Detailed view for semester results - programs and students from MyJKKN API, no local FK';
