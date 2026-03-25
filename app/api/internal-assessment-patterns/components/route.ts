import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - Fetch components for a pattern
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const patternId = searchParams.get('pattern_id')

		if (!patternId) {
			return NextResponse.json({ error: 'Pattern ID is required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('internal_assessment_components')
			.select(`
				*,
				internal_assessment_sub_components (*)
			`)
			.eq('pattern_id', patternId)
			.order('display_order', { ascending: true })

		if (error) {
			console.error('Error fetching components:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in GET components:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch components' },
			{ status: 500 }
		)
	}
}

// POST - Create a new component
export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()

		const {
			pattern_id,
			component_code,
			component_name,
			component_description,
			weightage_percentage,
			display_order,
			is_visible_to_learner,
			is_mandatory,
			can_be_waived,
			waiver_requires_approval,
			has_sub_components,
			calculation_method,
			best_of_count,
			requires_scheduled_exam,
			allows_continuous_assessment,
			is_active,
			sub_components, // Optional: array of sub-components to create
		} = body

		if (!pattern_id || !component_code || !component_name || weightage_percentage === undefined) {
			return NextResponse.json(
				{ error: 'Pattern ID, component code, name, and weightage percentage are required' },
				{ status: 400 }
			)
		}

		// Validate weightage percentage
		const weightage = parseFloat(weightage_percentage)
		if (isNaN(weightage) || weightage < 0 || weightage > 100) {
			return NextResponse.json(
				{ error: 'Weightage percentage must be between 0 and 100' },
				{ status: 400 }
			)
		}

		// Check total weightage won't exceed 100%
		const { data: existingComponents } = await supabase
			.from('internal_assessment_components')
			.select('weightage_percentage')
			.eq('pattern_id', pattern_id)
			.eq('is_active', true)

		const currentTotal = existingComponents?.reduce(
			(sum, comp) => sum + parseFloat(comp.weightage_percentage || '0'),
			0
		) || 0

		if (currentTotal + weightage > 100) {
			return NextResponse.json(
				{ error: `Total weightage would exceed 100%. Current total: ${currentTotal}%, adding: ${weightage}%` },
				{ status: 400 }
			)
		}

		// Create the component
		const { data: componentData, error: componentError } = await supabase
			.from('internal_assessment_components')
			.insert({
				pattern_id,
				component_code,
				component_name,
				component_description: component_description || null,
				weightage_percentage: weightage,
				display_order: display_order || 1,
				is_visible_to_learner: is_visible_to_learner !== undefined ? is_visible_to_learner : true,
				is_mandatory: is_mandatory !== undefined ? is_mandatory : true,
				can_be_waived: can_be_waived || false,
				waiver_requires_approval: waiver_requires_approval !== undefined ? waiver_requires_approval : true,
				has_sub_components: has_sub_components || false,
				calculation_method: calculation_method || 'sum',
				best_of_count: best_of_count || null,
				requires_scheduled_exam: requires_scheduled_exam || false,
				allows_continuous_assessment: allows_continuous_assessment !== undefined ? allows_continuous_assessment : true,
				is_active: is_active !== undefined ? is_active : true,
			})
			.select()
			.single()

		if (componentError) {
			console.error('Error creating component:', componentError)

			if (componentError.code === '23505') {
				return NextResponse.json(
					{ error: 'Component with this code already exists for this pattern' },
					{ status: 400 }
				)
			}

			return NextResponse.json({ error: componentError.message }, { status: 500 })
		}

		// Create sub-components if provided
		if (sub_components && Array.isArray(sub_components) && sub_components.length > 0) {
			const subComponentsToInsert = sub_components.map((sub: any, index: number) => ({
				component_id: componentData.id,
				sub_component_code: sub.sub_component_code,
				sub_component_name: sub.sub_component_name,
				sub_component_description: sub.sub_component_description || null,
				sub_weightage_percentage: parseFloat(sub.sub_weightage_percentage),
				instance_number: sub.instance_number || index + 1,
				display_order: sub.display_order || index + 1,
				scheduled_period: sub.scheduled_period || null,
				is_active: sub.is_active !== undefined ? sub.is_active : true,
			}))

			const { error: subComponentsError } = await supabase
				.from('internal_assessment_sub_components')
				.insert(subComponentsToInsert)

			if (subComponentsError) {
				console.error('Error creating sub-components:', subComponentsError)
			}
		}

		// Fetch the complete component with sub-components
		const { data: completeComponent, error: fetchError } = await supabase
			.from('internal_assessment_components')
			.select(`
				*,
				internal_assessment_sub_components (*)
			`)
			.eq('id', componentData.id)
			.single()

		if (fetchError) {
			return NextResponse.json(componentData, { status: 201 })
		}

		return NextResponse.json(completeComponent, { status: 201 })
	} catch (error) {
		console.error('Error in POST component:', error)
		return NextResponse.json(
			{ error: 'Failed to create component' },
			{ status: 500 }
		)
	}
}

// PUT - Update a component
export async function PUT(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()

		const { id, ...updateData } = body

		if (!id) {
			return NextResponse.json({ error: 'Component ID is required' }, { status: 400 })
		}

		// Validate weightage if being updated
		if (updateData.weightage_percentage !== undefined) {
			const weightage = parseFloat(updateData.weightage_percentage)
			if (isNaN(weightage) || weightage < 0 || weightage > 100) {
				return NextResponse.json(
					{ error: 'Weightage percentage must be between 0 and 100' },
					{ status: 400 }
				)
			}

			// Get current component and check total
			const { data: currentComponent } = await supabase
				.from('internal_assessment_components')
				.select('pattern_id, weightage_percentage')
				.eq('id', id)
				.single()

			if (currentComponent) {
				const { data: existingComponents } = await supabase
					.from('internal_assessment_components')
					.select('weightage_percentage')
					.eq('pattern_id', currentComponent.pattern_id)
					.eq('is_active', true)
					.neq('id', id)

				const otherTotal = existingComponents?.reduce(
					(sum, comp) => sum + parseFloat(comp.weightage_percentage || '0'),
					0
				) || 0

				if (otherTotal + weightage > 100) {
					return NextResponse.json(
						{ error: `Total weightage would exceed 100%. Other components: ${otherTotal}%, this component: ${weightage}%` },
						{ status: 400 }
					)
				}
			}

			updateData.weightage_percentage = weightage
		}

		// Remove nested data
		delete updateData.internal_assessment_sub_components

		const { data, error } = await supabase
			.from('internal_assessment_components')
			.update(updateData)
			.eq('id', id)
			.select(`
				*,
				internal_assessment_sub_components (*)
			`)
			.single()

		if (error) {
			console.error('Error updating component:', error)

			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'Component with this code already exists for this pattern' },
					{ status: 400 }
				)
			}

			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in PUT component:', error)
		return NextResponse.json(
			{ error: 'Failed to update component' },
			{ status: 500 }
		)
	}
}

// DELETE - Delete a component
export async function DELETE(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'Component ID is required' }, { status: 400 })
		}

		// Delete the component (cascades to sub-components)
		const { error } = await supabase
			.from('internal_assessment_components')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting component:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE component:', error)
		return NextResponse.json(
			{ error: 'Failed to delete component' },
			{ status: 500 }
		)
	}
}
