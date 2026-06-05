import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth, corsOptionsHandler } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * GET /api/v1/grade-system
 *
 * Read-only (view) endpoint returning grade system definitions.
 * This resource is VIEW ONLY — there are no create/update/delete handlers,
 * so POST/PUT/PATCH/DELETE are not supported.
 *
 * Permission required: grade-system:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Query params:
 *   - institution_id     (optional): COE institution UUID. Required when the
 *                        key is granted global (all-institution) access.
 *   - grade_system_code  (optional): e.g. "UG", "PG"
 *   - regulation_id      (optional): filter by regulation
 *   - is_active          (optional): "true" | "false" (defaults to active only)
 */
export const GET = withExternalAuth(async (request: Request, ctx: ExternalApiContext) => {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const institutionId = searchParams.get('institution_id') || searchParams.get('institutions_id')
	const gradeSystemCode = searchParams.get('grade_system_code')
	const regulationId = searchParams.get('regulation_id')
	const isActiveParam = searchParams.get('is_active')

	// If the key is scoped to specific institutions, a requested institution
	// must be one of them.
	if (institutionId && ctx.allowedInstitutionIds.length > 0 && !ctx.allowedInstitutionIds.includes(institutionId)) {
		return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
	}

	let query = supabase
		.from('grade_system')
		.select(`
			id,
			institutions_id,
			institutions_code,
			grade_system_code,
			grade_id,
			grade,
			grade_point,
			min_mark,
			max_mark,
			description,
			regulation_id,
			regulation_code,
			is_active,
			grades:grade_id (
				id,
				qualify,
				is_absent,
				exclude_cgpa,
				result_status
			)
		`)
		.order('grade_system_code', { ascending: true })
		.order('min_mark', { ascending: false })

	// Active-only by default; allow explicit override.
	if (isActiveParam === null) {
		query = query.eq('is_active', true)
	} else if (isActiveParam === 'true' || isActiveParam === 'false') {
		query = query.eq('is_active', isActiveParam === 'true')
	}

	// Institution scoping: explicit param wins, otherwise restrict to the
	// key's allowed institutions when it is not a global key.
	if (institutionId) {
		query = query.eq('institutions_id', institutionId)
	} else if (ctx.allowedInstitutionIds.length > 0) {
		query = query.in('institutions_id', ctx.allowedInstitutionIds)
	}

	if (gradeSystemCode) query = query.eq('grade_system_code', gradeSystemCode)
	if (regulationId) query = query.eq('regulation_id', regulationId)

	const { data, error } = await query.range(0, 9999)

	if (error) {
		console.error('External API - fetch grade_system error:', error)
		return NextResponse.json({ error: 'Failed to fetch grade system' }, { status: 500 })
	}

	return NextResponse.json({ data: data || [], total: data?.length || 0 })
})

// CORS preflight for browser-based consumers.
export const OPTIONS = corsOptionsHandler
