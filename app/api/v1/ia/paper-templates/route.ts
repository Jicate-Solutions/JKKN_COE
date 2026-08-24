import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { resolveInstitutionForKey, V1_ALLOWED_SCOPES, ESE_NOT_AVAILABLE } from '@/lib/ia/v1-helpers'

/** /api/v1/ia/paper-templates — configurable CIA paper templates + parts. */

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

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const inst = await resolveInstitutionForKey(supabase, context, searchParams.get('institution_code'))
	if ('error' in inst) return NextResponse.json({ error: inst.error }, { status: 400 })

	let query = supabase
		.from('ia_paper_templates')
		.select('*, ia_template_parts(*)')
		.eq('institutions_id', inst.id)
		.order('created_at', { ascending: false })
	// This API serves internal (CIA) authoring only — ESE formats stay hidden.
	query = query.in('exam_scope', V1_ALLOWED_SCOPES as unknown as string[])
	const scope = searchParams.get('exam_scope')
	if (scope && scope !== 'all') {
		if (scope === 'ese') return NextResponse.json({ error: ESE_NOT_AVAILABLE }, { status: 400 })
		query = query.or(`exam_scope.eq.${scope},exam_scope.eq.all`)
	}
	if (searchParams.get('status')) query = query.eq('status', searchParams.get('status'))

	const { data, error } = await query
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	const sorted = (data || []).map((t: any) => ({
		...t,
		ia_template_parts: (t.ia_template_parts || []).sort((a: any, b: any) => a.display_order - b.display_order),
	}))
	return NextResponse.json({ data: sorted })
})

export const POST = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const inst = await resolveInstitutionForKey(supabase, context, body.institution_code)
	if ('error' in inst) return NextResponse.json({ error: inst.error }, { status: 400 })
	if (!body.template_code || !body.template_name) {
		return NextResponse.json({ error: 'template_code and template_name are required' }, { status: 400 })
	}

	let regulationId: string | null = null
	if (body.regulation_code) {
		const { data: reg } = await supabase
			.from('regulations')
			.select('id')
			.eq('regulation_code', body.regulation_code)
			.maybeSingle()
		regulationId = reg?.id || null
	}

	const { data: existing } = await supabase
		.from('ia_paper_templates')
		.select('version_number')
		.eq('institutions_id', inst.id)
		.eq('template_code', body.template_code)
		.order('version_number', { ascending: false })
		.limit(1)
		.maybeSingle()
	const versionNumber = existing ? existing.version_number + 1 : 1

	// Creating an end-semester format is a CoE decision, not an API one.
	if (body.exam_scope === 'ese') {
		return NextResponse.json({ error: ESE_NOT_AVAILABLE }, { status: 400 })
	}

	const { data: template, error: tErr } = await supabase
		.from('ia_paper_templates')
		.insert({
			institutions_id: inst.id,
			institution_code: inst.institution_code,
			regulation_id: regulationId,
			regulation_code: body.regulation_code || null,
			template_code: body.template_code,
			template_name: body.template_name,
			description: body.description || null,
			exam_scope: body.exam_scope || 'cia',
			course_type_applicability: body.course_type_applicability || 'all',
			program_type_applicability: body.program_type_applicability || 'all',
			duration_minutes: body.duration_minutes ? parseInt(body.duration_minutes) : null,
			capture_co: body.capture_co !== undefined ? body.capture_co : true,
			capture_klevel: body.capture_klevel !== undefined ? body.capture_klevel : true,
			wef_date: body.wef_date || new Date().toISOString().slice(0, 10),
			version_number: versionNumber,
			status: body.status || 'draft',
			is_default: body.is_default || false,
			is_active: body.is_active !== undefined ? body.is_active : true,
			author_id: body.author_id || null,
			created_by: body.author_id || null,
		})
		.select()
		.single()

	if (tErr) {
		if (tErr.code === '23505') return NextResponse.json({ error: 'template_code+version exists' }, { status: 409 })
		return NextResponse.json({ error: tErr.message }, { status: 500 })
	}

	if (Array.isArray(body.parts) && body.parts.length > 0) {
		const rows = body.parts.map((p: any, i: number) => ({ template_id: template.id, ...normalizePart(p, i) }))
		const { error: pErr } = await supabase.from('ia_template_parts').insert(rows)
		if (pErr) {
			await supabase.from('ia_paper_templates').delete().eq('id', template.id)
			return NextResponse.json(
				{ error: `Parts could not be saved, so the template was not created: ${pErr.message}` },
				{ status: 500 }
			)
		}
	}

	const { data: complete } = await supabase
		.from('ia_paper_templates')
		.select('*, ia_template_parts(*)')
		.eq('id', template.id)
		.single()
	return NextResponse.json({ data: complete || template }, { status: 201 })
})

export const PUT = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()
	if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

	const { data: row } = await supabase
		.from('ia_paper_templates')
		.select('institutions_id')
		.eq('id', body.id)
		.maybeSingle()
	const inst = await resolveInstitutionForKey(supabase, context, null)
	if (!row || ('error' in inst ? false : row.institutions_id !== inst.id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}

	const { id, parts, ...patch } = body
	delete patch.institutions_id
	delete patch.institution_code
	delete patch.total_marks
	delete patch.version_number
	delete patch.ia_template_parts
	if (patch.duration_minutes !== undefined) {
		patch.duration_minutes = patch.duration_minutes ? parseInt(patch.duration_minutes) : null
	}

	const { error } = await supabase.from('ia_paper_templates').update(patch).eq('id', id)
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })

	// Replace parts wholesale, but restore the old rows if the insert fails —
	// otherwise a rejected save leaves the template with zero parts.
	if (Array.isArray(parts)) {
		const { data: previousParts } = await supabase
			.from('ia_template_parts')
			.select('*')
			.eq('template_id', id)

		await supabase.from('ia_template_parts').delete().eq('template_id', id)

		if (parts.length > 0) {
			const rows = parts.map((p: any, i: number) => ({ template_id: id, ...normalizePart(p, i) }))
			const { error: pErr } = await supabase.from('ia_template_parts').insert(rows)
			if (pErr) {
				if (previousParts && previousParts.length > 0) {
					await supabase.from('ia_template_parts').insert(previousParts)
				}
				return NextResponse.json(
					{ error: `Parts could not be saved — the template is unchanged: ${pErr.message}` },
					{ status: 500 }
				)
			}
		}
	}

	const { data: complete } = await supabase
		.from('ia_paper_templates')
		.select('*, ia_template_parts(*)')
		.eq('id', id)
		.single()
	return NextResponse.json({ data: complete })
})

export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const id = new URL(request.url).searchParams.get('id')
	if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

	const { data: row } = await supabase
		.from('ia_paper_templates')
		.select('institutions_id')
		.eq('id', id)
		.maybeSingle()
	const inst = await resolveInstitutionForKey(supabase, context, null)
	if (!row || ('error' in inst ? false : row.institutions_id !== inst.id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}

	const { data: papers } = await supabase.from('ia_question_papers').select('id').eq('template_id', id).limit(1)
	if (papers && papers.length > 0) {
		return NextResponse.json({ error: 'Papers exist for this template; archive instead' }, { status: 409 })
	}
	const { error } = await supabase.from('ia_paper_templates').delete().eq('id', id)
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ success: true })
})
