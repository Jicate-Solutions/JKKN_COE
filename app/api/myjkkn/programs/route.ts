import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNPrograms, MyJKKNApiError } from '@/lib/myjkkn-api'

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const page = searchParams.get('page')
		const limit = searchParams.get('limit')
		const search = searchParams.get('search')
		const is_active = searchParams.get('is_active')
		const institution_id = searchParams.get('institution_id')
		const institution_code = searchParams.get('institution_code')
		const department_id = searchParams.get('department_id')
		const department_code = searchParams.get('department_code')
		const degree_id = searchParams.get('degree_id')
		const degree_code = searchParams.get('degree_code')

		const response = await fetchMyJKKNPrograms({
			page: page ? parseInt(page, 10) : 1,
			limit: limit ? parseInt(limit, 10) : 10,
			search: search || undefined,
			is_active: is_active ? is_active === 'true' : undefined,
			institution_id: institution_id || undefined,
			institution_code: institution_code || undefined,
			department_id: department_id || undefined,
			department_code: department_code || undefined,
			degree_id: degree_id || undefined,
			degree_code: degree_code || undefined,
		})

		return NextResponse.json(response)
	} catch (error) {
		console.error('Error fetching programs from MyJKKN:', error)
		if (error instanceof MyJKKNApiError) {
			return NextResponse.json(
				{ error: error.message, status: error.status, details: error.details },
				{ status: error.status }
			)
		}
		return NextResponse.json(
			{ error: 'Failed to fetch programs from MyJKKN' },
			{ status: 500 }
		)
	}
}
