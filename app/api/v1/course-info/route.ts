import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * External GET /api/v1/course-info
 *
 * Public-facing master list of course types (drives the Course Type dropdown).
 * The `display_code` returned here is combined with `courses.course_level`
 * to form `courses.course_type_code` (e.g., 'Core-I').
 *
 * Read-only. No create/update/delete.
 *
 * Query params:
 *   - status      'active' | 'inactive'  (default: active)
 *   - search      substring match on course_type or display_code
 *   - course_type exact match on course_type
 */
export const GET = withExternalAuth(async (request: Request, _context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const status = searchParams.get('status') || 'active'
		const search = searchParams.get('search')
		const courseType = searchParams.get('course_type')

		let query = supabase
			.from('course_info')
			.select('id, course_type, display_code, description, sort_order, status, created_at, updated_at', { count: 'exact' })
			.order('sort_order', { ascending: true })
			.order('course_type', { ascending: true })
			.range(0, 9999)

		if (status === 'active') {
			query = query.eq('status', true)
		} else if (status === 'inactive') {
			query = query.eq('status', false)
		}

		if (courseType) {
			query = query.eq('course_type', courseType)
		}

		if (search) {
			query = query.or(`course_type.ilike.%${search}%,display_code.ilike.%${search}%`)
		}

		const { data, error, count } = await query

		if (error) {
			console.error('v1 course-info GET error:', error)
			return NextResponse.json({
				error: 'Failed to fetch course info',
				code: 'COURSE_INFO_FETCH_FAILED',
			}, { status: 500 })
		}

		return NextResponse.json({
			data: data || [],
			total: count ?? (data?.length ?? 0),
		})
	} catch (err) {
		console.error('v1 course-info GET exception:', err)
		return NextResponse.json({
			error: 'Internal server error',
			code: 'INTERNAL_ERROR',
		}, { status: 500 })
	}
})
