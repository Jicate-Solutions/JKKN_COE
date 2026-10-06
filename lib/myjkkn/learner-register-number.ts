import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Writes CoE-issued register numbers back to MyJKKN `learners_profiles`.
 *
 * MyJKKN has no API for updating a learner profile, so this talks to the
 * MyJKKN Supabase project directly. Server only — import it from API routes,
 * never from client components; the env vars carry no NEXT_PUBLIC_ prefix.
 *
 *   MYJKKN_SUPABASE_URL
 *   MYJKKN_SUPABASE_SERVICE_ROLE_KEY
 *
 * When either is missing the write-back is skipped and reported, so register
 * number generation in COE keeps working.
 */

export interface ProfileRegisterNumberChange {
	learnerId: string
	/** Value the profile is expected to hold now (placeholder or previous number). */
	from: string
	to: string
}

export interface ProfileSyncResult {
	configured: boolean
	updated: number
	/** Learners whose profile now holds the new number. */
	updatedIds: string[]
	/** Learners whose profile held something other than `from` and was left alone. */
	unchanged: string[]
	errors: string[]
}

let client: SupabaseClient | null = null

function getMyjkknAdmin(): SupabaseClient | null {
	const url = process.env.MYJKKN_SUPABASE_URL
	const key = process.env.MYJKKN_SUPABASE_SERVICE_ROLE_KEY
	if (!url || !key) return null
	if (!client) {
		client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
	}
	return client
}

const CONCURRENCY = 8

/**
 * Sets learners_profiles.register_number for each learner.
 *
 * Guarded on the current value: a profile is only updated while it is empty
 * or still holds `from`, so a number someone changed in MyJKKN meanwhile is
 * never overwritten.
 */
export async function updateMyjkknRegisterNumbers(
	changes: ProfileRegisterNumberChange[]
): Promise<ProfileSyncResult> {
	const result: ProfileSyncResult = { configured: false, updated: 0, updatedIds: [], unchanged: [], errors: [] }
	const supabase = getMyjkknAdmin()
	if (!supabase) return result
	result.configured = true

	const work = changes.filter(c => c.learnerId && c.to && c.from !== c.to)
	const now = new Date().toISOString()

	// Read the current values first and compare here. The update itself filters
	// on id only — a register_number filter in the UPDATE's WHERE clause fails on
	// MyJKKN with "column learners_profiles.register_number does not exist".
	const current = new Map<string, string>()
	const ids = work.map(c => c.learnerId)
	for (let i = 0; i < ids.length; i += 150) {
		const { data, error } = await supabase
			.from('learners_profiles')
			.select('id, register_number')
			.in('id', ids.slice(i, i + 150))
		if (error) {
			result.errors.push(`read: ${error.message}`)
			return result
		}
		for (const row of data || []) current.set(row.id, String(row.register_number ?? '').trim())
	}

	const eligible = work.filter(change => {
		if (!current.has(change.learnerId)) {
			result.unchanged.push(change.learnerId)
			return false
		}
		const held = current.get(change.learnerId) || ''
		const ok = held === '' || held === change.from.trim()
		if (!ok) result.unchanged.push(change.learnerId)
		return ok
	})

	for (let i = 0; i < eligible.length; i += CONCURRENCY) {
		await Promise.all(
			eligible.slice(i, i + CONCURRENCY).map(async change => {
				const { data, error } = await supabase
					.from('learners_profiles')
					.update({ register_number: change.to, updated_at: now })
					.eq('id', change.learnerId)
					.select('id')
				if (error) {
					result.errors.push(error.message)
					return
				}
				if (data && data.length > 0) {
					result.updated += data.length
					result.updatedIds.push(change.learnerId)
				} else result.unchanged.push(change.learnerId)
			})
		)
	}

	result.errors = [...new Set(result.errors)]
	return result
}

export interface RegisterNumberHolder {
	id: string
	name: string
	register_number: string
}

/**
 * Profiles that already hold any of these register numbers, across every
 * MyJKKN institution. Returns null when MyJKKN is not configured.
 */
export async function findMyjkknRegisterNumberHolders(numbers: string[]): Promise<RegisterNumberHolder[] | null> {
	const supabase = getMyjkknAdmin()
	if (!supabase) return null

	// .in() values travel in the query string; chunk so the URL is not truncated.
	const holders: RegisterNumberHolder[] = []
	for (let i = 0; i < numbers.length; i += 150) {
		const { data, error } = await supabase
			.from('learners_profiles')
			.select('id, first_name, last_name, register_number')
			.in('register_number', numbers.slice(i, i + 150))
		if (error) throw new Error(`MyJKKN lookup failed: ${error.message}`)
		for (const row of data || []) {
			holders.push({
				id: row.id,
				name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
				register_number: row.register_number,
			})
		}
	}
	return holders
}

export interface MyjkknLearnerIdentity {
	id: string
	first_name: string | null
	last_name: string | null
	roll_number: string | null
	register_number: string | null
}

/**
 * Name and numbers MyJKKN holds for each learner id, keyed by id. Learners
 * with no profile are simply absent. Returns null when MyJKKN is not configured.
 */
export async function fetchMyjkknLearnerIdentities(ids: string[]): Promise<Map<string, MyjkknLearnerIdentity> | null> {
	const supabase = getMyjkknAdmin()
	if (!supabase) return null

	// .in() values travel in the query string, hence the chunks; a few thousand
	// learners is ~20 of them, so they go out a handful at a time.
	const chunks: string[][] = []
	for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150))

	const identities = new Map<string, MyjkknLearnerIdentity>()
	for (let i = 0; i < chunks.length; i += CONCURRENCY) {
		const results = await Promise.all(
			chunks.slice(i, i + CONCURRENCY).map(chunk =>
				supabase
					.from('learners_profiles')
					.select('id, first_name, last_name, roll_number, register_number')
					.in('id', chunk)
			)
		)
		for (const { data, error } of results) {
			if (error) throw new Error(`MyJKKN lookup failed: ${error.message}`)
			for (const row of data || []) identities.set(row.id, row as MyjkknLearnerIdentity)
		}
	}
	return identities
}

/** One-line summary for the API response message. */
export function describeProfileSync(result: ProfileSyncResult): string {
	if (!result.configured) return 'MyJKKN profiles not updated (MYJKKN_SUPABASE_* not configured).'
	const parts = [`MyJKKN profiles updated: ${result.updated}`]
	if (result.unchanged.length) parts.push(`${result.unchanged.length} left unchanged (number differs in MyJKKN)`)
	if (result.errors.length) parts.push(`${result.errors.length} error(s) — see server log`)
	return `${parts.join(', ')}.`
}
