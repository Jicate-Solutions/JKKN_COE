import { NextRequest, NextResponse } from 'next/server'
import { validateCsrf, ensureCsrfCookie } from '@/lib/security/csrf'
import { checkRateLimit, addRateLimitHeaders } from '@/lib/security/rate-limit'
import { applySecurityHeaders } from '@/lib/security/headers'
import { logSecurityEvent } from '@/lib/security/audit-log'
import { checkIpAllowlist } from '@/lib/security/ip-allowlist'
import { loadUserPermissions, verifyAccessToken } from '@/lib/auth/server-session'
import { findApiPolicyRule, satisfiesApiPolicy } from '@/lib/auth/api-policy'
import { activeApiPolicyRules, generatedPolicyMode } from '@/lib/auth/api-policy-rules'
import { checkInstitutionScope } from '@/lib/auth/institution-scope-request'

// List of public routes that don't require authentication
const publicRoutes = [
	'/login',
	'/auth/callback',
	'/callback',
	'/contact-admin',
	'/verify-email',
	'/arts-examiner-registration',
	'/engg-examiner-registration',
	// Short alias for the same portal, and the URL printed on new Examiner
	// Orders. The long path stays public because orders already issued carry it.
	'/examiner',
	'/',
]

// List of API routes that don't require authentication
const publicApiRoutes = [
	'/api/auth',
	'/api/token',
	// NOTE: /api/myjkkn is deliberately NOT here. Those routes relay MyJKKN
	// learner and staff profiles using the server-side API key, so they need a
	// COE session like everything else. Route handlers that call them
	// server-side forward the caller's cookies (lib/api-helpers/forward-session.ts).
	'/api/public',
	'/api/v1',
	// Examiner portal: reached by external examiners who have no COE account.
	// Every route under it authenticates with its own signed, httpOnly,
	// SameSite=Strict session cookie (lib/qp-portal/session.ts) and authorises
	// against the assignment + its IST window (lib/qp-portal/guard.ts).
	'/api/examiner-portal',
	// Question-paper figures (Google Drive upload + authenticated proxy). Shared
	// by COE authors AND external examiners, so the middleware cannot demand COE
	// cookies; the routes authenticate both audiences themselves
	// (app/api/examiner/question-paper/*).
	'/api/examiner/question-paper',
	// Scheduled jobs (vercel.json crons). Vercel Cron carries no COE cookies;
	// every route under it must check `Authorization: Bearer <CRON_SECRET>`
	// and refuse to run when the secret is not configured.
	'/api/cron',
]

// Exact public API paths (regex): shared by COE staff AND external examiners,
// authenticated inside the route itself. Kept as patterns so a prefix such as
// /api/courses is not opened wholesale.
const publicApiPatterns = [
	// One syllabus link for every screen (app/api/courses/[id]/syllabus-pdf).
	/^\/api\/courses\/[^/]+\/syllabus-pdf\/?$/,
]

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl

	// Allow static assets and Next.js internals (no security overhead needed).
	// The "has a dot" shortcut is for files with extensions (images, etc.) and
	// must never apply to /api: a dot inside a dynamic segment
	// (/api/thing/abc.def) would otherwise skip every check below.
	if (
		pathname.startsWith('/_next') ||
		pathname.startsWith('/static') ||
		(pathname.includes('.') && !pathname.startsWith('/api/'))
	) {
		return NextResponse.next()
	}

	// ── Layer 0: Block Debug/Test Endpoints in Production ──────
	if (process.env.NODE_ENV === 'production') {
		const debugPatterns = ['/api/debug', '/api/test-', '/api/smtp-config/test']
		if (debugPatterns.some((p) => pathname.startsWith(p))) {
			return NextResponse.json({ error: 'Not found' }, { status: 404 })
		}
	}

	// ── Layer 1: Rate Limiting ──────────────────────────────────
	// Check rate limits before any processing to protect all endpoints
	const rateLimitResponse = checkRateLimit(request)
	if (rateLimitResponse) {
		logSecurityEvent(request, 'rate_limit_exceeded')
		applySecurityHeaders(rateLimitResponse)
		return rateLimitResponse
	}

	// ── Layer 1b: IP Allowlisting ──────────────────────────────
	// Block non-allowlisted IPs from admin routes
	const ipBlockResponse = checkIpAllowlist(request)
	if (ipBlockResponse) {
		logSecurityEvent(request, 'auth_failed', { reason: 'ip_not_allowed' })
		applySecurityHeaders(ipBlockResponse)
		return ipBlockResponse
	}

	// ── Layer 2: CSRF Validation ────────────────────────────────
	// Validate CSRF token for state-changing requests (POST/PUT/DELETE/PATCH)
	const csrfError = validateCsrf(request)
	if (csrfError) {
		const csrfType = request.headers.get('x-csrf-token') ? 'csrf_token_invalid' : 'csrf_token_missing'
		logSecurityEvent(request, csrfType)
		applySecurityHeaders(csrfError)
		return csrfError
	}

	// ── Layer 3: Authentication ─────────────────────────────────
	// Allow public routes
	if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
		const res = NextResponse.next()
		applySecurityHeaders(res)
		ensureCsrfCookie(request, res)
		return res
	}

	// Allow public API routes
	// Whole-segment match: '/api/v1' must not also open '/api/v1-anything'.
	if (publicApiRoutes.some((route) => pathname === route || pathname.startsWith(route + '/')) || publicApiPatterns.some((re) => re.test(pathname))) {
		const res = NextResponse.next()
		applySecurityHeaders(res)
		addRateLimitHeaders(request, res)
		return res
	}

	// Check for access_token cookie (parent app OAuth)
	const accessToken = request.cookies.get('access_token')?.value

	// If no token and trying to access protected route
	if (!accessToken) {
		logSecurityEvent(request, 'auth_failed')
		if (pathname.startsWith('/api')) {
			const res = NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 }
			)
			applySecurityHeaders(res)
			return res
		}

		// Redirect to login with redirect URL
		const url = request.nextUrl.clone()
		url.pathname = '/login'
		url.searchParams.set('redirect', pathname)
		const res = NextResponse.redirect(url)
		applySecurityHeaders(res)
		return res
	}

	// ── Layer 3b: Session verification (API) ────────────────────
	// A cookie's presence proves nothing — anyone can set one. Every protected
	// API call must carry a token bound to a live COE session, and COE access
	// is read from the user's roles in the database, not from the client-set
	// `coe_access` cookie. Pages stay on the cheap cookie check below: they
	// are static shells whose data all comes from these API routes, and a
	// page-level redirect here would fight the client's token refresh.
	if (pathname.startsWith('/api')) {
		const verification = await verifyAccessToken(accessToken)

		if (!verification.ok) {
			if (verification.code === 'SESSION_CHECK_FAILED') {
				const res = NextResponse.json(
					{ error: 'Unable to verify your session right now. Please try again.', code: verification.code },
					{ status: 503 }
				)
				applySecurityHeaders(res)
				return res
			}

			logSecurityEvent(request, 'auth_failed', { reason: verification.code })
			const res = NextResponse.json(
				{ error: 'Your session has expired. Please sign in again.', code: verification.code },
				{ status: 401 }
			)
			applySecurityHeaders(res)
			return res
		}

		if (!verification.session.hasCoeAccess) {
			logSecurityEvent(request, 'coe_access_denied')
			const res = NextResponse.json(
				{ error: 'COE access not granted. Contact administrator for role assignment.' },
				{ status: 403 }
			)
			applySecurityHeaders(res)
			return res
		}

		// ── Layer 3c: Permission policy (API) ──────────────────────
		// Routes with a rule need more than a session: the hand-written rules in
		// lib/auth/api-policy.ts, then one per route derived from the screens
		// that call it (lib/auth/api-policy.generated.ts).
		const rule = findApiPolicyRule(pathname, request.method, activeApiPolicyRules())
		if (rule && !verification.session.isSuperAdmin) {
			let allowed = false
			try {
				allowed = satisfiesApiPolicy(rule, {
					isSuperAdmin: false,
					permissions: await loadUserPermissions(verification.session.userId),
				})
			} catch (err) {
				console.error('[proxy] Permission check failed:', err)
				const res = NextResponse.json(
					{ error: 'Unable to verify your permissions right now. Please try again.' },
					{ status: 503 }
				)
				applySecurityHeaders(res)
				return res
			}

			if (!allowed && rule.generated && generatedPolicyMode() === 'report') {
				console.warn(
					`[api-policy] Would deny ${request.method} ${pathname} for user ${verification.session.userId}: needs one of ${rule.anyOf.join(', ')}`
				)
				allowed = true
			}

			if (!allowed) {
				console.warn(
					`[api-policy] Denied ${request.method} ${pathname} for user ${verification.session.userId}: needs one of ${rule.anyOf.join(', ') || '(super admin only)'}`
				)
				logSecurityEvent(request, 'coe_access_denied', { reason: 'permission_policy', rule: rule.prefix })
				const res = NextResponse.json(
					{ error: 'You do not have permission to perform this action.' },
					{ status: 403 }
				)
				applySecurityHeaders(res)
				return res
			}
		}

		// ── Layer 3d: Institution isolation (API) ──────────────────
		// A user who is not a super admin may only name their own institution
		// in a request, and may only reach records that belong to it — whether
		// by route (/x/<id>), ?id=, or a reference such as examination_session_id
		// (lib/auth/institution-scope.ts, lib/auth/resource-ownership.ts).
		const outOfScope = await checkInstitutionScope(request, verification.session)
		if (outOfScope) {
			logSecurityEvent(request, 'coe_access_denied', { reason: 'institution_scope', field: outOfScope.field })
			const res = NextResponse.json(
				{
					error: outOfScope.record
						? 'The requested record could not be found or accessed.'
						: outOfScope.unlinked
						? 'Your account is not linked to an institution. Sign out and sign in again; if this continues, contact the administrator.'
						: 'You do not have permission to access another institution\'s records. If this is your institution, sign out and sign in again.',
					code: outOfScope.record ? 'RECORD_SCOPE' : outOfScope.unlinked ? 'INSTITUTION_UNLINKED' : 'INSTITUTION_SCOPE',
				},
				{ status: 403 }
			)
			applySecurityHeaders(res)
			return res
		}

		const res = NextResponse.next()
		applySecurityHeaders(res)
		ensureCsrfCookie(request, res)
		addRateLimitHeaders(request, res)
		return res
	}

	// ── Layer 4: COE Authorization (pages) ──────────────────────
	// Check for COE access (user must have COE-specific roles assigned)
	const coeAccess = request.cookies.get('coe_access')?.value

	if (!coeAccess) {
		logSecurityEvent(request, 'coe_access_denied')
		if (pathname.startsWith('/api')) {
			const res = NextResponse.json(
				{ error: 'COE access not granted. Contact administrator for role assignment.' },
				{ status: 403 }
			)
			applySecurityHeaders(res)
			return res
		}

		// Redirect to MyJKKN - user is authenticated but has no COE role
		const parentAppUrl = process.env.NEXT_PUBLIC_PARENT_APP_URL || 'https://jkkn.ai'
		const res = NextResponse.redirect(parentAppUrl)
		applySecurityHeaders(res)
		return res
	}

	// ── Layer 5: Attach Security to Successful Response ─────────
	const res = NextResponse.next()
	applySecurityHeaders(res)
	ensureCsrfCookie(request, res)
	addRateLimitHeaders(request, res)
	return res
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - public folder
		 */
		'/((?!_next/static|_next/image|favicon.ico|public).*)',
	],
}
