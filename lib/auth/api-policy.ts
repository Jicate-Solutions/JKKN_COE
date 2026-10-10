/**
 * Central authorisation policy for API routes, enforced in proxy.ts after the
 * session check.
 *
 * Hiding a screen in the sidebar is not access control: the API behind it
 * still answers anyone who is signed in. Each rule below names the permission
 * that already gates the screen in lib/navigation-data.ts, so "can open the
 * page" and "can call its API" mean the same thing.
 *
 * A request is allowed when the caller is a super admin or holds ANY of the
 * rule's permissions. An empty `anyOf` means super admin only. Routes with no
 * rule are open to every signed-in COE user.
 *
 * Two sets of rules apply, in this order (the first match wins):
 *   1. API_POLICY below — written by hand, for the administration surface.
 *   2. GENERATED_API_POLICY (api-policy.generated.ts) — one rule per route,
 *      derived from the screens that call it by scripts/generate-api-policy.cjs.
 * To tighten a route beyond what its screens imply, add a rule here or call
 * requireUserPermission() in the handler.
 */

export interface ApiPolicyRule {
	/**
	 * Path prefix, matched on whole segments ('/api/users/roles' also covers
	 * '/api/users/roles/abc'). A '*' segment matches any single segment.
	 */
	prefix: string
	/** Match this exact path only, not the paths beneath it. */
	exact?: boolean
	/** Set on rules from api-policy.generated.ts (see API_POLICY_GENERATED). */
	generated?: boolean
	/** HTTP methods the rule applies to. Omit for every method. */
	methods?: readonly string[]
	/** Permission names; holding any one is enough. Empty = super admin only. */
	anyOf: readonly string[]
}

const WRITES = ['POST', 'PUT', 'PATCH', 'DELETE'] as const

// Screens: Roles, Permissions, Role Permission, Role Management.
const ACCESS_ADMIN = [
	'page.users.roles.view',
	'page.users.permissions.view',
	'page.users.role_permissions.view',
	'page.admin.role_management.view',
] as const

const DEVELOPER_PORTAL = [
	'page.developer_portal.view',
	'page.developer_portal.applications.view',
	'page.developer_portal.audit_logs.view',
] as const

const REVALUATION = [
	'page.revaluation_management.view',
	'page.revaluation_management.create.view',
] as const

const EXAM_APPLICATIONS = [
	'page.exam_management.exam_applications.view',
	'page.exam_management.exam_applications.bulk.view',
] as const

export const API_POLICY: readonly ApiPolicyRule[] = [
	// ── Who can do what ──────────────────────────────────────────────────
	// Changing roles, permissions or user accounts is how a user would give
	// themselves more access, so every write here needs an access-admin
	// permission. Reads stay open: other screens list roles and users.
	{ prefix: '/api/users/roles', methods: WRITES, anyOf: ACCESS_ADMIN },
	{ prefix: '/api/users/permissions', methods: WRITES, anyOf: ACCESS_ADMIN },
	{ prefix: '/api/users/role-permissions', methods: WRITES, anyOf: ACCESS_ADMIN },
	// Reads included: this lists every user's role assignments.
	{ prefix: '/api/users/user-roles', anyOf: ACCESS_ADMIN },
	{ prefix: '/api/users/users-list', methods: WRITES, anyOf: ACCESS_ADMIN },

	// ── Secrets and integrations ─────────────────────────────────────────
	// SMTP credentials and API keys: reads are sensitive too.
	{ prefix: '/api/smtp-config', anyOf: ['page.master.smtp_config.view'] },
	{ prefix: '/api/developer-portal', anyOf: DEVELOPER_PORTAL },

	// ── Institution-wide settings ────────────────────────────────────────
	// Every report reads the PDF settings; only the settings screen edits them.
	{ prefix: '/api/pdf-settings', methods: WRITES, anyOf: ['page.master.pdf_settings.view'] },

	// ── Read by every screen, changed by few ─────────────────────────────
	// The page shell lists sessions and institutions on every screen, so reads
	// stay open; creating, editing and deleting them belongs to their screens.
	{ prefix: '/api/exam-management/examination-sessions', exact: true, methods: WRITES, anyOf: ['page.exam_management.examination_sessions.view'] },
	{ prefix: '/api/master/institutions', methods: WRITES, anyOf: ['page.master.institutions.view'] },

	// ── Routes no screen calls ───────────────────────────────────────────
	// The generator derives a route's rule from the screens that call it, and
	// found none for these — so without a rule here they would be open to
	// every signed-in user. Each takes the permission of the area it belongs
	// to. (`exact` keeps a rule off the routes beneath it, which have their own.)
	{ prefix: '/api/revaluation/final-marks', anyOf: REVALUATION },
	{ prefix: '/api/revaluation/marks', anyOf: REVALUATION },
	{ prefix: '/api/revaluation/reports', anyOf: REVALUATION },
	{ prefix: '/api/exam-management/exam-applications', exact: true, anyOf: EXAM_APPLICATIONS },
	{ prefix: '/api/exam-management/exam-applications/courses', exact: true, anyOf: EXAM_APPLICATIONS },
	{ prefix: '/api/exam-report', anyOf: ['page.reports.comprehensive.view'] },
	{ prefix: '/api/pre-exam/practical-email/resend', exact: true, anyOf: ['page.pre_exam.practical_allotment.view'] },
	{ prefix: '/api/pre-exam/practical-email/status', exact: true, anyOf: ['page.pre_exam.practical_allotment.view'] },
	{ prefix: '/api/pre-exam/seating', anyOf: ['page.exam_management.exam_rooms.view'] },
	{ prefix: '/api/room-allocations', anyOf: ['page.exam_management.exam_rooms.view'] },
	{ prefix: '/api/seat-allocations', anyOf: ['page.exam_management.exam_rooms.view'] },
	{ prefix: '/api/result-analytics/naad-csv-export', exact: true, anyOf: ['page.reports.nad.view'] },
	{ prefix: '/api/result-analytics/naad-reports', exact: true, anyOf: ['page.reports.nad.view'] },
	{ prefix: '/api/results', anyOf: ['page.grading.semester_results.view'] },
	{ prefix: '/api/api-management/students', anyOf: ['page.users.learners_myjkkn.view'] },
	{ prefix: '/api/students', anyOf: ['page.users.learners_myjkkn.view'] },
	{ prefix: '/api/api-management/staff/*', exact: true, anyOf: ['page.exam_management.examiners.internal.view'] },
	{ prefix: '/api/exam-management/exam-attendance/students', exact: true, anyOf: ['page.exam_management.exam_attendance.view'] },
	{ prefix: '/api/myjkkn/batches/*', exact: true, anyOf: ['page.master.batches.view'] },
	{ prefix: '/api/myjkkn/students/*', exact: true, anyOf: ['page.test_myjkkn_api.view'] },
	{ prefix: '/api/post-exam/central-valuation/email/resend', exact: true, anyOf: ['page.post_exam.central_valuation.dates.view'] },
	{ prefix: '/api/post-exam/central-valuation/email/status', exact: true, anyOf: ['page.post_exam.central_valuation.dates.view'] },
	{ prefix: '/api/pre-exam/cia-marks/*', exact: true, anyOf: ['page.pre_exam.internal_mark_entry.view'] },
	{ prefix: '/api/pre-exam/cia-marks/sync', exact: true, anyOf: ['page.pre_exam.internal_mark_entry.view'] },
	{ prefix: '/api/reports/marksheet-distribution/semesters', exact: true, anyOf: ['page.reports.marksheet_distribution.view'] },
	{ prefix: '/api/revaluation/draft-applications/*', exact: true, anyOf: REVALUATION },

	// ── Maintenance endpoints ────────────────────────────────────────────
	{ prefix: '/api/setup-semesters', anyOf: [] },
	{ prefix: '/api/check-is-active-field', anyOf: [] },
	{ prefix: '/api/test-semesters', anyOf: [] },
	{ prefix: '/api/test-supabase-auth', anyOf: [] },
	{ prefix: '/api/debug-oauth', anyOf: [] },
	{ prefix: '/api/exam-management/attendance-correction/debug', exact: true, anyOf: [] },
	// A full MyJKKN sweep into the local mirror; nothing in the app calls it.
	{ prefix: '/api/myjkkn/learner-profiles/sync', exact: true, anyOf: [] },
]

function matchesPath(rule: ApiPolicyRule, segments: readonly string[]): boolean {
	const want = rule.prefix.split('/')
	if (want.length > segments.length) return false
	if (rule.exact && want.length !== segments.length) return false
	return want.every((segment, i) => segment === '*' || segment === segments[i])
}

/** The rule governing a request, or null when none applies. */
export function findApiPolicyRule(
	pathname: string,
	method: string,
	rules: readonly ApiPolicyRule[] = API_POLICY
): ApiPolicyRule | null {
	const verb = method.toUpperCase()
	const segments = pathname.replace(/\/+$/, '').split('/')
	for (const rule of rules) {
		if (rule.methods && !rule.methods.includes(verb)) continue
		if (matchesPath(rule, segments)) return rule
	}
	return null
}

/** Does a caller with these permissions satisfy the rule? */
export function satisfiesApiPolicy(
	rule: ApiPolicyRule,
	caller: { isSuperAdmin: boolean; permissions: ReadonlySet<string> | readonly string[] }
): boolean {
	if (caller.isSuperAdmin) return true
	const held = caller.permissions instanceof Set ? caller.permissions : new Set(caller.permissions as readonly string[])
	return rule.anyOf.some((permission) => held.has(permission))
}
