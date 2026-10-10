// Run with:  npm test   (node --test, Node 23.6+ strips the TypeScript types)
//
// Verifies that server-side Supabase reads are complete past PostgREST's
// 1000-row cap: rows beyond the first 1,000 stay reachable, filters apply to
// the whole dataset, an explicit limit is never exceeded, and a failed page
// never yields a silently partial result.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPaginatedFetch, SERVER_MAX_ROWS } from '../lib/supabase-paginated-fetch.ts'

const BASE = 'https://example.supabase.co/rest/v1'

/**
 * A stand-in for PostgREST: serves `tables[relation]`, honours `offset`,
 * `limit`, `order=id.asc|desc` and one `institution=eq.X` filter, and — like
 * the real thing — never returns more than SERVER_MAX_ROWS rows per request.
 */
function fakePostgrest(tables, { failOnOffset = null } = {}) {
	const calls = []
	const fetchImpl = async (input, init = {}) => {
		const url = new URL(typeof input === 'string' ? input : input.url)
		calls.push({ url, method: init.method || 'GET' })
		const relation = url.pathname.split('/rest/v1/')[1]
		const table = tables[relation]
		if (!table) return json({ message: 'not found' }, 404)

		const order = url.searchParams.get('order') || ''
		if (table.noId && order.split(',').some((t) => t.startsWith('id.'))) {
			return json({ code: '42703', message: `column ${relation}.id does not exist` }, 400)
		}

		let rows = table.rows
		const institution = url.searchParams.get('institution')
		if (institution) rows = rows.filter((r) => `eq.${r.institution}` === institution)
		if (order.startsWith('id.desc')) rows = [...rows].reverse()

		const offset = Number(url.searchParams.get('offset')) || 0
		if (failOnOffset !== null && offset === failOnOffset) return json({ message: 'boom' }, 500)

		const asked = url.searchParams.get('limit')
		const limit = Math.min(asked === null ? Infinity : Number(asked), SERVER_MAX_ROWS)
		const page = rows.slice(offset, offset + limit)
		const wantsCount = new Headers(init.headers).get('prefer')?.includes('count=exact')
		const range = page.length ? `${offset}-${offset + page.length - 1}` : '*'
		return json(page, 200, { 'content-range': `${range}/${wantsCount ? rows.length : '*'}` })
	}
	return { fetchImpl, calls }
}

function json(body, status, headers = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers },
	})
}

const makeRows = (n) =>
	Array.from({ length: n }, (_, i) => ({ id: i + 1, institution: i % 2 === 0 ? 'A' : 'B' }))

const ids = (rows) => rows.map((r) => r.id)

test('an unbounded read returns every row past the 1000-row cap, once each', async () => {
	const { fetchImpl } = fakePostgrest({ exam_registrations: { rows: makeRows(2500) } })
	const res = await createPaginatedFetch(fetchImpl)(`${BASE}/exam_registrations?select=*`)
	const rows = await res.json()

	assert.equal(rows.length, 2500)
	assert.equal(new Set(ids(rows)).size, 2500, 'no duplicates')
	assert.deepEqual(ids(rows), ids(makeRows(2500)), 'stable id order across pages')
	assert.equal(res.headers.get('content-range'), '0-2499/*')
})

test('a filter applies to the whole dataset, not just the first 1000 rows', async () => {
	const { fetchImpl } = fakePostgrest({ final_marks: { rows: makeRows(5000) } })
	const res = await createPaginatedFetch(fetchImpl)(`${BASE}/final_marks?select=*&institution=eq.B`)
	const rows = await res.json()

	assert.equal(rows.length, 2500)
	assert.ok(rows.every((r) => r.institution === 'B'), 'only the filtered institution')
	assert.equal(rows.at(-1).id, 5000, 'the last matching row (row 5000) is included')
})

test('an explicit limit wider than the cap is filled, and never exceeded', async () => {
	const { fetchImpl } = fakePostgrest({ exam_registrations: { rows: makeRows(12855) } })
	const res = await createPaginatedFetch(fetchImpl)(
		`${BASE}/exam_registrations?select=*&offset=0&limit=5000`
	)
	const rows = await res.json()

	assert.equal(rows.length, 5000)
	assert.equal(new Set(ids(rows)).size, 5000)
})

test('a window that starts past row 1000 returns exactly that window', async () => {
	const { fetchImpl } = fakePostgrest({ exam_registrations: { rows: makeRows(12855) } })
	const res = await createPaginatedFetch(fetchImpl)(
		`${BASE}/exam_registrations?select=*&offset=3000&limit=2500`
	)
	const rows = await res.json()

	assert.deepEqual([rows[0].id, rows.at(-1).id, rows.length], [3001, 5500, 2500])
})

test('a 1000-row page of a hand-written paging loop passes straight through', async () => {
	const { fetchImpl, calls } = fakePostgrest({ exam_registrations: { rows: makeRows(5000) } })
	const res = await createPaginatedFetch(fetchImpl)(
		`${BASE}/exam_registrations?select=*&offset=1000&limit=1000`
	)
	const rows = await res.json()

	assert.equal(calls.length, 1, 'one upstream request')
	assert.deepEqual([rows[0].id, rows.length], [1001, 1000])
})

test('a read that fits in one page costs one request', async () => {
	const { fetchImpl, calls } = fakePostgrest({ institutions: { rows: makeRows(7) } })
	const res = await createPaginatedFetch(fetchImpl)(`${BASE}/institutions?select=*`)

	assert.equal((await res.json()).length, 7)
	assert.equal(calls.length, 1)
})

test('exactly 1000 matching rows are returned without loss or duplication', async () => {
	const { fetchImpl } = fakePostgrest({ courses: { rows: makeRows(1000) } })
	const rows = await (await createPaginatedFetch(fetchImpl)(`${BASE}/courses?select=*`)).json()

	assert.equal(rows.length, 1000)
	assert.equal(new Set(ids(rows)).size, 1000)
})

test('an existing ORDER BY is kept and id is only added as the tiebreaker', async () => {
	const { fetchImpl, calls } = fakePostgrest({ exam_registrations: { rows: makeRows(2200) } })
	await createPaginatedFetch(fetchImpl)(`${BASE}/exam_registrations?select=*&order=created_at.desc`)

	const paged = calls.filter((c) => c.url.searchParams.has('offset'))
	assert.ok(paged.length >= 3)
	assert.ok(paged.every((c) => c.url.searchParams.get('order') === 'created_at.desc,id.asc'))
})

test('a relation without an id column is still read completely', async () => {
	const { fetchImpl } = fakePostgrest({ results_view: { rows: makeRows(3100), noId: true } })
	const rows = await (await createPaginatedFetch(fetchImpl)(`${BASE}/results_view?select=*`)).json()

	assert.equal(rows.length, 3100)
	assert.equal(new Set(ids(rows)).size, 3100)
})

test('a failed page fails the read instead of returning a partial result', async () => {
	const { fetchImpl } = fakePostgrest(
		{ exam_registrations: { rows: makeRows(4000) } },
		{ failOnOffset: 2000 }
	)
	const res = await createPaginatedFetch(fetchImpl)(`${BASE}/exam_registrations?select=*`)

	assert.equal(res.ok, false)
	assert.equal(res.status, 500)
})

test('the exact count survives pagination', async () => {
	const { fetchImpl } = fakePostgrest({ exam_registrations: { rows: makeRows(2600) } })
	const res = await createPaginatedFetch(fetchImpl)(`${BASE}/exam_registrations?select=*`, {
		headers: { prefer: 'count=exact' },
	})

	assert.equal((await res.json()).length, 2600)
	assert.equal(res.headers.get('content-range'), '0-2599/2600')
})

test('writes, RPC calls and single-object reads are not touched', async () => {
	const { fetchImpl, calls } = fakePostgrest({ exam_registrations: { rows: makeRows(3000) } })
	const paginated = createPaginatedFetch(fetchImpl)

	await paginated(`${BASE}/exam_registrations?select=*`, { method: 'POST', body: '{}' })
	await paginated(`${BASE}/rpc/some_function?select=*`)
	await paginated(`${BASE}/exam_registrations?select=*`, {
		headers: { accept: 'application/vnd.pgrst.object+json' },
	})

	assert.equal(calls.length, 3, 'each went upstream exactly once')
})
