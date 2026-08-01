import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { parseRoleTags } from '@/lib/coe-calendar/visibility'

/**
 * GET /api/coe-calendar/categories
 *
 * Categories are institution-scoped. With institutions_id, returns exactly that
 * institution's categories; without it (super_admin viewing all), returns every
 * institution's categories — used only for event styling, not management.
 *
 * Query params:
 *   - institutions_id (optional)  restrict to this institution's categories
 *   - include_inactive=true       include is_active = false
 */
export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const includeInactive = searchParams.get('include_inactive') === 'true'

	let query = supabase
		.from('coe_calendar_categories')
		.select('*')
		.order('sort_order', { ascending: true })
		.order('code', { ascending: true })

	if (!includeInactive) query = query.eq('is_active', true)

	// Categories belong to exactly one institution; scope strictly to it.
	if (institutionsId) {
		query = query.eq('institutions_id', institutionsId)
	}

	const { data, error } = await query

	if (error) {
		console.error('coe_calendar_categories GET error:', error)
		return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
	}

	return NextResponse.json(data || [])
}

/**
 * POST /api/coe-calendar/categories
 *
 * Creates a category. `code` is the stable machine key referenced by
 * coe_calendar.exam_category, so it is uppercased and constrained here.
 */
export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()

	const code = String(body.code || '').trim().toUpperCase().replace(/[\s-]+/g, '_')
	const label = String(body.label || '').trim()

	if (!code) {
		return NextResponse.json({ error: 'Category code is required' }, { status: 400 })
	}
	if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
		return NextResponse.json(
			{ error: 'Code must start with a letter and contain only A-Z, 0-9 and underscore' },
			{ status: 400 },
		)
	}
	if (!label) {
		return NextResponse.json({ error: 'Category label is required' }, { status: 400 })
	}

	const defaultTags = body.default_visible_to_roles
		? parseRoleTags(body.default_visible_to_roles)
		: ['ALL']

	if (!defaultTags) {
		return NextResponse.json({ error: 'Invalid default_visible_to_roles' }, { status: 400 })
	}

	// Categories are institution-scoped — an owning institution is mandatory.
	const institutionsId = body.institutions_id
	if (!institutionsId) {
		return NextResponse.json(
			{ error: 'Select an institution — categories belong to one institution' },
			{ status: 400 },
		)
	}

	const { data, error } = await supabase
		.from('coe_calendar_categories')
		.insert({
			code,
			label,
			description: body.description?.trim() || null,
			color_code: body.color_code || '#64748B',
			bg_class: body.bg_class || null,
			text_class: body.text_class || null,
			icon_name: body.icon_name || null,
			default_visible_to_roles: defaultTags,
			sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
			institutions_id: institutionsId,
			is_active: body.is_active !== false,
		})
		.select()
		.single()

	if (error) {
		// Unique is now (institutions_id, code) — a clash means this institution.
		if (error.code === '23505') {
			return NextResponse.json(
				{ error: `Category "${code}" already exists for this institution` },
				{ status: 409 },
			)
		}
		console.error('coe_calendar_categories POST error:', error)
		return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
	}

	return NextResponse.json(data, { status: 201 })
}
