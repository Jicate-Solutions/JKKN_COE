-- =====================================================
-- CREATE COE_OFFICE AND COE_OFFICE_1 ROLES
-- Date: 2026-04-20
-- Purpose: Add two COE operational roles following the nad_coordinator pattern.
--
--   coe_office       - COE office staff (courses + course mapping/offering)
--   coe_office_1     - COE attendance officer (attendance sheet, marking,
--                      correction, attendance reports)
--
-- Permissions introduced:
--   courses.view       - View courses / course mapping / course offering
--   courses.manage     - Create / update / delete courses & mappings
--   attendance.view    - View attendance sheets and reports
--   attendance.mark    - Mark exam attendance (during-exam)
--   attendance.correct - Correct previously marked attendance
--   attendance.report  - Access attendance reports
--
-- Also grants all new permissions to: super_admin, coe
-- =====================================================

-- 1. Insert the roles
INSERT INTO public.roles (name, description, is_system_role, is_active)
VALUES
  ('coe_office', 'COE Office Staff - manages courses, course mapping and course offerings', true, true),
  ('coe_office_1', 'COE Officer 1 - manages exam attendance (sheet, marking, correction, reports)', true, true)
ON CONFLICT (name) DO NOTHING;

-- 2. Insert permissions
INSERT INTO public.permissions (name, description, resource, action, is_active)
VALUES
  ('courses.view',       'View courses, course mapping, and course offerings', 'courses',    'view',    true),
  ('courses.manage',     'Create, update, and delete courses and mappings',    'courses',    'manage',  true),
  ('attendance.view',    'View exam attendance sheets and data',               'attendance', 'view',    true),
  ('attendance.mark',    'Mark exam attendance during the exam',               'attendance', 'mark',    true),
  ('attendance.correct', 'Correct previously marked exam attendance',          'attendance', 'correct', true),
  ('attendance.report',  'Access attendance reports',                          'attendance', 'report',  true)
ON CONFLICT (name) DO NOTHING;

-- 3. Map permissions to coe_office (courses-focused)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'coe_office'
  AND p.name IN ('courses.view', 'courses.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Map permissions to coe_office_1 (attendance-focused)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'coe_office_1'
  AND p.name IN ('attendance.view', 'attendance.mark', 'attendance.correct', 'attendance.report')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Grant ALL new permissions to super_admin and coe (so nothing regresses for them)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('super_admin', 'coe')
  AND p.name IN (
    'courses.view', 'courses.manage',
    'attendance.view', 'attendance.mark', 'attendance.correct', 'attendance.report'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 6. Also grant everything to the admin role (if it exists)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
  AND p.name IN (
    'courses.view', 'courses.manage',
    'attendance.view', 'attendance.mark', 'attendance.correct', 'attendance.report'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
