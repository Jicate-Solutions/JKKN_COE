import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - Fetch all grade systems
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		// Support both institution_id and institutions_id for compatibility
		const institutionId = searchParams.get('institutions_id') || searchParams.get('institution_id')
		const institutionCode = searchParams.get('institution_code')
		const regulationId = searchParams.get('regulation_id')
		const gradeId = searchParams.get('grade_id')
		const isActive = searchParams.get('is_active')

		let query = supabase
			.from('grade_system')
			.select('*')
			.order('created_at', { ascending: false })

		// Filter by institutions_id (UUID) if provided
		if (institutionId) {
			query = query.eq('institutions_id', institutionId)
		}
		// Or filter by institution_code if provided
		else if (institutionCode) {
			query = query.eq('institutions_code', institutionCode)
		}

		if (regulationId) {
			query = query.eq('regulation_id', regulationId)
		}

		if (gradeId) {
			query = query.eq('grade_id', gradeId)
		}

		if (isActive !== null && isActive !== undefined) {
			query = query.eq('is_active', isActive === 'true')
		}

		const { data, error } = await query

		if (error) {
			console.error('Grade System table error:', error)
			return NextResponse.json({ error: 'Failed to fetch grade systems' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (e) {
		console.error('Grade System API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Create a new grade system
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		if (!body.institutions_code) {
			return NextResponse.json({
				error: 'Institution code is required'
			}, { status: 400 })
		}

		if (!body.grade_system_code || !body.description) {
			return NextResponse.json({
				error: 'Grade system code and description are required'
			}, { status: 400 })
		}

		// Validate grade_system_code is UG or PG
		const gradeSystemCode = String(body.grade_system_code).toUpperCase().trim()
		if (gradeSystemCode !== 'UG' && gradeSystemCode !== 'PG') {
			return NextResponse.json({
				error: 'Grade system code must be either "UG" (Undergraduate) or "PG" (Postgraduate)'
			}, { status: 400 })
		}

		if (!body.grade_id) {
			return NextResponse.json({
				error: 'Grade is required'
			}, { status: 400 })
		}

		if (!body.regulation_id) {
			return NextResponse.json({
				error: 'Regulation is required'
			}, { status: 400 })
		}

		if (body.min_mark === undefined || body.min_mark === null || body.min_mark === '') {
			return NextResponse.json({
				error: 'Minimum mark is required'
			}, { status: 400 })
		}

		if (body.max_mark === undefined || body.max_mark === null || body.max_mark === '') {
			return NextResponse.json({
				error: 'Maximum mark is required'
			}, { status: 400 })
		}

		// Auto-map institutions_code to institutions_id
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', String(body.institutions_code))
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json({
				error: `Institution with code "${body.institutions_code}" not found. Please ensure the institution exists.`
			}, { status: 400 })
		}

		// Fetch grade data (grade code and grade_point) from grade_id
		const { data: gradeData, error: gradeError } = await supabase
			.from('grades')
			.select('grade, grade_point')
			.eq('id', body.grade_id)
			.single()

		if (gradeError || !gradeData) {
			return NextResponse.json({
				error: `Grade with id "${body.grade_id}" not found. Please ensure the grade exists.`
			}, { status: 400 })
		}

		// Fetch regulation_code if regulation_id is provided
		let regulationCode = body.regulation_code || null
		if (body.regulation_id && !regulationCode) {
			const { data: regData } = await supabase
				.from('regulations')
				.select('regulation_code')
				.eq('id', body.regulation_id)
				.single()
			if (regData?.regulation_code) {
				regulationCode = regData.regulation_code
			}
		}

		// Validate min_mark and max_mark are numeric (allow -1 for absent cases)
		const minMark = Number(body.min_mark)
		if (isNaN(minMark) || (minMark !== -1 && (minMark < 0 || minMark > 100))) {
			return NextResponse.json({
				error: 'Minimum mark must be -1 (for absent) or a valid number between 0 and 100'
			}, { status: 400 })
		}

		const maxMark = Number(body.max_mark)
		if (isNaN(maxMark) || (maxMark !== -1 && (maxMark < 0 || maxMark > 100))) {
			return NextResponse.json({
				error: 'Maximum mark must be -1 (for absent) or a valid number between 0 and 100'
			}, { status: 400 })
		}

		// Validate min_mark <= max_mark (allow both to be -1 for absent cases)
		if (minMark !== -1 && maxMark !== -1 && minMark > maxMark) {
			return NextResponse.json({
				error: 'Minimum mark must be less than or equal to maximum mark'
			}, { status: 400 })
		}

		const insertPayload: any = {
			institutions_id: institutionData.id,
			institutions_code: String(body.institutions_code).trim(),
			grade_system_code: gradeSystemCode, // Use validated UG/PG value
			grade_id: body.grade_id,
			grade: gradeData.grade,
			grade_point: gradeData.grade_point,
			min_mark: minMark,
			max_mark: maxMark,
			description: String(body.description).trim(),
			regulation_id: body.regulation_id,
			regulation_code: regulationCode,
			is_active: body.is_active ?? true,
		}

		const { data, error } = await supabase
			.from('grade_system')
			.insert([insertPayload])
			.select()
			.single()

		if (error) {
			console.error('Error creating grade system:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Grade system with this combination already exists. Please use different values.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid institution, grade, and regulation.'
				}, { status: 400 })
			}

			// Handle not-null constraint violation
			if (error.code === '23502') {
				return NextResponse.json({
					error: 'Missing required field. Please fill in all required fields.'
				}, { status: 400 })
			}

			// Handle check constraint violation
			if (error.code === '23514') {
				return NextResponse.json({
					error: 'Invalid value. Minimum mark must be less than maximum mark.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create grade system' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('Grade system creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT - Update an existing grade system
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		if (!body.id) {
			return NextResponse.json({ error: 'Grade system ID is required' }, { status: 400 })
		}

		// Validate required fields
		if (!body.grade_system_code || !body.description) {
			return NextResponse.json({
				error: 'Grade system code and description are required'
			}, { status: 400 })
		}

		// Validate grade_system_code is UG or PG
		const gradeSystemCode = String(body.grade_system_code).toUpperCase().trim()
		if (gradeSystemCode !== 'UG' && gradeSystemCode !== 'PG') {
			return NextResponse.json({
				error: 'Grade system code must be either "UG" (Undergraduate) or "PG" (Postgraduate)'
			}, { status: 400 })
		}

		if (body.min_mark === undefined || body.min_mark === null || body.min_mark === '') {
			return NextResponse.json({
				error: 'Minimum mark is required'
			}, { status: 400 })
		}

		if (body.max_mark === undefined || body.max_mark === null || body.max_mark === '') {
			return NextResponse.json({
				error: 'Maximum mark is required'
			}, { status: 400 })
		}

		// Auto-map institutions_code to institutions_id if provided
		let institutionsId = body.institutions_id
		if (body.institutions_code && !institutionsId) {
			const { data: institutionData, error: institutionError } = await supabase
				.from('institutions')
				.select('id')
				.eq('institution_code', String(body.institutions_code))
				.single()

			if (institutionError || !institutionData) {
				return NextResponse.json({
					error: `Institution with code "${body.institutions_code}" not found.`
				}, { status: 400 })
			}
			institutionsId = institutionData.id
		}

		// Fetch grade data if grade_id is provided
		let grade = body.grade
		let gradePoint = body.grade_point
		if (body.grade_id) {
			const { data: gradeData, error: gradeError } = await supabase
				.from('grades')
				.select('grade, grade_point')
				.eq('id', body.grade_id)
				.single()

			if (gradeError || !gradeData) {
				return NextResponse.json({
					error: `Grade with id "${body.grade_id}" not found.`
				}, { status: 400 })
			}

			grade = gradeData.grade
			gradePoint = gradeData.grade_point
		}

		// Fetch regulation_code if regulation_id is provided
		let regulationCode = body.regulation_code || null
		if (body.regulation_id && !regulationCode) {
			const { data: regData } = await supabase
				.from('regulations')
				.select('regulation_code')
				.eq('id', body.regulation_id)
				.single()
			if (regData?.regulation_code) {
				regulationCode = regData.regulation_code
			}
		}

		// Validate min_mark and max_mark are numeric (allow -1 for absent cases)
		const minMark = Number(body.min_mark)
		if (isNaN(minMark) || (minMark !== -1 && (minMark < 0 || minMark > 100))) {
			return NextResponse.json({
				error: 'Minimum mark must be -1 (for absent) or a valid number between 0 and 100'
			}, { status: 400 })
		}

		const maxMark = Number(body.max_mark)
		if (isNaN(maxMark) || (maxMark !== -1 && (maxMark < 0 || maxMark > 100))) {
			return NextResponse.json({
				error: 'Maximum mark must be -1 (for absent) or a valid number between 0 and 100'
			}, { status: 400 })
		}

		// Validate min_mark <= max_mark (allow both to be -1 for absent cases)
		if (minMark !== -1 && maxMark !== -1 && minMark > maxMark) {
			return NextResponse.json({
				error: 'Minimum mark must be less than or equal to maximum mark'
			}, { status: 400 })
		}

		const updatePayload: any = {
			grade_system_code: gradeSystemCode, // Use validated UG/PG value
			min_mark: minMark,
			max_mark: maxMark,
			description: String(body.description).trim(),
			is_active: body.is_active,
		}

		if (institutionsId) updatePayload.institutions_id = institutionsId
		if (body.institutions_code) updatePayload.institutions_code = String(body.institutions_code).trim()
		if (body.grade_id) {
			updatePayload.grade_id = body.grade_id
			updatePayload.grade = grade
			updatePayload.grade_point = gradePoint
		}
		if (body.regulation_id) updatePayload.regulation_id = body.regulation_id
		if (regulationCode) updatePayload.regulation_code = regulationCode

		const { data, error } = await supabase
			.from('grade_system')
			.update(updatePayload)
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('Error updating grade system:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Grade system with this combination already exists. Please use different values.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid institution, grade, and regulation.'
				}, { status: 400 })
			}

			// Handle check constraint violation
			if (error.code === '23514') {
				return NextResponse.json({
					error: 'Invalid value. Minimum mark must be less than maximum mark.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update grade system' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Grade system update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE - Delete a grade system
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Grade system ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { error } = await supabase
			.from('grade_system')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting grade system:', error)
			return NextResponse.json({ error: 'Failed to delete grade system' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('Grade system deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
