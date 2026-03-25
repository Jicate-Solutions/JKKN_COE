import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllMyJKKNInstitutions, MyJKKNApiError } from '@/lib/myjkkn-api'

// Interface for merged institution data
interface MergedInstitution {
  // Local COE fields
  id: string
  institution_code: string
  name: string
  counselling_code: string | null
  myjkkn_institution_ids: string[] | null
  is_active: boolean
  created_at: string
  updated_at: string
  // MyJKKN fields (from external API)
  myjkkn_id?: string
  myjkkn_name?: string
  myjkkn_short_name?: string
  myjkkn_address?: string
  myjkkn_city?: string
  myjkkn_state?: string
  myjkkn_country?: string
  myjkkn_pincode?: string
  myjkkn_phone?: string
  myjkkn_email?: string
  myjkkn_website?: string
  myjkkn_logo_url?: string
  myjkkn_is_active?: boolean
  // Flag to indicate if MyJKKN data was found
  has_myjkkn_data: boolean
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const localOnly = searchParams.get('local_only') === 'true'

    const supabase = getSupabaseServer()

    // Fetch local institutions from Supabase - sorted by name ascending
    const { data: localInstitutions, error } = await supabase
      .from('institutions')
      .select(`
        id,
        institution_code,
        name,
        counselling_code,
        myjkkn_institution_ids,
        is_active,
        created_at,
        updated_at
      `, { count: 'exact' })
      .order('name', { ascending: true })
      .range(0, 9999)

    if (error) {
      console.error('Institutions table error:', error)
      return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
    }

    // If local_only is requested, return local institutions without MyJKKN merge
    if (localOnly) {
      return NextResponse.json(localInstitutions || [])
    }

    // Fetch MyJKKN institutions for left join
    let myjkknInstitutions: Awaited<ReturnType<typeof fetchAllMyJKKNInstitutions>> = []
    try {
      myjkknInstitutions = await fetchAllMyJKKNInstitutions()
      console.log(`[Institutions API] Fetched ${myjkknInstitutions.length} MyJKKN institutions for join`)
    } catch (myjkknError) {
      // Log warning but continue with local data only
      if (myjkknError instanceof MyJKKNApiError) {
        console.warn(`[Institutions API] MyJKKN API error (${myjkknError.status}): ${myjkknError.message}`)
      } else {
        console.warn('[Institutions API] Failed to fetch MyJKKN institutions:', myjkknError)
      }
    }

    // Create a map of MyJKKN institutions by counselling_code for O(1) lookup
    // Note: MyJKKN API returns 'counselling_code' which maps to local 'counselling_code'
    const myjkknMap = new Map(
      myjkknInstitutions.map(inst => [(inst as any).counselling_code || inst.institution_code, inst])
    )

    // Left join: merge local institutions with MyJKKN data using counselling_code
    // Return ALL local institutions, enriched with MyJKKN data where available
    const mergedInstitutions: MergedInstitution[] = (localInstitutions || [])
      .map(local => {
        // Use counselling_code to find matching MyJKKN institution
        const myjkknData = local.counselling_code
          ? myjkknMap.get(local.counselling_code)
          : undefined

        return {
          // Local COE fields
          id: local.id,
          institution_code: local.institution_code,
          name: local.name,
          counselling_code: local.counselling_code,
          myjkkn_institution_ids: local.myjkkn_institution_ids,
          is_active: local.is_active,
          created_at: local.created_at,
          updated_at: local.updated_at,
          // MyJKKN fields (prefixed to avoid conflicts)
          myjkkn_id: myjkknData?.id,
          myjkkn_name: myjkknData?.name,
          myjkkn_short_name: myjkknData?.short_name,
          myjkkn_address: myjkknData?.address,
          myjkkn_city: myjkknData?.city,
          myjkkn_state: myjkknData?.state,
          myjkkn_country: myjkknData?.country,
          myjkkn_pincode: myjkknData?.pincode,
          myjkkn_phone: myjkknData?.phone,
          myjkkn_email: myjkknData?.email,
          myjkkn_website: myjkknData?.website,
          myjkkn_logo_url: myjkknData?.logo_url,
          myjkkn_is_active: myjkknData?.is_active,
          // Flag
          has_myjkkn_data: !!myjkknData,
        }
      })
      // No longer filter - return ALL local institutions

    console.log(`[Institutions API] Returning ${mergedInstitutions.length} institutions (${mergedInstitutions.filter(i => i.has_myjkkn_data).length} with MyJKKN data)`)

    return NextResponse.json(mergedInstitutions)
  } catch (e) {
    console.error('Institutions API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    const { data, error } = await supabase
      .from('institutions')
      .insert([{
        institution_code: body.institution_code,
        name: body.name,
        counselling_code: body.counselling_code,
        is_active: body.is_active ?? true
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating institution:', error)
      return NextResponse.json({ error: 'Failed to create institution' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    console.error('Institution creation error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const supabase = getSupabaseServer()

    const { data, error } = await supabase
      .from('institutions')
      .update({
        institution_code: body.institution_code,
        name: body.name,
        counselling_code: body.counselling_code,
        is_active: body.is_active
      })
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating institution:', error)
      return NextResponse.json({ error: 'Failed to update institution' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('Institution update error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
    }

    const supabase = getSupabaseServer()
    
    const { error } = await supabase
      .from('institutions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting institution:', error)
      return NextResponse.json({ error: 'Failed to delete institution' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Institution deletion error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


