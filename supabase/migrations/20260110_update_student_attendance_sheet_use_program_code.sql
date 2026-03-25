-- =====================================================
-- Student Attendance Sheet Function (USE PROGRAM_CODE + EXAM_REGISTRATIONS)
-- =====================================================
-- Purpose: Update function to use:
-- 1. program_code directly instead of FK relationship (MyJKKN pattern)
-- 2. exam_registrations for student details (stu_register_no, student_name)
--    instead of local students table (learner data comes from MyJKKN API)
-- =====================================================

-- Drop the old function first (return type changed)
DROP FUNCTION IF EXISTS get_student_attendance_sheet(TEXT, DATE, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_student_attendance_sheet(
	p_session_code TEXT,
	p_exam_date DATE DEFAULT NULL,
	p_session TEXT DEFAULT NULL,
	p_program_code TEXT DEFAULT NULL,
	p_course_code TEXT DEFAULT NULL
)
RETURNS TABLE (
	exam_date TEXT,
	session TEXT,
	course_code TEXT,
	course_title TEXT,
	program_code TEXT,
	program_name TEXT,
	program_order INTEGER,
	semester TEXT,
	regulation_code TEXT,
	institution_name TEXT,
	institution_code TEXT,
	session_name TEXT,
	register_number TEXT,
	student_name TEXT,
	attendance_status TEXT,
	remarks TEXT
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		TO_CHAR(et.exam_date, 'DD-MM-YYYY') AS exam_date,
		et.session::TEXT AS session,
		c.course_code::TEXT AS course_code,
		c.course_name::TEXT AS course_title,
		-- Use program_code from course_offerings directly (MyJKKN pattern)
		COALESCE(co.program_code, ea.program_code, '-')::TEXT AS program_code,
		-- Program name: try to get from programs table if exists, fallback to program_code
		COALESCE(p.program_name, co.program_code, ea.program_code, '-')::TEXT AS program_name,
		-- Program order: try to get from programs table if exists, fallback to 999
		COALESCE(p.program_order, 999) AS program_order,
		COALESCE(co.semester::TEXT, '-') AS semester,
		COALESCE(r.regulation_code::TEXT, '-') AS regulation_code,
		i.name::TEXT AS institution_name,
		i.institution_code::TEXT AS institution_code,
		es.session_name::TEXT AS session_name,
		-- Use exam_registrations for student details (from MyJKKN learner data during import)
		COALESCE(er.stu_register_no, '-')::TEXT AS register_number,
		COALESCE(er.student_name, '-')::TEXT AS student_name,
		ea.attendance_status::TEXT AS attendance_status,
		COALESCE(ea.remarks, '')::TEXT AS remarks
	FROM public.exam_attendance ea
	INNER JOIN public.exam_registrations er ON ea.exam_registration_id = er.id
	INNER JOIN public.course_offerings co ON er.course_offering_id = co.id
	INNER JOIN public.courses c ON co.course_id = c.id
	-- LEFT JOIN programs table to get program_name if available (match by program_code)
	LEFT JOIN public.programs p ON (
		p.program_code = COALESCE(co.program_code, ea.program_code)
		AND p.institutions_id = er.institutions_id
	)
	LEFT JOIN public.regulations r ON c.regulation_id = r.id
	INNER JOIN public.examination_sessions es ON co.examination_session_id = es.id
	INNER JOIN public.institutions i ON er.institutions_id = i.id
	INNER JOIN public.exam_timetables et ON ea.exam_timetable_id = et.id
	WHERE es.session_code = p_session_code
		AND (p_exam_date IS NULL OR et.exam_date = p_exam_date)
		AND (p_session IS NULL OR et.session = p_session)
		-- Filter by program_code using COALESCE to check both co.program_code and ea.program_code
		AND (p_program_code IS NULL OR COALESCE(co.program_code, ea.program_code) = p_program_code)
		AND (p_course_code IS NULL OR c.course_code = p_course_code)
		AND ea.attendance_status IN ('Present', 'Absent')
	ORDER BY
		et.exam_date,
		et.session,
		COALESCE(p.program_order, 999),
		COALESCE(co.program_code, ea.program_code, ''),
		c.course_code,
		er.stu_register_no;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_student_attendance_sheet(TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_attendance_sheet(TEXT, DATE, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION get_student_attendance_sheet IS 'Generates student-wise attendance sheets for PDF generation. Uses program_code directly (MyJKKN pattern) and exam_registrations for student details (stu_register_no, student_name) instead of local students table.';
