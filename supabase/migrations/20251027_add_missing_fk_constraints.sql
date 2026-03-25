-- =====================================================
-- ADD MISSING FOREIGN KEY CONSTRAINTS
-- Created: 2025-10-27
-- Purpose: Add FK constraints for students table relationships
-- =====================================================

-- 1. Students -> Institutions (ALREADY ADDED)
-- ALTER TABLE students
-- ADD CONSTRAINT fk_students_institutions
-- FOREIGN KEY (institution_id)
-- REFERENCES institutions(id)
-- ON DELETE RESTRICT
-- ON UPDATE CASCADE;

-- 2. Students -> Degrees
ALTER TABLE students
ADD CONSTRAINT fk_students_degrees
FOREIGN KEY (degree_id)
REFERENCES degrees(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- 3. Students -> Departments
ALTER TABLE students
ADD CONSTRAINT fk_students_departments
FOREIGN KEY (department_id)
REFERENCES departments(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- 4. Students -> Programs
ALTER TABLE students
ADD CONSTRAINT fk_students_programs
FOREIGN KEY (program_id)
REFERENCES programs(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- 5. Students -> Semesters
ALTER TABLE students
ADD CONSTRAINT fk_students_semesters
FOREIGN KEY (semester_id)
REFERENCES semesters(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- 6. Students -> Sections
ALTER TABLE students
ADD CONSTRAINT fk_students_sections
FOREIGN KEY (section_id)
REFERENCES sections(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- 7. Students -> Academic Year
ALTER TABLE students
ADD CONSTRAINT fk_students_academic_year
FOREIGN KEY (academic_year_id)
REFERENCES academic_year(id)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- =====================================================
-- ADDITIONAL FK CONSTRAINTS FOR OTHER TABLES
-- =====================================================

-- 8. Degrees -> Institutions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_degrees_institutions'
    ) THEN
        ALTER TABLE degrees
        ADD CONSTRAINT fk_degrees_institutions
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

-- 9. Departments -> Institutions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_departments_institutions'
    ) THEN
        ALTER TABLE departments
        ADD CONSTRAINT fk_departments_institutions
        FOREIGN KEY (institutions_id)
        REFERENCES institutions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

-- 10. Programs -> Institutions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_programs_institutions'
    ) THEN
        ALTER TABLE programs
        ADD CONSTRAINT fk_programs_institutions
        FOREIGN KEY (institutions_id)
        REFERENCES institutions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

-- 11. Programs -> Degrees (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_programs_degrees'
    ) THEN
        ALTER TABLE programs
        ADD CONSTRAINT fk_programs_degrees
        FOREIGN KEY (degree_id)
        REFERENCES degrees(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

-- 12. Programs -> Departments (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_programs_departments'
    ) THEN
        ALTER TABLE programs
        ADD CONSTRAINT fk_programs_departments
        FOREIGN KEY (offering_department_id)
        REFERENCES departments(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE;
    END IF;
END $$;

-- 13. Semesters -> Institutions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_semesters_institutions'
    ) THEN
        ALTER TABLE semesters
        ADD CONSTRAINT fk_semesters_institutions
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

-- 14. Sections -> Institutions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_sections_institutions'
    ) THEN
        ALTER TABLE sections
        ADD CONSTRAINT fk_sections_institutions
        FOREIGN KEY (institution_id)
        REFERENCES institutions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

-- 15. Examination Sessions -> Institutions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_examination_sessions_institutions'
    ) THEN
        ALTER TABLE examination_sessions
        ADD CONSTRAINT fk_examination_sessions_institutions
        FOREIGN KEY (institutions_id)
        REFERENCES institutions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

-- 16. Course Offerings -> Institutions (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_course_offerings_institutions'
    ) THEN
        ALTER TABLE course_offerings
        ADD CONSTRAINT fk_course_offerings_institutions
        FOREIGN KEY (institutions_id)
        REFERENCES institutions(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;

-- =====================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for students foreign keys (if not exist)
CREATE INDEX IF NOT EXISTS idx_students_institution_id ON students(institution_id);
CREATE INDEX IF NOT EXISTS idx_students_degree_id ON students(degree_id);
CREATE INDEX IF NOT EXISTS idx_students_department_id ON students(department_id);
CREATE INDEX IF NOT EXISTS idx_students_program_id ON students(program_id);
CREATE INDEX IF NOT EXISTS idx_students_semester_id ON students(semester_id);
CREATE INDEX IF NOT EXISTS idx_students_section_id ON students(section_id);
CREATE INDEX IF NOT EXISTS idx_students_academic_year_id ON students(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_students_register_number ON students(register_number);

-- =====================================================
-- VERIFY CONSTRAINTS
-- =====================================================

-- Query to check all FK constraints on students table
-- SELECT
--     tc.constraint_name,
--     tc.table_name,
--     kcu.column_name,
--     ccu.table_name AS foreign_table_name,
--     ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--     ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--     ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--     AND tc.table_name = 'students';
