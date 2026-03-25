import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function PUT(
	req: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await context.params
		const body = await req.json()
		const {
			institution_code,
			program_code,
			semester_name,
			display_name,
			semester_group,
			semester_type,
			display_order,
			initial_semester,
			terminal_semester,
			is_active,
		} = body as Record<string, unknown>

		if (!institution_code || !program_code || !semester_name) {
			return NextResponse.json({ error: 'Missing required fields: institution_code, program_code, semester_name' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Validate that institution exists
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', String(institution_code))
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json({
				error: `Institution with code "${institution_code}" not found. Please ensure the institution exists.`
			}, { status: 400 })
		}

		// Validate that program exists and get its ID
		const { data: programData, error: programError } = await supabase
			.from('programs')
			.select('id')
			.eq('program_code', String(program_code))
			.single()

		if (programError || !programData) {
			return NextResponse.json({
				error: `Program with code "${program_code}" not found. Please ensure the program exists.`
			}, { status: 400 })
		}

		const { data, error } = await supabase
			.from('semesters')
			.update({
				institution_code: String(institution_code),
				program_id: programData.id, // Use program_id (UUID) for database
				semester_name: String(semester_name),
				display_name: display_name ? String(display_name) : null,
				semester_type: semester_type || semester_group ? String(semester_type || semester_group) : null, // Map semester_group or semester_type
				display_order: display_order ? Number(display_order) : 1,
				initial_semester: Boolean(initial_semester),
				terminal_semester: Boolean(terminal_semester),
				is_active: is_active !== undefined ? Boolean(is_active) : true,
				updated_at: new Date().toISOString(),
			})
			.eq('id', id)
			.select('*, programs!semesters_program_id_fkey(program_code)')
			.single()

		if (error) {
			console.error('Semester update error:', error)

			// Handle duplicate semester error
			if (error.code === '23505') {
				return NextResponse.json({
					error: `Semester "${semester_name}" already exists for institution "${institution_code}" and program "${program_code}". Please use a different semester name.`
				}, { status: 409 })
			}

			// Handle foreign key constraint errors
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Foreign key constraint failed. Ensure institution and program exist.'
				}, { status: 400 })
			}

			// Handle record not found
			if (error.code === 'PGRST116') {
				return NextResponse.json({
					error: 'Semester not found'
				}, { status: 404 })
			}

			throw error
		}

		if (!data) {
			return NextResponse.json({ error: 'Semester not found' }, { status: 404 })
		}

		// Map response to match frontend expectations
		const programs = Array.isArray(data.programs) ? data.programs[0] : data.programs
		const programCode = programs?.program_code || String(program_code)

		const mappedResponse = {
			...data,
			program_code: programCode,
			semester_code: `${data.institution_code}-${programCode}-${data.semester_name.replace(/\s+/g, '')}`,
			semester_group: data.semester_type,
			programs: undefined
		}

		return NextResponse.json(mappedResponse)
	} catch (err) {
		console.error('Semester PUT error:', err)
		return NextResponse.json({ error: 'Failed to update semester' }, { status: 500 })
	}
}

export async function DELETE(
	req: NextRequest,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await context.params
		const supabase = getSupabaseServer()

		const { error } = await supabase
			.from('semesters')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Semester delete error:', error)

			// Handle foreign key constraint errors (if semester is referenced elsewhere)
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Cannot delete semester. It is referenced by other records (courses, students, etc.).'
				}, { status: 400 })
			}

			// Handle record not found
			if (error.code === 'PGRST116') {
				return NextResponse.json({
					error: 'Semester not found'
				}, { status: 404 })
			}

			throw error
		}

		return NextResponse.json({ success: true }, { status: 200 })
	} catch (err) {
		console.error('Semester DELETE error:', err)
		return NextResponse.json({ error: 'Failed to delete semester' }, { status: 500 })
	}
}
