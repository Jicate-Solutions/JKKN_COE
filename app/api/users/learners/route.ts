import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionId = searchParams.get('institution_id')
		const programId = searchParams.get('program_id')
		const semesterId = searchParams.get('semester_id')
		const sectionId = searchParams.get('section_id')
		const status = searchParams.get('status')

		// Use the detailed view which has full_name computed and all related data
		let query = supabase
			.from('students_detailed_view')
			.select('*', { count: 'exact' })
			.order('created_at', { ascending: false })
			.range(0, 9999)

		if (institutionId) query = query.eq('institution_id', institutionId)
		if (programId) query = query.eq('program_id', programId)
		if (semesterId) query = query.eq('semester_id', semesterId)
		if (sectionId) query = query.eq('section_id', sectionId)
		if (status) query = query.eq('status', status)

		const { data, error } = await query

		if (error) {
			console.error('Error fetching students from view:', error)
			// Fallback to basic table if view fails
			let fallbackQuery = supabase
				.from('students')
				.select('*', { count: 'exact' })
				.order('created_at', { ascending: false })
				.range(0, 9999)

			if (institutionId) fallbackQuery = fallbackQuery.eq('institution_id', institutionId)
			if (programId) fallbackQuery = fallbackQuery.eq('program_id', programId)
			if (semesterId) fallbackQuery = fallbackQuery.eq('semester_id', semesterId)
			if (sectionId) fallbackQuery = fallbackQuery.eq('section_id', sectionId)
			if (status) fallbackQuery = fallbackQuery.eq('status', status)

			const { data: fallbackData, error: fallbackError } = await fallbackQuery

			if (fallbackError) {
				console.error('Error fetching students:', fallbackError)
				return NextResponse.json({ error: fallbackError.message }, { status: 500 })
			}

			return NextResponse.json(fallbackData || [])
		}

		return NextResponse.json(data || [])
	} catch (err) {
		console.error('Unexpected error in GET /api/students:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		// Validate required fields for corrected schema
		const requiredFields = [
			'roll_number',
			'first_name',
			'date_of_birth',
			'gender',
			'institution_id',
			'department_id',
			'program_id',
			'semester_id',
			'academic_year_id'
		]

		for (const field of requiredFields) {
			if (!body[field]) {
				return NextResponse.json(
					{ error: `Missing required field: ${field}` },
					{ status: 400 }
				)
			}
		}

		// Check for duplicate college_email if provided
		if (body.college_email) {
			const { data: existing } = await supabase
				.from('students')
				.select('id')
				.eq('college_email', body.college_email)
				.single()

			if (existing) {
				return NextResponse.json(
					{ error: 'College email already exists' },
					{ status: 409 }
				)
			}
		}

		// Check for duplicate roll_number if provided
		if (body.roll_number) {
			const { data: existing } = await supabase
				.from('students')
				.select('id')
				.eq('roll_number', body.roll_number)
				.single()

			if (existing) {
				return NextResponse.json(
					{ error: 'Roll number already exists' },
					{ status: 409 }
				)
			}
		}

		const { data, error } = await supabase
			.from('students')
			.insert([body])
			.select(`
				*,
				institution:institutions(id, institution_code, name),
				degree:degrees(id, degree_code, degree_name),
				department:departments(id, department_code, department_name),
				program:programs(id, program_code, program_name),
				semester:semesters(id, semester_code, semester_name),
				section:sections(id, section_code, section_name),
				academic_year:academic_year(id, year_code, year_name)
			`)
			.single()

		if (error) {
			console.error('Error creating student:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (err) {
		console.error('Unexpected error in POST /api/students:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function PUT(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		if (!body.id) {
			return NextResponse.json(
				{ error: 'Student ID is required' },
				{ status: 400 }
			)
		}


		// Check for duplicate college_email if changed
		if (body.college_email) {
			const { data: existing } = await supabase
				.from('students')
				.select('id')
				.eq('college_email', body.college_email)
				.neq('id', body.id)
				.single()

			if (existing) {
				return NextResponse.json(
					{ error: 'College email already exists' },
					{ status: 409 }
				)
			}
		}

		// Check for duplicate roll_number if changed
		if (body.roll_number) {
			const { data: existing } = await supabase
				.from('students')
				.select('id')
				.eq('roll_number', body.roll_number)
				.neq('id', body.id)
				.single()

			if (existing) {
				return NextResponse.json(
					{ error: 'Roll number already exists' },
					{ status: 409 }
				)
			}
		}

		const { id, ...updateData } = body

		const { data, error } = await supabase
			.from('students')
			.update(updateData)
			.eq('id', id)
			.select(`
				*,
				institution:institutions(id, institution_code, name),
				degree:degrees(id, degree_code, degree_name),
				department:departments(id, department_code, department_name),
				program:programs(id, program_code, program_name),
				semester:semesters(id, semester_code, semester_name),
				section:sections(id, section_code, section_name),
				academic_year:academic_year(id, year_code, year_name)
			`)
			.single()

		if (error) {
			console.error('Error updating student:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (err) {
		console.error('Unexpected error in PUT /api/students:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

export async function DELETE(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json(
				{ error: 'Student ID is required' },
				{ status: 400 }
			)
		}

		const { error } = await supabase
			.from('students')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting student:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (err) {
		console.error('Unexpected error in DELETE /api/students:', err)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
