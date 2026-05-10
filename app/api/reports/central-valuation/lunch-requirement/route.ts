import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Central Valuation lunch requirement & attendance certificate report.
 *
 * Data sources:
 *   - answer_sheet_packets.valuation_date  → per-packet date
 *   - answer_sheet_packets.{internal,chief,assistant}_examiner_*  → internal staff
 *   - answer_sheet_packets.external_examiner_id  → external examiner
 *   - examiners                                  → external examiner profile
 *
 * Internal/chief/assistant staff are rolled up into a single "Internal" bucket
 * to mirror the shape of the practical exam report.
 */
export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const action = searchParams.get('action')

	const filterInstitutionsId = searchParams.get('institutions_id')

	try {
		if (action === 'lunch-data') {
			const institutionId = searchParams.get('institutionId') || filterInstitutionsId
			const sessionId = searchParams.get('sessionId')

			if (!institutionId || !sessionId) {
				return NextResponse.json({ error: 'Institution and Session IDs required' }, { status: 400 })
			}

			const { data: packets, error: packetErr } = await supabase
				.from('answer_sheet_packets')
				.select('id, valuation_date, internal_examiner_staff_id, chief_examiner_staff_id, assistant_examiner_staff_id, external_examiner_id')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)
				.not('valuation_date', 'is', null)
				.range(0, 99999)

			if (packetErr) throw packetErr

			if (!packets || packets.length === 0) {
				return NextResponse.json({
					dates: [],
					summary: { total_dates: 0, total_internal: 0, total_external: 0, total_persons: 0 },
				})
			}

			const dateInternalSet = new Map<string, Set<string>>()
			const dateExternalSet = new Map<string, Set<string>>()

			for (const p of packets) {
				const date = p.valuation_date as string
				if (!date) continue

				if (!dateInternalSet.has(date)) dateInternalSet.set(date, new Set())
				if (!dateExternalSet.has(date)) dateExternalSet.set(date, new Set())

				const intSet = dateInternalSet.get(date)!
				if (p.internal_examiner_staff_id) intSet.add(`int:${p.internal_examiner_staff_id}`)
				if (p.chief_examiner_staff_id) intSet.add(`chief:${p.chief_examiner_staff_id}`)
				if (p.assistant_examiner_staff_id) intSet.add(`asst:${p.assistant_examiner_staff_id}`)

				if (p.external_examiner_id) dateExternalSet.get(date)!.add(p.external_examiner_id)
			}

			const sortedDates = [...new Set(packets.map(p => p.valuation_date as string).filter(Boolean))].sort()

			let totalInternal = 0
			let totalExternal = 0

			const dates = sortedDates.map((date, idx) => {
				const internalCount = dateInternalSet.get(date)?.size || 0
				const externalCount = dateExternalSet.get(date)?.size || 0
				totalInternal += internalCount
				totalExternal += externalCount

				return {
					serial_number: idx + 1,
					exam_date: date,
					purpose: 'Central Valuation',
					internal_count: internalCount,
					external_count: externalCount,
					total_persons: internalCount + externalCount,
				}
			})

			return NextResponse.json({
				dates,
				summary: {
					total_dates: dates.length,
					total_internal: totalInternal,
					total_external: totalExternal,
					total_persons: totalInternal + totalExternal,
				},
			})
		}

		if (action === 'attendance-certificate') {
			const institutionId = searchParams.get('institutionId') || filterInstitutionsId
			const sessionId = searchParams.get('sessionId')

			if (!institutionId || !sessionId) {
				return NextResponse.json({ error: 'Institution and Session IDs required' }, { status: 400 })
			}

			const { data: packets, error: packetErr } = await supabase
				.from('answer_sheet_packets')
				.select(`
					course_id, valuation_date,
					internal_examiner_staff_id, internal_examiner_name, internal_examiner_designation,
					chief_examiner_staff_id, chief_examiner_name, chief_examiner_designation,
					assistant_examiner_staff_id, assistant_examiner_name, assistant_examiner_designation,
					external_examiner_id
				`)
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('is_active', true)
				.not('valuation_date', 'is', null)
				.range(0, 99999)

			if (packetErr) throw packetErr

			if (!packets || packets.length === 0) {
				return NextResponse.json({ examiners: [], available_boards: [] })
			}

			// Resolve course_id → board_code → board_name
			const distinctCourseIds = [...new Set(packets.map(p => p.course_id as string).filter(Boolean))]
			const courseToBoardCode = new Map<string, string>()
			if (distinctCourseIds.length > 0) {
				const { data: courses } = await supabase
					.from('courses')
					.select('id, board_code')
					.in('id', distinctCourseIds)
				for (const c of courses || []) {
					if (c.board_code) courseToBoardCode.set(c.id as string, c.board_code as string)
				}
			}
			const distinctBoardCodes = [...new Set([...courseToBoardCode.values()])]
			const boardNameByCode = new Map<string, string>()
			if (distinctBoardCodes.length > 0) {
				const { data: boardRows } = await supabase
					.from('board')
					.select('board_code, board_name')
					.in('board_code', distinctBoardCodes)
				for (const b of boardRows || []) {
					if (b.board_code) boardNameByCode.set(b.board_code as string, (b.board_name as string) || b.board_code as string)
				}
			}

			// External: examiner_id → set of dates & board codes
			const externalDates = new Map<string, Set<string>>()
			const externalBoards = new Map<string, Set<string>>()
			// Internal/chief/assistant: each tracked separately so a staff member
			// who serves in multiple roles gets a certificate per role
			type StaffBucket = Map<string, { name: string; designation: string; dates: Set<string>; boards: Set<string> }>
			const internalDates: StaffBucket = new Map()
			const chiefDates: StaffBucket = new Map()
			const assistantDates: StaffBucket = new Map()

			const addStaff = (bucket: StaffBucket, staffId: string | null, name: string | null, designation: string | null, date: string, boardCode: string | undefined) => {
				if (!staffId) return
				if (!bucket.has(staffId)) {
					bucket.set(staffId, { name: name || '', designation: designation || '', dates: new Set(), boards: new Set() })
				}
				const entry = bucket.get(staffId)!
				entry.dates.add(date)
				if (boardCode) entry.boards.add(boardCode)
			}

			for (const p of packets) {
				const date = p.valuation_date as string
				if (!date) continue
				const boardCode = courseToBoardCode.get(p.course_id as string)

				if (p.external_examiner_id) {
					if (!externalDates.has(p.external_examiner_id)) {
						externalDates.set(p.external_examiner_id, new Set())
						externalBoards.set(p.external_examiner_id, new Set())
					}
					externalDates.get(p.external_examiner_id)!.add(date)
					if (boardCode) externalBoards.get(p.external_examiner_id)!.add(boardCode)
				}

				addStaff(internalDates, p.internal_examiner_staff_id, p.internal_examiner_name, p.internal_examiner_designation, date, boardCode)
				addStaff(chiefDates, p.chief_examiner_staff_id, p.chief_examiner_name, p.chief_examiner_designation, date, boardCode)
				addStaff(assistantDates, p.assistant_examiner_staff_id, p.assistant_examiner_name, p.assistant_examiner_designation, date, boardCode)
			}

			// Look up external examiner profile data
			const externalIds = [...externalDates.keys()]
			const examinerDetails = new Map<string, { full_name: string; designation: string; department: string; institution_name: string }>()
			if (externalIds.length > 0) {
				const { data: examiners } = await supabase
					.from('examiners')
					.select('id, full_name, designation, department, institution_name')
					.in('id', externalIds)

				for (const e of examiners || []) {
					examinerDetails.set(e.id, {
						full_name: e.full_name || '',
						designation: e.designation || '',
						department: e.department || '',
						institution_name: e.institution_name || '',
					})
				}
			}

			const toBoardList = (codes: Set<string>) =>
				[...codes].sort().map(code => ({ board_code: code, board_name: boardNameByCode.get(code) || code }))

			const externalList = externalIds.map(id => {
				const detail = examinerDetails.get(id)
				const dates = [...(externalDates.get(id) || [])].sort()
				const fromDate = dates[0] || ''
				const toDate = dates[dates.length - 1] || ''

				return {
					examiner_name: detail?.full_name || 'Unknown',
					designation: detail?.designation || '',
					department: detail?.department || '',
					institution_name: detail?.institution_name || '',
					type: 'External' as const,
					from_date: fromDate,
					to_date: fromDate === toDate ? '' : toDate,
					all_dates: dates,
					total_days: dates.length,
					boards: toBoardList(externalBoards.get(id) || new Set()),
				}
			}).sort((a, b) => a.examiner_name.localeCompare(b.examiner_name))

			const buildStaffList = (bucket: StaffBucket, type: 'Internal' | 'Chief' | 'Assistant') =>
				[...bucket.entries()].map(([, val]) => {
					const dates = [...val.dates].sort()
					const fromDate = dates[0] || ''
					const toDate = dates[dates.length - 1] || ''

					return {
						examiner_name: val.name || 'Unknown',
						designation: val.designation || '',
						department: '',
						institution_name: '',
						type,
						from_date: fromDate,
						to_date: fromDate === toDate ? '' : toDate,
						all_dates: dates,
						total_days: dates.length,
						boards: toBoardList(val.boards),
					}
				}).sort((a, b) => a.examiner_name.localeCompare(b.examiner_name))

			const allExaminers = [
				...externalList,
				...buildStaffList(internalDates, 'Internal'),
				...buildStaffList(chiefDates, 'Chief'),
				...buildStaffList(assistantDates, 'Assistant'),
			]

			// Collect all distinct boards present across all examiners
			const seenBoardCodes = new Set<string>()
			const available_boards: { board_code: string; board_name: string }[] = []
			for (const ex of allExaminers) {
				for (const b of ex.boards) {
					if (!seenBoardCodes.has(b.board_code)) {
						seenBoardCodes.add(b.board_code)
						available_boards.push(b)
					}
				}
			}
			available_boards.sort((a, b) => a.board_code.localeCompare(b.board_code))

			return NextResponse.json({ examiners: allExaminers, available_boards })
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
	} catch (error) {
		console.error('Central valuation report error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Failed to fetch data' },
			{ status: 500 }
		)
	}
}
