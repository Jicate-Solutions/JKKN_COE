-- =====================================================
-- CIA Marks Table with RLS, Functions, and Views
-- =====================================================
-- Date: 2026-04-02
-- Purpose: Duplicate of internal_marks table for CIA (Continuous Internal Assessment)
--          marks entry from MyJKKN app, which then syncs to COE internal_marks table.
--
-- This table has the same schema as internal_marks to enable
-- 1:1 field mapping during sync from MyJKKN -> COE.
-- =====================================================

-- =====================================================
-- 1. CREATE CIA MARKS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cia_marks (
	id UUID NOT NULL DEFAULT gen_random_uuid(),

	-- Core References
	institutions_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	exam_registration_id UUID NOT NULL,
	course_offering_id UUID NOT NULL,
	program_id UUID NOT NULL,
	course_id UUID NOT NULL,
	student_id UUID NOT NULL,
	faculty_id UUID,

	-- Component Marks (Individual Assessment Types)
	assignment_marks INTEGER DEFAULT 0,
	quiz_marks INTEGER DEFAULT 0,
	mid_term_marks INTEGER DEFAULT 0,
	presentation_marks INTEGER DEFAULT 0,
	attendance_marks INTEGER DEFAULT 0,
	lab_marks INTEGER DEFAULT 0,
	project_marks INTEGER DEFAULT 0,
	seminar_marks INTEGER DEFAULT 0,
	viva_marks INTEGER DEFAULT 0,
	other_marks INTEGER DEFAULT 0,

	-- Calculated Totals
	total_internal_marks INTEGER NOT NULL,
	max_internal_marks INTEGER NOT NULL,

	-- Component Maximums (Configuration)
	max_assignment_marks INTEGER,
	max_quiz_marks INTEGER,
	max_mid_term_marks INTEGER,
	max_presentation_marks INTEGER,
	max_attendance_marks INTEGER,
	max_lab_marks INTEGER,
	max_project_marks INTEGER,
	max_seminar_marks INTEGER,
	max_viva_marks INTEGER,
	max_other_marks INTEGER,

	-- Test Marks (Additional Assessment Types)
	test_1_mark INTEGER DEFAULT 0,
	test_2_mark INTEGER DEFAULT 0,
	test_3_mark INTEGER DEFAULT 0,
	max_test_1_mark INTEGER,
	max_test_2_mark INTEGER,
	max_test_3_mark INTEGER,

	-- Calculated Percentage (Generated Column)
	internal_percentage NUMERIC GENERATED ALWAYS AS (
		CASE
			WHEN max_internal_marks > 0 THEN ROUND((total_internal_marks::numeric / max_internal_marks::numeric) * 100, 2)
			ELSE 0::numeric
		END
	) STORED,

	-- Grade for status-based papers (Commended, Highly Commended, AAA)
	grade VARCHAR(50),

	-- Submission Details
	submission_date DATE NOT NULL,
	submitted_by UUID,

	-- Approval Workflow
	is_approved BOOLEAN DEFAULT false,
	approved_by UUID,
	approved_date DATE,
	approval_remarks TEXT,

	-- Verification
	is_verified BOOLEAN DEFAULT false,
	verified_by UUID,
	verified_date DATE,
	verification_remarks TEXT,

	-- Lock Mechanism
	is_locked BOOLEAN DEFAULT false,
	locked_by UUID,
	locked_date DATE,

	-- Status
	marks_status VARCHAR(50) DEFAULT 'Draft', -- Draft, Submitted, Approved, Verified, Locked, Rejected
	remarks TEXT,
	is_active BOOLEAN DEFAULT true,

	-- Audit Fields
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID,
	updated_by UUID,

	-- Primary Key
	CONSTRAINT cia_marks_pkey PRIMARY KEY (id),

	-- Foreign Key Constraints
	CONSTRAINT cia_marks_institutions_id_fkey
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE CASCADE,
	CONSTRAINT cia_marks_examination_session_id_fkey
		FOREIGN KEY (examination_session_id) REFERENCES examination_sessions(id) ON DELETE CASCADE,
	CONSTRAINT cia_marks_exam_registration_id_fkey
		FOREIGN KEY (exam_registration_id) REFERENCES exam_registrations(id) ON DELETE CASCADE,
	CONSTRAINT cia_marks_course_offering_id_fkey
		FOREIGN KEY (course_offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE,
	CONSTRAINT cia_marks_program_id_fkey
		FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
	CONSTRAINT cia_marks_course_id_fkey
		FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
	CONSTRAINT cia_marks_student_id_fkey
		FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
	CONSTRAINT cia_marks_faculty_id_fkey
		FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE RESTRICT,
	CONSTRAINT cia_marks_submitted_by_fkey
		FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT cia_marks_approved_by_fkey
		FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT cia_marks_verified_by_fkey
		FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT cia_marks_locked_by_fkey
		FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT cia_marks_created_by_fkey
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT cia_marks_updated_by_fkey
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,

	-- Unique Constraints
	CONSTRAINT unique_cia_marks
		UNIQUE(institutions_id, exam_registration_id, course_offering_id),
	CONSTRAINT unique_cia_student_course_offering
		UNIQUE(student_id, course_offering_id, examination_session_id),

	-- Check Constraints
	CONSTRAINT chk_cia_component_marks_non_negative
		CHECK (
			assignment_marks >= 0 AND quiz_marks >= 0 AND mid_term_marks >= 0 AND
			presentation_marks >= 0 AND attendance_marks >= 0 AND lab_marks >= 0 AND
			project_marks >= 0 AND seminar_marks >= 0 AND viva_marks >= 0 AND other_marks >= 0
		),
	CONSTRAINT chk_cia_total_marks_non_negative
		CHECK (total_internal_marks >= 0),
	CONSTRAINT chk_cia_total_marks_valid
		CHECK (total_internal_marks <= max_internal_marks),
	CONSTRAINT chk_cia_max_marks_positive
		CHECK (max_internal_marks > 0),
	CONSTRAINT chk_cia_component_max_marks_non_negative
		CHECK (
			(max_assignment_marks IS NULL OR max_assignment_marks >= 0) AND
			(max_quiz_marks IS NULL OR max_quiz_marks >= 0) AND
			(max_mid_term_marks IS NULL OR max_mid_term_marks >= 0) AND
			(max_presentation_marks IS NULL OR max_presentation_marks >= 0) AND
			(max_attendance_marks IS NULL OR max_attendance_marks >= 0) AND
			(max_lab_marks IS NULL OR max_lab_marks >= 0) AND
			(max_project_marks IS NULL OR max_project_marks >= 0) AND
			(max_seminar_marks IS NULL OR max_seminar_marks >= 0) AND
			(max_viva_marks IS NULL OR max_viva_marks >= 0) AND
			(max_other_marks IS NULL OR max_other_marks >= 0)
		),
	CONSTRAINT chk_cia_component_marks_within_max
		CHECK (
			(max_assignment_marks IS NULL OR assignment_marks <= max_assignment_marks) AND
			(max_quiz_marks IS NULL OR quiz_marks <= max_quiz_marks) AND
			(max_mid_term_marks IS NULL OR mid_term_marks <= max_mid_term_marks) AND
			(max_presentation_marks IS NULL OR presentation_marks <= max_presentation_marks) AND
			(max_attendance_marks IS NULL OR attendance_marks <= max_attendance_marks) AND
			(max_lab_marks IS NULL OR lab_marks <= max_lab_marks) AND
			(max_project_marks IS NULL OR project_marks <= max_project_marks) AND
			(max_seminar_marks IS NULL OR seminar_marks <= max_seminar_marks) AND
			(max_viva_marks IS NULL OR viva_marks <= max_viva_marks) AND
			(max_other_marks IS NULL OR other_marks <= max_other_marks)
		),
	CONSTRAINT chk_cia_test_marks_non_negative
		CHECK (
			test_1_mark >= 0 AND
			test_2_mark >= 0 AND
			test_3_mark >= 0
		),
	CONSTRAINT chk_cia_test_max_marks_non_negative
		CHECK (
			(max_test_1_mark IS NULL OR max_test_1_mark >= 0) AND
			(max_test_2_mark IS NULL OR max_test_2_mark >= 0) AND
			(max_test_3_mark IS NULL OR max_test_3_mark >= 0)
		),
	CONSTRAINT chk_cia_test_marks_within_max
		CHECK (
			(max_test_1_mark IS NULL OR test_1_mark <= max_test_1_mark) AND
			(max_test_2_mark IS NULL OR test_2_mark <= max_test_2_mark) AND
			(max_test_3_mark IS NULL OR test_3_mark <= max_test_3_mark)
		),
	CONSTRAINT chk_cia_valid_marks_status
		CHECK (marks_status IN ('Draft', 'Submitted', 'Approved', 'Verified', 'Locked', 'Rejected', 'Pending Review')),
	CONSTRAINT chk_cia_approval_consistency
		CHECK (
			(is_approved = false AND approved_by IS NULL AND approved_date IS NULL) OR
			(is_approved = true AND approved_by IS NOT NULL AND approved_date IS NOT NULL)
		),
	CONSTRAINT chk_cia_verification_consistency
		CHECK (
			(is_verified = false AND verified_by IS NULL AND verified_date IS NULL) OR
			(is_verified = true AND verified_by IS NOT NULL AND verified_date IS NOT NULL)
		),
	CONSTRAINT chk_cia_locked_consistency
		CHECK (
			(is_locked = false AND locked_by IS NULL AND locked_date IS NULL) OR
			(is_locked = true AND locked_by IS NOT NULL AND locked_date IS NOT NULL)
		),
	CONSTRAINT chk_cia_marks_grade_values
		CHECK (
			grade IS NULL OR
			grade IN ('Commended', 'Highly Commended', 'AAA')
		)
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_cia_marks_institutions_id
	ON public.cia_marks(institutions_id);
CREATE INDEX IF NOT EXISTS idx_cia_marks_examination_session_id
	ON public.cia_marks(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_cia_marks_exam_registration_id
	ON public.cia_marks(exam_registration_id);
CREATE INDEX IF NOT EXISTS idx_cia_marks_course_offering_id
	ON public.cia_marks(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_cia_marks_program_id
	ON public.cia_marks(program_id);
CREATE INDEX IF NOT EXISTS idx_cia_marks_course_id
	ON public.cia_marks(course_id);
CREATE INDEX IF NOT EXISTS idx_cia_marks_student_id
	ON public.cia_marks(student_id);
CREATE INDEX IF NOT EXISTS idx_cia_marks_faculty_id
	ON public.cia_marks(faculty_id);

-- Status and Boolean Indexes
CREATE INDEX IF NOT EXISTS idx_cia_marks_marks_status
	ON public.cia_marks(marks_status);
CREATE INDEX IF NOT EXISTS idx_cia_marks_is_approved
	ON public.cia_marks(is_approved);
CREATE INDEX IF NOT EXISTS idx_cia_marks_is_verified
	ON public.cia_marks(is_verified);
CREATE INDEX IF NOT EXISTS idx_cia_marks_is_locked
	ON public.cia_marks(is_locked);
CREATE INDEX IF NOT EXISTS idx_cia_marks_is_active
	ON public.cia_marks(is_active);

-- User Tracking Indexes
CREATE INDEX IF NOT EXISTS idx_cia_marks_submitted_by
	ON public.cia_marks(submitted_by) WHERE submitted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cia_marks_approved_by
	ON public.cia_marks(approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cia_marks_verified_by
	ON public.cia_marks(verified_by) WHERE verified_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cia_marks_locked_by
	ON public.cia_marks(locked_by) WHERE locked_by IS NOT NULL;

-- Date Indexes
CREATE INDEX IF NOT EXISTS idx_cia_marks_submission_date
	ON public.cia_marks(submission_date);
CREATE INDEX IF NOT EXISTS idx_cia_marks_approved_date
	ON public.cia_marks(approved_date) WHERE approved_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cia_marks_verified_date
	ON public.cia_marks(verified_date) WHERE verified_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cia_marks_created_at
	ON public.cia_marks(created_at DESC);

-- Marks Range Indexes
CREATE INDEX IF NOT EXISTS idx_cia_marks_total
	ON public.cia_marks(total_internal_marks);
CREATE INDEX IF NOT EXISTS idx_cia_marks_percentage
	ON public.cia_marks(internal_percentage);

-- Test Marks Indexes
CREATE INDEX IF NOT EXISTS idx_cia_marks_test_1
	ON public.cia_marks(test_1_mark);
CREATE INDEX IF NOT EXISTS idx_cia_marks_test_2
	ON public.cia_marks(test_2_mark);
CREATE INDEX IF NOT EXISTS idx_cia_marks_test_3
	ON public.cia_marks(test_3_mark);

-- Grade Index
CREATE INDEX IF NOT EXISTS idx_cia_marks_grade
	ON public.cia_marks(grade)
	WHERE grade IS NOT NULL;

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS idx_cia_marks_session_status
	ON public.cia_marks(examination_session_id, marks_status);
CREATE INDEX IF NOT EXISTS idx_cia_marks_session_course
	ON public.cia_marks(examination_session_id, course_id);
CREATE INDEX IF NOT EXISTS idx_cia_marks_program_status
	ON public.cia_marks(program_id, marks_status);
CREATE INDEX IF NOT EXISTS idx_cia_marks_faculty_status
	ON public.cia_marks(faculty_id, marks_status);
CREATE INDEX IF NOT EXISTS idx_cia_marks_student_session
	ON public.cia_marks(student_id, examination_session_id);
CREATE INDEX IF NOT EXISTS idx_cia_marks_course_offering_status
	ON public.cia_marks(course_offering_id, marks_status);
CREATE INDEX IF NOT EXISTS idx_cia_marks_institution_session_status
	ON public.cia_marks(institutions_id, examination_session_id, marks_status);

-- Partial Indexes for Specific Queries
CREATE INDEX IF NOT EXISTS idx_cia_marks_pending_approval
	ON public.cia_marks(id, submission_date, faculty_id)
	WHERE marks_status = 'Submitted' AND is_approved = false;
CREATE INDEX IF NOT EXISTS idx_cia_marks_pending_verification
	ON public.cia_marks(id, approved_date)
	WHERE is_approved = true AND is_verified = false;
CREATE INDEX IF NOT EXISTS idx_cia_marks_approved
	ON public.cia_marks(id, approved_date, approved_by)
	WHERE is_approved = true;
CREATE INDEX IF NOT EXISTS idx_cia_marks_locked
	ON public.cia_marks(id, locked_date, locked_by)
	WHERE is_locked = true;
CREATE INDEX IF NOT EXISTS idx_cia_marks_active
	ON public.cia_marks(id, marks_status, created_at)
	WHERE is_active = true;

-- =====================================================
-- 3. CREATE TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cia_marks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cia_marks_updated_at
	BEFORE UPDATE ON public.cia_marks
	FOR EACH ROW
	EXECUTE FUNCTION update_cia_marks_updated_at();

-- Auto-calculate total internal marks
CREATE OR REPLACE FUNCTION auto_calculate_total_cia_marks()
RETURNS TRIGGER AS $$
BEGIN
	-- Auto-calculate total if changed
	IF NEW.assignment_marks != OLD.assignment_marks OR
	   NEW.quiz_marks != OLD.quiz_marks OR
	   NEW.mid_term_marks != OLD.mid_term_marks OR
	   NEW.presentation_marks != OLD.presentation_marks OR
	   NEW.attendance_marks != OLD.attendance_marks OR
	   NEW.lab_marks != OLD.lab_marks OR
	   NEW.project_marks != OLD.project_marks OR
	   NEW.seminar_marks != OLD.seminar_marks OR
	   NEW.viva_marks != OLD.viva_marks OR
	   NEW.other_marks != OLD.other_marks OR
	   NEW.test_1_mark != OLD.test_1_mark OR
	   NEW.test_2_mark != OLD.test_2_mark OR
	   NEW.test_3_mark != OLD.test_3_mark THEN

		NEW.total_internal_marks = COALESCE(NEW.assignment_marks, 0) +
									COALESCE(NEW.quiz_marks, 0) +
									COALESCE(NEW.mid_term_marks, 0) +
									COALESCE(NEW.presentation_marks, 0) +
									COALESCE(NEW.attendance_marks, 0) +
									COALESCE(NEW.lab_marks, 0) +
									COALESCE(NEW.project_marks, 0) +
									COALESCE(NEW.seminar_marks, 0) +
									COALESCE(NEW.viva_marks, 0) +
									COALESCE(NEW.other_marks, 0) +
									COALESCE(NEW.test_1_mark, 0) +
									COALESCE(NEW.test_2_mark, 0) +
									COALESCE(NEW.test_3_mark, 0);
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_calculate_total_cia_marks
	BEFORE UPDATE ON public.cia_marks
	FOR EACH ROW
	EXECUTE FUNCTION auto_calculate_total_cia_marks();

-- Calculate total on insert
CREATE OR REPLACE FUNCTION calculate_cia_total_on_insert()
RETURNS TRIGGER AS $$
BEGIN
	-- Calculate total on insert if not provided
	IF NEW.total_internal_marks = 0 OR NEW.total_internal_marks IS NULL THEN
		NEW.total_internal_marks = COALESCE(NEW.assignment_marks, 0) +
									COALESCE(NEW.quiz_marks, 0) +
									COALESCE(NEW.mid_term_marks, 0) +
									COALESCE(NEW.presentation_marks, 0) +
									COALESCE(NEW.attendance_marks, 0) +
									COALESCE(NEW.lab_marks, 0) +
									COALESCE(NEW.project_marks, 0) +
									COALESCE(NEW.seminar_marks, 0) +
									COALESCE(NEW.viva_marks, 0) +
									COALESCE(NEW.other_marks, 0) +
									COALESCE(NEW.test_1_mark, 0) +
									COALESCE(NEW.test_2_mark, 0) +
									COALESCE(NEW.test_3_mark, 0);
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_cia_total_on_insert
	BEFORE INSERT ON public.cia_marks
	FOR EACH ROW
	EXECUTE FUNCTION calculate_cia_total_on_insert();

-- Auto-populate approval details
CREATE OR REPLACE FUNCTION auto_populate_cia_approval()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.is_approved = true AND (OLD.is_approved IS NULL OR OLD.is_approved = false) THEN
		NEW.approved_date = CURRENT_DATE;
		NEW.marks_status = 'Approved';
		IF NEW.approved_by IS NULL THEN
			NEW.approved_by = auth.uid();
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_cia_approval
	BEFORE UPDATE ON public.cia_marks
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_cia_approval();

-- Auto-populate verification details
CREATE OR REPLACE FUNCTION auto_populate_cia_verification()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.is_verified = true AND (OLD.is_verified IS NULL OR OLD.is_verified = false) THEN
		NEW.verified_date = CURRENT_DATE;
		NEW.marks_status = 'Verified';
		IF NEW.verified_by IS NULL THEN
			NEW.verified_by = auth.uid();
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_cia_verification
	BEFORE UPDATE ON public.cia_marks
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_cia_verification();

-- Auto-populate lock details
CREATE OR REPLACE FUNCTION auto_populate_cia_lock()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.is_locked = true AND (OLD.is_locked IS NULL OR OLD.is_locked = false) THEN
		NEW.locked_date = CURRENT_DATE;
		NEW.marks_status = 'Locked';
		IF NEW.locked_by IS NULL THEN
			NEW.locked_by = auth.uid();
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_cia_lock
	BEFORE UPDATE ON public.cia_marks
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_cia_lock();

-- Prevent modification of locked marks
CREATE OR REPLACE FUNCTION prevent_locked_cia_marks_modification()
RETURNS TRIGGER AS $$
BEGIN
	IF OLD.is_locked = true AND (
		NEW.assignment_marks != OLD.assignment_marks OR
		NEW.quiz_marks != OLD.quiz_marks OR
		NEW.mid_term_marks != OLD.mid_term_marks OR
		NEW.presentation_marks != OLD.presentation_marks OR
		NEW.attendance_marks != OLD.attendance_marks OR
		NEW.lab_marks != OLD.lab_marks OR
		NEW.project_marks != OLD.project_marks OR
		NEW.seminar_marks != OLD.seminar_marks OR
		NEW.viva_marks != OLD.viva_marks OR
		NEW.other_marks != OLD.other_marks OR
		NEW.test_1_mark != OLD.test_1_mark OR
		NEW.test_2_mark != OLD.test_2_mark OR
		NEW.test_3_mark != OLD.test_3_mark OR
		NEW.total_internal_marks != OLD.total_internal_marks
	) THEN
		RAISE EXCEPTION 'Cannot modify locked CIA marks. Unlock first.';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_locked_cia_marks_modification
	BEFORE UPDATE ON public.cia_marks
	FOR EACH ROW
	EXECUTE FUNCTION prevent_locked_cia_marks_modification();

-- =====================================================
-- 4. CREATE VIEWS
-- =====================================================

-- Detailed CIA Marks View with all related data
CREATE OR REPLACE VIEW public.cia_marks_detailed_view AS
SELECT
	-- CIA Marks Details
	cm.id,

	-- Component Marks
	cm.assignment_marks,
	cm.quiz_marks,
	cm.mid_term_marks,
	cm.presentation_marks,
	cm.attendance_marks,
	cm.lab_marks,
	cm.project_marks,
	cm.seminar_marks,
	cm.viva_marks,
	cm.other_marks,

	-- Component Maximums
	cm.max_assignment_marks,
	cm.max_quiz_marks,
	cm.max_mid_term_marks,
	cm.max_presentation_marks,
	cm.max_attendance_marks,
	cm.max_lab_marks,
	cm.max_project_marks,
	cm.max_seminar_marks,
	cm.max_viva_marks,
	cm.max_other_marks,

	-- Totals
	cm.total_internal_marks,
	cm.max_internal_marks,
	cm.internal_percentage,

	-- Grade
	cm.grade,

	-- Status and Workflow
	cm.marks_status,
	cm.submission_date,
	cm.is_approved,
	cm.approved_by,
	cm.approved_date,
	abu.full_name AS approved_by_name,
	cm.approval_remarks,
	cm.is_verified,
	cm.verified_by,
	cm.verified_date,
	vbu.full_name AS verified_by_name,
	cm.verification_remarks,
	cm.is_locked,
	cm.locked_by,
	cm.locked_date,
	lbu.full_name AS locked_by_name,
	cm.remarks,
	cm.is_active,

	-- Student Details
	cm.student_id,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	s.student_email,

	-- Faculty Details
	cm.faculty_id,
	f.full_name AS faculty_name,
	f.email AS faculty_email,

	-- Exam Registration Details
	cm.exam_registration_id,
	er.stu_register_no,


	-- Institution Details
	cm.institutions_id,
	i.institution_code,
	i.name AS institution_name,

	-- Examination Session Details
	cm.examination_session_id,
	es.session_code,
	es.session_name,


	-- Program Details
	cm.program_id,
	p.program_code,
	p.program_name,

	-- Course Details
	cm.course_id,
	c.course_code,
	c.course_name,

	-- Course Offering Details
	cm.course_offering_id,
	co.semester,
	co.section,

	-- Audit Fields
	cm.created_at,
	cm.updated_at,
	cm.created_by,
	cm.updated_by,
	cu.full_name AS created_by_name
FROM public.cia_marks cm
LEFT JOIN public.students s ON cm.student_id = s.id
LEFT JOIN public.users f ON cm.faculty_id = f.id
LEFT JOIN public.users abu ON cm.approved_by = abu.id
LEFT JOIN public.users vbu ON cm.verified_by = vbu.id
LEFT JOIN public.users lbu ON cm.locked_by = lbu.id
LEFT JOIN public.users cu ON cm.created_by = cu.id
LEFT JOIN public.exam_registrations er ON cm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON cm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON cm.examination_session_id = es.id
LEFT JOIN public.programs p ON cm.program_id = p.id
LEFT JOIN public.courses c ON cm.course_id = c.id
LEFT JOIN public.course_offerings co ON cm.course_offering_id = co.id;

-- CIA Marks Summary View for reporting
CREATE OR REPLACE VIEW public.cia_marks_summary_view AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	c.course_code,
	c.course_name,
	f.full_name AS faculty_name,
	COUNT(*) AS total_entries,
	COUNT(*) FILTER (WHERE cm.marks_status = 'Draft') AS draft_count,
	COUNT(*) FILTER (WHERE cm.marks_status = 'Submitted') AS submitted_count,
	COUNT(*) FILTER (WHERE cm.is_approved = true) AS approved_count,
	COUNT(*) FILTER (WHERE cm.is_verified = true) AS verified_count,
	COUNT(*) FILTER (WHERE cm.is_locked = true) AS locked_count,
	ROUND(AVG(cm.total_internal_marks), 2) AS avg_internal_marks,
	ROUND(AVG(cm.internal_percentage), 2) AS avg_internal_percentage,
	MIN(cm.total_internal_marks) AS min_internal_marks,
	MAX(cm.total_internal_marks) AS max_internal_marks,
	ROUND(STDDEV(cm.total_internal_marks), 2) AS marks_std_deviation
FROM public.cia_marks cm
LEFT JOIN public.institutions i ON cm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON cm.examination_session_id = es.id
LEFT JOIN public.programs p ON cm.program_id = p.id
LEFT JOIN public.courses c ON cm.course_id = c.id
LEFT JOIN public.users f ON cm.faculty_id = f.id
WHERE cm.is_active = true
GROUP BY
	i.institution_code, i.name,
	es.session_code, es.session_name,
	p.program_code, p.program_name,
	c.course_code, c.course_name,
	f.full_name;

-- Pending Approval View
CREATE OR REPLACE VIEW public.cia_marks_pending_approval AS
SELECT
	cm.id,
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	c.course_name,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	er.stu_register_no,
	f.full_name AS faculty_name,
	cm.total_internal_marks,
	cm.max_internal_marks,
	cm.internal_percentage,
	cm.submission_date,
	CURRENT_DATE - cm.submission_date AS days_pending
FROM public.cia_marks cm
LEFT JOIN public.institutions i ON cm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON cm.examination_session_id = es.id
LEFT JOIN public.programs p ON cm.program_id = p.id
LEFT JOIN public.courses c ON cm.course_id = c.id
LEFT JOIN public.students s ON cm.student_id = s.id
LEFT JOIN public.users f ON cm.faculty_id = f.id
LEFT JOIN public.exam_registrations er ON cm.exam_registration_id = er.id
WHERE cm.marks_status = 'Submitted'
	AND cm.is_approved = false
	AND cm.is_active = true
ORDER BY cm.submission_date ASC;

-- Faculty CIA Marks View
CREATE OR REPLACE VIEW public.faculty_cia_marks_view AS
SELECT
	f.id AS faculty_id,
	f.full_name AS faculty_name,
	f.email AS faculty_email,
	i.institution_code,
	es.session_code,
	c.course_code,
	c.course_name,
	co.semester,
	co.section,
	COUNT(*) AS total_students,
	COUNT(*) FILTER (WHERE cm.marks_status = 'Draft') AS draft_count,
	COUNT(*) FILTER (WHERE cm.marks_status = 'Submitted') AS submitted_count,
	COUNT(*) FILTER (WHERE cm.is_approved = true) AS approved_count,
	ROUND(AVG(cm.internal_percentage), 2) AS avg_percentage,
	MIN(cm.submission_date) AS earliest_submission,
	MAX(cm.submission_date) AS latest_submission
FROM public.cia_marks cm
LEFT JOIN public.users f ON cm.faculty_id = f.id
LEFT JOIN public.institutions i ON cm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON cm.examination_session_id = es.id
LEFT JOIN public.courses c ON cm.course_id = c.id
LEFT JOIN public.course_offerings co ON cm.course_offering_id = co.id
WHERE cm.is_active = true
GROUP BY
	f.id, f.full_name, f.email,
	i.institution_code,
	es.session_code,
	c.course_code, c.course_name,
	co.semester, co.section;

-- Student CIA Marks View
CREATE OR REPLACE VIEW public.student_cia_marks_view AS
SELECT
	s.id AS student_id,
	CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
	er.stu_register_no,
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	c.course_name,
	cm.total_internal_marks,
	cm.max_internal_marks,
	cm.internal_percentage,
	cm.marks_status,
	cm.is_approved,
	cm.is_verified,
	f.full_name AS faculty_name
FROM public.cia_marks cm
LEFT JOIN public.students s ON cm.student_id = s.id
LEFT JOIN public.users f ON cm.faculty_id = f.id
LEFT JOIN public.exam_registrations er ON cm.exam_registration_id = er.id
LEFT JOIN public.institutions i ON cm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON cm.examination_session_id = es.id
LEFT JOIN public.programs p ON cm.program_id = p.id
LEFT JOIN public.courses c ON cm.course_id = c.id
WHERE cm.is_active = true
	AND cm.marks_status IN ('Approved', 'Verified', 'Locked');

-- Component-wise Analysis View
CREATE OR REPLACE VIEW public.cia_marks_component_analysis AS
SELECT
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	c.course_name,
	COUNT(*) AS total_students,
	ROUND(AVG(cm.assignment_marks), 2) AS avg_assignment,
	ROUND(AVG(cm.quiz_marks), 2) AS avg_quiz,
	ROUND(AVG(cm.mid_term_marks), 2) AS avg_midterm,
	ROUND(AVG(cm.presentation_marks), 2) AS avg_presentation,
	ROUND(AVG(cm.attendance_marks), 2) AS avg_attendance,
	ROUND(AVG(cm.lab_marks), 2) AS avg_lab,
	ROUND(AVG(cm.project_marks), 2) AS avg_project,
	ROUND(AVG(cm.seminar_marks), 2) AS avg_seminar,
	ROUND(AVG(cm.viva_marks), 2) AS avg_viva,
	ROUND(AVG(cm.other_marks), 2) AS avg_other,
	ROUND(AVG(cm.total_internal_marks), 2) AS avg_total
FROM public.cia_marks cm
LEFT JOIN public.institutions i ON cm.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON cm.examination_session_id = es.id
LEFT JOIN public.programs p ON cm.program_id = p.id
LEFT JOIN public.courses c ON cm.course_id = c.id
WHERE cm.is_active = true
	AND cm.is_approved = true
GROUP BY
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code, c.course_name;

-- =====================================================
-- 5. CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to submit CIA marks
CREATE OR REPLACE FUNCTION submit_cia_marks(
	p_cia_marks_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.cia_marks
	SET
		marks_status = 'Submitted',
		submitted_by = auth.uid(),
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_cia_marks_id
		AND marks_status = 'Draft';

	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve CIA marks
CREATE OR REPLACE FUNCTION approve_cia_marks(
	p_cia_marks_id UUID,
	p_approved_by UUID DEFAULT NULL,
	p_approval_remarks TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_approved_by UUID;
BEGIN
	v_approved_by := COALESCE(p_approved_by, auth.uid());

	UPDATE public.cia_marks
	SET
		is_approved = true,
		approved_by = v_approved_by,
		approved_date = CURRENT_DATE,
		marks_status = 'Approved',
		approval_remarks = p_approval_remarks,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_approved_by
	WHERE id = p_cia_marks_id
		AND marks_status = 'Submitted';

	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject CIA marks
CREATE OR REPLACE FUNCTION reject_cia_marks(
	p_cia_marks_id UUID,
	p_rejection_remarks TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.cia_marks
	SET
		marks_status = 'Rejected',
		remarks = p_rejection_remarks,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_cia_marks_id
		AND marks_status = 'Submitted';

	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify CIA marks
CREATE OR REPLACE FUNCTION verify_cia_marks(
	p_cia_marks_id UUID,
	p_verified_by UUID DEFAULT NULL,
	p_verification_remarks TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_verified_by UUID;
BEGIN
	v_verified_by := COALESCE(p_verified_by, auth.uid());

	UPDATE public.cia_marks
	SET
		is_verified = true,
		verified_by = v_verified_by,
		verified_date = CURRENT_DATE,
		marks_status = 'Verified',
		verification_remarks = p_verification_remarks,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_verified_by
	WHERE id = p_cia_marks_id
		AND is_approved = true;

	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to lock CIA marks
CREATE OR REPLACE FUNCTION lock_cia_marks(
	p_cia_marks_id UUID,
	p_locked_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_locked_by UUID;
BEGIN
	v_locked_by := COALESCE(p_locked_by, auth.uid());

	UPDATE public.cia_marks
	SET
		is_locked = true,
		locked_by = v_locked_by,
		locked_date = CURRENT_DATE,
		marks_status = 'Locked',
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_locked_by
	WHERE id = p_cia_marks_id
		AND is_verified = true;

	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unlock CIA marks
CREATE OR REPLACE FUNCTION unlock_cia_marks(
	p_cia_marks_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.cia_marks
	SET
		is_locked = false,
		locked_by = NULL,
		locked_date = NULL,
		marks_status = 'Verified',
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_cia_marks_id
		AND is_locked = true;

	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk approve CIA marks
CREATE OR REPLACE FUNCTION bulk_approve_cia_marks(
	p_cia_marks_ids UUID[],
	p_approved_by UUID DEFAULT NULL,
	p_approval_remarks TEXT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_approved_by UUID;
	v_updated_count INT;
BEGIN
	v_approved_by := COALESCE(p_approved_by, auth.uid());

	UPDATE public.cia_marks
	SET
		is_approved = true,
		approved_by = v_approved_by,
		approved_date = CURRENT_DATE,
		marks_status = 'Approved',
		approval_remarks = p_approval_remarks,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_approved_by
	WHERE id = ANY(p_cia_marks_ids)
		AND marks_status = 'Submitted';

	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk lock CIA marks
CREATE OR REPLACE FUNCTION bulk_lock_cia_marks(
	p_cia_marks_ids UUID[],
	p_locked_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_locked_by UUID;
	v_updated_count INT;
BEGIN
	v_locked_by := COALESCE(p_locked_by, auth.uid());

	UPDATE public.cia_marks
	SET
		is_locked = true,
		locked_by = v_locked_by,
		locked_date = CURRENT_DATE,
		marks_status = 'Locked',
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_locked_by
	WHERE id = ANY(p_cia_marks_ids)
		AND is_verified = true;

	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get CIA marks statistics
CREATE OR REPLACE FUNCTION get_cia_marks_statistics(
	p_examination_session_id UUID DEFAULT NULL,
	p_program_id UUID DEFAULT NULL,
	p_course_id UUID DEFAULT NULL
)
RETURNS TABLE (
	total_entries BIGINT,
	draft_count BIGINT,
	submitted_count BIGINT,
	approved_count BIGINT,
	verified_count BIGINT,
	locked_count BIGINT,
	avg_internal_marks NUMERIC,
	avg_percentage NUMERIC,
	min_marks NUMERIC,
	max_marks NUMERIC
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		COUNT(*) AS total_entries,
		COUNT(*) FILTER (WHERE cm.marks_status = 'Draft') AS draft_count,
		COUNT(*) FILTER (WHERE cm.marks_status = 'Submitted') AS submitted_count,
		COUNT(*) FILTER (WHERE cm.is_approved = true) AS approved_count,
		COUNT(*) FILTER (WHERE cm.is_verified = true) AS verified_count,
		COUNT(*) FILTER (WHERE cm.is_locked = true) AS locked_count,
		ROUND(AVG(cm.total_internal_marks), 2) AS avg_internal_marks,
		ROUND(AVG(cm.internal_percentage), 2) AS avg_percentage,
		MIN(cm.total_internal_marks) AS min_marks,
		MAX(cm.total_internal_marks) AS max_marks
	FROM public.cia_marks cm
	WHERE cm.is_active = true
		AND (p_examination_session_id IS NULL OR cm.examination_session_id = p_examination_session_id)
		AND (p_program_id IS NULL OR cm.program_id = p_program_id)
		AND (p_course_id IS NULL OR cm.course_id = p_course_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get student CIA marks
CREATE OR REPLACE FUNCTION get_student_cia_marks(
	p_student_id UUID,
	p_examination_session_id UUID DEFAULT NULL
)
RETURNS TABLE (
	id UUID,
	course_code TEXT,
	course_name TEXT,
	total_internal_marks NUMERIC,
	max_internal_marks NUMERIC,
	internal_percentage NUMERIC,
	marks_status TEXT,
	is_approved BOOLEAN,
	faculty_name TEXT
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		cm.id,
		c.course_code::TEXT,
		c.course_name::TEXT,
		cm.total_internal_marks,
		cm.max_internal_marks,
		cm.internal_percentage,
		cm.marks_status::TEXT,
		cm.is_approved,
		f.full_name::TEXT AS faculty_name
	FROM public.cia_marks cm
	LEFT JOIN public.courses c ON cm.course_id = c.id
	LEFT JOIN public.users f ON cm.faculty_id = f.id
	WHERE cm.student_id = p_student_id
		AND cm.is_active = true
		AND (p_examination_session_id IS NULL OR cm.examination_session_id = p_examination_session_id)
	ORDER BY c.course_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get faculty CIA marks summary
CREATE OR REPLACE FUNCTION get_faculty_cia_marks_summary(
	p_faculty_id UUID,
	p_examination_session_id UUID DEFAULT NULL
)
RETURNS TABLE (
	course_code TEXT,
	course_name TEXT,
	total_students BIGINT,
	submitted_count BIGINT,
	approved_count BIGINT,
	avg_percentage NUMERIC,
	pending_count BIGINT
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		c.course_code::TEXT,
		c.course_name::TEXT,
		COUNT(*) AS total_students,
		COUNT(*) FILTER (WHERE cm.marks_status = 'Submitted') AS submitted_count,
		COUNT(*) FILTER (WHERE cm.is_approved = true) AS approved_count,
		ROUND(AVG(cm.internal_percentage), 2) AS avg_percentage,
		COUNT(*) FILTER (WHERE cm.marks_status = 'Draft') AS pending_count
	FROM public.cia_marks cm
	LEFT JOIN public.courses c ON cm.course_id = c.id
	WHERE cm.faculty_id = p_faculty_id
		AND cm.is_active = true
		AND (p_examination_session_id IS NULL OR cm.examination_session_id = p_examination_session_id)
	GROUP BY c.course_code, c.course_name
	ORDER BY c.course_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.cia_marks ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. CREATE RLS POLICIES
-- =====================================================

-- Policy: Allow authenticated users to read CIA marks
CREATE POLICY "Authenticated users can read cia marks"
	ON public.cia_marks
	FOR SELECT
	TO authenticated
	USING (true);

-- Policy: Allow students to read their own CIA marks (if approved)
CREATE POLICY "Students can read their own approved cia marks"
	ON public.cia_marks
	FOR SELECT
	TO authenticated
	USING (
		student_id = auth.uid() AND is_approved = true
	);

-- Policy: Allow faculty to read their assigned CIA marks
CREATE POLICY "Faculty can read their assigned cia marks"
	ON public.cia_marks
	FOR SELECT
	TO authenticated
	USING (faculty_id = auth.uid());

-- Policy: Allow authenticated users to insert CIA marks
CREATE POLICY "Authenticated users can insert cia marks"
	ON public.cia_marks
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

-- Policy: Allow faculty to update their own CIA marks (if not locked)
CREATE POLICY "Faculty can update their own cia marks"
	ON public.cia_marks
	FOR UPDATE
	TO authenticated
	USING (faculty_id = auth.uid() AND is_locked = false)
	WITH CHECK (faculty_id = auth.uid() AND is_locked = false);

-- Policy: Allow admins to update all CIA marks
CREATE POLICY "Admins can update all cia marks"
	ON public.cia_marks
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

-- Policy: Allow admins to delete CIA marks
CREATE POLICY "Admins can delete cia marks"
	ON public.cia_marks
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
CREATE POLICY "Service role can manage all cia marks"
	ON public.cia_marks
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION submit_cia_marks(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_cia_marks(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_cia_marks(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_cia_marks(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION lock_cia_marks(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_cia_marks(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_approve_cia_marks(UUID[], UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_lock_cia_marks(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cia_marks_statistics(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_student_cia_marks(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_faculty_cia_marks_summary(UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION submit_cia_marks(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION approve_cia_marks(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reject_cia_marks(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION verify_cia_marks(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION lock_cia_marks(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION unlock_cia_marks(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_approve_cia_marks(UUID[], UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_lock_cia_marks(UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_cia_marks_statistics(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_student_cia_marks(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_faculty_cia_marks_summary(UUID, UUID) TO service_role;

-- =====================================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.cia_marks IS 'Tracks CIA (Continuous Internal Assessment) marks - duplicate of internal_marks for MyJKKN sync workflow';
COMMENT ON VIEW public.cia_marks_detailed_view IS 'Denormalized view of CIA marks with all related entity information';
COMMENT ON VIEW public.cia_marks_summary_view IS 'Statistical summary of CIA marks grouped by institution, session, program, and course';
COMMENT ON VIEW public.cia_marks_pending_approval IS 'View of CIA marks awaiting approval';
COMMENT ON VIEW public.faculty_cia_marks_view IS 'Faculty-wise CIA marks summary';
COMMENT ON VIEW public.student_cia_marks_view IS 'Student-accessible CIA marks view';
COMMENT ON VIEW public.cia_marks_component_analysis IS 'Component-wise analysis of CIA marks';

COMMENT ON COLUMN public.cia_marks.total_internal_marks IS 'Auto-calculated total of all component marks';
COMMENT ON COLUMN public.cia_marks.internal_percentage IS 'Auto-calculated percentage based on total marks and maximum';
COMMENT ON COLUMN public.cia_marks.marks_status IS 'Current status: Draft, Submitted, Approved, Verified, Locked, Rejected, Pending Review';
COMMENT ON COLUMN public.cia_marks.is_approved IS 'Indicates if marks have been approved by authorized personnel';
COMMENT ON COLUMN public.cia_marks.is_verified IS 'Indicates if marks have been verified';
COMMENT ON COLUMN public.cia_marks.is_locked IS 'Indicates if marks are locked and cannot be modified';
COMMENT ON COLUMN public.cia_marks.grade IS 'Grade for status-based papers (Commended, Highly Commended, AAA). NULL for mark-based papers.';

COMMENT ON FUNCTION submit_cia_marks(UUID) IS 'Submits draft CIA marks for approval';
COMMENT ON FUNCTION approve_cia_marks(UUID, UUID, TEXT) IS 'Approves submitted CIA marks';
COMMENT ON FUNCTION reject_cia_marks(UUID, TEXT) IS 'Rejects submitted CIA marks with remarks';
COMMENT ON FUNCTION verify_cia_marks(UUID, UUID, TEXT) IS 'Verifies approved CIA marks';
COMMENT ON FUNCTION lock_cia_marks(UUID, UUID) IS 'Locks verified CIA marks to prevent modifications';
COMMENT ON FUNCTION unlock_cia_marks(UUID) IS 'Unlocks locked CIA marks for modifications';
COMMENT ON FUNCTION bulk_approve_cia_marks(UUID[], UUID, TEXT) IS 'Approves multiple CIA marks in bulk';
COMMENT ON FUNCTION bulk_lock_cia_marks(UUID[], UUID) IS 'Locks multiple CIA marks in bulk';
COMMENT ON FUNCTION get_cia_marks_statistics(UUID, UUID, UUID) IS 'Returns statistical summary of CIA marks';
COMMENT ON FUNCTION get_student_cia_marks(UUID, UUID) IS 'Retrieves CIA marks for a specific student';
COMMENT ON FUNCTION get_faculty_cia_marks_summary(UUID, UUID) IS 'Returns CIA marks summary for a faculty member';

-- =====================================================
-- 10. ENABLE REALTIME (OPTIONAL)
-- =====================================================

-- Enable realtime for cia_marks table if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE cia_marks;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
