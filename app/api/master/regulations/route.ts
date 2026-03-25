import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const regulation_year = searchParams.get('regulation_year')

    const supabase = getSupabaseServer()
    let query = supabase
      .from('regulations')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, 9999) // Increase limit from default 1000 to 10000 rows

    // Apply filters
    if (search) {
      query = query.or(`regulation_code.ilike.%${search}%,regulation_year::text.ilike.%${search}%`)
    }
    if (status !== null) {
      query = query.eq('status', status === 'true')
    }
    if (regulation_year) {
      query = query.eq('regulation_year', parseInt(regulation_year))
    }

    const { data, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      
      // Check if regulations table doesn't exist
      if (error.message.includes('relation "regulations" does not exist')) {
        return NextResponse.json({ 
          error: 'Regulations table not found',
          message: 'The regulations table needs to be created in your Supabase database',
          instructions: {
            step1: 'Go to your Supabase dashboard',
            step2: 'Navigate to SQL Editor',
            step3: 'Run the provided SQL script to create the regulations table',
            sql: `
-- Create regulations table
CREATE TABLE IF NOT EXISTS regulations (
  id BIGSERIAL PRIMARY KEY,
  regulation_year INT NOT NULL,
  regulation_code VARCHAR(50) NOT NULL UNIQUE,
  status BOOLEAN NOT NULL DEFAULT true,
  
  minimum_internal NUMERIC(5,2) DEFAULT 0,
  minimum_external NUMERIC(5,2) DEFAULT 0,
  minimum_attendance NUMERIC(5,2) NOT NULL,
  minimum_total NUMERIC(5,2) DEFAULT 0,
  
  maximum_internal NUMERIC(5,2) DEFAULT 0,
  maximum_external NUMERIC(5,2) DEFAULT 0,
  maximum_total NUMERIC(5,2) DEFAULT 0,
  maximum_qp_marks NUMERIC(5,2) DEFAULT 0,
  
  condonation_range_start NUMERIC(5,2) DEFAULT 0,
  condonation_range_end NUMERIC(5,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_regulations_year ON regulations(regulation_year);
CREATE INDEX IF NOT EXISTS idx_regulations_code ON regulations(regulation_code);
CREATE INDEX IF NOT EXISTS idx_regulations_status ON regulations(status);
CREATE INDEX IF NOT EXISTS idx_regulations_created_at ON regulations(created_at);
            `
          }
        }, { status: 404 })
      }
      
      throw error
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({ 
      error: 'Failed to fetch regulations', 
      details: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    const { 
      regulation_year, 
      regulation_code, 
      status = true,
      minimum_internal = 0,
      minimum_external = 0,
      minimum_attendance,
      minimum_total = 0,
      maximum_internal = 0,
      maximum_external = 0,
      maximum_total = 0,
      maximum_qp_marks = 0,
      condonation_range_start = 0,
      condonation_range_end = 0,
      institutions_id,
      institution_code
    } = body as Record<string, unknown>

    if (!regulation_year || !regulation_code || minimum_attendance === undefined || !institution_code) {
      return NextResponse.json({ 
        error: 'Missing required fields: regulation_year, regulation_code, minimum_attendance, and institution_code are required' 
      }, { status: 400 })
    }

    const supabase2 = getSupabaseServer()
    const { data, error } = await supabase2.from('regulations').insert({
      regulation_year: Number(regulation_year),
      regulation_code: String(regulation_code),
      status: Boolean(status),
      minimum_internal: Number(minimum_internal),
      minimum_external: Number(minimum_external),
      minimum_attendance: Number(minimum_attendance),
      minimum_total: Number(minimum_total),
      maximum_internal: Number(maximum_internal),
      maximum_external: Number(maximum_external),
      maximum_total: Number(maximum_total),
      maximum_qp_marks: Number(maximum_qp_marks),
      condonation_range_start: Number(condonation_range_start),
      condonation_range_end: Number(condonation_range_end),
      institutions_id: institutions_id ? String(institutions_id) : null,
      institution_code: String(institution_code),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('*').single()

    if (error) {
      console.error('Supabase error:', error)
      
      // Handle specific database errors
      if (error.message.includes('relation "regulations" does not exist')) {
        return NextResponse.json({ 
          error: 'Regulations table not found',
          message: 'The regulations table needs to be created in your Supabase database',
          details: error.message
        }, { status: 404 })
      }
      
      if (error.message.includes('duplicate key value')) {
        return NextResponse.json({ 
          error: 'Duplicate regulation code',
          message: 'A regulation with this code already exists',
          details: error.message
        }, { status: 409 })
      }
      
      if (error.message.includes('violates not-null constraint')) {
        return NextResponse.json({ 
          error: 'Missing required fields',
          message: 'Some required fields are missing or invalid',
          details: error.message
        }, { status: 400 })
      }
      
      throw error
    }
    
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({ 
      error: 'Failed to create regulation', 
      details: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    
    const { 
      id,
      regulation_year, 
      regulation_code, 
      status = true,
      minimum_internal = 0,
      minimum_external = 0,
      minimum_attendance,
      minimum_total = 0,
      maximum_internal = 0,
      maximum_external = 0,
      maximum_total = 0,
      maximum_qp_marks = 0,
      condonation_range_start = 0,
      condonation_range_end = 0,
      institutions_id,
      institution_code
    } = body as Record<string, unknown>

    if (!id || !regulation_year || !regulation_code || minimum_attendance === undefined || !institution_code) {
      return NextResponse.json({ 
        error: 'Missing required fields: id, regulation_year, regulation_code, minimum_attendance, and institution_code are required' 
      }, { status: 400 })
    }

    const supabase2 = getSupabaseServer()
    const { data, error } = await supabase2.from('regulations').update({
      regulation_year: Number(regulation_year),
      regulation_code: String(regulation_code),
      status: Boolean(status),
      minimum_internal: Number(minimum_internal),
      minimum_external: Number(minimum_external),
      minimum_attendance: Number(minimum_attendance),
      minimum_total: Number(minimum_total),
      maximum_internal: Number(maximum_internal),
      maximum_external: Number(maximum_external),
      maximum_total: Number(maximum_total),
      maximum_qp_marks: Number(maximum_qp_marks),
      condonation_range_start: Number(condonation_range_start),
      condonation_range_end: Number(condonation_range_end),
      institutions_id: institutions_id ? String(institutions_id) : null,
      institution_code: String(institution_code),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select('*').single()

    if (error) {
      console.error('Supabase error:', error)
      
      // Handle specific database errors
      if (error.message.includes('duplicate key value')) {
        return NextResponse.json({ 
          error: 'Duplicate regulation code',
          message: 'A regulation with this code already exists',
          details: error.message
        }, { status: 409 })
      }
      
      if (error.message.includes('violates not-null constraint')) {
        return NextResponse.json({ 
          error: 'Missing required fields',
          message: 'Some required fields are missing or invalid',
          details: error.message
        }, { status: 400 })
      }
      
      throw error
    }
    
    return NextResponse.json(data, { status: 200 })
  } catch (err) {
    console.error('API Error:', err)
    return NextResponse.json({ 
      error: 'Failed to update regulation', 
      details: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}
