-- Create exam_attendance_parent table
CREATE TABLE IF NOT EXISTS public.exam_attendance_parent (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	institutions_id UUID NOT NULL,
	exam_session_code VARCHAR(100) NOT NULL,
	course_code VARCHAR(50) NOT NULL,
	program_code VARCHAR(50) NOT NULL,
	session_code VARCHAR(50) NOT NULL,
	total_students INTEGER DEFAULT 0,
	present_count INTEGER DEFAULT 0,
	absent_count INTEGER DEFAULT 0,
	is_submitted BOOLEAN DEFAULT FALSE,
	submitted_at TIMESTAMP WITH TIME ZONE,
	submitted_by UUID,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	-- Foreign key references
	CONSTRAINT fk_attendance_parent_institution FOREIGN KEY (institutions_id) REFERENCES public.institutions(id) ON DELETE CASCADE,
	CONSTRAINT fk_attendance_parent_verified_by FOREIGN KEY (submitted_by) REFERENCES public.users(id),

	-- Unique constraint to prevent duplicate attendance records
	CONSTRAINT unique_attendance_record UNIQUE (institutions_id, exam_session_code, course_code, program_code, session_code)
) TABLESPACE pg_default;

-- Create exam_attendance_child table
CREATE TABLE IF NOT EXISTS public.exam_attendance_child (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	parent_id UUID NOT NULL,
	exam_registration_id UUID NOT NULL,
	student_id UUID NOT NULL,
	register_number VARCHAR(50) NOT NULL,
	student_name VARCHAR(255) NOT NULL,
	exam_attempt INTEGER DEFAULT 1,
	is_absent BOOLEAN DEFAULT FALSE,
	remarks TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	-- Foreign key references
	CONSTRAINT fk_attendance_child_parent FOREIGN KEY (parent_id) REFERENCES public.exam_attendance_parent(id) ON DELETE CASCADE,
	CONSTRAINT fk_attendance_child_registration FOREIGN KEY (exam_registration_id) REFERENCES public.exam_registrations(id) ON DELETE CASCADE,
	CONSTRAINT fk_attendance_child_student FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,

	-- Unique constraint to prevent duplicate student entries
	CONSTRAINT unique_student_attendance UNIQUE (parent_id, exam_registration_id)
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_exam_attendance_parent_institution ON public.exam_attendance_parent USING btree (institutions_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_exam_attendance_parent_exam_session ON public.exam_attendance_parent USING btree (exam_session_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_exam_attendance_parent_course ON public.exam_attendance_parent USING btree (course_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_exam_attendance_parent_submitted ON public.exam_attendance_parent USING btree (is_submitted) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_exam_attendance_child_parent ON public.exam_attendance_child USING btree (parent_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_exam_attendance_child_student ON public.exam_attendance_child USING btree (student_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_exam_attendance_child_register ON public.exam_attendance_child USING btree (register_number) TABLESPACE pg_default;

-- Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_exam_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trigger_exam_attendance_parent_updated_at
	BEFORE UPDATE ON public.exam_attendance_parent
	FOR EACH ROW
	EXECUTE FUNCTION public.update_exam_attendance_updated_at();

CREATE TRIGGER trigger_exam_attendance_child_updated_at
	BEFORE UPDATE ON public.exam_attendance_child
	FOR EACH ROW
	EXECUTE FUNCTION public.update_exam_attendance_updated_at();

-- Enable Row Level Security
ALTER TABLE public.exam_attendance_parent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attendance_child ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to read exam_attendance_parent"
	ON public.exam_attendance_parent FOR SELECT
	TO authenticated
	USING (true);

CREATE POLICY "Allow authenticated users to insert exam_attendance_parent"
	ON public.exam_attendance_parent FOR INSERT
	TO authenticated
	WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update exam_attendance_parent"
	ON public.exam_attendance_parent FOR UPDATE
	TO authenticated
	USING (true)
	WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete exam_attendance_parent"
	ON public.exam_attendance_parent FOR DELETE
	TO authenticated
	USING (true);

CREATE POLICY "Allow authenticated users to read exam_attendance_child"
	ON public.exam_attendance_child FOR SELECT
	TO authenticated
	USING (true);

CREATE POLICY "Allow authenticated users to insert exam_attendance_child"
	ON public.exam_attendance_child FOR INSERT
	TO authenticated
	WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update exam_attendance_child"
	ON public.exam_attendance_child FOR UPDATE
	TO authenticated
	USING (true)
	WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete exam_attendance_child"
	ON public.exam_attendance_child FOR DELETE
	TO authenticated
	USING (true);
