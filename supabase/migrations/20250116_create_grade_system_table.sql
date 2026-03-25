-- Create grade_system table
CREATE TABLE IF NOT EXISTS public.grade_system (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL,
  institutions_code VARCHAR NOT NULL,
  grade_system_code VARCHAR NOT NULL,
  grade_id UUID NOT NULL,
  grade VARCHAR NOT NULL,
  grade_point NUMERIC NOT NULL,
  min_mark NUMERIC NOT NULL,
  max_mark NUMERIC NOT NULL,
  description TEXT NOT NULL,
  regulation_id BIGINT NOT NULL,
  regulation_code VARCHAR NULL,
  is_active BOOLEAN NULL DEFAULT true,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT grade_system_pkey PRIMARY KEY (id),
  CONSTRAINT fk_grade_system_grades FOREIGN KEY (grade_id) REFERENCES grades (id) ON DELETE SET NULL,
  CONSTRAINT fk_grade_system_institutions FOREIGN KEY (institutions_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_grade_system_regulations FOREIGN KEY (regulation_id) REFERENCES regulations (id) ON DELETE SET NULL,
  CONSTRAINT check_mark_range CHECK (min_mark < max_mark)
) TABLESPACE pg_default;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_grade_system_institutions_id ON public.grade_system USING btree (institutions_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_grade_system_grade_id ON public.grade_system USING btree (grade_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_grade_system_regulation_id ON public.grade_system USING btree (regulation_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_grade_system_is_active ON public.grade_system USING btree (is_active) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_grade_system_min_max_mark ON public.grade_system USING btree (min_mark, max_mark) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_grade_system_code ON public.grade_system USING btree (grade_system_code) TABLESPACE pg_default;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_grade_system_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_grade_system_updated_at
BEFORE UPDATE ON grade_system
FOR EACH ROW
EXECUTE FUNCTION update_grade_system_updated_at();

-- Add comments
COMMENT ON TABLE grade_system IS 'Stores grade system definitions with institution, grade, and regulation references';
COMMENT ON COLUMN grade_system.institutions_id IS 'Foreign key reference to institutions table';
COMMENT ON COLUMN grade_system.institutions_code IS 'Denormalized institution code for quick reference';
COMMENT ON COLUMN grade_system.grade_system_code IS 'Unique code for the grade system';
COMMENT ON COLUMN grade_system.grade_id IS 'Foreign key reference to grades table';
COMMENT ON COLUMN grade_system.grade IS 'Denormalized grade code for quick reference';
COMMENT ON COLUMN grade_system.grade_point IS 'Grade point value';
COMMENT ON COLUMN grade_system.min_mark IS 'Minimum mark for this grade in the system';
COMMENT ON COLUMN grade_system.max_mark IS 'Maximum mark for this grade in the system';
COMMENT ON COLUMN grade_system.description IS 'Description of the grade system';
COMMENT ON COLUMN grade_system.regulation_id IS 'Foreign key reference to regulations table';
COMMENT ON COLUMN grade_system.regulation_code IS 'Denormalized regulation code for quick reference';
COMMENT ON COLUMN grade_system.is_active IS 'Whether this grade system is active';
