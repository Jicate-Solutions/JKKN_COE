-- Rename all tables to use plural forms for consistency
-- This migration renames all singular table names to plural forms

-- Rename degree table to degrees
ALTER TABLE public.degree RENAME TO degrees;

-- Rename course table to courses  
ALTER TABLE public.course RENAME TO courses;

-- Rename semester table to semesters
ALTER TABLE public.semester RENAME TO semesters;

-- Rename section table to sections
ALTER TABLE public.section RENAME TO sections;

-- Rename program table to programs
ALTER TABLE public.program RENAME TO programs;

-- Add comments to document the changes
COMMENT ON TABLE public.degrees IS 'Degrees table - renamed from degree for consistency';
COMMENT ON TABLE public.courses IS 'Courses table - renamed from course for consistency';
COMMENT ON TABLE public.semesters IS 'Semesters table - renamed from semester for consistency';
COMMENT ON TABLE public.sections IS 'Sections table - renamed from section for consistency';
COMMENT ON TABLE public.programs IS 'Programs table - renamed from program for consistency';

-- Note: PostgreSQL automatically updates:
-- - Foreign key constraint names when tables are renamed
-- - Index names when tables are renamed
-- - All dependent objects maintain their relationships

