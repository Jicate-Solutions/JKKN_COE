/**
 * Per-API-key rate limiting for v1 external API routes.
 *
 * Unlike the general IP-based rate limiter in middleware, this tracks
 * usage per access_key_id. This prevents a single API consumer from
 * exhausting the system, regardless of how many IPs they use.
 *
 * Integrated into the withExternalAuth middleware chain so it runs
 * after authentication (we need the access_key_id to track).
 */

import { NextResponse } from 'next/server'
import type { ExternalApiErrorResponse } from '@/types/api-management'

interface RateLimitEntry {
	timestamps: number[]
}

// In-memory store keyed by access_key_id
const store = new Map<string, RateLimitEntry>()

// Config: per-key limits
const WINDOW_MS = 60_000 // 1 minute
const MAX_REQUESTS_PER_KEY = 60 // 60 requests per key per minute

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup(): void {
	const now = Date.now()
	if (now - lastCleanup < CLEANUP_INTERVAL) return
	lastCleanup = now

	store.forEach((entry, key) => {
		if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - WINDOW_MS) {
			store.delete(key)
		}
	})
}

/**
 * Check per-API-key rate limit.
 * Returns null if within limits, or an error response if exceeded.
 */
export function checkApiKeyRateLimit(
	accessKeyId: string,
	requestId: string
): NextResponse | null {
	const now = Date.now()

	// Periodic cleanup
	cleanup()

	// Get or create entry
	let entry = store.get(accessKeyId)
	if (!entry) {
		entry = { timestamps: [] }
		store.set(accessKeyId, entry)
	}

	// Remove timestamps outside current window
	const windowStart = now - WINDOW_MS
	entry.timestamps = entry.timestamps.filter((t) => t > windowStart)

	// Check limit
	if (entry.timestamps.length >= MAX_REQUESTS_PER_KEY) {
		const oldestInWindow = entry.timestamps[0]
		const retryAfterMs = oldestInWindow + WINDOW_MS - now
		const retryAfterSec = Math.ceil(retryAfterMs / 1000)

		const errorBody: ExternalApiErrorResponse = {
			error: `Rate limit exceeded. Maximum ${MAX_REQUESTS_PER_KEY} requests per minute per API key.`,
			code: 'RATE_LIMIT_EXCEEDED',
			request_id: requestId,
		}

		return NextResponse.json(errorBody, {
			status: 429,
			headers: {
				'Retry-After': String(retryAfterSec),
				'X-RateLimit-Limit': String(MAX_REQUESTS_PER_KEY),
				'X-RateLimit-Remaining': '0',
				'X-RateLimit-Reset': String(Math.ceil((oldestInWindow + WINDOW_MS) / 1000)),
			},
		})
	}

	// Record this request
	entry.timestamps.push(now)

	return null
}

/**
 * Get rate limit info for adding to response headers.
 */
export function getApiKeyRateLimitInfo(accessKeyId: string): { limit: number; remaining: number } {
	const entry = store.get(accessKeyId)
	const used = entry?.timestamps.length ?? 0
	return {
		limit: MAX_REQUESTS_PER_KEY,
		remaining: Math.max(0, MAX_REQUESTS_PER_KEY - used),
	}
}
