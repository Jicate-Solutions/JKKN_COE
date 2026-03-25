-- =====================================================
-- Answer Sheets Table with RLS, Functions, and Views
-- =====================================================
-- Date: 2025-11-13
-- Purpose: Track exam answer sheets with blind evaluation support
-- =====================================================

-- =====================================================
-- 1. CREATE ANSWER SHEETS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.answer_sheets (
	id UUID NOT NULL DEFAULT gen_random_uuid(),
	
	-- Core References
	institutions_id UUID NOT NULL,
	exam_registration_id UUID NOT NULL,
	student_dummy_number_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	program_id UUID NOT NULL,
	course_id UUID NOT NULL,
	exam_timetable_id UUID NOT NULL,
	
	-- Sheet Identification
	sheet_number VARCHAR(50) NOT NULL UNIQUE,
	barcode VARCHAR(100) UNIQUE,
	dummy_number_on_sheet VARCHAR(50) NOT NULL, -- For blind evaluation
	
	-- Sheet Details
	main_sheets_count INT NOT NULL DEFAULT 1,
	supplementary_sheets_count INT DEFAULT 0,
	total_pages INT GENERATED ALWAYS AS (main_sheets_count + COALESCE(supplementary_sheets_count, 0)) STORED,
	sheet_type VARCHAR(50) DEFAULT 'Regular', -- Regular, Scribe, Extra Time
	
	-- Issuance Tracking
	issued_by UUID,
	issued_time TIME,
	issued_at TIMESTAMP WITH TIME ZONE,
	
	-- Collection Tracking
	collected_by UUID,
	collected_time TIME,
	collected_at TIMESTAMP WITH TIME ZONE,
	
	-- Status Management
	sheet_status VARCHAR(50) DEFAULT 'Issued', -- Issued, Collected, Under Evaluation, Evaluated, Missing, Cancelled
	remarks TEXT,
	
	-- Audit Fields
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID,
	updated_by UUID,
	
	-- Primary Key
	CONSTRAINT answer_sheets_pkey PRIMARY KEY (id),
	
	-- Foreign Key Constraints
	CONSTRAINT answer_sheets_institutions_id_fkey 
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE CASCADE,
	CONSTRAINT answer_sheets_exam_registration_id_fkey 
		FOREIGN KEY (exam_registration_id) REFERENCES exam_registrations(id) ON DELETE CASCADE,
	CONSTRAINT answer_sheets_student_dummy_number_id_fkey 
		FOREIGN KEY (student_dummy_number_id) REFERENCES student_dummy_numbers(id) ON DELETE RESTRICT,
	CONSTRAINT answer_sheets_examination_session_id_fkey 
		FOREIGN KEY (examination_session_id) REFERENCES examination_sessions(id) ON DELETE CASCADE,
	CONSTRAINT answer_sheets_program_id_fkey 
		FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
	CONSTRAINT answer_sheets_course_id_fkey 
		FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
	CONSTRAINT answer_sheets_exam_timetable_id_fkey 
		FOREIGN KEY (exam_timetable_id) REFERENCES exam_timetables(id) ON DELETE CASCADE,
	CONSTRAINT answer_sheets_issued_by_fkey 
		FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT answer_sheets_collected_by_fkey 
		FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT answer_sheets_created_by_fkey 
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT answer_sheets_updated_by_fkey 
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
	
	-- Unique Constraints
	CONSTRAINT unique_sheet_per_registration 
		UNIQUE(institutions_id, exam_registration_id),
	CONSTRAINT unique_sheet_number 
		UNIQUE(sheet_number),
	CONSTRAINT unique_barcode 
		UNIQUE(barcode),
	
	-- Check Constraints
	CONSTRAINT check_main_sheets_positive 
		CHECK (main_sheets_count > 0),
	CONSTRAINT check_supplementary_sheets_non_negative 
		CHECK (supplementary_sheets_count >= 0),
	CONSTRAINT check_valid_sheet_type 
		CHECK (sheet_type IN ('Regular', 'Scribe', 'Extra Time', 'Special')),
	CONSTRAINT check_valid_sheet_status 
		CHECK (sheet_status IN ('Issued', 'Collected', 'Under Evaluation', 'Evaluated', 'Missing', 'Cancelled'))
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_answer_sheets_institutions_id 
	ON public.answer_sheets(institutions_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_exam_registration_id 
	ON public.answer_sheets(exam_registration_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_student_dummy_number_id 
	ON public.answer_sheets(student_dummy_number_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_examination_session_id 
	ON public.answer_sheets(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_program_id 
	ON public.answer_sheets(program_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_course_id 
	ON public.answer_sheets(course_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_exam_timetable_id 
	ON public.answer_sheets(exam_timetable_id);

-- Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_answer_sheets_sheet_number 
	ON public.answer_sheets(sheet_number);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_barcode 
	ON public.answer_sheets(barcode);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_dummy_number 
	ON public.answer_sheets(dummy_number_on_sheet);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_sheet_status 
	ON public.answer_sheets(sheet_status);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_sheet_type 
	ON public.answer_sheets(sheet_type);

-- User Tracking Indexes
CREATE INDEX IF NOT EXISTS idx_answer_sheets_issued_by 
	ON public.answer_sheets(issued_by) WHERE issued_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_answer_sheets_collected_by 
	ON public.answer_sheets(collected_by) WHERE collected_by IS NOT NULL;

-- Timestamp Indexes
CREATE INDEX IF NOT EXISTS idx_answer_sheets_created_at 
	ON public.answer_sheets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_issued_at 
	ON public.answer_sheets(issued_at) WHERE issued_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_answer_sheets_collected_at 
	ON public.answer_sheets(collected_at) WHERE collected_at IS NOT NULL;

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS idx_answer_sheets_session_program 
	ON public.answer_sheets(examination_session_id, program_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_session_course 
	ON public.answer_sheets(examination_session_id, course_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_program_status 
	ON public.answer_sheets(program_id, sheet_status);
CREATE INDEX IF NOT EXISTS idx_answer_sheets_institution_session_status 
	ON public.answer_sheets(institutions_id, examination_session_id, sheet_status);

-- Partial Indexes for Specific Queries
CREATE INDEX IF NOT EXISTS idx_answer_sheets_active_sheets 
	ON public.answer_sheets(id, sheet_status, issued_at) 
	WHERE sheet_status IN ('Issued', 'Collected');
CREATE INDEX IF NOT EXISTS idx_answer_sheets_missing_sheets 
	ON public.answer_sheets(id, institutions_id, examination_session_id) 
	WHERE sheet_status = 'Missing';
CREATE INDEX IF NOT EXISTS idx_answer_sheets_pending_collection 
	ON public.answer_sheets(id, issued_at, issued_by) 
	WHERE sheet_status = 'Issued' AND collected_at IS NULL;

-- =====================================================
-- 3. CREATE TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_answer_sheets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_answer_sheets_updated_at
	BEFORE UPDATE ON public.answer_sheets
	FOR EACH ROW
	EXECUTE FUNCTION update_answer_sheets_updated_at();

-- Auto-populate issued_at when issued_by is set
CREATE OR REPLACE FUNCTION auto_populate_answer_sheet_issued_at()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.issued_by IS NOT NULL AND OLD.issued_by IS NULL THEN
		NEW.issued_at = CURRENT_TIMESTAMP;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_answer_sheet_issued_at
	BEFORE UPDATE ON public.answer_sheets
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_answer_sheet_issued_at();

-- Auto-populate collected_at when collected_by is set
CREATE OR REPLACE FUNCTION auto_populate_answer_sheet_collected_at()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.collected_by IS NOT NULL AND OLD.collected_by IS NULL THEN
		NEW.collected_at = CURRENT_TIMESTAMP;
		NEW.sheet_status = 'Collected';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_answer_sheet_collected_at
	BEFORE UPDATE ON public.answer_sheets
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_answer_sheet_collected_at();

-- Validate sheet status transitions
CREATE OR REPLACE FUNCTION validate_answer_sheet_status_transition()
RETURNS TRIGGER AS $$
BEGIN
	-- Only allow valid status transitions
	IF OLD.sheet_status IS NOT NULL AND NEW.sheet_status IS NOT NULL THEN
		-- Issued -> Collected
		IF OLD.sheet_status = 'Issued' AND NEW.sheet_status NOT IN ('Collected', 'Missing', 'Cancelled') THEN
			RAISE EXCEPTION 'Invalid status transition from Issued to %', NEW.sheet_status;
		END IF;
		
		-- Collected -> Under Evaluation
		IF OLD.sheet_status = 'Collected' AND NEW.sheet_status NOT IN ('Under Evaluation', 'Missing', 'Cancelled') THEN
			RAISE EXCEPTION 'Invalid status transition from Collected to %', NEW.sheet_status;
		END IF;
		
		-- Under Evaluation -> Evaluated
		IF OLD.sheet_status = 'Under Evaluation' AND NEW.sheet_status NOT IN ('Evaluated', 'Collected') THEN
			RAISE EXCEPTION 'Invalid status transition from Under Evaluation to %', NEW.sheet_status;
		END IF;
		
		-- Evaluated is terminal (cannot change)
		IF OLD.sheet_status = 'Evaluated' AND NEW.sheet_status != 'Evaluated' THEN
			RAISE EXCEPTION 'Cannot change status from Evaluated';
		END IF;
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_answer_sheet_status_transition
	BEFORE UPDATE ON public.answer_sheets
	FOR EACH ROW
	EXECUTE FUNCTION validate_answer_sheet_status_transition();

-- =====================================================
-- 4. CREATE VIEWS
-- =====================================================

-- Detailed Answer Sheets View with all related data
CREATE OR REPLACE VIEW public.answer_sheets_detailed_view AS
SELECT
	-- Answer Sheet Details
	a.id,
	a.sheet_number,
	a.barcode,
	a.dummy_number_on_sheet,
	a.main_sheets_count,
	a.supplementary_sheets_count,
	a.total_pages,
	a.sheet_type,
	a.sheet_status,
	a.remarks,
	
	-- Issuance Details
	a.issued_by,
	a.issued_time,
	a.issued_at,
	iu.full_name AS issued_by_name,
	iu.email AS issued_by_email,
	
	-- Collection Details
	a.collected_by,
	a.collected_time,
	a.collected_at,
	cu.full_name AS collected_by_name,
	cu.email AS collected_by_email,
	
	-- Exam Registration Details
	a.exam_registration_id,
	er.registration_number,
	er.is_regular,
	er.registration_date,
	
	-- Student Details (from exam_registrations)
	er.stu_register_no AS student_register_number,
	er.student_name,
	
	-- Dummy Number Details
	a.student_dummy_number_id,
	sdn.dummy_number,
	sdn.actual_register_number,
	
	-- Institution Details
	a.institutions_id,
	i.institution_code,
	i.name AS institution_name,
	
	-- Examination Session Details
	a.examination_session_id,
	es.session_code,
	es.session_name,
	es.session_year,
	
	-- Program Details
	a.program_id,
	p.program_code,
	p.program_name,
	
	-- Course Details
	a.course_id,
	c.course_code,
	c.course_name,
	
	-- Exam Timetable Details
	a.exam_timetable_id,
	et.exam_date,
	et.session AS exam_session,
	et.start_time,
	et.end_time,
	
	-- Audit Fields
	a.created_at,
	a.updated_at,
	a.created_by,
	a.updated_by
FROM public.answer_sheets a
LEFT JOIN public.users iu ON a.issued_by = iu.id
LEFT JOIN public.users cu ON a.collected_by = cu.id
LEFT JOIN public.exam_registrations er ON a.exam_registration_id = er.id
LEFT JOIN public.student_dummy_numbers sdn ON a.student_dummy_number_id = sdn.id
LEFT JOIN public.institutions i ON a.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON a.examination_session_id = es.id
LEFT JOIN public.programs p ON a.program_id = p.id
LEFT JOIN public.courses c ON a.course_id = c.id
LEFT JOIN public.exam_timetables et ON a.exam_timetable_id = et.id;

-- Answer Sheet Summary View for reporting
CREATE OR REPLACE VIEW public.answer_sheets_summary_view AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	p.program_code,
	p.program_name,
	c.course_code,
	c.course_name,
	et.exam_date,
	et.session AS exam_session,
	COUNT(*) AS total_sheets,
	COUNT(*) FILTER (WHERE a.sheet_status = 'Issued') AS issued_count,
	COUNT(*) FILTER (WHERE a.sheet_status = 'Collected') AS collected_count,
	COUNT(*) FILTER (WHERE a.sheet_status = 'Under Evaluation') AS under_evaluation_count,
	COUNT(*) FILTER (WHERE a.sheet_status = 'Evaluated') AS evaluated_count,
	COUNT(*) FILTER (WHERE a.sheet_status = 'Missing') AS missing_count,
	COUNT(*) FILTER (WHERE a.sheet_status = 'Cancelled') AS cancelled_count,
	SUM(a.main_sheets_count) AS total_main_sheets,
	SUM(a.supplementary_sheets_count) AS total_supplementary_sheets,
	SUM(a.total_pages) AS total_pages,
	ROUND(100.0 * COUNT(*) FILTER (WHERE a.sheet_status = 'Collected') / NULLIF(COUNT(*), 0), 2) AS collection_percentage,
	ROUND(100.0 * COUNT(*) FILTER (WHERE a.sheet_status = 'Evaluated') / NULLIF(COUNT(*), 0), 2) AS evaluation_percentage
FROM public.answer_sheets a
LEFT JOIN public.institutions i ON a.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON a.examination_session_id = es.id
LEFT JOIN public.programs p ON a.program_id = p.id
LEFT JOIN public.courses c ON a.course_id = c.id
LEFT JOIN public.exam_timetables et ON a.exam_timetable_id = et.id
GROUP BY
	i.institution_code, i.name,
	es.session_code, es.session_name,
	p.program_code, p.program_name,
	c.course_code, c.course_name,
	et.exam_date, et.session;

-- Pending Collection View
CREATE OR REPLACE VIEW public.answer_sheets_pending_collection AS
SELECT
	a.id,
	a.sheet_number,
	a.dummy_number_on_sheet,
	i.institution_code,
	es.session_code,
	p.program_code,
	c.course_code,
	et.exam_date,
	et.session AS exam_session,
	a.issued_by,
	iu.full_name AS issued_by_name,
	a.issued_at,
	EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - a.issued_at)) / 3600 AS hours_since_issued
FROM public.answer_sheets a
LEFT JOIN public.institutions i ON a.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON a.examination_session_id = es.id
LEFT JOIN public.programs p ON a.program_id = p.id
LEFT JOIN public.courses c ON a.course_id = c.id
LEFT JOIN public.exam_timetables et ON a.exam_timetable_id = et.id
LEFT JOIN public.users iu ON a.issued_by = iu.id
WHERE a.sheet_status = 'Issued' 
	AND a.collected_at IS NULL
ORDER BY a.issued_at DESC;

-- =====================================================
-- 5. CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to generate sheet number
CREATE OR REPLACE FUNCTION generate_answer_sheet_number(
	p_institution_code TEXT,
	p_session_code TEXT,
	p_program_code TEXT,
	p_course_code TEXT
)
RETURNS TEXT AS $$
DECLARE
	v_sequence INT;
	v_sheet_number TEXT;
BEGIN
	-- Get next sequence number for this combination
	SELECT COALESCE(MAX(CAST(SUBSTRING(sheet_number FROM '\d+$') AS INT)), 0) + 1
	INTO v_sequence
	FROM public.answer_sheets a
	JOIN public.institutions i ON a.institutions_id = i.id
	JOIN public.examination_sessions es ON a.examination_session_id = es.id
	JOIN public.programs p ON a.program_id = p.id
	JOIN public.courses c ON a.course_id = c.id
	WHERE i.institution_code = p_institution_code
		AND es.session_code = p_session_code
		AND p.program_code = p_program_code
		AND c.course_code = p_course_code;
	
	-- Format: INST-SESSION-PROG-COURSE-SEQNO
	v_sheet_number := p_institution_code || '-' || 
					  p_session_code || '-' || 
					  p_program_code || '-' || 
					  p_course_code || '-' || 
					  LPAD(v_sequence::TEXT, 6, '0');
	
	RETURN v_sheet_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate barcode
CREATE OR REPLACE FUNCTION generate_answer_sheet_barcode(
	p_sheet_number TEXT
)
RETURNS TEXT AS $$
BEGIN
	-- Simple barcode: BC-SHEETNUMBER-CHECKSUM
	RETURN 'BC-' || p_sheet_number || '-' || 
		   SUBSTRING(MD5(p_sheet_number), 1, 4);
END;
$$ LANGUAGE plpgsql;

-- Function to get answer sheet statistics
CREATE OR REPLACE FUNCTION get_answer_sheet_statistics(
	p_institution_code TEXT DEFAULT NULL,
	p_session_code TEXT DEFAULT NULL,
	p_program_code TEXT DEFAULT NULL
)
RETURNS TABLE (
	institution_code TEXT,
	session_code TEXT,
	program_code TEXT,
	total_sheets BIGINT,
	issued_count BIGINT,
	collected_count BIGINT,
	under_evaluation_count BIGINT,
	evaluated_count BIGINT,
	missing_count BIGINT,
	collection_percentage NUMERIC,
	evaluation_percentage NUMERIC
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		i.institution_code::TEXT,
		es.session_code::TEXT,
		p.program_code::TEXT,
		COUNT(*) AS total_sheets,
		COUNT(*) FILTER (WHERE a.sheet_status = 'Issued') AS issued_count,
		COUNT(*) FILTER (WHERE a.sheet_status = 'Collected') AS collected_count,
		COUNT(*) FILTER (WHERE a.sheet_status = 'Under Evaluation') AS under_evaluation_count,
		COUNT(*) FILTER (WHERE a.sheet_status = 'Evaluated') AS evaluated_count,
		COUNT(*) FILTER (WHERE a.sheet_status = 'Missing') AS missing_count,
		ROUND(100.0 * COUNT(*) FILTER (WHERE a.sheet_status = 'Collected') / NULLIF(COUNT(*), 0), 2) AS collection_percentage,
		ROUND(100.0 * COUNT(*) FILTER (WHERE a.sheet_status = 'Evaluated') / NULLIF(COUNT(*), 0), 2) AS evaluation_percentage
	FROM public.answer_sheets a
	LEFT JOIN public.institutions i ON a.institutions_id = i.id
	LEFT JOIN public.examination_sessions es ON a.examination_session_id = es.id
	LEFT JOIN public.programs p ON a.program_id = p.id
	WHERE (p_institution_code IS NULL OR i.institution_code = p_institution_code)
		AND (p_session_code IS NULL OR es.session_code = p_session_code)
		AND (p_program_code IS NULL OR p.program_code = p_program_code)
	GROUP BY i.institution_code, es.session_code, p.program_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark sheet as collected
CREATE OR REPLACE FUNCTION mark_answer_sheet_collected(
	p_sheet_number TEXT,
	p_collected_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_collected_by UUID;
BEGIN
	-- Use provided user or current user
	v_collected_by := COALESCE(p_collected_by, auth.uid());
	
	UPDATE public.answer_sheets
	SET
		collected_by = v_collected_by,
		collected_at = CURRENT_TIMESTAMP,
		collected_time = CURRENT_TIME,
		sheet_status = 'Collected',
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_collected_by
	WHERE sheet_number = p_sheet_number
		AND sheet_status = 'Issued';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk update sheet status
CREATE OR REPLACE FUNCTION bulk_update_answer_sheet_status(
	p_sheet_ids UUID[],
	p_new_status TEXT,
	p_remarks TEXT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_updated_count INT;
BEGIN
	UPDATE public.answer_sheets
	SET
		sheet_status = p_new_status,
		remarks = COALESCE(p_remarks, remarks),
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = ANY(p_sheet_ids);
	
	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get answer sheets by dummy number
CREATE OR REPLACE FUNCTION get_answer_sheets_by_dummy_number(
	p_dummy_number TEXT
)
RETURNS TABLE (
	id UUID,
	sheet_number TEXT,
	dummy_number TEXT,
	course_code TEXT,
	course_name TEXT,
	exam_date DATE,
	exam_session TEXT,
	sheet_status TEXT,
	total_pages INT
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		a.id,
		a.sheet_number,
		a.dummy_number_on_sheet AS dummy_number,
		c.course_code::TEXT,
		c.course_name::TEXT,
		et.exam_date,
		et.session::TEXT AS exam_session,
		a.sheet_status::TEXT,
		a.total_pages
	FROM public.answer_sheets a
	LEFT JOIN public.courses c ON a.course_id = c.id
	LEFT JOIN public.exam_timetables et ON a.exam_timetable_id = et.id
	WHERE a.dummy_number_on_sheet = p_dummy_number
	ORDER BY et.exam_date, et.session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.answer_sheets ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. CREATE RLS POLICIES
-- =====================================================

-- Policy: Allow authenticated users to read answer sheets
CREATE POLICY "Authenticated users can read answer sheets"
	ON public.answer_sheets
	FOR SELECT
	TO authenticated
	USING (true);

-- Policy: Allow authenticated users to insert answer sheets
CREATE POLICY "Authenticated users can insert answer sheets"
	ON public.answer_sheets
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

-- Policy: Allow authenticated users to update answer sheets
CREATE POLICY "Authenticated users can update answer sheets"
	ON public.answer_sheets
	FOR UPDATE
	TO authenticated
	USING (true)
	WITH CHECK (true);

-- Policy: Allow admins to delete answer sheets
CREATE POLICY "Admins can delete answer sheets"
	ON public.answer_sheets
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
CREATE POLICY "Service role can manage all answer sheets"
	ON public.answer_sheets
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION generate_answer_sheet_number(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_answer_sheet_barcode(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_answer_sheet_statistics(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_answer_sheet_collected(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_update_answer_sheet_status(UUID[], TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_answer_sheets_by_dummy_number(TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION generate_answer_sheet_number(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION generate_answer_sheet_barcode(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_answer_sheet_statistics(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION mark_answer_sheet_collected(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_update_answer_sheet_status(UUID[], TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_answer_sheets_by_dummy_number(TEXT) TO service_role;

-- =====================================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.answer_sheets IS 'Tracks exam answer sheets with blind evaluation support using dummy numbers';
COMMENT ON VIEW public.answer_sheets_detailed_view IS 'Denormalized view of answer sheets with all related entity information';
COMMENT ON VIEW public.answer_sheets_summary_view IS 'Statistical summary of answer sheets grouped by institution, session, program, and course';
COMMENT ON VIEW public.answer_sheets_pending_collection IS 'View of answer sheets issued but not yet collected';

COMMENT ON COLUMN public.answer_sheets.sheet_number IS 'Unique sheet identification number';
COMMENT ON COLUMN public.answer_sheets.barcode IS 'Barcode for scanning and tracking';
COMMENT ON COLUMN public.answer_sheets.dummy_number_on_sheet IS 'Blind evaluation dummy number printed on sheet';
COMMENT ON COLUMN public.answer_sheets.main_sheets_count IS 'Number of main answer sheets';
COMMENT ON COLUMN public.answer_sheets.supplementary_sheets_count IS 'Number of supplementary/extra sheets';
COMMENT ON COLUMN public.answer_sheets.total_pages IS 'Auto-calculated total pages (main + supplementary)';
COMMENT ON COLUMN public.answer_sheets.sheet_type IS 'Type of sheet: Regular, Scribe, Extra Time, Special';
COMMENT ON COLUMN public.answer_sheets.sheet_status IS 'Current status: Issued, Collected, Under Evaluation, Evaluated, Missing, Cancelled';

COMMENT ON FUNCTION generate_answer_sheet_number(TEXT, TEXT, TEXT, TEXT) IS 'Generates unique sheet number based on institution, session, program, and course';
COMMENT ON FUNCTION generate_answer_sheet_barcode(TEXT) IS 'Generates barcode from sheet number';
COMMENT ON FUNCTION get_answer_sheet_statistics(TEXT, TEXT, TEXT) IS 'Returns statistical summary of answer sheets';
COMMENT ON FUNCTION mark_answer_sheet_collected(TEXT, UUID) IS 'Marks an answer sheet as collected by a user';
COMMENT ON FUNCTION bulk_update_answer_sheet_status(UUID[], TEXT, TEXT) IS 'Updates status for multiple answer sheets in bulk';
COMMENT ON FUNCTION get_answer_sheets_by_dummy_number(TEXT) IS 'Retrieves all answer sheets for a given dummy number';

-- =====================================================
-- 10. ENABLE REALTIME (OPTIONAL)
-- =====================================================

-- Enable realtime for answer_sheets table if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE answer_sheets;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
