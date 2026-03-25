import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/internal-assessment-patterns/program-associations
 * Fetch program-pattern associations with optional filters
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const pattern_id = searchParams.get('pattern_id')
		const program_id = searchParams.get('program_id')
		const is_active = searchParams.get('is_active')

		let query = supabase
			.from('pattern_program_associations')
			.select(`
				*,
				internal_assessment_patterns (
					id,
					pattern_code,
					pattern_name,
					status
				),
				programs (
					id,
					program_code,
					program_name
				)
			`)
			.order('effective_from_date', { ascending: false })

		if (pattern_id) {
			query = query.eq('pattern_id', pattern_id)
		}

		if (program_id) {
			query = query.eq('program_id', program_id)
		}

		if (is_active !== null) {
			query = query.eq('is_active', is_active === 'true')
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching program associations:', error)
			return NextResponse.json({ error: 'Failed to fetch program associations' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Program associations GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * POST /api/internal-assessment-patterns/program-associations
 * Create a new program-pattern association
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			pattern_id,
			program_id,
			program_code,
			effective_from_date,
			effective_to_date,
			created_by,
			is_active = true
		} = body

		// Validate required fields
		if (!pattern_id) {
			return NextResponse.json({ error: 'Pattern ID is required' }, { status: 400 })
		}
		if (!program_id) {
			return NextResponse.json({ error: 'Program ID is required' }, { status: 400 })
		}
		if (!effective_from_date) {
			return NextResponse.json({ error: 'Effective from date is required' }, { status: 400 })
		}

		// Verify pattern exists
		const { data: patternData, error: patternError } = await supabase
			.from('internal_assessment_patterns')
			.select('id')
			.eq('id', pattern_id)
			.single()

		if (patternError || !patternData) {
			return NextResponse.json({ error: 'Pattern not found' }, { status: 400 })
		}

		// Verify program exists and get program_code if not provided
		const { data: programData, error: programError } = await supabase
			.from('programs')
			.select('id, program_code')
			.eq('id', program_id)
			.single()

		if (programError || !programData) {
			return NextResponse.json({ error: 'Program not found' }, { status: 400 })
		}

		// Check for overlapping associations
		const { data: existingAssoc, error: existingError } = await supabase
			.from('pattern_program_associations')
			.select('id')
			.eq('program_id', program_id)
			.eq('is_active', true)
			.or(`effective_to_date.is.null,effective_to_date.gte.${effective_from_date}`)
			.lte('effective_from_date', effective_to_date || '9999-12-31')

		if (!existingError && existingAssoc && existingAssoc.length > 0) {
			return NextResponse.json({
				error: 'An active association already exists for this program in the specified date range'
			}, { status: 400 })
		}

		const { data, error } = await supabase
			.from('pattern_program_associations')
			.insert({
				pattern_id,
				program_id,
				program_code: program_code || programData.program_code,
				effective_from_date,
				effective_to_date: effective_to_date || null,
				created_by: created_by || null,
				is_active
			})
			.select(`
				*,
				internal_assessment_patterns (
					id,
					pattern_code,
					pattern_name,
					status
				),
				programs (
					id,
					program_code,
					program_name
				)
			`)
			.single()

		if (error) {
			console.error('Error creating program association:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Association already exists for this program and date' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create program association' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Program associations POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * PUT /api/internal-assessment-patterns/program-associations
 * Update an existing program-pattern association
 */
export async function PUT(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			id,
			pattern_id,
			effective_from_date,
			effective_to_date,
			is_active
		} = body

		if (!id) {
			return NextResponse.json({ error: 'Association ID is required' }, { status: 400 })
		}

		const updateData: Record<string, unknown> = {}
		if (pattern_id !== undefined) updateData.pattern_id = pattern_id
		if (effective_from_date !== undefined) updateData.effective_from_date = effective_from_date
		if (effective_to_date !== undefined) updateData.effective_to_date = effective_to_date || null
		if (is_active !== undefined) updateData.is_active = is_active

		const { data, error } = await supabase
			.from('pattern_program_associations')
			.update(updateData)
			.eq('id', id)
			.select(`
				*,
				internal_assessment_patterns (
					id,
					pattern_code,
					pattern_name,
					status
				),
				programs (
					id,
					program_code,
					program_name
				)
			`)
			.single()

		if (error) {
			console.error('Error updating program association:', error)
			return NextResponse.json({ error: 'Failed to update program association' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Program associations PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * DELETE /api/internal-assessment-patterns/program-associations
 * Delete a program-pattern association
 */
export async function DELETE(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Association ID is required' }, { status: 400 })
		}

		const { error } = await supabase
			.from('pattern_program_associations')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting program association:', error)
			return NextResponse.json({ error: 'Failed to delete program association' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Program associations DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
