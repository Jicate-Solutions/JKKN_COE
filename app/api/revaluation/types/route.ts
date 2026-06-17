import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/revaluation/types
// Fetch revaluation types (master list)
// Query: is_active=true to only return active types
// =====================================================
export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const isActive = searchParams.get('is_active')

	try {
		let query = supabase
			.from('revaluation_types')
			.select('*')
			.order('display_order', { ascending: true })
			.order('type_name', { ascending: true })

		if (isActive !== null && isActive !== undefined) {
			query = query.eq('is_active', isActive === 'true')
		}

		const { data, error } = await query

		if (error) {
			console.error('Revaluation types fetch error:', error)
			return NextResponse.json({ error: 'Failed to fetch revaluation types' }, { status: 500 })
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('Revaluation types fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch revaluation types' }, { status: 500 })
	}
}

// =====================================================
// POST /api/revaluation/types
// Create a revaluation type
// =====================================================
export async function POST(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()

		if (!body.type_code || !String(body.type_code).trim()) {
			return NextResponse.json({ error: 'Type code is required' }, { status: 400 })
		}
		if (!body.type_name || !String(body.type_name).trim()) {
			return NextResponse.json({ error: 'Type name is required' }, { status: 400 })
		}

		const { data, error } = await supabase
			.from('revaluation_types')
			.insert({
				type_code: String(body.type_code).trim().toUpperCase(),
				type_name: String(body.type_name).trim(),
				description: body.description || null,
				display_order: body.display_order ?? 0,
				is_active: body.is_active ?? true,
			})
			.select()
			.single()

		if (error) {
			console.error('Revaluation type creation error:', error)
			if (error.code === '23505') {
				return NextResponse.json({ error: 'A type with this code already exists' }, { status: 400 })
			}
			return NextResponse.json({ error: 'Failed to create revaluation type' }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	} catch (error) {
		console.error('Revaluation type creation error:', error)
		return NextResponse.json({ error: 'Failed to create revaluation type' }, { status: 500 })
	}
}

// =====================================================
// PUT /api/revaluation/types
// Update a revaluation type (type_code is immutable)
// =====================================================
export async function PUT(request: Request) {
	const supabase = getSupabaseServer()

	try {
		const body = await request.json()
		const { id, ...updateData } = body

		if (!id) {
			return NextResponse.json({ error: 'Type ID is required' }, { status: 400 })
		}

		// type_code is the key referenced by periods — don't allow changing it here
		delete updateData.type_code

		const { data, error } = await supabase
			.from('revaluation_types')
			.update(updateData)
			.eq('id', id)
			.select()
			.single()

		if (error) {
			console.error('Revaluation type update error:', error)
			return NextResponse.json({ error: 'Failed to update revaluation type' }, { status: 500 })
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Revaluation type update error:', error)
		return NextResponse.json({ error: 'Failed to update revaluation type' }, { status: 500 })
	}
}

// =====================================================
// DELETE /api/revaluation/types?id=...
// Delete a revaluation type (blocked if in use by a period)
// =====================================================
export async function DELETE(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const id = searchParams.get('id')

	if (!id) {
		return NextResponse.json({ error: 'Type ID is required' }, { status: 400 })
	}

	try {
		// Look up the code so we can check usage
		const { data: type } = await supabase
			.from('revaluation_types')
			.select('type_code')
			.eq('id', id)
			.maybeSingle()

		if (type?.type_code) {
			const { data: inUse } = await supabase
				.from('revaluation_registration_periods')
				.select('id')
				.eq('revaluation_type', type.type_code)
				.limit(1)

			if (inUse && inUse.length > 0) {
				return NextResponse.json(
					{ error: 'Cannot delete — this type is used by one or more revaluation periods' },
					{ status: 400 }
				)
			}
		}

		const { error } = await supabase.from('revaluation_types').delete().eq('id', id)

		if (error) {
			console.error('Revaluation type deletion error:', error)
			if (error.code === '23503') {
				return NextResponse.json(
					{ error: 'Cannot delete — this type is in use' },
					{ status: 400 }
				)
			}
			return NextResponse.json({ error: 'Failed to delete revaluation type' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Revaluation type deletion error:', error)
		return NextResponse.json({ error: 'Failed to delete revaluation type' }, { status: 500 })
	}
}
