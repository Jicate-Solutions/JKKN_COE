import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type { CentralValuationBoardRow } from '@/types/central-valuation'

/**
 * Source courses from exam_registrations (fee_paid=true) so dates can be planned
 * BEFORE answer sheet packets are generated. Packet counts are shown if available.
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('session_id')

		console.log(`[central-valuation/boards] GET institutions_id=${institutionsId} session_id=${sessionId}`)

		if (!institutionsId || !sessionId) {
			return NextResponse.json({ error: 'institutions_id and session_id are required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// 1. Paginated fetch of exam_registrations (fee paid)
		const pageSize = 1000
		let allRegs: Array<{ course_code: string | null }> = []
		let page = 0
		let more = true

		while (more) {
			const { data, error } = await supabase
				.from('exam_registrations')
				.select('course_code')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.range(page * pageSize, (page + 1) * pageSize - 1)

			if (error) {
				console.error('boards exam_registrations error:', error)
				return NextResponse.json({ error: 'Failed to load registrations' }, { status: 500 })
			}
			if (!data || data.length === 0) break
			allRegs = allRegs.concat(data)
			page++
			more = data.length === pageSize
		}

		const courseCodes = [...new Set(allRegs.map(r => r.course_code).filter(Boolean))] as string[]
		console.log(`[central-valuation/boards] institutions_id=${institutionsId} session_id=${sessionId} registrations=${allRegs.length} distinct course_codes=${courseCodes.length}`)
		if (courseCodes.length === 0) return NextResponse.json([])

		// 2. Look up each course's board_code
		const { data: courses, error: cErr } = await supabase
			.from('courses')
			.select('course_code, board_code')
			.in('course_code', courseCodes)

		if (cErr) {
			console.error('boards courses error:', cErr)
			return NextResponse.json({ error: 'Failed to load courses' }, { status: 500 })
		}

		const boardCodes = [...new Set((courses || []).map(c => c.board_code).filter(Boolean))] as string[]
		console.log(`[central-valuation/boards] courses found=${courses?.length || 0} distinct board_codes=${boardCodes.length} sample=${boardCodes.slice(0, 5).join(',')}`)
		if (boardCodes.length === 0) return NextResponse.json([])

		// 3. Board master — use flexible select to tolerate missing columns
		const { data: boards, error: bErr } = await supabase
			.from('board')
			.select('*')
			.in('board_code', boardCodes)

		if (bErr) {
			console.error('boards master error:', bErr)
			return NextResponse.json({ error: `Failed to load boards: ${bErr.message}` }, { status: 500 })
		}

		// 4. Existing windows
		const { data: windows } = await supabase
			.from('board_valuation_windows')
			.select('*')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
		const windowMap = new Map((windows || []).map(w => [w.board_code, w]))

		// 5. Count distinct courses per board (from registrations)
		const distinctCoursesPerBoard = new Map<string, Set<string>>()
		const courseBoardLookup = new Map<string, string | null>()
		for (const c of courses || []) courseBoardLookup.set(c.course_code, c.board_code)

		for (const regCode of courseCodes) {
			const bc = courseBoardLookup.get(regCode)
			if (!bc) continue
			if (!distinctCoursesPerBoard.has(bc)) distinctCoursesPerBoard.set(bc, new Set())
			distinctCoursesPerBoard.get(bc)!.add(regCode)
		}

		const result: CentralValuationBoardRow[] = (boards || [])
			.sort((a: any, b: any) => (a.board_order ?? 0) - (b.board_order ?? 0))
			.map((b: any) => ({
				board_code: b.board_code,
				board_name: b.board_name,
				board_type: b.board_type ?? null,
				board_order: b.board_order ?? 0,
				course_count: distinctCoursesPerBoard.get(b.board_code)?.size || 0,
				window: windowMap.get(b.board_code) || null,
			}))

		return NextResponse.json(result)
	} catch (e) {
		console.error('boards route error:', e)
		return NextResponse.json({ error: 'Internal error' }, { status: 500 })
	}
}
