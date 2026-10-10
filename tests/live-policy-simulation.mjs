// Read-only: shows what the API permission policy would do to each COE role,
// using the live role → permission assignments. Not part of `npm test`.
//   node -r dotenv/config tests/live-policy-simulation.mjs [roleName]
//
// For every role that has users: how many rule-governed routes it may call,
// and which ones it is denied. Run it before deploying a policy change and
// read the "denied" list for each restricted role — anything there that the
// role needs for its daily work means a rule (or the role) must change.

import { readFileSync } from 'node:fs'
import { API_POLICY, satisfiesApiPolicy } from '../lib/auth/api-policy.ts'
import { GENERATED_API_POLICY } from '../lib/auth/api-policy.generated.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
	console.error('Supabase environment not loaded (run with: node -r dotenv/config ...)')
	process.exit(1)
}
const headers = { apikey: key, Authorization: `Bearer ${key}` }
const get = async (path) => (await fetch(`${url}/rest/v1/${path}`, { headers })).json()

const only = process.argv[2]
const roles = await get('roles?select=id,name,is_active')
const userRoles = await get('user_roles?select=role_id&is_active=eq.true')
const rolePermissions = await get('role_permissions?select=role_id,permissions(name,is_active)')

const rules = [...API_POLICY, ...GENERATED_API_POLICY]
const label = (rule) => `${(rule.methods ?? ['ANY']).join('/')} ${rule.prefix}`

for (const role of roles) {
	const users = userRoles.filter((ur) => ur.role_id === role.id).length
	if (only ? role.name !== only : users === 0) continue

	const permissions = new Set(
		rolePermissions
			.filter((rp) => rp.role_id === role.id && rp.permissions?.is_active !== false)
			.map((rp) => rp.permissions?.name)
			.filter(Boolean)
	)
	const caller = { isSuperAdmin: false, permissions }
	const denied = rules.filter((rule) => !satisfiesApiPolicy(rule, caller))

	console.log(`\n${role.name} — ${users} user(s), ${permissions.size} permissions`)
	console.log(`  allowed ${rules.length - denied.length} of ${rules.length} rule-governed routes`)
	if (denied.length === 0) continue

	// Group the denials by API area to keep the list readable.
	const byArea = new Map()
	for (const rule of denied) {
		const area = rule.prefix.split('/').slice(0, 3).join('/')
		byArea.set(area, [...(byArea.get(area) ?? []), rule])
	}
	const detailed = only || denied.length <= 40
	for (const [area, list] of [...byArea].sort((a, b) => b[1].length - a[1].length)) {
		console.log(`  denied ${String(list.length).padStart(3)} under ${area}`)
		if (detailed) for (const rule of list) console.log(`           ${label(rule)}`)
	}
}

// Keep the generated file honest: it must be the output of the current script.
const generatedHeader = readFileSync(new URL('../lib/auth/api-policy.generated.ts', import.meta.url), 'utf8').split('\n')[0]
if (!generatedHeader.startsWith('// GENERATED')) console.warn('\nWARNING: api-policy.generated.ts does not look generated')
