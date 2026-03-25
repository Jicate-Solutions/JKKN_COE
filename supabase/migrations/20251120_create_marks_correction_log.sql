-- =====================================================
-- Marks Correction Log Table for Audit Trail
-- =====================================================
-- Date: 2025-11-20
-- Purpose: Track all corrections made to marks_entry for audit compliance
-- =====================================================

-- =====================================================
-- 1. CREATE MARKS CORRECTION LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.marks_correction_log (
	id UUID NOT NULL DEFAULT gen_random_uuid(),

	-- Reference to original marks entry
	marks_entry_id UUID NOT NULL,

	-- Student and Course Info (for quick reference)
	dummy_number VARCHAR(50) NOT NULL,
	course_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	institutions_id UUID NOT NULL,

	-- Marks Change Details
	old_marks DECIMAL(5,2) NOT NULL,
	new_marks DECIMAL(5,2) NOT NULL,
	marks_difference DECIMAL(5,2) GENERATED ALWAYS AS (new_marks - old_marks) STORED,

	-- Old marks in words (for reference)
	old_marks_in_words VARCHAR(255),
	new_marks_in_words VARCHAR(255),

	-- Correction Reason (mandatory)
	correction_reason TEXT NOT NULL,
	correction_type VARCHAR(50) NOT NULL, -- 'Data Entry Error', 'Revaluation', 'Moderation', 'Grace Marks', 'Other'

	-- Supporting Documents
	supporting_document_url TEXT,
	reference_number VARCHAR(100), -- Request/Application reference

	-- Approval Details
	approved_by UUID,
	approved_at TIMESTAMP WITH TIME ZONE,
	approval_status VARCHAR(50) DEFAULT 'Approved', -- 'Pending', 'Approved', 'Rejected'
	approval_remarks TEXT,

	-- Corrected By
	corrected_by UUID NOT NULL,
	corrected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	-- IP and User Agent for security audit
	ip_address VARCHAR(45),
	user_agent TEXT,

	-- Audit Fields
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	-- Primary Key
	CONSTRAINT marks_correction_log_pkey PRIMARY KEY (id),

	-- Foreign Key Constraints
	CONSTRAINT marks_correction_log_marks_entry_id_fkey
		FOREIGN KEY (marks_entry_id) REFERENCES marks_entry(id) ON DELETE RESTRICT,
	CONSTRAINT marks_correction_log_course_id_fkey
		FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
	CONSTRAINT marks_correction_log_examination_session_id_fkey
		FOREIGN KEY (examination_session_id) REFERENCES examination_sessions(id) ON DELETE RESTRICT,
	CONSTRAINT marks_correction_log_institutions_id_fkey
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE RESTRICT,
	CONSTRAINT marks_correction_log_corrected_by_fkey
		FOREIGN KEY (corrected_by) REFERENCES users(id) ON DELETE RESTRICT,
	CONSTRAINT marks_correction_log_approved_by_fkey
		FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,

	-- Check Constraints
	CONSTRAINT check_marks_non_negative
		CHECK (old_marks >= 0 AND new_marks >= 0),
	CONSTRAINT check_marks_different
		CHECK (old_marks != new_marks),
	CONSTRAINT check_valid_correction_type
		CHECK (correction_type IN ('Data Entry Error', 'Revaluation', 'Moderation', 'Grace Marks', 'Administrative', 'Other')),
	CONSTRAINT check_valid_approval_status
		CHECK (approval_status IN ('Pending', 'Approved', 'Rejected')),
	CONSTRAINT check_correction_reason_not_empty
		CHECK (LENGTH(TRIM(correction_reason)) > 0)
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_marks_correction_log_marks_entry_id
	ON public.marks_correction_log(marks_entry_id);
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_dummy_number
	ON public.marks_correction_log(dummy_number);
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_course_id
	ON public.marks_correction_log(course_id);
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_examination_session_id
	ON public.marks_correction_log(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_institutions_id
	ON public.marks_correction_log(institutions_id);
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_corrected_by
	ON public.marks_correction_log(corrected_by);
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_corrected_at
	ON public.marks_correction_log(corrected_at DESC);
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_correction_type
	ON public.marks_correction_log(correction_type);
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_approval_status
	ON public.marks_correction_log(approval_status);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_session_course
	ON public.marks_correction_log(examination_session_id, course_id);
CREATE INDEX IF NOT EXISTS idx_marks_correction_log_institution_session
	ON public.marks_correction_log(institutions_id, examination_session_id);

-- =====================================================
-- 3. CREATE VIEWS
-- =====================================================

-- Detailed Correction Log View
CREATE OR REPLACE VIEW public.marks_correction_log_detailed_view AS
SELECT
	mcl.id,
	mcl.marks_entry_id,
	mcl.dummy_number,

	-- Marks Details
	mcl.old_marks,
	mcl.new_marks,
	mcl.marks_difference,
	mcl.old_marks_in_words,
	mcl.new_marks_in_words,

	-- Correction Details
	mcl.correction_reason,
	mcl.correction_type,
	mcl.reference_number,
	mcl.supporting_document_url,

	-- Approval Details
	mcl.approval_status,
	mcl.approved_at,
	mcl.approval_remarks,
	abu.full_name AS approved_by_name,

	-- Corrected By
	mcl.corrected_at,
	cbu.full_name AS corrected_by_name,
	cbu.email AS corrected_by_email,

	-- Course Details
	c.course_code,
	c.course_name,

	-- Session Details
	es.session_code,
	es.session_name,

	-- Institution Details
	i.institution_code,
	i.name AS institution_name,

	-- Audit
	mcl.ip_address,
	mcl.created_at
FROM public.marks_correction_log mcl
LEFT JOIN public.users cbu ON mcl.corrected_by = cbu.id
LEFT JOIN public.users abu ON mcl.approved_by = abu.id
LEFT JOIN public.courses c ON mcl.course_id = c.id
LEFT JOIN public.examination_sessions es ON mcl.examination_session_id = es.id
LEFT JOIN public.institutions i ON mcl.institutions_id = i.id
ORDER BY mcl.corrected_at DESC;

-- Correction Summary View
CREATE OR REPLACE VIEW public.marks_correction_summary_view AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	c.course_code,
	c.course_name,
	COUNT(*) AS total_corrections,
	COUNT(*) FILTER (WHERE mcl.correction_type = 'Data Entry Error') AS data_entry_errors,
	COUNT(*) FILTER (WHERE mcl.correction_type = 'Revaluation') AS revaluations,
	COUNT(*) FILTER (WHERE mcl.correction_type = 'Moderation') AS moderations,
	COUNT(*) FILTER (WHERE mcl.marks_difference > 0) AS marks_increased,
	COUNT(*) FILTER (WHERE mcl.marks_difference < 0) AS marks_decreased,
	ROUND(AVG(ABS(mcl.marks_difference)), 2) AS avg_correction_difference,
	MAX(mcl.corrected_at) AS last_correction_at
FROM public.marks_correction_log mcl
LEFT JOIN public.institutions i ON mcl.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON mcl.examination_session_id = es.id
LEFT JOIN public.courses c ON mcl.course_id = c.id
GROUP BY
	i.institution_code, i.name,
	es.session_code, es.session_name,
	c.course_code, c.course_name
ORDER BY MAX(mcl.corrected_at) DESC;

-- =====================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.marks_correction_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. CREATE RLS POLICIES
-- =====================================================

-- Policy: Authenticated users can read correction logs
CREATE POLICY "Authenticated users can read correction logs"
	ON public.marks_correction_log
	FOR SELECT
	TO authenticated
	USING (true);

-- Policy: Only authorized roles can insert correction logs
CREATE POLICY "Authorized users can insert correction logs"
	ON public.marks_correction_log
	FOR INSERT
	TO authenticated
	WITH CHECK (
		EXISTS (
			SELECT 1 FROM public.user_roles ur
			JOIN public.roles r ON ur.role_id = r.id
			WHERE ur.user_id = auth.uid()
				AND r.name IN ('admin', 'super_admin', 'coe_admin', 'exam_supervisor', 'data_entry_supervisor')
				AND ur.is_active = true
		)
	);

-- Policy: Service role has full access
CREATE POLICY "Service role can manage all correction logs"
	ON public.marks_correction_log
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 6. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.marks_correction_log IS 'Audit trail for all marks corrections with reason tracking and approval workflow';
COMMENT ON COLUMN public.marks_correction_log.correction_type IS 'Type of correction: Data Entry Error, Revaluation, Moderation, Grace Marks, Administrative, Other';
COMMENT ON COLUMN public.marks_correction_log.approval_status IS 'Approval status: Pending, Approved, Rejected';
COMMENT ON VIEW public.marks_correction_log_detailed_view IS 'Denormalized view of correction logs with all related entity information';
COMMENT ON VIEW public.marks_correction_summary_view IS 'Summary statistics of corrections per course/session';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
