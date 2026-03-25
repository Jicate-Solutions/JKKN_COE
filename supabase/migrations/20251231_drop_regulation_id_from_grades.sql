-- Drop regulation_id column from grades table
-- The regulation_code field is sufficient for tracking regulation association
-- since it serves as the human-readable identifier used in all queries and UI

-- Step 1: Drop the foreign key constraint
ALTER TABLE grades DROP CONSTRAINT IF EXISTS fk_grades_regulations;

-- Step 2: Drop the index on regulation_id
DROP INDEX IF EXISTS idx_grades_regulation_id;

-- Step 3: Drop the regulation_id column
ALTER TABLE grades DROP COLUMN IF EXISTS regulation_id;

-- Step 4: Make regulation_code NOT NULL since it's now the primary regulation reference
ALTER TABLE grades ALTER COLUMN regulation_code SET NOT NULL;

-- Update comment to reflect the change
COMMENT ON COLUMN grades.regulation_code IS 'Regulation code for the grade definition (primary regulation reference)';
