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
			created_at
		`)
		.eq('result_status', 'Published')

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

	return NextResponse.json({ data: data || [], total: data?.length || 0 })
})
