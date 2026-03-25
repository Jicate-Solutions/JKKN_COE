-- Add is_active field to users table
-- This migration adds the is_active field to control user login access

-- Add is_active column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update existing users to be active by default
UPDATE users 
SET is_active = true 
WHERE is_active IS NULL;

-- Make is_active column NOT NULL after setting default values
ALTER TABLE users 
ALTER COLUMN is_active SET NOT NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Add comment to document the field
COMMENT ON COLUMN users.is_active IS 'Controls whether user can login. Only users with is_active=true can authenticate.';

-- Example queries for testing:

-- Check all users and their active status
-- SELECT id, email, full_name, is_active, created_at FROM users ORDER BY created_at DESC;

-- Find inactive users
-- SELECT id, email, full_name, is_active FROM users WHERE is_active = false;

-- Activate a specific user
-- UPDATE users SET is_active = true WHERE email = 'user@example.com';

-- Deactivate a specific user
-- UPDATE users SET is_active = false WHERE email = 'user@example.com';

-- Count active vs inactive users
-- SELECT 
--   COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
--   COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_users,
--   COUNT(*) as total_users
-- FROM users;
