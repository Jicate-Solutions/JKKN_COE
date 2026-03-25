import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { RoomAllocationResult } from '@/types/seating-allocation'

export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()
		const { institutions_id, exam_date, exam_session, rooms } = body as {
			institutions_id: string
			exam_date: string
			exam_session: string
			rooms: RoomAllocationResult[]
		}

		if (!institutions_id || !exam_date || !exam_session || !rooms?.length) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		let totalSaved = 0

		for (const roomResult of rooms) {
			// Get unique timetable IDs from students in this room
			const timetableIds = [...new Set(
				roomResult.seats
					.filter(s => s.student)
					.map(s => s.student!.exam_timetable_id)
			)]

			// Create room_allocation for each timetable in this room
			for (const ttId of timetableIds) {
				const studentsForTT = roomResult.seats.filter(
					s => s.student?.exam_timetable_id === ttId
				)

				// Create room allocation record
				const { data: roomAlloc, error: raError } = await supabase
					.from('room_allocations')
					.insert({
						institutions_id,
						exam_timetable_id: ttId,
						exam_room_id: roomResult.room.id,
						seats_allocated: studentsForTT.length,
						allocation_status: 'Planned',
					})
					.select('id')
					.single()

				if (raError) {
					console.error('Room allocation error:', raError)
					continue
				}

				// Create seat allocation records for this room+timetable combo
				const seatRows = studentsForTT
					.filter(s => s.student)
					.map(s => ({
						room_allocation_id: roomAlloc.id,
						institutions_id,
						exam_timetable_id: ttId,
						exam_room_id: roomResult.room.id,
						student_reg_no: s.student!.stu_register_no,
						course_code: s.student!.course_code,
						exam_date,
						exam_session,
						row_number: s.row_number,
						column_number: s.column_number,
					}))

				if (seatRows.length > 0) {
					const { error: saError } = await supabase
						.from('seat_allocations')
						.insert(seatRows)

					if (saError) {
						console.error('Seat allocation error:', saError)
					} else {
						totalSaved += seatRows.length
					}
				}
			}
		}

		return NextResponse.json({ success: true, total_saved: totalSaved }, { status: 201 })
	} catch (e) {
		console.error('Seating save API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
