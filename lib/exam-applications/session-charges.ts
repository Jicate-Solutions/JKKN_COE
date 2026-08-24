import type { SupabaseClient } from '@supabase/supabase-js'
import {
	isFineApplicable,
	learnerChargeLines,
	resolveProgramLevel,
	type FeeRateBook,
} from '@/lib/exam-fee/calculate'
import type { ProgramLevel } from '@/lib/exam-fee-catalog'

/**
 * Once-per-learner-per-session exam charges
 * -----------------------------------------------------
 * The circular charges an application fee, a mark statement fee and (past the
 * cut-off) a late fine ONCE per learner per session - not per paper. They are
 * stored in their own exam_registrations columns and stamped on exactly one
 * anchor row per (learner, session), so summing a learner's rows never
 * double-counts them.
 *
 * Both the Current Papers apply route and the arrear submit route go through
 * this file, so a learner is charged identically whichever screen applied them.
 */

/** Learner merge key - uppercased register number, student id as the fallback */
export function chargeKey(learner: { student_id?: string | null; register_number?: string | null }): string {
	const reg = String(learner.register_number || '').trim().toUpperCase()
	if (reg) return `reg:${reg}`
	return `sid:${String(learner.student_id || '').trim()}`
}

export interface SessionCharge {
	application_fee: number
	mark_statement_fee: number
	late_fine: number
	total: number
}

export const NO_CHARGE: SessionCharge = {
	application_fee: 0,
	mark_statement_fee: 0,
	late_fine: 0,
	total: 0,
}

/** The once-per-session heads owed by a learner at the given fee tier */
export function sessionChargeFor(book: FeeRateBook, level: ProgramLevel, onDate: string): SessionCharge {
	const lines = learnerChargeLines(book, level)
	const application_fee = lines.find(l => l.head === 'APPLICATION')?.amount || 0
	const mark_statement_fee = lines.find(l => l.head === 'MARK_STATEMENT')?.amount || 0
	const late_fine = isFineApplicable(book.schedule, onDate) ? (book.schedule?.fine_amount || 0) : 0
	return {
		application_fee,
		mark_statement_fee,
		late_fine,
		total: application_fee + mark_statement_fee + late_fine,
	}
}

/** Same, resolving the fee tier from the learner's programme code */
export function sessionChargeForProgram(
	book: FeeRateBook,
	programCode: string | null | undefined,
	onDate: string
): SessionCharge {
	return sessionChargeFor(book, resolveProgramLevel(programCode, book.levelByProgram), onDate)
}

/** Rows per `.in()` filter - keeps the PostgREST GET URL well under any length limit */
const IN_CHUNK = 60
const MAX_ROWS = 9999

/**
 * Learners who already carry a once-per-session charge in this session.
 *
 * Re-applying a learner (a second batch, a corrected selection, an arrear added
 * after the current papers) must never charge the application / mark statement
 * heads twice, so every write path checks this set first.
 *
 * Pass `registerNumbers` to scope the lookup; omit it to sweep the whole session.
 */
export async function loadAlreadyChargedKeys(
	supabase: SupabaseClient,
	params: {
		institutions_id: string
		examination_session_id: string
		registerNumbers?: string[]
	}
): Promise<Set<string>> {
	const charged = new Set<string>()

	const absorb = (rows: any[] | null) => {
		for (const row of rows || []) {
			charged.add(chargeKey({ student_id: row.student_id, register_number: row.stu_register_no }))
			// A row can be keyed by register number while another carries only the id,
			// so index both forms rather than trusting one to be present.
			if (row.student_id) charged.add(`sid:${row.student_id}`)
		}
	}

	const base = () =>
		supabase
			.from('exam_registrations')
			.select('student_id, stu_register_no')
			.eq('institutions_id', params.institutions_id)
			.eq('examination_session_id', params.examination_session_id)
			.or('application_fee.gt.0,mark_statement_fee.gt.0,late_fine.gt.0')

	const registers = (params.registerNumbers || []).map(r => String(r || '').trim()).filter(Boolean)

	if (registers.length === 0) {
		const { data, error } = await base().range(0, MAX_ROWS)
		if (error) {
			// The columns are added by 20260824_add_application_fees_to_exam_registrations.
			// Before that migration runs, treat nobody as charged rather than failing
			// the whole apply - the amounts simply will not be stamped.
			console.error('[exam-applications] already-charged lookup failed:', error.message)
			return charged
		}
		absorb(data)
		return charged
	}

	for (let i = 0; i < registers.length; i += IN_CHUNK) {
		const batch = registers.slice(i, i + IN_CHUNK)
		const { data, error } = await base().in('stu_register_no', batch).range(0, MAX_ROWS)
		if (error) {
			console.error('[exam-applications] already-charged lookup failed:', error.message)
			return charged
		}
		absorb(data)
	}

	return charged
}
