-- Create users table for JKKN COE application
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20),
  role VARCHAR(50) DEFAULT 'user',
  institution_id VARCHAR(255),
  is_super_admin BOOLEAN DEFAULT FALSE,
  permissions JSONB DEFAULT '{}',
  profile_completed BOOLEAN DEFAULT FALSE,
  avatar_url TEXT,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for users to read their own data
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Policy for users to update their own data
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Policy for users to insert their own data
CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Policy for service role to manage all users (for admin operations)
CREATE POLICY "Service role can manage all users" ON users
  FOR ALL USING (auth.role() = 'service_role');

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create index on role for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Create index on institution_id for institution-based queries
CREATE INDEX IF NOT EXISTS idx_users_institution_id ON users(institution_id);

-- Insert a sample admin user (you can remove this after testing)
-- Note: This will only work if you have the service role key
-- INSERT INTO users (id, email, full_name, role, is_super_admin, permissions, profile_completed)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   'admin@jkkn.ac.in',
--   'System Administrator',
--   'admin',
--   true,
--   '{"users.view": true, "users.create": true, "users.edit": true, "users.delete": true, "courses.view": true, "courses.create": true, "courses.edit": true, "courses.delete": true, "batches.view": true, "batches.create": true, "batches.edit": true, "batches.delete": true, "regulations.view": true, "regulations.create": true, "regulations.edit": true, "regulations.delete": true}',
--   true
-- );
