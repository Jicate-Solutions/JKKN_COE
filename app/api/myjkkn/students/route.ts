import { NextRequest, NextResponse } from 'next/server'
import { fetchMyJKKNStudents, MyJKKNApiError } from '@/lib/myjkkn-api'

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
		const department_id = searchParams.get('department_id')
		const department_code = searchParams.get('department_code')
		const batch_id = searchParams.get('batch_id')
		const current_semester = searchParams.get('current_semester')
		const admission_year = searchParams.get('admission_year')

		const response = await fetchMyJKKNStudents({
			page: page ? parseInt(page, 10) : 1,
			limit: limit ? parseInt(limit, 10) : 10,
			search: search || undefined,
			is_active: is_active ? is_active === 'true' : undefined,
			institution_id: institution_id || undefined,
			institution_code: institution_code || undefined,
			program_id: program_id || undefined,
			program_code: program_code || undefined,
			department_id: department_id || undefined,
			department_code: department_code || undefined,
			batch_id: batch_id || undefined,
			current_semester: current_semester ? parseInt(current_semester, 10) : undefined,
			admission_year: admission_year ? parseInt(admission_year, 10) : undefined,
		})

		return NextResponse.json(response)
	} catch (error) {
		console.error('Error fetching students from MyJKKN:', error)
		if (error instanceof MyJKKNApiError) {
			return NextResponse.json(
				{ error: error.message, status: error.status, details: error.details },
				{ status: error.status }
			)
		}
		return NextResponse.json(
			{ error: 'Failed to fetch students from MyJKKN' },
			{ status: 500 }
		)
	}
}
