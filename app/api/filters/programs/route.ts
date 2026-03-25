import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const searchParams = request.nextUrl.searchParams
		const search = searchParams.get('search') || ''
		const institutionId = searchParams.get('institution_id')
		const departmentId = searchParams.get('department_id')

		let query = supabase
			.from('programs')
			.select('id, program_code, program_name, institutions_id, offering_department_id, program_order')
			.eq('is_active', true)
			.order('program_order', { ascending: true })
			.order('program_code', { ascending: true })

		// Apply institution filter if provided (cascading filter)
		if (institutionId && institutionId !== 'all') {
			query = query.eq('institutions_id', institutionId)
		}

		// Apply department filter if provided (cascading filter)
		if (departmentId && departmentId !== 'all') {
			query = query.eq('offering_department_id', departmentId)
		}

		// Apply search filter if provided
		if (search.trim()) {
			query = query.or(`program_name.ilike.%${search}%,program_code.ilike.%${search}%`)
		}

		const { data, error } = await query

		if (error) {
			console.error('Error fetching programs:', error)
			return NextResponse.json(
				{ error: 'Failed to fetch programs' },
				{ status: 500 }
			)
		}

		return NextResponse.json({
			data: data || [],
			total: data?.length || 0
		})
	} catch (error) {
		console.error('Error in programs filter API:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
