import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Propagates a learner's register number across the COE tables that store it
 * as text.
 *
 * Learners without a register number are exam-registered with their roll
 * number pasted into the register number field. Once the CoE issues the real
 * number, every row for that learner must follow, or hall tickets, mark entry
 * and results keep printing the old value.
 *
 * Rows are matched on `student_id` alone — the MyJKKN learners_profiles id,
 * which never changes. The value a row currently holds is NOT part of the
 * match: roll numbers get reissued (a learner who moves programme keeps rows
 * under the old roll), so matching on "the old number" silently skips rows.
 *
 * Callers must therefore pass only learners whose number is really changing.
 * Audit logs (exam_registration_approval_logs) are deliberately left as written.
 */

export interface RegisterNumberChange {
	/** MyJKKN learners_profiles.id — stored as student_id across COE. */
	learnerId: string
	to: string
}

/** Tables keyed by student_id, with the column holding the register number. */
export const STUDENT_TABLES: [table: string, column: string][] = [
	['exam_registrations', 'stu_register_no'],
	['exam_registration_fee_details', 'stu_register_no'],
	['exam_fee_concessions', 'stu_register_no'],
	['final_marks', 'register_number'],
	['semester_results', 'register_number'],
	['student_backlogs', 'register_number'],
	['consolidated_results', 'register_number'],
	['revaluation_registrations', 'student_register_number'],
	['revaluation_final_marks', 'register_number'],
]

/** Tables with no student_id — reached through the learner's exam registrations. */
export const REGISTRATION_TABLES: [table: string, column: string][] = [
	['seat_allocations', 'student_reg_no'],
	['student_dummy_numbers', 'actual_register_number'],
]

/**
 * Precomputed learner views. The register number also sits inside the JSON
 * payload, so the row is dropped and rebuilt from exam_registrations on the
 * next read rather than patched.
 */
export const CACHE_TABLES = ['student_result_view_cache', 'student_cia_view_cache']

const CONCURRENCY = 8
// .in() values travel in the query string; chunk so the URL is not truncated.
export const ID_CHUNK = 100

/**
 * Sets `column` to `to` on every row `scope` selects that does not already
 * hold it. Two plain updates instead of one `.or()` filter: `neq` never matches
 * NULL, and a column filter inside `.or()` on an UPDATE has failed with
 * "column … does not exist" (seen on MyJKKN learners_profiles).
 *
 * A caller that has already read the rows can switch off the pass it knows
 * would match nothing, saving a round trip per table.
 */
export async function rewriteColumn(
	supabase: SupabaseClient,
	table: string,
	column: string,
	scope: (q: any) => any,
	to: string,
	only: { values: boolean; nulls: boolean } = { values: true, nulls: true }
): Promise<{ count: number; error: string | null }> {
	const passes: ((q: any) => any)[] = []
	if (only.values) passes.push((q: any) => q.neq(column, to))
	if (only.nulls) passes.push((q: any) => q.is(column, null))

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
	change: RegisterNumberChange,
	totals: Record<string, number>,
	replaced: Record<string, string[]>,
	errors: string[]
) {
	// Read before exam_registrations is rewritten: the ids reach the tables with
	// no student_id, and the values being overwritten go into the log.
	const { data: regs, error: regError } = await supabase
		.from('exam_registrations')
		.select('id, stu_register_no')
		.eq('student_id', change.learnerId)
		.range(0, 999)
	if (regError) errors.push(`exam_registrations lookup: ${regError.message}`)
	const registrationIds = (regs || []).map(r => r.id)

	const previous = [...new Set((regs || []).map(r => String(r.stu_register_no ?? '').trim()))]
		.filter(v => v !== change.to)
	if (previous.length > 0) replaced[change.learnerId] = previous

	const record = (table: string, { count, error }: { count: number; error: string | null }) => {
		if (error) errors.push(`${table}: ${error}`)
		totals[table] = (totals[table] || 0) + count
	}

	const byLearner = (q: any) => q.eq('student_id', change.learnerId)
	for (const [table, column] of STUDENT_TABLES) {
		record(table, await rewriteColumn(supabase, table, column, byLearner, change.to))
	}

	for (const [table, column] of REGISTRATION_TABLES) {
		for (let i = 0; i < registrationIds.length; i += ID_CHUNK) {
			const ids = registrationIds.slice(i, i + ID_CHUNK)
			const byRegistration = (q: any) => q.in('exam_registration_id', ids)
			record(table, await rewriteColumn(supabase, table, column, byRegistration, change.to))
		}
	}

	for (const [table, result] of Object.entries(await dropLearnerViewCaches(supabase, change.learnerId))) {
		record(table, result)
	}
}

/**
 * Drops a learner's precomputed views so the next read rebuilds them from
 * exam_registrations. Needed after any change to the name or register number.
 */
export async function dropLearnerViewCaches(
	supabase: SupabaseClient,
	learnerId: string
): Promise<Record<string, { count: number; error: string | null }>> {
	const dropped: Record<string, { count: number; error: string | null }> = {}
	for (const table of CACHE_TABLES) {
		const { data, error } = await supabase.from(table).delete().eq('student_id', learnerId).select('student_id')
		dropped[table] = { count: data?.length || 0, error: error?.message || null }
	}
	return dropped
}

/**
 * Carries each learner's new register number into every COE table. Returns
 * per-table row counts (rows rewritten; for the view caches, rows dropped), the
 * values that were overwritten on each learner's exam registrations, and any
 * errors — a failure on one table does not stop the others.
 */
export async function syncRegisterNumbers(
	supabase: SupabaseClient,
	changes: RegisterNumberChange[]
): Promise<{ updated: Record<string, number>; replaced: Record<string, string[]>; errors: string[] }> {
	const updated: Record<string, number> = {}
	const replaced: Record<string, string[]> = {}
	const errors: string[] = []
	const work = changes.filter(c => c.learnerId && c.to)

	for (let i = 0; i < work.length; i += CONCURRENCY) {
		await Promise.all(
			work.slice(i, i + CONCURRENCY).map(change => syncOne(supabase, change, updated, replaced, errors))
		)
	}

	return { updated, replaced, errors: [...new Set(errors)] }
}

/** "exam_registrations 7, final_marks 2" — for toasts and logs. */
export function describeSync(updated: Record<string, number>): string {
	return Object.entries(updated)
		.filter(([, n]) => n > 0)
		.map(([table, n]) => `${table} ${n}`)
		.join(', ')
}
