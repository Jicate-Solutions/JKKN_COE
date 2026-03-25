-- Fix permissions for the admin user
-- This script ensures all RBAC tables are properly populated and the admin user has correct permissions

-- Step 1: Ensure roles exist
INSERT INTO public.roles (name, description, is_system_role)
VALUES
  ('admin', 'Full access', true),
  ('staff', 'Can view/create/edit operational data', false),
  ('viewer', 'Read-only access', false),
  ('user', 'Basic user role', false)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    is_system_role = EXCLUDED.is_system_role;

-- Step 2: Ensure all permissions exist
INSERT INTO public.permissions (name, description, resource, action)
VALUES
  -- User permissions
  ('users.view', 'View users', 'users', 'view'),
  ('users.create', 'Create users', 'users', 'create'),
  ('users.edit', 'Edit users', 'users', 'edit'),
  ('users.delete', 'Delete users', 'users', 'delete'),

  -- Institution permissions
  ('institutions.view', 'View institutions', 'institutions', 'view'),
  ('institutions.create', 'Create institutions', 'institutions', 'create'),
  ('institutions.edit', 'Edit institutions', 'institutions', 'edit'),
  ('institutions.delete', 'Delete institutions', 'institutions', 'delete'),

  -- Batch permissions
  ('batches.view', 'View batches', 'batches', 'view'),
  ('batches.create', 'Create batches', 'batches', 'create'),
  ('batches.edit', 'Edit batches', 'batches', 'edit'),
  ('batches.delete', 'Delete batches', 'batches', 'delete'),

  -- Program permissions
  ('programs.view', 'View programs', 'programs', 'view'),
  ('programs.create', 'Create programs', 'programs', 'create'),
  ('programs.edit', 'Edit programs', 'programs', 'edit'),
  ('programs.delete', 'Delete programs', 'programs', 'delete'),

  -- Section permissions
  ('sections.view', 'View sections', 'sections', 'view'),
  ('sections.create', 'Create sections', 'sections', 'create'),
  ('sections.edit', 'Edit sections', 'sections', 'edit'),
  ('sections.delete', 'Delete sections', 'sections', 'delete')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action;

-- Step 3: Map admin role to ALL permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Step 4: Map staff role to appropriate permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON (
  (p.resource IN ('institutions', 'batches', 'programs', 'sections') AND p.action IN ('view', 'create', 'edit'))
  OR (p.resource = 'users' AND p.action = 'view')
)
WHERE r.name = 'staff'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Step 5: Map viewer role to view-only permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.action = 'view'
WHERE r.name = 'viewer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Step 6: Update the specific user to admin with super admin privileges
UPDATE public.users
SET
  role = 'admin',
  is_super_admin = true,
  is_active = true,
  permissions = jsonb_build_object(
    'batches.view', true,
    'batches.create', true,
    'batches.edit', true,
    'batches.delete', true,
    'users.view', true,
    'institutions.view', true,
    'programs.view', true,
    'sections.view', true
  )
WHERE email = 'viswanathan.s@jkkn.ac.in';

-- Step 7: If user_roles table exists, ensure the admin user has the admin role
DO $$
DECLARE
  user_id_val UUID;
  role_id_val UUID;
BEGIN
  -- Get the user ID
  SELECT id INTO user_id_val FROM public.users WHERE email = 'viswanathan.s@jkkn.ac.in';

  -- Get the admin role ID
  SELECT id INTO role_id_val FROM public.roles WHERE name = 'admin';

  -- Only proceed if both IDs exist
  IF user_id_val IS NOT NULL AND role_id_val IS NOT NULL THEN
    -- Check if user_roles table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
      -- Insert or update the user_roles mapping
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (user_id_val, role_id_val)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;
  END IF;
END $$;

-- Step 8: Verify the setup
SELECT
  u.email,
  u.role,
  u.is_super_admin,
  u.is_active,
  u.permissions,
  COUNT(rp.permission_id) as permission_count
FROM public.users u
LEFT JOIN public.roles r ON r.name = u.role
LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
WHERE u.email = 'viswanathan.s@jkkn.ac.in'
GROUP BY u.email, u.role, u.is_super_admin, u.is_active, u.permissions;