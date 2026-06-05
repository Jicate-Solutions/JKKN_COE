import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const sessionId = searchParams.get('session_id')
	const institutionId = searchParams.get('institution_id')
	const learnerId = searchParams.get('learner_id')

	// =========================================================
	// VISIBILITY GATE
	// Results are only exposed once the examination session's
	// result_declaration_date has arrived (<= now) AND the marks are
	// Published. We first resolve which sessions have "gone live", then
	// restrict the marks query to those sessions. A session with a NULL or
	// future result_declaration_date is NOT yet visible to learners.
	// =========================================================
	const nowIso = new Date().toISOString()

	let sessionQuery = supabase
		.from('examination_sessions')
		.select('id, result_declaration_date, session_status')
		.not('result_declaration_date', 'is', null)
		.lte('result_declaration_date', nowIso)

	if (ctx.allowedInstitutionIds.length > 0) {
		sessionQuery = sessionQuery.in('institutions_id', ctx.allowedInstitutionIds)
	}
	if (institutionId) sessionQuery = sessionQuery.eq('institutions_id', institutionId)
	if (sessionId) sessionQuery = sessionQuery.eq('id', sessionId)

	const { data: liveSessions, error: sessionError } = await sessionQuery.range(0, 9999)

	if (sessionError) {
		console.error('External API - fetch declared sessions error:', sessionError)
		return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 })
	}

	const liveSessionIds = (liveSessions || []).map((s: any) => s.id)

	// Map session id -> its declaration date/time & status so each returned
	// mark row can carry when its result was declared.
	const sessionMetaById = new Map<string, { result_declaration_date: string | null; session_status: string | null }>(
		(liveSessions || []).map((s: any) => [s.id, {
			result_declaration_date: s.result_declaration_date,
			session_status: s.session_status,
		}])
	)

	// No session has reached its result declaration date/time yet → nothing visible.
	if (liveSessionIds.length === 0) {
		return NextResponse.json({ data: [], total: 0 })
	}

	let query = supabase
		.from('final_marks')
		.select(`
			id,
			student_id,
			register_number,
			course_offering_id,
			course_id,
			program_code,
			internal_marks_obtained,
			internal_marks_maximum,
			external_marks_obtained,
			external_marks_maximum,
			total_marks_obtained,
			total_marks_maximum,
			percentage,
			letter_grade,
			grade_points,
			credit,
			total_grade_points,
			is_pass,
			pass_status,
			result_status,
			is_locked,
			examination_session_id,
			created_at
		`)
		.eq('result_status', 'Published')
		.in('examination_session_id', liveSessionIds)

	if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (sessionId) query = query.eq('examination_session_id', sessionId)
	if (institutionId) query = query.eq('institutions_id', institutionId)
	if (learnerId) query = query.eq('student_id', learnerId)

	const { data, error } = await query.range(0, 9999)

	if (error) {
		console.error('External API - fetch results error:', error)
		return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 })
	}

	// Attach the session's result declaration date/time (and status) to each row.
	const rows = (data || []).map((row: any) => {
		const meta = sessionMetaById.get(row.examination_session_id)
		return {
			...row,
			result_declaration_date: meta?.result_declaration_date ?? null,
			session_status: meta?.session_status ?? null,
		}
	})

	return NextResponse.json({ data: rows, total: rows.length })
})
