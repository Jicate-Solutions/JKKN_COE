import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

interface BatchEntry {
	course_id: string
	board_code: string
	valuation_date: string | null
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')
	const boardCode = searchParams.get('board_code')

	if (!institutionsId || !sessionId) {
		return NextResponse.json({ error: 'institutions_id and session_id are required' }, { status: 400 })
	}

	const supabase = getSupabaseServer()

	const { data: packets } = await supabase
		.from('answer_sheet_packets')
		.select('course_id, total_sheets')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.range(0, 99999)

	const courseIds = [...new Set((packets || []).map(p => p.course_id))]
	if (courseIds.length === 0) return NextResponse.json([])

	let coursesQuery = supabase
		.from('courses')
		.select('id, course_code, course_name, course_title, board_code')
		.in('id', courseIds)

	if (boardCode) coursesQuery = coursesQuery.eq('board_code', boardCode)

	const { data: courses, error: courseErr } = await coursesQuery
	if (courseErr) return NextResponse.json({ error: 'Failed to load courses' }, { status: 500 })

	const { data: cvDates } = await supabase
		.from('course_valuation_dates')
		.select('course_id, valuation_date, board_code')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)

	const dateMap = new Map((cvDates || []).map(d => [d.course_id, d]))

	const aggMap = new Map<string, { packet_count: number; sheet_count: number }>()
	for (const p of packets || []) {
		const prev = aggMap.get(p.course_id) || { packet_count: 0, sheet_count: 0 }
		prev.packet_count += 1
		prev.sheet_count += p.total_sheets || 0
		aggMap.set(p.course_id, prev)
	}

	const result = (courses || []).map(c => {
		const agg = aggMap.get(c.id) || { packet_count: 0, sheet_count: 0 }
		const d = dateMap.get(c.id)
		return {
			course_id: c.id,
			course_code: c.course_code,
			course_name: c.course_name || c.course_title,
			board_code: c.board_code,
			valuation_date: d?.valuation_date || null,
			packet_count: agg.packet_count,
			sheet_count: agg.sheet_count,
		}
	})

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
