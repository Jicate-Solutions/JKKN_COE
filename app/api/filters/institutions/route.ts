import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const searchParams = request.nextUrl.searchParams
		const search = searchParams.get('search') || ''

		let query = supabase
			.from('institutions')
			.select('id, institution_code, name')
			.eq('is_active', true)
			.order('name', { ascending: true })

		// Apply search filter if provided
		if (search.trim()) {
			query = query.or(`name.ilike.%${search}%,institution_code.ilike.%${search}%`)
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching institutions:', error)
			return NextResponse.json(
				{ error: 'Failed to fetch institutions' },
				{ status: 500 }
			)
		}

		return NextResponse.json({
			data: data || [],
			total: data?.length || 0
		})
	} catch (error) {
		console.error('Error in institutions filter API:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
