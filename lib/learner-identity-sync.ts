import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchMyjkknLearnerIdentities } from '@/lib/myjkkn/learner-register-number'
import { hasRealRegisterNumber } from '@/lib/utils/register-number'
import {
	CACHE_TABLES,
	ID_CHUNK,
	REGISTRATION_TABLES,
	STUDENT_TABLES,
	rewriteColumn,
} from '@/lib/utils/register-number-sync'

/**
 * Keeps the learner name and register number COE copied at exam registration
 * in step with MyJKKN.
 *
 * COE stores both as text on every registration (and the register number on
 * results), but a learner's name gets corrected and numbers get issued in
 * MyJKKN afterwards. `student_id` is the MyJKKN learners_profiles id — it is
 * the one value that never changes, so it is the only key used here and it is
 * never written.
 *
 * Used by the daily cron and by the "Sync from MyJKKN" button; both build a
 * plan from a full scan and apply it, so a preview shows exactly what a run
 * would write.
 *
 * Left alone on purpose:
 *   - learners with no MyJKKN profile;
 *   - a register number MyJKKN holds only as a placeholder (blank, or equal to
 *     the roll number) — a real number in COE is never downgraded;
 *   - a new register number another learner still holds in COE;
 *   - a name so different it is probably another person (a registration
 *     pointing at the wrong learner);
 *   - exam_registration_approval_logs, an audit log.
 */

/** Tables keyed by student_id that carry the learner's name. */
const NAME_TABLES = ['exam_registrations', 'exam_registration_fee_details', 'exam_fee_concessions', 'revaluation_registrations']
/** Name columns on tables reached through exam_registration_id. */
const NAME_REGISTRATION_TABLES = ['seat_allocations']
const NAME_COLUMN = 'student_name'

/** UNIQUE (institutions_id, examination_session_id, stu_register_no) — see parkNumbers. */
const UNIQUE_NUMBER_TABLE = 'exam_registration_fee_details'

const PAGE = 1000
// The scan is ~110 page reads across 14 tables; this bounds how many are in
// flight at once, across all of them.
const READ_CONCURRENCY = 16
const WRITE_CONCURRENCY = 12

export interface LearnerIdentityChange {
	learner_id: string
	/** As COE shows the learner today. */
	current_name: string
	current_register_number: string
	name: { from: string[]; to: string } | null
	register_number: { from: string[]; to: string } | null
	/** Rows across COE that hold one of the `from` values. */
	rows: number
}

export interface LearnerIdentitySkip {
	learner_id: string
	name: string
	register_number: string
	reason: string
}

export interface LearnerIdentityPlan {
	scanned: { learners: number; rows: number; without_profile: number }
	changes: LearnerIdentityChange[]
	skipped: LearnerIdentitySkip[]
	/** Tables that could not be read; their rows are not in the plan. */
	errors: string[]
}

export interface LearnerIdentityResult {
	learners: number
	names: number
	register_numbers: number
	rows: Record<string, number>
	errors: string[]
}

/** One column on one table that holds something other than the MyJKKN value. */
interface StaleColumn {
	table: string
	column: string
	/** Reached by student_id, or through the learner's exam registrations. */
	via: 'student_id' | 'exam_registration_id'
	/** Which rewrite passes have anything to match — see rewriteColumn. */
	only: { values: boolean; nulls: boolean }
}

interface PlanContext {
	plan: LearnerIdentityPlan
	registrationIds: Map<string, string[]>
	/** learner -> exactly the columns to rewrite, so a run touches nothing else. */
	work: Map<string, { name: StaleColumn[]; number: StaleColumn[] }>
	/** Learners whose current number must be moved aside first — see parkNumbers. */
	park: string[]
}

const clean = (value: unknown) => String(value ?? '').trim()
const collapse = (value: unknown) => clean(value).replace(/\s+/g, ' ')
const letters = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')

function levenshtein(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
	for (let i = 1; i <= a.length; i++) {
		const current = [i]
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
			)
		}
		previous = current
	}
	return previous[b.length]
}

/**
 * True when two spellings plausibly name the same person: they share a word,
 * or differ by a few letters. A spelling fix or a moved initial passes;
 * "GOKULNATH M" against "KEERTHIKA M" does not.
 */
function sameLearnerName(a: string, b: string): boolean {
	const words = (value: string) =>
		value.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length >= 3)
	const wordsA = new Set(words(a))
	if (words(b).some(word => wordsA.has(word))) return true

	const lettersA = letters(a)
	const lettersB = letters(b)
	const longest = Math.max(lettersA.length, lettersB.length)
	return longest > 0 && 1 - levenshtein(lettersA, lettersB) / longest >= 0.6
}

/** Runs tasks with at most `size` in flight; shared, so it caps a whole phase. */
function createLimiter(size: number) {
	let active = 0
	const waiting: (() => void)[] = []
	return async function limit<T>(task: () => Promise<T>): Promise<T> {
		if (active >= size) await new Promise<void>(resolve => waiting.push(resolve))
		else active++
		try {
			return await task()
		} finally {
			// A finished task hands its slot straight to the next one waiting.
			const next = waiting.shift()
			if (next) next()
			else active--
		}
	}
}

type Limiter = ReturnType<typeof createLimiter>

/**
 * Reads a whole table, paging past the 1000-row cap on a unique order. The
 * first page carries the row count, so every other page can go out at once
 * (through the limiter) instead of one after another.
 */
async function fetchAll(
	supabase: SupabaseClient,
	limit: Limiter,
	table: string,
	columns: string,
	order: string[],
	institutionsId?: string
): Promise<any[]> {
	const page = (offset: number, withCount: boolean) =>
		limit(async () => {
			let query = supabase.from(table).select(columns, withCount ? { count: 'exact' } : undefined)
			if (institutionsId) query = query.eq('institutions_id', institutionsId)
			for (const column of order) query = query.order(column, { ascending: true })
			const { data, error, count } = await query.range(offset, offset + PAGE - 1)
			if (error) throw new Error(`${table}: ${error.message}`)
			return { data: (data || []) as any[], count: count || 0 }
		})

	const first = await page(0, true)
	const offsets: number[] = []
	for (let offset = PAGE; offset < first.count; offset += PAGE) offsets.push(offset)
	const rest = await Promise.all(offsets.map(offset => page(offset, false)))
	return first.data.concat(...rest.map(result => result.data))
}

/** What one learner's rows on one table hold. */
interface TableHeld {
	names: Map<string, number>
	numbers: Map<string, number>
	nullNames: number
	nullNumbers: number
}

interface Held {
	name: string
	number: string
	tables: Map<string, TableHeld>
}

interface ScanSpec {
	table: string
	numberColumn: string
	nameColumn?: string
	via: 'student_id' | 'exam_registration_id'
	order: string[]
	cache?: boolean
}

/** Every table besides exam_registrations that copies the name or the number. */
function scanSpecs(): ScanSpec[] {
	const specs: ScanSpec[] = []
	for (const [table, numberColumn] of STUDENT_TABLES) {
		if (table === 'exam_registrations') continue
		specs.push({
			table,
			numberColumn,
			nameColumn: NAME_TABLES.includes(table) ? NAME_COLUMN : undefined,
			via: 'student_id',
			order: ['id'],
		})
	}
	for (const [table, numberColumn] of REGISTRATION_TABLES) {
		specs.push({
			table,
			numberColumn,
			nameColumn: NAME_REGISTRATION_TABLES.includes(table) ? NAME_COLUMN : undefined,
			via: 'exam_registration_id',
			order: ['id'],
		})
	}
	// A cached view that still shows an old number counts as out of step too.
	for (const table of CACHE_TABLES) {
		specs.push({ table, numberColumn: 'register_number', via: 'student_id', order: ['student_id', 'institutions_id'], cache: true })
	}
	return specs
}

/**
 * Scans every table that stores a learner's name or register number and works
 * out what differs from MyJKKN. Nothing is written.
 */
async function buildPlan(supabase: SupabaseClient, institutionsId?: string): Promise<PlanContext> {
	const started = Date.now()
	const errors: string[] = []
	const held = new Map<string, Held>()
	const registrationIds = new Map<string, string[]>()
	const learnerOfRegistration = new Map<string, string>()
	/** number -> learners holding it anywhere in COE */
	const holders = new Map<string, Set<string>>()
	const uniqueTableHolders = new Map<string, Set<string>>()
	const specByTable = new Map<string, ScanSpec>()
	let scannedRows = 0

	const bump = (map: Map<string, number>, value: string) => map.set(value, (map.get(value) || 0) + 1)
	const note = (learnerId: string | null | undefined, spec: ScanSpec, row: any) => {
		if (!learnerId) return
		scannedRows++

		let item = held.get(learnerId)
		if (!item) {
			item = { name: '', number: '', tables: new Map() }
			held.set(learnerId, item)
		}
		let onTable = item.tables.get(spec.table)
		if (!onTable) {
			onTable = { names: new Map(), numbers: new Map(), nullNames: 0, nullNumbers: 0 }
			item.tables.set(spec.table, onTable)
		}

		if (spec.nameColumn) {
			const raw = row[spec.nameColumn]
			if (raw === null || raw === undefined) onTable.nullNames++
			else {
				bump(onTable.names, clean(raw))
				if (!item.name) item.name = clean(raw)
			}
		}

		const raw = row[spec.numberColumn]
		if (raw === null || raw === undefined) {
			onTable.nullNumbers++
			return
		}
		const value = clean(raw)
		bump(onTable.numbers, value)
		if (!item.number) item.number = value
		// A cached view is a copy, not a claim on the number.
		if (value && !spec.cache) {
			if (!holders.has(value)) holders.set(value, new Set())
			holders.get(value)!.add(learnerId)
			if (spec.table === UNIQUE_NUMBER_TABLE) {
				if (!uniqueTableHolders.has(value)) uniqueTableHolders.set(value, new Set())
				uniqueTableHolders.get(value)!.add(learnerId)
			}
		}
	}

	// Everything is requested at once; the limiter spreads the pages out.
	const limit = createLimiter(READ_CONCURRENCY)
	const registrationSpec: ScanSpec = {
		table: 'exam_registrations',
		numberColumn: 'stu_register_no',
		nameColumn: NAME_COLUMN,
		via: 'student_id',
		order: ['id'],
	}
	specByTable.set(registrationSpec.table, registrationSpec)
	const registrationsLoading = fetchAll(
		supabase,
		limit,
		registrationSpec.table,
		`id, student_id, ${NAME_COLUMN}, stu_register_no`,
		registrationSpec.order,
		institutionsId
	)
	const othersLoading = scanSpecs().map(spec => {
		specByTable.set(spec.table, spec)
		const columns = `${spec.via}, ${spec.numberColumn}${spec.nameColumn ? `, ${spec.nameColumn}` : ''}`
		return fetchAll(supabase, limit, spec.table, columns, spec.order, institutionsId).then(
			rows => ({ spec, rows, error: null as string | null }),
			error => ({ spec, rows: [] as any[], error: error instanceof Error ? error.message : `${spec.table}: scan failed` })
		)
	})

	// Registrations anchor what COE shows for a learner and reach the tables
	// that carry no student_id, so they are processed first — and a failure
	// here fails the run rather than producing a partial plan.
	const registrations = await registrationsLoading
	for (const row of registrations) {
		if (!row.student_id) continue
		learnerOfRegistration.set(row.id, row.student_id)
		if (!registrationIds.has(row.student_id)) registrationIds.set(row.student_id, [])
		registrationIds.get(row.student_id)!.push(row.id)
		note(row.student_id, registrationSpec, row)
	}
	for (const { spec, rows, error } of await Promise.all(othersLoading)) {
		if (error) {
			errors.push(error)
			continue
		}
		for (const row of rows) {
			note(spec.via === 'student_id' ? row.student_id : learnerOfRegistration.get(row.exam_registration_id), spec, row)
		}
	}
	const scannedAt = Date.now()

	const identities = await fetchMyjkknLearnerIdentities([...held.keys()])
	if (!identities) {
		throw new Error('MyJKKN is not configured: set MYJKKN_SUPABASE_URL and MYJKKN_SUPABASE_SERVICE_ROLE_KEY.')
	}
	const comparedAt = Date.now()

	const skipped: LearnerIdentitySkip[] = []
	const nameChange = new Map<string, { from: string[]; to: string; rows: number; columns: StaleColumn[] }>()
	const numberChange = new Map<string, { from: string[]; to: string; rows: number; columns: StaleColumn[] }>()
	let withoutProfile = 0

	/** What on a learner's rows differs from `target`, table by table. */
	const stale = (item: Held, kind: 'name' | 'number', target: string) => {
		const from = new Set<string>()
		const columns: StaleColumn[] = []
		let rows = 0
		for (const [table, onTable] of item.tables) {
			const spec = specByTable.get(table)!
			const column = kind === 'name' ? spec.nameColumn : spec.numberColumn
			if (!column) continue
			const values = kind === 'name' ? onTable.names : onTable.numbers
			const nulls = kind === 'name' ? onTable.nullNames : onTable.nullNumbers
			let differing = 0
			for (const [value, count] of values) {
				if (value === target) continue
				differing += count
				from.add(value)
			}
			if (nulls > 0) from.add('')
			if (differing + nulls === 0) continue
			rows += differing + nulls
			// A cached view is dropped, never rewritten.
			if (!spec.cache) columns.push({ table, column, via: spec.via, only: { values: differing > 0, nulls: nulls > 0 } })
		}
		return { from: [...from], rows, columns }
	}

	for (const [learnerId, item] of held) {
		const identity = identities.get(learnerId)
		if (!identity) {
			withoutProfile++
			continue
		}

		const name = collapse(`${identity.first_name || ''} ${identity.last_name || ''}`)
		// A learner seen only through a cached view has no name in COE to show.
		if (!item.name) item.name = name
		if (name) {
			const staleName = stale(item, 'name', name)
			// One row under somebody else's name holds the whole learner back: the
			// update is by student_id and would rename that row too.
			const foreign = staleName.from.filter(value => value && !sameLearnerName(value, name))
			if (foreign.length > 0) {
				skipped.push({
					learner_id: learnerId,
					name: item.name,
					register_number: item.number,
					reason: `Has rows named ${foreign.map(value => `"${value}"`).join(', ')} but MyJKKN shows "${name}" — too different to be a correction. Check those rows point at the right learner.`,
				})
			} else if (staleName.rows > 0) {
				nameChange.set(learnerId, { ...staleName, to: name })
			}
		}

		const number = clean(identity.register_number)
		if (hasRealRegisterNumber(number, identity.roll_number)) {
			const staleNumber = stale(item, 'number', number)
			if (staleNumber.rows > 0) numberChange.set(learnerId, { ...staleNumber, to: number })
		}
	}

	// A new number must be free once the run is over. Someone holding it is fine
	// only if they are moving off it in this same run — and dropping one learner
	// can strand another, so repeat until nothing changes.
	for (let changed = true; changed; ) {
		changed = false
		for (const [learnerId, change] of numberChange) {
			const blocker = [...(holders.get(change.to) || [])].find(
				other => other !== learnerId && !numberChange.has(other)
			)
			if (!blocker) continue
			numberChange.delete(learnerId)
			changed = true
			const item = held.get(learnerId)!
			skipped.push({
				learner_id: learnerId,
				name: item.name,
				register_number: item.number,
				reason: `MyJKKN number ${change.to} is still on ${held.get(blocker)?.name || 'another learner'} in COE.`,
			})
		}
	}

	const park = new Set<string>()
	for (const [learnerId, change] of numberChange) {
		for (const other of uniqueTableHolders.get(change.to) || []) {
			if (other !== learnerId) park.add(other)
		}
	}

	const changes: LearnerIdentityChange[] = []
	const work: PlanContext['work'] = new Map()
	for (const learnerId of new Set([...nameChange.keys(), ...numberChange.keys()])) {
		const item = held.get(learnerId)!
		const name = nameChange.get(learnerId)
		const registerNumber = numberChange.get(learnerId)
		changes.push({
			learner_id: learnerId,
			current_name: item.name,
			current_register_number: item.number,
			name: name ? { from: name.from, to: name.to } : null,
			register_number: registerNumber ? { from: registerNumber.from, to: registerNumber.to } : null,
			rows: (name?.rows || 0) + (registerNumber?.rows || 0),
		})
		work.set(learnerId, { name: name?.columns || [], number: registerNumber?.columns || [] })
	}
	changes.sort((a, b) => a.current_name.localeCompare(b.current_name) || a.learner_id.localeCompare(b.learner_id))

	console.log(
		`[learner-identity-sync] plan: ${scannedRows} rows / ${held.size} learners — scan ${scannedAt - started}ms, MyJKKN ${comparedAt - scannedAt}ms, compare ${Date.now() - comparedAt}ms`
	)

	return {
		plan: {
			scanned: { learners: held.size, rows: scannedRows, without_profile: withoutProfile },
			changes,
			skipped,
			errors,
		},
		registrationIds,
		work,
		park: [...park],
	}
}

/**
 * exam_registration_fee_details allows one row per register number per session,
 * so two learners trading numbers cannot simply be updated one after the other:
 * the first update collides with the row the second has not left yet. Their
 * current numbers are moved to a throwaway value first. Every parked learner is
 * also in the plan, so the run overwrites the placeholder — and a run that dies
 * half way is finished by the next one, since rows are matched on student_id.
 */
async function parkNumbers(supabase: SupabaseClient, learnerIds: string[], errors: string[]) {
	for (const learnerId of learnerIds) {
		const { error } = await supabase
			.from(UNIQUE_NUMBER_TABLE)
			.update({ stu_register_no: `TMP-${learnerId}` })
			.eq('student_id', learnerId)
		if (error) errors.push(`${UNIQUE_NUMBER_TABLE} (park): ${error.message}`)
	}
}

async function applyPlan(supabase: SupabaseClient, context: PlanContext): Promise<LearnerIdentityResult> {
	const { plan, registrationIds, work, park } = context
	const started = Date.now()
	const rows: Record<string, number> = {}
	const errors: string[] = []
	const record = (table: string, { count, error }: { count: number; error: string | null }) => {
		if (error) errors.push(`${table}: ${error}`)
		rows[table] = (rows[table] || 0) + count
	}

	await parkNumbers(supabase, park, errors)

	// One task per stale column — the scan already knows which those are, so
	// tables a learner is fine on are never touched.
	const tasks: (() => Promise<void>)[] = []
	const rewrite = (learnerId: string, stale: StaleColumn, to: string) => {
		if (stale.via === 'student_id') {
			const byLearner = (q: any) => q.eq('student_id', learnerId)
			tasks.push(async () => record(stale.table, await rewriteColumn(supabase, stale.table, stale.column, byLearner, to, stale.only)))
			return
		}
		const ids = registrationIds.get(learnerId) || []
		for (let i = 0; i < ids.length; i += ID_CHUNK) {
			const chunk = ids.slice(i, i + ID_CHUNK)
			const byRegistration = (q: any) => q.in('exam_registration_id', chunk)
			tasks.push(async () => record(stale.table, await rewriteColumn(supabase, stale.table, stale.column, byRegistration, to, stale.only)))
		}
	}
	for (const change of plan.changes) {
		const stale = work.get(change.learner_id)
		if (!stale) continue
		if (change.name) for (const column of stale.name) rewrite(change.learner_id, column, change.name.to)
		if (change.register_number) for (const column of stale.number) rewrite(change.learner_id, column, change.register_number.to)
	}

	// The cached views carry both values inside their payload: drop them for
	// every changed learner in one statement per chunk, to be rebuilt on read.
	const changedIds = plan.changes.map(change => change.learner_id)
	for (const table of CACHE_TABLES) {
		for (let i = 0; i < changedIds.length; i += ID_CHUNK) {
			const chunk = changedIds.slice(i, i + ID_CHUNK)
			tasks.push(async () => {
				const { data, error } = await supabase.from(table).delete().in('student_id', chunk).select('student_id')
				record(table, { count: data?.length || 0, error: error?.message || null })
			})
		}
	}

	const limit = createLimiter(WRITE_CONCURRENCY)
	await Promise.all(tasks.map(task => limit(task)))

	console.log(`[learner-identity-sync] apply: ${tasks.length} statements in ${Date.now() - started}ms`)

	return {
		learners: plan.changes.length,
		names: plan.changes.filter(change => change.name).length,
		register_numbers: plan.changes.filter(change => change.register_number).length,
		rows,
		errors: [...new Set(errors)],
	}
}

/** What a sync would change, without writing. */
export async function previewLearnerIdentitySync(
	supabase: SupabaseClient,
	options: { institutionsId?: string } = {}
): Promise<LearnerIdentityPlan> {
	return (await buildPlan(supabase, options.institutionsId)).plan
}

/**
 * Scans, applies, and leaves a transaction log entry naming every value that
 * was overwritten. The plan is always rebuilt here, never taken from a caller.
 */
export async function runLearnerIdentitySync(
	supabase: SupabaseClient,
	options: { institutionsId?: string; trigger: 'cron' | 'manual' }
): Promise<{ plan: LearnerIdentityPlan; result: LearnerIdentityResult }> {
	const context = await buildPlan(supabase, options.institutionsId)
	const result = await applyPlan(supabase, context)

	console.log(
		`[learner-identity-sync] ${options.trigger}: ${result.learners} learners (${result.names} names, ${result.register_numbers} register numbers), skipped ${context.plan.skipped.length}, errors ${result.errors.length}`
	)
	if (result.errors.length > 0) console.error('[learner-identity-sync] errors:', result.errors)

	if (result.learners > 0 || result.errors.length > 0) {
		const { error } = await supabase.from('transaction_logs').insert({
			action: 'learner_identity:sync',
			resource_type: 'exam_registrations',
			status: result.errors.length > 0 ? 'error' : 'success',
			metadata: {
				trigger: options.trigger,
				institutions_id: options.institutionsId || null,
				learners: result.learners,
				names: result.names,
				register_numbers: result.register_numbers,
				rows: result.rows,
				errors: result.errors.slice(0, 20),
				changes: context.plan.changes.slice(0, 300).map(change => ({
					student_id: change.learner_id,
					name: change.name,
					register_number: change.register_number,
				})),
				timestamp: new Date().toISOString(),
			},
		})
		if (error) console.warn('[learner-identity-sync] transaction log not written:', error.message)
	}

	return { plan: context.plan, result }
}
