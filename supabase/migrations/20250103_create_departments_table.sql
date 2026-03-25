-- Create departments table for JKKN COE application
-- This table stores department information for different institutions

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign Key & Code References
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  institution_code VARCHAR(50) NOT NULL,
  
  -- Department Information
  department_code VARCHAR(50) NOT NULL,
  department_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  description TEXT,
  
  -- Stream/Category
  stream VARCHAR(50) CHECK (stream IN ('Arts', 'Science', 'Management', 'Commerce', 'Engineering', 'Medical', 'Law') OR stream IS NULL),
  
  -- Status & Audit Fields
  status BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT departments_institution_code_dept_code_unique 
    UNIQUE (institution_code, department_code),
  CONSTRAINT departments_institution_code_fkey
    FOREIGN KEY (institution_code) REFERENCES institutions(institution_code) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_departments_institutions_id ON public.departments(institutions_id);
CREATE INDEX IF NOT EXISTS idx_departments_institution_code ON public.departments(institution_code);
CREATE INDEX IF NOT EXISTS idx_departments_department_code ON public.departments(department_code);
CREATE INDEX IF NOT EXISTS idx_departments_status ON public.departments(status);
CREATE INDEX IF NOT EXISTS idx_departments_stream ON public.departments(stream) WHERE stream IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_departments_created_at ON public.departments(created_at);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_departments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW
  EXECUTE FUNCTION update_departments_updated_at();

-- Enable RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy for authenticated users to read departments
CREATE POLICY "Authenticated users can read departments" ON public.departments
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy for admins to manage departments
CREATE POLICY "Admins can manage departments" ON public.departments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
        AND r.name IN ('super_admin', 'admin', 'coe_admin')
        AND ur.is_active = true
    )
  );

-- Add table comment
COMMENT ON TABLE public.departments IS 'Departments table - stores department information with institution relationships';

-- Sample data (optional - comment out if not needed)
-- INSERT INTO public.departments (institutions_id, institution_code, department_code, department_name, display_name, stream, status)
-- SELECT 
--   i.id,
--   'JKKN',
--   'CSE',
--   'Computer Science and Engineering',
--   'CSE',
--   'Engineering',
--   true
-- FROM institutions i
-- WHERE i.institution_code = 'JKKN'
-- LIMIT 1;


