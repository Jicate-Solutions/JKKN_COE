-- Migration: Add Missing Foreign Key Indexes (Corrected)
-- Date: 2026-01-23
-- Critical Fix: Adds indexes on all foreign key columns per Postgres best practice 4.2
-- Impact: 10-100x faster JOINs and CASCADE operations
-- Reference: https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK

-- ==============================================================================
-- CRITICAL: Missing FK Indexes on Core Tables
-- ==============================================================================

-- courses table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_courses_board_id ON courses (board_id);
CREATE INDEX IF NOT EXISTS idx_courses_institutions_id ON courses (institutions_id);
CREATE INDEX IF NOT EXISTS idx_courses_offering_department_id ON courses (offering_department_id);

-- admissions table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_admissions_created_by ON admissions (created_by);
CREATE INDEX IF NOT EXISTS idx_admissions_institution_id ON admissions (institution_id);
CREATE INDEX IF NOT EXISTS idx_admissions_updated_by ON admissions (updated_by);

-- academic_years table - Missing index on FK
CREATE INDEX IF NOT EXISTS idx_academic_years_institutions_id ON academic_years (institutions_id);

-- faculty_coe table - Missing index on FK
CREATE INDEX IF NOT EXISTS idx_faculty_coe_department_id ON faculty_coe (department_id);

-- course_offerings table - Missing index on FK
CREATE INDEX IF NOT EXISTS idx_course_offerings_course_id ON course_offerings (course_id);

-- exam_timetables table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_exam_timetables_course_id ON exam_timetables (course_id);
CREATE INDEX IF NOT EXISTS idx_exam_timetables_created_by ON exam_timetables (created_by);

-- exam_attendance table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_exam_attendance_course_id ON exam_attendance (course_id);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_exam_timetable_id ON exam_attendance (exam_timetable_id);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_examination_session_id ON exam_attendance (examination_session_id);

-- student_dummy_numbers table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_student_dummy_numbers_exam_timetable_id ON student_dummy_numbers (exam_timetable_id) WHERE exam_timetable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_dummy_numbers_packet_id ON student_dummy_numbers (packet_id) WHERE packet_id IS NOT NULL;

-- room_allocations table - Missing index on FK
CREATE INDEX IF NOT EXISTS idx_room_allocations_created_by ON room_allocations (created_by);

-- seat_allocations table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_seat_allocations_exam_registration_id ON seat_allocations (exam_registration_id);
CREATE INDEX IF NOT EXISTS idx_seat_allocations_exam_room_id ON seat_allocations (exam_room_id);
CREATE INDEX IF NOT EXISTS idx_seat_allocations_exam_timetable_id ON seat_allocations (exam_timetable_id);
CREATE INDEX IF NOT EXISTS idx_seat_allocations_institutions_id ON seat_allocations (institutions_id);

-- pdf_institution_settings table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_pdf_institution_settings_created_by ON pdf_institution_settings (created_by);
CREATE INDEX IF NOT EXISTS idx_pdf_institution_settings_institution_id ON pdf_institution_settings (institution_id);
CREATE INDEX IF NOT EXISTS idx_pdf_institution_settings_updated_by ON pdf_institution_settings (updated_by);

-- academic_calendar table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_academic_calendar_deleted_by ON academic_calendar (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_academic_calendar_parent_event_id ON academic_calendar (parent_event_id) WHERE parent_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_academic_calendar_updated_by ON academic_calendar (updated_by);

-- answer_sheet_packets table - Missing index on FK
CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_exam_timetable_id ON answer_sheet_packets (exam_timetable_id);

-- courses_temp table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_courses_temp_board_id ON courses_temp (board_id);
CREATE INDEX IF NOT EXISTS idx_courses_temp_institutions_id ON courses_temp (institutions_id);
CREATE INDEX IF NOT EXISTS idx_courses_temp_offering_department_id ON courses_temp (offering_department_id);
CREATE INDEX IF NOT EXISTS idx_courses_temp_regulation_id ON courses_temp (regulation_id);

-- student_backlogs table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_student_backlogs_cleared_final_marks_id ON student_backlogs (cleared_final_marks_id) WHERE cleared_final_marks_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_cleared_semester_result_id ON student_backlogs (cleared_semester_result_id) WHERE cleared_semester_result_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_created_by ON student_backlogs (created_by);
CREATE INDEX IF NOT EXISTS idx_student_backlogs_last_attempt_session_id ON student_backlogs (last_attempt_session_id) WHERE last_attempt_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_original_academic_year_id ON student_backlogs (original_academic_year_id) WHERE original_academic_year_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_original_semester_result_id ON student_backlogs (original_semester_result_id) WHERE original_semester_result_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_backlogs_updated_by ON student_backlogs (updated_by);

-- examiners table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_examiners_created_by ON examiners (created_by);
CREATE INDEX IF NOT EXISTS idx_examiners_institution_id ON examiners (institution_id);
CREATE INDEX IF NOT EXISTS idx_examiners_updated_by ON examiners (updated_by);

-- examiner_email_logs table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_examiner_email_logs_board_id ON examiner_email_logs (board_id);
CREATE INDEX IF NOT EXISTS idx_examiner_email_logs_created_by ON examiner_email_logs (created_by);
CREATE INDEX IF NOT EXISTS idx_examiner_email_logs_examiner_id ON examiner_email_logs (examiner_id);

-- examiner_appointments table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_examiner_appointments_board_id ON examiner_appointments (board_id);
CREATE INDEX IF NOT EXISTS idx_examiner_appointments_created_by ON examiner_appointments (created_by);
CREATE INDEX IF NOT EXISTS idx_examiner_appointments_examiner_id ON examiner_appointments (examiner_id);

-- internal_assessment_patterns table - Missing indexes on FKs
CREATE INDEX IF NOT EXISTS idx_internal_assessment_patterns_approved_by ON internal_assessment_patterns (approved_by) WHERE approved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_internal_assessment_patterns_created_by ON internal_assessment_patterns (created_by);

-- pattern_course_associations table - Missing index on FK
CREATE INDEX IF NOT EXISTS idx_pattern_course_associations_created_by ON pattern_course_associations (created_by);

-- pattern_program_associations table - Missing index on FK
CREATE INDEX IF NOT EXISTS idx_pattern_program_associations_created_by ON pattern_program_associations (created_by);

-- ==============================================================================
-- Performance-Critical Composite Indexes for Multi-Column Queries
-- ==============================================================================

-- Composite index for exam_attendance queries filtered by session + course
CREATE INDEX IF NOT EXISTS idx_exam_attendance_session_course ON exam_attendance (examination_session_id, course_id);

-- Composite index for student_backlogs queries filtered by student + is_cleared
CREATE INDEX IF NOT EXISTS idx_student_backlogs_student_cleared ON student_backlogs (student_id, is_cleared);

-- Composite index for marks_entry queries filtered by session + course
CREATE INDEX IF NOT EXISTS idx_marks_entry_session_course ON marks_entry (examination_session_id, course_offering_id);

-- Composite index for final_marks queries filtered by student + session
CREATE INDEX IF NOT EXISTS idx_final_marks_student_session ON final_marks (student_id, examination_session_id);

-- ==============================================================================
-- Partial Indexes for Frequently Filtered Queries (Best Practice 1.5)
-- ==============================================================================

-- Partial index for active academic years only
CREATE INDEX IF NOT EXISTS idx_academic_years_active ON academic_years (institutions_id, year_start) WHERE is_active = true;

-- Partial index for pending exam attendance only
CREATE INDEX IF NOT EXISTS idx_exam_attendance_pending ON exam_attendance (exam_timetable_id, student_id) WHERE attendance_status = 'pending';

-- Partial index for unassigned answer sheet packets
CREATE INDEX IF NOT EXISTS idx_answer_sheet_packets_unassigned ON answer_sheet_packets (exam_timetable_id) WHERE assigned_to IS NULL;

-- Partial index for uncleared student backlogs
CREATE INDEX IF NOT EXISTS idx_student_backlogs_uncleared ON student_backlogs (student_id, course_id) WHERE is_cleared = false;

-- ==============================================================================
-- Indexes for Common Search and Filter Patterns
-- ==============================================================================

-- Index for filtering exam registrations by program_code (used in MyJKKN integration)
CREATE INDEX IF NOT EXISTS idx_exam_registrations_program_code ON exam_registrations (program_code) WHERE program_code IS NOT NULL;

-- Index for filtering course_offerings by regulation + program
CREATE INDEX IF NOT EXISTS idx_course_offerings_regulation_program ON course_offerings (regulation_id, program_id);

-- Index for searching by register number (heavily used in reports)
CREATE INDEX IF NOT EXISTS idx_student_backlogs_register_number ON student_backlogs (register_number);
CREATE INDEX IF NOT EXISTS idx_exam_registrations_register_number ON exam_registrations (stu_register_no);

-- ==============================================================================
-- Comments for Documentation
-- ==============================================================================

COMMENT ON INDEX idx_courses_board_id IS 'FK index for faster JOINs with board table';
COMMENT ON INDEX idx_exam_attendance_session_course IS 'Composite index for common session+course queries';
COMMENT ON INDEX idx_academic_years_active IS 'Partial index for active years only (5-20x smaller)';
COMMENT ON INDEX idx_student_backlogs_uncleared IS 'Partial index for uncleared backlogs only';

-- ==============================================================================
-- Verification - Check for remaining missing FK indexes
-- ==============================================================================

-- Run this query to verify all FK columns now have indexes:
-- SELECT
--     c.conrelid::regclass AS table_name,
--     a.attname AS column_name,
--     c.confrelid::regclass AS referenced_table
-- FROM pg_constraint c
-- JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
-- WHERE c.contype = 'f'
--     AND NOT EXISTS (
--         SELECT 1
--         FROM pg_index i
--         WHERE i.indrelid = c.conrelid
--             AND a.attnum = ANY(i.indkey)
--     )
-- ORDER BY table_name;
-- Expected result: 0 rows (all FKs now have indexes)
