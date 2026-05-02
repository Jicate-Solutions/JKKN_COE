import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	CentralValuationExaminerAggregateRow,
	CentralValuationCourseEntry,
	CentralValuationExaminerType,
} from '@/types/central-valuation-email'

/**
 * GET — Per-examiner aggregate for the Send Appointments tab.
 *
 * Each examiner's `courses` list is now ONE ROW PER PACKET they are assigned
 * to (not one per course). So if Mr. X handles packets 1/9 and 2/9 of
 * 24UGTA01, the API emits two entries with packet_index 1 and 2, each
 * carrying that packet's own valuation_date and total_sheets.
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

	const { data: packets, error: pErr } = await supabase
		.from('answer_sheet_packets')
		.select(`
			id,
			course_id,
			packet_no,
			total_sheets,
			valuation_date,
			internal_examiner_staff_id,
			internal_examiner_name,
			internal_examiner_email,
			external_examiner_id,
			chief_examiner_staff_id,
			chief_examiner_name,
			chief_examiner_email,
			assistant_examiner_staff_id,
			assistant_examiner_name,
			assistant_examiner_email
		`)
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.order('packet_no', { ascending: true })
		.range(0, 99999)

	if (pErr) {
		console.error('assignments packet fetch error:', pErr)
		return NextResponse.json({ error: 'Failed to load packets' }, { status: 500 })
	}

	const courseIds = [...new Set((packets || []).map(p => p.course_id))]
	if (!courseIds.length) return NextResponse.json([])

	let coursesQuery = supabase
		.from('courses')
		.select('id, course_code, course_name, board_code')
		.in('id', courseIds)
	if (boardCode) coursesQuery = coursesQuery.eq('board_code', boardCode)

	const { data: courses } = await coursesQuery
	const courseMap = new Map(
		(courses || []).map(c => [
			c.id,
			{ course_code: c.course_code, course_name: c.course_name, board_code: c.board_code },
		]),
	)
	const boardCourseIds = new Set(courseMap.keys())

	// Compute total_packets per course (so each entry can show "i/N")
	const totalPacketsByCourse = new Map<string, number>()
	for (const p of packets || []) {
		if (!boardCourseIds.has(p.course_id)) continue
		totalPacketsByCourse.set(p.course_id, (totalPacketsByCourse.get(p.course_id) || 0) + 1)
	}
	// packet_index — 1-based per course in packet_no order
	const packetIndexById = new Map<string, number>()
	const seenSeq = new Map<string, number>()
	for (const p of packets || []) {
		if (!boardCourseIds.has(p.course_id)) continue
		const next = (seenSeq.get(p.course_id) || 0) + 1
		seenSeq.set(p.course_id, next)
		packetIndexById.set(p.id, next)
	}

	// External examiner details
	const externalIds = [
		...new Set(
			(packets || [])
				.filter(p => boardCourseIds.has(p.course_id) && p.external_examiner_id)
				.map(p => p.external_examiner_id as string),
		),
	]
	let externalMap = new Map<string, { full_name: string; email: string | null }>()
	if (externalIds.length) {
		const { data: exts } = await supabase
			.from('examiners')
			.select('id, full_name, email')
			.in('id', externalIds)
		externalMap = new Map((exts || []).map(e => [e.id, { full_name: e.full_name, email: e.email }]))
	}

	// Group examiners → list of packet entries
	const groupMap = new Map<string, {
		meta: { examiner_type: CentralValuationExaminerType; examiner_key: string; examiner_name: string; examiner_email: string | null }
		entries: CentralValuationCourseEntry[]
	}>()

	const addEntry = (
		examinerType: CentralValuationExaminerType,
		examinerKey: string | null,
		examinerName: string | null,
		examinerEmail: string | null,
		entry: CentralValuationCourseEntry,
	) => {
		if (!examinerKey) return
		const k = `${examinerType}:${examinerKey}`
		if (!groupMap.has(k)) {
			groupMap.set(k, {
				meta: {
					examiner_type: examinerType,
					examiner_key: examinerKey,
					examiner_name: examinerName || '',
					examiner_email: examinerEmail || null,
				},
				entries: [],
			})
		}
		groupMap.get(k)!.entries.push(entry)
	}

	for (const p of packets || []) {
		if (!boardCourseIds.has(p.course_id)) continue
		const c = courseMap.get(p.course_id)!
		const total = totalPacketsByCourse.get(p.course_id) || 0
		const idx = packetIndexById.get(p.id) || 0

		const baseEntry: CentralValuationCourseEntry = {
			course_code: c.course_code,
			course_name: c.course_name,
			valuation_date: p.valuation_date || '',
			packet_no: p.packet_no,
			packet_index: idx,
			total_packets: total,
			packet_count: 1,
			sheet_count: p.total_sheets || 0,
		}

		addEntry('internal', p.internal_examiner_staff_id, p.internal_examiner_name, p.internal_examiner_email, baseEntry)
		if (p.external_examiner_id) {
			const ext = externalMap.get(p.external_examiner_id)
			addEntry('external', p.external_examiner_id, ext?.full_name || null, ext?.email || null, baseEntry)
		}
		addEntry('chief', p.chief_examiner_staff_id, p.chief_examiner_name, p.chief_examiner_email, baseEntry)
		addEntry('assistant', p.assistant_examiner_staff_id, p.assistant_examiner_name, p.assistant_examiner_email, baseEntry)
	}

	// Latest email log per (type, key)
	const groupMetas = [...groupMap.values()].map(g => g.meta)
	const typeList = [...new Set(groupMetas.map(x => x.examiner_type))]
	const keyList = groupMetas.map(x => x.examiner_key)

	const logMap = new Map<string, { status: string; sent_at: string }>()
	if (keyList.length) {
		const { data: logs } = await supabase
			.from('central_valuation_email_log')
			.select('examiner_type, examiner_key, status, sent_at')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.in('examiner_type', typeList)
			.in('examiner_key', keyList)
			.order('sent_at', { ascending: false })
		for (const l of logs || []) {
			const k = `${l.examiner_type}:${l.examiner_key}`
			if (!logMap.has(k)) logMap.set(k, { status: l.status, sent_at: l.sent_at })
		}
	}

	const result: CentralValuationExaminerAggregateRow[] = [...groupMap.entries()].map(([k, g]) => {
		// Sort entries: course_code then packet_index
		const entries = g.entries.slice().sort((a, b) => {
			const cmp = (a.course_code || '').localeCompare(b.course_code || '')
			if (cmp !== 0) return cmp
			return (a.packet_index || 0) - (b.packet_index || 0)
		})
		const log = logMap.get(k)
		return {
			examiner_key: g.meta.examiner_key,
			examiner_name: g.meta.examiner_name,
			examiner_type: g.meta.examiner_type,
			examiner_email: g.meta.examiner_email,
			courses: entries,
			last_email_status: (log?.status as 'SENT' | 'FAILED' | 'PENDING' | undefined) || null,
			last_email_sent_at: log?.sent_at || null,
		}
	})

	result.sort((a, b) => a.examiner_type.localeCompare(b.examiner_type) || a.examiner_name.localeCompare(b.examiner_name))

	return NextResponse.json(result)
}
