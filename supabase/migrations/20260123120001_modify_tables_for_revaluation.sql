-- =====================================================
-- REVALUATION PROCESS MODULE - MIGRATION 2/2
-- Modify existing tables for revaluation integration
-- Created: 2026-01-23
-- =====================================================

-- =====================================================
-- 1. MODIFY EXAM_REGISTRATIONS
-- Add revaluation attempts tracking
-- =====================================================

-- Add revaluation_attempts array column
ALTER TABLE public.exam_registrations
ADD COLUMN IF NOT EXISTS revaluation_attempts INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Best Practice: GIN index for array queries
CREATE INDEX IF NOT EXISTS idx_exam_registrations_reval_attempts
  ON public.exam_registrations USING GIN (revaluation_attempts);

COMMENT ON COLUMN public.exam_registrations.revaluation_attempts
  IS 'Array of revaluation attempt numbers (1, 2, 3) for quick lookup';

-- =====================================================
-- 2. MODIFY EXAMINER_ASSIGNMENTS
-- Add assignment type discrimination
-- =====================================================

-- Add assignment_type column
ALTER TABLE public.examiner_assignments
ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(50) DEFAULT 'regular'
  CHECK (assignment_type IN ('regular', 'revaluation'));

-- Index for filtering by assignment type
CREATE INDEX IF NOT EXISTS idx_examiner_assignment_type
  ON public.examiner_assignments(assignment_type);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_examiner_assignment_composite
  ON public.examiner_assignments(examiner_id, assignment_type, status);

COMMENT ON COLUMN public.examiner_assignments.assignment_type
  IS 'Type of assignment: regular (normal evaluation) or revaluation';

-- =====================================================
-- Migration Complete
-- =====================================================
