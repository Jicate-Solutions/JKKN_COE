import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: list departments
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServer()
    const { searchParams } = new URL(request.url)
    const institution_code = searchParams.get('institution_code')

    let query = supabase
      .from('departments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, 9999) // Increase limit from default 1000 to 10000 rows

    if (institution_code) {
      query = query.eq('institution_code', institution_code)
    }

    console.log('🔍 Departments API - Query params:', { institution_code })

    const { data, error } = await query

    if (error) {
      console.error('❌ Departments table error:', error)
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      return NextResponse.json({
        error: 'Failed to fetch departments',
        details: error.message,
        hint: error.hint
      }, { status: 500 })
    }

    console.log('✅ Departments fetched successfully:', data?.length, 'items')

    const normalized = (data || []).map((row: any) => ({
      ...row,
      is_active: row.status ?? row.is_active ?? true,
    }))
    return NextResponse.json(normalized)
  } catch (e) {
    console.error('Departments API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: create department
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    // Auto-map institution_code to institutions_id
    let institution_code: string | undefined = body.institution_code
    let institutions_id: string | undefined = body.institutions_id

    // If institution_code is provided, fetch institutions_id
    if (institution_code) {
      const { data: inst, error: instError } = await supabase
        .from('institutions')
        .select('id, institution_code')
        .eq('institution_code', institution_code)
        .maybeSingle()

      if (instError || !inst) {
        return NextResponse.json({
          error: `Invalid institution_code: ${institution_code}. Institution not found.`
        }, { status: 400 })
      }

      // Auto-map the institutions_id from the fetched institution
      institutions_id = inst.id
      console.log(`✅ Auto-mapped institution_code "${institution_code}" to institutions_id "${institutions_id}"`)
    }
    // If institutions_id is provided but no institution_code, fetch the code
    else if (institutions_id && !institution_code) {
      const { data: inst } = await supabase
        .from('institutions')
        .select('institution_code')
        .eq('id', institutions_id)
        .maybeSingle()
      if (inst?.institution_code) {
        institution_code = inst.institution_code
      }
    }

    // Validate required fields
    if (!institution_code || !institutions_id) {
      return NextResponse.json({
        error: 'institution_code is required and must be valid'
      }, { status: 400 })
    }

    const insertPayload: any = {
      institution_code: institution_code,
      institutions_id: institutions_id,
      department_code: body.department_code,
      department_name: body.department_name,
      display_name: body.display_name ?? null,
      description: body.description ?? null,
      stream: body.stream ?? null,
      department_order: body.department_order ?? null,
      status: body.is_active ?? true,
    }

    const { data, error } = await supabase
      .from('departments')
      .insert([insertPayload])
      .select()
      .single()

    if (error) {
      console.error('Error creating department:', error)
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })

      // Provide specific error messages
      if (error.code === '23505') {
        return NextResponse.json({
          error: 'Department with this code already exists for this institution'
        }, { status: 400 })
      }

      if (error.message.includes('foreign key') || error.code === '23503') {
        return NextResponse.json({
          error: 'Invalid institution_code. Please check the Institution Codes reference sheet.'
        }, { status: 400 })
      }

      return NextResponse.json({
        error: error.message || 'Failed to create department',
        details: error.details
      }, { status: 500 })
    }

    const normalized = data ? { ...data, is_active: (data as any).status ?? (data as any).is_active ?? true } : data
    return NextResponse.json(normalized, { status: 201 })
  } catch (e) {
    console.error('Department creation error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT: update department
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    // Auto-map institution_code to institutions_id (same logic as POST)
    let institution_code: string | undefined = body.institution_code
    let institutions_id: string | undefined = body.institutions_id

    // If institution_code is provided, fetch institutions_id
    if (institution_code) {
      const { data: inst, error: instError } = await supabase
        .from('institutions')
        .select('id, institution_code')
        .eq('institution_code', institution_code)
        .maybeSingle()

      if (instError || !inst) {
        return NextResponse.json({
          error: `Invalid institution_code: ${institution_code}. Institution not found.`
        }, { status: 400 })
      }

      // Auto-map the institutions_id from the fetched institution
      institutions_id = inst.id
      console.log(`✅ Auto-mapped institution_code "${institution_code}" to institutions_id "${institutions_id}" (UPDATE)`)
    }
    // If institutions_id is provided but no institution_code, fetch the code
    else if (institutions_id && !institution_code) {
      const { data: inst } = await supabase
        .from('institutions')
        .select('institution_code')
        .eq('id', institutions_id)
        .maybeSingle()
      if (inst?.institution_code) {
        institution_code = inst.institution_code
      }
    }

    const updatePayload: any = {
      department_code: body.department_code,
      department_name: body.department_name,
      display_name: body.display_name ?? null,
      description: body.description ?? null,
      stream: body.stream ?? null,
      department_order: body.department_order ?? null,
      status: body.is_active,
    }
    if (institution_code) updatePayload.institution_code = institution_code
    if (institutions_id) updatePayload.institutions_id = institutions_id

    const { data, error } = await supabase
      .from('departments')
      .update(updatePayload)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating department:', error)
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })

      // Provide specific error messages
      if (error.code === '23505') {
        return NextResponse.json({
          error: 'Department with this code already exists for this institution'
        }, { status: 400 })
      }

      if (error.message.includes('foreign key') || error.code === '23503') {
        return NextResponse.json({
          error: 'Invalid institution_code. Please check the Institution Codes reference sheet.'
        }, { status: 400 })
      }

      return NextResponse.json({
        error: error.message || 'Failed to update department',
        details: error.details
      }, { status: 500 })
    }

    const normalized = data ? { ...data, is_active: (data as any).status ?? (data as any).is_active ?? true } : data
    return NextResponse.json(normalized)
  } catch (e) {
    console.error('Department update error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: delete department by id
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Department ID is required' }, { status: 400 })
    }

    const supabase = getSupabaseServer()
    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting department:', error)
      return NextResponse.json({ error: 'Failed to delete department' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Department deletion error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}




