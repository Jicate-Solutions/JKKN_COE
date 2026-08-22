import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProgramLevel } from '@/lib/exam-fee-catalog'

/**
 * Exam fee calculation
 * -----------------------------------------------------
 * Turns the rates configured in exam_fee_master into a per-learner amount for a
 * set of papers, following the CoE fee circular:
 *
 *   per paper     Theory / Practical (<=3 Hrs) / Practical (>3 Hrs) / Project
 *   per learner   Mark Statement + Application, charged once per session
 *   flat          Late fine, when the application date is past the cut-off
 *
 * Rates are versioned by effective_from; the rate in force is the newest row
 * whose effective_from is on or before the calculation date.
 */

/** The per-paper fee heads, keyed off the course master */
export type PaperFeeHead = 'THEORY' | 'PRACTICAL' | 'PRACTICAL_ABOVE_3H' | 'PROJECT'

/** Per-learner-per-session heads */
export type LearnerFeeHead = 'MARK_STATEMENT' | 'APPLICATION'

export const PAPER_FEE_HEAD_LABELS: Record<PaperFeeHead, string> = {
	THEORY: 'Theory paper',
	PRACTICAL: 'Practical - up to 3 Hrs',
	PRACTICAL_ABOVE_3H: 'Practical - above 3 Hrs',
	PROJECT: 'Internship / Project / Viva-Voce',
}

/** Practical papers longer than this many hours use the higher rate */
const PRACTICAL_HOUR_THRESHOLD = 3

export interface CourseFeeInput {
	course_code: string
	/** courses.course_category - Theory / Practical / Project / ... */
	course_category?: string | null
	/** courses.exam_duration, in hours */
	exam_duration?: number | null
}

export interface FeeRate {
	head: string
	program_level: ProgramLevel | null
	calc_basis: string
	amount: number
	label: string
}

export interface FeeSchedule {
	last_date_without_fine: string | null
	last_date_with_fine: string | null
	fine_amount: number
	circular_ref: string | null
}

export interface FeeRateBook {
	/** `${head}|${level}` -> rate; `${head}|` for level-independent rates */
	rates: Map<string, FeeRate>
	/** program_code (UPPER) -> explicit fee tier */
	levelByProgram: Map<string, ProgramLevel>
	schedule: FeeSchedule | null
	/** true when the institution has no CREDIT exam-paper rates configured at all */
	isEmpty: boolean
}

export interface FeeLineItem {
	head: string
	label: string
	course_code?: string
	amount: number
}

export interface LearnerFeeQuote {
	program_level: ProgramLevel
	/** Per-paper charges, one line per applied course */
	paper_lines: FeeLineItem[]
	/** Mark statement + application, charged once for the session */
	learner_lines: FeeLineItem[]
	/** Late fine, when past the cut-off */
	fine: number
	paper_total: number
	learner_total: number
	total: number
	/** Course codes with no rate configured - surfaced so nothing is silently free */
	unpriced_courses: string[]
}

/**
 * Which fee head a course falls under.
 *
 * A course carrying both theory and practical components is examined as a theory
 * paper, so it is charged at the theory rate; only a pure practical uses the
 * practical rates. Returns null for courses that carry no exam fee.
 */
export function resolvePaperFeeHead(course: CourseFeeInput): PaperFeeHead | null {
	const category = String(course.course_category || '').trim().toLowerCase()
	if (!category) return 'THEORY'

	if (category === 'non academic') return null

	if (category === 'practical') {
		const hours = Number(course.exam_duration) || 0
		return hours > PRACTICAL_HOUR_THRESHOLD ? 'PRACTICAL_ABOVE_3H' : 'PRACTICAL'
	}

	if (
		category === 'project' ||
		category === 'group project' ||
		category === 'field work' ||
		category === 'community service'
	) {
		return 'PROJECT'
	}

	// Theory, Theory + Practical, Theory + Project and anything unrecognised
	return 'THEORY'
}

/**
 * UG / PG fallback when a programme has no explicit fee-tier row.
 * Mirrors the DB function get_program_type_from_code(); MCA is never inferred
 * here because JKKN's MCA code ("PCA") is indistinguishable from a generic PG
 * code - map it explicitly in exam_fee_program_levels instead.
 */
export function heuristicProgramLevel(programCode?: string | null): ProgramLevel {
	if (!programCode) return 'UG'
	const code = programCode.toUpperCase()
	const pgPrefixes = ['MSC', 'M.SC', 'M SC', 'MBA', 'MCA', 'MA', 'M.A', 'MCOM', 'M.COM', 'M COM', 'MSW', 'MPHIL', 'PHD', 'PH.D', 'MASTER', 'POST', 'PG']
	if (pgPrefixes.some(p => code.startsWith(p))) return 'PG'
	if (/^[0-9]{2}P[A-Z]/.test(code)) return 'PG'
	if (/^P[A-Z]{2,3}$/.test(code)) return 'PG'
	return 'UG'
}

/** The fee tier for a programme: explicit map first, heuristic second */
export function resolveProgramLevel(
	programCode: string | null | undefined,
	levelByProgram: Map<string, ProgramLevel>
): ProgramLevel {
	const code = String(programCode || '').trim().toUpperCase()
	if (code && levelByProgram.has(code)) return levelByProgram.get(code) as ProgramLevel
	return heuristicProgramLevel(code)
}

/**
 * Load every rate in force for an institution as of `asOf`, plus the programme
 * tier map and the session cut-off dates. One call serves a whole bulk screen.
 */
export async function loadFeeRateBook(
	supabase: SupabaseClient,
	params: { institutions_id: string; examination_session_id?: string | null; asOf?: string }
): Promise<FeeRateBook> {
	const { institutions_id, examination_session_id } = params
	const asOf = params.asOf || new Date().toISOString().slice(0, 10)

	const rates = new Map<string, FeeRate>()
	const levelByProgram = new Map<string, ProgramLevel>()
	let schedule: FeeSchedule | null = null

	// ── Rates: newest effective_from on or before asOf wins ──
	const { data: rateRows, error: rateError } = await supabase
		.from('exam_fee_master')
		.select('category, sub_category, program_level, calc_basis, amount, label, effective_from')
		.eq('institutions_id', institutions_id)
		.eq('fee_type', 'CREDIT')
		.eq('is_active', true)
		.lte('effective_from', asOf)
		.order('effective_from', { ascending: true })
		.range(0, 9999)

	if (rateError) {
		console.error('[exam-fee] exam_fee_master error:', rateError)
	} else {
		// Ascending order means a later row overwrites an earlier one, leaving the
		// newest effective_from in the map.
		for (const row of rateRows || []) {
			const key = `${row.sub_category}|${row.program_level || ''}`
			rates.set(key, {
				head: row.sub_category,
				program_level: (row.program_level as ProgramLevel) || null,
				calc_basis: row.calc_basis,
				amount: Number(row.amount) || 0,
				label: row.label || row.sub_category,
			})
		}
	}

	// ── Explicit programme -> tier map ──
	const { data: levelRows, error: levelError } = await supabase
		.from('exam_fee_program_levels')
		.select('program_code, program_level')
		.eq('institutions_id', institutions_id)
		.eq('is_active', true)
		.range(0, 9999)

	if (levelError) {
		// The map is an optional refinement - fall back to the heuristic.
		console.error('[exam-fee] exam_fee_program_levels error:', levelError)
	} else {
		for (const row of levelRows || []) {
			if (row.program_code) {
				levelByProgram.set(String(row.program_code).trim().toUpperCase(), row.program_level as ProgramLevel)
			}
		}
	}

	// ── Session cut-off dates + fine ──
	if (examination_session_id) {
		const { data: scheduleRow, error: scheduleError } = await supabase
			.from('exam_fee_schedules')
			.select('last_date_without_fine, last_date_with_fine, fine_amount, circular_ref')
			.eq('institutions_id', institutions_id)
			.eq('examination_session_id', examination_session_id)
			.eq('is_active', true)
			.maybeSingle()

		if (scheduleError) {
			console.error('[exam-fee] exam_fee_schedules error:', scheduleError)
		} else if (scheduleRow) {
			schedule = {
				last_date_without_fine: scheduleRow.last_date_without_fine || null,
				last_date_with_fine: scheduleRow.last_date_with_fine || null,
				fine_amount: Number(scheduleRow.fine_amount) || 0,
				circular_ref: scheduleRow.circular_ref || null,
			}
		}
	}

	const isEmpty = ![...rates.keys()].some(k => k.startsWith('THEORY|') || k.startsWith('PRACTICAL|'))

	return { rates, levelByProgram, schedule, isEmpty }
}

/** Rate lookup: exact tier first, then a level-independent row */
function findRate(book: FeeRateBook, head: string, level: ProgramLevel): FeeRate | null {
	return book.rates.get(`${head}|${level}`) || book.rates.get(`${head}|`) || null
}

/** Whether the late fine applies on the given date */
export function isFineApplicable(schedule: FeeSchedule | null, onDate: string): boolean {
	if (!schedule || schedule.fine_amount <= 0) return false
	if (!schedule.last_date_without_fine) return false
	return onDate > schedule.last_date_without_fine
}

export interface QuoteParams {
	program_code: string | null | undefined
	courses: CourseFeeInput[]
	/** Charge the once-per-session heads (mark statement + application). */
	includeLearnerCharges?: boolean
	/** Date the application is being made; defaults to today. */
	onDate?: string
}

/**
 * The fee a single learner owes for the papers they are applying for.
 *
 * `includeLearnerCharges` should be false when the learner already has
 * registrations in this session - the mark statement and application fee are
 * charged once per session, not once per paper.
 */
export function quoteLearnerFee(book: FeeRateBook, params: QuoteParams): LearnerFeeQuote {
	const onDate = params.onDate || new Date().toISOString().slice(0, 10)
	const level = resolveProgramLevel(params.program_code, book.levelByProgram)

	const paper_lines: FeeLineItem[] = []
	const unpriced_courses: string[] = []

	for (const course of params.courses) {
		const head = resolvePaperFeeHead(course)
		if (!head) continue

		const rate = findRate(book, head, level)
		if (!rate) {
			unpriced_courses.push(course.course_code)
			continue
		}
		paper_lines.push({
			head,
			label: PAPER_FEE_HEAD_LABELS[head],
			course_code: course.course_code,
			amount: rate.amount,
		})
	}

	const learner_lines: FeeLineItem[] = []
	if (params.includeLearnerCharges !== false) {
		for (const head of ['MARK_STATEMENT', 'APPLICATION'] as LearnerFeeHead[]) {
			const rate = findRate(book, head, level)
			if (rate) learner_lines.push({ head, label: rate.label, amount: rate.amount })
		}
	}

	const fine = isFineApplicable(book.schedule, onDate) ? (book.schedule?.fine_amount || 0) : 0

	const paper_total = paper_lines.reduce((sum, l) => sum + l.amount, 0)
	const learner_total = learner_lines.reduce((sum, l) => sum + l.amount, 0)

	return {
		program_level: level,
		paper_lines,
		learner_lines,
		fine,
		paper_total,
		learner_total,
		total: paper_total + learner_total + fine,
		unpriced_courses,
	}
}

/**
 * Price a list of courses in one pass.
 *
 * Returns a map keyed by UPPER course code so callers can stamp fee_head /
 * fee_amount onto their own course rows without re-deriving the head.
 */
export function priceCourseList(
	book: FeeRateBook,
	level: ProgramLevel,
	courses: CourseFeeInput[]
): Map<string, { head: PaperFeeHead | null; amount: number | null }> {
	const priced = new Map<string, { head: PaperFeeHead | null; amount: number | null }>()
	for (const course of courses) {
		const key = String(course.course_code || '').trim().toUpperCase()
		if (!key || priced.has(key)) continue
		const head = resolvePaperFeeHead(course)
		const rate = head ? findRate(book, head, level) : null
		priced.set(key, { head, amount: rate ? rate.amount : null })
	}
	return priced
}

/** The once-per-session learner charges at a given tier (mark statement + application) */
export function learnerChargeLines(book: FeeRateBook, level: ProgramLevel): FeeLineItem[] {
	const lines: FeeLineItem[] = []
	for (const head of ['MARK_STATEMENT', 'APPLICATION'] as LearnerFeeHead[]) {
		const rate = findRate(book, head, level)
		if (rate) lines.push({ head, label: rate.label, amount: rate.amount })
	}
	return lines
}
