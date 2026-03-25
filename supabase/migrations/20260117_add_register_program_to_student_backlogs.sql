-- =====================================================
-- Add register_number and program_code to student_backlogs table
-- =====================================================
-- Date: 2026-01-17
-- Purpose: Store register_number and program_code directly in student_backlogs
-- for easier querying without complex joins through final_marks
-- =====================================================

-- =====================================================
-- 1. ADD NEW COLUMNS TO STUDENT_BACKLOGS TABLE
-- =====================================================

-- Add register_number column
ALTER TABLE public.student_backlogs
ADD COLUMN IF NOT EXISTS register_number VARCHAR(50);

-- Add program_code column
ALTER TABLE public.student_backlogs
ADD COLUMN IF NOT EXISTS program_code VARCHAR(50);

-- =====================================================
-- 2. CREATE INDEXES FOR THE NEW COLUMNS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_student_backlogs_register_number
	ON public.student_backlogs(register_number);

CREATE INDEX IF NOT EXISTS idx_student_backlogs_program_code
	ON public.student_backlogs(program_code);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_student_backlogs_program_register
	ON public.student_backlogs(program_code, register_number);

-- =====================================================
-- 3. BACKFILL EXISTING DATA
-- =====================================================

-- Update existing records by joining through final_marks and exam_registrations
UPDATE public.student_backlogs sb
SET
	register_number = COALESCE(er.stu_register_no, ''),
	program_code = COALESCE(fm.program_code, '')
FROM public.final_marks fm
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
WHERE sb.original_final_marks_id = fm.id
	AND (sb.register_number IS NULL OR sb.program_code IS NULL);

-- =====================================================
-- 4. UPDATE THE CREATE_BACKLOG_FROM_FINAL_MARKS FUNCTION
-- =====================================================

-- Drop and recreate the function to include register_number and program_code
CREATE OR REPLACE FUNCTION create_backlog_from_final_marks(
	p_final_marks_id UUID
)
RETURNS UUID AS $$
DECLARE
	v_backlog_id UUID;
	v_fm RECORD;
	v_sg RECORD;
	v_semester INT;
	v_register_number VARCHAR(50);
	v_program_code VARCHAR(50);
BEGIN
	-- Get final marks details with exam_registration info
	SELECT
		fm.*,
		co.semester,
		er.stu_register_no
	INTO v_fm
	FROM public.final_marks fm
	LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
	LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
	WHERE fm.id = p_final_marks_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Final marks not found: %', p_final_marks_id;
	END IF;

	-- Only create backlog for failed marks
	IF v_fm.is_pass = true THEN
		RETURN NULL;
	END IF;

	-- Get register_number and program_code
	v_register_number := COALESCE(v_fm.stu_register_no, '');
	v_program_code := COALESCE(v_fm.program_code, '');

	-- Try to get student_grade record if exists
	SELECT id, regulation_id, grade_code, grade_point
	INTO v_sg
	FROM public.student_grades
	WHERE final_marks_id = p_final_marks_id
	LIMIT 1;

	-- Insert backlog record with register_number and program_code
	INSERT INTO public.student_backlogs (
		institutions_id,
		student_id,
		program_id,
		course_id,
		course_offering_id,
		regulation_id,
		original_examination_session_id,
		original_final_marks_id,
		original_student_grade_id,
		original_semester,
		original_internal_marks,
		original_external_marks,
		original_total_marks,
		original_percentage,
		original_grade_points,
		original_letter_grade,
		is_absent,
		register_number,
		program_code,
		created_by
	) VALUES (
		v_fm.institutions_id,
		v_fm.student_id,
		v_fm.program_id,
		v_fm.course_id,
		v_fm.course_offering_id,
		v_sg.regulation_id,
		v_fm.examination_session_id,
		p_final_marks_id,
		v_sg.id,
		v_fm.semester,
		v_fm.internal_marks_obtained,
		v_fm.external_marks_obtained,
		v_fm.total_marks_obtained,
		v_fm.percentage,
		COALESCE(v_sg.grade_point, v_fm.grade_points),
		COALESCE(v_sg.grade_code, v_fm.letter_grade),
		v_fm.pass_status = 'Absent',
		v_register_number,
		v_program_code,
		auth.uid()
	)
	ON CONFLICT (student_id, course_id, original_examination_session_id)
	DO UPDATE SET
		attempt_count = student_backlogs.attempt_count + 1,
		last_attempt_date = CURRENT_DATE,
		last_attempt_session_id = v_fm.examination_session_id,
		-- Also update register_number and program_code if they were null
		register_number = COALESCE(student_backlogs.register_number, EXCLUDED.register_number),
		program_code = COALESCE(student_backlogs.program_code, EXCLUDED.program_code),
		updated_by = auth.uid(),
		updated_at = CURRENT_TIMESTAMP
	RETURNING id INTO v_backlog_id;

	RETURN v_backlog_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. UPDATE THE DETAILED VIEW TO USE NEW COLUMNS
-- =====================================================

-- Recreate the view to prioritize direct columns over joined values
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

	-- Student Details
	-- Prefer direct column, fallback to joined value
	sb.student_id,
	COALESCE(er.student_name, '') AS student_name,
	'' AS student_email,
	COALESCE(sb.register_number, er.stu_register_no, '') AS register_number,

	-- Institution Details
	sb.institutions_id,
	i.institution_code,
	i.name AS institution_name,

	-- Program Details
	-- Prefer direct column, fallback to joined value
	sb.program_id,
	COALESCE(sb.program_code, fm.program_code, '') AS program_code,
	COALESCE(sb.program_code, fm.program_code, '') AS program_name,

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
-- Join with final_marks to get exam_registration_id and program_code (fallback)
LEFT JOIN public.final_marks fm ON sb.original_final_marks_id = fm.id
-- Join with exam_registrations to get student name and register number (fallback)
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON sb.institutions_id = i.id
LEFT JOIN public.courses c ON sb.course_id = c.id
LEFT JOIN public.examination_sessions oes ON sb.original_examination_session_id = oes.id
LEFT JOIN public.examination_sessions ces ON sb.cleared_examination_session_id = ces.id
LEFT JOIN public.examination_sessions aes ON sb.arrear_exam_session_id = aes.id;

-- =====================================================
-- 6. ADD COLUMN COMMENTS
-- =====================================================

COMMENT ON COLUMN public.student_backlogs.register_number IS 'Student register number (denormalized from exam_registrations for fast access)';
COMMENT ON COLUMN public.student_backlogs.program_code IS 'Program code (denormalized from final_marks for fast access)';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
