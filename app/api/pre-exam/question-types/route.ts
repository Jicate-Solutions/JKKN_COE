import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Question types are per-institution rows, so a mutation must name the
 * institution it is acting on and match the row it targets — otherwise a
 * stale institution_code on the client edits/deletes another institution's
 * type by id.
 */
async function assertTypeInInstitution(
	supabase: ReturnType<typeof getSupabaseServer>,
	id: string,
	institutionCode: string | null | undefined
): Promise<{ error: string; status: number } | null> {
	if (!institutionCode) {
		return { error: 'institution_code is required', status: 400 }
	}
	const { data, error } = await supabase
		.from('ia_question_types')
		.select('id, institution_code')
		.eq('id', id)
		.maybeSingle()

	if (error) return { error: error.message, status: 500 }
	if (!data) return { error: 'Question type not found', status: 404 }
	if (data.institution_code !== institutionCode) {
		return {
			error: `This question type belongs to institution "${data.institution_code}" and cannot be changed from "${institutionCode}"`,
			status: 403,
		}
	}
	return null
}

// GET - list question types (optionally scoped by institution_code)
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const institutionCode = searchParams.get('institution_code')
		const includeInactive = searchParams.get('include_inactive') === 'true'

		let query = supabase
			.from('ia_question_types')
			.select('*')
			.order('display_order', { ascending: true })

		if (institutionCode) query = query.eq('institution_code', institutionCode)
		if (!includeInactive) query = query.eq('is_active', true)

		const { data, error } = await query
		if (error) {
			console.error('Error fetching question types:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in GET question types:', error)
		return NextResponse.json({ error: 'Failed to fetch question types' }, { status: 500 })
	}
}

// POST - create a question type
export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		const {
			institution_code,
			type_code,
			type_label,
			description,
			is_objective,
			has_options,
			default_option_count,
			display_order,
			is_active,
		} = body

		if (!institution_code || !type_code || !type_label) {
			return NextResponse.json(
				{ error: 'Institution code, type code and label are required' },
				{ status: 400 }
			)
		}

		const { data: institution, error: institutionError } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', institution_code)
			.single()

		if (institutionError || !institution) {
			return NextResponse.json(
				{ error: `Institution with code "${institution_code}" not found` },
				{ status: 400 }
			)
		}

		const { data, error } = await supabase
			.from('ia_question_types')
			.insert({
				institutions_id: institution.id,
				institution_code,
				type_code,
				type_label,
				description: description || null,
				is_objective: is_objective || false,
				has_options: has_options || false,
				default_option_count: default_option_count ? parseInt(default_option_count) : null,
				display_order: display_order ? parseInt(display_order) : 1,
				is_active: is_active !== undefined ? is_active : true,
			})
			.select()
			.single()

		if (error) {
			if (error.code === '23505') {
				return NextResponse.json(
					{ error: 'A question type with this code already exists for this institution' },
					{ status: 400 }
				)
			}
			console.error('Error creating question type:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Error in POST question type:', error)
		return NextResponse.json({ error: 'Failed to create question type' }, { status: 500 })
	}
}

// PUT - update a question type
export async function PUT(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		// institution_code is immutable here; it is read only to prove the caller
		// is acting within the institution that owns the row.
		const { id, institution_code: callerInstitutionCode, ...updateData } = body

		if (!id) return NextResponse.json({ error: 'Question type ID is required' }, { status: 400 })

		const ownership = await assertTypeInInstitution(supabase, id, callerInstitutionCode)
		if (ownership) {
			return NextResponse.json({ error: ownership.error }, { status: ownership.status })
		}

		if (updateData.default_option_count !== undefined && updateData.default_option_count !== null) {
			updateData.default_option_count =
				updateData.default_option_count === '' ? null : parseInt(updateData.default_option_count)
		}
		if (updateData.display_order !== undefined) {
			updateData.display_order = parseInt(updateData.display_order) || 1
		}
		// institution + code are immutable after creation
		delete updateData.institutions_id

		const { data, error } = await supabase
			.from('ia_question_types')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Error updating question type:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json(data)
	} catch (error) {
		console.error('Error in PUT question type:', error)
		return NextResponse.json({ error: 'Failed to update question type' }, { status: 500 })
	}
}

// DELETE - remove a question type (blocked if referenced by a template part)
export async function DELETE(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const id = searchParams.get('id')
		if (!id) return NextResponse.json({ error: 'Question type ID is required' }, { status: 400 })

		const ownership = await assertTypeInInstitution(
			supabase,
			id,
			searchParams.get('institution_code')
		)
		if (ownership) {
			return NextResponse.json({ error: ownership.error }, { status: ownership.status })
		}

		// Resolve the type_code to check usage
		const { data: qtype } = await supabase
			.from('ia_question_types')
			.select('institutions_id, type_code')
			.eq('id', id)
			.single()

		if (qtype) {
			const { data: usedByParts } = await supabase
				.from('ia_template_parts')
				.select('id, template:ia_paper_templates!inner(institutions_id)')
				.eq('question_type_code', qtype.type_code)
				.eq('template.institutions_id', qtype.institutions_id)
				.limit(1)

			if (usedByParts && usedByParts.length > 0) {
				return NextResponse.json(
					{ error: 'Cannot delete: this type is used by one or more templates. Disable it instead.' },
					{ status: 400 }
				)
			}
		}

		const { error } = await supabase.from('ia_question_types').delete().eq('id', id)
		if (error) {
			console.error('Error deleting question type:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE question type:', error)
		return NextResponse.json({ error: 'Failed to delete question type' }, { status: 500 })
	}
}
