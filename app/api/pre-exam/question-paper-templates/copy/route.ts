import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * POST /api/pre-exam/question-paper-templates/copy
 *
 * Clone a template (header + parts) into another institution.
 *
 * Templates are maintained per institution, so a format shared across the
 * group otherwise has to be rebuilt part-by-part in each one. The copy lands
 * as a DRAFT and is never marked default — activating it stays a deliberate
 * act in the target institution, and the target's existing default is safe
 * (idx_ia_templates_unique_default would reject a second default anyway).
 *
 * Parts reference question types by code, and those codes are themselves
 * per-institution rows. Any type the target is missing is copied across
 * first, otherwise the cloned parts would point at codes that do not exist
 * there and the template would be unusable.
 *
 * Body: { id, target_institution_code, template_code?, template_name? }
 */
export async function POST(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const body = await req.json()
		const { id, target_institution_code } = body

		if (!id || !target_institution_code) {
			return NextResponse.json(
				{ error: 'Template ID and target institution are required' },
				{ status: 400 }
			)
		}

		// 1. Source template with its parts
		const { data: source, error: sourceError } = await supabase
			.from('ia_paper_templates')
			.select('*, ia_template_parts(*)')
			.eq('id', id)
			.maybeSingle()

		if (sourceError) {
			return NextResponse.json({ error: sourceError.message }, { status: 500 })
		}
		if (!source) {
			return NextResponse.json({ error: 'Template not found' }, { status: 404 })
		}
		if (source.institution_code === target_institution_code) {
			return NextResponse.json(
				{ error: 'The template already belongs to that institution' },
				{ status: 400 }
			)
		}

		// 2. Target institution
		const { data: target, error: targetError } = await supabase
			.from('institutions')
			.select('id, institution_code')
			.eq('institution_code', target_institution_code)
			.maybeSingle()

		if (targetError || !target) {
			return NextResponse.json(
				{ error: `Institution with code "${target_institution_code}" not found` },
				{ status: 400 }
			)
		}

		const sourceParts = (source.ia_template_parts || []).sort(
			(a: any, b: any) => a.display_order - b.display_order
		)

		// 3. Carry over any question type the target does not have yet
		const neededCodes = [
			...new Set(sourceParts.map((p: any) => p.question_type_code).filter(Boolean)),
		] as string[]

		let typesCopied = 0
		if (neededCodes.length > 0) {
			const { data: targetTypes } = await supabase
				.from('ia_question_types')
				.select('type_code')
				.eq('institutions_id', target.id)
				.in('type_code', neededCodes)

			const present = new Set((targetTypes || []).map((t: any) => t.type_code))
			const missing = neededCodes.filter(c => !present.has(c))

			if (missing.length > 0) {
				const { data: sourceTypes } = await supabase
					.from('ia_question_types')
					.select('*')
					.eq('institutions_id', source.institutions_id)
					.in('type_code', missing)

				const resolved = sourceTypes || []
				if (resolved.length < missing.length) {
					const unresolved = missing.filter(
						c => !resolved.some((t: any) => t.type_code === c)
					)
					return NextResponse.json(
						{
							error: `Question type(s) ${unresolved.join(', ')} are missing in both institutions — add them before copying`,
						},
						{ status: 400 }
					)
				}

				const typeRows = resolved.map((t: any) => ({
					institutions_id: target.id,
					institution_code: target.institution_code,
					type_code: t.type_code,
					type_label: t.type_label,
					description: t.description,
					is_objective: t.is_objective,
					has_options: t.has_options,
					default_option_count: t.default_option_count,
					display_order: t.display_order,
					is_active: true,
				}))
				const { error: typeError } = await supabase.from('ia_question_types').insert(typeRows)
				if (typeError) {
					console.error('Error copying question types:', typeError)
					return NextResponse.json(
						{ error: `Question types could not be copied: ${typeError.message}` },
						{ status: 500 }
					)
				}
				typesCopied = typeRows.length
			}
		}

		// 4. Next version of this code within the TARGET institution
		const templateCode = String(body.template_code || source.template_code).trim()
		const { data: existing } = await supabase
			.from('ia_paper_templates')
			.select('version_number')
			.eq('institutions_id', target.id)
			.eq('template_code', templateCode)
			.order('version_number', { ascending: false })
			.limit(1)
			.maybeSingle()

		const versionNumber = existing ? existing.version_number + 1 : 1

		// 5. Header — regulation_id is institution-agnostic, so re-resolve it by
		//    code rather than carrying the source id across.
		let regulationId: string | null = null
		if (source.regulation_code) {
			const { data: regulation } = await supabase
				.from('regulations')
				.select('id')
				.eq('regulation_code', source.regulation_code)
				.maybeSingle()
			regulationId = regulation?.id || null
		}

		const { data: created, error: createError } = await supabase
			.from('ia_paper_templates')
			.insert({
				institutions_id: target.id,
				institution_code: target.institution_code,
				regulation_id: regulationId,
				regulation_code: source.regulation_code || null,
				template_code: templateCode,
				template_name: String(body.template_name || source.template_name).trim(),
				description: source.description || null,
				exam_scope: source.exam_scope,
				course_type_applicability: source.course_type_applicability,
				program_type_applicability: source.program_type_applicability,
				duration_minutes: source.duration_minutes,
				capture_co: source.capture_co,
				capture_klevel: source.capture_klevel,
				wef_date: new Date().toISOString().slice(0, 10),
				version_number: versionNumber,
				status: 'draft',
				is_default: false,
				is_active: true,
				author_id: body.author_id || null,
				created_by: body.author_id || null,
			})
			.select()
			.single()

		if (createError) {
			if (createError.code === '23505') {
				return NextResponse.json(
					{ error: 'A template with this code and version already exists in the target institution' },
					{ status: 400 }
				)
			}
			console.error('Error copying template:', createError)
			return NextResponse.json({ error: createError.message }, { status: 500 })
		}

		// 6. Parts — a header with no parts is worse than no copy at all, so
		//    roll the header back if they fail.
		if (sourceParts.length > 0) {
			const partRows = sourceParts.map((p: any, i: number) => ({
				template_id: created.id,
				part_label: p.part_label,
				part_title: p.part_title,
				instruction: p.instruction,
				question_type_code: p.question_type_code,
				num_questions: p.num_questions,
				num_to_answer: p.num_to_answer,
				marks_per_question: p.marks_per_question,
				has_choice: p.has_choice,
				choice_group_size: p.choice_group_size,
				option_count: p.option_count,
				capture_co: p.capture_co,
				capture_klevel: p.capture_klevel,
				display_order: p.display_order ?? i + 1,
			}))
			const { error: partsError } = await supabase.from('ia_template_parts').insert(partRows)
			if (partsError) {
				console.error('Error copying template parts:', partsError)
				await supabase.from('ia_paper_templates').delete().eq('id', created.id)
				return NextResponse.json(
					{ error: `Parts could not be copied, so nothing was created: ${partsError.message}` },
					{ status: 500 }
				)
			}
		}

		const { data: complete } = await supabase
			.from('ia_paper_templates')
			.select('*, ia_template_parts(*)')
			.eq('id', created.id)
			.single()

		return NextResponse.json(
			{
				template: complete || created,
				types_copied: typesCopied,
				version_number: versionNumber,
			},
			{ status: 201 }
		)
	} catch (error) {
		console.error('Error in POST copy template:', error)
		return NextResponse.json({ error: 'Failed to copy template' }, { status: 500 })
	}
}
