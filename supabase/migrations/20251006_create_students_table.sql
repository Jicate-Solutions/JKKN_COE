-- Create student_status enum
CREATE TYPE student_status AS ENUM ('active', 'inactive', 'graduated', 'dropped', 'transferred', 'suspended');

-- Create students table
CREATE TABLE IF NOT EXISTS public.students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),

  -- Basic Information
  first_name text NOT NULL,
  last_name text NULL,
  father_name text NOT NULL,
  mother_name text NOT NULL,
  date_of_birth text NOT NULL,
  gender text NOT NULL,
  religion text NOT NULL,
  community text NOT NULL,
  caste text NULL,
  aadhar_number text NULL,

  -- Contact Information
  student_mobile text NULL,
  student_email text NULL,
  college_email text NULL,

  -- Parent Information
  father_occupation text NULL,
  father_mobile text NULL,
  mother_occupation text NULL,
  mother_mobile text NULL,
  annual_income text NULL,

  -- Academic Background
  last_school text NOT NULL,
  board_of_study text NOT NULL,
  tenth_marks jsonb NOT NULL,
  twelfth_marks jsonb NOT NULL,

  -- Entrance Exam Details
  neet_roll_number text NULL,
  neet_score text NULL,
  medical_cutoff_marks text NULL,
  engineering_cutoff_marks text NULL,

  -- Admission Details
  admission_id uuid NULL,
  application_id text NULL,
  counseling_applied boolean NULL DEFAULT false,
  counseling_number text NULL,
  first_graduate boolean NULL DEFAULT false,
  quota text NULL,
  category text NULL,
  entry_type text NOT NULL,

  -- Institutional Information
  institution_id uuid NULL,
  degree_id uuid NULL,
  department_id uuid NULL,
  program_id uuid NULL,
  semester_id uuid NULL,
  section_id uuid NULL,
  academic_year_id uuid NULL,
  roll_number text NULL,

  -- Address Information
  permanent_address_street text NULL,
  permanent_address_taluk text NULL,
  permanent_address_district text NULL,
  permanent_address_pin_code text NULL,
  permanent_address_state text NULL,

  -- Hostel & Transport
  accommodation_type text NULL,
  hostel_type text NULL,
  food_type text NULL,
  bus_required boolean NULL DEFAULT false,
  bus_route text NULL,
  bus_pickup_location text NULL,

  -- Reference Information
  reference_type text NULL,
  reference_name text NULL,
  reference_contact text NULL,

  -- Profile Management
  student_photo_url text NULL,
  is_profile_complete boolean NULL DEFAULT false,
  status student_status NULL DEFAULT 'active'::student_status,

  -- Audit Fields
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  created_by uuid NULL,
  updated_by uuid NULL,

  CONSTRAINT students_pkey PRIMARY KEY (id),
  CONSTRAINT students_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES admissions (id),
  CONSTRAINT students_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions (id),
  CONSTRAINT students_degree_id_fkey FOREIGN KEY (degree_id) REFERENCES degrees (id),
  CONSTRAINT students_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments (id),
  CONSTRAINT students_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs (id),
  CONSTRAINT students_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES semesters (id),
  CONSTRAINT students_section_id_fkey FOREIGN KEY (section_id) REFERENCES sections (id),
  CONSTRAINT students_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years (id),
  CONSTRAINT students_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users (id),
  CONSTRAINT students_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users (id)
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_students_college_email ON public.students USING btree (college_email) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_admission_id ON public.students USING btree (admission_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON public.students USING btree (roll_number) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_is_profile_complete ON public.students USING btree (is_profile_complete) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students USING btree (status) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_academic_year_id ON public.students USING btree (academic_year_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_institution_id ON public.students USING btree (institution_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_degree_id ON public.students USING btree (degree_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_department_id ON public.students USING btree (department_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_program_id ON public.students USING btree (program_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_semester_id ON public.students USING btree (semester_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_section_id ON public.students USING btree (section_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_first_name ON public.students USING btree (first_name) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_last_name ON public.students USING btree (last_name) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_created_at ON public.students USING btree (created_at DESC) TABLESPACE pg_default;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_students_program_semester ON public.students USING btree (program_id, semester_id) TABLESPACE pg_default
WHERE (semester_id IS NOT NULL AND program_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_students_institution_program ON public.students USING btree (institution_id, program_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_students_institution_department ON public.students USING btree (institution_id, department_id) TABLESPACE pg_default;

-- Create view for student details with joined data
CREATE OR REPLACE VIEW public.students_detailed_view AS
SELECT
  s.id,
  s.first_name,
  s.last_name,
  s.first_name || ' ' || COALESCE(s.last_name, '') AS full_name,
  s.father_name,
  s.mother_name,
  s.date_of_birth,
  s.gender,
  s.religion,
  s.community,
  s.caste,
  s.aadhar_number,
  s.student_mobile,
  s.student_email,
  s.college_email,
  s.father_occupation,
  s.father_mobile,
  s.mother_occupation,
  s.mother_mobile,
  s.annual_income,
  s.last_school,
  s.board_of_study,
  s.tenth_marks,
  s.twelfth_marks,
  s.neet_roll_number,
  s.neet_score,
  s.medical_cutoff_marks,
  s.engineering_cutoff_marks,
  s.admission_id,
  s.application_id,
  s.counseling_applied,
  s.counseling_number,
  s.first_graduate,
  s.quota,
  s.category,
  s.entry_type,
  s.roll_number,
  s.permanent_address_street,
  s.permanent_address_taluk,
  s.permanent_address_district,
  s.permanent_address_pin_code,
  s.permanent_address_state,
  s.accommodation_type,
  s.hostel_type,
  s.food_type,
  s.bus_required,
  s.bus_route,
  s.bus_pickup_location,
  s.reference_type,
  s.reference_name,
  s.reference_contact,
  s.student_photo_url,
  s.is_profile_complete,
  s.status,
  s.created_at,
  s.updated_at,
  s.created_by,
  s.updated_by,
  -- Institution details
  s.institution_id,
  i.institution_code,
  i.institution_name,
  i.institution_short_name,
  -- Degree details
  s.degree_id,
  deg.degree_code,
  deg.degree_name,
  deg.degree_short_name,
  -- Department details
  s.department_id,
  dept.department_code,
  dept.department_name,
  dept.department_short_name,
  -- Program details
  s.program_id,
  p.program_code,
  p.program_name,
  p.program_short_name,
  p.duration_years,
  -- Semester details
  s.semester_id,
  sem.semester_code,
  sem.semester_name,
  sem.semester_number,
  -- Section details
  s.section_id,
  sec.section_code,
  sec.section_name,
  -- Academic Year details
  s.academic_year_id,
  ay.year_code AS academic_year_code,
  ay.year_name AS academic_year_name,
  ay.start_date AS academic_year_start,
  ay.end_date AS academic_year_end
FROM public.students s
LEFT JOIN public.institutions i ON s.institution_id = i.id
LEFT JOIN public.degrees deg ON s.degree_id = deg.id
LEFT JOIN public.departments dept ON s.department_id = dept.id
LEFT JOIN public.programs p ON s.program_id = p.id
LEFT JOIN public.semesters sem ON s.semester_id = sem.id
LEFT JOIN public.sections sec ON s.section_id = sec.id
LEFT JOIN public.academic_years ay ON s.academic_year_id = ay.id;

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_students_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_update_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.update_students_updated_at();

-- Create trigger function to auto-populate institution_id from program
CREATE OR REPLACE FUNCTION public.auto_populate_student_institution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.program_id IS NOT NULL AND NEW.institution_id IS NULL THEN
    SELECT institution_id INTO NEW.institution_id
    FROM public.programs
    WHERE id = NEW.program_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-populating institution
CREATE TRIGGER trigger_auto_populate_student_institution
BEFORE INSERT ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.auto_populate_student_institution();

-- Create trigger function to validate semester consistency
CREATE OR REPLACE FUNCTION public.validate_student_semester_consistency()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.semester_id IS NOT NULL AND NEW.program_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.semesters
      WHERE id = NEW.semester_id
      AND semester_number <= (
        SELECT duration_years * 2
        FROM public.programs
        WHERE id = NEW.program_id
      )
    ) THEN
      RAISE EXCEPTION 'Semester number exceeds program duration';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for semester validation
CREATE TRIGGER trigger_validate_student_semester_consistency
BEFORE INSERT OR UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.validate_student_semester_consistency();

-- Create trigger function to sync student email with profile
CREATE OR REPLACE FUNCTION public.sync_student_email_with_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- This function can be extended to sync with user profiles if needed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for email sync
CREATE TRIGGER sync_student_email_trigger
AFTER UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION sync_student_email_with_profile();

-- Create trigger function to validate email change
CREATE OR REPLACE FUNCTION public.validate_student_email_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.college_email IS DISTINCT FROM NEW.college_email THEN
    IF EXISTS (
      SELECT 1 FROM public.students
      WHERE college_email = NEW.college_email
      AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'College email already exists for another student';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for email validation
CREATE TRIGGER validate_student_email_trigger
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION validate_student_email_change();

-- Add comments for documentation
COMMENT ON TABLE public.students IS 'Stores comprehensive student information for the Controller of Examination system';
COMMENT ON VIEW public.students_detailed_view IS 'Denormalized view of student data with all related entity information for easy querying';
COMMENT ON COLUMN public.students.tenth_marks IS 'JSON structure: {"total": 500, "obtained": 450, "percentage": 90}';
COMMENT ON COLUMN public.students.twelfth_marks IS 'JSON structure: {"total": 600, "obtained": 540, "percentage": 90, "subjects": []}';
