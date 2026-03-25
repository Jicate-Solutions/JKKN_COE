import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { headers } from 'next/headers'

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
	const { data: session } = await supabase
		.from('sessions')
		.select('id, user_id')
		.eq('session_token', accessToken)
		.eq('is_active', true)
		.single()

	if (session) {
		return {
			sessionId: session.id,
			userId: session.user_id
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
		const { entries, access_token, user_email } = body as {
			entries: TransactionLogEntry[]
			access_token?: string
			user_email?: string
		}

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
		const { sessionId, userId } = await getSessionByToken(supabase, access_token)

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
