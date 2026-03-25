import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServer()
    const { searchParams } = new URL(request.url)
    const program_id = searchParams.get('program_id')
    const institution_id = searchParams.get('institution_id')

    let query = supabase
      .from('sections')
      .select(`
        id,
        institutions_id,
        institution_code,
        section_name,
        section_id,
        section_description,
        arrear_section,
        status,
        created_at,
        updated_at
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, 9999) // Increase limit from default 1000 to 10000 rows

    if (program_id) {
      query = query.eq('program_id', program_id)
    }
    if (institution_id) {
      query = query.eq('institutions_id', institution_id)
    }

    const { data, error } = await query

    if (error) {
      console.error('Section table error:', error)
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (e) {
    console.error('Section API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()
    
    const { data, error } = await supabase
      .from('sections')
      .insert([{
        institutions_id: body.institutions_id,
        institution_code: body.institution_code,
        section_name: body.section_name,
        section_id: body.section_id,
        section_description: body.section_description,
        arrear_section: body.arrear_section ?? false,
        status: body.status ?? true
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating section:', error)
      
      // Handle duplicate key constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ 
          error: `Section ID "${body.section_id}" already exists for this institution. Please use a different Section ID.` 
        }, { status: 400 })
      }
      
      // Handle foreign key constraint violation
      if (error.code === '23503') {
        return NextResponse.json({ 
          error: 'Invalid institution. Please select a valid institution.' 
        }, { status: 400 })
      }
      
      return NextResponse.json({ error: 'Failed to create section' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    console.error('Section creation error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()
    
    const { data, error } = await supabase
      .from('sections')
      .update({
        institutions_id: body.institutions_id,
        institution_code: body.institution_code,
        section_name: body.section_name,
        section_id: body.section_id,
        section_description: body.section_description,
        arrear_section: body.arrear_section,
        status: body.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating section:', error)
      
      // Handle duplicate key constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ 
          error: `Section ID "${body.section_id}" already exists for this institution. Please use a different Section ID.` 
        }, { status: 400 })
      }
      
      // Handle foreign key constraint violation
      if (error.code === '23503') {
        return NextResponse.json({ 
          error: 'Invalid institution. Please select a valid institution.' 
        }, { status: 400 })
      }
      
      return NextResponse.json({ error: 'Failed to update section' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('Section update error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Section ID is required' }, { status: 400 })
    }

    const supabase = getSupabaseServer()
    
    const { error } = await supabase
      .from('sections')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting section:', error)
      return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Section deletion error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
