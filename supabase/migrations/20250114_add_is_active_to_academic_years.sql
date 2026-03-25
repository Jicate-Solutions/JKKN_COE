-- Add is_active column to academic_years table
-- This column is needed by existing database triggers

ALTER TABLE public.academic_years
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index on is_active for performance
CREATE INDEX IF NOT EXISTS idx_academic_years_is_active
ON public.academic_years(is_active);

-- Update existing records to set is_active based on is_current_academic_year
UPDATE public.academic_years
SET is_active = is_current_academic_year
WHERE is_active IS NULL;

COMMENT ON COLUMN public.academic_years.is_active IS 'Indicates if the academic year record is active';
