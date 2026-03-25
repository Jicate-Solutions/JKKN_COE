-- =====================================================
-- NAD ABC UPLOAD VIEW (Per-Subject Row Format)
-- =====================================================
-- Date: 2024-12-26
-- Purpose: Generate NAD/ABC compliant data in Official Upload Format
-- Format: One row per student per SUBJECT (dynamic subject count)
--
-- This view replaces the consolidated format (SUB1-SUB14) with a
-- normalized per-subject format that handles ANY number of subjects.
--
-- Key Differences from Consolidated View:
-- - Consolidated: One row per student per exam session, fixed SUB1-SUB14 columns
-- - Upload Format: One row per student per SUBJECT, 24 fixed columns
--
-- Advantages:
-- - Handles unlimited subjects (not limited to 14)
-- - Matches official NAD portal upload format exactly
-- - Simpler to process and validate
-- - Works for all programs regardless of credit structure
--
-- Tables Used:
-- - final_marks: Subject-wise marks (base table - one row per student per subject)
-- - semester_results: SGPA/CGPA for the semester
-- - students: Student personal details
-- - programs: Program/Course details
-- - courses: Subject details
-- - institutions: Institution details
-- - examination_sessions: Exam session details
-- - academic_years: Academic year details
-- =====================================================

-- Drop existing view if exists
DROP VIEW IF EXISTS public.nad_abc_upload_view CASCADE;

-- =====================================================
-- NAD ABC UPLOAD VIEW
-- =====================================================
-- One row per student per subject
-- Matches NAADUploadRow interface in types/naad-csv-format.ts
-- =====================================================

CREATE OR REPLACE VIEW public.nad_abc_upload_view AS
SELECT
    -- =====================================================
    -- COLUMN 1: ABC_ID (Academic Bank of Credits ID - 12 digits)
    -- Uses aadhar_number as the ABC ID source
    -- =====================================================
    COALESCE(s.aadhar_number, '') AS "ABC_ID",

    -- =====================================================
    -- COLUMN 2: STUDENT_NAME (Full name in UPPERCASE)
    -- Fallback: exam_registrations.student_name when students table empty
    -- =====================================================
    UPPER(COALESCE(
        NULLIF(TRIM(CONCAT(
            COALESCE(s.first_name, ''),
            CASE WHEN s.last_name IS NOT NULL AND s.last_name != '' THEN ' ' || s.last_name ELSE '' END
        )), ''),
        er.student_name,
        ''
    )) AS "STUDENT_NAME",

    -- =====================================================
    -- COLUMN 3: FATHER_NAME (in UPPERCASE)
    -- =====================================================
    UPPER(COALESCE(s.father_name, '')) AS "FATHER_NAME",

    -- =====================================================
    -- COLUMN 4: MOTHER_NAME (in UPPERCASE)
    -- =====================================================
    UPPER(COALESCE(s.mother_name, '')) AS "MOTHER_NAME",

    -- =====================================================
    -- COLUMN 5: DATE_OF_BIRTH (DD-MM-YYYY format with hyphens)
    -- =====================================================
    COALESCE(TO_CHAR(s.date_of_birth, 'DD-MM-YYYY'), '') AS "DATE_OF_BIRTH",

    -- =====================================================
    -- COLUMN 6: GENDER (MALE/FEMALE/OTHER)
    -- =====================================================
    CASE
        WHEN UPPER(TRIM(s.gender)) IN ('M', 'MALE') THEN 'MALE'
        WHEN UPPER(TRIM(s.gender)) IN ('F', 'FEMALE') THEN 'FEMALE'
        ELSE 'OTHER'
    END AS "GENDER",

    -- =====================================================
    -- COLUMN 7: PROGRAM_NAME (Full program name in UPPERCASE)
    -- =====================================================
    -- Fallback: final_marks.program_code when programs table empty
    UPPER(COALESCE(p.program_name, fm.program_code, '')) AS "PROGRAM_NAME",

    -- =====================================================
    -- COLUMN 8: PROGRAM_CODE
    -- =====================================================
    UPPER(COALESCE(p.program_code, fm.program_code, '')) AS "PROGRAM_CODE",

    -- =====================================================
    -- COLUMN 9: SEMESTER (as string)
    -- =====================================================
    COALESCE(sr.semester, COALESCE(co.semester, 1))::TEXT AS "SEMESTER",

    -- =====================================================
    -- COLUMN 10: ENROLLMENT_NUMBER
    -- Uses register_number as enrollment number
    -- =====================================================
    -- Fallback: final_marks.register_number when students table empty
    COALESCE(s.register_number, fm.register_number, '') AS "ENROLLMENT_NUMBER",

    -- =====================================================
    -- COLUMN 11: ROLL_NUMBER
    -- =====================================================
    COALESCE(s.roll_number, fm.register_number, '') AS "ROLL_NUMBER",

    -- =====================================================
    -- COLUMN 12: INSTITUTION_NAME (in UPPERCASE)
    -- =====================================================
    UPPER(COALESCE(i.name, '')) AS "INSTITUTION_NAME",

    -- =====================================================
    -- COLUMN 13: INSTITUTION_CODE
    -- =====================================================
    UPPER(COALESCE(i.institution_code, '')) AS "INSTITUTION_CODE",

    -- =====================================================
    -- COLUMN 14: UNIVERSITY_NAME (in UPPERCASE)
    -- Hardcoded as PERIYAR UNIVERSITY for JKKN Arts colleges
    -- =====================================================
    'PERIYAR UNIVERSITY' AS "UNIVERSITY_NAME",

    -- =====================================================
    -- COLUMN 15: ACADEMIC_YEAR (YYYY-YY format)
    -- =====================================================
    COALESCE(
        ay.academic_year,
        CASE
            WHEN es.exam_start_date IS NOT NULL AND es.exam_end_date IS NOT NULL THEN
                CONCAT(EXTRACT(YEAR FROM es.exam_start_date)::TEXT, '-',
                       RIGHT(EXTRACT(YEAR FROM es.exam_end_date)::TEXT, 2))
            ELSE ''
        END
    ) AS "ACADEMIC_YEAR",

    -- =====================================================
    -- COLUMN 16: EXAM_SESSION (e.g., "MAY 2024", "NOVEMBER 2024")
    -- =====================================================
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

    -- =====================================================
    -- COLUMN 17: SUBJECT_CODE
    -- =====================================================
    UPPER(COALESCE(c.course_code, '')) AS "SUBJECT_CODE",

    -- =====================================================
    -- COLUMN 18: SUBJECT_NAME (in UPPERCASE)
    -- =====================================================
    UPPER(COALESCE(c.course_name, '')) AS "SUBJECT_NAME",

    -- =====================================================
    -- COLUMN 19: MAX_MARKS
    -- =====================================================
    COALESCE(c.total_max_mark, 100)::TEXT AS "MAX_MARKS",

    -- =====================================================
    -- COLUMN 20: MARKS_OBTAINED
    -- =====================================================
    COALESCE(fm.total_marks_obtained, 0)::TEXT AS "MARKS_OBTAINED",

    -- =====================================================
    -- COLUMN 21: RESULT_STATUS (PASS or FAIL only)
    -- =====================================================
    CASE
        WHEN fm.is_pass = true THEN 'PASS'
        WHEN fm.pass_status = 'Pass' THEN 'PASS'
        ELSE 'FAIL'
    END AS "RESULT_STATUS",

    -- =====================================================
    -- COLUMN 22: SGPA (Semester GPA - repeated for each subject)
    -- =====================================================
    TO_CHAR(COALESCE(sr.sgpa, 0.00), 'FM990.00') AS "SGPA",

    -- =====================================================
    -- COLUMN 23: CGPA (Cumulative GPA - repeated for each subject)
    -- =====================================================
    TO_CHAR(COALESCE(sr.cgpa, 0.00), 'FM990.00') AS "CGPA",

    -- =====================================================
    -- COLUMN 24: RESULT_DATE (DD-MM-YYYY format)
    -- =====================================================
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
    -- These are used for API filtering but excluded from CSV export
    -- =====================================================
    fm.id AS final_mark_id,
    fm.student_id,
    fm.course_id,
    sr.id AS semester_result_id,
    fm.institutions_id AS institution_id,
    fm.examination_session_id,
    fm.program_id,
    sr.semester AS semester_number,
    -- Subject ordering info
    COALESCE(er.is_regular, true) AS is_regular_subject,
    COALESCE(co.semester, 1) AS subject_semester,
    -- Credit info for verification
    COALESCE(fm.credit, c.credit, 0) AS credit,
    fm.grade_points,
    fm.letter_grade,

    -- =====================================================
    -- MARK BREAKDOWN COLUMNS FOR PIVOT EXPORT
    -- Used by nad-pivot-export route to populate TH/PR/CE columns
    -- =====================================================
    UPPER(COALESCE(c.course_category, 'Theory')) AS course_category,
    -- Theory / External marks
    c.external_max_mark AS theory_max_mark,
    c.external_pass_mark AS theory_min_mark,
    fm.external_marks_obtained AS theory_marks_obtained,
    -- Practical marks (same source columns; route uses course_category to place)
    c.external_max_mark AS practical_max_mark,
    c.external_pass_mark AS practical_min_mark,
    fm.external_marks_obtained AS practical_marks_obtained,
    -- Practical CE marks (internal component of practical courses)
    fm.internal_marks_obtained AS practical_ce_marks,
    -- CE / Internal marks
    c.internal_max_mark AS ce_max_mark,
    c.internal_pass_mark AS ce_min_mark,
    fm.internal_marks_obtained AS ce_marks_obtained,
    fm.internal_marks_maximum,
    -- Raw pass_status for REMARKS mapping (Absent→RA, Reappear→RA, Pass→P)
    fm.pass_status AS raw_pass_status,
    -- Folio number for CERT_NO
    COALESCE(sr.folio_number, '') AS folio_number,

    -- Row number for ordering
    ROW_NUMBER() OVER (
        PARTITION BY fm.student_id, fm.examination_session_id
        ORDER BY
            -- Regular subjects first
            CASE WHEN COALESCE(er.is_regular, true) = true THEN 0 ELSE 1 END,
            -- For arrear subjects, sort by semester DESC
            CASE WHEN COALESCE(er.is_regular, true) = false THEN COALESCE(co.semester, 1) END DESC NULLS LAST,
            -- Then by course order
            COALESCE(cm.course_order, 999),
            -- Finally by course code
            c.course_code
    ) AS subject_order

FROM public.final_marks fm
-- Students and programs as LEFT JOIN (tables may be empty; fallback to fm/er fields)
LEFT JOIN public.students s ON fm.student_id = s.id
LEFT JOIN public.programs p ON fm.program_id = p.id
-- Required tables (always have data)
INNER JOIN public.courses c ON fm.course_id = c.id
INNER JOIN public.institutions i ON fm.institutions_id = i.id
INNER JOIN public.examination_sessions es ON fm.examination_session_id = es.id
-- Optional joins
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
-- Join with course_offerings for subject semester
LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
-- Join with course_mapping for subject ordering
LEFT JOIN public.course_mapping cm ON (
    cm.course_id = c.id
    AND cm.program_code = COALESCE(p.program_code, fm.program_code)
    AND cm.is_active = true
)
-- Join with semester_results for SGPA/CGPA
LEFT JOIN public.semester_results sr ON (
    sr.student_id = fm.student_id
    AND sr.examination_session_id = fm.examination_session_id
    AND sr.is_active = true
    AND sr.is_published = true
)
-- Join with academic_years
LEFT JOIN public.academic_years ay ON es.academic_year_id = ay.id
-- Join with departments for STREAM (via programs.offering_department_id)
LEFT JOIN public.departments dept ON p.offering_department_id = dept.id

WHERE fm.is_active = true
    AND fm.result_status = 'Published'

ORDER BY
    i.name,
    COALESCE(p.program_code, fm.program_code),
    COALESCE(sr.semester, COALESCE(co.semester, 1)),
    COALESCE(s.register_number, fm.register_number),
    -- Subject order within each student
    CASE WHEN COALESCE(er.is_regular, true) = true THEN 0 ELSE 1 END,
    COALESCE(cm.course_order, 999),
    c.course_code;


-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant SELECT on view to authenticated users
GRANT SELECT ON public.nad_abc_upload_view TO authenticated;

-- Grant to service role
GRANT SELECT ON public.nad_abc_upload_view TO service_role;


-- =====================================================
-- ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON VIEW public.nad_abc_upload_view IS
'NAD ABC (Academic Bank of Credits) Upload Format View.

Format: One row per student per SUBJECT (dynamic subject count).
This matches the official NAD portal upload format with 24 fixed columns.

Key Features:
- DYNAMIC subject count (no limit to 14 subjects)
- ONE ROW per student per subject
- All 24 NAD-required columns in correct order
- SGPA/CGPA repeated for each subject row
- Subject ordering: Regular first (by course_order), then Arrear (by semester DESC)
- Date format: DD-MM-YYYY (with hyphens as required by NAD)
- All text fields in UPPERCASE

Column Reference:
1. ABC_ID - Academic Bank of Credits ID (12 digits)
2. STUDENT_NAME - Full name in UPPERCASE
3. FATHER_NAME - Father name in UPPERCASE
4. MOTHER_NAME - Mother name in UPPERCASE
5. DATE_OF_BIRTH - DD-MM-YYYY format
6. GENDER - MALE/FEMALE/OTHER
7. PROGRAM_NAME - Full program name
8. PROGRAM_CODE - Program code
9. SEMESTER - Semester number as string
10. ENROLLMENT_NUMBER - Student enrollment number
11. ROLL_NUMBER - Student roll number
12. INSTITUTION_NAME - Institution name
13. INSTITUTION_CODE - Institution code
14. UNIVERSITY_NAME - Affiliating university
15. ACADEMIC_YEAR - YYYY-YY format
16. EXAM_SESSION - e.g., "MAY 2024"
17. SUBJECT_CODE - Course/subject code
18. SUBJECT_NAME - Course/subject name
19. MAX_MARKS - Maximum marks for subject
20. MARKS_OBTAINED - Marks obtained by student
21. RESULT_STATUS - PASS or FAIL
22. SGPA - Semester GPA
23. CGPA - Cumulative GPA
24. RESULT_DATE - DD-MM-YYYY format

Note: Additional columns (final_mark_id, student_id, etc.) are included
for filtering purposes but should be excluded from CSV export.';


-- =====================================================
-- USAGE EXAMPLES
-- =====================================================
/*

-- 1. Get all NAD ABC upload data:
SELECT
    "ABC_ID", "STUDENT_NAME", "FATHER_NAME", "MOTHER_NAME",
    "DATE_OF_BIRTH", "GENDER", "PROGRAM_NAME", "PROGRAM_CODE",
    "SEMESTER", "ENROLLMENT_NUMBER", "ROLL_NUMBER",
    "INSTITUTION_NAME", "INSTITUTION_CODE", "UNIVERSITY_NAME",
    "ACADEMIC_YEAR", "EXAM_SESSION", "SUBJECT_CODE", "SUBJECT_NAME",
    "MAX_MARKS", "MARKS_OBTAINED", "RESULT_STATUS",
    "SGPA", "CGPA", "RESULT_DATE"
FROM nad_abc_upload_view;

-- 2. Get data for a specific program and semester:
SELECT *
FROM nad_abc_upload_view
WHERE program_id = 'your-program-uuid'
  AND semester_number = 2;

-- 3. Get data for a specific exam session:
SELECT *
FROM nad_abc_upload_view
WHERE examination_session_id = 'your-exam-session-uuid';

-- 4. Count subjects per student (to verify dynamic count):
SELECT
    "STUDENT_NAME",
    "SEMESTER",
    COUNT(*) as subject_count
FROM nad_abc_upload_view
WHERE program_id = 'your-program-uuid'
GROUP BY student_id, "STUDENT_NAME", "SEMESTER"
ORDER BY subject_count DESC;

-- 5. Example: Student with 8 subjects
-- Regular subjects: 5 from current semester
-- Arrear subjects: 3 from previous semesters
-- Result: 8 rows for this student (one per subject)

*/
-- =====================================================
-- END OF NAD ABC UPLOAD VIEW
-- =====================================================
