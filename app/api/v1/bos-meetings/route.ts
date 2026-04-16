import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const boardId = searchParams.get('board_id')
	const status = searchParams.get('status')
	const academicYear = searchParams.get('academic_year')
	const meetingType = searchParams.get('meeting_type')
	const search = searchParams.get('search')

	let query = supabase
		.from('bos_meetings')
		.select(`
			id,
			institutions_id,
			board_id,
			composition_id,
			meeting_number,
			academic_year,
			meeting_title,
			meeting_type,
			status,
			scheduled_date,
			scheduled_time,
			venue,
			actual_date,
			actual_start_time,
			actual_end_time,
			quorum_met,
			ratified_by_ac,
			ratified_date,
			minutes_summary,
			created_at,
			updated_at
		`)
		.order('scheduled_date', { ascending: false })

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (boardId) query = query.eq('board_id', boardId)
	if (status) query = query.eq('status', status)
	if (academicYear) query = query.eq('academic_year', academicYear)
	if (meetingType) query = query.eq('meeting_type', meetingType)
	if (search) {
		query = query.or(`meeting_title.ilike.%${search}%,venue.ilike.%${search}%`)
	}

	const { data, error } = await query.range(0, 9999)

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 })
	}

	return NextResponse.json({ data: data || [], total: (data || []).length })
})
