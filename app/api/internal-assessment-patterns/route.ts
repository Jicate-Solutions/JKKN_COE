import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - Fetch all internal assessment patterns with optional filters
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)

		// Optional filters
		const institutionCode = searchParams.get('institution_code')
		const regulationCode = searchParams.get('regulation_code')
		const courseType = searchParams.get('course_type')
		const programType = searchParams.get('program_type')
		const status = searchParams.get('status')

		let query = supabase
			.from('internal_assessment_patterns')
			.select(`
				*,
				internal_assessment_components (
					id,
					component_code,
					component_name,
					weightage_percentage,
					display_order,
					is_mandatory,
					has_sub_components,
					calculation_method,
					best_of_count,
					is_active,
					internal_assessment_sub_components (
						id,
						sub_component_code,
						sub_component_name,
						sub_weightage_percentage,
						instance_number,
						display_order,
						is_active
					)
				),
				internal_assessment_eligibility_rules (
					id,
					rule_code,
					rule_name,
					minimum_overall_percentage,
					minimum_attendance_percentage,
					mandatory_components_completion,
					condonation_allowed,
					is_active
				),
				internal_assessment_passing_rules (
					id,
					rule_code,
					rule_name,
					minimum_pass_percentage,
					component_wise_minimum_enabled,
					grace_mark_enabled,
					is_active
				)
			`)
			.order('created_at', { ascending: false })

		// Apply filters
		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		}
		if (regulationCode) {
			query = query.eq('regulation_code', regulationCode)
		}
		if (courseType && courseType !== 'all') {
			query = query.or(`course_type_applicability.eq.${courseType},course_type_applicability.eq.all`)
		}
		if (programType && programType !== 'all') {
			query = query.or(`program_type_applicability.eq.${programType},program_type_applicability.eq.all`)
		}
		if (status) {
			query = query.eq('status', status)
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching patterns:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in GET patterns:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch internal assessment patterns' },
			{ status: 500 }
		)
	}
}

// POST - Create a new internal assessment pattern
export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()

		const {
			institution_code,
			regulation_code,
			pattern_code,
			pattern_name,
			description,
			course_type_applicability,
			program_type_applicability,
			program_category_applicability,
			assessment_frequency,
			assessment_periods_per_semester,
			wef_date,
			wef_batch_code,
			rounding_method,
			decimal_precision,
			is_default,
			is_active,
			components, // Optional: array of components to create
			eligibility_rules, // Optional: array of eligibility rules
			passing_rules, // Optional: array of passing rules
		} = body

		// Validate required fields
		if (!institution_code || !pattern_code || !pattern_name || !wef_date) {
			return NextResponse.json(
				{ error: 'Institution code, pattern code, pattern name, and W.E.F date are required' },
				{ status: 400 }
			)
		}

		// Lookup institution
		const { data: institutionData, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', institution_code)
			.single()

		if (institutionError || !institutionData) {
			return NextResponse.json(
				{ error: `Institution with code "${institution_code}" not found` },
				{ status: 400 }
			)
		}

		// Lookup regulation if provided
		let regulationId = null
		if (regulation_code) {
			const { data: regulationData, error: regulationError } = await supabase
				.from('regulations')
				.select('id')
				.eq('regulation_code', regulation_code)
				.single()

			if (regulationError || !regulationData) {
				return NextResponse.json(
					{ error: `Regulation with code "${regulation_code}" not found` },
					{ status: 400 }
				)
			}
			regulationId = regulationData.id
		}

		// Get next version number for this pattern
		const { data: existingPattern } = await supabase
			.from('internal_assessment_patterns')
			.select('version_number')
			.eq('institutions_id', institutionData.id)
			.eq('pattern_code', pattern_code)
			.order('version_number', { ascending: false })
			.limit(1)
			.single()

		const versionNumber = existingPattern ? existingPattern.version_number + 1 : 1

		// Create the pattern
		const { data: patternData, error: patternError } = await supabase
			.from('internal_assessment_patterns')
			.insert({
				institutions_id: institutionData.id,
				institution_code,
				regulation_id: regulationId,
				regulation_code: regulation_code || null,
				pattern_code,
				pattern_name,
				description: description || null,
				course_type_applicability: course_type_applicability || 'all',
				program_type_applicability: program_type_applicability || 'all',
				program_category_applicability: program_category_applicability || 'all',
				assessment_frequency: assessment_frequency || 'semester',
				assessment_periods_per_semester: assessment_periods_per_semester || 1,
				wef_date,
				wef_batch_code: wef_batch_code || null,
				version_number: versionNumber,
				rounding_method: rounding_method || 'round',
				decimal_precision: decimal_precision || 2,
				status: 'draft',
				is_default: is_default || false,
				is_active: is_active !== undefined ? is_active : true,
			})
			.select()
			.single()

		if (patternError) {
			console.error('Error creating pattern:', patternError)

			if (patternError.code === '23505') {
				return NextResponse.json(
					{ error: 'Pattern with this code and version already exists' },
					{ status: 400 }
				)
			}

			return NextResponse.json({ error: patternError.message }, { status: 500 })
		}

		// Create components if provided
		if (components && Array.isArray(components) && components.length > 0) {
			const componentsToInsert = components.map((comp: any, index: number) => ({
				pattern_id: patternData.id,
				component_code: comp.component_code,
				component_name: comp.component_name,
				component_description: comp.component_description || null,
				weightage_percentage: parseFloat(comp.weightage_percentage),
				display_order: comp.display_order || index + 1,
				is_visible_to_learner: comp.is_visible_to_learner !== undefined ? comp.is_visible_to_learner : true,
				is_mandatory: comp.is_mandatory !== undefined ? comp.is_mandatory : true,
				can_be_waived: comp.can_be_waived || false,
				waiver_requires_approval: comp.waiver_requires_approval !== undefined ? comp.waiver_requires_approval : true,
				has_sub_components: comp.has_sub_components || false,
				calculation_method: comp.calculation_method || 'sum',
				best_of_count: comp.best_of_count || null,
				requires_scheduled_exam: comp.requires_scheduled_exam || false,
				allows_continuous_assessment: comp.allows_continuous_assessment !== undefined ? comp.allows_continuous_assessment : true,
				is_active: comp.is_active !== undefined ? comp.is_active : true,
			}))

			const { error: componentsError } = await supabase
				.from('internal_assessment_components')
				.insert(componentsToInsert)

			if (componentsError) {
				console.error('Error creating components:', componentsError)
				// Pattern is created, log the error but don't fail
			}
		}

		// Create eligibility rules if provided
		if (eligibility_rules && Array.isArray(eligibility_rules) && eligibility_rules.length > 0) {
			const rulesToInsert = eligibility_rules.map((rule: any, index: number) => ({
				pattern_id: patternData.id,
				rule_code: rule.rule_code,
				rule_name: rule.rule_name,
				rule_description: rule.rule_description || null,
				minimum_overall_percentage: rule.minimum_overall_percentage || null,
				minimum_attendance_percentage: rule.minimum_attendance_percentage || null,
				mandatory_components_completion: rule.mandatory_components_completion !== undefined ? rule.mandatory_components_completion : true,
				minimum_components_completion_percentage: rule.minimum_components_completion_percentage || null,
				condonation_allowed: rule.condonation_allowed || false,
				condonation_percentage_limit: rule.condonation_percentage_limit || null,
				priority_order: rule.priority_order || index + 1,
				is_active: rule.is_active !== undefined ? rule.is_active : true,
			}))

			const { error: rulesError } = await supabase
				.from('internal_assessment_eligibility_rules')
				.insert(rulesToInsert)

			if (rulesError) {
				console.error('Error creating eligibility rules:', rulesError)
			}
		}

		// Create passing rules if provided
		if (passing_rules && Array.isArray(passing_rules) && passing_rules.length > 0) {
			const rulesToInsert = passing_rules.map((rule: any, index: number) => ({
				pattern_id: patternData.id,
				rule_code: rule.rule_code,
				rule_name: rule.rule_name,
				rule_description: rule.rule_description || null,
				minimum_pass_percentage: parseFloat(rule.minimum_pass_percentage),
				component_wise_minimum_enabled: rule.component_wise_minimum_enabled || false,
				component_wise_minimum_percentage: rule.component_wise_minimum_percentage || null,
				grace_mark_enabled: rule.grace_mark_enabled || false,
				grace_mark_percentage_limit: rule.grace_mark_percentage_limit || null,
				grace_mark_conditions: rule.grace_mark_conditions || null,
				apply_rounding_before_pass_check: rule.apply_rounding_before_pass_check !== undefined ? rule.apply_rounding_before_pass_check : true,
				priority_order: rule.priority_order || index + 1,
				is_active: rule.is_active !== undefined ? rule.is_active : true,
			}))

			const { error: rulesError } = await supabase
				.from('internal_assessment_passing_rules')
				.insert(rulesToInsert)

			if (rulesError) {
				console.error('Error creating passing rules:', rulesError)
			}
		}

		// Fetch the complete pattern with all relations
		const { data: completePattern, error: fetchError } = await supabase
			.from('internal_assessment_patterns')
			.select(`
				*,
				internal_assessment_components (
					*,
					internal_assessment_sub_components (*)
				),
				internal_assessment_eligibility_rules (*),
				internal_assessment_passing_rules (*)
			`)
			.eq('id', patternData.id)
			.single()

		if (fetchError) {
			return NextResponse.json(patternData, { status: 201 })
		}

		return NextResponse.json(completePattern, { status: 201 })
	} catch (error) {
		console.error('Error in POST pattern:', error)
		return NextResponse.json(
			{ error: 'Failed to create internal assessment pattern' },
			{ status: 500 }
		)
	}
}

// PUT - Update an existing pattern
export async function PUT(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()

		const { id, ...updateData } = body

		if (!id) {
			return NextResponse.json({ error: 'Pattern ID is required' }, { status: 400 })
		}

		// If institution_code is being updated, lookup the new institution
		if (updateData.institution_code) {
			const { data: institutionData, error: institutionError } = await supabase
				.from('institutions')
				.select('id')
				.eq('institution_code', updateData.institution_code)
				.single()

			if (institutionError || !institutionData) {
				return NextResponse.json(
					{ error: `Institution with code "${updateData.institution_code}" not found` },
					{ status: 400 }
				)
			}
			updateData.institutions_id = institutionData.id
		}

		// If regulation_code is being updated, lookup the new regulation
		if (updateData.regulation_code) {
			const { data: regulationData, error: regulationError } = await supabase
				.from('regulations')
				.select('id')
				.eq('regulation_code', updateData.regulation_code)
				.single()

			if (regulationError || !regulationData) {
				return NextResponse.json(
					{ error: `Regulation with code "${updateData.regulation_code}" not found` },
					{ status: 400 }
				)
			}
			updateData.regulation_id = regulationData.id
		}

		// Remove nested data that shouldn't be in the update
		delete updateData.components
		delete updateData.eligibility_rules
		delete updateData.passing_rules
		delete updateData.internal_assessment_components
		delete updateData.internal_assessment_eligibility_rules
		delete updateData.internal_assessment_passing_rules

		const { data, error } = await supabase
			.from('internal_assessment_patterns')
			.update(updateData)
			.eq('id', id)
			.select(`
				*,
				internal_assessment_components (
					*,
					internal_assessment_sub_components (*)
				),
				internal_assessment_eligibility_rules (*),
				internal_assessment_passing_rules (*)
			`)
			.single()

		if (error) {
			console.error('Error updating pattern:', error)

			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'Pattern with this configuration already exists' },
					{ status: 400 }
				)
			}

			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in PUT pattern:', error)
		return NextResponse.json(
			{ error: 'Failed to update internal assessment pattern' },
			{ status: 500 }
		)
	}
}

// DELETE - Delete a pattern
export async function DELETE(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Pattern ID is required' }, { status: 400 })
		}

		// Check if pattern is in use (has course or program associations)
		const { data: courseAssociations } = await supabase
			.from('pattern_course_associations')
			.select('id')
			.eq('pattern_id', id)
			.limit(1)

		if (courseAssociations && courseAssociations.length > 0) {
			return NextResponse.json(
				{ error: 'Cannot delete pattern that is associated with courses. Remove associations first.' },
				{ status: 400 }
			)
		}

		const { data: programAssociations } = await supabase
			.from('pattern_program_associations')
			.select('id')
			.eq('pattern_id', id)
			.limit(1)

		if (programAssociations && programAssociations.length > 0) {
			return NextResponse.json(
				{ error: 'Cannot delete pattern that is associated with programs. Remove associations first.' },
				{ status: 400 }
			)
		}

		// Delete the pattern (cascades to components, sub-components, and rules)
		const { error } = await supabase
			.from('internal_assessment_patterns')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting pattern:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE pattern:', error)
		return NextResponse.json(
			{ error: 'Failed to delete internal assessment pattern' },
			{ status: 500 }
		)
	}
}
