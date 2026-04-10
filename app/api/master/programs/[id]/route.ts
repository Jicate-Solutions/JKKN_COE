import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = getSupabaseServer()

    const { data, error } = await supabase
      .from('programs')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Program GET by ID error:', error)
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Program GET by ID error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch program' },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
      is_active,
    } = body as Record<string, unknown>

    if (!institution_code || !degree_code || !program_code || !program_name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
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
      .update({
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
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('Program update error:', error)

      // Handle duplicate program code error
      if (error.code === '23505') {
        return NextResponse.json({
          error: `Program code "${program_code}" already exists for institution "${institution_code}". Please use a different program code.`
        }, { status: 409 })
      }

      // Handle foreign key constraint errors
      if (error.code === '23503') {
        return NextResponse.json({
          error: 'Foreign key constraint failed. Ensure institution and degree exist.'
        }, { status: 400 })
      }

      // Handle check constraint violation
      if (error.code === '23514') {
        return NextResponse.json({
          error: 'Invalid value. Please check your input.'
        }, { status: 400 })
      }

      return NextResponse.json(
        { error: 'Failed to update program' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Program PUT error:', err)
    return NextResponse.json(
      { error: 'Failed to update program' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }
    return handleDeleteWithDependencyCheck('programs', id, req)
  } catch (e) {
    console.error('Delete error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
