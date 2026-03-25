import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function DELETE(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')
		const examDate = searchParams.get('exam_date')
		const examSession = searchParams.get('exam_session')

		if (!institutionId || !examDate || !examSession) {
			return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
		}

		// 1. Delete seat allocations first (child records)
		const { error: seatError } = await supabase
			.from('seat_allocations')
			.delete()
			.eq('institutions_id', institutionId)
			.eq('exam_date', examDate)
			.eq('exam_session', examSession)

		if (seatError) {
			console.error('Clear seats error:', seatError)
			return NextResponse.json({ error: 'Failed to clear seat allocations' }, { status: 500 })
		}

		// 2. Get timetable IDs for this date + session to clean up room allocations
		const { data: timetables } = await supabase
			.from('exam_timetables')
			.select('id')
			.eq('institutions_id', institutionId)
			.eq('exam_date', examDate)
			.eq('session', examSession)

		if (timetables && timetables.length > 0) {
			const ttIds = timetables.map(tt => tt.id)
			const { error: roomError } = await supabase
				.from('room_allocations')
				.delete()
				.eq('institutions_id', institutionId)
				.in('exam_timetable_id', ttIds)

			if (roomError) {
				console.error('Clear room allocations error:', roomError)
			}
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('Seating clear API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
