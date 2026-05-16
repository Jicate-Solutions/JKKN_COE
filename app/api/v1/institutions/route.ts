import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth, corsOptionsHandler } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

// CORS preflight for browser-based child apps
export const OPTIONS = corsOptionsHandler

/**
 * GET /api/v1/institutions
 *
 * Returns institutions accessible by the API key.
 * If the key is scoped to specific institutions, only those are returned.
 *
 * Permission required: institutions:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Query params:
 *   - institution_code (optional): Filter by code (e.g., "CAS")
 */
export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const institutionCode = searchParams.get('institution_code')

		let query = supabase
			.from('institutions')
			.select('id, institution_code, name, myjkkn_institution_ids, is_active')
			.eq('is_active', true)
			.order('institution_code')

		// Scope to allowed institutions if key is restricted
		if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			query = query.in('id', context.allowedInstitutionIds)
		}

		if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching institutions:', error)
			return NextResponse.json({ error: 'Failed to fetch institutions' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('Institutions API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
