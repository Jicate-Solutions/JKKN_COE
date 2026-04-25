import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	CentralValuationAllotmentRow,
	ExternalExaminer,
	InternalStaff,
} from '@/types/central-valuation'

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const sessionId = searchParams.get('session_id')
	const boardCode = searchParams.get('board_code')

	if (!institutionsId || !sessionId || !boardCode) {
		return NextResponse.json(
			{ error: 'institutions_id, session_id, board_code are required' },
			{ status: 400 }
		)
	}

	const supabase = getSupabaseServer()

	const { data: packets } = await supabase
		.from('answer_sheet_packets')
		.select(`
			course_id,
			total_sheets,
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
		.range(0, 99999)

	const courseIds = [...new Set((packets || []).map(p => p.course_id))]
	if (!courseIds.length) return NextResponse.json([])

	const { data: courses } = await supabase
		.from('courses')
		.select('id, course_code, course_name, course_title, board_code')
		.in('id', courseIds)
		.eq('board_code', boardCode)

	const boardCourses = courses || []

	type AggRow = {
		packet_count: number
		sheet_count: number
		internal: InternalStaff | null
		external_id: string | null
		chief: InternalStaff | null
		assistant: InternalStaff | null
	}

	const agg = new Map<string, AggRow>()
	for (const p of packets || []) {
		const prev: AggRow = agg.get(p.course_id) || {
			packet_count: 0,
			sheet_count: 0,
			internal: null,
			external_id: null,
			chief: null,
			assistant: null,
		}
		prev.packet_count += 1
		prev.sheet_count += p.total_sheets || 0
		if (!prev.internal && p.internal_examiner_staff_id) {
			prev.internal = {
				staff_id: p.internal_examiner_staff_id,
				staff_name: p.internal_examiner_name || '',
				staff_email: p.internal_examiner_email,
				staff_mobile: p.internal_examiner_mobile,
				staff_designation: p.internal_examiner_designation,
				staff_department: null,
			}
		}
		if (!prev.external_id && p.external_examiner_id) prev.external_id = p.external_examiner_id
		if (!prev.chief && p.chief_examiner_staff_id) {
			prev.chief = {
				staff_id: p.chief_examiner_staff_id,
				staff_name: p.chief_examiner_name || '',
				staff_email: p.chief_examiner_email,
				staff_mobile: p.chief_examiner_mobile,
				staff_designation: p.chief_examiner_designation,
				staff_department: null,
			}
		}
		if (!prev.assistant && p.assistant_examiner_staff_id) {
			prev.assistant = {
				staff_id: p.assistant_examiner_staff_id,
				staff_name: p.assistant_examiner_name || '',
				staff_email: p.assistant_examiner_email,
				staff_mobile: p.assistant_examiner_mobile,
				staff_designation: p.assistant_examiner_designation,
				staff_department: null,
			}
		}
		agg.set(p.course_id, prev)
	}

	const { data: cvDates } = await supabase
		.from('course_valuation_dates')
		.select('course_id, valuation_date')
		.eq('institutions_id', institutionsId)
		.eq('examination_session_id', sessionId)
		.eq('board_code', boardCode)
	const dateMap = new Map((cvDates || []).map(d => [d.course_id, d.valuation_date]))

	const { data: board } = await supabase
		.from('board')
		.select('board_name')
		.eq('board_code', boardCode)
		.maybeSingle()

	const externalIds = [...new Set(
		[...agg.values()].map(a => a.external_id).filter(Boolean) as string[]
	)]
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
			])
		)
	}

	const rows: CentralValuationAllotmentRow[] = boardCourses.map(c => {
		const a = agg.get(c.id)
		const internal = a?.internal || null
		const external = a?.external_id ? externalMap.get(a.external_id) || null : null
		const chief = a?.chief || null
		const assistant = a?.assistant || null

		const evaluatorSet = Boolean(internal || external)
		const status: CentralValuationAllotmentRow['status'] = !evaluatorSet
			? 'Not Assigned'
			: chief
				? 'Fully Allotted'
				: 'Paper Evaluator Set'

		return {
			course_id: c.id,
			course_code: c.course_code,
			course_name: c.course_name || c.course_title,
			board_code: c.board_code,
			board_name: board?.board_name || boardCode,
			valuation_date: dateMap.get(c.id) || null,
			packet_count: a?.packet_count || 0,
			sheet_count: a?.sheet_count || 0,
			internal_examiner: internal,
			external_examiner: external,
			chief_examiner: chief,
			assistant_examiner: assistant,
			status,
		}
	})

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
	course_id: string
	internal: StaffSnapshot | null
	external_examiner_id: string | null
	chief: StaffSnapshot | null
	assistant: StaffSnapshot | null
}

export async function PUT(request: Request) {
	const body = (await request.json()) as PutBody
	const { institutions_id, examination_session_id, course_id, internal, external_examiner_id, chief, assistant } = body

	if (!institutions_id || !examination_session_id || !course_id) {
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
		.eq('institutions_id', institutions_id)
		.eq('examination_session_id', examination_session_id)
		.eq('course_id', course_id)

	if (error) {
		console.error('allotment PUT error:', error)
		return NextResponse.json({ error: 'Failed to save allotment' }, { status: 500 })
	}
	return NextResponse.json({ success: true })
}
