// Read-only RLS check. Not part of `npm test`.
//   node -r dotenv/config tests/live-rls-anon-probe.mjs
//
// The anon key ships in the browser bundle, so anyone on the internet holds
// it. This asks, table by table, how many rows that key can read. Any table
// with a non-zero count is readable by the whole internet unless RLS says
// otherwise. Only counts are requested (HEAD) — no row data is fetched, and
// nothing is written.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !service) {
	console.error('Supabase environment not loaded (run with: node -r dotenv/config ...)')
	process.exit(1)
}

const spec = await (await fetch(`${url}/rest/v1/`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })).json()
const relations = Object.keys(spec.definitions || {}).sort()

async function count(relation, key) {
	const res = await fetch(`${url}/rest/v1/${relation}?select=*`, {
		method: 'HEAD',
		headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' },
	})
	const total = (res.headers.get('content-range') || '').split('/')[1]
	return { status: res.status, total: total === undefined || total === '*' ? null : Number(total) }
}

const readable = []
const blocked = []
const failed = []
const CONCURRENCY = 8
for (let i = 0; i < relations.length; i += CONCURRENCY) {
	await Promise.all(
		relations.slice(i, i + CONCURRENCY).map(async (relation) => {
			const asAnon = await count(relation, anon)
			if (asAnon.status >= 400) return void failed.push({ relation, status: asAnon.status })
			if (!asAnon.total) return void blocked.push(relation)
			const asService = await count(relation, service)
			readable.push({ relation, anon: asAnon.total, all: asService.total })
		})
	)
}

readable.sort((a, b) => b.anon - a.anon)
console.log(`${relations.length} tables and views exposed through the API`)
console.log(`  anon key reads rows from: ${readable.length}`)
console.log(`  anon key reads nothing from: ${blocked.length}`)
console.log(`  anon key refused (401/403/other): ${failed.length}`)
if (readable.length) {
	console.log('\nReadable with the anon key (rows visible / rows in table):')
	for (const r of readable) console.log(`  ${r.relation.padEnd(46)} ${String(r.anon).padStart(7)} / ${r.all ?? '?'}`)
}
if (process.argv.includes('--all')) {
	console.log('\nNo rows visible to anon:\n  ' + blocked.sort().join(', '))
	if (failed.length) console.log('\nRefused:\n  ' + failed.map((f) => `${f.relation} (${f.status})`).join(', '))
}
