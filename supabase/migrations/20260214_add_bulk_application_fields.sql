-- =====================================================
-- REVALUATION BULK APPLICATION - MIGRATION
-- Add fields for bulk draft application workflow
-- Created: 2026-02-14
-- =====================================================

-- =====================================================
-- 1. ADD DUMMY NUMBER FIELD
-- =====================================================

-- Add dummy_number column to revaluation_registrations
ALTER TABLE public.revaluation_registrations
ADD COLUMN IF NOT EXISTS dummy_number VARCHAR(50);

-- Create index for dummy number lookups
CREATE INDEX IF NOT EXISTS idx_reval_reg_dummy_number
  ON public.revaluation_registrations(dummy_number);

COMMENT ON COLUMN public.revaluation_registrations.dummy_number IS
  'Dummy number for blind evaluation - reused from original exam or student register number';

-- =====================================================
-- 2. MODIFY STATUS CONSTRAINT TO INCLUDE 'Draft'
-- =====================================================

-- Drop existing check constraint
ALTER TABLE public.revaluation_registrations
DROP CONSTRAINT IF EXISTS revaluation_registrations_status_check;

-- Add new constraint with 'Draft' status
ALTER TABLE public.revaluation_registrations
ADD CONSTRAINT revaluation_registrations_status_check
CHECK (status IN (
  'Draft',              -- NEW: For bulk application workflow
  'Applied',
  'Payment Pending',
  'Payment Verified',
  'Approved',
  'Rejected',
  'Assigned',
  'In Progress',
  'Evaluated',
  'Verified',
  'Published',
  'Cancelled'
));

-- =====================================================
-- 3. ADD OPTIMIZED INDEXES FOR DRAFT QUERIES
-- =====================================================

-- Index for fetching all drafts by session (most common query)
CREATE INDEX IF NOT EXISTS idx_reval_reg_draft_session
  ON public.revaluation_registrations(examination_session_id, status)
  WHERE status = 'Draft';

-- Index for draft queries with institution filter
CREATE INDEX IF NOT EXISTS idx_reval_reg_draft_institution_session
  ON public.revaluation_registrations(institutions_id, examination_session_id, status)
  WHERE status = 'Draft';

-- =====================================================
-- 4. ADD PROGRAM_CODE DENORMALIZED FIELD (if not exists)
-- =====================================================

-- Check if program_code exists, add if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revaluation_registrations'
    AND column_name = 'program_code'
  ) THEN
    ALTER TABLE public.revaluation_registrations
    ADD COLUMN program_code VARCHAR(50);

    -- Create index for program filtering
    CREATE INDEX idx_reval_reg_program_code
      ON public.revaluation_registrations(program_code);

    COMMENT ON COLUMN public.revaluation_registrations.program_code IS
      'Denormalized program code for filtering and grouping';
  END IF;
END $$;

-- =====================================================
-- 5. UPDATE EXISTING RECORDS (Optional Data Migration)
-- =====================================================

-- Update existing records to populate dummy_number if null
-- Uses register number as fallback
UPDATE public.revaluation_registrations
SET dummy_number = student_register_number
WHERE dummy_number IS NULL
  AND student_register_number IS NOT NULL;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify migration
DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully';
  RAISE NOTICE '   - Added dummy_number field with index';
  RAISE NOTICE '   - Updated status constraint to include Draft';
  RAISE NOTICE '   - Added optimized indexes for draft queries';
  RAISE NOTICE '   - Added program_code field (if not exists)';
END $$;
