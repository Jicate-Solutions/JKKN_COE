import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

/**
 * NAAD ABC CSV Export API
 *
 * Uses the naad_abc_consolidated_view to generate CSV with one row per student per exam session.
 * Subject-wise marks are already pivoted into columns (SUB1-SUB7) by the view.
 * Subjects are ordered: Regular subjects first (by course_order), then Arrear subjects (by semester DESC, course_order).
 *
 * GET /api/result-analytics/naad-csv-export
 *
 * Query Parameters:
 * - institution_id: Filter by institution (optional)
 * - examination_session_id: Filter by exam session (optional)
 * - program_id: Filter by program (optional)
 * - semester: Filter by current semester number (optional) - filters by the semester being attempted
 */
export async function GET(req: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(req.url)

		// Parse filter parameters
		const institutionId = searchParams.get('institution_id') || undefined
		const examinationSessionId = searchParams.get('examination_session_id') || undefined
		const programId = searchParams.get('program_id') || undefined
		const semester = searchParams.get('semester') ? parseInt(searchParams.get('semester')!) : undefined

		console.log('NAAD CSV Export - Fetching from view with filters:', {
			institutionId,
			examinationSessionId,
			programId,
			semester
		})

		// Build query with filters applied at database level
		let query = supabase
			.from('naad_abc_consolidated_view')
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
			// Filter by semester_number (aliased from current_semester in the view)
			query = query.eq('semester_number', semester)
		}

		const { data: viewData, error: viewError } = await query

		console.log('NAAD CSV Export - View query result:', {
			dataCount: viewData?.length || 0,
			error: viewError?.message || null,
			appliedFilters: { institutionId, examinationSessionId, programId, semester }
		})

		if (viewError) {
			console.error('Error fetching from naad_abc_consolidated_view:', viewError)

			// If view doesn't exist, inform user to run migration
			if (viewError.code === '42P01') {
				return NextResponse.json({
					error: 'NAAD view not found. Please run the SQL migration to create naad_abc_consolidated_view.',
					details: 'Execute the SQL file: supabase/sql/naad_abc_consolidated_view.sql'
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

		// Get all column names from the first row (excluding metadata columns)
		// These are internal columns used for filtering, not part of NAAD export format
		const metadataColumns = ['semester_result_id', 'student_id', 'institution_id', 'examination_session_id', 'program_id', 'semester_number', 'total_subjects']
		const allColumns = Object.keys(viewData[0])

		// Find the maximum subject number that has data across ALL filtered rows
		// This scans the actual data to find which SUB columns have values
		let maxSubjectWithData = 0

		for (const row of viewData) {
			for (let subNum = 1; subNum <= 40; subNum++) {
				// Check SUB{n} column (course code) - this is the primary indicator
				const subCodeCol = `SUB${subNum}`
				const subCode = row[subCodeCol]

				// If course code has value, this subject has data
				if (subCode && String(subCode).trim() !== '') {
					maxSubjectWithData = Math.max(maxSubjectWithData, subNum)
				}
			}
		}

		// Ensure at least 1 subject column if no data found
		if (maxSubjectWithData === 0) maxSubjectWithData = 1

		console.log('NAAD CSV Export - Max subject with data (from scan):', maxSubjectWithData)

		// Build list of subject column suffixes
		const subjectColumnSuffixes = [
			'NM', '', '_SEM', 'MAX', 'MIN', '_TH_MAX', '_VV_MRKS', '_PR_CE_MRKS',
			'_TH_MIN', '_PR_MAX', '_PR_MIN', '_CE_MAX', '_CE_MIN', '_TH_MRKS',
			'_PR_MRKS', '_CE_MRKS', '_TOT', '_GRADE', '_GRADE_POINTS', '_CREDIT',
			'_CREDIT_POINTS', '_REMARKS'
		]

		// Build set of columns to exclude (empty subject columns beyond maxSubjectWithData)
		const emptySubjectColumns = new Set<string>()
		for (let subNum = maxSubjectWithData + 1; subNum <= 40; subNum++) {
			for (const suffix of subjectColumnSuffixes) {
				emptySubjectColumns.add(`SUB${subNum}${suffix}`)
			}
		}

		// Filter columns: exclude metadata and empty subject columns
		const exportColumns = allColumns.filter(col =>
			!metadataColumns.includes(col) && !emptySubjectColumns.has(col)
		)

		console.log('NAAD CSV Export - Max subjects:', maxSubjectWithData, '| Columns reduced from', allColumns.length, 'to', exportColumns.length)

		// Generate CSV rows
		const csvRows: string[][] = []

		// Header row
		csvRows.push(exportColumns)

		// Data rows
		for (const row of viewData) {
			const csvRow: string[] = exportColumns.map(col => {
				const value = row[col]
				if (value === null || value === undefined) return ''
				return String(value)
			})
			csvRows.push(csvRow)
		}

		// Convert to CSV string
		const csvContent = csvRows.map(row =>
			row.map(field => {
				// Escape fields with commas, quotes, or newlines
				const strField = String(field || '')
				if (strField.includes(',') || strField.includes('"') || strField.includes('\n')) {
					return `"${strField.replace(/"/g, '""')}"`
				}
				return strField
			}).join(',')
		).join('\n')

		// Return CSV with appropriate headers for download
		const filename = `naad_abc_export_${new Date().toISOString().split('T')[0]}.csv`

		return new NextResponse(csvContent, {
			status: 200,
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Cache-Control': 'no-cache'
			}
		})

	} catch (error) {
		console.error('Error generating NAAD CSV export:', error)
		return NextResponse.json({
			error: 'Failed to generate NAAD CSV export',
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
		console.error('Error processing NAAD CSV export request:', error)
		return NextResponse.json({
			error: 'Failed to process export request',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 })
	}
}
