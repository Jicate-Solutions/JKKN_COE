-- =====================================================
-- SEED PAGE-LEVEL PERMISSIONS FOR SIDEBAR NAVIGATION
-- Date: 2026-05-13
-- Purpose:
--   Create one `page.<slug>.view` permission per sidebar nav route
--   and grant it to the roles that currently see that page in
--   lib/navigation-data.ts. This is step 1 of the migration from
--   hardcoded `coe_roles` arrays to DB-driven page permissions.
--
-- Naming convention:
--   name      = 'page.<slug>.view'
--   resource  = 'page.<slug>'
--   action    = 'view'
--   slug      = URL path with '/' -> '.' and '-' -> '_'
--              (query string stripped)
--
-- Role list:
--   '*' = grant to every role
--   Roles that do not exist are silently skipped via the JOIN.
--
-- Idempotent: re-running this migration has no side effects.
-- Behavior change: NONE. The sidebar still reads `coe_roles` until
-- step 2 of the migration plan switches it to hasPermission().
-- =====================================================

WITH page_perms(name, description, resource, role_names) AS (
	VALUES
		-- Dashboard
		('page.dashboard.view',                              'Access Dashboard page',                      'page.dashboard',                              ARRAY['*']::text[]),

		-- Admin group
		('page.admin.role_management.view',                  'Access Role Management page',                'page.admin.role_management',                  ARRAY['admin','super_admin']),
		('page.users.roles.view',                            'Access Roles page',                          'page.users.roles',                            ARRAY['admin','super_admin']),
		('page.users.permissions.view',                      'Access Permissions page',                    'page.users.permissions',                      ARRAY['admin','super_admin']),
		('page.users.role_permissions.view',                 'Access Role Permission page',                'page.users.role_permissions',                 ARRAY['admin','super_admin']),
		('page.admin.user_log_activity.view',                'Access User Log Activity page',              'page.admin.user_log_activity',                ARRAY['admin','super_admin']),

		-- Master group
		('page.master.institutions.view',                    'Access Institutions page',                   'page.master.institutions',                    ARRAY['super_admin']),
		('page.master.degrees.view',                         'Access Degree page',                         'page.master.degrees',                         ARRAY['super_admin']),
		('page.master.departments_myjkkn.view',              'Access Department page',                     'page.master.departments_myjkkn',              ARRAY['super_admin']),
		('page.master.programs_myjkkn.view',                 'Access Program page',                        'page.master.programs_myjkkn',                 ARRAY['super_admin']),
		('page.master.semesters_myjkkn.view',                'Access Semester page',                       'page.master.semesters_myjkkn',                ARRAY['super_admin']),
		('page.master.academic_years.view',                  'Access Academic Year page',                  'page.master.academic_years',                  ARRAY['super_admin']),
		('page.master.batches.view',                         'Access Batch page',                          'page.master.batches',                         ARRAY['super_admin']),
		('page.master.regulations_myjkkn.view',              'Access Regulations page',                    'page.master.regulations_myjkkn',              ARRAY['super_admin']),
		('page.master.sections.view',                        'Access Section page',                        'page.master.sections',                        ARRAY['super_admin']),
		('page.master.boards.view',                          'Access Board page',                          'page.master.boards',                          ARRAY['super_admin']),
		('page.master.pdf_settings.view',                    'Access PDF Settings page',                   'page.master.pdf_settings',                    ARRAY['super_admin']),
		('page.master.smtp_config.view',                     'Access SMTP Configuration page',             'page.master.smtp_config',                     ARRAY['super_admin']),
		('page.test_myjkkn_api.view',                        'Access MyJKKN API Explorer page',            'page.test_myjkkn_api',                        ARRAY['super_admin']),

		-- Courses group
		('page.master.courses.view',                         'Access Courses page',                        'page.master.courses',                         ARRAY['super_admin','coe','coe_office']),
		('page.course_management.course_mapping_index.view', 'Access Course Mapping page',                 'page.course_management.course_mapping_index', ARRAY['super_admin','coe','coe_office']),
		('page.course_management.course_offering.view',      'Access Course Offering page',                'page.course_management.course_offering',      ARRAY['super_admin','coe','coe_office']),

		-- Learners group
		('page.users.learners_myjkkn.view',                  'Access Learner Directory page',              'page.users.learners_myjkkn',                  ARRAY['super_admin','coe']),

		-- Grading group
		('page.grading.grades.view',                         'Access Grades page',                         'page.grading.grades',                         ARRAY['super_admin','coe']),
		('page.grading.grade_system.view',                   'Access Grade System page',                   'page.grading.grade_system',                   ARRAY['super_admin','coe']),
		('page.grading.generate_final_marks.view',           'Access Generate Final Marks page',           'page.grading.generate_final_marks',           ARRAY['super_admin','coe']),
		('page.grading.semester_results.view',               'Access Semester Results page',               'page.grading.semester_results',               ARRAY['super_admin','coe']),
		('page.grading.learner_backlogs.view',               'Access Learner Arrears page',                'page.grading.learner_backlogs',               ARRAY['super_admin','coe']),
		('page.grading.galley_report.report.view',           'Access Galley Report page',                  'page.grading.galley_report.report',           ARRAY['super_admin','coe']),
		('page.grading.test_gpa_workflow.view',              'Access Test GPA Workflow page',              'page.grading.test_gpa_workflow',              ARRAY['super_admin','coe']),
		('page.marks_management.comment_grades.view',        'Access Comment Grade Entry page',            'page.marks_management.comment_grades',        ARRAY['super_admin','coe']),
		('page.marks_management.credit_entry.view',          'Access Credit Entry page',                   'page.marks_management.credit_entry',          ARRAY['super_admin','coe']),

		-- Pre-Exam group
		('page.exam_management.exam_types.view',             'Access Exam Types page',                     'page.exam_management.exam_types',             ARRAY['super_admin','coe']),
		('page.exam_management.examination_sessions.view',   'Access Examination Sessions page',           'page.exam_management.examination_sessions',   ARRAY['super_admin','coe']),
		('page.exam_management.exam_registrations.view',     'Access Exam Registrations page',             'page.exam_management.exam_registrations',     ARRAY['super_admin','coe']),
		('page.exam_management.exam_registrations.lookup.view','Access Registration Lookup page',          'page.exam_management.exam_registrations.lookup',ARRAY['super_admin','coe']),
		('page.exam_management.exam_timetables.view',        'Access Exam Timetable page',                 'page.exam_management.exam_timetables',        ARRAY['super_admin','coe']),
		('page.exam_management.validate_timetable.view',     'Access Validate Timetable page',             'page.exam_management.validate_timetable',     ARRAY['super_admin','coe']),
		('page.pre_exam.hall_tickets.view',                  'Access Hall Tickets page',                   'page.pre_exam.hall_tickets',                  ARRAY['super_admin','coe']),
		('page.pre_exam.exam_attendance_sheet.view',         'Access Exam Attendance Sheet page',          'page.pre_exam.exam_attendance_sheet',         ARRAY['super_admin','coe','coe_office_1']),
		('page.pre_exam.practical_allotment.view',           'Access Practical Allotment page',            'page.pre_exam.practical_allotment',           ARRAY['super_admin','coe']),
		('page.pre_exam.bulk_internal_marks.view',           'Access Bulk Internal Marks page',            'page.pre_exam.bulk_internal_marks',           ARRAY['super_admin','coe']),
		('page.pre_exam.internal_mark_entry_setting.view',   'Access CIA Entry Setting page',              'page.pre_exam.internal_mark_entry_setting',   ARRAY['super_admin','coe']),
		('page.pre_exam.mark_conversion_rules.view',         'Access Mark Conversion Rules page',          'page.pre_exam.mark_conversion_rules',         ARRAY['super_admin','coe']),
		('page.pre_exam.internal_mark_entry.view',           'Access Internal Mark Entry page',            'page.pre_exam.internal_mark_entry',           ARRAY['super_admin','coe']),
		('page.pre_exam.internal_mark_report.view',          'Access Internal Mark Report page',           'page.pre_exam.internal_mark_report',          ARRAY['super_admin','coe']),
		('page.pre_exam.coe_calendar.view',                  'Access COE Calendar page',                   'page.pre_exam.coe_calendar',                  ARRAY['super_admin','coe']),

		-- Internal Marks group
		('page.pre_exam.internal_mark_setting.view',                       'Access Assessment Patterns page',  'page.pre_exam.internal_mark_setting',                       ARRAY['super_admin','coe']),
		('page.pre_exam.internal_mark_setting.eligibility_rules.view',     'Access Eligibility Rules page',    'page.pre_exam.internal_mark_setting.eligibility_rules',     ARRAY['super_admin','coe']),
		('page.pre_exam.internal_mark_setting.passing_rules.view',         'Access Passing Rules page',        'page.pre_exam.internal_mark_setting.passing_rules',         ARRAY['super_admin','coe']),
		('page.pre_exam.internal_mark_setting.course_associations.view',   'Access Course Associations page',  'page.pre_exam.internal_mark_setting.course_associations',   ARRAY['super_admin','coe']),
		('page.pre_exam.internal_mark_setting.program_associations.view',  'Access Program Associations page', 'page.pre_exam.internal_mark_setting.program_associations',  ARRAY['super_admin','coe']),

		-- During-Exam group
		('page.exam_management.exam_attendance.view',         'Access Exam Attendance page',         'page.exam_management.exam_attendance',         ARRAY['super_admin','coe','coe_office_1']),
		('page.exam_management.practical_attendance.view',    'Access Practical Attendance page',    'page.exam_management.practical_attendance',    ARRAY['super_admin','coe','coe_mark_entry','coe_office_1']),
		('page.exam_management.attendance_correction.view',   'Access Attendance Correction page',   'page.exam_management.attendance_correction',   ARRAY['super_admin','coe','coe_office_1']),
		('page.exam_management.exam_rooms.view',              'Access Exam Rooms page',              'page.exam_management.exam_rooms',              ARRAY['super_admin','coe']),

		-- Examiners group
		('page.exam_management.examiners.internal.view',      'Access Internal Examiners page',      'page.exam_management.examiners.internal',      ARRAY['super_admin','coe','deputy_coe']),
		('page.exam_management.examiners.view',               'Access Examiner Panel page',          'page.exam_management.examiners',               ARRAY['super_admin','coe','deputy_coe']),
		('page.exam_management.examiners.send_email.view',    'Access Send Appointment page',        'page.exam_management.examiners.send_email',    ARRAY['super_admin','coe','deputy_coe']),

		-- Post-Exam group
		('page.utilities.dummy_numbers.view',                 'Access Dummy Numbers page',           'page.utilities.dummy_numbers',                 ARRAY['super_admin','coe']),
		('page.post_exam.answer_sheet_packets.view',          'Access Answer Sheet Packets page',    'page.post_exam.answer_sheet_packets',          ARRAY['super_admin','coe']),
		('page.post_exam.central_valuation.dates.view',       'Access Central Valuation page',       'page.post_exam.central_valuation.dates',       ARRAY['super_admin','coe']),
		('page.post_exam.exam_attendance_bulk.view',          'Access Attendance Bulk Upload page',  'page.post_exam.exam_attendance_bulk',          ARRAY['super_admin','coe']),
		('page.post_exam.external_mark_entry.view',           'Access External Mark Entry page',     'page.post_exam.external_mark_entry',           ARRAY['super_admin','coe','coe_mark_entry','coe_office_1']),
		('page.post_exam.external_mark_bulk_upload.view',     'Access External Mark Bulk Upload page','page.post_exam.external_mark_bulk_upload',     ARRAY['super_admin','coe']),
		('page.post_exam.external_mark_correction.view',      'Access External Mark Correction page','page.post_exam.external_mark_correction',      ARRAY['super_admin','coe','coe_mark_entry','coe_office_1']),
		('page.post_exam.practical_mark_entry.view',          'Access Practical Mark Entry page',    'page.post_exam.practical_mark_entry',          ARRAY['super_admin','coe','coe_mark_entry','coe_office_1']),
		('page.post_exam.foil_sheet_download.view',           'Access Foil Sheet Download page',     'page.post_exam.foil_sheet_download',           ARRAY['super_admin','coe','admin']),

		-- Revaluation group (all tabs share same path)
		('page.revaluation_management.create.view',           'Access Create Revaluation page',      'page.revaluation_management.create',           ARRAY['super_admin','coe']),
		('page.revaluation_management.view',                  'Access Revaluation Management page',  'page.revaluation_management',                  ARRAY['super_admin','coe']),

		-- Pre-Exam Reports group
		('page.reports.pre_exam.student_strength.view',       'Access Student Strength page',        'page.reports.pre_exam.student_strength',       ARRAY['super_admin','coe']),

		-- Reports group
		('page.reports.comprehensive.view',                   'Access Comprehensive Reports page',   'page.reports.comprehensive',                   ARRAY['super_admin','coe']),
		('page.reports.exam_registration_reports.view',       'Access Exam Reports Summary page',    'page.reports.exam_registration_reports',       ARRAY['super_admin','coe']),
		('page.exam_management.reports.attendance.view',      'Access Attendance Report page',       'page.exam_management.reports.attendance',      ARRAY['super_admin','coe','coe_office_1']),
		('page.exam_management.reports.course_count.view',    'Access Course Count Report page',     'page.exam_management.reports.course_count',    ARRAY['super_admin','coe']),
		('page.reports.marksheet_distribution.view',          'Access Marksheet Distribution page',  'page.reports.marksheet_distribution',          ARRAY['super_admin','coe']),
		('page.reports.semester_marksheet.view',              'Access Semester Marksheet page',      'page.reports.semester_marksheet',              ARRAY['super_admin','coe']),
		('page.reports.practical_exam.practical_need.view',   'Access Practical Exam Reports page',  'page.reports.practical_exam.practical_need',   ARRAY['super_admin','coe']),
		('page.reports.cv_report.view',                       'Access CV Report page',               'page.reports.cv_report',                       ARRAY['super_admin','coe']),
		('page.reports.dummy_numbers.view',                   'Access Dummy Number Report page',     'page.reports.dummy_numbers',                   ARRAY['super_admin','coe']),
		('page.reports.nad.view',                             'Access NAD Report page',              'page.reports.nad',                             ARRAY['super_admin','coe','deputy_coe','nad_coordinator']),

		-- Result Analytics group (all tabs share same path)
		('page.result.dashboard.view',                        'Access Result Analytics Dashboard page','page.result.dashboard',                      ARRAY['super_admin','coe','deputy_coe']),

		-- Developer Portal group
		('page.developer_portal.view',                        'Access Developer Portal Overview page','page.developer_portal',                       ARRAY['admin','super_admin']),
		('page.developer_portal.applications.view',           'Access Developer Portal Applications page','page.developer_portal.applications',      ARRAY['admin','super_admin']),
		('page.developer_portal.audit_logs.view',             'Access Developer Portal Audit Logs page','page.developer_portal.audit_logs',          ARRAY['admin','super_admin'])
),
upsert_perms AS (
	INSERT INTO public.permissions (name, description, resource, action, is_active)
	SELECT name, description, resource, 'view', true FROM page_perms
	ON CONFLICT (name) DO UPDATE
		SET description = EXCLUDED.description,
		    resource    = EXCLUDED.resource,
		    is_active   = true
	RETURNING id, name
),
exploded AS (
	SELECT
		up.id AS permission_id,
		unnest(pp.role_names) AS role_name
	FROM page_perms pp
	JOIN upsert_perms up ON up.name = pp.name
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, e.permission_id
FROM exploded e
JOIN public.roles r ON (
	e.role_name = '*' OR r.name = e.role_name
)
WHERE r.is_active IS NOT FALSE
ON CONFLICT (role_id, permission_id) DO NOTHING;
