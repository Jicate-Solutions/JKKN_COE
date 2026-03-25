-- Drop existing table and policies if they exist
DROP TABLE IF EXISTS users CASCADE;

-- Create users table for JKKN COE application
-- This table stores additional user profile data and links to auth.users by email
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  username VARCHAR(255) UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  website TEXT,
  location TEXT,
  date_of_birth DATE,
  phone VARCHAR(20),
  phone_number VARCHAR(20), -- alias for phone
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT TRUE,
  role VARCHAR(50) DEFAULT 'user',
  institution_id VARCHAR(255),
  is_super_admin BOOLEAN DEFAULT FALSE,
  permissions JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  profile_completed BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read their own data by email
CREATE POLICY "Users can read own data" ON users
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' = email
  );

-- Policy for authenticated users to update their own data by email
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = email
  );

-- Policy for service role to manage all users (for admin operations)
CREATE POLICY "Service role can manage all users" ON users
  FOR ALL
  USING (
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Policy for admins to view all users
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email'
      AND (role = 'admin' OR is_super_admin = true)
    )
  );

-- Policy for admins to manage users
CREATE POLICY "Admins can manage users" ON users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE email = auth.jwt() ->> 'email'
      AND (role = 'admin' OR is_super_admin = true)
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_institution_id ON users(institution_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to set username same as email if not provided
CREATE OR REPLACE FUNCTION set_username_from_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.username IS NULL OR NEW.username = '' THEN
    NEW.username = NEW.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to set username from email
CREATE TRIGGER set_users_username
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_username_from_email();

-- Sample data (commented out - uncomment and modify as needed)
-- INSERT INTO users (email, full_name, role, is_super_admin, is_active, is_verified, institution_id)
-- VALUES
--   ('admin@jkkn.ac.in', 'System Administrator', 'admin', true, true, true, '1'),
--   ('viswanathan.s@jkkn.ac.in', 'Viswanathan S', 'user', false, true, true, '1');