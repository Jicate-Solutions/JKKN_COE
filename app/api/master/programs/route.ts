import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const is_active = searchParams.get('is_active')
    const department_code = searchParams.get('department_code')
    const institution_code = searchParams.get('institution_code')
    const program_code = searchParams.get('program_code')

    const supabase = getSupabaseServer()
    let query = supabase
      .from('programs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, 9999) // Increase limit from default 1000 to 10000 rows

    if (search) {
      query = query.or(`program_code.ilike.%${search}%,program_name.ilike.%${search}%,degree_code.ilike.%${search}%,institution_code.ilike.%${search}%`)
    }
    if (is_active !== null) {
      query = query.eq('is_active', is_active === 'true')
    }
    if (department_code) {
      query = query.eq('offering_department_code', department_code)
    }
    if (institution_code) {
      query = query.eq('institution_code', institution_code)
    }
    if (program_code) {
      query = query.eq('program_code', program_code)
    }

    const { data, error} = await query
    if (error) {
      console.error('Program GET error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })

      // Fallback table creation hint
      if (error.message.includes('relation "program" does not exist') || error.message.includes('relation "public.program" does not exist')) {
        return NextResponse.json({
          error: 'Program table not found',
          message: 'The program table needs to be created in your Supabase database',
          instructions: {
            sql: `
create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  institution_code varchar(50) not null,
  degree_code varchar(50) not null,
  offering_department_code varchar(50),
  program_code varchar(50) not null,
  program_name varchar(200) not null,
  display_name varchar(200),
  program_duration_yrs integer not null default 3,
  program_order integer not null,
  pattern_type varchar(20) not null default 'Semester',
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_program_code unique (institution_code, program_code)
);
            `
          }
        }, { status: 404 })
      }

      // Specific error for column not found
      if (error.code === '42703') {
        return NextResponse.json({
          error: 'Database schema mismatch',
          message: error.message,
          hint: 'The programs table may be missing required columns. Check that the table schema matches the API expectations.'
        }, { status: 500 })
      }

      return NextResponse.json({
        error: 'Failed to fetch programs',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (err) {
    console.error('Program GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      institution_code,
      degree_code,
      program_type,
      offering_department_code,
      program_code,
      program_name,
      display_name,
      program_duration_yrs,
      program_order,
      pattern_type,
      is_active = true,
    } = body as Record<string, unknown>

    if (!institution_code || !degree_code || !program_code || !program_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getSupabaseServer()

    // Validate and fetch institution_id from institution_code
    const { data: institutionData, error: institutionError } = await supabase
      .from('institutions')
      .select('id')
      .eq('institution_code', String(institution_code))
      .single()

    if (institutionError || !institutionData) {
      return NextResponse.json({
        error: `Institution with code "${institution_code}" not found. Please ensure the institution exists.`
      }, { status: 400 })
    }

    // Validate and fetch degree_id from degree_code
    const { data: degreeData, error: degreeError } = await supabase
      .from('degrees')
      .select('id')
      .eq('degree_code', String(degree_code))
      .single()

    if (degreeError || !degreeData) {
      return NextResponse.json({
        error: `Degree with code "${degree_code}" not found. Please ensure the degree exists.`
      }, { status: 400 })
    }

    // Validate and fetch offering_department_id from offering_department_code (optional)
    let offeringDepartmentId = null
    if (offering_department_code) {
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('id')
        .eq('department_code', String(offering_department_code))
        .single()

      if (deptError || !deptData) {
        return NextResponse.json({
          error: `Department with code "${offering_department_code}" not found. Please ensure the department exists.`
        }, { status: 400 })
      }
      offeringDepartmentId = deptData.id
    }

    const { data, error } = await supabase
      .from('programs')
      .insert({
        institutions_id: institutionData.id,
        institution_code: String(institution_code),
        degree_id: degreeData.id,
        degree_code: String(degree_code),
        program_type: program_type ? String(program_type) : null,
        offering_department_id: offeringDepartmentId,
        offering_department_code: offering_department_code ? String(offering_department_code) : null,
        program_code: String(program_code),
        program_name: String(program_name),
        display_name: display_name ? String(display_name) : null,
        program_duration_yrs: program_duration_yrs ? Number(program_duration_yrs) : 3,
        pattern_type: pattern_type ? String(pattern_type) : 'Semester',
        program_order: program_order ? Number(program_order) : 1,
        is_active: Boolean(is_active),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (error) {
      console.error('Program insert error:', error)

      // Handle duplicate program code error
      if (error.code === '23505') {
        return NextResponse.json({
          error: `Program code "${program_code}" already exists for institution "${institution_code}". Please use a different program code or update the existing program.`
        }, { status: 409 })
      }

      // Handle foreign key constraint errors
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Foreign key constraint failed. Ensure institution and degree exist.'
        }, { status: 400 })
      }

      throw error
    }
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Program POST error:', err)
    return NextResponse.json({ error: 'Failed to create program' }, { status: 500 })
  }
}


