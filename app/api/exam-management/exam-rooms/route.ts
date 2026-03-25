import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET /api/exam-rooms - Fetch all exam rooms
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const is_active = searchParams.get('is_active')

		let query = supabase
			.from('exam_rooms')
			.select('*')
			.order('room_order', { ascending: true })
			.order('room_code', { ascending: true })

		if (institutions_id) {
			query = query.eq('institutions_id', institutions_id)
		}

		if (is_active !== null && is_active !== undefined) {
			query = query.eq('is_active', is_active === 'true')
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching exam rooms:', error)
			return NextResponse.json({ error: 'Failed to fetch exam rooms' }, { status: 500 })
		}

		// Normalize is_active and is_accessible fields
		const normalized = data.map((room) => ({
			...room,
			is_active: room.is_active === true || room.is_active === 'true' || room.is_active === 'Active',
			is_accessible: room.is_accessible === true || room.is_accessible === 'true' || room.is_accessible === 'Accessible',
		}))

		return NextResponse.json(normalized)
	} catch (error) {
		console.error('Unexpected error in GET /api/exam-rooms:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST /api/exam-rooms - Create a new exam room
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			institution_code,
			room_code,
			room_name,
			building,
			floor,
			room_order,
			seating_capacity,
			exam_capacity,
			room_type,
			facilities,
			is_accessible,
			is_active,
			rows,
			columns,
		} = body

		// Validate required fields
		if (!institution_code || !room_code || !room_name) {
			return NextResponse.json(
				{ error: 'Institution code, room code, and room name are required' },
				{ status: 400 }
			)
		}

		if (!room_order || !seating_capacity || !exam_capacity || !rows || !columns) {
			return NextResponse.json(
				{ error: 'Room order, seating capacity, exam capacity, rows, and columns are required' },
				{ status: 400 }
			)
		}

		// Validate capacity constraint
		if (Number(exam_capacity) > Number(seating_capacity)) {
			return NextResponse.json(
				{ error: 'Exam capacity cannot exceed seating capacity' },
				{ status: 400 }
			)
		}

		// Auto-map institution_code to institutions_id
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', String(institution_code))
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json(
				{
					error: `Institution with code "${institution_code}" not found. Please ensure the institution exists.`,
				},
				{ status: 400 }
			)
		}

		// Prepare insert payload
		const insertPayload = {
			institutions_id: institutionData.id,
			room_code: String(room_code).trim(),
			room_name: String(room_name).trim(),
			building: building ? String(building).trim() : null,
			floor: floor ? String(floor).trim() : null,
			room_order: Number(room_order),
			seating_capacity: Number(seating_capacity),
			exam_capacity: Number(exam_capacity),
			room_type: room_type ? String(room_type).trim() : null,
			facilities: facilities || null,
			is_accessible: is_accessible === true || is_accessible === 'true' || is_accessible === 'Accessible',
			is_active: is_active === true || is_active === 'true' || is_active === 'Active',
			rows: Number(rows),
			columns: Number(columns),
		}

		const { data, error } = await supabase
			.from('exam_rooms')
			.insert([insertPayload])
			.select('*')
			.single()

		if (error) {
			console.error('Error creating exam room:', error)

			// Handle duplicate key constraint violation (23505)
			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'Exam room with this code already exists for this institution. Please use a different room code.' },
					{ status: 400 }
				)
			}

			// Handle foreign key constraint violation (23503)
			if (error.code === '23503') {
				return NextResponse.json(
					{ error: 'Invalid reference. Please select a valid institution.' },
					{ status: 400 }
				)
			}

			// Handle check constraint violation (23514)
			if (error.code === '23514') {
				return NextResponse.json(
					{ error: 'Invalid value. Exam capacity must not exceed seating capacity.' },
					{ status: 400 }
				)
			}

			return NextResponse.json({ error: 'Failed to create exam room' }, { status: 500 })
		}

		// Normalize response
		const normalized = {
			...data,
			is_active: data.is_active === true || data.is_active === 'true' || data.is_active === 'Active',
			is_accessible: data.is_accessible === true || data.is_accessible === 'true' || data.is_accessible === 'Accessible',
		}

		return NextResponse.json(normalized, { status: 201 })
	} catch (error) {
		console.error('Unexpected error in POST /api/exam-rooms:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT /api/exam-rooms - Update an existing exam room
export async function PUT(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			id,
			institution_code,
			room_code,
			room_name,
			building,
			floor,
			room_order,
			seating_capacity,
			exam_capacity,
			room_type,
			facilities,
			is_accessible,
			is_active,
			rows,
			columns,
		} = body

		// Validate ID
		if (!id) {
			return NextResponse.json({ error: 'Exam room ID is required' }, { status: 400 })
		}

		// Validate required fields
		if (!institution_code || !room_code || !room_name) {
			return NextResponse.json(
				{ error: 'Institution code, room code, and room name are required' },
				{ status: 400 }
			)
		}

		if (!room_order || !seating_capacity || !exam_capacity || !rows || !columns) {
			return NextResponse.json(
				{ error: 'Room order, seating capacity, exam capacity, rows, and columns are required' },
				{ status: 400 }
			)
		}

		// Validate capacity constraint
		if (Number(exam_capacity) > Number(seating_capacity)) {
			return NextResponse.json(
				{ error: 'Exam capacity cannot exceed seating capacity' },
				{ status: 400 }
			)
		}

		// Auto-map institution_code to institutions_id
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', String(institution_code))
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json(
				{
					error: `Institution with code "${institution_code}" not found. Please ensure the institution exists.`,
				},
				{ status: 400 }
			)
		}

		// Prepare update payload
		const updatePayload = {
			institutions_id: institutionData.id,
			room_code: String(room_code).trim(),
			room_name: String(room_name).trim(),
			building: building ? String(building).trim() : null,
			floor: floor ? String(floor).trim() : null,
			room_order: Number(room_order),
			seating_capacity: Number(seating_capacity),
			exam_capacity: Number(exam_capacity),
			room_type: room_type ? String(room_type).trim() : null,
			facilities: facilities || null,
			is_accessible: is_accessible === true || is_accessible === 'true' || is_accessible === 'Accessible',
			is_active: is_active === true || is_active === 'true' || is_active === 'Active',
			rows: Number(rows),
			columns: Number(columns),
			updated_at: new Date().toISOString(),
		}

		const { data, error } = await supabase
			.from('exam_rooms')
			.update(updatePayload)
			.eq('id', id)
			.select('*')
			.single()

		if (error) {
			console.error('Error updating exam room:', error)

			// Handle duplicate key constraint violation (23505)
			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'Exam room with this code already exists for this institution. Please use a different room code.' },
					{ status: 400 }
				)
			}

			// Handle foreign key constraint violation (23503)
			if (error.code === '23503') {
				return NextResponse.json(
					{ error: 'Invalid reference. Please select a valid institution.' },
					{ status: 400 }
				)
			}

			// Handle check constraint violation (23514)
			if (error.code === '23514') {
				return NextResponse.json(
					{ error: 'Invalid value. Exam capacity must not exceed seating capacity.' },
					{ status: 400 }
				)
			}

			return NextResponse.json({ error: 'Failed to update exam room' }, { status: 500 })
		}

		// Normalize response
		const normalized = {
			...data,
			is_active: data.is_active === true || data.is_active === 'true' || data.is_active === 'Active',
			is_accessible: data.is_accessible === true || data.is_accessible === 'true' || data.is_accessible === 'Accessible',
		}

		return NextResponse.json(normalized)
	} catch (error) {
		console.error('Unexpected error in PUT /api/exam-rooms:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE /api/exam-rooms - Delete an exam room
export async function DELETE(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Exam room ID is required' }, { status: 400 })
		}

		const { error } = await supabase.from('exam_rooms').delete().eq('id', id)

		if (error) {
			console.error('Error deleting exam room:', error)
			return NextResponse.json({ error: 'Failed to delete exam room' }, { status: 500 })
		}

		return NextResponse.json({ message: 'Exam room deleted successfully' })
	} catch (error) {
		console.error('Unexpected error in DELETE /api/exam-rooms:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
