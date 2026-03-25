-- Create course_offerings table matching the exact schema
CREATE TABLE IF NOT EXISTS public.course_offerings (
	id UUID NOT NULL DEFAULT gen_random_uuid(),
	institutions_id UUID NOT NULL,
	course_id UUID NOT NULL,
	examination_session_id UUID NOT NULL,
	program_id UUID NOT NULL,
	semester INTEGER NOT NULL,
	section VARCHAR(10) NULL,
	faculty_id UUID NULL,
	max_enrollment INTEGER NULL,
	enrolled_count INTEGER NULL DEFAULT 0,
	is_active BOOLEAN NULL DEFAULT true,
	created_by UUID NULL,
	updated_by UUID NULL,
	created_at TIMESTAMPTZ NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMPTZ NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT course_offerings_pkey PRIMARY KEY (id),
	CONSTRAINT unique_offering UNIQUE (
		institutions_id,
		course_id,
		examination_session_id,
		program_id,
		semester
	),
	CONSTRAINT course_offerings_created_by_fkey FOREIGN KEY (created_by) REFERENCES faculty_coe (id) ON DELETE SET NULL,
	CONSTRAINT course_offerings_examination_session_id_fkey FOREIGN KEY (examination_session_id) REFERENCES examination_sessions (id) ON DELETE CASCADE,
	CONSTRAINT course_offerings_faculty_id_fkey FOREIGN KEY (faculty_id) REFERENCES faculty_coe (id) ON DELETE SET NULL,
	CONSTRAINT course_offerings_institutions_id_fkey FOREIGN KEY (institutions_id) REFERENCES institutions (id) ON DELETE CASCADE,
	CONSTRAINT course_offerings_course_id_fkey FOREIGN KEY (course_id) REFERENCES course_mapping (id) ON DELETE RESTRICT,
	CONSTRAINT course_offerings_program_id_fkey FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE RESTRICT,
	CONSTRAINT course_offerings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES faculty_coe (id) ON DELETE SET NULL,
	CONSTRAINT course_offerings_enrolled_count_check CHECK (enrolled_count >= 0),
	CONSTRAINT course_offerings_semester_check CHECK (semester >= 1 AND semester <= 12),
	CONSTRAINT course_offerings_max_enrollment_check CHECK (max_enrollment IS NULL OR max_enrollment > 0),
	CONSTRAINT check_enrollment_capacity CHECK (max_enrollment IS NULL OR enrolled_count <= max_enrollment)
) TABLESPACE pg_default;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_course_offerings_institution ON public.course_offerings USING btree (institutions_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_session ON public.course_offerings USING btree (examination_session_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_course ON public.course_offerings USING btree (course_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_program ON public.course_offerings USING btree (program_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_faculty ON public.course_offerings USING btree (faculty_id) TABLESPACE pg_default WHERE (faculty_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_course_offerings_semester ON public.course_offerings USING btree (semester) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_section ON public.course_offerings USING btree (section) TABLESPACE pg_default WHERE (section IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_course_offerings_active ON public.course_offerings USING btree (is_active) TABLESPACE pg_default WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_course_offerings_enrollment ON public.course_offerings USING btree (enrolled_count, max_enrollment) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_inst_session ON public.course_offerings USING btree (institutions_id, examination_session_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_session_program ON public.course_offerings USING btree (examination_session_id, program_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_session_program_semester ON public.course_offerings USING btree (examination_session_id, program_id, semester) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_program_semester ON public.course_offerings USING btree (program_id, semester) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_faculty_session ON public.course_offerings USING btree (faculty_id, examination_session_id) TABLESPACE pg_default WHERE (faculty_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_course_offerings_active_session ON public.course_offerings USING btree (examination_session_id, is_active) TABLESPACE pg_default WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_course_offerings_created_by ON public.course_offerings USING btree (created_by) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_created_at ON public.course_offerings USING btree (created_at DESC) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_course_offerings_available_seats ON public.course_offerings USING btree (id, enrolled_count, max_enrollment) TABLESPACE pg_default WHERE (is_active = true AND (max_enrollment IS NULL OR enrolled_count < max_enrollment));

-- Add comment
COMMENT ON TABLE course_offerings IS 'Stores course offerings for examination sessions with enrollment tracking';
