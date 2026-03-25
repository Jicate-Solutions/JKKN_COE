-- Schema Dump Generated: 2025-11-08T05:07:04.142Z
-- Project: JKKN COE
-- Source: Supabase Remote Database


-- Table: users
-- Columns: id, email, full_name, username, avatar_url, bio, website, location, date_of_birth, phone, phone_number, is_active, is_verified, role, institution_code, is_super_admin, permissions, preferences, metadata, profile_completed, last_login, created_at, updated_at, institution_id, user_roles
-- Row count: 8

-- Table: roles
-- Columns: id, name, description, is_system_role, is_active, created_at, updated_at
-- Row count: 10

-- Table: permissions
-- Columns: id, name, description, resource, action, is_active, created_at, updated_at
-- Row count: 34

-- Table: role_permissions
-- Columns: id, role_id, permission_id, granted_at, granted_by
-- Row count: 67

-- Table: user_roles
-- Columns: id, user_id, role_id, assigned_at, assigned_by, is_active, expires_at, created_at, updated_at
-- Row count: 9

-- Table: verification_codes
-- Columns: id, email, code, expires_at, used_at, created_at, updated_at
-- Row count: 1

-- Table: institutions
-- Columns: id, institution_code, name, phone, email, website, created_by, counselling_code, accredited_by, address_line1, address_line2, address_line3, city, state, country, logo_url, transportation_dept, administration_dept, accounts_dept, admission_dept, placement_dept, anti_ragging_dept, institution_type, pin_code, timetable_type, is_active, created_at, updated_at
-- Row count: 2

-- Table: departments
-- Columns: id, institutions_id, institution_code, department_code, department_name, display_name, description, stream, status, created_at, updated_at, department_order
-- Row count: 26

-- Table: degrees
-- Columns: id, institutions_id, institution_code, degree_code, degree_name, display_name, description, status, created_at, updated_at
-- Row count: 10

-- Table: programs
-- Columns: id, institutions_id, degree_id, offering_department_id, institution_code, degree_code, offering_department_code, program_type, program_code, program_name, display_name, description, is_active, sanctioned_strength, program_duration_yrs, pattern_type, assessment_duration, part_time, created_at, updated_at, program_order
-- Row count: 26

-- Table: regulations
-- Columns: id, institutions_id, institution_code, regulation_year, regulation_code, status, created_at, updated_at
-- Row count: 1

-- Table: semesters
-- Columns: id, institutions_id, program_id, institution_code, program_code, semester_name, display_name, semester_type, display_order, initial_semester, terminal_semester, created_at, updated_at, semester_code, semester_group
-- Row count: 136

-- Table: courses
-- Columns: id, institutions_id, offering_department_id, institution_code, regulation_code, offering_department_code, course_code, course_name, display_code, course_category, course_type, course_part_master, credit, split_credit, theory_credit, practical_credit, qp_code, e_code_name, exam_duration, evaluation_type, result_type, self_study_course, outside_class_course, open_book, online_course, dummy_number_not_required, annual_course, multiple_qp_set, no_of_qp_setter, no_of_scrutinizer, fee_exception, syllabus_pdf_url, description, status, created_at, updated_at, internal_max_mark, internal_pass_mark, internal_converted_mark, external_max_mark, external_pass_mark, external_converted_mark, total_pass_mark, total_max_mark, annual_semester, registration_based, class_hours, theory_hours, practical_hours, program_code, program_nam, regulation_id, board_id, board_code
-- Row count: 304

-- Table: sections
-- Columns: id, institutions_id, institution_code, section_name, section_id, section_description, arrear_section, status, created_at, updated_at
-- Row count: 1

-- Table: students
-- Columns: id, admission_id, father_name, father_occupation, father_mobile, mother_name, mother_occupation, mother_mobile, date_of_birth, gender, religion, community, caste, annual_income, last_school, board_of_study, tenth_marks, twelfth_marks, medical_cutoff_marks, engineering_cutoff_marks, neet_roll_number, counseling_applied, counseling_number, first_graduate, quota, category, institution_id, degree_id, department_id, program_id, entry_type, permanent_address_street, permanent_address_taluk, permanent_address_district, permanent_address_pin_code, permanent_address_state, student_mobile, student_email, accommodation_type, hostel_type, bus_required, bus_route, bus_pickup_location, reference_type, reference_name, reference_contact, roll_number, student_photo_url, college_email, is_profile_complete, created_at, updated_at, created_by, updated_by, status, semester_id, section_id, academic_year_id, first_name, last_name, application_id, aadhar_number, neet_score, food_type, register_number, regulation_id, batch_id
-- Row count: 1260