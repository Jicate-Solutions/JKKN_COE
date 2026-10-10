/**
 * Makes PostgREST's row cap invisible to server-side Supabase queries.
 *
 * PostgREST returns at most `max-rows` (1000 on this project) per request, no
 * matter what the query asks for. `.range(0, 9999)` therefore yields 1000 rows
 * and so does a query with no limit at all — silently, with no error. Any read
 * that can match more than 1000 rows (a session's registrations, a
 * programme's marks, an export) comes back incomplete and nothing says so.
 *
 * Installed as the Supabase client's `fetch`, this wrapper notices a capped
 * response and pages through the rest, so the caller receives exactly what it
 * asked for:
 *   • `.range(from, to)` / `.limit(n)` wider than the cap → every row in that
 *     window, never more than requested.
 *   • no limit at all → every matching row, up to UNBOUNDED_MAX_ROWS.
 *   • anything at or under the cap (including hand-written 1000-row paging
 *     loops) → passed through untouched; a single-page read costs no extra
 *     request and its body is never parsed here.
 *
 * Paging needs a stable order or rows shift between pages (duplicates and
 * gaps). `id` is appended to the ORDER BY as a tiebreaker; relations without
 * an `id` column are remembered and paged in their own order.
 *
 * Not covered: RPC calls, single-object reads, CSV, HEAD/count requests and
 * writes — those go straight through.
 *
 * Set SUPABASE_AUTO_PAGINATE=off to restore the raw capped behaviour.
 */

/** The server-side cap. A request for more rows per page is ignored by PostgREST. */
export const SERVER_MAX_ROWS = 1000

/** Ceiling for queries that state no limit, so a runaway read cannot page forever. */
const UNBOUNDED_MAX_ROWS = Number(process.env.SUPABASE_AUTO_PAGINATE_MAX_ROWS) || 200_000

/** Pages requested at once. Each round trip costs 150–450 ms; walking them one by one stacks that up. */
const PAGE_CONCURRENCY = 4

/** Past this many rows a read is worth a log line: it is a candidate for server-side pagination. */
const LARGE_READ_ROWS = 10_000

type FetchLike = typeof fetch

// Relations (tables/views) known to have no `id` column to order by.
const relationsWithoutId = new Set<string>()

interface PageResult {
	rows: unknown[]
	/** Total from Content-Range when the caller asked for a count ("*" otherwise). */
	total: string
	response: Response
}

function isDisabled(): boolean {
	return (process.env.SUPABASE_AUTO_PAGINATE || '').toLowerCase() === 'off'
}

/** Rows in a PostgREST response, read from `Content-Range: 0-999/*` without touching the body. */
function rowsInContentRange(response: Response): number | null {
	const match = /^(\d+)-(\d+)\//.exec(response.headers.get('content-range') || '')
	if (!match) return null
	return Number(match[2]) - Number(match[1]) + 1
}

function totalInContentRange(response: Response): string {
	const header = response.headers.get('content-range') || ''
	const slash = header.lastIndexOf('/')
	return slash >= 0 ? header.slice(slash + 1) || '*' : '*'
}

/** `order` with `id` appended as the final tiebreaker (unless it already sorts by id). */
function withIdTiebreaker(order: string | null): string {
	if (!order) return 'id.asc'
	const sortsById = order.split(',').some((term) => term.trim().split('.')[0] === 'id')
	return sortsById ? order : `${order},id.asc`
}

/** True for PostgREST's "column … does not exist" answer to our `id` tiebreaker. */
async function isMissingIdColumn(response: Response): Promise<boolean> {
	if (response.status !== 400) return false
	const body = await response.clone().json().catch(() => null)
	return body?.code === '42703' && /\bid\b/.test(String(body?.message || ''))
}

export function createPaginatedFetch(baseFetch: FetchLike = fetch): FetchLike {
	return async function paginatedFetch(input, init) {
		const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
		if (method !== 'GET' || isDisabled()) return baseFetch(input, init)

		let url: URL
		try {
			url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
		} catch {
			return baseFetch(input, init)
		}

		const restIndex = url.pathname.indexOf('/rest/v1/')
		if (restIndex < 0) return baseFetch(input, init)
		const relation = url.pathname.slice(restIndex + '/rest/v1/'.length)
		if (!relation || relation.startsWith('rpc/')) return baseFetch(input, init)

		const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
		const accept = headers.get('accept') || ''
		// Single-object, CSV and EXPLAIN responses are not row arrays.
		if (accept.includes('vnd.pgrst.object') || accept.includes('text/csv') || accept.includes('vnd.pgrst.plan')) {
			return baseFetch(input, init)
		}

		const limitParam = url.searchParams.get('limit')
		const requestedLimit = limitParam === null ? null : Number(limitParam)
		if (requestedLimit !== null && (!Number.isFinite(requestedLimit) || requestedLimit <= SERVER_MAX_ROWS)) {
			// Within the cap: one request is the whole answer.
			return baseFetch(input, init)
		}

		// Wider than the cap, or unbounded. Send it as written first — almost
		// every such read still fits in one page, and then this is all it costs.
		const first = await baseFetch(input, init)
		if (!first.ok) return first
		const firstCount = rowsInContentRange(first)
		if (firstCount === null || firstCount < SERVER_MAX_ROWS) return first

		// The cap cut this response short. Page through the full window. The
		// capped body is not used (its order has no tiebreaker) — release it.
		first.body?.cancel().catch(() => {})
		const offset = Number(url.searchParams.get('offset')) || 0
		const wanted = requestedLimit ?? UNBOUNDED_MAX_ROWS
		const total = totalInContentRange(first)

		const pageHeaders = new Headers(headers)
		// The count (if any) is already known from the first response.
		const prefer = (pageHeaders.get('prefer') || '')
			.split(',')
			.map((p) => p.trim())
			.filter((p) => p && !p.startsWith('count='))
			.join(',')
		if (prefer) pageHeaders.set('prefer', prefer)
		else pageHeaders.delete('prefer')

		const fetchPage = async (pageIndex: number, useTiebreaker: boolean): Promise<PageResult> => {
			const pageOffset = offset + pageIndex * SERVER_MAX_ROWS
			const pageLimit = Math.min(SERVER_MAX_ROWS, wanted - pageIndex * SERVER_MAX_ROWS)
			const pageUrl = new URL(url.href)
			pageUrl.searchParams.set('offset', String(pageOffset))
			pageUrl.searchParams.set('limit', String(pageLimit))
			if (useTiebreaker) pageUrl.searchParams.set('order', withIdTiebreaker(url.searchParams.get('order')))

			const response = await baseFetch(pageUrl.href, { ...init, method: 'GET', headers: pageHeaders })
			if (!response.ok) return { rows: [], total, response }
			const rows = await response.json()
			return { rows: Array.isArray(rows) ? rows : [], total, response }
		}

		let useTiebreaker = !relationsWithoutId.has(relation)
		const rows: unknown[] = []
		const maxPages = Math.ceil(wanted / SERVER_MAX_ROWS)
		let complete = false

		for (let start = 0; start < maxPages && !complete; start += PAGE_CONCURRENCY) {
			const indexes = Array.from(
				{ length: Math.min(PAGE_CONCURRENCY, maxPages - start) },
				(_, i) => start + i
			)
			let batch = await Promise.all(indexes.map((i) => fetchPage(i, useTiebreaker)))

			// First batch only: the relation may have no `id` to break ties on.
			if (start === 0 && useTiebreaker && !batch[0].response.ok && (await isMissingIdColumn(batch[0].response))) {
				relationsWithoutId.add(relation)
				useTiebreaker = false
				console.warn(
					`[supabase] "${relation}" has no id column — paging ${url.searchParams.get('order') ? 'in its own order' : 'WITHOUT a stable order'}; add a unique .order() to the query`
				)
				batch = await Promise.all(indexes.map((i) => fetchPage(i, false)))
			}

			for (const page of batch) {
				// A failed page fails the whole read — never hand back a partial set.
				if (!page.response.ok) return page.response
				rows.push(...page.rows)
				if (page.rows.length < SERVER_MAX_ROWS) {
					complete = true
					break
				}
			}
		}

		if (!complete && requestedLimit === null) {
			console.error(
				`[supabase] "${relation}" read stopped at the ${UNBOUNDED_MAX_ROWS}-row safety ceiling — RESULT IS INCOMPLETE. Narrow the filters or page this query.`
			)
		} else if (!complete) {
			// Filled its own window exactly: either the caller is paging, or a
			// hard-coded ceiling just cut the result short.
			console.warn(
				`[supabase] "${relation}" read filled its ${requestedLimit}-row limit — more rows may match. If this is not one page of a paging loop, drop the limit.`
			)
		} else if (rows.length >= LARGE_READ_ROWS) {
			console.warn(
				`[supabase] "${relation}" read returned ${rows.length} rows in one call — consider server-side pagination or narrower columns`
			)
		}

		const merged = new Headers(first.headers)
		merged.delete('content-length')
		merged.delete('content-encoding')
		merged.set(
			'content-range',
			rows.length > 0 ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`
		)
		return new Response(JSON.stringify(rows), { status: 200, statusText: 'OK', headers: merged })
	}
}
