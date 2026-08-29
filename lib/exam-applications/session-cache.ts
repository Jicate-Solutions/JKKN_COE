/**
 * Short-lived in-process cache for session-wide reads.
 *
 * The Arrear tab applies its programme / semester filters in memory, so every
 * filter change re-reads the same institution-wide rows - ~11k regular
 * registrations and the whole offer list - just to derive the same two maps. That
 * is the single most expensive thing the screen does, and none of it changes while
 * the operator is working: the offer list is maintained on the Course Offerings
 * screen, and regular registrations are written by the Exam Registration module.
 *
 * ONLY cache data this screen does not itself write. Backlogs and arrear
 * registrations are deliberately NOT cached: applying mutates them, and a stale
 * badge would misreport what is left to do.
 *
 * The TTL is deliberately short. A new course offering added in another tab shows
 * up within it, which is what makes this safe to leave on.
 */

const TTL_MS = 30_000

interface Entry {
	expires: number
	value: Promise<any>
}

const entries = new Map<string, Entry>()

/**
 * Resolve `key` from cache, or run `load` and remember it for TTL_MS.
 *
 * The PROMISE is cached, not the resolved value, so N concurrent requests for the
 * same key share one round trip instead of racing to fill the cache. A rejected
 * load is evicted immediately so a transient failure is never cached.
 */
export function cachedSession<T>(key: string, load: () => Promise<T>): Promise<T> {
	const now = Date.now()
	const hit = entries.get(key)
	if (hit && hit.expires > now) return hit.value as Promise<T>

	const value = load().catch(e => {
		entries.delete(key)
		throw e
	})
	entries.set(key, { expires: now + TTL_MS, value })

	// Opportunistic sweep - this map only ever holds a handful of sessions.
	if (entries.size > 32) {
		for (const [k, entry] of entries) if (entry.expires <= now) entries.delete(k)
	}

	return value
}
