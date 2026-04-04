import { NextRequest } from 'next/server'

export type SecurityEventType =
	| 'rate_limit_exceeded'
	| 'csrf_token_missing'
	| 'csrf_token_invalid'
	| 'auth_failed'
	| 'coe_access_denied'

interface SecurityEvent {
	event_type: SecurityEventType
	ip_address: string
	pathname: string
	method: string
	user_agent: string | null
	details?: Record<string, unknown>
}

/**
 * Extract client IP from request headers.
 */
function getClientIp(request: NextRequest): string {
	return (
		request.headers.get('cf-connecting-ip') ||
		request.headers.get('true-client-ip') ||
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		request.headers.get('x-real-ip') ||
		'unknown'
	)
}

// In-memory buffer for security events — flushed periodically to avoid
// slowing down the middleware with database writes on every violation.
const eventBuffer: SecurityEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 5_000 // 5 seconds
const MAX_BUFFER_SIZE = 50

/**
 * Log a security event. Events are buffered and flushed to the database
 * in batches to avoid adding latency to the middleware response.
 */
export function logSecurityEvent(
	request: NextRequest,
	eventType: SecurityEventType,
	details?: Record<string, unknown>
): void {
	const event: SecurityEvent = {
		event_type: eventType,
		ip_address: getClientIp(request),
		pathname: request.nextUrl.pathname,
		method: request.method,
		user_agent: request.headers.get('user-agent'),
		details,
	}

	eventBuffer.push(event)

	// Flush immediately if buffer is full
	if (eventBuffer.length >= MAX_BUFFER_SIZE) {
		flushEvents()
		return
	}

	// Otherwise schedule a flush
	if (!flushTimer) {
		flushTimer = setTimeout(() => {
			flushEvents()
		}, FLUSH_INTERVAL)
	}
}

/**
 * Flush buffered security events to the database via the transaction_logs table.
 * Uses the Supabase service role client for server-side writes.
 */
async function flushEvents(): Promise<void> {
	if (eventBuffer.length === 0) return

	// Clear timer
	if (flushTimer) {
		clearTimeout(flushTimer)
		flushTimer = null
	}

	// Drain buffer
	const events = eventBuffer.splice(0)

	try {
		// Dynamic import to avoid loading Supabase in Edge Runtime at module level.
		// Middleware runs in Edge Runtime; Supabase client creation must happen lazily.
		const { getSupabaseServer } = await import('@/lib/supabase-server')
		const supabase = getSupabaseServer()

		const rows = events.map((event) => ({
			action: `security:${event.event_type}`,
			resource_type: 'security',
			resource_id: event.pathname,
			status: 'error' as const,
			ip_address: event.ip_address,
			user_agent: event.user_agent,
			metadata: {
				method: event.method,
				pathname: event.pathname,
				ip_address: event.ip_address,
				...event.details,
				timestamp: new Date().toISOString(),
			},
		}))

		const { error } = await supabase
			.from('transaction_logs')
			.insert(rows)

		if (error) {
			console.error('[security-audit] Failed to flush events:', error.message)
		}
	} catch (err) {
		// Never let audit logging failures affect the main request flow
		console.error('[security-audit] Flush error:', err)
	}
}
