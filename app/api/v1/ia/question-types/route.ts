import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { resolveInstitutionForKey } from '@/lib/ia/v1-helpers'

/**
 * /api/v1/ia/question-types — configurable IA question-type registry.
 * Auth: X-API-Key-Id + X-API-Secret. Scope: COE institution_code (e.g. "CAS").
 */

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const inst = await resolveInstitutionForKey(supabase, context, searchParams.get('institution_code'))
	if ('error' in inst) return NextResponse.json({ error: inst.error }, { status: 400 })

	let query = supabase
		.from('ia_question_types')
		.select('*')
		.eq('institutions_id', inst.id)
		.order('display_order', { ascending: true })
	if (searchParams.get('include_inactive') !== 'true') query = query.eq('is_active', true)

	const { data, error } = await query
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ data })
})

export const POST = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const inst = await resolveInstitutionForKey(supabase, context, body.institution_code)
	if ('error' in inst) return NextResponse.json({ error: inst.error }, { status: 400 })
	if (!body.type_code || !body.type_label) {
		return NextResponse.json({ error: 'type_code and type_label are required' }, { status: 400 })
	}

	const { data, error } = await supabase
		.from('ia_question_types')
		.insert({
			institutions_id: inst.id,
			institution_code: inst.institution_code,
			type_code: body.type_code,
			type_label: body.type_label,
			description: body.description || null,
			is_objective: body.is_objective || false,
			has_options: body.has_options || false,
			default_option_count: body.default_option_count ? parseInt(body.default_option_count) : null,
			display_order: body.display_order ? parseInt(body.display_order) : 1,
			is_active: body.is_active !== undefined ? body.is_active : true,
		})
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'type_code already exists' }, { status: 409 })
		return NextResponse.json({ error: error.message }, { status: 500 })
	}
	return NextResponse.json({ data }, { status: 201 })
})

export const PUT = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()
	if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

	// Ensure the row belongs to an allowed institution
	const { data: row } = await supabase
		.from('ia_question_types')
		.select('institutions_id')
		.eq('id', body.id)
		.maybeSingle()
	const inst = await resolveInstitutionForKey(supabase, context, null)
	if (!row || ('error' in inst ? false : row.institutions_id !== inst.id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}

	const { id, institutions_id, institution_code, ...patch } = body
	if (patch.default_option_count !== undefined) {
		patch.default_option_count = patch.default_option_count === '' ? null : parseInt(patch.default_option_count)
	}
	const { data, error } = await supabase.from('ia_question_types').update(patch).eq('id', id).select().single()
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ data })
})

export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const id = new URL(request.url).searchParams.get('id')
	if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

	const { data: row } = await supabase
		.from('ia_question_types')
		.select('institutions_id')
		.eq('id', id)
		.maybeSingle()
	const inst = await resolveInstitutionForKey(supabase, context, null)
	if (!row || ('error' in inst ? false : row.institutions_id !== inst.id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}

	const { error } = await supabase.from('ia_question_types').delete().eq('id', id)
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ success: true })
})
