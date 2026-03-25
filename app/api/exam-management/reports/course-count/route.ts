import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import type {
	CourseCountRecord,
	ProgramCourseCount,
	BoardCourseCount,
	CourseCountReportData
} from '@/types/course-count-report'

/**
 * GET /api/exam-management/reports/course-count
 *
 * Fetches course count data for question paper preparation
 * Groups by program and board, with counts for regular/arrear students
 *
 * Query Parameters:
 * - institution_id (required): Institution UUID
 * - session_id (required): Examination session UUID
 * - course_codes (optional): Comma-separated course codes to filter
 */
export async function GET(request: NextRequest) {
	try {
		const supabase = getSupabaseServer()
		const { searchParams } = new URL(request.url)

		const institutionId = searchParams.get('institution_id')
		const sessionId = searchParams.get('session_id')
		const courseCodesParam = searchParams.get('course_codes')

		// Validate required parameters
		if (!institutionId) {
			return NextResponse.json(
				{ error: 'institution_id is required' },
				{ status: 400 }
			)
		}

		if (!sessionId) {
			return NextResponse.json(
				{ error: 'session_id is required' },
				{ status: 400 }
			)
		}

		// Parse course codes if provided
		const courseCodes = courseCodesParam
			? courseCodesParam.split(',').map(c => c.trim()).filter(Boolean)
			: []

		// Fetch institution details
		// Note: institutions table has 'name' column, not 'institution_name'
		const { data: institution, error: instError } = await supabase
			.from('institutions')
			.select('id, institution_code, name')
			.eq('id', institutionId)
			.single()

		if (instError || !institution) {
			console.error('Error fetching institution:', instError)
			return NextResponse.json(
				{ error: 'Institution not found' },
				{ status: 404 }
			)
		}

		// Fetch examination session details
		const { data: session, error: sessionError } = await supabase
			.from('examination_sessions')
			.select('id, session_code, session_name')
			.eq('id', sessionId)
			.single()

		if (sessionError || !session) {
			return NextResponse.json(
				{ error: 'Examination session not found' },
				{ status: 404 }
			)
		}

		// Build the main query for course counts
		// exam_registrations has denormalized program_code and course_code columns
		// Supabase default limit is 1000 rows - need to paginate to get all records
		const pageSize = 1000
		let allRegistrations: any[] = []
		let page = 0
		let hasMore = true

		console.log('=== Course Count Report: Fetching exam_registrations ===')
		console.log('Filters:', { institutionId, sessionId })

		while (hasMore) {
			const { data: pageData, error: pageError } = await supabase
				.from('exam_registrations')
				.select(`
					id,
					is_regular,
					program_code,
					course_code
				`)
				.eq('institutions_id', institutionId)
				.eq('examination_session_id', sessionId)
				.eq('fee_paid', true)
				.range(page * pageSize, (page + 1) * pageSize - 1)

			if (pageError) {
				console.error('Error fetching registrations page:', page, pageError)
				return NextResponse.json(
					{ error: 'Failed to fetch exam registrations', details: pageError.message },
					{ status: 500 }
				)
			}

			if (pageData && pageData.length > 0) {
				allRegistrations = allRegistrations.concat(pageData)
				console.log(`Page ${page}: Fetched ${pageData.length} records, total so far: ${allRegistrations.length}`)
				page++
				hasMore = pageData.length === pageSize
			} else {
				hasMore = false
			}
		}

		const registrations = allRegistrations
		console.log(`Total exam_registrations fetched: ${registrations.length}`)

		// Fetch course details (course_name, board_code) from courses table
		const uniqueCourseCodes = [...new Set((registrations || []).map(r => r.course_code).filter(Boolean))]
		let courseMap = new Map<string, { course_name: string; board_code: string | null }>()

		if (uniqueCourseCodes.length > 0) {
			const { data: coursesData } = await supabase
				.from('courses')
				.select('course_code, course_name, board_code')
				.in('course_code', uniqueCourseCodes)

			courseMap = new Map(
				(coursesData || []).map(c => [c.course_code, { course_name: c.course_name, board_code: c.board_code }])
			)
		}

		// Fetch programs for names and order
		const { data: programs } = await supabase
			.from('programs')
			.select('program_code, program_name, program_order')
			.eq('institutions_id', institutionId)

		const programMap = new Map(
			(programs || []).map(p => [p.program_code, { name: p.program_name, order: p.program_order ?? 999 }])
		)

		// Fetch boards for names
		const { data: boards } = await supabase
			.from('boards')
			.select('board_code, board_name')

		const boardMap = new Map(
			(boards || []).map(b => [b.board_code, b.board_name])
		)

		// Process registrations and aggregate counts
		// Using denormalized program_code and course_code directly from exam_registrations
		const courseCountMap = new Map<string, CourseCountRecord>()

		for (const reg of registrations || []) {
			// Skip if no course_code
			if (!reg.course_code) continue

			// Filter by course codes if specified
			if (courseCodes.length > 0 && !courseCodes.includes(reg.course_code)) {
				continue
			}

			const key = `${reg.program_code}|${reg.course_code}`

			if (!courseCountMap.has(key)) {
				const programInfo = programMap.get(reg.program_code)
				const courseInfo = courseMap.get(reg.course_code)
				courseCountMap.set(key, {
					program_code: reg.program_code || '-',
					program_name: programInfo?.name || reg.program_code || '-',
					program_order: programInfo?.order ?? 999,
					course_code: reg.course_code,
					course_title: courseInfo?.course_name || reg.course_code,
					board_code: courseInfo?.board_code || null,
					board_name: courseInfo?.board_code ? boardMap.get(courseInfo.board_code) || null : null,
					regular_count: 0,
					arrear_count: 0,
					total_count: 0
				})
			}

			const record = courseCountMap.get(key)!
			if (reg.is_regular) {
				record.regular_count++
			} else {
				record.arrear_count++
			}
			record.total_count++
		}

		// Convert map to array and sort
		const records: CourseCountRecord[] = Array.from(courseCountMap.values())
			.sort((a, b) => {
				// Sort by program_order, then program_code, then course_code
				if (a.program_order !== b.program_order) {
					return a.program_order - b.program_order
				}
				if (a.program_code !== b.program_code) {
					return a.program_code.localeCompare(b.program_code)
				}
				return a.course_code.localeCompare(b.course_code)
			})

		// Group by program
		const programWiseMap = new Map<string, ProgramCourseCount>()
		for (const record of records) {
			if (!programWiseMap.has(record.program_code)) {
				programWiseMap.set(record.program_code, {
					program_code: record.program_code,
					program_name: record.program_name,
					program_order: record.program_order,
					courses: [],
					program_total_regular: 0,
					program_total_arrear: 0,
					program_total: 0
				})
			}
			const programGroup = programWiseMap.get(record.program_code)!
			programGroup.courses.push(record)
			programGroup.program_total_regular += record.regular_count
			programGroup.program_total_arrear += record.arrear_count
			programGroup.program_total += record.total_count
		}

		const programWise: ProgramCourseCount[] = Array.from(programWiseMap.values())
			.sort((a, b) => {
				if (a.program_order !== b.program_order) {
					return a.program_order - b.program_order
				}
				return a.program_code.localeCompare(b.program_code)
			})

		// Group by board
		const boardWiseMap = new Map<string, BoardCourseCount>()
		for (const record of records) {
			const boardKey = record.board_code || 'UNASSIGNED'
			if (!boardWiseMap.has(boardKey)) {
				boardWiseMap.set(boardKey, {
					board_code: record.board_code || 'UNASSIGNED',
					board_name: record.board_name || 'Unassigned Board',
					programs: [],
					board_total_regular: 0,
					board_total_arrear: 0,
					board_total: 0
				})
			}
		}

		// For each board, group by programs within that board
		for (const [boardKey, boardGroup] of boardWiseMap) {
			const boardRecords = records.filter(r => (r.board_code || 'UNASSIGNED') === boardKey)

			const boardProgramMap = new Map<string, ProgramCourseCount>()
			for (const record of boardRecords) {
				if (!boardProgramMap.has(record.program_code)) {
					boardProgramMap.set(record.program_code, {
						program_code: record.program_code,
						program_name: record.program_name,
						program_order: record.program_order,
						courses: [],
						program_total_regular: 0,
						program_total_arrear: 0,
						program_total: 0
					})
				}
				const programGroup = boardProgramMap.get(record.program_code)!
				programGroup.courses.push(record)
				programGroup.program_total_regular += record.regular_count
				programGroup.program_total_arrear += record.arrear_count
				programGroup.program_total += record.total_count

				boardGroup.board_total_regular += record.regular_count
				boardGroup.board_total_arrear += record.arrear_count
				boardGroup.board_total += record.total_count
			}

			boardGroup.programs = Array.from(boardProgramMap.values())
				.sort((a, b) => {
					if (a.program_order !== b.program_order) {
						return a.program_order - b.program_order
					}
					return a.program_code.localeCompare(b.program_code)
				})
		}

		const boardWise: BoardCourseCount[] = Array.from(boardWiseMap.values())
			.sort((a, b) => a.board_code.localeCompare(b.board_code))

		// Calculate summary
		const summary = {
			total_programs: programWise.length,
			total_courses: records.length,
			total_regular: records.reduce((sum, r) => sum + r.regular_count, 0),
			total_arrear: records.reduce((sum, r) => sum + r.arrear_count, 0),
			grand_total: records.reduce((sum, r) => sum + r.total_count, 0)
		}

		const responseData: CourseCountReportData = {
			metadata: {
				institution_id: institution.id,
				institution_name: institution.name,
				institution_code: institution.institution_code,
				examination_session_id: session.id,
				session_name: session.session_name,
				session_code: session.session_code,
				report_generated_at: new Date().toISOString()
			},
			records,
			program_wise: programWise,
			board_wise: boardWise,
			summary
		}

		return NextResponse.json(responseData)
	} catch (error) {
		console.error('Error in course count report API:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
}
