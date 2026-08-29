import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { chargeKey } from '@/lib/exam-applications/session-charges'
import { fetchPassedCourseCodes } from '@/lib/exam-applications/bulk-course-list'
import { fetchAllRows, tryFetchAllRows } from '@/lib/exam-applications/paginate'
import { cachedSession } from '@/lib/exam-applications/session-cache'
import { levelOf, loadProgramLevelMap, parseProgramCodes } from '@/lib/exam-applications/program-levels'
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
	return fetchAllRows<BacklogRow>(
		() => {
			let query = supabase
				.from('student_backlogs_detailed_view')
				.select('id, student_id, register_number, student_name, program_code, course_code, original_semester')
				.eq('institutions_id', params.institutions_id)
				.eq('is_cleared', false)
				.eq('is_active', true)
			if (params.program_code) query = query.eq('program_code', params.program_code)
			return query
		},
		{ label: 'student_backlogs_detailed_view' }
	)
}

interface ArrearRegistrationIndex {
	/** `${learner key}|${UPPER course code}` -> holds a registration row */
	registered: Set<string>
	/** ...and that row has reached 'Applied' */
	applied: Set<string>
}

/**
 * Which arrears already have a registration in this session, and which of those
 * have actually been applied for.
 *
 * The two are not the same: a registered-but-unapplied arrear is still work to
 * do (applying updates that row), so counting only "registered" made a learner
 * look finished when they were not.
 */
async function fetchSessionArrearRegistrations(
	supabase: Supabase,
	params: { institutions_id: string; examination_session_id: string }
): Promise<ArrearRegistrationIndex> {
	const index: ArrearRegistrationIndex = { registered: new Set(), applied: new Set() }

	// A degraded count is better than a failed page - the submit path re-checks
	// eligibility anyway, so nothing can be double-registered from here.
	const rows = await tryFetchAllRows<any>(
		() => supabase
			.from('exam_registrations')
			.select('id, student_id, stu_register_no, course_code, registration_status')
			.eq('institutions_id', params.institutions_id)
			.eq('examination_session_id', params.examination_session_id)
			.eq('is_regular', false),
		{ label: 'arrear registrations' }
	)

	for (const row of rows) {
		const code = String(row.course_code || '').trim().toUpperCase()
		if (!code) continue
		const isApplied = String(row.registration_status || '').trim().toUpperCase() === 'APPLIED'
		for (const key of [
			`${chargeKey({ student_id: row.student_id, register_number: row.stu_register_no })}|${code}`,
			...(row.student_id ? [`sid:${row.student_id}|${code}`] : []),
		]) {
			index.registered.add(key)
			if (isApplied) index.applied.add(key)
		}
	}

	return index
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
function learnerCurrentSemesters(
	regs: any[],
	offerings: OfferingRow[]
): Map<string, number> {
	const byLearner = new Map<string, number>()

	const semesterByOffering = new Map<string, number>()
	for (const o of offerings) {
		if (typeof o.semester === 'number' && o.semester > 0) semesterByOffering.set(o.id, o.semester)
	}

	for (const row of regs) {
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

/**
 * The session's regular registrations.
 *
 * Without them the semester filter simply offers nothing - far better than failing
 * the learner list outright, so the read degrades to empty.
 *
 * This is the sweep that used to truncate hardest: a busy session holds ~12k
 * registrations, of which a single request returned only the first 1000, leaving
 * ~91% of learners with no resolvable semester.
 */
function fetchRegularRegistrations(
	supabase: Supabase,
	params: { institutions_id: string; examination_session_id: string }
): Promise<any[]> {
	// Cached: this screen never writes regular registrations, and every filter
	// change would otherwise re-read all ~11k of them to rebuild the same map.
	return cachedSession(`${params.institutions_id}|${params.examination_session_id}|regular-regs`, () =>
		tryFetchAllRows<any>(
			() => supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, course_offering_id')
				.eq('institutions_id', params.institutions_id)
				.eq('examination_session_id', params.examination_session_id)
				.or('is_regular.is.null,is_regular.eq.true'),
			{ label: 'regular registrations' }
		)
	)
}

interface OfferingRow {
	id: string
	course_code: string | null
	semester: number | null
	is_active: boolean | null
}

/**
 * Every offering in the session, read ONCE.
 *
 * Two things are derived from it - the offering -> semester index behind the
 * Semester filter, and the set of course codes actually on offer - and each used
 * to fetch the table for itself, paying a second round trip for identical rows.
 */
function fetchSessionOfferings(
	supabase: Supabase,
	params: { institutions_id: string; examination_session_id: string }
): Promise<OfferingRow[]> {
	// Cached: the offer list is maintained on the Course Offerings screen, not here.
	return cachedSession(`${params.institutions_id}|${params.examination_session_id}|offerings`, () =>
		tryFetchAllRows<OfferingRow>(
			() => supabase
				.from('course_offerings')
				.select('id, course_code, semester, is_active')
				.eq('institutions_id', params.institutions_id)
				.eq('examination_session_id', params.examination_session_id),
			{ label: 'course_offerings' }
		)
	)
}

/**
 * UPPER course codes actually offered in this session.
 *
 * A backlog whose course is not offered cannot be applied for - the merge engine
 * marks it "Not Offered" and greys it out - so counting it as outstanding work in
 * the picker promised papers the panel then refused to show.
 */
function offeredCourseCodesOf(offerings: OfferingRow[]): Set<string> {
	const codes = new Set<string>()
	for (const row of offerings) {
		if (row.is_active === false) continue
		const code = String(row.course_code || '').trim().toUpperCase()
		if (code) codes.add(code)
	}
	return codes
}

export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutions_id = searchParams.get('institutions_id') || ''
		const examination_session_id = searchParams.get('examination_session_id') || ''
		const programCodes = parseProgramCodes(
			searchParams.get('program_codes') || searchParams.get('program_code')
		)
		const programSet = new Set(programCodes)
		const inProgramFilter = (code: any) =>
			programSet.size === 0 || programSet.has(String(code || '').trim().toUpperCase())
		const semesterParam = searchParams.get('semester')
		const semesterFilter = semesterParam && semesterParam !== 'all' ? Number(semesterParam) : null

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		// The programme filter is applied in memory so the programme option list can
		// still be built from every backlog in the institution.
		//
		// Every read here is independent, including the programme-level map that used
		// to be awaited on its own further down, so they all go out together.
		const [backlogs, registeredKeys, regularRegs, offerings, levelMap] = await Promise.all([
			fetchBacklogs(supabase, { institutions_id }),
			examination_session_id
				? fetchSessionArrearRegistrations(supabase, { institutions_id, examination_session_id })
				: Promise.resolve({ registered: new Set<string>(), applied: new Set<string>() } as ArrearRegistrationIndex),
			examination_session_id
				? fetchRegularRegistrations(supabase, { institutions_id, examination_session_id })
				: Promise.resolve([] as any[]),
			examination_session_id
				? fetchSessionOfferings(supabase, { institutions_id, examination_session_id })
				: Promise.resolve([] as OfferingRow[]),
			loadProgramLevelMap(supabase, institutions_id),
		])

		const currentSemesterByLearner = learnerCurrentSemesters(regularRegs, offerings)
		const offeredCourseCodes = offeredCourseCodesOf(offerings)

		// When a session has no offerings at all, "not offered" cannot be told apart
		// from "offerings not set up yet", so the filter is skipped rather than
		// reporting every learner as having nothing to do.
		const offeringsKnown = offeredCourseCodes.size > 0
		const isOffered = (code: string) => !offeringsKnown || offeredCourseCodes.has(code)

		/** The semester the backlog's OWNER is currently in - what the filter matches */
		const currentSemesterOf = (b: BacklogRow): number | null =>
			currentSemesterByLearner.get(chargeKey({ student_id: b.student_id, register_number: b.register_number })) ?? null

		// Counts ride along in the dropdowns so a filter that legitimately changes
		// nothing is distinguishable from one that is broken.
		const learnerOf = (b: BacklogRow) =>
			chargeKey({ student_id: b.student_id, register_number: b.register_number })

		const programOptions = countBy(backlogs, b => String(b.program_code || '').trim() || null, learnerOf)
			.map(option => ({ ...option, level: levelOf(option.value, levelMap) }))

		const programScoped = backlogs.filter(b => inProgramFilter(b.program_code))

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

		// student_backlogs drifts from final_marks: a learner can have passed a course
		// while its backlog row still says is_cleared = false. The papers panel drops
		// those (the merge engine checks final_marks), so counting them here made the
		// badge overshoot the list - "8 to apply" against 7 papers. The same lookup
		// the panel uses is applied here so the two always agree.
		const scopedStudentIds = [...new Set(scoped.map(b => String(b.student_id || '').trim()).filter(Boolean))]
		const passedByStudent = await fetchPassedCourseCodes(supabase, institutions_id, scopedStudentIds)

		const learnerByKey = new Map<string, ArrearLearner & { _semesters: Set<number> }>()
		/** `${learner}|${course}` already counted - the panel merges by course code */
		const countedCourses = new Set<string>()

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
					total_arrears: 0,
					registered_count: 0,
					applied_count: 0,
					_semesters: new Set<number>(),
				}
				learnerByKey.set(key, learner)
			}

			if (!learner.student_name && row.student_name) learner.student_name = String(row.student_name).trim()
			if (!learner.student_id && row.student_id) learner.student_id = row.student_id
			if (!learner.program_code && row.program_code) learner.program_code = String(row.program_code).trim()
			if (row.original_semester != null && row.original_semester > 0) learner._semesters.add(row.original_semester)

			const code = String(row.course_code || '').trim().toUpperCase()
			if (!code) continue

			// The papers panel merges by course code, so two backlog rows for the same
			// course are one paper - counting rows here made the badge overshoot.
			const dedupeKey = `${key}|${code}`
			if (countedCourses.has(dedupeKey)) continue
			countedCourses.add(dedupeKey)

			// Already cleared per final_marks - the backlog row is simply stale.
			if (passedByStudent.get(String(row.student_id || '').trim())?.has(code)) continue

			// Counted whether or not it is offered, so the row can say "8 of 12".
			learner.total_arrears++

			if (!isOffered(code)) continue

			learner.arrear_count++

			const candidates = [dedupeKey, ...(row.student_id ? [`sid:${row.student_id}|${code}`] : [])]
			if (candidates.some(c => registeredKeys.registered.has(c))) learner.registered_count++
			if (candidates.some(c => registeredKeys.applied.has(c))) learner.applied_count++
		}

		const learners: ArrearLearner[] = [...learnerByKey.values()]
			// Listed as long as they hold ANY uncleared arrear.
			//
			// Hiding the learners whose arrears are all unoffered this session made a
			// real backlog look like lost data: searching the register number simply
			// returned nothing, with no hint that the course had no offering. They are
			// listed instead as "0 of N - N not offered", and the papers panel names
			// each paper and badges it "Not Offered", so the gap reads as the missing
			// course offering it actually is.
			.filter(l => l.total_arrears > 0)
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
				applied: learners.reduce((sum, l) => sum + l.applied_count, 0),
			},
		}

		return NextResponse.json(response)
	} catch (e) {
		console.error('[arrear-learners] GET error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
