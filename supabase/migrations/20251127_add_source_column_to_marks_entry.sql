-- =====================================================
-- Add source column to marks_entry table
-- =====================================================
-- Date: 2025-11-27
-- Purpose: Track the source of marks entry (Bulk Upload / Manual Entry)
-- =====================================================

-- Add source column to track where marks were entered from
ALTER TABLE public.marks_entry
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'Manual Entry';

-- Add check constraint for valid source values
ALTER TABLE public.marks_entry
ADD CONSTRAINT check_valid_source
CHECK (source IN ('Bulk Upload', 'Manual Entry'));

-- Create index for source column for filtering
CREATE INDEX IF NOT EXISTS idx_marks_entry_source
ON public.marks_entry(source);

-- Add comment for documentation
COMMENT ON COLUMN public.marks_entry.source IS 'Source of marks entry: Bulk Upload (from Excel import) or Manual Entry (from form input)';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
