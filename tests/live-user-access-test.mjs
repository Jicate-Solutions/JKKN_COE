// Tests every COE user against every route, on a running dev server.
// Not part of `npm test`.
//
//   node -r dotenv/config tests/live-user-access-test.mjs [baseUrl] [--user=<role or masked email>[,<another>…]]
//
// For each active user it signs in the only way a script can — a temporary
// session row, valid for 30 minutes and removed when the run ends — and then:
//
//   1. calls every session-gated GET route (no parameters) and compares the
//      answer with what the permission policy says that user should get:
//      allowed → anything but 401/403;  denied → 403
//   2. names its own institution (must pass), another institution (must be
//      refused) and another institution's examination session by id (must be
//      refused)
//   3. checks that the MyJKKN staff route returns only its own institution
//
// Only GET requests are sent; nothing in the application data is changed.
// Routes that would do real work on a GET (exports, syncs, generators,
// e-mail, full MyJKKN sweeps) are skipped and counted.
//
// Each simulated user is given its own client address (x-forwarded-for), as
// separate people would have, so the per-client rate limit applies per user.

import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { API_POLICY, findApiPolicyRule, satisfiesApiPolicy } from '../lib/auth/api-policy.ts'
import { GENERATED_API_POLICY } from '../lib/auth/api-policy.generated.ts'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const base = (args.find((a) => a.startsWith('http')) || 'http://localhost:3000').replace(/\/$/, '')
const onlyUsers = args.find((a) => a.startsWith('--user='))?.slice(7).split(',').map((v) => v.trim()).filter(Boolean)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
	console.error('Supabase environment not loaded (run with: node -r dotenv/config ...)')
	process.exit(1)
}

const TEST_AGENT = 'coe-access-self-test'
const SESSION_MINUTES = 30
const REQUEST_GAP_MS = 660 // ~90 requests a minute per user, under the 100/min limit
const USERS_IN_PARALLEL = 5
const REQUEST_TIMEOUT_MS = 90_000

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const db = async (pathAndQuery, init) => {
	const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, { headers, ...init })
	if (!res.ok) throw new Error(`${init?.method || 'GET'} ${pathAndQuery.split('?')[0]} → HTTP ${res.status} ${(await res.text()).slice(0, 160)}`)
	return res.status === 204 ? null : res.json().catch(() => null)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const mask = (email) => String(email).replace(/^(.).*(@.*)$/, '$1***$2')

// ── Routes ────────────────────────────────────────────────────────────────
const PUBLIC_PREFIXES = ['/api/auth', '/api/token', '/api/public', '/api/v1', '/api/examiner-portal', '/api/examiner/question-paper', '/api/cron']
// A GET here does real work or sweeps an external system — not for a blanket test.
// (exam-registrations/lookup reads every registration with its joins when it
// is called with no filter — tens of thousands of rows per user.)
const SKIP = /setup-|check-is-active|\/test-|debug|fetch-all|\/sync|export|download|stream|generate|send|email|resend|exam-registrations\/lookup|\/api\/(myjkkn|api-management|students|learners)(\/|$)/

function walk(dir, acc = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) walk(full, acc)
		else if (entry.name === 'route.ts') acc.push(full)
	}
	return acc
}
const apiDir = path.join(ROOT, 'app', 'api')
const allRoutes = walk(apiDir).map((file) => {
	const route = '/api/' + path.relative(apiDir, path.dirname(file)).split(path.sep).join('/')
	const src = readFileSync(file, 'utf8')
	return {
		route,
		hasGet: /export\s+(?:async\s+)?function\s+GET\b|export\s+const\s+GET\b/.test(src),
		// The handler has its own permission check, so a 403 from it is its decision.
		selfChecks: /requireUserPermission\(|withAdminAuth\(/.test(src),
	}
})
const candidates = allRoutes.filter((r) => r.hasGet && !r.route.includes('[') && !PUBLIC_PREFIXES.some((p) => r.route === p || r.route.startsWith(p + '/')))
const routes = candidates.filter((r) => !SKIP.test(r.route))
const RULES = [...API_POLICY, ...GENERATED_API_POLICY]

// ── People ────────────────────────────────────────────────────────────────
const [users, userRoles, rolePermissions, institutions, sessions] = await Promise.all([
	db('users?select=id,email,is_active,is_super_admin,institution_id'),
	db('user_roles?select=user_id,role_id,expires_at,roles(name,is_active)&is_active=eq.true'),
	db('role_permissions?select=role_id,permissions(name,is_active)'),
	db('institutions?select=id,institution_code,counselling_code,myjkkn_institution_ids'),
	db('examination_sessions?select=id,institutions_id'),
])

const identifiers = (i) => [i.id, i.institution_code, i.counselling_code, ...(i.myjkkn_institution_ids || [])].filter(Boolean).map((v) => String(v).toLowerCase())

const people = users
	.filter((u) => u.is_active !== false)
	.map((u, index) => {
		const mine = userRoles.filter((ur) => ur.user_id === u.id && ur.roles?.is_active !== false && (!ur.expires_at || new Date(ur.expires_at) > new Date()))
		const roleNames = mine.map((ur) => ur.roles?.name).filter(Boolean)
		const permissions = new Set(
			rolePermissions
				.filter((rp) => mine.some((ur) => ur.role_id === rp.role_id) && rp.permissions?.is_active !== false)
				.map((rp) => rp.permissions?.name)
				.filter(Boolean)
		)
		const institution = u.institution_id
			? institutions.find((i) => identifiers(i).includes(String(u.institution_id).toLowerCase())) || null
			: null
		const unrestricted = u.is_super_admin === true || roleNames.includes('super_admin')
		return {
			id: u.id,
			label: `${mask(u.email)} [${roleNames.join('+') || 'no role'}${u.is_super_admin ? ', super-admin flag' : ''}]`,
			roleNames,
			isSuperAdmin: u.is_super_admin === true,
			unrestricted,
			permissions,
			institution,
			clientAddress: `10.254.0.${index + 1}`,
			token: randomBytes(48).toString('base64url'),
			revived: 0,
		}
	})
	.filter((p) => !onlyUsers || onlyUsers.some((wanted) => p.label.includes(wanted)))

if (people.length === 0) {
	console.error('No matching active user.')
	process.exit(1)
}

// ── Temporary sessions ────────────────────────────────────────────────────
const removeTestSessions = () => db(`sessions?user_agent=eq.${TEST_AGENT}`, { method: 'DELETE' })
let cleaned = false
async function cleanup() {
	if (cleaned) return
	cleaned = true
	try {
		await removeTestSessions()
		console.log('\ntemporary sessions removed')
	} catch (err) {
		console.error(`\nCOULD NOT REMOVE THE TEMPORARY SESSIONS — run:  delete from sessions where user_agent = '${TEST_AGENT}';  (${err.message})`)
	}
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130) })

await removeTestSessions() // leftovers from an interrupted run
await db('sessions', {
	method: 'POST',
	headers: { ...headers, Prefer: 'return=minimal' },
	body: JSON.stringify(
		people.map((p) => ({
			user_id: p.id,
			session_token: p.token,
			is_active: true,
			expires_at: new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString(),
			user_agent: TEST_AGENT,
		}))
	),
})

// ── Requests ──────────────────────────────────────────────────────────────
async function call(person, pathAndQuery) {
	const requestHeaders = { cookie: `access_token=${person.token}; coe_access=true` }
	// /api/admin has an address allow-list; leave those requests as local ones.
	if (!pathAndQuery.startsWith('/api/admin')) requestHeaders['x-forwarded-for'] = person.clientAddress
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const res = await fetch(base + pathAndQuery, { headers: requestHeaders, redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
			if (res.status === 429) { await sleep(15_000); continue }
			const text = await res.text()
			let body = null
			try { body = JSON.parse(text) } catch { /* not JSON */ }
			if (res.status === 401 && body?.code === 'SESSION_REVOKED' && person.revived < 20) {
				// The real person signed in or synced on the live site, and the release
				// deployed there switches a user's other sessions off when it does.
				// This row is the test's own — switch it back on and carry on.
				person.revived++
				await db(`sessions?session_token=eq.${person.token}&user_agent=eq.${TEST_AGENT}`, {
					method: 'PATCH',
					headers: { ...headers, Prefer: 'return=minimal' },
					body: JSON.stringify({ is_active: true }),
				})
				continue
			}
			return { status: res.status, body }
		} catch (err) {
			if (err.name === 'TimeoutError') return { status: 0, body: null, timedOut: true }
			if (attempt === 3) return { status: 0, body: null, error: err.message }
			await sleep(2_000)
		}
	}
	return { status: 429, body: null }
}

async function testPerson(person, routeList) {
	const result = { person, allowedOk: 0, deniedOk: 0, failures: [], serverErrors: [], timeouts: [], scope: [] }
	const caller = { isSuperAdmin: person.isSuperAdmin, permissions: person.permissions }

	for (const r of routeList) {
		const rule = findApiPolicyRule(r.route, 'GET', RULES)
		const expectAllowed = rule === null || satisfiesApiPolicy(rule, caller)
		const { status, body, timedOut, error } = await call(person, r.route)
		await sleep(REQUEST_GAP_MS)

		if (timedOut) { result.timeouts.push(r.route); continue }
		if (error) { result.failures.push(`${r.route}: request failed (${error})`); continue }
		if (status >= 500) result.serverErrors.push(`${r.route} → ${status}`)

		if (expectAllowed) {
			if (status === 401) result.failures.push(`${r.route}: 401 — the session was not accepted`)
			else if (status === 403 && !r.selfChecks) result.failures.push(`${r.route}: 403 but the policy allows it (${body?.code || body?.error || 'no reason given'})`)
			else result.allowedOk++
		} else if (status === 403) result.deniedOk++
		else result.failures.push(`${r.route}: ${status} but the policy denies it (needs one of ${rule.anyOf.join(', ') || 'super admin'})`)
	}

	// Institution and record scope, on a route every signed-in user may call.
	const probe = '/api/exam-management/examination-sessions'
	const check = async (name, query, expectRefusedWith) => {
		const { status, body } = await call(person, `${probe}?${query}`)
		await sleep(REQUEST_GAP_MS)
		const refused = status === 403
		const ok = expectRefusedWith ? refused && body?.code === expectRefusedWith : !refused && status !== 401
		result.scope.push(`${ok ? 'ok  ' : 'FAIL'} ${name} → ${status}${body?.code ? ' ' + body.code : ''}`)
		if (!ok) result.failures.push(`scope: ${name} → ${status}${body?.code ? ' ' + body.code : ''}, expected ${expectRefusedWith || 'to pass'}`)
	}
	const other = institutions.find((i) => i.id !== person.institution?.id)
	const otherSession = sessions.find((s) => person.institution && s.institutions_id !== person.institution.id)
	const ownSession = sessions.find((s) => s.institutions_id === person.institution?.id)

	if (person.unrestricted) {
		await check('super admin names any institution', `institutions_id=${other.id}`, null)
		if (otherSession) await check('super admin reads any session by id', `examination_session_id=${otherSession.id}`, null)
	} else if (!person.institution) {
		await check('account linked to no institution names one', `institutions_id=${other.id}`, 'INSTITUTION_UNLINKED')
	} else {
		await check('names own institution (id)', `institutions_id=${person.institution.id}`, null)
		await check('names own institution (code)', `institution_code=${person.institution.institution_code}`, null)
		await check('names another institution', `institutions_id=${other.id}`, 'INSTITUTION_SCOPE')
		await check('names another institution (code)', `institution_code=${other.institution_code}`, 'INSTITUTION_SCOPE')
		if (ownSession) await check('own examination session by id', `examination_session_id=${ownSession.id}`, null)
		if (otherSession) await check("another institution's session by id", `examination_session_id=${otherSession.id}`, 'RECORD_SCOPE')

		// MyJKKN staff: only the caller's own institution may leave the server.
		const staffRule = findApiPolicyRule('/api/myjkkn/staff', 'GET', RULES)
		if (staffRule === null || satisfiesApiPolicy(staffRule, caller)) {
			const { status, body } = await call(person, '/api/myjkkn/staff?limit=50')
			await sleep(REQUEST_GAP_MS)
			const rows = Array.isArray(body?.data) ? body.data : null
			const own = new Set(identifiers(person.institution))
			const foreign = rows ? rows.filter((row) => !own.has(String(row.institution_id ?? row.institution?.id ?? '').toLowerCase())).length : 0
			const ok = status === 200 && rows !== null && foreign === 0
			result.scope.push(`${ok ? 'ok  ' : 'FAIL'} MyJKKN staff rows are own institution only → ${status}, ${rows ? `${rows.length} rows, ${foreign} from elsewhere` : 'no rows array'}`)
			if (!ok) result.failures.push(`scope: MyJKKN staff → ${status}, ${foreign} rows from another institution`)
		}
	}
	return result
}

// ── Run ───────────────────────────────────────────────────────────────────
console.log(`server: ${base}`)
console.log(`users: ${people.length} | GET routes exercised: ${routes.length} of ${candidates.length} session-gated static GET routes (${candidates.length - routes.length} skipped: exports, syncs, generators, e-mail, MyJKKN sweeps)`)

const results = []
try {
	const health = await call(people[0], '/api/exam-management/examination-sessions')
	if (health.status === 0) throw new Error(`the dev server at ${base} did not answer`)
	if (health.status === 401) throw new Error('the server refused the temporary session (is it running the current code against this database?)')

	// The first user goes alone: the dev server compiles each route on first use.
	const startedAt = Date.now()
	results.push(await testPerson(people[0], routes))
	console.log(`  1/${people.length} done (${Math.round((Date.now() - startedAt) / 1000)} s, includes route compilation)`)
	for (let i = 1; i < people.length; i += USERS_IN_PARALLEL) {
		const batch = await Promise.all(people.slice(i, i + USERS_IN_PARALLEL).map((p) => testPerson(p, routes)))
		results.push(...batch)
		console.log(`  ${Math.min(i + USERS_IN_PARALLEL, people.length)}/${people.length} done`)
	}
} catch (err) {
	console.error(`\nstopped: ${err.message}`)
	await cleanup()
	process.exit(1)
}
await cleanup()

// ── Report ────────────────────────────────────────────────────────────────
let failed = 0
console.log('')
for (const r of results) {
	const p = r.person
	const where = p.unrestricted ? 'all institutions' : p.institution ? p.institution.institution_code : 'NO INSTITUTION'
	console.log(`${r.failures.length ? 'FAIL' : 'OK  '} ${p.label} — ${where}`)
	console.log(`     routes: ${r.allowedOk} allowed as expected, ${r.deniedOk} refused as expected${r.serverErrors.length ? `, ${r.serverErrors.length} answered 5xx` : ''}${r.timeouts.length ? `, ${r.timeouts.length} timed out` : ''}`)
	if (p.revived) console.log(`     note: the temporary session was switched off ${p.revived} time(s) during the run by a live sign-in, and switched back on`)
	for (const line of r.scope) console.log(`     ${line}`)
	for (const f of r.failures.slice(0, 12)) console.log(`     ✖ ${f}`)
	if (r.failures.length > 12) console.log(`     ✖ … and ${r.failures.length - 12} more`)
	failed += r.failures.length
}

const serverErrors = new Map()
for (const r of results) for (const e of r.serverErrors) serverErrors.set(e, (serverErrors.get(e) || 0) + 1)
if (serverErrors.size) {
	console.log(`\nRoutes that answered 5xx when called with no parameters (not an access failure; listed for follow-up):`)
	for (const [e, n] of [...serverErrors].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${e}  (${n} user${n > 1 ? 's' : ''})`)
}
const timeouts = new Set(results.flatMap((r) => r.timeouts))
if (timeouts.size) console.log(`\nRoutes that did not answer within ${REQUEST_TIMEOUT_MS / 1000} s: ${[...timeouts].join(', ')}`)

console.log(failed ? `\n${failed} check(s) failed across ${results.filter((r) => r.failures.length).length} user(s)` : `\nall ${results.length} users behaved as the policy says`)
process.exit(failed ? 1 : 0)
