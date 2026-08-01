import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { parseRoleTags } from '@/lib/coe-calendar/visibility'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PUT /api/coe-calendar/categories/[id]
 *
 * `code` is intentionally not updatable here — it is the FK target for every
 * coe_calendar row, so renaming it is a data migration, not an edit.
 */
export async function PUT(request: Request, { params }: RouteContext) {
	const supabase = getSupabaseServer()
	const { id } = await params
	const body = await request.json()

	if (!id) {
		return NextResponse.json({ error: 'ID is required' }, { status: 400 })
	}

	const update: Record<string, unknown> = {}

	if (body.label !== undefined) {
		const label = String(body.label).trim()
		if (!label) return NextResponse.json({ error: 'Label is required' }, { status: 400 })
		update.label = label
	}
	if (body.description !== undefined) {
		update.description = String(body.description).trim() || null
	}
	if (body.color_code !== undefined) {
		const color = String(body.color_code).trim()
		if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
			return NextResponse.json({ error: 'Colour must be a hex value like #3B82F6' }, { status: 400 })
		}
		update.color_code = color
	}
	if (body.bg_class !== undefined) update.bg_class = body.bg_class || null
	if (body.text_class !== undefined) update.text_class = body.text_class || null
	if (body.icon_name !== undefined) update.icon_name = body.icon_name || null
	if (body.sort_order !== undefined) {
		update.sort_order = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0
	}
	if (body.is_active !== undefined) update.is_active = !!body.is_active
	// institutions_id is immutable after create — moving a category would
	// break the composite FK on coe_calendar (institutions_id, exam_category).

	if (body.default_visible_to_roles !== undefined) {
		const tags = parseRoleTags(body.default_visible_to_roles)
		if (!tags) {
			return NextResponse.json({ error: 'Invalid default audience tags' }, { status: 400 })
		}
		update.default_visible_to_roles = tags
	}

	if (Object.keys(update).length === 0) {
		return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 })
	}

	const { data, error } = await supabase
		.from('coe_calendar_categories')
		.update(update)
		.eq('id', id)
		.select()
		.single()

	if (error) {
		console.error('coe_calendar_categories PUT error:', error)
		return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
	}

	if (!data) {
		return NextResponse.json({ error: 'Category not found' }, { status: 404 })
	}

	return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: RouteContext) {
	const supabase = getSupabaseServer()
	const { id } = await params

	if (!id) {
		return NextResponse.json({ error: 'ID is required' }, { status: 400 })
	}

	const { data: category } = await supabase
		.from('coe_calendar_categories')
		.select('code, institutions_id')
		.eq('id', id)
		.maybeSingle()

	if (!category) {
		return NextResponse.json({ error: 'Category not found' }, { status: 404 })
	}

	// Report the usage count instead of letting the FK throw an opaque 23503 —
	// "used by 12 events" tells the user what to do next. Scoped to this
	// category's institution, since the same code exists for other institutions.
	const { count } = await supabase
		.from('coe_calendar')
		.select('id', { count: 'exact', head: true })
		.eq('exam_category', category.code)
		.eq('institutions_id', category.institutions_id)

	if (count && count > 0) {
		return NextResponse.json(
			{
				error: `"${category.code}" is used by ${count} event${count !== 1 ? 's' : ''}. Deactivate it instead, or move those events to another category first.`,
			},
			{ status: 409 },
		)
	}

	const { error } = await supabase
		.from('coe_calendar_categories')
		.delete()
		.eq('id', id)

	if (error) {
		console.error('coe_calendar_categories DELETE error:', error)
		return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
	}

	return NextResponse.json({ success: true })
}
