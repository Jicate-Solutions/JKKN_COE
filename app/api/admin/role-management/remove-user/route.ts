import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Remove a user from COE entirely — deletes all role assignments and the user record
 */
export async function POST(request: Request) {
	const supabase = getSupabaseServer()
	const body = await request.json()
	const { user_id } = body

	if (!user_id) {
		return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
	}

	// 1. Delete all role assignments
	await supabase
		.from('user_roles')
		.delete()
		.eq('user_id', user_id)

	// 2. Delete user from COE users table
	const { error } = await supabase
		.from('users')
		.delete()
		.eq('id', user_id)

	if (error) {
		if (error.code === '23503') {
			return NextResponse.json({ error: 'Cannot remove — user has related records in other tables' }, { status: 400 })
		}
		return NextResponse.json({ error: 'Failed to remove user' }, { status: 500 })
	}

	return NextResponse.json({ success: true, message: 'User removed from COE' })
}
