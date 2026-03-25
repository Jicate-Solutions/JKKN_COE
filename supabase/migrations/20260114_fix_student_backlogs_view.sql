-- =====================================================
-- Fix student_backlogs_detailed_view to get student info from exam_registrations
-- =====================================================
-- Date: 2026-01-14
-- Purpose: Fix the view to correctly join with exam_registrations via final_marks
-- Student and Program data comes from MyJKKN API, so we get info from exam_registrations/final_marks
-- =====================================================

-- Drop and recreate the view with correct joins
CREATE OR REPLACE VIEW public.student_backlogs_detailed_view AS
SELECT
	-- Backlog Details
	sb.id,
	sb.original_semester,
	sb.attempt_count,
	sb.max_attempts_allowed,
	sb.semesters_pending,
	sb.priority_level,
	sb.failure_reason,
	sb.is_absent,
	sb.is_improvement,

	-- Original Marks
	sb.original_internal_marks,
	sb.original_external_marks,
	sb.original_total_marks,
	sb.original_percentage,
	sb.original_grade_points,
	sb.original_letter_grade,

	-- Clearance Status
	sb.is_cleared,
	sb.cleared_date,
	sb.cleared_semester,
	sb.cleared_internal_marks,
	sb.cleared_external_marks,
	sb.cleared_total_marks,
	sb.cleared_percentage,
	sb.cleared_grade_points,
	sb.cleared_letter_grade,

	-- Arrear Registration
	sb.is_registered_for_arrear,
	sb.arrear_registration_date,

	-- Remarks
	sb.remarks,
	sb.is_active,

	-- Student Details (from exam_registrations via final_marks)
	sb.student_id,
	COALESCE(er.student_name, '') AS student_name,
	'' AS student_email,  -- Email not available in exam_registrations
	COALESCE(er.stu_register_no, '') AS register_number,

	-- Institution Details
	sb.institutions_id,
	i.institution_code,
	i.name AS institution_name,

	-- Program Details (from final_marks - programs come from MyJKKN API)
	sb.program_id,
	COALESCE(fm.program_code, '') AS program_code,
	COALESCE(fm.program_code, '') AS program_name,  -- Program name not stored locally, use code

	-- Course Details
	sb.course_id,
	c.course_code,
	c.course_name,
	c.credit AS course_credits,

	-- Original Examination Session
	sb.original_examination_session_id,
	oes.session_code AS original_session_code,
	oes.session_name AS original_session_name,

	-- Cleared Examination Session
	sb.cleared_examination_session_id,
	ces.session_code AS cleared_session_code,
	ces.session_name AS cleared_session_name,

	-- Arrear Exam Session
	sb.arrear_exam_session_id,
	aes.session_code AS arrear_session_code,
	aes.session_name AS arrear_session_name,

	-- Audit Fields
	sb.created_at,
	sb.updated_at,
	sb.last_attempt_date
FROM public.student_backlogs sb
-- Join with final_marks to get exam_registration_id and program_code
LEFT JOIN public.final_marks fm ON sb.original_final_marks_id = fm.id
-- Join with exam_registrations to get student name, register number, and program_name
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON sb.institutions_id = i.id
LEFT JOIN public.courses c ON sb.course_id = c.id
LEFT JOIN public.examination_sessions oes ON sb.original_examination_session_id = oes.id
LEFT JOIN public.examination_sessions ces ON sb.cleared_examination_session_id = ces.id
LEFT JOIN public.examination_sessions aes ON sb.arrear_exam_session_id = aes.id;

-- Add comment
COMMENT ON VIEW public.student_backlogs_detailed_view IS 'Denormalized view of student backlogs with student/program info from exam_registrations and final_marks';
