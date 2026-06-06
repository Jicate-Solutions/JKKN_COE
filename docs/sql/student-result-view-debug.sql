-- =====================================================================
-- Student Result View — verification & arrear diagnostic queries
-- Run in the Supabase SQL Editor. Replace the two literals inline:
--   '24JPGMAT001'        -> register number   (or switch to student_id)
--   '<INSTITUTION_UUID>' -> institution UUID
-- =====================================================================
-- Reliable join paths (verified against the live DB):
--   • course identity  ->  final_marks.course_id -> courses
--                          (course_offerings.course_id does NOT resolve to
--                           course_mapping here; fall back to
--                           exam_registrations.course_code when no marks row).
--   • semester index   ->  course_offerings.semester  (integer)
--   • semester_code / course_order -> course_mapping matched on
--                          (program_code, course_code).
-- Visibility gate (same as /api/v1/results and the endpoint): marks are shown
-- only when final_marks.result_status='Published' AND the session's
-- result_declaration_date IS NOT NULL AND <= now().
-- =====================================================================


-- =====================================================================
-- A. CANONICAL RESULT VIEW (what the endpoint returns)
-- =====================================================================
SELECT
	es.session_code,
	es.session_name,
	es.session_status,
	es.result_declaration_date,
	(fm.result_status = 'Published'
		AND es.result_declaration_date IS NOT NULL
		AND es.result_declaration_date <= now())                       AS is_published,
	er.is_regular,                                  -- false = ARREAR / re-appear
	er.attempt_number,
	co.semester                       AS semester_index,
	COALESCE(c.course_code, er.course_code)         AS course_code,
	c.course_name,
	COALESCE(fm.credit, c.credit)                   AS credit,
	cmp.semester_code,                              -- the paper's OWN semester (arrears = earlier)
	cmp.course_order,
	CASE WHEN fm.result_status = 'Published' AND es.result_declaration_date IS NOT NULL AND es.result_declaration_date <= now()
		THEN fm.total_marks_obtained END            AS total_obtained,
	CASE WHEN fm.result_status = 'Published' AND es.result_declaration_date IS NOT NULL AND es.result_declaration_date <= now()
		THEN fm.letter_grade END                    AS letter_grade,
	CASE WHEN fm.result_status = 'Published' AND es.result_declaration_date IS NOT NULL AND es.result_declaration_date <= now()
		THEN fm.grade_points END                    AS grade_points,
	CASE WHEN fm.result_status = 'Published' AND es.result_declaration_date IS NOT NULL AND es.result_declaration_date <= now()
		THEN fm.is_pass END                         AS is_pass,
	CASE WHEN fm.result_status = 'Published' AND es.result_declaration_date IS NOT NULL AND es.result_declaration_date <= now()
		THEN fm.pass_status END                     AS pass_status
FROM public.exam_registrations er
LEFT JOIN public.course_offerings      co ON co.id = er.course_offering_id
LEFT JOIN public.final_marks           fm ON fm.exam_registration_id = er.id
LEFT JOIN public.courses               c  ON c.id  = fm.course_id          -- reliable identity
LEFT JOIN LATERAL (
	SELECT cm.semester_code, cm.course_order
	FROM public.course_mapping cm
	WHERE cm.program_code = er.program_code
	  AND cm.course_code  = COALESCE(c.course_code, er.course_code)
	LIMIT 1
) cmp ON true
LEFT JOIN public.examination_sessions  es ON es.id = er.examination_session_id
WHERE er.institutions_id = '<INSTITUTION_UUID>'
  AND er.registration_status = 'Approved'
  AND er.stu_register_no = '24JPGMAT001'      -- OR:  AND er.student_id = '<STUDENT_UUID>'
ORDER BY
	es.result_declaration_date NULLS LAST,
	er.examination_session_id,
	er.is_regular DESC,                          -- regular papers first within a session
	co.semester,
	cmp.course_order;


-- =====================================================================
-- B. PER-SESSION SCORECARD (the tab summary — REGULAR papers only)
-- =====================================================================
SELECT
	es.session_code,
	MIN(co.semester)                                                  AS regular_semester,
	COUNT(*)                                                          AS regular_courses,
	COUNT(*) FILTER (WHERE fm.is_pass)                                AS passed,
	SUM(COALESCE(fm.credit, c.credit)) FILTER (WHERE c.credit_included IS NOT FALSE)  AS total_credits,
	ROUND(
		SUM(fm.grade_points * COALESCE(fm.credit, c.credit))
			FILTER (WHERE fm.result_status = 'Published' AND c.credit_included IS NOT FALSE)
		/ NULLIF(SUM(COALESCE(fm.credit, c.credit))
			FILTER (WHERE fm.result_status = 'Published' AND c.credit_included IS NOT FALSE AND fm.grade_points IS NOT NULL), 0),
		2)                                                            AS sgpa
FROM public.exam_registrations er
LEFT JOIN public.course_offerings co ON co.id = er.course_offering_id
LEFT JOIN public.final_marks      fm ON fm.exam_registration_id = er.id
LEFT JOIN public.courses          c  ON c.id  = fm.course_id
LEFT JOIN public.examination_sessions es ON es.id = er.examination_session_id
WHERE er.institutions_id = '<INSTITUTION_UUID>'
  AND er.registration_status = 'Approved'
  AND er.stu_register_no = '24JPGMAT001'
  AND er.is_regular = true                       -- summary = regular papers only
GROUP BY es.session_code
ORDER BY es.session_code;


-- =====================================================================
-- C. ARREAR DIAGNOSTIC — "why is the arrear paper missing?"
-- =====================================================================
-- Lists EVERY registration (any status, regular + arrear) with the resolved
-- course identity and each filter the endpoint applies. An arrear is included
-- only when pass_status_filter = true; its marks show only when marks_visible_now.
SELECT
	er.stu_register_no,
	er.is_regular,                                          -- false = arrear
	er.attempt_number,
	er.registration_status,
	er.program_code,
	co.semester                                AS semester_index,
	COALESCE(c.course_code, er.course_code)    AS course_code,       -- resolved identity
	c.course_name,
	cmp.semester_code,
	(er.registration_status = 'Approved')      AS pass_status_filter,  -- must be Approved
	(er.course_offering_id IS NOT NULL)        AS has_course_offering,
	(fm.id IS NOT NULL)                        AS has_final_marks,
	fm.result_status                           AS marks_status,
	es.session_status,
	es.result_declaration_date,
	(fm.result_status = 'Published'
		AND es.result_declaration_date IS NOT NULL
		AND es.result_declaration_date <= now()) AS marks_visible_now
FROM public.exam_registrations er
LEFT JOIN public.course_offerings co ON co.id = er.course_offering_id
LEFT JOIN public.final_marks      fm ON fm.exam_registration_id = er.id
LEFT JOIN public.courses          c  ON c.id  = fm.course_id
LEFT JOIN LATERAL (
	SELECT cm.semester_code
	FROM public.course_mapping cm
	WHERE cm.program_code = er.program_code
	  AND cm.course_code  = COALESCE(c.course_code, er.course_code)
	LIMIT 1
) cmp ON true
LEFT JOIN public.examination_sessions es ON es.id = er.examination_session_id
WHERE er.institutions_id = '<INSTITUTION_UUID>'
  AND er.stu_register_no = '24JPGMAT001'
ORDER BY er.is_regular DESC, co.semester, course_code;

-- Reading C:
--   • course_code still NULL          -> neither final_marks.course_id nor
--                                        exam_registrations.course_code is set for that reg.
--   • registration_status <> Approved -> arrear excluded (data fix: approve the reg).
--   • has_final_marks = false         -> course lists as "Result awaited" (no marks row yet).
--   • marks_visible_now = false       -> result not Published or session not declared (gate).
