import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

interface BatchEntry {
	course_id: string
	board_code: string
	valuation_date: string | null
}

/**
 * GET — Course list for a board derived from exam_registrations (fee_paid=true)
 * so dates can be pre-planned before packet generation. Packet counts come from
 * answer_sheet_packets if available, else 0 (indicates packets not generated yet).
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

	// 1. Paginated exam_registrations (fee paid)
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

	// Aggregate registration counts by course_code
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

	// 2. Course details (filter by board if passed)
	let coursesQuery = supabase
		.from('courses')
		.select('id, course_code, course_name, course_title, board_code')
		.in('course_code', courseCodes)

	if (boardCode) coursesQuery = coursesQuery.eq('board_code', boardCode)

	const { data: courses, error: courseErr } = await coursesQuery
	if (courseErr) return NextResponse.json({ error: 'Failed to load courses' }, { status: 500 })

	// 3. Packet aggregates (optional — may be empty before packets are generated)
	const { data: packets } = await supabase
		.from('answer_sheet_packets')
		.select('course_id, total_sheets')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.range(0, 99999)

	const packetAgg = new Map<string, { packet_count: number; sheet_count: number }>()
	for (const p of packets || []) {
		const prev = packetAgg.get(p.course_id) || { packet_count: 0, sheet_count: 0 }
		prev.packet_count += 1
		prev.sheet_count += p.total_sheets || 0
		packetAgg.set(p.course_id, prev)
	}

	// 4. Existing valuation dates
	const { data: cvDates } = await supabase
		.from('course_valuation_dates')
		.select('course_id, valuation_date, board_code')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
	const dateMap = new Map((cvDates || []).map(d => [d.course_id, d]))

	// 5. Build rows
	const result = (courses || []).map(c => {
		const agg = packetAgg.get(c.id) || { packet_count: 0, sheet_count: 0 }
		const dr = dateMap.get(c.id)
		const regStats = regCounts.get(c.course_code) || { regular: 0, arrear: 0, total: 0 }
		return {
			course_id: c.id,
			course_code: c.course_code,
			course_name: c.course_name || c.course_title,
			board_code: c.board_code,
			valuation_date: dr?.valuation_date || null,
			packet_count: agg.packet_count,
			sheet_count: agg.sheet_count,
			regular_count: regStats.regular,
			arrear_count: regStats.arrear,
			student_count: regStats.total,
			packets_generated: agg.packet_count > 0,
		}
	})

	// Sort by course_code
	result.sort((a, b) => a.course_code.localeCompare(b.course_code))

	return NextResponse.json(result)
}

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

	const boardCodes = [...new Set(entries.map(e => e.board_code))]
	const { data: windows } = await supabase
		.from('board_valuation_windows')
		.select('board_code, from_date, to_date')
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.in('board_code', boardCodes)

	const windowMap = new Map((windows || []).map(w => [w.board_code, w]))

	for (const e of entries) {
		if (e.valuation_date === null) continue
		const w = windowMap.get(e.board_code)
		if (!w) {
			return NextResponse.json({ error: `No board window set for ${e.board_code}` }, { status: 400 })
		}
		if (e.valuation_date < w.from_date || e.valuation_date > w.to_date) {
			return NextResponse.json(
				{ error: `Date ${e.valuation_date} outside window ${w.from_date}..${w.to_date} for ${e.board_code}` },
				{ status: 400 }
			)
		}
	}

	const upserts = entries
		.filter(e => e.valuation_date !== null)
		.map(e => ({
			institutions_id,
			examination_session_id,
			course_id: e.course_id,
			board_code: e.board_code,
			valuation_date: e.valuation_date as string,
			updated_at: new Date().toISOString(),
		}))

	const deletes = entries.filter(e => e.valuation_date === null).map(e => e.course_id)

	if (upserts.length) {
		const { error } = await supabase
			.from('course_valuation_dates')
			.upsert(upserts, { onConflict: 'institutions_id,examination_session_id,course_id' })
		if (error) {
			console.error('course-dates upsert error:', error)
			return NextResponse.json({ error: 'Failed to save dates' }, { status: 500 })
		}
	}

	if (deletes.length) {
		const { error } = await supabase
			.from('course_valuation_dates')
			.delete()
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.in('course_id', deletes)
		if (error) {
			console.error('course-dates delete error:', error)
			return NextResponse.json({ error: 'Failed to clear dates' }, { status: 500 })
		}
	}

	return NextResponse.json({ success: true, upserted: upserts.length, deleted: deletes.length })
}
