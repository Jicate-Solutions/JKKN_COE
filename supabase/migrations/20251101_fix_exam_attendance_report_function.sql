-- =====================================================
-- Exam Attendance Summary Report Function (WITH TYPE CASTING)
-- =====================================================
-- Purpose: Generate aggregated attendance statistics for PDF reports
-- Fixed: Added type casting for VARCHAR to TEXT compatibility
-- Usage: SELECT * FROM get_exam_attendance_report('JKKNCAS', 'JKKNCAS-NOV-DEC-2025')
-- =====================================================

CREATE OR REPLACE FUNCTION get_exam_attendance_report(
	p_institution_code TEXT,
	p_session_code TEXT
)
RETURNS TABLE (
	exam_date TEXT,
	exam_session TEXT,
	course_code TEXT,
	course_name TEXT,
	course_category TEXT,
	total_students BIGINT,
	present_count BIGINT,
	absent_count BIGINT,
	attendance_percentage NUMERIC
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		TO_CHAR(et.exam_date, 'DD-MM-YYYY') AS exam_date,
		et.session::TEXT AS exam_session,
		c.course_code::TEXT AS course_code,
		c.course_name::TEXT AS course_name,
		COALESCE(c.course_category::TEXT, '-') AS course_category,
		COUNT(DISTINCT er.id) AS total_students,
		COUNT(DISTINCT CASE WHEN ea.attendance_status = 'Present' THEN er.id END) AS present_count,
		COUNT(DISTINCT CASE WHEN ea.attendance_status = 'Absent' THEN er.id END) AS absent_count,
		ROUND(
			100.0 * COUNT(DISTINCT CASE WHEN ea.attendance_status = 'Present' THEN er.id END)
			/ NULLIF(COUNT(DISTINCT er.id), 0),
			2
		) AS attendance_percentage
	FROM public.exam_registrations er
	LEFT JOIN public.course_offerings co ON er.course_offering_id = co.id
	LEFT JOIN public.courses c ON co.course_id = c.id
	LEFT JOIN public.programs p ON co.program_id = p.id
	LEFT JOIN public.examination_sessions es ON co.examination_session_id = es.id
	LEFT JOIN public.institutions i ON er.institutions_id = i.id
	INNER JOIN public.exam_attendance ea
		ON ea.exam_registration_id = er.id
		AND ea.institutions_id = i.id
		AND ea.attendance_status IN ('Present', 'Absent')
	LEFT JOIN public.exam_timetables et ON et.id = ea.exam_timetable_id
	WHERE i.institution_code::TEXT = p_institution_code
		AND es.session_code::TEXT = p_session_code
	GROUP BY
		i.name, i.institution_code,
		es.session_code,
		et.exam_date, et.session,
		c.course_code, c.course_name, c.course_category
	ORDER BY
		et.exam_date,
		et.session,
		c.course_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_exam_attendance_report(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_exam_attendance_report(TEXT, TEXT) TO service_role;

-- Add comment
COMMENT ON FUNCTION get_exam_attendance_report IS 'Generates exam attendance report data for PDF generation. Returns attendance statistics grouped by exam date, session, and course.';
