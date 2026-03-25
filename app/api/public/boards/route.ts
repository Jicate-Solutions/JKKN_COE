import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Public Boards API
 * Returns list of boards for public examiner registration form
 */
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const board_type = searchParams.get('board_type') // UG, PG, etc.
		const institution_code = searchParams.get('institution_code')

		let query = supabase
			.from('board')
			.select('id, board_code, board_name, board_type, display_name')
			.eq('status', true)
			.order('board_name', { ascending: true })

		if (board_type) {
			query = query.eq('board_type', board_type)
		}

		if (institution_code) {
			query = query.eq('institution_code', institution_code)
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching boards:', error)
			return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 })
		}

		// Add "None" option at the beginning
		const boardsWithNone = [
			{ id: 'none', board_code: 'None', board_name: 'None', board_type: null, display_name: 'None' },
			...(data || [])
		]

		return NextResponse.json(boardsWithNone)
	} catch (e) {
		console.error('Public boards API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
