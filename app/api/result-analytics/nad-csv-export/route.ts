import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * NAD ABC CSV Export API (Official Upload Format)
 *
 * Uses the nad_abc_upload_view to generate CSV with one row per student per subject.
 * This format handles DYNAMIC subject counts (not limited to 14 subjects).
 *
 * Key Features:
 * - One row per student per subject (official NAD portal format)
 * - 24 fixed columns regardless of subject count
 * - SGPA/CGPA repeated for each subject row
 * - Subject ordering: Regular first, then Arrear
 *
 * GET /api/result-analytics/nad-csv-export
 *
 * Query Parameters:
 * - institution_id: Filter by institution (optional)
 * - examination_session_id: Filter by exam session (optional)
 * - program_id: Filter by program (optional)
 * - semester: Filter by semester number (optional)
 */

// Official NAD Upload columns (24 columns in exact order)
const NAD_UPLOAD_COLUMNS = [
	'ABC_ID',
	'STUDENT_NAME',
	'FATHER_NAME',
	'MOTHER_NAME',
	'DATE_OF_BIRTH',
	'GENDER',
	'PROGRAM_NAME',
	'PROGRAM_CODE',
	'SEMESTER',
	'ENROLLMENT_NUMBER',
	'ROLL_NUMBER',
	'INSTITUTION_NAME',
	'INSTITUTION_CODE',
	'UNIVERSITY_NAME',
	'ACADEMIC_YEAR',
	'EXAM_SESSION',
	'SUBJECT_CODE',
	'SUBJECT_NAME',
	'MAX_MARKS',
	'MARKS_OBTAINED',
	'RESULT_STATUS',
	'SGPA',
	'CGPA',
	'RESULT_DATE'
] as const

export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)

		// Parse filter parameters
		const institutionId = searchParams.get('institution_id') || undefined
		const examinationSessionId = searchParams.get('examination_session_id') || undefined
		const programId = searchParams.get('program_id') || undefined
		const semester = searchParams.get('semester') ? parseInt(searchParams.get('semester')!) : undefined

		console.log('NAD CSV Export - Fetching from view with filters:', {
			institutionId,
			examinationSessionId,
			programId,
			semester
		})

		// Build query with filters applied at database level
		let query = supabase
			.from('nad_abc_upload_view')
			.select('*')

		// Apply filters directly in the database query
		if (institutionId) {
			query = query.eq('institution_id', institutionId)
		}
		if (examinationSessionId) {
			query = query.eq('examination_session_id', examinationSessionId)
		}
		if (programId) {
			query = query.eq('program_id', programId)
		}
		if (semester) {
			query = query.eq('semester_number', semester)
		}

		// Order by student then subject order
		query = query.order('STUDENT_NAME', { ascending: true })
			.order('subject_order', { ascending: true })

		const { data: viewData, error: viewError } = await query

		console.log('NAD CSV Export - View query result:', {
			dataCount: viewData?.length || 0,
			error: viewError?.message || null,
			appliedFilters: { institutionId, examinationSessionId, programId, semester }
		})

		if (viewError) {
			console.error('Error fetching from nad_abc_upload_view:', viewError)

			// If view doesn't exist, inform user to run migration
			if (viewError.code === '42P01') {
				return NextResponse.json({
					error: 'NAD view not found. Please run the SQL migration to create nad_abc_upload_view.',
					details: 'Execute the SQL file: supabase/sql/nad_abc_upload_view.sql'
				}, { status: 404 })
			}

			throw viewError
		}

		if (!viewData || viewData.length === 0) {
			return NextResponse.json({
				success: true,
				message: 'No published results found for the selected filters',
				csv: '',
				row_count: 0
			})
		}

		// Generate CSV with only the 24 NAD columns (excluding metadata columns)
		const csvRows: string[][] = []

		// Header row
		csvRows.push([...NAD_UPLOAD_COLUMNS])

		// Data rows - only include official NAD columns
		for (const row of viewData) {
			const csvRow: string[] = NAD_UPLOAD_COLUMNS.map(col => {
				const value = row[col]
				if (value === null || value === undefined) return ''
				return String(value)
			})
			csvRows.push(csvRow)
		}

		// Convert to CSV string with proper escaping
		const csvContent = csvRows.map(row =>
			row.map(field => {
				const strField = String(field || '')
				// Escape fields with commas, quotes, or newlines
				if (strField.includes(',') || strField.includes('"') || strField.includes('\n')) {
					return `"${strField.replace(/"/g, '""')}"`
				}
				return strField
			}).join(',')
		).join('\n')

		// Generate filename with date and filters info
		const filterParts: string[] = ['nad_abc_export']
		if (programId) filterParts.push('program')
		if (semester) filterParts.push(`sem${semester}`)
		filterParts.push(new Date().toISOString().split('T')[0])
		const filename = `${filterParts.join('_')}.csv`

		// Return CSV with appropriate headers for download
		return new NextResponse(csvContent, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Cache-Control': 'no-cache'
			}
		})

	} catch (error) {
		console.error('Error generating NAD CSV export:', error)
		return NextResponse.json({
			error: 'Failed to generate NAD CSV export',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}

/**
 * POST endpoint for custom export configuration
 */
export async function POST(req: NextRequest) {
	try {
		const body = await req.json()
		const {
			institution_id,
			examination_session_id,
			program_id,
			semester
		} = body

		// Build URL with query parameters
		const url = new URL(req.url)
		if (institution_id) url.searchParams.set('institution_id', institution_id)
		if (examination_session_id) url.searchParams.set('examination_session_id', examination_session_id)
		if (program_id) url.searchParams.set('program_id', program_id)
		if (semester) url.searchParams.set('semester', String(semester))

		// Create new request with parameters
		const newReq = new NextRequest(url, { method: 'GET' })

		// Call GET handler
		return GET(newReq)

	} catch (error) {
		console.error('Error processing NAD CSV export request:', error)
		return NextResponse.json({
			error: 'Failed to process export request',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}
