import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET - Fetch all user roles
export async function GET(request: Request) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)
		const statusFilter = searchParams.get('status')

		let query = supabase
			.from('user_roles')
			.select(`
				*,
				users:user_id (
					id,
					email,
					name
				),
				roles:role_id (
					id,
					role_code,
					role_name
				)
			`)
			.order('created_at', { ascending: false })

		if (statusFilter) {
			query = query.eq('is_active', statusFilter === 'active')
		}

		const { data, error } = await query

		if (error) {
			console.error('User roles table error:', error)
			return NextResponse.json({ error: 'Failed to fetch user roles' }, { status: 500 })
		}

		// Normalize the data to include user and role information at the top level
		const normalized = (data || []).map((row: any) => ({
			id: row.id,
			user_id: row.user_id,
			role_id: row.role_id,
			user_email: row.users?.email || null,
			user_name: row.users?.name || row.users?.email || null,
			role_code: row.roles?.role_code || null,
			role_name: row.roles?.role_name || null,
			is_active: row.is_active ?? true,
			created_at: row.created_at,
			updated_at: row.updated_at
		}))

		return NextResponse.json(normalized)
	} catch (e) {
		console.error('User roles API error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// POST - Create new user role assignment
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		const { user_id, role_id, is_active } = body

		// Validate required fields
		if (!user_id || !role_id) {
			return NextResponse.json({
				error: 'User and Role are required'
			}, { status: 400 })
		}

		// Check if user exists
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('id, email, name')
			.eq('id', user_id)
			.single()

		if (userError || !userData) {
			return NextResponse.json({
				error: 'User not found'
			}, { status: 400 })
		}

		// Check if role exists
		const { data: roleData, error: roleError } = await supabase
			.from('roles')
			.select('id, role_code, role_name')
			.eq('id', role_id)
			.single()

		if (roleError || !roleData) {
			return NextResponse.json({
				error: 'Role not found'
			}, { status: 400 })
		}

		// Check for existing assignment
		const { data: existingData } = await supabase
			.from('user_roles')
			.select('id')
			.eq('user_id', user_id)
			.eq('role_id', role_id)
			.maybeSingle()

		if (existingData) {
			return NextResponse.json({
				error: 'This user is already assigned to this role'
			}, { status: 400 })
		}

		const insertPayload = {
			user_id,
			role_id,
			is_active: is_active ?? true,
		}

		const { data, error } = await supabase
			.from('user_roles')
			.insert([insertPayload])
			.select(`
				*,
				users:user_id (
					id,
					email,
					name
				),
				roles:role_id (
					id,
					role_code,
					role_name
				)
			`)
			.single()

		if (error) {
			console.error('Error creating user role:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'User role assignment already exists'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid user or role reference'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to create user role assignment' }, { status: 500 })
		}

		// Normalize the response
		const normalized = {
			id: data.id,
			user_id: data.user_id,
			role_id: data.role_id,
			user_email: data.users?.email || null,
			user_name: data.users?.name || data.users?.email || null,
			role_code: data.roles?.role_code || null,
			role_name: data.roles?.role_name || null,
			is_active: data.is_active ?? true,
			created_at: data.created_at,
			updated_at: data.updated_at
		}

		return NextResponse.json(normalized, { status: 201 })
	} catch (e) {
		console.error('User role creation error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// PUT - Update user role assignment
export async function PUT(request: Request) {
	try {
		const body = await request.json()
		const supabase = getSupabaseServer()

		const { id, user_id, role_id, is_active } = body

		if (!id) {
			return NextResponse.json({ error: 'User role ID is required' }, { status: 400 })
		}

		// Validate required fields
		if (!user_id || !role_id) {
			return NextResponse.json({
				error: 'User and Role are required'
			}, { status: 400 })
		}

		// Check if user exists
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('id', user_id)
			.single()

		if (userError || !userData) {
			return NextResponse.json({
				error: 'User not found'
			}, { status: 400 })
		}

		// Check if role exists
		const { data: roleData, error: roleError } = await supabase
			.from('roles')
			.select('id')
			.eq('id', role_id)
			.single()

		if (roleError || !roleData) {
			return NextResponse.json({
				error: 'Role not found'
			}, { status: 400 })
		}

		// Check for duplicate (excluding current record)
		const { data: existingData } = await supabase
			.from('user_roles')
			.select('id')
			.eq('user_id', user_id)
			.eq('role_id', role_id)
			.neq('id', id)
			.maybeSingle()

		if (existingData) {
			return NextResponse.json({
				error: 'This user is already assigned to this role'
			}, { status: 400 })
		}

		const updatePayload = {
			user_id,
			role_id,
			is_active: is_active ?? true,
		}

		const { data, error } = await supabase
			.from('user_roles')
			.update(updatePayload)
			.eq('id', id)
			.select(`
				*,
				users:user_id (
					id,
					email,
					name
				),
				roles:role_id (
					id,
					role_code,
					role_name
				)
			`)
			.single()

		if (error) {
			console.error('Error updating user role:', error)

			// Handle duplicate key constraint violation
			if (error.code === '23505') {
				return NextResponse.json({
					error: 'User role assignment already exists'
				}, { status: 400 })
			}

			// Handle foreign key constraint violation
			if (error.code === '23503') {
				return NextResponse.json({
					error: 'Invalid user or role reference'
				}, { status: 400 })
			}

			return NextResponse.json({ error: 'Failed to update user role assignment' }, { status: 500 })
		}

		// Normalize the response
		const normalized = {
			id: data.id,
			user_id: data.user_id,
			role_id: data.role_id,
			user_email: data.users?.email || null,
			user_name: data.users?.name || data.users?.email || null,
			role_code: data.roles?.role_code || null,
			role_name: data.roles?.role_name || null,
			is_active: data.is_active ?? true,
			created_at: data.created_at,
			updated_at: data.updated_at
		}

		return NextResponse.json(normalized)
	} catch (e) {
		console.error('User role update error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}

// DELETE - Delete user role assignment
export async function DELETE(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const id = searchParams.get('id')

		if (!id) {
			return NextResponse.json({ error: 'User role ID is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		const { error } = await supabase
			.from('user_roles')
			.delete()
			.eq('id', id)

		if (error) {
			console.error('Error deleting user role:', error)
			return NextResponse.json({ error: 'Failed to delete user role assignment' }, { status: 500 })
		}

		return NextResponse.json({ success: true })
	} catch (e) {
		console.error('User role deletion error:', e)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
}
