import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const sessionId = searchParams.get('session_id')

	let query = supabase
		.from('exam_registrations')
		.select('*')
		.order('created_at', { ascending: false })

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (sessionId) query = query.eq('examination_session_id', sessionId)

	const { data, error } = await query.range(0, 9999)

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 })
	}

	return NextResponse.json({ data: data || [], total: data?.length || 0 })
})

export const POST = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (body.institution_id && ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(body.institution_id)) {
		return NextResponse.json(
			{ error: 'Forbidden', message: 'Cannot create registration for this institution' },
			{ status: 403 }
		)
	}

	const { data, error } = await supabase
		.from('exam_registrations')
		.insert(body)
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'Registration already exists' }, { status: 400 })
		if (error.code === '23503') return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
		return NextResponse.json({ error: 'Failed to create registration' }, { status: 500 })
	}

	return NextResponse.json({ data }, { status: 201 })
})
