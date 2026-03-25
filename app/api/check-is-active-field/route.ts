import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    // Check if is_active field exists in users table
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_name', 'users')
      .eq('column_name', 'is_active');

    if (columnsError) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to check database schema',
        details: columnsError.message 
      });
    }

    const hasIsActiveField = columns && columns.length > 0;
    
    if (!hasIsActiveField) {
      return NextResponse.json({ 
        success: false, 
        error: 'is_active field does not exist in users table',
        message: 'Please run the database migration script to add the is_active field',
        migrationNeeded: true
      });
    }

    // Check current users and their is_active status
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, full_name, is_active')
      .limit(10);

    if (usersError) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch users',
        details: usersError.message 
      });
    }

    // Count active vs inactive users
    const activeUsers = users?.filter(user => user.is_active === true) || [];
    const inactiveUsers = users?.filter(user => user.is_active === false) || [];
    const usersWithoutField = users?.filter(user => !('is_active' in user)) || [];

    return NextResponse.json({
      success: true,
      hasIsActiveField: true,
      fieldInfo: columns[0],
      userStats: {
        total: users?.length || 0,
        active: activeUsers.length,
        inactive: inactiveUsers.length,
        withoutField: usersWithoutField.length
      },
      sampleUsers: users?.slice(0, 5),
      message: 'is_active field exists and is working properly'
    });

  } catch (error) {
    console.error('Error checking is_active field:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function POST() {
  try {
    // Try to add the is_active field if it doesn't exist
    const { data, error } = await supabase.rpc('add_is_active_field');

    if (error) {
      // If RPC doesn't exist, try direct SQL
      const { data: sqlData, error: sqlError } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      if (sqlError) {
        return NextResponse.json({ 
          success: false, 
          error: 'Cannot execute database operations',
          details: sqlError.message,
          message: 'Please run the migration script manually in your Supabase dashboard'
        });
      }

      return NextResponse.json({ 
        success: false, 
        error: 'Migration function not available',
        message: 'Please run the SQL migration script in your Supabase dashboard:',
        sqlScript: `
          ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
          UPDATE users SET is_active = true WHERE is_active IS NULL;
          ALTER TABLE users ALTER COLUMN is_active SET NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
        `
      });
    }

    return NextResponse.json({
      success: true,
      message: 'is_active field added successfully',
      data
    });

  } catch (error) {
    console.error('Error adding is_active field:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to add is_active field',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
