import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { headers } from 'next/headers'

/**
 * Get session info by access_token (session_token in sessions table)
 * Returns both session_id and user_id from the sessions table
 */
async function getSessionByToken(supabase: ReturnType<typeof getSupabaseServer>, accessToken?: string) {
	if (!accessToken) return { sessionId: null, userId: null }

	// Lookup session by session_token (which is the access_token)
	// Use limit(1) instead of .single() — duplicate active sessions can exist
	const { data: sessions } = await supabase
		.from('sessions')
		.select('id, user_id')
		.eq('session_token', accessToken)
		.eq('is_active', true)
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
 * POST /api/transaction-logs
 * Log a single transaction
 */
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const {
			action,
			resource_type,
			resource_id,
			old_values,
			new_values,
			metadata,
			status = 'success',
			error_message,
			access_token, // Client sends access_token to lookup session
			user_email,   // Client sends email for reference (stored in metadata)
		} = body

		if (!action) {
			return NextResponse.json({ error: 'Action is required' }, { status: 400 })
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

		// Insert transaction log
		const { data, error } = await supabase
			.from('transaction_logs')
			.insert({
				user_id: userId,      // LOCAL user_id from sessions table
				session_id: sessionId, // Session ID from sessions table
				action,
				resource_type: resource_type || null,
				resource_id: resource_id || null,
				old_values: old_values || null,
				new_values: new_values || null,
				ip_address: ipAddress,
				user_agent: userAgent,
				status,
				error_message: error_message || null,
				metadata: {
					...(metadata || {}),
					user_email: user_email || null, // Store email in metadata for reference
				},
			})
			.select('id')
			.single()

		if (error) {
			console.error('Error logging transaction:', error)
			return NextResponse.json({ error: 'Failed to log transaction' }, { status: 500 })
		}

		return NextResponse.json({ success: true, id: data.id })
	} catch (error) {
		console.error('Transaction log error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

/**
 * GET /api/transaction-logs
 * Get transaction logs (admin only)
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const page = parseInt(searchParams.get('page') || '1')
		const limit = parseInt(searchParams.get('limit') || '50')
		const user_id = searchParams.get('user_id')
		const action = searchParams.get('action')
		const resource_type = searchParams.get('resource_type')
		const status = searchParams.get('status')
		const from_date = searchParams.get('from_date')
		const to_date = searchParams.get('to_date')

		const supabase = getSupabaseServer()
		const offset = (page - 1) * limit

		// Build query — no FK join on user_id, fetch users separately
		let query = supabase
			.from('transaction_logs')
			.select('*', { count: 'exact' })

		// Apply filters
		if (user_id) query = query.eq('user_id', user_id)
		if (action) query = query.eq('action', action)
		if (resource_type) query = query.eq('resource_type', resource_type)
		if (status) query = query.eq('status', status)
		if (from_date) query = query.gte('created_at', from_date)
		if (to_date) query = query.lte('created_at', to_date)

		// Order by most recent first
		query = query.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1)

		const { data, error, count } = await query

		if (error) {
			console.error('Error fetching transaction logs:', error)
			return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
		}

		// Batch-fetch user details for logs that have a user_id
		const userIds = [...new Set((data || []).map(d => d.user_id).filter(Boolean))]
		let usersMap: Record<string, { id: string; email: string; full_name: string | null }> = {}

		if (userIds.length > 0) {
			const { data: users } = await supabase
				.from('users')
				.select('id, email, full_name')
				.in('id', userIds)
			if (users) {
				usersMap = Object.fromEntries(users.map(u => [u.id, u]))
			}
		}

		// Merge user data into logs
		const enrichedData = (data || []).map(log => ({
			...log,
			users: log.user_id ? (usersMap[log.user_id] || null) : null,
		}))

		return NextResponse.json({
			data: enrichedData,
			pagination: {
				page,
				limit,
				total: count || 0,
				total_pages: count ? Math.ceil(count / limit) : 0,
			},
		})
	} catch (error) {
		console.error('Transaction log fetch error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
