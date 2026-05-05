import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * UG-Valuation Report of the Examiner.
 *
 * Two modes via ?action=
 *   - 'list-examiners' (no action specified data flow): returns distinct examiners on the board
 *   - default (with examiner_key=type:id): returns the examiner's valuation distribution
 *
 * The mark distribution bands (0-10, 11-20, 21-25, 26-29, Above 30) are computed against
 * external_marks_obtained on final_marks. Pass threshold defaults to 30 (configurable later).
 *
 * examiner_key format: "<type>:<id>" — e.g. "internal:STAFF123", "external:<uuid>", "chief:STAFFXYZ".
 */

const PASS_THRESHOLD = 30

type ExaminerType = 'internal' | 'external' | 'chief' | 'assistant'

function parseExaminerKey(key: string): { type: ExaminerType; id: string } | null {
	const idx = key.indexOf(':')
	if (idx <= 0) return null
	const type = key.slice(0, idx) as ExaminerType
	const id = key.slice(idx + 1)
	if (!['internal', 'external', 'chief', 'assistant'].includes(type)) return null
	return { type, id }
}

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('session_id')
		const boardCode = searchParams.get('board_code')
		const action = searchParams.get('action')
		const examinerKey = searchParams.get('examiner_key')

		if (!institutionsId || !sessionId || !boardCode) {
			return NextResponse.json({ error: 'institutions_id, session_id, board_code required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { data: courses } = await supabase
			.from('courses')
			.select('id, course_code')
			.eq('board_code', boardCode)
			.range(0, 9999)

		const courseIds = (courses || []).map((c: any) => c.id)
		const courseCodeById = new Map((courses || []).map((c: any) => [c.id, c.course_code]))

		if (courseIds.length === 0) {
			if (action === 'list-examiners') return NextResponse.json([])
			return NextResponse.json({ board_name: boardCode, examiner_name: '', examiner_designation: '', rows: [], totals: emptyTotals() })
		}

		// Bundle numbers per course
		const { data: bundles } = await supabase
			.from('bundle_numbers')
			.select('course_id, bundle_number')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.in('course_id', courseIds)
			.eq('is_active', true)
		const bundleByCourse = new Map<string, number>()
		for (const b of bundles || []) bundleByCourse.set(b.course_id as string, b.bundle_number as number)

		const { data: packets } = await supabase
			.from('answer_sheet_packets')
			.select(`
				id, course_id, packet_no, total_sheets,
				internal_examiner_staff_id, internal_examiner_name, internal_examiner_designation,
				external_examiner_id,
				chief_examiner_staff_id, chief_examiner_name, chief_examiner_designation,
				assistant_examiner_staff_id, assistant_examiner_name, assistant_examiner_designation
			`)
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('is_active', true)
			.in('course_id', courseIds)
			.range(0, 9999)

		// LIST EXAMINERS MODE -----------------------------------------------------
		if (action === 'list-examiners') {
			const seen = new Map<string, { examiner_key: string; examiner_type: ExaminerType; examiner_name: string; examiner_designation: string }>()

			const externalIds = [...new Set((packets || []).map(p => p.external_examiner_id).filter(Boolean))] as string[]
			const externalById = new Map<string, { name: string; designation: string }>()
			if (externalIds.length > 0) {
				const { data: ext } = await supabase
					.from('examiners')
					.select('id, full_name, designation')
					.in('id', externalIds)
				for (const e of ext || []) externalById.set(e.id as string, { name: (e as any).full_name || '', designation: (e as any).designation || '' })
			}

			for (const p of packets || []) {
				if (p.internal_examiner_staff_id && p.internal_examiner_name) {
					const key = `internal:${p.internal_examiner_staff_id}`
					if (!seen.has(key)) seen.set(key, { examiner_key: key, examiner_type: 'internal', examiner_name: p.internal_examiner_name as string, examiner_designation: (p.internal_examiner_designation as string) || '' })
				}
				if (p.chief_examiner_staff_id && p.chief_examiner_name) {
					const key = `chief:${p.chief_examiner_staff_id}`
					if (!seen.has(key)) seen.set(key, { examiner_key: key, examiner_type: 'chief', examiner_name: p.chief_examiner_name as string, examiner_designation: (p.chief_examiner_designation as string) || '' })
				}
				if (p.assistant_examiner_staff_id && p.assistant_examiner_name) {
					const key = `assistant:${p.assistant_examiner_staff_id}`
					if (!seen.has(key)) seen.set(key, { examiner_key: key, examiner_type: 'assistant', examiner_name: p.assistant_examiner_name as string, examiner_designation: (p.assistant_examiner_designation as string) || '' })
				}
				if (p.external_examiner_id) {
					const key = `external:${p.external_examiner_id}`
					const ext = externalById.get(p.external_examiner_id as string)
					if (!seen.has(key)) seen.set(key, { examiner_key: key, examiner_type: 'external', examiner_name: ext?.name || '', examiner_designation: ext?.designation || '' })
				}
			}

			return NextResponse.json([...seen.values()].sort((a, b) => a.examiner_name.localeCompare(b.examiner_name)))
		}

		// VALUATION REPORT MODE ---------------------------------------------------
		if (!examinerKey) {
			return NextResponse.json({ error: 'examiner_key required' }, { status: 400 })
		}
		const parsed = parseExaminerKey(examinerKey)
		if (!parsed) return NextResponse.json({ error: 'Invalid examiner_key' }, { status: 400 })

		const { type, id } = parsed

		// Filter packets to those assigned to this examiner
		const myPackets = (packets || []).filter(p => {
			if (type === 'internal') return p.internal_examiner_staff_id === id
			if (type === 'chief') return p.chief_examiner_staff_id === id
			if (type === 'assistant') return p.assistant_examiner_staff_id === id
			if (type === 'external') return p.external_examiner_id === id
			return false
		})

		// Get examiner display info from any packet (or examiners table)
		let examinerName = ''
		let examinerDesignation = ''
		if (myPackets.length > 0) {
			const sample: any = myPackets[0]
			if (type === 'internal') { examinerName = sample.internal_examiner_name || ''; examinerDesignation = sample.internal_examiner_designation || '' }
			if (type === 'chief') { examinerName = sample.chief_examiner_name || ''; examinerDesignation = sample.chief_examiner_designation || '' }
			if (type === 'assistant') { examinerName = sample.assistant_examiner_name || ''; examinerDesignation = sample.assistant_examiner_designation || '' }
		}
		if (type === 'external') {
			const { data: ext } = await supabase.from('examiners').select('full_name, designation').eq('id', id).maybeSingle()
			examinerName = (ext as any)?.full_name || ''
			examinerDesignation = (ext as any)?.designation || ''
		}

		// Get the courses + final_marks for distribution
		const myCourseIds = [...new Set(myPackets.map(p => p.course_id))] as string[]
		let marks: Array<{ course_id: string; external_marks_obtained: number | null; pass_status: string | null }> = []
		if (myCourseIds.length > 0) {
			const { data } = await supabase
				.from('final_marks')
				.select('course_id, external_marks_obtained, pass_status')
				.eq('institutions_id', institutionsId)
				.eq('examination_session_id', sessionId)
				.in('course_id', myCourseIds)
				.range(0, 99999)
			marks = (data || []) as any
		}

		// Group marks by course; we'll allocate to packets sequentially within course
		const marksByCourse = new Map<string, typeof marks>()
		for (const m of marks) {
			const arr = marksByCourse.get(m.course_id) || []
			arr.push(m)
			marksByCourse.set(m.course_id, arr)
		}

		const rows: any[] = []
		let serial = 1
		const courseConsumed = new Map<string, number>()
		const totals = emptyTotals()

		for (const p of myPackets) {
			const courseId = p.course_id as string
			const courseCode = courseCodeById.get(courseId) || ''
			const allMarks = marksByCourse.get(courseId) || []
			const consumed = courseConsumed.get(courseId) || 0
			const slice = allMarks.slice(consumed, consumed + (p.total_sheets || 0))
			courseConsumed.set(courseId, consumed + (p.total_sheets || 0))

			const dist = { band_0_10: 0, band_11_20: 0, band_21_25: 0, band_26_29: 0, above_30: 0, pass_count: 0, fail_count: 0 }
			for (const m of slice) {
				const v = Number(m.external_marks_obtained || 0)
				if (v <= 10) dist.band_0_10++
				else if (v <= 20) dist.band_11_20++
				else if (v <= 25) dist.band_21_25++
				else if (v <= 29) dist.band_26_29++
				else dist.above_30++

				if (v >= PASS_THRESHOLD) dist.pass_count++
				else dist.fail_count++
			}
			const papers = p.total_sheets || 0
			rows.push({
				serial_number: serial++,
				course_code: courseCode,
				bundle_no: String(bundleByCourse.get(courseId) ?? ''),
				pocket_no: p.packet_no || '',
				papers_valued: papers,
				...dist,
				cumulative_total: papers,
			})

			totals.papers_valued += papers
			totals.band_0_10 += dist.band_0_10
			totals.band_11_20 += dist.band_11_20
			totals.band_21_25 += dist.band_21_25
			totals.band_26_29 += dist.band_26_29
			totals.above_30 += dist.above_30
			totals.pass_count += dist.pass_count
			totals.fail_count += dist.fail_count
			totals.cumulative_total += papers
		}

		const { data: boardRow } = await supabase.from('board').select('board_name').eq('board_code', boardCode).maybeSingle()
		const boardName = (boardRow as any)?.board_name || boardCode

		return NextResponse.json({
			board_name: boardName,
			examiner_name: examinerName,
			examiner_designation: examinerDesignation,
			rows,
			totals,
		})
	} catch (e: any) {
		console.error('[cv-report/examiner-valuation] error', e)
		return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
	}
}

function emptyTotals() {
	return {
		serial_number: 0,
		course_code: '',
		bundle_no: '',
		pocket_no: '',
		papers_valued: 0,
		band_0_10: 0,
		band_11_20: 0,
		band_21_25: 0,
		band_26_29: 0,
		above_30: 0,
		pass_count: 0,
		fail_count: 0,
		cumulative_total: 0,
	}
}
