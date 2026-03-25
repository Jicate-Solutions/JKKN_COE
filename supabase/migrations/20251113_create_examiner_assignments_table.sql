-- =====================================================
-- Examiner Assignments Table with RLS, Functions, and Views
-- =====================================================
-- Date: 2025-11-13
-- Purpose: Track examiner/evaluator assignments for answer sheet evaluation
-- =====================================================

-- =====================================================
-- 1. CREATE EXAMINER ASSIGNMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.examiner_assignments (
	id UUID NOT NULL DEFAULT gen_random_uuid(),
	
	-- Core References
	institutions_id UUID NOT NULL,
	course_offering_id UUID NOT NULL,
	evaluator_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	program_id UUID NOT NULL,
	course_id UUID NOT NULL,
	
	-- Evaluator Details
	evaluator_type VARCHAR(50) NOT NULL, -- Internal, External, Head Examiner, Chief Examiner
	evaluator_role VARCHAR(50), -- Primary, Secondary, Moderator
	evaluator_name VARCHAR(255),
	evaluator_institution VARCHAR(255),
	evaluator_email VARCHAR(255),
	evaluator_phone VARCHAR(20),
	
	-- Assignment Details
	sheets_assigned INT DEFAULT 0,
	sheets_evaluated INT DEFAULT 0,
	sheets_pending INT GENERATED ALWAYS AS (sheets_assigned - sheets_evaluated) STORED,
	evaluation_progress NUMERIC(5,2) GENERATED ALWAYS AS (
		CASE 
			WHEN sheets_assigned > 0 THEN ROUND((sheets_evaluated::NUMERIC / sheets_assigned::NUMERIC) * 100, 2)
			ELSE 0
		END
	) STORED,
	
	-- Financial Details
	remuneration_amount DECIMAL(10,2),
	remuneration_per_sheet DECIMAL(10,2),
	total_remuneration DECIMAL(10,2) GENERATED ALWAYS AS (
		COALESCE(remuneration_per_sheet, 0) * sheets_evaluated
	) STORED,
	payment_status VARCHAR(50) DEFAULT 'Pending', -- Pending, Processed, Paid
	payment_date DATE,
	
	-- Timeline
	assignment_date DATE NOT NULL,
	start_date DATE,
	completion_deadline DATE NOT NULL,
	actual_completion_date DATE,
	
	-- Status Management
	assignment_status VARCHAR(50) DEFAULT 'Assigned', -- Assigned, In Progress, Completed, Cancelled, On Hold
	is_active BOOLEAN DEFAULT true,
	remarks TEXT,
	
	-- Audit Fields
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID,
	updated_by UUID,
	
	-- Primary Key
	CONSTRAINT examiner_assignments_pkey PRIMARY KEY (id),
	
	-- Foreign Key Constraints
	CONSTRAINT examiner_assignments_institutions_id_fkey 
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE CASCADE,
	CONSTRAINT examiner_assignments_course_offering_id_fkey 
		FOREIGN KEY (course_offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE,
	CONSTRAINT examiner_assignments_evaluator_id_fkey 
		FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE RESTRICT,
	CONSTRAINT examiner_assignments_examination_session_id_fkey 
		FOREIGN KEY (examination_session_id) REFERENCES examination_sessions(id) ON DELETE CASCADE,
	CONSTRAINT examiner_assignments_program_id_fkey 
		FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
	CONSTRAINT examiner_assignments_course_id_fkey 
		FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
	CONSTRAINT examiner_assignments_created_by_fkey 
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT examiner_assignments_updated_by_fkey 
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
	
	-- Unique Constraints
	CONSTRAINT unique_evaluator_assignment 
		UNIQUE(institutions_id, course_offering_id, evaluator_id, evaluator_type),
	
	-- Check Constraints
	CONSTRAINT check_sheets_assigned_non_negative 
		CHECK (sheets_assigned >= 0),
	CONSTRAINT check_sheets_evaluated_non_negative 
		CHECK (sheets_evaluated >= 0),
	CONSTRAINT check_sheets_evaluated_not_exceed_assigned 
		CHECK (sheets_evaluated <= sheets_assigned),
	CONSTRAINT check_valid_evaluator_type 
		CHECK (evaluator_type IN ('Internal', 'External', 'Head Examiner', 'Chief Examiner', 'Moderator', 'Scrutinizer')),
	CONSTRAINT check_valid_evaluator_role 
		CHECK (evaluator_role IS NULL OR evaluator_role IN ('Primary', 'Secondary', 'Moderator', 'Reviewer')),
	CONSTRAINT check_valid_assignment_status 
		CHECK (assignment_status IN ('Assigned', 'In Progress', 'Completed', 'Cancelled', 'On Hold', 'Overdue')),
	CONSTRAINT check_valid_payment_status 
		CHECK (payment_status IN ('Pending', 'Approved', 'Processed', 'Paid', 'Cancelled')),
	CONSTRAINT check_completion_deadline_after_assignment 
		CHECK (completion_deadline >= assignment_date),
	CONSTRAINT check_start_date_after_assignment 
		CHECK (start_date IS NULL OR start_date >= assignment_date),
	CONSTRAINT check_actual_completion_after_start 
		CHECK (actual_completion_date IS NULL OR start_date IS NULL OR actual_completion_date >= start_date),
	CONSTRAINT check_remuneration_non_negative 
		CHECK (remuneration_amount IS NULL OR remuneration_amount >= 0),
	CONSTRAINT check_remuneration_per_sheet_non_negative 
		CHECK (remuneration_per_sheet IS NULL OR remuneration_per_sheet >= 0)
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_institutions_id 
	ON public.examiner_assignments(institutions_id);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_course_offering_id 
	ON public.examiner_assignments(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_evaluator_id 
	ON public.examiner_assignments(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_examination_session_id 
	ON public.examiner_assignments(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_program_id 
	ON public.examiner_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_course_id 
	ON public.examiner_assignments(course_id);

-- Status and Type Indexes
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_assignment_status 
	ON public.examiner_assignments(assignment_status);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_payment_status 
	ON public.examiner_assignments(payment_status);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_evaluator_type 
	ON public.examiner_assignments(evaluator_type);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_evaluator_role 
	ON public.examiner_assignments(evaluator_role) WHERE evaluator_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_is_active 
	ON public.examiner_assignments(is_active);

-- Date Indexes
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_assignment_date 
	ON public.examiner_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_completion_deadline 
	ON public.examiner_assignments(completion_deadline);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_payment_date 
	ON public.examiner_assignments(payment_date) WHERE payment_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_created_at 
	ON public.examiner_assignments(created_at DESC);

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_institution_session 
	ON public.examiner_assignments(institutions_id, examination_session_id);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_session_status 
	ON public.examiner_assignments(examination_session_id, assignment_status);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_evaluator_status 
	ON public.examiner_assignments(evaluator_id, assignment_status);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_course_offering_type 
	ON public.examiner_assignments(course_offering_id, evaluator_type);
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_institution_payment 
	ON public.examiner_assignments(institutions_id, payment_status);

-- Partial Indexes for Specific Queries
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_active_assignments 
	ON public.examiner_assignments(id, evaluator_id, assignment_status) 
	WHERE is_active = true AND assignment_status IN ('Assigned', 'In Progress');
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_pending_evaluation 
	ON public.examiner_assignments(id, evaluator_id, sheets_pending) 
	WHERE assignment_status IN ('Assigned', 'In Progress') AND sheets_assigned > sheets_evaluated;
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_overdue 
	ON public.examiner_assignments(id, evaluator_id, completion_deadline, assignment_status) 
	WHERE assignment_status IN ('Assigned', 'In Progress', 'Overdue');
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_pending_payment 
	ON public.examiner_assignments(id, evaluator_id, remuneration_amount) 
	WHERE payment_status = 'Pending' AND assignment_status = 'Completed';

-- Performance Index for Workload Calculation
CREATE INDEX IF NOT EXISTS idx_examiner_assignments_workload 
	ON public.examiner_assignments(evaluator_id, sheets_assigned, sheets_evaluated, assignment_status) 
	WHERE is_active = true;

-- =====================================================
-- 3. CREATE TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_examiner_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_examiner_assignments_updated_at
	BEFORE UPDATE ON public.examiner_assignments
	FOR EACH ROW
	EXECUTE FUNCTION update_examiner_assignments_updated_at();

-- Auto-populate start_date when status changes to In Progress
CREATE OR REPLACE FUNCTION auto_populate_assignment_start_date()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.assignment_status = 'In Progress' AND OLD.assignment_status != 'In Progress' AND NEW.start_date IS NULL THEN
		NEW.start_date = CURRENT_DATE;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_assignment_start_date
	BEFORE UPDATE ON public.examiner_assignments
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_assignment_start_date();

-- Auto-populate completion date and update status
CREATE OR REPLACE FUNCTION auto_complete_assignment()
RETURNS TRIGGER AS $$
BEGIN
	-- If all sheets are evaluated, mark as completed
	IF NEW.sheets_evaluated = NEW.sheets_assigned AND NEW.sheets_assigned > 0 THEN
		IF NEW.assignment_status IN ('Assigned', 'In Progress') THEN
			NEW.assignment_status = 'Completed';
			IF NEW.actual_completion_date IS NULL THEN
				NEW.actual_completion_date = CURRENT_DATE;
			END IF;
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_complete_assignment
	BEFORE UPDATE ON public.examiner_assignments
	FOR EACH ROW
	EXECUTE FUNCTION auto_complete_assignment();

-- Check for overdue assignments
CREATE OR REPLACE FUNCTION check_overdue_assignments()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.completion_deadline < CURRENT_DATE 
		AND NEW.assignment_status IN ('Assigned', 'In Progress') 
		AND NEW.sheets_evaluated < NEW.sheets_assigned THEN
		NEW.assignment_status = 'Overdue';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_overdue_assignments
	BEFORE UPDATE ON public.examiner_assignments
	FOR EACH ROW
	EXECUTE FUNCTION check_overdue_assignments();

-- Validate status transitions
CREATE OR REPLACE FUNCTION validate_assignment_status_transition()
RETURNS TRIGGER AS $$
BEGIN
	-- Prevent changing from Completed to other statuses (except Cancelled)
	IF OLD.assignment_status = 'Completed' AND NEW.assignment_status NOT IN ('Completed', 'Cancelled') THEN
		RAISE EXCEPTION 'Cannot change status from Completed to %', NEW.assignment_status;
	END IF;
	
	-- Prevent changing from Cancelled back to active statuses
	IF OLD.assignment_status = 'Cancelled' AND NEW.assignment_status NOT IN ('Cancelled', 'Assigned') THEN
		RAISE EXCEPTION 'Cannot change status from Cancelled to %', NEW.assignment_status;
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_assignment_status_transition
	BEFORE UPDATE ON public.examiner_assignments
	FOR EACH ROW
	EXECUTE FUNCTION validate_assignment_status_transition();

-- =====================================================
-- 4. CREATE VIEWS
-- =====================================================

-- Detailed Examiner Assignments View with all related data
CREATE OR REPLACE VIEW public.examiner_assignments_detailed_view AS
SELECT
	-- Assignment Details
	ea.id,
	ea.evaluator_type,
	ea.evaluator_role,
	ea.evaluator_name,
	ea.evaluator_institution,
	ea.evaluator_email,
	ea.evaluator_phone,
	
	-- Workload Details
	ea.sheets_assigned,
	ea.sheets_evaluated,
	ea.sheets_pending,
	ea.evaluation_progress,
	
	-- Financial Details
	ea.remuneration_amount,
	ea.remuneration_per_sheet,
	ea.total_remuneration,
	ea.payment_status,
	ea.payment_date,
	
	-- Timeline
	ea.assignment_date,
	ea.start_date,
	ea.completion_deadline,
	ea.actual_completion_date,
	CASE 
		WHEN ea.actual_completion_date IS NOT NULL THEN 
			ea.actual_completion_date - ea.assignment_date
		ELSE 
			CURRENT_DATE - ea.assignment_date
	END AS days_since_assignment,
	CASE 
		WHEN ea.completion_deadline < CURRENT_DATE AND ea.assignment_status IN ('Assigned', 'In Progress') THEN 
			CURRENT_DATE - ea.completion_deadline
		ELSE 0
	END AS days_overdue,
	
	-- Status
	ea.assignment_status,
	ea.is_active,
	ea.remarks,
	
	-- Evaluator Details
	ea.evaluator_id,
	u.full_name AS evaluator_full_name,
	u.email AS evaluator_user_email,
	
	-- Institution Details
	ea.institutions_id,
	i.institution_code,
	i.name AS institution_name,
	
	-- Examination Session Details
	ea.examination_session_id,
	es.session_code,
	es.session_name,
	es.session_year,
	
	-- Program Details
	ea.program_id,
	p.program_code,
	p.program_name,
	
	-- Course Details
	ea.course_id,
	c.course_code,
	c.course_name,
	
	-- Course Offering Details
	ea.course_offering_id,
	co.semester,
	co.section,
	
	-- Creator Details
	ea.created_by,
	cu.full_name AS created_by_name,
	
	-- Audit Fields
	ea.created_at,
	ea.updated_at,
	ea.updated_by
FROM public.examiner_assignments ea
LEFT JOIN public.users u ON ea.evaluator_id = u.id
LEFT JOIN public.institutions i ON ea.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON ea.examination_session_id = es.id
LEFT JOIN public.programs p ON ea.program_id = p.id
LEFT JOIN public.courses c ON ea.course_id = c.id
LEFT JOIN public.course_offerings co ON ea.course_offering_id = co.id
LEFT JOIN public.users cu ON ea.created_by = cu.id;

-- Examiner Workload Summary View
CREATE OR REPLACE VIEW public.examiner_workload_summary AS
SELECT
	ea.evaluator_id,
	u.full_name AS evaluator_name,
	u.email AS evaluator_email,
	ea.evaluator_type,
	ea.institutions_id,
	i.institution_code,
	i.name AS institution_name,
	ea.examination_session_id,
	es.session_code,
	es.session_name,
	COUNT(*) AS total_assignments,
	COUNT(*) FILTER (WHERE ea.assignment_status = 'Assigned') AS assigned_count,
	COUNT(*) FILTER (WHERE ea.assignment_status = 'In Progress') AS in_progress_count,
	COUNT(*) FILTER (WHERE ea.assignment_status = 'Completed') AS completed_count,
	COUNT(*) FILTER (WHERE ea.assignment_status = 'Overdue') AS overdue_count,
	SUM(ea.sheets_assigned) AS total_sheets_assigned,
	SUM(ea.sheets_evaluated) AS total_sheets_evaluated,
	SUM(ea.sheets_pending) AS total_sheets_pending,
	ROUND(AVG(ea.evaluation_progress), 2) AS average_progress,
	SUM(ea.remuneration_amount) AS total_remuneration,
	SUM(ea.total_remuneration) AS total_earned_remuneration,
	COUNT(*) FILTER (WHERE ea.payment_status = 'Pending') AS pending_payments_count,
	SUM(ea.total_remuneration) FILTER (WHERE ea.payment_status = 'Pending') AS pending_payment_amount
FROM public.examiner_assignments ea
LEFT JOIN public.users u ON ea.evaluator_id = u.id
LEFT JOIN public.institutions i ON ea.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON ea.examination_session_id = es.id
WHERE ea.is_active = true
GROUP BY 
	ea.evaluator_id, u.full_name, u.email, ea.evaluator_type,
	ea.institutions_id, i.institution_code, i.name,
	ea.examination_session_id, es.session_code, es.session_name;

-- Pending Evaluations View
CREATE OR REPLACE VIEW public.examiner_pending_evaluations AS
SELECT
	ea.id,
	ea.evaluator_id,
	u.full_name AS evaluator_name,
	ea.evaluator_type,
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	c.course_name,
	ea.sheets_assigned,
	ea.sheets_evaluated,
	ea.sheets_pending,
	ea.evaluation_progress,
	ea.assignment_date,
	ea.completion_deadline,
	CURRENT_DATE - ea.assignment_date AS days_since_assignment,
	ea.completion_deadline - CURRENT_DATE AS days_until_deadline,
	CASE 
		WHEN ea.completion_deadline < CURRENT_DATE THEN CURRENT_DATE - ea.completion_deadline
		ELSE 0
	END AS days_overdue,
	ea.assignment_status
FROM public.examiner_assignments ea
LEFT JOIN public.users u ON ea.evaluator_id = u.id
LEFT JOIN public.institutions i ON ea.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON ea.examination_session_id = es.id
LEFT JOIN public.programs p ON ea.program_id = p.id
LEFT JOIN public.courses c ON ea.course_id = c.id
WHERE ea.assignment_status IN ('Assigned', 'In Progress', 'Overdue')
	AND ea.sheets_evaluated < ea.sheets_assigned
	AND ea.is_active = true
ORDER BY ea.completion_deadline ASC;

-- Payment Processing View
CREATE OR REPLACE VIEW public.examiner_payment_processing AS
SELECT
	ea.id,
	ea.evaluator_id,
	u.full_name AS evaluator_name,
	u.email AS evaluator_email,
	ea.evaluator_type,
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	c.course_code,
	c.course_name,
	ea.sheets_evaluated,
	ea.remuneration_per_sheet,
	ea.total_remuneration,
	ea.payment_status,
	ea.payment_date,
	ea.assignment_status,
	ea.actual_completion_date,
	CURRENT_DATE - COALESCE(ea.actual_completion_date, ea.completion_deadline) AS days_since_completion
FROM public.examiner_assignments ea
LEFT JOIN public.users u ON ea.evaluator_id = u.id
LEFT JOIN public.institutions i ON ea.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON ea.examination_session_id = es.id
LEFT JOIN public.programs p ON ea.program_id = p.id
LEFT JOIN public.courses c ON ea.course_id = c.id
WHERE ea.assignment_status = 'Completed'
	AND ea.sheets_evaluated > 0
	AND ea.is_active = true
ORDER BY 
	CASE ea.payment_status
		WHEN 'Pending' THEN 1
		WHEN 'Approved' THEN 2
		WHEN 'Processed' THEN 3
		WHEN 'Paid' THEN 4
	END,
	ea.actual_completion_date ASC;

-- Course-wise Examiner Allocation View
CREATE OR REPLACE VIEW public.course_examiner_allocation AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	c.course_code,
	c.course_name,
	COUNT(*) AS total_examiners,
	COUNT(*) FILTER (WHERE ea.evaluator_type = 'Internal') AS internal_count,
	COUNT(*) FILTER (WHERE ea.evaluator_type = 'External') AS external_count,
	COUNT(*) FILTER (WHERE ea.evaluator_type = 'Head Examiner') AS head_examiner_count,
	SUM(ea.sheets_assigned) AS total_sheets_assigned,
	SUM(ea.sheets_evaluated) AS total_sheets_evaluated,
	ROUND(AVG(ea.evaluation_progress), 2) AS average_progress,
	COUNT(*) FILTER (WHERE ea.assignment_status = 'Completed') AS completed_assignments,
	COUNT(*) FILTER (WHERE ea.assignment_status IN ('Assigned', 'In Progress')) AS active_assignments,
	COUNT(*) FILTER (WHERE ea.assignment_status = 'Overdue') AS overdue_assignments
FROM public.examiner_assignments ea
LEFT JOIN public.institutions i ON ea.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON ea.examination_session_id = es.id
LEFT JOIN public.programs p ON ea.program_id = p.id
LEFT JOIN public.courses c ON ea.course_id = c.id
WHERE ea.is_active = true
GROUP BY 
	i.institution_code, i.name,
	es.session_code, es.session_name,
	p.program_code, p.program_name,
	c.course_code, c.course_name;

-- =====================================================
-- 5. CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to assign sheets to examiner
CREATE OR REPLACE FUNCTION assign_sheets_to_examiner(
	p_assignment_id UUID,
	p_sheet_count INT
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.examiner_assignments
	SET
		sheets_assigned = sheets_assigned + p_sheet_count,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_assignment_id;
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record sheet evaluation
CREATE OR REPLACE FUNCTION record_sheet_evaluation(
	p_assignment_id UUID,
	p_evaluated_count INT DEFAULT 1
)
RETURNS BOOLEAN AS $$
DECLARE
	v_current_evaluated INT;
	v_total_assigned INT;
BEGIN
	-- Get current values
	SELECT sheets_evaluated, sheets_assigned
	INTO v_current_evaluated, v_total_assigned
	FROM public.examiner_assignments
	WHERE id = p_assignment_id;
	
	-- Validate evaluation count
	IF v_current_evaluated + p_evaluated_count > v_total_assigned THEN
		RAISE EXCEPTION 'Cannot evaluate more sheets than assigned';
	END IF;
	
	-- Update evaluation count
	UPDATE public.examiner_assignments
	SET
		sheets_evaluated = sheets_evaluated + p_evaluated_count,
		assignment_status = CASE 
			WHEN sheets_evaluated + p_evaluated_count = sheets_assigned THEN 'Completed'
			WHEN assignment_status = 'Assigned' THEN 'In Progress'
			ELSE assignment_status
		END,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_assignment_id;
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get examiner workload statistics
CREATE OR REPLACE FUNCTION get_examiner_workload_statistics(
	p_evaluator_id UUID DEFAULT NULL,
	p_institution_code TEXT DEFAULT NULL,
	p_session_code TEXT DEFAULT NULL
)
RETURNS TABLE (
	evaluator_id UUID,
	evaluator_name TEXT,
	evaluator_type TEXT,
	total_assignments BIGINT,
	active_assignments BIGINT,
	completed_assignments BIGINT,
	overdue_assignments BIGINT,
	total_sheets_assigned BIGINT,
	total_sheets_evaluated BIGINT,
	total_sheets_pending BIGINT,
	average_progress NUMERIC,
	total_remuneration NUMERIC,
	pending_payment NUMERIC
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		ea.evaluator_id,
		u.full_name::TEXT AS evaluator_name,
		ea.evaluator_type::TEXT,
		COUNT(*) AS total_assignments,
		COUNT(*) FILTER (WHERE ea.assignment_status IN ('Assigned', 'In Progress')) AS active_assignments,
		COUNT(*) FILTER (WHERE ea.assignment_status = 'Completed') AS completed_assignments,
		COUNT(*) FILTER (WHERE ea.assignment_status = 'Overdue') AS overdue_assignments,
		SUM(ea.sheets_assigned) AS total_sheets_assigned,
		SUM(ea.sheets_evaluated) AS total_sheets_evaluated,
		SUM(ea.sheets_pending) AS total_sheets_pending,
		ROUND(AVG(ea.evaluation_progress), 2) AS average_progress,
		SUM(ea.total_remuneration) AS total_remuneration,
		SUM(ea.total_remuneration) FILTER (WHERE ea.payment_status = 'Pending') AS pending_payment
	FROM public.examiner_assignments ea
	LEFT JOIN public.users u ON ea.evaluator_id = u.id
	LEFT JOIN public.institutions i ON ea.institutions_id = i.id
	LEFT JOIN public.examination_sessions es ON ea.examination_session_id = es.id
	WHERE ea.is_active = true
		AND (p_evaluator_id IS NULL OR ea.evaluator_id = p_evaluator_id)
		AND (p_institution_code IS NULL OR i.institution_code = p_institution_code)
		AND (p_session_code IS NULL OR es.session_code = p_session_code)
	GROUP BY ea.evaluator_id, u.full_name, ea.evaluator_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process payment for completed assignments
CREATE OR REPLACE FUNCTION process_examiner_payment(
	p_assignment_id UUID,
	p_payment_status TEXT DEFAULT 'Processed'
)
RETURNS BOOLEAN AS $$
BEGIN
	-- Validate assignment is completed
	IF NOT EXISTS (
		SELECT 1 FROM public.examiner_assignments
		WHERE id = p_assignment_id AND assignment_status = 'Completed'
	) THEN
		RAISE EXCEPTION 'Assignment must be completed before processing payment';
	END IF;
	
	-- Update payment status
	UPDATE public.examiner_assignments
	SET
		payment_status = p_payment_status,
		payment_date = CASE WHEN p_payment_status = 'Paid' THEN CURRENT_DATE ELSE payment_date END,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_assignment_id;
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk process payments
CREATE OR REPLACE FUNCTION bulk_process_examiner_payments(
	p_assignment_ids UUID[],
	p_payment_status TEXT DEFAULT 'Processed'
)
RETURNS INT AS $$
DECLARE
	v_updated_count INT;
BEGIN
	UPDATE public.examiner_assignments
	SET
		payment_status = p_payment_status,
		payment_date = CASE WHEN p_payment_status = 'Paid' THEN CURRENT_DATE ELSE payment_date END,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = ANY(p_assignment_ids)
		AND assignment_status = 'Completed';
	
	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get overdue assignments
CREATE OR REPLACE FUNCTION get_overdue_assignments(
	p_institution_code TEXT DEFAULT NULL,
	p_session_code TEXT DEFAULT NULL
)
RETURNS TABLE (
	id UUID,
	evaluator_name TEXT,
	evaluator_email TEXT,
	course_code TEXT,
	course_name TEXT,
	sheets_pending BIGINT,
	days_overdue INT,
	completion_deadline DATE
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		ea.id,
		u.full_name::TEXT AS evaluator_name,
		u.email::TEXT AS evaluator_email,
		c.course_code::TEXT,
		c.course_name::TEXT,
		ea.sheets_pending::BIGINT,
		(CURRENT_DATE - ea.completion_deadline)::INT AS days_overdue,
		ea.completion_deadline
	FROM public.examiner_assignments ea
	LEFT JOIN public.users u ON ea.evaluator_id = u.id
	LEFT JOIN public.courses c ON ea.course_id = c.id
	LEFT JOIN public.institutions i ON ea.institutions_id = i.id
	LEFT JOIN public.examination_sessions es ON ea.examination_session_id = es.id
	WHERE ea.completion_deadline < CURRENT_DATE
		AND ea.assignment_status IN ('Assigned', 'In Progress', 'Overdue')
		AND ea.sheets_evaluated < ea.sheets_assigned
		AND ea.is_active = true
		AND (p_institution_code IS NULL OR i.institution_code = p_institution_code)
		AND (p_session_code IS NULL OR es.session_code = p_session_code)
	ORDER BY ea.completion_deadline ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cancel assignment
CREATE OR REPLACE FUNCTION cancel_examiner_assignment(
	p_assignment_id UUID,
	p_remarks TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
	-- Cannot cancel if evaluation has started
	IF EXISTS (
		SELECT 1 FROM public.examiner_assignments
		WHERE id = p_assignment_id AND sheets_evaluated > 0
	) THEN
		RAISE EXCEPTION 'Cannot cancel assignment after evaluation has started';
	END IF;
	
	UPDATE public.examiner_assignments
	SET
		assignment_status = 'Cancelled',
		is_active = false,
		remarks = COALESCE(p_remarks, remarks),
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_assignment_id;
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get examiner availability
CREATE OR REPLACE FUNCTION get_examiner_availability(
	p_evaluator_id UUID,
	p_examination_session_id UUID DEFAULT NULL
)
RETURNS TABLE (
	evaluator_id UUID,
	evaluator_name TEXT,
	total_assignments BIGINT,
	active_assignments BIGINT,
	total_sheets_assigned BIGINT,
	total_sheets_pending BIGINT,
	average_progress NUMERIC,
	is_available BOOLEAN
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		ea.evaluator_id,
		u.full_name::TEXT AS evaluator_name,
		COUNT(*) AS total_assignments,
		COUNT(*) FILTER (WHERE ea.assignment_status IN ('Assigned', 'In Progress')) AS active_assignments,
		SUM(ea.sheets_assigned) AS total_sheets_assigned,
		SUM(ea.sheets_pending) AS total_sheets_pending,
		ROUND(AVG(ea.evaluation_progress), 2) AS average_progress,
		CASE 
			WHEN COUNT(*) FILTER (WHERE ea.assignment_status IN ('Assigned', 'In Progress')) < 3 THEN true
			ELSE false
		END AS is_available
	FROM public.examiner_assignments ea
	LEFT JOIN public.users u ON ea.evaluator_id = u.id
	WHERE ea.evaluator_id = p_evaluator_id
		AND ea.is_active = true
		AND (p_examination_session_id IS NULL OR ea.examination_session_id = p_examination_session_id)
	GROUP BY ea.evaluator_id, u.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.examiner_assignments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. CREATE RLS POLICIES
-- =====================================================

-- Policy: Allow authenticated users to read examiner assignments
CREATE POLICY "Authenticated users can read examiner assignments"
	ON public.examiner_assignments
	FOR SELECT
	TO authenticated
	USING (true);

-- Policy: Allow examiners to read their own assignments
CREATE POLICY "Examiners can read their own assignments"
	ON public.examiner_assignments
	FOR SELECT
	TO authenticated
	USING (evaluator_id = auth.uid());

-- Policy: Allow authenticated users to insert examiner assignments
CREATE POLICY "Authenticated users can insert examiner assignments"
	ON public.examiner_assignments
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

-- Policy: Allow examiners to update their own assignments (limited)
CREATE POLICY "Examiners can update their own assignments"
	ON public.examiner_assignments
	FOR UPDATE
	TO authenticated
	USING (evaluator_id = auth.uid())
	WITH CHECK (evaluator_id = auth.uid());

-- Policy: Allow admins to update all examiner assignments
CREATE POLICY "Admins can update all examiner assignments"
	ON public.examiner_assignments
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

-- Policy: Allow admins to delete examiner assignments
CREATE POLICY "Admins can delete examiner assignments"
	ON public.examiner_assignments
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
CREATE POLICY "Service role can manage all examiner assignments"
	ON public.examiner_assignments
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION assign_sheets_to_examiner(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION record_sheet_evaluation(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_examiner_workload_statistics(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION process_examiner_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_process_examiner_payments(UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_overdue_assignments(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_examiner_assignment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_examiner_availability(UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION assign_sheets_to_examiner(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION record_sheet_evaluation(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION get_examiner_workload_statistics(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION process_examiner_payment(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_process_examiner_payments(UUID[], TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_overdue_assignments(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_examiner_assignment(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_examiner_availability(UUID, UUID) TO service_role;

-- =====================================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.examiner_assignments IS 'Tracks examiner/evaluator assignments for answer sheet evaluation with workload and payment management';
COMMENT ON VIEW public.examiner_assignments_detailed_view IS 'Denormalized view of examiner assignments with all related entity information';
COMMENT ON VIEW public.examiner_workload_summary IS 'Statistical summary of examiner workload grouped by evaluator, institution, and session';
COMMENT ON VIEW public.examiner_pending_evaluations IS 'View of pending evaluations showing workload and deadline information';
COMMENT ON VIEW public.examiner_payment_processing IS 'View of completed assignments pending payment processing';
COMMENT ON VIEW public.course_examiner_allocation IS 'View of examiner allocation per course showing distribution and progress';

COMMENT ON COLUMN public.examiner_assignments.evaluator_type IS 'Type of evaluator: Internal, External, Head Examiner, Chief Examiner, Moderator, Scrutinizer';
COMMENT ON COLUMN public.examiner_assignments.evaluator_role IS 'Role in evaluation: Primary, Secondary, Moderator, Reviewer';
COMMENT ON COLUMN public.examiner_assignments.sheets_assigned IS 'Total number of answer sheets assigned for evaluation';
COMMENT ON COLUMN public.examiner_assignments.sheets_evaluated IS 'Number of answer sheets evaluated';
COMMENT ON COLUMN public.examiner_assignments.sheets_pending IS 'Auto-calculated pending sheets (assigned - evaluated)';
COMMENT ON COLUMN public.examiner_assignments.evaluation_progress IS 'Auto-calculated evaluation progress percentage';
COMMENT ON COLUMN public.examiner_assignments.remuneration_per_sheet IS 'Payment amount per sheet evaluated';
COMMENT ON COLUMN public.examiner_assignments.total_remuneration IS 'Auto-calculated total remuneration based on sheets evaluated';
COMMENT ON COLUMN public.examiner_assignments.payment_status IS 'Payment status: Pending, Approved, Processed, Paid, Cancelled';
COMMENT ON COLUMN public.examiner_assignments.assignment_status IS 'Current status: Assigned, In Progress, Completed, Cancelled, On Hold, Overdue';

COMMENT ON FUNCTION assign_sheets_to_examiner(UUID, INT) IS 'Assigns additional sheets to an examiner assignment';
COMMENT ON FUNCTION record_sheet_evaluation(UUID, INT) IS 'Records the evaluation of answer sheets by an examiner';
COMMENT ON FUNCTION get_examiner_workload_statistics(UUID, TEXT, TEXT) IS 'Returns workload statistics for examiners';
COMMENT ON FUNCTION process_examiner_payment(UUID, TEXT) IS 'Processes payment for a completed assignment';
COMMENT ON FUNCTION bulk_process_examiner_payments(UUID[], TEXT) IS 'Processes payments for multiple assignments in bulk';
COMMENT ON FUNCTION get_overdue_assignments(TEXT, TEXT) IS 'Returns list of overdue assignments';
COMMENT ON FUNCTION cancel_examiner_assignment(UUID, TEXT) IS 'Cancels an examiner assignment (only if no evaluation started)';
COMMENT ON FUNCTION get_examiner_availability(UUID, UUID) IS 'Checks examiner availability based on current workload';

-- =====================================================
-- 10. ENABLE REALTIME (OPTIONAL)
-- =====================================================

-- Enable realtime for examiner_assignments table if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE examiner_assignments;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
