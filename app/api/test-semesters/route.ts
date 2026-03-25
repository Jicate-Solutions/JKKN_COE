import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = getSupabaseServer()
    
    // Test if table exists by trying to select from it
    const { data, error } = await supabase
      .from('semesters')
      .select('count')
      .limit(1)

    if (error) {
      console.error('Semesters table test error:', error)
      return NextResponse.json({ 
        error: 'Semesters table does not exist or has issues',
        details: error 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Semesters table exists and is accessible',
      data 
    })
  } catch (error) {
    console.error('Test semesters API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error 
    }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = getSupabaseServer()
    
    // Test creating a simple semester record
    const testData = {
      institution_code: 'TEST',
      degree_code: 'TEST',
      semester_name: 'Test Semester',
      display_name: 'Test',
      student_group: 'TEST',
      display_order: 1,
      initial_semester: false,
      terminal_semester: false,
      is_active: true
    }

    const { data, error } = await supabase
      .from('semesters')
      .insert([testData])
      .select()

    if (error) {
      console.error('Test semester creation error:', error)
      return NextResponse.json({ 
        error: 'Failed to create test semester',
        details: error 
      }, { status: 500 })
    }

    // Clean up the test record
    if (data && data[0]) {
      await supabase
        .from('semesters')
        .delete()
        .eq('id', data[0].id)
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Test semester creation successful',
      testData 
    })
  } catch (error) {
    console.error('Test semester creation API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error 
    }, { status: 500 })
  }
}
