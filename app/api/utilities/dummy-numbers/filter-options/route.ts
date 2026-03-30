import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET: Return unique boards, programs, and courses from course_offerings for cascading filters
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

		// Fetch course_offerings with course, board, semester, and course_order details
		const { data: offerings, error } = await supabase
			.from('course_offerings')
			.select(`
				id,
				course_code,
				program_code,
				semester,
				course_mapping:course_mapping!course_offerings_course_mapping_id_fkey (
					course_order
				),
				course:courses!course_offerings_course_id_fkey1 (
					course_code,
					course_name,
					course_category,
					board_code,
					board:board!courses_board_id_fkey (
						board_name,
						board_order
					)
				)
			`)
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.range(0, 49999)

		if (error) {
			console.error('Error fetching filter options:', error)
			return NextResponse.json({ error: 'Failed to fetch filter options' }, { status: 500 })
		}

		// Fetch program names + program_order from MyJKKN API (local programs table is empty)
		const programInfoMap = new Map<string, { name: string; order: number }>()
		const { data: inst } = await supabase
			.from('institutions')
			.select('myjkkn_institution_ids')
			.eq('id', institutions_id)
			.single()
		const myjkknIds: string[] = inst?.myjkkn_institution_ids || []
		if (myjkknIds.length > 0) {
			const myjkknApiUrl = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
			const myjkknApiKey = process.env.MYJKKN_API_KEY || ''
			if (myjkknApiKey) {
				try {
					for (const myjkknInstId of myjkknIds) {
						let pg = 1
						let hasMorePages = true
						while (hasMorePages) {
							const res = await fetch(
								`${myjkknApiUrl}/api-management/organizations/programs?institution_id=${myjkknInstId}&limit=200&page=${pg}`,
								{
									method: 'GET',
									headers: {
										'Authorization': `Bearer ${myjkknApiKey}`,
										'Accept': 'application/json',
										'Content-Type': 'application/json',
									},
									cache: 'no-store',
								}
							)
							if (res.ok) {
								const data = await res.json()
								const programs = data.data || data || []
								for (const p of programs) {
									const code = p.program_id || p.program_code || ''
									if (code && !programInfoMap.has(code)) {
										programInfoMap.set(code, {
											name: p.program_name || p.name || code,
											order: p.program_order ?? p.sort_order ?? 999,
										})
									}
								}
								hasMorePages = programs.length === 200
								pg++
							} else {
								hasMorePages = false
							}
						}
					}
				} catch (e) {
					console.error('Error fetching programs from MyJKKN:', e)
				}
			}
		}

		// Fetch all boards for reliable name/order lookup (FK join may miss some)
		const boardLookup = new Map<string, { board_name: string; board_order: number }>()
		const { data: allBoards } = await supabase
			.from('board')
			.select('board_code, board_name, board_order')
			.order('board_order', { ascending: true })
		for (const b of (allBoards || [])) {
			boardLookup.set(b.board_code, { board_name: b.board_name, board_order: b.board_order })
		}

		// Build the relationships
		const entries: {
			board_code: string | null
			board_name: string | null
			board_order: number | null
			program_code: string | null
			program_name: string | null
			program_order: number | null
			course_code: string | null
			course_name: string | null
			course_category: string | null
			semester: number | null
			course_order: number | null
		}[] = []

		for (const co of (offerings || [])) {
			const course = (co as any).course
			const board = course?.board
			const progCode = (co as any).program_code
			const progInfo = programInfoMap.get(progCode)
			const courseMapping = (co as any).course_mapping
			const bCode = course?.board_code || null
			const bLookup = bCode ? boardLookup.get(bCode) : undefined

			entries.push({
				board_code: bCode,
				board_name: board?.board_name || bLookup?.board_name || null,
				board_order: board?.board_order ?? bLookup?.board_order ?? null,
				program_code: progCode || null,
				program_name: progInfo?.name || progCode || null,
				program_order: progInfo?.order ?? null,
				course_code: course?.course_code || null,
				course_name: course?.course_name || null,
				course_category: course?.course_category || null,
				semester: (co as any).semester ?? null,
				course_order: courseMapping?.course_order ?? null,
			})
		}

		// Extract unique boards sorted by board_order ASC (use boardLookup for reliable names)
		const boardSet = new Set<string>()
		const boards: { board_code: string; board_name: string; board_order: number }[] = []
		for (const e of entries) {
			if (e.board_code && !boardSet.has(e.board_code)) {
				boardSet.add(e.board_code)
				const bl = boardLookup.get(e.board_code)
				boards.push({
					board_code: e.board_code,
					board_name: e.board_name || bl?.board_name || e.board_code,
					board_order: e.board_order ?? bl?.board_order ?? 999,
				})
			}
		}
		boards.sort((a, b) => a.board_order - b.board_order)

		// Extract unique programs sorted by program_order ASC
		const programSet = new Set<string>()
		const programs: { program_code: string; program_name: string; program_order: number }[] = []
		for (const e of entries) {
			if (e.program_code && !programSet.has(e.program_code)) {
				programSet.add(e.program_code)
				programs.push({
					program_code: e.program_code,
					program_name: e.program_name || e.program_code,
					program_order: e.program_order ?? 999,
				})
			}
		}
		programs.sort((a, b) => a.program_order - b.program_order)

		// Extract unique courses sorted by semester ASC, then course_order ASC
		const courseSet = new Set<string>()
		const courses: { course_code: string; course_name: string; semester: number; course_order: number }[] = []
		for (const e of entries) {
			if (e.course_code && !courseSet.has(e.course_code)) {
				courseSet.add(e.course_code)
				courses.push({
					course_code: e.course_code,
					course_name: e.course_name || e.course_code,
					semester: e.semester ?? 999,
					course_order: e.course_order ?? 999,
				})
			}
		}
		courses.sort((a, b) => a.semester - b.semester || a.course_order - b.course_order)

		return NextResponse.json({
			boards,
			programs,
			courses,
			entries,
		})
	} catch (error) {
		console.error('Filter options error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
