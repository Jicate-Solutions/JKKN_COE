// Generates lib/auth/resource-ownership.generated.ts.
//
//   node -r dotenv/config scripts/generate-resource-ownership.cjs
//
// Institution isolation by NAME (institutions_id=…) is not enough: a request
// can also reach a record by its own id — /api/thing/<id>, ?id=<id>,
// ?examination_session_id=<id> — and the handlers do not check which college
// that record belongs to. proxy.ts closes this by looking the record up and
// comparing its institution with the caller's. This script works out which
// table each id refers to:
//
//   OWNED_TABLES      tables that have an `id` and an institution column
//                     (read from the live schema)
//   REFERENCE_FIELDS  request fields that carry a record id, e.g.
//                     examination_session_id → examination_sessions
//   ROUTE_RECORDS     routes addressed by a record id (/x/[id] or ?id=), and
//                     the table the handler looks that id up in
//
// Re-run after adding a table, an id parameter or an [id] route.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const API = path.join(ROOT, 'app', 'api')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
	console.error('Supabase environment not loaded (run with: node -r dotenv/config ...)')
	process.exit(1)
}

// Request field → table whose `id` it holds. Only fields whose meaning is the
// same everywhere belong here. A value that matches no row is never refused,
// so a field that sometimes carries an id from elsewhere is harmless.
const FIELD_TABLES = {
	examination_session_id: 'examination_sessions',
	session_id: 'examination_sessions',
	previous_session_id: 'examination_sessions',
	new_session_id: 'examination_sessions',
	course_offering_id: 'course_offerings',
	course_id: 'courses',
	exam_registration_id: 'exam_registrations',
	exam_timetable_id: 'exam_timetables',
	timetable_id: 'exam_timetables',
	board_id: 'board',
	exam_room_id: 'exam_rooms',
	revaluation_registration_id: 'revaluation_registrations',
	revaluation_registration_ids: 'revaluation_registrations',
}

// Mirrors publicApiRoutes in proxy.ts: these authenticate another way.
const PUBLIC_PREFIXES = [
	'/api/auth', '/api/token', '/api/public', '/api/v1',
	'/api/examiner-portal', '/api/examiner/question-paper', '/api/cron',
]
// Institution column to compare, in order of preference.
const OWNER_COLUMNS = ['institutions_id', 'institution_id', 'institution_code']

function walk(dir, acc = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) walk(full, acc)
		else if (entry.name === 'route.ts') acc.push(full)
	}
	return acc
}

async function main() {
	const spec = await (await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json()
	const owned = {}
	for (const [table, def] of Object.entries(spec.definitions || {})) {
		const columns = Object.keys(def.properties || {})
		if (!columns.includes('id')) continue
		const owner = OWNER_COLUMNS.find((c) => columns.includes(c))
		// `institutions` owns itself; `users.institution_id` is the user's own link, not ownership of a record.
		if (owner && table !== 'institutions' && table !== 'users') owned[table] = owner
	}

	const fields = {}
	const droppedFields = []
	for (const [field, table] of Object.entries(FIELD_TABLES)) {
		if (owned[table]) fields[field] = table
		else droppedFields.push(`${field} → ${table}`)
	}

	const routes = []
	const ambiguous = []
	for (const file of walk(API)) {
		const route = '/api/' + path.relative(API, path.dirname(file)).split(path.sep).join('/')
		if (PUBLIC_PREFIXES.some((p) => route === p || route.startsWith(p + '/'))) continue
		const src = fs.readFileSync(file, 'utf8')
		const segments = route.split('/')
		const idSegment = segments.findIndex((s) => /^\[(id|.*[iI]d)\]$/.test(s))
		// The record id may also arrive as ?id= (DELETE) or as `id` in the body (PUT).
		const readsQueryId = /searchParams\.get\('id'\)/.test(src) || /\bbody\.id\b/.test(src)
		if (idSegment < 0 && !readsQueryId) continue

		// Which variables hold the id the ROUTE is addressed by? (Not ids the
		// handler picks up along the way from other fields.)
		const idVars = new Set(['params.id', 'body.id'])
		for (const seg of segments) {
			const m = /^\[(\w+)\]$/.exec(seg)
			if (m) { idVars.add(m[1]); idVars.add('params.' + m[1]) }
		}
		for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*[^\n;]*searchParams\.get\('id'\)/g)) idVars.add(m[1])
		for (const m of src.matchAll(/\{[^}]*\bid\s*:\s*(\w+)[^}]*\}\s*=\s*(?:await\s+)?(?:context\.)?params/g)) idVars.add(m[1])
		for (const m of src.matchAll(/\{[^}]*\bid\b[^}:]*\}\s*=\s*(?:await\s+)?(?:context\.)?params/g)) idVars.add('id')
		if (readsQueryId && /\bid\b\s*=\s*[^\n;]*searchParams\.get\('id'\)/.test(src)) idVars.add('id')

		// Tables the handler looks that id up in: .from('t') … .eq('id', <id variable>)
		const tables = new Set()
		for (const m of src.matchAll(/\.from\(\s*['"`](\w+)['"`]\s*\)((?:(?!\.from\()[\s\S]){0,600}?)\.eq\(\s*['"`]id['"`]\s*,\s*([\w.]+)/g)) {
			if (idVars.has(m[3])) tables.add(m[1])
		}
		const ownedTables = [...tables].filter((t) => owned[t])
		if (ownedTables.length === 0) continue
		if (ownedTables.length > 1) {
			ambiguous.push(`${route} (${ownedTables.join(', ')})`)
			continue
		}
		routes.push({
			pattern: segments.map((s) => (s.startsWith('[') ? '*' : s)).join('/'),
			table: ownedTables[0],
			segment: idSegment >= 0 ? idSegment : null,
			query: readsQueryId,
		})
	}
	routes.sort((a, b) => a.pattern.localeCompare(b.pattern))

	const q = (s) => `'${s}'`
	const out = []
	out.push('// GENERATED by scripts/generate-resource-ownership.cjs — do not edit by hand.')
	out.push('//')
	out.push('// Which table a record id in a request refers to, and which column of that')
	out.push('// table names the institution that owns the record. Used by proxy.ts to')
	out.push('// refuse a request for another institution\'s record.')
	out.push('')
	out.push("import type { OwnedTables, ReferenceFields, RouteRecord } from '@/lib/auth/resource-ownership'")
	out.push('')
	out.push('export const OWNED_TABLES: OwnedTables = {')
	for (const table of Object.keys(owned).sort()) out.push(`\t${table}: ${q(owned[table])},`)
	out.push('}')
	out.push('')
	out.push('export const REFERENCE_FIELDS: ReferenceFields = {')
	for (const field of Object.keys(fields)) out.push(`\t${field}: ${q(fields[field])},`)
	out.push('}')
	out.push('')
	out.push('export const ROUTE_RECORDS: readonly RouteRecord[] = [')
	for (const r of routes) out.push(`\t{ pattern: ${q(r.pattern)}, table: ${q(r.table)}, segment: ${r.segment}, query: ${r.query} },`)
	out.push(']')
	out.push('')
	fs.writeFileSync(path.join(ROOT, 'lib', 'auth', 'resource-ownership.generated.ts'), out.join('\n'))

	console.log(`tables with an owner column: ${Object.keys(owned).length}`)
	console.log(`reference fields: ${Object.keys(fields).length}${droppedFields.length ? ` (dropped, table has no owner column: ${droppedFields.join('; ')})` : ''}`)
	console.log(`routes addressed by record id: ${routes.length}`)
	if (ambiguous.length) {
		console.log(`not covered — the handler looks ids up in more than one owned table (${ambiguous.length}):`)
		for (const a of ambiguous) console.log('   ' + a)
	}
}
main().catch((e) => { console.error(e); process.exit(1) })
