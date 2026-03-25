-- Make marks_entry fields nullable for external mark entry
-- External marks are entered directly without answer sheets or program assignment

-- Make answer_sheet_id nullable for external entries
ALTER TABLE marks_entry
ALTER COLUMN answer_sheet_id DROP NOT NULL;

-- Make program_id nullable for external entries
ALTER TABLE marks_entry
ALTER COLUMN program_id DROP NOT NULL;

-- Update foreign key constraints
ALTER TABLE marks_entry
DROP CONSTRAINT IF EXISTS marks_entry_answer_sheet_id_fkey;

ALTER TABLE marks_entry
ADD CONSTRAINT marks_entry_answer_sheet_id_fkey
FOREIGN KEY (answer_sheet_id)
REFERENCES answer_sheets (id)
ON DELETE CASCADE;

ALTER TABLE marks_entry
DROP CONSTRAINT IF EXISTS marks_entry_program_id_fkey;

ALTER TABLE marks_entry
ADD CONSTRAINT marks_entry_program_id_fkey
FOREIGN KEY (program_id)
REFERENCES programs (id)
ON DELETE RESTRICT;

-- Add comments
COMMENT ON COLUMN marks_entry.answer_sheet_id IS 'Answer sheet ID - NULL for external direct entry, required for internal evaluation with physical answer sheets';
COMMENT ON COLUMN marks_entry.program_id IS 'Program ID - NULL for external direct entry, required for internal evaluation';
