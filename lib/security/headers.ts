import { NextRequest, NextResponse } from 'next/server'

// ── Nonce Generation ────────────────────────────────────────────

/**
 * Generate a cryptographically random nonce for CSP.
 * Each request gets a unique nonce — only scripts with this nonce are executed.
 */
function generateNonce(): string {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	// Base64-encode for CSP header compatibility
	return btoa(String.fromCharCode(...bytes))
}

// ── CSP Header Builder ──────────────────────────────────────────

/**
 * Build Content Security Policy with a per-request nonce.
 *
 * The nonce replaces 'unsafe-inline' for scripts, meaning ONLY scripts
 * tagged with this specific nonce will execute. Injected XSS scripts
 * won't have the nonce, so the browser blocks them.
 *
 * NOTE: 'unsafe-inline' is kept as a fallback alongside the nonce.
 * Browsers that support nonces ignore 'unsafe-inline' when a nonce is present.
 * Older browsers that don't support nonces fall back to 'unsafe-inline'.
 */
function buildCspHeader(nonce: string): string {
	const directives = [
		// Default: only allow same-origin resources
		"default-src 'self'",

		// Scripts: nonce-based + allowed external domains + fallback for older browsers
		process.env.NODE_ENV === 'development'
			? `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com`
			: `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://accounts.google.com`,

		// Styles: self + inline (Tailwind, Radix UI, TipTap inject inline styles)
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

		// Fonts: Google Fonts
		"font-src 'self' https://fonts.gstatic.com data:",

		// Images: self + Supabase storage + data URIs (base64 images in PDFs)
		"img-src 'self' data: blob: https://*.supabase.co https://jkkn.ai https://*.jkkn.ai",

		// API connections: self + Supabase + MyJKKN parent app + Google auth
		"connect-src 'self' https://*.supabase.co https://jkkn.ai https://*.jkkn.ai wss://*.supabase.co https://accounts.google.com",

		// Allow Google Sign-In iframe
		"frame-src 'self' https://accounts.google.com",

		// Frames: block all framing of our content (clickjacking prevention)
		"frame-ancestors 'self'",

		// Forms: only submit to same-origin
		"form-action 'self'",

		// Base URI: prevent base tag injection
		"base-uri 'self'",

		// Object/embed: block plugins (Flash, Java applets)
		"object-src 'none'",

		// Workers: only same-origin (service worker)
		"worker-src 'self' blob:",

		// Media: only same-origin
		"media-src 'self'",
	]

	return directives.join('; ')
}

/**
 * Apply standard security headers to every response.
 * Generates a unique CSP nonce per request and passes it via
 * the `x-csp-nonce` response header for Next.js to consume.
 */
export function applySecurityHeaders(response: NextResponse, request?: NextRequest): NextResponse {
	// ── Nonce-based Content Security Policy ──────────────────────
	const nonce = generateNonce()
	response.headers.set('Content-Security-Policy', buildCspHeader(nonce))

	// Pass nonce to downstream rendering via a custom header.
	// Next.js can read this in Server Components to add nonce to script tags.
	response.headers.set('x-csp-nonce', nonce)

	// ── Standard Security Headers ───────────────────────────────

	// Prevent MIME-type sniffing
	response.headers.set('X-Content-Type-Options', 'nosniff')

	// Prevent clickjacking by disallowing iframes from other origins
	response.headers.set('X-Frame-Options', 'SAMEORIGIN')

	// Control referrer information sent with requests
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

	// Disable browser features we don't use
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=()'
	)

	// Prevent reflected XSS in older browsers
	response.headers.set('X-XSS-Protection', '1; mode=block')

	return response
}
