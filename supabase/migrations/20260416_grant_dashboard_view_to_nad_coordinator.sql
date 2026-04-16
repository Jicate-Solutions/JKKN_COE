-- =====================================================
-- GRANT dashboard.view TO nad_coordinator ROLE
-- Date: 2026-04-16
-- Purpose: Fix portal access for nad_coordinator users.
--
-- The nad_coordinator role (created 2026-03-07) was missing
-- the 'dashboard.view' permission, which is the portal-access
-- gate enforced at app/(coe)/layout.tsx:85.
--
-- Result: users assigned only nad_coordinator could authenticate
-- via MyJKKN OAuth and have COE roles, but were rejected by the
-- portal gate with the "Access Restricted" screen.
--
-- This migration is idempotent (ON CONFLICT DO NOTHING).
-- =====================================================

-- Grant dashboard.view to nad_coordinator so users with only this
-- role can enter the COE portal and reach the NAD module.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'nad_coordinator'
  AND p.name = 'dashboard.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;
