// Generates lib/auth/api-policy.generated.ts and docs/audit/api-policy-coverage.md.
//
//   node scripts/generate-api-policy.cjs
//
// Rule: an API route may be called by anyone who can open at least one of the
// screens that call it. The screens' permissions come from
// lib/navigation-data.ts — the same ones the sidebar and PagePermissionGate
// use — so this adds no new policy, it makes the existing one hold on the
// server.
//
// How callers are found: from every page.tsx the import graph is followed and
// every '/api/…' string or template literal on the way is collected. A literal
// counts for a route when it matches it segment by segment, or is a prefix of
// it (services build URLs as `${baseUrl}/…`). Matching is deliberately
// generous: a missed caller would lock a user out, an extra one only widens a
// rule.
//
// A route gets NO rule (stays open to every signed-in user) when:
//   • no calling screen was found            — never deny what cannot be attributed
//   • a calling screen has no permission     — anyone may open that screen
//     (a sub-screen with no sidebar entry inherits the permissions of the
//     gated screens that link to it; one nothing links to stays open)
//   • it is called from a layout/shared shell — every user needs it
//   • it already checks a permission itself, or a hand-written rule covers it
//
// Re-run after adding screens or routes, and review the diff.
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/')
const read = (p) => fs.readFileSync(p, 'utf8')

// A file imported by more screens than this is shared plumbing (navigation,
// header, providers). A link inside it is not "this screen links to that
// one", so it does not pass a permission on to a sub-screen.
const COMMON_FILE_SCREENS = 20

// Marks a literal that the code extends into longer URLs (`${baseUrl}/batch`).
const BASE_MARK = '/**'

// ── 1. Screen permissions (lib/navigation-data.ts) ────────────────────────
const navSrc = read(path.join(ROOT, 'lib', 'navigation-data.ts')).replace(/\r\n/g, '\n')
const navEntries = []
for (const m of navSrc.matchAll(/url:\s*'([^']+)'[^\n]*?permission:\s*'([^']+)'/g)) {
	navEntries.push({ path: m[1].split('?')[0], permission: m[2] })
}
{
	// Group-level entries keep url and permission on separate lines.
	let pendingUrl = null
	for (const line of navSrc.split('\n')) {
		const url = /^\t\turl:\s*'([^']+)'/.exec(line)
		if (url) pendingUrl = url[1]
		const permission = /^\t\tpermission:\s*'([^']+)'/.exec(line)
		if (permission && pendingUrl && pendingUrl !== '#') {
			navEntries.push({ path: pendingUrl.split('?')[0], permission: permission[1] })
		}
		if (/^\t\titems:/.test(line) || /^\t},?$/.test(line)) pendingUrl = null
	}
}
const pagePermissionMap = []
{
	const seen = new Set()
	for (const e of navEntries) {
		if (e.path === '#' || seen.has(e.path)) continue
		seen.add(e.path)
		pagePermissionMap.push(e)
	}
	pagePermissionMap.sort((a, b) => b.path.length - a.path.length)
}
// Mirrors getPermissionForPath(): longest-prefix match.
function permissionForPath(pathname) {
	for (const e of pagePermissionMap) {
		if (pathname === e.path || pathname.startsWith(e.path + '/')) return e.permission
	}
	return undefined
}

// ── 2. Source files and the import graph ──────────────────────────────────
function walk(dir, test, acc = []) {
	if (!fs.existsSync(dir)) return acc
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) walk(full, test, acc)
		else if (test(entry.name, full)) acc.push(full)
	}
	return acc
}

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']
function resolveImport(spec, fromFile) {
	let base
	if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
	else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec)
	else return null
	for (const ext of EXTENSIONS) {
		const candidate = base + ext
		if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
	}
	return null
}

// `import … from` is handled separately so that a barrel (index.ts made only
// of re-exports) contributes just the modules behind the names imported.
const IMPORT_FROM = /import\s+([^'"`;]*?)\s+from\s*['"]([^'"]+)['"]/g
const OTHER_IMPORTS = [
	/export\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g,
	/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
	/import\s+['"]([^'"]+)['"]/g,
	/require\(\s*['"]([^'"]+)['"]\s*\)/g,
]

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Names bound by an import clause, or null when everything is taken (default / namespace). */
function importedNames(clause) {
	const braces = /\{([^}]*)\}/.exec(clause)
	const outside = clause.replace(/\{[^}]*\}/, '').replace(/,/g, '').trim()
	if (outside) return null
	if (!braces) return null
	return braces[1]
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part && !part.startsWith('type '))
		.map((part) => part.split(/\s+as\s+/)[0].trim())
}

const barrelCache = new Map()
/** For an index file made only of re-exports: which module provides which name. Otherwise null. */
function barrelOf(file) {
	if (barrelCache.has(file)) return barrelCache.get(file)
	let barrel = null
	if (/^index\.(ts|tsx|js)$/.test(path.basename(file))) {
		const code = stripComments(read(file))
		const rest = code.replace(/export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*['"][^'"]+['"]\s*;?/g, '').trim()
		if (rest === '') {
			barrel = { named: new Map(), stars: [] }
			for (const m of code.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
				if (m[1]) continue
				const target = resolveImport(m[3], file)
				if (!target) continue
				for (const part of m[2].split(',')) {
					const name = part.trim().split(/\s+as\s+/).pop().trim()
					if (name && !part.trim().startsWith('type ')) barrel.named.set(name, target)
				}
			}
			for (const m of code.matchAll(/export\s+\*(?:\s+as\s+\w+)?\s*from\s*['"]([^'"]+)['"]/g)) {
				const target = resolveImport(m[1], file)
				if (target) barrel.stars.push(target)
			}
		}
	}
	barrelCache.set(file, barrel)
	return barrel
}

/** Modules an import of `names` from `target` really pulls in. */
function importTargets(target, names) {
	const barrel = barrelOf(target)
	if (!barrel || names === null) return [target]
	const out = new Set()
	for (const name of names) {
		if (barrel.named.has(name)) {
			importTargets(barrel.named.get(name), [name]).forEach((t) => out.add(t))
			continue
		}
		// Behind an `export *`: take the modules that declare the name, or all of them when unsure.
		const declares = barrel.stars.filter((star) =>
			new RegExp('export\\s+(?:async\\s+)?(?:const|let|var|function|class|enum)\\s+' + name + '\\b|export\\s*\\{[^}]*\\b' + name + '\\b').test(read(star))
		)
		;(declares.length ? declares : barrel.stars).forEach((star) => importTargets(star, [name]).forEach((t) => out.add(t)))
	}
	return [...out]
}

/** '/api/…' literals in a source text, normalised: query cut off, `${…}` → '*'. */
function apiLiterals(src, absoluteOnly = false) {
	const found = new Set()
	for (let i = src.indexOf('/api/'); i !== -1; i = src.indexOf('/api/', i + 1)) {
		const quote = src[i - 1]
		if (absoluteOnly && quote !== '}') continue
		let raw
		if (quote === "'" || quote === '"') {
			const end = src.indexOf(quote, i)
			if (end === -1 || end - i > 300) continue
			raw = src.slice(i, end)
		} else if (quote === '`') {
			let depth = 0
			let j = i
			for (; j < src.length && j - i < 400; j++) {
				if (src[j] === '$' && src[j + 1] === '{') { depth++; j++ }
				else if (src[j] === '}' && depth > 0) depth--
				else if (src[j] === '`' && depth === 0) break
			}
			raw = src.slice(i, j).replace(/\$\{[^`]*?\}/g, '*')
		} else if (quote === '}') {
			// `${base}/api/…` — an absolute URL to our own API.
			const end = src.indexOf('`', i)
			if (end === -1 || end - i > 300) continue
			raw = src.slice(i, end).replace(/\$\{[^`]*?\}/g, '*')
		} else continue

		const clean = raw.split('?')[0].split('#')[0].replace(/\/+$/, '')
		if (!/^\/api\/[A-Za-z0-9_\-/*.[\]]+$/.test(clean)) continue
		const literal = clean.split('/').map((seg) => (seg.includes('*') ? '*' : seg)).join('/')
		found.add(literal)

		// Is this literal extended into longer URLs? It is when:
		//   • it ends with a slash or is concatenated   '/api/x/' + id
		//   • it is given a name later used as a base   `${baseUrl}/batch`
		//   • it is exported under a name (used as a base from another file)
		//   • it is handed to a helper other than fetch  useCRUD('/api/x') —
		//     such helpers build '/api/x/<id>' themselves
		if (!absoluteOnly && !literal.includes('*')) {
			const before = src.slice(Math.max(0, i - 80), i - 1)
			const after = src.slice(i + raw.length + 1, i + raw.length + 12)
			const name = /([A-Za-z_$][\w$]*)\s*[:=]\s*$/.exec(before)?.[1]
			const exported = /export\s+const\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*$/.test(before)
			const callee = /([A-Za-z_$][\w$.]*)\s*\(\s*$/.exec(before)?.[1]
			const extended =
				raw.split('?')[0].endsWith('/') ||
				/^\s*\+/.test(after) ||
				exported ||
				(callee && !/^(fetch|window\.fetch|apiFetch|secureFetch|console\.\w+)$/.test(callee)) ||
				(name && new RegExp('\\$\\{[^}]*\\b' + name + '\\b[^}]*\\}/|\\b' + name + '\\b\\s*\\+\\s*[\'"`]/').test(src))
			if (extended) found.add(literal + BASE_MARK)
		}
	}
	return found
}

/** In-app links ('/section/screen', `/x/${id}/edit`) in a source text, `${…}` → '*'. */
function linkLiterals(src) {
	const found = new Set()
	const pattern = /['"`](\/(?!api\/)[A-Za-z][A-Za-z0-9_\-/[\]]*(?:\$\{[^}`]*\}[A-Za-z0-9_\-/[\]]*)*)/g
	for (const m of src.matchAll(pattern)) {
		const clean = m[1].replace(/\$\{[^}`]*\}/g, '*').replace(/\/+$/, '')
		found.add(clean.split('/').map((seg) => (seg.includes('*') ? '*' : seg)).join('/'))
	}
	return found
}

const fileInfo = new Map()
function info(file) {
	let entry = fileInfo.get(file)
	if (entry) return entry
	const src = read(file)
	const imports = new Set()
	const add = (resolved) => {
		if (resolved && /\.(ts|tsx|js|jsx)$/.test(resolved)) imports.add(resolved)
	}
	for (const m of src.matchAll(IMPORT_FROM)) {
		if (/^type\s/.test(m[1].trim())) continue // types only — nothing runs
		const resolved = resolveImport(m[2], file)
		if (resolved) importTargets(resolved, importedNames(m[1])).forEach(add)
	}
	for (const pattern of OTHER_IMPORTS) {
		for (const m of src.matchAll(pattern)) add(resolveImport(m[1], file))
	}
	entry = { imports, literals: apiLiterals(src), links: linkLiterals(src) }
	fileInfo.set(file, entry)
	return entry
}

/** Every API literal (and in-app link) reachable from a file through imports. */
function reachable(entryFile, stopAt = () => false) {
	const literals = new Set()
	const links = new Set()
	const seen = new Set()
	const stack = [entryFile]
	while (stack.length) {
		const file = stack.pop()
		if (seen.has(file) || stopAt(file)) continue
		seen.add(file)
		const { imports, literals: own, links: ownLinks } = info(file)
		own.forEach((l) => literals.add(l))
		ownLinks.forEach((l) => links.add(l))
		imports.forEach((i) => stack.push(i))
	}
	return { literals, links, files: seen }
}
const reachableLiterals = (entryFile, stopAt) => reachable(entryFile, stopAt).literals

// ── 3. Screens ────────────────────────────────────────────────────────────
const APP = path.join(ROOT, 'app')
const isApiFile = (file) => rel(file).startsWith('app/api/')
const pageFiles = walk(APP, (name, full) => name === 'page.tsx' && !isApiFile(full))

const screens = pageFiles.map((file) => {
	const inCoe = rel(file).startsWith('app/(coe)/')
	const route = '/' + rel(path.dirname(file))
		.replace(/^app\/?/, '')
		.split('/')
		.filter((seg) => seg && !(seg.startsWith('(') && seg.endsWith(')')))
		.join('/')
	// Only screens under the (coe) layout are behind PagePermissionGate.
	const permission = inCoe ? permissionForPath(route.replace(/\[[^\]]+\]/g, 'x')) : undefined
	const { literals, files } = reachable(file, isApiFile)
	const links = new Set()
	const pattern = route.split('/').map((seg) => (seg.startsWith('[') ? '*' : seg)).join('/')
	return { file, route, pattern, inCoe, permission, literals, links, files, derived: new Set() }
})

// Links only count from a screen's own code, not from plumbing every screen shares.
const fileUse = new Map()
for (const screen of screens) for (const file of screen.files) fileUse.set(file, (fileUse.get(file) || 0) + 1)
const isCommonFile = (file) => (fileUse.get(file) || 0) > COMMON_FILE_SCREENS
const ownLinks = (files) => [...files].filter((f) => !isCommonFile(f)).flatMap((f) => [...info(f).links])
for (const screen of screens) ownLinks(screen.files).forEach((l) => screen.links.add(l))

// The shell every screen renders inside: the root layout and the (coe) layout.
// A layout deeper in the tree only wraps its own section, so what it calls is
// attributed to the screens beneath it instead.
const shellLiterals = new Set()
const GLOBAL_LAYOUT_DIRS = new Set(['app', 'app/(coe)'])
const notScreenCode = (f) => isApiFile(f) || path.basename(f) === 'page.tsx'
for (const layout of walk(APP, (name, full) => /^(layout|template|loading|error|not-found)\.tsx$/.test(name) && !isApiFile(full))) {
	const { literals: found, files: layoutFiles } = reachable(layout, notScreenCode)
	const foundLinks = ownLinks(layoutFiles)
	const dir = rel(path.dirname(layout))
	if (GLOBAL_LAYOUT_DIRS.has(dir)) {
		found.forEach((l) => shellLiterals.add(l))
		continue
	}
	for (const screen of screens) {
		if (!rel(screen.file).startsWith(dir + '/')) continue
		found.forEach((l) => screen.literals.add(l))
		// A section layout's tabs link its screens to one another.
		foundLinks.forEach((l) => screen.links.add(l))
	}
}
// Every screen also carries the shell's own calls; drop them so a screen is
// only credited with what it adds.
for (const screen of screens) shellLiterals.forEach((l) => screen.literals.delete(l))

// Sub-screens with no sidebar entry (add / edit / detail screens) have no
// permission of their own. They are reached from gated screens, so they
// inherit those screens' permissions — carried along chains of sub-screens.
// A sub-screen nothing gated links to keeps no permission and stays open.
{
	const sameShape = (link, pattern) => {
		const a = link.split('/')
		const b = pattern.split('/')
		return a.length === b.length && a.every((seg, i) => seg === '*' || b[i] === '*' || seg === b[i])
	}
	const unlisted = screens.filter((s) => s.inCoe && !s.permission)
	const targetsOf = (from) => unlisted.filter((u) => u !== from && [...from.links].some((l) => sameShape(l, u.pattern)))
	const queue = screens.filter((s) => s.permission).map((s) => ({ from: s, permissions: [s.permission] }))
	while (queue.length) {
		const { from, permissions } = queue.shift()
		for (const target of targetsOf(from)) {
			const added = permissions.filter((perm) => !target.derived.has(perm))
			if (added.length === 0) continue
			added.forEach((perm) => target.derived.add(perm))
			queue.push({ from: target, permissions: added })
		}
	}
}
/** Permissions that let a user reach a screen; empty when anyone can. */
const permissionsOf = (screen) => (screen.permission ? [screen.permission] : [...screen.derived])

// ── 4. Routes ─────────────────────────────────────────────────────────────
const PUBLIC_PREFIXES = [
	'/api/auth', '/api/token', '/api/public', '/api/v1',
	'/api/examiner-portal', '/api/examiner/question-paper', '/api/cron',
]
const PUBLIC_PATTERNS = [/^\/api\/courses\/[^/]+\/syllabus-pdf\/?$/]
// The hand-written rules, read as data (Node strips the TypeScript types).
const { API_POLICY, findApiPolicyRule } = require(path.join(ROOT, 'lib', 'auth', 'api-policy.ts'))
/** The hand-written rule governing a route: for every method, for writes only, or none. */
function handRuleFor(concrete) {
	const forReads = findApiPolicyRule(concrete, 'GET', API_POLICY)
	if (forReads) return { writesOnly: false, anyOf: forReads.anyOf }
	const forWrites = findApiPolicyRule(concrete, 'POST', API_POLICY)
	return forWrites ? { writesOnly: true, anyOf: forWrites.anyOf } : null
}

// Does a literal found in screen code refer to this route?
//   • same shape (segment for segment, '*' matching anything): yes
//   • shorter: only when it is a base URL the code extends ('/api/x' used as
//     `${base}/y`), or when it names no route of its own — then it can only be
//     a base built somewhere this script cannot see, and assuming so is the
//     safe direction (it widens a rule rather than locking a screen out).
//     A literal that IS a route ('/api/post-exam') and is never extended
//     means that route and nothing beneath it.
let routePatterns = new Set()
const covers = (rawLiteral, pattern) => {
	const isBase = rawLiteral.endsWith(BASE_MARK)
	const literal = isBase ? rawLiteral.slice(0, -BASE_MARK.length) : rawLiteral
	const lit = literal.split('/')
	const pat = pattern.split('/')
	if (lit.length > pat.length) return false
	if (lit.length < pat.length) {
		if (literal.includes('*')) return false
		if (!isBase && routePatterns.has(literal)) return false
	}
	return lit.every((seg, i) => seg === '*' || pat[i] === '*' || seg === pat[i])
}

const routes = walk(path.join(APP, 'api'), (name) => name === 'route.ts').map((file) => {
	const src = read(file)
	const route = '/' + rel(path.dirname(file)).replace(/^app\//, '')
	const pattern = route.split('/').map((seg) => (seg.startsWith('[') ? '*' : seg)).join('/')
	const concrete = route.replace(/\[[^\]]+\]/g, 'x')
	const methods = new Set()
	for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) methods.add(m[1])
	for (const m of src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) methods.add(m[1])
	return {
		file,
		route,
		pattern,
		methods: [...methods].sort(),
		isPublic: PUBLIC_PREFIXES.some((p) => concrete === p || concrete.startsWith(p + '/')) || PUBLIC_PATTERNS.some((re) => re.test(concrete)),
		selfChecks: /requireUserPermission\(|withAdminAuth\(/.test(src),
		handRule: handRuleFor(concrete),
	}
}).sort((a, b) => a.route.localeCompare(b.route))
routePatterns = new Set(routes.map((r) => r.pattern))

// ── 5. Derive rules ───────────────────────────────────────────────────────
// 5a. Each route on its own: who calls it from a screen?
const state = new Map()
for (const r of routes) {
	if (r.isPublic) continue
	const entry = { r, open: null, settled: false, permissions: new Set(), screens: new Set(), via: new Set() }
	state.set(r.route, entry)
	// Routes governed elsewhere get no generated rule whatever their callers.
	if (r.selfChecks) { entry.open = 'checks a permission in the handler'; entry.settled = true; continue }
	if (r.handRule && !r.handRule.writesOnly) {
		entry.open = 'hand-written rule'
		entry.settled = true
		entry.handPermissions = r.handRule.anyOf
		continue
	}

	const callers = screens.filter((s) => [...s.literals].some((l) => covers(l, r.pattern)))
	const inShell = [...shellLiterals].some((l) => covers(l, r.pattern))
	const ungated = callers.filter((s) => permissionsOf(s).length === 0)
	callers.flatMap(permissionsOf).forEach((perm) => entry.permissions.add(perm))
	callers.forEach((s) => entry.screens.add(s.route))

	if (inShell) entry.open = 'called from the layout / shared shell'
	else if (callers.length === 0) entry.open = 'no calling screen found'
	else if (ungated.length > 0) entry.open = `called from a screen without a permission (${ungated[0].route})`
}

// 5b. Server-side calls. A handler that fetches another of our routes passes
// the caller's session along (forwardSession), so the inner route is checked
// as that same user: whoever may call the outer route must get through the
// inner one too. If the outer route is open, the inner one has to be as well.
const gatedRoutes = routes.filter((r) => !r.isPublic)
const serverCalls = []
for (const outer of gatedRoutes) {
	const absolute = apiLiterals(read(outer.file), true)
	if (absolute.size === 0) continue
	const inner = gatedRoutes.filter((r) => r !== outer && [...absolute].some((l) => covers(l, r.pattern)))
	if (inner.length) serverCalls.push({ outer, inner })
}
for (let changed = true; changed; ) {
	changed = false
	for (const { outer, inner } of serverCalls) {
		const from = state.get(outer.route)
		for (const r of inner) {
			const to = state.get(r.route)
			if (to.settled) continue
			if (from.handPermissions) {
				if (to.open === 'no calling screen found') { to.open = null; changed = true }
				for (const perm of from.handPermissions) {
					if (!to.permissions.has(perm)) { to.permissions.add(perm); to.via.add(outer.route); changed = true }
				}
				continue
			}
			if (from.open) {
				// "No calling screen" is replaced: now we know who calls it.
				if (!to.open || to.open === 'no calling screen found') {
					const next = `called server-side by ${outer.route}, which is open`
					if (to.open !== next) { to.open = next; changed = true }
				}
				continue
			}
			if (to.open === 'no calling screen found') { to.open = null; changed = true }
			for (const perm of from.permissions) {
				if (!to.permissions.has(perm)) { to.permissions.add(perm); to.via.add(outer.route); changed = true }
			}
		}
	}
}

// Debugging aid:  --screen=/some/screen  lists the API calls found for that screen.
const whichScreen = process.argv.find((arg) => arg.startsWith('--screen='))?.slice(9)
if (whichScreen) {
	const screen = screens.find((sc) => sc.route === whichScreen)
	console.log('screen', whichScreen, screen ? '[' + (permissionsOf(screen).join(', ') || 'no permission') + '] ' + [...screen.literals].sort().join(' ') : '(no such screen)')
}

// Debugging aid:  --why=/api/some/route  lists the literals that tie screens to it.
const why = process.argv.find((arg) => arg.startsWith('--why='))?.slice(6)
if (why) {
	const target = routes.find((r) => r.route === why)
	const tally = new Map()
	for (const s of screens) for (const l of s.literals) if (target && covers(l, target.pattern)) tally.set(l, (tally.get(l) || 0) + 1)
	console.log('why', why, target ? [...tally].map(([l, n]) => l + ' x' + n).join(' | ') || '(no screen literal)' : '(no such route)')
}

// 5c. Rules and the routes left open.
const rules = []
const open = []
for (const entry of state.values()) {
	const { r } = entry
	const permissions = [...entry.permissions].sort()
	if (entry.open) { open.push({ r, reason: entry.open }); continue }
	rules.push({
		r,
		permissions,
		screens: [...entry.screens].sort().concat([...entry.via].sort().map((route) => `via ${route}`)),
		// Where a hand-written rule already governs writes, this one adds reads.
		readsOnly: Boolean(r.handRule && r.handRule.writesOnly),
	})
}

// Sidebar entries that name a screen but no permission: everyone sees them,
// everyone can open them, and so the APIs behind them cannot be restricted.
const unguardedNav = [...navSrc.matchAll(/\{ title: '([^']+)', url: '(\/[^']+)'[^\n]*\}/g)]
	.filter((m) => !/permission:/.test(m[0]))
	.map((m) => ({ title: m[1], url: m[2].split('?')[0] }))
	.filter((entry) => !permissionForPath(entry.url))

// ── 6. Write lib/auth/api-policy.generated.ts ─────────────────────────────
const q = (s) => `'${s}'`
const out = []
out.push('// GENERATED by scripts/generate-api-policy.cjs — do not edit by hand.')
out.push('//')
out.push('// One rule per API route: the permissions of the screens that call it')
out.push('// (lib/navigation-data.ts). Holding any one is enough. Re-run the script')
out.push('// after adding a screen or a route, and review the diff.')
out.push('')
out.push("import type { ApiPolicyRule } from '@/lib/auth/api-policy'")
out.push('')
out.push('export const GENERATED_API_POLICY: readonly ApiPolicyRule[] = [')
for (const { r, permissions, screens: callerScreens, readsOnly } of rules) {
	const shown = callerScreens.slice(0, 4).join(', ') + (callerScreens.length > 4 ? `, +${callerScreens.length - 4} more` : '')
	out.push(`\t// ${shown}`)
	out.push(`\t{ prefix: ${q(r.pattern)}, exact: true,${readsOnly ? " methods: ['GET']," : ''} anyOf: [${permissions.map(q).join(', ')}] },`)
}
out.push(']')
out.push('')
fs.writeFileSync(path.join(ROOT, 'lib', 'auth', 'api-policy.generated.ts'), out.join('\n'))

// ── 7. Coverage report ────────────────────────────────────────────────────
const gated = routes.filter((r) => !r.isPublic)
const byReason = new Map()
for (const { r, reason } of open) {
	const key = reason.replace(/\(.*\)$/, '').trim()
	if (!byReason.has(key)) byReason.set(key, [])
	byReason.get(key).push({ r, reason })
}
const md = []
md.push('# API permission policy — coverage')
md.push('')
md.push('Generated by `node scripts/generate-api-policy.cjs` — do not edit by hand.')
md.push('')
md.push('Each session-gated API route is limited to users who can open at least one of the screens that call it. Routes listed below are still open to every signed-in COE user, with the reason.')
md.push('')
md.push('| | Count |')
md.push('|---|---:|')
md.push(`| Session-gated API routes | ${gated.length} |`)
md.push(`| Rule derived from calling screens | ${rules.length} |`)
for (const [reason, list] of byReason) md.push(`| Open — ${reason} | ${list.length} |`)
md.push(`| Screens analysed | ${screens.length} (${screens.filter((s) => s.permission).length} with a permission) |`)
md.push('')
for (const [reason, list] of byReason) {
	if (reason === 'checks a permission in the handler' || reason === 'hand-written rule') continue
	md.push(`## Open — ${reason}`)
	md.push('')
	md.push('| Route | Methods | Detail |')
	md.push('|---|---|---|')
	for (const { r, reason: full } of list) md.push(`| \`${r.route}\` | ${r.methods.join(', ') || '—'} | ${full} |`)
	md.push('')
}
if (unguardedNav.length) {
	md.push('## Sidebar entries with no permission')
	md.push('')
	md.push('Every signed-in user sees these entries and can open the screens. Give each a `permission` in `lib/navigation-data.ts`.')
	md.push('')
	for (const entry of unguardedNav) md.push(`- **${entry.title}** — \`${entry.url}\``)
	md.push('')
}
{
	const unlisted = screens.filter((s) => s.inCoe && !s.permission).sort((a, b) => a.route.localeCompare(b.route))
	const orphans = unlisted.filter((s) => s.derived.size === 0)
	md.push('## Screens with no permission of their own')
	md.push('')
	md.push(`${unlisted.length} screens under the COE layout have no sidebar entry, so \`PagePermissionGate\` lets any signed-in user open them by URL. ${unlisted.length - orphans.length} are sub-screens linked from gated screens; their APIs inherit those screens' permissions. The ${orphans.length} below are linked from no gated screen, so they and the APIs they call stay open until someone decides which permission should gate them.`)
	md.push('')
	md.push('| Screen | APIs it calls |')
	md.push('|---|---:|')
	for (const s of orphans) md.push(`| \`${s.route}\` | ${routes.filter((r) => !r.isPublic && [...s.literals].some((l) => covers(l, r.pattern))).length} |`)
	md.push('')
}
fs.mkdirSync(path.join(ROOT, 'docs', 'audit'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'docs', 'audit', 'api-policy-coverage.md'), md.join('\n'))

console.log(`screens: ${screens.length} (${screens.filter((s) => s.permission).length} with a permission) | nav permissions: ${pagePermissionMap.length}`)
console.log(`unlisted COE screens: ${screens.filter((s) => s.inCoe && !s.permission).length} (inherit a permission: ${screens.filter((s) => s.inCoe && !s.permission && s.derived.size).length})`)
console.log(`session-gated routes: ${gated.length} | rules generated: ${rules.length}`)
if (unguardedNav.length) console.log(`WARNING — sidebar entries with no permission (open to every signed-in user): ${unguardedNav.map((e) => e.url).join(', ')}`)
const widest = rules.filter((r) => r.permissions.length >= 40)
if (widest.length) console.log(`WARNING — ${widest.length} rule(s) admit 40 or more screen permissions; check the attribution: ${widest.slice(0, 6).map((r) => r.r.route).join(', ')}`)
for (const [reason, list] of byReason) console.log(`  open — ${reason}: ${list.length} (writing: ${list.filter(({ r }) => r.methods.some((m) => m !== 'GET')).length})`)
