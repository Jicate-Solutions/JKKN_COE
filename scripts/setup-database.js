/**
 * Database Setup Script for JKKN COE
 * 
 * This script helps set up the users table in Supabase.
 * Run this with: node scripts/setup-database.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function setupDatabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    console.error('Please check your .env.local file');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🔧 Setting up database...');
  console.log('Supabase URL:', supabaseUrl);
  console.log('Using Service Key:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Test connection
    console.log('📡 Testing connection...');
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      if (error.code === 'PGRST116' || error.message.includes('relation "users" does not exist')) {
        console.log('📋 Users table does not exist, creating it...');
        
        // Note: You'll need to run the SQL manually in Supabase SQL Editor
        console.log(`
Please run the following SQL in your Supabase SQL Editor:

-- Create users table
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

-- Policy for service role to manage all users
CREATE POLICY "Service role can manage all users" ON users
  FOR ALL USING (auth.role() = 'service_role');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_institution_id ON users(institution_id);
        `);

        console.log('✅ Please run the SQL above in your Supabase SQL Editor');
        console.log('🔗 Go to: https://supabase.com/dashboard/project/ndnulujelcnnnhydfyum/sql');
      } else {
        console.error('❌ Database error:', error);
      }
    } else {
      console.log('✅ Users table already exists');
      console.log('📊 User count:', data?.[0]?.count || 0);
    }

  } catch (error) {
    console.error('❌ Setup error:', error);
  }
}

setupDatabase();
