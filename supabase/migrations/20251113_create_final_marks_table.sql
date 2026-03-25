-- =====================================================
-- Final Marks Table with RLS, Functions, and Views
-- =====================================================
-- Date: 2025-11-13
-- Purpose: Track final consolidated marks combining internal and external assessments
-- =====================================================

-- =====================================================
-- 1. CREATE FINAL MARKS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.final_marks (
	id UUID NOT NULL DEFAULT gen_random_uuid(),
	
	-- Core References
	institutions_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	exam_registration_id UUID NOT NULL,
	course_offering_id UUID NOT NULL,
	program_id UUID NOT NULL,
	course_id UUID NOT NULL,
	student_id UUID NOT NULL,
	
	-- Marks References
	internal_marks_id UUID,
	marks_entry_id UUID,
	
	-- Internal Assessment Marks
	internal_marks_obtained DECIMAL(5,2) NOT NULL DEFAULT 0,
	internal_marks_maximum DECIMAL(5,2) NOT NULL,
	internal_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
		CASE 
			WHEN internal_marks_maximum > 0 THEN ROUND((internal_marks_obtained / internal_marks_maximum) * 100, 2)
			ELSE 0
		END
	) STORED,
	
	-- External Assessment Marks
	external_marks_obtained DECIMAL(5,2) NOT NULL DEFAULT 0,
	external_marks_maximum DECIMAL(5,2) NOT NULL,
	external_percentage DECIMAL(5,2) GENERATED ALWAYS AS (
		CASE 
			WHEN external_marks_maximum > 0 THEN ROUND((external_marks_obtained / external_marks_maximum) * 100, 2)
			ELSE 0
		END
	) STORED,
	
	-- Total Marks
	total_marks_obtained DECIMAL(5,2) NOT NULL,
	total_marks_maximum DECIMAL(5,2) NOT NULL,
	percentage DECIMAL(5,2) NOT NULL,
	
	-- Grace Marks
	grace_marks DECIMAL(5,2) DEFAULT 0,
	grace_marks_reason TEXT,
	grace_marks_approved_by UUID,
	grace_marks_approved_date DATE,
	
	-- Grade Calculation
	letter_grade VARCHAR(5),
	grade_points DECIMAL(3,2),
	grade_description VARCHAR(50),
	
	-- Pass/Fail Status
	is_pass BOOLEAN NOT NULL,
	is_distinction BOOLEAN DEFAULT false,
	is_first_class BOOLEAN DEFAULT false,
	pass_status VARCHAR(50), -- Pass, Fail, Reappear, Absent, Withheld
	
	-- Moderation
	is_moderated BOOLEAN DEFAULT false,
	moderated_by UUID,
	moderation_date DATE,
	marks_before_moderation DECIMAL(5,2),
	moderation_remarks TEXT,
	
	-- Result Status
	result_status VARCHAR(50) DEFAULT 'Pending', -- Pending, Published, Withheld, Cancelled
	published_date DATE,
	published_by UUID,
	
	-- Lock Mechanism
	is_locked BOOLEAN DEFAULT false,
	locked_by UUID,
	locked_date DATE,
	
	-- Calculation Metadata
	calculated_by UUID,
	calculated_at TIMESTAMP WITH TIME ZONE,
	calculation_notes TEXT,
	
	-- Additional Metadata
	remarks TEXT,
	is_active BOOLEAN DEFAULT true,
	
	-- Audit Fields
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID,
	updated_by UUID,
	
	-- Primary Key
	CONSTRAINT final_marks_pkey PRIMARY KEY (id),
	
	-- Foreign Key Constraints
	CONSTRAINT final_marks_institutions_id_fkey 
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE CASCADE,
	CONSTRAINT final_marks_examination_session_id_fkey 
		FOREIGN KEY (examination_session_id) REFERENCES examination_sessions(id) ON DELETE CASCADE,
	CONSTRAINT final_marks_exam_registration_id_fkey 
		FOREIGN KEY (exam_registration_id) REFERENCES exam_registrations(id) ON DELETE CASCADE,
	CONSTRAINT final_marks_course_offering_id_fkey 
		FOREIGN KEY (course_offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE,
	CONSTRAINT final_marks_program_id_fkey 
		FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
	CONSTRAINT final_marks_course_id_fkey 
		FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
	CONSTRAINT final_marks_student_id_fkey 
		FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
	CONSTRAINT final_marks_internal_marks_id_fkey 
		FOREIGN KEY (internal_marks_id) REFERENCES internal_marks(id) ON DELETE SET NULL,
	CONSTRAINT final_marks_marks_entry_id_fkey 
		FOREIGN KEY (marks_entry_id) REFERENCES marks_entry(id) ON DELETE SET NULL,
	CONSTRAINT final_marks_grace_marks_approved_by_fkey 
		FOREIGN KEY (grace_marks_approved_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT final_marks_moderated_by_fkey 
		FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT final_marks_published_by_fkey 
		FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT final_marks_locked_by_fkey 
		FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT final_marks_calculated_by_fkey 
		FOREIGN KEY (calculated_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT final_marks_created_by_fkey 
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT final_marks_updated_by_fkey 
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
	
	-- Unique Constraints
	CONSTRAINT unique_final_marks 
		UNIQUE(institutions_id, exam_registration_id, course_offering_id),
	CONSTRAINT unique_student_course_session 
		UNIQUE(student_id, course_id, examination_session_id),
	
	-- Check Constraints
	CONSTRAINT check_marks_non_negative 
		CHECK (
			internal_marks_obtained >= 0 AND
			external_marks_obtained >= 0 AND
			total_marks_obtained >= 0 AND
			grace_marks >= 0
		),
	CONSTRAINT check_marks_within_maximum 
		CHECK (
			internal_marks_obtained <= internal_marks_maximum AND
			external_marks_obtained <= external_marks_maximum AND
			total_marks_obtained <= total_marks_maximum + grace_marks
		),
	CONSTRAINT check_maximum_marks_positive 
		CHECK (
			internal_marks_maximum >= 0 AND
			external_marks_maximum >= 0 AND
			total_marks_maximum > 0
		),
	CONSTRAINT check_percentage_valid 
		CHECK (percentage >= 0 AND percentage <= 100),
	CONSTRAINT check_grade_points_valid 
		CHECK (grade_points IS NULL OR (grade_points >= 0 AND grade_points <= 10)),
	CONSTRAINT check_valid_pass_status 
		CHECK (pass_status IS NULL OR pass_status IN ('Pass', 'Fail', 'Reappear', 'Absent', 'Withheld', 'Expelled')),
	CONSTRAINT check_valid_result_status 
		CHECK (result_status IN ('Pending', 'Published', 'Withheld', 'Cancelled', 'Under Review')),
	CONSTRAINT check_grace_marks_approval 
		CHECK (
			(grace_marks = 0) OR
			(grace_marks > 0 AND grace_marks_approved_by IS NOT NULL)
		),
	CONSTRAINT check_moderation_consistency 
		CHECK (
			(is_moderated = false AND moderated_by IS NULL) OR
			(is_moderated = true AND moderated_by IS NOT NULL)
		),
	CONSTRAINT check_lock_consistency 
		CHECK (
			(is_locked = false AND locked_by IS NULL) OR
			(is_locked = true AND locked_by IS NOT NULL)
		),
	CONSTRAINT check_total_calculation 
		CHECK (
			ABS(total_marks_obtained - (internal_marks_obtained + external_marks_obtained + grace_marks)) < 0.01
		)
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_final_marks_institutions_id 
	ON public.final_marks(institutions_id);
CREATE INDEX IF NOT EXISTS idx_final_marks_examination_session_id 
	ON public.final_marks(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_final_marks_exam_registration_id 
	ON public.final_marks(exam_registration_id);
CREATE INDEX IF NOT EXISTS idx_final_marks_course_offering_id 
	ON public.final_marks(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_final_marks_program_id 
	ON public.final_marks(program_id);
CREATE INDEX IF NOT EXISTS idx_final_marks_course_id 
	ON public.final_marks(course_id);
CREATE INDEX IF NOT EXISTS idx_final_marks_student_id 
	ON public.final_marks(student_id);
CREATE INDEX IF NOT EXISTS idx_final_marks_internal_marks_id 
	ON public.final_marks(internal_marks_id) WHERE internal_marks_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_marks_marks_entry_id 
	ON public.final_marks(marks_entry_id) WHERE marks_entry_id IS NOT NULL;

-- Status and Boolean Indexes
CREATE INDEX IF NOT EXISTS idx_final_marks_is_pass 
	ON public.final_marks(is_pass);
CREATE INDEX IF NOT EXISTS idx_final_marks_is_distinction 
	ON public.final_marks(is_distinction);
CREATE INDEX IF NOT EXISTS idx_final_marks_is_locked 
	ON public.final_marks(is_locked);
CREATE INDEX IF NOT EXISTS idx_final_marks_is_moderated 
	ON public.final_marks(is_moderated);
CREATE INDEX IF NOT EXISTS idx_final_marks_is_active 
	ON public.final_marks(is_active);
CREATE INDEX IF NOT EXISTS idx_final_marks_pass_status 
	ON public.final_marks(pass_status) WHERE pass_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_marks_result_status 
	ON public.final_marks(result_status);

-- Grade Indexes
CREATE INDEX IF NOT EXISTS idx_final_marks_letter_grade 
	ON public.final_marks(letter_grade) WHERE letter_grade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_marks_grade_points 
	ON public.final_marks(grade_points) WHERE grade_points IS NOT NULL;

-- User Tracking Indexes
CREATE INDEX IF NOT EXISTS idx_final_marks_calculated_by 
	ON public.final_marks(calculated_by) WHERE calculated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_marks_moderated_by 
	ON public.final_marks(moderated_by) WHERE moderated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_marks_published_by 
	ON public.final_marks(published_by) WHERE published_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_marks_locked_by 
	ON public.final_marks(locked_by) WHERE locked_by IS NOT NULL;

-- Date Indexes
CREATE INDEX IF NOT EXISTS idx_final_marks_calculated_at 
	ON public.final_marks(calculated_at) WHERE calculated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_marks_published_date 
	ON public.final_marks(published_date) WHERE published_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_marks_created_at 
	ON public.final_marks(created_at DESC);

-- Marks Range Indexes
CREATE INDEX IF NOT EXISTS idx_final_marks_percentage 
	ON public.final_marks(percentage);
CREATE INDEX IF NOT EXISTS idx_final_marks_total_marks 
	ON public.final_marks(total_marks_obtained);
CREATE INDEX IF NOT EXISTS idx_final_marks_grace_marks 
	ON public.final_marks(grace_marks) WHERE grace_marks > 0;

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS idx_final_marks_session_status 
	ON public.final_marks(examination_session_id, result_status);
CREATE INDEX IF NOT EXISTS idx_final_marks_session_pass 
	ON public.final_marks(examination_session_id, is_pass);
CREATE INDEX IF NOT EXISTS idx_final_marks_program_pass 
	ON public.final_marks(program_id, is_pass);
CREATE INDEX IF NOT EXISTS idx_final_marks_student_session 
	ON public.final_marks(student_id, examination_session_id);
CREATE INDEX IF NOT EXISTS idx_final_marks_course_pass 
	ON public.final_marks(course_id, is_pass);
CREATE INDEX IF NOT EXISTS idx_final_marks_institution_session_status 
	ON public.final_marks(institutions_id, examination_session_id, result_status);

-- Partial Indexes for Specific Queries
CREATE INDEX IF NOT EXISTS idx_final_marks_published 
	ON public.final_marks(id, published_date, student_id) 
	WHERE result_status = 'Published';
CREATE INDEX IF NOT EXISTS idx_final_marks_pending_publication 
	ON public.final_marks(id, calculated_at) 
	WHERE result_status = 'Pending' AND calculated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_final_marks_failed_students 
	ON public.final_marks(id, student_id, course_id) 
	WHERE is_pass = false;
CREATE INDEX IF NOT EXISTS idx_final_marks_distinction 
	ON public.final_marks(id, student_id, percentage) 
	WHERE is_distinction = true;
CREATE INDEX IF NOT EXISTS idx_final_marks_with_grace 
	ON public.final_marks(id, student_id, grace_marks) 
	WHERE grace_marks > 0;
CREATE INDEX IF NOT EXISTS idx_final_marks_active_unlocked 
	ON public.final_marks(id, result_status, calculated_at) 
	WHERE is_active = true AND is_locked = false;

-- =====================================================
-- 3. CREATE TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_final_marks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_final_marks_updated_at
	BEFORE UPDATE ON public.final_marks
	FOR EACH ROW
	EXECUTE FUNCTION update_final_marks_updated_at();

-- Auto-calculate total marks
CREATE OR REPLACE FUNCTION auto_calculate_final_total_marks()
RETURNS TRIGGER AS $$
BEGIN
	-- Auto-calculate total if component marks change
	IF NEW.internal_marks_obtained != OLD.internal_marks_obtained OR
	   NEW.external_marks_obtained != OLD.external_marks_obtained OR
	   NEW.grace_marks != OLD.grace_marks THEN
		
		NEW.total_marks_obtained = NEW.internal_marks_obtained + 
									NEW.external_marks_obtained + 
									NEW.grace_marks;
		
		-- Recalculate percentage
		IF NEW.total_marks_maximum > 0 THEN
			NEW.percentage = ROUND((NEW.total_marks_obtained / NEW.total_marks_maximum) * 100, 2);
		END IF;
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_calculate_final_total_marks
	BEFORE UPDATE ON public.final_marks
	FOR EACH ROW
	EXECUTE FUNCTION auto_calculate_final_total_marks();

-- Calculate on insert
CREATE OR REPLACE FUNCTION calculate_final_marks_on_insert()
RETURNS TRIGGER AS $$
BEGIN
	-- Calculate total marks
	NEW.total_marks_obtained = NEW.internal_marks_obtained + 
								NEW.external_marks_obtained + 
								COALESCE(NEW.grace_marks, 0);
	
	-- Calculate percentage
	IF NEW.total_marks_maximum > 0 THEN
		NEW.percentage = ROUND((NEW.total_marks_obtained / NEW.total_marks_maximum) * 100, 2);
	END IF;
	
	-- Set calculated_at if not set
	IF NEW.calculated_at IS NULL THEN
		NEW.calculated_at = CURRENT_TIMESTAMP;
	END IF;
	
	-- Set calculated_by if not set
	IF NEW.calculated_by IS NULL THEN
		NEW.calculated_by = auth.uid();
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_final_marks_on_insert
	BEFORE INSERT ON public.final_marks
	FOR EACH ROW
	EXECUTE FUNCTION calculate_final_marks_on_insert();

-- Auto-determine pass/fail status
CREATE OR REPLACE FUNCTION auto_determine_pass_status()
RETURNS TRIGGER AS $$
DECLARE
	v_min_passing_percentage DECIMAL(5,2) := 50.0;
	v_min_internal_percentage DECIMAL(5,2) := 40.0;
	v_min_external_percentage DECIMAL(5,2) := 40.0;
BEGIN
	-- Determine pass status based on marks
	-- This is a basic implementation - customize based on your requirements
	IF NEW.percentage >= v_min_passing_percentage AND
	   NEW.internal_percentage >= v_min_internal_percentage AND
	   NEW.external_percentage >= v_min_external_percentage THEN
		NEW.is_pass = true;
		NEW.pass_status = 'Pass';
		
		-- Check for distinction (>=75%)
		IF NEW.percentage >= 75 THEN
			NEW.is_distinction = true;
		END IF;
		
		-- Check for first class (>=60%)
		IF NEW.percentage >= 60 THEN
			NEW.is_first_class = true;
		END IF;
	ELSE
		NEW.is_pass = false;
		NEW.pass_status = 'Fail';
		NEW.is_distinction = false;
		NEW.is_first_class = false;
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_determine_pass_status
	BEFORE INSERT OR UPDATE ON public.final_marks
	FOR EACH ROW
	WHEN (NEW.percentage IS NOT NULL)
	EXECUTE FUNCTION auto_determine_pass_status();

-- Auto-assign letter grade
CREATE OR REPLACE FUNCTION auto_assign_letter_grade()
RETURNS TRIGGER AS $$
BEGIN
	-- Assign letter grade based on percentage
	-- Customize this based on your grading system
	IF NEW.percentage >= 90 THEN
		NEW.letter_grade = 'O';
		NEW.grade_points = 10.0;
		NEW.grade_description = 'Outstanding';
	ELSIF NEW.percentage >= 80 THEN
		NEW.letter_grade = 'A+';
		NEW.grade_points = 9.0;
		NEW.grade_description = 'Excellent';
	ELSIF NEW.percentage >= 70 THEN
		NEW.letter_grade = 'A';
		NEW.grade_points = 8.0;
		NEW.grade_description = 'Very Good';
	ELSIF NEW.percentage >= 60 THEN
		NEW.letter_grade = 'B+';
		NEW.grade_points = 7.0;
		NEW.grade_description = 'Good';
	ELSIF NEW.percentage >= 50 THEN
		NEW.letter_grade = 'B';
		NEW.grade_points = 6.0;
		NEW.grade_description = 'Above Average';
	ELSIF NEW.percentage >= 40 THEN
		NEW.letter_grade = 'C';
		NEW.grade_points = 5.0;
		NEW.grade_description = 'Average';
	ELSE
		NEW.letter_grade = 'RA';
		NEW.grade_points = 0.0;
		NEW.grade_description = 'Reappear';
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_assign_letter_grade
	BEFORE INSERT OR UPDATE ON public.final_marks
	FOR EACH ROW
	WHEN (NEW.percentage IS NOT NULL)
	EXECUTE FUNCTION auto_assign_letter_grade();

-- Auto-populate lock details
CREATE OR REPLACE FUNCTION auto_populate_final_marks_lock()
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

CREATE TRIGGER trigger_auto_populate_final_marks_lock
	BEFORE UPDATE ON public.final_marks
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_final_marks_lock();

-- Prevent modification of locked marks
CREATE OR REPLACE FUNCTION prevent_locked_final_marks_modification()
RETURNS TRIGGER AS $$
BEGIN
	IF OLD.is_locked = true AND (
		NEW.internal_marks_obtained != OLD.internal_marks_obtained OR
		NEW.external_marks_obtained != OLD.external_marks_obtained OR
		NEW.grace_marks != OLD.grace_marks OR
		NEW.total_marks_obtained != OLD.total_marks_obtained
	) THEN
		RAISE EXCEPTION 'Cannot modify locked final marks. Unlock first.';
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_locked_final_marks_modification
	BEFORE UPDATE ON public.final_marks
	FOR EACH ROW
	EXECUTE FUNCTION prevent_locked_final_marks_modification();

-- Prevent modification of published results
CREATE OR REPLACE FUNCTION prevent_published_marks_modification()
RETURNS TRIGGER AS $$
BEGIN
	IF OLD.result_status = 'Published' AND (
		NEW.internal_marks_obtained != OLD.internal_marks_obtained OR
		NEW.external_marks_obtained != OLD.external_marks_obtained OR
		NEW.total_marks_obtained != OLD.total_marks_obtained
	) THEN
		RAISE EXCEPTION 'Cannot modify published results. Withdraw publication first.';
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_published_marks_modification
	BEFORE UPDATE ON public.final_marks
	FOR EACH ROW
	EXECUTE FUNCTION prevent_published_marks_modification();

-- =====================================================
-- 4. CREATE VIEWS
-- =====================================================

-- Detailed Final Marks View with all related data
CREATE OR REPLACE VIEW public.final_marks_detailed_view AS
SELECT
	-- Final Marks Details
	fm.id,
	
	-- Marks Breakdown
	fm.internal_marks_obtained,
	fm.internal_marks_maximum,
	fm.internal_percentage,
	fm.external_marks_obtained,
	fm.external_marks_maximum,
	fm.external_percentage,
	fm.grace_marks,
	fm.grace_marks_reason,
	fm.total_marks_obtained,
	fm.total_marks_maximum,
	fm.percentage,
	
	-- Grade Details
	fm.letter_grade,
	fm.grade_points,
	fm.grade_description,
	
	-- Status
	fm.is_pass,
	fm.is_distinction,
	fm.is_first_class,
	fm.pass_status,
	fm.result_status,
	
	-- Moderation
	fm.is_moderated,
	fm.moderated_by,
	fm.moderation_date,
	mbu.full_name AS moderated_by_name,
	fm.marks_before_moderation,
	fm.moderation_remarks,
	
	-- Lock Status
	fm.is_locked,
	fm.locked_by,
	fm.locked_date,
	lbu.full_name AS locked_by_name,
	
	-- Publication
	fm.published_date,
	fm.published_by,
	pbu.full_name AS published_by_name,
	
	-- Calculation
	fm.calculated_by,
	fm.calculated_at,
	cbu.full_name AS calculated_by_name,
	fm.calculation_notes,
	fm.remarks,
	
	-- Student Details
	fm.student_id,
	s.full_name AS student_name,
	s.email AS student_email,
	
	-- Exam Registration Details
	fm.exam_registration_id,

	er.stu_register_no,
	
	-- Institution Details
	fm.institutions_id,
	i.institution_code,
	i.name AS institution_name,
	
	-- Examination Session Details
	fm.examination_session_id,
	es.session_code,
	es.session_name,

	
	-- Program Details
	fm.program_id,
	p.program_code,
	p.program_name,
	
	-- Course Details
	fm.course_id,
	c.course_code,
	c.course_name,
	c.credit,
	
	-- Course Offering Details
	fm.course_offering_id,
	co.semester,
	co.section,
	
	-- Reference IDs
	fm.internal_marks_id,
	fm.marks_entry_id,
	
	-- Audit
	fm.is_active,
	fm.created_at,
	fm.updated_at
FROM public.final_marks fm
LEFT JOIN public.users s ON fm.student_id = s.id
LEFT JOIN public.users mbu ON fm.moderated_by = mbu.id
LEFT JOIN public.users lbu ON fm.locked_by = lbu.id
LEFT JOIN public.users pbu ON fm.published_by = pbu.id
LEFT JOIN public.users cbu ON fm.calculated_by = cbu.id
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.programs p ON fm.program_id = p.id
LEFT JOIN public.courses c ON fm.course_id = c.id
LEFT JOIN public.course_offerings co ON fm.course_offering_id = co.id;

-- Final Marks Summary View for reporting
CREATE OR REPLACE VIEW public.final_marks_summary_view AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	c.course_code,
	c.course_name,
	COUNT(*) AS total_students,
	COUNT(*) FILTER (WHERE fm.is_pass = true) AS passed_count,
	COUNT(*) FILTER (WHERE fm.is_pass = false) AS failed_count,
	COUNT(*) FILTER (WHERE fm.is_distinction = true) AS distinction_count,
	COUNT(*) FILTER (WHERE fm.is_first_class = true) AS first_class_count,
	COUNT(*) FILTER (WHERE fm.result_status = 'Published') AS published_count,
	COUNT(*) FILTER (WHERE fm.grace_marks > 0) AS grace_marks_count,
	ROUND(AVG(fm.percentage), 2) AS average_percentage,
	ROUND(AVG(fm.internal_percentage), 2) AS avg_internal_percentage,
	ROUND(AVG(fm.external_percentage), 2) AS avg_external_percentage,
	MIN(fm.percentage) AS min_percentage,
	MAX(fm.percentage) AS max_percentage,
	ROUND(STDDEV(fm.percentage), 2) AS percentage_std_deviation,
	ROUND((COUNT(*) FILTER (WHERE fm.is_pass = true)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2) AS pass_percentage
FROM public.final_marks fm
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.programs p ON fm.program_id = p.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.is_active = true
GROUP BY
	i.institution_code, i.name,
	es.session_code, es.session_name,
	p.program_code, p.program_name,
	c.course_code, c.course_name;

-- Student Results View (Published Only)
CREATE OR REPLACE VIEW public.student_results_view AS
SELECT
	s.id AS student_id,
	s.full_name AS student_name,
	er.stu_register_no,
	i.institution_code,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	c.course_code,
	c.course_name,
	c.credit,
	fm.internal_marks_obtained,
	fm.external_marks_obtained,
	fm.grace_marks,
	fm.total_marks_obtained,
	fm.total_marks_maximum,
	fm.percentage,
	fm.letter_grade,
	fm.grade_points,
	fm.grade_description,
	fm.is_pass,
	fm.is_distinction,
	fm.pass_status,
	fm.published_date
FROM public.final_marks fm
LEFT JOIN public.users s ON fm.student_id = s.id
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.programs p ON fm.program_id = p.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.result_status = 'Published'
	AND fm.is_active = true;

-- Grade Distribution View
CREATE OR REPLACE VIEW public.grade_distribution_view AS
SELECT
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	fm.letter_grade,
	fm.grade_description,
	COUNT(*) AS student_count,
	ROUND((COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER (PARTITION BY i.institution_code, es.session_code, p.program_code, c.course_code)) * 100, 2) AS percentage_of_class
FROM public.final_marks fm
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.programs p ON fm.program_id = p.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.is_active = true
	AND fm.letter_grade IS NOT NULL
GROUP BY
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	fm.letter_grade,
	fm.grade_description
ORDER BY
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	MIN(fm.grade_points) DESC;

-- Failed Students View
CREATE OR REPLACE VIEW public.failed_students_view AS
SELECT
	fm.id,
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	c.course_name,
	s.full_name AS student_name,
	er.stu_register_no,
	fm.internal_marks_obtained,
	fm.internal_percentage,
	fm.external_marks_obtained,
	fm.external_percentage,
	fm.total_marks_obtained,
	fm.percentage,
	fm.pass_status,
	CASE
		WHEN fm.internal_percentage < 40 AND fm.external_percentage < 40 THEN 'Both Components'
		WHEN fm.internal_percentage < 40 THEN 'Internal'
		WHEN fm.external_percentage < 40 THEN 'External'
		ELSE 'Overall'
	END AS failure_reason
FROM public.final_marks fm
LEFT JOIN public.users s ON fm.student_id = s.id
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.programs p ON fm.program_id = p.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.is_pass = false
	AND fm.is_active = true
ORDER BY es.session_code, p.program_code, c.course_code, er.stu_register_no;

-- Student CGPA Calculation View
CREATE OR REPLACE VIEW public.student_cgpa_view AS
SELECT
	fm.student_id,
	s.full_name AS student_name,
	er.stu_register_no,
	fm.examination_session_id,
	es.session_code,
	fm.program_id,
	p.program_code,
	COUNT(*) AS total_courses,
	COUNT(*) FILTER (WHERE fm.is_pass = true) AS passed_courses,
	COUNT(*) FILTER (WHERE fm.is_pass = false) AS failed_courses,
	SUM(c.credit) AS total_credits,
	SUM(CASE WHEN fm.is_pass = true THEN c.credit ELSE 0 END) AS credits_earned,
	ROUND(SUM(fm.grade_points * c.credit) / NULLIF(SUM(c.credit), 0), 2) AS cgpa,
	ROUND(AVG(fm.percentage), 2) AS average_percentage
FROM public.final_marks fm
LEFT JOIN public.users s ON fm.student_id = s.id
LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.programs p ON fm.program_id = p.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.is_active = true
	AND fm.result_status = 'Published'
GROUP BY
	fm.student_id, s.full_name, er.stu_register_no,
	fm.examination_session_id, es.session_code,
	fm.program_id, p.program_code;

-- Pending Publication View
CREATE OR REPLACE VIEW public.pending_publication_view AS
SELECT
	fm.id,
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	COUNT(*) OVER (PARTITION BY fm.course_id) AS total_students,
	fm.calculated_at,
	CURRENT_DATE - DATE(fm.calculated_at) AS days_since_calculation,
	COUNT(*) FILTER (WHERE fm.is_locked = true) OVER (PARTITION BY fm.course_id) AS locked_count,
	COUNT(*) FILTER (WHERE fm.is_locked = false) OVER (PARTITION BY fm.course_id) AS unlocked_count
FROM public.final_marks fm
LEFT JOIN public.institutions i ON fm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON fm.examination_session_id = es.id
LEFT JOIN public.programs p ON fm.program_id = p.id
LEFT JOIN public.courses c ON fm.course_id = c.id
WHERE fm.result_status = 'Pending'
	AND fm.calculated_at IS NOT NULL
	AND fm.is_active = true
ORDER BY fm.calculated_at ASC;

-- =====================================================
-- 5. CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to calculate final marks from internal and external
CREATE OR REPLACE FUNCTION calculate_final_marks(
	p_exam_registration_id UUID,
	p_internal_marks_id UUID DEFAULT NULL,
	p_marks_entry_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
	v_final_marks_id UUID;
	v_internal_marks DECIMAL(5,2);
	v_external_marks DECIMAL(5,2);
	v_internal_max DECIMAL(5,2);
	v_external_max DECIMAL(5,2);
	v_institutions_id UUID;
	v_examination_session_id UUID;
	v_course_offering_id UUID;
	v_program_id UUID;
	v_course_id UUID;
	v_student_id UUID;
BEGIN
	-- Get internal marks
	IF p_internal_marks_id IS NOT NULL THEN
		SELECT 
			total_internal_marks, 
			max_internal_marks,
			institutions_id,
			examination_session_id,
			course_offering_id,
			program_id,
			course_id,
			student_id
		INTO 
			v_internal_marks, 
			v_internal_max,
			v_institutions_id,
			v_examination_session_id,
			v_course_offering_id,
			v_program_id,
			v_course_id,
			v_student_id
		FROM public.internal_marks
		WHERE id = p_internal_marks_id;
	ELSE
		v_internal_marks := 0;
		v_internal_max := 0;
	END IF;
	
	-- Get external marks
	IF p_marks_entry_id IS NOT NULL THEN
		SELECT 
			total_marks_obtained, 
			marks_out_of,
			institutions_id,
			examination_session_id,
			course_id,
			program_id,
			student_id
		INTO 
			v_external_marks, 
			v_external_max,
			v_institutions_id,
			v_examination_session_id,
			v_course_id,
			v_program_id,
			v_student_id
		FROM public.marks_entry me
		LEFT JOIN public.exam_registrations er ON me.exam_registration_id = er.id
		WHERE me.id = p_marks_entry_id;
	ELSE
		v_external_marks := 0;
		v_external_max := 0;
	END IF;
	
	-- Insert or update final marks
	INSERT INTO public.final_marks (
		institutions_id,
		examination_session_id,
		exam_registration_id,
		course_offering_id,
		program_id,
		course_id,
		student_id,
		internal_marks_id,
		marks_entry_id,
		internal_marks_obtained,
		internal_marks_maximum,
		external_marks_obtained,
		external_marks_maximum,
		total_marks_obtained,
		total_marks_maximum,
		percentage,
		grace_marks,
		is_pass,
		calculated_by,
		calculated_at,
		created_by
	) VALUES (
		v_institutions_id,
		v_examination_session_id,
		p_exam_registration_id,
		v_course_offering_id,
		v_program_id,
		v_course_id,
		v_student_id,
		p_internal_marks_id,
		p_marks_entry_id,
		COALESCE(v_internal_marks, 0),
		COALESCE(v_internal_max, 0),
		COALESCE(v_external_marks, 0),
		COALESCE(v_external_max, 0),
		COALESCE(v_internal_marks, 0) + COALESCE(v_external_marks, 0),
		COALESCE(v_internal_max, 0) + COALESCE(v_external_max, 0),
		ROUND(((COALESCE(v_internal_marks, 0) + COALESCE(v_external_marks, 0)) / 
				NULLIF(COALESCE(v_internal_max, 0) + COALESCE(v_external_max, 0), 0)) * 100, 2),
		0,
		false,
		auth.uid(),
		CURRENT_TIMESTAMP,
		auth.uid()
	)
	ON CONFLICT (institutions_id, exam_registration_id, course_offering_id)
	DO UPDATE SET
		internal_marks_id = EXCLUDED.internal_marks_id,
		marks_entry_id = EXCLUDED.marks_entry_id,
		internal_marks_obtained = EXCLUDED.internal_marks_obtained,
		internal_marks_maximum = EXCLUDED.internal_marks_maximum,
		external_marks_obtained = EXCLUDED.external_marks_obtained,
		external_marks_maximum = EXCLUDED.external_marks_maximum,
		total_marks_obtained = EXCLUDED.total_marks_obtained,
		total_marks_maximum = EXCLUDED.total_marks_maximum,
		percentage = EXCLUDED.percentage,
		calculated_by = EXCLUDED.calculated_by,
		calculated_at = EXCLUDED.calculated_at,
		updated_by = auth.uid(),
		updated_at = CURRENT_TIMESTAMP
	RETURNING id INTO v_final_marks_id;
	
	RETURN v_final_marks_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to apply grace marks
CREATE OR REPLACE FUNCTION apply_grace_marks(
	p_final_marks_id UUID,
	p_grace_marks DECIMAL,
	p_grace_marks_reason TEXT,
	p_approved_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_approved_by UUID;
BEGIN
	v_approved_by := COALESCE(p_approved_by, auth.uid());
	
	UPDATE public.final_marks
	SET
		grace_marks = p_grace_marks,
		grace_marks_reason = p_grace_marks_reason,
		grace_marks_approved_by = v_approved_by,
		grace_marks_approved_date = CURRENT_DATE,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_approved_by
	WHERE id = p_final_marks_id;
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to publish results
CREATE OR REPLACE FUNCTION publish_results(
	p_final_marks_ids UUID[],
	p_published_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_published_by UUID;
	v_updated_count INT;
BEGIN
	v_published_by := COALESCE(p_published_by, auth.uid());
	
	UPDATE public.final_marks
	SET
		result_status = 'Published',
		published_date = CURRENT_DATE,
		published_by = v_published_by,
		is_locked = true,
		locked_by = v_published_by,
		locked_date = CURRENT_DATE,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_published_by
	WHERE id = ANY(p_final_marks_ids)
		AND result_status = 'Pending';
	
	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to withdraw published results
CREATE OR REPLACE FUNCTION withdraw_published_results(
	p_final_marks_ids UUID[],
	p_withdrawal_reason TEXT
)
RETURNS INT AS $$
DECLARE
	v_updated_count INT;
BEGIN
	UPDATE public.final_marks
	SET
		result_status = 'Withheld',
		remarks = COALESCE(remarks || E'\n', '') || 'Withdrawal: ' || p_withdrawal_reason,
		is_locked = false,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = ANY(p_final_marks_ids)
		AND result_status = 'Published';
	
	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to lock final marks
CREATE OR REPLACE FUNCTION lock_final_marks(
	p_final_marks_id UUID,
	p_locked_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_locked_by UUID;
BEGIN
	v_locked_by := COALESCE(p_locked_by, auth.uid());
	
	UPDATE public.final_marks
	SET
		is_locked = true,
		locked_by = v_locked_by,
		locked_date = CURRENT_DATE,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_locked_by
	WHERE id = p_final_marks_id;
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unlock final marks
CREATE OR REPLACE FUNCTION unlock_final_marks(
	p_final_marks_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.final_marks
	SET
		is_locked = false,
		locked_by = NULL,
		locked_date = NULL,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_final_marks_id
		AND result_status != 'Published';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get student semester results
CREATE OR REPLACE FUNCTION get_student_semester_results(
	p_student_id UUID,
	p_examination_session_id UUID
)
RETURNS TABLE (
	course_code TEXT,
	course_name TEXT,
	credits NUMERIC,
	internal_marks NUMERIC,
	external_marks NUMERIC,
	total_marks NUMERIC,
	percentage NUMERIC,
	letter_grade TEXT,
	grade_points NUMERIC,
	is_pass BOOLEAN
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		c.course_code::TEXT,
		c.course_name::TEXT,
		c.credit,
		fm.internal_marks_obtained,
		fm.external_marks_obtained,
		fm.total_marks_obtained,
		fm.percentage,
		fm.letter_grade::TEXT,
		fm.grade_points,
		fm.is_pass
	FROM public.final_marks fm
	LEFT JOIN public.courses c ON fm.course_id = c.id
	WHERE fm.student_id = p_student_id
		AND fm.examination_session_id = p_examination_session_id
		AND fm.result_status = 'Published'
		AND fm.is_active = true
	ORDER BY c.course_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate class rank
CREATE OR REPLACE FUNCTION calculate_class_rank(
	p_examination_session_id UUID,
	p_program_id UUID
)
RETURNS TABLE (
	student_id UUID,
	student_name TEXT,
	register_number TEXT,
	cgpa NUMERIC,
	percentage NUMERIC,
	rank BIGINT
) AS $$
BEGIN
	RETURN QUERY
	WITH student_performance AS (
		SELECT
			fm.student_id,
			s.full_name AS student_name,
			er.stu_register_no AS register_number,
			ROUND(SUM(fm.grade_points * c.credit) / NULLIF(SUM(c.credit), 0), 2) AS cgpa,
			ROUND(AVG(fm.percentage), 2) AS percentage
		FROM public.final_marks fm
		LEFT JOIN public.users s ON fm.student_id = s.id
		LEFT JOIN public.exam_registrations er ON fm.exam_registration_id = er.id
		LEFT JOIN public.courses c ON fm.course_id = c.id
		WHERE fm.examination_session_id = p_examination_session_id
			AND fm.program_id = p_program_id
			AND fm.result_status = 'Published'
			AND fm.is_active = true
		GROUP BY fm.student_id, s.full_name, er.stu_register_no
	)
	SELECT
		sp.student_id,
		sp.student_name::TEXT,
		sp.register_number::TEXT,
		sp.cgpa,
		sp.percentage,
		RANK() OVER (ORDER BY sp.cgpa DESC, sp.percentage DESC) AS rank
	FROM student_performance sp
	ORDER BY rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get pass/fail statistics
CREATE OR REPLACE FUNCTION get_pass_fail_statistics(
	p_examination_session_id UUID DEFAULT NULL,
	p_program_id UUID DEFAULT NULL,
	p_course_id UUID DEFAULT NULL
)
RETURNS TABLE (
	total_students BIGINT,
	passed_students BIGINT,
	failed_students BIGINT,
	distinction_students BIGINT,
	first_class_students BIGINT,
	pass_percentage NUMERIC,
	average_cgpa NUMERIC,
	average_percentage NUMERIC
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		COUNT(*) AS total_students,
		COUNT(*) FILTER (WHERE fm.is_pass = true) AS passed_students,
		COUNT(*) FILTER (WHERE fm.is_pass = false) AS failed_students,
		COUNT(*) FILTER (WHERE fm.is_distinction = true) AS distinction_students,
		COUNT(*) FILTER (WHERE fm.is_first_class = true) AS first_class_students,
		ROUND((COUNT(*) FILTER (WHERE fm.is_pass = true)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2) AS pass_percentage,
		ROUND(AVG(fm.grade_points), 2) AS average_cgpa,
		ROUND(AVG(fm.percentage), 2) AS average_percentage
	FROM public.final_marks fm
	WHERE fm.is_active = true
		AND fm.result_status = 'Published'
		AND (p_examination_session_id IS NULL OR fm.examination_session_id = p_examination_session_id)
		AND (p_program_id IS NULL OR fm.program_id = p_program_id)
		AND (p_course_id IS NULL OR fm.course_id = p_course_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.final_marks ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. CREATE RLS POLICIES
-- =====================================================

-- Policy: Allow authenticated users to read final marks
CREATE POLICY "Authenticated users can read final marks"
	ON public.final_marks
	FOR SELECT
	TO authenticated
	USING (true);

-- Policy: Allow students to read their own published results
CREATE POLICY "Students can read their own published results"
	ON public.final_marks
	FOR SELECT
	TO authenticated
	USING (
		student_id = auth.uid() AND result_status = 'Published'
	);

-- Policy: Allow authenticated users to insert final marks
CREATE POLICY "Authenticated users can insert final marks"
	ON public.final_marks
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

-- Policy: Allow users to update unlocked final marks
CREATE POLICY "Users can update unlocked final marks"
	ON public.final_marks
	FOR UPDATE
	TO authenticated
	USING (is_locked = false AND result_status != 'Published')
	WITH CHECK (is_locked = false AND result_status != 'Published');

-- Policy: Allow admins to update all final marks
CREATE POLICY "Admins can update all final marks"
	ON public.final_marks
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

-- Policy: Allow admins to delete final marks
CREATE POLICY "Admins can delete final marks"
	ON public.final_marks
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
CREATE POLICY "Service role can manage all final marks"
	ON public.final_marks
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION calculate_final_marks(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_grace_marks(UUID, DECIMAL, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION publish_results(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION withdraw_published_results(UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION lock_final_marks(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_final_marks(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_semester_results(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_class_rank(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pass_fail_statistics(UUID, UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION calculate_final_marks(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION apply_grace_marks(UUID, DECIMAL, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION publish_results(UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION withdraw_published_results(UUID[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION lock_final_marks(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION unlock_final_marks(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_student_semester_results(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_class_rank(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_pass_fail_statistics(UUID, UUID, UUID) TO service_role;

-- =====================================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.final_marks IS 'Tracks final consolidated marks combining internal and external assessments with grade calculation';
COMMENT ON VIEW public.final_marks_detailed_view IS 'Denormalized view of final marks with all related entity information';
COMMENT ON VIEW public.final_marks_summary_view IS 'Statistical summary of final marks grouped by institution, session, program, and course';
COMMENT ON VIEW public.student_results_view IS 'Published student results accessible to students';
COMMENT ON VIEW public.grade_distribution_view IS 'Grade distribution statistics per course';
COMMENT ON VIEW public.failed_students_view IS 'View of failed students with failure analysis';
COMMENT ON VIEW public.student_cgpa_view IS 'CGPA calculation per student per session';
COMMENT ON VIEW public.pending_publication_view IS 'View of results pending publication';

COMMENT ON COLUMN public.final_marks.internal_percentage IS 'Auto-calculated internal assessment percentage';
COMMENT ON COLUMN public.final_marks.external_percentage IS 'Auto-calculated external assessment percentage';
COMMENT ON COLUMN public.final_marks.letter_grade IS 'Auto-assigned letter grade based on percentage';
COMMENT ON COLUMN public.final_marks.grade_points IS 'Auto-assigned grade points (0-10 scale)';
COMMENT ON COLUMN public.final_marks.is_pass IS 'Auto-determined pass/fail status';
COMMENT ON COLUMN public.final_marks.result_status IS 'Publication status: Pending, Published, Withheld, Cancelled, Under Review';
COMMENT ON COLUMN public.final_marks.is_locked IS 'Prevents modification when locked';

COMMENT ON FUNCTION calculate_final_marks(UUID, UUID, UUID) IS 'Calculates and stores final marks from internal and external assessments';
COMMENT ON FUNCTION apply_grace_marks(UUID, DECIMAL, TEXT, UUID) IS 'Applies grace marks to final marks with approval';
COMMENT ON FUNCTION publish_results(UUID[], UUID) IS 'Publishes results and locks them from modification';
COMMENT ON FUNCTION withdraw_published_results(UUID[], TEXT) IS 'Withdraws published results with reason';
COMMENT ON FUNCTION lock_final_marks(UUID, UUID) IS 'Locks final marks to prevent modifications';
COMMENT ON FUNCTION unlock_final_marks(UUID) IS 'Unlocks final marks for modifications (only if not published)';
COMMENT ON FUNCTION get_student_semester_results(UUID, UUID) IS 'Retrieves complete semester results for a student';
COMMENT ON FUNCTION calculate_class_rank(UUID, UUID) IS 'Calculates class ranking based on CGPA and percentage';
COMMENT ON FUNCTION get_pass_fail_statistics(UUID, UUID, UUID) IS 'Returns pass/fail statistics for sessions/programs/courses';

-- =====================================================
-- 10. ENABLE REALTIME (OPTIONAL)
-- =====================================================

-- Enable realtime for final_marks table if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE final_marks;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
