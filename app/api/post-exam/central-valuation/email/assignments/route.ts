import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	CentralValuationExaminerAggregateRow,
	CentralValuationCourseEntry,
	CentralValuationExaminerType,
} from '@/types/central-valuation-email'

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
			course_id,
			total_sheets,
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
		.range(0, 99999)

	if (pErr) {
		console.error('assignments packet fetch error:', pErr)
		return NextResponse.json({ error: 'Failed to load packets' }, { status: 500 })
	}

	const courseIds = [...new Set((packets || []).map(p => p.course_id))]
	if (!courseIds.length) return NextResponse.json([])

	let coursesQuery = supabase
		.from('courses')
		.select('id, course_code, course_name, course_title, board_code')
		.in('id', courseIds)

	if (boardCode) coursesQuery = coursesQuery.eq('board_code', boardCode)

	const { data: courses } = await coursesQuery
	const courseMap = new Map(
		(courses || []).map(c => [
			c.id,
			{ course_code: c.course_code, course_name: c.course_name || c.course_title, board_code: c.board_code },
		])
	)
	const boardCourseIds = new Set(courseMap.keys())

	const { data: cvDates } = await supabase
		.from('course_valuation_dates')
		.select('course_id, valuation_date')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
	const dateMap = new Map((cvDates || []).map(d => [d.course_id, d.valuation_date]))

	// Aggregate sheet/packet counts per course
	const courseStats = new Map<string, { packet_count: number; sheet_count: number }>()
	for (const p of packets || []) {
		if (!boardCourseIds.has(p.course_id)) continue
		const prev = courseStats.get(p.course_id) || { packet_count: 0, sheet_count: 0 }
		prev.packet_count += 1
		prev.sheet_count += p.total_sheets || 0
		courseStats.set(p.course_id, prev)
	}

	// External examiner details
	const externalIds = [...new Set(
		(packets || [])
			.filter(p => boardCourseIds.has(p.course_id) && p.external_examiner_id)
			.map(p => p.external_examiner_id as string)
	)]
	let externalMap = new Map<string, { full_name: string; email: string | null }>()
	if (externalIds.length) {
		const { data: exts } = await supabase
			.from('examiners')
			.select('id, full_name, email')
			.in('id', externalIds)
		externalMap = new Map((exts || []).map(e => [e.id, { full_name: e.full_name, email: e.email }]))
	}

	// Grouping helpers
	interface GroupKey { examiner_type: CentralValuationExaminerType; examiner_key: string }
	const groupMap = new Map<string, {
		meta: { examiner_type: CentralValuationExaminerType; examiner_key: string; examiner_name: string; examiner_email: string | null }
		courseIds: Set<string>
	}>()

	const addToGroup = (
		examinerType: CentralValuationExaminerType,
		examinerKey: string | null,
		examinerName: string | null,
		examinerEmail: string | null,
		courseId: string,
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
				courseIds: new Set(),
			})
		}
		groupMap.get(k)!.courseIds.add(courseId)
	}

	// Dedupe packet rows per course — all packets of the same course carry the same examiners
	const seenCourseExaminer = new Set<string>()

	for (const p of packets || []) {
		if (!boardCourseIds.has(p.course_id)) continue
		const dedupKey = p.course_id
		if (seenCourseExaminer.has(dedupKey)) continue
		seenCourseExaminer.add(dedupKey)

		addToGroup('internal', p.internal_examiner_staff_id, p.internal_examiner_name, p.internal_examiner_email, p.course_id)
		if (p.external_examiner_id) {
			const ext = externalMap.get(p.external_examiner_id)
			addToGroup('external', p.external_examiner_id, ext?.full_name || null, ext?.email || null, p.course_id)
		}
		addToGroup('chief', p.chief_examiner_staff_id, p.chief_examiner_name, p.chief_examiner_email, p.course_id)
		addToGroup('assistant', p.assistant_examiner_staff_id, p.assistant_examiner_name, p.assistant_examiner_email, p.course_id)
	}

	// Pull latest email log per (type, key)
	const examinerTypeKeyPairs = [...groupMap.values()].map(g => g.meta)
	const typeList = [...new Set(examinerTypeKeyPairs.map(x => x.examiner_type))]
	const keyList = examinerTypeKeyPairs.map(x => x.examiner_key)

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
		const courses: CentralValuationCourseEntry[] = [...g.courseIds]
			.map(cid => {
				const c = courseMap.get(cid)
				const stat = courseStats.get(cid) || { packet_count: 0, sheet_count: 0 }
				return c ? {
					course_code: c.course_code,
					course_name: c.course_name,
					valuation_date: dateMap.get(cid) || '',
					packet_count: stat.packet_count,
					sheet_count: stat.sheet_count,
				} : null
			})
			.filter(Boolean) as CentralValuationCourseEntry[]

		const log = logMap.get(k)
		return {
			examiner_key: g.meta.examiner_key,
			examiner_name: g.meta.examiner_name,
			examiner_type: g.meta.examiner_type,
			examiner_email: g.meta.examiner_email,
			courses,
			last_email_status: (log?.status as 'SENT' | 'FAILED' | 'PENDING' | undefined) || null,
			last_email_sent_at: log?.sent_at || null,
		}
	})

	result.sort((a, b) => a.examiner_type.localeCompare(b.examiner_type) || a.examiner_name.localeCompare(b.examiner_name))

	return NextResponse.json(result)
}
