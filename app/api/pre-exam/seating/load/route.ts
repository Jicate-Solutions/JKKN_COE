import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')
		const examDate = searchParams.get('exam_date')
		const examSession = searchParams.get('exam_session')

		if (!institutionId || !examDate || !examSession) {
			return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
		}

		// Get seat allocations with joined room data for this date + session
		const { data: seats, error } = await supabase
			.from('seat_allocations')
			.select(`
				*,
				exam_rooms:exam_room_id(
					id, room_code, room_name, building, floor, room_order, exam_capacity, rows, columns
				)
			`)
			.eq('institutions_id', institutionId)
			.eq('exam_date', examDate)
			.eq('exam_session', examSession)
			.order('row_number', { ascending: true })
			.order('column_number', { ascending: true })
			.range(0, 9999)

		if (error) {
			console.error('Load seating error:', error)
			return NextResponse.json({ error: 'Failed to load seating' }, { status: 500 })
		}

		return NextResponse.json({
			seats: seats || [],
			has_allocation: (seats || []).length > 0,
		})
	} catch (e) {
		console.error('Seating load API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
