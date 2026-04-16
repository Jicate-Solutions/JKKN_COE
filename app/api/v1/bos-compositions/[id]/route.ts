import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const url = new URL(request.url)
	const id = url.pathname.split('/').filter(Boolean).pop()

	if (!id) {
		return NextResponse.json({ error: 'Composition ID is required' }, { status: 400 })
	}

	let compositionQuery = supabase
		.from('bos_compositions')
		.select('*')
		.eq('id', id)

	if (ctx.allowedInstitutionIds.length > 0) {
		compositionQuery = compositionQuery.in('institutions_id', ctx.allowedInstitutionIds)
	}

	const { data: composition, error: compositionError } = await compositionQuery.maybeSingle()

	if (compositionError) {
		return NextResponse.json({ error: 'Failed to fetch composition' }, { status: 500 })
	}
	if (!composition) {
		return NextResponse.json({ error: 'Composition not found' }, { status: 404 })
	}

	const { data: members } = await supabase
		.from('bos_members')
		.select(`
			id,
			member_type,
			display_name,
			display_designation,
			display_institution,
			email,
			contact_no,
			sort_order,
			is_active,
			joined_date,
			left_date
		`)
		.eq('composition_id', id)
		.order('sort_order', { ascending: true })

	return NextResponse.json({
		data: {
			...composition,
			members: members || [],
		},
	})
})
