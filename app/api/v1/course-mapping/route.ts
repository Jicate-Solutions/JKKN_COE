import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * GET /api/v1/course-mapping
 *
 * Returns course mappings (program → course → semester linkage rows) with optional filters.
 * Used by MyJKKN to discover which courses belong to which program/semester/regulation.
 *
 * Permission required: course-mapping:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Query params:
 *   - institutions_id (required): COE institution UUID
 *   - program_code (optional): Filter by program (e.g., "UEN")
 *   - course_code (optional): Filter by course code
 *   - semester_code (optional): Filter by semester code (e.g., "S2")
 *   - batch_code (optional): Filter by batch
 *   - regulation_code (optional): Filter by regulation
 *   - course_category (optional): Filter by category
 *   - is_active (optional): "true" or "false" — defaults to true
 *   - limit (optional): Max records, default 5000, max 10000
 */
export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionsId = searchParams.get('institutions_id')
		const programCode = searchParams.get('program_code')
		const courseCode = searchParams.get('course_code')
		const semesterCode = searchParams.get('semester_code')
		const batchCode = searchParams.get('batch_code')
		const regulationCode = searchParams.get('regulation_code')
		const courseCategory = searchParams.get('course_category')
		const isActiveParam = searchParams.get('is_active')
		const limit = Math.min(Number(searchParams.get('limit')) || 5000, 10000)

		if (!institutionsId) {
			return NextResponse.json({ error: 'institutions_id is required' }, { status: 400 })
		}

		// Verify institution access
		if (ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(institutionsId)) {
			return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
		}

		let query = supabase
			.from('course_mapping')
			.select(`
				id, institutions_id, institution_code,
				program_id, program_code,
				course_id, course_code,
				batch_id, batch_code,
				regulation_id, regulation_code,
				semester_id, semester_code,
				course_group, course_category, course_order,
				annual_semester, registration_based, is_active
			`)
			.eq('institutions_id', institutionsId)
			.order('program_code')
			.order('semester_code')
			.order('course_order', { ascending: true, nullsFirst: false })
			.order('course_code')

		// Default to active rows unless caller explicitly asks for all
		if (isActiveParam === 'false') query = query.eq('is_active', false)
		else if (isActiveParam !== 'all') query = query.eq('is_active', true)

		if (programCode) query = query.eq('program_code', programCode)
		if (courseCode) query = query.eq('course_code', courseCode)
		if (semesterCode) query = query.eq('semester_code', semesterCode)
		if (batchCode) query = query.eq('batch_code', batchCode)
		if (regulationCode) query = query.eq('regulation_code', regulationCode)
		if (courseCategory) query = query.eq('course_category', courseCategory)

		const { data, error } = await query.range(0, limit - 1)

		if (error) {
			console.error('Error fetching course_mapping:', error)
			return NextResponse.json({ error: 'Failed to fetch course mapping' }, { status: 500 })
		}

		return NextResponse.json({ data: data || [], total: data?.length || 0 })
	} catch (error) {
		console.error('Course mapping API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
