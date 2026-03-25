-- =====================================================
-- Semester Results Table with RLS, Functions, and Views
-- =====================================================
-- Date: 2025-12-02
-- Purpose: Track semester-wise consolidated results for students
-- including SGPA, CGPA, result status, and promotion tracking
-- =====================================================

-- =====================================================
-- 1. CREATE SEMESTER RESULTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.semester_results (
	id UUID NOT NULL DEFAULT gen_random_uuid(),

	-- Core References
	institutions_id UUID NOT NULL,
	student_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	program_id UUID NOT NULL,
	academic_year_id UUID,

	-- Semester Information
	semester INT NOT NULL,

	-- Credit Summary
	total_credits_registered INT NOT NULL,
	total_credits_earned INT NOT NULL,
	total_credit_points DECIMAL(8,2) NOT NULL,

	-- Grade Point Averages
	sgpa DECIMAL(4,2) NOT NULL, -- Semester GPA
	cgpa DECIMAL(4,2) NOT NULL, -- Cumulative GPA

	-- Percentage
	percentage DECIMAL(5,2) NOT NULL,

	-- Backlog Tracking
	total_backlogs INT DEFAULT 0,
	new_backlogs INT DEFAULT 0,
	cleared_backlogs INT DEFAULT 0,

	-- Result Classification
	result_class VARCHAR(100), -- Distinction, First Class, Second Class, Pass
	is_distinction BOOLEAN DEFAULT false,
	is_first_class BOOLEAN DEFAULT false,

	-- Promotion Status
	is_promoted BOOLEAN,
	promotion_remarks TEXT,

	-- Result Status
	result_status VARCHAR(50) NOT NULL DEFAULT 'Pending', -- Pending, Pass, Fail, Incomplete, Withheld

	-- Result Declaration
	result_declared_date DATE,
	result_declared_by UUID,

	-- Publication Status
	is_published BOOLEAN DEFAULT false,
	published_date DATE,
	published_by UUID,

	-- Lock Mechanism
	is_locked BOOLEAN DEFAULT false,
	locked_by UUID,
	locked_date DATE,

	-- Additional Metadata
	remarks TEXT,
	is_active BOOLEAN DEFAULT true,

	-- Audit Fields
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID,
	updated_by UUID,

	-- Primary Key
	CONSTRAINT semester_results_pkey PRIMARY KEY (id),

	-- Foreign Key Constraints
	CONSTRAINT semester_results_institutions_id_fkey
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE CASCADE,
	CONSTRAINT semester_results_student_id_fkey
		FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
	CONSTRAINT semester_results_examination_session_id_fkey
		FOREIGN KEY (examination_session_id) REFERENCES examination_sessions(id) ON DELETE CASCADE,
	CONSTRAINT semester_results_program_id_fkey
		FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
	CONSTRAINT semester_results_academic_year_id_fkey
		FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL,
	CONSTRAINT semester_results_result_declared_by_fkey
		FOREIGN KEY (result_declared_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT semester_results_published_by_fkey
		FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT semester_results_locked_by_fkey
		FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT semester_results_created_by_fkey
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT semester_results_updated_by_fkey
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

	-- Unique Constraints
	CONSTRAINT unique_semester_result
		UNIQUE(institutions_id, student_id, examination_session_id, semester),

	-- Check Constraints
	CONSTRAINT check_semester_valid
		CHECK (semester >= 1 AND semester <= 10),
	CONSTRAINT check_credits_non_negative
		CHECK (
			total_credits_registered >= 0 AND
			total_credits_earned >= 0 AND
			total_credits_earned <= total_credits_registered AND
			total_credit_points >= 0
		),
	CONSTRAINT check_sgpa_valid
		CHECK (sgpa >= 0 AND sgpa <= 10),
	CONSTRAINT check_cgpa_valid
		CHECK (cgpa >= 0 AND cgpa <= 10),
	CONSTRAINT check_percentage_valid
		CHECK (percentage >= 0 AND percentage <= 100),
	CONSTRAINT check_backlogs_non_negative
		CHECK (
			total_backlogs >= 0 AND
			new_backlogs >= 0 AND
			cleared_backlogs >= 0
		),
	CONSTRAINT check_valid_result_status
		CHECK (result_status IN ('Pending', 'Pass', 'Fail', 'Incomplete', 'Withheld', 'Under Review')),
	CONSTRAINT check_valid_result_class
		CHECK (result_class IS NULL OR result_class IN ('Distinction', 'First Class', 'Second Class', 'Pass', 'Fail')),
	CONSTRAINT check_publication_consistency
		CHECK (
			(is_published = false AND published_by IS NULL AND published_date IS NULL) OR
			(is_published = true AND published_by IS NOT NULL AND published_date IS NOT NULL)
		),
	CONSTRAINT check_lock_consistency
		CHECK (
			(is_locked = false AND locked_by IS NULL AND locked_date IS NULL) OR
			(is_locked = true AND locked_by IS NOT NULL AND locked_date IS NOT NULL)
		),
	CONSTRAINT check_result_declared_consistency
		CHECK (
			(result_declared_date IS NULL AND result_declared_by IS NULL) OR
			(result_declared_date IS NOT NULL AND result_declared_by IS NOT NULL)
		)
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_semester_results_institutions_id
	ON public.semester_results(institutions_id);
CREATE INDEX IF NOT EXISTS idx_semester_results_student_id
	ON public.semester_results(student_id);
CREATE INDEX IF NOT EXISTS idx_semester_results_examination_session_id
	ON public.semester_results(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_semester_results_program_id
	ON public.semester_results(program_id);
CREATE INDEX IF NOT EXISTS idx_semester_results_academic_year_id
	ON public.semester_results(academic_year_id) WHERE academic_year_id IS NOT NULL;

-- Status and Boolean Indexes
CREATE INDEX IF NOT EXISTS idx_semester_results_result_status
	ON public.semester_results(result_status);
CREATE INDEX IF NOT EXISTS idx_semester_results_is_promoted
	ON public.semester_results(is_promoted) WHERE is_promoted IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_semester_results_is_published
	ON public.semester_results(is_published);
CREATE INDEX IF NOT EXISTS idx_semester_results_is_locked
	ON public.semester_results(is_locked);
CREATE INDEX IF NOT EXISTS idx_semester_results_is_active
	ON public.semester_results(is_active);
CREATE INDEX IF NOT EXISTS idx_semester_results_is_distinction
	ON public.semester_results(is_distinction) WHERE is_distinction = true;
CREATE INDEX IF NOT EXISTS idx_semester_results_is_first_class
	ON public.semester_results(is_first_class) WHERE is_first_class = true;

-- Semester Index
CREATE INDEX IF NOT EXISTS idx_semester_results_semester
	ON public.semester_results(semester);

-- User Tracking Indexes
CREATE INDEX IF NOT EXISTS idx_semester_results_result_declared_by
	ON public.semester_results(result_declared_by) WHERE result_declared_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_semester_results_published_by
	ON public.semester_results(published_by) WHERE published_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_semester_results_locked_by
	ON public.semester_results(locked_by) WHERE locked_by IS NOT NULL;

-- Date Indexes
CREATE INDEX IF NOT EXISTS idx_semester_results_result_declared_date
	ON public.semester_results(result_declared_date) WHERE result_declared_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_semester_results_published_date
	ON public.semester_results(published_date) WHERE published_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_semester_results_created_at
	ON public.semester_results(created_at DESC);

-- Grade Indexes
CREATE INDEX IF NOT EXISTS idx_semester_results_sgpa
	ON public.semester_results(sgpa);
CREATE INDEX IF NOT EXISTS idx_semester_results_cgpa
	ON public.semester_results(cgpa);
CREATE INDEX IF NOT EXISTS idx_semester_results_percentage
	ON public.semester_results(percentage);
CREATE INDEX IF NOT EXISTS idx_semester_results_result_class
	ON public.semester_results(result_class) WHERE result_class IS NOT NULL;

-- Backlog Indexes
CREATE INDEX IF NOT EXISTS idx_semester_results_total_backlogs
	ON public.semester_results(total_backlogs) WHERE total_backlogs > 0;

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS idx_semester_results_session_status
	ON public.semester_results(examination_session_id, result_status);
CREATE INDEX IF NOT EXISTS idx_semester_results_session_semester
	ON public.semester_results(examination_session_id, semester);
CREATE INDEX IF NOT EXISTS idx_semester_results_student_session
	ON public.semester_results(student_id, examination_session_id);
CREATE INDEX IF NOT EXISTS idx_semester_results_student_semester
	ON public.semester_results(student_id, semester);
CREATE INDEX IF NOT EXISTS idx_semester_results_program_status
	ON public.semester_results(program_id, result_status);
CREATE INDEX IF NOT EXISTS idx_semester_results_program_semester
	ON public.semester_results(program_id, semester);
CREATE INDEX IF NOT EXISTS idx_semester_results_institution_session_status
	ON public.semester_results(institutions_id, examination_session_id, result_status);

-- Partial Indexes for Specific Queries
CREATE INDEX IF NOT EXISTS idx_semester_results_published_results
	ON public.semester_results(id, student_id, published_date)
	WHERE is_published = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_semester_results_pending_results
	ON public.semester_results(id, examination_session_id, created_at)
	WHERE result_status = 'Pending' AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_semester_results_failed_students
	ON public.semester_results(id, student_id, program_id)
	WHERE result_status = 'Fail' AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_semester_results_with_backlogs
	ON public.semester_results(id, student_id, total_backlogs)
	WHERE total_backlogs > 0 AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_semester_results_distinction
	ON public.semester_results(id, student_id, cgpa)
	WHERE is_distinction = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_semester_results_active_unlocked
	ON public.semester_results(id, result_status, created_at)
	WHERE is_active = true AND is_locked = false;

-- =====================================================
-- 3. CREATE TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_semester_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_semester_results_updated_at
	BEFORE UPDATE ON public.semester_results
	FOR EACH ROW
	EXECUTE FUNCTION update_semester_results_updated_at();

-- Auto-calculate result class based on percentage (Dynamic using grade_system)
CREATE OR REPLACE FUNCTION auto_calculate_result_class()
RETURNS TRIGGER AS $$
DECLARE
	v_program_type VARCHAR(10);
	v_regulation_id UUID;
	v_grade_info RECORD;
BEGIN
	-- Only calculate if result is Pass or Pending
	IF NEW.result_status NOT IN ('Pass', 'Pending') THEN
		NEW.is_distinction = false;
		NEW.is_first_class = false;
		RETURN NEW;
	END IF;

	-- Get program type (UG/PG) from program duration and regulation from student_grades
	SELECT
		CASE
			WHEN p.program_duration_yrs <= 3 THEN 'UG'
			ELSE 'PG'
		END,
		sg.regulation_id
	INTO v_program_type, v_regulation_id
	FROM public.programs p
	LEFT JOIN public.student_grades sg ON sg.student_id = NEW.student_id
		AND sg.examination_session_id = NEW.examination_session_id
		AND sg.is_active = true
	WHERE p.id = NEW.program_id
	LIMIT 1;

	-- Try to get result class from grade_system based on percentage
	IF v_regulation_id IS NOT NULL THEN
		SELECT
			gs.grade,
			gs.description,
			gs.grade_point
		INTO v_grade_info
		FROM public.grade_system gs
		WHERE gs.regulation_id = v_regulation_id
			AND gs.grade_system_code = v_program_type
			AND gs.is_active = true
			AND NEW.percentage >= gs.min_mark
			AND NEW.percentage <= gs.max_mark
		ORDER BY gs.grade_point DESC
		LIMIT 1;

		IF FOUND THEN
			-- Use dynamic grade system
			NEW.result_class = v_grade_info.grade || ' - ' || v_grade_info.description;
			NEW.is_distinction = v_grade_info.grade_point >= 9.0;
			NEW.is_first_class = v_grade_info.grade_point >= 7.0;
			RETURN NEW;
		END IF;
	END IF;

	-- Fallback to hardcoded values if no grade_system match
	IF NEW.percentage >= 75 THEN
		NEW.result_class = 'Distinction';
		NEW.is_distinction = true;
		NEW.is_first_class = true;
	ELSIF NEW.percentage >= 60 THEN
		NEW.result_class = 'First Class';
		NEW.is_distinction = false;
		NEW.is_first_class = true;
	ELSIF NEW.percentage >= 50 THEN
		NEW.result_class = 'Second Class';
		NEW.is_distinction = false;
		NEW.is_first_class = false;
	ELSIF NEW.percentage >= 40 THEN
		NEW.result_class = 'Pass';
		NEW.is_distinction = false;
		NEW.is_first_class = false;
	ELSE
		NEW.result_class = 'Fail';
		NEW.is_distinction = false;
		NEW.is_first_class = false;
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_calculate_result_class
	BEFORE INSERT OR UPDATE ON public.semester_results
	FOR EACH ROW
	WHEN (NEW.percentage IS NOT NULL)
	EXECUTE FUNCTION auto_calculate_result_class();

-- Auto-determine result status based on backlogs and credits
CREATE OR REPLACE FUNCTION auto_determine_semester_result_status()
RETURNS TRIGGER AS $$
BEGIN
	-- Only auto-calculate if status is Pending and not manually set
	IF NEW.result_status = 'Pending' THEN
		-- Check if student has earned all credits and has no backlogs
		IF NEW.total_backlogs = 0 AND NEW.total_credits_earned = NEW.total_credits_registered THEN
			NEW.result_status = 'Pass';
			NEW.is_promoted = true;
		ELSIF NEW.total_backlogs > 0 THEN
			-- Student has backlogs but might still be promoted based on rules
			NEW.result_status = 'Fail';
			-- Promotion depends on institution rules (can be overridden)
		ELSIF NEW.total_credits_earned < NEW.total_credits_registered THEN
			NEW.result_status = 'Incomplete';
		END IF;
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_determine_semester_result_status
	BEFORE INSERT OR UPDATE ON public.semester_results
	FOR EACH ROW
	EXECUTE FUNCTION auto_determine_semester_result_status();

-- Auto-populate publication details
CREATE OR REPLACE FUNCTION auto_populate_semester_results_publication()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.is_published = true AND (OLD.is_published IS NULL OR OLD.is_published = false) THEN
		NEW.published_date = CURRENT_DATE;
		IF NEW.published_by IS NULL THEN
			NEW.published_by = auth.uid();
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_semester_results_publication
	BEFORE UPDATE ON public.semester_results
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_semester_results_publication();

-- Auto-populate lock details
CREATE OR REPLACE FUNCTION auto_populate_semester_results_lock()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.is_locked = true AND (OLD.is_locked IS NULL OR OLD.is_locked = false) THEN
		NEW.locked_date = CURRENT_DATE;
		IF NEW.locked_by IS NULL THEN
			NEW.locked_by = auth.uid();
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_semester_results_lock
	BEFORE UPDATE ON public.semester_results
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_semester_results_lock();

-- Prevent modification of locked semester results
CREATE OR REPLACE FUNCTION prevent_locked_semester_results_modification()
RETURNS TRIGGER AS $$
BEGIN
	IF OLD.is_locked = true AND (
		NEW.sgpa != OLD.sgpa OR
		NEW.cgpa != OLD.cgpa OR
		NEW.percentage != OLD.percentage OR
		NEW.total_credits_earned != OLD.total_credits_earned OR
		NEW.total_credit_points != OLD.total_credit_points OR
		NEW.result_status != OLD.result_status
	) THEN
		RAISE EXCEPTION 'Cannot modify locked semester results. Unlock first.';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_locked_semester_results_modification
	BEFORE UPDATE ON public.semester_results
	FOR EACH ROW
	EXECUTE FUNCTION prevent_locked_semester_results_modification();

-- Prevent modification of published results
CREATE OR REPLACE FUNCTION prevent_published_semester_results_modification()
RETURNS TRIGGER AS $$
BEGIN
	IF OLD.is_published = true AND (
		NEW.sgpa != OLD.sgpa OR
		NEW.cgpa != OLD.cgpa OR
		NEW.percentage != OLD.percentage OR
		NEW.total_credits_earned != OLD.total_credits_earned OR
		NEW.result_status != OLD.result_status
	) THEN
		RAISE EXCEPTION 'Cannot modify published semester results. Withdraw publication first.';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_published_semester_results_modification
	BEFORE UPDATE ON public.semester_results
	FOR EACH ROW
	EXECUTE FUNCTION prevent_published_semester_results_modification();

-- Auto-populate result declaration details
CREATE OR REPLACE FUNCTION auto_populate_result_declaration()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.result_declared_date IS NOT NULL AND OLD.result_declared_date IS NULL THEN
		IF NEW.result_declared_by IS NULL THEN
			NEW.result_declared_by = auth.uid();
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_result_declaration
	BEFORE UPDATE ON public.semester_results
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_result_declaration();

-- =====================================================
-- 4. CREATE VIEWS
-- =====================================================

-- Detailed Semester Results View with all related data
CREATE OR REPLACE VIEW public.semester_results_detailed_view AS
SELECT
	-- Semester Results Details
	sr.id,
	sr.semester,

	-- Credit Summary
	sr.total_credits_registered,
	sr.total_credits_earned,
	sr.total_credit_points,

	-- Grade Averages
	sr.sgpa,
	sr.cgpa,
	sr.percentage,

	-- Result Classification
	sr.result_class,
	sr.is_distinction,
	sr.is_first_class,

	-- Backlog Details
	sr.total_backlogs,
	sr.new_backlogs,
	sr.cleared_backlogs,

	-- Promotion Status
	sr.is_promoted,
	sr.promotion_remarks,

	-- Result Status
	sr.result_status,
	sr.result_declared_date,
	sr.result_declared_by,
	rdu.full_name AS result_declared_by_name,

	-- Publication Status
	sr.is_published,
	sr.published_date,
	sr.published_by,
	pbu.full_name AS published_by_name,

	-- Lock Status
	sr.is_locked,
	sr.locked_by,
	sr.locked_date,
	lbu.full_name AS locked_by_name,

	-- Remarks
	sr.remarks,
	sr.is_active,

	-- Student Details
	sr.student_id,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.student_email,
	s.register_number,

	-- Institution Details
	sr.institutions_id,
	i.institution_code,
	i.name AS institution_name,

	-- Examination Session Details
	sr.examination_session_id,
	es.session_code,
	es.session_name,

	-- Program Details
	sr.program_id,
	p.program_code,
	p.program_name,

	-- Academic Year Details
	sr.academic_year_id,
	ay.year_name AS academic_year_name,

	-- Audit Fields
	sr.created_at,
	sr.updated_at,
	sr.created_by,
	sr.updated_by,
	cu.full_name AS created_by_name
FROM public.semester_results sr
LEFT JOIN public.students s ON sr.student_id = s.id
LEFT JOIN public.users rdu ON sr.result_declared_by = rdu.id
LEFT JOIN public.users pbu ON sr.published_by = pbu.id
LEFT JOIN public.users lbu ON sr.locked_by = lbu.id
LEFT JOIN public.users cu ON sr.created_by = cu.id
LEFT JOIN public.institutions i ON sr.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON sr.examination_session_id = es.id
LEFT JOIN public.programs p ON sr.program_id = p.id
LEFT JOIN public.academic_years ay ON sr.academic_year_id = ay.id;

-- Semester Results Summary View for reporting
CREATE OR REPLACE VIEW public.semester_results_summary_view AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	sr.semester,
	COUNT(*) AS total_students,
	COUNT(*) FILTER (WHERE sr.result_status = 'Pass') AS passed_count,
	COUNT(*) FILTER (WHERE sr.result_status = 'Fail') AS failed_count,
	COUNT(*) FILTER (WHERE sr.result_status = 'Incomplete') AS incomplete_count,
	COUNT(*) FILTER (WHERE sr.is_distinction = true) AS distinction_count,
	COUNT(*) FILTER (WHERE sr.is_first_class = true) AS first_class_count,
	COUNT(*) FILTER (WHERE sr.is_promoted = true) AS promoted_count,
	COUNT(*) FILTER (WHERE sr.is_published = true) AS published_count,
	COUNT(*) FILTER (WHERE sr.total_backlogs > 0) AS students_with_backlogs,
	SUM(sr.total_backlogs) AS total_backlog_count,
	ROUND(AVG(sr.sgpa), 2) AS average_sgpa,
	ROUND(AVG(sr.cgpa), 2) AS average_cgpa,
	ROUND(AVG(sr.percentage), 2) AS average_percentage,
	MIN(sr.sgpa) AS min_sgpa,
	MAX(sr.sgpa) AS max_sgpa,
	MIN(sr.cgpa) AS min_cgpa,
	MAX(sr.cgpa) AS max_cgpa,
	ROUND(STDDEV(sr.sgpa), 2) AS sgpa_std_deviation,
	ROUND(STDDEV(sr.cgpa), 2) AS cgpa_std_deviation,
	ROUND((COUNT(*) FILTER (WHERE sr.result_status = 'Pass')::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 2) AS pass_percentage
FROM public.semester_results sr
LEFT JOIN public.institutions i ON sr.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON sr.examination_session_id = es.id
LEFT JOIN public.programs p ON sr.program_id = p.id
WHERE sr.is_active = true
GROUP BY
	i.institution_code, i.name,
	es.session_code, es.session_name,
	p.program_code, p.program_name,
	sr.semester;

-- Student Published Results View (for student portal)
CREATE OR REPLACE VIEW public.student_semester_results_view AS
SELECT
	s.id AS student_id,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.register_number,
	i.institution_code,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	sr.semester,
	sr.total_credits_registered,
	sr.total_credits_earned,
	sr.sgpa,
	sr.cgpa,
	sr.percentage,
	sr.result_class,
	sr.is_distinction,
	sr.is_first_class,
	sr.result_status,
	sr.total_backlogs,
	sr.is_promoted,
	sr.published_date
FROM public.semester_results sr
LEFT JOIN public.students s ON sr.student_id = s.id
LEFT JOIN public.institutions i ON sr.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON sr.examination_session_id = es.id
LEFT JOIN public.programs p ON sr.program_id = p.id
WHERE sr.is_published = true
	AND sr.is_active = true;

-- =====================================================
-- Dynamic CGPA Distribution View
-- =====================================================
-- Uses grade_system table for UG/PG specific grade ranges
-- Gets regulation from student_grades (linked to courses)
-- =====================================================
CREATE OR REPLACE VIEW public.cgpa_distribution_view AS
WITH student_regulation AS (
	-- Get the regulation for each student's semester result
	-- from their student_grades (which links to courses with regulation)
	SELECT DISTINCT ON (sr.id)
		sr.id AS semester_result_id,
		sr.institutions_id,
		sr.examination_session_id,
		sr.program_id,
		sr.semester,
		sr.cgpa,
		sr.student_id,
		-- Get regulation from student_grades
		sg.regulation_id,
		-- Get UG/PG from grade_system_code or program duration
		COALESCE(
			(
				SELECT DISTINCT gs.grade_system_code
				FROM public.grade_system gs
				WHERE gs.regulation_id = sg.regulation_id
					AND gs.is_active = true
				LIMIT 1
			),
			CASE
				WHEN p.program_duration_yrs <= 3 THEN 'UG'
				ELSE 'PG'
			END
		) AS program_type
	FROM public.semester_results sr
	LEFT JOIN public.programs p ON sr.program_id = p.id
	LEFT JOIN public.student_grades sg ON sg.student_id = sr.student_id
		AND sg.examination_session_id = sr.examination_session_id
		AND sg.is_active = true
	WHERE sr.is_active = true
),
cgpa_with_grades AS (
	-- Match CGPA to grade from grade_system
	SELECT
		swr.*,
		COALESCE(
			-- Match using grade_system (grade_point based)
			(
				SELECT gs.grade || ' - ' || gs.description
				FROM public.grade_system gs
				WHERE gs.regulation_id = swr.regulation_id
					AND gs.grade_system_code = swr.program_type
					AND gs.is_active = true
					AND swr.cgpa >= gs.grade_point - 0.49
					AND swr.cgpa <= gs.grade_point + 0.50
				ORDER BY ABS(gs.grade_point - swr.cgpa)
				LIMIT 1
			),
			-- Fallback: Find closest grade_point match
			(
				SELECT gs.grade || ' - ' || gs.description
				FROM public.grade_system gs
				WHERE gs.regulation_id = swr.regulation_id
					AND gs.grade_system_code = swr.program_type
					AND gs.is_active = true
				ORDER BY ABS(gs.grade_point - swr.cgpa)
				LIMIT 1
			),
			-- Final fallback: default grade ranges
			CASE
				WHEN swr.cgpa >= 9.0 THEN 'O - Outstanding'
				WHEN swr.cgpa >= 8.0 THEN 'A+ - Excellent'
				WHEN swr.cgpa >= 7.0 THEN 'A - Very Good'
				WHEN swr.cgpa >= 6.0 THEN 'B+ - Good'
				WHEN swr.cgpa >= 5.5 THEN 'B - Above Average'
				WHEN swr.cgpa >= 5.0 THEN 'C - Average'
				WHEN swr.cgpa >= 4.0 THEN 'P - Pass'
				ELSE 'RA - Reappear'
			END
		) AS cgpa_grade
	FROM student_regulation swr
)
SELECT
	i.institution_code,
	es.session_code,
	p.program_code,
	cwg.program_type,  -- UG or PG
	r.regulation_code,
	cwg.semester,
	cwg.cgpa_grade AS cgpa_range,
	COUNT(*) AS student_count,
	ROUND(
		(COUNT(*)::NUMERIC /
		 NULLIF(SUM(COUNT(*)) OVER (
			PARTITION BY i.institution_code, es.session_code, p.program_code, cwg.semester
		 ), 0)) * 100,
		2
	) AS percentage_of_class,
	-- Additional stats
	ROUND(AVG(cwg.cgpa), 2) AS avg_cgpa_in_range,
	MIN(cwg.cgpa) AS min_cgpa_in_range,
	MAX(cwg.cgpa) AS max_cgpa_in_range
FROM cgpa_with_grades cwg
LEFT JOIN public.institutions i ON cwg.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON cwg.examination_session_id = es.id
LEFT JOIN public.programs p ON cwg.program_id = p.id
LEFT JOIN public.regulations r ON cwg.regulation_id = r.id
GROUP BY
	i.institution_code,
	es.session_code,
	p.program_code,
	cwg.program_type,
	r.regulation_code,
	cwg.semester,
	cwg.cgpa_grade
ORDER BY
	i.institution_code,
	es.session_code,
	p.program_code,
	cwg.semester,
	CASE
		WHEN cwg.cgpa_grade LIKE 'O -%' THEN 1
		WHEN cwg.cgpa_grade LIKE 'A+ -%' THEN 2
		WHEN cwg.cgpa_grade LIKE 'A -%' THEN 3
		WHEN cwg.cgpa_grade LIKE 'B+ -%' THEN 4
		WHEN cwg.cgpa_grade LIKE 'B -%' THEN 5
		WHEN cwg.cgpa_grade LIKE 'C -%' THEN 6
		WHEN cwg.cgpa_grade LIKE 'P -%' THEN 7
		ELSE 8
	END;

-- Failed Students View
CREATE OR REPLACE VIEW public.semester_failed_students_view AS
SELECT
	sr.id,
	i.institution_code,
	es.session_code,
	p.program_code,
	sr.semester,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.register_number,
	sr.sgpa,
	sr.cgpa,
	sr.percentage,
	sr.total_backlogs,
	sr.new_backlogs,
	sr.total_credits_registered,
	sr.total_credits_earned,
	sr.total_credits_registered - sr.total_credits_earned AS credits_not_earned,
	sr.result_status,
	sr.is_promoted
FROM public.semester_results sr
LEFT JOIN public.students s ON sr.student_id = s.id
LEFT JOIN public.institutions i ON sr.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON sr.examination_session_id = es.id
LEFT JOIN public.programs p ON sr.program_id = p.id
WHERE sr.result_status = 'Fail'
	AND sr.is_active = true
ORDER BY es.session_code, p.program_code, sr.semester, s.register_number;

-- Students with Backlogs View
CREATE OR REPLACE VIEW public.students_with_backlogs_view AS
SELECT
	sr.id,
	i.institution_code,
	es.session_code,
	p.program_code,
	sr.semester,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.register_number,
	sr.total_backlogs,
	sr.new_backlogs,
	sr.cleared_backlogs,
	sr.sgpa,
	sr.cgpa,
	sr.result_status,
	sr.is_promoted
FROM public.semester_results sr
LEFT JOIN public.students s ON sr.student_id = s.id
LEFT JOIN public.institutions i ON sr.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON sr.examination_session_id = es.id
LEFT JOIN public.programs p ON sr.program_id = p.id
WHERE sr.total_backlogs > 0
	AND sr.is_active = true
ORDER BY sr.total_backlogs DESC, es.session_code, p.program_code, sr.semester;

-- Pending Publication View
CREATE OR REPLACE VIEW public.semester_results_pending_publication AS
SELECT
	sr.id,
	i.institution_code,
	es.session_code,
	p.program_code,
	sr.semester,
	COUNT(*) OVER (PARTITION BY sr.examination_session_id, sr.program_id, sr.semester) AS total_students,
	sr.result_declared_date,
	CURRENT_DATE - sr.result_declared_date AS days_since_declaration,
	COUNT(*) FILTER (WHERE sr.is_locked = true) OVER (PARTITION BY sr.examination_session_id, sr.program_id, sr.semester) AS locked_count,
	COUNT(*) FILTER (WHERE sr.is_locked = false) OVER (PARTITION BY sr.examination_session_id, sr.program_id, sr.semester) AS unlocked_count
FROM public.semester_results sr
LEFT JOIN public.institutions i ON sr.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON sr.examination_session_id = es.id
LEFT JOIN public.programs p ON sr.program_id = p.id
WHERE sr.is_published = false
	AND sr.result_declared_date IS NOT NULL
	AND sr.is_active = true
ORDER BY sr.result_declared_date ASC;

-- Rank List View
CREATE OR REPLACE VIEW public.semester_rank_list_view AS
SELECT
	sr.id,
	i.institution_code,
	es.session_code,
	p.program_code,
	sr.semester,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.register_number,
	sr.sgpa,
	sr.cgpa,
	sr.percentage,
	sr.result_class,
	RANK() OVER (
		PARTITION BY sr.institutions_id, sr.examination_session_id, sr.program_id, sr.semester
		ORDER BY sr.cgpa DESC, sr.percentage DESC
	) AS rank,
	sr.total_backlogs
FROM public.semester_results sr
LEFT JOIN public.students s ON sr.student_id = s.id
LEFT JOIN public.institutions i ON sr.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON sr.examination_session_id = es.id
LEFT JOIN public.programs p ON sr.program_id = p.id
WHERE sr.result_status = 'Pass'
	AND sr.is_active = true
ORDER BY
	i.institution_code,
	es.session_code,
	p.program_code,
	sr.semester,
	sr.cgpa DESC,
	sr.percentage DESC;

-- =====================================================
-- 5. CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to calculate semester result from final marks
CREATE OR REPLACE FUNCTION calculate_semester_result(
	p_student_id UUID,
	p_examination_session_id UUID,
	p_semester INT
)
RETURNS UUID AS $$
DECLARE
	v_semester_result_id UUID;
	v_institutions_id UUID;
	v_program_id UUID;
	v_total_credits_registered INT;
	v_total_credits_earned INT;
	v_total_credit_points DECIMAL(8,2);
	v_sgpa DECIMAL(4,2);
	v_cumulative_credits INT;
	v_cumulative_points DECIMAL(8,2);
	v_cgpa DECIMAL(4,2);
	v_total_marks DECIMAL(10,2);
	v_max_marks DECIMAL(10,2);
	v_percentage DECIMAL(5,2);
	v_total_backlogs INT;
BEGIN
	-- Get basic info from exam registration
	SELECT
		er.institutions_id,
		er.program_id
	INTO v_institutions_id, v_program_id
	FROM public.exam_registrations er
	WHERE er.student_id = p_student_id
		AND er.examination_session_id = p_examination_session_id
	LIMIT 1;

	-- Calculate from final marks for this semester
	SELECT
		COALESCE(SUM(c.credit), 0)::INT,
		COALESCE(SUM(CASE WHEN fm.is_pass = true THEN c.credit ELSE 0 END), 0)::INT,
		COALESCE(SUM(fm.grade_points * c.credit), 0),
		COALESCE(SUM(fm.total_marks_obtained), 0),
		COALESCE(SUM(fm.total_marks_maximum), 0),
		COALESCE(COUNT(*) FILTER (WHERE fm.is_pass = false), 0)::INT
	INTO
		v_total_credits_registered,
		v_total_credits_earned,
		v_total_credit_points,
		v_total_marks,
		v_max_marks,
		v_total_backlogs
	FROM public.final_marks fm
	LEFT JOIN public.courses c ON fm.course_id = c.id
	LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
	WHERE fm.student_id = p_student_id
		AND fm.examination_session_id = p_examination_session_id
		AND co.semester = p_semester
		AND fm.result_status = 'Published'
		AND fm.is_active = true;

	-- Calculate SGPA
	IF v_total_credits_registered > 0 THEN
		v_sgpa = ROUND(v_total_credit_points / v_total_credits_registered, 2);
	ELSE
		v_sgpa = 0;
	END IF;

	-- Calculate cumulative values for CGPA
	SELECT
		COALESCE(SUM(c.credit), 0)::INT,
		COALESCE(SUM(fm.grade_points * c.credit), 0)
	INTO v_cumulative_credits, v_cumulative_points
	FROM public.final_marks fm
	LEFT JOIN public.courses c ON fm.course_id = c.id
	LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id
	WHERE fm.student_id = p_student_id
		AND co.semester <= p_semester
		AND fm.result_status = 'Published'
		AND fm.is_active = true
		AND fm.is_pass = true;

	-- Calculate CGPA
	IF v_cumulative_credits > 0 THEN
		v_cgpa = ROUND(v_cumulative_points / v_cumulative_credits, 2);
	ELSE
		v_cgpa = 0;
	END IF;

	-- Calculate percentage
	IF v_max_marks > 0 THEN
		v_percentage = ROUND((v_total_marks / v_max_marks) * 100, 2);
	ELSE
		v_percentage = 0;
	END IF;

	-- Insert or update semester result
	INSERT INTO public.semester_results (
		institutions_id,
		student_id,
		examination_session_id,
		program_id,
		semester,
		total_credits_registered,
		total_credits_earned,
		total_credit_points,
		sgpa,
		cgpa,
		percentage,
		total_backlogs,
		result_status,
		created_by
	) VALUES (
		v_institutions_id,
		p_student_id,
		p_examination_session_id,
		v_program_id,
		p_semester,
		v_total_credits_registered,
		v_total_credits_earned,
		v_total_credit_points,
		v_sgpa,
		v_cgpa,
		v_percentage,
		v_total_backlogs,
		'Pending',
		auth.uid()
	)
	ON CONFLICT (institutions_id, student_id, examination_session_id, semester)
	DO UPDATE SET
		total_credits_registered = EXCLUDED.total_credits_registered,
		total_credits_earned = EXCLUDED.total_credits_earned,
		total_credit_points = EXCLUDED.total_credit_points,
		sgpa = EXCLUDED.sgpa,
		cgpa = EXCLUDED.cgpa,
		percentage = EXCLUDED.percentage,
		total_backlogs = EXCLUDED.total_backlogs,
		updated_by = auth.uid(),
		updated_at = CURRENT_TIMESTAMP
	RETURNING id INTO v_semester_result_id;

	RETURN v_semester_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to declare results
CREATE OR REPLACE FUNCTION declare_semester_results(
	p_semester_result_ids UUID[],
	p_declared_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_declared_by UUID;
	v_updated_count INT;
BEGIN
	v_declared_by := COALESCE(p_declared_by, auth.uid());

	UPDATE public.semester_results
	SET
		result_declared_date = CURRENT_DATE,
		result_declared_by = v_declared_by,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_declared_by
	WHERE id = ANY(p_semester_result_ids)
		AND result_declared_date IS NULL;

	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to publish results
CREATE OR REPLACE FUNCTION publish_semester_results(
	p_semester_result_ids UUID[],
	p_published_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_published_by UUID;
	v_updated_count INT;
BEGIN
	v_published_by := COALESCE(p_published_by, auth.uid());

	UPDATE public.semester_results
	SET
		is_published = true,
		published_date = CURRENT_DATE,
		published_by = v_published_by,
		is_locked = true,
		locked_by = v_published_by,
		locked_date = CURRENT_DATE,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_published_by
	WHERE id = ANY(p_semester_result_ids)
		AND is_published = false
		AND result_declared_date IS NOT NULL;

	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to withdraw published results
CREATE OR REPLACE FUNCTION withdraw_semester_results(
	p_semester_result_ids UUID[],
	p_withdrawal_reason TEXT
)
RETURNS INT AS $$
DECLARE
	v_updated_count INT;
BEGIN
	UPDATE public.semester_results
	SET
		is_published = false,
		published_date = NULL,
		published_by = NULL,
		result_status = 'Withheld',
		remarks = COALESCE(remarks || E'\n', '') || 'Withdrawal: ' || p_withdrawal_reason,
		is_locked = false,
		locked_by = NULL,
		locked_date = NULL,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = ANY(p_semester_result_ids)
		AND is_published = true;

	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to lock semester results
CREATE OR REPLACE FUNCTION lock_semester_results(
	p_semester_result_id UUID,
	p_locked_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_locked_by UUID;
BEGIN
	v_locked_by := COALESCE(p_locked_by, auth.uid());

	UPDATE public.semester_results
	SET
		is_locked = true,
		locked_by = v_locked_by,
		locked_date = CURRENT_DATE,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_locked_by
	WHERE id = p_semester_result_id;

	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unlock semester results
CREATE OR REPLACE FUNCTION unlock_semester_results(
	p_semester_result_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.semester_results
	SET
		is_locked = false,
		locked_by = NULL,
		locked_date = NULL,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_semester_result_id
		AND is_published = false;

	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get student semester history
CREATE OR REPLACE FUNCTION get_student_semester_history(
	p_student_id UUID
)
RETURNS TABLE (
	semester INT,
	session_code TEXT,
	session_name TEXT,
	sgpa NUMERIC,
	cgpa NUMERIC,
	percentage NUMERIC,
	result_class TEXT,
	result_status TEXT,
	total_credits_earned INT,
	total_backlogs INT,
	is_promoted BOOLEAN,
	published_date DATE
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		sr.semester,
		es.session_code::TEXT,
		es.session_name::TEXT,
		sr.sgpa,
		sr.cgpa,
		sr.percentage,
		sr.result_class::TEXT,
		sr.result_status::TEXT,
		sr.total_credits_earned,
		sr.total_backlogs,
		sr.is_promoted,
		sr.published_date
	FROM public.semester_results sr
	LEFT JOIN public.examination_sessions es ON sr.examination_session_id = es.id
	WHERE sr.student_id = p_student_id
		AND sr.is_active = true
		AND sr.is_published = true
	ORDER BY sr.semester;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get semester statistics
CREATE OR REPLACE FUNCTION get_semester_statistics(
	p_examination_session_id UUID DEFAULT NULL,
	p_program_id UUID DEFAULT NULL,
	p_semester INT DEFAULT NULL
)
RETURNS TABLE (
	total_students BIGINT,
	passed_students BIGINT,
	failed_students BIGINT,
	distinction_students BIGINT,
	first_class_students BIGINT,
	students_with_backlogs BIGINT,
	total_backlogs BIGINT,
	promoted_students BIGINT,
	pass_percentage NUMERIC,
	average_sgpa NUMERIC,
	average_cgpa NUMERIC,
	average_percentage NUMERIC
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		COUNT(*) AS total_students,
		COUNT(*) FILTER (WHERE sr.result_status = 'Pass') AS passed_students,
		COUNT(*) FILTER (WHERE sr.result_status = 'Fail') AS failed_students,
		COUNT(*) FILTER (WHERE sr.is_distinction = true) AS distinction_students,
		COUNT(*) FILTER (WHERE sr.is_first_class = true) AS first_class_students,
		COUNT(*) FILTER (WHERE sr.total_backlogs > 0) AS students_with_backlogs,
		COALESCE(SUM(sr.total_backlogs), 0) AS total_backlogs,
		COUNT(*) FILTER (WHERE sr.is_promoted = true) AS promoted_students,
		ROUND((COUNT(*) FILTER (WHERE sr.result_status = 'Pass')::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 2) AS pass_percentage,
		ROUND(AVG(sr.sgpa), 2) AS average_sgpa,
		ROUND(AVG(sr.cgpa), 2) AS average_cgpa,
		ROUND(AVG(sr.percentage), 2) AS average_percentage
	FROM public.semester_results sr
	WHERE sr.is_active = true
		AND (p_examination_session_id IS NULL OR sr.examination_session_id = p_examination_session_id)
		AND (p_program_id IS NULL OR sr.program_id = p_program_id)
		AND (p_semester IS NULL OR sr.semester = p_semester);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate class rank
CREATE OR REPLACE FUNCTION get_semester_class_rank(
	p_examination_session_id UUID,
	p_program_id UUID,
	p_semester INT
)
RETURNS TABLE (
	student_id UUID,
	student_name TEXT,
	register_number TEXT,
	sgpa NUMERIC,
	cgpa NUMERIC,
	percentage NUMERIC,
	rank BIGINT
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		sr.student_id,
		CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))::TEXT AS student_name,
		s.register_number::TEXT,
		sr.sgpa,
		sr.cgpa,
		sr.percentage,
		RANK() OVER (ORDER BY sr.cgpa DESC, sr.percentage DESC) AS rank
	FROM public.semester_results sr
	LEFT JOIN public.students s ON sr.student_id = s.id
	WHERE sr.examination_session_id = p_examination_session_id
		AND sr.program_id = p_program_id
		AND sr.semester = p_semester
		AND sr.result_status = 'Pass'
		AND sr.is_active = true
	ORDER BY rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk update promotion status
CREATE OR REPLACE FUNCTION bulk_update_promotion_status(
	p_semester_result_ids UUID[],
	p_is_promoted BOOLEAN,
	p_promotion_remarks TEXT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_updated_count INT;
BEGIN
	UPDATE public.semester_results
	SET
		is_promoted = p_is_promoted,
		promotion_remarks = COALESCE(p_promotion_remarks, promotion_remarks),
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = ANY(p_semester_result_ids)
		AND is_locked = false;

	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Function to recalculate CGPA for all semesters
-- =====================================================
-- Purpose: Recalculate CGPA for all semesters after a backlog is cleared
-- This ensures CGPA stays accurate when grades change
-- Uses student_grades table as the source of truth
-- =====================================================
CREATE OR REPLACE FUNCTION recalculate_student_cgpa(
	p_student_id UUID,
	p_from_semester INT DEFAULT 1
)
RETURNS TABLE (
	semester INT,
	old_cgpa DECIMAL,
	new_cgpa DECIMAL,
	credits_earned INT,
	credit_points DECIMAL
) AS $$
DECLARE
	v_semester RECORD;
	v_old_cgpa DECIMAL;
	v_new_cgpa DECIMAL;
	v_cumulative_credits DECIMAL := 0;
	v_cumulative_points DECIMAL := 0;
BEGIN
	-- Loop through each semester result for the student
	FOR v_semester IN
		SELECT
			sr.id,
			sr.semester,
			sr.cgpa AS current_cgpa
		FROM public.semester_results sr
		WHERE sr.student_id = p_student_id
			AND sr.semester >= p_from_semester
			AND sr.is_active = true
		ORDER BY sr.semester
	LOOP
		v_old_cgpa := v_semester.current_cgpa;

		-- Calculate cumulative credits and points from student_grades
		-- This uses student_grades as the source of truth
		SELECT
			COALESCE(SUM(sg.credits), 0),
			COALESCE(SUM(sg.credit_points), 0)
		INTO v_cumulative_credits, v_cumulative_points
		FROM public.student_grades sg
		WHERE sg.student_id = p_student_id
			AND sg.semester <= v_semester.semester
			AND sg.is_pass = true
			AND sg.exclude_from_cgpa = false
			AND sg.is_published = true
			AND sg.is_active = true;

		-- Calculate new CGPA
		IF v_cumulative_credits > 0 THEN
			v_new_cgpa := ROUND(v_cumulative_points / v_cumulative_credits, 2);
		ELSE
			v_new_cgpa := 0;
		END IF;

		-- Update the semester result with new CGPA
		UPDATE public.semester_results
		SET
			cgpa = v_new_cgpa,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = v_semester.id
			AND is_locked = false;

		-- Return the changes
		semester := v_semester.semester;
		old_cgpa := v_old_cgpa;
		new_cgpa := v_new_cgpa;
		credits_earned := v_cumulative_credits::INT;
		credit_points := v_cumulative_points;
		RETURN NEXT;
	END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.semester_results ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. CREATE RLS POLICIES
-- =====================================================

-- Policy: Allow authenticated users to read semester results
CREATE POLICY "Authenticated users can read semester results"
	ON public.semester_results
	FOR SELECT
	TO authenticated
	USING (true);

-- Policy: Allow students to read their own published results
CREATE POLICY "Students can read their own published results"
	ON public.semester_results
	FOR SELECT
	TO authenticated
	USING (
		student_id = auth.uid() AND is_published = true
	);

-- Policy: Allow authenticated users to insert semester results
CREATE POLICY "Authenticated users can insert semester results"
	ON public.semester_results
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

-- Policy: Allow users to update unlocked semester results
CREATE POLICY "Users can update unlocked semester results"
	ON public.semester_results
	FOR UPDATE
	TO authenticated
	USING (is_locked = false AND is_published = false)
	WITH CHECK (is_locked = false AND is_published = false);

-- Policy: Allow admins to update all semester results
CREATE POLICY "Admins can update all semester results"
	ON public.semester_results
	FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM public.user_roles ur
			JOIN public.roles r ON ur.role_id = r.id
			WHERE ur.user_id = auth.uid()
				AND r.name IN ('admin', 'super_admin', 'coe_admin')
				AND ur.is_active = true
		)
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM public.user_roles ur
			JOIN public.roles r ON ur.role_id = r.id
			WHERE ur.user_id = auth.uid()
				AND r.name IN ('admin', 'super_admin', 'coe_admin')
				AND ur.is_active = true
		)
	);

-- Policy: Allow admins to delete semester results
CREATE POLICY "Admins can delete semester results"
	ON public.semester_results
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
CREATE POLICY "Service role can manage all semester results"
	ON public.semester_results
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION calculate_semester_result(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION declare_semester_results(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION publish_semester_results(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION withdraw_semester_results(UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION lock_semester_results(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_semester_results(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_semester_history(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_semester_statistics(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_semester_class_rank(UUID, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_update_promotion_status(UUID[], BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_student_cgpa(UUID, INT) TO authenticated;

GRANT EXECUTE ON FUNCTION calculate_semester_result(UUID, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION declare_semester_results(UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION publish_semester_results(UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION withdraw_semester_results(UUID[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION lock_semester_results(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION unlock_semester_results(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_student_semester_history(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_semester_statistics(UUID, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION get_semester_class_rank(UUID, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_update_promotion_status(UUID[], BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION recalculate_student_cgpa(UUID, INT) TO service_role;

-- =====================================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.semester_results IS 'Tracks semester-wise consolidated results including SGPA, CGPA, result status, and promotion tracking';
COMMENT ON VIEW public.semester_results_detailed_view IS 'Denormalized view of semester results with all related entity information';
COMMENT ON VIEW public.semester_results_summary_view IS 'Statistical summary of semester results grouped by institution, session, program, and semester';
COMMENT ON VIEW public.student_semester_results_view IS 'Published student results accessible to students';
COMMENT ON VIEW public.cgpa_distribution_view IS 'Dynamic CGPA distribution using grade_system table with UG/PG support and regulation-specific grades';
COMMENT ON VIEW public.semester_failed_students_view IS 'View of failed students with failure analysis';
COMMENT ON VIEW public.students_with_backlogs_view IS 'View of students with backlogs';
COMMENT ON VIEW public.semester_results_pending_publication IS 'View of results pending publication';
COMMENT ON VIEW public.semester_rank_list_view IS 'Rank list view for semester results';

COMMENT ON COLUMN public.semester_results.sgpa IS 'Semester Grade Point Average (0-10 scale)';
COMMENT ON COLUMN public.semester_results.cgpa IS 'Cumulative Grade Point Average (0-10 scale)';
COMMENT ON COLUMN public.semester_results.percentage IS 'Overall percentage of marks obtained';
COMMENT ON COLUMN public.semester_results.result_class IS 'Result classification: Distinction, First Class, Second Class, Pass, Fail';
COMMENT ON COLUMN public.semester_results.result_status IS 'Current result status: Pending, Pass, Fail, Incomplete, Withheld, Under Review';
COMMENT ON COLUMN public.semester_results.total_backlogs IS 'Total number of subjects with backlogs';
COMMENT ON COLUMN public.semester_results.is_promoted IS 'Indicates if student is promoted to next semester';
COMMENT ON COLUMN public.semester_results.is_locked IS 'Prevents modification when locked';
COMMENT ON COLUMN public.semester_results.is_published IS 'Indicates if results are published to students';

COMMENT ON FUNCTION calculate_semester_result(UUID, UUID, INT) IS 'Calculates and stores semester result from final marks';
COMMENT ON FUNCTION declare_semester_results(UUID[], UUID) IS 'Declares results with declaration date';
COMMENT ON FUNCTION publish_semester_results(UUID[], UUID) IS 'Publishes results and locks them from modification';
COMMENT ON FUNCTION withdraw_semester_results(UUID[], TEXT) IS 'Withdraws published results with reason';
COMMENT ON FUNCTION lock_semester_results(UUID, UUID) IS 'Locks semester results to prevent modifications';
COMMENT ON FUNCTION unlock_semester_results(UUID) IS 'Unlocks semester results for modifications (only if not published)';
COMMENT ON FUNCTION get_student_semester_history(UUID) IS 'Retrieves complete semester history for a student';
COMMENT ON FUNCTION get_semester_statistics(UUID, UUID, INT) IS 'Returns statistical summary of semester results';
COMMENT ON FUNCTION get_semester_class_rank(UUID, UUID, INT) IS 'Calculates class ranking based on CGPA and percentage';
COMMENT ON FUNCTION bulk_update_promotion_status(UUID[], BOOLEAN, TEXT) IS 'Bulk updates promotion status for multiple students';
COMMENT ON FUNCTION recalculate_student_cgpa(UUID, INT) IS 'Recalculates CGPA for all semesters from student_grades table. Use after backlog clearance.';

-- =====================================================
-- 10. ENABLE REALTIME (OPTIONAL)
-- =====================================================

-- Enable realtime for semester_results table if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE semester_results;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
