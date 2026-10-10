// Run with:  npm test
//
// The permission policy enforced in proxy.ts for API routes that need more
// than a signed-in session (lib/auth/api-policy.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API_POLICY, findApiPolicyRule, satisfiesApiPolicy } from '../lib/auth/api-policy.ts'

const superAdmin = { isSuperAdmin: true, permissions: new Set() }
const accessAdmin = { isSuperAdmin: false, permissions: new Set(['page.users.roles.view']) }
// A typical restricted account: can open mark-entry screens, nothing administrative.
const markEntry = {
	isSuperAdmin: false,
	permissions: new Set(['page.pre_exam.internal_mark_entry.view', 'page.dashboard.view']),
}

const allowed = (path, method, caller) => {
	const rule = findApiPolicyRule(path, method)
	return rule === null || satisfiesApiPolicy(rule, caller)
}

test('a restricted user cannot change roles, permissions or user accounts', () => {
	for (const [path, method] of [
		['/api/users/user-roles', 'POST'],
		['/api/users/user-roles', 'DELETE'],
		['/api/users/roles', 'POST'],
		['/api/users/roles/3f0c1d2e-0000-0000-0000-000000000000', 'PUT'],
		['/api/users/permissions/3f0c1d2e-0000-0000-0000-000000000000', 'DELETE'],
		['/api/users/role-permissions', 'POST'],
		['/api/users/users-list', 'POST'],
		['/api/users/users-list/3f0c1d2e-0000-0000-0000-000000000000', 'PUT'],
	]) {
		assert.equal(allowed(path, method, markEntry), false, `${method} ${path}`)
		assert.equal(allowed(path, method, accessAdmin), true, `${method} ${path} (access admin)`)
		assert.equal(allowed(path, method, superAdmin), true, `${method} ${path} (super admin)`)
	}
})

test('reading roles and users stays open to signed-in users (other screens list them)', () => {
	assert.equal(allowed('/api/users/roles', 'GET', markEntry), true)
	assert.equal(allowed('/api/users/users-list', 'GET', markEntry), true)
})

test('SMTP settings and the developer portal are closed for reads as well as writes', () => {
	for (const path of ['/api/smtp-config', '/api/smtp-config/test', '/api/developer-portal/api-keys']) {
		assert.equal(allowed(path, 'GET', markEntry), false, `GET ${path}`)
		assert.equal(allowed(path, 'POST', markEntry), false, `POST ${path}`)
	}
	assert.equal(
		allowed('/api/smtp-config', 'GET', { isSuperAdmin: false, permissions: ['page.master.smtp_config.view'] }),
		true
	)
})

test('PDF settings can be read by every report but edited only from the settings screen', () => {
	assert.equal(allowed('/api/pdf-settings', 'GET', markEntry), true)
	assert.equal(allowed('/api/pdf-settings', 'POST', markEntry), false)
	assert.equal(allowed('/api/pdf-settings/abc', 'DELETE', markEntry), false)
})

test('maintenance endpoints are super admin only', () => {
	assert.equal(allowed('/api/setup-semesters', 'GET', accessAdmin), false)
	assert.equal(allowed('/api/check-is-active-field', 'POST', accessAdmin), false)
	assert.equal(allowed('/api/setup-semesters', 'GET', superAdmin), true)
})

test('a rule covers whole path segments only', () => {
	// '/api/users/roles' must not capture a sibling that merely starts the same.
	assert.equal(findApiPolicyRule('/api/users/roles-export', 'POST'), null)
	assert.notEqual(findApiPolicyRule('/api/users/roles/abc', 'POST'), null)
})

test('routes without a hand-written rule are left to the generated ones', () => {
	assert.equal(findApiPolicyRule('/api/master/courses', 'POST'), null)
	assert.equal(findApiPolicyRule('/api/grading/final-marks', 'GET'), null)
})

test('sessions and institutions can be read by every screen but changed only from their own', () => {
	const sessionsAdmin = { isSuperAdmin: false, permissions: new Set(['page.exam_management.examination_sessions.view']) }
	assert.equal(allowed('/api/exam-management/examination-sessions', 'GET', markEntry), true)
	assert.equal(allowed('/api/exam-management/examination-sessions', 'POST', markEntry), false)
	assert.equal(allowed('/api/exam-management/examination-sessions', 'POST', sessionsAdmin), true)
	assert.equal(allowed('/api/master/institutions', 'GET', markEntry), true)
	assert.equal(allowed('/api/master/institutions', 'DELETE', markEntry), false)
})

test('routes no screen calls take their area\'s permission instead of staying open', () => {
	const revaluation = { isSuperAdmin: false, permissions: new Set(['page.revaluation_management.view']) }
	for (const [path, method] of [
		['/api/revaluation/marks', 'GET'],
		['/api/revaluation/final-marks', 'POST'],
		['/api/seat-allocations', 'GET'],
		['/api/exam-management/exam-applications', 'DELETE'],
		['/api/results/validation-report', 'GET'],
	]) {
		assert.equal(allowed(path, method, markEntry), false, `${method} ${path}`)
	}
	assert.equal(allowed('/api/revaluation/marks', 'GET', revaluation), true)
	// `exact` keeps the parent's rule off the routes beneath it
	assert.equal(findApiPolicyRule('/api/exam-management/exam-applications/arrear-learners', 'GET'), null)
})

test('every rule is well formed', () => {
	for (const rule of API_POLICY) {
		assert.ok(rule.prefix.startsWith('/api/') && !rule.prefix.endsWith('/'), rule.prefix)
		assert.ok(Array.isArray(rule.anyOf), rule.prefix)
		for (const method of rule.methods ?? []) assert.equal(method, method.toUpperCase())
	}
})

// ── Rules generated from the screens (lib/auth/api-policy.generated.ts) ──

import { GENERATED_API_POLICY } from '../lib/auth/api-policy.generated.ts'

const ALL_RULES = [...API_POLICY, ...GENERATED_API_POLICY]
const allowedByAll = (path, method, caller) => {
	const rule = findApiPolicyRule(path, method, ALL_RULES)
	return rule === null || satisfiesApiPolicy(rule, caller)
}

test('a "*" segment matches one segment, and an exact rule does not cover deeper paths', () => {
	const rules = [{ prefix: '/api/things/*/items', exact: true, anyOf: ['p'] }]
	assert.notEqual(findApiPolicyRule('/api/things/42/items', 'GET', rules), null)
	assert.notEqual(findApiPolicyRule('/api/things/42/items/', 'GET', rules), null)
	assert.equal(findApiPolicyRule('/api/things/42/items/7', 'GET', rules), null)
	assert.equal(findApiPolicyRule('/api/things/42', 'GET', rules), null)
	assert.equal(findApiPolicyRule('/api/things/42/other', 'GET', rules), null)
})

test('every generated rule names a route and at least one permission', () => {
	assert.ok(GENERATED_API_POLICY.length > 100, 'the generated policy looks truncated')
	for (const rule of GENERATED_API_POLICY) {
		assert.ok(rule.prefix.startsWith('/api/'), rule.prefix)
		assert.equal(rule.exact, true, rule.prefix)
		assert.ok(rule.anyOf.length > 0, `${rule.prefix} would be super admin only`)
		assert.ok(rule.anyOf.every((p) => p.startsWith('page.')), rule.prefix)
	}
})

test('a screen-derived rule admits users of that screen and nobody else', () => {
	// Pick a real generated rule so this follows the policy as it changes.
	const rule = GENERATED_API_POLICY.find((r) => !r.methods && r.anyOf.length === 1 && !r.prefix.includes('*'))
	assert.ok(rule, 'expected at least one single-screen rule')
	const user = (...permissions) => ({ isSuperAdmin: false, permissions: new Set(permissions) })

	assert.equal(allowedByAll(rule.prefix, 'GET', user(rule.anyOf[0])), true)
	assert.equal(allowedByAll(rule.prefix, 'GET', user('page.dashboard.view')), rule.anyOf.includes('page.dashboard.view'))
	assert.equal(allowedByAll(rule.prefix, 'POST', user()), false)
	assert.equal(allowedByAll(rule.prefix, 'POST', { isSuperAdmin: true, permissions: new Set() }), true)
})

test('hand-written rules take precedence over generated ones', () => {
	// Role administration and secrets stay with their own permissions whatever
	// the screens imply: a user holding every OTHER screen permission is refused.
	const reserved = new Set(API_POLICY.flatMap((r) => r.anyOf))
	const everythingElse = {
		isSuperAdmin: false,
		permissions: new Set(GENERATED_API_POLICY.flatMap((r) => r.anyOf).filter((p) => !reserved.has(p))),
	}
	assert.ok(everythingElse.permissions.size > 20)
	assert.equal(allowedByAll('/api/users/user-roles', 'POST', everythingElse), false)
	assert.equal(allowedByAll('/api/smtp-config', 'GET', everythingElse), false)
})
