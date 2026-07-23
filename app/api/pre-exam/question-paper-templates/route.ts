import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

function normalizePart(part: any, index: number) {
	return {
		part_label: part.part_label,
		part_title: part.part_title || null,
		instruction: part.instruction || null,
		question_type_code: part.question_type_code,
		num_questions: parseInt(part.num_questions) || 0,
		// "Answer any N" — empty/0 means answer ALL questions (stored as NULL)
		num_to_answer:
			part.num_to_answer === '' || part.num_to_answer === null || part.num_to_answer === undefined
				? null
				: parseInt(part.num_to_answer) || null,
		marks_per_question: parseFloat(part.marks_per_question) || 0,
		has_choice: part.has_choice || false,
		choice_group_size: parseInt(part.choice_group_size) || 1,
		option_count:
			part.option_count === '' || part.option_count === null || part.option_count === undefined
				? null
				: parseInt(part.option_count),
		capture_co: part.capture_co !== undefined ? part.capture_co : true,
		capture_klevel: part.capture_klevel !== undefined ? part.capture_klevel : true,
		display_order: part.display_order ? parseInt(part.display_order) : index + 1,
	}
}

// GET - list templates with parts
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const institutionCode = searchParams.get('institution_code')
		const examScope = searchParams.get('exam_scope')
		const status = searchParams.get('status')

		let query = supabase
			.from('ia_paper_templates')
			.select('*, ia_template_parts(*)')
			.order('created_at', { ascending: false })

		if (institutionCode) query = query.eq('institution_code', institutionCode)
		if (examScope && examScope !== 'all') {
			query = query.or(`exam_scope.eq.${examScope},exam_scope.eq.all`)
		}
		if (status) query = query.eq('status', status)

		const { data, error } = await query
		if (error) {
			console.error('Error fetching templates:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		// Sort parts by display_order (nested order() is unavailable on embedded selects here)
		const sorted = (data || []).map((t: any) => ({
			...t,
			ia_template_parts: (t.ia_template_parts || []).sort(
				(a: any, b: any) => a.display_order - b.display_order
			),
		}))
		return NextResponse.json(sorted)
	} catch (error) {
		console.error('Error in GET templates:', error)
		return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
	}
}

// POST - create a template with its parts
export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		const {
			institution_code,
			regulation_code,
			template_code,
			template_name,
			description,
			exam_scope,
			course_type_applicability,
			program_type_applicability,
			duration_minutes,
			capture_co,
			capture_klevel,
			wef_date,
			is_default,
			is_active,
			parts,
		} = body

		if (!institution_code || !template_code || !template_name) {
			return NextResponse.json(
				{ error: 'Institution code, template code and template name are required' },
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

		let regulationId: string | null = null
		if (regulation_code) {
			const { data: regulation } = await supabase
				.from('regulations')
				.select('id')
				.eq('regulation_code', regulation_code)
				.single()
			regulationId = regulation?.id || null
		}

		// Next version for this template code
		const { data: existing } = await supabase
			.from('ia_paper_templates')
			.select('version_number')
			.eq('institutions_id', institution.id)
			.eq('template_code', template_code)
			.order('version_number', { ascending: false })
			.limit(1)
			.maybeSingle()

		const versionNumber = existing ? existing.version_number + 1 : 1

		const { data: template, error: templateError } = await supabase
			.from('ia_paper_templates')
			.insert({
				institutions_id: institution.id,
				institution_code,
				regulation_id: regulationId,
				regulation_code: regulation_code || null,
				template_code,
				template_name,
				description: description || null,
				exam_scope: exam_scope || 'cia',
				course_type_applicability: course_type_applicability || 'all',
				program_type_applicability: program_type_applicability || 'all',
				duration_minutes: duration_minutes ? parseInt(duration_minutes) : null,
				capture_co: capture_co !== undefined ? capture_co : true,
				capture_klevel: capture_klevel !== undefined ? capture_klevel : true,
				wef_date: wef_date || new Date().toISOString().slice(0, 10),
				version_number: versionNumber,
				status: 'draft',
				is_default: is_default || false,
				is_active: is_active !== undefined ? is_active : true,
				author_id: body.author_id || null,
				created_by: body.author_id || null,
			})
			.select()
			.single()

		if (templateError) {
			if (templateError.code === '23505') {
				return NextResponse.json(
					{ error: 'A template with this code and version already exists' },
					{ status: 400 }
				)
			}
			console.error('Error creating template:', templateError)
			return NextResponse.json({ error: templateError.message }, { status: 500 })
		}

		if (Array.isArray(parts) && parts.length > 0) {
			const rows = parts.map((p: any, i: number) => ({
				template_id: template.id,
				...normalizePart(p, i),
			}))
			const { error: partsError } = await supabase.from('ia_template_parts').insert(rows)
			if (partsError) {
				console.error('Error creating template parts:', partsError)
				// Roll back the header so we don't leave a partless template
				await supabase.from('ia_paper_templates').delete().eq('id', template.id)
				return NextResponse.json({ error: partsError.message }, { status: 500 })
			}
		}

		const { data: complete } = await supabase
			.from('ia_paper_templates')
			.select('*, ia_template_parts(*)')
			.eq('id', template.id)
			.single()

		return NextResponse.json(complete || template, { status: 201 })
	} catch (error) {
		console.error('Error in POST template:', error)
		return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
	}
}

// PUT - update a template header and replace its parts
export async function PUT(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		const { id, parts, ...updateData } = body

		if (!id) return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })

		if (updateData.regulation_code) {
			const { data: regulation } = await supabase
				.from('regulations')
				.select('id')
				.eq('regulation_code', updateData.regulation_code)
				.single()
			updateData.regulation_id = regulation?.id || null
		}
		if (updateData.duration_minutes !== undefined) {
			updateData.duration_minutes = updateData.duration_minutes
				? parseInt(updateData.duration_minutes)
				: null
		}

		// header + institution are immutable; strip joined / derived fields
		delete updateData.institutions_id
		delete updateData.institution_code
		delete updateData.total_marks
		delete updateData.version_number
		delete updateData.ia_template_parts

		const { data: template, error } = await supabase
			.from('ia_paper_templates')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Error updating template:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		// If parts supplied, replace them wholesale (simplest correct semantics)
		if (Array.isArray(parts)) {
			await supabase.from('ia_template_parts').delete().eq('template_id', id)
			if (parts.length > 0) {
				const rows = parts.map((p: any, i: number) => ({
					template_id: id,
					...normalizePart(p, i),
				}))
				const { error: partsError } = await supabase.from('ia_template_parts').insert(rows)
				if (partsError) {
					console.error('Error replacing template parts:', partsError)
					return NextResponse.json({ error: partsError.message }, { status: 500 })
				}
			}
		}

		const { data: complete } = await supabase
			.from('ia_paper_templates')
			.select('*, ia_template_parts(*)')
			.eq('id', id)
			.single()

		return NextResponse.json(complete || template)
	} catch (error) {
		console.error('Error in PUT template:', error)
		return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
	}
}

// DELETE - remove a template (blocked if papers already reference it)
export async function DELETE(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)
		const id = searchParams.get('id')
		if (!id) return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })

		const { data: papers } = await supabase
			.from('ia_question_papers')
			.select('id')
			.eq('template_id', id)
			.limit(1)

		if (papers && papers.length > 0) {
			return NextResponse.json(
				{ error: 'Cannot delete: question papers were generated from this template. Archive it instead.' },
				{ status: 400 }
			)
		}

		const { error } = await supabase.from('ia_paper_templates').delete().eq('id', id)
		if (error) {
			console.error('Error deleting template:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}
		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error in DELETE template:', error)
		return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
	}
}
