import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const boardId = searchParams.get('board_id')
	const academicYear = searchParams.get('academic_year')
	const status = searchParams.get('status')
	const startDate = searchParams.get('start_date')
	const endDate = searchParams.get('end_date')

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
			actual_date,
			venue,
			quorum_met,
			ratified_by_ac,
			ratified_date,
			bos_meeting_attendees(attendance_status),
			bos_agenda_items(id, resolution_status),
			bos_course_reviews(id, review_action)
		`)
		.order('academic_year', { ascending: false })
		.order('meeting_number', { ascending: false })

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (boardId) query = query.eq('board_id', boardId)
	if (academicYear) query = query.eq('academic_year', academicYear)
	if (status) query = query.eq('status', status)
	if (startDate) query = query.gte('scheduled_date', startDate)
	if (endDate) query = query.lte('scheduled_date', endDate)

	const { data, error } = await query.range(0, 9999)

	if (error) {
		return NextResponse.json({ error: 'Failed to fetch meeting register' }, { status: 500 })
	}

	const enriched = (data || []).map((m: any) => {
		const attendees = m.bos_meeting_attendees || []
		const agenda = m.bos_agenda_items || []
		const reviews = m.bos_course_reviews || []
		return {
			id: m.id,
			institutions_id: m.institutions_id,
			board_id: m.board_id,
			composition_id: m.composition_id,
			meeting_number: m.meeting_number,
			academic_year: m.academic_year,
			meeting_title: m.meeting_title,
			meeting_type: m.meeting_type,
			status: m.status,
			scheduled_date: m.scheduled_date,
			actual_date: m.actual_date,
			venue: m.venue,
			quorum_met: m.quorum_met,
			ratified_by_ac: m.ratified_by_ac,
			ratified_date: m.ratified_date,
			total_attendees: attendees.length,
			present_count: attendees.filter((a: any) => a.attendance_status === 'present').length,
			agenda_item_count: agenda.length,
			resolutions_completed: agenda.filter((a: any) => a.resolution_status === 'completed').length,
			courses_reviewed: reviews.length,
			courses_approved: reviews.filter((r: any) => r.review_action === 'approved' || r.review_action === 'approved_with_changes').length,
		}
	})

	return NextResponse.json({ data: enriched, total: enriched.length })
})
