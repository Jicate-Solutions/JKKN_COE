import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * Get user avatar URL from local database
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const email = searchParams.get('email')
		const userId = searchParams.get('user_id')

		if (!email && !userId) {
			return NextResponse.json({ error: 'Email or user_id is required' }, { status: 400 })
		}

		const supabase = getSupabaseServer()

		let query = supabase.from('users').select('avatar_url')

		if (email) {
			query = query.eq('email', email)
		} else if (userId) {
			query = query.eq('id', userId)
		}

		const { data, error } = await query.single()

		if (error) {
			// User not found - return null avatar
			return NextResponse.json({ avatar_url: null })
		}

		return NextResponse.json({ avatar_url: data?.avatar_url || null })
	} catch (error) {
		console.error('Error fetching avatar:', error)
		return NextResponse.json({ avatar_url: null })
	}
}
