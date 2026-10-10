// Smoke test for the session checks, against a running dev server.
// Not part of `npm test`.
//   node tests/live-auth-smoke.mjs [baseUrl]            (default http://localhost:3000)
//
// Every request here is one an attacker could send without credentials; each
// must be refused. Nothing is written: the only POST is expected to be
// rejected before it touches the database.

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
// An unsigned token claiming to be someone — exactly what the old checks trusted.
const forgedJwt = (email) =>
	`${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ email, sub: '00000000-0000-0000-0000-000000000000' })}.x`
const forgedCookies = (token) => `access_token=${token}; coe_access=true; csrf_token=t`

const cases = [
	{
		name: 'protected API without cookies',
		path: '/api/master/institutions',
		expect: [401],
	},
	{
		name: 'protected API with made-up cookies (presence used to be enough)',
		path: '/api/master/institutions',
		headers: { cookie: forgedCookies('anything') },
		expect: [401],
		code: 'INVALID_SESSION',
	},
	{
		name: 'protected API with an unsigned JWT naming a user',
		path: '/api/master/institutions',
		headers: { cookie: forgedCookies(forgedJwt('someone@jkkn.ac.in')) },
		expect: [401],
		code: 'INVALID_SESSION',
	},
	{
		name: 'MyJKKN learner-profile proxy without a session (was public)',
		path: '/api/myjkkn/learner-profiles?limit=1',
		expect: [401],
	},
	{
		name: 'MyJKKN staff proxy with made-up cookies',
		path: '/api/myjkkn/staff?limit=1',
		headers: { cookie: forgedCookies('anything') },
		expect: [401],
	},
	{
		name: 'dotted path no longer skips the checks',
		path: '/api/master/institutions/abc.def',
		expect: [401],
	},
	{
		name: 'audit log read with made-up cookies',
		path: '/api/transaction-logs?page=1&limit=5',
		headers: { cookie: forgedCookies('anything') },
		expect: [401],
	},
	{
		name: '/api/v1/exam-settings without a session (had no auth at all)',
		path: '/api/v1/exam-settings?institution_id=00000000-0000-0000-0000-000000000000',
		expect: [401],
	},
	{
		name: 'bug-reporter relay without a session (was an open relay)',
		path: '/api/v1/bug-reporter/anything',
		expect: [401],
	},
	{
		name: "another user's permissions by email, anonymously",
		path: '/api/auth/permissions/by-role?email=someone@jkkn.ac.in',
		expect: [401],
	},
	{
		name: 'sync-session cannot mint a session for an email with a forged token',
		path: '/api/auth/sync-session',
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: 'someone@jkkn.ac.in', access_token: forgedJwt('someone@jkkn.ac.in') }),
		expect: [401],
		noSessionCookie: true,
	},
	{
		name: 'syllabus PDF with a forged "COE session"',
		path: '/api/courses/00000000-0000-0000-0000-000000000000/syllabus-pdf',
		headers: { cookie: forgedCookies(forgedJwt('someone@jkkn.ac.in')) },
		expect: [401, 403],
	},
]

let failed = 0
for (const c of cases) {
	let line
	try {
		const res = await fetch(base + c.path, {
			method: c.method || 'GET',
			headers: c.headers,
			body: c.body,
			redirect: 'manual',
		})
		const text = await res.text()
		let body = null
		try { body = JSON.parse(text) } catch { /* not JSON */ }

		const problems = []
		if (!c.expect.includes(res.status)) problems.push(`status ${res.status}, expected ${c.expect.join(' or ')}`)
		if (c.code && body?.code !== c.code) problems.push(`code ${body?.code}, expected ${c.code}`)
		if (c.noSessionCookie && /(^|,\s*)(access_token|coe_access)=/.test(res.headers.get('set-cookie') || '')) {
			problems.push('a session cookie was set')
		}
		if (problems.length) failed++
		line = `${problems.length ? 'FAIL' : 'OK  '} ${res.status} ${c.name}${problems.length ? ' — ' + problems.join('; ') : ''}`
	} catch (err) {
		failed++
		line = `FAIL --- ${c.name} — request error: ${err.message}`
	}
	console.log(line)
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall refused, as they should be')
process.exit(failed ? 1 : 0)
