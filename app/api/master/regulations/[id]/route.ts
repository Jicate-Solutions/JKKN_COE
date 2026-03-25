import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServer()
    const { id } = await params
    const { data, error } = await supabase
      .from('regulations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch regulation' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServer()
    const { id } = await params
    const body = await req.json()
    const { 
      regulation_year, 
      regulation_code, 
      status,
      minimum_internal,
      minimum_external,
      minimum_attendance,
      minimum_total,
      maximum_internal,
      maximum_external,
      maximum_total,
      maximum_qp_marks,
      condonation_range_start,
      condonation_range_end
    } = body as Record<string, unknown>

    const data: Record<string, unknown> = {
      ...(regulation_year !== undefined && { regulation_year: Number(regulation_year) }),
      ...(regulation_code !== undefined && { regulation_code: String(regulation_code) }),
      ...(status !== undefined && { status: Boolean(status) }),
      ...(minimum_internal !== undefined && { minimum_internal: Number(minimum_internal) }),
      ...(minimum_external !== undefined && { minimum_external: Number(minimum_external) }),
      ...(minimum_attendance !== undefined && { minimum_attendance: Number(minimum_attendance) }),
      ...(minimum_total !== undefined && { minimum_total: Number(minimum_total) }),
      ...(maximum_internal !== undefined && { maximum_internal: Number(maximum_internal) }),
      ...(maximum_external !== undefined && { maximum_external: Number(maximum_external) }),
      ...(maximum_total !== undefined && { maximum_total: Number(maximum_total) }),
      ...(maximum_qp_marks !== undefined && { maximum_qp_marks: Number(maximum_qp_marks) }),
      ...(condonation_range_start !== undefined && { condonation_range_start: Number(condonation_range_start) }),
      ...(condonation_range_end !== undefined && { condonation_range_end: Number(condonation_range_end) }),
      updated_at: new Date().toISOString(),
    }

    const { data: updated, error } = await supabase
      .from('regulations')
      .update(data)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update regulation' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseServer()
    const { id } = await params
    const { error } = await supabase.from('regulations').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ message: 'Regulation deleted successfully' })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete regulation' }, { status: 500 })
  }
}
