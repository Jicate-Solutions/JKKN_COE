import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/exam-applications/paginate'
import { institutionParam } from '@/lib/auth/institution-scope-request'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = (await institutionParam(searchParams, 'institutions_id'))

		if (!institutionId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		// Paged to completion so Supabase's 1000-row cap cannot drop rooms
		let data: any[]
		try {
			data = await fetchAllRows(
				() => supabase
					.from('exam_rooms')
					.select('id, room_code, room_name, building, floor, room_order, exam_capacity, preferred_exam_capacity, max_exam_capacity, rows, columns')
					.eq('institutions_id', institutionId)
					.eq('is_active', true),
				{ orderColumn: 'room_order', label: 'exam rooms' }
			)
		} catch (error) {
			console.error('Rooms fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Seating rooms API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
