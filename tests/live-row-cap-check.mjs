// Read-only check against the real database. Not part of `npm test`.
//   node -r dotenv/config tests/live-row-cap-check.mjs
//
// For each large relation: compares the exact row count with what a plain
// `select('id')` returns — once through the raw client (capped by PostgREST)
// and once through the paginating client used by getSupabaseServer().

import { createClient } from '@supabase/supabase-js'
import { createPaginatedFetch } from '../lib/supabase-paginated-fetch.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
	console.error('Supabase environment not loaded (run with: node -r dotenv/config ...)')
	process.exit(1)
}

const options = { auth: { persistSession: false } }
const raw = createClient(url, key, options)
const paged = createClient(url, key, { ...options, global: { fetch: createPaginatedFetch() } })

const relations = process.argv.slice(2).length
	? process.argv.slice(2)
	: ['exam_registrations', 'final_marks', 'internal_marks', 'marks_entry', 'exam_attendance', 'courses']

let failed = false
for (const relation of relations) {
	const column = relation.endsWith('_view') ? '*' : 'id'
	const { count, error: countError } = await raw.from(relation).select(column, { count: 'exact', head: true })
	if (countError) {
		console.log(`${relation}: count failed — ${countError.message}`)
		failed = true
		continue
	}

	const { data: capped } = await raw.from(relation).select(column)
	const started = Date.now()
	const { data, error } = await paged.from(relation).select(column)
	const ms = Date.now() - started
	if (error) {
		console.log(`${relation}: paged read failed — ${error.message}`)
		failed = true
		continue
	}

	const unique = column === 'id' ? new Set(data.map((r) => r.id)).size : data.length
	const ok = data.length === count && unique === data.length
	if (!ok) failed = true
	console.log(
		`${ok ? 'OK  ' : 'FAIL'} ${relation}: exact count ${count} | raw client ${capped?.length} | paginating client ${data.length} (${unique} unique) in ${ms} ms`
	)
}
process.exit(failed ? 1 : 0)
