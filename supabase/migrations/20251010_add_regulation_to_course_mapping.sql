-- Add regulation_code column to course_mapping table
ALTER TABLE public.course_mapping
ADD COLUMN IF NOT EXISTS regulation_code text NULL;

-- Add regulation_id column for foreign key relationship
ALTER TABLE public.course_mapping
ADD COLUMN IF NOT EXISTS regulation_id uuid NULL;

-- Add foreign key constraint
ALTER TABLE public.course_mapping
ADD CONSTRAINT course_mapping_regulation_id_fkey
FOREIGN KEY (regulation_id)
REFERENCES public.regulations (id)
ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_course_mapping_regulation_code
ON public.course_mapping USING btree (regulation_code);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_course_mapping_program_regulation
ON public.course_mapping USING btree (program_code, regulation_code);

-- Update unique constraint to include regulation_code
DROP INDEX IF EXISTS idx_course_mapping_unique_mapping;

CREATE UNIQUE INDEX idx_course_mapping_unique_mapping
ON public.course_mapping (course_id, institution_code, program_code, batch_code, regulation_code, semester_code)
WHERE is_active = true;

-- Add comment
COMMENT ON COLUMN public.course_mapping.regulation_code IS 'Regulation code for the course mapping';
COMMENT ON COLUMN public.course_mapping.regulation_id IS 'Foreign key reference to regulations.id';
