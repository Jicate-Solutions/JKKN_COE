import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * BoS Composition detail (internal) — composition + board + members + meetings.
 * Backs the /bos/compositions/[id] page.
 */
export async function GET(
	_request: Request,
	{ params }: { params: { id: string } }
) {
	try {
		const supabase = getSupabaseServer()
		const { id } = params

		if (!id) {
			return NextResponse.json({ error: 'Composition ID is required' }, { status: 400 })
		}

		const { data: composition, error: compError } = await supabase
			.from('bos_compositions')
			.select('*')
			.eq('id', id)
			.maybeSingle()

		if (compError) {
			console.error('[BoS Composition Detail] error:', compError)
			return NextResponse.json({ error: 'Failed to fetch composition' }, { status: 500 })
		}
		if (!composition) {
			return NextResponse.json({ error: 'Composition not found' }, { status: 404 })
		}

		// Fetch board, members and meetings concurrently
		const [boardRes, membersRes, meetingsRes] = await Promise.all([
			supabase
				.from('board')
				.select('id, board_code, board_name, display_name, board_type')
				.eq('id', composition.board_id)
				.maybeSingle(),
			supabase
				.from('bos_members')
				.select(`
					id,
					member_type,
					staff_id,
					expert_id,
					display_name,
					display_designation,
					display_institution,
					address,
					contact_no,
					email,
					sort_order,
					is_active,
					joined_date,
					left_date
				`)
				.eq('composition_id', id)
				.order('sort_order', { ascending: true }),
			supabase
				.from('bos_meetings')
				.select('id, meeting_number, academic_year, meeting_title, meeting_type, status, scheduled_date, actual_date, venue')
				.eq('composition_id', id)
				.order('scheduled_date', { ascending: false })
				.range(0, 999)
		])

		const board = boardRes.data
		return NextResponse.json({
			...composition,
			board_code: board?.board_code || null,
			board_name: board?.display_name || board?.board_name || null,
			board_type: board?.board_type || null,
			members: membersRes.data || [],
			meetings: meetingsRes.data || []
		})
	} catch (error) {
		console.error('[BoS Composition Detail] exception:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
