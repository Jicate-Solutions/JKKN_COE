-- =====================================================
-- Drop program_id foreign key from final_marks
-- =====================================================
-- Date: 2026-01-13
-- Purpose: Programs are now fetched from MyJKKN API (external)
--          The program_id stores MyJKKN UUID which cannot be validated
--          against a local programs table
-- =====================================================

-- Drop the foreign key constraint that references non-existent programs table
ALTER TABLE IF EXISTS public.final_marks
    DROP CONSTRAINT IF EXISTS final_marks_program_id_fkey;

-- Add a comment explaining why this constraint was removed
COMMENT ON COLUMN public.final_marks.program_id IS 'MyJKKN program UUID - no FK constraint as programs are external';
