-- =====================================================
-- Student Attendance Sheet Function (WITH PROGRAM_ORDER)
-- =====================================================
-- Purpose: Add program_order field and sort by it
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
		et.session AS session,
		c.course_code,
		c.course_name AS course_title,
		p.program_code,
		p.program_name,
		COALESCE(p.program_order, 999) AS program_order,
		COALESCE(er.semester::TEXT, '-') AS semester,
		COALESCE(r.regulation_code, '-') AS regulation_code,
		i.name AS institution_name,
		i.institution_code,
		es.session_name,
		s.register_no AS register_number,
		s.name AS student_name,
		ea.attendance_status,
		COALESCE(ea.remarks, '') AS remarks
	FROM public.exam_attendance ea
	INNER JOIN public.exam_registrations er ON ea.exam_registration_id = er.id
	INNER JOIN public.students s ON ea.student_id = s.id
	INNER JOIN public.course_offerings co ON er.course_offering_id = co.id
	INNER JOIN public.courses c ON co.course_id = c.id
	INNER JOIN public.programs p ON co.program_id = p.id
	LEFT JOIN public.regulations r ON c.regulation_id = r.id
	INNER JOIN public.examination_sessions es ON co.examination_session_id = es.id
	INNER JOIN public.institutions i ON er.institutions_id = i.id
	INNER JOIN public.exam_timetables et ON ea.exam_timetable_id = et.id
	WHERE es.session_code = p_session_code
		AND (p_exam_date IS NULL OR et.exam_date = p_exam_date)
		AND (p_session IS NULL OR et.session = p_session)
		AND (p_program_code IS NULL OR p.program_code = p_program_code)
		AND (p_course_code IS NULL OR c.course_code = p_course_code)
		AND ea.attendance_status IN ('Present', 'Absent')
	ORDER BY
		et.exam_date,
		et.session,
		COALESCE(p.program_order, 999),  -- Sort by program_order
		p.program_code,
		c.course_code,
		s.register_no;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_student_attendance_sheet(TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_attendance_sheet(TEXT, DATE, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION get_student_attendance_sheet IS 'Generates student-wise attendance sheets for PDF generation with program_order sorting';
