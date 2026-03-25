-- =====================================================
-- NAAD (National Academic Depository) Export Views
-- =====================================================
-- Date: 2024-12-23
-- Updated: 2024-12-23 (Fixed column references)
-- Purpose: Generate NAAD-compliant data for ABC (Academic Bank of credit)
-- upload from final_marks and semester_results tables
--
-- Tables Used:
-- - final_marks: Subject-wise marks (internal + external)
-- - semester_results: SGPA/CGPA per semester
-- - students: Student personal details (roll_number, DOB, etc.)
-- - programs: Program/Course details
-- - courses: Subject details (course_name, credit)
-- - institutions: Institution details
-- - examination_sessions: Exam session details
-- - exam_registrations: Student registration (stu_register_no)
--
-- NOTE: final_marks.student_id references users(id), NOT students(id)
-- Student data comes from students table linked via exam_registrations
-- =====================================================

-- Drop existing views if exists
DROP VIEW IF EXISTS public.naad_export_view CASCADE;
DROP VIEW IF EXISTS public.naad_export_summary CASCADE;
DROP VIEW IF EXISTS public.naad_consolidated_view CASCADE;
DROP FUNCTION IF EXISTS get_naad_export_data(UUID, UUID, UUID, INT);

-- =====================================================
-- 1. NAAD UPLOAD FORMAT VIEW (One row per student per subject)
-- =====================================================
-- This view generates data in the official NAAD upload format
-- with 24 columns as required for ABC portal upload
-- Uses final_marks table as the source of marks data
-- =====================================================

CREATE OR REPLACE VIEW public.naad_export_view AS
SELECT
    -- Column 1: ABC_ID (12 digits) - From student's Aadhar or placeholder
    COALESCE(
        LPAD(REPLACE(REPLACE(s.aadhar_number, ' ', ''), '-', ''), 12, '0'),
        '000000000000'
    ) AS "ABC_ID",

    -- Column 2: STUDENT_NAME (Full name in UPPERCASE)
    UPPER(TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')))) AS "STUDENT_NAME",

    -- Column 3: FATHER_NAME (UPPERCASE)
    UPPER(TRIM(COALESCE(s.father_name, ''))) AS "FATHER_NAME",

    -- Column 4: MOTHER_NAME (UPPERCASE)
    UPPER(TRIM(COALESCE(s.mother_name, ''))) AS "MOTHER_NAME",

    -- Column 5: DATE_OF_BIRTH (DD-MM-YYYY format)
    CASE
        -- Handle YYYY-MM-DD format
        WHEN s.date_of_birth ~ '^\d{4}-\d{2}-\d{2}$' THEN
            TO_CHAR(TO_DATE(s.date_of_birth, 'YYYY-MM-DD'), 'DD-MM-YYYY')
        -- Handle DD/MM/YYYY format
        WHEN s.date_of_birth ~ '^\d{2}/\d{2}/\d{4}$' THEN
            TO_CHAR(TO_DATE(s.date_of_birth, 'DD/MM/YYYY'), 'DD-MM-YYYY')
        -- Already in DD-MM-YYYY format
        WHEN s.date_of_birth ~ '^\d{2}-\d{2}-\d{4}$' THEN
            s.date_of_birth
        ELSE COALESCE(s.date_of_birth, '01-01-2000')
    END AS "DATE_OF_BIRTH",

    -- Column 6: GENDER (MALE/FEMALE/OTHER)
    CASE
        WHEN UPPER(TRIM(s.gender)) IN ('M', 'MALE') THEN 'MALE'
        WHEN UPPER(TRIM(s.gender)) IN ('F', 'FEMALE') THEN 'FEMALE'
        ELSE 'OTHER'
    END AS "GENDER",

    -- Column 7: PROGRAM_NAME (Full program name in UPPERCASE)
    UPPER(COALESCE(p.program_name, '')) AS "PROGRAM_NAME",

    -- Column 8: PROGRAM_CODE
    UPPER(COALESCE(p.program_code, '')) AS "PROGRAM_CODE",

    -- Column 9: SEMESTER (Semester number as text)
    COALESCE(co.semester::TEXT, '1') AS "SEMESTER",

    -- Column 10: ENROLLMENT_NUMBER (Register number from exam_registrations or student roll_number)
    COALESCE(er.stu_register_no, s.roll_number, '') AS "ENROLLMENT_NUMBER",

    -- Column 11: ROLL_NUMBER (Roll number from students table)
    COALESCE(s.roll_number, er.stu_register_no, '') AS "ROLL_NUMBER",

    -- Column 12: INSTITUTION_NAME (UPPERCASE)
    UPPER(COALESCE(i.name, '')) AS "INSTITUTION_NAME",

    -- Column 13: INSTITUTION_CODE
    UPPER(COALESCE(i.institution_code, '')) AS "INSTITUTION_CODE",

    -- Column 14: UNIVERSITY_NAME (Default: PERIYAR UNIVERSITY)
    'PERIYAR UNIVERSITY' AS "UNIVERSITY_NAME",

    -- Column 15: ACADEMIC_YEAR (YYYY-YY format from academic_years table)
    COALESCE(
        ay.academic_year,
        EXTRACT(YEAR FROM COALESCE(ay.start_date, CURRENT_DATE))::TEXT || '-' ||
        RIGHT((EXTRACT(YEAR FROM COALESCE(ay.start_date, CURRENT_DATE)) + 1)::TEXT, 2)
    ) AS "ACADEMIC_YEAR",

    -- Column 16: EXAM_SESSION (e.g., "NOV 2024", "APR 2024")
    UPPER(COALESCE(es.session_name, 'NOV 2024')) AS "EXAM_SESSION",

    -- Column 17: SUBJECT_CODE (Course code in UPPERCASE)
    UPPER(COALESCE(c.course_code, '')) AS "SUBJECT_CODE",

    -- Column 18: SUBJECT_NAME (Course title in UPPERCASE - courses table uses course_name)
    UPPER(COALESCE(c.course_name, '')) AS "SUBJECT_NAME",

    -- Column 19: MAX_MARKS (Total maximum marks)
    COALESCE(fm.total_marks_maximum::TEXT, '100') AS "MAX_MARKS",

    -- Column 20: MARKS_OBTAINED (Total marks obtained)
    COALESCE(fm.total_marks_obtained::TEXT, '0') AS "MARKS_OBTAINED",

    -- Column 21: RESULT_STATUS (PASS/FAIL only)
    CASE WHEN fm.is_pass = true THEN 'PASS' ELSE 'FAIL' END AS "RESULT_STATUS",

    -- Column 22: SGPA (From semester_results, 0.00-10.00)
    COALESCE(
        TO_CHAR(sr.sgpa, 'FM990.00'),
        '0.00'
    ) AS "SGPA",

    -- Column 23: CGPA (From semester_results, 0.00-10.00)
    COALESCE(
        TO_CHAR(sr.cgpa, 'FM990.00'),
        '0.00'
    ) AS "CGPA",

    -- Column 24: RESULT_DATE (DD-MM-YYYY format)
    TO_CHAR(
        COALESCE(fm.published_date, sr.published_date, sr.result_declared_date, CURRENT_DATE),
        'DD-MM-YYYY'
    ) AS "RESULT_DATE",

    -- =====================================================
    -- Additional metadata columns for filtering/debugging
    -- (These are NOT part of the official NAAD format)
    -- =====================================================
    fm.id AS final_marks_id,
    fm.student_id AS user_id,
    s.id AS student_id,
    i.id AS institution_id,
    es.id AS examination_session_id,
    p.id AS program_id,
    c.id AS course_id,
    co.semester AS semester_number,
    fm.internal_marks_obtained,
    fm.external_marks_obtained,
    fm.result_status AS internal_result_status,
    sr.id AS semester_result_id,
    c.credit AS credit,
    fm.letter_grade,
    fm.grade_points

FROM public.final_marks fm

-- Join with exam_registrations to get student details
INNER JOIN public.exam_registrations er ON fm.exam_registration_id = er.id

-- Join with students using exam_registrations link (er has student reference)
LEFT JOIN public.students s ON er.student_id = s.id

-- Join with courses for subject details (uses course_name not course_name)
INNER JOIN public.courses c ON fm.course_id = c.id

-- Join with programs for program details
INNER JOIN public.programs p ON fm.program_id = p.id

-- Join with institutions for institution details
INNER JOIN public.institutions i ON fm.institutions_id = i.id

-- Join with examination sessions for session details
INNER JOIN public.examination_sessions es ON fm.examination_session_id = es.id

-- Join with course offerings for semester info
LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id

-- Join with academic years (via student's academic_year_id)
LEFT JOIN public.academic_years ay ON s.academic_year_id = ay.id

-- Join with semester results for SGPA/CGPA
LEFT JOIN public.semester_results sr ON (
    sr.student_id = fm.student_id
    AND sr.examination_session_id = fm.examination_session_id
    AND sr.semester = COALESCE(co.semester, 1)
    AND sr.is_active = true
)

WHERE fm.is_active = true
    AND fm.result_status = 'Published'  -- Only published results

ORDER BY
    i.institution_code,
    p.program_code,
    co.semester,
    er.stu_register_no,
    c.course_code;


-- =====================================================
-- 2. NAAD EXPORT SUMMARY VIEW
-- =====================================================
-- Summary statistics for NAAD export batches
-- Useful for checking data readiness before export
-- =====================================================

CREATE OR REPLACE VIEW public.naad_export_summary AS
SELECT
    i.institution_code,
    i.name AS institution_name,
    es.session_code,
    es.session_name,
    p.program_code,
    p.program_name,
    co.semester,
    ay.academic_year AS academic_year,

    -- Student counts
    COUNT(DISTINCT er.student_id) AS total_students,
    COUNT(*) AS total_subject_entries,

    -- Pass/Fail counts
    COUNT(*) FILTER (WHERE fm.is_pass = true) AS passed_entries,
    COUNT(*) FILTER (WHERE fm.is_pass = false) AS failed_entries,

    -- SGPA/CGPA averages
    ROUND(AVG(sr.sgpa), 2) AS average_sgpa,
    ROUND(AVG(sr.cgpa), 2) AS average_cgpa,
    MIN(sr.cgpa) AS min_cgpa,
    MAX(sr.cgpa) AS max_cgpa,

    -- Classification counts
    COUNT(DISTINCT er.student_id) FILTER (WHERE sr.cgpa >= 9.0) AS distinction_count,
    COUNT(DISTINCT er.student_id) FILTER (WHERE sr.cgpa >= 7.5 AND sr.cgpa < 9.0) AS first_class_count,
    COUNT(DISTINCT er.student_id) FILTER (WHERE sr.cgpa >= 6.0 AND sr.cgpa < 7.5) AS second_class_count,

    -- Pass percentage
    ROUND(
        (COUNT(*) FILTER (WHERE fm.is_pass = true)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
        2
    ) AS pass_percentage,

    -- Data completeness checks
    COUNT(DISTINCT er.student_id) FILTER (
        WHERE s.aadhar_number IS NULL OR TRIM(s.aadhar_number) = ''
    ) AS missing_abc_id_count,
    COUNT(DISTINCT er.student_id) FILTER (
        WHERE s.father_name IS NULL OR TRIM(s.father_name) = ''
    ) AS missing_father_name_count,
    COUNT(DISTINCT er.student_id) FILTER (
        WHERE s.mother_name IS NULL OR TRIM(s.mother_name) = ''
    ) AS missing_mother_name_count,
    COUNT(DISTINCT er.student_id) FILTER (
        WHERE s.date_of_birth IS NULL OR TRIM(s.date_of_birth) = ''
    ) AS missing_dob_count,

    -- Export readiness status
    CASE
        WHEN COUNT(DISTINCT er.student_id) FILTER (
            WHERE s.aadhar_number IS NULL OR TRIM(s.aadhar_number) = ''
                OR s.father_name IS NULL OR TRIM(s.father_name) = ''
                OR s.mother_name IS NULL OR TRIM(s.mother_name) = ''
                OR s.date_of_birth IS NULL OR TRIM(s.date_of_birth) = ''
        ) = 0 THEN 'READY'
        ELSE 'INCOMPLETE - MISSING DATA'
    END AS export_status,

    -- Last updated
    MAX(fm.updated_at) AS last_updated

FROM public.final_marks fm
INNER JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.students s ON er.student_id = s.id
INNER JOIN public.institutions i ON fm.institutions_id = i.id
INNER JOIN public.examination_sessions es ON fm.examination_session_id = es.id
INNER JOIN public.programs p ON fm.program_id = p.id
LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
LEFT JOIN public.academic_years ay ON s.academic_year_id = ay.id
LEFT JOIN public.semester_results sr ON (
    sr.student_id = fm.student_id
    AND sr.examination_session_id = fm.examination_session_id
    AND sr.semester = COALESCE(co.semester, 1)
    AND sr.is_active = true
)

WHERE fm.is_active = true
    AND fm.result_status = 'Published'

GROUP BY
    i.institution_code,
    i.name,
    es.session_code,
    es.session_name,
    p.program_code,
    p.program_name,
    co.semester,
    ay.academic_year

ORDER BY
    i.institution_code,
    es.session_code,
    p.program_code,
    co.semester;


-- =====================================================
-- 3. NAAD CONSOLIDATED VIEW (One row per student)
-- =====================================================
-- Consolidated format with all subjects in one row
-- Up to 7 subjects per row (expandable)
-- =====================================================

CREATE OR REPLACE VIEW public.naad_consolidated_view AS
WITH student_subjects AS (
    SELECT
        fm.student_id,
        er.student_id AS students_table_id,
        fm.examination_session_id,
        fm.program_id,
        fm.institutions_id,
        COALESCE(co.semester, 1) AS semester,
        c.course_code AS subject_code,
        c.course_name AS subject_name,
        fm.total_marks_maximum AS max_marks,
        fm.total_marks_obtained AS marks_obtained,
        fm.is_pass,
        fm.letter_grade,
        fm.grade_points,
        c.credit,
        ROW_NUMBER() OVER (
            PARTITION BY fm.student_id, fm.examination_session_id, co.semester
            ORDER BY c.course_code
        ) AS subject_seq
    FROM public.final_marks fm
    INNER JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
    INNER JOIN public.courses c ON fm.course_id = c.id
    LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
    WHERE fm.is_active = true
        AND fm.result_status = 'Published'
)
SELECT
    -- Student Info
    COALESCE(
        LPAD(REPLACE(REPLACE(s.aadhar_number, ' ', ''), '-', ''), 12, '0'),
        '000000000000'
    ) AS abc_id,
    COALESCE(s.roll_number, '') AS register_number,
    UPPER(TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')))) AS student_name,
    UPPER(TRIM(COALESCE(s.father_name, ''))) AS father_name,
    UPPER(TRIM(COALESCE(s.mother_name, ''))) AS mother_name,
    s.date_of_birth,
    UPPER(COALESCE(s.gender, '')) AS gender,

    -- Program Info
    UPPER(COALESCE(p.program_name, '')) AS program_name,
    UPPER(COALESCE(p.program_code, '')) AS program_code,
    sr.semester,

    -- Institution Info
    UPPER(COALESCE(i.name, '')) AS institution_name,
    UPPER(COALESCE(i.institution_code, '')) AS institution_code,
    'PERIYAR UNIVERSITY' AS university_name,

    -- Session Info
    es.session_name AS exam_session,
    ay.academic_year AS academic_year,

    -- Subject 1
    MAX(CASE WHEN ss.subject_seq = 1 THEN UPPER(ss.subject_code) END) AS subject_1_code,
    MAX(CASE WHEN ss.subject_seq = 1 THEN UPPER(ss.subject_name) END) AS subject_1_name,
    MAX(CASE WHEN ss.subject_seq = 1 THEN ss.max_marks::TEXT END) AS subject_1_max,
    MAX(CASE WHEN ss.subject_seq = 1 THEN ss.marks_obtained::TEXT END) AS subject_1_obtained,
    MAX(CASE WHEN ss.subject_seq = 1 THEN CASE WHEN ss.is_pass THEN 'PASS' ELSE 'FAIL' END END) AS subject_1_status,

    -- Subject 2
    MAX(CASE WHEN ss.subject_seq = 2 THEN UPPER(ss.subject_code) END) AS subject_2_code,
    MAX(CASE WHEN ss.subject_seq = 2 THEN UPPER(ss.subject_name) END) AS subject_2_name,
    MAX(CASE WHEN ss.subject_seq = 2 THEN ss.max_marks::TEXT END) AS subject_2_max,
    MAX(CASE WHEN ss.subject_seq = 2 THEN ss.marks_obtained::TEXT END) AS subject_2_obtained,
    MAX(CASE WHEN ss.subject_seq = 2 THEN CASE WHEN ss.is_pass THEN 'PASS' ELSE 'FAIL' END END) AS subject_2_status,

    -- Subject 3
    MAX(CASE WHEN ss.subject_seq = 3 THEN UPPER(ss.subject_code) END) AS subject_3_code,
    MAX(CASE WHEN ss.subject_seq = 3 THEN UPPER(ss.subject_name) END) AS subject_3_name,
    MAX(CASE WHEN ss.subject_seq = 3 THEN ss.max_marks::TEXT END) AS subject_3_max,
    MAX(CASE WHEN ss.subject_seq = 3 THEN ss.marks_obtained::TEXT END) AS subject_3_obtained,
    MAX(CASE WHEN ss.subject_seq = 3 THEN CASE WHEN ss.is_pass THEN 'PASS' ELSE 'FAIL' END END) AS subject_3_status,

    -- Subject 4
    MAX(CASE WHEN ss.subject_seq = 4 THEN UPPER(ss.subject_code) END) AS subject_4_code,
    MAX(CASE WHEN ss.subject_seq = 4 THEN UPPER(ss.subject_name) END) AS subject_4_name,
    MAX(CASE WHEN ss.subject_seq = 4 THEN ss.max_marks::TEXT END) AS subject_4_max,
    MAX(CASE WHEN ss.subject_seq = 4 THEN ss.marks_obtained::TEXT END) AS subject_4_obtained,
    MAX(CASE WHEN ss.subject_seq = 4 THEN CASE WHEN ss.is_pass THEN 'PASS' ELSE 'FAIL' END END) AS subject_4_status,

    -- Subject 5
    MAX(CASE WHEN ss.subject_seq = 5 THEN UPPER(ss.subject_code) END) AS subject_5_code,
    MAX(CASE WHEN ss.subject_seq = 5 THEN UPPER(ss.subject_name) END) AS subject_5_name,
    MAX(CASE WHEN ss.subject_seq = 5 THEN ss.max_marks::TEXT END) AS subject_5_max,
    MAX(CASE WHEN ss.subject_seq = 5 THEN ss.marks_obtained::TEXT END) AS subject_5_obtained,
    MAX(CASE WHEN ss.subject_seq = 5 THEN CASE WHEN ss.is_pass THEN 'PASS' ELSE 'FAIL' END END) AS subject_5_status,

    -- Subject 6
    MAX(CASE WHEN ss.subject_seq = 6 THEN UPPER(ss.subject_code) END) AS subject_6_code,
    MAX(CASE WHEN ss.subject_seq = 6 THEN UPPER(ss.subject_name) END) AS subject_6_name,
    MAX(CASE WHEN ss.subject_seq = 6 THEN ss.max_marks::TEXT END) AS subject_6_max,
    MAX(CASE WHEN ss.subject_seq = 6 THEN ss.marks_obtained::TEXT END) AS subject_6_obtained,
    MAX(CASE WHEN ss.subject_seq = 6 THEN CASE WHEN ss.is_pass THEN 'PASS' ELSE 'FAIL' END END) AS subject_6_status,

    -- Subject 7
    MAX(CASE WHEN ss.subject_seq = 7 THEN UPPER(ss.subject_code) END) AS subject_7_code,
    MAX(CASE WHEN ss.subject_seq = 7 THEN UPPER(ss.subject_name) END) AS subject_7_name,
    MAX(CASE WHEN ss.subject_seq = 7 THEN ss.max_marks::TEXT END) AS subject_7_max,
    MAX(CASE WHEN ss.subject_seq = 7 THEN ss.marks_obtained::TEXT END) AS subject_7_obtained,
    MAX(CASE WHEN ss.subject_seq = 7 THEN CASE WHEN ss.is_pass THEN 'PASS' ELSE 'FAIL' END END) AS subject_7_status,

    -- Result Summary
    TO_CHAR(sr.sgpa, 'FM990.00') AS sgpa,
    TO_CHAR(sr.cgpa, 'FM990.00') AS cgpa,
    TO_CHAR(sr.percentage, 'FM990.00') AS percentage,
    sr.result_status,
    sr.result_class,
    TO_CHAR(COALESCE(sr.published_date, CURRENT_DATE), 'DD-MM-YYYY') AS result_date,

    -- Metadata
    s.id AS student_id,
    es.id AS examination_session_id,
    p.id AS program_id,
    i.id AS institution_id,
    COUNT(ss.subject_seq) AS total_subjects

FROM public.semester_results sr
LEFT JOIN public.students s ON sr.student_id = s.id
INNER JOIN public.programs p ON sr.program_id = p.id
INNER JOIN public.institutions i ON sr.institutions_id = i.id
INNER JOIN public.examination_sessions es ON sr.examination_session_id = es.id
LEFT JOIN public.academic_years ay ON s.academic_year_id = ay.id
LEFT JOIN student_subjects ss ON (
    ss.student_id = sr.student_id
    AND ss.examination_session_id = sr.examination_session_id
    AND ss.semester = sr.semester
)

WHERE sr.is_active = true
    AND sr.is_published = true

GROUP BY
    s.id,
    s.aadhar_number,
    s.roll_number,
    s.first_name,
    s.last_name,
    s.father_name,
    s.mother_name,
    s.date_of_birth,
    s.gender,
    p.program_name,
    p.program_code,
    sr.semester,
    i.name,
    i.institution_code,
    es.session_name,
    ay.academic_year,
    sr.sgpa,
    sr.cgpa,
    sr.percentage,
    sr.result_status,
    sr.result_class,
    sr.published_date,
    es.id,
    p.id,
    i.id

ORDER BY
    i.institution_code,
    p.program_code,
    sr.semester,
    s.roll_number;


-- =====================================================
-- 4. NAAD EXPORT FUNCTION
-- =====================================================
-- Function to get NAAD export data with filters
-- Returns only the 24 official NAAD columns
-- =====================================================

CREATE OR REPLACE FUNCTION get_naad_export_data(
    p_institution_id UUID DEFAULT NULL,
    p_examination_session_id UUID DEFAULT NULL,
    p_program_id UUID DEFAULT NULL,
    p_semester INT DEFAULT NULL
)
RETURNS TABLE (
    "ABC_ID" TEXT,
    "STUDENT_NAME" TEXT,
    "FATHER_NAME" TEXT,
    "MOTHER_NAME" TEXT,
    "DATE_OF_BIRTH" TEXT,
    "GENDER" TEXT,
    "PROGRAM_NAME" TEXT,
    "PROGRAM_CODE" TEXT,
    "SEMESTER" TEXT,
    "ENROLLMENT_NUMBER" TEXT,
    "ROLL_NUMBER" TEXT,
    "INSTITUTION_NAME" TEXT,
    "INSTITUTION_CODE" TEXT,
    "UNIVERSITY_NAME" TEXT,
    "ACADEMIC_YEAR" TEXT,
    "EXAM_SESSION" TEXT,
    "SUBJECT_CODE" TEXT,
    "SUBJECT_NAME" TEXT,
    "MAX_MARKS" TEXT,
    "MARKS_OBTAINED" TEXT,
    "RESULT_STATUS" TEXT,
    "SGPA" TEXT,
    "CGPA" TEXT,
    "RESULT_DATE" TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        nev."ABC_ID",
        nev."STUDENT_NAME",
        nev."FATHER_NAME",
        nev."MOTHER_NAME",
        nev."DATE_OF_BIRTH",
        nev."GENDER",
        nev."PROGRAM_NAME",
        nev."PROGRAM_CODE",
        nev."SEMESTER",
        nev."ENROLLMENT_NUMBER",
        nev."ROLL_NUMBER",
        nev."INSTITUTION_NAME",
        nev."INSTITUTION_CODE",
        nev."UNIVERSITY_NAME",
        nev."ACADEMIC_YEAR",
        nev."EXAM_SESSION",
        nev."SUBJECT_CODE",
        nev."SUBJECT_NAME",
        nev."MAX_MARKS",
        nev."MARKS_OBTAINED",
        nev."RESULT_STATUS",
        nev."SGPA",
        nev."CGPA",
        nev."RESULT_DATE"
    FROM public.naad_export_view nev
    WHERE (p_institution_id IS NULL OR nev.institution_id = p_institution_id)
        AND (p_examination_session_id IS NULL OR nev.examination_session_id = p_examination_session_id)
        AND (p_program_id IS NULL OR nev.program_id = p_program_id)
        AND (p_semester IS NULL OR nev.semester_number = p_semester)
    ORDER BY
        nev."INSTITUTION_CODE",
        nev."PROGRAM_CODE",
        nev."SEMESTER",
        nev."ENROLLMENT_NUMBER",
        nev."SUBJECT_CODE";
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- 5. GRANT PERMISSIONS
-- =====================================================

-- Grant SELECT on views to authenticated users
GRANT SELECT ON public.naad_export_view TO authenticated;
GRANT SELECT ON public.naad_export_summary TO authenticated;
GRANT SELECT ON public.naad_consolidated_view TO authenticated;

-- Grant EXECUTE on function to authenticated users
GRANT EXECUTE ON FUNCTION get_naad_export_data(UUID, UUID, UUID, INT) TO authenticated;

-- Grant to service role
GRANT SELECT ON public.naad_export_view TO service_role;
GRANT SELECT ON public.naad_export_summary TO service_role;
GRANT SELECT ON public.naad_consolidated_view TO service_role;
GRANT EXECUTE ON FUNCTION get_naad_export_data(UUID, UUID, UUID, INT) TO service_role;


-- =====================================================
-- 6. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON VIEW public.naad_export_view IS 'NAAD (National Academic Depository) compliant export view with 24 columns for ABC portal upload. Uses final_marks and semester_results tables. One row per student per subject.';
COMMENT ON VIEW public.naad_export_summary IS 'Summary statistics for NAAD export batches. Shows data completeness and export readiness status.';
COMMENT ON VIEW public.naad_consolidated_view IS 'Consolidated NAAD export format with all subjects in one row per student per semester. Up to 7 subjects per row.';
COMMENT ON FUNCTION get_naad_export_data(UUID, UUID, UUID, INT) IS 'Returns filtered NAAD export data for a specific institution, session, program, and/or semester. Returns only official 24 columns.';


-- =====================================================
-- USAGE EXAMPLES
-- =====================================================
/*

-- 1. Get all NAAD export data (official format):
SELECT
    "ABC_ID", "STUDENT_NAME", "FATHER_NAME", "MOTHER_NAME",
    "DATE_OF_BIRTH", "GENDER", "PROGRAM_NAME", "PROGRAM_CODE",
    "SEMESTER", "ENROLLMENT_NUMBER", "ROLL_NUMBER",
    "INSTITUTION_NAME", "INSTITUTION_CODE", "UNIVERSITY_NAME",
    "ACADEMIC_YEAR", "EXAM_SESSION", "SUBJECT_CODE", "SUBJECT_NAME",
    "MAX_MARKS", "MARKS_OBTAINED", "RESULT_STATUS",
    "SGPA", "CGPA", "RESULT_DATE"
FROM naad_export_view;

-- 2. Get NAAD data for a specific program and semester:
SELECT * FROM get_naad_export_data(
    NULL,  -- p_institution_id (NULL for all)
    NULL,  -- p_examination_session_id (NULL for all)
    'your-program-uuid',  -- p_program_id
    2  -- p_semester
);

-- 3. Check export readiness:
SELECT
    program_code,
    semester,
    total_students,
    pass_percentage,
    missing_abc_id_count,
    export_status
FROM naad_export_summary;

-- 4. Get consolidated view (one row per student):
SELECT * FROM naad_consolidated_view LIMIT 10;

-- 5. Export to CSV (run from psql):
\COPY (
    SELECT
        "ABC_ID", "STUDENT_NAME", "FATHER_NAME", "MOTHER_NAME",
        "DATE_OF_BIRTH", "GENDER", "PROGRAM_NAME", "PROGRAM_CODE",
        "SEMESTER", "ENROLLMENT_NUMBER", "ROLL_NUMBER",
        "INSTITUTION_NAME", "INSTITUTION_CODE", "UNIVERSITY_NAME",
        "ACADEMIC_YEAR", "EXAM_SESSION", "SUBJECT_CODE", "SUBJECT_NAME",
        "MAX_MARKS", "MARKS_OBTAINED", "RESULT_STATUS",
        "SGPA", "CGPA", "RESULT_DATE"
    FROM naad_export_view
    WHERE "PROGRAM_CODE" = 'BA-HIST' AND "SEMESTER" = '2'
) TO '/tmp/naad_export_ba_hist_sem2.csv' WITH CSV HEADER;

*/
-- =====================================================
-- END OF NAAD EXPORT VIEWS
-- =====================================================
