import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const search = searchParams.get('search')
	const status = searchParams.get('status')
	const institutionsId = searchParams.get('institutions_id')

	let query = supabase
		.from('api_applications')
		.select(`
			*,
			api_keys(id, access_key_id, key_name, status, expires_at, last_used_at, created_at)
		`)
		.order('created_at', { ascending: false })

	if (search) {
		query = query.or(`name.ilike.%${search}%,owner.ilike.%${search}%`)
	}
	if (status) {
		query = query.eq('status', status)
	}
	if (institutionsId) {
		query = query.eq('institutions_id', institutionsId)
	}

	const { data, error } = await query.range(0, 9999)

	if (error) {
		console.error('Fetch applications error:', error)
		return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
	}

	return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (!body.name?.trim()) {
		return NextResponse.json({ error: 'Application name is required' }, { status: 400 })
	}

	let institutions_id = body.institutions_id || null
	const institution_code = body.institution_code || null

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

	const { data, error } = await supabase
		.from('api_applications')
		.insert({
			name: body.name.trim(),
			description: body.description?.trim() || null,
			owner: body.owner?.trim() || null,
			allowed_domains: body.allowed_domains || [],
			status: body.status || 'active',
			institutions_id: institutions_id || null,
			institution_code: institution_code || null,
			created_by: body.created_by || null,
		})
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'Application already exists' }, { status: 400 })
		if (error.code === '23503') return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
		console.error('Create application error:', error)
		return NextResponse.json({ error: 'Failed to create application' }, { status: 500 })
	}

	return NextResponse.json(data, { status: 201 })
}

export async function PUT(request: NextRequest) {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const { id, ...updateData } = body

	if (!id) {
		return NextResponse.json({ error: 'Application ID is required' }, { status: 400 })
	}

	delete updateData.institutions_id
	delete updateData.institution_code

	const { data, error } = await supabase
		.from('api_applications')
		.update({
			name: updateData.name?.trim(),
			description: updateData.description?.trim() || null,
			owner: updateData.owner?.trim() || null,
			allowed_domains: updateData.allowed_domains,
			status: updateData.status,
		})
		.eq('id', id)
		.select()
		.single()

	if (error) {
		console.error('Update application error:', error)
		return NextResponse.json({ error: 'Failed to update application' }, { status: 500 })
	}

	return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const id = searchParams.get('id')

	if (!id) {
		return NextResponse.json({ error: 'Application ID is required' }, { status: 400 })
	}

	const { error } = await supabase.from('api_applications').delete().eq('id', id)

	if (error) {
		if (error.code === '23503') {
			return NextResponse.json({ error: 'Cannot delete - has active API keys' }, { status: 400 })
		}
		console.error('Delete application error:', error)
		return NextResponse.json({ error: 'Failed to delete application' }, { status: 500 })
	}

	return NextResponse.json({ success: true })
}
