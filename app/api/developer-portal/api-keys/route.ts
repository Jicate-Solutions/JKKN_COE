import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { generateApiKeyPair } from '@/lib/api-auth/key-generator'

export async function GET(request: NextRequest) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const appId = searchParams.get('app_id')

	let query = supabase
		.from('api_keys')
		.select(`
			id, app_id, access_key_id, key_name, status,
			expires_at, last_used_at, created_at, created_by,
			api_applications(id, name)
		`)
		.order('created_at', { ascending: false })

	if (appId) {
		query = query.eq('app_id', appId)
	}

	const { data, error } = await query.range(0, 9999)

	if (error) {
		console.error('Fetch API keys error:', error)
		return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 })
	}

	return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (!body.app_id) {
		return NextResponse.json({ error: 'Application ID is required' }, { status: 400 })
	}
	if (!body.key_name?.trim()) {
		return NextResponse.json({ error: 'Key name is required' }, { status: 400 })
	}

	const { data: app } = await supabase
		.from('api_applications')
		.select('id, status')
		.eq('id', body.app_id)
		.single()

	if (!app) {
		return NextResponse.json({ error: 'Application not found' }, { status: 404 })
	}
	if (app.status !== 'active') {
		return NextResponse.json({ error: 'Application is suspended' }, { status: 400 })
	}

	// Enforce mandatory expiry with 90-day maximum
	const MAX_KEY_LIFETIME_DAYS = 90
	let expiresAt = body.expires_at ? new Date(body.expires_at) : null

	if (!expiresAt) {
		// Default to 90 days if no expiry provided
		expiresAt = new Date()
		expiresAt.setDate(expiresAt.getDate() + MAX_KEY_LIFETIME_DAYS)
	} else {
		// Enforce maximum lifetime
		const maxDate = new Date()
		maxDate.setDate(maxDate.getDate() + MAX_KEY_LIFETIME_DAYS)
		if (expiresAt > maxDate) {
			return NextResponse.json(
				{ error: `API keys cannot expire more than ${MAX_KEY_LIFETIME_DAYS} days from now` },
				{ status: 400 }
			)
		}
		if (expiresAt <= new Date()) {
			return NextResponse.json(
				{ error: 'Expiry date must be in the future' },
				{ status: 400 }
			)
		}
	}

	const keyPair = await generateApiKeyPair()

	const { data, error } = await supabase
		.from('api_keys')
		.insert({
			app_id: body.app_id,
			access_key_id: keyPair.accessKeyId,
			secret_key_hash: keyPair.secretKeyHash,
			key_name: body.key_name.trim(),
			status: 'active',
			expires_at: expiresAt.toISOString(),
			created_by: body.created_by || null,
		})
		.select()
		.single()

	if (error) {
		console.error('Create API key error:', error)
		return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
	}

	await supabase.from('api_key_events').insert({
		key_id: data.id,
		event_type: 'created',
		performed_by: body.created_by || null,
		metadata: { key_name: body.key_name.trim() },
	})

	return NextResponse.json({
		id: data.id,
		access_key_id: keyPair.accessKeyId,
		secret_key: keyPair.secretKey,
		key_name: data.key_name,
		app_id: data.app_id,
		expires_at: data.expires_at,
		created_at: data.created_at,
	}, { status: 201 })
}

export async function PUT(request: NextRequest) {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const { id, action, ...rest } = body

	if (!id) {
		return NextResponse.json({ error: 'Key ID is required' }, { status: 400 })
	}

	if (action === 'revoke') {
		const { data, error } = await supabase
			.from('api_keys')
			.update({ status: 'revoked' })
			.eq('id', id)
			.select()
			.single()

		if (error) {
			return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
		}

		await supabase.from('api_key_events').insert({
			key_id: id,
			event_type: 'revoked',
			performed_by: rest.performed_by || null,
		})

		return NextResponse.json(data)
	}

	if (action === 'regenerate') {
		await supabase
			.from('api_keys')
			.update({ status: 'revoked' })
			.eq('id', id)

		const { data: oldKey } = await supabase
			.from('api_keys')
			.select('app_id, key_name, expires_at')
			.eq('id', id)
			.single()

		if (!oldKey) {
			return NextResponse.json({ error: 'Key not found' }, { status: 404 })
		}

		const keyPair = await generateApiKeyPair()

		const { data: newKey, error } = await supabase
			.from('api_keys')
			.insert({
				app_id: oldKey.app_id,
				access_key_id: keyPair.accessKeyId,
				secret_key_hash: keyPair.secretKeyHash,
				key_name: oldKey.key_name,
				status: 'active',
				expires_at: oldKey.expires_at,
				created_by: rest.performed_by || null,
			})
			.select()
			.single()

		if (error) {
			return NextResponse.json({ error: 'Failed to regenerate key' }, { status: 500 })
		}

		await supabase.from('api_key_events').insert([
			{ key_id: id, event_type: 'regenerated', performed_by: rest.performed_by || null },
			{ key_id: newKey.id, event_type: 'created', performed_by: rest.performed_by || null },
		])

		return NextResponse.json({
			id: newKey.id,
			access_key_id: keyPair.accessKeyId,
			secret_key: keyPair.secretKey,
			key_name: newKey.key_name,
			app_id: newKey.app_id,
			expires_at: newKey.expires_at,
			created_at: newKey.created_at,
		})
	}

	return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
