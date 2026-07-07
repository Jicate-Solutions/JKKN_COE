import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { handleDeleteWithDependencyCheck } from '@/lib/delete-helpers'

// GET - Fetch all curriculum grade systems
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		// Support both institution_id and institutions_id for compatibility
		const institutionId = searchParams.get('institutions_id') || searchParams.get('institution_id')
		const institutionCode = searchParams.get('institution_code')
		const regulationId = searchParams.get('regulation_id')
		const cgpaGradeId = searchParams.get('cgpa_grade_id')
		const isActive = searchParams.get('is_active')

		let query = supabase
			.from('cgpa_grade_system')
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

		if (cgpaGradeId) {
			query = query.eq('cgpa_grade_id', cgpaGradeId)
		}

		if (isActive !== null && isActive !== undefined) {
			query = query.eq('is_active', isActive === 'true')
		}

		const { data, error } = await query

		if (error) {
			console.error('Curriculum Grade System table error:', error)
			return NextResponse.json({ error: 'Failed to fetch curriculum grade systems' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (e) {
		console.error('Curriculum Grade System API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Create a new curriculum grade system
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

		if (!body.cgpa_grade_id) {
			return NextResponse.json({
				error: 'Grade is required'
			}, { status: 400 })
		}

		if (!body.regulation_id) {
			return NextResponse.json({
				error: 'Regulation is required'
			}, { status: 400 })
		}

		if (body.min_cgpa === undefined || body.min_cgpa === null || body.min_cgpa === '') {
			return NextResponse.json({
				error: 'Minimum CGPA is required'
			}, { status: 400 })
		}

		if (body.max_cgpa === undefined || body.max_cgpa === null || body.max_cgpa === '') {
			return NextResponse.json({
				error: 'Maximum CGPA is required'
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

		// Fetch grade data (grade code and grade_point) from cgpa_grade_id
		const { data: gradeData, error: gradeError } = await supabase
			.from('cgpa_grades')
			.select('grade, grade_point')
			.eq('id', body.cgpa_grade_id)
			.single()

		if (gradeError || !gradeData) {
			return NextResponse.json({
				error: `Grade with id "${body.cgpa_grade_id}" not found. Please ensure the grade exists.`
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

		// Validate min_cgpa and max_cgpa are numeric (allow -1 for absent cases)
		const minCgpa = Number(body.min_cgpa)
		if (isNaN(minCgpa) || (minCgpa !== -1 && (minCgpa < 0 || minCgpa > 10))) {
			return NextResponse.json({
				error: 'Minimum CGPA must be -1 (for absent) or a valid number between 0 and 10'
			}, { status: 400 })
		}

		const maxCgpa = Number(body.max_cgpa)
		if (isNaN(maxCgpa) || (maxCgpa !== -1 && (maxCgpa < 0 || maxCgpa > 10))) {
			return NextResponse.json({
				error: 'Maximum CGPA must be -1 (for absent) or a valid number between 0 and 10'
			}, { status: 400 })
		}

		// Validate min_cgpa <= max_cgpa (allow both to be -1 for absent cases)
		if (minCgpa !== -1 && maxCgpa !== -1 && minCgpa > maxCgpa) {
			return NextResponse.json({
				error: 'Minimum CGPA must be less than or equal to maximum CGPA'
			}, { status: 400 })
		}

		const insertPayload: any = {
			institutions_id: institutionData.id,
			institutions_code: String(body.institutions_code).trim(),
			grade_system_code: gradeSystemCode, // Use validated UG/PG value
			cgpa_grade_id: body.cgpa_grade_id,
			grade: gradeData.grade,
			grade_point: gradeData.grade_point,
			classification: body.classification != null ? String(body.classification).trim() : '',
			min_cgpa: minCgpa,
			max_cgpa: maxCgpa,
			description: String(body.description).trim(),
			regulation_id: body.regulation_id,
			regulation_code: regulationCode,
			is_active: body.is_active ?? true,
		}

		const { data, error } = await supabase
			.from('cgpa_grade_system')
			.insert([insertPayload])
			.select()
			.single()

		if (error) {
			console.error('Error creating curriculum grade system:', error)

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
					error: 'Invalid value. Minimum CGPA must be less than maximum CGPA.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create curriculum grade system' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('Curriculum grade system creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT - Update an existing curriculum grade system
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

		if (body.min_cgpa === undefined || body.min_cgpa === null || body.min_cgpa === '') {
			return NextResponse.json({
				error: 'Minimum CGPA is required'
			}, { status: 400 })
		}

		if (body.max_cgpa === undefined || body.max_cgpa === null || body.max_cgpa === '') {
			return NextResponse.json({
				error: 'Maximum CGPA is required'
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

		// Fetch grade data if cgpa_grade_id is provided
		let grade = body.grade
		let gradePoint = body.grade_point
		if (body.cgpa_grade_id) {
			const { data: gradeData, error: gradeError } = await supabase
				.from('cgpa_grades')
				.select('grade, grade_point')
				.eq('id', body.cgpa_grade_id)
				.single()

			if (gradeError || !gradeData) {
				return NextResponse.json({
					error: `Grade with id "${body.cgpa_grade_id}" not found.`
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

		// Validate min_cgpa and max_cgpa are numeric (allow -1 for absent cases)
		const minCgpa = Number(body.min_cgpa)
		if (isNaN(minCgpa) || (minCgpa !== -1 && (minCgpa < 0 || minCgpa > 10))) {
			return NextResponse.json({
				error: 'Minimum CGPA must be -1 (for absent) or a valid number between 0 and 10'
			}, { status: 400 })
		}

		const maxCgpa = Number(body.max_cgpa)
		if (isNaN(maxCgpa) || (maxCgpa !== -1 && (maxCgpa < 0 || maxCgpa > 10))) {
			return NextResponse.json({
				error: 'Maximum CGPA must be -1 (for absent) or a valid number between 0 and 10'
			}, { status: 400 })
		}

		// Validate min_cgpa <= max_cgpa (allow both to be -1 for absent cases)
		if (minCgpa !== -1 && maxCgpa !== -1 && minCgpa > maxCgpa) {
			return NextResponse.json({
				error: 'Minimum CGPA must be less than or equal to maximum CGPA'
			}, { status: 400 })
		}

		const updatePayload: any = {
			grade_system_code: gradeSystemCode, // Use validated UG/PG value
			classification: body.classification != null ? String(body.classification).trim() : '',
			min_cgpa: minCgpa,
			max_cgpa: maxCgpa,
			description: String(body.description).trim(),
			is_active: body.is_active,
		}

		if (institutionsId) updatePayload.institutions_id = institutionsId
		if (body.institutions_code) updatePayload.institutions_code = String(body.institutions_code).trim()
		if (body.cgpa_grade_id) {
			updatePayload.cgpa_grade_id = body.cgpa_grade_id
			updatePayload.grade = grade
			updatePayload.grade_point = gradePoint
		}
		if (body.regulation_id) updatePayload.regulation_id = body.regulation_id
		if (regulationCode) updatePayload.regulation_code = regulationCode

		const { data, error } = await supabase
			.from('cgpa_grade_system')
			.update(updatePayload)
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('Error updating curriculum grade system:', error)

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
					error: 'Invalid value. Minimum CGPA must be less than maximum CGPA.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update curriculum grade system' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Curriculum grade system update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE - Delete a curriculum grade system
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Grade system ID is required' }, { status: 400 })
		}

		return handleDeleteWithDependencyCheck('cgpa_grade_system', id, request)
	} catch (e) {
		console.error('Curriculum grade system deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
