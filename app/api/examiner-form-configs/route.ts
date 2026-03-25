import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const institutionsId = searchParams.get('institutions_id')
	const institutionCode = searchParams.get('institution_code')

	let query = supabase.from('examiner_form_configs').select('*')

	if (institutionCode) {
		query = query.eq('institution_code', institutionCode)
	} else if (institutionsId) {
		query = query.eq('institution_id', institutionsId)
	}

	const { data, error } = await query.order('created_at', { ascending: false }).range(0, 9999)

	if (error) {
		console.error('Fetch error:', error)
		return NextResponse.json({ error: 'Failed to fetch form configs' }, { status: 500 })
	}

	return NextResponse.json(data || [])
}

export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()

	if (!body.form_type?.trim()) {
		return NextResponse.json({ error: 'Form type is required' }, { status: 400 })
	}
	if (!body.url_slug?.trim()) {
		return NextResponse.json({ error: 'URL slug is required' }, { status: 400 })
	}

	// FK auto-mapping
	let institution_id = body.institution_id
	let institution_code = body.institution_code

	if (institution_code && !institution_id) {
		const { data: inst } = await supabase
			.from('institutions')
			.select('id')
			.eq('institution_code', institution_code)
			.maybeSingle()
		if (inst) {
			institution_id = inst.id
		}
	}

	const { data, error } = await supabase
		.from('examiner_form_configs')
		.insert({
			institution_id,
			institution_code,
			form_type: body.form_type.trim(),
			url_slug: body.url_slug.trim().toLowerCase(),
			form_title: body.form_title?.trim() || null,
			form_description: body.form_description?.trim() || null,
			exam_session_label: body.exam_session_label?.trim() || null,
			departments: body.departments || [],
			designations: body.designations || [],
			willingness_roles: body.willingness_roles || [],
			salutations: body.salutations || ['Dr', 'Mr', 'Mrs', 'Ms'],
			header_logo_url: body.header_logo_url || null,
			is_active: body.is_active !== undefined ? body.is_active : true,
			google_client_id: body.google_client_id || null,
		})
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'URL slug already exists' }, { status: 400 })
		if (error.code === '23503') return NextResponse.json({ error: 'Invalid institution reference' }, { status: 400 })
		console.error('Create error:', error)
		return NextResponse.json({ error: 'Failed to create form config' }, { status: 500 })
	}

	return NextResponse.json(data, { status: 201 })
}

export async function PUT(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const { id, ...updateData } = body

	if (!id) {
		return NextResponse.json({ error: 'ID is required' }, { status: 400 })
	}

	// Don't allow changing institution
	delete updateData.institution_id
	delete updateData.institution_code

	// Add updated_at
	updateData.updated_at = new Date().toISOString()

	const { data, error } = await supabase
		.from('examiner_form_configs')
		.update(updateData)
		.eq('id', id)
		.select()
		.single()

	if (error) {
		if (error.code === '23505') return NextResponse.json({ error: 'URL slug already exists' }, { status: 400 })
		console.error('Update error:', error)
		return NextResponse.json({ error: 'Failed to update form config' }, { status: 500 })
	}

	return NextResponse.json(data)
}

export async function DELETE(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)
	const id = searchParams.get('id')

	if (!id) {
		return NextResponse.json({ error: 'ID is required' }, { status: 400 })
	}

	const { error } = await supabase.from('examiner_form_configs').delete().eq('id', id)

	if (error) {
		console.error('Delete error:', error)
		return NextResponse.json({ error: 'Failed to delete form config' }, { status: 500 })
	}

	return NextResponse.json({ success: true })
}
