import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Cron endpoint: expire API keys past their expiry date.
 *
 * Schedule this via Vercel Cron (vercel.json) or an external scheduler
 * to run every hour. Finds active keys that have passed their expires_at
 * timestamp and marks them as expired with an audit trail.
 *
 * Protected by a shared secret (CRON_SECRET env var) to prevent unauthorized invocation.
 */
export async function POST(request: Request) {
	// Verify cron secret to prevent unauthorized calls
	const authHeader = request.headers.get('authorization')
	const cronSecret = process.env.CRON_SECRET

	if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	const supabase = getSupabaseServer()
	const now = new Date().toISOString()

	// Find all active keys that have expired
	const { data: expiredKeys, error: fetchError } = await supabase
		.from('api_keys')
		.select('id, access_key_id, app_id, key_name, expires_at')
		.eq('status', 'active')
		.not('expires_at', 'is', null)
		.lt('expires_at', now)

	if (fetchError) {
		console.error('[cron/expire-api-keys] Fetch error:', fetchError)
		return NextResponse.json({ error: 'Failed to query expired keys' }, { status: 500 })
	}

	if (!expiredKeys || expiredKeys.length === 0) {
		return NextResponse.json({ expired: 0, message: 'No keys to expire' })
	}

	// Mark them as expired
	const expiredIds = expiredKeys.map((k) => k.id)

	const { error: updateError } = await supabase
		.from('api_keys')
		.update({ status: 'expired' })
		.in('id', expiredIds)

	if (updateError) {
		console.error('[cron/expire-api-keys] Update error:', updateError)
		return NextResponse.json({ error: 'Failed to expire keys' }, { status: 500 })
	}

	// Log events for audit trail
	const events = expiredKeys.map((key) => ({
		key_id: key.id,
		event_type: 'expired',
		metadata: {
			reason: 'cron_expiry',
			access_key_id: key.access_key_id,
			expires_at: key.expires_at,
			expired_at: now,
		},
	}))

	await supabase.from('api_key_events').insert(events)

	// Also log to transaction_logs for visibility in the security audit dashboard
	await supabase.from('transaction_logs').insert({
		action: 'security:api_keys_expired',
		resource_type: 'api_keys',
		status: 'success',
		metadata: {
			count: expiredKeys.length,
			keys: expiredKeys.map((k) => ({
				access_key_id: k.access_key_id,
				key_name: k.key_name,
				app_id: k.app_id,
				expires_at: k.expires_at,
			})),
			timestamp: now,
		},
	})

	return NextResponse.json({
		expired: expiredKeys.length,
		keys: expiredKeys.map((k) => k.access_key_id),
	})
}
