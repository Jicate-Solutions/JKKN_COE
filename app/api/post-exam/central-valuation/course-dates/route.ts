import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

interface BatchEntry {
	packet_id: string | null
	course_id: string
	board_code: string
	valuation_date: string | null
}

/**
 * GET — Per-packet rows for a board.
 *
 * Each generated packet is one row, so individual packets of the same course
 * can be scheduled on different dates within the board's valuation window.
 *
 * Pending courses (no packets yet) still appear as a single placeholder row
 * with packet_id=null so users see the full course list; the UI disables the
 * date input until packets are generated.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')
	const boardCode = searchParams.get('board_code')

	if (!institutionsId || !sessionId) {
		return NextResponse.json({ error: 'institutions_id and session_id are required' }, { status: 400 })
	}

	const supabase = getSupabaseServer()

	// 1) exam_registrations → course list and reg/arr counts
	const pageSize = 1000
	let allRegs: Array<{ course_code: string | null; is_regular: boolean | null }> = []
	let page = 0
	let more = true
	while (more) {
		const { data, error } = await supabase
			.from('exam_registrations')
			.select('course_code, is_regular')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.range(page * pageSize, (page + 1) * pageSize - 1)
		if (error) {
			console.error('course-dates registrations error:', error)
			return NextResponse.json({ error: 'Failed to load registrations' }, { status: 500 })
		}
		if (!data || data.length === 0) break
		allRegs = allRegs.concat(data)
		page++
		more = data.length === pageSize
	}

	const regCounts = new Map<string, { regular: number; arrear: number; total: number }>()
	for (const r of allRegs) {
		if (!r.course_code) continue
		const prev = regCounts.get(r.course_code) || { regular: 0, arrear: 0, total: 0 }
		if (r.is_regular) prev.regular += 1
		else prev.arrear += 1
		prev.total += 1
		regCounts.set(r.course_code, prev)
	}

	const courseCodes = [...regCounts.keys()]
	if (courseCodes.length === 0) return NextResponse.json([])

	// 2) Course details (filtered by board)
	let coursesQuery = supabase
		.from('courses')
		.select('id, course_code, course_name, board_code')
		.in('course_code', courseCodes)
	if (boardCode) coursesQuery = coursesQuery.eq('board_code', boardCode)

	const { data: courses, error: courseErr } = await coursesQuery
	if (courseErr) {
		console.error('course-dates courses error:', courseErr)
		return NextResponse.json({ error: `Failed to load courses: ${courseErr.message}` }, { status: 500 })
	}

	const courseList = courses || []
	const courseIds = courseList.map(c => c.id)
	if (courseIds.length === 0) return NextResponse.json([])

	// 3) Active packets for these courses
	const { data: packets } = await supabase
		.from('answer_sheet_packets')
		.select('id, course_id, packet_no, total_sheets, valuation_date')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.in('course_id', courseIds)
		.order('packet_no', { ascending: true })
		.range(0, 99999)

	const packetsByCourse = new Map<string, Array<{ id: string; packet_no: string; total_sheets: number; valuation_date: string | null }>>()
	for (const p of packets || []) {
		const list = packetsByCourse.get(p.course_id) || []
		list.push({
			id: p.id,
			packet_no: p.packet_no,
			total_sheets: p.total_sheets || 0,
			valuation_date: p.valuation_date || null,
		})
		packetsByCourse.set(p.course_id, list)
	}

	// 4) Build per-packet rows (or one placeholder row when no packets yet)
	const result: any[] = []
	for (const c of courseList) {
		const cps = packetsByCourse.get(c.id) || []
		const regStats = regCounts.get(c.course_code) || { regular: 0, arrear: 0, total: 0 }

		if (cps.length === 0) {
			result.push({
				row_id: `course:${c.id}`,
				packet_id: null,
				course_id: c.id,
				course_code: c.course_code,
				course_name: c.course_name,
				board_code: c.board_code,
				packet_no: null,
				packet_index: 0,
				total_packets: 0,
				total_sheets: 0,
				regular_count: regStats.regular,
				arrear_count: regStats.arrear,
				student_count: regStats.total,
				valuation_date: null,
				packets_generated: false,
			})
		} else {
			cps.forEach((p, idx) => {
				result.push({
					row_id: `packet:${p.id}`,
					packet_id: p.id,
					course_id: c.id,
					course_code: c.course_code,
					course_name: c.course_name,
					board_code: c.board_code,
					packet_no: p.packet_no,
					packet_index: idx + 1,
					total_packets: cps.length,
					total_sheets: p.total_sheets,
					regular_count: regStats.regular,
					arrear_count: regStats.arrear,
					student_count: regStats.total,
					valuation_date: p.valuation_date,
					packets_generated: true,
				})
			})
		}
	}

	// course_code, then packet_index
	result.sort((a, b) => {
		const cmp = (a.course_code || '').localeCompare(b.course_code || '')
		if (cmp !== 0) return cmp
		return (a.packet_index || 0) - (b.packet_index || 0)
	})

	return NextResponse.json(result)
}

/**
 * PUT — Save per-packet valuation dates. Each entry sets/clears the date on
 * one packet. After saving, refresh the derived course_valuation_dates row
 * (= MIN of packet dates) so the Examiner Allotment / Email tabs continue
 * to read a single course-level date.
 */
export async function PUT(request: Request) {
	const body = await request.json()
	const { institutions_id, examination_session_id, entries } = body as {
		institutions_id: string
		examination_session_id: string
		entries: BatchEntry[]
	}

	if (!institutions_id || !examination_session_id || !Array.isArray(entries)) {
		return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
	}

	const supabase = getSupabaseServer()

	// Only packet-bound entries can be saved (pending placeholder rows have packet_id=null)
	const packetEntries = entries.filter(e => !!e.packet_id)
	if (packetEntries.length === 0) {
		return NextResponse.json({ success: true, upserted: 0, deleted: 0 })
	}

	// Validate dates against the board windows
	const boardCodes = [...new Set(packetEntries.map(e => e.board_code))]
	const { data: windows } = await supabase
		.from('board_valuation_windows')
		.select('board_code, from_date, to_date')
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.in('board_code', boardCodes)

	const windowMap = new Map((windows || []).map(w => [w.board_code, w]))
	for (const e of packetEntries) {
		if (e.valuation_date === null) continue
		const w = windowMap.get(e.board_code)
		if (!w) {
			return NextResponse.json({ error: `No board window set for ${e.board_code}` }, { status: 400 })
		}
		if (e.valuation_date < w.from_date || e.valuation_date > w.to_date) {
			return NextResponse.json(
				{ error: `Date ${e.valuation_date} outside window ${w.from_date}..${w.to_date} for ${e.board_code}` },
				{ status: 400 },
			)
		}
	}

	// Update each packet's valuation_date
	let upserted = 0
	let cleared = 0
	for (const e of packetEntries) {
		const { error } = await supabase
			.from('answer_sheet_packets')
			.update({ valuation_date: e.valuation_date, updated_at: new Date().toISOString() })
			.eq('id', e.packet_id!)
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
		if (error) {
			console.error('packet date update error:', error)
			return NextResponse.json({ error: 'Failed to save packet dates' }, { status: 500 })
		}
		if (e.valuation_date) upserted++
		else cleared++
	}

	// Sync derived course_valuation_dates for all touched courses
	const affectedCourses = [...new Set(packetEntries.map(e => e.course_id))]
	for (const courseId of affectedCourses) {
		const { data: rows } = await supabase
			.from('answer_sheet_packets')
			.select('valuation_date')
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('course_id', courseId)
			.eq('is_active', true)
			.not('valuation_date', 'is', null)

		const dates = (rows || []).map(r => r.valuation_date as string).filter(Boolean).sort()
		if (dates.length === 0) {
			await supabase
				.from('course_valuation_dates')
				.delete()
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', examination_session_id)
				.eq('course_id', courseId)
		} else {
			const { data: courseRow } = await supabase
				.from('courses')
				.select('board_code')
				.eq('id', courseId)
				.single()
			if (courseRow?.board_code) {
				await supabase
					.from('course_valuation_dates')
					.upsert(
						{
							institutions_id,
							examination_session_id,
							course_id: courseId,
							board_code: courseRow.board_code,
							valuation_date: dates[0],
							updated_at: new Date().toISOString(),
						},
						{ onConflict: 'institutions_id,examination_session_id,course_id' },
					)
			}
		}
	}

	return NextResponse.json({ success: true, upserted, deleted: cleared })
}
