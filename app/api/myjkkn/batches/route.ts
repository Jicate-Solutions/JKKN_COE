import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNBatches, MyJKKNApiError } from '@/lib/myjkkn-api'

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const page = searchParams.get('page')
		const limit = searchParams.get('limit')
		const search = searchParams.get('search')
		const is_active = searchParams.get('is_active')
		const institution_id = searchParams.get('institution_id')
		const institution_code = searchParams.get('institution_code')
		const program_id = searchParams.get('program_id')
		const program_code = searchParams.get('program_code')
		const regulation_id = searchParams.get('regulation_id')
		const regulation_code = searchParams.get('regulation_code')
		const start_year = searchParams.get('start_year')

		const response = await fetchMyJKKNBatches({
			page: page ? parseInt(page, 10) : 1,
			limit: limit ? parseInt(limit, 10) : 10,
			search: search || undefined,
			is_active: is_active ? is_active === 'true' : undefined,
			institution_id: institution_id || undefined,
			institution_code: institution_code || undefined,
			program_id: program_id || undefined,
			program_code: program_code || undefined,
			regulation_id: regulation_id || undefined,
			regulation_code: regulation_code || undefined,
			start_year: start_year ? parseInt(start_year, 10) : undefined,
		})

		return NextResponse.json(response)
	} catch (error) {
		console.error('Error fetching batches from MyJKKN:', error)
		if (error instanceof MyJKKNApiError) {
			return NextResponse.json(
				{ error: error.message, status: error.status, details: error.details },
				{ status: error.status }
			)
		}
		return NextResponse.json(
			{ error: 'Failed to fetch batches from MyJKKN' },
			{ status: 500 }
		)
	}
}
