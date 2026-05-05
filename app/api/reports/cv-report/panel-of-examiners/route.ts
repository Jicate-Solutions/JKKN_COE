import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Panel of Examiners report.
 *
 * Source: answer_sheet_packets (with examiner snapshots) joined with courses & examiners.
 * Filtered by institutions_id + examination_session_id + board (via course.board_code).
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('session_id')
		const boardCode = searchParams.get('board_code')

		if (!institutionsId || !sessionId || !boardCode) {
			return NextResponse.json({ error: 'institutions_id, session_id, board_code required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { data: courses } = await supabase
			.from('courses')
			.select('id, course_code')
			.eq('board_code', boardCode)
			.range(0, 9999)

		if (!courses || courses.length === 0) {
			return NextResponse.json({ board_name: boardCode, chief_name: '', chief_designation: '', valuation_date: null, rows: [] })
		}

		const courseIds = courses.map(c => c.id)
		const courseCodeById = new Map(courses.map((c: any) => [c.id, c.course_code]))

		// Bundle number per course (from bundle_numbers table)
		const { data: bundles } = await supabase
			.from('bundle_numbers')
			.select('course_id, bundle_number')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.in('course_id', courseIds)
			.eq('is_active', true)
		const bundleByCourse = new Map<string, number>()
		for (const b of bundles || []) bundleByCourse.set(b.course_id as string, b.bundle_number as number)

		const { data: packets, error: pErr } = await supabase
			.from('answer_sheet_packets')
			.select(`
				id, course_id, packet_no, total_sheets, valuation_date,
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

		if (pErr) {
			console.error('[cv-report/panel] packets error', pErr)
			return NextResponse.json({ error: pErr.message }, { status: 500 })
		}

		const externalIds = [...new Set((packets || []).map(p => p.external_examiner_id).filter(Boolean))] as string[]
		let externalById = new Map<string, { name: string; designation: string; institution: string }>()
		if (externalIds.length > 0) {
			const { data: ext } = await supabase
				.from('examiners')
				.select('id, full_name, designation, institution_name')
				.in('id', externalIds)
			for (const e of ext || []) {
				externalById.set(e.id as string, {
					name: (e as any).full_name || '',
					designation: (e as any).designation || '',
					institution: (e as any).institution_name || '',
				})
			}
		}

		const { data: boardRow } = await supabase
			.from('board')
			.select('board_code, board_name')
			.eq('board_code', boardCode)
			.maybeSingle()

		const boardName = (boardRow as any)?.board_name || boardCode

		const examinerRows: any[] = []
		const chiefGroups = new Map<string, { name: string; designation: string; rows: any[] }>()
		let valuationFromDate: string | null = null
		let valuationToDate: string | null = null

		for (const p of packets || []) {
			const courseCode = courseCodeById.get(p.course_id as string) || ''
			const chiefKey = p.chief_examiner_name || 'Unassigned'

			if (!chiefGroups.has(chiefKey)) {
				chiefGroups.set(chiefKey, {
					name: (p.chief_examiner_name as string) || '',
					designation: (p.chief_examiner_designation as string) || '',
					rows: []
				})
			}

			const chiefGroup = chiefGroups.get(chiefKey)!

			if (p.internal_examiner_staff_id && p.internal_examiner_name) {
				chiefGroup.rows.push({
					examiner_name: p.internal_examiner_name,
					examiner_designation: p.internal_examiner_designation || '',
					examiner_institution: '',
					course_code: courseCode,
					bundle_no: String(bundleByCourse.get(p.course_id as string) ?? ''),
					pocket_no: p.packet_no || '',
					papers_session: String(p.total_sheets || ''),
					total_papers: p.total_sheets || 0,
				})
			}

			if (p.external_examiner_id) {
				const ext = externalById.get(p.external_examiner_id as string)
				chiefGroup.rows.push({
					examiner_name: ext?.name || '',
					examiner_designation: ext?.designation || '',
					examiner_institution: ext?.institution || '',
					course_code: courseCode,
					bundle_no: String(bundleByCourse.get(p.course_id as string) ?? ''),
					pocket_no: p.packet_no || '',
					papers_session: String(p.total_sheets || ''),
					total_papers: p.total_sheets || 0,
				})
			}

			if (p.assistant_examiner_staff_id && p.assistant_examiner_name) {
				chiefGroup.rows.push({
					examiner_name: p.assistant_examiner_name,
					examiner_designation: p.assistant_examiner_designation || '',
					examiner_institution: '',
					course_code: courseCode,
					bundle_no: String(bundleByCourse.get(p.course_id as string) ?? ''),
					pocket_no: p.packet_no || '',
					papers_session: String(p.total_sheets || ''),
					total_papers: p.total_sheets || 0,
				})
			}
		}

		const { data: valuationWindow } = await supabase
			.from('board_valuation_windows')
			.select('from_date, to_date')
			.eq('board_code', boardCode)
			.maybeSingle()

		if (valuationWindow) {
			valuationFromDate = (valuationWindow as any).from_date
			valuationToDate = (valuationWindow as any).to_date
		}

		const chiefs = Array.from(chiefGroups.values()).map(chief => {
			const rows = chief.rows
			rows.sort((a, b) => {
				if (a.examiner_name !== b.examiner_name) return a.examiner_name.localeCompare(b.examiner_name)
				if (a.course_code !== b.course_code) return a.course_code.localeCompare(b.course_code)
				return (a.pocket_no || '').localeCompare(b.pocket_no || '')
			})

			const mergedMap = new Map<string, any>()
			for (const row of rows) {
				const key = `${row.examiner_name}|${row.course_code}`
				if (mergedMap.has(key)) {
					const existing = mergedMap.get(key)
					existing.total_papers += row.total_papers
					existing.pocket_no = (existing.pocket_no ? existing.pocket_no + ', ' : '') + row.pocket_no
				} else {
					mergedMap.set(key, { ...row })
				}
			}

			return {
				chief_name: chief.name,
				chief_designation: chief.designation,
				rows: Array.from(mergedMap.values()).map((row, idx) => ({
					serial_number: idx + 1,
					examiner_name: row.examiner_name,
					examiner_designation: row.examiner_designation,
					examiner_institution: row.examiner_institution,
					course_code: row.course_code,
					bundle_no: row.bundle_no,
					pocket_no: row.pocket_no,
					papers_session: String(row.total_papers),
					cumulative_total: row.total_papers,
				}))
			}
		})

		return NextResponse.json({
			board_name: boardName,
			valuation_from_date: valuationFromDate,
			valuation_to_date: valuationToDate,
			chiefs,
		})
	} catch (e: any) {
		console.error('[cv-report/panel] error', e)
		return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
	}
}
