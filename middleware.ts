import { NextRequest, NextResponse } from 'next/server'
import { validateCsrf, ensureCsrfCookie } from '@/lib/security/csrf'
import { checkRateLimit, addRateLimitHeaders } from '@/lib/security/rate-limit'
import { applySecurityHeaders } from '@/lib/security/headers'
import { logSecurityEvent } from '@/lib/security/audit-log'
import { checkIpAllowlist } from '@/lib/security/ip-allowlist'

// List of public routes that don't require authentication
const publicRoutes = [
	'/login',
	'/auth/callback',
	'/callback',
	'/contact-admin',
	'/verify-email',
	'/arts-examiner-registration',
	'/engg-examiner-registration',
	'/',
]

// List of API routes that don't require authentication
const publicApiRoutes = [
	'/api/auth',
	'/api/token',
	'/api/myjkkn',
	'/api/public',
	'/api/v1',
]

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl

	// Allow static assets and Next.js internals (no security overhead needed)
	if (
		pathname.startsWith('/_next') ||
		pathname.startsWith('/static') ||
		pathname.includes('.') // Files with extensions (images, etc.)
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
	if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
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

	// ── Layer 4: COE Authorization ──────────────────────────────
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
