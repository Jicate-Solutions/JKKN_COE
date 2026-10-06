import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { previewLearnerIdentitySync, runLearnerIdentitySync } from '@/lib/learner-identity-sync'

/**
 * POST /api/exam-management/exam-registrations/sync-learners
 *
 * The "Sync from MyJKKN" button. Brings the learner name and register number
 * stored on exam registrations (and every other COE table that copies them)
 * back in step with MyJKKN, matching rows on student_id.
 *
 *   { institutions_id?, preview_only: true }  -> what would change, nothing written
 *   { institutions_id? }                      -> rebuild the plan and apply it
 *
 * Without institutions_id every institution is covered — the same run the daily
 * cron does (/api/cron/sync-learner-identity).
 */

// A full scan reads ~100k rows and the first run can touch a few hundred learners.
export const maxDuration = 300

export async function POST(request: Request) {
	try {
		const body = await request.json().catch(() => ({}))
		const institutionsId: string | undefined = body?.institutions_id || undefined
		const supabase = getSupabaseServer()

		if (body?.preview_only) {
			return NextResponse.json({ plan: await previewLearnerIdentitySync(supabase, { institutionsId }) })
		}

		const { plan, result } = await runLearnerIdentitySync(supabase, { institutionsId, trigger: 'manual' })
		return NextResponse.json({
			success: result.errors.length === 0,
			plan,
			result,
			message:
				result.learners === 0
					? 'Everything already matches MyJKKN.'
					: `Updated ${result.learners} learner${result.learners === 1 ? '' : 's'}: ${result.names} name${result.names === 1 ? '' : 's'}, ${result.register_numbers} register number${result.register_numbers === 1 ? '' : 's'}.` +
						(result.errors.length ? ` ${result.errors.length} table update(s) failed — see server log.` : ''),
		})
	} catch (error) {
		console.error('[exam-registrations/sync-learners] error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		)
	}
}
