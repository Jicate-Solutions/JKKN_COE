import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNStaffById, MyJKKNApiError } from '@/lib/myjkkn-api'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const staffId = params.id
    if (!staffId) {
      return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 })
    }

    console.log(`🔍 Fetching staff member with ID: ${staffId}`)
    const staffMember = await fetchMyJKKNStaffById(staffId)
    console.log(`✅ Successfully fetched staff member: ${staffMember.first_name} ${staffMember.last_name}`)

    return NextResponse.json({ success: true, data: staffMember })

  } catch (error: any) {
    if (error instanceof MyJKKNApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Error fetching staff member data:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
