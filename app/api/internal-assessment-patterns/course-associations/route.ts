import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/internal-assessment-patterns/course-associations
 * Fetch course-pattern associations with optional filters
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const pattern_id = searchParams.get('pattern_id')
		const course_id = searchParams.get('course_id')
		const is_active = searchParams.get('is_active')

		let query = supabase
			.from('pattern_course_associations')
			.select(`
				*,
				internal_assessment_patterns (
					id,
					pattern_code,
					pattern_name,
					status
				),
				courses (
					id,
					course_code,
					course_title
				)
			`)
			.order('effective_from_date', { ascending: false })

		if (pattern_id) {
			query = query.eq('pattern_id', pattern_id)
		}

		if (course_id) {
			query = query.eq('course_id', course_id)
		}

		if (is_active !== null) {
			query = query.eq('is_active', is_active === 'true')
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching course associations:', error)
			return NextResponse.json({ error: 'Failed to fetch course associations' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Course associations GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * POST /api/internal-assessment-patterns/course-associations
 * Create a new course-pattern association
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			pattern_id,
			course_id,
			course_code,
			effective_from_date,
			effective_to_date,
			created_by,
			is_active = true
		} = body

		// Validate required fields
		if (!pattern_id) {
			return NextResponse.json({ error: 'Pattern ID is required' }, { status: 400 })
		}
		if (!course_id) {
			return NextResponse.json({ error: 'Course ID is required' }, { status: 400 })
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

		// Verify course exists and get course_code if not provided
		const { data: courseData, error: courseError } = await supabase
			.from('courses')
			.select('id, course_code')
			.eq('id', course_id)
			.single()

		if (courseError || !courseData) {
			return NextResponse.json({ error: 'Course not found' }, { status: 400 })
		}

		// Check for overlapping associations
		const { data: existingAssoc, error: existingError } = await supabase
			.from('pattern_course_associations')
			.select('id')
			.eq('course_id', course_id)
			.eq('is_active', true)
			.or(`effective_to_date.is.null,effective_to_date.gte.${effective_from_date}`)
			.lte('effective_from_date', effective_to_date || '9999-12-31')

		if (!existingError && existingAssoc && existingAssoc.length > 0) {
			return NextResponse.json({
				error: 'An active association already exists for this course in the specified date range'
			}, { status: 400 })
		}

		const { data, error } = await supabase
			.from('pattern_course_associations')
			.insert({
				pattern_id,
				course_id,
				course_code: course_code || courseData.course_code,
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
				courses (
					id,
					course_code,
					course_title
				)
			`)
			.single()

		if (error) {
			console.error('Error creating course association:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Association already exists for this course and date' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create course association' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Course associations POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * PUT /api/internal-assessment-patterns/course-associations
 * Update an existing course-pattern association
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
			.from('pattern_course_associations')
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
				courses (
					id,
					course_code,
					course_title
				)
			`)
			.single()

		if (error) {
			console.error('Error updating course association:', error)
			return NextResponse.json({ error: 'Failed to update course association' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Course associations PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * DELETE /api/internal-assessment-patterns/course-associations
 * Delete a course-pattern association
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
			.from('pattern_course_associations')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting course association:', error)
			return NextResponse.json({ error: 'Failed to delete course association' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Course associations DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
