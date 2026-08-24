import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { chargeKey } from '@/lib/exam-applications/session-charges'
import type { ArrearLearner, ArrearLearnersResponse } from '@/types/exam-applications'

/**
 * Arrear tab - learner picker
 * =====================================================
 * Every learner holding at least one uncleared backlog, straight out of
 * student_backlogs_detailed_view.
 *
 * The old picker swept every learner in the institution from MyJKKN and filtered
 * client-side, which is why its programme / semester filters behaved badly: the
 * list was the whole college, the semester came from MyJKKN's current_semester
 * (the semester the learner is studying now, not the semester the arrear belongs
 * to), and a learner with no backlog at all still appeared. Reading the backlog
 * view instead means the list IS the arrear population, the semester filter is
 * the backlog's original_semester, and the filter option lists are derived from
 * the same rows the table shows - so a filter can never select nothing.
 */

const MAX_ROWS = 9999
const PAGE_SIZE = 1000
const MAX_PAGES = 20

type Supabase = ReturnType<typeof getSupabaseServer>

interface BacklogRow {
	id: string
	student_id: string | null
	register_number: string | null
	student_name: string | null
	program_code: string | null
	course_code: string | null
	original_semester: number | null
}

/** Page through the backlog view, ordered by id so pages never overlap or skip */
async function fetchBacklogs(
	supabase: Supabase,
	params: { institutions_id: string; program_code?: string | null }
): Promise<BacklogRow[]> {
	const rows: BacklogRow[] = []

	for (let page = 0; page < MAX_PAGES; page++) {
		let query = supabase
			.from('student_backlogs_detailed_view')
			.select('id, student_id, register_number, student_name, program_code, course_code, original_semester')
			.eq('institutions_id', params.institutions_id)
			.eq('is_cleared', false)
			.eq('is_active', true)
			.order('id', { ascending: true })
			.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

		if (params.program_code) query = query.eq('program_code', params.program_code)

		const { data, error } = await query
		if (error) throw new Error(`Failed to fetch backlogs: ${error.message}`)

		rows.push(...((data || []) as BacklogRow[]))
		if (!data || data.length < PAGE_SIZE) break
	}

	return rows
}

/**
 * `${learner key}|${UPPER course code}` for every arrear already registered in
 * this session, so the picker can show what is left to do.
 */
async function fetchSessionArrearRegistrations(
	supabase: Supabase,
	params: { institutions_id: string; examination_session_id: string }
): Promise<Set<string>> {
	const keys = new Set<string>()

	const { data, error } = await supabase
		.from('exam_registrations')
		.select('student_id, stu_register_no, course_code, is_regular')
		.eq('institutions_id', params.institutions_id)
		.eq('examination_session_id', params.examination_session_id)
		.eq('is_regular', false)
		.range(0, MAX_ROWS)

	if (error) {
		// A degraded count is better than a failed page - the submit path re-checks
		// eligibility anyway, so nothing can be double-registered from here.
		console.error('[arrear-learners] registrations lookup error:', error.message)
		return keys
	}

	for (const row of data || []) {
		const code = String(row.course_code || '').trim().toUpperCase()
		if (!code) continue
		keys.add(`${chargeKey({ student_id: row.student_id, register_number: row.stu_register_no })}|${code}`)
		if (row.student_id) keys.add(`sid:${row.student_id}|${code}`)
	}

	return keys
}

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutions_id = searchParams.get('institutions_id') || ''
		const examination_session_id = searchParams.get('examination_session_id') || ''
		const programParam = (searchParams.get('program_code') || '').trim()
		const programFilter = programParam && programParam !== 'all' ? programParam : ''
		const semesterParam = searchParams.get('semester')
		const semesterFilter = semesterParam && semesterParam !== 'all' ? Number(semesterParam) : null

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		// The programme filter is applied in memory so the programme option list can
		// still be built from every backlog in the institution.
		const [backlogs, registeredKeys] = await Promise.all([
			fetchBacklogs(supabase, { institutions_id }),
			examination_session_id
				? fetchSessionArrearRegistrations(supabase, { institutions_id, examination_session_id })
				: Promise.resolve(new Set<string>()),
		])

		const programOptions = [...new Set(backlogs.map(b => String(b.program_code || '').trim()).filter(Boolean))].sort()

		const programScoped = programFilter
			? backlogs.filter(b => String(b.program_code || '').trim() === programFilter)
			: backlogs

		const semesterOptions = [...new Set(
			programScoped.map(b => b.original_semester).filter((s): s is number => typeof s === 'number' && s > 0)
		)].sort((a, b) => a - b)

		// The semester filter matches the semester the ARREAR belongs to, not the
		// semester the learner is currently in - a learner keeps a Sem-I arrear while
		// studying Sem-V, and filtering on their current semester would hide it.
		const scoped = semesterFilter == null
			? programScoped
			: programScoped.filter(b => b.original_semester === semesterFilter)

		const learnerByKey = new Map<string, ArrearLearner & { _semesters: Set<number> }>()

		for (const row of scoped) {
			const register_number = String(row.register_number || '').trim()
			const key = chargeKey({ student_id: row.student_id, register_number })

			let learner = learnerByKey.get(key)
			if (!learner) {
				learner = {
					key,
					student_id: row.student_id || null,
					register_number,
					student_name: String(row.student_name || '').trim(),
					program_code: String(row.program_code || '').trim() || null,
					semester: null,
					semesters: [],
					arrear_count: 0,
					registered_count: 0,
					_semesters: new Set<number>(),
				}
				learnerByKey.set(key, learner)
			}

			if (!learner.student_name && row.student_name) learner.student_name = String(row.student_name).trim()
			if (!learner.student_id && row.student_id) learner.student_id = row.student_id
			if (!learner.program_code && row.program_code) learner.program_code = String(row.program_code).trim()
			if (row.original_semester != null && row.original_semester > 0) learner._semesters.add(row.original_semester)

			learner.arrear_count++

			const code = String(row.course_code || '').trim().toUpperCase()
			if (code && (registeredKeys.has(`${key}|${code}`) || (row.student_id && registeredKeys.has(`sid:${row.student_id}|${code}`)))) {
				learner.registered_count++
			}
		}

		const learners: ArrearLearner[] = [...learnerByKey.values()]
			.map(({ _semesters, ...learner }) => {
				const semesters = [..._semesters].sort((a, b) => a - b)
				return { ...learner, semesters, semester: semesters.length > 0 ? semesters[semesters.length - 1] : null }
			})
			.sort((a, b) => a.register_number.localeCompare(b.register_number))

		const response: ArrearLearnersResponse = {
			data: learners,
			filters: { programs: programOptions, semesters: semesterOptions },
			summary: {
				learners: learners.length,
				arrears: learners.reduce((sum, l) => sum + l.arrear_count, 0),
				registered: learners.reduce((sum, l) => sum + l.registered_count, 0),
			},
		}

		return NextResponse.json(response)
	} catch (e) {
		console.error('[arrear-learners] GET error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
