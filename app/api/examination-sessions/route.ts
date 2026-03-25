import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// =====================================================
// GET /api/examination-sessions
// Fetch examination sessions with optional filters
// =====================================================

export async function GET(request: Request) {
	const supabase = getSupabaseServer()
	const { searchParams } = new URL(request.url)

	const institutionsId = searchParams.get('institutions_id')
	const search = searchParams.get('search')

	try {
		let query = supabase
			.from('examination_sessions')
			.select('*')
			.order('session_code', { ascending: false })

		// Filter by institution
		if (institutionsId) {
			query = query.eq('institutions_id', institutionsId)
		}

		// Search by session code or name
		if (search) {
			query = query.or(`session_code.ilike.%${search}%,session_name.ilike.%${search}%`)
		}

		// Override default 1000-row limit
		const { data, error } = await query.range(0, 9999)

		if (error) {
			console.error('Examination sessions fetch error:', error)
			return NextResponse.json(
				{ error: 'Failed to fetch examination sessions' },
				{ status: 500 }
			)
		}

		return NextResponse.json(data || [])
	} catch (error) {
		console.error('Examination sessions fetch error:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch examination sessions' },
			{ status: 500 }
		)
	}
}
