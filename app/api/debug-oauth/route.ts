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

    // Test basic connection
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (testError) {
      return NextResponse.json({
        success: false,
        error: 'Database connection failed',
        details: testError
      });
    }

    // Test RLS policies
    const { data: policies, error: policyError } = await supabase
      .rpc('get_policies', { table_name: 'users' })
      .catch(() => ({ data: null, error: { message: 'get_policies function not available' } }));

    // Test user table structure
    const { data: tableInfo, error: tableError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'users')
      .eq('table_schema', 'public');

    return NextResponse.json({
      success: true,
      message: 'Debug information retrieved',
      data: {
        connection: 'OK',
        userCount: testData?.[0]?.count || 0,
        policies: policies || 'Not available',
        tableStructure: tableInfo || 'Not available',
        supabaseUrl,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        environment: process.env.NODE_ENV
      }
    });

  } catch (error) {
    console.error('Debug OAuth error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
