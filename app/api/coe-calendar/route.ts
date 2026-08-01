import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { parseRoleTags, toFilterTags } from '@/lib/coe-calendar/visibility'
import {
	validateEventPayload,
	mapCalendarDbError,
	csv,
	sanitizeSearch,
	searchFilter,
} from '@/lib/coe-calendar/validate'
import { resolveProgramCodes } from '@/lib/coe-calendar/programs'

/**
 * GET /api/coe-calendar
 *
 * Internal (session) listing endpoint. Returns a bare array — the management
 * page and the dashboard hook both expect one, so the shape is kept stable.
 *
 * Query params:
 *   institutions_id         COE institution UUID
 *   myjkkn_institution_ids  MyJKKN institution UUIDs (csv) — mirrored column
 *   institution_code        legacy fallback
 *   academic_year           e.g. 2025-2026
 *   exam_category           csv of category codes
 *   programme_type          UG | PG | BOTH
 *   status                  ACTIVE (default) | INACTIVE | ALL
 *   roles                   csv of audience tags; rows overlapping them are returned
 *   from / to               date window (YYYY-MM-DD), matches overlapping events
 *   search                  matches event title
 */
export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const institutionCode = searchParams.get('institution_code')
	const myjkknIds = csv(searchParams.get('myjkkn_institution_ids'))
	const academicYear = searchParams.get('academic_year')
	const categories = csv(searchParams.get('exam_category'))
	const programmeType = searchParams.get('programme_type')
	const status = searchParams.get('status') || 'ACTIVE'
	const rolesParam = searchParams.get('roles')
	const from = searchParams.get('from')
	const to = searchParams.get('to')
	const search = searchParams.get('search')?.trim()
	const programCodes = csv(searchParams.get('program_codes'))

	let query = supabase.from('coe_calendar').select('*')

	if (myjkknIds.length) {
		// Mirrored column, GIN indexed — no join needed.
		query = query.overlaps('myjkkn_institution_ids', myjkknIds)
	} else if (institutionsId) {
		query = query.eq('institutions_id', institutionsId)
	} else if (institutionCode) {
		query = query.eq('institution_code', institutionCode)
	}

	if (academicYear) query = query.eq('academic_year', academicYear)
	if (categories.length) query = query.in('exam_category', categories)
	if (programmeType) query = query.eq('programme_type', programmeType)
	if (status !== 'ALL') query = query.eq('status', status)

	if (rolesParam) {
		const tags = parseRoleTags(rolesParam)
		if (!tags) {
			return NextResponse.json({ error: 'Invalid roles filter' }, { status: 400 })
		}
		// Appending ALL means rows tagged {ALL} overlap every caller, which
		// collapses "ALL OR overlap" into a single indexed condition.
		query = query.overlaps('visible_to_roles', toFilterTags(tags))
	}

	if (programCodes.length) {
		// A NULL program_codes means "every programme", so those rows must come
		// back alongside the ones explicitly naming the requested codes.
		query = query.or(`program_codes.is.null,program_codes.ov.{${programCodes.join(',')}}`)
	}

	// An event overlaps the window when it starts before the window ends and
	// ends after the window starts — not merely when its start date is inside.
	if (to) query = query.lte('event_start_date', to)
	if (from) query = query.gte('event_end_date', from)

	if (search && sanitizeSearch(search)) query = query.or(searchFilter(search))

	query = query
		.order('event_start_date', { ascending: true })
		.order('id', { ascending: true })

	const { data, error } = await query.range(0, 9999)

	if (error) {
		console.error('coe_calendar GET error:', error)
		return NextResponse.json({ error: 'Failed to fetch calendar events' }, { status: 500 })
	}

	return NextResponse.json(data || [])
}

export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()

	const { values, errors } = validateEventPayload(body)
	if (Object.keys(errors).length > 0) {
		return NextResponse.json(
			{ error: Object.values(errors)[0], errors },
			{ status: 400 },
		)
	}

	let institutions_id = body.institutions_id
	const institution_code = body.institution_code

	if (institution_code && !institutions_id) {
		const { data: inst } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', institution_code)
			.maybeSingle()
		if (!inst) {
			return NextResponse.json({ error: `Institution "${institution_code}" not found` }, { status: 400 })
		}
		institutions_id = inst.id
	}

	if (!institutions_id) {
		return NextResponse.json({ error: 'Institution is required' }, { status: 400 })
	}

	// Fall back to the category's configured default audience rather than
	// {ALL}, so a COE-internal category cannot leak by omission.
	let visibleToRoles = values.visible_to_roles
	if (!visibleToRoles) {
		const { data: category } = await supabase
			.from('coe_calendar_categories')
			.select('default_visible_to_roles')
			.eq('code', values.exam_category!)
			.eq('institutions_id', institutions_id)
			.maybeSingle()
		visibleToRoles = parseRoleTags(category?.default_visible_to_roles) || ['ALL']
	}

	const resolved = await resolveProgramCodes(supabase, institutions_id, values.program_codes)
	if (!resolved.ok) {
		return NextResponse.json(
			{ error: `Unknown programme code(s): ${resolved.unknown.join(', ')}` },
			{ status: 400 },
		)
	}

	const { data, error } = await supabase
		.from('coe_calendar')
		.insert({
			institutions_id,
			// institution_code and myjkkn_institution_ids are filled by the
			// trg_coe_calendar_fill_institution trigger.
			academic_year: values.academic_year,
			programme_type: values.programme_type,
			exam_category: values.exam_category,
			event_title: values.event_title,
			event_description: values.event_description ?? null,
			event_start_date: values.event_start_date,
			event_end_date: values.event_end_date,
			visible_to_roles: visibleToRoles,
			program_codes: resolved.codes,
			status: values.status || 'ACTIVE',
			is_bulk_uploaded: false,
		})
		.select()
		.single()

	if (error) {
		const mapped = mapCalendarDbError(error)
		if (mapped.status === 500) console.error('coe_calendar POST error:', error)
		return NextResponse.json({ error: mapped.message }, { status: mapped.status })
	}

	return NextResponse.json(data, { status: 201 })
}
