import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Propagates a learner's register number change across the COE tables that
 * store it as text.
 *
 * Learners without a register number are exam-registered with their roll
 * number pasted into the register number field. Once the CoE issues the real
 * number, every row still carrying the old value must follow, or hall tickets,
 * mark entry and results keep printing the roll number.
 *
 * Each update is scoped to institution + learner + the OLD value (or a blank
 * one: learners registered before they had a roll number were saved with an
 * empty register number), so a row that already holds a different number is
 * never touched. Audit logs (exam_registration_approval_logs) are deliberately
 * left as written.
 */

export interface RegisterNumberChange {
	learnerId: string
	from: string
	/** Other values the rows may still hold, e.g. the roll number when `from` is the MyJKKN number. */
	alsoFrom?: string[]
	to: string
}

/** Tables keyed by student_id, with the column holding the register number. */
const STUDENT_TABLES: [table: string, column: string][] = [
	['exam_registrations', 'stu_register_no'],
	['exam_registration_fee_details', 'stu_register_no'],
	['exam_fee_concessions', 'stu_register_no'],
	['final_marks', 'register_number'],
	['semester_results', 'register_number'],
	['student_backlogs', 'register_number'],
	['consolidated_results', 'register_number'],
	['revaluation_registrations', 'student_register_number'],
	['revaluation_final_marks', 'register_number'],
	['student_result_view_cache', 'register_number'],
	['student_cia_view_cache', 'register_number'],
]

/** Tables with no student_id — reached through the learner's exam registrations. */
const REGISTRATION_TABLES: [table: string, column: string][] = [
	['seat_allocations', 'student_reg_no'],
	['student_dummy_numbers', 'actual_register_number'],
]

const CONCURRENCY = 8

/**
 * Rewrites `column` to `to` on the rows `scope` selects, where the column holds
 * one of the old values or is blank/null. Three plain updates instead of one
 * `.or()` filter: a column filter inside `.or()` on an UPDATE has failed with
 * "column … does not exist" (seen on MyJKKN learners_profiles).
 */
async function rewriteOld(
	supabase: SupabaseClient,
	table: string,
	column: string,
	scope: (q: any) => any,
	olds: string[],
	to: string
): Promise<{ count: number; error: string | null }> {
	const passes: ((q: any) => any)[] = [(q: any) => q.eq(column, ''), (q: any) => q.is(column, null)]
	if (olds.length > 0) passes.unshift((q: any) => q.in(column, olds))

	let count = 0
	for (const pass of passes) {
		const { data, error } = await pass(scope(supabase.from(table).update({ [column]: to }))).select('id')
		if (error) return { count, error: error.message }
		count += data?.length || 0
	}
	return { count, error: null }
}

async function syncOne(
	supabase: SupabaseClient,
	institutionsId: string,
	change: RegisterNumberChange,
	totals: Record<string, number>,
	errors: string[]
) {
	// Registration ids are read before exam_registrations is rewritten, while the
	// old value still identifies them.
	const { data: regs, error: regError } = await supabase
		.from('exam_registrations')
		.select('id')
		.eq('institutions_id', institutionsId)
		.eq('student_id', change.learnerId)
		.range(0, 999)
	if (regError) errors.push(`exam_registrations lookup: ${regError.message}`)
	const registrationIds = (regs || []).map(r => r.id)

	const olds = [...new Set([change.from, ...(change.alsoFrom || [])].map(v => (v || '').trim()).filter(Boolean))]
		.filter(v => v !== change.to)

	const record = (table: string, { count, error }: { count: number; error: string | null }) => {
		if (error) errors.push(`${table}: ${error}`)
		totals[table] = (totals[table] || 0) + count
	}

	for (const [table, column] of STUDENT_TABLES) {
		const byLearner = (q: any) => q.eq('institutions_id', institutionsId).eq('student_id', change.learnerId)
		record(table, await rewriteOld(supabase, table, column, byLearner, olds, change.to))
	}

	if (registrationIds.length === 0) return
	for (const [table, column] of REGISTRATION_TABLES) {
		const byRegistration = (q: any) =>
			q.eq('institutions_id', institutionsId).in('exam_registration_id', registrationIds)
		record(table, await rewriteOld(supabase, table, column, byRegistration, olds, change.to))
	}
}

/**
 * Rewrites `from` → `to` for each learner. Returns per-table row counts and
 * any errors; a failure on one table does not stop the others.
 */
export async function syncRegisterNumbers(
	supabase: SupabaseClient,
	institutionsId: string,
	changes: RegisterNumberChange[]
): Promise<{ updated: Record<string, number>; errors: string[] }> {
	const updated: Record<string, number> = {}
	const errors: string[] = []
	// No `from` is still work: blank/null rows are always rewritten.
	const work = changes.filter(c => c.learnerId && c.to)

	for (let i = 0; i < work.length; i += CONCURRENCY) {
		await Promise.all(
			work.slice(i, i + CONCURRENCY).map(change => syncOne(supabase, institutionsId, change, updated, errors))
		)
	}

	return { updated, errors: [...new Set(errors)] }
}

/** "exam_registrations 7, final_marks 2" — for toasts and logs. */
export function describeSync(updated: Record<string, number>): string {
	return Object.entries(updated)
		.filter(([, n]) => n > 0)
		.map(([table, n]) => `${table} ${n}`)
		.join(', ')
}
