import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'

/**
 * GET /api/v1/cia-settings
 *
 * Returns CIA entry settings (round config, components, dates) for an institution + session.
 * Used by MyJKKN to determine which CIA rounds exist and what components to show.
 *
 * Permission required: cia-settings:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Query params:
 *   - institutions_id (required): COE institution UUID
 *   - examination_session_id (required): Exam session UUID
 *   - program_code (optional): Filter by program
 */
export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionsId = searchParams.get('institutions_id')
		const sessionId = searchParams.get('examination_session_id')
		const programCode = searchParams.get('program_code')

		if (!institutionsId || !sessionId) {
			return NextResponse.json({ error: 'institutions_id and examination_session_id are required' }, { status: 400 })
		}

		// Verify institution access
		if (context.allowedInstitutionIds && context.allowedInstitutionIds.length > 0) {
			if (!context.allowedInstitutionIds.includes(institutionsId)) {
				return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
			}
		}

		const { data, error } = await supabase
			.from('cia_entry_settings')
			.select('*')
			.eq('institutions_id', institutionsId)
			.eq('examination_session_id', sessionId)
			.eq('is_active', true)

		if (error) {
			console.error('Error fetching CIA settings:', error)
			return NextResponse.json({ error: 'Failed to fetch CIA settings' }, { status: 500 })
		}

		let results = data || []

		// Filter by program_code if provided
		if (programCode) {
			results = results.filter((s: any) =>
				Array.isArray(s.program_codes) && s.program_codes.includes(programCode)
			)
		}

		return NextResponse.json(results)
	} catch (error) {
		console.error('CIA settings API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
