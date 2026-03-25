-- =====================================================
-- ANSWER SHEET PACKETS COMPLETE MIGRATION
-- Created: 2025-11-17
-- Description: Complete setup for answer_sheet_packets table including
--              table creation, RLS policies, functions, triggers, and views
-- =====================================================

-- =====================================================
-- 1. CREATE TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.answer_sheet_packets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  institutions_id uuid NOT NULL,
  examination_session_id uuid NOT NULL,
  course_id uuid NOT NULL,
  exam_timetable_id uuid NULL,
  packet_no character varying(50) NOT NULL,
  total_sheets integer NOT NULL DEFAULT 0,
  packet_status character varying(50) NULL DEFAULT 'Created'::character varying,
  created_at timestamp with time zone NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NULL DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NULL,
  updated_by uuid NULL,
  is_active boolean NULL DEFAULT true,
  remarks text NULL,
  
  -- Additional tracking fields for packet management
  assigned_to uuid NULL,
  assigned_at timestamp with time zone NULL,
  evaluation_started_at timestamp with time zone NULL,
  evaluation_completed_at timestamp with time zone NULL,
  sheets_evaluated integer NULL DEFAULT 0,
  evaluation_progress numeric(5,2) NULL DEFAULT 0.00,
  packet_location character varying(200) NULL,
  barcode character varying(100) NULL,
  
  CONSTRAINT answer_sheet_packets_pkey PRIMARY KEY (id),
  CONSTRAINT unique_answer_sheet_packet UNIQUE (
    institutions_id,
    examination_session_id,
    course_id,
    packet_no
  ),
  CONSTRAINT answer_sheet_packets_institutions_id_fkey FOREIGN KEY (institutions_id) 
    REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT answer_sheet_packets_examination_session_id_fkey FOREIGN KEY (examination_session_id) 
    REFERENCES examination_sessions (id) ON DELETE CASCADE,
  CONSTRAINT answer_sheet_packets_course_id_fkey FOREIGN KEY (course_id) 
    REFERENCES courses (id) ON DELETE RESTRICT,
  CONSTRAINT answer_sheet_packets_exam_timetable_id_fkey FOREIGN KEY (exam_timetable_id) 
    REFERENCES exam_timetables (id) ON DELETE SET NULL,
  CONSTRAINT answer_sheet_packets_created_by_fkey FOREIGN KEY (created_by) 
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT answer_sheet_packets_updated_by_fkey FOREIGN KEY (updated_by) 
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT answer_sheet_packets_assigned_to_fkey FOREIGN KEY (assigned_to) 
    REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT check_total_sheets_positive CHECK (total_sheets > 0),
  CONSTRAINT check_sheets_evaluated_range CHECK (sheets_evaluated >= 0 AND sheets_evaluated <= total_sheets),
  CONSTRAINT check_evaluation_progress_range CHECK (evaluation_progress >= 0 AND evaluation_progress <= 100),
  CONSTRAINT check_valid_packet_status CHECK (
    packet_status IN (
      'Created',
      'Assigned',
      'In Evaluation',
      'Completed',
      'Archived',
      'Returned',
      'Missing'
    )
  )
) TABLESPACE pg_default;

-- =====================================================
-- 2. CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_institution 
  ON public.answer_sheet_packets USING btree (institutions_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_session 
  ON public.answer_sheet_packets USING btree (examination_session_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_course 
  ON public.answer_sheet_packets USING btree (course_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_packet_no 
  ON public.answer_sheet_packets USING btree (packet_no) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_status 
  ON public.answer_sheet_packets USING btree (packet_status) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_session_course 
  ON public.answer_sheet_packets USING btree (examination_session_id, course_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_created_at 
  ON public.answer_sheet_packets USING btree (created_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_assigned_to 
  ON public.answer_sheet_packets USING btree (assigned_to) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_barcode 
  ON public.answer_sheet_packets USING btree (barcode) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_active 
  ON public.answer_sheet_packets USING btree (is_active) TABLESPACE pg_default;

-- =====================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.answer_sheet_packets ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. CREATE RLS POLICIES
-- =====================================================

-- Policy: Allow authenticated users to read answer sheet packets
CREATE POLICY "Authenticated users can read answer sheet packets"
  ON public.answer_sheet_packets
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert answer sheet packets
CREATE POLICY "Authenticated users can insert answer sheet packets"
  ON public.answer_sheet_packets
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update answer sheet packets
CREATE POLICY "Authenticated users can update answer sheet packets"
  ON public.answer_sheet_packets
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Allow assigned evaluators to view their packets
CREATE POLICY "Evaluators can view their assigned packets"
  ON public.answer_sheet_packets
  FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid());

-- Policy: Allow admins to delete answer sheet packets
CREATE POLICY "Admins can delete answer sheet packets"
  ON public.answer_sheet_packets
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
CREATE POLICY "Service role can manage all answer sheet packets"
  ON public.answer_sheet_packets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 5. CREATE TRIGGER FUNCTIONS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_answer_sheet_packets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_answer_sheet_packets_updated_at
  BEFORE UPDATE ON public.answer_sheet_packets
  FOR EACH ROW
  EXECUTE FUNCTION update_answer_sheet_packets_updated_at();

-- Auto-populate assigned_at when assigned_to is set
CREATE OR REPLACE FUNCTION auto_populate_packet_assigned_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    NEW.assigned_at = CURRENT_TIMESTAMP;
    IF NEW.packet_status = 'Created' THEN
      NEW.packet_status = 'Assigned';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_packet_assigned_at
  BEFORE UPDATE ON public.answer_sheet_packets
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_packet_assigned_at();

-- Auto-populate evaluation_started_at when status changes to In Evaluation
CREATE OR REPLACE FUNCTION auto_populate_packet_evaluation_started()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.packet_status = 'In Evaluation' AND 
     (OLD.packet_status IS NULL OR OLD.packet_status != 'In Evaluation') THEN
    NEW.evaluation_started_at = CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_populate_packet_evaluation_started
  BEFORE UPDATE ON public.answer_sheet_packets
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_packet_evaluation_started();

-- Auto-update evaluation_progress based on sheets_evaluated
CREATE OR REPLACE FUNCTION auto_update_packet_evaluation_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_sheets > 0 THEN
    NEW.evaluation_progress = ROUND((NEW.sheets_evaluated::numeric / NEW.total_sheets::numeric) * 100, 2);
    
    -- Auto-complete when all sheets are evaluated
    IF NEW.sheets_evaluated >= NEW.total_sheets AND NEW.packet_status = 'In Evaluation' THEN
      NEW.packet_status = 'Completed';
      NEW.evaluation_completed_at = CURRENT_TIMESTAMP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_update_packet_evaluation_progress
  BEFORE UPDATE ON public.answer_sheet_packets
  FOR EACH ROW
  WHEN (NEW.sheets_evaluated IS DISTINCT FROM OLD.sheets_evaluated)
  EXECUTE FUNCTION auto_update_packet_evaluation_progress();

-- Validate packet status transitions
CREATE OR REPLACE FUNCTION validate_packet_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.packet_status IS NOT NULL AND NEW.packet_status IS NOT NULL THEN
    -- Created -> Assigned
    IF OLD.packet_status = 'Created' AND NEW.packet_status NOT IN ('Assigned', 'Archived') THEN
      RAISE EXCEPTION 'Invalid status transition from Created to %', NEW.packet_status;
    END IF;
    
    -- Assigned -> In Evaluation or Returned
    IF OLD.packet_status = 'Assigned' AND NEW.packet_status NOT IN ('In Evaluation', 'Returned', 'Archived') THEN
      RAISE EXCEPTION 'Invalid status transition from Assigned to %', NEW.packet_status;
    END IF;
    
    -- In Evaluation -> Completed or Returned
    IF OLD.packet_status = 'In Evaluation' AND NEW.packet_status NOT IN ('Completed', 'Returned', 'Assigned') THEN
      RAISE EXCEPTION 'Invalid status transition from In Evaluation to %', NEW.packet_status;
    END IF;
    
    -- Completed -> Archived only
    IF OLD.packet_status = 'Completed' AND NEW.packet_status NOT IN ('Archived', 'Returned') THEN
      RAISE EXCEPTION 'Invalid status transition from Completed to %', NEW.packet_status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_packet_status_transition
  BEFORE UPDATE ON public.answer_sheet_packets
  FOR EACH ROW
  EXECUTE FUNCTION validate_packet_status_transition();

-- Generate barcode for packet
CREATE OR REPLACE FUNCTION generate_packet_barcode()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.barcode IS NULL THEN
    NEW.barcode = 'PKT-' || 
                  TO_CHAR(NEW.created_at, 'YYYYMMDD') || '-' || 
                  LPAD(SUBSTRING(NEW.id::text FROM 1 FOR 8), 8, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_packet_barcode
  BEFORE INSERT ON public.answer_sheet_packets
  FOR EACH ROW
  EXECUTE FUNCTION generate_packet_barcode();

-- =====================================================
-- 6. CREATE DATABASE FUNCTIONS
-- =====================================================

-- Function to assign packet to evaluator
CREATE OR REPLACE FUNCTION assign_packet_to_evaluator(
  p_packet_id UUID,
  p_evaluator_id UUID,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_assigned_by UUID;
BEGIN
  v_assigned_by := COALESCE(p_assigned_by, auth.uid());
  
  UPDATE public.answer_sheet_packets
  SET
    assigned_to = p_evaluator_id,
    assigned_at = CURRENT_TIMESTAMP,
    packet_status = 'Assigned',
    updated_at = CURRENT_TIMESTAMP,
    updated_by = v_assigned_by
  WHERE id = p_packet_id
    AND packet_status = 'Created';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to start packet evaluation
CREATE OR REPLACE FUNCTION start_packet_evaluation(
  p_packet_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.answer_sheet_packets
  SET
    packet_status = 'In Evaluation',
    evaluation_started_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = auth.uid()
  WHERE id = p_packet_id
    AND packet_status = 'Assigned'
    AND assigned_to = auth.uid();
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update packet evaluation progress
CREATE OR REPLACE FUNCTION update_packet_evaluation_progress(
  p_packet_id UUID,
  p_sheets_evaluated INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.answer_sheet_packets
  SET
    sheets_evaluated = p_sheets_evaluated,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = auth.uid()
  WHERE id = p_packet_id
    AND packet_status = 'In Evaluation';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete packet evaluation
CREATE OR REPLACE FUNCTION complete_packet_evaluation(
  p_packet_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.answer_sheet_packets
  SET
    packet_status = 'Completed',
    evaluation_completed_at = CURRENT_TIMESTAMP,
    sheets_evaluated = total_sheets,
    evaluation_progress = 100.00,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = auth.uid()
  WHERE id = p_packet_id
    AND packet_status = 'In Evaluation';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to return packet
CREATE OR REPLACE FUNCTION return_packet(
  p_packet_id UUID,
  p_return_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.answer_sheet_packets
  SET
    packet_status = 'Returned',
    remarks = COALESCE(p_return_reason, remarks),
    updated_at = CURRENT_TIMESTAMP,
    updated_by = auth.uid()
  WHERE id = p_packet_id
    AND packet_status IN ('Assigned', 'In Evaluation');
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to archive packet
CREATE OR REPLACE FUNCTION archive_packet(
  p_packet_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.answer_sheet_packets
  SET
    packet_status = 'Archived',
    updated_at = CURRENT_TIMESTAMP,
    updated_by = auth.uid()
  WHERE id = p_packet_id
    AND packet_status = 'Completed';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get packet statistics
CREATE OR REPLACE FUNCTION get_packet_statistics(
  p_institution_id UUID DEFAULT NULL,
  p_session_id UUID DEFAULT NULL,
  p_course_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_packets BIGINT,
  created_packets BIGINT,
  assigned_packets BIGINT,
  in_evaluation_packets BIGINT,
  completed_packets BIGINT,
  archived_packets BIGINT,
  returned_packets BIGINT,
  missing_packets BIGINT,
  total_sheets BIGINT,
  total_evaluated_sheets BIGINT,
  overall_progress NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE packet_status = 'Created')::BIGINT,
    COUNT(*) FILTER (WHERE packet_status = 'Assigned')::BIGINT,
    COUNT(*) FILTER (WHERE packet_status = 'In Evaluation')::BIGINT,
    COUNT(*) FILTER (WHERE packet_status = 'Completed')::BIGINT,
    COUNT(*) FILTER (WHERE packet_status = 'Archived')::BIGINT,
    COUNT(*) FILTER (WHERE packet_status = 'Returned')::BIGINT,
    COUNT(*) FILTER (WHERE packet_status = 'Missing')::BIGINT,
    COALESCE(SUM(asp.total_sheets), 0)::BIGINT,
    COALESCE(SUM(asp.sheets_evaluated), 0)::BIGINT,
    CASE 
      WHEN SUM(asp.total_sheets) > 0 
      THEN ROUND((SUM(asp.sheets_evaluated)::numeric / SUM(asp.total_sheets)::numeric) * 100, 2)
      ELSE 0
    END
  FROM public.answer_sheet_packets asp
  WHERE (p_institution_id IS NULL OR asp.institutions_id = p_institution_id)
    AND (p_session_id IS NULL OR asp.examination_session_id = p_session_id)
    AND (p_course_id IS NULL OR asp.course_id = p_course_id)
    AND asp.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get evaluator packet workload
CREATE OR REPLACE FUNCTION get_evaluator_packet_workload(
  p_evaluator_id UUID DEFAULT NULL
)
RETURNS TABLE (
  evaluator_id UUID,
  evaluator_name TEXT,
  total_assigned_packets BIGINT,
  total_sheets BIGINT,
  completed_packets BIGINT,
  in_progress_packets BIGINT,
  pending_packets BIGINT,
  total_evaluated_sheets BIGINT,
  overall_progress NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.full_name,
    COUNT(*)::BIGINT,
    COALESCE(SUM(asp.total_sheets), 0)::BIGINT,
    COUNT(*) FILTER (WHERE asp.packet_status = 'Completed')::BIGINT,
    COUNT(*) FILTER (WHERE asp.packet_status = 'In Evaluation')::BIGINT,
    COUNT(*) FILTER (WHERE asp.packet_status = 'Assigned')::BIGINT,
    COALESCE(SUM(asp.sheets_evaluated), 0)::BIGINT,
    CASE 
      WHEN SUM(asp.total_sheets) > 0 
      THEN ROUND((SUM(asp.sheets_evaluated)::numeric / SUM(asp.total_sheets)::numeric) * 100, 2)
      ELSE 0
    END
  FROM public.answer_sheet_packets asp
  JOIN public.users u ON asp.assigned_to = u.id
  WHERE (p_evaluator_id IS NULL OR asp.assigned_to = p_evaluator_id)
    AND asp.is_active = true
  GROUP BY u.id, u.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk assign packets
CREATE OR REPLACE FUNCTION bulk_assign_packets(
  p_packet_ids UUID[],
  p_evaluator_id UUID,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_assigned_by UUID;
  v_count INTEGER;
BEGIN
  v_assigned_by := COALESCE(p_assigned_by, auth.uid());
  
  UPDATE public.answer_sheet_packets
  SET
    assigned_to = p_evaluator_id,
    assigned_at = CURRENT_TIMESTAMP,
    packet_status = 'Assigned',
    updated_at = CURRENT_TIMESTAMP,
    updated_by = v_assigned_by
  WHERE id = ANY(p_packet_ids)
    AND packet_status = 'Created';
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 7. CREATE VIEWS
-- =====================================================

-- Detailed Packet View with all related information
CREATE OR REPLACE VIEW public.answer_sheet_packets_detail_view AS
SELECT
  asp.id,
  asp.packet_no,
  asp.barcode,
  asp.total_sheets,
  asp.sheets_evaluated,
  asp.evaluation_progress,
  asp.packet_status,
  asp.packet_location,
  asp.remarks,
  
  -- Assignment Details
  asp.assigned_to,
  au.full_name AS assigned_to_name,
  au.email AS assigned_to_email,
  asp.assigned_at,
  
  -- Evaluation Timing
  asp.evaluation_started_at,
  asp.evaluation_completed_at,
  CASE 
    WHEN asp.evaluation_completed_at IS NOT NULL AND asp.evaluation_started_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (asp.evaluation_completed_at - asp.evaluation_started_at))/3600
    ELSE NULL
  END AS evaluation_duration_hours,
  
  -- Institution Details
  asp.institutions_id,
  i.institution_code,
  i.name AS institution_name,
  
  -- Examination Session Details
  asp.examination_session_id,
  es.session_code,
  es.session_name,

  
  -- Course Details
  asp.course_id,
  c.course_code,
  c.course_name,
  c.course_type,
  
  -- Exam Timetable Details
  asp.exam_timetable_id,
  et.exam_date,
  et.session AS exam_session,
  
  -- Created By
  cu.full_name AS created_by_name,
  cu.email AS created_by_email,
  
  -- Updated By
  uu.full_name AS updated_by_name,
  uu.email AS updated_by_email,
  
  -- Metadata
  asp.is_active,
  asp.created_at,
  asp.updated_at,
  asp.created_by,
  asp.updated_by
FROM public.answer_sheet_packets asp
LEFT JOIN public.users au ON asp.assigned_to = au.id
LEFT JOIN public.users cu ON asp.created_by = cu.id
LEFT JOIN public.users uu ON asp.updated_by = uu.id
LEFT JOIN public.institutions i ON asp.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON asp.examination_session_id = es.id
LEFT JOIN public.courses c ON asp.course_id = c.id
LEFT JOIN public.exam_timetables et ON asp.exam_timetable_id = et.id;

-- Packet Summary View for reporting
CREATE OR REPLACE VIEW public.answer_sheet_packets_summary_view AS
SELECT
  i.institution_code,
  i.name AS institution_name,
  es.session_code,
  es.session_name,
  c.course_code,
  c.course_name,
  COUNT(*) AS total_packets,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Created') AS created_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Assigned') AS assigned_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'In Evaluation') AS in_evaluation_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Completed') AS completed_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Archived') AS archived_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Returned') AS returned_count,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Missing') AS missing_count,
  SUM(asp.total_sheets) AS total_sheets,
  SUM(asp.sheets_evaluated) AS total_evaluated_sheets,
  ROUND(AVG(asp.evaluation_progress), 2) AS average_progress,
  ROUND(100.0 * SUM(asp.sheets_evaluated) / NULLIF(SUM(asp.total_sheets), 0), 2) AS overall_completion_percentage
FROM public.answer_sheet_packets asp
LEFT JOIN public.institutions i ON asp.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON asp.examination_session_id = es.id
LEFT JOIN public.courses c ON asp.course_id = c.id
WHERE asp.is_active = true
GROUP BY
  i.institution_code, i.name,
  es.session_code, es.session_name,
  c.course_code, c.course_name;

-- Evaluator Workload View
CREATE OR REPLACE VIEW public.evaluator_packet_workload_view AS
SELECT
  u.id AS evaluator_id,
  u.full_name AS evaluator_name,
  u.email AS evaluator_email,
  i.institution_code,
  i.name AS institution_name,
  es.session_code,
  es.session_name,
  COUNT(*) AS total_packets,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Assigned') AS pending_packets,
  COUNT(*) FILTER (WHERE asp.packet_status = 'In Evaluation') AS in_progress_packets,
  COUNT(*) FILTER (WHERE asp.packet_status = 'Completed') AS completed_packets,
  SUM(asp.total_sheets) AS total_sheets,
  SUM(asp.sheets_evaluated) AS sheets_evaluated,
  ROUND(AVG(asp.evaluation_progress), 2) AS average_progress,
  MIN(asp.assigned_at) AS first_assignment_date,
  MAX(asp.evaluation_completed_at) AS last_completion_date
FROM public.answer_sheet_packets asp
JOIN public.users u ON asp.assigned_to = u.id
LEFT JOIN public.institutions i ON asp.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON asp.examination_session_id = es.id
WHERE asp.is_active = true
  AND asp.assigned_to IS NOT NULL
GROUP BY
  u.id, u.full_name, u.email,
  i.institution_code, i.name,
  es.session_code, es.session_name;

-- Pending Packets View (for assignment and tracking)
CREATE OR REPLACE VIEW public.pending_answer_sheet_packets_view AS
SELECT
  asp.id,
  asp.packet_no,
  asp.barcode,
  asp.total_sheets,
  asp.packet_status,
  asp.packet_location,
  asp.created_at,
  i.institution_code,
  i.name AS institution_name,
  es.session_code,
  es.session_name,
  c.course_code,
  c.course_name,
  et.exam_date,
  et.session AS exam_session,
  asp.assigned_to,
  u.full_name AS assigned_to_name,
  asp.assigned_at,
  CASE 
    WHEN asp.packet_status = 'Assigned' 
    THEN EXTRACT(DAY FROM (CURRENT_TIMESTAMP - asp.assigned_at))
    ELSE NULL
  END AS days_since_assignment
FROM public.answer_sheet_packets asp
LEFT JOIN public.users u ON asp.assigned_to = u.id
LEFT JOIN public.institutions i ON asp.institutions_id = i.id
LEFT JOIN public.examination_sessions es ON asp.examination_session_id = es.id
LEFT JOIN public.courses c ON asp.course_id = c.id
LEFT JOIN public.exam_timetables et ON asp.exam_timetable_id = et.id
WHERE asp.is_active = true
  AND asp.packet_status IN ('Created', 'Assigned', 'In Evaluation')
ORDER BY 
  CASE asp.packet_status
    WHEN 'Created' THEN 1
    WHEN 'Assigned' THEN 2
    WHEN 'In Evaluation' THEN 3
  END,
  asp.created_at ASC;

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION assign_packet_to_evaluator(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION start_packet_evaluation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_packet_evaluation_progress(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_packet_evaluation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION return_packet(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_packet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_packet_statistics(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_evaluator_packet_workload(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_assign_packets(UUID[], UUID, UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION assign_packet_to_evaluator(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION start_packet_evaluation(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_packet_evaluation_progress(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION complete_packet_evaluation(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION return_packet(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION archive_packet(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_packet_statistics(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_evaluator_packet_workload(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION bulk_assign_packets(UUID[], UUID, UUID) TO service_role;

-- =====================================================
-- 9. ADD COMMENTS
-- =====================================================

COMMENT ON TABLE public.answer_sheet_packets IS 'Manages bundles/packets of answer sheets for evaluation';
COMMENT ON COLUMN public.answer_sheet_packets.packet_no IS 'Unique packet identifier within institution/session/course';
COMMENT ON COLUMN public.answer_sheet_packets.total_sheets IS 'Total number of answer sheets in the packet';
COMMENT ON COLUMN public.answer_sheet_packets.sheets_evaluated IS 'Number of sheets that have been evaluated';
COMMENT ON COLUMN public.answer_sheet_packets.evaluation_progress IS 'Percentage of evaluation completed (0-100)';
COMMENT ON COLUMN public.answer_sheet_packets.packet_status IS 'Current status of the packet in the evaluation workflow';
COMMENT ON COLUMN public.answer_sheet_packets.assigned_to IS 'Evaluator/examiner to whom the packet is assigned';
COMMENT ON COLUMN public.answer_sheet_packets.barcode IS 'Auto-generated barcode for packet tracking';
COMMENT ON COLUMN public.answer_sheet_packets.packet_location IS 'Physical or logical location of the packet';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
