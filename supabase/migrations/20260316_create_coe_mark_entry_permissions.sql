-- =====================================================
-- COE MARK ENTRY ROLE PERMISSIONS
-- Date: 2026-03-16
-- Purpose: Add permissions for coe_mark_entry role
--   - practical_attendance.view: Access Practical Attendance page
--   - practical_attendance.edit: Mark practical attendance
--   - practical_mark_entry.view: Access Practical Mark Entry page
--   - practical_mark_entry.edit: Enter practical marks
-- Note: The coe_mark_entry role is created manually via Admin UI
-- =====================================================

-- 1. Insert permissions for Practical Attendance page
INSERT INTO public.permissions (name, description, resource, action, is_active)
VALUES
  ('practical_attendance.view', 'View Practical Attendance page', 'practical_attendance', 'view', true),
  ('practical_attendance.edit', 'Mark practical attendance', 'practical_attendance', 'edit', true),
  ('practical_mark_entry.view', 'View Practical Mark Entry page', 'practical_mark_entry', 'view', true),
  ('practical_mark_entry.edit', 'Enter practical marks', 'practical_mark_entry', 'edit', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Map permissions to coe_mark_entry role (includes dashboard.view for portal access)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'coe_mark_entry'
  AND p.name IN (
    'dashboard.view',
    'practical_attendance.view',
    'practical_attendance.edit',
    'practical_mark_entry.view',
    'practical_mark_entry.edit'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. Also grant these permissions to super_admin and coe roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('super_admin', 'coe', 'admin')
  AND p.name IN (
    'practical_attendance.view',
    'practical_attendance.edit',
    'practical_mark_entry.view',
    'practical_mark_entry.edit'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
