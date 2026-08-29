import { NextRequest, NextResponse } from 'next/server'

interface RateLimitEntry {
	timestamps: number[]
}

interface RateLimitConfig {
	windowMs: number  // Time window in milliseconds
	maxRequests: number  // Max requests per window
}

// In-memory store — works for single-instance deployments
// For multi-instance, replace with Redis
const store = new Map<string, RateLimitEntry>()

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup(maxAge: number): void {
	const now = Date.now()
	if (now - lastCleanup < CLEANUP_INTERVAL) return
	lastCleanup = now

	store.forEach((entry, key) => {
		// Remove entries with no recent timestamps
		if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - maxAge) {
			store.delete(key)
		}
	})
}

// Route category → rate limit config
const RATE_LIMITS: Record<string, RateLimitConfig> = {
	auth: { windowMs: 60_000, maxRequests: 10 },       // Auth: 10/min
	public: { windowMs: 60_000, maxRequests: 20 },      // Public endpoints: 20/min
	admin: { windowMs: 60_000, maxRequests: 200 },      // Admin operations: 200/min
	api: { windowMs: 60_000, maxRequests: 100 },         // General API: 100/min
	// Examiner portal: an examiner authoring a paper auto-saves, uploads figures
	// and re-renders previews, so the 20/min public cap would 429 normal work.
	// Its sign-in routes get the tighter `portal_auth` bucket instead.
	portal: { windowMs: 60_000, maxRequests: 150 },
	portal_auth: { windowMs: 60_000, maxRequests: 10 },
}

/**
 * Determine which rate limit category a route belongs to.
 */
function getRouteCategory(pathname: string): string {
	if (pathname.startsWith('/api/examiner-portal/auth')) return 'portal_auth'
	if (pathname.startsWith('/api/examiner-portal')) return 'portal'
	if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/token')) return 'auth'
	if (pathname.startsWith('/api/public')) return 'public'
	if (pathname.startsWith('/api/admin')) return 'admin'
	return 'api'
}

/**
 * Extract client identifier from request.
 * Uses IP address + route category for per-category limits.
 *
 * TODO(learner-contribution): You may want to customize this.
 * For authenticated users, consider using user ID instead of IP
 * to prevent shared-IP issues (e.g., office networks).
 */
function getClientKey(request: NextRequest, category: string): string {
	const forwarded = request.headers.get('x-forwarded-for')
	const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
	return `${ip}:${category}`
}

/**
 * Check rate limit using sliding window algorithm.
 * Returns null if within limits, or an error response if exceeded.
 */
export function checkRateLimit(request: NextRequest): NextResponse | null {
	// Only rate-limit API routes
	const pathname = request.nextUrl.pathname
	if (!pathname.startsWith('/api')) return null

	// Skip rate limiting for external API (v1) — they have their own API key auth
	if (pathname.startsWith('/api/v1')) return null

	// Skip the internal image proxy. Batch reports (e.g. semester marksheets for a
	// whole program) legitimately fetch one photo per learner — easily 100+ in a
	// burst — and the default 100/min api cap would 429 the tail, leaving learners
	// with blank photos. It only proxies same-origin public images, so it's not an
	// abuse vector.
	if (pathname.startsWith('/api/utils/image-to-base64')) return null

	const category = getRouteCategory(pathname)
	const config = RATE_LIMITS[category]
	const key = getClientKey(request, category)
	const now = Date.now()

	// Periodic cleanup
	const maxWindow = Object.values(RATE_LIMITS).reduce((max, c) => Math.max(max, c.windowMs), 0)
	cleanup(maxWindow)

	// Get or create entry
	let entry = store.get(key)
	if (!entry) {
		entry = { timestamps: [] }
		store.set(key, entry)
	}

	// Remove timestamps outside the current window
	const windowStart = now - config.windowMs
	entry.timestamps = entry.timestamps.filter((t) => t > windowStart)

	// Check if limit exceeded
	if (entry.timestamps.length >= config.maxRequests) {
		const oldestInWindow = entry.timestamps[0]
		const retryAfterMs = oldestInWindow + config.windowMs - now
		const retryAfterSec = Math.ceil(retryAfterMs / 1000)

		return NextResponse.json(
			{ error: 'Too many requests. Please try again later.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(retryAfterSec),
					'X-RateLimit-Limit': String(config.maxRequests),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': String(Math.ceil((oldestInWindow + config.windowMs) / 1000)),
				},
			}
		)
	}

	// Record this request
	entry.timestamps.push(now)

	return null // Within limits
}

/**
 * Add rate limit headers to a successful response.
 */
export function addRateLimitHeaders(request: NextRequest, response: NextResponse): NextResponse {
	const pathname = request.nextUrl.pathname
	if (!pathname.startsWith('/api') || pathname.startsWith('/api/v1')) return response

	const category = getRouteCategory(pathname)
	const config = RATE_LIMITS[category]
	const key = getClientKey(request, category)
	const entry = store.get(key)
	const used = entry?.timestamps.length ?? 0

	response.headers.set('X-RateLimit-Limit', String(config.maxRequests))
	response.headers.set('X-RateLimit-Remaining', String(Math.max(0, config.maxRequests - used)))

	return response
}
