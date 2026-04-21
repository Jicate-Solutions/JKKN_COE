import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { CentralValuationBoardRow } from '@/types/central-valuation'

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('session_id')

		if (!institutionsId || !sessionId) {
			return NextResponse.json({ error: 'institutions_id and session_id are required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { data: packets, error: packetErr } = await supabase
			.from('answer_sheet_packets')
			.select('course_id')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('is_active', true)
			.range(0, 99999)

		if (packetErr) {
			console.error('Packets fetch error:', packetErr)
			return NextResponse.json({ error: 'Failed to load packets' }, { status: 500 })
		}

		const courseIds = [...new Set((packets || []).map(p => p.course_id))]
		if (courseIds.length === 0) return NextResponse.json([])

		const { data: courses, error: courseErr } = await supabase
			.from('courses')
			.select('id, board_code')
			.in('id', courseIds)

		if (courseErr) {
			console.error('Courses fetch error:', courseErr)
			return NextResponse.json({ error: 'Failed to load courses' }, { status: 500 })
		}

		const boardCodes = [...new Set((courses || []).map(c => c.board_code).filter(Boolean))]
		if (boardCodes.length === 0) return NextResponse.json([])

		const { data: boards, error: boardErr } = await supabase
			.from('boards')
			.select('board_code, board_name, board_type, board_order')
			.in('board_code', boardCodes)

		if (boardErr) {
			console.error('Boards fetch error:', boardErr)
			return NextResponse.json({ error: 'Failed to load boards' }, { status: 500 })
		}

		const { data: windows } = await supabase
			.from('board_valuation_windows')
			.select('*')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)

		const windowMap = new Map((windows || []).map(w => [w.board_code, w]))

		const courseBoardMap = new Map<string, number>()
		for (const c of courses || []) {
			if (!c.board_code) continue
			courseBoardMap.set(c.board_code, (courseBoardMap.get(c.board_code) || 0) + 1)
		}

		const result: CentralValuationBoardRow[] = (boards || [])
			.sort((a, b) => (a.board_order || 0) - (b.board_order || 0))
			.map(b => ({
				board_code: b.board_code,
				board_name: b.board_name,
				board_type: b.board_type,
				board_order: b.board_order,
				course_count: courseBoardMap.get(b.board_code) || 0,
				window: windowMap.get(b.board_code) || null,
			}))

		return NextResponse.json(result)
	} catch (e) {
		console.error('boards route error:', e)
		return NextResponse.json({ error: 'Internal error' }, { status: 500 })
	}
}
