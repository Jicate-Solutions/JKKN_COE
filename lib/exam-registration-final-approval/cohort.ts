import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, fetchAllInChunks, tryFetchAllRows } from '@/lib/exam-applications/paginate'
import { chargeKey, hasSessionChargeColumns } from '@/lib/exam-applications/session-charges'
import { fetchAllMyJKKNPrograms } from '@/services/myjkkn-service'
import type {
	FinalApprovalLearner,
	FinalApprovalSubject,
	FinalApprovalTotals,
} from '@/types/exam-registration-final-approval'

/**
 * Pending final-approval cohort
 * -----------------------------------------------------
 * The Exam Application screens move a learner's paper rows to
 * registration_status = 'Applied' and stamp the fees on them: the per-paper
 * exam fee on every row, the once-per-session application / mark statement /
 * late fine on ONE anchor row. Those 'Applied' rows are the pool awaiting final
 * approval - once approved they become 'Approved' + fee_paid and drop out.
 *
 * This module folds the paper rows into one entry per learner, which is what
 * both the approval screen (GET) and the approval itself (POST) work from. The
 * POST never trusts the browser's copy: it rebuilds the cohort here and takes
 * the paper ids from the database.
 */

/** Rows in this state are awaiting final approval */
export const PENDING_FINAL_APPROVAL_STATUS = 'Applied'

const OFFERING_CHUNK = 100
const MAPPING_CHUNK = 100

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
	application_fee?: number | null
	mark_statement_fee?: number | null
	late_fine?: number | null
}

interface OfferingInfo {
	id: string
	course_code: string | null
	program_code: string | null
	semester: number | null
	course_id: string | null
	course_name: string | null
}

export interface PendingCohort {
	learners: FinalApprovalLearner[]
	charge_columns_ready: boolean
	institution: { id: string; institution_code: string | null; name: string | null } | null
	session: { id: string; session_code: string | null; session_name: string | null } | null
}

const num = (value: unknown): number => {
	const n = Number(value)
	return Number.isFinite(n) ? n : 0
}

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Programme names, MyJKKN first.
 *
 * The local `programs` mirror is sparse (many UG codes have no row at all), so
 * the dropdown showed bare codes like "UAD (56)". MyJKKN is the source of
 * truth for names; it is swept once per institution and cached in-process,
 * with the local mirror filling any gap.
 */
const PROGRAM_NAME_CACHE_TTL_MS = 10 * 60 * 1000
const programNameCache = new Map<string, { at: number; names: Map<string, string> }>()

async function loadProgramNames(
	supabase: SupabaseClient,
	institutions_id: string,
	myjkknInstitutionIds: string[]
): Promise<Map<string, string>> {
	const cached = programNameCache.get(institutions_id)
	if (cached && Date.now() - cached.at < PROGRAM_NAME_CACHE_TTL_MS) return cached.names

	const names = new Map<string, string>()

	const results = await Promise.all(
		myjkknInstitutionIds.map(async id => {
			try {
				return await fetchAllMyJKKNPrograms({ all: true, limit: 200, is_active: true, institution_id: id })
			} catch (e) {
				console.warn('[final-approval] MyJKKN programs lookup failed:', e instanceof Error ? e.message : e)
				return []
			}
		})
	)
	for (const p of results.flat() as any[]) {
		// MyJKKN's program_id IS the code ("UCA"), not a UUID
		const code = String(p.program_id || p.program_code || '').trim().toUpperCase()
		const name = String(p.program_name || p.name || '').trim()
		if (code && name && !names.has(code)) names.set(code, name)
	}

	const { data: localPrograms } = await supabase
		.from('programs')
		.select('program_code, program_name')
		.eq('institutions_id', institutions_id)
	for (const p of localPrograms || []) {
		const code = String(p.program_code || '').trim().toUpperCase()
		if (code && p.program_name && !names.has(code)) names.set(code, p.program_name)
	}

	// Only a sweep that actually found names is worth remembering; an outage
	// should be retried on the next request rather than cached for ten minutes.
	if (names.size > 0) programNameCache.set(institutions_id, { at: Date.now(), names })
	return names
}

export function emptyTotals(): FinalApprovalTotals {
	return { learners: 0, subjects: 0, exam_fee: 0, application_fee: 0, mark_statement_fee: 0, late_fine: 0, final_amount: 0 }
}

/** Sum a set of learners into the summary block */
export function totalsOf(learners: FinalApprovalLearner[]): FinalApprovalTotals {
	const t = emptyTotals()
	for (const l of learners) {
		t.learners++
		t.subjects += l.total_subjects
		t.exam_fee += l.exam_fee
		t.application_fee += l.application_fee
		t.mark_statement_fee += l.mark_statement_fee
		t.late_fine += l.late_fine
		t.final_amount += l.final_amount
	}
	t.exam_fee = round2(t.exam_fee)
	t.application_fee = round2(t.application_fee)
	t.mark_statement_fee = round2(t.mark_statement_fee)
	t.late_fine = round2(t.late_fine)
	t.final_amount = round2(t.final_amount)
	return t
}

/** Learner key for a request payload entry */
export function learnerKeyOf(entry: { student_id?: string | null; register_number?: string | null }): string {
	return chargeKey({ student_id: entry.student_id || null, register_number: entry.register_number || '' })
}

export async function loadPendingFinalApprovalCohort(
	supabase: SupabaseClient,
	params: { institutions_id: string; examination_session_id: string }
): Promise<PendingCohort> {
	const { institutions_id, examination_session_id } = params

	const [chargeColumnsReady, institutionRes, sessionRes] = await Promise.all([
		hasSessionChargeColumns(supabase),
		supabase.from('institutions').select('id, institution_code, name, myjkkn_institution_ids').eq('id', institutions_id).maybeSingle(),
		supabase.from('examination_sessions').select('id, session_code, session_name').eq('id', examination_session_id).maybeSingle(),
	])

	// The charge columns arrive with 20260824_add_application_fees_to_exam_registrations.
	// Selecting a column PostgREST has never seen fails the whole query, so they
	// are only asked for once the probe says they exist.
	const columns =
		'id, student_id, stu_register_no, student_name, course_offering_id, course_code, program_code, registration_status, is_regular, attempt_number, fee_amount'
		+ (chargeColumnsReady ? ', application_fee, mark_statement_fee, late_fine' : '')

	const rows = await fetchAllRows<RegistrationRow>(
		() => supabase
			.from('exam_registrations')
			.select(columns)
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('registration_status', PENDING_FINAL_APPROVAL_STATUS),
		{ label: 'pending final-approval registrations' }
	)

	const inst = institutionRes.data as any
	const empty: PendingCohort = {
		learners: [],
		charge_columns_ready: chargeColumnsReady,
		institution: inst ? { id: inst.id, institution_code: inst.institution_code ?? null, name: inst.name ?? null } : null,
		session: (sessionRes.data as PendingCohort['session']) || null,
	}
	if (rows.length === 0) return empty

	// ── Offerings: course code / programme / semester / course name ──
	const offeringIds = [...new Set(rows.map(r => r.course_offering_id).filter(Boolean))] as string[]
	const offerings = await fetchAllInChunks<OfferingInfo, string>(offeringIds, OFFERING_CHUNK, async batch => {
		const { data, error } = await supabase
			.from('course_offerings')
			.select('id, course_code, program_code, semester, course_id, courses:course_id(course_name)')
			.in('id', batch)
		if (error) throw new Error(`Failed to fetch course offerings: ${error.message}`)
		return (data || []).map((o: any) => ({
			id: o.id,
			course_code: o.course_code ?? null,
			program_code: o.program_code ?? null,
			semester: o.semester ?? null,
			course_id: o.course_id ?? null,
			course_name: Array.isArray(o.courses) ? (o.courses[0]?.course_name ?? null) : (o.courses?.course_name ?? null),
		}))
	})
	const offeringById = new Map(offerings.map(o => [o.id, o]))

	// ── Regulation: course_mapping carries it per (course, programme) ──
	// Degrades to "no regulation" rather than failing the screen.
	const courseIds = [...new Set(offerings.map(o => o.course_id).filter(Boolean))] as string[]
	const regulationByCourseProgram = new Map<string, string>()
	const regulationByCourse = new Map<string, string>()
	for (const batch of chunkArray(courseIds, MAPPING_CHUNK)) {
		const mappings = await tryFetchAllRows<{ course_id: string; program_code: string | null; regulation_code: string | null }>(
			() => supabase.from('course_mapping').select('course_id, program_code, regulation_code').in('course_id', batch),
			{ label: 'course_mapping regulations' }
		)
		for (const m of mappings) {
			if (!m.course_id || !m.regulation_code) continue
			const program = String(m.program_code || '').trim().toUpperCase()
			const key = `${m.course_id}|${program}`
			if (!regulationByCourseProgram.has(key)) regulationByCourseProgram.set(key, m.regulation_code)
			if (!regulationByCourse.has(m.course_id)) regulationByCourse.set(m.course_id, m.regulation_code)
		}
	}

	// ── Programme names (MyJKKN, then the local mirror) ──
	const programNameByCode = await loadProgramNames(
		supabase,
		institutions_id,
		((institutionRes.data as any)?.myjkkn_institution_ids as string[] | null) || []
	)

	// ── Fold paper rows into learners ──
	interface Draft {
		learner: FinalApprovalLearner
		regularSemesters: number[]
		anySemesters: number[]
		regulationVotes: Map<string, number>
	}
	const drafts = new Map<string, Draft>()

	for (const row of rows) {
		const key = chargeKey({ student_id: row.student_id, register_number: row.stu_register_no })
		if (!key || key === 'sid:') continue

		const offering = row.course_offering_id ? offeringById.get(row.course_offering_id) : undefined
		const program = String(row.program_code || offering?.program_code || '').trim().toUpperCase() || null
		// The offering's code is authoritative - exam_registrations.course_code can
		// point at a stray duplicate master row.
		const course_code = String(offering?.course_code || row.course_code || '').trim()
		const isRegular = row.is_regular !== false

		let draft = drafts.get(key)
		if (!draft) {
			draft = {
				learner: {
					key,
					student_id: row.student_id || null,
					register_number: String(row.stu_register_no || '').trim(),
					student_name: String(row.student_name || '').trim(),
					program_code: program,
					program_name: program ? programNameByCode.get(program) || null : null,
					regulation_code: null,
					semester: null,
					subjects: [],
					total_subjects: 0,
					exam_fee: 0,
					application_fee: 0,
					mark_statement_fee: 0,
					late_fine: 0,
					final_amount: 0,
					status: 'Payment Approved',
				},
				regularSemesters: [],
				anySemesters: [],
				regulationVotes: new Map(),
			}
			drafts.set(key, draft)
		}

		const learner = draft.learner
		if (!learner.student_id && row.student_id) learner.student_id = row.student_id
		if (!learner.student_name && row.student_name) learner.student_name = String(row.student_name).trim()
		if (!learner.program_code && program) {
			learner.program_code = program
			learner.program_name = programNameByCode.get(program) || null
		}

		if (offering?.semester != null) {
			draft.anySemesters.push(offering.semester)
			if (isRegular) draft.regularSemesters.push(offering.semester)
		}

		if (offering?.course_id) {
			const regulation =
				regulationByCourseProgram.get(`${offering.course_id}|${program || ''}`)
				|| regulationByCourse.get(offering.course_id)
			if (regulation) {
				// Regular papers decide the regulation; an arrear from an older
				// regulation must not relabel the learner.
				draft.regulationVotes.set(regulation, (draft.regulationVotes.get(regulation) || 0) + (isRegular ? 10 : 1))
			}
		}

		const subject: FinalApprovalSubject = {
			registration_id: row.id,
			course_code,
			course_name: offering?.course_name || '',
			semester: offering?.semester ?? null,
			is_regular: isRegular,
			attempt_number: row.attempt_number ?? 1,
			exam_fee: num(row.fee_amount),
			registration_status: row.registration_status || null,
		}
		learner.subjects.push(subject)

		learner.exam_fee += subject.exam_fee
		// Stamped on one anchor row per learner, 0 elsewhere - summing every row
		// is exactly right and never double-counts.
		learner.application_fee += num(row.application_fee)
		learner.mark_statement_fee += num(row.mark_statement_fee)
		learner.late_fine += num(row.late_fine)
	}

	const learners: FinalApprovalLearner[] = []
	for (const draft of drafts.values()) {
		const l = draft.learner
		// The learner's own semester: their regular papers say which semester
		// they are in; an arrear-only learner falls back to the highest paper.
		const regular = draft.regularSemesters
		const any = draft.anySemesters
		l.semester = regular.length > 0 ? Math.max(...regular) : any.length > 0 ? Math.max(...any) : null

		let best: string | null = null
		let bestVotes = 0
		for (const [code, votes] of draft.regulationVotes) {
			if (votes > bestVotes) { best = code; bestVotes = votes }
		}
		l.regulation_code = best

		l.subjects.sort((a, b) => (a.semester || 0) - (b.semester || 0) || a.course_code.localeCompare(b.course_code))
		l.total_subjects = l.subjects.length
		l.exam_fee = round2(l.exam_fee)
		l.application_fee = round2(l.application_fee)
		l.mark_statement_fee = round2(l.mark_statement_fee)
		l.late_fine = round2(l.late_fine)
		l.final_amount = round2(l.exam_fee + l.application_fee + l.mark_statement_fee + l.late_fine)
		learners.push(l)
	}

	learners.sort((a, b) => a.register_number.localeCompare(b.register_number))

	return { ...empty, learners }
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
	return out
}
