import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { resolveInstitutionForKey, institutionAllowed } from '@/lib/ia/v1-helpers'

/** /api/v1/ia/course-outcomes — CO master per course. */

export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const courseId = searchParams.get('course_id')
	const courseCode = searchParams.get('course_code')

	let query = supabase.from('ia_course_outcomes').select('*').eq('is_active', true).order('display_order')
	if (courseId) {
		query = query.eq('course_id', courseId)
	} else if (courseCode) {
		const inst = await resolveInstitutionForKey(supabase, context, searchParams.get('institution_code'))
		if ('error' in inst) return NextResponse.json({ error: inst.error }, { status: 400 })
		query = query.eq('course_code', courseCode).eq('institutions_id', inst.id)
	} else {
		return NextResponse.json({ error: 'course_id or course_code is required' }, { status: 400 })
	}

	const { data, error } = await query
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	if (courseId && data && data[0] && !institutionAllowed(context, data[0].institutions_id)) {
		return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
	}
	return NextResponse.json({ data })
})

export const POST = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const inst = await resolveInstitutionForKey(supabase, context, body.institution_code)
	if ('error' in inst) return NextResponse.json({ error: inst.error }, { status: 400 })
	if (!body.course_id || !body.course_code) {
		return NextResponse.json({ error: 'course_id and course_code are required' }, { status: 400 })
	}

	if (Array.isArray(body.outcomes) && body.outcomes.length > 0) {
		const rows = body.outcomes.map((o: any, i: number) => ({
			institutions_id: inst.id,
			course_id: body.course_id,
			course_code: body.course_code,
			co_code: o.co_code,
			co_description: o.co_description || null,
			display_order: o.display_order ? parseInt(o.display_order) : i + 1,
		}))
		const { data, error } = await supabase
			.from('ia_course_outcomes')
			.upsert(rows, { onConflict: 'course_id,co_code' })
			.select()
		if (error) return NextResponse.json({ error: error.message }, { status: 500 })
		return NextResponse.json({ data }, { status: 201 })
	}

	if (!body.co_code) return NextResponse.json({ error: 'co_code is required' }, { status: 400 })
	const { data, error } = await supabase
		.from('ia_course_outcomes')
		.insert({
			institutions_id: inst.id,
			course_id: body.course_id,
			course_code: body.course_code,
			co_code: body.co_code,
			co_description: body.co_description || null,
			display_order: body.display_order ? parseInt(body.display_order) : 1,
		})
		.select()
		.single()
	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'co_code exists for course' }, { status: 409 })
		return NextResponse.json({ error: error.message }, { status: 500 })
	}
	return NextResponse.json({ data }, { status: 201 })
})

export const DELETE = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const id = new URL(request.url).searchParams.get('id')
	if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
	const { data: row } = await supabase.from('ia_course_outcomes').select('institutions_id').eq('id', id).maybeSingle()
	if (!row || !institutionAllowed(context, row.institutions_id)) {
		return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
	}
	const { error } = await supabase.from('ia_course_outcomes').delete().eq('id', id)
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ success: true })
})
