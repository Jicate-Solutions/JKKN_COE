-- =====================================================
-- NAAD ABC CONSOLIDATED EXPORT VIEW
-- =====================================================
-- Date: 2024-12-24 (Updated)
-- Purpose: Generate NAAD/ABC compliant consolidated data export
-- Format: One row per student per exam session with pivoted subjects (SUB1-SUB40)
--
-- Tables Used:
-- - semester_results: Base table for one row per student per exam session (SGPA/CGPA)
-- - final_marks: Subject-wise marks (internal + external)
-- - students: Student personal details
-- - programs: Program/Course details
-- - courses: Subject details with course_category (Theory/Practical)
-- - course_mapping: Course order for subject sequencing
-- - institutions: Institution details
-- - examination_sessions: Exam session details
-- - exam_registrations: Student registration details (is_regular flag)
-- - departments: Department details
-- - batch: Batch/Session details
--
-- Key Features:
-- - ONE ROW per student per exam session (not per semester)
-- - All subjects (Regular + Arrear) combined in same row
-- - Subject Ordering:
--   1. Regular subjects first (is_regular = TRUE), sorted by course_order ASC
--   2. Arrear subjects second (is_regular = FALSE), sorted by semester DESC, then course_order ASC
-- - Theory/Practical logic based on courses.course_category
-- - 40 subjects per row (SUB1-SUB40) - supports regular + arrear subjects
-- - Grade handling: AAA = U grade, else grade_points
-- - Pass status mapping: Pass=P, Absent=U, Reappear=U
-- - Includes SUBn_SEM column to show subject's original semester
-- =====================================================

-- Drop existing views/functions if exists
DROP VIEW IF EXISTS public.naad_abc_consolidated_view CASCADE;
DROP FUNCTION IF EXISTS get_naad_abc_export_data(UUID, UUID, UUID, INT);

-- =====================================================
-- 1. NAAD ABC CONSOLIDATED VIEW
-- =====================================================
-- One row per student per exam session with all subjects pivoted
-- Matches the NAAD upload format specification
-- =====================================================

CREATE OR REPLACE VIEW public.naad_abc_consolidated_view AS
WITH
-- Step 1: Get base student+session records from semester_results
-- This ensures ONE ROW per student per exam session
student_sessions AS (
    SELECT DISTINCT
        sr.id AS semester_result_id,
        sr.student_id,
        sr.examination_session_id,
        sr.program_id,
        sr.institutions_id,
        sr.semester AS current_semester,  -- The semester being attempted in this exam session
        sr.sgpa,
        sr.cgpa,
        sr.percentage,
        sr.total_credits_earned,
        sr.total_credit_points,
        sr.is_published
    FROM public.semester_results sr
    WHERE sr.is_active = true
        AND sr.is_published = true
),

-- Step 2: Get all subjects for each student+exam session with ordering
-- Subjects are ordered: Regular first (by course_order), then Arrear (by semester DESC, course_order)
ordered_subjects AS (
    SELECT
        fm.student_id,
        fm.examination_session_id,
        fm.exam_registration_id,
        fm.program_id,
        fm.institutions_id,
        -- Subject's original semester (for SUBn_SEM column)
        COALESCE(co.semester, 1) AS subject_semester,
        -- Is this a regular or arrear subject?
        COALESCE(er.is_regular, TRUE) AS is_regular,
        -- Course details
        c.id AS course_id,
        c.course_code,
        c.course_name,
        c.course_category,
        c.credit,
        -- Marks from courses table (defaults)
        COALESCE(c.total_max_mark, 100) AS total_max_mark,
        COALESCE(c.total_pass_mark, 40) AS total_pass_mark,
        COALESCE(c.internal_max_mark, 25) AS internal_max_mark,
        COALESCE(c.internal_pass_mark, 10) AS internal_pass_mark,
        -- Final marks data
        fm.internal_marks_obtained,
        fm.external_marks_obtained,
        fm.total_marks_obtained,
        fm.letter_grade,
        fm.grade_points,
        fm.is_pass,
        fm.pass_status,
        COALESCE(fm.credit, c.credit) AS fm_credit,
        COALESCE(fm.total_grade_points, fm.grade_points * COALESCE(fm.credit, c.credit)) AS fm_credit_points,
        -- Order subjects: Regular first, then Arrear (by semester DESC, course_order)
        ROW_NUMBER() OVER (
            PARTITION BY fm.student_id, fm.examination_session_id
            ORDER BY
                -- Regular subjects first (is_regular=TRUE comes before FALSE)
                CASE WHEN COALESCE(er.is_regular, TRUE) = TRUE THEN 0 ELSE 1 END,
                -- For Arrear subjects, sort by semester DESC (higher semester first)
                CASE WHEN COALESCE(er.is_regular, TRUE) = FALSE THEN COALESCE(co.semester, 1) END DESC NULLS LAST,
                -- Then by course_order ASC
                COALESCE(cm.course_order, 999),
                -- Finally by course_code for consistency
                c.course_code
        ) AS subject_seq
    FROM public.final_marks fm
    INNER JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
    INNER JOIN public.courses c ON fm.course_id = c.id
    LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
    LEFT JOIN public.course_mapping cm ON (
        cm.course_id = c.id
        AND cm.program_code = (SELECT program_code FROM public.programs WHERE id = fm.program_id)
        AND cm.is_active = true
    )
    WHERE fm.is_active = true
        AND fm.result_status = 'Published'
)

-- Step 3: Main SELECT - join student_sessions with ordered_subjects
SELECT
    -- =====================================================
    -- ORGANIZATION & COURSE INFORMATION
    -- =====================================================
    UPPER(COALESCE(i.name, '')) AS "ORG_NAME",
    UPPER(COALESCE(p.program_code, '')) AS "ACADEMIC_COURSE_ID",
    UPPER(COALESCE(p.program_name, '')) AS "COURSE_NAME",
    '' AS "STREAM", -- Blank as per spec
    COALESCE(b.batch_name, ay.academic_year, '') AS "SESSION",

    -- =====================================================
    -- STUDENT PERSONAL INFORMATION
    -- =====================================================
    COALESCE(s.register_number, s.roll_number, '') AS "REGN_NO",
    '' AS "RROLL", -- Blank as per spec
    UPPER(TRIM(CONCAT(
        COALESCE(s.first_name, ''),
        CASE WHEN s.last_name IS NOT NULL AND s.last_name != '' THEN ' ' || s.last_name ELSE '' END
    ))) AS "CNAME",
    CASE
        WHEN UPPER(TRIM(s.gender)) IN ('M', 'MALE') THEN 'M'
        WHEN UPPER(TRIM(s.gender)) IN ('F', 'FEMALE') THEN 'F'
        ELSE 'O'
    END AS "GENDER",
    CASE
        WHEN s.date_of_birth ~ '^\d{4}-\d{2}-\d{2}$' THEN
            TO_CHAR(TO_DATE(s.date_of_birth, 'YYYY-MM-DD'), 'DD/MM/YYYY')
        WHEN s.date_of_birth ~ '^\d{2}/\d{2}/\d{4}$' THEN
            s.date_of_birth
        WHEN s.date_of_birth ~ '^\d{2}-\d{2}-\d{4}$' THEN
            REPLACE(s.date_of_birth, '-', '/')
        ELSE COALESCE(s.date_of_birth, '')
    END AS "DOB",
    UPPER(COALESCE(s.father_name, '')) AS "FNAME",
    UPPER(COALESCE(s.mother_name, '')) AS "MNAME",
    '' AS "PHOTO", -- Blank - photo URL if needed

    -- =====================================================
    -- RESULT INFORMATION
    -- =====================================================
    '' AS "MRKS_REC_STATUS", -- Marks record status
    COALESCE(es.session_code, '') AS "RESULT",
    COALESCE(EXTRACT(YEAR FROM es.exam_end_date)::TEXT, '') AS "YEAR",
    '' AS "CSV_MONTH", -- CSV month
    CASE
        WHEN es.session_name ILIKE '%NOV%' OR es.session_name ILIKE '%DEC%' THEN 'NOV'
        WHEN es.session_name ILIKE '%APR%' OR es.session_name ILIKE '%MAY%' THEN 'APR'
        ELSE UPPER(SUBSTRING(COALESCE(es.session_name, ''), 1, 3))
    END AS "MONTH",
    TO_CHAR(ss.percentage, 'FM990.00') AS "PERCENT",
    '' AS "DOI", -- Date of issue
    '' AS "CERT_NO", -- Certificate number
    ss.current_semester::TEXT AS "SEM",  -- Current semester from semester_results
    '' AS "EXAM_TYPE", -- Regular/Supplementary
    ss.total_credits_earned::TEXT AS "TOT_CREDIT",
    TO_CHAR(ss.total_credit_points, 'FM9990.00') AS "TOT_CREDIT_POINTS",
    TO_CHAR(ss.cgpa, 'FM990.00') AS "CGPA",
    COALESCE(s.aadhar_number, '') AS "ABC_ACCOUNT_ID",
    'SEMESTER' AS "TERM_TYPE", -- Default value
    '' AS "TOT_GRADE", -- Total grade
    UPPER(COALESCE(d.department_name, '')) AS "DEPARTMENT",

    -- =====================================================
    -- SUBJECT 1
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.course_name END), '')) AS "SUB1NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.course_code END), '')) AS "SUB1",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.subject_semester END)::TEXT, '') AS "SUB1_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.total_max_mark END)::TEXT, '') AS "SUB1MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.total_pass_mark END)::TEXT, '') AS "SUB1MIN",
    -- Theory max (if Theory course)
    CASE WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB1_TH_MAX",
    '' AS "SUB1_VV_MRKS", -- Viva marks
    -- Practical CE marks (if Practical course)
    CASE WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB1_PR_CE_MRKS",
    -- Theory min (if Theory course)
    CASE WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB1_TH_MIN",
    -- Practical max (if Practical course)
    CASE WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB1_PR_MAX",
    -- Practical min (if Practical course)
    CASE WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB1_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.internal_max_mark END)::TEXT, '') AS "SUB1_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB1_CE_MIN",
    -- Theory marks (if Theory course)
    CASE WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB1_TH_MRKS",
    -- Practical marks (if Practical course)
    CASE WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB1_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB1_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB1_TOT",
    -- Grade: if AAA then U, else letter_grade
    CASE WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.letter_grade END), '') END AS "SUB1_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.grade_points END)::TEXT, '') AS "SUB1_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.fm_credit END)::TEXT, '') AS "SUB1_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 1 THEN os.fm_credit_points END)::TEXT, '') AS "SUB1_CREDIT_POINTS",
    -- Remarks: Pass=P, Absent=U, Reappear=U
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 1 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 1 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB1_REMARKS",

    -- =====================================================
    -- SUBJECT 2
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.course_name END), '')) AS "SUB2NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.course_code END), '')) AS "SUB2",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.subject_semester END)::TEXT, '') AS "SUB2_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.total_max_mark END)::TEXT, '') AS "SUB2MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.total_pass_mark END)::TEXT, '') AS "SUB2MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB2_TH_MAX",
    '' AS "SUB2_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB2_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB2_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB2_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB2_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.internal_max_mark END)::TEXT, '') AS "SUB2_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB2_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB2_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB2_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB2_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB2_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.letter_grade END), '') END AS "SUB2_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.grade_points END)::TEXT, '') AS "SUB2_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.fm_credit END)::TEXT, '') AS "SUB2_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 2 THEN os.fm_credit_points END)::TEXT, '') AS "SUB2_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 2 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 2 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB2_REMARKS",

    -- =====================================================
    -- SUBJECT 3
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.course_name END), '')) AS "SUB3NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.course_code END), '')) AS "SUB3",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.subject_semester END)::TEXT, '') AS "SUB3_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.total_max_mark END)::TEXT, '') AS "SUB3MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.total_pass_mark END)::TEXT, '') AS "SUB3MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB3_TH_MAX",
    '' AS "SUB3_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB3_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB3_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB3_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB3_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.internal_max_mark END)::TEXT, '') AS "SUB3_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB3_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB3_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB3_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB3_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB3_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.letter_grade END), '') END AS "SUB3_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.grade_points END)::TEXT, '') AS "SUB3_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.fm_credit END)::TEXT, '') AS "SUB3_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 3 THEN os.fm_credit_points END)::TEXT, '') AS "SUB3_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 3 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 3 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB3_REMARKS",

    -- =====================================================
    -- SUBJECT 4
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.course_name END), '')) AS "SUB4NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.course_code END), '')) AS "SUB4",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.subject_semester END)::TEXT, '') AS "SUB4_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.total_max_mark END)::TEXT, '') AS "SUB4MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.total_pass_mark END)::TEXT, '') AS "SUB4MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB4_TH_MAX",
    '' AS "SUB4_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB4_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB4_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB4_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB4_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.internal_max_mark END)::TEXT, '') AS "SUB4_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB4_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB4_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB4_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB4_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB4_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.letter_grade END), '') END AS "SUB4_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.grade_points END)::TEXT, '') AS "SUB4_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.fm_credit END)::TEXT, '') AS "SUB4_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 4 THEN os.fm_credit_points END)::TEXT, '') AS "SUB4_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 4 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 4 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB4_REMARKS",

    -- =====================================================
    -- SUBJECT 5
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.course_name END), '')) AS "SUB5NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.course_code END), '')) AS "SUB5",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.subject_semester END)::TEXT, '') AS "SUB5_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.total_max_mark END)::TEXT, '') AS "SUB5MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.total_pass_mark END)::TEXT, '') AS "SUB5MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB5_TH_MAX",
    '' AS "SUB5_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB5_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB5_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB5_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB5_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.internal_max_mark END)::TEXT, '') AS "SUB5_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB5_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB5_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB5_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB5_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB5_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.letter_grade END), '') END AS "SUB5_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.grade_points END)::TEXT, '') AS "SUB5_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.fm_credit END)::TEXT, '') AS "SUB5_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 5 THEN os.fm_credit_points END)::TEXT, '') AS "SUB5_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 5 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 5 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB5_REMARKS",

    -- =====================================================
    -- SUBJECT 6
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.course_name END), '')) AS "SUB6NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.course_code END), '')) AS "SUB6",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.subject_semester END)::TEXT, '') AS "SUB6_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.total_max_mark END)::TEXT, '') AS "SUB6MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.total_pass_mark END)::TEXT, '') AS "SUB6MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB6_TH_MAX",
    '' AS "SUB6_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB6_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB6_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB6_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB6_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.internal_max_mark END)::TEXT, '') AS "SUB6_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB6_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB6_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB6_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB6_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB6_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.letter_grade END), '') END AS "SUB6_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.grade_points END)::TEXT, '') AS "SUB6_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.fm_credit END)::TEXT, '') AS "SUB6_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 6 THEN os.fm_credit_points END)::TEXT, '') AS "SUB6_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 6 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 6 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB6_REMARKS",

    -- =====================================================
    -- SUBJECT 7
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.course_name END), '')) AS "SUB7NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.course_code END), '')) AS "SUB7",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.subject_semester END)::TEXT, '') AS "SUB7_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.total_max_mark END)::TEXT, '') AS "SUB7MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.total_pass_mark END)::TEXT, '') AS "SUB7MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB7_TH_MAX",
    '' AS "SUB7_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB7_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB7_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB7_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB7_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.internal_max_mark END)::TEXT, '') AS "SUB7_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB7_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB7_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB7_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB7_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB7_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.letter_grade END), '') END AS "SUB7_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.grade_points END)::TEXT, '') AS "SUB7_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.fm_credit END)::TEXT, '') AS "SUB7_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 7 THEN os.fm_credit_points END)::TEXT, '') AS "SUB7_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 7 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 7 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB7_REMARKS",

    -- =====================================================
    -- SUBJECT 8
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.course_name END), '')) AS "SUB8NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.course_code END), '')) AS "SUB8",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.subject_semester END)::TEXT, '') AS "SUB8_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.total_max_mark END)::TEXT, '') AS "SUB8MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.total_pass_mark END)::TEXT, '') AS "SUB8MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB8_TH_MAX",
    '' AS "SUB8_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB8_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB8_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB8_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB8_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.internal_max_mark END)::TEXT, '') AS "SUB8_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB8_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB8_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB8_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB8_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB8_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.letter_grade END), '') END AS "SUB8_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.grade_points END)::TEXT, '') AS "SUB8_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.fm_credit END)::TEXT, '') AS "SUB8_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 8 THEN os.fm_credit_points END)::TEXT, '') AS "SUB8_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 8 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 8 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB8_REMARKS",

    -- =====================================================
    -- SUBJECT 9
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.course_name END), '')) AS "SUB9NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.course_code END), '')) AS "SUB9",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.subject_semester END)::TEXT, '') AS "SUB9_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.total_max_mark END)::TEXT, '') AS "SUB9MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.total_pass_mark END)::TEXT, '') AS "SUB9MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB9_TH_MAX",
    '' AS "SUB9_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB9_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB9_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB9_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB9_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.internal_max_mark END)::TEXT, '') AS "SUB9_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB9_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB9_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB9_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB9_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB9_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.letter_grade END), '') END AS "SUB9_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.grade_points END)::TEXT, '') AS "SUB9_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.fm_credit END)::TEXT, '') AS "SUB9_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 9 THEN os.fm_credit_points END)::TEXT, '') AS "SUB9_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 9 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 9 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB9_REMARKS",

    -- =====================================================
    -- SUBJECT 10
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.course_name END), '')) AS "SUB10NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.course_code END), '')) AS "SUB10",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.subject_semester END)::TEXT, '') AS "SUB10_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.total_max_mark END)::TEXT, '') AS "SUB10MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.total_pass_mark END)::TEXT, '') AS "SUB10MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB10_TH_MAX",
    '' AS "SUB10_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB10_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB10_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB10_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB10_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.internal_max_mark END)::TEXT, '') AS "SUB10_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB10_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB10_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB10_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB10_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB10_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.letter_grade END), '') END AS "SUB10_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.grade_points END)::TEXT, '') AS "SUB10_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.fm_credit END)::TEXT, '') AS "SUB10_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 10 THEN os.fm_credit_points END)::TEXT, '') AS "SUB10_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 10 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 10 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB10_REMARKS",

    -- =====================================================
    -- SUBJECT 11
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.course_name END), '')) AS "SUB11NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.course_code END), '')) AS "SUB11",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.subject_semester END)::TEXT, '') AS "SUB11_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.total_max_mark END)::TEXT, '') AS "SUB11MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.total_pass_mark END)::TEXT, '') AS "SUB11MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB11_TH_MAX",
    '' AS "SUB11_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB11_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB11_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB11_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB11_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.internal_max_mark END)::TEXT, '') AS "SUB11_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB11_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB11_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB11_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB11_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB11_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.letter_grade END), '') END AS "SUB11_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.grade_points END)::TEXT, '') AS "SUB11_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.fm_credit END)::TEXT, '') AS "SUB11_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 11 THEN os.fm_credit_points END)::TEXT, '') AS "SUB11_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 11 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 11 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB11_REMARKS",

    -- =====================================================
    -- SUBJECT 12
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.course_name END), '')) AS "SUB12NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.course_code END), '')) AS "SUB12",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.subject_semester END)::TEXT, '') AS "SUB12_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.total_max_mark END)::TEXT, '') AS "SUB12MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.total_pass_mark END)::TEXT, '') AS "SUB12MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB12_TH_MAX",
    '' AS "SUB12_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB12_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB12_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB12_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB12_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.internal_max_mark END)::TEXT, '') AS "SUB12_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB12_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB12_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB12_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB12_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB12_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.letter_grade END), '') END AS "SUB12_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.grade_points END)::TEXT, '') AS "SUB12_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.fm_credit END)::TEXT, '') AS "SUB12_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 12 THEN os.fm_credit_points END)::TEXT, '') AS "SUB12_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 12 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 12 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB12_REMARKS",

    -- =====================================================
    -- SUBJECT 13
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.course_name END), '')) AS "SUB13NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.course_code END), '')) AS "SUB13",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.subject_semester END)::TEXT, '') AS "SUB13_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.total_max_mark END)::TEXT, '') AS "SUB13MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.total_pass_mark END)::TEXT, '') AS "SUB13MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB13_TH_MAX",
    '' AS "SUB13_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB13_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB13_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB13_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB13_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.internal_max_mark END)::TEXT, '') AS "SUB13_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB13_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB13_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB13_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB13_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB13_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.letter_grade END), '') END AS "SUB13_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.grade_points END)::TEXT, '') AS "SUB13_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.fm_credit END)::TEXT, '') AS "SUB13_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 13 THEN os.fm_credit_points END)::TEXT, '') AS "SUB13_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 13 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 13 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB13_REMARKS",

    -- =====================================================
    -- SUBJECT 14
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.course_name END), '')) AS "SUB14NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.course_code END), '')) AS "SUB14",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.subject_semester END)::TEXT, '') AS "SUB14_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.total_max_mark END)::TEXT, '') AS "SUB14MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.total_pass_mark END)::TEXT, '') AS "SUB14MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB14_TH_MAX",
    '' AS "SUB14_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB14_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB14_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB14_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB14_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.internal_max_mark END)::TEXT, '') AS "SUB14_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB14_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB14_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB14_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB14_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB14_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.letter_grade END), '') END AS "SUB14_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.grade_points END)::TEXT, '') AS "SUB14_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.fm_credit END)::TEXT, '') AS "SUB14_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 14 THEN os.fm_credit_points END)::TEXT, '') AS "SUB14_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 14 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 14 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB14_REMARKS",

    -- =====================================================
    -- SUBJECT 15
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.course_name END), '')) AS "SUB15NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.course_code END), '')) AS "SUB15",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.subject_semester END)::TEXT, '') AS "SUB15_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.total_max_mark END)::TEXT, '') AS "SUB15MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.total_pass_mark END)::TEXT, '') AS "SUB15MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB15_TH_MAX",
    '' AS "SUB15_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB15_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB15_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB15_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB15_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.internal_max_mark END)::TEXT, '') AS "SUB15_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB15_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB15_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB15_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB15_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB15_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.letter_grade END), '') END AS "SUB15_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.grade_points END)::TEXT, '') AS "SUB15_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.fm_credit END)::TEXT, '') AS "SUB15_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 15 THEN os.fm_credit_points END)::TEXT, '') AS "SUB15_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 15 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 15 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB15_REMARKS",

    -- =====================================================
    -- SUBJECT 16
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.course_name END), '')) AS "SUB16NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.course_code END), '')) AS "SUB16",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.subject_semester END)::TEXT, '') AS "SUB16_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.total_max_mark END)::TEXT, '') AS "SUB16MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.total_pass_mark END)::TEXT, '') AS "SUB16MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB16_TH_MAX",
    '' AS "SUB16_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB16_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB16_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB16_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB16_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.internal_max_mark END)::TEXT, '') AS "SUB16_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB16_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB16_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB16_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB16_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB16_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.letter_grade END), '') END AS "SUB16_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.grade_points END)::TEXT, '') AS "SUB16_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.fm_credit END)::TEXT, '') AS "SUB16_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 16 THEN os.fm_credit_points END)::TEXT, '') AS "SUB16_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 16 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 16 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB16_REMARKS",

    -- =====================================================
    -- SUBJECT 17
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.course_name END), '')) AS "SUB17NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.course_code END), '')) AS "SUB17",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.subject_semester END)::TEXT, '') AS "SUB17_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.total_max_mark END)::TEXT, '') AS "SUB17MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.total_pass_mark END)::TEXT, '') AS "SUB17MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB17_TH_MAX",
    '' AS "SUB17_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB17_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB17_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB17_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB17_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.internal_max_mark END)::TEXT, '') AS "SUB17_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB17_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB17_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB17_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB17_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB17_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.letter_grade END), '') END AS "SUB17_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.grade_points END)::TEXT, '') AS "SUB17_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.fm_credit END)::TEXT, '') AS "SUB17_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 17 THEN os.fm_credit_points END)::TEXT, '') AS "SUB17_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 17 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 17 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB17_REMARKS",

    -- =====================================================
    -- SUBJECT 18
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.course_name END), '')) AS "SUB18NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.course_code END), '')) AS "SUB18",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.subject_semester END)::TEXT, '') AS "SUB18_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.total_max_mark END)::TEXT, '') AS "SUB18MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.total_pass_mark END)::TEXT, '') AS "SUB18MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB18_TH_MAX",
    '' AS "SUB18_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB18_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB18_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB18_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB18_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.internal_max_mark END)::TEXT, '') AS "SUB18_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB18_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB18_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB18_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB18_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB18_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.letter_grade END), '') END AS "SUB18_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.grade_points END)::TEXT, '') AS "SUB18_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.fm_credit END)::TEXT, '') AS "SUB18_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 18 THEN os.fm_credit_points END)::TEXT, '') AS "SUB18_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 18 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 18 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB18_REMARKS",

    -- =====================================================
    -- SUBJECT 19
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.course_name END), '')) AS "SUB19NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.course_code END), '')) AS "SUB19",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.subject_semester END)::TEXT, '') AS "SUB19_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.total_max_mark END)::TEXT, '') AS "SUB19MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.total_pass_mark END)::TEXT, '') AS "SUB19MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB19_TH_MAX",
    '' AS "SUB19_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB19_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB19_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB19_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB19_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.internal_max_mark END)::TEXT, '') AS "SUB19_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB19_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB19_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB19_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB19_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB19_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.letter_grade END), '') END AS "SUB19_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.grade_points END)::TEXT, '') AS "SUB19_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.fm_credit END)::TEXT, '') AS "SUB19_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 19 THEN os.fm_credit_points END)::TEXT, '') AS "SUB19_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 19 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 19 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB19_REMARKS",

    -- =====================================================
    -- SUBJECT 20
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.course_name END), '')) AS "SUB20NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.course_code END), '')) AS "SUB20",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.subject_semester END)::TEXT, '') AS "SUB20_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.total_max_mark END)::TEXT, '') AS "SUB20MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.total_pass_mark END)::TEXT, '') AS "SUB20MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB20_TH_MAX",
    '' AS "SUB20_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB20_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB20_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB20_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB20_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.internal_max_mark END)::TEXT, '') AS "SUB20_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB20_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB20_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB20_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB20_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB20_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.letter_grade END), '') END AS "SUB20_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.grade_points END)::TEXT, '') AS "SUB20_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.fm_credit END)::TEXT, '') AS "SUB20_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 20 THEN os.fm_credit_points END)::TEXT, '') AS "SUB20_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 20 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 20 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB20_REMARKS",

    -- =====================================================
    -- SUBJECT 21
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.course_name END), '')) AS "SUB21NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.course_code END), '')) AS "SUB21",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.subject_semester END)::TEXT, '') AS "SUB21_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.total_max_mark END)::TEXT, '') AS "SUB21MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.total_pass_mark END)::TEXT, '') AS "SUB21MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB21_TH_MAX",
    '' AS "SUB21_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB21_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB21_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB21_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB21_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.internal_max_mark END)::TEXT, '') AS "SUB21_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB21_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB21_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB21_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB21_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB21_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.letter_grade END), '') END AS "SUB21_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.grade_points END)::TEXT, '') AS "SUB21_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.fm_credit END)::TEXT, '') AS "SUB21_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 21 THEN os.fm_credit_points END)::TEXT, '') AS "SUB21_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 21 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 21 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB21_REMARKS",

    -- =====================================================
    -- SUBJECT 22
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.course_name END), '')) AS "SUB22NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.course_code END), '')) AS "SUB22",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.subject_semester END)::TEXT, '') AS "SUB22_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.total_max_mark END)::TEXT, '') AS "SUB22MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.total_pass_mark END)::TEXT, '') AS "SUB22MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB22_TH_MAX",
    '' AS "SUB22_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB22_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB22_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB22_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB22_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.internal_max_mark END)::TEXT, '') AS "SUB22_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB22_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB22_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB22_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB22_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB22_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.letter_grade END), '') END AS "SUB22_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.grade_points END)::TEXT, '') AS "SUB22_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.fm_credit END)::TEXT, '') AS "SUB22_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 22 THEN os.fm_credit_points END)::TEXT, '') AS "SUB22_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 22 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 22 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB22_REMARKS",

    -- =====================================================
    -- SUBJECT 23
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.course_name END), '')) AS "SUB23NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.course_code END), '')) AS "SUB23",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.subject_semester END)::TEXT, '') AS "SUB23_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.total_max_mark END)::TEXT, '') AS "SUB23MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.total_pass_mark END)::TEXT, '') AS "SUB23MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB23_TH_MAX",
    '' AS "SUB23_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB23_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB23_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB23_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB23_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.internal_max_mark END)::TEXT, '') AS "SUB23_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB23_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB23_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB23_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB23_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB23_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.letter_grade END), '') END AS "SUB23_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.grade_points END)::TEXT, '') AS "SUB23_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.fm_credit END)::TEXT, '') AS "SUB23_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 23 THEN os.fm_credit_points END)::TEXT, '') AS "SUB23_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 23 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 23 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB23_REMARKS",

    -- =====================================================
    -- SUBJECT 24
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.course_name END), '')) AS "SUB24NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.course_code END), '')) AS "SUB24",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.subject_semester END)::TEXT, '') AS "SUB24_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.total_max_mark END)::TEXT, '') AS "SUB24MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.total_pass_mark END)::TEXT, '') AS "SUB24MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB24_TH_MAX",
    '' AS "SUB24_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB24_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB24_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB24_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB24_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.internal_max_mark END)::TEXT, '') AS "SUB24_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB24_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB24_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB24_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB24_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB24_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.letter_grade END), '') END AS "SUB24_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.grade_points END)::TEXT, '') AS "SUB24_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.fm_credit END)::TEXT, '') AS "SUB24_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 24 THEN os.fm_credit_points END)::TEXT, '') AS "SUB24_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 24 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 24 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB24_REMARKS",

    -- =====================================================
    -- SUBJECT 25
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.course_name END), '')) AS "SUB25NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.course_code END), '')) AS "SUB25",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.subject_semester END)::TEXT, '') AS "SUB25_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.total_max_mark END)::TEXT, '') AS "SUB25MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.total_pass_mark END)::TEXT, '') AS "SUB25MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB25_TH_MAX",
    '' AS "SUB25_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB25_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB25_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB25_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB25_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.internal_max_mark END)::TEXT, '') AS "SUB25_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB25_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB25_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB25_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB25_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB25_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.letter_grade END), '') END AS "SUB25_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.grade_points END)::TEXT, '') AS "SUB25_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.fm_credit END)::TEXT, '') AS "SUB25_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 25 THEN os.fm_credit_points END)::TEXT, '') AS "SUB25_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 25 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 25 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB25_REMARKS",

    -- =====================================================
    -- SUBJECT 26
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.course_name END), '')) AS "SUB26NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.course_code END), '')) AS "SUB26",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.subject_semester END)::TEXT, '') AS "SUB26_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.total_max_mark END)::TEXT, '') AS "SUB26MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.total_pass_mark END)::TEXT, '') AS "SUB26MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB26_TH_MAX",
    '' AS "SUB26_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB26_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB26_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB26_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB26_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.internal_max_mark END)::TEXT, '') AS "SUB26_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB26_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB26_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB26_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB26_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB26_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.letter_grade END), '') END AS "SUB26_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.grade_points END)::TEXT, '') AS "SUB26_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.fm_credit END)::TEXT, '') AS "SUB26_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 26 THEN os.fm_credit_points END)::TEXT, '') AS "SUB26_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 26 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 26 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB26_REMARKS",

    -- =====================================================
    -- SUBJECT 27
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.course_name END), '')) AS "SUB27NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.course_code END), '')) AS "SUB27",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.subject_semester END)::TEXT, '') AS "SUB27_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.total_max_mark END)::TEXT, '') AS "SUB27MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.total_pass_mark END)::TEXT, '') AS "SUB27MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB27_TH_MAX",
    '' AS "SUB27_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB27_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB27_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB27_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB27_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.internal_max_mark END)::TEXT, '') AS "SUB27_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB27_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB27_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB27_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB27_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB27_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.letter_grade END), '') END AS "SUB27_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.grade_points END)::TEXT, '') AS "SUB27_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.fm_credit END)::TEXT, '') AS "SUB27_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 27 THEN os.fm_credit_points END)::TEXT, '') AS "SUB27_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 27 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 27 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB27_REMARKS",

    -- =====================================================
    -- SUBJECT 28
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.course_name END), '')) AS "SUB28NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.course_code END), '')) AS "SUB28",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.subject_semester END)::TEXT, '') AS "SUB28_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.total_max_mark END)::TEXT, '') AS "SUB28MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.total_pass_mark END)::TEXT, '') AS "SUB28MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB28_TH_MAX",
    '' AS "SUB28_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB28_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB28_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB28_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB28_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.internal_max_mark END)::TEXT, '') AS "SUB28_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB28_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB28_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB28_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB28_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB28_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.letter_grade END), '') END AS "SUB28_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.grade_points END)::TEXT, '') AS "SUB28_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.fm_credit END)::TEXT, '') AS "SUB28_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 28 THEN os.fm_credit_points END)::TEXT, '') AS "SUB28_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 28 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 28 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB28_REMARKS",

    -- =====================================================
    -- SUBJECT 29
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.course_name END), '')) AS "SUB29NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.course_code END), '')) AS "SUB29",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.subject_semester END)::TEXT, '') AS "SUB29_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.total_max_mark END)::TEXT, '') AS "SUB29MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.total_pass_mark END)::TEXT, '') AS "SUB29MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB29_TH_MAX",
    '' AS "SUB29_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB29_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB29_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB29_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB29_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.internal_max_mark END)::TEXT, '') AS "SUB29_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB29_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB29_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB29_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB29_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB29_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.letter_grade END), '') END AS "SUB29_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.grade_points END)::TEXT, '') AS "SUB29_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.fm_credit END)::TEXT, '') AS "SUB29_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 29 THEN os.fm_credit_points END)::TEXT, '') AS "SUB29_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 29 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 29 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB29_REMARKS",

    -- =====================================================
    -- SUBJECT 30
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.course_name END), '')) AS "SUB30NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.course_code END), '')) AS "SUB30",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.subject_semester END)::TEXT, '') AS "SUB30_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.total_max_mark END)::TEXT, '') AS "SUB30MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.total_pass_mark END)::TEXT, '') AS "SUB30MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB30_TH_MAX",
    '' AS "SUB30_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB30_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB30_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB30_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB30_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.internal_max_mark END)::TEXT, '') AS "SUB30_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB30_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB30_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB30_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB30_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB30_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.letter_grade END), '') END AS "SUB30_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.grade_points END)::TEXT, '') AS "SUB30_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.fm_credit END)::TEXT, '') AS "SUB30_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 30 THEN os.fm_credit_points END)::TEXT, '') AS "SUB30_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 30 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 30 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB30_REMARKS",

    -- =====================================================
    -- SUBJECT 31
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.course_name END), '')) AS "SUB31NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.course_code END), '')) AS "SUB31",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.subject_semester END)::TEXT, '') AS "SUB31_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.total_max_mark END)::TEXT, '') AS "SUB31MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.total_pass_mark END)::TEXT, '') AS "SUB31MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB31_TH_MAX",
    '' AS "SUB31_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB31_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB31_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB31_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB31_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.internal_max_mark END)::TEXT, '') AS "SUB31_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB31_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB31_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB31_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB31_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB31_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.letter_grade END), '') END AS "SUB31_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.grade_points END)::TEXT, '') AS "SUB31_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.fm_credit END)::TEXT, '') AS "SUB31_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 31 THEN os.fm_credit_points END)::TEXT, '') AS "SUB31_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 31 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 31 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB31_REMARKS",

    -- =====================================================
    -- SUBJECT 32
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.course_name END), '')) AS "SUB32NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.course_code END), '')) AS "SUB32",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.subject_semester END)::TEXT, '') AS "SUB32_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.total_max_mark END)::TEXT, '') AS "SUB32MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.total_pass_mark END)::TEXT, '') AS "SUB32MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB32_TH_MAX",
    '' AS "SUB32_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB32_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB32_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB32_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB32_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.internal_max_mark END)::TEXT, '') AS "SUB32_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB32_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB32_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB32_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB32_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB32_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.letter_grade END), '') END AS "SUB32_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.grade_points END)::TEXT, '') AS "SUB32_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.fm_credit END)::TEXT, '') AS "SUB32_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 32 THEN os.fm_credit_points END)::TEXT, '') AS "SUB32_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 32 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 32 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB32_REMARKS",

    -- =====================================================
    -- SUBJECT 33
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.course_name END), '')) AS "SUB33NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.course_code END), '')) AS "SUB33",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.subject_semester END)::TEXT, '') AS "SUB33_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.total_max_mark END)::TEXT, '') AS "SUB33MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.total_pass_mark END)::TEXT, '') AS "SUB33MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB33_TH_MAX",
    '' AS "SUB33_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB33_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB33_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB33_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB33_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.internal_max_mark END)::TEXT, '') AS "SUB33_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB33_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB33_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB33_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB33_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB33_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.letter_grade END), '') END AS "SUB33_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.grade_points END)::TEXT, '') AS "SUB33_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.fm_credit END)::TEXT, '') AS "SUB33_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 33 THEN os.fm_credit_points END)::TEXT, '') AS "SUB33_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 33 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 33 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB33_REMARKS",

    -- =====================================================
    -- SUBJECT 34
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.course_name END), '')) AS "SUB34NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.course_code END), '')) AS "SUB34",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.subject_semester END)::TEXT, '') AS "SUB34_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.total_max_mark END)::TEXT, '') AS "SUB34MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.total_pass_mark END)::TEXT, '') AS "SUB34MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB34_TH_MAX",
    '' AS "SUB34_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB34_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB34_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB34_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB34_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.internal_max_mark END)::TEXT, '') AS "SUB34_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB34_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB34_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB34_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB34_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB34_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.letter_grade END), '') END AS "SUB34_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.grade_points END)::TEXT, '') AS "SUB34_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.fm_credit END)::TEXT, '') AS "SUB34_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 34 THEN os.fm_credit_points END)::TEXT, '') AS "SUB34_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 34 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 34 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB34_REMARKS",

    -- =====================================================
    -- SUBJECT 35
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.course_name END), '')) AS "SUB35NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.course_code END), '')) AS "SUB35",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.subject_semester END)::TEXT, '') AS "SUB35_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.total_max_mark END)::TEXT, '') AS "SUB35MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.total_pass_mark END)::TEXT, '') AS "SUB35MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB35_TH_MAX",
    '' AS "SUB35_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB35_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB35_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB35_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB35_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.internal_max_mark END)::TEXT, '') AS "SUB35_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB35_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB35_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB35_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB35_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB35_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.letter_grade END), '') END AS "SUB35_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.grade_points END)::TEXT, '') AS "SUB35_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.fm_credit END)::TEXT, '') AS "SUB35_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 35 THEN os.fm_credit_points END)::TEXT, '') AS "SUB35_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 35 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 35 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB35_REMARKS",

    -- =====================================================
    -- SUBJECT 36
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.course_name END), '')) AS "SUB36NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.course_code END), '')) AS "SUB36",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.subject_semester END)::TEXT, '') AS "SUB36_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.total_max_mark END)::TEXT, '') AS "SUB36MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.total_pass_mark END)::TEXT, '') AS "SUB36MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB36_TH_MAX",
    '' AS "SUB36_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB36_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB36_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB36_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB36_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.internal_max_mark END)::TEXT, '') AS "SUB36_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB36_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB36_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB36_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB36_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB36_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.letter_grade END), '') END AS "SUB36_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.grade_points END)::TEXT, '') AS "SUB36_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.fm_credit END)::TEXT, '') AS "SUB36_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 36 THEN os.fm_credit_points END)::TEXT, '') AS "SUB36_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 36 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 36 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB36_REMARKS",

    -- =====================================================
    -- SUBJECT 37
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.course_name END), '')) AS "SUB37NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.course_code END), '')) AS "SUB37",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.subject_semester END)::TEXT, '') AS "SUB37_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.total_max_mark END)::TEXT, '') AS "SUB37MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.total_pass_mark END)::TEXT, '') AS "SUB37MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB37_TH_MAX",
    '' AS "SUB37_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB37_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB37_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB37_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB37_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.internal_max_mark END)::TEXT, '') AS "SUB37_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB37_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB37_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB37_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB37_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB37_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.letter_grade END), '') END AS "SUB37_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.grade_points END)::TEXT, '') AS "SUB37_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.fm_credit END)::TEXT, '') AS "SUB37_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 37 THEN os.fm_credit_points END)::TEXT, '') AS "SUB37_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 37 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 37 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB37_REMARKS",

    -- =====================================================
    -- SUBJECT 38
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.course_name END), '')) AS "SUB38NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.course_code END), '')) AS "SUB38",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.subject_semester END)::TEXT, '') AS "SUB38_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.total_max_mark END)::TEXT, '') AS "SUB38MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.total_pass_mark END)::TEXT, '') AS "SUB38MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB38_TH_MAX",
    '' AS "SUB38_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB38_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB38_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB38_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB38_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.internal_max_mark END)::TEXT, '') AS "SUB38_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB38_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB38_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB38_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB38_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB38_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.letter_grade END), '') END AS "SUB38_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.grade_points END)::TEXT, '') AS "SUB38_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.fm_credit END)::TEXT, '') AS "SUB38_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 38 THEN os.fm_credit_points END)::TEXT, '') AS "SUB38_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 38 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 38 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB38_REMARKS",

    -- =====================================================
    -- SUBJECT 39
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.course_name END), '')) AS "SUB39NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.course_code END), '')) AS "SUB39",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.subject_semester END)::TEXT, '') AS "SUB39_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.total_max_mark END)::TEXT, '') AS "SUB39MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.total_pass_mark END)::TEXT, '') AS "SUB39MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB39_TH_MAX",
    '' AS "SUB39_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB39_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB39_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB39_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB39_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.internal_max_mark END)::TEXT, '') AS "SUB39_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB39_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB39_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB39_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB39_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB39_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.letter_grade END), '') END AS "SUB39_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.grade_points END)::TEXT, '') AS "SUB39_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.fm_credit END)::TEXT, '') AS "SUB39_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 39 THEN os.fm_credit_points END)::TEXT, '') AS "SUB39_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 39 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 39 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB39_REMARKS",

    -- =====================================================
    -- SUBJECT 40
    -- =====================================================
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.course_name END), '')) AS "SUB40NM",
    UPPER(COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.course_code END), '')) AS "SUB40",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.subject_semester END)::TEXT, '') AS "SUB40_SEM",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.total_max_mark END)::TEXT, '') AS "SUB40MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.total_pass_mark END)::TEXT, '') AS "SUB40MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB40_TH_MAX",
    '' AS "SUB40_VV_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.internal_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB40_PR_CE_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB40_TH_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.total_max_mark END)::TEXT, '')
         ELSE '' END AS "SUB40_PR_MAX",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.total_pass_mark END)::TEXT, '')
         ELSE '' END AS "SUB40_PR_MIN",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.internal_max_mark END)::TEXT, '') AS "SUB40_CE_MAX",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.internal_pass_mark END)::TEXT, '') AS "SUB40_CE_MIN",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.course_category END) = 'Theory'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB40_TH_MRKS",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.course_category END) = 'Practical'
         THEN COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.external_marks_obtained END)::TEXT, '')
         ELSE '' END AS "SUB40_PR_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.internal_marks_obtained END)::TEXT, '') AS "SUB40_CE_MRKS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.total_marks_obtained END)::TEXT, '') AS "SUB40_TOT",
    CASE WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.letter_grade END) = 'AAA'
         THEN 'U'
         ELSE COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.letter_grade END), '') END AS "SUB40_GRADE",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.grade_points END)::TEXT, '') AS "SUB40_GRADE_POINTS",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.fm_credit END)::TEXT, '') AS "SUB40_CREDIT",
    COALESCE(MAX(CASE WHEN os.subject_seq = 40 THEN os.fm_credit_points END)::TEXT, '') AS "SUB40_CREDIT_POINTS",
    CASE
        WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.pass_status END) = 'Pass' THEN 'P'
        WHEN MAX(CASE WHEN os.subject_seq = 40 THEN os.pass_status END) IN ('Absent', 'Reappear') THEN 'U'
        ELSE COALESCE(UPPER(SUBSTRING(MAX(CASE WHEN os.subject_seq = 40 THEN os.pass_status END)::TEXT, 1, 1)), '')
    END AS "SUB40_REMARKS",

    -- =====================================================
    -- METADATA (for filtering/debugging - not part of export)
    -- =====================================================
    ss.semester_result_id,
    ss.student_id,
    ss.institutions_id AS institution_id,
    ss.examination_session_id,
    ss.program_id,
    ss.current_semester AS semester_number,
    COUNT(DISTINCT os.course_id) AS total_subjects

-- Start from student_sessions (one row per student per exam session)
FROM student_sessions ss
-- Join with students
INNER JOIN public.students s ON ss.student_id = s.id
-- Join with institutions
INNER JOIN public.institutions i ON ss.institutions_id = i.id
-- Join with programs
INNER JOIN public.programs p ON ss.program_id = p.id
-- Join with examination_sessions
INNER JOIN public.examination_sessions es ON ss.examination_session_id = es.id
-- Join with departments
LEFT JOIN public.departments d ON p.offering_department_id = d.id
-- Join with batch (via students table)
LEFT JOIN public.batch b ON s.batch_id = b.id
-- Join with academic_years
LEFT JOIN public.academic_years ay ON s.academic_year_id = ay.id
-- Join with ordered subjects (all subjects for this student+exam_session)
LEFT JOIN ordered_subjects os ON (
    os.student_id = ss.student_id
    AND os.examination_session_id = ss.examination_session_id
)

GROUP BY
    ss.semester_result_id,
    ss.student_id,
    ss.institutions_id,
    ss.examination_session_id,
    ss.program_id,
    ss.current_semester,
    ss.percentage,
    ss.total_credits_earned,
    ss.total_credit_points,
    ss.cgpa,
    i.name,
    p.program_code,
    p.program_name,
    b.batch_name,
    ay.academic_year,
    s.register_number,
    s.roll_number,
    s.first_name,
    s.last_name,
    s.gender,
    s.date_of_birth,
    s.father_name,
    s.mother_name,
    s.aadhar_number,
    es.session_code,
    es.session_name,
    es.exam_end_date,
    d.department_name

ORDER BY
    i.name,
    p.program_code,
    ss.current_semester,
    s.register_number;


-- =====================================================
-- 2. NAAD ABC EXPORT FUNCTION
-- =====================================================
-- Function to get NAAD ABC export data with filters
-- Returns data in the official NAAD ABC format
-- =====================================================

CREATE OR REPLACE FUNCTION get_naad_abc_export_data(
    p_institution_id UUID DEFAULT NULL,
    p_examination_session_id UUID DEFAULT NULL,
    p_program_id UUID DEFAULT NULL,
    p_semester INT DEFAULT NULL
)
RETURNS TABLE (
    "ORG_NAME" TEXT,
    "ACADEMIC_COURSE_ID" TEXT,
    "COURSE_NAME" TEXT,
    "STREAM" TEXT,
    "SESSION" TEXT,
    "REGN_NO" TEXT,
    "RROLL" TEXT,
    "CNAME" TEXT,
    "GENDER" TEXT,
    "DOB" TEXT,
    "FNAME" TEXT,
    "MNAME" TEXT,
    "SEM" TEXT,
    "TOT_CREDIT" TEXT,
    "TOT_CREDIT_POINTS" TEXT,
    "CGPA" TEXT,
    "ABC_ACCOUNT_ID" TEXT,
    "TERM_TYPE" TEXT,
    "DEPARTMENT" TEXT
    -- Note: Subject columns (SUB1-SUB14) are part of the view
    -- This function returns the core columns for programmatic access
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        nav."ORG_NAME",
        nav."ACADEMIC_COURSE_ID",
        nav."COURSE_NAME",
        nav."STREAM",
        nav."SESSION",
        nav."REGN_NO",
        nav."RROLL",
        nav."CNAME",
        nav."GENDER",
        nav."DOB",
        nav."FNAME",
        nav."MNAME",
        nav."SEM",
        nav."TOT_CREDIT",
        nav."TOT_CREDIT_POINTS",
        nav."CGPA",
        nav."ABC_ACCOUNT_ID",
        nav."TERM_TYPE",
        nav."DEPARTMENT"
    FROM public.naad_abc_consolidated_view nav
    WHERE (p_institution_id IS NULL OR nav.institution_id = p_institution_id)
        AND (p_examination_session_id IS NULL OR nav.examination_session_id = p_examination_session_id)
        AND (p_program_id IS NULL OR nav.program_id = p_program_id)
        AND (p_semester IS NULL OR nav.semester_number = p_semester)
    ORDER BY
        nav."ORG_NAME",
        nav."ACADEMIC_COURSE_ID",
        nav."SEM",
        nav."REGN_NO";
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =====================================================
-- 3. GRANT PERMISSIONS
-- =====================================================

-- Grant SELECT on view to authenticated users
GRANT SELECT ON public.naad_abc_consolidated_view TO authenticated;

-- Grant EXECUTE on function to authenticated users
GRANT EXECUTE ON FUNCTION get_naad_abc_export_data(UUID, UUID, UUID, INT) TO authenticated;

-- Grant to service role
GRANT SELECT ON public.naad_abc_consolidated_view TO service_role;
GRANT EXECUTE ON FUNCTION get_naad_abc_export_data(UUID, UUID, UUID, INT) TO service_role;


-- =====================================================
-- 4. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON VIEW public.naad_abc_consolidated_view IS
'NAAD ABC (Academic Bank of Credits) consolidated export view.
Format: One row per student per EXAM SESSION with pivoted subjects (SUB1-SUB14).
Key Design: Uses semester_results as base table to ensure ONE row per student per exam session.
Features:
- ONE ROW per student per exam session (not per subject semester)
- All subjects (Regular + Arrear) combined in same row
- Up to 14 subjects per row (SUB1-SUB14)
- Subject Ordering: Regular subjects first (by course_order ASC), then Arrear subjects (by semester DESC, course_order ASC)
- Uses exam_registrations.is_regular to distinguish Regular vs Arrear subjects
- Includes SUBn_SEM column to show each subject''s original semester
- Theory/Practical logic based on courses.course_category
- Grade handling: AAA = U grade, else letter_grade
- Pass status mapping: Pass=P, Absent=U, Reappear=U
- Includes all NAAD required columns for ABC portal upload';

COMMENT ON FUNCTION get_naad_abc_export_data(UUID, UUID, UUID, INT) IS
'Returns filtered NAAD ABC export data for a specific institution, session, program, and/or semester.
Use this function for programmatic access to export data.';


-- =====================================================
-- USAGE EXAMPLES
-- =====================================================
/*

-- 1. Get all NAAD ABC consolidated data:
SELECT * FROM naad_abc_consolidated_view;

-- 2. Get data for a specific program and semester:
SELECT * FROM naad_abc_consolidated_view
WHERE program_id = 'your-program-uuid'
  AND semester_number = 2;

-- 3. Export to CSV using function:
SELECT * FROM get_naad_abc_export_data(
    NULL,  -- p_institution_id (NULL for all)
    NULL,  -- p_examination_session_id (NULL for all)
    'your-program-uuid',  -- p_program_id
    2  -- p_semester
);

-- 4. Export specific columns for ABC upload:
SELECT
    "ORG_NAME",
    "ACADEMIC_COURSE_ID",
    "COURSE_NAME",
    "SESSION",
    "REGN_NO",
    "CNAME",
    "GENDER",
    "DOB",
    "FNAME",
    "MNAME",
    "SEM",
    "TOT_CREDIT",
    "TOT_CREDIT_POINTS",
    "CGPA",
    "ABC_ACCOUNT_ID",
    "TERM_TYPE",
    "DEPARTMENT",
    -- Subject 1
    "SUB1NM", "SUB1", "SUB1_SEM", "SUB1MAX", "SUB1MIN",
    "SUB1_TH_MAX", "SUB1_TH_MIN", "SUB1_TH_MRKS",
    "SUB1_PR_MAX", "SUB1_PR_MIN", "SUB1_PR_MRKS",
    "SUB1_CE_MAX", "SUB1_CE_MIN", "SUB1_CE_MRKS",
    "SUB1_TOT", "SUB1_GRADE", "SUB1_GRADE_POINTS",
    "SUB1_CREDIT", "SUB1_CREDIT_POINTS", "SUB1_REMARKS"
    -- Add more subjects as needed...
FROM naad_abc_consolidated_view
WHERE "ACADEMIC_COURSE_ID" = 'BA-HIST'
  AND "SEM" = '2';

-- 5. Example with student having arrears:
-- A student in semester 3 with 4 regular subjects + 2 arrear subjects will have:
-- SUB1-SUB4: Regular semester 3 subjects (sorted by course_order)
-- SUB5-SUB6: Arrear subjects (sorted by semester DESC, then course_order)
-- SUB1_SEM = 3, SUB2_SEM = 3, SUB3_SEM = 3, SUB4_SEM = 3
-- SUB5_SEM = 2 (arrear from sem 2), SUB6_SEM = 1 (arrear from sem 1)

-- 6. Example with engineering student having 10 regular subjects + 4 arrears:
-- SUB1-SUB10: Regular semester subjects (sorted by course_order)
-- SUB11-SUB14: Arrear subjects from previous semesters
-- Total 14 subjects supported per row

*/
-- =====================================================
-- END OF NAAD ABC CONSOLIDATED VIEW
-- =====================================================
