-- Drop FK constraint on courses.regulation_id (if exists)
-- Since regulations come from MyJKKN API (external), we don't need a local FK constraint
-- The regulation_code is sufficient for reference

-- Step 1: Drop the foreign key constraint if it exists
DO $$
BEGIN
    -- Try to drop any FK constraint that references regulations from courses
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name LIKE '%courses%regulation%'
        OR (table_name = 'courses' AND constraint_type = 'FOREIGN KEY')
    ) THEN
        -- List and drop all FK constraints on courses.regulation_id
        EXECUTE (
            SELECT string_agg('ALTER TABLE courses DROP CONSTRAINT IF EXISTS ' || constraint_name, '; ')
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'courses'
            AND kcu.column_name = 'regulation_id'
            AND tc.constraint_type = 'FOREIGN KEY'
        );
    END IF;
END $$;

-- Also try explicit constraint names that might exist
ALTER TABLE courses DROP CONSTRAINT IF EXISTS fk_courses_regulations;
ALTER TABLE courses DROP CONSTRAINT IF EXISTS fk_courses_regulation;
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_regulation_id_fkey;
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_regulations_fkey;

-- Make sure regulation_id column allows NULL
ALTER TABLE courses ALTER COLUMN regulation_id DROP NOT NULL;

-- Add comment explaining why regulation_id is nullable
COMMENT ON COLUMN courses.regulation_id IS 'Optional FK to local regulations table. Since regulations come from MyJKKN API, this may be NULL. Use regulation_code for reference.';
