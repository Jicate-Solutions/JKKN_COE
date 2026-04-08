import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * GET /api/v1/courses
 *
 * Returns courses for an institution with optional filters.
 *
 * Permission required: courses:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Query params:
 *   - institutions_id (required): COE institution UUID
 *   - course_code (optional): Filter by exact course code
 *   - course_category (optional): Filter by category (Theory, Practical, etc.)
 *   - evaluation_type (optional): Filter by evaluation type (CIA, ESE, CIA + ESE)
 *   - regulation_code (optional): Filter by regulation
 *   - program_code (optional): Filter by program
 */
export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionsId = searchParams.get('institutions_id')
		const courseCode = searchParams.get('course_code')
		const courseCategory = searchParams.get('course_category')
		const evaluationType = searchParams.get('evaluation_type')
		const regulationCode = searchParams.get('regulation_code')
		const programCode = searchParams.get('program_code')

		if (!institutionsId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		// Verify institution access
		if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			if (!context.allowedInstitutionIds.includes(institutionsId)) {
				return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
			}
		}

		let query = supabase
			.from('courses')
			.select(`
				id, institution_code, course_code, course_name, display_code,
				course_category, course_type, course_part_master,
				credit, theory_credit, practical_credit,
				qp_code, evaluation_type, regulation_code, program_code,
				internal_max_mark, internal_pass_mark,
				external_max_mark, external_pass_mark,
				total_max_mark, total_pass_mark,
				exam_duration, status
			`)
			.eq('institutions_id', institutionsId)
			.eq('status', true)
			.order('course_code')

		if (courseCode) query = query.eq('course_code', courseCode)
		if (courseCategory) query = query.eq('course_category', courseCategory)
		if (evaluationType) query = query.eq('evaluation_type', evaluationType)
		if (regulationCode) query = query.eq('regulation_code', regulationCode)
		if (programCode) query = query.eq('program_code', programCode)

		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('Error fetching courses:', error)
			return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('Courses API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
