-- =====================================================
-- Marks Upload Batches Table with RLS, Functions, and Views
-- =====================================================
-- Date: 2025-11-13
-- Purpose: Track bulk mark uploads and batch processing
-- =====================================================

-- =====================================================
-- 1. CREATE MARKS UPLOAD BATCHES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.marks_upload_batches (
	id UUID NOT NULL DEFAULT gen_random_uuid(),
	
	-- Core References
	institutions_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	course_offering_id UUID NOT NULL,
	program_id UUID NOT NULL,
	course_id UUID NOT NULL,
	
	-- Batch Details
	batch_number VARCHAR(50) NOT NULL,
	batch_name VARCHAR(255),
	upload_type VARCHAR(50) NOT NULL, -- Dummy Numbers, Answer Sheets, Marks, Results, Students
	
	-- Record Statistics
	total_records INT NOT NULL,
	successful_records INT DEFAULT 0,
	failed_records INT DEFAULT 0,
	skipped_records INT DEFAULT 0,
	success_rate DECIMAL(5,2) GENERATED ALWAYS AS (
		CASE 
			WHEN total_records > 0 THEN ROUND((successful_records::NUMERIC / total_records::NUMERIC) * 100, 2)
			ELSE 0
		END
	) STORED,
	
	-- File Details
	file_name VARCHAR(255),
	file_path VARCHAR(500),
	file_size BIGINT, -- in bytes
	file_type VARCHAR(50), -- CSV, XLSX, JSON
	file_hash VARCHAR(64), -- SHA-256 hash for integrity
	
	-- Processing Details
	upload_status VARCHAR(50) DEFAULT 'Pending', -- Pending, Processing, Completed, Failed, Cancelled, Partial
	processing_started_at TIMESTAMP WITH TIME ZONE,
	processing_completed_at TIMESTAMP WITH TIME ZONE,
	processing_duration_seconds INT GENERATED ALWAYS AS (
		CASE 
			WHEN processing_completed_at IS NOT NULL AND processing_started_at IS NOT NULL 
			THEN EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at))::INT
			ELSE NULL
		END
	) STORED,
	
	-- Error Tracking
	error_details JSONB, -- {row: 5, error: "Invalid format", field: "marks"}
	error_summary TEXT,
	validation_errors JSONB,
	
	-- User Tracking
	uploaded_by UUID,
	processed_by UUID,
	verified_by UUID,
	verified_at TIMESTAMP WITH TIME ZONE,
	
	-- Metadata
	upload_metadata JSONB, -- Additional configuration or context
	processing_notes TEXT,
	is_active BOOLEAN DEFAULT true,
	
	-- Audit Fields
	uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	processed_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID,
	updated_by UUID,
	
	-- Primary Key
	CONSTRAINT marks_upload_batches_pkey PRIMARY KEY (id),
	
	-- Foreign Key Constraints
	CONSTRAINT marks_upload_batches_institutions_id_fkey 
		FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE CASCADE,
	CONSTRAINT marks_upload_batches_examination_session_id_fkey 
		FOREIGN KEY (examination_session_id) REFERENCES examination_sessions(id) ON DELETE CASCADE,
	CONSTRAINT marks_upload_batches_course_offering_id_fkey 
		FOREIGN KEY (course_offering_id) REFERENCES course_offerings(id) ON DELETE CASCADE,
	CONSTRAINT marks_upload_batches_program_id_fkey 
		FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT,
	CONSTRAINT marks_upload_batches_course_id_fkey 
		FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
	CONSTRAINT marks_upload_batches_uploaded_by_fkey 
		FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT marks_upload_batches_processed_by_fkey 
		FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT marks_upload_batches_verified_by_fkey 
		FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT marks_upload_batches_created_by_fkey 
		FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT marks_upload_batches_updated_by_fkey 
		FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
	
	-- Unique Constraints
	CONSTRAINT unique_batch_number 
		UNIQUE(institutions_id, batch_number),
	CONSTRAINT unique_file_hash 
		UNIQUE(institutions_id, examination_session_id, file_hash),
	
	-- Check Constraints
	CONSTRAINT check_total_records_positive 
		CHECK (total_records > 0),
	CONSTRAINT check_successful_records_non_negative 
		CHECK (successful_records >= 0),
	CONSTRAINT check_failed_records_non_negative 
		CHECK (failed_records >= 0),
	CONSTRAINT check_skipped_records_non_negative 
		CHECK (skipped_records >= 0),
	CONSTRAINT check_records_sum 
		CHECK (successful_records + failed_records + skipped_records <= total_records),
	CONSTRAINT check_valid_upload_type 
		CHECK (upload_type IN ('Dummy Numbers', 'Answer Sheets', 'Marks', 'Results', 'Students', 'Attendance', 'Registrations')),
	CONSTRAINT check_valid_upload_status 
		CHECK (upload_status IN ('Pending', 'Processing', 'Completed', 'Failed', 'Cancelled', 'Partial', 'Validating', 'Verified')),
	CONSTRAINT check_valid_file_type 
		CHECK (file_type IS NULL OR file_type IN ('CSV', 'XLSX', 'XLS', 'JSON', 'XML', 'TSV')),
	CONSTRAINT check_file_size_positive 
		CHECK (file_size IS NULL OR file_size > 0),
	CONSTRAINT check_processing_times 
		CHECK (
			processing_started_at IS NULL OR 
			processing_completed_at IS NULL OR 
			processing_completed_at >= processing_started_at
		)
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_institutions_id 
	ON public.marks_upload_batches(institutions_id);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_examination_session_id 
	ON public.marks_upload_batches(examination_session_id);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_course_offering_id 
	ON public.marks_upload_batches(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_program_id 
	ON public.marks_upload_batches(program_id);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_course_id 
	ON public.marks_upload_batches(course_id);

-- Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_batch_number 
	ON public.marks_upload_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_upload_status 
	ON public.marks_upload_batches(upload_status);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_upload_type 
	ON public.marks_upload_batches(upload_type);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_is_active 
	ON public.marks_upload_batches(is_active);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_file_hash 
	ON public.marks_upload_batches(file_hash) WHERE file_hash IS NOT NULL;

-- User Tracking Indexes
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_uploaded_by 
	ON public.marks_upload_batches(uploaded_by) WHERE uploaded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_processed_by 
	ON public.marks_upload_batches(processed_by) WHERE processed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_verified_by 
	ON public.marks_upload_batches(verified_by) WHERE verified_by IS NOT NULL;

-- Date Indexes
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_uploaded_at 
	ON public.marks_upload_batches(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_processed_at 
	ON public.marks_upload_batches(processed_at DESC) WHERE processed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_created_at 
	ON public.marks_upload_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_processing_started_at 
	ON public.marks_upload_batches(processing_started_at) WHERE processing_started_at IS NOT NULL;

-- Performance Metrics Indexes
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_success_rate 
	ON public.marks_upload_batches(success_rate);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_failed_records 
	ON public.marks_upload_batches(failed_records) WHERE failed_records > 0;

-- Composite Indexes for Common Queries
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_institution_session 
	ON public.marks_upload_batches(institutions_id, examination_session_id);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_session_status 
	ON public.marks_upload_batches(examination_session_id, upload_status);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_session_type 
	ON public.marks_upload_batches(examination_session_id, upload_type);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_course_offering_type 
	ON public.marks_upload_batches(course_offering_id, upload_type);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_institution_session_status 
	ON public.marks_upload_batches(institutions_id, examination_session_id, upload_status);

-- JSONB Indexes
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_error_details 
	ON public.marks_upload_batches USING gin(error_details);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_validation_errors 
	ON public.marks_upload_batches USING gin(validation_errors);
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_upload_metadata 
	ON public.marks_upload_batches USING gin(upload_metadata);

-- Partial Indexes for Specific Queries
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_pending 
	ON public.marks_upload_batches(id, uploaded_at) 
	WHERE upload_status = 'Pending';
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_processing 
	ON public.marks_upload_batches(id, processing_started_at) 
	WHERE upload_status = 'Processing';
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_failed 
	ON public.marks_upload_batches(id, uploaded_at, failed_records) 
	WHERE upload_status = 'Failed' OR failed_records > 0;
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_completed 
	ON public.marks_upload_batches(id, processed_at, success_rate) 
	WHERE upload_status = 'Completed';
CREATE INDEX IF NOT EXISTS idx_marks_upload_batches_active 
	ON public.marks_upload_batches(id, upload_status, uploaded_at) 
	WHERE is_active = true;

-- =====================================================
-- 3. CREATE TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_marks_upload_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_marks_upload_batches_updated_at
	BEFORE UPDATE ON public.marks_upload_batches
	FOR EACH ROW
	EXECUTE FUNCTION update_marks_upload_batches_updated_at();

-- Auto-populate processing_started_at when status changes to Processing
CREATE OR REPLACE FUNCTION auto_populate_batch_processing_started()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.upload_status = 'Processing' AND (OLD.upload_status IS NULL OR OLD.upload_status != 'Processing') THEN
		NEW.processing_started_at = CURRENT_TIMESTAMP;
		IF NEW.processed_by IS NULL THEN
			NEW.processed_by = auth.uid();
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_batch_processing_started
	BEFORE UPDATE ON public.marks_upload_batches
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_batch_processing_started();

-- Auto-populate processing_completed_at when status changes to Completed/Failed
CREATE OR REPLACE FUNCTION auto_populate_batch_processing_completed()
RETURNS TRIGGER AS $$
BEGIN
	IF NEW.upload_status IN ('Completed', 'Failed', 'Partial') AND 
	   (OLD.upload_status IS NULL OR OLD.upload_status NOT IN ('Completed', 'Failed', 'Partial')) THEN
		NEW.processing_completed_at = CURRENT_TIMESTAMP;
		NEW.processed_at = CURRENT_TIMESTAMP;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_batch_processing_completed
	BEFORE UPDATE ON public.marks_upload_batches
	FOR EACH ROW
	EXECUTE FUNCTION auto_populate_batch_processing_completed();

-- Generate batch number if not provided
CREATE OR REPLACE FUNCTION generate_batch_number()
RETURNS TRIGGER AS $$
DECLARE
	v_sequence INT;
	v_batch_number TEXT;
	v_institution_code TEXT;
	v_session_code TEXT;
	v_type_code TEXT;
BEGIN
	IF NEW.batch_number IS NULL OR NEW.batch_number = '' THEN
		-- Get institution code
		SELECT institution_code INTO v_institution_code
		FROM public.institutions
		WHERE id = NEW.institutions_id;
		
		-- Get session code
		SELECT session_code INTO v_session_code
		FROM public.examination_sessions
		WHERE id = NEW.examination_session_id;
		
		-- Get type code
		v_type_code := CASE NEW.upload_type
			WHEN 'Dummy Numbers' THEN 'DN'
			WHEN 'Answer Sheets' THEN 'AS'
			WHEN 'Marks' THEN 'MK'
			WHEN 'Results' THEN 'RS'
			WHEN 'Students' THEN 'ST'
			WHEN 'Attendance' THEN 'AT'
			WHEN 'Registrations' THEN 'RG'
			ELSE 'UP'
		END;
		
		-- Get next sequence number
		SELECT COALESCE(MAX(CAST(SUBSTRING(batch_number FROM '\d+$') AS INT)), 0) + 1
		INTO v_sequence
		FROM public.marks_upload_batches
		WHERE institutions_id = NEW.institutions_id
			AND examination_session_id = NEW.examination_session_id
			AND upload_type = NEW.upload_type;
		
		-- Format: INST-SESSION-TYPE-YYYYMMDD-SEQNO
		v_batch_number := v_institution_code || '-' || 
						  v_session_code || '-' || 
						  v_type_code || '-' || 
						  TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
						  LPAD(v_sequence::TEXT, 4, '0');
		
		NEW.batch_number = v_batch_number;
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_batch_number
	BEFORE INSERT ON public.marks_upload_batches
	FOR EACH ROW
	EXECUTE FUNCTION generate_batch_number();

-- Validate status transitions
CREATE OR REPLACE FUNCTION validate_batch_status_transition()
RETURNS TRIGGER AS $$
BEGIN
	-- Prevent changing from terminal states
	IF OLD.upload_status IN ('Completed', 'Cancelled') AND NEW.upload_status != OLD.upload_status THEN
		RAISE EXCEPTION 'Cannot change status from % to %', OLD.upload_status, NEW.upload_status;
	END IF;
	
	-- Validate logical transitions
	IF OLD.upload_status = 'Pending' AND NEW.upload_status NOT IN ('Processing', 'Validating', 'Cancelled', 'Failed') THEN
		RAISE EXCEPTION 'Invalid status transition from Pending to %', NEW.upload_status;
	END IF;
	
	IF OLD.upload_status = 'Processing' AND NEW.upload_status NOT IN ('Completed', 'Failed', 'Partial', 'Cancelled') THEN
		RAISE EXCEPTION 'Invalid status transition from Processing to %', NEW.upload_status;
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_batch_status_transition
	BEFORE UPDATE ON public.marks_upload_batches
	FOR EACH ROW
	EXECUTE FUNCTION validate_batch_status_transition();

-- Update success/fail counts and status automatically
CREATE OR REPLACE FUNCTION update_batch_completion_status()
RETURNS TRIGGER AS $$
BEGIN
	-- Auto-update status based on record counts
	IF NEW.successful_records + NEW.failed_records + NEW.skipped_records = NEW.total_records THEN
		IF NEW.failed_records = 0 AND NEW.successful_records = NEW.total_records THEN
			NEW.upload_status = 'Completed';
		ELSIF NEW.failed_records = NEW.total_records THEN
			NEW.upload_status = 'Failed';
		ELSIF NEW.successful_records > 0 THEN
			NEW.upload_status = 'Partial';
		END IF;
	END IF;
	
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_batch_completion_status
	BEFORE UPDATE ON public.marks_upload_batches
	FOR EACH ROW
	WHEN (NEW.successful_records != OLD.successful_records OR 
	      NEW.failed_records != OLD.failed_records OR 
	      NEW.skipped_records != OLD.skipped_records)
	EXECUTE FUNCTION update_batch_completion_status();

-- =====================================================
-- 4. CREATE VIEWS
-- =====================================================

-- Detailed Upload Batches View with all related data
CREATE OR REPLACE VIEW public.marks_upload_batches_detailed_view AS
SELECT
	-- Batch Details
	mub.id,
	mub.batch_number,
	mub.batch_name,
	mub.upload_type,
	mub.upload_status,
	
	-- Record Statistics
	mub.total_records,
	mub.successful_records,
	mub.failed_records,
	mub.skipped_records,
	mub.success_rate,
	
	-- File Details
	mub.file_name,
	mub.file_path,
	mub.file_size,
	mub.file_type,
	mub.file_hash,
	CASE 
		WHEN mub.file_size IS NOT NULL THEN 
			CASE 
				WHEN mub.file_size < 1024 THEN mub.file_size || ' B'
				WHEN mub.file_size < 1048576 THEN ROUND(mub.file_size / 1024.0, 2) || ' KB'
				WHEN mub.file_size < 1073741824 THEN ROUND(mub.file_size / 1048576.0, 2) || ' MB'
				ELSE ROUND(mub.file_size / 1073741824.0, 2) || ' GB'
			END
		ELSE NULL
	END AS file_size_formatted,
	
	-- Processing Details
	mub.processing_started_at,
	mub.processing_completed_at,
	mub.processing_duration_seconds,
	CASE 
		WHEN mub.processing_duration_seconds IS NOT NULL THEN
			CASE 
				WHEN mub.processing_duration_seconds < 60 THEN mub.processing_duration_seconds || 's'
				WHEN mub.processing_duration_seconds < 3600 THEN 
					FLOOR(mub.processing_duration_seconds / 60) || 'm ' || 
					(mub.processing_duration_seconds % 60) || 's'
				ELSE 
					FLOOR(mub.processing_duration_seconds / 3600) || 'h ' || 
					FLOOR((mub.processing_duration_seconds % 3600) / 60) || 'm'
			END
		ELSE NULL
	END AS processing_duration_formatted,
	
	-- Error Details
	mub.error_details,
	mub.error_summary,
	mub.validation_errors,
	mub.processing_notes,
	
	-- User Details
	mub.uploaded_by,
	uu.full_name AS uploaded_by_name,
	uu.email AS uploaded_by_email,
	mub.processed_by,
	pu.full_name AS processed_by_name,
	mub.verified_by,
	vu.full_name AS verified_by_name,
	mub.verified_at,
	
	-- Institution Details
	mub.institutions_id,
	i.institution_code,
	i.name AS institution_name,
	
	-- Examination Session Details
	mub.examination_session_id,
	es.session_code,
	es.session_name,
	es.session_year,
	
	-- Program Details
	mub.program_id,
	p.program_code,
	p.program_name,
	
	-- Course Details
	mub.course_id,
	c.course_code,
	c.course_name,
	
	-- Course Offering Details
	mub.course_offering_id,
	co.semester,
	co.section,
	
	-- Metadata
	mub.upload_metadata,
	mub.is_active,
	
	-- Audit Fields
	mub.uploaded_at,
	mub.processed_at,
	mub.created_at,
	mub.updated_at,
	mub.created_by,
	mub.updated_by
FROM public.marks_upload_batches mub
LEFT JOIN public.users uu ON mub.uploaded_by = uu.id
LEFT JOIN public.users pu ON mub.processed_by = pu.id
LEFT JOIN public.users vu ON mub.verified_by = vu.id
LEFT JOIN public.institutions i ON mub.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON mub.examination_session_id = es.id
LEFT JOIN public.programs p ON mub.program_id = p.id
LEFT JOIN public.courses c ON mub.course_id = c.id
LEFT JOIN public.course_offerings co ON mub.course_offering_id = co.id;

-- Upload Batches Summary View for reporting
CREATE OR REPLACE VIEW public.marks_upload_batches_summary_view AS
SELECT
	i.institution_code,
	i.name AS institution_name,
	es.session_code,
	es.session_name,
	mub.upload_type,
	COUNT(*) AS total_batches,
	COUNT(*) FILTER (WHERE mub.upload_status = 'Pending') AS pending_count,
	COUNT(*) FILTER (WHERE mub.upload_status = 'Processing') AS processing_count,
	COUNT(*) FILTER (WHERE mub.upload_status = 'Completed') AS completed_count,
	COUNT(*) FILTER (WHERE mub.upload_status = 'Failed') AS failed_count,
	COUNT(*) FILTER (WHERE mub.upload_status = 'Partial') AS partial_count,
	SUM(mub.total_records) AS total_records,
	SUM(mub.successful_records) AS total_successful,
	SUM(mub.failed_records) AS total_failed,
	SUM(mub.skipped_records) AS total_skipped,
	ROUND(AVG(mub.success_rate), 2) AS average_success_rate,
	ROUND(AVG(mub.processing_duration_seconds), 2) AS avg_processing_time_seconds,
	MIN(mub.uploaded_at) AS first_upload_date,
	MAX(mub.uploaded_at) AS last_upload_date
FROM public.marks_upload_batches mub
LEFT JOIN public.institutions i ON mub.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON mub.examination_session_id = es.id
WHERE mub.is_active = true
GROUP BY
	i.institution_code, i.name,
	es.session_code, es.session_name,
	mub.upload_type;

-- Pending Uploads View
CREATE OR REPLACE VIEW public.marks_upload_batches_pending_view AS
SELECT
	mub.id,
	mub.batch_number,
	mub.upload_type,
	i.institution_code,
	es.session_code,
	c.course_code,
	c.course_name,
	mub.total_records,
	mub.file_name,
	mub.uploaded_by,
	uu.full_name AS uploaded_by_name,
	mub.uploaded_at,
	EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - mub.uploaded_at)) / 3600 AS hours_waiting
FROM public.marks_upload_batches mub
LEFT JOIN public.users uu ON mub.uploaded_by = uu.id
LEFT JOIN public.institutions i ON mub.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON mub.examination_session_id = es.id
LEFT JOIN public.courses c ON mub.course_id = c.id
WHERE mub.upload_status = 'Pending'
	AND mub.is_active = true
ORDER BY mub.uploaded_at ASC;

-- Failed Uploads View
CREATE OR REPLACE VIEW public.marks_upload_batches_failed_view AS
SELECT
	mub.id,
	mub.batch_number,
	mub.upload_type,
	i.institution_code,
	es.session_code,
	c.course_code,
	c.course_name,
	mub.total_records,
	mub.failed_records,
	mub.file_name,
	mub.error_summary,
	mub.uploaded_by,
	uu.full_name AS uploaded_by_name,
	mub.uploaded_at,
	mub.processed_at
FROM public.marks_upload_batches mub
LEFT JOIN public.users uu ON mub.uploaded_by = uu.id
LEFT JOIN public.institutions i ON mub.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON mub.examination_session_id = es.id
LEFT JOIN public.courses c ON mub.course_id = c.id
WHERE (mub.upload_status = 'Failed' OR mub.failed_records > 0)
	AND mub.is_active = true
ORDER BY mub.uploaded_at DESC;

-- Upload Performance Metrics View
CREATE OR REPLACE VIEW public.upload_performance_metrics_view AS
SELECT
	uu.id AS user_id,
	uu.full_name AS user_name,
	i.institution_code,
	es.session_code,
	mub.upload_type,
	COUNT(*) AS total_uploads,
	COUNT(*) FILTER (WHERE mub.upload_status = 'Completed') AS successful_uploads,
	COUNT(*) FILTER (WHERE mub.upload_status = 'Failed') AS failed_uploads,
	SUM(mub.total_records) AS total_records_uploaded,
	SUM(mub.successful_records) AS total_records_processed,
	ROUND(AVG(mub.success_rate), 2) AS avg_success_rate,
	ROUND(AVG(mub.processing_duration_seconds), 2) AS avg_processing_time,
	MIN(mub.uploaded_at) AS first_upload,
	MAX(mub.uploaded_at) AS last_upload
FROM public.marks_upload_batches mub
LEFT JOIN public.users uu ON mub.uploaded_by = uu.id
LEFT JOIN public.institutions i ON mub.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON mub.examination_session_id = es.id
WHERE mub.is_active = true
GROUP BY
	uu.id, uu.full_name,
	i.institution_code,
	es.session_code,
	mub.upload_type;

-- =====================================================
-- 5. CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to start batch processing
CREATE OR REPLACE FUNCTION start_batch_processing(
	p_batch_id UUID,
	p_processed_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_processed_by UUID;
BEGIN
	v_processed_by := COALESCE(p_processed_by, auth.uid());
	
	UPDATE public.marks_upload_batches
	SET
		upload_status = 'Processing',
		processed_by = v_processed_by,
		processing_started_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_processed_by
	WHERE id = p_batch_id
		AND upload_status = 'Pending';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete batch processing
CREATE OR REPLACE FUNCTION complete_batch_processing(
	p_batch_id UUID,
	p_successful_records INT,
	p_failed_records INT,
	p_skipped_records INT DEFAULT 0,
	p_error_summary TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.marks_upload_batches
	SET
		successful_records = p_successful_records,
		failed_records = p_failed_records,
		skipped_records = p_skipped_records,
		upload_status = CASE 
			WHEN p_failed_records = 0 THEN 'Completed'
			WHEN p_successful_records = 0 THEN 'Failed'
			ELSE 'Partial'
		END,
		error_summary = p_error_summary,
		processing_completed_at = CURRENT_TIMESTAMP,
		processed_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_batch_id
		AND upload_status = 'Processing';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to fail batch processing
CREATE OR REPLACE FUNCTION fail_batch_processing(
	p_batch_id UUID,
	p_error_summary TEXT,
	p_error_details JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.marks_upload_batches
	SET
		upload_status = 'Failed',
		error_summary = p_error_summary,
		error_details = COALESCE(p_error_details, error_details),
		processing_completed_at = CURRENT_TIMESTAMP,
		processed_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_batch_id
		AND upload_status IN ('Pending', 'Processing');
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cancel batch processing
CREATE OR REPLACE FUNCTION cancel_batch_processing(
	p_batch_id UUID,
	p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.marks_upload_batches
	SET
		upload_status = 'Cancelled',
		error_summary = p_cancellation_reason,
		processing_completed_at = CURRENT_TIMESTAMP,
		processed_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_batch_id
		AND upload_status IN ('Pending', 'Processing');
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retry failed batch
CREATE OR REPLACE FUNCTION retry_failed_batch(
	p_batch_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.marks_upload_batches
	SET
		upload_status = 'Pending',
		successful_records = 0,
		failed_records = 0,
		skipped_records = 0,
		error_details = NULL,
		error_summary = NULL,
		processing_started_at = NULL,
		processing_completed_at = NULL,
		processed_at = NULL,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_batch_id
		AND upload_status IN ('Failed', 'Partial');
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update batch progress
CREATE OR REPLACE FUNCTION update_batch_progress(
	p_batch_id UUID,
	p_successful_records INT,
	p_failed_records INT,
	p_skipped_records INT DEFAULT 0
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.marks_upload_batches
	SET
		successful_records = p_successful_records,
		failed_records = p_failed_records,
		skipped_records = p_skipped_records,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_batch_id
		AND upload_status = 'Processing';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get batch statistics
CREATE OR REPLACE FUNCTION get_batch_statistics(
	p_institution_code TEXT DEFAULT NULL,
	p_session_code TEXT DEFAULT NULL,
	p_upload_type TEXT DEFAULT NULL
)
RETURNS TABLE (
	upload_type TEXT,
	total_batches BIGINT,
	pending_batches BIGINT,
	processing_batches BIGINT,
	completed_batches BIGINT,
	failed_batches BIGINT,
	total_records BIGINT,
	successful_records BIGINT,
	failed_records BIGINT,
	average_success_rate NUMERIC,
	average_processing_time NUMERIC
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		mub.upload_type::TEXT,
		COUNT(*) AS total_batches,
		COUNT(*) FILTER (WHERE mub.upload_status = 'Pending') AS pending_batches,
		COUNT(*) FILTER (WHERE mub.upload_status = 'Processing') AS processing_batches,
		COUNT(*) FILTER (WHERE mub.upload_status = 'Completed') AS completed_batches,
		COUNT(*) FILTER (WHERE mub.upload_status = 'Failed') AS failed_batches,
		SUM(mub.total_records) AS total_records,
		SUM(mub.successful_records) AS successful_records,
		SUM(mub.failed_records) AS failed_records,
		ROUND(AVG(mub.success_rate), 2) AS average_success_rate,
		ROUND(AVG(mub.processing_duration_seconds), 2) AS average_processing_time
	FROM public.marks_upload_batches mub
	LEFT JOIN public.institutions i ON mub.institutions_id = i.id
	LEFT JOIN public.examination_sessions es ON mub.examination_session_id = es.id
	WHERE mub.is_active = true
		AND (p_institution_code IS NULL OR i.institution_code = p_institution_code)
		AND (p_session_code IS NULL OR es.session_code = p_session_code)
		AND (p_upload_type IS NULL OR mub.upload_type = p_upload_type)
	GROUP BY mub.upload_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add error details to batch
CREATE OR REPLACE FUNCTION add_batch_error_details(
	p_batch_id UUID,
	p_error_details JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
	UPDATE public.marks_upload_batches
	SET
		error_details = CASE 
			WHEN error_details IS NULL THEN jsonb_build_array(p_error_details)
			ELSE error_details || jsonb_build_array(p_error_details)
		END,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = auth.uid()
	WHERE id = p_batch_id;
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to verify batch
CREATE OR REPLACE FUNCTION verify_batch(
	p_batch_id UUID,
	p_verified_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
	v_verified_by UUID;
BEGIN
	v_verified_by := COALESCE(p_verified_by, auth.uid());
	
	UPDATE public.marks_upload_batches
	SET
		upload_status = 'Verified',
		verified_by = v_verified_by,
		verified_at = CURRENT_TIMESTAMP,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_verified_by
	WHERE id = p_batch_id
		AND upload_status = 'Completed';
	
	RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent batches by user
CREATE OR REPLACE FUNCTION get_recent_batches_by_user(
	p_user_id UUID,
	p_limit INT DEFAULT 10
)
RETURNS TABLE (
	id UUID,
	batch_number TEXT,
	upload_type TEXT,
	upload_status TEXT,
	total_records INT,
	successful_records INT,
	failed_records INT,
	success_rate NUMERIC,
	uploaded_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
	RETURN QUERY
	SELECT
		mub.id,
		mub.batch_number::TEXT,
		mub.upload_type::TEXT,
		mub.upload_status::TEXT,
		mub.total_records,
		mub.successful_records,
		mub.failed_records,
		mub.success_rate,
		mub.uploaded_at
	FROM public.marks_upload_batches mub
	WHERE mub.uploaded_by = p_user_id
		AND mub.is_active = true
	ORDER BY mub.uploaded_at DESC
	LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.marks_upload_batches ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. CREATE RLS POLICIES
-- =====================================================

-- Policy: Allow authenticated users to read upload batches
CREATE POLICY "Authenticated users can read upload batches"
	ON public.marks_upload_batches
	FOR SELECT
	TO authenticated
	USING (true);

-- Policy: Allow users to read their own upload batches
CREATE POLICY "Users can read their own upload batches"
	ON public.marks_upload_batches
	FOR SELECT
	TO authenticated
	USING (uploaded_by = auth.uid());

-- Policy: Allow authenticated users to insert upload batches
CREATE POLICY "Authenticated users can insert upload batches"
	ON public.marks_upload_batches
	FOR INSERT
	TO authenticated
	WITH CHECK (true);

-- Policy: Allow users to update their own upload batches (if pending)
CREATE POLICY "Users can update their own pending batches"
	ON public.marks_upload_batches
	FOR UPDATE
	TO authenticated
	USING (uploaded_by = auth.uid() AND upload_status = 'Pending')
	WITH CHECK (uploaded_by = auth.uid() AND upload_status = 'Pending');

-- Policy: Allow admins to update all upload batches
CREATE POLICY "Admins can update all upload batches"
	ON public.marks_upload_batches
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

-- Policy: Allow admins to delete upload batches
CREATE POLICY "Admins can delete upload batches"
	ON public.marks_upload_batches
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
CREATE POLICY "Service role can manage all upload batches"
	ON public.marks_upload_batches
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION start_batch_processing(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_batch_processing(UUID, INT, INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fail_batch_processing(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_batch_processing(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION retry_failed_batch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_batch_progress(UUID, INT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_batch_statistics(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_batch_error_details(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_batch(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_batches_by_user(UUID, INT) TO authenticated;

GRANT EXECUTE ON FUNCTION start_batch_processing(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION complete_batch_processing(UUID, INT, INT, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fail_batch_processing(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_batch_processing(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION retry_failed_batch(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_batch_progress(UUID, INT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION get_batch_statistics(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION add_batch_error_details(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION verify_batch(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_recent_batches_by_user(UUID, INT) TO service_role;

-- =====================================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.marks_upload_batches IS 'Tracks bulk upload batches for marks, answer sheets, dummy numbers, and other examination data';
COMMENT ON VIEW public.marks_upload_batches_detailed_view IS 'Denormalized view of upload batches with all related entity information and formatted metrics';
COMMENT ON VIEW public.marks_upload_batches_summary_view IS 'Statistical summary of upload batches grouped by institution, session, and upload type';
COMMENT ON VIEW public.marks_upload_batches_pending_view IS 'View of pending upload batches awaiting processing';
COMMENT ON VIEW public.marks_upload_batches_failed_view IS 'View of failed or partially failed upload batches';
COMMENT ON VIEW public.upload_performance_metrics_view IS 'Performance metrics for users uploading batches';

COMMENT ON COLUMN public.marks_upload_batches.batch_number IS 'Unique batch identification number (auto-generated if not provided)';
COMMENT ON COLUMN public.marks_upload_batches.upload_type IS 'Type of data being uploaded: Dummy Numbers, Answer Sheets, Marks, Results, Students, Attendance, Registrations';
COMMENT ON COLUMN public.marks_upload_batches.success_rate IS 'Auto-calculated success rate percentage';
COMMENT ON COLUMN public.marks_upload_batches.processing_duration_seconds IS 'Auto-calculated processing time in seconds';
COMMENT ON COLUMN public.marks_upload_batches.file_hash IS 'SHA-256 hash of file for integrity verification and duplicate detection';
COMMENT ON COLUMN public.marks_upload_batches.error_details IS 'JSONB array of error details: [{row: 5, error: "Invalid format", field: "marks"}]';
COMMENT ON COLUMN public.marks_upload_batches.upload_status IS 'Current status: Pending, Processing, Completed, Failed, Cancelled, Partial, Validating, Verified';

COMMENT ON FUNCTION start_batch_processing(UUID, UUID) IS 'Marks a batch as processing and records start time';
COMMENT ON FUNCTION complete_batch_processing(UUID, INT, INT, INT, TEXT) IS 'Completes batch processing with success/failure counts';
COMMENT ON FUNCTION fail_batch_processing(UUID, TEXT, JSONB) IS 'Marks a batch as failed with error details';
COMMENT ON FUNCTION cancel_batch_processing(UUID, TEXT) IS 'Cancels a pending or processing batch';
COMMENT ON FUNCTION retry_failed_batch(UUID) IS 'Resets a failed batch to pending status for retry';
COMMENT ON FUNCTION update_batch_progress(UUID, INT, INT, INT) IS 'Updates progress counters during batch processing';
COMMENT ON FUNCTION get_batch_statistics(TEXT, TEXT, TEXT) IS 'Returns statistical summary of upload batches';
COMMENT ON FUNCTION add_batch_error_details(UUID, JSONB) IS 'Appends error details to batch error log';
COMMENT ON FUNCTION verify_batch(UUID, UUID) IS 'Verifies a completed batch';
COMMENT ON FUNCTION get_recent_batches_by_user(UUID, INT) IS 'Returns recent upload batches for a specific user';

-- =====================================================
-- 10. ENABLE REALTIME (OPTIONAL)
-- =====================================================

-- Enable realtime for marks_upload_batches table if needed
-- ALTER PUBLICATION supabase_realtime ADD TABLE marks_upload_batches;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
