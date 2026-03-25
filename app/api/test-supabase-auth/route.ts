import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Test connection by checking if we can access the database
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) {
      // If users table doesn't exist, create it
      if (error.code === 'PGRST116' || error.message.includes('relation "users" does not exist')) {
        console.log('Users table does not exist, creating it...');
        
        // Create users table
        const createTableQuery = `
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
        `;

        const { error: createError } = await supabase.rpc('exec_sql', {
          sql: createTableQuery
        });

        if (createError) {
          console.error('Error creating users table:', createError);
          return NextResponse.json(
            { 
              error: 'Failed to create users table',
              details: createError.message 
            },
            { status: 500 }
          );
        }

        // Create RLS policies
        const createPoliciesQuery = `
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
        `;

        const { error: policyError } = await supabase.rpc('exec_sql', {
          sql: createPoliciesQuery
        });

        if (policyError) {
          console.warn('Warning: Could not create RLS policies:', policyError.message);
        }

        return NextResponse.json({
          success: true,
          message: 'Users table created successfully',
          supabaseUrl,
          hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
        });
      }

      return NextResponse.json(
        { 
          error: 'Database connection failed',
          details: error.message 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase connection successful',
      supabaseUrl,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      userCount: data?.[0]?.count || 0
    });

  } catch (error) {
    console.error('Test Supabase auth error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
