import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Fast filter options for dummy number report (boards + courses only, no MyJKKN call)
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutions_id = searchParams.get('institutions_id')
		const examination_session_id = searchParams.get('examination_session_id')

		if (!institutions_id || !examination_session_id) {
			return NextResponse.json(
				{ error: 'institutions_id and examination_session_id are required' },
				{ status: 400 }
			)
		}

		// Fetch course_offerings with course + board details
		const { data: offerings, error } = await supabase
			.from('course_offerings')
			.select(`
				course_code,
				course:courses!course_offerings_course_id_fkey1 (
					course_code,
					course_name,
					course_category,
					board_code
				)
			`)
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.range(0, 49999)

		if (error) {
			console.error('Error fetching filter options:', error)
			return NextResponse.json({ error: 'Failed to fetch filter options' }, { status: 500 })
		}

		// Fetch all boards for name/order lookup
		const boardLookup = new Map<string, { board_name: string; board_order: number }>()
		const { data: allBoards } = await supabase
			.from('board')
			.select('board_code, board_name, board_order')
			.order('board_order', { ascending: true })
		for (const b of (allBoards || [])) {
			boardLookup.set(b.board_code, { board_name: b.board_name, board_order: b.board_order })
		}

		// Build entries for cascading filter
		const entries: { board_code: string | null; course_code: string | null }[] = []
		for (const co of (offerings || [])) {
			const course = (co as any).course
			entries.push({
				board_code: course?.board_code || null,
				course_code: course?.course_code || null,
			})
		}

		// Extract unique boards sorted by board_order ASC
		const boardSet = new Set<string>()
		const boards: { board_code: string; board_name: string; board_order: number }[] = []
		for (const e of entries) {
			if (e.board_code && !boardSet.has(e.board_code)) {
				boardSet.add(e.board_code)
				const bl = boardLookup.get(e.board_code)
				boards.push({
					board_code: e.board_code,
					board_name: bl?.board_name || e.board_code,
					board_order: bl?.board_order ?? 999,
				})
			}
		}
		boards.sort((a, b) => a.board_order - b.board_order)

		// Extract unique courses sorted by course_code
		const courseSet = new Set<string>()
		const courses: { course_code: string; course_name: string }[] = []
		for (const co of (offerings || [])) {
			const course = (co as any).course
			const code = course?.course_code
			if (code && !courseSet.has(code)) {
				courseSet.add(code)
				courses.push({
					course_code: code,
					course_name: course?.course_name || code,
				})
			}
		}
		courses.sort((a, b) => a.course_code.localeCompare(b.course_code))

		return NextResponse.json({ boards, courses, entries })
	} catch (error) {
		console.error('Filter options error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
