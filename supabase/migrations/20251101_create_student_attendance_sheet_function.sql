-- =====================================================
-- Student Attendance Sheet Function (WITH TYPE CASTING)
-- =====================================================
-- Purpose: Generate student-wise attendance sheets for PDF generation
-- Schema: Uses exam_registrations for student data (stu_register_no, student_name)
-- Usage: SELECT * FROM get_student_attendance_sheet('JKKNCAS-NOV-DEC-2025', '2025-11-01', 'FN', 'BCA', 'BCA101')
-- =====================================================

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
		p.program_code::TEXT AS program_code,
		p.program_name::TEXT AS program_name,
		COALESCE(co.semester::TEXT, '-') AS semester,
		COALESCE(r.regulation_code::TEXT, '-') AS regulation_code,
		i.name::TEXT AS institution_name,
		i.institution_code::TEXT AS institution_code,
		es.session_name::TEXT AS session_name,
		er.stu_register_no::TEXT AS register_number,
		er.student_name::TEXT AS student_name,
		ea.attendance_status::TEXT AS attendance_status,
		COALESCE(ea.remarks::TEXT, '') AS remarks
	FROM public.exam_attendance ea
	INNER JOIN public.exam_registrations er
		ON ea.exam_registration_id = er.id
		AND ea.institutions_id = er.institutions_id
	INNER JOIN public.course_offerings co
		ON er.course_offering_id = co.id
	INNER JOIN public.courses c
		ON co.course_id = c.id
	INNER JOIN public.programs p
		ON co.program_id = p.id
	LEFT JOIN public.regulations r
		ON c.regulation_id = r.id
	INNER JOIN public.examination_sessions es
		ON co.examination_session_id = es.id
	INNER JOIN public.institutions i
		ON ea.institutions_id = i.id
	LEFT JOIN public.exam_timetables et
		ON ea.exam_timetable_id = et.id
	WHERE es.session_code = p_session_code
		AND (p_exam_date IS NULL OR et.exam_date = p_exam_date)
		AND (p_session IS NULL OR et.session::TEXT = p_session)
		AND (p_program_code IS NULL OR p.program_code::TEXT = p_program_code)
		AND (p_course_code IS NULL OR c.course_code::TEXT = p_course_code)
		AND ea.attendance_status IN ('Present', 'Absent')
	ORDER BY
		et.exam_date,
		et.session,
		c.course_code,
		p.program_code,
		er.is_regular DESC,
		er.stu_register_no ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_student_attendance_sheet(TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_attendance_sheet(TEXT, DATE, TEXT, TEXT, TEXT) TO service_role;

-- Add comment
COMMENT ON FUNCTION get_student_attendance_sheet IS 'Generates student-wise attendance sheets for PDF generation. Returns individual student records with attendance status from exam_registrations table.';
