-- Create grades table matching the actual database schema
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institutions_id UUID NOT NULL,
  institutions_code VARCHAR NOT NULL,
  grade VARCHAR NOT NULL,
  grade_point NUMERIC NOT NULL,
  description TEXT NOT NULL,
  regulation_id BIGSERIAL NOT NULL,
  regulation_code VARCHAR NULL,
  qualify BOOLEAN NULL DEFAULT false,
  exclude_cgpa BOOLEAN NULL DEFAULT false,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT fk_grades_institutions FOREIGN KEY (institutions_id) REFERENCES institutions (id) ON DELETE CASCADE,
  CONSTRAINT fk_grades_regulations FOREIGN KEY (regulation_id) REFERENCES regulations (id) ON DELETE SET NULL
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_grades_institutions_id ON grades(institutions_id);
CREATE INDEX IF NOT EXISTS idx_grades_regulation_id ON grades(regulation_id);
CREATE INDEX IF NOT EXISTS idx_grades_institutions_code ON grades(institutions_code);
CREATE INDEX IF NOT EXISTS idx_grades_regulation_code ON grades(regulation_code);
CREATE INDEX IF NOT EXISTS idx_grades_grade ON grades(grade);
CREATE INDEX IF NOT EXISTS idx_grades_qualify ON grades(qualify);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_grades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_grades_updated_at
BEFORE UPDATE ON grades
FOR EACH ROW
EXECUTE FUNCTION update_grades_updated_at();

-- Add comments
COMMENT ON TABLE grades IS 'Stores grade definitions with institution and regulation references';
COMMENT ON COLUMN grades.institutions_id IS 'Foreign key reference to institutions table';
COMMENT ON COLUMN grades.institutions_code IS 'Denormalized institution code for quick reference';
COMMENT ON COLUMN grades.grade IS 'Grade code (e.g., O, A+, A, B+, etc.)';
COMMENT ON COLUMN grades.grade_point IS 'Grade point value';
COMMENT ON COLUMN grades.description IS 'Description of the grade';
COMMENT ON COLUMN grades.regulation_id IS 'Foreign key reference to regulations table';
COMMENT ON COLUMN grades.regulation_code IS 'Denormalized regulation code for quick reference';
COMMENT ON COLUMN grades.qualify IS 'Whether this grade qualifies for progression';
COMMENT ON COLUMN grades.exclude_cgpa IS 'Whether to exclude this grade from CGPA calculation';
