import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/internal-assessment-patterns/passing-rules
 * Fetch passing rules with optional filters
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const pattern_id = searchParams.get('pattern_id')
		const is_active = searchParams.get('is_active')

		let query = supabase
			.from('internal_assessment_passing_rules')
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
			console.error('Error fetching passing rules:', error)
			return NextResponse.json({ error: 'Failed to fetch passing rules' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Passing rules GET error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * POST /api/internal-assessment-patterns/passing-rules
 * Create a new passing rule
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
			minimum_pass_percentage,
			component_wise_minimum_enabled,
			component_wise_minimum_percentage,
			grace_mark_enabled,
			grace_mark_percentage_limit,
			grace_mark_conditions,
			apply_rounding_before_pass_check,
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
		if (minimum_pass_percentage === null || minimum_pass_percentage === undefined) {
			return NextResponse.json({ error: 'Minimum pass percentage is required' }, { status: 400 })
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
		if (minimum_pass_percentage < 0 || minimum_pass_percentage > 100) {
			return NextResponse.json({ error: 'Minimum pass percentage must be between 0 and 100' }, { status: 400 })
		}

		if (component_wise_minimum_percentage !== null && component_wise_minimum_percentage !== undefined) {
			if (component_wise_minimum_percentage < 0 || component_wise_minimum_percentage > 100) {
				return NextResponse.json({ error: 'Component-wise minimum percentage must be between 0 and 100' }, { status: 400 })
			}
		}

		if (grace_mark_percentage_limit !== null && grace_mark_percentage_limit !== undefined) {
			if (grace_mark_percentage_limit < 0 || grace_mark_percentage_limit > 100) {
				return NextResponse.json({ error: 'Grace mark percentage limit must be between 0 and 100' }, { status: 400 })
			}
		}

		const { data, error } = await supabase
			.from('internal_assessment_passing_rules')
			.insert({
				pattern_id,
				rule_code: rule_code.trim(),
				rule_name: rule_name.trim(),
				rule_description: rule_description?.trim() || null,
				minimum_pass_percentage,
				component_wise_minimum_enabled: component_wise_minimum_enabled ?? false,
				component_wise_minimum_percentage: component_wise_minimum_percentage || null,
				grace_mark_enabled: grace_mark_enabled ?? false,
				grace_mark_percentage_limit: grace_mark_percentage_limit || null,
				grace_mark_conditions: grace_mark_conditions || null,
				apply_rounding_before_pass_check: apply_rounding_before_pass_check ?? true,
				priority_order: priority_order || 1,
				is_active
			})
			.select('*')
			.single()

		if (error) {
			console.error('Error creating passing rule:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'Rule with this code already exists for this pattern' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create passing rule' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Passing rules POST error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * PUT /api/internal-assessment-patterns/passing-rules
 * Update an existing passing rule
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
			minimum_pass_percentage,
			component_wise_minimum_enabled,
			component_wise_minimum_percentage,
			grace_mark_enabled,
			grace_mark_percentage_limit,
			grace_mark_conditions,
			apply_rounding_before_pass_check,
			priority_order,
			is_active
		} = body

		if (!id) {
			return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 })
		}

		// Validate percentage fields
		if (minimum_pass_percentage !== undefined) {
			if (minimum_pass_percentage < 0 || minimum_pass_percentage > 100) {
				return NextResponse.json({ error: 'Minimum pass percentage must be between 0 and 100' }, { status: 400 })
			}
		}

		if (component_wise_minimum_percentage !== null && component_wise_minimum_percentage !== undefined) {
			if (component_wise_minimum_percentage < 0 || component_wise_minimum_percentage > 100) {
				return NextResponse.json({ error: 'Component-wise minimum percentage must be between 0 and 100' }, { status: 400 })
			}
		}

		const updateData: Record<string, unknown> = {}
		if (rule_code !== undefined) updateData.rule_code = rule_code.trim()
		if (rule_name !== undefined) updateData.rule_name = rule_name.trim()
		if (rule_description !== undefined) updateData.rule_description = rule_description?.trim() || null
		if (minimum_pass_percentage !== undefined) updateData.minimum_pass_percentage = minimum_pass_percentage
		if (component_wise_minimum_enabled !== undefined) updateData.component_wise_minimum_enabled = component_wise_minimum_enabled
		if (component_wise_minimum_percentage !== undefined) updateData.component_wise_minimum_percentage = component_wise_minimum_percentage
		if (grace_mark_enabled !== undefined) updateData.grace_mark_enabled = grace_mark_enabled
		if (grace_mark_percentage_limit !== undefined) updateData.grace_mark_percentage_limit = grace_mark_percentage_limit
		if (grace_mark_conditions !== undefined) updateData.grace_mark_conditions = grace_mark_conditions
		if (apply_rounding_before_pass_check !== undefined) updateData.apply_rounding_before_pass_check = apply_rounding_before_pass_check
		if (priority_order !== undefined) updateData.priority_order = priority_order
		if (is_active !== undefined) updateData.is_active = is_active

		const { data, error } = await supabase
			.from('internal_assessment_passing_rules')
			.update(updateData)
			.eq('id', id)
			.select('*')
			.single()

		if (error) {
			console.error('Error updating passing rule:', error)
			return NextResponse.json({ error: 'Failed to update passing rule' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Passing rules PUT error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * DELETE /api/internal-assessment-patterns/passing-rules
 * Delete a passing rule
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
			.from('internal_assessment_passing_rules')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting passing rule:', error)
			return NextResponse.json({ error: 'Failed to delete passing rule' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Passing rules DELETE error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
