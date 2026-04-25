-- =====================================================
-- CIA v2 Permissions Seed
-- Created: 2026-04-22
-- Purpose: Grant RBAC permissions for mark-conversion-rules CRUD
--          and CIA round actions (schedule-timetable, fetch-attendance, lock).
-- =====================================================

INSERT INTO public.permissions (name, description) VALUES
	('mark-conversion-rules:read',   'Read mark conversion rules'),
	('mark-conversion-rules:create', 'Create mark conversion rules'),
	('mark-conversion-rules:update', 'Update mark conversion rules'),
	('mark-conversion-rules:delete', 'Delete mark conversion rules'),
	('cia-rounds:schedule-timetable','Schedule CIA round timetable'),
	('cia-rounds:fetch-attendance',  'Trigger MyJKKN attendance fetch'),
	('cia-rounds:lock',              'Lock CIA round marks per course')
ON CONFLICT (name) DO NOTHING;

-- Grant all to super_admin and coe_admin (role names in this project use 'coe' or 'coe_admin')
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name IN ('super_admin', 'coe_admin', 'coe')
  AND p.name IN (
	  'mark-conversion-rules:read','mark-conversion-rules:create',
	  'mark-conversion-rules:update','mark-conversion-rules:delete',
	  'cia-rounds:schedule-timetable','cia-rounds:fetch-attendance','cia-rounds:lock'
  )
ON CONFLICT DO NOTHING;

-- Faculty gets read + fetch-attendance (for their own courses)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'faculty'
  AND p.name IN ('mark-conversion-rules:read', 'cia-rounds:fetch-attendance')
ON CONFLICT DO NOTHING;
