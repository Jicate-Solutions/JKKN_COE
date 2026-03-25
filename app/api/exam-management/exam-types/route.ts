import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - Fetch all exam types
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionId = searchParams.get('institutions_id')

		let query = supabase
			.from('exam_types')
			.select('*')
			.order('created_at', { ascending: false })

		if (institutionId) {
			query = query.eq('institutions_id', institutionId)
		}

		const { data, error } = await query

		if (error) {
			console.error('Exam types table error:', error)
			return NextResponse.json({ error: 'Failed to fetch exam types' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (e) {
		console.error('Exam types API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Create new exam type
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		// Validate required fields
		if (!body.institutions_id) {
			return NextResponse.json({
				error: 'institutions_id is required'
			}, { status: 400 })
		}

		if (!body.examination_code) {
			return NextResponse.json({
				error: 'examination_code is required'
			}, { status: 400 })
		}

		if (!body.examination_name) {
			return NextResponse.json({
				error: 'examination_name is required'
			}, { status: 400 })
		}

		// Validate grade_system_codes (optional, supports multiple values as comma-separated string or array)
		// Valid values: UG, PG, or combination like "UG,PG"
		let gradeSystemCode: string | null = null
		if (body.grade_system_code) {
			// Handle both array and string inputs
			const codes = Array.isArray(body.grade_system_code)
				? body.grade_system_code
				: body.grade_system_code.split(',').map((c: string) => c.trim())

			const validCodes = ['UG', 'PG']
			const invalidCodes = codes.filter((c: string) => !validCodes.includes(c))

			if (invalidCodes.length > 0) {
				return NextResponse.json({
					error: `Invalid grade_system_code: ${invalidCodes.join(', ')}. Must be UG or PG.`
				}, { status: 400 })
			}

			gradeSystemCode = codes.join(',')
		}

		// Note: regulation_id comes from MyJKKN API and is not validated against local table
		// MyJKKN is the source of truth for regulations
		const regulationId = body.regulation_id || null

		const insertPayload: any = {
			institutions_id: body.institutions_id,
			examination_code: body.examination_code,
			examination_name: body.examination_name,
			grade_system_code: gradeSystemCode,
			regulation_id: regulationId,
			description: body.description || null,
			exam_type: body.exam_type || 'offline',
			is_coe: body.is_coe ?? true,
			is_active: body.is_active ?? true,
		}

		const { data, error } = await supabase
			.from('exam_types')
			.insert([insertPayload])
			.select()
			.single()

		if (error) {
			console.error('Error creating exam type:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Exam type already exists. Please use different examination code for this institution.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select a valid institution or regulation.'
				}, { status: 400 })
			}

			// Handle check constraint violation (invalid grade_system_code)
			if (error.code === '23514') {
				return NextResponse.json({
					error: 'Invalid grade_system_code. Must be UG or PG.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create exam type' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (e) {
		console.error('Exam type creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT - Update exam type
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		if (!body.id) {
			return NextResponse.json({ error: 'Exam type ID is required' }, { status: 400 })
		}

		// Validate grade_system_codes (optional, supports multiple values as comma-separated string or array)
		// Valid values: UG, PG, or combination like "UG,PG"
		let gradeSystemCode: string | null = null
		if (body.grade_system_code) {
			// Handle both array and string inputs
			const codes = Array.isArray(body.grade_system_code)
				? body.grade_system_code
				: body.grade_system_code.split(',').map((c: string) => c.trim())

			const validCodes = ['UG', 'PG']
			const invalidCodes = codes.filter((c: string) => !validCodes.includes(c))

			if (invalidCodes.length > 0) {
				return NextResponse.json({
					error: `Invalid grade_system_code: ${invalidCodes.join(', ')}. Must be UG or PG.`
				}, { status: 400 })
			}

			gradeSystemCode = codes.join(',')
		}

		// Note: regulation_id comes from MyJKKN API and is not validated against local table
		// MyJKKN is the source of truth for regulations
		const regulationId = body.regulation_id || null

		const updatePayload: any = {
			examination_code: body.examination_code,
			examination_name: body.examination_name,
			grade_system_code: gradeSystemCode,
			regulation_id: regulationId,
			description: body.description || null,
			exam_type: body.exam_type || 'offline',
			is_coe: body.is_coe,
			is_active: body.is_active,
		}

		const { data, error } = await supabase
			.from('exam_types')
			.update(updatePayload)
			.eq('id', body.id)
			.select()
			.single()

		if (error) {
			console.error('Error updating exam type:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'Exam type already exists. Please use different examination code for this institution.'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid reference. Please select a valid regulation.'
				}, { status: 400 })
			}

			// Handle check constraint violation (invalid grade_system_code)
			if (error.code === '23514') {
				return NextResponse.json({
					error: 'Invalid grade_system_code. Must be UG or PG.'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update exam type' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Exam type update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE - Delete exam type
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Exam type ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { error } = await supabase
			.from('exam_types')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting exam type:', error)
			return NextResponse.json({ error: 'Failed to delete exam type' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('Exam type deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
