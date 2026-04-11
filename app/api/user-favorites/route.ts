import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/user-favorites?user_id=<uuid>
 * Fetch all favorites for a user, sorted by sort_order
 */
export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const userId = searchParams.get('user_id')

	if (!userId) {
		return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
	}

	const { data, error } = await supabase
		.from('user_favorites')
		.select('*')
		.eq('user_id', userId)
		.order('sort_order', { ascending: true })
		.order('created_at', { ascending: true })

	if (error) {
		console.error('Fetch favorites error:', error)
		return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 })
	}

	return NextResponse.json(data || [])
}

/**
 * POST /api/user-favorites
 * Body: { user_id, page_url, page_title?, page_group? }
 * Add a page to favorites
 */
export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (!body.user_id || !body.page_url) {
		return NextResponse.json({ error: 'user_id and page_url are required' }, { status: 400 })
	}

	// Get next sort_order for this user
	const { data: existing } = await supabase
		.from('user_favorites')
		.select('sort_order')
		.eq('user_id', body.user_id)
		.order('sort_order', { ascending: false })
		.limit(1)

	const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

	const { data, error } = await supabase
		.from('user_favorites')
		.insert({
			user_id: body.user_id,
			page_url: body.page_url,
			page_title: body.page_title || null,
			page_group: body.page_group || null,
			sort_order: nextOrder,
		})
		.select()
		.single()

	if (error) {
		if (error.code === '23505') {
			return NextResponse.json({ error: 'Already in favorites' }, { status: 400 })
		}
		if (error.code === '23503') {
			return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
		}
		console.error('Add favorite error:', error)
		return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 })
	}

	return NextResponse.json(data, { status: 201 })
}

/**
 * PUT /api/user-favorites
 * Body: { user_id, items: [{ page_url, sort_order }] }
 * Reorder favorites (batch update sort_order)
 */
export async function PUT(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (!body.user_id || !Array.isArray(body.items)) {
		return NextResponse.json({ error: 'user_id and items array are required' }, { status: 400 })
	}

	// Batch update sort_order for each item
	const updates = body.items.map((item: { page_url: string; sort_order: number }) =>
		supabase
			.from('user_favorites')
			.update({ sort_order: item.sort_order })
			.eq('user_id', body.user_id)
			.eq('page_url', item.page_url)
	)

	const results = await Promise.all(updates)
	const failed = results.find(r => r.error)

	if (failed?.error) {
		console.error('Reorder favorites error:', failed.error)
		return NextResponse.json({ error: 'Failed to reorder favorites' }, { status: 500 })
	}

	return NextResponse.json({ success: true })
}

/**
 * DELETE /api/user-favorites?user_id=<uuid>&page_url=<url>
 * Remove a page from favorites
 */
export async function DELETE(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const userId = searchParams.get('user_id')
	const pageUrl = searchParams.get('page_url')

	if (!userId || !pageUrl) {
		return NextResponse.json({ error: 'user_id and page_url are required' }, { status: 400 })
	}

	const { error } = await supabase
		.from('user_favorites')
		.delete()
		.eq('user_id', userId)
		.eq('page_url', pageUrl)

	if (error) {
		console.error('Delete favorite error:', error)
		return NextResponse.json({ error: 'Failed to remove favorite' }, { status: 500 })
	}

	return NextResponse.json({ success: true })
}
