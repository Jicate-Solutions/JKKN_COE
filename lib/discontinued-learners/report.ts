import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, fetchAllInChunks, tryFetchAllRows } from '@/lib/exam-applications/paginate'
import { chargeKey, hasSessionChargeColumns } from '@/lib/exam-applications/session-charges'
import { fetchAllMyJKKNPrograms } from '@/services/myjkkn-service'
import { batchYearOf } from '@/lib/utils/batch-year'
import type {
	DiscontinuedLearnerRow,
	DiscontinuedLearnersSummary,
	DiscontinuedReason,
} from '@/types/discontinued-learners'

/**
 * Discontinued Learners cohort
 * -----------------------------------------------------
 * previous session, registration_status = 'Approved'   (fee settled at final approval)
 *   minus  current session, registration_status = 'Approved'
 *   minus  learners whose previous semester was the programme's last one and
 *          who carry no unpassed paper - they completed, they did not leave.
 *
 * 'Approved' is the test on both sides because exam_registrations.fee_paid is
 * not trustworthy (tens of thousands of rows are true with no amount behind
 * them); final approval is the only step that records a settled fee.
 *
 * Names come from exam_registrations.student_name, NOT MyJKKN: the profiles API
 * returns active learners only, and a discontinued learner is exactly the one
 * it leaves out.
 */

const APPROVED = 'Approved'
const APPLIED = 'Applied'

const OFFERING_CHUNK = 100
const STUDENT_CHUNK = 60
const COURSE_CHUNK = 200

interface PreviousRow {
	id: string
	student_id: string | null
	stu_register_no: string | null
	student_name: string | null
	program_code: string | null
	course_offering_id: string | null
	is_regular: boolean | null
	fee_amount: number | null
	application_fee?: number | null
	mark_statement_fee?: number | null
	late_fine?: number | null
}

interface CurrentRow {
	id: string
	student_id: string | null
	stu_register_no: string | null
	registration_status: string | null
}

interface ProgramInfo {
	name: string | null
	order: number | null
	total_semesters: number | null
}

const num = (value: unknown): number => {
	const n = Number(value)
	return Number.isFinite(n) ? n : 0
}

const upper = (value: unknown): string => String(value || '').trim().toUpperCase()

/**
 * Programme name, print order and length. MyJKKN first - the local mirror is
 * sparse - swept once per institution and cached in-process.
 */
const PROGRAM_CACHE_TTL_MS = 10 * 60 * 1000
const programCache = new Map<string, { at: number; programs: Map<string, ProgramInfo> }>()

async function loadPrograms(
	supabase: SupabaseClient,
	institutions_id: string,
	myjkknInstitutionIds: string[]
): Promise<Map<string, ProgramInfo>> {
	const cached = programCache.get(institutions_id)
	if (cached && Date.now() - cached.at < PROGRAM_CACHE_TTL_MS) return cached.programs

	const programs = new Map<string, ProgramInfo>()

	const results = await Promise.all(
		myjkknInstitutionIds.map(async id => {
			try {
				return await fetchAllMyJKKNPrograms({ all: true, limit: 200, is_active: true, institution_id: id })
			} catch (e) {
				console.warn('[discontinued-learners] MyJKKN programs lookup failed:', e instanceof Error ? e.message : e)
				return []
			}
		})
	)
	for (const p of results.flat() as any[]) {
		// MyJKKN's program_id IS the code ("UCA"), not a UUID
		const code = upper(p.program_id || p.program_code)
		if (!code || programs.has(code)) continue
		const years = num(p.duration_years || p.program_duration_yrs)
		programs.set(code, {
			name: String(p.program_name || p.name || '').trim() || null,
			order: p.program_order ?? p.sort_order ?? null,
			total_semesters: num(p.total_semesters) || (years > 0 ? years * 2 : null),
		})
	}
	const foundInMyJKKN = programs.size > 0

	const { data: localPrograms } = await supabase
		.from('programs')
		.select('program_code, program_name, program_order, program_duration_yrs')
		.eq('institutions_id', institutions_id)
	for (const p of localPrograms || []) {
		const code = upper(p.program_code)
		if (!code) continue
		const years = num(p.program_duration_yrs)
		const existing = programs.get(code)
		if (!existing) {
			programs.set(code, {
				name: p.program_name || null,
				order: p.program_order ?? null,
				total_semesters: years > 0 ? years * 2 : null,
			})
			continue
		}
		if (!existing.name && p.program_name) existing.name = p.program_name
		if (existing.order == null && p.program_order != null) existing.order = p.program_order
		if (!existing.total_semesters && years > 0) existing.total_semesters = years * 2
	}

	// An outage should be retried on the next request, not remembered for ten minutes
	if (foundInMyJKKN) programCache.set(institutions_id, { at: Date.now(), programs })
	return programs
}

/**
 * Unpassed papers per learner (student_id -> count).
 *
 * student_backlogs is stale and duplicated, so it is only one of two sources:
 * its uncleared rows are unioned with every final_marks course the learner has
 * not passed, deduplicated by COURSE CODE, and anything passed since is taken
 * back out.
 */
async function loadPendingArrears(
	supabase: SupabaseClient,
	institutions_id: string,
	studentIds: string[]
): Promise<Map<string, number>> {
	const pending = new Map<string, number>()
	if (studentIds.length === 0) return pending

	const [marks, backlogs] = await Promise.all([
		fetchAllInChunks<any, string>(studentIds, STUDENT_CHUNK, batch =>
			tryFetchAllRows<any>(
				() => supabase
					.from('final_marks')
					.select('id, student_id, course_id, is_pass')
					.eq('institutions_id', institutions_id)
					.in('student_id', batch),
				{ label: 'final_marks' }
			)
		),
		fetchAllInChunks<any, string>(studentIds, STUDENT_CHUNK, batch =>
			tryFetchAllRows<any>(
				() => supabase
					.from('student_backlogs_detailed_view')
					.select('id, student_id, course_code')
					.eq('institutions_id', institutions_id)
					.eq('is_cleared', false)
					.eq('is_active', true)
					.in('student_id', batch),
				{ label: 'student_backlogs_detailed_view' }
			)
		),
	])

	// final_marks is keyed by course_id; two master rows can share one course code
	const courseIds = [...new Set(marks.map(m => m.course_id).filter(Boolean))] as string[]
	const codeByCourseId = new Map<string, string>()
	const courses = await fetchAllInChunks<any, string>(courseIds, COURSE_CHUNK, async batch => {
		const { data } = await supabase.from('courses').select('id, course_code').in('id', batch)
		return data || []
	})
	for (const c of courses) {
		if (c.id && c.course_code) codeByCourseId.set(c.id, upper(c.course_code))
	}

	const attempted = new Map<string, Set<string>>()
	const passed = new Map<string, Set<string>>()
	const add = (map: Map<string, Set<string>>, sid: string, code: string) => {
		if (!sid || !code) return
		if (!map.has(sid)) map.set(sid, new Set())
		map.get(sid)!.add(code)
	}

	for (const m of marks) {
		const code = codeByCourseId.get(m.course_id) || ''
		// A row with no verdict yet (is_pass null) is neither an arrear nor a pass
		if (m.is_pass === false) add(attempted, m.student_id, code)
		else if (m.is_pass === true) add(passed, m.student_id, code)
	}
	for (const b of backlogs) add(attempted, b.student_id, upper(b.course_code))

	for (const [sid, codes] of attempted) {
		const cleared = passed.get(sid)
		let count = 0
		for (const code of codes) {
			if (!cleared?.has(code)) count++
		}
		if (count > 0) pending.set(sid, count)
	}
	return pending
}

export interface DiscontinuedCohort {
	summary: DiscontinuedLearnersSummary
	data: DiscontinuedLearnerRow[]
}

export async function loadDiscontinuedLearners(
	supabase: SupabaseClient,
	params: {
		institutions_id: string
		current_session_id: string
		previous_session_id: string
		myjkkn_institution_ids: string[]
	}
): Promise<DiscontinuedCohort> {
	const { institutions_id, current_session_id, previous_session_id } = params

	// The charge columns arrive with 20260824_add_application_fees_to_exam_registrations;
	// selecting a column PostgREST has never seen fails the whole query.
	const chargeColumnsReady = await hasSessionChargeColumns(supabase)
	const previousColumns =
		'id, student_id, stu_register_no, student_name, program_code, course_offering_id, is_regular, fee_amount'
		+ (chargeColumnsReady ? ', application_fee, mark_statement_fee, late_fine' : '')

	const [previousRows, currentRows, programs] = await Promise.all([
		fetchAllRows<PreviousRow>(
			() => supabase
				.from('exam_registrations')
				.select(previousColumns)
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', previous_session_id)
				.eq('registration_status', APPROVED),
			{ label: 'previous session registrations' }
		),
		fetchAllRows<CurrentRow>(
			() => supabase
				.from('exam_registrations')
				.select('id, student_id, stu_register_no, registration_status')
				.eq('institutions_id', institutions_id)
				.eq('examination_session_id', current_session_id),
			{ label: 'current session registrations' }
		),
		loadPrograms(supabase, institutions_id, params.myjkkn_institution_ids),
	])

	// ── Current session: the furthest each learner got ──
	// 3 = approved, 2 = applied, 1 = registered only. A row can be keyed by register
	// number while another carries only the id, so both forms are indexed.
	const currentStage = new Map<string, number>()
	for (const row of currentRows) {
		const stage = row.registration_status === APPROVED ? 3 : row.registration_status === APPLIED ? 2 : 1
		const keys = [chargeKey({ student_id: row.student_id, register_number: row.stu_register_no })]
		if (row.student_id) keys.push(`sid:${row.student_id}`)
		for (const key of keys) {
			if (key === 'sid:') continue
			if ((currentStage.get(key) || 0) < stage) currentStage.set(key, stage)
		}
	}

	// ── Previous session: fold the approved paper rows into learners ──
	const offeringIds = [...new Set(previousRows.map(r => r.course_offering_id).filter(Boolean))] as string[]
	const offerings = await fetchAllInChunks<any, string>(offeringIds, OFFERING_CHUNK, async batch => {
		const { data, error } = await supabase
			.from('course_offerings')
			.select('id, program_code, semester')
			.in('id', batch)
		if (error) throw new Error(`Failed to fetch course offerings: ${error.message}`)
		return data || []
	})
	const offeringById = new Map<string, { program_code: string | null; semester: number | null }>(
		offerings.map((o: any) => [o.id, { program_code: o.program_code ?? null, semester: o.semester ?? null }])
	)

	interface Draft {
		key: string
		student_id: string | null
		register_number: string
		student_name: string
		program_code: string | null
		papers: number
		fee: number
		regularSemesters: number[]
		anySemesters: number[]
	}
	const drafts = new Map<string, Draft>()

	for (const row of previousRows) {
		const key = chargeKey({ student_id: row.student_id, register_number: row.stu_register_no })
		if (key === 'sid:') continue

		const offering = row.course_offering_id ? offeringById.get(row.course_offering_id) : undefined
		// The learner's OWN programme - a generic elective sits on another programme's offering
		const program = upper(row.program_code || offering?.program_code) || null

		let draft = drafts.get(key)
		if (!draft) {
			draft = {
				key,
				student_id: row.student_id || null,
				register_number: String(row.stu_register_no || '').trim(),
				student_name: String(row.student_name || '').trim(),
				program_code: program,
				papers: 0,
				fee: 0,
				regularSemesters: [],
				anySemesters: [],
			}
			drafts.set(key, draft)
		}
		if (!draft.student_id && row.student_id) draft.student_id = row.student_id
		if (!draft.student_name && row.student_name) draft.student_name = String(row.student_name).trim()
		if (!draft.program_code && program) draft.program_code = program

		draft.papers++
		// Once-per-session heads sit on one anchor row, 0 elsewhere - summing never double-counts
		draft.fee += num(row.fee_amount) + num(row.application_fee) + num(row.mark_statement_fee) + num(row.late_fine)

		const semester = Number(offering?.semester) || 0
		if (semester > 0) {
			draft.anySemesters.push(semester)
			if (row.is_regular !== false) draft.regularSemesters.push(semester)
		}
	}

	// ── Who did not come back ──
	let continuing = 0
	const missing: { draft: Draft; stage: number }[] = []
	for (const draft of drafts.values()) {
		const stage = Math.max(
			currentStage.get(draft.key) || 0,
			draft.student_id ? currentStage.get(`sid:${draft.student_id}`) || 0 : 0
		)
		if (stage === 3) continuing++
		else missing.push({ draft, stage })
	}

	const pendingArrears = await loadPendingArrears(
		supabase,
		institutions_id,
		[...new Set(missing.map(m => m.draft.student_id).filter(Boolean))] as string[]
	)

	const data: DiscontinuedLearnerRow[] = []
	let completedExcluded = 0

	for (const { draft, stage } of missing) {
		// Regular papers say which semester the learner sat in; an arrear-only
		// learner falls back to the highest paper.
		const semester = draft.regularSemesters.length > 0
			? Math.max(...draft.regularSemesters)
			: draft.anySemesters.length > 0 ? Math.max(...draft.anySemesters) : null

		const program = draft.program_code ? programs.get(draft.program_code) : undefined
		const arrears = draft.student_id ? pendingArrears.get(draft.student_id) || 0 : 0
		const isFinalSemester = !!(semester && program?.total_semesters && semester >= program.total_semesters)

		if (isFinalSemester && arrears === 0) {
			completedExcluded++
			continue
		}

		const current_status: DiscontinuedReason =
			stage === 2 ? 'Applied - Approval Pending' : stage === 1 ? 'Registered - Not Applied' : 'Not Registered'

		data.push({
			key: draft.key,
			student_id: draft.student_id,
			register_number: draft.register_number,
			student_name: draft.student_name || draft.register_number,
			program_code: draft.program_code,
			program_name: program?.name || null,
			program_order: program?.order ?? 999,
			batch_year: batchYearOf(draft.register_number),
			previous_semester: semester,
			previous_papers: draft.papers,
			previous_fee: draft.fee > 0 ? Math.round(draft.fee * 100) / 100 : null,
			current_status,
			pending_arrears: arrears,
			is_final_semester: isFinalSemester,
		})
	}

	data.sort((a, b) =>
		(a.program_order - b.program_order)
		|| String(a.program_code || '').localeCompare(String(b.program_code || ''))
		|| a.register_number.localeCompare(b.register_number)
	)

	return {
		summary: {
			previous_approved: drafts.size,
			continuing,
			completed_excluded: completedExcluded,
			discontinued: data.length,
		},
		data,
	}
}
