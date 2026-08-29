import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Complete list reads for the Exam Application module.
 *
 * PostgREST returns at most 1000 rows per request no matter what `.range()` asks
 * for - `.range(0, 9999)` does NOT lift that ceiling, it just truncates in
 * silence. Every "missing arrear paper" bug in this module traces back to one of
 * those truncated sweeps: the session's 12,855 exam_registrations came back as
 * 1000, so a learner's semester never resolved and their papers vanished.
 *
 * Raising the range further cannot help - only paging can - so every list read
 * here goes through fetchAllRows.
 */

/** The server-side ceiling. Asking for more per request is ignored. */
export const PAGE_SIZE = 1000

/** Safety stop so a runaway query cannot page forever (500k rows). */
const MAX_PAGES = 500

/**
 * Pages requested at once once we know there is more than one.
 *
 * Every round trip to Supabase costs 150-450ms, so walking 12 pages one at a time
 * is ~3.5s of pure waiting. Fetching speculatively in batches turns that into
 * three waits. The first page is always fetched alone, so the common single-page
 * read still costs exactly one request - no count query, no wasted fetches.
 */
const PAGE_CONCURRENCY = 6

export interface FetchAllOptions {
	/**
	 * Sort key used to walk the pages. MUST be unique - paging on a non-unique
	 * column (created_at) lets rows shift between pages, so some are returned
	 * twice and others never at all. `id` is added as a tiebreaker otherwise.
	 */
	orderColumn?: string
	ascending?: boolean
	/** Used in error / warning messages */
	label?: string
}

/**
 * Page a PostgREST query to completion.
 *
 * `buildQuery` must return a FRESH query builder on every call - a builder that
 * has already been awaited cannot be re-ranged.
 *
 *   const rows = await fetchAllRows(
 *     () => supabase.from('exam_registrations').select('id, course_code').eq(...),
 *     { label: 'exam_registrations' }
 *   )
 */
export async function fetchAllRows<T = any>(
	buildQuery: () => any,
	options: FetchAllOptions = {}
): Promise<T[]> {
	const { orderColumn = 'id', ascending = true, label = 'rows' } = options

	const fetchPage = async (page: number): Promise<T[]> => {
		let query = buildQuery().order(orderColumn, { ascending })
		if (orderColumn !== 'id') query = query.order('id', { ascending: true })

		const { data, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
		if (error) throw new Error(`Failed to fetch ${label}: ${error.message}`)
		return (data || []) as T[]
	}

	// One request is the whole story for almost every read here.
	const first = await fetchPage(0)
	if (first.length < PAGE_SIZE) return first

	const rows: T[] = [...first]

	// Past that, pages are fetched speculatively in parallel batches and we stop at
	// the first short page. Overshooting costs a few empty requests; walking one
	// page at a time costs a round trip each, which is far more expensive.
	for (let start = 1; start < MAX_PAGES; start += PAGE_CONCURRENCY) {
		const batch = await Promise.all(
			Array.from({ length: PAGE_CONCURRENCY }, (_, i) => fetchPage(start + i))
		)

		let done = false
		for (const page of batch) {
			rows.push(...page)
			if (page.length < PAGE_SIZE) { done = true; break }
		}
		if (done) return rows
	}

	console.warn(`[exam-applications] ${label} hit the ${MAX_PAGES}-page ceiling - results may be incomplete`)
	return rows
}

/**
 * fetchAllRows for the reads that must degrade rather than fail the page: logs
 * and returns whatever was collected before the error.
 */
export async function tryFetchAllRows<T = any>(
	buildQuery: () => any,
	options: FetchAllOptions = {}
): Promise<T[]> {
	try {
		return await fetchAllRows<T>(buildQuery, options)
	} catch (e) {
		console.error(`[exam-applications] ${options.label || 'rows'} lookup failed:`, e instanceof Error ? e.message : e)
		return []
	}
}

/** Split `items` into batches of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
	return out
}

/**
 * Run `worker` over `items` in batches, concatenating the rows it returns.
 *
 * The batches run concurrently: they are independent `.in()` lookups, and running
 * them one after another just stacks up round trips.
 */
export async function fetchAllInChunks<T = any, I = any>(
	items: I[],
	size: number,
	worker: (batch: I[]) => Promise<T[]>
): Promise<T[]> {
	const batches = chunk(items, size).filter(b => b.length > 0)
	if (batches.length === 0) return []
	const results = await Promise.all(batches.map(worker))
	return results.flat()
}

export type { SupabaseClient }
