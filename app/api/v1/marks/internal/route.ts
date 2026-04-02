import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const courseOfferingId = searchParams.get('course_offering_id')

	let query = supabase
		.from('internal_marks')
		.select('*')

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (courseOfferingId) query = query.eq('course_offering_id', courseOfferingId)

	const { data, error } = await query.range(0, 9999)

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch marks' }, { status: 500 })
	}

	return NextResponse.json({ data: data || [], total: data?.length || 0 })
})

export const POST = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (body.institution_id && ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(body.institution_id)) {
		return NextResponse.json(
			{ error: 'Forbidden', message: 'Cannot create marks for this institution' },
			{ status: 403 }
		)
	}

	const { data, error } = await supabase
		.from('internal_marks')
		.insert(body)
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'Marks already exist' }, { status: 400 })
		return NextResponse.json({ error: 'Failed to create marks' }, { status: 500 })
	}

	return NextResponse.json({ data }, { status: 201 })
})
