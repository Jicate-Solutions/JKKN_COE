-- Create semesters table for JKKN COE application
-- This table stores semester information for different institutions and degrees

CREATE TABLE IF NOT EXISTS public.semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_code VARCHAR(50) NOT NULL,
  degree_code VARCHAR(50) NOT NULL,
  semester_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100),
  student_group VARCHAR(50),
  display_order INTEGER DEFAULT 1,
  initial_semester BOOLEAN DEFAULT false,
  terminal_semester BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT semesters_institution_degree_semester_unique 
    UNIQUE (institution_code, degree_code, semester_name)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_semesters_institution_code ON public.semesters(institution_code);
CREATE INDEX IF NOT EXISTS idx_semesters_degree_code ON public.semesters(degree_code);
CREATE INDEX IF NOT EXISTS idx_semesters_display_order ON public.semesters(display_order);
CREATE INDEX IF NOT EXISTS idx_semesters_is_active ON public.semesters(is_active);
CREATE INDEX IF NOT EXISTS idx_semesters_created_at ON public.semesters(created_at);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER semesters_updated_at
  BEFORE UPDATE ON public.semesters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Enable RLS
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy for authenticated users to read semesters
CREATE POLICY "Authenticated users can read semesters" ON public.semesters
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy for admins to manage semesters
CREATE POLICY "Admins can manage semesters" ON public.semesters
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE email = auth.jwt() ->> 'email'
      AND (role = 'admin' OR is_super_admin = true)
    )
  );

-- Insert some sample data
INSERT INTO public.semesters (institution_code, degree_code, semester_name, display_name, student_group, display_order, initial_semester, terminal_semester)
VALUES
  ('JKKN', 'BSC', 'Semester 1', 'Sem I', 'UG', 1, true, false),
  ('JKKN', 'BSC', 'Semester 2', 'Sem II', 'UG', 2, false, false),
  ('JKKN', 'BSC', 'Semester 3', 'Sem III', 'UG', 3, false, false),
  ('JKKN', 'BSC', 'Semester 4', 'Sem IV', 'UG', 4, false, false),
  ('JKKN', 'BSC', 'Semester 5', 'Sem V', 'UG', 5, false, false),
  ('JKKN', 'BSC', 'Semester 6', 'Sem VI', 'UG', 6, false, true),
  ('JKKN', 'MSC', 'Semester 1', 'Sem I', 'PG', 1, true, false),
  ('JKKN', 'MSC', 'Semester 2', 'Sem II', 'PG', 2, false, false),
  ('JKKN', 'MSC', 'Semester 3', 'Sem III', 'PG', 3, false, false),
  ('JKKN', 'MSC', 'Semester 4', 'Sem IV', 'PG', 4, false, true)
ON CONFLICT (institution_code, degree_code, semester_name) DO NOTHING;

