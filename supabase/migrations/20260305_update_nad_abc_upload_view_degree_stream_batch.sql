-- =====================================================
-- UPDATE NAD ABC UPLOAD VIEW
-- Date: 2026-03-05
-- Changes:
--   1. Add degree_code column (from programs.degree_code) for COURSE_NAME in pivot export
--   2. Add stream_name column (from departments.department_name) for STREAM in pivot export
--   3. Add batch_name column (empty '' - resolved from MyJKKN API in pivot export route)
--   4. Add LEFT JOIN: departments (via programs.offering_department_id)
-- Note: batch table does not exist in COE DB; batch_name is fetched from MyJKKN learner profiles
-- =====================================================

-- Drop and recreate the view with new columns
DROP VIEW IF EXISTS public.nad_abc_upload_view CASCADE;

CREATE OR REPLACE VIEW public.nad_abc_upload_view AS
SELECT
    COALESCE(s.aadhar_number, '') AS "ABC_ID",
    UPPER(COALESCE(
        NULLIF(TRIM(CONCAT(
            COALESCE(s.first_name, ''),
            CASE WHEN s.last_name IS NOT NULL AND s.last_name != '' THEN ' ' || s.last_name ELSE '' END
        )), ''),
        er.student_name,
        ''
    )) AS "STUDENT_NAME",
    UPPER(COALESCE(s.father_name, '')) AS "FATHER_NAME",
    UPPER(COALESCE(s.mother_name, '')) AS "MOTHER_NAME",
    COALESCE(TO_CHAR(s.date_of_birth, 'DD-MM-YYYY'), '') AS "DATE_OF_BIRTH",
    CASE
        WHEN UPPER(TRIM(s.gender)) IN ('M', 'MALE') THEN 'MALE'
        WHEN UPPER(TRIM(s.gender)) IN ('F', 'FEMALE') THEN 'FEMALE'
        ELSE 'OTHER'
    END AS "GENDER",
    UPPER(COALESCE(p.program_name, fm.program_code, '')) AS "PROGRAM_NAME",
    UPPER(COALESCE(p.program_code, fm.program_code, '')) AS "PROGRAM_CODE",
    COALESCE(sr.semester, COALESCE(co.semester, 1))::TEXT AS "SEMESTER",
    COALESCE(s.register_number, fm.register_number, '') AS "ENROLLMENT_NUMBER",
    COALESCE(s.roll_number, fm.register_number, '') AS "ROLL_NUMBER",
    UPPER(COALESCE(i.name, '')) AS "INSTITUTION_NAME",
    UPPER(COALESCE(i.institution_code, '')) AS "INSTITUTION_CODE",
    'PERIYAR UNIVERSITY' AS "UNIVERSITY_NAME",
    COALESCE(
        ay.academic_year,
        CASE
            WHEN es.exam_start_date IS NOT NULL AND es.exam_end_date IS NOT NULL THEN
                CONCAT(EXTRACT(YEAR FROM es.exam_start_date)::TEXT, '-',
                       RIGHT(EXTRACT(YEAR FROM es.exam_end_date)::TEXT, 2))
            ELSE ''
        END
    ) AS "ACADEMIC_YEAR",
    UPPER(COALESCE(
        es.session_name,
        CASE
            WHEN es.exam_end_date IS NOT NULL THEN
                CONCAT(
                    CASE
                        WHEN EXTRACT(MONTH FROM es.exam_end_date) BETWEEN 4 AND 6 THEN 'MAY'
                        WHEN EXTRACT(MONTH FROM es.exam_end_date) BETWEEN 10 AND 12 THEN 'NOVEMBER'
                        ELSE TRIM(TO_CHAR(es.exam_end_date, 'MONTH'))
                    END,
                    ' ',
                    EXTRACT(YEAR FROM es.exam_end_date)::TEXT
                )
            ELSE ''
        END
    )) AS "EXAM_SESSION",
    UPPER(COALESCE(c.course_code, '')) AS "SUBJECT_CODE",
    UPPER(COALESCE(c.course_name, '')) AS "SUBJECT_NAME",
    COALESCE(c.total_max_mark, 100)::TEXT AS "MAX_MARKS",
    COALESCE(fm.total_marks_obtained, 0)::TEXT AS "MARKS_OBTAINED",
    CASE
        WHEN fm.is_pass = true THEN 'PASS'
        WHEN fm.pass_status = 'Pass' THEN 'PASS'
        ELSE 'FAIL'
    END AS "RESULT_STATUS",
    TO_CHAR(COALESCE(sr.sgpa, 0.00), 'FM990.00') AS "SGPA",
    TO_CHAR(COALESCE(sr.cgpa, 0.00), 'FM990.00') AS "CGPA",
    CASE
        WHEN sr.result_declared_date IS NOT NULL THEN
            TO_CHAR(sr.result_declared_date, 'DD-MM-YYYY')
        WHEN es.result_declaration_date IS NOT NULL THEN
            TO_CHAR(es.result_declaration_date, 'DD-MM-YYYY')
        ELSE TO_CHAR(CURRENT_DATE, 'DD-MM-YYYY')
    END AS "RESULT_DATE",

    -- =====================================================
    -- PIVOT EXPORT HELPER COLUMNS
    -- Used by nad-pivot-export to build COURSE_NAME, STREAM, PROGRAM_NAME, SESSION
    -- =====================================================
    -- COURSE_NAME: degree code only e.g. "B.A", "B.Sc"
    UPPER(COALESCE(p.degree_code, '')) AS degree_code,

    -- STREAM: department/specialization name e.g. "ENGLISH", "COMPUTER SCIENCE"
    UPPER(COALESCE(dept.department_name, dept.display_name, '')) AS stream_name,

    -- SESSION: batch_name sourced from MyJKKN learner profiles API (not in COE local DB)
    '' AS batch_name,

    -- =====================================================
    -- ADDITIONAL COLUMNS FOR FILTERING (Not part of NAD export)
    -- =====================================================
    fm.id AS final_mark_id,
    fm.student_id,
    fm.course_id,
    sr.id AS semester_result_id,
    fm.institutions_id AS institution_id,
    fm.examination_session_id,
    fm.program_id,
    sr.semester AS semester_number,
    COALESCE(er.is_regular, true) AS is_regular_subject,
    COALESCE(co.semester, 1) AS subject_semester,
    COALESCE(fm.credit, c.credit, 0) AS credit,
    fm.grade_points,
    fm.letter_grade,

    -- Mark breakdown columns for NAD pivot export
    UPPER(COALESCE(c.course_category, 'Theory')) AS course_category,
    c.external_max_mark AS theory_max_mark,
    c.external_pass_mark AS theory_min_mark,
    fm.external_marks_obtained AS theory_marks_obtained,
    c.external_max_mark AS practical_max_mark,
    c.external_pass_mark AS practical_min_mark,
    fm.external_marks_obtained AS practical_marks_obtained,
    fm.internal_marks_obtained AS practical_ce_marks,
    c.internal_max_mark AS ce_max_mark,
    c.internal_pass_mark AS ce_min_mark,
    fm.internal_marks_obtained AS ce_marks_obtained,
    fm.internal_marks_maximum,
    fm.pass_status AS raw_pass_status,
    COALESCE(sr.folio_number, '') AS folio_number,

    ROW_NUMBER() OVER (
        PARTITION BY fm.student_id, fm.examination_session_id
        ORDER BY
            CASE WHEN COALESCE(er.is_regular, true) = true THEN 0 ELSE 1 END,
            CASE WHEN COALESCE(er.is_regular, true) = false THEN COALESCE(co.semester, 1) END DESC NULLS LAST,
            COALESCE(cm.course_order, 999),
            c.course_code
    ) AS subject_order

FROM public.final_marks fm
LEFT JOIN public.students s ON fm.student_id = s.id
LEFT JOIN public.programs p ON fm.program_id = p.id
INNER JOIN public.courses c ON fm.course_id = c.id
INNER JOIN public.institutions i ON fm.institutions_id = i.id
INNER JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
LEFT JOIN public.course_mapping cm ON (
    cm.course_id = c.id
    AND cm.program_code = COALESCE(p.program_code, fm.program_code)
    AND cm.is_active = true
)
LEFT JOIN public.semester_results sr ON (
    sr.student_id = fm.student_id
    AND sr.examination_session_id = fm.examination_session_id
    AND sr.is_active = true
    AND sr.is_published = true
)
LEFT JOIN public.academic_years ay ON es.academic_year_id = ay.id
-- Join departments for STREAM (via programs.offering_department_id)
LEFT JOIN public.departments dept ON p.offering_department_id = dept.id

WHERE fm.is_active = true
    AND fm.result_status = 'Published'

ORDER BY
    i.name,
    COALESCE(p.program_code, fm.program_code),
    COALESCE(sr.semester, COALESCE(co.semester, 1)),
    COALESCE(s.register_number, fm.register_number),
    CASE WHEN COALESCE(er.is_regular, true) = true THEN 0 ELSE 1 END,
    COALESCE(cm.course_order, 999),
    c.course_code;

-- Grant permissions
GRANT SELECT ON public.nad_abc_upload_view TO authenticated;
GRANT SELECT ON public.nad_abc_upload_view TO service_role;
