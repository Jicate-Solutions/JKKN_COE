import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')

		if (!institutionId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('exam_rooms')
			.select('id, room_code, room_name, building, floor, room_order, exam_capacity, preferred_exam_capacity, max_exam_capacity, rows, columns')
			.eq('institutions_id', institutionId)
			.eq('is_active', true)
			.order('room_order', { ascending: true })

		if (error) {
			console.error('Rooms fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (e) {
		console.error('Seating rooms API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
