import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * GET /api/v1/examination-sessions
 *
 * Returns examination sessions for an institution.
 *
 * Permission required: examination-sessions:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Query params:
 *   - institutions_id (required): COE institution UUID
 *   - session_status (optional): Filter by status (e.g., "Active")
 */
export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionsId = searchParams.get('institutions_id')
		const sessionStatus = searchParams.get('session_status')

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
			.from('examination_sessions')
			.select('id, session_code, session_name, institutions_id, exam_start_date, exam_end_date, session_status, month_year')
			.eq('institutions_id', institutionsId)
			.order('created_at', { ascending: false })

		if (sessionStatus) {
			query = query.eq('session_status', sessionStatus)
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching examination sessions:', error)
			return NextResponse.json({ error: 'Failed to fetch examination sessions' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('Examination sessions API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
