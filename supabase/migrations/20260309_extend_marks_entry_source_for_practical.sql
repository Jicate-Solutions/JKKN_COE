-- Extend marks_entry source constraint to include Practical Entry
-- Required for practical marks API route

-- Drop the existing check constraint
ALTER TABLE public.marks_entry
DROP CONSTRAINT IF EXISTS check_valid_source;

-- Re-add with 'Practical Entry' included
ALTER TABLE public.marks_entry
ADD CONSTRAINT check_valid_source
CHECK (source IN ('Bulk Upload', 'Manual Entry', 'Practical Entry'));

COMMENT ON COLUMN public.marks_entry.source IS 'Source of marks entry: Bulk Upload (from Excel import), Manual Entry (from form input), or Practical Entry (from practical batch form)';
