import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/reports/answer-sheet-packets
 * Fetch answer sheet packet data for report generation
 * Groups packets by board → course with dummy number ranges
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionsId = searchParams.get('institutions_id')
		const examinationSessionId = searchParams.get('examination_session_id')
		const boardCodes = searchParams.get('board_codes') // comma-separated

		if (!institutionsId || !examinationSessionId) {
			return NextResponse.json(
				{ error: 'institutions_id and examination_session_id are required' },
				{ status: 400 }
			)
		}

		// Build query for packets with course info
		let query = supabase
			.from('answer_sheet_packets')
			.select(`
				id,
				packet_no,
				total_sheets,
				barcode,
				packet_status,
				course_id,
				courses!inner(
					course_code,
					course_name,
					board_code,
					board_id
				)
			`)
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', examinationSessionId)
			.eq('is_active', true)
			.order('packet_no', { ascending: true })

		const { data: packets, error: packetsError } = await query.range(0, 9999)

		if (packetsError) {
			console.error('Error fetching packets:', packetsError)
			return NextResponse.json({ error: 'Failed to fetch packets' }, { status: 500 })
		}

		if (!packets || packets.length === 0) {
			return NextResponse.json({ packets: [], boards: [] })
		}

		// Filter by board_codes if provided
		let filteredPackets = packets
		if (boardCodes) {
			const codes = boardCodes.split(',').map(c => c.trim())
			filteredPackets = packets.filter((p: any) => {
				const course = p.courses
				return course && codes.includes(course.board_code)
			})
		}

		// Get all packet IDs to fetch dummy numbers
		const packetIds = filteredPackets.map((p: any) => p.id)

		// Batch fetch dummy numbers for all packets.
		// Paginate explicitly so we are not subject to PostgREST's max-rows cap
		// (default 1000 on Supabase). Smaller packet-id chunks plus per-chunk
		// pagination guarantees every dummy number is returned, even with
		// thousands of packets per session.
		const allDummyNumbers: any[] = []
		const PACKET_CHUNK = 100
		const PAGE_SIZE = 1000
		for (let i = 0; i < packetIds.length; i += PACKET_CHUNK) {
			const chunk = packetIds.slice(i, i + PACKET_CHUNK)
			let from = 0
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const { data: dummyData, error: dummyError } = await supabase
					.from('student_dummy_numbers')
					.select('packet_id, dummy_number')
					.in('packet_id', chunk)
					.order('dummy_number', { ascending: true })
					.range(from, from + PAGE_SIZE - 1)

				if (dummyError) {
					console.error('Error fetching dummy numbers:', dummyError)
					break
				}
				if (!dummyData || dummyData.length === 0) break

				allDummyNumbers.push(...dummyData)
				if (dummyData.length < PAGE_SIZE) break
				from += PAGE_SIZE
			}
		}

		// Group dummy numbers by packet_id
		const dummyByPacket = new Map<string, string[]>()
		for (const dn of allDummyNumbers) {
			if (!dummyByPacket.has(dn.packet_id)) {
				dummyByPacket.set(dn.packet_id, [])
			}
			dummyByPacket.get(dn.packet_id)!.push(dn.dummy_number)
		}

		// Fetch boards for the institution
		const { data: boardsData } = await supabase
			.from('board')
			.select('board_code, board_name, board_type, board_order')
			.eq('institutions_id', institutionsId)
			.order('board_order', { ascending: true })

		// Filter boards if specific codes requested
		let boards = boardsData || []
		if (boardCodes) {
			const codes = boardCodes.split(',').map(c => c.trim())
			boards = boards.filter((b: any) => codes.includes(b.board_code))
		}

		// Build response: packets with dummy number ranges
		const packetResults = filteredPackets.map((p: any) => {
			const course = p.courses
			const dummyNumbers = dummyByPacket.get(p.id) || []
			// Sort dummy numbers naturally
			dummyNumbers.sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }))

			const dummyRange = dummyNumbers.length > 0
				? dummyNumbers.length === 1
					? dummyNumbers[0]
					: `${dummyNumbers[0]} - ${dummyNumbers[dummyNumbers.length - 1]}`
				: '-'

			return {
				packet_id: p.id,
				course_code: course?.course_code || '',
				course_name: course?.course_name || '',
				board_code: course?.board_code || '',
				packet_no: p.packet_no,
				total_sheets: p.total_sheets,
				total_packets: 1,
				dummy_range: dummyRange,
				dummy_count: dummyNumbers.length,
				barcode: p.barcode || '',
			}
		})

		// Sort by board_code then course_code then packet_no
		packetResults.sort((a: any, b: any) => {
			const boardOrderMap = new Map((boards as any[]).map((bd: any) => [bd.board_code, bd.board_order ?? 999]))
			const aOrder = boardOrderMap.get(a.board_code) ?? 999
			const bOrder = boardOrderMap.get(b.board_code) ?? 999
			if (aOrder !== bOrder) return aOrder - bOrder
			if (a.course_code !== b.course_code) return a.course_code.localeCompare(b.course_code)
			return a.packet_no.localeCompare(b.packet_no, undefined, { numeric: true })
		})

		return NextResponse.json({
			packets: packetResults,
			boards: boards,
		})
	} catch (error) {
		console.error('Error in GET /api/reports/answer-sheet-packets:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
