import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getSupabaseServer()

    // First, check if the table exists
    const { data: testData, error: testError } = await supabase
      .from('semesters')
      .select('*')
      .limit(1)

    if (testError) {
      if (testError.message.includes('relation "public.semesters" does not exist')) {
        return NextResponse.json({
          exists: false,
          error: 'Table does not exist',
          message: 'The semesters table needs to be created in your Supabase database.',
          instructions: [
            '1. Go to https://supabase.com/dashboard',
            '2. Select your project',
            '3. Go to SQL Editor',
            '4. Copy and paste the SQL from: supabase/migrations/20250101_create_semesters_table.sql',
            '5. Click Run'
          ]
        }, { status: 404 })
      }

      return NextResponse.json({
        exists: false,
        error: testError.message,
        details: testError
      }, { status: 500 })
    }

    return NextResponse.json({
      exists: true,
      message: 'Semesters table exists and is accessible',
      recordCount: testData?.length || 0,
      sample: testData?.[0] || null
    })
  } catch (error: any) {
    return NextResponse.json({
      exists: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}