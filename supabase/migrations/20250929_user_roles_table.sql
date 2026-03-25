-- Create user_roles table for many-to-many relationship between users and roles
-- This implements proper normalized RBAC

-- Create user_roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role_id UUID NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_by UUID,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Primary key
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),

  -- Unique constraint to prevent duplicate role assignments
  CONSTRAINT user_roles_unique UNIQUE (user_id, role_id),

  -- Foreign keys
  CONSTRAINT user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_roles_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT user_roles_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_is_active ON public.user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_user_roles_expires_at ON public.user_roles(expires_at);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Migrate existing role assignments from users.role field to user_roles table
-- This preserves existing role assignments
DO $$
DECLARE
  user_record RECORD;
  role_record RECORD;
BEGIN
  FOR user_record IN SELECT id, role FROM users WHERE role IS NOT NULL
  LOOP
    -- Find the role by name
    SELECT id INTO role_record FROM roles WHERE name = user_record.role;

    IF role_record.id IS NOT NULL THEN
      -- Insert into user_roles if not already exists
      INSERT INTO user_roles (user_id, role_id)
      VALUES (user_record.id, role_record.id)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Create a view for easier querying of user permissions
CREATE OR REPLACE VIEW user_effective_permissions AS
SELECT
  u.id as user_id,
  u.email,
  u.is_super_admin,
  CASE
    WHEN u.is_super_admin THEN
      -- Super admins use JSONB permissions
      u.permissions
    ELSE
      -- Regular users compute from RBAC
      jsonb_object_agg(p.name, true)
  END as effective_permissions
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
LEFT JOIN role_permissions rp ON ur.role_id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id AND p.is_active = true
GROUP BY u.id, u.email, u.is_super_admin, u.permissions;

-- Function to get user's effective permissions
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_is_super_admin BOOLEAN;
  v_permissions JSONB;
BEGIN
  -- Check if user is super admin
  SELECT is_super_admin, permissions
  INTO v_is_super_admin, v_permissions
  FROM users
  WHERE id = p_user_id;

  IF v_is_super_admin THEN
    -- Return JSONB permissions for super admin
    RETURN v_permissions;
  ELSE
    -- Compute permissions from RBAC
    SELECT jsonb_object_agg(p.name, true)
    INTO v_permissions
    FROM user_roles ur
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      AND p.is_active = true;

    RETURN COALESCE(v_permissions, '{}'::jsonb);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to assign role to user
CREATE OR REPLACE FUNCTION assign_role_to_user(
  p_user_id UUID,
  p_role_name VARCHAR,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_role_id UUID;
BEGIN
  -- Get role ID
  SELECT id INTO v_role_id FROM roles WHERE name = p_role_name;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % not found', p_role_name;
  END IF;

  -- Insert or update user_roles
  INSERT INTO user_roles (user_id, role_id, assigned_by)
  VALUES (p_user_id, v_role_id, p_assigned_by)
  ON CONFLICT (user_id, role_id)
  DO UPDATE SET
    is_active = true,
    assigned_at = NOW(),
    assigned_by = EXCLUDED.assigned_by,
    updated_at = NOW();

  -- Update user's cached permissions
  UPDATE users
  SET
    permissions = get_user_permissions(p_user_id),
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to remove role from user
CREATE OR REPLACE FUNCTION remove_role_from_user(
  p_user_id UUID,
  p_role_name VARCHAR
)
RETURNS BOOLEAN AS $$
DECLARE
  v_role_id UUID;
BEGIN
  -- Get role ID
  SELECT id INTO v_role_id FROM roles WHERE name = p_role_name;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % not found', p_role_name;
  END IF;

  -- Soft delete from user_roles
  UPDATE user_roles
  SET
    is_active = false,
    updated_at = NOW()
  WHERE user_id = p_user_id AND role_id = v_role_id;

  -- Update user's cached permissions
  UPDATE users
  SET
    permissions = get_user_permissions(p_user_id),
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Sample role assignments for testing
-- Assign admin role to the super admin user
DO $$
DECLARE
  v_admin_user_id UUID;
  v_admin_role_id UUID;
BEGIN
  -- Get admin user and role
  SELECT id INTO v_admin_user_id FROM users WHERE email = 'viswanathan.s@jkkn.ac.in';
  SELECT id INTO v_admin_role_id FROM roles WHERE name = 'admin';

  IF v_admin_user_id IS NOT NULL AND v_admin_role_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id)
    VALUES (v_admin_user_id, v_admin_role_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;
END $$;