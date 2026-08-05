import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { withExternalAuth, corsOptionsHandler } from '@/lib/api-auth/middleware'
import type { ExternalApiContext } from '@/types/api-management'
import { parseRoleTags, toFilterTags, COE_ROLE_TAGS } from '@/lib/coe-calendar/visibility'
import { csv } from '@/lib/coe-calendar/validate'

// CORS preflight for browser-based child apps
export const OPTIONS = corsOptionsHandler

const EVENT_SELECT =
	'id, institutions_id, institution_code, myjkkn_institution_ids, academic_year,' +
	' programme_type, exam_category, event_title, event_description,' +
	' event_start_date, event_end_date, visible_to_roles, program_codes, status,' +
	' is_bulk_uploaded, created_at, updated_at'

/** Guards a stored row against the key's institution scope. */
function institutionAllowed(context: ExternalApiContext, institutionsId: string): boolean {
	if (!context.allowedInstitutionIds?.length) return true
	return context.allowedInstitutionIds.includes(institutionsId)
}

/**
 * GET /api/v1/coe-calendar
 *
 * External COE calendar feed for MyJKKN and other child applications.
 * **View only:** there are no create/update/delete operations on this resource —
 * calendar events are authored in the COE portal.
 *
 * Permission required: coe-calendar:read
 * Auth: X-API-Key-Id + X-API-Secret headers
 *
 * Audience filtering is the point of this endpoint: rows carry
 * `visible_to_roles`, and a caller only receives rows overlapping the roles it
 * asks for. Rows tagged COE_OFFICE therefore never reach a learner-facing
 * request. Omitting `roles` returns everything the key is allowed to see, so
 * callers rendering a learner view must pass roles=LEARNERS.
 *
 * Query params:
 *   id                      single event UUID (returns one record)
 *   roles                   csv of audience tags (LEARNERS, TEACHING, ...)
 *   myjkkn_institution_ids  csv of MyJKKN institution UUIDs
 *   institution_code        alternative institution filter
 *   academic_year           e.g. 2025-2026
 *   exam_category           csv of category codes
 *   programme_type          UG | PG | BOTH (level)
 *   program_codes           csv of programme codes; also returns institution-wide
 *                           events, which carry program_codes = null
 *   from / to               date window (YYYY-MM-DD); returns overlapping events
 *   status                  ACTIVE (default) | INACTIVE | ALL
 *   limit                   default 500, max 5000
 */
export const GET = withExternalAuth(async (request: Request, context: ExternalApiContext) => {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		// ---- single record ----
		const id = searchParams.get('id')
		if (id) {
			const { data, error } = await supabase
				.from('coe_calendar')
				.select(EVENT_SELECT)
				.eq('id', id)
				.maybeSingle()

			if (error || !data) {
				return NextResponse.json({ error: 'Calendar event not found' }, { status: 404 })
			}
			if (!institutionAllowed(context, data.institutions_id)) {
				return NextResponse.json({ error: 'Access denied for this institution' }, { status: 403 })
			}
			return NextResponse.json({ data, request_id: context.requestId })
		}

		const rolesParam = searchParams.get('roles')
		const myjkknIds = csv(searchParams.get('myjkkn_institution_ids'))
		const institutionCode = searchParams.get('institution_code')
		const academicYear = searchParams.get('academic_year')
		const categories = csv(searchParams.get('exam_category'))
		const programmeType = searchParams.get('programme_type')
		const from = searchParams.get('from')
		const to = searchParams.get('to')
		const status = searchParams.get('status') || 'ACTIVE'
		const limit = Math.min(Number(searchParams.get('limit')) || 500, 5000)

		let query = supabase
			.from('coe_calendar')
			.select(
				'id, institutions_id, institution_code, myjkkn_institution_ids, academic_year,' +
				' programme_type, exam_category, event_title, event_description,' +
				' event_start_date, event_end_date, visible_to_roles, program_codes, status, updated_at',
			)

		// The API key's own institution scope always wins — a caller cannot
		// widen it by passing institution ids it was not granted.
		if (context.allowedInstitutionIds?.length) {
			query = query.in('institutions_id', context.allowedInstitutionIds)
		}

		if (myjkknIds.length) {
			query = query.overlaps('myjkkn_institution_ids', myjkknIds)
		} else if (institutionCode) {
			query = query.eq('institution_code', institutionCode)
		}

		if (rolesParam) {
			const tags = parseRoleTags(rolesParam)
			if (!tags) {
				return NextResponse.json(
					{
						error: `Invalid roles. Valid values: ${COE_ROLE_TAGS.join(', ')}`,
						code: 'INVALID_ROLES',
					},
					{ status: 400 },
				)
			}
			query = query.overlaps('visible_to_roles', toFilterTags(tags))
		}

		// Rows with NULL program_codes apply to every programme, so they must
		// accompany the ones explicitly naming the requested codes.
		const programCodes = csv(searchParams.get('program_codes'))
		if (programCodes.length) {
			query = query.or(`program_codes.is.null,program_codes.ov.{${programCodes.join(',')}}`)
		}

		if (academicYear) query = query.eq('academic_year', academicYear)
		if (categories.length) query = query.in('exam_category', categories)
		if (programmeType) query = query.eq('programme_type', programmeType)
		if (status !== 'ALL') query = query.eq('status', status)

		// Overlap semantics: an event counts if any part of it falls in the window.
		if (to) query = query.lte('event_start_date', to)
		if (from) query = query.gte('event_end_date', from)

		const { data, error } = await query
			.order('event_start_date', { ascending: true })
			.order('id', { ascending: true })
			.range(0, limit - 1)

		if (error) {
			console.error('v1 coe-calendar error:', error)
			return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 })
		}

		// Category presentation travels with the feed so child apps do not have
		// to hardcode colours that only exist in the COE UI today.
		const codes = Array.from(new Set((data || []).map(e => e.exam_category)))
		let categoryMap: Record<string, { label: string; color_code: string }> = {}

		if (codes.length) {
			const { data: catRows } = await supabase
				.from('coe_calendar_categories')
				.select('code, label, color_code')
				.in('code', codes)

			categoryMap = Object.fromEntries(
				(catRows || []).map(c => [c.code, { label: c.label, color_code: c.color_code }]),
			)
		}

		return NextResponse.json({
			data: (data || []).map(event => ({
				...event,
				category: categoryMap[event.exam_category] || null,
			})),
			count: data?.length || 0,
			request_id: context.requestId,
		})
	} catch (error) {
		console.error('v1 coe-calendar API error:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
})
