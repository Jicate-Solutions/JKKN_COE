import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - Fetch room allocations with filters
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const exam_timetable_id = searchParams.get('exam_timetable_id')
		const exam_room_id = searchParams.get('exam_room_id')

		let query = supabase
			.from('room_allocations')
			.select(`
				*,
				exam_rooms!room_allocations_exam_room_id_fkey(
					id,
					room_code,
					room_name,
					building,
					floor,
					room_order,
					seating_capacity,
					exam_capacity,
					rows,
					columns
				)
			`)
			.order('created_at', { ascending: false })

		if (exam_timetable_id) {
			query = query.eq('exam_timetable_id', exam_timetable_id)
		}

		if (exam_room_id) {
			query = query.eq('exam_room_id', exam_room_id)
		}

		const { data, error } = await query

		if (error) {
			console.error('Room allocations fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch room allocations' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (e) {
		console.error('Room allocations API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Create room allocation
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		if (!body.institutions_id) {
			return NextResponse.json({ error: 'Institution ID is required' }, { status: 400 })
		}
		if (!body.exam_timetable_id) {
			return NextResponse.json({ error: 'Exam timetable ID is required' }, { status: 400 })
		}
		if (!body.exam_room_id) {
			return NextResponse.json({ error: 'Exam room ID is required' }, { status: 400 })
		}
		if (!body.seats_allocated) {
			return NextResponse.json({ error: 'Seats allocated is required' }, { status: 400 })
		}

		const insertPayload = {
			institutions_id: body.institutions_id,
			exam_timetable_id: body.exam_timetable_id,
			exam_room_id: body.exam_room_id,
			seats_allocated: body.seats_allocated,
			allocation_status: body.allocation_status || 'Planned',
			created_by: body.created_by || null,
		}

		const { data, error } = await supabase
			.from('room_allocations')
			.insert([insertPayload])
			.select(`
				*,
				exam_rooms!room_allocations_exam_room_id_fkey(
					id,
					room_code,
					room_name,
					building,
					floor,
					room_order,
					seating_capacity,
					exam_capacity,
					rows,
					columns
				)
			`)
			.single()

		if (error) {
			console.error('Error creating room allocation:', error)

			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Room allocation already exists'
				}, { status: 400 })
			}

			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please ensure exam timetable and room exist.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create room allocation' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('Room allocation creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE - Delete room allocation
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Room allocation ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { error } = await supabase
			.from('room_allocations')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting room allocation:', error)
			return NextResponse.json({ error: 'Failed to delete room allocation' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('Room allocation deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
