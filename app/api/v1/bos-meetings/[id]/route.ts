import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const url = new URL(request.url)
	const id = url.pathname.split('/').filter(Boolean).pop()

	if (!id) {
		return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 })
	}

	let meetingQuery = supabase
		.from('bos_meetings')
		.select('*')
		.eq('id', id)

	if (ctx.allowedInstitutionIds.length > 0) {
		meetingQuery = meetingQuery.in('institutions_id', ctx.allowedInstitutionIds)
	}

	const { data: meeting, error: meetingError } = await meetingQuery.maybeSingle()

	if (meetingError) {
		return NextResponse.json({ error: 'Failed to fetch meeting' }, { status: 500 })
	}
	if (!meeting) {
		return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
	}

	const [agendaRes, attendeesRes] = await Promise.all([
		supabase
			.from('bos_agenda_items')
			.select('id, item_number, item_title, item_description, discussion_notes, resolution_text, resolution_status, responsible_person, target_date, sort_order')
			.eq('meeting_id', id)
			.order('sort_order', { ascending: true }),
		supabase
			.from('bos_meeting_attendees')
			.select(`
				id,
				member_id,
				attendance_status,
				absence_reason,
				ta_da_eligible,
				bos_members!inner(display_name, display_designation, display_institution, member_type)
			`)
			.eq('meeting_id', id),
	])

	return NextResponse.json({
		data: {
			...meeting,
			agenda_items: agendaRes.data || [],
			attendees: attendeesRes.data || [],
		},
	})
})
