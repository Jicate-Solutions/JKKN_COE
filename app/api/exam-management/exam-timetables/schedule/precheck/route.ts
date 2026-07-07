import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { detectLearnerClashes } from '@/lib/exam-clash'

/**
 * POST — live learner-clash pre-check for the schedule page.
 * Runs the same detection as the save guard, but read-only, so the UI can flag
 * clashes as subjects / date / session are chosen (before Save).
 *
 * Body: { institutions_id, examination_session_id, exam_date, session, offerings: [{course_offering_id, course_code?, exam_timetable_id?}] }
 */
export async function POST(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		const { institutions_id, examination_session_id, exam_date, session, offerings } = body || {}

		if (!institutions_id || !examination_session_id || !exam_date || !session) {
			// Not enough context to check yet — treat as "no clash" so the UI stays quiet.
			return NextResponse.json({ conflict_count: 0, conflicts: [] })
		}
		if (!Array.isArray(offerings) || offerings.length === 0) {
			return NextResponse.json({ conflict_count: 0, conflicts: [] })
		}
		if (!['FN', 'AN'].includes(String(session).toUpperCase())) {
			return NextResponse.json({ conflict_count: 0, conflicts: [] })
		}

		const conflicts = await detectLearnerClashes(supabase, {
			institutions_id,
			examination_session_id,
			exam_date,
			session: String(session).toUpperCase(),
			offerings: offerings.map((o: any) => ({
				course_offering_id: o.course_offering_id,
				course_code: o.course_code,
				exam_timetable_id: o.exam_timetable_id,
			})),
		})

		return NextResponse.json({
			conflict_count: conflicts.length,
			conflicts: conflicts.slice(0, 100),
		})
	} catch (e) {
		console.error('[schedule precheck] error:', e)
		return NextResponse.json({ error: 'Pre-check failed' }, { status: 500 })
	}
}
