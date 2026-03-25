-- =====================================================
-- Student Backlogs Table with RLS, Functions, and Views
-- =====================================================
-- Date: 2025-12-03
-- Purpose: Track individual course backlogs per student,
-- clearance history, attempt counts, and arrear exam management
-- =====================================================

-- =====================================================
-- 1. CREATE STUDENT BACKLOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.student_backlogs (
	id UUID NOT NULL DEFAULT gen_random_uuid(),

	-- Core References
	institutions_id UUID NOT NULL,
	student_id UUID NOT NULL,
	program_id UUID NOT NULL,
	course_id UUID NOT NULL,
	course_offering_id UUID NOT NULL,
	regulation_id UUID,

	-- Original Attempt Details (When backlog was created)
	original_examination_session_id UUID NOT NULL,
	original_semester_result_id UUID,
	original_final_marks_id UUID NOT NULL,
	original_student_grade_id UUID,  -- Reference to student_grades table
	original_semester INT NOT NULL,
	original_academic_year_id UUID,

	-- Original Marks (for reference)
	original_internal_marks DECIMAL(5,2),
	original_external_marks DECIMAL(5,2),
	original_total_marks DECIMAL(5,2),
	original_percentage DECIMAL(5,2),
	original_grade_points DECIMAL(3,2),
	original_letter_grade VARCHAR(5),

	-- Failure Analysis
	failure_reason VARCHAR(100), -- 'Internal', 'External', 'Both', 'Overall', 'Absent'
	is_absent BOOLEAN DEFAULT false,

	-- Clearance Details
	is_cleared BOOLEAN DEFAULT false,
	cleared_examination_session_id UUID,
	cleared_semester_result_id UUID,
	cleared_final_marks_id UUID,
	cleared_student_grade_id UUID,  -- Reference to student_grades when cleared
	cleared_date DATE,
	cleared_semester INT,

	-- Cleared Marks
	cleared_internal_marks DECIMAL(5,2),
	cleared_external_marks DECIMAL(5,2),
	cleared_total_marks DECIMAL(5,2),
	cleared_percentage DECIMAL(5,2),
	cleared_grade_points DECIMAL(3,2),
	cleared_letter_grade VARCHAR(5),

	-- Attempt Tracking
	attempt_count INT DEFAULT 1,
	max_attempts_allowed INT DEFAULT 5,
	last_attempt_date DATE,
	last_attempt_session_id UUID,

	-- Improvement Exam (for already passed courses)
	is_improvement BOOLEAN DEFAULT false,
	improvement_reason TEXT,

	-- Arrear Exam Registration
	is_registered_for_arrear BOOLEAN DEFAULT false,
	arrear_registration_date DATE,
	arrear_exam_session_id UUID,

	-- Priority/Urgency
	priority_level VARCHAR(20) DEFAULT 'Normal', -- 'Critical', 'High', 'Normal', 'Low'
	semesters_pending INT DEFAULT 0, -- How many semesters this backlog has been pending

	-- Additional Metadata
	remarks TEXT,
	is_active BOOLEAN DEFAULT true,

	-- Audit Fields
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID,
	updated_by UUID,

	-- Primary Key
	CONSTRAINT student_backlogs_pkey PRIMARY KEY (id),

	-- Foreign Key Constraints
	CONSTRAINT student_backlogs_institutions_id_fkey
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE CASCADE,
	CONSTRAINT student_backlogs_student_id_fkey
		FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
	CONSTRAINT student_backlogs_program_id_fkey
		FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
	CONSTRAINT student_backlogs_course_id_fkey
		FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
	CONSTRAINT student_backlogs_course_offering_id_fkey
		FOREIGN KEY (course_offering_id) REFERENCES course_offerings(id) ON DELETE RESTRICT,
	CONSTRAINT student_backlogs_original_examination_session_id_fkey
		FOREIGN KEY (original_examination_session_id) REFERENCES examination_sessions(id) ON DELETE RESTRICT,
	CONSTRAINT student_backlogs_original_semester_result_id_fkey
		FOREIGN KEY (original_semester_result_id) REFERENCES semester_results(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_original_final_marks_id_fkey
		FOREIGN KEY (original_final_marks_id) REFERENCES final_marks(id) ON DELETE RESTRICT,
	CONSTRAINT student_backlogs_original_student_grade_id_fkey
		FOREIGN KEY (original_student_grade_id) REFERENCES student_grades(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_regulation_id_fkey
		FOREIGN KEY (regulation_id) REFERENCES regulations(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_original_academic_year_id_fkey
		FOREIGN KEY (original_academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_cleared_examination_session_id_fkey
		FOREIGN KEY (cleared_examination_session_id) REFERENCES examination_sessions(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_cleared_semester_result_id_fkey
		FOREIGN KEY (cleared_semester_result_id) REFERENCES semester_results(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_cleared_final_marks_id_fkey
		FOREIGN KEY (cleared_final_marks_id) REFERENCES final_marks(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_cleared_student_grade_id_fkey
		FOREIGN KEY (cleared_student_grade_id) REFERENCES student_grades(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_last_attempt_session_id_fkey
		FOREIGN KEY (last_attempt_session_id) REFERENCES examination_sessions(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_arrear_exam_session_id_fkey
		FOREIGN KEY (arrear_exam_session_id) REFERENCES examination_sessions(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_created_by_fkey
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT student_backlogs_updated_by_fkey
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

	-- Unique Constraints
	CONSTRAINT unique_student_course_backlog
		UNIQUE(student_id, course_id, original_examination_session_id),

	-- Check Constraints
	CONSTRAINT check_original_semester_valid
		CHECK (original_semester >= 1 AND original_semester <= 10),
	CONSTRAINT check_cleared_semester_valid
		CHECK (cleared_semester IS NULL OR (cleared_semester >= 1 AND cleared_semester <= 10)),
	CONSTRAINT check_attempt_count_valid
		CHECK (attempt_count >= 1 AND attempt_count <= max_attempts_allowed),
	CONSTRAINT check_max_attempts_valid
		CHECK (max_attempts_allowed >= 1 AND max_attempts_allowed <= 10),
	CONSTRAINT check_semesters_pending_valid
		CHECK (semesters_pending >= 0),
	CONSTRAINT check_valid_failure_reason
		CHECK (failure_reason IS NULL OR failure_reason IN ('Internal', 'External', 'Both', 'Overall', 'Absent', 'Malpractice')),
	CONSTRAINT check_valid_priority_level
		CHECK (priority_level IN ('Critical', 'High', 'Normal', 'Low')),
	CONSTRAINT check_clearance_consistency
		CHECK (
			(is_cleared = false AND cleared_examination_session_id IS NULL AND cleared_date IS NULL) OR
			(is_cleared = true AND cleared_examination_session_id IS NOT NULL AND cleared_date IS NOT NULL)
		),
	CONSTRAINT check_arrear_registration_consistency
		CHECK (
			(is_registered_for_arrear = false AND arrear_exam_session_id IS NULL) OR
			(is_registered_for_arrear = true AND arrear_exam_session_id IS NOT NULL)
		),
	CONSTRAINT check_marks_non_negative
		CHECK (
			(original_internal_marks IS NULL OR original_internal_marks >= 0) AND
			(original_external_marks IS NULL OR original_external_marks >= 0) AND
			(original_total_marks IS NULL OR original_total_marks >= 0) AND
			(cleared_internal_marks IS NULL OR cleared_internal_marks >= 0) AND
			(cleared_external_marks IS NULL OR cleared_external_marks >= 0) AND
			(cleared_total_marks IS NULL OR cleared_total_marks >= 0)
		),
	CONSTRAINT check_percentage_valid
		CHECK (
			(original_percentage IS NULL OR (original_percentage >= 0 AND original_percentage <= 100)) AND
			(cleared_percentage IS NULL OR (cleared_percentage >= 0 AND cleared_percentage <= 100))
		),
	CONSTRAINT check_grade_points_valid
		CHECK (
			(original_grade_points IS NULL OR (original_grade_points >= 0 AND original_grade_points <= 10)) AND
			(cleared_grade_points IS NULL OR (cleared_grade_points >= 0 AND cleared_grade_points <= 10))
		)
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_student_backlogs_institutions_id
	ON public.student_backlogs(institutions_id);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_student_id
	ON public.student_backlogs(student_id);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_program_id
	ON public.student_backlogs(program_id);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_course_id
	ON public.student_backlogs(course_id);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_course_offering_id
	ON public.student_backlogs(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_original_examination_session_id
	ON public.student_backlogs(original_examination_session_id);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_original_final_marks_id
	ON public.student_backlogs(original_final_marks_id);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_original_student_grade_id
	ON public.student_backlogs(original_student_grade_id) WHERE original_student_grade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_regulation_id
	ON public.student_backlogs(regulation_id) WHERE regulation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_cleared_examination_session_id
	ON public.student_backlogs(cleared_examination_session_id) WHERE cleared_examination_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_cleared_student_grade_id
	ON public.student_backlogs(cleared_student_grade_id) WHERE cleared_student_grade_id IS NOT NULL;

-- Status and Boolean Indexes
CREATE INDEX IF NOT EXISTS idx_student_backlogs_is_cleared
	ON public.student_backlogs(is_cleared);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_is_absent
	ON public.student_backlogs(is_absent) WHERE is_absent = true;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_is_improvement
	ON public.student_backlogs(is_improvement) WHERE is_improvement = true;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_is_registered_for_arrear
	ON public.student_backlogs(is_registered_for_arrear) WHERE is_registered_for_arrear = true;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_is_active
	ON public.student_backlogs(is_active);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_priority_level
	ON public.student_backlogs(priority_level);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_failure_reason
	ON public.student_backlogs(failure_reason) WHERE failure_reason IS NOT NULL;

-- Semester and Attempt Indexes
CREATE INDEX IF NOT EXISTS idx_student_backlogs_original_semester
	ON public.student_backlogs(original_semester);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_attempt_count
	ON public.student_backlogs(attempt_count);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_semesters_pending
	ON public.student_backlogs(semesters_pending) WHERE semesters_pending > 0;

-- Date Indexes
CREATE INDEX IF NOT EXISTS idx_student_backlogs_cleared_date
	ON public.student_backlogs(cleared_date) WHERE cleared_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_last_attempt_date
	ON public.student_backlogs(last_attempt_date) WHERE last_attempt_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_created_at
	ON public.student_backlogs(created_at DESC);

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS idx_student_backlogs_student_status
	ON public.student_backlogs(student_id, is_cleared);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_student_semester
	ON public.student_backlogs(student_id, original_semester);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_program_semester
	ON public.student_backlogs(program_id, original_semester);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_program_cleared
	ON public.student_backlogs(program_id, is_cleared);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_institution_program_status
	ON public.student_backlogs(institutions_id, program_id, is_cleared);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_course_status
	ON public.student_backlogs(course_id, is_cleared);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_session_status
	ON public.student_backlogs(original_examination_session_id, is_cleared);

-- Partial Indexes for Specific Queries
CREATE INDEX IF NOT EXISTS idx_student_backlogs_pending
	ON public.student_backlogs(id, student_id, course_id, original_semester)
	WHERE is_cleared = false AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_cleared
	ON public.student_backlogs(id, student_id, cleared_date, cleared_grade_points)
	WHERE is_cleared = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_critical_priority
	ON public.student_backlogs(id, student_id, semesters_pending)
	WHERE priority_level = 'Critical' AND is_cleared = false AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_arrear_registered
	ON public.student_backlogs(id, student_id, arrear_exam_session_id)
	WHERE is_registered_for_arrear = true AND is_cleared = false AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_multiple_attempts
	ON public.student_backlogs(id, student_id, attempt_count)
	WHERE attempt_count > 1 AND is_cleared = false AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_max_attempts_reached
	ON public.student_backlogs(id, student_id, course_id)
	WHERE attempt_count >= max_attempts_allowed AND is_cleared = false AND is_active = true;

-- =====================================================
-- 3. CREATE TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_student_backlogs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_student_backlogs_updated_at
	BEFORE UPDATE ON public.student_backlogs
	FOR EACH ROW
	EXECUTE FUNCTION update_student_backlogs_updated_at();

-- Auto-determine failure reason from marks
CREATE OR REPLACE FUNCTION auto_determine_failure_reason()
RETURNS TRIGGER AS $$
DECLARE
	v_internal_pass_threshold DECIMAL := 40.0;
	v_external_pass_threshold DECIMAL := 40.0;
	v_internal_pct DECIMAL;
	v_external_pct DECIMAL;
BEGIN
	-- Skip if already set or if improvement
	IF NEW.failure_reason IS NOT NULL OR NEW.is_improvement = true THEN
		RETURN NEW;
	END IF;

	-- Check for absent
	IF NEW.is_absent = true THEN
		NEW.failure_reason = 'Absent';
		RETURN NEW;
	END IF;

	-- Calculate percentages if marks are available
	IF NEW.original_internal_marks IS NOT NULL AND NEW.original_external_marks IS NOT NULL THEN
		-- Assuming 40 max internal, 60 max external (adjust as needed)
		v_internal_pct = CASE
			WHEN 40 > 0 THEN (NEW.original_internal_marks / 40) * 100
			ELSE 0
		END;
		v_external_pct = CASE
			WHEN 60 > 0 THEN (NEW.original_external_marks / 60) * 100
			ELSE 0
		END;

		IF v_internal_pct < v_internal_pass_threshold AND v_external_pct < v_external_pass_threshold THEN
			NEW.failure_reason = 'Both';
		ELSIF v_internal_pct < v_internal_pass_threshold THEN
			NEW.failure_reason = 'Internal';
		ELSIF v_external_pct < v_external_pass_threshold THEN
			NEW.failure_reason = 'External';
		ELSE
			NEW.failure_reason = 'Overall';
		END IF;
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_determine_failure_reason
	BEFORE INSERT ON public.student_backlogs
	FOR EACH ROW
	EXECUTE FUNCTION auto_determine_failure_reason();

-- Auto-update priority level based on semesters pending
CREATE OR REPLACE FUNCTION auto_update_backlog_priority()
RETURNS TRIGGER AS $$
BEGIN
	-- Auto-set priority based on how long backlog has been pending
	IF NEW.is_cleared = false THEN
		IF NEW.semesters_pending >= 4 THEN
			NEW.priority_level = 'Critical';
		ELSIF NEW.semesters_pending >= 2 THEN
			NEW.priority_level = 'High';
		ELSIF NEW.attempt_count >= 3 THEN
			NEW.priority_level = 'High';
		ELSE
			NEW.priority_level = 'Normal';
		END IF;
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_update_backlog_priority
	BEFORE INSERT OR UPDATE ON public.student_backlogs
	FOR EACH ROW
	WHEN (NEW.is_cleared = false)
	EXECUTE FUNCTION auto_update_backlog_priority();

-- Auto-populate clearance details
CREATE OR REPLACE FUNCTION auto_populate_backlog_clearance()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.is_cleared = true AND (OLD.is_cleared IS NULL OR OLD.is_cleared = false) THEN
		NEW.cleared_date = COALESCE(NEW.cleared_date, CURRENT_DATE);
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_backlog_clearance
	BEFORE UPDATE ON public.student_backlogs
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_backlog_clearance();

-- Increment attempt count on re-attempt
CREATE OR REPLACE FUNCTION increment_backlog_attempt()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.last_attempt_session_id IS NOT NULL AND
	   NEW.last_attempt_session_id != COALESCE(OLD.last_attempt_session_id, '00000000-0000-0000-0000-000000000000'::UUID) THEN
		NEW.attempt_count = OLD.attempt_count + 1;
		NEW.last_attempt_date = CURRENT_DATE;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_backlog_attempt
	BEFORE UPDATE ON public.student_backlogs
	FOR EACH ROW
	EXECUTE FUNCTION increment_backlog_attempt();

-- =====================================================
-- 4. CREATE VIEWS
-- =====================================================

-- Detailed Student Backlogs View with all related data
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
	sb.student_id,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.student_email,
	s.register_number,

	-- Institution Details
	sb.institutions_id,
	i.institution_code,
	i.name AS institution_name,

	-- Program Details
	sb.program_id,
	p.program_code,
	p.program_name,

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
LEFT JOIN public.students s ON sb.student_id = s.id
LEFT JOIN public.institutions i ON sb.institutions_id = i.id
LEFT JOIN public.programs p ON sb.program_id = p.id
LEFT JOIN public.courses c ON sb.course_id = c.id
LEFT JOIN public.examination_sessions oes ON sb.original_examination_session_id = oes.id
LEFT JOIN public.examination_sessions ces ON sb.cleared_examination_session_id = ces.id
LEFT JOIN public.examination_sessions aes ON sb.arrear_exam_session_id = aes.id;

-- Pending Backlogs Summary View
CREATE OR REPLACE VIEW public.pending_backlogs_summary_view AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	p.program_code,
	p.program_name,
	sb.original_semester,
	COUNT(*) AS total_backlogs,
	COUNT(DISTINCT sb.student_id) AS students_with_backlogs,
	COUNT(DISTINCT sb.course_id) AS courses_with_backlogs,
	COUNT(*) FILTER (WHERE sb.priority_level = 'Critical') AS critical_count,
	COUNT(*) FILTER (WHERE sb.priority_level = 'High') AS high_priority_count,
	COUNT(*) FILTER (WHERE sb.is_registered_for_arrear = true) AS registered_for_arrear,
	ROUND(AVG(sb.attempt_count), 1) AS avg_attempts,
	ROUND(AVG(sb.semesters_pending), 1) AS avg_semesters_pending,
	MAX(sb.semesters_pending) AS max_semesters_pending
FROM public.student_backlogs sb
LEFT JOIN public.institutions i ON sb.institutions_id = i.id
LEFT JOIN public.programs p ON sb.program_id = p.id
WHERE sb.is_cleared = false
	AND sb.is_active = true
GROUP BY
	i.institution_code, i.name,
	p.program_code, p.program_name,
	sb.original_semester
ORDER BY
	i.institution_code,
	p.program_code,
	sb.original_semester;

-- Student Backlog History View (for individual student)
CREATE OR REPLACE VIEW public.student_backlog_history_view AS
SELECT
	sb.student_id,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.register_number,
	p.program_code,
	c.course_code,
	c.course_name,
	c.credit AS course_credits,
	sb.original_semester,
	oes.session_code AS original_session,
	sb.original_percentage,
	sb.original_letter_grade,
	sb.failure_reason,
	sb.is_cleared,
	ces.session_code AS cleared_session,
	sb.cleared_percentage,
	sb.cleared_letter_grade,
	sb.attempt_count,
	sb.semesters_pending,
	sb.priority_level,
	CASE
		WHEN sb.is_cleared = true THEN 'Cleared'
		WHEN sb.is_registered_for_arrear = true THEN 'Registered for Arrear'
		WHEN sb.attempt_count >= sb.max_attempts_allowed THEN 'Max Attempts Reached'
		ELSE 'Pending'
	END AS current_status
FROM public.student_backlogs sb
LEFT JOIN public.students s ON sb.student_id = s.id
LEFT JOIN public.programs p ON sb.program_id = p.id
LEFT JOIN public.courses c ON sb.course_id = c.id
LEFT JOIN public.examination_sessions oes ON sb.original_examination_session_id = oes.id
LEFT JOIN public.examination_sessions ces ON sb.cleared_examination_session_id = ces.id
WHERE sb.is_active = true
ORDER BY
	s.register_number,
	sb.original_semester,
	c.course_code;

-- Course-wise Backlog Analysis View
CREATE OR REPLACE VIEW public.course_backlog_analysis_view AS
SELECT
	i.institution_code,
	p.program_code,
	c.course_code,
	c.course_name,
	c.credit AS course_credits,
	sb.original_semester,
	COUNT(*) AS total_backlogs,
	COUNT(*) FILTER (WHERE sb.is_cleared = true) AS cleared_count,
	COUNT(*) FILTER (WHERE sb.is_cleared = false) AS pending_count,
	ROUND((COUNT(*) FILTER (WHERE sb.is_cleared = true)::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 2) AS clearance_rate,
	COUNT(*) FILTER (WHERE sb.failure_reason = 'Internal') AS failed_internal,
	COUNT(*) FILTER (WHERE sb.failure_reason = 'External') AS failed_external,
	COUNT(*) FILTER (WHERE sb.failure_reason = 'Both') AS failed_both,
	COUNT(*) FILTER (WHERE sb.is_absent = true) AS absent_count,
	ROUND(AVG(sb.attempt_count), 1) AS avg_attempts_to_clear,
	ROUND(AVG(sb.original_percentage), 2) AS avg_original_percentage,
	ROUND(AVG(sb.cleared_percentage) FILTER (WHERE sb.is_cleared = true), 2) AS avg_cleared_percentage
FROM public.student_backlogs sb
LEFT JOIN public.institutions i ON sb.institutions_id = i.id
LEFT JOIN public.programs p ON sb.program_id = p.id
LEFT JOIN public.courses c ON sb.course_id = c.id
WHERE sb.is_active = true
GROUP BY
	i.institution_code,
	p.program_code,
	c.course_code,
	c.course_name,
	c.credit,
	sb.original_semester
ORDER BY
	pending_count DESC,
	i.institution_code,
	p.program_code,
	c.course_code;

-- Critical Backlogs View (for alerts/notifications)
CREATE OR REPLACE VIEW public.critical_backlogs_view AS
SELECT
	sb.id,
	i.institution_code,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.register_number,
	p.program_code,
	c.course_code,
	c.course_name,
	sb.original_semester,
	sb.attempt_count,
	sb.max_attempts_allowed,
	sb.semesters_pending,
	sb.priority_level,
	sb.is_registered_for_arrear,
	CASE
		WHEN sb.attempt_count >= sb.max_attempts_allowed THEN 'Max Attempts Reached - Requires Review'
		WHEN sb.semesters_pending >= 4 THEN 'Pending 4+ Semesters - Critical'
		WHEN sb.semesters_pending >= 2 AND sb.attempt_count >= 2 THEN 'Multiple Failures - High Risk'
		ELSE 'Requires Attention'
	END AS alert_reason
FROM public.student_backlogs sb
LEFT JOIN public.students s ON sb.student_id = s.id
LEFT JOIN public.institutions i ON sb.institutions_id = i.id
LEFT JOIN public.programs p ON sb.program_id = p.id
LEFT JOIN public.courses c ON sb.course_id = c.id
WHERE sb.is_cleared = false
	AND sb.is_active = true
	AND (
		sb.priority_level IN ('Critical', 'High') OR
		sb.attempt_count >= sb.max_attempts_allowed OR
		sb.semesters_pending >= 4
	)
ORDER BY
	CASE sb.priority_level
		WHEN 'Critical' THEN 1
		WHEN 'High' THEN 2
		ELSE 3
	END,
	sb.semesters_pending DESC,
	sb.attempt_count DESC;

-- Arrear Exam Candidates View
CREATE OR REPLACE VIEW public.arrear_exam_candidates_view AS
SELECT
	sb.id,
	i.institution_code,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.register_number,
	s.student_email,
	p.program_code,
	c.course_code,
	c.course_name,
	c.credit AS course_credits,
	sb.original_semester,
	sb.attempt_count,
	sb.original_percentage,
	sb.failure_reason,
	sb.is_registered_for_arrear,
	sb.arrear_exam_session_id,
	aes.session_code AS arrear_session_code,
	aes.session_name AS arrear_session_name
FROM public.student_backlogs sb
LEFT JOIN public.students s ON sb.student_id = s.id
LEFT JOIN public.institutions i ON sb.institutions_id = i.id
LEFT JOIN public.programs p ON sb.program_id = p.id
LEFT JOIN public.courses c ON sb.course_id = c.id
LEFT JOIN public.examination_sessions aes ON sb.arrear_exam_session_id = aes.id
WHERE sb.is_cleared = false
	AND sb.is_active = true
	AND sb.attempt_count < sb.max_attempts_allowed
ORDER BY
	i.institution_code,
	p.program_code,
	sb.original_semester,
	c.course_code,
	s.register_number;

-- =====================================================
-- 5. CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to create backlog from failed final marks
CREATE OR REPLACE FUNCTION create_backlog_from_final_marks(
	p_final_marks_id UUID
)
RETURNS UUID AS $$
DECLARE
	v_backlog_id UUID;
	v_fm RECORD;
	v_sg RECORD;
	v_semester INT;
BEGIN
	-- Get final marks details
	SELECT
		fm.*,
		co.semester
	INTO v_fm
	FROM public.final_marks fm
	LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
	WHERE fm.id = p_final_marks_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Final marks not found: %', p_final_marks_id;
	END IF;

	-- Only create backlog for failed marks
	IF v_fm.is_pass = true THEN
		RETURN NULL;
	END IF;

	-- Try to get student_grade record if exists
	SELECT id, regulation_id, grade_code, grade_point
	INTO v_sg
	FROM public.student_grades
	WHERE final_marks_id = p_final_marks_id
	LIMIT 1;

	-- Insert backlog record
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
		auth.uid()
	)
	ON CONFLICT (student_id, course_id, original_examination_session_id)
	DO UPDATE SET
		attempt_count = student_backlogs.attempt_count + 1,
		last_attempt_date = CURRENT_DATE,
		last_attempt_session_id = v_fm.examination_session_id,
		updated_by = auth.uid(),
		updated_at = CURRENT_TIMESTAMP
	RETURNING id INTO v_backlog_id;

	RETURN v_backlog_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear a backlog
CREATE OR REPLACE FUNCTION clear_backlog(
	p_backlog_id UUID,
	p_final_marks_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
	v_fm RECORD;
	v_sg RECORD;
	v_semester INT;
BEGIN
	-- Get final marks details
	SELECT
		fm.*,
		co.semester
	INTO v_fm
	FROM public.final_marks fm
	LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
	WHERE fm.id = p_final_marks_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'Final marks not found: %', p_final_marks_id;
	END IF;

	-- Only clear if passed
	IF v_fm.is_pass = false THEN
		RETURN false;
	END IF;

	-- Try to get student_grade record if exists
	SELECT id, grade_code, grade_point
	INTO v_sg
	FROM public.student_grades
	WHERE final_marks_id = p_final_marks_id
	LIMIT 1;

	-- Update backlog with clearance details
	UPDATE public.student_backlogs
	SET
		is_cleared = true,
		cleared_examination_session_id = v_fm.examination_session_id,
		cleared_final_marks_id = p_final_marks_id,
		cleared_student_grade_id = v_sg.id,
		cleared_date = CURRENT_DATE,
		cleared_semester = v_fm.semester,
		cleared_internal_marks = v_fm.internal_marks_obtained,
		cleared_external_marks = v_fm.external_marks_obtained,
		cleared_total_marks = v_fm.total_marks_obtained,
		cleared_percentage = v_fm.percentage,
		cleared_grade_points = COALESCE(v_sg.grade_point, v_fm.grade_points),
		cleared_letter_grade = COALESCE(v_sg.grade_code, v_fm.letter_grade),
		is_registered_for_arrear = false,
		updated_by = auth.uid(),
		updated_at = CURRENT_TIMESTAMP
	WHERE id = p_backlog_id;

	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to register for arrear exam
CREATE OR REPLACE FUNCTION register_for_arrear_exam(
	p_backlog_ids UUID[],
	p_arrear_session_id UUID
)
RETURNS INT AS $$
DECLARE
	v_updated_count INT;
BEGIN
	UPDATE public.student_backlogs
	SET
		is_registered_for_arrear = true,
		arrear_registration_date = CURRENT_DATE,
		arrear_exam_session_id = p_arrear_session_id,
		updated_by = auth.uid(),
		updated_at = CURRENT_TIMESTAMP
	WHERE id = ANY(p_backlog_ids)
		AND is_cleared = false
		AND attempt_count < max_attempts_allowed;

	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get student backlog summary
CREATE OR REPLACE FUNCTION get_student_backlog_summary(
	p_student_id UUID
)
RETURNS TABLE (
	total_backlogs BIGINT,
	pending_backlogs BIGINT,
	cleared_backlogs BIGINT,
	critical_backlogs BIGINT,
	total_credits_pending INT,
	avg_attempts NUMERIC,
	oldest_backlog_semesters INT,
	registered_for_arrear BIGINT
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		COUNT(*) AS total_backlogs,
		COUNT(*) FILTER (WHERE sb.is_cleared = false) AS pending_backlogs,
		COUNT(*) FILTER (WHERE sb.is_cleared = true) AS cleared_backlogs,
		COUNT(*) FILTER (WHERE sb.priority_level = 'Critical' AND sb.is_cleared = false) AS critical_backlogs,
		COALESCE(SUM(c.credit) FILTER (WHERE sb.is_cleared = false), 0)::INT AS total_credits_pending,
		ROUND(AVG(sb.attempt_count), 1) AS avg_attempts,
		COALESCE(MAX(sb.semesters_pending) FILTER (WHERE sb.is_cleared = false), 0)::INT AS oldest_backlog_semesters,
		COUNT(*) FILTER (WHERE sb.is_registered_for_arrear = true AND sb.is_cleared = false) AS registered_for_arrear
	FROM public.student_backlogs sb
	LEFT JOIN public.courses c ON sb.course_id = c.id
	WHERE sb.student_id = p_student_id
		AND sb.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update semesters pending for all backlogs
CREATE OR REPLACE FUNCTION update_backlogs_semesters_pending(
	p_current_semester INT
)
RETURNS INT AS $$
DECLARE
	v_updated_count INT;
BEGIN
	UPDATE public.student_backlogs
	SET
		semesters_pending = p_current_semester - original_semester,
		updated_at = CURRENT_TIMESTAMP
	WHERE is_cleared = false
		AND is_active = true;

	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get backlog statistics for a program
CREATE OR REPLACE FUNCTION get_program_backlog_statistics(
	p_program_id UUID,
	p_examination_session_id UUID DEFAULT NULL
)
RETURNS TABLE (
	semester INT,
	total_students BIGINT,
	students_with_backlogs BIGINT,
	total_backlogs BIGINT,
	avg_backlogs_per_student NUMERIC,
	most_failed_course_code TEXT,
	most_failed_course_name TEXT,
	most_failed_count BIGINT
) AS $$
BEGIN
	RETURN QUERY
	WITH backlog_stats AS (
		SELECT
			sb.original_semester,
			COUNT(DISTINCT sb.student_id) AS students_with_backlogs,
			COUNT(*) AS total_backlogs
		FROM public.student_backlogs sb
		WHERE sb.program_id = p_program_id
			AND sb.is_cleared = false
			AND sb.is_active = true
			AND (p_examination_session_id IS NULL OR sb.original_examination_session_id = p_examination_session_id)
		GROUP BY sb.original_semester
	),
	course_stats AS (
		SELECT DISTINCT ON (sb.original_semester)
			sb.original_semester,
			c.course_code,
			c.course_name,
			COUNT(*) AS fail_count
		FROM public.student_backlogs sb
		LEFT JOIN public.courses c ON sb.course_id = c.id
		WHERE sb.program_id = p_program_id
			AND sb.is_cleared = false
			AND sb.is_active = true
			AND (p_examination_session_id IS NULL OR sb.original_examination_session_id = p_examination_session_id)
		GROUP BY sb.original_semester, c.course_code, c.course_name
		ORDER BY sb.original_semester, fail_count DESC
	)
	SELECT
		bs.original_semester AS semester,
		0::BIGINT AS total_students, -- Would need to join with enrollment data
		bs.students_with_backlogs,
		bs.total_backlogs,
		ROUND(bs.total_backlogs::NUMERIC / NULLIF(bs.students_with_backlogs::NUMERIC, 0), 2) AS avg_backlogs_per_student,
		cs.course_code::TEXT AS most_failed_course_code,
		cs.course_name::TEXT AS most_failed_course_name,
		cs.fail_count AS most_failed_count
	FROM backlog_stats bs
	LEFT JOIN course_stats cs ON bs.original_semester = cs.original_semester
	ORDER BY bs.original_semester;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk create backlogs from semester results
CREATE OR REPLACE FUNCTION create_backlogs_from_semester_results(
	p_examination_session_id UUID,
	p_program_id UUID DEFAULT NULL,
	p_semester INT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_created_count INT := 0;
	v_fm RECORD;
BEGIN
	FOR v_fm IN
		SELECT fm.id
		FROM public.final_marks fm
		LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
		WHERE fm.examination_session_id = p_examination_session_id
			AND fm.is_pass = false
			AND fm.is_active = true
			AND fm.result_status = 'Published'
			AND (p_program_id IS NULL OR fm.program_id = p_program_id)
			AND (p_semester IS NULL OR co.semester = p_semester)
			AND NOT EXISTS (
				SELECT 1 FROM public.student_backlogs sb
				WHERE sb.original_final_marks_id = fm.id
			)
	LOOP
		PERFORM create_backlog_from_final_marks(v_fm.id);
		v_created_count := v_created_count + 1;
	END LOOP;

	RETURN v_created_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.student_backlogs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. CREATE RLS POLICIES
-- =====================================================

-- Policy: Allow authenticated users to read backlogs
CREATE POLICY "Authenticated users can read student backlogs"
	ON public.student_backlogs
	FOR SELECT
	TO authenticated
	USING (true);

-- Policy: Allow students to read their own backlogs
CREATE POLICY "Students can read their own backlogs"
	ON public.student_backlogs
	FOR SELECT
	TO authenticated
	USING (student_id = auth.uid());

-- Policy: Allow authenticated users to insert backlogs
CREATE POLICY "Authenticated users can insert student backlogs"
	ON public.student_backlogs
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

-- Policy: Allow users to update backlogs
CREATE POLICY "Users can update student backlogs"
	ON public.student_backlogs
	FOR UPDATE
	TO authenticated
	USING (true)
	WITH CHECK (true);

-- Policy: Allow admins to delete backlogs
CREATE POLICY "Admins can delete student backlogs"
	ON public.student_backlogs
	FOR DELETE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM public.user_roles ur
			JOIN public.roles r ON ur.role_id = r.id
			WHERE ur.user_id = auth.uid()
				AND r.name IN ('admin', 'super_admin', 'coe_admin')
				AND ur.is_active = true
		)
	);

-- Policy: Service role has full access
CREATE POLICY "Service role can manage all student backlogs"
	ON public.student_backlogs
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION create_backlog_from_final_marks(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION clear_backlog(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION register_for_arrear_exam(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_backlog_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_backlogs_semesters_pending(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_program_backlog_statistics(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_backlogs_from_semester_results(UUID, UUID, INT) TO authenticated;

GRANT EXECUTE ON FUNCTION create_backlog_from_final_marks(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION clear_backlog(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION register_for_arrear_exam(UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_student_backlog_summary(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_backlogs_semesters_pending(INT) TO service_role;
GRANT EXECUTE ON FUNCTION get_program_backlog_statistics(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION create_backlogs_from_semester_results(UUID, UUID, INT) TO service_role;

-- =====================================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.student_backlogs IS 'Tracks individual course backlogs per student with clearance history, attempt counts, and arrear exam management';

COMMENT ON VIEW public.student_backlogs_detailed_view IS 'Denormalized view of student backlogs with all related entity information';
COMMENT ON VIEW public.pending_backlogs_summary_view IS 'Summary of pending backlogs grouped by institution, program, and semester';
COMMENT ON VIEW public.student_backlog_history_view IS 'Complete backlog history for individual students';
COMMENT ON VIEW public.course_backlog_analysis_view IS 'Course-wise backlog analysis with clearance rates and failure reasons';
COMMENT ON VIEW public.critical_backlogs_view IS 'View of critical and high-priority backlogs for alerts';
COMMENT ON VIEW public.arrear_exam_candidates_view IS 'View of students eligible for arrear examinations';

COMMENT ON COLUMN public.student_backlogs.original_semester IS 'Semester in which the backlog was originally created';
COMMENT ON COLUMN public.student_backlogs.attempt_count IS 'Number of attempts made to clear this backlog';
COMMENT ON COLUMN public.student_backlogs.semesters_pending IS 'Number of semesters this backlog has been pending';
COMMENT ON COLUMN public.student_backlogs.priority_level IS 'Auto-calculated priority: Critical, High, Normal, Low';
COMMENT ON COLUMN public.student_backlogs.failure_reason IS 'Component that caused failure: Internal, External, Both, Overall, Absent';
COMMENT ON COLUMN public.student_backlogs.is_improvement IS 'True if this is an improvement attempt for an already passed course';
COMMENT ON COLUMN public.student_backlogs.is_registered_for_arrear IS 'Whether student has registered for arrear/supplementary exam';

COMMENT ON FUNCTION create_backlog_from_final_marks(UUID) IS 'Creates a backlog record from a failed final marks entry';
COMMENT ON FUNCTION clear_backlog(UUID, UUID) IS 'Marks a backlog as cleared with the passing final marks';
COMMENT ON FUNCTION register_for_arrear_exam(UUID[], UUID) IS 'Registers multiple backlogs for an arrear examination session';
COMMENT ON FUNCTION get_student_backlog_summary(UUID) IS 'Returns summary statistics of backlogs for a student';
COMMENT ON FUNCTION update_backlogs_semesters_pending(INT) IS 'Updates semesters_pending for all pending backlogs';
COMMENT ON FUNCTION get_program_backlog_statistics(UUID, UUID) IS 'Returns backlog statistics for a program';
COMMENT ON FUNCTION create_backlogs_from_semester_results(UUID, UUID, INT) IS 'Bulk creates backlog records from published failed results';

-- =====================================================
-- 10. CREATE TRIGGER TO AUTO-CREATE BACKLOGS
-- =====================================================

-- Trigger to auto-create backlog when final marks are published as failed
CREATE OR REPLACE FUNCTION auto_create_backlog_on_publish()
RETURNS TRIGGER AS $$
BEGIN
	-- Only create backlog when result is published and student failed
	IF NEW.result_status = 'Published' AND
	   OLD.result_status != 'Published' AND
	   NEW.is_pass = false THEN
		PERFORM create_backlog_from_final_marks(NEW.id);
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_backlog_on_publish
	AFTER UPDATE ON public.final_marks
	FOR EACH ROW
	WHEN (NEW.result_status = 'Published' AND OLD.result_status != 'Published')
	EXECUTE FUNCTION auto_create_backlog_on_publish();

-- =====================================================
-- END OF MIGRATION
-- =====================================================
