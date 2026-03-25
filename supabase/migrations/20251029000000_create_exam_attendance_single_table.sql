-- Drop the parent-child tables if they exist
DROP TABLE IF EXISTS public.exam_attendance_child CASCADE;
DROP TABLE IF EXISTS public.exam_attendance_parent CASCADE;

-- Create single exam_attendance table
CREATE TABLE IF NOT EXISTS public.exam_attendance (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	institutions_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	program_id UUID NOT NULL,
	course_id UUID NOT NULL,
	exam_timetable_id UUID NOT NULL,
	exam_registration_id UUID NOT NULL,
	student_id UUID NOT NULL,
	is_absent BOOLEAN DEFAULT FALSE,
	attendance_status VARCHAR(20) DEFAULT 'Present',
	remarks TEXT,
	verified_by UUID,
	verified_at TIMESTAMP WITH TIME ZONE,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

	-- Foreign key references
	CONSTRAINT fk_exam_attendance_institution FOREIGN KEY (institutions_id)
		REFERENCES public.institutions(id) ON DELETE CASCADE,
	CONSTRAINT fk_exam_attendance_session FOREIGN KEY (examination_session_id)
		REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
	CONSTRAINT fk_exam_attendance_program FOREIGN KEY (program_id)
		REFERENCES public.programs(id) ON DELETE CASCADE,
	CONSTRAINT fk_exam_attendance_course FOREIGN KEY (course_id)
		REFERENCES public.courses(id) ON DELETE CASCADE,
	CONSTRAINT fk_exam_attendance_timetable FOREIGN KEY (exam_timetable_id)
		REFERENCES public.exam_timetables(id) ON DELETE CASCADE,
	CONSTRAINT fk_exam_attendance_registration FOREIGN KEY (exam_registration_id)
		REFERENCES public.exam_registrations(id) ON DELETE CASCADE,
	CONSTRAINT fk_exam_attendance_student FOREIGN KEY (student_id)
		REFERENCES public.students(id) ON DELETE CASCADE,
	CONSTRAINT fk_exam_attendance_verified_by FOREIGN KEY (verified_by)
		REFERENCES public.users(id),

	-- Unique constraint to prevent duplicate attendance records per student per exam
	CONSTRAINT unique_exam_attendance UNIQUE (
		exam_timetable_id,
		exam_registration_id
	)
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_exam_attendance_institution
	ON public.exam_attendance USING btree (institutions_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_exam_attendance_session
	ON public.exam_attendance USING btree (examination_session_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_exam_attendance_program
	ON public.exam_attendance USING btree (program_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_exam_attendance_course
	ON public.exam_attendance USING btree (course_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_exam_attendance_timetable
	ON public.exam_attendance USING btree (exam_timetable_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_exam_attendance_student
	ON public.exam_attendance USING btree (student_id) TABLESPACE pg_default;

-- Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_exam_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_exam_attendance_updated_at
	BEFORE UPDATE ON public.exam_attendance
	FOR EACH ROW
	EXECUTE FUNCTION public.update_exam_attendance_updated_at();

-- Enable Row Level Security
ALTER TABLE public.exam_attendance ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to read exam_attendance"
	ON public.exam_attendance FOR SELECT
	TO authenticated
	USING (true);

CREATE POLICY "Allow authenticated users to insert exam_attendance"
	ON public.exam_attendance FOR INSERT
	TO authenticated
	WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update exam_attendance"
	ON public.exam_attendance FOR UPDATE
	TO authenticated
	USING (true)
	WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete exam_attendance"
	ON public.exam_attendance FOR DELETE
	TO authenticated
	USING (true);
