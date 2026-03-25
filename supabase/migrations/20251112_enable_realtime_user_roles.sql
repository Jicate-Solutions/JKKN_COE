-- Enable Realtime for user_roles table
-- This allows real-time subscription to user role changes

-- Enable realtime for user_roles table
ALTER PUBLICATION supabase_realtime ADD TABLE user_roles;

-- Add comment for documentation
COMMENT ON TABLE user_roles IS 'User role assignments with real-time sync enabled';
