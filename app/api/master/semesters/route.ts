import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url)
		const search = searchParams.get('search')
		const is_active = searchParams.get('is_active')
		const institution_code = searchParams.get('institution_code')
		const program_code = searchParams.get('program_code')
		const program_id = searchParams.get('program_id')

		const supabase = getSupabaseServer()

		// Join with programs table to get program_code
		let query = supabase
			.from('semesters')
			.select('*, programs!semesters_program_id_fkey(program_code)')
			.order('display_order', { ascending: true })
			.range(0, 9999) // Increase limit from default 1000 to 10000 rows

		if (search) {
			query = query.or(`semester_name.ilike.%${search}%,display_name.ilike.%${search}%,institution_code.ilike.%${search}%`)
		}
		if (is_active !== null && is_active) {
			query = query.eq('is_active', is_active === 'true')
		}
		if (institution_code) {
			query = query.eq('institution_code', institution_code)
		}
		if (program_id) {
			query = query.eq('program_id', program_id)
		}
		if (program_code) {
			// Filter by program_code directly on semesters table
			query = query.eq('program_code', program_code)
		}

		const { data, error } = await query
		if (error) {
			console.error('Semester GET error:', {
				code: error.code,
				message: error.message,
				details: error.details,
				hint: error.hint
			})

			// Fallback table creation hint
			if (error.message.includes('relation "semesters" does not exist') || error.message.includes('relation "public.semesters" does not exist')) {
				return NextResponse.json({
					error: 'Semesters table not found',
					message: 'The semesters table needs to be created in your Supabase database',
					instructions: {
						sql: `
create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  institution_code varchar(50) not null,
  program_id uuid not null references programs(id),
  semester_name varchar(100) not null,
  display_name varchar(100),
  semester_type varchar(50),
  display_order integer default 1,
  initial_semester boolean default false,
  terminal_semester boolean default false,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
						`
					}
				}, { status: 404 })
			}

			// Specific error for column not found
			if (error.code === '42703') {
				return NextResponse.json({
					error: 'Database schema mismatch',
					message: error.message,
					hint: 'The semesters table may be missing required columns. Check that the table schema matches the API expectations.'
				}, { status: 500 })
			}

			return NextResponse.json({
				error: 'Failed to fetch semesters',
				details: error.message
			}, { status: 500 })
		}

		// Map database fields to frontend expected fields
		// semester_code and program_code are stored directly in semesters table
		const mappedData = (data || []).map(semester => ({
			...semester,
			semester_group: semester.semester_group || semester.semester_type,
			programs: undefined // Remove the joined programs object from response
		}))

		return NextResponse.json(mappedData)
	} catch (err) {
		console.error('Semester GET error:', err)
		return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 })
	}
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json()
		const {
			institution_code,
			program_code,
			semester_name,
			display_name,
			semester_group,
			semester_type,
			display_order,
			initial_semester = false,
			terminal_semester = false,
			is_active = true,
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
			.insert({
				institution_code: String(institution_code),
				program_id: programData.id, // Use program_id (UUID) for database
				semester_name: String(semester_name),
				display_name: display_name ? String(display_name) : null,
				semester_type: semester_type || semester_group ? String(semester_type || semester_group) : null, // Map semester_group or semester_type
				display_order: display_order ? Number(display_order) : 1,
				initial_semester: Boolean(initial_semester),
				terminal_semester: Boolean(terminal_semester),
				is_active: Boolean(is_active),
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			})
			.select('*, programs!semesters_program_id_fkey(program_code)')
			.single()

		if (error) {
			console.error('Semester insert error:', error)

			// Handle duplicate semester error
			if (error.code === '23505') {
				return NextResponse.json({
					error: `Semester "${semester_name}" already exists for institution "${institution_code}" and program "${program_code}". Please use a different semester name or update the existing semester.`
				}, { status: 409 })
			}

			// Handle foreign key constraint errors
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Foreign key constraint failed. Ensure institution and program exist.'
				}, { status: 400 })
			}

			throw error
		}

		// Map response to match frontend expectations
		// semester_code and program_code are stored directly in semesters table
		const mappedResponse = {
			...data,
			semester_group: data.semester_group || data.semester_type,
			programs: undefined
		}

		return NextResponse.json(mappedResponse, { status: 201 })
	} catch (err) {
		console.error('Semester POST error:', err)
		return NextResponse.json({ error: 'Failed to create semester' }, { status: 500 })
	}
}
