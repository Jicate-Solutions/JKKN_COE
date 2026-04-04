import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const appId = searchParams.get('app_id')

	let query = supabase
		.from('api_permissions')
		.select('*')
		.order('module', { ascending: true })

	if (appId) {
		query = query.eq('app_id', appId)
	}

	const { data, error } = await query.range(0, 9999)

	if (error) {
		console.error('Fetch permissions error:', error)
		return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 })
	}

	return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (body.permissions && Array.isArray(body.permissions)) {
		if (!body.app_id) {
			return NextResponse.json({ error: 'Application ID is required' }, { status: 400 })
		}

		const records = body.permissions.map((p: any) => ({
			app_id: body.app_id,
			module: p.module,
			operation: p.operation,
			institution_id: p.institution_id || null,
		}))

		// Use insert (not upsert) because the frontend always deletes all
		// permissions first. Upsert fails with NULL institution_id due to
		// PostgreSQL NULLS DISTINCT behavior in unique constraints.
		const { data, error } = await supabase
			.from('api_permissions')
			.insert(records)
			.select()

		if (error) {
			console.error('Bulk permission error:', error)
			return NextResponse.json({ error: 'Failed to save permissions', details: error.message }, { status: 500 })
		}

		return NextResponse.json(data, { status: 201 })
	}

	if (!body.app_id || !body.module || !body.operation) {
		return NextResponse.json({ error: 'app_id, module, and operation are required' }, { status: 400 })
	}

	const { data, error } = await supabase
		.from('api_permissions')
		.insert({
			app_id: body.app_id,
			module: body.module,
			operation: body.operation,
			institution_id: body.institution_id || null,
		})
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'Permission already exists' }, { status: 400 })
		console.error('Create permission error:', error)
		return NextResponse.json({ error: 'Failed to create permission' }, { status: 500 })
	}

	return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: NextRequest) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const id = searchParams.get('id')
	const appId = searchParams.get('app_id')

	if (id) {
		const { error } = await supabase.from('api_permissions').delete().eq('id', id)
		if (error) {
			return NextResponse.json({ error: 'Failed to delete permission' }, { status: 500 })
		}
		return NextResponse.json({ success: true })
	}

	if (appId) {
		const { error } = await supabase.from('api_permissions').delete().eq('app_id', appId)
		if (error) {
			return NextResponse.json({ error: 'Failed to delete permissions' }, { status: 500 })
		}
		return NextResponse.json({ success: true })
	}

	return NextResponse.json({ error: 'Either id or app_id is required' }, { status: 400 })
}
