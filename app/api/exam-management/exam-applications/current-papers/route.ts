import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/exam-applications/paginate'
import {
	isFineApplicable,
	loadFeeRateBook,
	priceCourseList,
	resolveProgramLevel,
	type CourseFeeInput,
	type PaperFeeHead,
} from '@/lib/exam-fee/calculate'
import {
	chargeKey,
	hasSessionChargeColumns,
	loadAlreadyChargedKeys,
	sessionChargeFor,
	NO_CHARGE,
	type SessionCharge,
} from '@/lib/exam-applications/session-charges'
import { levelOf, loadProgramLevelMap, parseProgramCodes } from '@/lib/exam-applications/program-levels'
import type {
	CohortFilterOption,
	CohortFilterTotals,
	CurrentPaperApplyResult,
	CurrentPaperCohortResponse,
	CurrentPaperLearner,
	CurrentPaperRow,
	CurrentPaperSubject,
} from '@/types/exam-applications'

/**
 * Current Papers - Exam Application
 * =====================================================
 * The learners in this tab are ALREADY registered for their current-semester
 * papers; the Exam Registration module wrote those rows. Applying creates
 * nothing - it moves the rows the selected learners already hold to
 *
 *     registration_status = 'Applied'
 *     fee_amount          = the paper's own fee from the fee-details rate book
 *
 * and stamps the once-per-session application / mark statement / late fine on a
 * single anchor row per learner.
 *
 * So a cohort of 10 learners x 7 registered papers is picked as 10 checkboxes:
 * ticking 9 of them updates 9 x 7 = 63 existing rows.
 *
 * GET  - the cohort for a session (+ optional programme / semester), with the
 *        option lists the programme -> semester cascade reads
 * POST - apply the selected learners
 */

/** Status stamped on rows the operator applies for */
const APPLIED_STATUS = 'Applied'

/** Rows in these states are never re-applied */
const TERMINAL_STATUSES = new Set(['APPLIED', 'CANCELLED', 'REJECTED', 'WITHDRAWN'])

const PAGE_SIZE = 1000
const MAX_PAGES = 60
/** Pages fetched at once - a large session was taking seconds page-by-page */
const PAGE_CONCURRENCY = 6
const UPDATE_CHUNK = 200
const MAX_LEARNERS_PER_APPLY = 1000

type Supabase = ReturnType<typeof getSupabaseServer>

interface RegistrationRow {
	id: string
	student_id: string | null
	stu_register_no: string | null
	student_name: string | null
	course_offering_id: string | null
	course_code: string | null
	program_code: string | null
	registration_status: string | null
	is_regular: boolean | null
	attempt_number: number | null
	fee_amount: number | null
}

interface OfferingInfo {
	course_code: string
	program_code: string | null
	semester: number | null
	course_id: string | null
}

interface CourseMasterRow {
	course_code: string
	course_name: string
	course_category: string | null
	exam_duration: number | null
	credit: number | null
}

type PricedCourses = Map<string, { head: PaperFeeHead | null; amount: number | null }>

/**
 * Page through exam_registrations for one session.
 *
 * Ordered by id (unique) rather than created_at, so rows are never duplicated or
 * skipped across .range() pages. The first page carries an exact count so the
 * remaining pages can be fetched in parallel batches - walking a large session
 * one page at a time was what made this endpoint take seconds.
 */
async function fetchSessionRegistrations(
	supabase: Supabase,
	params: { institutions_id: string; examination_session_id: string; program_code?: string | null }
): Promise<RegistrationRow[]> {
	const buildQuery = (from: number, to: number, withCount: boolean) => {
		let query = supabase
			.from('exam_registrations')
			.select(
				'id, student_id, stu_register_no, student_name, course_offering_id, course_code, program_code, registration_status, is_regular, attempt_number, fee_amount',
				withCount ? { count: 'exact' } : undefined
			)
			.eq('institutions_id', params.institutions_id)
			.eq('examination_session_id', params.examination_session_id)
			// Arrear rows are written by the Arrear tab with is_regular = false and are
			// never part of the current-paper cohort. Legacy rows carrying NULL are
			// treated as regular - that is what the Exam Registration module wrote.
			.or('is_regular.is.null,is_regular.eq.true')
			.order('id', { ascending: true })
			.range(from, to)

		if (params.program_code) query = query.eq('program_code', params.program_code)
		return query
	}

	const first = await buildQuery(0, PAGE_SIZE - 1, true)
	if (first.error) throw new Error(`Failed to fetch exam registrations: ${first.error.message}`)

	const rows: RegistrationRow[] = [...((first.data || []) as RegistrationRow[])]
	const total = first.count ?? rows.length
	const pageCount = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES)

	for (let start = 1; start < pageCount; start += PAGE_CONCURRENCY) {
		const batch = []
		for (let page = start; page < Math.min(start + PAGE_CONCURRENCY, pageCount); page++) {
			batch.push(buildQuery(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1, false))
		}
		const results = await Promise.all(batch)
		for (const result of results) {
			if (result.error) throw new Error(`Failed to fetch exam registrations: ${result.error.message}`)
			rows.push(...((result.data || []) as RegistrationRow[]))
		}
	}

	return rows
}

/**
 * Distinct-learner and row counts per filter value.
 *
 * Shown in the dropdowns so a filter that legitimately changes nothing - a
 * programme that runs only one semester - reads as "Semester I (17 learners)"
 * next to "All semesters (17 learners)" rather than looking broken.
 */
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

/** offering id -> programme / semester / course code for the session */
async function loadOfferingIndex(
	supabase: Supabase,
	params: { institutions_id: string; examination_session_id: string }
): Promise<Map<string, OfferingInfo>> {
	const byId = new Map<string, OfferingInfo>()

	// Paged, not `.range(0, 9999)`: the server returns at most 1000 rows per request
	// whatever the range asks for, and an offering missing from this index leaves its
	// paper unresolvable.
	const data = await fetchAllRows<any>(
		() => supabase
			.from('course_offerings')
			.select('id, course_id, course_code, program_code, semester')
			.eq('institutions_id', params.institutions_id)
			.eq('examination_session_id', params.examination_session_id),
		{ label: 'course_offerings' }
	)

	for (const row of data) {
		byId.set(row.id, {
			course_code: String(row.course_code || '').trim(),
			program_code: row.program_code || null,
			semester: row.semester ?? null,
			course_id: row.course_id || null,
		})
	}
	return byId
}

/**
 * UPPER course_code -> courses master row. course_category and exam_duration are
 * what decide the fee head, so a missing master row leaves a paper unpriced
 * rather than mispriced.
 */
async function loadCourseMaster(
	supabase: Supabase,
	institutions_id: string,
	codes: string[]
): Promise<Map<string, CourseMasterRow>> {
	const byCode = new Map<string, CourseMasterRow>()
	const wanted = [...new Set(codes.map(c => String(c || '').trim()).filter(Boolean))]

	const load = async (batch: string[], scoped: boolean) => {
		if (batch.length === 0) return
		let query = supabase
			.from('courses')
			.select('course_code, course_name, course_category, exam_duration, credit')
			.in('course_code', batch)
		if (scoped) query = query.eq('institutions_id', institutions_id)

		const { data, error } = await query
		if (error) {
			console.error('[current-papers] courses lookup error:', error.message)
			return
		}
		for (const row of data || []) {
			const key = String(row.course_code || '').trim().toUpperCase()
			// The institution's own row wins; the unscoped pass only fills gaps left
			// by legacy rows that carry no institutions_id.
			if (key && (scoped || !byCode.has(key))) byCode.set(key, row as CourseMasterRow)
		}
	}

	for (let i = 0; i < wanted.length; i += 500) await load(wanted.slice(i, i + 500), true)
	const missing = wanted.filter(c => !byCode.has(c.toUpperCase()))
	for (let i = 0; i < missing.length; i += 500) await load(missing.slice(i, i + 500), false)

	return byCode
}

/**
 * Memoized per-paper pricing.
 *
 * Keyed on tier AND programme code, not tier alone: exam_fee_master can carry a
 * rate scoped to one programme, which priceCourseList prefers over the tier rate.
 * Caching by tier only would let the first programme priced at a tier decide the
 * amount for every other programme sharing it.
 */
function pricerByLevel(book: Awaited<ReturnType<typeof loadFeeRateBook>>, allCourses: CourseFeeInput[]) {
	const cache = new Map<string, PricedCourses>()
	return (programCode: string | null | undefined): { level: string; priced: PricedCourses } => {
		const level = resolveProgramLevel(programCode, book.levelByProgram)
		const code = String(programCode || '').trim().toUpperCase()
		const scope = `${level}|${code}`
		let priced = cache.get(scope)
		if (!priced) {
			priced = priceCourseList(book, level, allCourses, code)
			cache.set(scope, priced)
		}
		return { level, priced }
	}
}

// =====================================================
// GET - the current-paper cohort
// =====================================================
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutions_id = searchParams.get('institutions_id') || ''
		const examination_session_id = searchParams.get('examination_session_id') || ''
		// program_codes is a CSV so "All UG" can send the whole tier at once;
		// program_code is still honoured for any older caller.
		const programCodes = parseProgramCodes(
			searchParams.get('program_codes') || searchParams.get('program_code')
		)
		const programSet = new Set(programCodes)
		const inProgramFilter = (code: string) =>
			programSet.size === 0 || programSet.has(String(code || '').trim().toUpperCase())
		const semesterParam = searchParams.get('semester')
		const semesterFilter = semesterParam && semesterParam !== 'all' ? Number(semesterParam) : null

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}

		const [registrations, offeringById] = await Promise.all([
			// The programme filter is applied in memory rather than in the query: the
			// programme option list has to be built from the whole session, or the
			// dropdown would only ever offer the programme already selected.
			fetchSessionRegistrations(supabase, { institutions_id, examination_session_id }),
			loadOfferingIndex(supabase, { institutions_id, examination_session_id }),
		])

		// ── Flatten every registration into a (learner, paper) row ──
		type FlatRow = RegistrationRow & { program: string; semester: number | null; course_code: string }
		const rows: FlatRow[] = []

		for (const reg of registrations) {
			const offering = reg.course_offering_id ? offeringById.get(reg.course_offering_id) : undefined
			const course_code = String(reg.course_code || offering?.course_code || '').trim()
			if (!course_code) continue
			rows.push({
				...reg,
				program: String(reg.program_code || offering?.program_code || '').trim(),
				semester: offering?.semester ?? null,
				course_code,
			})
		}

		// ── Filter option lists, cascaded the way the UI reads them ──
		// Programmes come from the whole session; semesters from the rows left after
		// the programme filter. Picking a programme therefore narrows the semester
		// list instead of leaving stale semesters that match nothing.
		const learnerOf = (r: FlatRow) => chargeKey({ student_id: r.student_id, register_number: r.stu_register_no })

		const levelMap = await loadProgramLevelMap(supabase, institutions_id)
		const programOptions = countBy(rows, r => r.program || null, learnerOf)
			.map(option => ({ ...option, level: levelOf(option.value, levelMap) }))
		const semesterScope = rows.filter(r => inProgramFilter(r.program))
		const semesterOptions = countBy(
			semesterScope,
			r => (typeof r.semester === 'number' && r.semester > 0 ? String(r.semester) : null),
			learnerOf
		)

		const scoped = semesterScope.filter(r => semesterFilter == null || r.semester === semesterFilter)

		// ── Group into learners ──
		const learnerByKey = new Map<string, CurrentPaperLearner>()

		for (const row of scoped) {
			const register_number = String(row.stu_register_no || '').trim()
			const key = chargeKey({ student_id: row.student_id, register_number })

			let learner = learnerByKey.get(key)
			if (!learner) {
				learner = {
					key,
					student_id: row.student_id || null,
					register_number,
					student_name: String(row.student_name || '').trim(),
					program_code: row.program || null,
					semester: row.semester ?? null,
					subjects: [],
					total_subjects: 0,
					applied_subjects: 0,
					pending_subjects: 0,
					status: 'Not Applied',
					fee_level: null,
					paper_fee_total: 0,
					application_fee: 0,
					mark_statement_fee: 0,
					late_fine: 0,
					fee_total: 0,
					already_charged: false,
				}
				learnerByKey.set(key, learner)
			}

			// The first non-null value wins, so a stray offering carrying no semester
			// or programme cannot blank a learner that other rows identified.
			if (learner.semester == null && row.semester != null) learner.semester = row.semester
			if (!learner.program_code && row.program) learner.program_code = row.program
			if (!learner.student_name && row.student_name) learner.student_name = String(row.student_name).trim()
			if (!learner.student_id && row.student_id) learner.student_id = row.student_id

			const status = String(row.registration_status || '').trim()
			learner.subjects.push({
				registration_id: row.id,
				course_code: row.course_code,
				course_name: '',
				course_offering_id: row.course_offering_id,
				registration_status: status || null,
				is_applied: status.toUpperCase() === APPLIED_STATUS.toUpperCase(),
				is_locked: TERMINAL_STATUSES.has(status.toUpperCase()),
				attempt_number: row.attempt_number ?? 1,
				fee_amount: row.fee_amount == null ? null : Number(row.fee_amount),
				quoted_fee: null,
				semester: row.semester ?? null,
			})
		}

		const learners = [...learnerByKey.values()]

		// ── Price every paper once ──
		const courseMaster = await loadCourseMaster(
			supabase,
			institutions_id,
			learners.flatMap(l => l.subjects.map(s => s.course_code))
		)

		const asOf = new Date().toISOString().slice(0, 10)
		const [book, chargeColumnsReady] = await Promise.all([
			loadFeeRateBook(supabase, { institutions_id, examination_session_id, asOf }),
			hasSessionChargeColumns(supabase),
		])
		const fineApplicable = isFineApplicable(book.schedule, asOf)
		// Nobody can have been charged yet while the columns are missing, and the
		// lookup would only error - so skip it entirely.
		const alreadyCharged = chargeColumnsReady
			? await loadAlreadyChargedKeys(supabase, { institutions_id, examination_session_id })
			: new Set<string>()

		const allCourses: CourseFeeInput[] = [...courseMaster.values()].map(c => ({
			course_code: c.course_code,
			course_category: c.course_category,
			exam_duration: c.exam_duration,
		}))
		const priceFor = pricerByLevel(book, allCourses)

		for (const learner of learners) {
			const { level, priced } = priceFor(learner.program_code)
			learner.fee_level = level

			for (const subject of learner.subjects) {
				const master = courseMaster.get(subject.course_code.toUpperCase())
				subject.course_name = master?.course_name || ''
				// fee_amount is what the row already carries; quoted_fee is what the
				// rate book would charge if the paper is applied for now.
				subject.quoted_fee = priced.get(subject.course_code.toUpperCase())?.amount ?? null
			}

			learner.subjects.sort(
				(a, b) => (a.semester || 0) - (b.semester || 0) || a.course_code.localeCompare(b.course_code)
			)

			learner.total_subjects = learner.subjects.length
			learner.applied_subjects = learner.subjects.filter(s => s.is_applied).length
			learner.pending_subjects = learner.subjects.filter(s => !s.is_locked).length
			// applied_subjects is tested first: a learner whose every row was cancelled
			// also has pending_subjects === 0, and reporting them as "Applied" would
			// be plainly wrong.
			learner.status =
				learner.applied_subjects === 0 ? 'Not Applied'
					: learner.pending_subjects === 0 ? 'Applied'
						: 'Partial'

			// Only the papers that would actually change are quoted - a learner who is
			// half applied already must not be re-billed for the half that is done.
			learner.paper_fee_total = learner.subjects
				.filter(s => !s.is_locked)
				.reduce((sum, s) => sum + (s.quoted_fee || 0), 0)

			const charged = alreadyCharged.has(learner.key)
				|| (learner.student_id ? alreadyCharged.has(`sid:${learner.student_id}`) : false)
			learner.already_charged = charged

			const charge: SessionCharge = charged ? NO_CHARGE : sessionChargeFor(book, level as any, asOf, learner.program_code)
			learner.application_fee = charge.application_fee
			learner.mark_statement_fee = charge.mark_statement_fee
			learner.late_fine = charge.late_fine
			learner.fee_total = learner.paper_fee_total + charge.total
		}

		learners.sort((a, b) => a.register_number.localeCompare(b.register_number))

		// ── The distinct paper list for the filtered cohort (right-hand panel) ──
		const paperByCode = new Map<string, CurrentPaperRow>()
		for (const learner of learners) {
			for (const subject of learner.subjects) {
				const key = subject.course_code.toUpperCase()
				const existing = paperByCode.get(key)
				if (existing) {
					existing.learner_count++
					if (subject.is_applied) existing.applied_count++
					continue
				}
				paperByCode.set(key, {
					course_code: subject.course_code,
					course_name: subject.course_name,
					semester: subject.semester,
					fee_amount: subject.quoted_fee ?? null,
					learner_count: 1,
					applied_count: subject.is_applied ? 1 : 0,
				})
			}
		}
		const papers = [...paperByCode.values()].sort(
			(a, b) => (a.semester || 0) - (b.semester || 0) || a.course_code.localeCompare(b.course_code)
		)

		const response: CurrentPaperCohortResponse = {
			data: learners,
			papers,
			filters: {
				programs: programOptions,
				semesters: semesterOptions,
				// Summed learner counts would double-count anyone holding papers in two
				// semesters, so the distinct totals are computed here.
				totals: {
					programs: totalsOf(rows, learnerOf),
					semesters: totalsOf(semesterScope, learnerOf),
				},
			},
			summary: {
				learners: learners.length,
				papers: papers.length,
				registrations: learners.reduce((sum, l) => sum + l.total_subjects, 0),
				applied: learners.filter(l => l.status === 'Applied').length,
				partial: learners.filter(l => l.status === 'Partial').length,
				not_applied: learners.filter(l => l.status === 'Not Applied').length,
			},
			fee: {
				configured: !book.isEmpty,
				circular_ref: book.schedule?.circular_ref || null,
				last_date_without_fine: book.schedule?.last_date_without_fine || null,
				last_date_with_fine: book.schedule?.last_date_with_fine || null,
				fine_amount: book.schedule?.fine_amount || 0,
				fine_applicable: fineApplicable,
				as_of: asOf,
			},
			charge_columns_ready: chargeColumnsReady,
		}

		return NextResponse.json(response)
	} catch (e) {
		console.error('[current-papers] GET error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

// =====================================================
// POST - apply the selected learners
// =====================================================
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const institutions_id = String(body.institutions_id || '')
		const examination_session_id = String(body.examination_session_id || '')
		const programCodes = parseProgramCodes(
			Array.isArray(body.program_codes) ? body.program_codes.join(',') : (body.program_codes || body.program_code)
		)
		const programSet = new Set(programCodes)
		const inProgramFilter = (code: string) =>
			programSet.size === 0 || programSet.has(String(code || '').trim().toUpperCase())
		const semesterFilter = body.semester != null && body.semester !== 'all' ? Number(body.semester) : null

		if (!institutions_id) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}
		if (!examination_session_id) {
			return NextResponse.json({ error: 'examination_session_id is required' }, { status: 400 })
		}

		// The client sends learner keys only. Which rows those learners hold is
		// re-derived from the database and never taken from the request, so a stale
		// screen cannot apply a paper that has since been cancelled.
		const wantedKeys = new Set<string>(
			(Array.isArray(body.learners) ? body.learners : [])
				.map((l: any) => chargeKey({
					student_id: l?.student_id || l?.id || null,
					register_number: l?.register_number || l?.stu_register_no || '',
				}))
				.filter((k: string) => k && k !== 'sid:')
		)

		if (wantedKeys.size === 0) {
			return NextResponse.json({ error: 'Select at least one learner to apply' }, { status: 400 })
		}
		if (wantedKeys.size > MAX_LEARNERS_PER_APPLY) {
			return NextResponse.json(
				{ error: `Too many learners in one request (${wantedKeys.size}). Apply in batches of at most ${MAX_LEARNERS_PER_APPLY}.` },
				{ status: 400 }
			)
		}

		const [registrations, offeringById] = await Promise.all([
			fetchSessionRegistrations(supabase, {
				institutions_id,
				examination_session_id,
				program_code: programCodes.length === 1 ? programCodes[0] : null,
			}),
			loadOfferingIndex(supabase, { institutions_id, examination_session_id }),
		])

		// ── Collect the rows that actually belong to the selected learners ──
		interface Target {
			row: RegistrationRow
			program: string | null
			course_code: string
		}
		const targetsByLearner = new Map<string, Target[]>()

		for (const reg of registrations) {
			const key = chargeKey({ student_id: reg.student_id, register_number: reg.stu_register_no })
			if (!wantedKeys.has(key)) continue

			const offering = reg.course_offering_id ? offeringById.get(reg.course_offering_id) : undefined
			if (semesterFilter != null && (offering?.semester ?? null) !== semesterFilter) continue
			if (!inProgramFilter(String(reg.program_code || offering?.program_code || ''))) continue

			const course_code = String(reg.course_code || offering?.course_code || '').trim()
			if (!course_code) continue

			const target: Target = {
				row: reg,
				program: String(reg.program_code || offering?.program_code || '').trim() || null,
				course_code,
			}
			const list = targetsByLearner.get(key)
			if (list) list.push(target)
			else targetsByLearner.set(key, [target])
		}

		if (targetsByLearner.size === 0) {
			return NextResponse.json(
				{ error: 'No registered current papers found for the selected learners in this session' },
				{ status: 400 }
			)
		}

		// ── Price every paper once ──
		const allTargets = [...targetsByLearner.values()].flat()
		const courseMaster = await loadCourseMaster(supabase, institutions_id, allTargets.map(t => t.course_code))
		const allCourses: CourseFeeInput[] = [...courseMaster.values()].map(c => ({
			course_code: c.course_code,
			course_category: c.course_category,
			exam_duration: c.exam_duration,
		}))

		const asOf = new Date().toISOString().slice(0, 10)
		const nowIso = new Date().toISOString()
		const [book, chargeColumnsReady] = await Promise.all([
			loadFeeRateBook(supabase, { institutions_id, examination_session_id, asOf }),
			hasSessionChargeColumns(supabase),
		])
		const priceFor = pricerByLevel(book, allCourses)

		const alreadyCharged = chargeColumnsReady
			? await loadAlreadyChargedKeys(supabase, {
				institutions_id,
				examination_session_id,
				registerNumbers: allTargets.map(t => String(t.row.stu_register_no || '')).filter(Boolean),
			})
			: new Set<string>()

		// ── Build one patch per row ──
		interface Update {
			id: string
			patch: Record<string, any>
			register_number: string
			course_code: string
		}
		const updates: Update[] = []
		const results: CurrentPaperApplyResult[] = []
		let learnersCharged = 0
		let chargeTotal = 0

		for (const [key, targets] of targetsByLearner) {
			const program = targets.find(t => t.program)?.program || null
			const { level, priced } = priceFor(program)

			// Rows already applied (or cancelled / rejected) are left untouched, so
			// re-running the screen is idempotent.
			const pending: Target[] = []
			for (const target of targets) {
				const status = String(target.row.registration_status || '').trim()
				if (TERMINAL_STATUSES.has(status.toUpperCase())) {
					results.push({
						register_number: String(target.row.stu_register_no || ''),
						course_code: target.course_code,
						status: 'skipped',
						reason: `Already ${status || 'processed'}`,
					})
					continue
				}
				pending.push(target)
			}

			if (pending.length === 0) continue

			const studentId = targets.find(t => t.row.student_id)?.row.student_id || null
			const charged = alreadyCharged.has(key) || (studentId ? alreadyCharged.has(`sid:${studentId}`) : false)
			const charge = charged || !chargeColumnsReady ? NO_CHARGE : sessionChargeFor(book, level as any, asOf, program)

			// The once-per-session heads land on ONE row - the alphabetically first
			// pending paper, so a re-run picks the same anchor - and stay 0 on the
			// rest. Summing a learner's rows then gives the true amount owed with no
			// DISTINCT gymnastics.
			pending.sort((a, b) => a.course_code.localeCompare(b.course_code))

			pending.forEach((target, index) => {
				const isAnchor = index === 0 && charge.total > 0
				const patch: Record<string, any> = {
					registration_status: APPLIED_STATUS,
					fee_amount: priced.get(target.course_code.toUpperCase())?.amount ?? target.row.fee_amount ?? null,
					updated_at: nowIso,
				}

				// Writing a column PostgREST has never seen rejects the whole
				// statement, so while the migration is outstanding the status and the
				// per-paper fee are applied on their own.
				if (chargeColumnsReady) {
					patch.applied_date = asOf
					patch.application_fee = isAnchor ? charge.application_fee : 0
					patch.mark_statement_fee = isAnchor ? charge.mark_statement_fee : 0
					patch.late_fine = isAnchor ? charge.late_fine : 0
				}

				updates.push({
					id: target.row.id,
					register_number: String(target.row.stu_register_no || ''),
					course_code: target.course_code,
					patch,
				})
			})

			if (charge.total > 0) {
				learnersCharged++
				chargeTotal += charge.total
			}
			// Guard the rest of this request against charging the same learner twice
			// if they somehow surface under two keys.
			alreadyCharged.add(key)
			if (studentId) alreadyCharged.add(`sid:${studentId}`)
		}

		const skippedCount = results.filter(r => r.status === 'skipped').length

		if (updates.length === 0) {
			return NextResponse.json({
				success: true,
				summary: { total: skippedCount, updated: 0, skipped: skippedCount, failed: 0, learners: 0, learners_charged: 0, fee_total: 0 },
				results: results.slice(0, 200),
				message: 'Every selected paper was already applied for',
			})
		}

		// ── Apply, collapsing rows that share an identical patch into one UPDATE ──
		let updated = 0
		let paperFeeTotal = 0
		const failures: CurrentPaperApplyResult[] = []

		const groups = new Map<string, { patch: Record<string, any>; rows: Update[] }>()
		for (const update of updates) {
			const signature = JSON.stringify(update.patch)
			const group = groups.get(signature)
			if (group) group.rows.push(update)
			else groups.set(signature, { patch: update.patch, rows: [update] })
		}

		for (const group of groups.values()) {
			for (let i = 0; i < group.rows.length; i += UPDATE_CHUNK) {
				const batch = group.rows.slice(i, i + UPDATE_CHUNK)
				const { error } = await supabase
					.from('exam_registrations')
					.update(group.patch)
					.in('id', batch.map(r => r.id))

				if (error) {
					console.error('[current-papers] update failed:', error.message)
					for (const row of batch) {
						failures.push({
							register_number: row.register_number,
							course_code: row.course_code,
							status: 'failed',
							reason: error.message,
						})
					}
					continue
				}

				updated += batch.length
				paperFeeTotal += batch.length * (Number(group.patch.fee_amount) || 0)
			}
		}

		results.push(...failures)

		const parts: string[] = []
		if (updated > 0) parts.push(`${updated} paper${updated === 1 ? '' : 's'} applied`)
		if (skippedCount > 0) parts.push(`${skippedCount} already applied (skipped)`)
		if (failures.length > 0) parts.push(`${failures.length} failed`)

		return NextResponse.json({
			success: failures.length === 0,
			summary: {
				total: updates.length + skippedCount,
				updated,
				skipped: skippedCount,
				failed: failures.length,
				learners: targetsByLearner.size,
				learners_charged: learnersCharged,
				fee_total: paperFeeTotal + chargeTotal,
			},
			results: results.slice(0, 200),
			message: parts.join(', ') || 'No changes',
		})
	} catch (e) {
		console.error('[current-papers] POST error:', e)
		const message = e instanceof Error ? e.message : 'Internal server error'
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
