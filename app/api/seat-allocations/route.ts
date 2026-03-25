import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - Fetch seat allocations with filters
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const exam_timetable_id = searchParams.get('exam_timetable_id')
		const exam_room_id = searchParams.get('exam_room_id')
		const room_allocation_id = searchParams.get('room_allocation_id')

		let query = supabase
			.from('seat_allocations')
			.select('*')
			.order('row_number', { ascending: true })
			.order('column_number', { ascending: true })

		if (exam_timetable_id) {
			query = query.eq('exam_timetable_id', exam_timetable_id)
		}

		if (exam_room_id) {
			query = query.eq('exam_room_id', exam_room_id)
		}

		if (room_allocation_id) {
			query = query.eq('room_allocation_id', room_allocation_id)
		}

		const { data, error } = await query

		if (error) {
			console.error('Seat allocations fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch seat allocations' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (e) {
		console.error('Seat allocations API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Create seat allocations (bulk)
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		if (!body.allocations || !Array.isArray(body.allocations)) {
			return NextResponse.json({ error: 'Allocations array is required' }, { status: 400 })
		}

		// Validate each allocation
		for (const alloc of body.allocations) {
			if (!alloc.room_allocation_id || !alloc.institutions_id || !alloc.exam_timetable_id ||
				!alloc.exam_room_id || !alloc.student_reg_no || !alloc.course_code ||
				!alloc.exam_date || !alloc.exam_session) {
				return NextResponse.json({
					error: 'Missing required fields in one or more allocations'
				}, { status: 400 })
			}
		}

		// Insert seat allocations
		const { data, error } = await supabase
			.from('seat_allocations')
			.insert(body.allocations)
			.select('*')

		if (error) {
			console.error('Error creating seat allocations:', error)

			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Duplicate seat allocation detected'
				}, { status: 400 })
			}

			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please ensure all related records exist.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create seat allocations' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('Seat allocation creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE - Delete seat allocations by room_allocation_id
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const room_allocation_id = searchParams.get('room_allocation_id')

		if (!room_allocation_id) {
			return NextResponse.json({ error: 'Room allocation ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { error } = await supabase
			.from('seat_allocations')
			.delete()
			.eq('room_allocation_id', room_allocation_id)

		if (error) {
			console.error('Error deleting seat allocations:', error)
			return NextResponse.json({ error: 'Failed to delete seat allocations' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('Seat allocation deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
