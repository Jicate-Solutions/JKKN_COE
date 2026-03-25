-- Create course_mapping table with foreign key to courses.id
CREATE TABLE IF NOT EXISTS public.course_mapping (
  id uuid NOT NULL DEFAULT gen_random_uuid(),

  -- Foreign key to course table (primary relationship)
  course_id uuid NOT NULL,

  -- Additional mapping fields
  institution_code text NOT NULL,
  program_code text NOT NULL,
  batch_code text NOT NULL,
  semester_code text NULL,
  course_group text NULL,
  course_order integer NULL DEFAULT 1,

  -- Marks configuration
  internal_max_mark numeric NULL DEFAULT 0,
  internal_pass_mark numeric NULL DEFAULT 0,
  external_max_mark numeric NULL DEFAULT 0,
  external_pass_mark numeric NULL DEFAULT 0,
  total_max_mark numeric NULL DEFAULT 0,
  total_pass_mark numeric NULL DEFAULT 0,

  -- Status and audit fields
  is_active boolean NULL DEFAULT true,
  created_at timestamp with time zone NULL DEFAULT now(),
  updated_at timestamp with time zone NULL DEFAULT now(),
  created_by uuid NULL,
  updated_by uuid NULL,

  CONSTRAINT course_mapping_pkey PRIMARY KEY (id),
  CONSTRAINT course_mapping_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
  CONSTRAINT course_mapping_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users (id),
  CONSTRAINT course_mapping_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users (id)
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_course_mapping_course_id ON public.course_mapping USING btree (course_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_mapping_institution_code ON public.course_mapping USING btree (institution_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_mapping_program_code ON public.course_mapping USING btree (program_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_mapping_batch_code ON public.course_mapping USING btree (batch_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_mapping_semester_code ON public.course_mapping USING btree (semester_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_mapping_is_active ON public.course_mapping USING btree (is_active) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_mapping_created_at ON public.course_mapping USING btree (created_at DESC) TABLESPACE pg_default;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_course_mapping_institution_program ON public.course_mapping USING btree (institution_code, program_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_mapping_program_batch ON public.course_mapping USING btree (program_code, batch_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_mapping_batch_semester ON public.course_mapping USING btree (batch_code, semester_code) TABLESPACE pg_default;

-- Create view for course mapping with all joined data
CREATE OR REPLACE VIEW public.course_mapping_detailed_view AS
SELECT
  cm.id,
  cm.course_id,
  cm.institution_code,
  cm.program_code,
  cm.batch_code,
  cm.semester_code,
  cm.course_group,
  cm.course_order,
  cm.internal_max_mark,
  cm.internal_pass_mark,
  cm.external_max_mark,
  cm.external_pass_mark,
  cm.total_max_mark,
  cm.total_pass_mark,
  cm.is_active,
  cm.created_at,
  cm.updated_at,
  -- Course details (from courses table)
  c.course_code,
  c.course_title,
  c.course_short_name,
  c.course_type,
  c.credits,
  c.lecture_hours,
  c.tutorial_hours,
  c.practical_hours,
  c.credit_hours,
  -- Institution details (from course's institution)
  i.name as institution_name,
  -- Program details (from course's program)
  p.program_name,
  p.program_short_name,
  p.duration_years,
  -- Semester details
  s.semester_name,
  s.semester_number,
  -- Batch details
  b.batch_name,
  b.batch_year
FROM public.course_mapping cm
LEFT JOIN public.courses c ON cm.course_id = c.id
LEFT JOIN public.institutions i ON c.institution_code = i.institution_code
LEFT JOIN public.programs p ON c.program_code = p.program_code
LEFT JOIN public.semesters s ON cm.semester_code = s.semester_code
LEFT JOIN public.batch b ON cm.batch_code = b.batch_code;

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_course_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_update_course_mapping_updated_at
BEFORE UPDATE ON public.course_mapping
FOR EACH ROW
EXECUTE FUNCTION public.update_course_mapping_updated_at();

-- Create trigger function to validate marks consistency
CREATE OR REPLACE FUNCTION public.validate_course_mapping_marks()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate internal marks
  IF NEW.internal_pass_mark > NEW.internal_max_mark THEN
    RAISE EXCEPTION 'Internal pass mark cannot exceed internal max mark';
  END IF;

  -- Validate external marks
  IF NEW.external_pass_mark > NEW.external_max_mark THEN
    RAISE EXCEPTION 'External pass mark cannot exceed external max mark';
  END IF;

  -- Validate total marks
  IF NEW.total_pass_mark > NEW.total_max_mark THEN
    RAISE EXCEPTION 'Total pass mark cannot exceed total max mark';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for marks validation
CREATE TRIGGER trigger_validate_course_mapping_marks
BEFORE INSERT OR UPDATE ON public.course_mapping
FOR EACH ROW
EXECUTE FUNCTION public.validate_course_mapping_marks();

-- Add unique constraint to prevent duplicate mappings
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_mapping_unique_mapping
ON public.course_mapping (course_id, institution_code, program_code, batch_code, semester_code)
WHERE is_active = true;

-- Add comments for documentation
COMMENT ON TABLE public.course_mapping IS 'Maps courses to specific programs, batches, and semesters with marks configuration';
COMMENT ON VIEW public.course_mapping_detailed_view IS 'Denormalized view of course mappings with all related entity information';
COMMENT ON COLUMN public.course_mapping.course_id IS 'Foreign key reference to courses.id';
COMMENT ON COLUMN public.course_mapping.institution_code IS 'Institution code from course table';
COMMENT ON COLUMN public.course_mapping.program_code IS 'Program code from course table';
