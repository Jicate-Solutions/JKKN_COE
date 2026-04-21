import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchMyJKKNStaff } from '@/lib/myjkkn-api'

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionId = searchParams.get('institutions_id')
	const search = searchParams.get('search')

	if (!institutionId) return NextResponse.json({ error: 'institutions_id required' }, { status: 400 })

	const supabase = getSupabaseServer()
	const { data: institution } = await supabase
		.from('institutions')
		.select('myjkkn_institution_ids')
		.eq('id', institutionId)
		.single()

	const myjkknIds = (institution as any)?.myjkkn_institution_ids || []
	if (myjkknIds.length === 0) return NextResponse.json([])

	const allStaff: any[] = []
	const seenIds = new Set<string>()
	const searchLower = (search || '').toLowerCase()

	for (const myjkknInstId of myjkknIds) {
		try {
			const response = await fetchMyJKKNStaff({
				institution_id: myjkknInstId,
				search: search || undefined,
				limit: 50,
				is_active: true,
			})
			const staffList = response?.data || response || []
			for (const s of Array.isArray(staffList) ? staffList : []) {
				if (searchLower && !(s.first_name || '').toLowerCase().includes(searchLower)) continue
				if (s.id && !seenIds.has(s.id)) {
					seenIds.add(s.id)
					allStaff.push({
						staff_id: s.id,
						staff_name: [s.first_name, s.last_name].filter(Boolean).join(' ') || s.first_name || '',
						staff_email: s.college_email || s.email || null,
						staff_mobile: s.phone || s.mobile || null,
						staff_designation: s.designation || null,
						staff_department: s.department_code || null,
					})
				}
			}
		} catch (err) {
			console.error(`Error fetching staff for MyJKKN inst ${myjkknInstId}:`, err)
		}
	}

	return NextResponse.json(allStaff)
}
