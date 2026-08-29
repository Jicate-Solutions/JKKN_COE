import { NextRequest, NextResponse } from 'next/server'

const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const TOKEN_LENGTH = 32

// State-changing methods that require CSRF validation
const PROTECTED_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

/**
 * Generate a cryptographically random CSRF token.
 * Uses Web Crypto API available in Next.js Edge Runtime.
 */
function generateToken(): string {
	const bytes = new Uint8Array(TOKEN_LENGTH)
	crypto.getRandomValues(bytes)
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	const encoder = new TextEncoder()
	const bufA = encoder.encode(a)
	const bufB = encoder.encode(b)
	let result = 0
	for (let i = 0; i < bufA.length; i++) {
		result |= bufA[i] ^ bufB[i]
	}
	return result === 0
}

/**
 * Set the CSRF cookie on a response if not already present on the request.
 */
export function ensureCsrfCookie(request: NextRequest, response: NextResponse): NextResponse {
	const existingToken = request.cookies.get(CSRF_COOKIE_NAME)?.value
	if (!existingToken) {
		const token = generateToken()
		response.cookies.set(CSRF_COOKIE_NAME, token, {
			httpOnly: false, // Client JS must read this to set the header
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			path: '/',
		})
	}
	return response
}

/**
 * Validate CSRF token for state-changing requests.
 * Returns null if valid, or an error response if invalid.
 */
export function validateCsrf(request: NextRequest): NextResponse | null {
	if (!PROTECTED_METHODS.has(request.method)) {
		return null // GET/HEAD/OPTIONS don't need CSRF
	}

	// Skip CSRF for public API routes (they use API keys or are intentionally open)
	const pathname = request.nextUrl.pathname
	// /api/examiner-portal is exempt because its session cookie is SameSite=Strict
	// and httpOnly: a cross-site request cannot carry it, so there is nothing for
	// a CSRF token to add. Its sign-in routes are unauthenticated by design.
	const csrfExemptPrefixes = [
		'/api/auth',
		'/api/token',
		'/api/public',
		'/api/v1',
		'/api/transaction-logs',
		'/api/examiner-portal',
	]
	if (csrfExemptPrefixes.some((prefix) => pathname.startsWith(prefix))) {
		return null
	}

	const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value
	const headerToken = request.headers.get(CSRF_HEADER_NAME)

	if (!cookieToken || !headerToken) {
		return NextResponse.json(
			{ error: 'CSRF token missing. Please refresh the page and try again.' },
			{ status: 403 }
		)
	}

	if (!timingSafeEqual(cookieToken, headerToken)) {
		return NextResponse.json(
			{ error: 'CSRF token invalid. Please refresh the page and try again.' },
			{ status: 403 }
		)
	}

	return null // Valid
}
