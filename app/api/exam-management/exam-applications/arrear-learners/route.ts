import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { chargeKey } from '@/lib/exam-applications/session-charges'
import type { ArrearLearner, ArrearLearnersResponse, CohortFilterOption, CohortFilterTotals } from '@/types/exam-applications'

/** Distinct-learner and row counts per filter value, sorted numerically when possible */
function countBy<T>(rows: T[], valueOf: (row: T) => string | null, learnerOf: (row: T) => string): CohortFilterOption[] {
	const byValue = new Map<string, { learners: Set<string>; rows: number }>()

	for (const row of rows) {
		const value = valueOf(row)
		if (!value) continue
		let entry = byValue.get(value)
		if (!entry) {
			entry = { learners: new Set<string>(), rows: 0 }
			byValue.set(value, entry)
		}
		entry.learners.add(learnerOf(row))
		entry.rows++
	}

	return [...byValue.entries()]
		.map(([value, entry]) => ({ value, learners: entry.learners.size, rows: entry.rows }))
		.sort((a, b) => {
			const na = Number(a.value)
			const nb = Number(b.value)
			if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
			return a.value.localeCompare(b.value)
		})
}

/** Distinct learner + row totals for an "All ..." filter row */
function totalsOf<T>(rows: T[], learnerOf: (row: T) => string): CohortFilterTotals {
	const learners = new Set<string>()
	for (const row of rows) learners.add(learnerOf(row))
	return { learners: learners.size, rows: rows.length }
}

/**
 * Arrear tab - learner picker
 * =====================================================
 * Every learner holding at least one uncleared backlog, straight out of
 * student_backlogs_detailed_view.
 *
 * The old picker swept every learner in the institution from MyJKKN and filtered
 * client-side, which is why its programme / semester filters behaved badly: the
 * list was the whole college and a learner with no backlog at all still appeared.
 * Reading the backlog view instead means the list IS the arrear population, and
 * the filter option lists are derived from the same rows the table shows - so a
 * filter can never select nothing.
 *
 * The Semester filter is the semester the LEARNER is in (resolved locally from
 * their regular papers this session), not the semester the arrear came from: the
 * CoE works cohort by cohort, so Semester III must list the Sem-III learners
 * together with every arrear they carry. Each arrear's own semester is still
 * shown on the row.
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

/**
 * learner key -> the semester the learner is currently studying.
 *
 * The Semester filter on the Arrear tab means "which semester's learners", not
 * "which semester did the backlog come from" - the CoE works cohort by cohort, and
 * a Sem-III learner's Sem-I arrear must show up under Sem III.
 *
 * MyJKKN holds current_semester but sweeping it here is slow and the filters used
 * to be unreliable because of it. The learner's regular (is_regular) registrations
 * in THIS session give the same answer locally: their semester is the semester of
 * the papers they are sitting.
 */
async function fetchLearnerCurrentSemesters(
	supabase: Supabase,
	params: { institutions_id: string; examination_session_id: string }
): Promise<Map<string, number>> {
	const byLearner = new Map<string, number>()

	const [regs, offerings] = await Promise.all([
		supabase
			.from('exam_registrations')
			.select('student_id, stu_register_no, course_offering_id')
			.eq('institutions_id', params.institutions_id)
			.eq('examination_session_id', params.examination_session_id)
			.or('is_regular.is.null,is_regular.eq.true')
			.range(0, MAX_ROWS),
		supabase
			.from('course_offerings')
			.select('id, semester')
			.eq('institutions_id', params.institutions_id)
			.eq('examination_session_id', params.examination_session_id)
			.range(0, MAX_ROWS),
	])

	if (regs.error || offerings.error) {
		// Without this map the semester filter simply offers nothing - far better
		// than failing the learner list outright.
		console.error('[arrear-learners] current-semester lookup failed:', regs.error?.message || offerings.error?.message)
		return byLearner
	}

	const semesterByOffering = new Map<string, number>()
	for (const o of offerings.data || []) {
		if (typeof o.semester === 'number' && o.semester > 0) semesterByOffering.set(o.id, o.semester)
	}

	for (const row of regs.data || []) {
		const semester = row.course_offering_id ? semesterByOffering.get(row.course_offering_id) : undefined
		if (!semester) continue
		const key = chargeKey({ student_id: row.student_id, register_number: row.stu_register_no })
		// A learner sitting papers from more than one semester is taken at the
		// highest - that is the semester they have progressed to.
		const existing = byLearner.get(key)
		if (existing == null || semester > existing) byLearner.set(key, semester)
	}

	return byLearner
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
		const [backlogs, registeredKeys, currentSemesterByLearner] = await Promise.all([
			fetchBacklogs(supabase, { institutions_id }),
			examination_session_id
				? fetchSessionArrearRegistrations(supabase, { institutions_id, examination_session_id })
				: Promise.resolve(new Set<string>()),
			examination_session_id
				? fetchLearnerCurrentSemesters(supabase, { institutions_id, examination_session_id })
				: Promise.resolve(new Map<string, number>()),
		])

		/** The semester the backlog's OWNER is currently in - what the filter matches */
		const currentSemesterOf = (b: BacklogRow): number | null =>
			currentSemesterByLearner.get(chargeKey({ student_id: b.student_id, register_number: b.register_number })) ?? null

		// Counts ride along in the dropdowns so a filter that legitimately changes
		// nothing is distinguishable from one that is broken.
		const learnerOf = (b: BacklogRow) =>
			chargeKey({ student_id: b.student_id, register_number: b.register_number })

		const programOptions = countBy(backlogs, b => String(b.program_code || '').trim() || null, learnerOf)

		const programScoped = programFilter
			? backlogs.filter(b => String(b.program_code || '').trim() === programFilter)
			: backlogs

		const semesterOptions = countBy(
			programScoped,
			b => {
				const semester = currentSemesterOf(b)
				return semester != null ? String(semester) : null
			},
			learnerOf
		)

		// The filter matches the semester the LEARNER is in, so picking Semester III
		// lists the Sem-III cohort together with every arrear they carry, whichever
		// semester it originally came from.
		const scoped = semesterFilter == null
			? programScoped
			: programScoped.filter(b => currentSemesterOf(b) === semesterFilter)

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
			.map(({ _semesters, ...learner }) => ({
				...learner,
				// semester = where the learner is now (what the filter matches);
				// semesters = which semesters their arrears came from (display only).
				semester: currentSemesterByLearner.get(learner.key) ?? null,
				semesters: [..._semesters].sort((a, b) => a - b),
			}))
			.sort((a, b) => a.register_number.localeCompare(b.register_number))

		const response: ArrearLearnersResponse = {
			data: learners,
			filters: {
				programs: programOptions,
				semesters: semesterOptions,
				totals: {
					programs: totalsOf(backlogs, learnerOf),
					semesters: totalsOf(programScoped, learnerOf),
				},
			},
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
