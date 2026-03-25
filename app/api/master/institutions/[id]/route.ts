import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
    }

    const supabase = getSupabaseServer()
    const { data, error } = await supabase
      .from('institutions')
      .select(`
        id,
        institution_code,
        name,
        phone,
        email,
        website,
        created_by,
        counselling_code,
        accredited_by,
        address_line1,
        address_line2,
        address_line3,
        city,
        state,
        country,
        logo_url,
        transportation_dept,
        administration_dept,
        accounts_dept,
        admission_dept,
        placement_dept,
        anti_ragging_dept,
        institution_type,
        pin_code,
        timetable_type,
        is_active,
        created_at
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Institution fetch error:', error)
      return NextResponse.json({ error: 'Institution not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('Institution API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
