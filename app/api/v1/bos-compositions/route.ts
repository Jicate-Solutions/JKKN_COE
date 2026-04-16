import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const boardId = searchParams.get('board_id')
	const academicYear = searchParams.get('academic_year')
	const isActive = searchParams.get('is_active')

	let query = supabase
		.from('bos_compositions')
		.select(`
			id,
			institutions_id,
			board_id,
			composition_title,
			term_start_date,
			term_end_date,
			academic_year,
			is_active,
			ratified_by_gc,
			ratified_date,
			created_at,
			updated_at
		`)
		.order('term_start_date', { ascending: false })

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (boardId) query = query.eq('board_id', boardId)
	if (academicYear) query = query.eq('academic_year', academicYear)
	if (isActive !== null) query = query.eq('is_active', isActive === 'true')

	const { data, error } = await query.range(0, 9999)

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch compositions' }, { status: 500 })
	}

	return NextResponse.json({ data: data || [], total: (data || []).length })
})
