-- ============================================
-- Add foreign key constraint on degrees.institution_code
-- ============================================

-- First, ensure institutions table has a unique constraint on institution_code
-- (This should already exist, but we'll check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'institutions_institution_code_unique'
  ) THEN
    ALTER TABLE institutions
    ADD CONSTRAINT institutions_institution_code_unique UNIQUE (institution_code);
  END IF;
END $$;

-- Drop existing foreign key on institution_id if it exists
-- (This preserves the CASCADE behavior for the UUID reference)
-- We're not removing it, just adding the institution_code constraint

-- Add foreign key constraint on institution_code
-- This will validate that institution_code exists in institutions table
ALTER TABLE degrees
ADD CONSTRAINT degrees_institution_code_fkey
FOREIGN KEY (institution_code)
REFERENCES institutions (institution_code)
ON DELETE CASCADE
ON UPDATE CASCADE;

-- Add index on institution_code for better query performance
CREATE INDEX IF NOT EXISTS idx_degrees_institution_code
ON degrees(institution_code);

-- Add comment for documentation
COMMENT ON CONSTRAINT degrees_institution_code_fkey ON degrees IS
'Foreign key constraint ensuring degrees.institution_code references valid institutions.institution_code. Cascades on delete and update.';
