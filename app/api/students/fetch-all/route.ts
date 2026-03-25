import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/utils/supabase-fetch-all'

/**
 * API Route: Fetch ALL students (100k+ rows)
 * GET /api/students/fetch-all
 *
 * Query Parameters:
 * - institution_id (optional): Filter by institution
 * - is_active (optional): Filter by active status
 * - program_code (optional): Filter by program
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const institution_id = searchParams.get('institution_id')
		const is_active = searchParams.get('is_active')
		const program_code = searchParams.get('program_code')

		const supabase = getSupabaseServer()

		// Build filters
		const filters: Record<string, any> = {}
		if (institution_id) filters.institution_id = institution_id
		if (is_active !== null) filters.is_active = is_active === 'true'
		if (program_code) filters.program_code = program_code

		console.log('Fetching all students with filters:', filters)

		// Fetch all rows using the utility
		const students = await fetchAllRows(supabase, 'students', {
			select: 'id, stu_register_no, student_name, email, phone_number, program_code, is_active',
			orderBy: 'stu_register_no',
			ascending: true,
			filters,
			batchSize: 1000 // Fetch 1000 rows per batch
		})

		console.log(`Successfully fetched ${students.length} students`)

		return NextResponse.json({
			success: true,
			count: students.length,
			data: students
		})

	} catch (error) {
		console.error('Error fetching all students:', error)
		return NextResponse.json({
			success: false,
			error: error instanceof Error ? error.message : 'Failed to fetch students'
		}, { status: 500 })
	}
}
