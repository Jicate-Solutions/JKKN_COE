import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/transaction-logs/stats
 * Returns aggregate stats for transaction log scorecards
 */
export async function GET() {
	try {
		const supabase = getSupabaseServer()

		// Today's date range (UTC)
		const todayStart = new Date()
		todayStart.setUTCHours(0, 0, 0, 0)
		const todayISO = todayStart.toISOString()

		// Run all queries in parallel
		const [todayLogs, todayErrors, todayAll, distinctUsers] = await Promise.all([
			// Today's total logs
			supabase
				.from('transaction_logs')
				.select('id', { count: 'exact', head: true })
				.gte('created_at', todayISO),

			// Today's errors
			supabase
				.from('transaction_logs')
				.select('id', { count: 'exact', head: true })
				.gte('created_at', todayISO)
				.eq('status', 'error'),

			// Today's success + total for rate calculation
			supabase
				.from('transaction_logs')
				.select('id', { count: 'exact', head: true })
				.gte('created_at', todayISO)
				.eq('status', 'success'),

			// Distinct users today — fetch minimal data and deduplicate
			supabase
				.from('transaction_logs')
				.select('user_id')
				.gte('created_at', todayISO)
				.not('user_id', 'is', null)
				.range(0, 9999),
		])

		const todayTotal = todayLogs.count ?? 0
		const todaySuccessCount = todayAll.count ?? 0
		const todayErrorCount = todayErrors.count ?? 0
		const successRate = todayTotal > 0
			? Math.round((todaySuccessCount / todayTotal) * 1000) / 10
			: 100

		// Count unique users from result set
		const uniqueUserIds = new Set(
			(distinctUsers.data || []).map(r => r.user_id).filter(Boolean)
		)

		return NextResponse.json({
			today_total: todayTotal,
			success_rate: successRate,
			today_errors: todayErrorCount,
			unique_users_today: uniqueUserIds.size,
		})
	} catch (error) {
		console.error('Transaction log stats error:', error)
		return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
	}
}
