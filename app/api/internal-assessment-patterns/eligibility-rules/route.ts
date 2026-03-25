import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/internal-assessment-patterns/eligibility-rules
 * Fetch eligibility rules with optional filters
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const pattern_id = searchParams.get('pattern_id')
		const is_active = searchParams.get('is_active')

		let query = supabase
			.from('internal_assessment_eligibility_rules')
			.select('*')
			.order('priority_order', { ascending: true })

		if (pattern_id) {
			query = query.eq('pattern_id', pattern_id)
		}

		if (is_active !== null) {
			query = query.eq('is_active', is_active === 'true')
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching eligibility rules:', error)
			return NextResponse.json({ error: 'Failed to fetch eligibility rules' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Eligibility rules GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * POST /api/internal-assessment-patterns/eligibility-rules
 * Create a new eligibility rule
 */
export async function POST(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			pattern_id,
			rule_code,
			rule_name,
			rule_description,
			minimum_overall_percentage,
			minimum_attendance_percentage,
			mandatory_components_completion,
			minimum_components_completion_percentage,
			condonation_allowed,
			condonation_percentage_limit,
			priority_order,
			is_active = true
		} = body

		// Validate required fields
		if (!pattern_id) {
			return NextResponse.json({ error: 'Pattern ID is required' }, { status: 400 })
		}
		if (!rule_code?.trim()) {
			return NextResponse.json({ error: 'Rule code is required' }, { status: 400 })
		}
		if (!rule_name?.trim()) {
			return NextResponse.json({ error: 'Rule name is required' }, { status: 400 })
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

		// Validate percentage fields
		if (minimum_overall_percentage !== null && minimum_overall_percentage !== undefined) {
			if (minimum_overall_percentage < 0 || minimum_overall_percentage > 100) {
				return NextResponse.json({ error: 'Minimum overall percentage must be between 0 and 100' }, { status: 400 })
			}
		}

		if (minimum_attendance_percentage !== null && minimum_attendance_percentage !== undefined) {
			if (minimum_attendance_percentage < 0 || minimum_attendance_percentage > 100) {
				return NextResponse.json({ error: 'Minimum attendance percentage must be between 0 and 100' }, { status: 400 })
			}
		}

		if (condonation_percentage_limit !== null && condonation_percentage_limit !== undefined) {
			if (condonation_percentage_limit < 0 || condonation_percentage_limit > 100) {
				return NextResponse.json({ error: 'Condonation percentage limit must be between 0 and 100' }, { status: 400 })
			}
		}

		const { data, error } = await supabase
			.from('internal_assessment_eligibility_rules')
			.insert({
				pattern_id,
				rule_code: rule_code.trim(),
				rule_name: rule_name.trim(),
				rule_description: rule_description?.trim() || null,
				minimum_overall_percentage: minimum_overall_percentage || null,
				minimum_attendance_percentage: minimum_attendance_percentage || null,
				mandatory_components_completion: mandatory_components_completion ?? true,
				minimum_components_completion_percentage: minimum_components_completion_percentage || null,
				condonation_allowed: condonation_allowed ?? false,
				condonation_percentage_limit: condonation_percentage_limit || null,
				priority_order: priority_order || 1,
				is_active
			})
			.select('*')
			.single()

		if (error) {
			console.error('Error creating eligibility rule:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Rule with this code already exists for this pattern' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create eligibility rule' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Eligibility rules POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * PUT /api/internal-assessment-patterns/eligibility-rules
 * Update an existing eligibility rule
 */
export async function PUT(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const {
			id,
			rule_code,
			rule_name,
			rule_description,
			minimum_overall_percentage,
			minimum_attendance_percentage,
			mandatory_components_completion,
			minimum_components_completion_percentage,
			condonation_allowed,
			condonation_percentage_limit,
			priority_order,
			is_active
		} = body

		if (!id) {
			return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 })
		}

		// Validate percentage fields
		if (minimum_overall_percentage !== null && minimum_overall_percentage !== undefined) {
			if (minimum_overall_percentage < 0 || minimum_overall_percentage > 100) {
				return NextResponse.json({ error: 'Minimum overall percentage must be between 0 and 100' }, { status: 400 })
			}
		}

		if (minimum_attendance_percentage !== null && minimum_attendance_percentage !== undefined) {
			if (minimum_attendance_percentage < 0 || minimum_attendance_percentage > 100) {
				return NextResponse.json({ error: 'Minimum attendance percentage must be between 0 and 100' }, { status: 400 })
			}
		}

		const updateData: Record<string, unknown> = {}
		if (rule_code !== undefined) updateData.rule_code = rule_code.trim()
		if (rule_name !== undefined) updateData.rule_name = rule_name.trim()
		if (rule_description !== undefined) updateData.rule_description = rule_description?.trim() || null
		if (minimum_overall_percentage !== undefined) updateData.minimum_overall_percentage = minimum_overall_percentage
		if (minimum_attendance_percentage !== undefined) updateData.minimum_attendance_percentage = minimum_attendance_percentage
		if (mandatory_components_completion !== undefined) updateData.mandatory_components_completion = mandatory_components_completion
		if (minimum_components_completion_percentage !== undefined) updateData.minimum_components_completion_percentage = minimum_components_completion_percentage
		if (condonation_allowed !== undefined) updateData.condonation_allowed = condonation_allowed
		if (condonation_percentage_limit !== undefined) updateData.condonation_percentage_limit = condonation_percentage_limit
		if (priority_order !== undefined) updateData.priority_order = priority_order
		if (is_active !== undefined) updateData.is_active = is_active

		const { data, error } = await supabase
			.from('internal_assessment_eligibility_rules')
			.update(updateData)
			.eq('id', id)
			.select('*')
			.single()

		if (error) {
			console.error('Error updating eligibility rule:', error)
			return NextResponse.json({ error: 'Failed to update eligibility rule' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Eligibility rules PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * DELETE /api/internal-assessment-patterns/eligibility-rules
 * Delete an eligibility rule
 */
export async function DELETE(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 })
		}

		const { error } = await supabase
			.from('internal_assessment_eligibility_rules')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting eligibility rule:', error)
			return NextResponse.json({ error: 'Failed to delete eligibility rule' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Eligibility rules DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
