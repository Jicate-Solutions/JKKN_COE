-- Add foreign key constraint from courses.board_code to board.board_code
-- This enables PostgREST to automatically join courses and board tables

-- First, check if constraint already exists and drop it if needed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'courses_board_code_fkey'
    ) THEN
        ALTER TABLE courses DROP CONSTRAINT courses_board_code_fkey;
    END IF;
END $$;

-- Add foreign key constraint
ALTER TABLE courses
ADD CONSTRAINT courses_board_code_fkey
FOREIGN KEY (board_code)
REFERENCES board(board_code)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Create index on board_code for better join performance
CREATE INDEX IF NOT EXISTS idx_courses_board_code
ON courses(board_code);

-- Add comment
COMMENT ON CONSTRAINT courses_board_code_fkey ON courses IS
'Foreign key relationship to board table via board_code. Enables automatic joins in PostgREST queries.';
