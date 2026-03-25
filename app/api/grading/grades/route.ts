import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// Force this route to be dynamic (not prerendered)
export const dynamic = 'force-dynamic'

// GET - Fetch all grades
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		// Support both institution_id and institutions_id for compatibility
		const institutionId = searchParams.get('institutions_id') || searchParams.get('institution_id')
		const institutionCode = searchParams.get('institution_code')
		const regulationCode = searchParams.get('regulation_code')

		let query = supabase
			.from('grades')
			.select('*')
			.order('grade_point', { ascending: false })

		// Filter by institutions_id (UUID) if provided
		if (institutionId) {
			query = query.eq('institutions_id', institutionId)
		}
		// Or filter by institution_code if provided
		else if (institutionCode) {
			query = query.eq('institutions_code', institutionCode)
		}

		if (regulationCode) {
			query = query.eq('regulation_code', regulationCode)
		}

		// Filter by grade_category if provided (e.g. 'comment' for descriptive grades)
		const gradeCategory = searchParams.get('grade_category')
		if (gradeCategory) {
			query = query.eq('grade_category', gradeCategory)
		}

		const { data, error } = await query

		if (error) {
			console.error('Grades table error:', error)
			return NextResponse.json({ error: 'Failed to fetch grades' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (e) {
		console.error('Grades API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Create a new grade
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

		if (!body.grade || body.grade_point === undefined || body.grade_point === null || !body.description) {
			return NextResponse.json({
				error: 'Grade, grade point, and description are required'
			}, { status: 400 })
		}

		if (!body.regulation_code) {
			return NextResponse.json({
				error: 'Regulation code is required'
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

		// Validate grade_point is numeric
		const gradePoint = Number(body.grade_point)
		if (isNaN(gradePoint)) {
			return NextResponse.json({
				error: 'Grade point must be a valid number'
			}, { status: 400 })
		}

		const insertPayload: any = {
			institutions_id: institutionData.id,
			institutions_code: String(body.institutions_code).trim(),
			grade: String(body.grade).trim(),
			grade_point: gradePoint,
			description: String(body.description).trim(),
			regulation_code: String(body.regulation_code).trim(),
			qualify: body.qualify ?? false,
			exclude_cgpa: body.exclude_cgpa ?? false,
			order_index: body.order_index !== undefined && body.order_index !== null ? Number(body.order_index) : null,
			is_absent: body.is_absent ?? false,
			result_status: body.result_status || null,
		}

		const { data, error } = await supabase
			.from('grades')
			.insert([insertPayload])
			.select()
			.single()

		if (error) {
			console.error('Error creating grade:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Grade with this combination already exists. Please use different values.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid institution and regulation.'
				}, { status: 400 })
			}

			// Handle not-null constraint violation
			if (error.code === '23502') {
				return NextResponse.json({
					error: 'Missing required field. Please fill in all required fields.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create grade' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('Grade creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT - Update an existing grade
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		if (!body.id) {
			return NextResponse.json({ error: 'Grade ID is required' }, { status: 400 })
		}

		// Validate required fields
		if (!body.grade || body.grade_point === undefined || body.grade_point === null || !body.description) {
			return NextResponse.json({
				error: 'Grade, grade point, and description are required'
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

		// Validate grade_point is numeric
		const gradePoint = Number(body.grade_point)
		if (isNaN(gradePoint)) {
			return NextResponse.json({
				error: 'Grade point must be a valid number'
			}, { status: 400 })
		}

		const updatePayload: any = {
			grade: String(body.grade).trim(),
			grade_point: gradePoint,
			description: String(body.description).trim(),
			qualify: body.qualify,
			exclude_cgpa: body.exclude_cgpa,
			order_index: body.order_index !== undefined && body.order_index !== null ? Number(body.order_index) : null,
			is_absent: body.is_absent ?? false,
			result_status: body.result_status || null,
		}

		if (institutionsId) updatePayload.institutions_id = institutionsId
		if (body.institutions_code) updatePayload.institutions_code = String(body.institutions_code).trim()
		if (body.regulation_code) updatePayload.regulation_code = String(body.regulation_code).trim()

		const { data, error } = await supabase
			.from('grades')
			.update(updatePayload)
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('Error updating grade:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Grade with this combination already exists. Please use different values.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select valid institution and regulation.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update grade' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Grade update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE - Delete a grade
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Grade ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { error } = await supabase
			.from('grades')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting grade:', error)
			return NextResponse.json({ error: 'Failed to delete grade' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('Grade deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
