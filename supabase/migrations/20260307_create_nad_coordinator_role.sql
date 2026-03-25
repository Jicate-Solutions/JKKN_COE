-- =====================================================
-- CREATE NAD COORDINATOR ROLE
-- Date: 2026-03-07
-- Purpose: Add nad_coordinator role with NAD-specific permissions
--   - nad.view: View NAD tab and compliance data
--   - nad.export: Download NAD CSV exports (official + pivot)
-- Also grants nad.view and nad.export to existing roles:
--   super_admin, coe, deputy_coe
-- =====================================================

-- 1. Insert the nad_coordinator role
INSERT INTO public.roles (name, description, is_system_role, is_active)
VALUES ('nad_coordinator', 'NAD Coordinator - manages NAD/ABC compliance uploads and exports', true, true)
ON CONFLICT (name) DO NOTHING;

-- 2. Insert NAD-specific permissions
INSERT INTO public.permissions (name, description, resource, action, is_active)
VALUES
  ('nad.view', 'View NAD compliance tab and data', 'nad', 'view', true),
  ('nad.export', 'Export NAD CSV files (official + pivot)', 'nad', 'export', true)
ON CONFLICT (name) DO NOTHING;

-- 3. Map permissions to nad_coordinator role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'nad_coordinator'
  AND p.name IN ('nad.view', 'nad.export')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. Grant NAD permissions to existing roles: super_admin, coe, deputy_coe
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('super_admin', 'coe', 'deputy_coe')
  AND p.name IN ('nad.view', 'nad.export')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 5. Also grant the admin role (if it exists) full NAD access
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
  AND p.name IN ('nad.view', 'nad.export')
ON CONFLICT (role_id, permission_id) DO NOTHING;
