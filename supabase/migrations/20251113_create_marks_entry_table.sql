-- =====================================================
-- Marks Entry Table with RLS, Functions, and Views
-- =====================================================
-- Date: 2025-11-13
-- Purpose: Track marks/grades entry for answer sheet evaluation
-- =====================================================

-- =====================================================
-- 1. CREATE MARKS ENTRY TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.marks_entry (
	id UUID NOT NULL DEFAULT gen_random_uuid(),
	
	-- Core References
	institutions_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	answer_sheet_id UUID NOT NULL,
	examiner_assignment_id UUID NOT NULL,
	exam_registration_id UUID NOT NULL,
	student_dummy_number_id UUID NOT NULL,
	program_id UUID NOT NULL,
	course_id UUID NOT NULL,
	
	-- Blind Evaluation
	dummy_number VARCHAR(50) NOT NULL, -- Evaluator sees this, not student ID
	
	-- Marks Details
	question_wise_marks JSONB, -- {q1: 5, q2: 4, q3: 3.5}
	total_marks_obtained DECIMAL(5,2) NOT NULL,
	total_marks_in_words VARCHAR(255) NOT NULL,
	marks_out_of DECIMAL(5,2) NOT NULL,
	percentage DECIMAL(5,2) GENERATED ALWAYS AS (
		CASE 
			WHEN marks_out_of > 0 THEN ROUND((total_marks_obtained / marks_out_of) * 100, 2)
			ELSE 0
		END
	) STORED,
	
	-- Evaluation Metadata
	evaluation_date DATE NOT NULL,
	evaluation_time_minutes INT,
	evaluator_remarks TEXT,
	
	-- Moderation Details
	is_moderated BOOLEAN DEFAULT false,
	moderated_by UUID,
	moderation_date DATE,
	marks_before_moderation DECIMAL(5,2),
	marks_after_moderation DECIMAL(5,2),
	moderation_difference DECIMAL(5,2) GENERATED ALWAYS AS (
		CASE 
			WHEN marks_after_moderation IS NOT NULL AND marks_before_moderation IS NOT NULL 
			THEN marks_after_moderation - marks_before_moderation
			ELSE NULL
		END
	) STORED,
	moderation_remarks TEXT,
	
	-- Status Management
	entry_status VARCHAR(50) DEFAULT 'Draft', -- Draft, Submitted, Verified, Locked, Rejected
	submitted_at TIMESTAMP WITH TIME ZONE,
	verified_by UUID,
	verified_at TIMESTAMP WITH TIME ZONE,
	locked_by UUID,
	locked_at TIMESTAMP WITH TIME ZONE,
	is_active BOOLEAN DEFAULT true,
	
	-- Audit Fields
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID,
	updated_by UUID,
	
	-- Primary Key
	CONSTRAINT marks_entry_pkey PRIMARY KEY (id),
	
	-- Foreign Key Constraints
	CONSTRAINT marks_entry_institutions_id_fkey 
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE CASCADE,
	CONSTRAINT marks_entry_examination_session_id_fkey 
		FOREIGN KEY (examination_session_id) REFERENCES examination_sessions(id) ON DELETE CASCADE,
	CONSTRAINT marks_entry_answer_sheet_id_fkey 
		FOREIGN KEY (answer_sheet_id) REFERENCES answer_sheets(id) ON DELETE CASCADE,
	CONSTRAINT marks_entry_examiner_assignment_id_fkey 
		FOREIGN KEY (examiner_assignment_id) REFERENCES examiner_assignments(id) ON DELETE RESTRICT,
	CONSTRAINT marks_entry_exam_registration_id_fkey 
		FOREIGN KEY (exam_registration_id) REFERENCES exam_registrations(id) ON DELETE CASCADE,
	CONSTRAINT marks_entry_student_dummy_number_id_fkey 
		FOREIGN KEY (student_dummy_number_id) REFERENCES student_dummy_numbers(id) ON DELETE RESTRICT,
	CONSTRAINT marks_entry_program_id_fkey 
		FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
	CONSTRAINT marks_entry_course_id_fkey 
		FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
	CONSTRAINT marks_entry_moderated_by_fkey 
		FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT marks_entry_verified_by_fkey 
		FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT marks_entry_locked_by_fkey 
		FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT marks_entry_created_by_fkey 
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT marks_entry_updated_by_fkey 
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
	
	-- Unique Constraints
	CONSTRAINT unique_marks_entry 
		UNIQUE(institutions_id, answer_sheet_id, examiner_assignment_id),
	CONSTRAINT unique_marks_entry_per_sheet 
		UNIQUE(answer_sheet_id, examiner_assignment_id),
	
	-- Check Constraints
	CONSTRAINT check_marks_obtained_valid 
		CHECK (total_marks_obtained >= 0 AND total_marks_obtained <= marks_out_of),
	CONSTRAINT check_marks_out_of_positive 
		CHECK (marks_out_of > 0),
	CONSTRAINT check_evaluation_time_positive 
		CHECK (evaluation_time_minutes IS NULL OR evaluation_time_minutes > 0),
	CONSTRAINT check_valid_entry_status 
		CHECK (entry_status IN ('Draft', 'Submitted', 'Verified', 'Locked', 'Rejected', 'Pending Review')),
	CONSTRAINT check_moderation_marks_valid 
		CHECK (
			(marks_before_moderation IS NULL AND marks_after_moderation IS NULL) OR
			(marks_before_moderation IS NOT NULL AND marks_after_moderation IS NOT NULL AND 
			 marks_before_moderation >= 0 AND marks_after_moderation >= 0 AND
			 marks_after_moderation <= marks_out_of)
		),
	CONSTRAINT check_moderation_consistency 
		CHECK (
			(is_moderated = false AND moderated_by IS NULL AND moderation_date IS NULL) OR
			(is_moderated = true AND moderated_by IS NOT NULL AND moderation_date IS NOT NULL)
		),
	CONSTRAINT check_verification_consistency 
		CHECK (
			(entry_status != 'Verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
		),
	CONSTRAINT check_locked_consistency 
		CHECK (
			(entry_status != 'Locked' OR (locked_by IS NOT NULL AND locked_at IS NOT NULL))
		)
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_marks_entry_institutions_id 
	ON public.marks_entry(institutions_id);
CREATE INDEX IF NOT EXISTS idx_marks_entry_examination_session_id 
	ON public.marks_entry(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_marks_entry_answer_sheet_id 
	ON public.marks_entry(answer_sheet_id);
CREATE INDEX IF NOT EXISTS idx_marks_entry_examiner_assignment_id 
	ON public.marks_entry(examiner_assignment_id);
CREATE INDEX IF NOT EXISTS idx_marks_entry_exam_registration_id 
	ON public.marks_entry(exam_registration_id);
CREATE INDEX IF NOT EXISTS idx_marks_entry_student_dummy_number_id 
	ON public.marks_entry(student_dummy_number_id);
CREATE INDEX IF NOT EXISTS idx_marks_entry_program_id 
	ON public.marks_entry(program_id);
CREATE INDEX IF NOT EXISTS idx_marks_entry_course_id 
	ON public.marks_entry(course_id);

-- Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_marks_entry_dummy_number 
	ON public.marks_entry(dummy_number);
CREATE INDEX IF NOT EXISTS idx_marks_entry_entry_status 
	ON public.marks_entry(entry_status);
CREATE INDEX IF NOT EXISTS idx_marks_entry_is_moderated 
	ON public.marks_entry(is_moderated);
CREATE INDEX IF NOT EXISTS idx_marks_entry_is_active 
	ON public.marks_entry(is_active);

-- User Tracking Indexes
CREATE INDEX IF NOT EXISTS idx_marks_entry_moderated_by 
	ON public.marks_entry(moderated_by) WHERE moderated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_entry_verified_by 
	ON public.marks_entry(verified_by) WHERE verified_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_entry_locked_by 
	ON public.marks_entry(locked_by) WHERE locked_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_entry_created_by 
	ON public.marks_entry(created_by) WHERE created_by IS NOT NULL;

-- Date Indexes
CREATE INDEX IF NOT EXISTS idx_marks_entry_evaluation_date 
	ON public.marks_entry(evaluation_date);
CREATE INDEX IF NOT EXISTS idx_marks_entry_moderation_date 
	ON public.marks_entry(moderation_date) WHERE moderation_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_entry_submitted_at 
	ON public.marks_entry(submitted_at) WHERE submitted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_entry_verified_at 
	ON public.marks_entry(verified_at) WHERE verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_entry_created_at 
	ON public.marks_entry(created_at DESC);

-- Marks Range Indexes
CREATE INDEX IF NOT EXISTS idx_marks_entry_total_marks 
	ON public.marks_entry(total_marks_obtained);
CREATE INDEX IF NOT EXISTS idx_marks_entry_percentage 
	ON public.marks_entry(percentage);

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS idx_marks_entry_session_status 
	ON public.marks_entry(examination_session_id, entry_status);
CREATE INDEX IF NOT EXISTS idx_marks_entry_session_course 
	ON public.marks_entry(examination_session_id, course_id);
CREATE INDEX IF NOT EXISTS idx_marks_entry_program_status 
	ON public.marks_entry(program_id, entry_status);
CREATE INDEX IF NOT EXISTS idx_marks_entry_assignment_status 
	ON public.marks_entry(examiner_assignment_id, entry_status);
CREATE INDEX IF NOT EXISTS idx_marks_entry_institution_session_status 
	ON public.marks_entry(institutions_id, examination_session_id, entry_status);

-- JSONB Index for question-wise marks
CREATE INDEX IF NOT EXISTS idx_marks_entry_question_wise_marks 
	ON public.marks_entry USING gin(question_wise_marks);

-- Partial Indexes for Specific Queries
CREATE INDEX IF NOT EXISTS idx_marks_entry_pending_verification 
	ON public.marks_entry(id, examination_session_id, submitted_at) 
	WHERE entry_status = 'Submitted' AND verified_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_marks_entry_pending_moderation 
	ON public.marks_entry(id, examination_session_id) 
	WHERE is_moderated = false AND entry_status IN ('Submitted', 'Verified');
CREATE INDEX IF NOT EXISTS idx_marks_entry_moderated_entries 
	ON public.marks_entry(id, moderation_date, moderation_difference) 
	WHERE is_moderated = true;
CREATE INDEX IF NOT EXISTS idx_marks_entry_locked_entries 
	ON public.marks_entry(id, locked_at, locked_by) 
	WHERE entry_status = 'Locked';
CREATE INDEX IF NOT EXISTS idx_marks_entry_active_entries 
	ON public.marks_entry(id, entry_status, created_at) 
	WHERE is_active = true;

-- =====================================================
-- 3. CREATE TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_marks_entry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_marks_entry_updated_at
	BEFORE UPDATE ON public.marks_entry
	FOR EACH ROW
	EXECUTE FUNCTION update_marks_entry_updated_at();

-- Auto-populate submitted_at when status changes to Submitted
CREATE OR REPLACE FUNCTION auto_populate_marks_submitted_at()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.entry_status = 'Submitted' AND OLD.entry_status != 'Submitted' AND NEW.submitted_at IS NULL THEN
		NEW.submitted_at = CURRENT_TIMESTAMP;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_marks_submitted_at
	BEFORE UPDATE ON public.marks_entry
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_marks_submitted_at();

-- Auto-populate verified_at when status changes to Verified
CREATE OR REPLACE FUNCTION auto_populate_marks_verified_at()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.entry_status = 'Verified' AND OLD.entry_status != 'Verified' THEN
		NEW.verified_at = CURRENT_TIMESTAMP;
		IF NEW.verified_by IS NULL THEN
			NEW.verified_by = auth.uid();
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_marks_verified_at
	BEFORE UPDATE ON public.marks_entry
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_marks_verified_at();

-- Auto-populate locked_at when status changes to Locked
CREATE OR REPLACE FUNCTION auto_populate_marks_locked_at()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.entry_status = 'Locked' AND (OLD.entry_status IS NULL OR OLD.entry_status != 'Locked') THEN
		NEW.locked_at = CURRENT_TIMESTAMP;
		IF NEW.locked_by IS NULL THEN
			NEW.locked_by = auth.uid();
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_marks_locked_at
	BEFORE UPDATE ON public.marks_entry
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_marks_locked_at();

-- Prevent modification of locked entries
CREATE OR REPLACE FUNCTION prevent_locked_marks_modification()
RETURNS TRIGGER AS $$
BEGIN
	IF OLD.entry_status = 'Locked' AND NEW.entry_status != 'Locked' THEN
		RAISE EXCEPTION 'Cannot modify locked marks entry. Entry must be unlocked first.';
	END IF;
	
	IF OLD.entry_status = 'Locked' AND (
		NEW.total_marks_obtained != OLD.total_marks_obtained OR
		NEW.question_wise_marks != OLD.question_wise_marks
	) THEN
		RAISE EXCEPTION 'Cannot modify marks in a locked entry';
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_locked_marks_modification
	BEFORE UPDATE ON public.marks_entry
	FOR EACH ROW
	EXECUTE FUNCTION prevent_locked_marks_modification();

-- Validate moderation data
CREATE OR REPLACE FUNCTION validate_moderation_data()
RETURNS TRIGGER AS $$
BEGIN
	-- When marking as moderated, ensure all moderation fields are filled
	IF NEW.is_moderated = true THEN
		IF NEW.moderated_by IS NULL THEN
			NEW.moderated_by = auth.uid();
		END IF;
		IF NEW.moderation_date IS NULL THEN
			NEW.moderation_date = CURRENT_DATE;
		END IF;
		IF NEW.marks_before_moderation IS NULL THEN
			NEW.marks_before_moderation = OLD.total_marks_obtained;
		END IF;
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_moderation_data
	BEFORE UPDATE ON public.marks_entry
	FOR EACH ROW
	EXECUTE FUNCTION validate_moderation_data();

-- Update answer sheet status when marks are entered
CREATE OR REPLACE FUNCTION update_answer_sheet_on_marks_entry()
RETURNS TRIGGER AS $$
BEGIN
	-- Update answer sheet status based on marks entry status
	IF NEW.entry_status = 'Verified' OR NEW.entry_status = 'Locked' THEN
		UPDATE public.answer_sheets
		SET 
			sheet_status = 'Evaluated',
			updated_at = CURRENT_TIMESTAMP
		WHERE id = NEW.answer_sheet_id
			AND sheet_status != 'Evaluated';
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_answer_sheet_on_marks_entry
	AFTER INSERT OR UPDATE ON public.marks_entry
	FOR EACH ROW
	EXECUTE FUNCTION update_answer_sheet_on_marks_entry();

-- Update examiner assignment progress
CREATE OR REPLACE FUNCTION update_examiner_progress_on_marks()
RETURNS TRIGGER AS $$
BEGIN
	-- Increment sheets_evaluated when marks are submitted
	IF TG_OP = 'INSERT' AND NEW.entry_status IN ('Submitted', 'Verified', 'Locked') THEN
		UPDATE public.examiner_assignments
		SET 
			sheets_evaluated = sheets_evaluated + 1,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = NEW.examiner_assignment_id;
	END IF;
	
	-- Update status when entry is submitted/verified
	IF TG_OP = 'UPDATE' AND OLD.entry_status = 'Draft' AND NEW.entry_status IN ('Submitted', 'Verified') THEN
		UPDATE public.examiner_assignments
		SET 
			sheets_evaluated = sheets_evaluated + 1,
			assignment_status = CASE 
				WHEN assignment_status = 'Assigned' THEN 'In Progress'
				ELSE assignment_status
			END,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = NEW.examiner_assignment_id;
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_examiner_progress_on_marks
	AFTER INSERT OR UPDATE ON public.marks_entry
	FOR EACH ROW
	EXECUTE FUNCTION update_examiner_progress_on_marks();

-- =====================================================
-- 4. CREATE VIEWS
-- =====================================================

-- Detailed Marks Entry View with all related data
CREATE OR REPLACE VIEW public.marks_entry_detailed_view AS
SELECT
	-- Marks Entry Details
	me.id,
	me.dummy_number,
	me.question_wise_marks,
	me.total_marks_obtained,
	me.total_marks_in_words,
	me.marks_out_of,
	me.percentage,
	me.evaluation_date,
	me.evaluation_time_minutes,
	me.evaluator_remarks,
	
	-- Moderation Details
	me.is_moderated,
	me.moderation_date,
	me.marks_before_moderation,
	me.marks_after_moderation,
	me.moderation_difference,
	me.moderation_remarks,
	me.moderated_by,
	mu.full_name AS moderated_by_name,
	
	-- Status Details
	me.entry_status,
	me.submitted_at,
	me.verified_by,
	me.verified_at,
	vu.full_name AS verified_by_name,
	me.locked_by,
	me.locked_at,
	lu.full_name AS locked_by_name,
	me.is_active,
	
	-- Answer Sheet Details
	me.answer_sheet_id,
	a.sheet_number,
	a.barcode,
	a.sheet_type,
	a.sheet_status,
	
	-- Student Dummy Number Details
	me.student_dummy_number_id,
	sdn.dummy_number AS full_dummy_number,
	sdn.actual_register_number,
	
	-- Exam Registration Details
	me.exam_registration_id,
	er.registration_number,
	er.stu_register_no,
	er.student_name,
	
	-- Institution Details
	me.institutions_id,
	i.institution_code,
	i.name AS institution_name,
	
	-- Examination Session Details
	me.examination_session_id,
	es.session_code,
	es.session_name,
	es.session_year,
	
	-- Program Details
	me.program_id,
	p.program_code,
	p.program_name,
	
	-- Course Details
	me.course_id,
	c.course_code,
	c.course_name,
	
	-- Examiner Assignment Details
	me.examiner_assignment_id,
	ea.evaluator_type,
	ea.evaluator_name,
	
	-- Audit Fields
	me.created_at,
	me.updated_at,
	me.created_by,
	me.updated_by,
	cu.full_name AS created_by_name
FROM public.marks_entry me
LEFT JOIN public.users mu ON me.moderated_by = mu.id
LEFT JOIN public.users vu ON me.verified_by = vu.id
LEFT JOIN public.users lu ON me.locked_by = lu.id
LEFT JOIN public.users cu ON me.created_by = cu.id
LEFT JOIN public.answer_sheets a ON me.answer_sheet_id = a.id
LEFT JOIN public.student_dummy_numbers sdn ON me.student_dummy_number_id = sdn.id
LEFT JOIN public.exam_registrations er ON me.exam_registration_id = er.id
LEFT JOIN public.institutions i ON me.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON me.examination_session_id = es.id
LEFT JOIN public.programs p ON me.program_id = p.id
LEFT JOIN public.courses c ON me.course_id = c.id
LEFT JOIN public.examiner_assignments ea ON me.examiner_assignment_id = ea.id;

-- Marks Entry Summary View for reporting
CREATE OR REPLACE VIEW public.marks_entry_summary_view AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	c.course_code,
	c.course_name,
	COUNT(*) AS total_entries,
	COUNT(*) FILTER (WHERE me.entry_status = 'Draft') AS draft_count,
	COUNT(*) FILTER (WHERE me.entry_status = 'Submitted') AS submitted_count,
	COUNT(*) FILTER (WHERE me.entry_status = 'Verified') AS verified_count,
	COUNT(*) FILTER (WHERE me.entry_status = 'Locked') AS locked_count,
	COUNT(*) FILTER (WHERE me.is_moderated = true) AS moderated_count,
	ROUND(AVG(me.total_marks_obtained), 2) AS average_marks,
	ROUND(AVG(me.percentage), 2) AS average_percentage,
	MIN(me.total_marks_obtained) AS min_marks,
	MAX(me.total_marks_obtained) AS max_marks,
	ROUND(STDDEV(me.total_marks_obtained), 2) AS marks_std_deviation,
	COUNT(*) FILTER (WHERE me.percentage >= 90) AS grade_o_count,
	COUNT(*) FILTER (WHERE me.percentage >= 80 AND me.percentage < 90) AS grade_a_plus_count,
	COUNT(*) FILTER (WHERE me.percentage >= 70 AND me.percentage < 80) AS grade_a_count,
	COUNT(*) FILTER (WHERE me.percentage >= 60 AND me.percentage < 70) AS grade_b_plus_count,
	COUNT(*) FILTER (WHERE me.percentage >= 50 AND me.percentage < 60) AS grade_b_count,
	COUNT(*) FILTER (WHERE me.percentage < 50) AS below_50_count
FROM public.marks_entry me
LEFT JOIN public.institutions i ON me.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON me.examination_session_id = es.id
LEFT JOIN public.programs p ON me.program_id = p.id
LEFT JOIN public.courses c ON me.course_id = c.id
WHERE me.is_active = true
	AND me.entry_status IN ('Verified', 'Locked')
GROUP BY
	i.institution_code, i.name,
	es.session_code, es.session_name,
	p.program_code, p.program_name,
	c.course_code, c.course_name;

-- Pending Verification View
CREATE OR REPLACE VIEW public.marks_entry_pending_verification AS
SELECT
	me.id,
	me.dummy_number,
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	c.course_name,
	ea.evaluator_name,
	ea.evaluator_type,
	me.total_marks_obtained,
	me.marks_out_of,
	me.percentage,
	me.submitted_at,
	EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - me.submitted_at)) / 3600 AS hours_since_submission
FROM public.marks_entry me
LEFT JOIN public.institutions i ON me.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON me.examination_session_id = es.id
LEFT JOIN public.programs p ON me.program_id = p.id
LEFT JOIN public.courses c ON me.course_id = c.id
LEFT JOIN public.examiner_assignments ea ON me.examiner_assignment_id = ea.id
WHERE me.entry_status = 'Submitted'
	AND me.verified_by IS NULL
	AND me.is_active = true
ORDER BY me.submitted_at ASC;

-- Moderation Analysis View
CREATE OR REPLACE VIEW public.marks_entry_moderation_analysis AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	c.course_code,
	c.course_name,
	ea.evaluator_name,
	ea.evaluator_type,
	COUNT(*) AS total_moderated,
	ROUND(AVG(me.marks_before_moderation), 2) AS avg_marks_before,
	ROUND(AVG(me.marks_after_moderation), 2) AS avg_marks_after,
	ROUND(AVG(me.moderation_difference), 2) AS avg_difference,
	MIN(me.moderation_difference) AS min_difference,
	MAX(me.moderation_difference) AS max_difference,
	COUNT(*) FILTER (WHERE me.moderation_difference > 0) AS marks_increased_count,
	COUNT(*) FILTER (WHERE me.moderation_difference < 0) AS marks_decreased_count,
	COUNT(*) FILTER (WHERE me.moderation_difference = 0) AS marks_unchanged_count,
	COUNT(*) FILTER (WHERE ABS(me.moderation_difference) > 5) AS significant_change_count
FROM public.marks_entry me
LEFT JOIN public.institutions i ON me.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON me.examination_session_id = es.id
LEFT JOIN public.programs p ON me.program_id = p.id
LEFT JOIN public.courses c ON me.course_id = c.id
LEFT JOIN public.examiner_assignments ea ON me.examiner_assignment_id = ea.id
WHERE me.is_moderated = true
	AND me.is_active = true
GROUP BY
	i.institution_code, i.name,
	es.session_code, es.session_name,
	p.program_code, p.program_name,
	c.course_code, c.course_name,
	ea.evaluator_name, ea.evaluator_type;

-- Evaluator Performance View
CREATE OR REPLACE VIEW public.evaluator_performance_view AS
SELECT
	ea.evaluator_id,
	ea.evaluator_name,
	ea.evaluator_type,
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	COUNT(*) AS total_evaluated,
	COUNT(*) FILTER (WHERE me.entry_status = 'Verified') AS verified_count,
	COUNT(*) FILTER (WHERE me.entry_status = 'Locked') AS locked_count,
	COUNT(*) FILTER (WHERE me.is_moderated = true) AS moderated_count,
	ROUND(AVG(me.total_marks_obtained), 2) AS avg_marks_given,
	ROUND(AVG(me.percentage), 2) AS avg_percentage,
	ROUND(AVG(me.evaluation_time_minutes), 2) AS avg_evaluation_time,
	MIN(me.evaluation_date) AS first_evaluation_date,
	MAX(me.evaluation_date) AS last_evaluation_date,
	COUNT(DISTINCT DATE(me.evaluation_date)) AS days_active,
	ROUND(AVG(ABS(me.moderation_difference)), 2) AS avg_moderation_adjustment
FROM public.marks_entry me
LEFT JOIN public.examiner_assignments ea ON me.examiner_assignment_id = ea.id
LEFT JOIN public.institutions i ON me.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON me.examination_session_id = es.id
LEFT JOIN public.programs p ON me.program_id = p.id
LEFT JOIN public.courses c ON me.course_id = c.id
WHERE me.is_active = true
	AND me.entry_status != 'Draft'
GROUP BY
	ea.evaluator_id, ea.evaluator_name, ea.evaluator_type,
	i.institution_code, es.session_code,
	p.program_code, c.course_code;

-- =====================================================
-- 5. CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to submit marks entry
CREATE OR REPLACE FUNCTION submit_marks_entry(
	p_marks_entry_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.marks_entry
	SET
		entry_status = 'Submitted',
		submitted_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_marks_entry_id
		AND entry_status = 'Draft';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify marks entry
CREATE OR REPLACE FUNCTION verify_marks_entry(
	p_marks_entry_id UUID,
	p_verified_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_verified_by UUID;
BEGIN
	v_verified_by := COALESCE(p_verified_by, auth.uid());
	
	UPDATE public.marks_entry
	SET
		entry_status = 'Verified',
		verified_by = v_verified_by,
		verified_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_verified_by
	WHERE id = p_marks_entry_id
		AND entry_status = 'Submitted';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to lock marks entry
CREATE OR REPLACE FUNCTION lock_marks_entry(
	p_marks_entry_id UUID,
	p_locked_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_locked_by UUID;
BEGIN
	v_locked_by := COALESCE(p_locked_by, auth.uid());
	
	UPDATE public.marks_entry
	SET
		entry_status = 'Locked',
		locked_by = v_locked_by,
		locked_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_locked_by
	WHERE id = p_marks_entry_id
		AND entry_status = 'Verified';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to unlock marks entry
CREATE OR REPLACE FUNCTION unlock_marks_entry(
	p_marks_entry_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.marks_entry
	SET
		entry_status = 'Verified',
		locked_by = NULL,
		locked_at = NULL,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_marks_entry_id
		AND entry_status = 'Locked';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to moderate marks
CREATE OR REPLACE FUNCTION moderate_marks_entry(
	p_marks_entry_id UUID,
	p_marks_after_moderation DECIMAL,
	p_moderation_remarks TEXT DEFAULT NULL,
	p_moderated_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_moderated_by UUID;
	v_marks_before DECIMAL;
BEGIN
	v_moderated_by := COALESCE(p_moderated_by, auth.uid());
	
	-- Get current marks
	SELECT total_marks_obtained INTO v_marks_before
	FROM public.marks_entry
	WHERE id = p_marks_entry_id;
	
	-- Update with moderation
	UPDATE public.marks_entry
	SET
		is_moderated = true,
		moderated_by = v_moderated_by,
		moderation_date = CURRENT_DATE,
		marks_before_moderation = v_marks_before,
		marks_after_moderation = p_marks_after_moderation,
		total_marks_obtained = p_marks_after_moderation,
		moderation_remarks = COALESCE(p_moderation_remarks, moderation_remarks),
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_moderated_by
	WHERE id = p_marks_entry_id
		AND entry_status IN ('Submitted', 'Verified');
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk verify marks entries
CREATE OR REPLACE FUNCTION bulk_verify_marks_entries(
	p_marks_entry_ids UUID[],
	p_verified_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_verified_by UUID;
	v_updated_count INT;
BEGIN
	v_verified_by := COALESCE(p_verified_by, auth.uid());
	
	UPDATE public.marks_entry
	SET
		entry_status = 'Verified',
		verified_by = v_verified_by,
		verified_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_verified_by
	WHERE id = ANY(p_marks_entry_ids)
		AND entry_status = 'Submitted';
	
	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk lock marks entries
CREATE OR REPLACE FUNCTION bulk_lock_marks_entries(
	p_marks_entry_ids UUID[],
	p_locked_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_locked_by UUID;
	v_updated_count INT;
BEGIN
	v_locked_by := COALESCE(p_locked_by, auth.uid());
	
	UPDATE public.marks_entry
	SET
		entry_status = 'Locked',
		locked_by = v_locked_by,
		locked_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_locked_by
	WHERE id = ANY(p_marks_entry_ids)
		AND entry_status = 'Verified';
	
	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get marks statistics
CREATE OR REPLACE FUNCTION get_marks_statistics(
	p_examination_session_id UUID DEFAULT NULL,
	p_program_id UUID DEFAULT NULL,
	p_course_id UUID DEFAULT NULL
)
RETURNS TABLE (
	total_entries BIGINT,
	draft_count BIGINT,
	submitted_count BIGINT,
	verified_count BIGINT,
	locked_count BIGINT,
	average_marks NUMERIC,
	average_percentage NUMERIC,
	min_marks NUMERIC,
	max_marks NUMERIC,
	pass_count BIGINT,
	fail_count BIGINT
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		COUNT(*) AS total_entries,
		COUNT(*) FILTER (WHERE me.entry_status = 'Draft') AS draft_count,
		COUNT(*) FILTER (WHERE me.entry_status = 'Submitted') AS submitted_count,
		COUNT(*) FILTER (WHERE me.entry_status = 'Verified') AS verified_count,
		COUNT(*) FILTER (WHERE me.entry_status = 'Locked') AS locked_count,
		ROUND(AVG(me.total_marks_obtained), 2) AS average_marks,
		ROUND(AVG(me.percentage), 2) AS average_percentage,
		MIN(me.total_marks_obtained) AS min_marks,
		MAX(me.total_marks_obtained) AS max_marks,
		COUNT(*) FILTER (WHERE me.percentage >= 50) AS pass_count,
		COUNT(*) FILTER (WHERE me.percentage < 50) AS fail_count
	FROM public.marks_entry me
	WHERE me.is_active = true
		AND (p_examination_session_id IS NULL OR me.examination_session_id = p_examination_session_id)
		AND (p_program_id IS NULL OR me.program_id = p_program_id)
		AND (p_course_id IS NULL OR me.course_id = p_course_id)
		AND me.entry_status IN ('Verified', 'Locked');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get marks by dummy number
CREATE OR REPLACE FUNCTION get_marks_by_dummy_number(
	p_dummy_number TEXT
)
RETURNS TABLE (
	id UUID,
	dummy_number TEXT,
	course_code TEXT,
	course_name TEXT,
	total_marks_obtained NUMERIC,
	marks_out_of NUMERIC,
	percentage NUMERIC,
	entry_status TEXT,
	evaluation_date DATE,
	is_moderated BOOLEAN
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		me.id,
		me.dummy_number,
		c.course_code::TEXT,
		c.course_name::TEXT,
		me.total_marks_obtained,
		me.marks_out_of,
		me.percentage,
		me.entry_status::TEXT,
		me.evaluation_date,
		me.is_moderated
	FROM public.marks_entry me
	LEFT JOIN public.courses c ON me.course_id = c.id
	WHERE me.dummy_number = p_dummy_number
		AND me.is_active = true
	ORDER BY me.evaluation_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate grade distribution
CREATE OR REPLACE FUNCTION get_grade_distribution(
	p_examination_session_id UUID,
	p_course_id UUID DEFAULT NULL
)
RETURNS TABLE (
	grade_range TEXT,
	count BIGINT,
	percentage NUMERIC
) AS $$
DECLARE
	v_total_count BIGINT;
BEGIN
	-- Get total count
	SELECT COUNT(*) INTO v_total_count
	FROM public.marks_entry me
	WHERE me.examination_session_id = p_examination_session_id
		AND (p_course_id IS NULL OR me.course_id = p_course_id)
		AND me.entry_status IN ('Verified', 'Locked')
		AND me.is_active = true;
	
	RETURN QUERY
	SELECT
		grade_range::TEXT,
		count::BIGINT,
		ROUND((count::NUMERIC / NULLIF(v_total_count, 0)) * 100, 2) AS percentage
	FROM (
		SELECT '90-100 (O)' AS grade_range, COUNT(*) AS count
		FROM public.marks_entry me
		WHERE me.examination_session_id = p_examination_session_id
			AND (p_course_id IS NULL OR me.course_id = p_course_id)
			AND me.percentage >= 90
			AND me.entry_status IN ('Verified', 'Locked')
			AND me.is_active = true
		
		UNION ALL
		
		SELECT '80-89 (A+)' AS grade_range, COUNT(*) AS count
		FROM public.marks_entry me
		WHERE me.examination_session_id = p_examination_session_id
			AND (p_course_id IS NULL OR me.course_id = p_course_id)
			AND me.percentage >= 80 AND me.percentage < 90
			AND me.entry_status IN ('Verified', 'Locked')
			AND me.is_active = true
		
		UNION ALL
		
		SELECT '70-79 (A)' AS grade_range, COUNT(*) AS count
		FROM public.marks_entry me
		WHERE me.examination_session_id = p_examination_session_id
			AND (p_course_id IS NULL OR me.course_id = p_course_id)
			AND me.percentage >= 70 AND me.percentage < 80
			AND me.entry_status IN ('Verified', 'Locked')
			AND me.is_active = true
		
		UNION ALL
		
		SELECT '60-69 (B+)' AS grade_range, COUNT(*) AS count
		FROM public.marks_entry me
		WHERE me.examination_session_id = p_examination_session_id
			AND (p_course_id IS NULL OR me.course_id = p_course_id)
			AND me.percentage >= 60 AND me.percentage < 70
			AND me.entry_status IN ('Verified', 'Locked')
			AND me.is_active = true
		
		UNION ALL
		
		SELECT '50-59 (B)' AS grade_range, COUNT(*) AS count
		FROM public.marks_entry me
		WHERE me.examination_session_id = p_examination_session_id
			AND (p_course_id IS NULL OR me.course_id = p_course_id)
			AND me.percentage >= 50 AND me.percentage < 60
			AND me.entry_status IN ('Verified', 'Locked')
			AND me.is_active = true
		
		UNION ALL
		
		SELECT '<50 (RA)' AS grade_range, COUNT(*) AS count
		FROM public.marks_entry me
		WHERE me.examination_session_id = p_examination_session_id
			AND (p_course_id IS NULL OR me.course_id = p_course_id)
			AND me.percentage < 50
			AND me.entry_status IN ('Verified', 'Locked')
			AND me.is_active = true
	) grade_counts
	ORDER BY 
		CASE grade_range
			WHEN '90-100 (O)' THEN 1
			WHEN '80-89 (A+)' THEN 2
			WHEN '70-79 (A)' THEN 3
			WHEN '60-69 (B+)' THEN 4
			WHEN '50-59 (B)' THEN 5
			WHEN '<50 (RA)' THEN 6
		END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.marks_entry ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. CREATE RLS POLICIES
-- =====================================================

-- Policy: Allow authenticated users to read marks entries
CREATE POLICY "Authenticated users can read marks entries"
	ON public.marks_entry
	FOR SELECT
	TO authenticated
	USING (true);

-- Policy: Allow evaluators to read their own marks entries
CREATE POLICY "Evaluators can read their own marks entries"
	ON public.marks_entry
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM public.examiner_assignments ea
			WHERE ea.id = marks_entry.examiner_assignment_id
				AND ea.evaluator_id = auth.uid()
		)
	);

-- Policy: Allow authenticated users to insert marks entries
CREATE POLICY "Authenticated users can insert marks entries"
	ON public.marks_entry
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

-- Policy: Allow evaluators to update their own marks entries (if not locked)
CREATE POLICY "Evaluators can update their own marks entries"
	ON public.marks_entry
	FOR UPDATE
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM public.examiner_assignments ea
			WHERE ea.id = marks_entry.examiner_assignment_id
				AND ea.evaluator_id = auth.uid()
		)
		AND entry_status != 'Locked'
	)
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM public.examiner_assignments ea
			WHERE ea.id = marks_entry.examiner_assignment_id
				AND ea.evaluator_id = auth.uid()
		)
		AND entry_status != 'Locked'
	);

-- Policy: Allow admins to update all marks entries
CREATE POLICY "Admins can update all marks entries"
	ON public.marks_entry
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

-- Policy: Allow admins to delete marks entries
CREATE POLICY "Admins can delete marks entries"
	ON public.marks_entry
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
CREATE POLICY "Service role can manage all marks entries"
	ON public.marks_entry
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION submit_marks_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_marks_entry(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION lock_marks_entry(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_marks_entry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION moderate_marks_entry(UUID, DECIMAL, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_verify_marks_entries(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_lock_marks_entries(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_marks_statistics(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_marks_by_dummy_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_grade_distribution(UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION submit_marks_entry(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION verify_marks_entry(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION lock_marks_entry(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION unlock_marks_entry(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION moderate_marks_entry(UUID, DECIMAL, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_verify_marks_entries(UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_lock_marks_entries(UUID[], UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_marks_statistics(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_marks_by_dummy_number(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_grade_distribution(UUID, UUID) TO service_role;

-- =====================================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.marks_entry IS 'Tracks marks/grades entry for answer sheet evaluation with blind evaluation and moderation support';
COMMENT ON VIEW public.marks_entry_detailed_view IS 'Denormalized view of marks entries with all related entity information';
COMMENT ON VIEW public.marks_entry_summary_view IS 'Statistical summary of marks entries grouped by institution, session, program, and course';
COMMENT ON VIEW public.marks_entry_pending_verification IS 'View of marks entries awaiting verification';
COMMENT ON VIEW public.marks_entry_moderation_analysis IS 'Analysis of moderation patterns and adjustments';
COMMENT ON VIEW public.evaluator_performance_view IS 'Performance metrics for evaluators';

COMMENT ON COLUMN public.marks_entry.dummy_number IS 'Blind evaluation number - evaluator sees this instead of student ID';
COMMENT ON COLUMN public.marks_entry.question_wise_marks IS 'JSONB object containing marks for each question: {q1: 5, q2: 4, q3: 3.5}';
COMMENT ON COLUMN public.marks_entry.percentage IS 'Auto-calculated percentage based on obtained marks and total marks';
COMMENT ON COLUMN public.marks_entry.moderation_difference IS 'Auto-calculated difference between marks before and after moderation';
COMMENT ON COLUMN public.marks_entry.entry_status IS 'Current status: Draft, Submitted, Verified, Locked, Rejected, Pending Review';
COMMENT ON COLUMN public.marks_entry.is_moderated IS 'Indicates if marks have been moderated/reviewed';

COMMENT ON FUNCTION submit_marks_entry(UUID) IS 'Submits a draft marks entry for verification';
COMMENT ON FUNCTION verify_marks_entry(UUID, UUID) IS 'Verifies a submitted marks entry';
COMMENT ON FUNCTION lock_marks_entry(UUID, UUID) IS 'Locks a verified marks entry to prevent further modifications';
COMMENT ON FUNCTION unlock_marks_entry(UUID) IS 'Unlocks a locked marks entry for modifications';
COMMENT ON FUNCTION moderate_marks_entry(UUID, DECIMAL, TEXT, UUID) IS 'Moderates marks entry with new marks value';
COMMENT ON FUNCTION bulk_verify_marks_entries(UUID[], UUID) IS 'Verifies multiple marks entries in bulk';
COMMENT ON FUNCTION bulk_lock_marks_entries(UUID[], UUID) IS 'Locks multiple marks entries in bulk';
COMMENT ON FUNCTION get_marks_statistics(UUID, UUID, UUID) IS 'Returns statistical summary of marks';
COMMENT ON FUNCTION get_marks_by_dummy_number(TEXT) IS 'Retrieves marks entries for a given dummy number';
COMMENT ON FUNCTION get_grade_distribution(UUID, UUID) IS 'Calculates grade distribution for a session/course';

-- =====================================================
-- 10. ENABLE REALTIME (OPTIONAL)
-- =====================================================

-- Enable realtime for marks_entry table if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE marks_entry;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
