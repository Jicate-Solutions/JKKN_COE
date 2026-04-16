import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const compositionId = searchParams.get('composition_id')
	const boardId = searchParams.get('board_id')
	const academicYear = searchParams.get('academic_year')

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
			bos_members(
				id,
				member_type,
				display_name,
				display_designation,
				display_institution,
				email,
				contact_no,
				sort_order,
				is_active
			)
		`)

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (compositionId) {
		query = query.eq('id', compositionId)
	} else {
		if (boardId) query = query.eq('board_id', boardId)
		if (academicYear) query = query.eq('academic_year', academicYear)
		query = query.eq('is_active', true)
	}

	const { data, error } = await query.range(0, 9999)

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch composition report' }, { status: 500 })
	}

	return NextResponse.json({ data: data || [], total: (data || []).length })
})
