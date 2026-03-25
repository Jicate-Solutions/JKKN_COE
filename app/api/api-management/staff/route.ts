import { NextRequest, NextResponse } from 'next/server'
import { fetchAllMyJKKNStaff, fetchMyJKKNStaff, MyJKKNApiError } from '@/lib/myjkkn-api'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') ?? undefined
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const department_id = searchParams.get('department_id') ?? undefined
    const is_active = searchParams.get('is_active') === 'true' ? true
                    : searchParams.get('is_active') === 'false' ? false
                    : undefined

    console.log('🔍 Fetching staff data from MyJKKN API...')

    // When limit is large (≥200), fetch all pages automatically
    if (limit >= 200) {
      const allStaff = await fetchAllMyJKKNStaff({ search, department_id, is_active, all: true })
      console.log(`✅ Fetched all ${allStaff.length} staff records`)
      return NextResponse.json({ success: true, data: allStaff, count: allStaff.length })
    }

    // Otherwise return a single page
    const response = await fetchMyJKKNStaff({ page, limit, search, department_id, is_active })
    console.log(`✅ Fetched ${response.data.length} staff records (total: ${response.metadata?.total})`)

    return NextResponse.json({
      success: true,
      data: response.data,
      count: response.data.length,
      metadata: response.metadata,
      page,
      limit,
    })

  } catch (error: any) {
    if (error instanceof MyJKKNApiError) {
      console.error('MyJKKN API error fetching staff:', error.status, error.message)
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Error fetching staff data:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
