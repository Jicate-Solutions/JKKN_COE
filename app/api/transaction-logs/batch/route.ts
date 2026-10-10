import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { cookies, headers } from 'next/headers'
import { getRequestUser } from '@/lib/auth/server-session'

interface TransactionLogEntry {
	action: string
	resource_type?: string
	resource_id?: string
	old_values?: Record<string, unknown>
	new_values?: Record<string, unknown>
	metadata?: Record<string, unknown>
	status?: 'success' | 'error' | 'pending'
	error_message?: string
}

/**
 * Get session info by access_token (session_token in sessions table)
 * Returns both session_id and user_id from the sessions table
 */
async function getSessionByToken(supabase: ReturnType<typeof getSupabaseServer>, accessToken?: string) {
	if (!accessToken) return { sessionId: null, userId: null }

	// Lookup session by session_token (which is the access_token)
	// Use limit(1) instead of .single() — duplicate active sessions can exist
	// Filter out expired sessions so zombie rows don't attribute logs to stale users
	const { data: sessions } = await supabase
		.from('sessions')
		.select('id, user_id')
		.eq('session_token', accessToken)
		.eq('is_active', true)
		.gt('expires_at', new Date().toISOString())
		.order('created_at', { ascending: false })
		.limit(1)

	if (sessions && sessions.length > 0) {
		return {
			sessionId: sessions[0].id,
			userId: sessions[0].user_id
		}
	}

	return { sessionId: null, userId: null }
}

/**
 * POST /api/transaction-logs/batch
 * Log multiple transactions at once (fire-and-forget for navigation logs)
 */
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { entries } = body as { entries: TransactionLogEntry[] }

		// Who did it comes from the verified session — never from the body, or
		// any signed-in user could file audit entries under someone else's name.
		const caller = await getRequestUser()
		if (!caller) {
			return NextResponse.json({ error: 'Your session has expired. Please sign in again.', code: 'INVALID_SESSION' }, { status: 401 })
		}
		const access_token = (await cookies()).get('access_token')?.value
		const user_email = caller.email

		if (!entries || !Array.isArray(entries) || entries.length === 0) {
			return NextResponse.json({ error: 'Entries array is required' }, { status: 400 })
		}

		// Limit batch size
		if (entries.length > 50) {
			return NextResponse.json({ error: 'Maximum 50 entries per batch' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		// Get request metadata
		const headersList = await headers()
		const userAgent = headersList.get('user-agent') || null
		const forwardedFor = headersList.get('x-forwarded-for')
		const realIp = headersList.get('x-real-ip')
		const cfConnectingIp = headersList.get('cf-connecting-ip') // Cloudflare
		const trueClientIp = headersList.get('true-client-ip') // Akamai/Cloudflare

		// Priority: CF > True-Client > X-Forwarded-For > X-Real-IP > null
		const ipAddress = cfConnectingIp ||
			trueClientIp ||
			forwardedFor?.split(',')[0]?.trim() ||
			realIp ||
			null

		// Get session info by access_token (session_token in sessions table)
		const { sessionId } = await getSessionByToken(supabase, access_token)
		const userId = caller.userId

		// Prepare batch insert
		const logsToInsert = entries.map((entry) => ({
			user_id: userId,       // LOCAL user_id from sessions table
			session_id: sessionId, // Session ID from sessions table
			action: entry.action,
			resource_type: entry.resource_type || null,
			resource_id: entry.resource_id || null,
			old_values: entry.old_values || null,
			new_values: entry.new_values || null,
			ip_address: ipAddress,
			user_agent: userAgent,
			status: entry.status || 'success',
			error_message: entry.error_message || null,
			metadata: {
				...(entry.metadata || {}),
				user_email: user_email || null, // Store email in metadata for reference
			},
		}))

		// Insert all logs
		const { error } = await supabase
			.from('transaction_logs')
			.insert(logsToInsert)

		if (error) {
			console.error('Error batch logging transactions:', error)
			return NextResponse.json({ error: 'Failed to log transactions' }, { status: 500 })
		}

		return NextResponse.json({
			success: true,
			count: entries.length,
		})
	} catch (error) {
		console.error('Batch transaction log error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
