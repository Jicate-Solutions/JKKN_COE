/**
 * Learners who are no longer on the rolls, by register number.
 *
 * WHY THIS EXISTS
 * ---------------
 * Exam Registration, Exam Application and Final Registration Approval list
 * learners from the COE `exam_registrations` / backlog tables, which know
 * nothing about a learner leaving. A learner who discontinued after being
 * registered kept showing up on every one of those screens. Whether a learner
 * is on the rolls is MyJKKN's call (`lifecycle_status`), so this module asks
 * MyJKKN once, caches the answer process-wide, and hands the screens a set of
 * register numbers to leave out.
 *
 * WHO IS OFF THE ROLLS
 * --------------------
 * Only `inactive` and `exited`. Deliberately NOT hidden:
 *  - `graduated` - passed-out learners still write their arrears;
 *  - `withdrawal_pending` - still a learner until the withdrawal completes;
 *  - learners with no MyJKKN profile at all (new provisional admission numbers).
 * Hiding someone wrongly blocks an exam application, which is far worse than
 * showing someone who has left, so every doubt resolves to "visible".
 *
 * DUPLICATE PROFILES
 * ------------------
 * MyJKKN holds duplicate profiles: 25 register numbers carried by an
 * inactive/exited profile ALSO belong to an active one (verified 1 Oct 2026).
 * A register number is therefore off the rolls only when EVERY profile that
 * carries it is - which needs the full `lifecycle_status=all` sweep, not just
 * the cheap `inactive,exited` query.
 */

/** Lifecycle values that mean the learner has left */
export const OFF_ROLL_LIFECYCLE_STATUSES: readonly string[] = ['inactive', 'exited']

const TTL_MS = 10 * 60 * 1000   // a fresh answer is reused for 10 minutes
const PAGE_SIZE = 200           // the API caps pages at 200 regardless of `limit`
const PAGE_CONCURRENCY = 8
const MAX_PAGES = 400           // safety cap against a runaway sweep

/** Register-number fields a learner may be registered under in COE */
const ID_FIELDS = ['register_number', 'roll_number'] as const

const EMPTY: ReadonlySet<string> = new Set()

let cached: { offRoll: ReadonlySet<string>; builtAt: number } | null = null
let inflight: Promise<ReadonlySet<string>> | null = null

/** Tolerant register-number key: case and stray whitespace are ignored */
export function offRollKey(registerNumber: unknown): string {
	return (registerNumber ?? '').toString().trim().toUpperCase()
}

/** Whether the register number belongs to a learner who has left */
export function isOffRoll(offRoll: ReadonlySet<string>, registerNumber: unknown): boolean {
	if (offRoll.size === 0) return false
	const key = offRollKey(registerNumber)
	return key !== '' && offRoll.has(key)
}

/** One page of profiles (every lifecycle state), or null when the request failed */
async function fetchProfilePage(page: number): Promise<any[] | null> {
	const url = process.env.MYJKKN_API_URL || 'https://www.jkkn.ai/api'
	const key = process.env.MYJKKN_API_KEY || ''
	try {
		const resp = await fetch(
			`${url}/api-management/learners/profiles?lifecycle_status=all&limit=${PAGE_SIZE}&page=${page}`,
			{
				method: 'GET',
				headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' },
				cache: 'no-store',
			}
		)
		if (!resp.ok) return null
		const json = await resp.json()
		const rows = json?.data ?? json
		return Array.isArray(rows) ? rows : null
	} catch {
		return null
	}
}

/**
 * Sweep every profile and work out which register numbers are off the rolls.
 * Returns null when the sweep could not be completed - a partial answer could
 * miss the active twin of a duplicate profile and hide an active learner.
 */
async function buildOffRollSet(): Promise<ReadonlySet<string> | null> {
	if (!process.env.MYJKKN_API_KEY) return null

	const startedAt = Date.now()
	const off = new Set(OFF_ROLL_LIFECYCLE_STATUSES)
	// register number -> does any profile carrying it say "on the rolls"?
	const onRoll = new Map<string, boolean>()

	const absorb = (profiles: any[]) => {
		for (const profile of profiles) {
			const status = String(profile?.lifecycle_status || '').trim().toLowerCase()
			const profileOnRoll = !off.has(status)
			for (const field of ID_FIELDS) {
				const key = offRollKey(profile?.[field])
				if (key) onRoll.set(key, (onRoll.get(key) || false) || profileOnRoll)
			}
		}
	}

	// The endpoint reports no usable page count (and 500s past the last page),
	// so pages are requested in concurrent windows until a short page turns up.
	let done = false
	for (let start = 1; !done && start <= MAX_PAGES; start += PAGE_CONCURRENCY) {
		const pages = Array.from({ length: PAGE_CONCURRENCY }, (_, i) => start + i)
		const results = await Promise.all(pages.map(fetchProfilePage))

		for (let i = 0; i < results.length; i++) {
			let rows = results[i]
			if (rows === null) {
				// Retry once. Still failing with nothing after it = the end of the
				// data (the API 500s past the last page); with data after it = a
				// real gap, and a sweep with a gap is not trusted.
				rows = await fetchProfilePage(pages[i])
				if (rows === null) {
					const laterHasData = results.slice(i + 1).some(r => r !== null && r.length > 0)
					if (laterHasData) return null
					if (start === 1 && i === 0) return null   // could not read even page 1
					done = true
					break
				}
			}
			absorb(rows)
			if (rows.length < PAGE_SIZE) { done = true; break }
		}
	}

	const offRoll = new Set<string>()
	for (const [key, isOnRoll] of onRoll) if (!isOnRoll) offRoll.add(key)

	console.log(
		`[MyJKKN off-roll] ${offRoll.size} off-roll register numbers out of ${onRoll.size} in ${Date.now() - startedAt}ms`
	)
	return offRoll
}

function refresh(): Promise<ReadonlySet<string>> {
	if (inflight) return inflight
	inflight = buildOffRollSet()
		.then(result => {
			// A failed sweep keeps the last good answer; with none, nobody is hidden
			if (result) cached = { offRoll: result, builtAt: Date.now() }
			else console.warn('[MyJKKN off-roll] sweep failed - keeping the previous answer')
			return cached?.offRoll ?? EMPTY
		})
		.catch(e => {
			console.warn('[MyJKKN off-roll] sweep error:', e instanceof Error ? e.message : e)
			return cached?.offRoll ?? EMPTY
		})
		.finally(() => { inflight = null })
	return inflight
}

/**
 * Register numbers (trimmed, UPPER) of learners MyJKKN says have left.
 *
 * Built at most once per TTL per process. Once an answer exists it is served
 * immediately and refreshed in the background, so only the first request after
 * a restart waits for the sweep. Never throws: if MyJKKN cannot be read the set
 * is empty and every learner stays visible.
 */
export async function getOffRollRegisterNumbers(): Promise<ReadonlySet<string>> {
	if (cached) {
		if (Date.now() - cached.builtAt >= TTL_MS) void refresh()
		return cached.offRoll
	}
	return refresh()
}
