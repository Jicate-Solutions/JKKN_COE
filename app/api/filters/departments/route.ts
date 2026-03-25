import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const searchParams = request.nextUrl.searchParams
		const search = searchParams.get('search') || ''
		const institutionId = searchParams.get('institution_id')

		let query = supabase
			.from('departments')
			.select('id, department_code, department_name, institutions_id')
			.eq('status', true)
			.order('department_name', { ascending: true })

		// Apply institution filter if provided (cascading filter)
		if (institutionId && institutionId !== 'all') {
			query = query.eq('institutions_id', institutionId)
		}

		// Apply search filter if provided
		if (search.trim()) {
			query = query.or(`department_name.ilike.%${search}%,department_code.ilike.%${search}%`)
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching departments:', error)
			return NextResponse.json(
				{ error: 'Failed to fetch departments' },
				{ status: 500 }
			)
		}

		return NextResponse.json({
			data: data || [],
			total: data?.length || 0
		})
	} catch (error) {
		console.error('Error in departments filter API:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
