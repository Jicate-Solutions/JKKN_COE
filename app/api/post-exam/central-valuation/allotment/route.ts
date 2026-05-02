import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	CentralValuationAllotmentRow,
	ExternalExaminer,
	InternalStaff,
} from '@/types/central-valuation'

/**
 * GET — One row per packet for the selected board, so internal/external/chief/
 * assistant examiners can be assigned independently per packet.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')
	const boardCode = searchParams.get('board_code')

	if (!institutionsId || !sessionId || !boardCode) {
		return NextResponse.json(
			{ error: 'institutions_id, session_id, board_code are required' },
			{ status: 400 },
		)
	}

	const supabase = getSupabaseServer()

	const { data: packets } = await supabase
		.from('answer_sheet_packets')
		.select(`
			id,
			course_id,
			packet_no,
			total_sheets,
			valuation_date,
			internal_examiner_staff_id,
			internal_examiner_name,
			internal_examiner_mobile,
			internal_examiner_designation,
			internal_examiner_email,
			external_examiner_id,
			chief_examiner_staff_id,
			chief_examiner_name,
			chief_examiner_mobile,
			chief_examiner_designation,
			chief_examiner_email,
			assistant_examiner_staff_id,
			assistant_examiner_name,
			assistant_examiner_mobile,
			assistant_examiner_designation,
			assistant_examiner_email
		`)
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('is_active', true)
		.order('packet_no', { ascending: true })
		.range(0, 99999)

	const courseIds = [...new Set((packets || []).map(p => p.course_id))]
	if (!courseIds.length) return NextResponse.json([])

	const { data: courses } = await supabase
		.from('courses')
		.select('id, course_code, course_name, board_code')
		.in('id', courseIds)
		.eq('board_code', boardCode)

	const courseMap = new Map(
		(courses || []).map(c => [c.id, c]),
	)

	// External examiner lookups
	const externalIds = [
		...new Set(
			(packets || [])
				.map(p => p.external_examiner_id)
				.filter((v): v is string => !!v),
		),
	]
	let externalMap = new Map<string, ExternalExaminer>()
	if (externalIds.length) {
		const { data: exts } = await supabase
			.from('examiners')
			.select('id, full_name, email, mobile, designation, department, institution_name')
			.in('id', externalIds)
		externalMap = new Map(
			(exts || []).map(e => [
				e.id,
				{
					examiner_id: e.id,
					full_name: e.full_name,
					email: e.email,
					mobile: e.mobile,
					designation: e.designation,
					department: e.department,
					institution_name: e.institution_name,
				},
			]),
		)
	}

	const { data: board } = await supabase
		.from('board')
		.select('board_name')
		.eq('board_code', boardCode)
		.maybeSingle()

	// Build per-packet rows, but only for packets whose course is in this board
	const courseScoped = (packets || []).filter(p => courseMap.has(p.course_id))

	// Group by course to compute packet_index and total_packets (already ordered by packet_no)
	const packetsByCourse = new Map<string, typeof courseScoped>()
	for (const p of courseScoped) {
		const list = packetsByCourse.get(p.course_id) || []
		list.push(p)
		packetsByCourse.set(p.course_id, list)
	}

	const rows: CentralValuationAllotmentRow[] = []
	const sortedCourses = [...packetsByCourse.entries()].sort((a, b) => {
		const ca = courseMap.get(a[0])
		const cb = courseMap.get(b[0])
		return (ca?.course_code || '').localeCompare(cb?.course_code || '')
	})

	for (const [courseId, cps] of sortedCourses) {
		const c = courseMap.get(courseId)
		if (!c) continue
		cps.forEach((p, idx) => {
			const internal: InternalStaff | null = p.internal_examiner_staff_id
				? {
						staff_id: p.internal_examiner_staff_id,
						staff_name: p.internal_examiner_name || '',
						staff_email: p.internal_examiner_email,
						staff_mobile: p.internal_examiner_mobile,
						staff_designation: p.internal_examiner_designation,
						staff_department: null,
				  }
				: null
			const external = p.external_examiner_id
				? externalMap.get(p.external_examiner_id) || null
				: null
			const chief: InternalStaff | null = p.chief_examiner_staff_id
				? {
						staff_id: p.chief_examiner_staff_id,
						staff_name: p.chief_examiner_name || '',
						staff_email: p.chief_examiner_email,
						staff_mobile: p.chief_examiner_mobile,
						staff_designation: p.chief_examiner_designation,
						staff_department: null,
				  }
				: null
			const assistant: InternalStaff | null = p.assistant_examiner_staff_id
				? {
						staff_id: p.assistant_examiner_staff_id,
						staff_name: p.assistant_examiner_name || '',
						staff_email: p.assistant_examiner_email,
						staff_mobile: p.assistant_examiner_mobile,
						staff_designation: p.assistant_examiner_designation,
						staff_department: null,
				  }
				: null

			const evaluatorSet = Boolean(internal || external)
			const status: CentralValuationAllotmentRow['status'] = !evaluatorSet
				? 'Not Assigned'
				: chief
					? 'Fully Allotted'
					: 'Paper Evaluator Set'

			rows.push({
				packet_id: p.id,
				packet_no: p.packet_no,
				packet_index: idx + 1,
				total_packets: cps.length,
				course_id: c.id,
				course_code: c.course_code,
				course_name: c.course_name,
				board_code: c.board_code,
				board_name: board?.board_name || boardCode,
				valuation_date: p.valuation_date || null,
				sheet_count: p.total_sheets || 0,
				internal_examiner: internal,
				external_examiner: external,
				chief_examiner: chief,
				assistant_examiner: assistant,
				status,
			})
		})
	}

	return NextResponse.json(rows)
}

interface StaffSnapshot {
	staff_id: string
	staff_name?: string | null
	staff_mobile?: string | null
	staff_designation?: string | null
	staff_email?: string | null
}

interface PutBody {
	institutions_id: string
	examination_session_id: string
	packet_id: string
	internal: StaffSnapshot | null
	external_examiner_id: string | null
	chief: StaffSnapshot | null
	assistant: StaffSnapshot | null
}

/**
 * PUT — Save examiners for a single packet (identified by packet_id).
 */
export async function PUT(request: Request) {
	const body = (await request.json()) as PutBody
	const {
		institutions_id,
		examination_session_id,
		packet_id,
		internal,
		external_examiner_id,
		chief,
		assistant,
	} = body

	if (!institutions_id || !examination_session_id || !packet_id) {
		return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
	}
	if (internal && external_examiner_id) {
		return NextResponse.json({ error: 'Internal XOR External; pick only one' }, { status: 400 })
	}

	const supabase = getSupabaseServer()
	const { error } = await supabase
		.from('answer_sheet_packets')
		.update({
			internal_examiner_staff_id: internal?.staff_id ?? null,
			internal_examiner_name: internal?.staff_name ?? null,
			internal_examiner_mobile: internal?.staff_mobile ?? null,
			internal_examiner_designation: internal?.staff_designation ?? null,
			internal_examiner_email: internal?.staff_email ?? null,
			external_examiner_id: external_examiner_id ?? null,
			chief_examiner_staff_id: chief?.staff_id ?? null,
			chief_examiner_name: chief?.staff_name ?? null,
			chief_examiner_mobile: chief?.staff_mobile ?? null,
			chief_examiner_designation: chief?.staff_designation ?? null,
			chief_examiner_email: chief?.staff_email ?? null,
			assistant_examiner_staff_id: assistant?.staff_id ?? null,
			assistant_examiner_name: assistant?.staff_name ?? null,
			assistant_examiner_mobile: assistant?.staff_mobile ?? null,
			assistant_examiner_designation: assistant?.staff_designation ?? null,
			assistant_examiner_email: assistant?.staff_email ?? null,
			valuation_allotted_at: new Date().toISOString(),
		})
		.eq('id', packet_id)
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)

	if (error) {
		console.error('allotment PUT error:', error)
		return NextResponse.json({ error: 'Failed to save allotment' }, { status: 500 })
	}
	return NextResponse.json({ success: true })
}
