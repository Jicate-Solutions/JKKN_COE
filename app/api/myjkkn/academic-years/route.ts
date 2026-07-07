import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNAcademicYears, fetchAllMyJKKNAcademicYears, MyJKKNApiError } from '@/lib/myjkkn-api'

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const page = searchParams.get('page')
		const limit = searchParams.get('limit')
		const search = searchParams.get('search')
		const is_active = searchParams.get('is_active')
		const institution_id = searchParams.get('institution_id')
		const academic_year_name = searchParams.get('academic_year_name')
		const fetchAll = searchParams.get('fetchAll') === 'true'

		const options = {
			page: page ? parseInt(page, 10) : 1,
			// Academic years are a small dataset; default to the endpoint max (200)
			limit: limit ? parseInt(limit, 10) : 200,
			search: search || undefined,
			is_active: is_active ? is_active === 'true' : undefined,
			institution_id: institution_id || undefined,
			academic_year_name: academic_year_name || undefined,
		}

		if (fetchAll) {
			const data = await fetchAllMyJKKNAcademicYears({ ...options, all: true })
			return NextResponse.json({ data })
		}

		const response = await fetchMyJKKNAcademicYears(options)
		return NextResponse.json(response)
	} catch (error) {
		console.error('Error fetching academic years from MyJKKN:', error)
		if (error instanceof MyJKKNApiError) {
			return NextResponse.json(
				{ error: error.message, status: error.status, details: error.details },
				{ status: error.status }
			)
		}
		return NextResponse.json(
			{ error: 'Failed to fetch academic years from MyJKKN' },
			{ status: 500 }
		)
	}
}
