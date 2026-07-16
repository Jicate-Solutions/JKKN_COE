-- =====================================================
-- CONFIGURE 'office' ROLE PERMISSIONS
-- Date: 2026-07-16
-- Purpose:
--   The 'office' role was hand-created via the Role Permission UI on
--   2026-07-16. It was given a mix of two permission vocabularies:
--     - page.*.view      -> honored by the DB-driven sidebar (WORK)
--     - resource.action  -> NOT checked anywhere except nad.* (INERT)
--   plus one malformed name ('revaluation_reports:view', colon not dot).
--
--   Intended scope (confirmed): Reports + Revaluation viewer, plus
--   Course management, Hall-Ticket / Exam setup, and Learner Directory.
--
--   This migration:
--     1. Grants the correct page.*.view permissions for every scope so
--        the matching sidebar menus actually appear.
--     2. Removes the inert resource.action grants and the malformed one,
--        keeping nad.view / nad.export (the only enforced legacy perms).
--
-- Idempotent: safe to re-run.
-- NOTE: 'office' is a custom role (is_system_role = false).
-- =====================================================

-- 1. Grant the correct page-level permissions to 'office'
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'office'
  AND p.name IN (
    -- Reports / Revaluation / Result Analytics (already working; re-affirmed)
    'page.result.dashboard.view',
    'page.grading.galley_report.report.view',
    'page.reports.pre_exam.student_strength.view',
    'page.reports.comprehensive.view',
    'page.reports.exam_registration_reports.view',
    'page.exam_management.reports.attendance.view',
    'page.exam_management.reports.course_count.view',
    'page.reports.marksheet_distribution.view',
    'page.reports.semester_marksheet.view',       -- covers Semester + Consolidated marksheet
    'page.reports.practical_exam.practical_need.view',
    'page.reports.cv_report.view',
    'page.reports.dummy_numbers.view',
    'page.reports.nad.view',
    'page.revaluation_management.view',
    'page.revaluation_management.create.view',

    -- + Manage Courses
    'page.master.courses.view',
    'page.course_management.course_mapping_index.view',
    'page.course_management.course_offering.view',

    -- + Hall Tickets / Exam setup
    'page.pre_exam.hall_tickets.view',
    'page.exam_management.exam_types.view',
    'page.exam_management.exam_rooms.view',
    'page.pre_exam.exam_attendance_sheet.view',
    'page.exam_management.practical_attendance.view',
    'page.post_exam.answer_sheet_packets.view',
    'page.utilities.dummy_numbers.view',           -- Post-Exam > Dummy Numbers

    -- + Learner Directory
    'page.users.learners_myjkkn.view'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 2. Remove inert / malformed permissions from 'office'
--    (keep nad.view + nad.export: those ARE enforced on the NAD report page)
DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.name = 'office'
  AND p.name IN (
    'answer_sheet_packets.view',
    'attendance_report.view',
    'course_mapping.create', 'course_mapping.delete', 'course_mapping.edit', 'course_mapping.view',
    'course_offering.create', 'course_offering.delete', 'course_offering.edit', 'course_offering.view',
    'courses.create', 'courses.delete', 'courses.edit', 'courses.view',
    'dummy_numbers.view',
    'exam_attendance_sheet.view',
    'exam_rooms.view',
    'exam_types.view',
    'galley_report.view',
    'hall_tickets.create', 'hall_tickets.view',
    'learners.view',
    'practical_attendance.view',
    'reports.view',
    'revaluation_reports:view'
  );

-- 3. Verify: list what 'office' ends up with
-- SELECT p.name FROM role_permissions rp
--   JOIN roles r ON r.id = rp.role_id
--   JOIN permissions p ON p.id = rp.permission_id
-- WHERE r.name = 'office' ORDER BY p.name;
