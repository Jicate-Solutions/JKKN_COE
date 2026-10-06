import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { runLearnerIdentitySync } from '@/lib/learner-identity-sync'

/**
 * Cron endpoint: daily sync of learner names and register numbers from MyJKKN
 * into every COE table that copies them (see lib/learner-identity-sync.ts).
 *
 * Scheduled in vercel.json. Vercel Cron calls with GET and sends
 * `Authorization: Bearer <CRON_SECRET>`; without CRON_SECRET set the endpoint
 * refuses to run, because /api/cron is reachable without a COE login.
 */

export const maxDuration = 300

export async function GET(request: Request) {
	const cronSecret = process.env.CRON_SECRET
	if (!cronSecret) {
		return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
	}
	if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	try {
		const { plan, result } = await runLearnerIdentitySync(getSupabaseServer(), { trigger: 'cron' })
		return NextResponse.json({
			success: result.errors.length === 0,
			scanned: plan.scanned,
			learners: result.learners,
			names: result.names,
			register_numbers: result.register_numbers,
			rows: result.rows,
			skipped: plan.skipped.length,
			errors: [...plan.errors, ...result.errors],
		})
	} catch (error) {
		console.error('[cron/sync-learner-identity] error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		)
	}
}
