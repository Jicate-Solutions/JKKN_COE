import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================================
// POST-EXAM RESULT RELEASE CONTROL
// Backing API for the /post-exam COE staff control page.
//
// A session's results are "live to learners" (visible via the public
// /api/v1/results consumed by MyJKKN) only when BOTH:
//   1. examination_sessions.result_declaration_date IS NOT NULL and <= now
//   2. final_marks.result_status = 'Published' (per learner-course row)
//
// GET   -> list sessions for an institution with published/total counts
//          and a computed visibility state.
// PATCH -> set / clear a session's result_declaration_date
//          (release now, schedule a date & time, or hide again).
// =====================================================================

// GET /api/post-exam?institutions_id=<uuid>
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')

		let sessionsQuery = supabase
			.from('examination_sessions')
			.select('id, session_code, session_name, session_status, exam_start_date, exam_end_date, result_declaration_date, institutions_id, month_year')
			.order('exam_end_date', { ascending: false })
			.range(0, 9999)

		if (institutionsId) {
			sessionsQuery = sessionsQuery.eq('institutions_id', institutionsId)
		}

		const { data: sessions, error } = await sessionsQuery

		if (error) {
			console.error('Post-exam sessions fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch examination sessions' }, { status: 500 })
		}

		const now = Date.now()

		// Attach per-session published/total final_marks counts and visibility.
		const enriched = await Promise.all(
			(sessions || []).map(async (s: any) => {
				const [{ count: totalCount }, { count: publishedCount }] = await Promise.all([
					supabase
						.from('final_marks')
						.select('id', { count: 'exact', head: true })
						.eq('examination_session_id', s.id)
						.eq('is_active', true),
					supabase
						.from('final_marks')
						.select('id', { count: 'exact', head: true })
						.eq('examination_session_id', s.id)
						.eq('is_active', true)
						.eq('result_status', 'Published'),
				])

				const declared = s.result_declaration_date ? new Date(s.result_declaration_date).getTime() : null
				const dateReached = declared !== null && declared <= now
				const hasPublished = (publishedCount || 0) > 0
				const isLiveToLearners = dateReached && hasPublished

				return {
					...s,
					total_final_marks: totalCount || 0,
					published_final_marks: publishedCount || 0,
					date_reached: dateReached,
					is_live_to_learners: isLiveToLearners,
				}
			})
		)

		return NextResponse.json(enriched)
	} catch (e) {
		console.error('Post-exam API GET error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PATCH /api/post-exam
// body: { id: string, result_declaration_date: string | null, updated_by?: string }
//   result_declaration_date:
//     - ISO string / datetime-local string -> schedule release at that time
//     - null -> hide results again (clears the date)
export async function PATCH(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const body = await request.json()

		if (!body.id) {
			return NextResponse.json({ error: 'Examination session ID is required' }, { status: 400 })
		}

		// Normalise the incoming value: empty string is treated as "clear".
		let declaration: string | null = null
		if (body.result_declaration_date) {
			const d = new Date(body.result_declaration_date)
			if (isNaN(d.getTime())) {
				return NextResponse.json({ error: 'Invalid result declaration date & time' }, { status: 400 })
			}
			declaration = d.toISOString()
		}

		const updatePayload: Record<string, unknown> = {
			result_declaration_date: declaration,
			updated_by: body.updated_by || null,
		}

		// When the declaration date is set to now or the past, the results are
		// actually being declared -> mark the session 'Results Declared'.
		// A future-scheduled date (not yet reached) or a cleared date leaves the
		// existing session_status untouched.
		if (declaration && new Date(declaration).getTime() <= Date.now()) {
			updatePayload.session_status = 'Results Declared'
		}

		const { data, error } = await supabase
			.from('examination_sessions')
			.update(updatePayload)
			.eq('id', body.id)
			.select('id, result_declaration_date, session_status')
			.single()

		if (error) {
			console.error('Post-exam declaration update error:', error)
			return NextResponse.json({ error: 'Failed to update result declaration date' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (e) {
		console.error('Post-exam API PATCH error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
