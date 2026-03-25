import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const action = searchParams.get('action')

	// Institution filter params
	const filterInstitutionCode = searchParams.get('institution_code')
	const filterInstitutionsId = searchParams.get('institutions_id')

	try {
		// Get institutions for dropdown
		if (action === 'institutions') {
			let query = supabase
				.from('institutions')
				.select('id, name, institution_code')
				.eq('is_active', true)

			if (filterInstitutionCode) {
				query = query.eq('institution_code', filterInstitutionCode)
			} else if (filterInstitutionsId) {
				query = query.eq('id', filterInstitutionsId)
			}

			const { data, error } = await query.order('name')
			if (error) throw error
			return NextResponse.json(data)
		}

		// Get sessions for institution
		if (action === 'sessions') {
			const institutionId = searchParams.get('institutionId') || filterInstitutionsId
			if (!institutionId) {
				return NextResponse.json({ error: 'Institution ID required' }, { status: 400 })
			}

			const { data, error } = await supabase
				.from('examination_sessions')
				.select('id, session_name, session_code')
				.eq('institutions_id', institutionId)
				.order('session_name', { ascending: false })

			if (error) throw error
			return NextResponse.json(data)
		}

		// Get date-wise examiner lunch counts
		if (action === 'lunch-data') {
			const institutionId = searchParams.get('institutionId') || filterInstitutionsId
			const sessionId = searchParams.get('sessionId')

			if (!institutionId || !sessionId) {
				return NextResponse.json({ error: 'Institution and Session IDs required' }, { status: 400 })
			}

			// Step 1: Get all practical timetable rows for this session
			const { data: timetableRows, error: ttError } = await supabase
				.from('exam_timetables')
				.select('id, exam_date, session')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('exam_type', 'Practical')
				.eq('is_published', true)
				.order('exam_date', { ascending: true })

			if (ttError) throw ttError

			if (!timetableRows || timetableRows.length === 0) {
				return NextResponse.json({ dates: [], summary: { total_dates: 0, total_internal: 0, total_external: 0, total_persons: 0 } })
			}

			// Step 2: Get all examiner assignments for these timetable rows
			const timetableIds = timetableRows.map(r => r.id)
			const { data: examinerAssignments, error: exError } = await supabase
				.from('exam_timetable_examiners')
				.select('exam_timetable_id, examiner_type, staff_id, examiner_id')
				.in('exam_timetable_id', timetableIds)

			if (exError) throw exError

			// Step 3: Build a map of timetable_id -> exam_date
			const timetableDateMap = new Map<string, string>()
			for (const row of timetableRows) {
				timetableDateMap.set(row.id, row.exam_date)
			}

			// Step 4: Group examiners by date, counting distinct persons
			// Use Sets to avoid double-counting the same examiner across multiple batches on the same day
			const dateInternalSet = new Map<string, Set<string>>()
			const dateExternalSet = new Map<string, Set<string>>()

			for (const ea of examinerAssignments || []) {
				const examDate = timetableDateMap.get(ea.exam_timetable_id)
				if (!examDate) continue

				// Use staff_id for internal, examiner_id for external
				const personId = ea.staff_id || ea.examiner_id || ea.exam_timetable_id

				if (ea.examiner_type === 'internal' || ea.examiner_type === 'skilled' || ea.examiner_type === 'programmer') {
					if (!dateInternalSet.has(examDate)) dateInternalSet.set(examDate, new Set())
					dateInternalSet.get(examDate)!.add(personId)
				} else if (ea.examiner_type === 'external') {
					if (!dateExternalSet.has(examDate)) dateExternalSet.set(examDate, new Set())
					dateExternalSet.get(examDate)!.add(personId)
				}
			}

			// Step 5: Build sorted date-wise rows
			const allDates = new Set<string>()
			for (const row of timetableRows) {
				allDates.add(row.exam_date)
			}

			const sortedDates = [...allDates].sort()

			let totalInternal = 0
			let totalExternal = 0

			const dates = sortedDates.map((date, idx) => {
				const internalCount = dateInternalSet.get(date)?.size || 0
				const externalCount = dateExternalSet.get(date)?.size || 0
				const total = internalCount + externalCount
				totalInternal += internalCount
				totalExternal += externalCount

				return {
					serial_number: idx + 1,
					exam_date: date,
					purpose: 'Practical Examination',
					internal_count: internalCount,
					external_count: externalCount,
					total_persons: total,
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

		// Get external examiner attendance certificate data
		if (action === 'attendance-certificate') {
			const institutionId = searchParams.get('institutionId') || filterInstitutionsId
			const sessionId = searchParams.get('sessionId')

			if (!institutionId || !sessionId) {
				return NextResponse.json({ error: 'Institution and Session IDs required' }, { status: 400 })
			}

			// Step 1: Get all practical timetable rows
			const { data: timetableRows, error: ttError } = await supabase
				.from('exam_timetables')
				.select('id, exam_date')
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('exam_type', 'Practical')
				.eq('is_published', true)

			if (ttError) throw ttError

			if (!timetableRows || timetableRows.length === 0) {
				return NextResponse.json({ examiners: [] })
			}

			// Step 2: Get all examiner assignments
			const timetableIds = timetableRows.map(r => r.id)
			const { data: examinerAssignments, error: exError } = await supabase
				.from('exam_timetable_examiners')
				.select('exam_timetable_id, examiner_type, examiner_id, staff_id, staff_name')
				.in('exam_timetable_id', timetableIds)

			if (exError) throw exError

			// Step 3: Build timetable_id -> exam_date map
			const timetableDateMap = new Map<string, string>()
			for (const row of timetableRows) {
				timetableDateMap.set(row.id, row.exam_date)
			}

			// Step 4: Group external examiners by examiner_id with date ranges
			const externalExaminerDates = new Map<string, Set<string>>()
			for (const ea of examinerAssignments || []) {
				if (ea.examiner_type !== 'external' || !ea.examiner_id) continue
				const examDate = timetableDateMap.get(ea.exam_timetable_id)
				if (!examDate) continue

				if (!externalExaminerDates.has(ea.examiner_id)) {
					externalExaminerDates.set(ea.examiner_id, new Set())
				}
				externalExaminerDates.get(ea.examiner_id)!.add(examDate)
			}

			// Step 5: Group internal examiners by staff_id with date ranges
			const internalExaminerDates = new Map<string, { name: string; dates: Set<string> }>()
			for (const ea of examinerAssignments || []) {
				if (ea.examiner_type !== 'internal' || !ea.staff_id) continue
				const examDate = timetableDateMap.get(ea.exam_timetable_id)
				if (!examDate) continue

				if (!internalExaminerDates.has(ea.staff_id)) {
					internalExaminerDates.set(ea.staff_id, { name: ea.staff_name || '', dates: new Set() })
				}
				internalExaminerDates.get(ea.staff_id)!.dates.add(examDate)
			}

			// Step 6: Fetch external examiner full details
			const examinerIds = [...externalExaminerDates.keys()]
			const examinerDetailsMap = new Map<string, any>()
			if (examinerIds.length > 0) {
				const { data: examiners } = await supabase
					.from('examiners')
					.select('id, full_name, designation, department, institution_name')
					.in('id', examinerIds)

				for (const e of examiners || []) {
					examinerDetailsMap.set(e.id, e)
				}
			}

			// Step 7: Build response — external examiners
			// Include all_dates so the certificate can list each individual date
			const externalList = examinerIds.map(id => {
				const detail = examinerDetailsMap.get(id)
				const dates = [...(externalExaminerDates.get(id) || [])].sort()
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
				}
			}).sort((a, b) => a.examiner_name.localeCompare(b.examiner_name))

			// Step 8: Build response — internal examiners
			const internalList = [...internalExaminerDates.entries()].map(([, val]) => {
				const dates = [...val.dates].sort()
				const fromDate = dates[0] || ''
				const toDate = dates[dates.length - 1] || ''

				return {
					examiner_name: val.name || 'Unknown',
					designation: '',
					department: '',
					institution_name: '',
					type: 'Internal' as const,
					from_date: fromDate,
					to_date: fromDate === toDate ? '' : toDate,
					all_dates: dates,
					total_days: dates.length,
				}
			}).sort((a, b) => a.examiner_name.localeCompare(b.examiner_name))

			return NextResponse.json({
				examiners: [...externalList, ...internalList],
			})
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

	} catch (error) {
		console.error('Practical exam report error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Failed to fetch data' },
			{ status: 500 }
		)
	}
}
